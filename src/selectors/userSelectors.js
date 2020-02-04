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

import * as R from 'ramda';
import {findOneThrowing, reqPathThrowing, onlyOneValueThrowing, findOneValueByParamsThrowing} from 'rescape-ramda';
import {STATUS, status} from 'rescape-helpers';
import {createSelector} from 'reselect';

/**
 * Simply resolves the user's regions, which are just ids and status flags, not full regions
 * @param state
 * @param user
 * @returns {Array} The list of region identifier objects
 */
export const userRegionsSelector = (state, {user}) => {
  return R.values(reqPathThrowing(['regions'], user));
};

/**
 * Map the region ids of the user to full regions when the latter are loaded in the state
 * @param {Object} state The redux state
 * @param {Object} user The User that has regions
 * @returns {Array} The list of full regions
 */
export const userResolvedRegionsSelector = (state, {user}) => {
  return R.map(
    userRegion => R.find(R.propEq('id', userRegion.id))(R.values(state.regions)),
    userRegionsSelector(state, {user})
  );
};

/**
 * Returns all users in the state
 * @param state
 * @returns {Object|Array} The container of users
 */
export const usersSelector = reqPathThrowing(['users']);

/**
 * Select the user that matches the params
 * @param state
 * @param {Object} params Object of properties and value to match on
 */
export const userSelector = (state, {params}) => {
  return findOneValueByParamsThrowing(params, reqPathThrowing(['users'], state));
};

/**
 * Returns the active users in a container by searching state.users for the one and only one isActive property
 * that is true. This only expects one and only one active user
 * @param state
 * @returns {Object|Array} The active user as one key object or single item array
 */
export const activeUsersSelector = state => {
  return findOneThrowing(
    status[STATUS.IS_ACTIVE],
    reqPathThrowing(['users'], state)
  );
};

/**
 * Returns the value of the only active user
 * @param state
 */
export const activeUserValueSelector = createSelector(
  [activeUsersSelector],
  onlyOneValueThrowing
);

/**
 * Selects the selected region of the active user. This is not the resolved region, rather the identifier object
 * @param state
 */
export const activeUserSelectedRegionSelector = state => createSelector(
  [R.compose(onlyOneValueThrowing, activeUsersSelector)],
  user => userSelectedRegionSelector(state, {user})
)(state);

/**
 * Returns the selected region of the given user
 * @param state
 * @param user
 */
export const userSelectedRegionSelector = (state, {user}) =>
  findOneValueByParamsThrowing(
    {[STATUS.IS_SELECTED]: true},
    userRegionsSelector(state, {user})
  );