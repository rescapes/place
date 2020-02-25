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
import {defaultRunConfig, mapToNamedPathAndInputs, reqStrPathThrowing} from 'rescape-ramda';
import {localTestAuthTask} from '../../helpers/testHelpers';
import {expectKeysAtPath} from 'rescape-helpers-test'
import * as R from 'ramda';
import {makeRegionMutationContainer, makeRegionsQueryContainer, regionOutputParams} from './regionStore';
import {createSampleRegionContainer} from './regionStore.sample';

const someRegionKeys = ['id', 'key', 'geojson', 'data'];
describe('regionStore', () => {
  test('makeRegionMutationContainer', done => {
    expect.assertions(1);
    const errors = [];
    R.composeK(
      mapToNamedPathAndInputs('region', 'data.createRegion.region',
        ({apolloClient}) => createSampleRegionContainer({apolloClient})
      ),
      () => localTestAuthTask
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'region', response);
        }
    }, errors, done));
  });

  test('makeRegionsQueryContainer', done => {
    const errors = [];
    R.composeK(
      ({apolloClient, region}) => makeRegionsQueryContainer(
        {apolloClient},
        {outputParams: regionOutputParams},
        {key: reqStrPathThrowing('key', region)}
      ),
      mapToNamedPathAndInputs('region', 'data.createRegion.region',
        ({apolloClient}) => createSampleRegionContainer({apolloClient})
      ),
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
        () => localTestAuthTask
      )
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someRegionKeys, 'data.regions.0', response);
        }
    }, errors, done));
  });
});