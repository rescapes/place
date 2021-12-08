/**
 * Created by Andy Likuski on 2018.04.23
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import moment from 'moment';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import T from 'folktale/concurrency/task/index.js';
import * as R from 'ramda';
import {
  deleteSearchLocationsContainer,
  makeSearchLocationMutationContainer,
  querySearchLocationsContainer
} from './searchLocationStore.js';
import {
  composeWithChain,
  defaultRunConfig,
  expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing
} from '@rescapes/ramda';
import {
  createSampleSearchLocationContainer,
  createSampleSearchLocationsContainer
} from './searchLocationStore.sample.js';

const {of} = T;

const someSearchLocationKeys = ['name', 'street'];

// These test REQUIRE an SOP server running at 127.0.0.1:8004. See README.md
describe('searchLocationStore', () => {

  test('querySearchLocations', done => {
    expect.assertions(1);
    const task = composeWithChain([
      mapToNamedResponseAndInputs('searchLocationsResponse',
        ({apolloConfig, searchLocations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), searchLocations)};
          return querySearchLocationsContainer(
            apolloConfig,
            {},
            props
          );
        }
      ),
      mapToNamedResponseAndInputs('searchLocations',
        ({apolloConfig, user}) => {
          return createSampleSearchLocationsContainer(apolloConfig, {}, {});
        }
      ),
      mapToNamedResponseAndInputs('deleted',
        // Delete all searchLocations
        ({apolloConfig}) => {
          return deleteSearchLocationsContainer(apolloConfig, {

          }, {
            nameContains: 'hillsborough'
          });
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask();
        }
      )
    ])({});
    const errors = [];
    task.run().listen(defaultRunConfig({
      onResolved: ({
                     searchLocationsResponse,
                   }) => {
        expect(R.length(reqStrPathThrowing('data.searchLocations', searchLocationsResponse))).toEqual(3);
      }
    }, errors, done));
  }, 1000000);


  test('makeSearchLocationMutationContainer', done => {
    expect.assertions(1);
    const errors = [];
    const now = moment().format('MMMM Do YYYY, h:mm:ss');
    composeWithChain([
      mapToNamedPathAndInputs('searchLocation', 'result.data.createSearchLocation.searchLocation',
        ({apolloConfig}) => createSampleSearchLocationContainer(apolloConfig, {}, {
          name: `cool${now}`,
          street: {name: 'Andthegang St'}
        })
      ),
      mapToNamedResponseAndInputs('deleted',
        // Delete all searchLocations
        ({apolloConfig}) => {
          return deleteSearchLocationsContainer(apolloConfig, {}, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someSearchLocationKeys, 'searchLocation', response);
        }
    }, errors, done));
  }, 100000);
});
