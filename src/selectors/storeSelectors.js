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

import {settingsSelector} from './settingsSelectors';
import {activeUsersSelector} from './userSelectors';
import {createSelector, createStructuredSelector} from 'reselect';
import {onlyOneValueThrowing, reqPathThrowing, strPathOr} from 'rescape-ramda';
import * as R from 'ramda';

/**
 * Store here restores to a redux store. TODO replace redux with apollo-link-state
 */

/**
 * This selector creates a state that narrows down the state to the active user and their regions
 * Any ComponentContainer that must operate in the context of a single user and their regions can
 * use this selector.
 * Note that the regions are id stubs, not resolved (e.g. [{id: 'someRegion'}, ...])
 * @returns {Function} A reselect selector that is called with state and props and returns
 * an object containing settings, user, and regions
 */
export const makeActiveUserRegionsAndSettingsSelector = () => createSelector(
  [settingsSelector, R.compose(onlyOneValueThrowing, activeUsersSelector)],
  (settings, user) => ({
    settings,
    user,
    // Select user.regions, grab values if an obj, and select the one and only one value
    regions: R.compose(R.values, reqPathThrowing(['regions']))(user)
  })
);

/**
 * This selector creates a state that narrows down the state to the active user and their single selected region
 * Any ComponentContainer that must operate in the context of a single user and their region can use this selector
 * Note that the region is an id stub, not resolved (e.g. {id: 'someRegion'})
 * @returns {Function} A reselect selector that is called with state and props and returns
 * an object containing settings, user, and region
 */
export const makeActiveUserSelectedRegionAndSettingsSelector = () => createSelector(
  [settingsSelector, R.compose(onlyOneValueThrowing, activeUsersSelector)],
  (settings, user) => ({
    settings,
    user,
    // Select user.regions, grab values if an object, and select the one and only one value
    region: R.compose(onlyOneValueThrowing, R.values, reqPathThrowing(['regions']))(user)
  })
)

/**
 * Returns the active user and global settings. Used when regions are not a concern
 * @returns {Function} A reselect selector that is called with state and props and returns
 * an object containing settings and user
 */
export const makeActiveUserAndSettingsSelector = () =>
  createStructuredSelector({
    settings: settingsSelector,
    user: R.compose(onlyOneValueThrowing, activeUsersSelector),
    userState: strPathOr(null, 'userState.activeUserState', state)
  });