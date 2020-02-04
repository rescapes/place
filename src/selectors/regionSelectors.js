/**
 * Created by Andy Likuski on 2017.10.17
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * @fileoverview Deprecated
 */

import {mapped} from 'ramda-lens';
import {activeUsersSelector} from './userSelectors';
import * as R from 'ramda';
import {STATUS, status, makeInnerJoinByLensThenFilterSelector} from 'rescape-helpers';
import {reqPathThrowing, onlyOneValueThrowing, findOneValueByParamsThrowing} from 'rescape-ramda';

const {IS_SELECTED} = STATUS;

/**
 * Select all regions from the state
 * @type {function(*)}
 */
export const regionsSelector = state => state.regions;

/**
 * Select the region that matches the params
 * @param state
 * @param {Object} params Object of properties and value to match on
 */
export const regionSelector = (state, {params}) => {
  return findOneValueByParamsThrowing(params, reqPathThrowing(['regions'], state));
};

/**
 * Makes a selector to select the regions of the active users or whatever predicate is desired
 * @param predicate Predicate to apply to each region for filtering (e.g. filter for the active region)
 * @type {function(*=): function(*=): *}
 */
const makeActiveUserRegionsSelector = (predicate) => state =>
  R.compose(
    R.values,
    state => makeInnerJoinByLensThenFilterSelector(
      // Our inner join predicate
      R.eqProps('id'),
      // Filtering predicate to Look for regions in userSettings that pass the predicate
      predicate,
      // Look for the regions container in the state and userSettings
      R.lensProp('regions'),
      R.lensPath(['user', 'regions'])
    )(
      // The state
      state,
      // Props are the active user
      {user: onlyOneValueThrowing(activeUsersSelector(state))}
    )
  )(state);

export const activeUserRegionsSelector = makeActiveUserRegionsSelector(R.T);

/**
 * Creates a selector that selects regions that are associated with this user and currently selected by this user.
 * @param {Object} state The redux state
 * @returns {Array} The selected regions
 */
export const activeUserSelectedRegionsSelector = makeActiveUserRegionsSelector(status[IS_SELECTED]);


/**
 * Returns the region ids from a state
 * @type {*|Object}
 * @returns {Array|Object} A container of region id values
 */
export const regionIdsSelector = state =>
  R.compose(
    // Extract the id-only region objects
    R.view(R.lensProp('regions')),
    // Get a view of just the one expected regions with its id as a value
    R.view(R.compose(R.lensProp('regions'), mapped, R.lensProp('id')))
  )(state);
