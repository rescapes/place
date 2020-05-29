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
  userRegionsQueryContainer,
  userStateOutputParamsCreator,
  userStateRegionMutationContainer
} from './userRegionStore';
import {
  capitalize,
  composeWithChainMDeep,
  defaultRunConfig,
  expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  strPathOr
} from 'rescape-ramda';
import {testAuthTask} from '../../../helpers/testHelpers';
import * as R from 'ramda';
import {
  makeCurrentUserQueryContainer,
  makeCurrentUserStateQueryContainer,
  makeUserStateMutationContainer,
  userOutputParams,
  userStateMutateOutputParams,
  userStateOutputParamsOnlyIds
} from '../userStateStore';
import {createUserRegionWithDefaults, mutateSampleUserStateWithProjectAndRegionTask} from '../userStateStore.sample';
import {userStateProjectMutationContainer} from './userProjectStore';
import {makeRegionMutationContainer, regionOutputParams} from '../../scopeStores/region/regionStore';
import moment from 'moment';
import {createSampleRegionContainer} from '../../..';

describe('userRegionStore', () => {
  test('userRegionsQueryContainer', done => {
    expect.assertions(1);
    const errors = [];
    const someRegionKeys = ['id', 'key', 'name', 'data'];
    R.composeK(
      // Get the authenticated user
      ({apolloConfig, user}) => {
        return userRegionsQueryContainer(
          apolloConfig,
          {},
          {
            userState: {user: R.pick(['id'], user)},
            // The sample user is already limited to certain regions. We don't need to limit further
            region: {}
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
      // Get the authenticated user
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      // Authenticate
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask;
        }
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userRegions.0.region', response);
        }
    }, errors, done));
  });

  test('makeUserRegionQueryTaskWithRegionFilter', done => {
    expect.assertions(1);
    const errors = [];
    const someRegionKeys = ['id', 'key', 'name', 'data'];
    composeWithChainMDeep(1, [
      // Filter for regions where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Regions so we can filter by Region
      ({apolloConfig, user}) => {
        return userRegionsQueryContainer(
          apolloConfig,
          {},
          {
            userState: {user: R.pick(['id'], user)},
            region: {geojson: {type: 'FeatureCollection'}}
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
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask;
        }
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userRegions.0.region', response);
        }
    }, errors, done));
  });

  test('makeActiveUserRegionQuery', done => {
    const errors = [];
    const someRegionKeys = ['id', 'key', 'name', 'data'];
    R.composeK(
      ({apolloConfig, user}) => {
        return userRegionsQueryContainer(
          apolloConfig,
          {},
          {
            userState: {
              user: R.pick(['id'], user)
            },
            scope: {}
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
        ({apolloConfig}) => makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userRegions.0.region', response);
        }
    }, errors, done));
  }, 1000000);

  test('userStateRegiontMutationContainer', done => {
    const errors = [];
    const regionKey = `testRegionKey${moment().format('HH-mm-SS')}`;
    const regionName = `TestRegionName${moment().format('HH-mm-SS')}`;
    R.composeK(
      mapToNamedResponseAndInputs('userState',
        ({apolloConfig, userState, region}) => {
          // Add the new region to the UserState
          return userStateRegionMutationContainer(
            apolloConfig,
            {
              // We only need each region id back from userState.data.userRegions: [...]
              outputParams: {id: 1}
            },
            {
              userState,
              scope: createUserRegionWithDefaults(
                region
              )
            }
          );
        }
      ),
      // Save another test region
      mapToNamedPathAndInputs('region', 'data.createRegion.region',
        ({apolloConfig}) => {
          return createSampleRegionContainer(apolloConfig, {
            key: regionKey,
            name: regionName
          })
        }
      ),
      // Remove all the regions from the user state
      // Resolve the user state
      mapToNamedPathAndInputs('userState', 'data.updateUserState.userState',
        ({apolloConfig, userState}) => {
          return makeUserStateMutationContainer(
            apolloConfig,
            {outputParams: userStateMutateOutputParams},
            R.over(R.lensPath(['data', 'userRegions']), () => [], userState)
          );
        }
      ),
      // Resolve the user state
      mapToNamedPathAndInputs('userState', 'data.userStates.0',
        ({apolloConfig}) => {
          return makeCurrentUserStateQueryContainer(apolloConfig, {outputParams: userStateOutputParamsOnlyIds}, {});
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
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        ({region, userState}) => {
          expect(strPathOr(null, 'data.updateUserState.userState.data.userRegions.0.region.id', userState)).toEqual(region.id);
          done();
        }
    }, errors, done));
  }, 100000);
});