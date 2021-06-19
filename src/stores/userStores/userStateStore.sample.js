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

import {loggers} from '@rescapes/log';
import {capitalize, reqStrPathThrowing, strPath, strPathOr} from '@rescapes/ramda';
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
import {
  regionOutputParams,
  regionOutputParamsMinimized,
  regionsQueryContainer
} from '../scopeStores/region/regionStore';
import {
  projectMutationContainer,
  projectOutputParams,
  projectsQueryContainer
} from '../scopeStores/project/projectStore';
import {projectSample} from '../scopeStores/project/projectStore.sample';
import {defaultSearchLocationOutputParamsMinimized} from "../search/searchLocation/defaultSearchLocationOutputParams";
import {querySearchLocationsContainer} from "../search/searchLocation/searchLocationStore";
import {createSampleSearchLocationContainer} from "../search/searchLocation/searchLocationStore.sample";
const log = loggers.get('rescapeDefault');

/***
 * Helper to create scope objects and set the user state to them
 * @param {Object} apolloConfig
 * @param {Object} options
 * @param {Boolean} options.forceDelete
 * @param {Object} [options.searchLocationOutputParamsMinimized] Defaults defaultSearchLocationOutputParamsMinimized.
 * search location outputParams based on the application's location search params
 * @param {Object} [options.additionalUserScopeOutputParams] Defaults to {} Specify additional outputParmams
 * that are applied to userRegion and userProject outputParams
 * @param {Object} props
 * @param {Object} props.user A real user object
 * @param {Object} props.userState Alternative to props.user, when the userState already exists
 * @param {[String]} props.regionKeys Region keys to use to make sample regions
 * @param {[String]} props.projectKeys Project keys to use to make sample projects
 * @param {Function} props.locationsContainer Optional function to create locations
 * This function expects two arguments, apolloConfig and props.
 * Props will be based in as {user: {id: user.id}}
 * @param {[String]} props.searchLocationNames Optional search location names
 * This function expects two arguments, apolloConfig and props.
 * Props will be based in as {user: {id: user.id}}
 * @param {Object} [props.additionalUserScopeData] Defaults to {}, adds the given data to each userScope instance, like userRegion
 * @param {Function} props.render
 * @returns {Task|Object} Task or React container resolving to {projects, regions, userState} for apollo client, apollo component
 * for components
 */
export const mutateSampleUserStateWithProjectsAndRegionsContainer = (
  apolloConfig,
  {
    forceDelete,
    searchLocationOutputParamsMinimized = defaultSearchLocationOutputParamsMinimized,
    additionalUserScopeOutputParams = {}
  },
  {user, userState, regionKeys, projectKeys, locationsContainer, searchLocationNames, additionalUserScopeData, render}
) => {
  user = user || reqStrPathThrowing('user', userState)
  return composeWithComponentMaybeOrTaskChain([
    // This creates one userState and puts it in userStates
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userState',
      ({userStateResponse, render}) => {
        return mutateOnceAndWaitContainer(apolloConfig, {responsePath: 'result.data.mutate.userState'}, userStateResponse, render);
      }
    ),
    // Set the user state of the given user to the region and project
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateResponse',
      ({user, regions, projects, searchLocations, render}) => {
        return userStateMutationContainer(
          apolloConfig,
          {
            outputParams: userStateOutputParamsMetaAndScopeIds({
                searchLocationOutputParams: searchLocationOutputParamsMinimized,
                additionalUserScopeOutputParams,
              }
            )
          },
          {
            userState: createSampleUserStateProps(
              {user, userState, regions, projects, searchLocations, additionalUserScopeData}
            ),
            render
          }
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
            existingItemMatch: (item, existingItemsResponses) => {
              const existing = R.find(
                existingItem => {
                  // TODO it's possible to get a deleted item here because the item can be found in the cache
                  // after it's been deleted. We should make sure deleted items are removed from the cache
                  return !strPathOr(false, 'deleted', existingItem) && R.propEq('name', capitalize(item), existingItem)
                },
                existingItemsResponses
              )
              if (existing) {
                log.debug(`Found existing sample project with id ${existing.id} for name ${existing.name}`)
              }
              return existing
            },
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
            existingMatchingProps: {nameIn: R.map(capitalize, regionKeys)},
            existingItemMatch: (item, existingItemsResponses) => {
              const existing = R.find(
                existingItem => {
                  // TODO it's possible to get a deleted item here because the item can be found in the cache
                  // after it's been deleted. We should make sure deleted items are removed from the cache
                  return !strPathOr(false, 'deleted', existingItem) && R.propEq('name', capitalize(item), existingItem)
                },
                existingItemsResponses
              )
              if (existing) {
                log.debug(`Found existing sample region with id ${existing.id} for name ${existing.name}`)
              }
              return existing
            },
            queryForExistingContainer: regionsQueryContainer,
            // Need the full to get region.data.mapbox for sample data userRegion data
            outputParams: regionOutputParams,
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

    // Create sample searchLocations if needed
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'searchLocations',
      ({render, searchLocationNames}) => {
        return R.ifElse(
          R.identity,
          searchLocationNames => {
            return callMutationNTimesAndConcatResponses(
              apolloConfig,
              {
                items: searchLocationNames,

                // These help us find existing regions from the API and either reuse them or destroy and recreate them
                forceDelete,
                existingMatchingProps: {nameIn: searchLocationNames},
                existingItemMatch: (item, existingItemsResponses) => {
                  const existing = R.find(
                    existingItem => {
                      // TODO it's possible to get a deleted item here because the item can be found in the cache
                      // after it's been deleted. We should make sure deleted items are removed from the cache
                      return !strPathOr(false, 'deleted', existingItem) && R.propEq('name', capitalize(item), existingItem)
                    },
                    existingItemsResponses
                  )
                  if (existing) {
                    log.debug(`Found existing sample search location with id ${existing.id} for name ${existing.name}`)
                  }
                  return existing
                },
                queryForExistingContainer: querySearchLocationsContainer,
                queryResponsePath: 'data.searchLocations',
                outputParams: searchLocationOutputParamsMinimized,
                mutationContainer: createSampleSearchLocationContainer,
                responsePath: 'result.data.mutate.searchLocation',
                propVariationFunc: ({item: locationSearchName}) => {
                  return {
                    name: capitalize(locationSearchName)
                  };
                }
              },
              {render}
            )
          },
          () => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                response: {objects: []}
              }
            );
          }
        )(searchLocationNames);
      }
    ),

    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'locations',
      // Create sample locations (optional)
      ({locationsContainer, render}) => {
        return R.ifElse(
          R.identity,
          f => f(apolloConfig, {forceDelete}, {render}),
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
  ])({user, userState, regionKeys, projectKeys, locationsContainer, searchLocationNames, render});
};

