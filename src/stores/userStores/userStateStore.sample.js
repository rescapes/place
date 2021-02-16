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
  mapToNamedResponseAndInputs,
  mapWithArgToPath,
  strPathOr,
  compact,
  reqStrPathThrowing
} from '@rescapes/ramda';
import RT from 'react';
import {e} from '@rescapes/helpers-component';
import {
  userStateMutationContainer, userScopeOutputParamsFragmentDefaultOnlyIds,
  userStateMutateOutputParams,
  userStateOutputParamsFullMetaOnlyScopeIds, deleteProjectsContainer, deleteRegionsContainer
} from './userStateStore.js';
import {createSampleProjectContainer} from '../scopeStores/project/projectStore.sample.js';
import {createSampleRegionContainer} from '../scopeStores/region/regionStore.sample.js';
import * as R from 'ramda';
import T from 'folktale/concurrency/task/index.js';
import {
  callMutationNTimesAndConcatResponses,
  composeWithComponentMaybeOrTaskChain, containerForApolloType, getRenderPropFunction,
  mapTaskOrComponentToNamedResponseAndInputs
} from '@rescapes/apollo';

const {useEffect} = RT;
const {of} = T;
import {createSampleLocationsContainer} from '../scopeStores/location/locationStore.sample.js';
import {addMutateKeyToMutationResponse} from '@rescapes/apollo/src/helpers/containerHelpers';


/***
 * Helper to create scope objects and set the user state to them
 * @param apolloClient
 * @param user
 * @param regionKey
 * @param projectKey
 * @returns {Task} {project, region, userStateResponse}
 */
export const mutateSampleUserStateWithProjectAndRegionTask = ({apolloConfig, user, regionKey, projectKey}) => {
  return composeWithChain([
    // Set the user state of the given user to the region and project
    mapToNamedPathAndInputs('userState', 'result.data.mutate.userState',
      ({apolloConfig, user, region, project}) => {
        return userStateMutationContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFullMetaOnlyScopeIds()},
          {userStateResponse: createSampleUserStateProps({user, regions: [region], projects: [project]})}
        );
      }
    ),
    // Create a sample project
    mapToNamedPathAndInputs('project', 'result.data.mutate.project',
      ({apolloConfig, user, userState}) => {
        return createSampleProjectContainer(apolloConfig,
          {locationsContainer: createSampleLocationsContainer},
          {
            key: projectKey,
            name: capitalize(projectKey),
            user: userState ? R.prop('user', userState) : user
          }
        );
      }
    ),

    // Create a sample region
    mapToNamedPathAndInputs('region', 'result.data.mutate.region',
      ({apolloConfig}) => {
        return createSampleRegionContainer(apolloConfig, {
          key: regionKey,
          name: capitalize(regionKey)
        });
      }
    )
  ])({apolloConfig, user, regionKey, projectKey});
};

/***
 * Helper to create scope objects and set the user state to them
 * @param {Object} config.apolloConfig
 * @param {Object} apolloConfig
 * @param {Object} options
 * @param {Boolean} [options.forceDelete] Default true, if true, delete all the instances of locations,
 * regions, and projects matching the test props first. Then create new instances
 * @param {Object} config.user A real user object
 * @param [{String}] config.regionKeys Region keys to use to make sample regions
 * @param [{String}] config.projectKeys Project keys to use to make sample projects
 * @param {Function} config.locationsContainer Optional function to create locations
 * This function expects two arguments, apolloConfig and props.
 * Props will be based in as {user: {id: user.id}}
 * @param {Function} config.render
 * @returns {Task<Object>} Task resolving to {projects, regions, userState} for apollo client, apollo component
 * for components
 */
export const mutateSampleUserStateWithProjectsAndRegionsContainer = (
  apolloConfig,
  {forceDelete=true},
  {user, regionKeys, projectKeys, locationsContainer, render}
) => {
  return composeWithComponentMaybeOrTaskChain([

    // Wait for the userState to be ready for component request
    ({userStateResponse, user, regions, projects, render}) => {
      if (strPathOr(false, 'result.loading', userStateResponse) || !strPathOr(false, 'result.data', userStateResponse)) {
        return e('div', {}, 'loading');
      }
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction({render}),
          response: {
            userState: reqStrPathThrowing('result.data.mutate.userState',
              addMutateKeyToMutationResponse({silent: true}, userStateResponse)
            ),
            regions, projects
          }
        }
      );
    },

    // Set the user state of the given user to the region and project
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateResponse',
      ({user, regions, projects, render}) => {
        return userStateMutationContainer(
          R.merge(apolloConfig, {mutateOnMount: true}),
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
            // If true, deletes all the instances matching forceDeleteMatchingProps before creating new instances
            forceDelete,
            forceDeleteMatchingProps: {
              keysContains: projectKeys,
              region: R.pick(['id'], R.head(regions)),
              user: R.pick(['id'], user),
            },
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
            // If true, deletes all the instances matching forceDeleteMatchingProps before creating new instances
            forceDelete,
            forceDeleteMatchingProps: {
              keysContains: regionKeys,
            },
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
          f => f(apolloConfig, {forceDelete}, {render}),
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


/***
 * Deletes the scope instances created by mutateSampleUserStateWithProjectAndRegionTask,
 * both the references in userState and the instances themselves
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} options
 * @param {Boolean} options.forceDelete If true delete the samples created by previous runs first
 * @param {Object} props
 * @param {Object} props.userState
 * @param {Object} props.scopeProps Keyed by 'region' and 'project'. Values are search props for
 * regions and projects of the userState to remove.
 * @param {Object} [props.render] The render function for component requests
 * E.g. {region: {keyContains: 'test'}, project: {keyContains: 'test'}}
 * @return {*}
 */
export const deleteSampleUserStateScopeObjectsContainer = (apolloConfig, {forceDelete}, {userState, scopeProps, render}) => {
  return composeWithComponentMaybeOrTaskChain([
    ({userState, deletedRegionsResponse, deletedProjectsResponse}) => {
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction({render}),
          // Override the data with the consolidated mapbox
          response: {userState, deletedRegionsResponse, deletedProjectsResponse}
        }
      );
    },
    // clearedScopeObjsUserState is the userState with the regions cleared
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedProjectsResponse',
      ({userState, deletedRegions, clearedScopeObjsUserState}) => {
        const user = reqStrPathThrowing('user', userState);
        return R.ifElse(
          R.identity,
          project => {
            return deleteProjectsContainer(
              apolloConfig,
              {
                // Only allow deleting projects owned by userState.user
                // Also Clear the userState of these projects
                userState
              },
              R.merge(
                project,
                // Only allow deleting projects owned by this user
                {user: R.pick(['id'], user)}
              )
            );
          },
          _ => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                // Override the data with the consolidated mapbox
                response: {clearedScopeObjsUserState}
              }
            );
          }
        )(strPathOr(null, 'project', scopeProps));
      }),

    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedRegionsResponse',
      ({userState}) => {
        return R.ifElse(
          R.identity,
          region => {
            return deleteRegionsContainer(apolloConfig, {}, {userState, scopeProps: region, render});
          },
          _ => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                // Override the data with the consolidated mapbox
                response: {clearedScopeObjsUserState: {data: {mutate: {userState}}}}
              }
            );
          }
        )(strPathOr(null, 'region', scopeProps));
      })
  ])({userState, render});
};
