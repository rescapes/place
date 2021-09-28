/**
 * Created by Andy Likuski on 2019.01.04
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  getPathOnResolvedUserProjectAndQuery,
  userStateProjectMutationContainer,
  userStateProjectsQueryContainer
} from './userStateProjectStore.js';
import {userStateProjectOutputParams} from './userStateProjectStoreHelpers.js'
import {
  composeWithChain,
  composeWithChainMDeep,
  defaultRunConfig,
  expectKeysAtPath,
  mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import * as R from 'ramda';
import {currentUserStateQueryContainer, userStateOutputParamsOnlyIds} from '../userStateStore.js';
import moment from 'moment';
import {
  createUserProjectWithDefaults,
  mutateSampleUserStateWithProjectsAndRegionsContainer
} from '../userStateStore.sample.js';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import {createSampleProjectContainer} from '../../scopeStores/project/projectStore.sample.js';
import {selectionOutputParamsFragment} from '../selectionStore.js';
import {activityOutputParamsMixin} from '../activityStore.js';
import {currentUserQueryContainer, deleteItemsOfExistingResponses, userOutputParams} from '@rescapes/apollo';
import {
  projectMutationContainer,
  projectOutputParamsMinimized,
  projectsQueryContainer
} from '../../scopeStores/project/projectStore.js';
import {createSampleLocationsContainer} from '../../scopeStores/location/locationStore.sample.js';
import {getPathOnResolvedUserRegionAndQuery} from "./userStateRegionStore.js";
import {querySearchLocationsContainer} from "../../search/searchLocation/searchLocationStore.js";

describe('userProjectStore', () => {
  test('userProjectsQueryContainer', done => {
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    composeWithChainMDeep(1, [
      ({apolloConfig, user}) => {
        return userStateProjectsQueryContainer(
          apolloConfig,
          {
            userStateProjectOutputParams: userStateProjectOutputParams({explicitProjectOutputParams: projectOutputParamsMinimized})
          },
          {
            userState: {user: R.pick(['id'], user)},
            // Don't limit the projects further
            userProject: {project: {}}
          }
        );
      },
      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectsAndRegionsContainer(
          apolloConfig,
          {},
          {
            user: R.pick(['id'], user),
            regionKeys: ['earth'],
            projectKeys: ['shrangrila']
          });
      }),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => currentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask())

    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userStates.0.data.userProjects.0.project', response);
        }
    }, errors, done));
  }, 10000);

  test('userProjectQueryTaskWithProjectFilter', done => {
    expect.assertions(2);
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    composeWithChain([
      // Filter for projects where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Projects so we can filter by Project
      ({apolloConfig, user, projects}) => {
        // Get the name since it will be Shrangrila29 or whatever
        const projectNames = R.map(R.prop('name'), projects);
        return userStateProjectsQueryContainer(apolloConfig, {
          userStateProjectOutputParams: userStateProjectOutputParams({explicitProjectOutputParams: projectOutputParamsMinimized})
        }, {
          userState: {user: R.pick(['id'], user)},
          // Limit by geojson (both pass this) and by name (1 passes this)
          userProject: {
            project: {geojson: {type: 'FeatureCollection'}, name: projectNames[0]}
          }
        });
      },
      // Set the UserState, returns previous values and {userState, projects, regions}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig, {forceDelete: true}, {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila', 'pangea']
            });
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userStates.0.data.userProjects.0.project', response);
          expect(R.length(reqStrPathThrowing('data.userStates.0.data.userProjects', response))).toEqual(1);
        }
    }, errors, done));
  }, 1000000);

  test('makeActiveUserProjectQuery', done => {
    const errors = [];
    const someProjectKeys = ['id'];
    R.composeK(
      ({apolloConfig, user}) => {
        return userStateProjectsQueryContainer(
          apolloConfig,
          {},
          {
            userState: {user: R.pick(['id'], user)},
            userProject: {project: {}}
          }
        );
      },
      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectsAndRegionsContainer(
          apolloConfig,
          {},
          {
            user: R.pick(['id'], user),
            regionKeys: ['earth'],
            projectKeys: ['shrangrila']
          });
      }),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask();
        }
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userStates.0.data.userProjects.0.project', response);
        }
    }, errors, done));
  });

  test('userStateProjectMutationContainer', done => {
    const errors = [];
    const projectKey = `testProjectKey${moment().format('HH-mm-ss-SSS')}`;
    const projectName = `TestProjectName${moment().format('HH-mm-ss-SSS')}`;
    R.composeK(
      // Since this is a mutation, it's okay to not have a userProject defined, but then we can't mutate
      mapToNamedResponseAndInputs('undefinedUserProject',
        ({apolloConfig, userState, project}) => {
          // Add the new region to the UserState
          return userStateProjectMutationContainer(
            apolloConfig,
            {
              userProjectOutputParams: userStateProjectOutputParams({})
            },
            {
              userState,
              userProject: null
            }
          );
        }
      ),
      // Modify the new project in the UserState
      mapToNamedPathAndInputs('userState', 'result.data.mutate.userState',
        ({apolloConfig, userState, project}) => {
          return userStateProjectMutationContainer(
            apolloConfig,
            {
              // We only need each project id back from userState.data.userProjects: [...]
              // and anything we want to merge with the updates
              userProjectOutputParams: {
                project: {
                  id: 1,
                  region: {id: 1},
                  locations: {id: 1}
                },
                // The output of the existing (isSelected: false) will be overwritten by our new value
                // It doesn't matter if we query for this or not since it will be overwritten
                ...selectionOutputParamsFragment,
                // By outputting this we ensure it survives the update (since we don't set it below)
                // If we didn't put this here, {selection: {isSelected: true}} would be the only thing
                // written to the updated userProject
                ...activityOutputParamsMixin
              }
            },
            {
              userState,
              userProject: R.merge(
                createUserProjectWithDefaults(
                  project
                ), {selection: {isSelected: true}}
              )
            }
          );
        }
      ),
      // Add the new project to the UserState
      mapToNamedPathAndInputs('userState', 'result.data.mutate.userState',
        ({apolloConfig, userState, project}) => {
          return userStateProjectMutationContainer(
            apolloConfig,
            {
              // We only need each project id back from userState.data.userProjects: [...]
              userProjectOutputParams: {
                project: {
                  id: 1,
                  region: {id: 1},
                  locations: {id: 1}
                },
                ...selectionOutputParamsFragment,
                ...activityOutputParamsMixin
              }
            },
            {
              userState,
              userProject: createUserProjectWithDefaults(
                project
              )
            }
          );
        }
      ),
      // Save another test project
      mapToNamedPathAndInputs('project', 'result.data.createProject.project',
        ({apolloConfig, userState}) => {
          return createSampleProjectContainer(apolloConfig,
            {locationsContainer: createSampleLocationsContainer},
            {
              key: projectKey,
              name: projectName,
              user: {id: reqStrPathThrowing('user.id', userState)}
            }
          );
        }
      ),
      // Remove all the projects from the user state
      // Resolve the user state
      mapToMergedResponseAndInputs(
        ({apolloConfig, existingItemResponses}) => {
          return deleteItemsOfExistingResponses(
            apolloConfig, {
              queryResponsePath: 'data.projects',
              forceDelete: true,
              mutationContainer: projectMutationContainer,
              responsePath: 'result.data.mutate.project',
              outputParams: {id: 1, deleted: 1}
            },
            {existingItemResponses}
          );
        }
      ),
      mapToNamedResponseAndInputs('existingItemResponses',
        ({apolloConfig, user}) => {
          return projectsQueryContainer(apolloConfig, {outputParams: {id: 1}}, {user: {id: user.id}});
        }
      ),
      // Resolve the user state
      mapToNamedPathAndInputs('userState', 'data.userStates.0',
        ({apolloConfig}) => {
          return currentUserStateQueryContainer(apolloConfig, {outputParams: userStateOutputParamsOnlyIds}, {});
        }
      ),
      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectsAndRegionsContainer(
          apolloConfig,
          {},
          {
            user: R.pick(['id'], user),
            regionKeys: ['earth'],
            projectKeys: ['shrangrila']
          });
      }),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        ({project, userState, undefinedUserProject}) => {
          expect(strPathOr(null, 'data.userProjects.1.project.id', userState)).toEqual(project.id);
          expect(R.propOr(false, 'skip', undefinedUserProject)).toBeTruthy();
        }
    }, errors, done));
  }, 100000);

  test('getPathOnResolvedUserProjectQuery', done => {
    const errors = [];
    composeWithChain([
      // Filter for projects where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Projects so we can filter by Project
      ({apolloConfig, userState, projects}) => {
        return getPathOnResolvedUserProjectAndQuery(
          apolloConfig, {
            getPath: 'userSearch.userSearchLocations.searchLocation',
            queryContainer: querySearchLocationsContainer
          },
          {userState, project: projects[0]}
        )
      },
      // Set the UserState, returns previous values and {userState, projects, projects}
      // where project and project are scope instances of userState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig, {forceDleete: true}, {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila', 'pangea'],
              searchLocationNames: ['search me', 'i am innocent'],
            });
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask()
        }
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expect(R.length(reqStrPathThrowing('data.searchLocations', response))).toEqual(2);
        }
    }, errors, done));
  }, 10000);
});