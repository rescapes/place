/**
 * Created by Andy Likuski on 2018.12.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import {featureCollection, point} from '@turf/helpers';
import * as R from 'ramda';
import {
  apolloResponseFilterOrEmpty,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction, mapTaskOrComponentToNamedResponseAndInputs,
  settingsQueryContainer
} from '@rescapes/apollo';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {
  capitalize,
  compact,
  mergeDeepAll,
  pickDeepPaths,
  reqStrPath,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import {regionsQueryContainer} from '../scopeStores/region/regionStore.js';
import {currentUserStateQueryContainer} from '../userStores/userStateStore.js';
import {projectsQueryContainer} from '../scopeStores/project/projectStore.js';
import {isActive} from '../userStores/activityStore';
import {loggers} from '@rescapes/log';

const log = loggers.get('rescapeDefault');

/**
 * @fileoverview
 *
 * This store resolves the state of mapbox for any use case. If a user is provided it will consult the user's
 * states to get the appropriate mapbox state, but it's possible the user hasn't set values for a certain scope if
 * they never visited that scope or reset scope explicitly.
 *
 * The state of Mapbox is determined in increasing priority by:
 * Global. If nothing else is supplied, the global mapbox state is used, which is likely just  a view of the globe :)
 *  Queries:
 *      viewport, style
 *
 * Region that is specified without a user state. Then the region's mapbox state is used, such as a country or city view.
 * If the user goes to this region for the first time or after resetting they won't have a user state for it.
 *  Queries:
 *      geojson (bounds override Global viewport)
 *
 * Project that is specified without a user state. Then the project's mapbox state is used, such as a neighborhood view.
 * If the user goes to this project for the first time or after resetting they won't have a user state for it.
 *  Queries:
 *      locations (geojson and properties, combined geojson overrides Region viewport)
 *
 * User Global. The global user state. If the user has a global user state setting for mapbox this will be used.
 * This would make sense if the user account sets a home city for instance
 *  Queries:
 *      style (overrides global)
 *  Mutations:
 *      style
 *
 * User Region. The region user state. If the user has a region user state setting for mapbox this will be used.
 * This would make sense if the user goes to a region settings page, although the viewport
 * would probably just default to the region's mapbox state. But they might set map styles.
 * The user could also filter locations at the region scope if we show all possible locations for a region the map.
 *  Queries:
 *      style (overrides user global and region)
 *      location selections (overrides region locations)
 *  Mutations:
 *      style
 *
 * User Project. The project user state. If the user has a project user state setting for mapbox this will be used.
 * This would make sense if the user goes to a project settings page, although the viewport
 * would probably just default to the project's mapbox state. But they might set map styles.
 * The user could also filter locations at the project scope
 *  Queries:
 *      viewport (overrides user region and project viewport)
 *      location selections (overrides project locations)
 *  Mutations
 *      viewport
 *      location selections
 */

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'geojson': 'FeatureCollectionDataTypeofRegionTypeRelatedReadInputType'
};


/***
 * Creates output params for settings.data.mapbox
 * @param mapboxOutputParamsFragment
 * @return {{data: *}}
 */
export const settingsMapboxOutputParamsCreator = mapboxOutputParamsFragment => ({
  data: mapboxOutputParamsFragment
});

/**
 * Creates state output params
 * @param {Object} mapboxOutputParamsFragment The mapboxFragment of the params
 * @return {*[]}
 */
export const userStateMapboxOutputParamsCreator = mapboxOutputParamsFragment => {
  return {
    data: {
      // The Global mapbox state for the user
      userGlobal: mapboxOutputParamsFragment,
      // The mapbox state for the user regions
      userRegions: mapboxOutputParamsFragment,
      // The mapbox state for the project regions
      userProjects: mapboxOutputParamsFragment
    }
  };
};

/**
 * Gets project.data.mapbox data
 * @param mapboxOutputParamsFragment
 * @returns {{data: *[]}[]}
 */
