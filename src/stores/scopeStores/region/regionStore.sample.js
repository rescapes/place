import {makeRegionMutationContainer, makeRegionsQueryContainer, regionOutputParams} from './regionStore';
import {
  composeWithChain,
  mapToNamedResponseAndInputs,
  mergeDeep,
  reqStrPathThrowing,
  traverseReduce
} from 'rescape-ramda';
import {fromPromised, of} from 'folktale/concurrency/task';
import moment from 'moment';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import * as R from 'ramda';
import {
  makeProjectMutationContainer,
  makeProjectsQueryContainer,
  projectOutputParams,
  queryAndDeleteIfFoundContainer
} from '../../..';

/**
 * Created by Andy Likuski on 2019.01.22
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


/**
 * Creates a sample region
 * @params apolloClient
 * @params {Object} props Optional overrides to defaults
 * @return {Object} {data: region: {...}}}
 */
export const createSampleRegionContainer = ({apolloClient}, props = {}) => {
  // Create the prop function and pass it sample props to return a Task
  return makeRegionMutationContainer(
    {apolloClient},
    {outputParams: regionOutputParams},
    mergeDeep({
        key: 'testPincherCreek',
        name: 'Test Pincher Creek',
        geojson: {
          'type': 'FeatureCollection',
          'features': [{
            "type": "Feature",
            "geometry": {
              "type": "Polygon",
              "coordinates": [[[49.54147, -114.17439], [49.42996, -114.17439], [49.42996, -113.72635], [49.54147, -113.72635], [49.54147, -114.174390]]]
            }
          }]
        },
        data: {
          locations: {
            params: {
              city: 'Pincher Creek',
              state: 'Alberta',
              country: 'Canada'
            }
          },
          mapbox: {
            viewport: {
              latitude: 49.54147,
              longitude: -114.17439,
              zoom: 7
            }
          }
        }
      },
      props)
  );
};

/**
 * Creates 10 regions for the given user
 * @param {Object} apolloConfig
 * @param {Object} props
 * @param {Object} props.user
 * @param {Number} props.user.id
 * @return Task resolving to a list of 10 regions
 */
export const createSampleRegionsContainer = v((apolloConfig, props) => {
  return composeWithChain([
    ({props}) => traverseReduce(
      (regions, region) => {
        return R.concat(regions, [reqStrPathThrowing('data.createRegion.region', region)]);
      },
      of([]),
      R.times(() => {
        return composeWithChain([
          () => {
            return createSampleRegionContainer(apolloConfig, {
                key: `test${moment().format('HH-mm-ss-SSS')}`
              }
            );
          },
          () => fromPromised(() => new Promise(r => setTimeout(r, 100)))()
        ])();
      }, 10)
    ),
    mapToNamedResponseAndInputs('deleted',
      ({props}) => {
        // Delete existing test regions for the test user
        return queryAndDeleteIfFoundContainer(
          {
            queryName: 'regions',
            queryContainer: makeRegionsQueryContainer(
              {apolloConfig},
              {outputParams: regionOutputParams}
            ),
            mutateContainer: makeRegionMutationContainer(apolloConfig, {})
          },
          {
            keyContains: 'test'
          }
        );
      }
    )
  ])({props});
}, [
  ['apolloConfig', PropTypes.shape({}).isRequired],
  ['props', PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.number.isRequired
    }).isRequired
  }).isRequired]
], 'createSampleRegionsContainer');