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

const {of} = T;
import * as R from 'ramda';
import {
  deleteLocationsContainer,
  locationQueryVariationContainers,
  makeLocationMutationContainer
} from './locationStore.js';
import {
  composeWithChain,
  defaultRunConfig,
  expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing
} from '@rescapes/ramda';
import {createSampleLocationContainer, createSampleLocationsContainer} from './locationStore.sample.js';

const someLocationKeys = ['name', 'key', 'data'];

// These test REQUIRE an SOP server running at localhost:8004. See README.md
describe('locationStore', () => {

  test('queryLocationVariationsContainers', done => {
    expect.assertions(5);
    const task = composeWithChain([
      mapToNamedResponseAndInputs('locationsPagedAllMinimized',
        ({locations, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), locations)};
          // Returns all 10 with 2 queries of pageSize 5
          return reqStrPathThrowing('queryLocationsPaginatedAllMinimized', variations)(R.merge(props, {pageSize: 5}));
        }
      ),
      mapToNamedResponseAndInputs('locationsPagedAll',
        ({locations, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), locations)};
          // Returns all 10 with 2 queries of pageSize 5
          return reqStrPathThrowing('queryLocationsPaginatedAll', variations)(R.merge(props, {pageSize: 5}));
        }
      ),
      mapToNamedResponseAndInputs('locationsPaged',
        ({locations, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), locations)};
          // Returns 3 of the 10 locations on page 3
          return reqStrPathThrowing('queryLocationsPaginated', variations)(R.merge(props, {pageSize: 3, page: 2}));
        }
      ),
      mapToNamedResponseAndInputs('locationsMinimized',
        ({locations, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), locations)};
          return reqStrPathThrowing('queryLocationsMinimized', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('locationsFull',
        ({locations, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), locations)};
          return reqStrPathThrowing('queryLocations', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('variations',
        ({apolloConfig}) => {
          return of(locationQueryVariationContainers({apolloConfig, regionConfig: {}}));
        }
      ),
      mapToNamedResponseAndInputs('locations',
        ({apolloConfig, user}) => {
          return createSampleLocationsContainer(apolloConfig, {}, {});
        }
      ),
      mapToNamedResponseAndInputs('deleted',
        // Delete all locations
        ({apolloConfig}) => deleteLocationsContainer(apolloConfig, {}, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask();
        }
      )
    ])({});
    const errors = [];
    task.run().listen(defaultRunConfig({
      onResolved: ({locationsFull, locationsMinimized, locationsPaged, locationsPagedAll, locationsPagedAllMinimized}) => {
        expect(R.length(reqStrPathThrowing('data.locations', locationsFull))).toEqual(3);
        expect(R.length(reqStrPathThrowing('data.locations', locationsMinimized))).toEqual(3);
        expect(R.length(reqStrPathThrowing('data.locationsPaginated.objects', locationsPaged))).toEqual(3);
        expect(R.length(reqStrPathThrowing('data.locationsPaginated.objects', locationsPagedAll))).toEqual(3);
        expect(R.length(reqStrPathThrowing('data.locationsPaginated.objects', locationsPagedAllMinimized))).toEqual(3);
      }
    }, errors, done));
  }, 100000);


  test('makeLocationMutationContainer', done => {
    expect.assertions(1);
    const errors = [];
    const now = moment().format('MMMM Do YYYY, h:mm:ss');
    composeWithChain([
      mapToNamedPathAndInputs('location', 'data.createLocation.location',
        ({apolloConfig}) => createSampleLocationContainer(apolloConfig, {}, {key: `cool${now}`, name: `cool${now}`})
      ),
      mapToNamedResponseAndInputs('deleted',
        // Delete all locations
        ({apolloConfig}) => deleteLocationsContainer(apolloConfig, {}, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someLocationKeys, 'location', response);
        }
    }, errors, done));
  }, 100000);
});