export const projectMapboxOutputParamsCreator = mapboxOutputParamsFragment => ({
  data: mapboxOutputParamsFragment
});

/**
 * Gets region.data.mapbox.data
 * @param {Object} mapboxOutputParamsFragment
 * @returns {{data: *{}}}
 */
export const regionMapboxOutputParamsCreator = mapboxOutputParamsFragment => ({
  data: mapboxOutputParamsFragment
});

/**
 * TODO unused
 * Gets [region|project].data.userGlobal, [region|project].data.userRegions, [region|project].data.userProjects
 * @param {Object} mapboxOutputParamsFragment
 * @returns {{data: *{}}}
 */
export const scopeObjMapboxOutputParamsCreator = (scopeName, mapboxOutputParamsFragment) => ({
  [`${scopeName}s`]: {
    data: {
      userGlobal: mapboxOutputParamsFragment,
      userRegions: mapboxOutputParamsFragment,
      userProjects: mapboxOutputParamsFragment
    }
  }
});

/**
 * Given user and scope ids in the arguments (e.g. Region, Project, etc) resolves the mapbox state.
 * The merge precedence is documented above
 *
 * @params {Object} apolloClient The Apollo Client
 * @params {Object} config
 * @params {Object} config.outputParams OutputParams Just the mapbox fragment. This will be used to create
 * mapbox output params at various scope levels
 * @params {Object} propSets Arguments for each query as follows
 * @params {Object} propSets.settings Arguments to limit the settings to the global settings
 * @params {Object} propSets.user Arguments to limit the user to zero or one user. If unspecified no
 * user-specific queries are made, meaning no user state is merged into the result
 * @params {Object} propSets.regionFilter Arguments to limit the region to zero or one region. If unspecified no
 * region queries are made
 * @params {Object} propSets.projectFilter Arguments to limit the project to zero or one project. If unspecified no
 * project queries are made
 * @returns {Task} A Task containing the Regions in an object with obj.data.regions or errors in obj.errors
 */
