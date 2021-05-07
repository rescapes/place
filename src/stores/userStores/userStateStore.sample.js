/**
 * Created by Andy Likuski on 2020.03.18
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {capitalize, reqStrPathThrowing} from '@rescapes/ramda';
import {userStateMutationContainer, userStateOutputParamsMetaAndScopeIds} from './userStateStore.js';
import {createSampleRegionContainer} from '../scopeStores/region/regionStore.sample.js';
import * as R from 'ramda';
import {
  callMutationNTimesAndConcatResponses,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction,
  mapTaskOrComponentToNamedResponseAndInputs,
  mutateOnceAndWaitContainer
} from '@rescapes/apollo';
import {regionsQueryContainer} from '../scopeStores/region/regionStore';
import {
  projectMutationContainer,
  projectOutputParams,
  projectsQueryContainer
} from '../scopeStores/project/projectStore';
import {projectSample} from '../scopeStores/project/projectStore.sample';
import {defaultSearchLocationOutputParamsMinimized} from "../search/searchLocation/defaultSearchLocationOutputParams";

/***
 * Helper to create scope objects and set the user state to them
 * @param {Object} apolloConfig
 * @param {Object} options
 * @param {Boolean} options.forceDelete
 * @param {Object} options.searchLocationOutputParamsMinimized Defaults defaultSearchLocationOutputParamsMinimized.
 * search location outputParams based on the application's location search params
 * @param {Object} props
 * @param {Object} props.user A real user object
 * @param [{String}] props.regionKeys Region keys to use to make sample regions
 * @param [{String}] props.projectKeys Project keys to use to make sample projects
 * @param {Function} props.locationsContainer Optional function to create locations
 * This function expects two arguments, apolloConfig and props.
 * Props will be based in as {user: {id: user.id}}
 * @param {Function} props.render
 * @returns {Task|Object} Task or React container resolving to {projects, regions, userState} for apollo client, apollo component
 * for components
 */
export const mutateSampleUserStateWithProjectsAndRegionsContainer = (
  apolloConfig,
  {forceDelete, searchLocationOutputParamsMinimized = defaultSearchLocationOutputParamsMinimized},
  {user, regionKeys, projectKeys, locationsContainer, render}
) => {
  return composeWithComponentMaybeOrTaskChain([
    // This creates one userState and puts it in userStates
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userState',
      ({userStateResponse, render}) => {
        return mutateOnceAndWaitContainer(apolloConfig, {responsePath: 'result.data.mutate.userState'}, userStateResponse, render);
      }
    ),
    // Set the user state of the given user to the region and project
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateResponse',
      ({user, regions, projects, render}) => {
        return userStateMutationContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsMetaAndScopeIds(searchLocationOutputParamsMinimized)},
          {userState: createSampleUserStateProps({user, regions, projects}), render}
        );
      }
    ),

    // Create sample projects
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'projects',
      ({locations, regions, render}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig, {
            items: projectKeys,

            // These help us find existing regions from the API and either reuse them or destroy and recreate them
            forceDelete,
            existingMatchingProps: {user: R.pick(['id'], user), nameIn: R.map(capitalize, projectKeys)},
            existingItemMatch: (item, existingItemsResponses) => R.find(
              existingItem => R.propEq('name', item, existingItem),
              existingItemsResponses
            ),
            queryForExistingContainer: projectsQueryContainer,
            queryResponsePath: 'data.projects',

            mutationContainer: projectMutationContainer,
            responsePath: 'result.data.mutate.project',
            propVariationFunc: ({item: projectKey}) => {
              return projectSample({
                // Keys have to be unique through the system, so might have a suffix assigned by the server
                key: projectKey,
                // These don't have to be unique
                name: capitalize(projectKey),
                user: R.pick(['id'], user),
                region: R.pick(['id'], R.head(regions)),
                locations: R.map(R.pick(['id']), locations)
              });
            },
            // Need the full outputParams for createUserProjectWithDefaults()
            outputParams: projectOutputParams
          },
          {regions, locations, render}
        );
      }
    ),
    // Create sample regions
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'regions',
      ({render, regionKeys}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig,
          {
            items: regionKeys,

            // These help us find existing regions from the API and either reuse them or destroy and recreate them
            forceDelete,
            existingMatchingProps: {keyIn: regionKeys},
            existingItemMatch: (item, existingItemsResponses) => R.find(
              existingItem => R.propEq('key', item, existingItem),
              existingItemsResponses
            ),
            queryForExistingContainer: regionsQueryContainer,
            queryResponsePath: 'data.regions',

            mutationContainer: createSampleRegionContainer,
            responsePath: 'result.data.mutate.region',
            propVariationFunc: ({item: regionKey}) => {
              return {
                key: regionKey,
                name: capitalize(regionKey)
              };
            }
          },
          {render}
        );
      }
    ),

    // Create sample searchLocations
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'searchLocations',
      ({render, searchLocationNames}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig,
          {
            items: searchLocationNames,

            // These help us find existing regions from the API and either reuse them or destroy and recreate them
            forceDelete,
            existingMatchingProps: {nameIn: searchLocationNames},
            existingItemMatch: (item, existingItemsResponses) => R.find(
              existingItem => R.propEq('name', item, existingItem),
              existingItemsResponses
            ),
            queryForExistingContainer: searchLocationsQueryContainer,
            queryResponsePath: 'data.regions',

            mutationContainer: createSampleRegionContainer,
            responsePath: 'result.data.mutate.region',
            propVariationFunc: ({item: regionKey}) => {
              return {
                key: regionKey,
                name: capitalize(regionKey)
              };
            }
          },
          {render}
        );
      }
    ),

    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'locations',
      // Create sample locations (optional)
      ({locationsContainer, render}) => {
        return R.ifElse(
          R.identity,
          f => f(apolloConfig, {}, {render}),
          () => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                response: {objects: []}
              }
            );
          }
        )(locationsContainer);
      }
    )
  ])({user, regionKeys, projectKeys, locationsContainer, render});
};