const sampleUserSearchLocations = searchLocations => {
  return R.addIndex(R.map)(
    (searchLocation, i) => {
      return {
        searchLocation,
        activity: {isActive: i === 0}
      }
    },
    searchLocations || [{street: {name: 'Paddy Wack St'}}]
  )
}

/**
 * Populates the UserRegion properties with defaults based on the region's properties
 * @param {Object} region
 * @param {Number} region.id The region id
 * @param {[Object]} [searchLocations] Optional searchLocations, otherwise defaults to a sample one
 * @param {Object} [additionalUserScopeData] Default {}, optional extra data from the user scope
 * @return {{mapbox: {viewport: {latitude: number, zoom: number, longitude: (number|null)}}, region: {id: number}}}
 */
export const createUserRegionWithDefaults = (region, searchLocations = null, additionalUserScopeData = {}) => {
  return {
    region: {
      id: parseInt(reqStrPathThrowing('id', region))
    },
    mapbox: {
      viewport: {
        // Use the defaults from the region. This viewport is what the user has saved for the current region
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
      userSearchLocations: sampleUserSearchLocations(searchLocations)
    },
    ...additionalUserScopeData
  };
};

/**
 * Populates the UserProject properties with defaults based on the region's properties
 * @param {Object} project
 * @param {Number} project.id The project id
 * @param {[Object]} [searchLocations] Optional searchLocations, otherwise defaults to a sample one
 * @param {Object} [additionalUserScopeData] Default {}, optional extra data from the user scope
 * @return {{mapbox: {viewport: {latitude: number, zoom: number, longitude: (number|null)}}, project: {id: number}}}
 */
export const createUserProjectWithDefaults = (project, searchLocations = null, additionalUserScopeData = {}) => {
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
      userSearchLocations: sampleUserSearchLocations(searchLocations)
    },
    ...additionalUserScopeData
  };
};

/**
 * Helper to create sample props for a UserState
 * @param {Object} user The user. Use if userState is not available or not created yet
 * @param {Object} userState The userState if updating. Use instead of user for updates
 * @param {[Object]} regions Sample regions
 * @param {[Object]} projects Sample projects
 * @param {[Objecdt]} searchLocations Sample searchLocations. These are assigned to all userRegions and userProjects
 * @returns {Object} {
 * data: {
 * userProjects: [{
 *  project: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number},
 *  searchLocations: [...]
 * }],
 * userRegions: [{
 * region: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}
 * searchLocations: [...]
 * }]
 * },
 * user: {id: number}
 * }
 */
const createSampleUserStateProps = ({user, userState, regions, projects, searchLocations, additionalUserScopeData}) => {
  return R.merge(
    userState ?
      {id: reqStrPathThrowing('id', userState)} :
      {user: {id: (reqStrPathThrowing('id', user))}},
    {
      data: {
        // Make the first instance of each active
        userRegions: R.addIndex(R.map)(
          (region, i) => {
            return R.merge(
              createUserRegionWithDefaults(region, searchLocations, additionalUserScopeData),
              {activity: {isActive: !i}}
            );
          },
          regions
        ),
        userProjects: R.addIndex(R.map)(
          (project, i) => {
            return R.merge(
              createUserProjectWithDefaults(project, searchLocations, additionalUserScopeData),
              {activity: {isActive: !i}}
            );
          },
          projects
        )
      }
    }
  );
};
