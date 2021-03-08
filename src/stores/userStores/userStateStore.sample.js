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

import {
  capitalize,
  composeWithChain,
  mapToNamedPathAndInputs,
  reqStrPathThrowing,
  pickDeepPaths, mapToResponseAndInputs, strPathOr
} from '@rescapes/ramda';
import {
  adminUserStateQueryContainer, currentUserStateQueryContainer,
  userStateMutationContainer,
  userStateOutputParamsFullMetaOnlyScopeIds
} from './userStateStore.js';
import {createSampleProjectContainer} from '../scopeStores/project/projectStore.sample.js';
import {createSampleRegionContainer, sampleRegion} from '../scopeStores/region/regionStore.sample.js';
import * as R from 'ramda';
import {
  callMutationNTimesAndConcatResponses,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType, deleteItemsOfExistingResponses,
  getRenderPropFunction,
  mapTaskOrComponentToNamedResponseAndInputs,
  mutateOnceAndWaitContainer
} from '@rescapes/apollo';
import {createSampleLocationsContainer} from '../scopeStores/location/locationStore.sample.js';
import {deleteLocationsContainer} from '../scopeStores/location/locationStore';
import {makeRegionMutationContainer} from '../scopeStores/region/regionStore';
import {makeProjectMutationContainer} from '../scopeStores/project/projectStore';
import {queryScopeObjsOfUserStateContainer} from './userScopeStores/userStateHelpers';

/***
 * Helper to optionally delete and (re)create scope objects and set the user state to them
 * @param {Object} apolloConfig
 * @param {Object} apolloConfig.apolloClient
 * @param {Object} options
 * @param {Boolean} [options.forceDelete] Default true. Delete existing scope instances and then
 * recreate. Otherwise existing instances will be used if they exist
 * depending on forceDelete. Expects item and existingItems, then returns the existingItem
 * that matches item, if any.
 * @param {Function} options.mutateSampleLocationsContainer Accepts and apolloConfig and options options and props
 * Returns locations to be used for sample projects. This container should accept forceDelete in options and
 * handle optionally recreating existing locations if forceDelete is true. See createSampleLocationsContainer
 * @param {Object} props
 * @param {Object} props.user
 * @param {[String]} props.regionKeys
 * @param {[String]} props.projectKeys
 * @returns {Task} {project, region, userStateResponse}
 */
export const mutateSampleUserStateWithProjectAndRegionContainer = (
  apolloConfig,
  {forceDelete = true, mutateSampleLocationsContainer},
  {user, regionKeys, projectKeys}
) => {
  return composeWithChain([
    // Set the user state of the given user to the region and project
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userState',
      ({user, region, project}) => {
        return userStateMutationContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFullMetaOnlyScopeIds()},
          {
            userState: createSampleUserStateProps({
              user,
              regions: [region],
              projects: [project]
            })
          }
        );
      }
    ),

    // Soft delete the userState if forceDelete is true
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStates',
      ({render}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig, {
            forceDelete,
            propVariationFuncForDeleted: ({item}) => pickDeepPaths(['user.id'], item),
            queryResponsePath: 'data.userStates',
            existingItemMatch: (item, existingItemResponses) => {
              R.find(existingItem => R.equals(strPathOr(null, 'user.id', item), reqStrPathThrowing('user.id', existingItem)), existingItemResponses);
            },
            queryForExistingContainer: currentUserStateQueryContainer,
            // No props needed, currentUserStateQueryContainer just returns 0 or 1 items
            existingMatchingProps: {},

            mutationContainer: userStateMutationContainer,
            responsePath: 'userState',
            // Always just create 1 userState
            items: [{user: R.pick(['id'], user)}],
            propVariationFunc: ({item}) => {
              return item;
            },
            outputParams: userStateOutputParamsFullMetaOnlyScopeIds()
          },
          {
            user,
            render
          }
        );
      }
    ),

    // Soft delete the sample projects if forceDelete is true
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'projects',
      ({render}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig, {
            forceDelete,
            mutationContainer: makeProjectMutationContainer,
            propVariationFuncForDeleted: ({item}) => R.pick(['key'], item),
            queryResponsePath: 'data.projects',

            responsePath: 'project',
            items: R.map(key => ({key}), projectKeys),
            propVariationFunc: ({item}) => {
              const projectKey = R.prop('key', item);
              return {
                key: projectKey,
                name: capitalize(projectKey)
              };
            }
          },
          {
            existingItemResponses: R.map(key => ({key}), projectKeys),
            render
          }
        );
      }
    ),

    // CRUD the sample regions if forceDelete is true
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'regions',
      ({regionKeys, render}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig, {
            forceDelete,
            mutationContainer: makeRegionMutationContainer,
            propVariationFuncForDeleted: ({item}) => R.pick(['key'], item),
            queryResponsePath: 'data.regions',

            responsePath: 'region',
            items: R.map(key => ({key}), regionKeys),
            propVariationFunc: ({item}) => {
              const regionKey = R.prop('key', item);
              return sampleRegion({
                key: regionKey,
                name: capitalize(regionKey)
              });
            }
          },
          {
            existingItemResponses: R.map(key => ({key}), regionKeys),
            render
          }
        );
      }
    ),

    // CRUD the locations for all the sample projects if forceDelete is true
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'locations',
      ({render}) => {
        return mutateSampleLocationsContainer ?
          mutateSampleLocationsContainer(apolloConfig, {
              forceDelete
            }, {}
          ) : containerForApolloType(
            apolloConfig,
            {
              render,
              response: []
            }
          );
      })
  ])({apolloConfig, user, regionKeys, projectKeys});
};

