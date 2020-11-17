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
  userStateProjectMutationContainer,
  userStateProjectOutputParams,
  userStateProjectsQueryContainer
} from './userStateProjectStore';
import {
  composeWithChain,
  composeWithChainMDeep,
  defaultRunConfig,
  expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import * as R from 'ramda';
import {
  currentUserStateQueryContainer,
  deleteSampleUserStateScopeObjectsContainer,
  userStateOutputParamsOnlyIds
} from '../userStateStore';
import moment from 'moment';
import {
  createUserProjectWithDefaults,
  mutateSampleUserStateWithProjectAndRegionTask,
  mutateSampleUserStateWithProjectsAndRegionsContainer
} from '../userStateStore.sample';
import {testAuthTask} from '../../../helpers/testHelpers';
import {createSampleProjectContainer} from '../../scopeStores/project/projectStore.sample';
import {selectionOutputParamsFragment} from '../selectionStore';
import {activityOutputParamsFragment} from '../activityStore';
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';
import {projectOutputParamsMinimized} from '../../scopeStores/project/projectStore';
import {createSampleLocationsContainer} from '../../scopeStores/location/locationStore.sample';

describe('userProjectStore', () => {
  test('userProjectsQueryContainer', done => {
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    composeWithChainMDeep(1, [
      ({apolloConfig, user}) => {
        return userStateProjectsQueryContainer(
          {apolloConfig},
          {
            userProjectOutputParams: userStateProjectOutputParams(projectOutputParamsMinimized)
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
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectAndRegionTask({
          apolloConfig,
          user: R.pick(['id'], user),
          regionKey: 'earth',
          projectKey: 'shrangrila'
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => currentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userStates.0.data.userProjects.0.project', response);
          done();
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
        return userStateProjectsQueryContainer({apolloConfig}, {
          userProjectOutputParams: userStateProjectOutputParams(projectOutputParamsMinimized)
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
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectsAndRegionsContainer({
          apolloConfig,
          user: R.pick(['id'], user),
          regionKeys: ['earth'],
          projectKeys: ['shrangrila', 'pangea']
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
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
          {apolloConfig},
          {},
          {
            userState: {user: R.pick(['id'], user)},
            userProject: {project: {}}
          }
        );
      },
      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectAndRegionTask({
          apolloConfig,
          user: R.pick(['id'], user),
          regionKey: 'earth',
          projectKey: 'shrangrila'
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask;
        }
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userStates.0.data.userProjects.0.project', response);
          done();
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
              userProjectOutputParams: userStateProjectOutputParams()
            },
            {
              userState,
              userProject: null
            }
          );
        }
      ),
      // Modify the new project in the UserState
      mapToNamedPathAndInputs('userState', 'data.updateUserState.userState',
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
                ...activityOutputParamsFragment
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
      mapToNamedPathAndInputs('userState', 'data.updateUserState.userState',
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
                ...activityOutputParamsFragment
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
      mapToNamedPathAndInputs('project', 'data.createProject.project',
        ({apolloConfig, userState}) => {
          return createSampleProjectContainer({apolloConfig, createSampleLocationsContainer}, {
              key: projectKey,
              name: projectName,
              user: {id: reqStrPathThrowing('user.id', userState)}
            }
          );
        }
      ),
      // Remove all the projects from the user state
      // Resolve the user state
      mapToNamedPathAndInputs('userState', 'data.updateUserState.userState',
        ({apolloConfig, userState}) => {
          return deleteSampleUserStateScopeObjectsContainer(
            apolloConfig,
            userState,
            {
              project: {
                // Remove all projects
                keyContains: ''
              }
            }
          );
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
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectAndRegionTask({
          apolloConfig,
          user: R.pick(['id'], user),
          regionKey: 'earth',
          projectKey: 'shrangrila'
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        ({project, userState, undefinedUserProject}) => {
          expect(strPathOr(null, 'data.userProjects.0.project.id', userState)).toEqual(project.id);
          expect(R.propOr(false, 'skip', undefinedUserProject)).toBeTruthy();
          done();
        }
    }, errors, done));
  }, 100000);
});