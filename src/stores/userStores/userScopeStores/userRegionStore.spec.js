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

import {userRegionsQueryContainer, userStateOutputParamsCreator} from './userRegionStore';
import {
  composeWithChainMDeep,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs
} from 'rescape-ramda';
import {testAuthTask} from '../../../helpers/testHelpers';
import {expectKeysAtPath} from 'rescape-helpers-test';
import * as R from 'ramda';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStateStore';

describe('userRegionStore', () => {
  test('userRegionsQueryContainer', done => {
    expect.assertions(1);
    const errors = [];
    const someRegionKeys = ['id', 'key', 'name', 'data'];
    R.composeK(
      // Get the authenticated user
      ({apolloClient, userId}) => {
        return userRegionsQueryContainer(
          {apolloClient},
          {},
          {
            userState: {user: {id: userId}},
            // The sample user is already limited to certain regions. We don't need to limit further
            region: {}
          }
        );
      },
      // Get the authenticated user
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloClient}) => {
          return makeCurrentUserQueryContainer({apolloClient}, userOutputParams, {});
        }
      ),
      // Authenticate
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
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
      ({apolloConfig, userId}) => {
        return userRegionsQueryContainer(
          apolloConfig,
          {},
          {
            userState: {user: {id: parseInt(userId)}},
            region: {geojson: {type: 'FeatureCollection'}}
          }
        );
      },
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
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
    const someRegionKeys = ['id', 'key', 'name', 'data'];
    R.composeK(
      ({apolloConfig, userId}) => userRegionsQueryContainer(
        apolloConfig,
        {},
        {userState: {user: {id: parseInt(userId)}}, region: {}}
      ),
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloConfig}) => makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.userRegions.0.region', response);
          done();
        }
    }));
  });
});