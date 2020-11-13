import {makeLocationMutationContainer} from './locationStore';
import {composeWithChain, reqStrPathThrowing, traverseReduce} from 'rescape-ramda';
import * as R from 'ramda';
import T from 'folktale/concurrency/task';
const {fromPromised, of} = T
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {locationOutputParamsMinimized} from './locationOutputParams';

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
 * Creates a sample location
 * @params apolloClient
 * @params {Object} props Overrides the defaults. {user: {id}} is required
 * @params {Object} props.user
 * @params {Number} props.user.id Required
 * @return {Object} {data: location: {...}}
 */
export const createSampleLocationContainer = ({apolloClient}, props) => {
  return composeWithChain([
    props => {
      return makeLocationMutationContainer(
        {apolloClient},
        {outputParams: locationOutputParamsMinimized},
        R.merge(
          {
            "data": {
              "example": {
                "someData": true
              }
            }
          },
          props
        )
      );
    }
  ])(props);
};

/**
 * Creates 10 locations
 * TODO make these real world blocks so we can test intersection relationships
 * @param {Object} apolloConfig
 * @param {Object} requestConfig
 * @param {Number} [requestConfig.count] Default 10, the number of samples to create
 * @param {Object} props Provides consistent values for each location. Don't specify name and key because they're
 * generated dynamically for each location that is created. You don't need anything here except user.id
 * @param {Object} props.user
 * @param {Number} props.user.id Required user id for each location
 * @return Task resolving to a list of 10 locations
 */
export const createSampleLocationsContainer = v((apolloConfig, {count = 3}, props) => {
  return traverseReduce(
    (locations, location) => {
      return R.concat(locations, [reqStrPathThrowing('data.createLocation.location', location)]);
    },
    of([]),
    R.times(i => {
      return composeWithChain([
        () => {
          return createSampleLocationContainer(apolloConfig, R.merge({
              name: `Hillsborough${i} Rd`,
              key: `hillsborough${i}Rd`
            }, props || {})
          );
        },
        () => fromPromised(() => new Promise(r => setTimeout(r, 100)))()
      ])();
    }, count)
  );
}, [
  ['apolloConfig', PropTypes.shape({}).isRequired],
  ['requestConfig', PropTypes.shape({}).isRequired],
  ['props', PropTypes.shape({}).isRequired]
], 'createSampleLocationsContainer');