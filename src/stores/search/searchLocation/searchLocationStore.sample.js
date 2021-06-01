import {makeSearchLocationMutationContainer, querySearchLocationsContainer} from './searchLocationStore.js';
import {reqStrPathThrowing} from '@rescapes/ramda';
import * as R from 'ramda';
import T from 'folktale/concurrency/task/index.js';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {
  defaultSearchLocationOutputParams,
  defaultSearchLocationOutputParamsMinimized
} from './defaultSearchLocationOutputParams.js';
import {callMutationNTimesAndConcatResponses} from '@rescapes/apollo';

const {fromPromised, of} = T;

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
 * Creates a sample searchLocation
 * @params apolloClient
 * @params {Object} props Overrides the defaults. {user: {id}} is required
 * @params {Object} props.user
 * @params {Number} props.user.id Required
 * @return {Object} {data: searchLocation: {...}}
 */
export const createSampleSearchLocationContainer = ({apolloClient}, {outputParams= defaultSearchLocationOutputParams}, props) => {
  return makeSearchLocationMutationContainer(
    {apolloClient},
    {outputParams},
    props
  );
};

/**
 * CRUD sample searchLocations
 * TODO make these real world blocks so we can test intersection relationships
 * @param {Object} apolloConfig
 * @param {Object} requestConfig
 * @param {Number} [requestConfig.count] Default 10, the number of samples to create
 * @param {Object} props Provides consistent values for each searchLocation. Don't specify name and key because they're
 * generated dynamically for each searchLocation that is created. You don't need anything here except user.id
 * @param {Object} props.user
 * @param {Number} props.user.id Required user id for each searchLocation
 * @return Task resolving to a list of 10 searchLocations
 */
export const createSampleSearchLocationsContainer = v((apolloConfig, {forceDelete = true, count = 3}, props) => {
  return callMutationNTimesAndConcatResponses(
    apolloConfig,
    {
      forceDelete,

      existingMatchingProps: {nameContains: 'CrazyHillsboroughSearch'},
      existingItemMatch: (item, existingItemsResponses) => R.find(
        existingItem => R.propEq('name', item, existingItem),
        existingItemsResponses
      ),
      queryForExistingContainer: querySearchLocationsContainer,
      queryResponsePath: 'data.searchLocations',

      count,
      mutationContainer: createSampleSearchLocationContainer,
      responsePath: 'result.data.mutate.searchLocation',
      propVariationFunc: props => {
        const item = reqStrPathThrowing('item', props);
        return R.merge({
          name: `CrazyHillsboroughSearch${item}`,
        }, props || {});
      }
    },
    props
  );
}, [
  ['apolloConfig', PropTypes.shape({}).isRequired],
  ['options', PropTypes.shape({}).isRequired],
  ['props', PropTypes.shape({}).isRequired]
], 'createSampleSearchLocationsContainer');
