/**
 * Created by Andy Likuski on 2019.01.07
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  composeWithChainMDeep,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs, strPathOr
} from 'rescape-ramda';
import {
  localTestAuthTask,
  mutateUserStateWithProjectAndRegion
} from '../../helpers/testHelpers';
import {expectKeys, expectKeysAtPath} from 'rescape-helpers-test';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  makeCurrentUserQueryContainer,
  makeUserStateMutationContainer,
  makeAdminUserStateQueryContainer,
  userOutputParams,
  userStateOutputParamsFull, makeCurrentUserStateQueryContainer
} from './userStore';


describe('userStore', () => {
  test('makeUserQueryTask', done => {
    const someUserKeys = ['id', 'email', 'username'];
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
    }));
  });

  test('makeCurrentUserStateQueryContainer', done => {
    const errors = [];
    const someUserStateKeys = ['user.id', 'data'];
    R.composeK(
      mapToNamedResponseAndInputs('userStates',
        ({apolloConfig}) => {
          return makeCurrentUserStateQueryContainer(
            apolloConfig,
            {outputParams: userStateOutputParamsFull},
            null
          );
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
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
      ({apolloConfig, userId}) => {
        return makeAdminUserStateQueryContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFull},
          {user: {id: parseInt(userId)}}
        );
      },
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
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
    const someUserStateKeys = ['id', 'data.userRegions.0.region.id', 'data.userProjects.0.project.id'];

    R.composeK(
      // Set it again. This will wipe out the previous region and project ids
      ({apolloClient, user}) => mutateUserStateWithProjectAndRegion({
        apolloClient,
        user,
        regionKey: 'mars',
        projectKey: 'tharsisVolcanoes'
      }),
      // We user state structure should match what we expect
      ({apolloClient, user, userState}) => {
        expectKeys(someUserStateKeys, userState);
        return of({apolloClient, user});
      },
      // Set the UserState
      ({apolloClient, user}) => mutateUserStateWithProjectAndRegion({
        apolloClient,
        user,
        regionKey: 'earth',
        projectKey: 'shrangrila'
      }),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloClient}) => makeCurrentUserQueryContainer({apolloClient}, userOutputParams, {})
      ),
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
        () => localTestAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        ({userState}) => {
          expectKeys(someUserStateKeys, userState);
        }
    }, errors, done));
  });
});

