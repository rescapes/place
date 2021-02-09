import {makeLocationMutationContainer} from './locationStore.js';
import {composeWithChain, reqStrPathThrowing, traverseReduce} from '@rescapes/ramda';
import * as R from 'ramda';
import T from 'folktale/concurrency/task/index.js';

const {fromPromised, of} = T;
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {locationOutputParamsMinimized} from './locationOutputParams.js';
import {callMutationNTimesAndConcatResponses, composeWithComponentMaybeOrTaskChain} from '@rescapes/apollo';

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
export const createSampleLocationContainer = ({apolloClient}, {}, props) => {
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
  return callMutationNTimesAndConcatResponses(
    apolloConfig,
    {
      count,
      mutationContainer: createSampleLocationContainer,
      responsePath: 'result.data.mutate.location',
      propVariationFunc: props => {
        const item = reqStrPathThrowing('item', props);
        return R.merge({
          name: `Hillsborough${item} Rd`,
          key: `hillsborough${item}Rd`
        }, props || {});
      }
    },
    props
  );
}, [
  ['apolloConfig', PropTypes.shape({}).isRequired],
  ['requestConfig', PropTypes.shape({}).isRequired],
  ['props', PropTypes.shape({}).isRequired]
], 'createSampleLocationsContainer');