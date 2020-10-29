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
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction,
  makeMutationRequestContainer,
  makeSettingsQueryContainer
} from 'rescape-apollo';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {compact, mergeDeepAll, pickDeepPaths, reqStrPath, reqStrPathThrowing, strPathOr} from 'rescape-ramda';
import {makeRegionsQueryContainer} from '../scopeStores/region/regionStore';
import {currentUserStateQueryContainer} from '../userStores/userStateStore';
import {makeProjectsQueryContainer} from '../scopeStores/project/projectStore';


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
export const settingdMapboxOutputParamsCreator = mapboxOutputParamsFragment => ({
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
 * @params {Object} outputParams OutputParams Just the mapbox fragment. This will be used to create
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
export const makeMapboxQueryContainer = v(R.curry((apolloConfig, outputParams, props) => {
    return composeWithComponentMaybeOrTaskChain([
      settingsResponse => {
        if (!R.prop('data', settingsResponse)) {
          // return the previous response if loading. The requests are independent but we don't have a compose
          // call for parallel requests yet
          // Loading
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: settingsResponse
            }
          );
        }
        // Merge the mapbox results. This takes the most last defined viewport to give use the viewport
        // for the most specific scope
        // TODO if we need to deep merge anything in the mapboxes we need to add it here
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            // Override the data with the consolidated mapbox
            response: R.over(
              R.lensProp('data'),
              () => ({
                mapbox: R.mergeAll(
                  R.map(
                    path => strPathOr(null, path, settingsResponse),
                    ['data.mapbox', 'props.regionsMapbox', 'props.projectsMapbox', 'props.userStateMapbox']
                  )
                )
              }),
              settingsResponse
            )
          }
        );
      },
      regionsResponse => {
        if (!R.prop('settings') || !R.prop('data', regionsResponse)) {
          // return the previous response if loading or no settings
          // The requests are independent but we don't have a compose call for parallel requests yet
          return regionsResponse;
        }
        return _makeSettingsQueryResolveMapboxContainer(
          apolloConfig,
          outputParams,
          // Pass the last mapbox results with the props to accumulate mapboxes
          R.merge(
            reqStrPathThrowing('props', regionsResponse),
            {regionsMapbox: strPathOr(null, 'data.mapbox', regionsResponse)}
          )
        );
      },
      projectsResponse => {
        if (!R.prop('regionFilter', props) || !R.prop('data', projectsResponse)) {
          // return the previous response if loading or no regionFilter.
          // The requests are independent but we don't have a compose call for parallel requests yet
          return projectsResponse;
        }
        return _makeRegionsQueryResolveMapboxContainer(
          apolloConfig,
          outputParams,
          // Pass the last mapbox results with the props to accumulate mapboxes
          R.merge(
            reqStrPathThrowing('props', projectsResponse),
            {projectsMapbox: strPathOr(null, 'data.mapbox', projectsResponse)}
          )
        );
      },
      userStateMapboxResponse => {
        if (!R.prop('projectFilter', props) || !R.prop('data', userStateMapboxResponse)) {
          // return the previous response if loading or no projectFilter.
          // The requests are independent but we don't have a compose call for parallel requests yet
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: userStateMapboxResponse
            }
          );
        }
        return _makeProjectsQueryResolveMapboxContainer(
          apolloConfig,
          outputParams,
          // Pass the last mapbox results with the props to accumulate mapboxes
          R.merge(
            props,
            {userStateMapbox: strPathOr(null, 'data.userStates.mapbox', userStateMapboxResponse)}
          )
        );
      },
      props => {
        return _makeCurrentUserStateQueryResolveMapboxContainer(
          apolloConfig,
          outputParams,
          props
        );
      }
    ])(props);
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParams', PropTypes.shape().isRequired],
    ['propSets', PropTypes.shape({
      user: PropTypes.shape().isRequired,
      regionFilter: PropTypes.shape().isRequired,
      projectFilter: PropTypes.shape().isRequired
    }).isRequired]
  ], 'makeMapboxQueryContainer');