export const queryScopesMergeScopePropPathValueContainer = v(R.curry((apolloConfig, {
    filterOutputParamsForSettingsQuery,
    filterOutputParamsForRegionsQuery,
    filterOutputParamsForProjectsQuery,
    mergeFunction,
    scopePropPath,
    userScopePropPath,
    outputParams,
  }, props) => {
    return composeWithComponentMaybeOrTaskChain([
        ({
           userStateMergedScopeValueResponse,
           settingsScopeValueResponse,
           regionMergedScopeValueResponse,
           projectMergedScopeValueResponse,
           ...props
         }) => {
          if (!R.prop('data', projectMergedScopeValueResponse)) {
            // If loading the previous response, return it
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction(props),
                response: projectMergedScopeValueResponse
              }
            );
          }
          // Merge the prop path value results of the various scopes
          const mergedValue = mergeFunction(compact([
            strPathOr({}, 'data.userStateMergedScopePropPathValue', userStateMergedScopeValueResponse),
            strPathOr({}, 'data.mergedScopePropPathValue', settingsScopeValueResponse),
            strPathOr({}, 'data.mergedScopePropPathValue', regionMergedScopeValueResponse),
            strPathOr({}, 'data.mergedScopePropPathValue', projectMergedScopeValueResponse)
          ]));

          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              // Use our previous response and override it's data with the final merged value
              response: R.over(
                R.lensProp('data'),
                data => mergedValue,
                projectMergedScopeValueResponse
              )
            }
          );
        },

        // When regionMergedScopeValueResponse is done,
        // Query for project objects, merging the scope object prop path value of each that is found
        // with the merge function. E.g. if we want project.data.mapbox and we find 3 projects, merge
        // the data.mapbox property of the 3 with mergeFunction
        // If there are not active projects, this just returns regionMergedScopeValueResponse
        mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'projectMergedScopeValueResponse',
          ({userStateMergedScopeValueResponse, regionMergedScopeValueResponse: previousResponse}) => {
            return activeScopeQueryResolveDataPropPathValueContainer(apolloConfig,
              {
                userStateMergedScopeValueResponse,
                previousResponse,
                scopeQueryContainer: projectsQueryContainer,
                outputParams: filterOutputParamsForRegionsQuery(outputParams),
                scopePropPath,
                scopeReturnPath: 'projects',
                mergeFunction
              },
              props);
          }
        ),
        // Query for region objects, merging the scope object prop path value of each that is found
        // with the merge function. E.g. if we want region.data.mapbox and we find 3 regions, merge
        // the data.mapbox property of the 3 with mergeFunction
        // Warn if there are no active regions, and return userStateMergedScopeValueResponse
        mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'regionMergedScopeValueResponse',
          ({userStateMergedScopeValueResponse, settingsScopeValueResponse: previousResponse}) => {
            return activeScopeQueryResolveDataPropPathValueContainer(apolloConfig,
              {
                warnIfNoneActive: true,
                userStateMergedScopeValueResponse,
                previousResponse,
                scopeQueryContainer: settingsQueryContainer,
                outputParams: settingsMapboxOutputParamsCreator(outputParams),
                scopePropPath,
                scopeReturnPath: 'settings',
                mergeFunction
              },
              props);
          }
        ),

        // Query for the settings object to get its version of the prop path value
        // E.g. if we want settings.data.mapbox, this returns the settings response
        // with the data overridden to {mergedScopePropPathValue}, which is simply the value at 'settings.data.mapbox'
        mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'settingsScopeValueResponse',
          ({userStateMergedScopeValueResponse, settingsResponse: previousResponse}) => {
            return scopeQueryResolveDataPropPathValueContainer(apolloConfig,
              {
                userStateMergedScopeValueResponse,
                previousResponse,
                scopeQueryContainer: settingsQueryContainer,
                outputParams: filterOutputParamsForSettingsQuery(outputParams),
                scopePropPath,
                scopeReturnPath: 'settings',
                mergeFunction
              },
              props);
          }
        ),

        // Start by merging the value at the scope propPaths in the UserState
        // The UserState values are prioritized ascending global, regions, [projects, [locations]]
        mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateMergedScopeValueResponse',
          props => {
            return queryCurrentUserStateMergeScopePropPathValueContainer(
              apolloConfig,
              {
                outputParams,
                userScopePropPath,
                mergeFunction
              },
              props
            );
          }
        )
    ])(props);
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['options', PropTypes.shape({
      filterOutputParamsForSettingsQuery: PropTypes.shape(),
      filterOutputParamsForRegionsQuery: PropTypes.shape(),
      filterOutputParamsForProjectsQuery: PropTypes.shape(),
      mergeFunction: PropTypes.func,
      scopePropPath: PropTypes.string.isRequired,
      userScopePropPath: PropTypes.string.isRequired,
      outputParams: PropTypes.shape().isRequired
    }).isRequired],
    ['props', PropTypes.shape({
      user: PropTypes.shape().isRequired,
    }).isRequired]
  ], 'queryScopesMergeScopePropPathValueContainer');

/**
 * Merges all the given UserState scope mapbox values. These always come in ascending order of priority:
 * global, regions, projects, locations. Thus mapbox data at userState.data.global.mapbox is least important
 * for merging and that at userState.data.userLocations[x].mapbox is most important
 * @param [{Object}] mapboxes Mapbox objects with properties like 'viewport'
 * @returns {Object} The merged mabox object
 */
export const mergeMapboxes = mapboxes => {
  const viewports = R.map(
    mapbox => reqStrPathThrowing('viewport', mapbox),
    mapboxes
  );
  return mergeDeepAll(
    R.concat(
      R.map(R.omit(['viewport']), mapboxes),
      // Set viewport to the consolidated viewport if there is one and it has any values.
      [
        R.ifElse(
          R.compose(
            R.length,
            compact,
            R.values,
            R.pick(['extent', 'longitude', 'latitude', 'zoom']),
            R.defaultTo({})
          ),
          viewport => ({viewport}),
          () => ({})
        )(_consolidateViewports(viewports))
      ]
    )
  );
};

