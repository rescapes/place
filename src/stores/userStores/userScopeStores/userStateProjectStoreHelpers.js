/**
 * Created by Andy Likuski on 2018.12.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {projectOutputParams} from '../../scopeStores/project/projectStore.js';
import {selectionOutputParamsFragment} from '../selectionStore.js';
import {activityOutputParamsMixin} from '../activityStore.js';
import {createUserSearchOutputParams} from "./userSearchStore.js";

/***
 * Creates userStateProject output params.
 * @param {Object} [searchLocationOutputParams] Optional searchLocationOutputParams are passed to createUserSearchOutputParams
 * and the result of that call is assigned to userSearch
 * @param {Object} [explicitProjectOutputParams] Defaults to projectOutputParams
 * @param {Object} [additionalUserScopeOutputParams] Adds more outputParams to the userStateProject beyond
 * project, mapbox, and userSearch
 * @returns {*}
 */
export const userStateProjectOutputParams = (
  {
    searchLocationOutputParams = null,
    explicitProjectOutputParams = projectOutputParams,
    additionalUserScopeOutputParams = {}
  }) => {
  return R.mergeAll([
    {
      project: explicitProjectOutputParams,
      mapbox: {
        viewport: {
          latitude: 1,
          longitude: 1,
          zoom: 1
        }
      },
      ...searchLocationOutputParams ? {userSearch: createUserSearchOutputParams(searchLocationOutputParams)} : {},
      ...additionalUserScopeOutputParams
    },
    selectionOutputParamsFragment,
    activityOutputParamsMixin
  ])
};