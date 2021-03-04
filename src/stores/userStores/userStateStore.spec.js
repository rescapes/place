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
  defaultRunConfig,
  mapMonadByConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  pickDeepPaths,
  reqStrPathThrowing
} from '@rescapes/ramda';
import {expectKeys, expectKeysAtPath} from '@rescapes/ramda';
import * as R from 'ramda';
import {
  adminUserStateQueryContainer,
  currentUserStateQueryContainer,
  userStateMutationContainer,
  userStateOutputParamsFull
} from './userStateStore.js';
import {mutateSampleUserStateWithProjectAndRegionTask} from './userStateStore.sample.js';
import {testAuthTask} from '../../helpers/testHelpers.js';
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';


describe('userStore', () => {
  test('currentUserQueryContainer', done => {
    const someUserKeys = ['id', 'email', 'username'];
    const errors = [];
    R.composeK(
      ({apolloClient}) => currentUserQueryContainer({apolloClient}, userOutputParams, {}),
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
        () => testAuthTask()
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
          return currentUserStateQueryContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull()},
            {}
          );
        }
      ),
      // Mutate the UserState to get cache-only data stored
      mapMonadByConfig({},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegionTask({
            apolloConfig,
            user,
            regionKey: 'earth',
            projectKey: 'shrangrila'
          });
        }
      ),
      mapMonadByConfig({name: 'user', strPath: 'data.currentUser'},
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapMonadByConfig({name: 'apolloConfig'},
        () => testAuthTask()
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
        return adminUserStateQueryContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFull()},
          {user: R.pick(['id'], user)}
        );
      },
      // Mutate the UserState to get cache-only data stored
      mapMonadByConfig({},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegionTask({
            apolloConfig,
            user,
            regionKey: 'earth',
            projectKey: 'shrangrila'
          });
        }
      ),
      mapMonadByConfig({name: 'user', strPath: 'data.currentUser'},
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapMonadByConfig({name: 'apolloConfig'},
        () => testAuthTask()
      )
    ])({}).run().listen(
      defaultRunConfig({
        onResolved: response => {
          expectKeysAtPath(someUserStateKeys, 'data.userStates.0', response);
        }
      }, errors, done)
    );
  }, 200000);

  test('userStateMutationContainer', done => {
    const errors = [];
    const someUserStateKeysWithCacheKeys = [
      'id',
      'data.userRegions.0.region.id',
      'data.userProjects.0.project.id',
      'data.userProjects.0.activity.isActive'
    ];

    composeWithChain([
      mapMonadByConfig({name: 'userStateSecond', strPath: 'data.userStates.0'},
        ({apolloConfig, mutatedUserStateSecond}) => {
          return adminUserStateQueryContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull()},
            {id: reqStrPathThrowing('id', mutatedUserStateSecond)}
          );
        }
      ),
      // Set it again. This will wipe out the previous region and project ids
      mapMonadByConfig({name: 'mutatedUserStateSecond', strPath: 'userState'},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegionTask({
            apolloConfig,
            user,
            regionKey: 'mars',
            projectKey: 'tharsisVolcanoes'
          });
        }
      ),
      mapMonadByConfig({name: 'userStateFirst', strPath: 'data.userStates.0'},
        ({apolloConfig, mutatedUserStateFirst}) => {
          return adminUserStateQueryContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull()},
            {id: reqStrPathThrowing('id', mutatedUserStateFirst)}
          );
        }
      ),
      // Mutate the UserState
      mapMonadByConfig({name: 'mutatedUserStateFirst', strPath: 'userState'},
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectAndRegionTask({
            apolloConfig,
            user,
            regionKey: 'earth',
            projectKey: 'shrangrila'
          });
        }
      ),
      mapMonadByConfig({name: 'user', strPath: 'data.currentUser'},
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapMonadByConfig({name: 'apolloConfig'},
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        ({userStateFirst, userStateSecond}) => {
          expectKeys(someUserStateKeysWithCacheKeys, userStateFirst);
          expectKeys(someUserStateKeysWithCacheKeys, userStateSecond);
        }
    }, errors, done));
  });

  test('userStateMutationWithCacheValuesContainer', done => {
    const errors = [];
    const someUserStateKeys = ['id', 'data.userRegions.0.region.id', 'data.userProjects.0.project.id'];

    composeWithChain([
      // Query again to make sure we get the cache-only data
      mapToNamedPathAndInputs('user', 'data.userStates.0',
        ({apolloConfig, userState}) => {
          return currentUserStateQueryContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull()},
            R.pick(['id'], userState)
          );
        }),
      mapToNamedPathAndInputs('user', 'result.data.updateUserState',
        // Update the UserState with some cache only values
        // We'll set the project's isSelected cache only property
        ({apolloConfig, userState}) => {
          const modifiedUserState = R.over(
            R.lensPath(['data', 'userProjects', 0, 'selection']),
            selection => {
              return R.merge(selection, {
                isSelected: true
              });
            },
            // Just include the id and the userProjects
            pickDeepPaths(['id', 'data.userProjects'], userState)
          );
          return userStateMutationContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull()},
            {userState: modifiedUserState}
          );
        }
      ),
      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectAndRegionTask({
          apolloConfig,
          user,
          regionKey: 'earth',
          projectKey: 'shrangrila'
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => currentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        ({userState}) => {
          expectKeys(someUserStateKeys, userState);
        }
    }, errors, done));
  }, 100000);
});