/**
 * Creates one viewport from one or more.
 * @param viewports
 * @returns {*}
 * @private
 */
const _consolidateViewports = viewports => {
  return R.ifElse(
    R.compose(R.lt(1), R.length()),
    // Multiple viewports from mulitple same-level scope instances. Create a new viewport that contains them.
    viewports => {
      // Since we can't guess a zoom, instead store the extents
      // Create the bounds with the first two viewports, then add more. I don't know if there's a better
      // method that takes any number of bounds to create a new viewport
      return {
        extent: bboxPolygon.default(
          bbox.default(
            featureCollection(
              R.map(({longitude, latitude}) => {
                return point([longitude, latitude]);
              }, viewports)
            )
          )
        )
      };
    },
    // Just one or none, leave it as is
    viewports => R.when(Array.isArray, R.head)(viewports)
  )(viewports);
};

/**
 * Requests the userState scope propertyPath and combines data.userGlobal, data.userRegions[1 matching instance],
 * and otpionally data.userProjects[1 matching instance] and optionally data.userLocations[1 matching instance]
 * into a single mapbox value. Priority goes from least to most, with global lowest and location highest,
 * but merging occurs according to mergeFunction, default rescape-ramda.mergeDeepAll
 * @param apolloConfig
 * @param {Object} options
 * @param {Object} options.userScopePropPath Required! the path to search for in each userState scope object
 * @param {Object} [options.mergeFunction] Default rescape-ramda.mergeDeepAll. Override to specify how to merge
 * @param {Object} outputParams
 * @param {String} userScopeDataPropPath The path to what we are looking for in each userScope.data scope item.
 * For instance, if this is 'mapbox', we will look for the mapbox value in
 * userScope.data.userGlobal.mapbox (TODO userGlobal is not currently used)
 * userScope.data.userRegions[with id prop.regionId or failing that with activity:{active:true}].mapbox
 * // and if project is in scope
 * userScope.data.userProjects[with id prop.projectId or failing that with activity:{active:true}].mapbox
 * // and if location is in scope
 * userScope.data.userLocations[with id prop.locationId or failing that with activity:{active:true}].mapbox
 *
 * @param {Object} props None required except render for component queries
 * @param {Funciton} props.render Required for component queries
 * @returns {Task|Object} The userState response with data overridden as
 * (data: {userStateMergedScopePropPathValue, userStateResponse data})
 * where userStateMergedScopePropPathValue is the merged value we seek, and
 * userState is the original userStateResponse data
 * If a component an not ready then the loading userStateResponse is returned
 */
const queryCurrentUserStateMergeScopePropPathValueContainer = (apolloConfig, {
  outputParams,
  userScopePropPath
}, props) => {
  return composeWithComponentMaybeOrTaskChain([
    userStateResponse => {
      const userState = strPathOr(null, 'data.userStates.0', userStateResponse);
      if (!userState) {
        // Loading
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: userStateResponse
          }
        );
      }

      const regionMapboxes = R.map(
        region => reqStrPathThrowing(`data.${userScopePropPath}`, region),
        strPathOr([], 'data.regions', userState)
      );

      const projectMapboxes = R.map(
        project => reqStrPathThrowing(`data.${userScopePropPath}`, project),
        strPathOr([], 'data.projects', userState)
      );

      const userStateMergedScopePropPathValue = mergeMapboxes([
        // TODO we aren't currently using a userGlobal scope, but I'll leave it here in case we do at some point
        ...[compact([strPathOr(null, `data.userGlobal.${userScopePropPath}`, userState)])],
        ...regionMapboxes,
        ...projectMapboxes
      ]);
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          // Override the data with the consolidated userStateMergedScopePropPathValue
          // Also include the full userStateResponse, which can be used to query
          // for scope objects that are active
          response: R.over(
            R.lensProp('data'),
            data => ({userStateMergedScopePropPathValue, userState: data}),
            userStateResponse
          )
        }
      );
    },
    // Query for the user state by id
    props => {
      return currentUserStateQueryContainer(
        R.merge(apolloConfig, {
          options: {
            variables: props => {
              // Search by whatever props are passed into locationFilter
              return R.prop('user', props);
            },
            errorPolicy: 'all',
            partialRefetch: true
          }
        }),
        {outputParams: userStateMapboxOutputParamsCreator(outputParams)},
        props
      );
    }
  ])(props);
};