const consolidateMapboxes = mapboxes => {
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
        extent: bboxPolygon(
          bbox(
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
 * Requests the userState and combines it the mapbox values in data.userGlobal, data.userRegions, and data.userProject
 * into a single mapbox value
 * @param apolloConfig
 * @param outputParams
 * @param props
 * @returns {Task|Object} The userstate response with data overridden as {data: mapbox} object as a task or component.
 * If a component an not ready then the loading userStateResponse is returned
 * @private
 */
const _makeCurrentUserStateQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
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
        region => reqStrPathThrowing('data.mapbox', region),
        strPathOr([], 'data.regions', userState)
      );

      const projectMapboxes = R.map(
        project => reqStrPathThrowing('data.mapbox', project),
        strPathOr([], 'data.projects', userState)
      );

      const mapbox = R.mergeAll([
        consolidateMapboxes(compact([strPathOr(null, 'data.userGlobal.mapbox', userState)])),
        consolidateMapboxes(regionMapboxes),
        consolidateMapboxes(projectMapboxes)
      ]);
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          // Override the data with the consolidated mapbox
          response: R.over(
            R.lensProp('data'),
            data => ({mapbox}),
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
            errorPolicy: 'all', partialRefetch: true
          }
        }),
        {outputParams: userStateMapboxOutputParamsCreator(outputParams)},
        props
      );
    }
  ])(props);
};

const _makeProjectsQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
  return composeWithComponentMaybeOrTaskChain([
    projectsResponse => {
      if (!strPathOr(null, 'data', projectsResponse)) {
        // Loading
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: projectsResponse
          }
        );
      }
      const mapboxes = R.map(
        region => strPathOr(null, 'data.mapbox', region),
        reqStrPathThrowing('data.projects', projectsResponse)
      );
      const mapbox = consolidateMapboxes(mapboxes);
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          // Override the data with the consolidated mapbox
          response: R.over(
            R.lensProp('data'),
            data => ({mapbox}),
            R.merge(projectsResponse, {props})
          )
        }
      );
    },
    props => makeProjectsQueryContainer(
      {
        apolloConfig: R.merge(apolloConfig, {
          options: {
            variables: props => {
              // Search by whatever props are passed into locationFilter
              return R.prop('projectFilter', props);
            },
            errorPolicy: 'all', partialRefetch: true
          }
        })
      },
      {
        name: 'projects',
        readInputTypeMapper,
        outputParams: projectMapboxOutputParamsCreator(outputParams)
      },
      props
    )
  ])(props);
};

const _makeRegionsQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
  return composeWithComponentMaybeOrTaskChain([
    regionsResponse => {
      if (!strPathOr(null, 'data', regionsResponse)) {
        // Loading
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: regionsResponse
          }
        );
      }
      const mapboxes = R.map(
        region => strPathOr(null, 'data.mapbox', region),
        reqStrPathThrowing('data.regions', regionsResponse)
      );
      const mapbox = consolidateMapboxes(mapboxes);
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          // Override the data with the consolidated mapbox
          response: R.over(
            R.lensProp('data'),
            data => ({mapbox}),
            R.merge(regionsResponse, {props})
          )
        }
      );
    },
    props => {
      return makeRegionsQueryContainer(
        {
          apolloConfig: R.merge(apolloConfig, {
            options: {
              variables: props => {
                return R.prop('regionFilter', props);
              },
              errorPolicy: 'all', partialRefetch: true
            }
          })
        },
        {name: 'regions', readInputTypeMapper, outputParams: regionMapboxOutputParamsCreator(outputParams)},
        props
      );
    }
  ])(props);
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
    props => makeSettingsQueryContainer(
      R.merge(apolloConfig, {
        options: {
          variables: props => {
            // Search by whatever props are passed into locationFilter
            return R.prop('settings', props);
          },
          errorPolicy: 'all', partialRefetch: true
        }
      }),
      {
        outputParams: R.merge(
          // Merge the settings identifier param with the mapbox params
          {key: 1, id: 1},
          settingdMapboxOutputParamsCreator(outputParams)
        )
      },
      props
    )
  ])(props);
};

/**
 * Makes a Region mutation
 * @param {Object} apolloClient An authorized Apollo Client
 * @param [String|Object] outputParams output parameters for the query in this style json format:
 *  ['id',
 *   {
 *        data: [
 *         'foo',
 *         {
 *            properties: [
 *             'type',
 *            ]
 *         },
 *         'bar',
 *       ]
 *    }
 *  ]
 *  @param {Object} inputParams Object matching the shape of a region. E.g.
 *  {id: 1, city: "Stavanger", data: {foo: 2}}
 *  Creates need all required fields and updates need at minimum the id
 *  @param {Task} An apollo mutation task
 */
export const makeRegionMutationTask = R.curry((apolloConfig, outputParams, inputParams) => makeMutationRequestContainer(
  apolloConfig,
  {name: 'region'},
  outputParams,
  inputParams
));
