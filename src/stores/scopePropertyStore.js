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

import {singularize} from 'inflected';
import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import {featureCollection, point} from '@turf/helpers';
import * as R from 'ramda';
import {
  apolloResponseFilterOrEmpty,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction,
  mapTaskOrComponentToNamedResponseAndInputs,
  settingsQueryContainer
} from '@rescapes/apollo';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {
  capitalize,
  compact,
  composeWithMap,
  mergeDeepAll,
  reqPathThrowing,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import {regionsQueryContainer} from './scopeStores/region/regionStore.js';
import {
  currentUserStateQueryContainer,
  userStateScopePropPathOutputParamsCreator
} from './userStores/userStateStore.js';
import {projectsQueryContainer} from './scopeStores/project/projectStore.js';
import {isActive} from './userStores/activityStore';
import {loggers} from '@rescapes/log';

const log = loggers.get('rescapeDefault');

/**
 * Given a scopePropPath that represents a data path at settings.data, region.data, project.data,
 * as well as userState.data.global, userState.data.userRegions[*], userState.data.userProjects[*],
 * resolves the value at the scopePropPath and uses the given mergeFunction to merge the results
 * into a single object
 *
 * @params {Object} apolloClient The Apollo Client
 * @params {Object} config
 * @params {Object} config.outputParamsFragment OutputParams Just the output params fragment. Of the prop path value we seek
 * in the user scope object and in the scope objects. Example, for prop path 'mapbox':
 * {
 * mapbox: {
    viewport: {
      latitude: 1,
      longitude: 1,
      zoom: 1
    }
  }
  This will get passed as {data: {mapbox...}} to each scope query
 * @params {Object} options
 * @params {Object} outputParamsFragment The fragment outputParams from the scope prop path value. For instance,
 * for 'mapbox' this would be
 *  mapbox: {
    viewport: {
      latitude: 1,
      longitude: 1,
      zoom: 1
    }
  }
 * @params {Function} [options.mergeFunction] Defaults to rescape-ramda.mergeDeepAll Merges the scope prop path values
 * together
 * @params {String} options.scopePropPath Required The prop path in scope objects to the desired value.
 * E.g. 'mapbox' to get settings.data.mapbox, region.data.mapbox, project.data.mapbox, etc
 * @params {String} options.userScopePropPath Required The prop path in user scope objects to the desired value.
 * E.g. 'mapbox' to get userState.data.userRegions[*].mapbox and  userState.data.userProjects[*].mapbox
 * @params {Object} propSets Arguments for each query as follows
 * @params {Object} propSets.settings Arguments to limit the settings to the global settings
 * @params {Object} propSets.user Arguments to limit the user to zero or one user. If unspecified no
 * user-specific queries are made, meaning no user state is merged into the result
 * @params {Object} propSets.regionFilter Arguments to limit the region to zero or one region. If unspecified no
 * region queries are made
 * @returns {Task|Object} Task or component resolving to a response that is loading (for components) or if
 * complete having {data: ...scopePropPath: the merge value}, where scopePropPath is expanded so 'mapbox.viewport'
 * would be data: {mapbox: {viewport: {the merged value}}}
 */
export const queryScopesMergeScopePropPathValueContainer = v(R.curry((apolloConfig, {
    mergeFunction,
    scopePropPath,
    userScopePropPath,
    outputParamsFragment
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
          strPathOr({}, 'data.mergedScopePropPathValue', settingsScopeValueResponse),
          strPathOr({}, 'data.mergedScopePropPathValue', regionMergedScopeValueResponse),
          strPathOr({}, 'data.mergedScopePropPathValue', projectMergedScopeValueResponse),
          strPathOr({}, 'data.userStateMergedScopePropPathValue', userStateMergedScopeValueResponse)
        ]));

        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            // Use our previous response and override it's data with the final merged value
            response: R.over(
              R.lensPath(['data', ...R.split('.', scopePropPath)]),
              () => mergedValue,
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
              outputParams: {data: outputParamsFragment},
              scopePropPath,
              scopeName: 'projects',
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
              scopeQueryContainer: regionsQueryContainer,
              outputParams: {data: outputParamsFragment},
              scopePropPath,
              scopeName: 'regions',
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
              warnIfNoneActive: true,
              userStateMergedScopeValueResponse,
              previousResponse,
              scopePropsFilter: props => {
                return R.pick(['key'], reqStrPathThrowing('settings', props));
              },
              scopeQueryContainer: settingsQueryContainer,
              outputParams: {data: outputParamsFragment},
              scopePropPath,
              scopeName: 'settings',
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
              outputParamsFragment,
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
    ['apolloConfig', PropTypes.shape({
      apolloClient: PropTypes.shape()
    }).isRequired],
    ['options', PropTypes.shape({
      mergeFunction: PropTypes.func,
      scopePropPath: PropTypes.string.isRequired,
      userScopePropPath: PropTypes.string.isRequired,
      outputParamsFragment: PropTypes.shape().isRequired
    }).isRequired],
    ['props', PropTypes.shape({
      user: PropTypes.shape().isRequired
    }).isRequired]
  ], 'queryScopesMergeScopePropPathValueContainer');

/**
 * Merges all the given UserState scope mapbox values. These always come in ascending order of priority:
 * global, regions, projects, locations. Thus mapbox data at userState.data.global.mapbox is least important
 * for merging and that at userState.data.userLocations[x].mapbox is most important
 * @param {[Object]} mapboxes Mapbox objects with properties like 'viewport'
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
              compact(R.map(({longitude, latitude}) => {
                return longitude && latitude ? point([longitude, latitude]) : null;
              }, viewports))
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
 * @param {Function} [options.mergeFunction] Default rescape-ramda.mergeDeepAll. Override to specify how to merge
 * @param {Object} outputParamsFragment The outputParamsFragment fragment of the value at hte scope prop path for each scope object
 * @param {Function } userStateScopePropPathOutputParamsCreator Receives outputParamsFragment and formats for the
 * userState
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
  outputParamsFragment,
  userScopePropPath,
  mergeFunction
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

      const useRegionScopeValues = R.map(
        region => reqStrPathThrowing(userScopePropPath, region),
        strPathOr([], 'data.userRegions', userState)
      );

      const userProjectScopeValues = R.map(
        project => reqStrPathThrowing(userScopePropPath, project),
        strPathOr([], 'data.userProjects', userState)
      );

      const userStateMergedScopePropPathValue = mergeFunction([
        ...compact([strPathOr(null, `data.userGlobal.${userScopePropPath}`, userState)]),
        ...useRegionScopeValues,
        ...userProjectScopeValues
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
            data => ({userStateMergedScopePropPathValue, userState: reqStrPathThrowing('userStates.0', data)}),
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
              return {};
            },
            errorPolicy: 'all',
            partialRefetch: true
          }
        }),
        {outputParams: userStateScopePropPathOutputParamsCreator(outputParamsFragment)},
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
 * @param {Object} options.scopeName. Required. 'regions' or 'projects' or 'settings'
 * @param {Object} [options.scopeReturnPath] Defaults to options.scopeName. Used to get the response values so that we can merge them.
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
const scopeQueryResolveDataPropPathValueContainer = v((apolloConfig, {
  scopeQueryContainer,
  scopePropsFilter,
  outputParams,
  scopePropPath,
  scopeName,
  scopeReturnPath = null,
  mergeFunction
}, props) => {
  scopeReturnPath = scopeReturnPath || scopeName;
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
      // Get all the scope prop path values for the found scope objects. Compact out nulls
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
          outputParams
        },
        props
      );
    }
  ])(props);
}, [
  ['apolloConfig', PropTypes.shape({})],
  ['options', PropTypes.shape({
    scopeQueryContainer: PropTypes.func.isRequired,
    scopePropsFilter: PropTypes.func.isRequired,
    outputParams: PropTypes.shape().isRequired,
    scopeName: PropTypes.string.isRequired,
    scopeReturnPath: PropTypes.string,
    scopePropPath: PropTypes.string.isRequired,
    mergeFunction: PropTypes.func
  }).isRequired],
  ['props', PropTypes.shape()]
], 'scopeQueryResolveDataPropPathValueContainer');

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
const activeScopeQueryResolveDataPropPathValueContainer = v((
  apolloConfig,
  {
    userStateMergedScopeValueResponse,
    previousResponse,
    warnIfNoneActive = false,
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
  const activeScopeIds = composeWithMap([
    userScopeObject => reqPathThrowing([singularize(scopeName), 'id'], userScopeObject),
    response => {
      return apolloResponseFilterOrEmpty(
        `userState.data.user${capitalize(scopeName)}`,
        userScopeObject => isActive(userScopeObject),
        response
      );
    }
  ])(userStateMergedScopeValueResponse);
  // Return the previous response if we have no active scope objects
  if (!R.length(activeScopeIds)) {
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
          idIn: activeScopeIds
        };
      },
      outputParams,
      scopePropPath,
      scopeName,
      scopeReturnPath,
      mergeFunction
    },
    props
  );
}, [
  ['apolloConfig', PropTypes.shape({})],
  ['options', PropTypes.shape({
    userStateMergedScopeValueResponse: PropTypes.shape().isRequired,
    previousResponse: PropTypes.object.isRequired,
    warnIfNoneActive: PropTypes.bool,
    scopeQueryContainer: PropTypes.func.isRequired,
    outputParams: PropTypes.shape().isRequired,
    scopePropPath: PropTypes.string.isRequired,
    scopeName: PropTypes.string.isRequired,
    scopeReturnPath: PropTypes.string,
    mergeFunction: PropTypes.func
  }).isRequired],
  ['props', PropTypes.shape()]
], 'activeScopeQueryResolveDataPropPathValueContainer');