/**
 * Resolves a value a the given scope prop path for all of the matching regions
 * @param apolloConfig
 * @param {Object} options
 * @param {Function} options.scopeQuery Required Function to query for the
 * objects we're querying for, e.g. settingsQueryContainer,
 * regionsQueryContainer, projectsQueryContainer, locationsQueryContainer
 * @param {Object} options.outputParams Required. region outputParams. Make sure the scopePropPath is included
 * @param {String} options.scopePropPath. Required Dot-separated path to the scope object, such as 'mapbox' for region.data.mapbox
 @param {Function|String} options.scopePropsFilter Required. Props to filter the scope objects query.
 * If a function, accepts props and returns the filtered props. If a string, calls reqStrPath(scopePropsFilter, props).
 * The former is useful if the props have values we need like props => R.pick([regionId], props).
 * The latter case is useful if the filter is something like nameContains: 'foo'
 * @param {Object} options.scopeReturnPath Required. Used to get the response values so that we can merge them.
 * E.g. 'regions' for reqionsQueryContainer to get the regions returned at data.regions
 * @param {Function} [options.mergeFunction] Default R.mergeAll Merge function to merge values if multiple regions are returned. It's probably
 * best to assume no priority in this case, meaning the scope object values passed in can be in any order.
 * Useful for something like mapbox, where we might have 3 regions and want a custom merge function to resolve
 * the bounding box of all 3 regions, rather than prioritizing one
 * @param {Object} props

 * @returns {Object} The merged scope prop path value at mergedScopePropPathValue
 * Also matchingQueryScopeObjects to show which scope objects matched the query (including those
 * with null values at data.[scopePropPath]. So if we got 2 regions and one had a value at data.mapbox
 * and one didn't. We still return both here.
 */
const scopeQueryResolveDataPropPathValueContainer = (apolloConfig, {
  scopeQueryContainer,
  scopePropsFilter,
  outputParams,
  scopePropPath,
  scopeReturnPath,
  mergeFunction
}, props) => {
  return composeWithComponentMaybeOrTaskChain([
    queryResponse => {
      if (!strPathOr(null, 'data', queryResponse)) {
        // Loading
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: queryResponse
          }
        );
      }
      // Get all the scope prop path values for the found regions. Compact out nulls
      const scopePropPathValues = compact(R.map(
        // Get the scope values at the prop path of the scope object, e.g. data.mergedScopePropPathValue for each region
        queryResponse => strPathOr(null, `data.${scopePropPath}`, queryResponse),
        // Get the scope objects, e.g. data.regions
        reqStrPathThrowing(`data.${scopeReturnPath}`, queryResponse)
      ));
      // Merge the scopePropPath values using the merge function (defaults to R.mergeAll)
      const mergedScopePropPathValue = mergeFunction(scopePropPathValues);
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          // Override the data with the consolidated mergedScopePropPathValue
          // Put the original results at matchingQueryScopeObjects in case we want to see what scope objects
          // match the query (for debugging)
          response: R.over(
            R.lensProp('data'),
            data => {
              return {mergedScopePropPathValue, matchingQueryScopeObjects: data};
            },
            queryResponse
          )
        }
      );
    },
    props => {
      return scopeQueryContainer(
        R.merge(apolloConfig, {
          options: {
            variables: props => {
              return scopePropsFilter(props);
            },
            errorPolicy: 'all',
            partialRefetch: true
          }
        }),
        {
          // TODO I don't think any of the scopeQueryContainer we call need to have the named passed
          name: scopeReturnPath,
          readInputTypeMapper, outputParams
        },
        props
      );
    }
  ])(props);
};

