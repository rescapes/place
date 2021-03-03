/**
 * Created by Andy Likuski on 2019.01.15
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {
  composeWithChain,
  defaultRunConfig,
  expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing, strPathOr
} from '@rescapes/ramda';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import * as R from 'ramda';
import {
  makeRegionMutationContainer,
  makeRegionsQueryContainer,
  regionOutputParams,
  regionQueryVariationContainers
} from './regionStore.js';
import {createSampleRegionContainer, createSampleRegionsContainer} from './regionStore.sample.js';
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';
import T from 'folktale/concurrency/task/index.js';
const {of} = T

const someRegionKeys = ['id', 'key', 'geojson', 'data'];
describe('regionStore', () => {
  test('makeRegionMutationContainer', done => {
    expect.assertions(1);
    const errors = [];
    R.composeK(
      mapToNamedPathAndInputs('region', 'result.data.createRegion.region',
        ({apolloClient}) => createSampleRegionContainer({apolloClient}, {}, {})
      ),
      () => testAuthTask()
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'region', response);
        }
    }, errors, done));
  }, 100000);

  test('makeRegionsQueryContainer', done => {
    const errors = [];
    R.composeK(
      ({apolloConfig, region}) => makeRegionsQueryContainer(
        {apolloConfig},
        {outputParams: regionOutputParams},
        {key: reqStrPathThrowing('key', region)}
      ),
      mapToNamedPathAndInputs('region', 'result.data.createRegion.region',
        ({apolloConfig}) => createSampleRegionContainer(apolloConfig, {}, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.regions.0', response);
        }
    }, errors, done));
  });

  test('queryRegionVariationsContainers', done => {
    expect.assertions(4);
    const task = composeWithChain([
      mapToNamedResponseAndInputs('regionsPagedAll',
        ({regionResponses, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), regionResponses)};
          // Returns all 10 with 2 queries of pageSize 5
          return reqStrPathThrowing('queryRegionsPaginatedAll', variations)(R.merge(props, {pageSize: 5}));
        }
      ),
      mapToNamedResponseAndInputs('regionsPaged',
        ({regionResponses, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), regionResponses)};
          // Returns 3 of the 10 regions on page 3
          return reqStrPathThrowing('queryRegionsPaginated', variations)(R.merge(props, {pageSize: 3, page: 2}));
        }
      ),
      mapToNamedResponseAndInputs('regionsMinimized',
        ({regionResponses, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), regionResponses)};
          return reqStrPathThrowing('queryRegionsMinimized', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('regionsFull',
        ({regionResponses, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), regionResponses)};
          return reqStrPathThrowing('queryRegions', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('variations',
        ({apolloConfig}) => {
          return of(regionQueryVariationContainers(apolloConfig));
        }
      ),
      mapToNamedResponseAndInputs('regionResponses',
        ({apolloConfig, user}) => {
          return createSampleRegionsContainer(apolloConfig, {user});
        }
      ),
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
    ])({});
    const errors = [];
    task.run().listen(defaultRunConfig({
      onResolved: ({regionsFull, regionsMinimized, regionsPaged, regionsPagedAll}) => {
        expect(R.length(reqStrPathThrowing('data.regions', regionsFull))).toEqual(10);
        expect(R.length(reqStrPathThrowing('data.regions', regionsMinimized))).toEqual(10);
        expect(R.length(reqStrPathThrowing('data.regionsPaginated.objects', regionsPaged))).toEqual(3);
        expect(R.length(reqStrPathThrowing('data.regionsPaginated.objects', regionsPagedAll))).toEqual(10);
      }
    }, errors, done));
  }, 100000);

});