const sampleUserSearchLocation = {
  searchLocation: {street: {name: 'Paddy Wack St'}},
  activity: {isActive: true}
}

/**
 * Populates the UserRegion properties with defaults based on the region's properties
 * @param {Object} region
 * @param {Number} region.id The region id
 * @return {{mapbox: {viewport: {latitude: number, zoom: number, longitude: (number|null)}}, region: {id: number}}}
 */
export const createUserRegionWithDefaults = region => {
  return {
    region: {
      id: parseInt(reqStrPathThrowing('id', region))
    },
    mapbox: {
      viewport: {
        // Use the defaults from the region
        latitude: reqStrPathThrowing('data.mapbox.viewport.latitude', region),
        longitude: reqStrPathThrowing('data.mapbox.viewport.longitude', region),
        // Zoom in one from he region's zoom
        zoom: reqStrPathThrowing('data.mapbox.viewport.zoom', region) + 1
      }
    },
    selection: {
      isSelected: false
    },
    activity: {
      isActive: false
    },
    userSearch: {
      userSearchLocations: [sampleUserSearchLocation]
    }
  };
};

/**
 * Populates the UserProject properties with defaults based on the region's properties
 * @param {Object} project
 * @param {Number} project.id The project id
 * @return {{mapbox: {viewport: {latitude: number, zoom: number, longitude: (number|null)}}, project: {id: number}}}
 */
export const createUserProjectWithDefaults = project => {
  return {
    project: {
      id: parseInt(reqStrPathThrowing('id', project))
    },
    mapbox: {
      // Use the defaults from the project
      viewport: R.pick(['latitude', 'longitude', 'zoom'], reqStrPathThrowing('data.mapbox.viewport', project))
    },
    selection: {
      isSelected: false
    },
    activity: {
      isActive: false
    },
    userSearch: {
      userSearchLocations: [sampleUserSearchLocation]
    }
  };
};

/**
 * Helper to create sample props for a UserState
 * @param {Object} user
 * @param {[Object]} regions
 * @param {[Object]} projects
 * @returns {Object} {
 * data: {
 * userProjects: [{project: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}}],
 * userRegions: [{region: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}}]
 * },
 * user: {id: number}
 * }
 */
const createSampleUserStateProps = ({user, regions, projects}) => {
  return {
    user: {id: parseInt(reqStrPathThrowing('id', user))},
    data: {
      // Make the first instance of each active
      userRegions: R.addIndex(R.map)(
        (region, i) => {
          return R.merge(
            createUserRegionWithDefaults(region),
            {activity: {isActive: !i}}
          );
        },
        regions
      ),
      userProjects: R.addIndex(R.map)(
        (project, i) => {
          return R.merge(
            createUserProjectWithDefaults(project),
            {activity: {isActive: !i}}
          );
        },
        projects
      )
    }
  };
};
