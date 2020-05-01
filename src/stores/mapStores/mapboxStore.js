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

import * as R from 'ramda';
import {makeMutationRequestContainer, makeSettingsQueryContainer} from 'rescape-apollo';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {of, waitAll} from 'folktale/concurrency/task';
import {
  composeWithChain,
  reqStrPath,
  reqStrPathThrowing,
  resultsToResultObj,
  resultToTaskNeedingResult,
  strPathOr
} from 'rescape-ramda';
import {makeRegionsQueryContainer} from '../scopeStores/region/regionStore';
import {makeCurrentUserStateQueryContainer} from '../userStores/userStateStore';
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
  }
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
 * @params {Object} propSets.region Arguments to limit the region to zero or one region. If unspecified no
 * region queries are made
 * @params {Object} propSets.project Arguments to limit the project to zero or one project. If unspecified no
 * project queries are made
 * @returns {Task} A Task containing the Regions in an object with obj.data.regions or errors in obj.errors
 */
export const makeMapboxesQueryResultTask = v(R.curry((apolloConfig, outputParams, propSets) => {
    return composeWithChain([
      // Merge, giving priority to the most specific mapbox state
      // TODO This might need to be more sophisticated
      all => of(R.mergeAll(all)),
      // Each Result.Ok is mapped to a Task. Result.Errors are mapped to a Task.of
      // [Result] -> [Task Object]
      ({propSets}) => R.map(
        // Eliminate any Result.Error
        values => R.prop('Ok', resultsToResultObj(values)),
        // Seek each mapbox state. This is from lowest to highest priority
        // PropSets that are missing will be discarded as a Result.Error
        waitAll([
          // Get the global Mapbox state from the settings object
          resultToTaskNeedingResult(
            settingsProps => {
              return _makeSettingsQueryResolveMapboxContainer(apolloConfig, outputParams, settingsProps);
            },
            // Object -> Result Ok|Error
            reqStrPath('settings', propSets)
          ),
          // Get the mapbox settings for the given region
          resultToTaskNeedingResult(
            regionAsId => {
              return _makeRegionsQueryResolveMapboxContainer(apolloConfig, outputParams, regionAsId);
            },
            // Object -> Result Ok|Error
            reqStrPath('region', propSets)
          ),
          // Get the mapbox settings for the given project
          resultToTaskNeedingResult(
            projectAsId => {
              return _makeProjectsQueryResolveMapboxContainer(apolloConfig, outputParams, projectAsId);
            },
            // Object -> Result Ok|Error
            reqStrPath('project', propSets)
          ),
          // The UserState's various mapbox values
          resultToTaskNeedingResult(
            userAsId => {
              return _makeCurrentUserStateQueryResolveMapboxContainer(apolloConfig, outputParams, userAsId);
            },
            // user arg is required. This gives a Result.Error if it doesn't exist
            // Object -> Result Ok|Error
            reqStrPath('user', propSets)
          )
        ])
      )
    ])({propSets});
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParams', PropTypes.shape().isRequired],
    ['propSets', PropTypes.shape({
      user: PropTypes.shape().isRequired,
      region: PropTypes.shape().isRequired,
      project: PropTypes.shape().isRequired
    }).isRequired]
  ], 'makeMapboxesQueryResultTask');

const _makeCurrentUserStateQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
  return R.map(
    value => {
      const userStateData = reqStrPathThrowing('data.userStates.0.data', value);
      return R.mergeAll([
        strPathOr({}, 'userGlobal.mapbox', userStateData),
        strPathOr({}, 'userRegions.0.mapbox', userStateData),
        strPathOr({}, 'userProjects.0.mapbox', userStateData)
      ]);
    },
    // Query for the user state by id
    makeCurrentUserStateQueryContainer(
      apolloConfig,
      {outputParams: userStateMapboxOutputParamsCreator(outputParams)},
      {user: props}
    )
  );
};

const _makeProjectsQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
  return R.map(
    value => {
      return reqStrPathThrowing('data.projects.0.data.mapbox', value);
    },
    makeProjectsQueryContainer(
      apolloConfig,
      {
        name: 'projects',
        readInputTypeMapper,
        outputParams: projectMapboxOutputParamsCreator(outputParams)
      },
      props
    )
  );
};

const _makeRegionsQueryResolveMapboxContainer = (apolloConfig, outputParams, props) => {
  return R.map(
    value => {
      return reqStrPathThrowing('data.regions.0.data.mapbox', value);
    },
    makeRegionsQueryContainer(
      apolloConfig,
      {name: 'regions', readInputTypeMapper, outputParams: regionMapboxOutputParamsCreator(outputParams)},
      props
    )
  );
};

const _makeSettingsQueryResolveMapboxContainer = (apolloConfig, outputParams, settingsProps) => {
  return R.map(
    value => {
      return reqStrPathThrowing('data.settings.0.data.mapbox', value);
    },
    makeSettingsQueryContainer(
      apolloConfig,
      {
        outputParams: R.merge(
          // Merge the settings identifier param with the mapbox params
          {key: 1, id: 1},
          settingdMapboxOutputParamsCreator(outputParams)
        )
      },
      settingsProps
    )
  );
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
