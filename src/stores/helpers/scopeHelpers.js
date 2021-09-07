/**
 * Created by Andy Likuski on 2019.01.21
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import moment from 'moment';
import T from 'folktale/concurrency/task/index.js';
import {e} from '@rescapes/apollo'

const {of} = T;
import {composeWithChain, reqPathThrowing, pathOr} from '@rescapes/ramda';
import {
  callMutationNTimesAndConcatResponses,
  composeWithComponentMaybeOrTaskChain,
  nameComponent
} from '@rescapes/apollo';

/**
 * Queries using the queryContainer and deletes using the mutateContainer with each result
 * of the queryContainer
 * @param {Object} apolloConfig Used only for the mutationContainer. The queryContainer must
 * already be seeded with this since query container arguments are more variable
 * @param {Object} config
 * @param {String} config.queryName Used to find the query response objects
 * @param {Function} config.queryContainer Called with props
 * @param {String} config.responsePath path to return from each mutation (e.g. 'result.data.mutate.project')
 * @param {Function} config.mutateContainer Called with apolloConfig, {} (empty dict), and each props for result of queryContainer
 * in {data: [queryName]: [...]}
 * @param props
 * @return {*}
 */
export const queryAndDeleteIfFoundContainer = (
  apolloConfig,
  {queryName, queryContainer, mutateContainer, responsePath},
  props
) => {
  return composeWithComponentMaybeOrTaskChain([
    response => {
      const objectsToDelete = pathOr(null, ['data', queryName], response);
      if (!objectsToDelete || R.any(response => !R.prop('data', response), objectsToDelete)) {
        return nameComponent('queryAndDeleteIfFoundContainer', e('div', {}, 'loading'))
      }
      return callMutationNTimesAndConcatResponses(
        apolloConfig,
        {
          items: objectsToDelete,
          mutationContainer: mutateContainer,
          responsePath,
          propVariationFunc: ({item, ...props}) => {
            return R.compose(
              // And the deleted datetime to now
              o => R.set(R.lensProp('deleted'), moment().toISOString(true), o),
              // Just pass the id
              o => R.pick(['id'], o)
            )(item);
          }
        },
        props
      );
    },
    props => {
      return queryContainer(props);
    }
  ])(props);
};

