/**
 * Created by Andy Likuski on 2019.01.07
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  composeWithChain,
  composeWithChainMDeep,
  defaultRunConfig, mapMonadByConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  pickDeepPaths
} from 'rescape-ramda';
import {localTestAuthTask} from '../../helpers/testHelpers';
import {expectKeys, expectKeysAtPath} from 'rescape-helpers-test';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  makeAdminUserStateQueryContainer,
  makeCurrentUserQueryContainer,
  makeCurrentUserStateQueryContainer,
  makeUserStateMutationContainer,
  makeUserStateMutationWithClientDirective,
  userOutputParams,
  userStateOutputParamsFull
} from './userStateStore';
import {mutateSampleUserStateWithProjectAndRegion} from './userStateStore.sample';


describe('userStore', () => {
  test('makeUserQueryTask', done => {
    const someUserKeys = ['id', 'email', 'username'];
    const errors = [];
    R.composeK(
      ({apolloClient}) => makeCurrentUserQueryContainer({apolloClient}, userOutputParams, {}),
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
        () => localTestAuthTask
      )
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someUserKeys, 'data.currentUser', response);
          done();
        }
    }, errors, done));
  });

  test('makeCurrentUserStateQueryContainer', done => {
    const errors = [];
    const someUserStateKeys = ['user.id', 'data'];
    R.composeK(
      mapMonadByConfig({name: 'userStates'},
        ({apolloConfig}) => {
          return makeCurrentUserStateQueryContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull},
            null
          );
        }
      ),
      // Mutate the UserState to get cache-only data stored
      mapMonadByConfig({},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegion({
            apolloConfig,
            user,
            regionKey: 'earth',
            projectKey: 'shrangrila'
          });
        }
      ),
      mapMonadByConfig({name: 'user', strPath: 'data.currentUser'},
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapMonadByConfig({name: 'apolloConfig'},
        () => localTestAuthTask
      )
    )({}).run().listen(
      defaultRunConfig({
        onResolved: ({userStates}) => {
          expectKeysAtPath(someUserStateKeys, 'data.userStates.0', userStates);
        }
      }, errors, done)
    );
  }, 2000090);

  test('makeAdminUserStateQueryContainer', done => {
    const errors = [];
    const someUserStateKeys = ['user.id', 'data.userRegions.0.region.id'];
    composeWithChainMDeep(1, [
      ({apolloConfig, user}) => {
        return makeAdminUserStateQueryContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFull},
          {user}
        );
      },
      // Mutate the UserState to get cache-only data stored
      mapMonadByConfig({},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegion({
            apolloConfig,
            user,
            regionKey: 'earth',
            projectKey: 'shrangrila'
          });
        }
      ),
      mapMonadByConfig({name: 'user', strPath: 'data.currentUser'},
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapMonadByConfig({name: 'apolloConfig'},
        () => localTestAuthTask
      )
    ])({}).run().listen(
      defaultRunConfig({
        onResolved: response => {
          expectKeysAtPath(someUserStateKeys, 'data.userStates.0', response);
        }
      }, errors, done)
    );
  });

  test('makeUserStateMutationContainer', done => {
    const errors = [];
    const someUserStateKeysWithCacheKeys = [
      'id',
      'data.userRegions.0.region.id',
      'data.userProjects.0.project.id',
      'data.userProjects.0.selection.isSelected'
    ];

    composeWithChain([
      // Set it again. This will wipe out the previous region and project ids
      mapMonadByConfig({name: 'mutatedUserStateSecond', strPath: 'userState'},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegion({
            apolloConfig,
            user,
            regionKey: 'mars',
            projectKey: 'tharsisVolcanoes'
          });
        }
      ),
      // Mutate the UserState
      mapMonadByConfig({name: 'mutatedUserStateFirst', strPath: 'userState'},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegion({
            apolloConfig,
            user,
            regionKey: 'earth',
            projectKey: 'shrangrila'
          });
        }
      ),
      mapMonadByConfig({name:'user', paths: 'data.currentUser'},
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapMonadByConfig({name: 'apolloConfig'},
        () => localTestAuthTask
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        ({mutatedUserStateFirst, mutatedUserStateSecond}) => {
          expectKeys(someUserStateKeysWithCacheKeys, mutatedUserStateFirst);
          expectKeys(someUserStateKeysWithCacheKeys, mutatedUserStateSecond);
        }
    }, errors, done));
  });

  test('makeUserStateMutationWithCacheValuesContainer', done => {
    const errors = [];
    const someUserStateKeys = ['id', 'data.userRegions.0.region.id', 'data.userProjects.0.project.id'];

    composeWithChain([
      // Query again to make sure we get the cache-only data
      ({apolloConfig, userState}) => {
        return makeCurrentUserStateQueryContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFull},
          R.pick(['id'], userState)
        );
      },
      mapToNamedPathAndInputs('user', 'data.updateUserState',
        // Update the UserState with some cache only values
        // We'll set the project's isSelected cache only property
        ({apolloConfig, userState}) => {
          const props = R.over(
            R.lensPath(['data', 'userProjects', 0, 'selection']),
            selection => R.merge(selection, {
              isSelected: true
            }),
            // Just include the id and the userProjects
            pickDeepPaths(['id', 'data.userProjects'], userState)
          );
          return makeUserStateMutationContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull},
            props
          );
        }
      ),

      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectAndRegion({
          apolloConfig,
          user,
          regionKey: 'earth',
          projectKey: 'shrangrila'
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => localTestAuthTask
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        ({userState}) => {
          expectKeys(someUserStateKeys, userState);
        }
    }, errors, done));
  }, 100000);

  test('makeUserStateMutationWithClientDirective', done => {
    const errors = [];
    const someUserStateKeys = ['id', 'data.userProjects.0.project.id', 'data.userProjects.0.selection.isSelected'];

    composeWithChain([
      ({apolloConfig}) => {
        return of(makeUserStateMutationWithClientDirective(
          apolloConfig,
          {outputParams: userStateOutputParamsFull},
          {
            id: 3,
            user: {
              id: 1,
              __typename: 'UserType'
            },
            data: {
              userRegions: [
                {
                  region: {
                    id: 1267
                  },
                  mapbox: {
                    viewport: {
                      latitude: 49.54147,
                      longitude: -114.17439,
                      zoom: 8
                    }
                  }
                }
              ],
              userProjects: [
                {
                  project: {
                    "id": 2107,
                    "__typename": "ProjectType"
                  },
                  mapbox: {
                    viewport: {
                      latitude: 49.54147,
                      longitude: -114.17439,
                      zoom: 8
                    }
                  },
                  selection: {
                    isSelected: true
                  }
                }
              ],
              __typename: 'UserStateDataType'
            },
            __typename: 'UserStateType'
          }
        ));
      },
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return localTestAuthTask;
        }
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        userState => {
          expectKeys(someUserStateKeys, userState);
        }
    }, errors, done));
  });
});