/**
 * Wrapper around scopeQueryResolveDataPropPathValueContainer that queries according to the active scope
 * objects in the userState
 * @param apolloConfig
 * @param {Object} options
 * @param options.userStateMergedScopeValueResponse
 * @param {Object} options.previousResponse  Required the response from the previous scope query
 * (e.g. the regions response when querying projects). Set to userStateMergedScopeValueResponse for regions
 * @param {Boolean } options.warnIfNoneActive Warn if no active scope instance are found
 * @param {Function} options.scopeQueryContainer
 * @param {String} options.scopeName
 * @param {Object} options.outputParams
 * @param {String} options.scopePropPath
 * @param {String} options.scopeReturnPath
 * @param {Function} options.mergeFunction
 * @param {Object} props
 * @returns {*}
 */
const activeScopeQueryResolveDataPropPathValueContainer = (
  apolloConfig,
  {
    userStateMergedScopeValueResponse,
    previousResponse,
    warnIfNoneActive,
    scopeQueryContainer,
    scopeName,
    outputParams,
    scopePropPath,
    scopeReturnPath,
    mergeFunction
  },
  props) => {
  if (!R.prop('data', previousResponse)) {
    // return the previous response if loading
    return previousResponse;
  }

  // Extract the full queried userState userStateMergedScopeValueResponse so we can get active regions
  const userStates = reqStrPathThrowing('userState', userStateMergedScopeValueResponse);
  const activeScopeObjects = apolloResponseFilterOrEmpty(
    `0.data.user${capitalize(scopeName)}`,
    userScopeObject => isActive(userScopeObject),
    userStates
  );
  // Return the previous response if we have no active scope objects
  if (!R.length(activeScopeObjects)) {
    if (warnIfNoneActive) {
      log.warn(`No active ${scopeName} found in the userState. Cannot query for ${scopePropPath}`);
    }
    return previousResponse;
  }
  return scopeQueryResolveDataPropPathValueContainer(
    apolloConfig,
    {
      scopeQueryContainer,
      scopePropsFilter: props => {
        // Filter by the matching ids of the active scope objects
        return {
          idIn: R.map(R.pick(['id']), activeScopeObjects)
        };
      },
      outputParams,
      scopePropPath,
      scopeReturnPath,
      mergeFunction
    },
    props
  );
};

/**
 * Query for the settings and return the mapbox value if defined
 * @param apolloConfig
 * @param outputParams
 * @param props
 * @returns {Task|Object} Task or Component in the form {data.mapbox: mapbox} if loaded. If not loaded then
 * the settings query response is returned
 * @private
 */
const _makeSettingsQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
  return composeWithComponentMaybeOrTaskChain([
    settingsResponse => {
      if (!strPathOr(null, 'data', settingsResponse)) {
        // Loading
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: settingsResponse
          }
        );
      }
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          // Override the data with the consolidated mapbox
          response: R.over(
            R.lensProp('data'),
            // Only can be one settings result as of now
            data => ({mapbox: strPathOr(null, 'data.settings.0.data.mapbox', settingsResponse)}),
            R.merge(settingsResponse, {props})
          )
        }
      );
    },
    props => settingsQueryContainer(
      R.merge(apolloConfig, {
        options: {
          variables: props => {
            // Search by whatever props are passed into locationFilter
            return R.prop('settings', props);
          },
          errorPolicy: 'all',
          partialRefetch: true
        }
      }),
      {
        outputParams: R.merge(
          // Merge the settings identifier param with the mapbox params
          {key: 1, id: 1},
          settingsMapboxOutputParamsCreator(outputParams)
        )
      },
      props
    )
  ])(props);
};