/***
 * Helper to create scope objects and set the user state to them
 * @param {Object} apolloConfig
 * @param {Object} options
 * @param {Boolean} options.forceDelete
 * @param {Object} props
 * @param {Object} props.user A real user object
 * @param [{String}] props.regionKeys Region keys to use to make sample regions
 * @param [{String}] props.projectKeys Project keys to use to make sample projects
 * @param {Function} props.locationsContainer Optional function to create locations
 * This function expects two arguments, apolloConfig and props.
 * Props will be based in as {user: {id: user.id}}
 * @param {Function} props.render
 * @returns {Task<Object>} Task resolving to {projects, regions, userState} for apollo client, apollo component
 * for components
 */
export const mutateSampleUserStateWithProjectsAndRegionsContainer = (
  apolloConfig,
  {forceDelete},
  {user, regionKeys, projectKeys, locationsContainer, render}
) => {
  return composeWithComponentMaybeOrTaskChain([
    // This creates one userState and puts it in userStates
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStates',
      ({userStateResponse, render}) => {
        return mutateOnceAndWaitContainer(apolloConfig, {responsePath: 'result.data.mutate.userState'}, userStateResponse, render);
      }
    ),
    // Set the user state of the given user to the region and project
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateResponse',
      ({user, regions, projects, render}) => {
        return userStateMutationContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFullMetaOnlyScopeIds()},
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
            mutationContainer: (apolloConfig, {}, props) => {
              return createSampleProjectContainer(apolloConfig, {locationsContainer}, props);
            },
            responsePath: 'result.data.mutate.project',
            propVariationFunc: ({item: projectKey}) => {
              return {
                key: projectKey,
                name: capitalize(projectKey),
                user: R.pick(['id'], user),
                region: R.pick(['id'], R.head(regions)),
                locations: R.map(R.pick(['id']), locations)
              };
            }
          },
          {regions, locations, render}
        );
      }
    ),
    // Create sample regions
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'regions',
      ({render}) => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig,
          {
            items: regionKeys,
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
                response: []
              }
            );
          }
        )(locationsContainer);
      }
    )
  ])({user, regionKeys, projectKeys, locationsContainer, render});
};
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
      viewport: {
        // Use the defaults from the project
        latitude: project.data.mapbox.viewport.latitude,
        longitude: project.data.mapbox.viewport.longitude,
        // Zoom in one from he project's zoom
        zoom: project.data.mapbox.viewport.zoom + 1
      }
    },
    selection: {
      isSelected: false
    },
    activity: {
      isActive: false
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
