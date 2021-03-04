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
  userStateRegionMutationContainer,
  userStateRegionOutputParams,
  userStateRegionsQueryContainer
} from './userStateRegionStore.js';
import {
  composeWithChainMDeep,
  defaultRunConfig,
  expectKeysAtPath,
  mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  strPathOr
} from '@rescapes/ramda';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import * as R from 'ramda';
import {
  currentUserStateQueryContainer,
  userStateMutationContainer,
  userStateMutateOutputParams,
  userStateOutputParamsOnlyIds
} from '../userStateStore.js';
import {
  createUserRegionWithDefaults,
  mutateSampleUserStateWithProjectAndRegionTask
} from '../userStateStore.sample.js';
import moment from 'moment';
import {createSampleRegionContainer} from '../../scopeStores/region/regionStore.sample.js';
import {currentUserQueryContainer, deleteItemsOfExistingResponses, userOutputParams} from '@rescapes/apollo';
import {regionOutputParamsMinimized} from '../../scopeStores/region/regionStore.js';

describe('userRegionStore', () => {
  test('userRegionsQueryContainer', done => {
    expect.assertions(1);
    const errors = [];
    const someRegionKeys = ['id'];
    R.composeK(
      // Get the authenticated user
      ({apolloConfig, user}) => {
        return userStateRegionsQueryContainer(
          apolloConfig,
          // default output params
          {},
          // props
          {
            userState: {user: R.pick(['id'], user)},
            // The sample user is already limited to certain user regions. We don't need to limit further
            userRegion: {}
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
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      // Authenticate
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask();
        }
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userStates.0.data.userRegions.0.region', response);
        }
    }, errors, done));
  });

  test('userRegionQueryTaskWithRegionFilter', done => {
    expect.assertions(1);
    const errors = [];
    const someRegionKeys = ['id'];
    composeWithChainMDeep(1, [
      // Filter for regions where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Regions so we can filter by Region
      ({apolloConfig, user}) => {
        return userStateRegionsQueryContainer(
          apolloConfig,
          {userRegionOutputParams: userStateRegionOutputParams(regionOutputParamsMinimized)},
          {
            userState: {user: R.pick(['id'], user)},
            userRegion: {region: {geojson: {type: 'FeatureCollection'}}}
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
          return testAuthTask();
        }
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userStates.0.data.userRegions.0.region', response);
        }
    }, errors, done));
  });

  test('makeActiveUserRegionQuery', done => {
    const errors = [];
    const someRegionKeys = ['id'];
    R.composeK(
      ({apolloConfig, user}) => {
        return userStateRegionsQueryContainer(
          apolloConfig,
          {},
          {
            userState: {
              user: R.pick(['id'], user)
            },
            userRegion: {}
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
        () => testAuthTask()
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userStates.0.data.userRegions.0.region', response);
        }
    }, errors, done));
  }, 1000000);

  test('userStateRegionMutationContainer', done => {
    const errors = [];
    const regionKey = `testRegionKey${moment().format('HH-mm-ss-SSS')}`;
    const regionName = `TestRegionName${moment().format('HH-mm-ss-SSS')}`;
    R.composeK(
      // Since this is a mutation, it's okay to not have a userRegion defined, but then we can't mutate
      mapToNamedResponseAndInputs('undefinedUserRegion',
        ({apolloConfig, userState, region}) => {
          // Add the new region to the UserState
          return userStateRegionMutationContainer(
            apolloConfig,
            {
              userRegionOutputParams: userStateRegionOutputParams()
            },
            {
              userState,
              userRegion: null
            }
          );
        }
      ),
      mapToNamedResponseAndInputs('userState',
        ({apolloConfig, userState, region}) => {
          // Add the new region to the UserState
          return userStateRegionMutationContainer(
            apolloConfig,
            {
              userRegionOutputParams: userStateRegionOutputParams()
            },
            {
              userState,
              userRegion: createUserRegionWithDefaults(
                region
              )
            }
          );
        }
      ),
      // Save another test region
      mapToNamedPathAndInputs('region', 'result.data.createRegion.region',
        ({apolloConfig}) => {
          return createSampleRegionContainer(apolloConfig, {
            key: regionKey,
            name: regionName
          });
        }
      ),
      // Remove all the regions from the user state
      // Resolve the user state
      mapToNamedPathAndInputs('userState', 'result.data.updateUserState.userState',
        ({apolloConfig, userState}) => {
          return userStateMutationContainer(
            apolloConfig,
            {outputParams: userStateMutateOutputParams},
            {userState: R.over(R.lensPath(['data', 'userRegions']), () => [], userState)}
          );
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
      mapToMergedResponseAndInputs(
        ({apolloConfig, userStateResponses}) => {
          return deleteItemsOfExistingResponses(
            apolloConfig, {
              queryResponsePath: 'data.userStates',
              forceDelete: true,
              mutationContainer: userStateMutationContainer,
              responsePath: 'result.data.mutate.userState',
              propVariationFuncForDeleted: ({item}) => {
                return {
                  userState: R.pick(['id'], item)
                };
              },
              outputParams: {id: 1, deleted: 1}
            },
            {existingItemResponses: userStateResponses}
          );
        }
      ),

      // Resolve the user state
      mapToNamedResponseAndInputs('userStateResponses',
        ({apolloConfig}) => {
          return currentUserStateQueryContainer(apolloConfig, {outputParams: userStateOutputParamsOnlyIds}, {});
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
    )({}).run().listen(defaultRunConfig({
      onResolved:
        ({region, userState, undefinedUserRegion}) => {
          expect(strPathOr(null, 'result.data.updateUserState.userState.data.userRegions.0.region.id', userState)).toEqual(region.id);
          expect(R.propOr(false, 'skip', undefinedUserRegion)).toBeTruthy();
          done();
        }
    }, errors, done));
  }, 100000);
});