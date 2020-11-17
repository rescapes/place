/**
 * Created by Andy Likuski on 2019.09.16
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {strPathOr} from '@rescapes/ramda';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';


/**
 * Filters items by matching a search string to at least one the values of the specified propStrs.
 * For example if items have a {foo: {bar: [{guitar, mandolin}, {cello, mandocello}]}, train: {comin}}
 * and a propStrs are ['foo.bar.0', 'train.comin'] then those values will need to contain the searchString
 * @param {Object} options
 * @param {[String]} options.propStrs
 * @param {[String]} options.isCaseSenstive. Default false, if true check case
 * @param {[Object]} items Objects to search
 * @param {String} searchString Search string to search with
 * @returns {[Object]} The matching items
 */
export const createPropertiesFilter = v(R.curry(({propStrs, isCaseSensitive}, items, searchString) => {
  // Lower the search string unless case sesitive
  const loweredSearchString = R.unless(() => isCaseSensitive, s => R.toLower(s))(searchString);
  return R.filter(
    project => R.anyPass([
      // searchString is nil
      R.isNil,
      // Or it matches any of the given props
      ...R.map(
        prop => searchString => R.compose(
          value => R.contains(searchString, value),
          // Lower the prop value unless case sensitive
          value => R.unless(() => isCaseSensitive, v => R.toLower(v))(value),
          // Find the prop value
          prop => strPathOr('', prop, project)
        )(prop),
        propStrs
      )
    ])(loweredSearchString)
  )(items);
}), [
  ['options', PropTypes.shape({
    propStrs: PropTypes.arrayOf(PropTypes.string).isRequired,
    isCaseSensitive: PropTypes.bool
  }).isRequired],
  ['items', PropTypes.arrayOf(PropTypes.shape).isRequired],
  ['searchString', PropTypes.string.isRequired]
], 'createPropertiesFilter');
