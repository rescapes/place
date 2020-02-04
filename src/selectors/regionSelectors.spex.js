/**
 * Created by Andy Likuski on 2017.10.17
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {STATUS} from 'rescape-helpers';
import {
  activeUserSelectedRegionsSelector, activeUserRegionsSelector,
  regionsSelector, regionIdsSelector
} from './regionSelectors';
import {mergeDeep, onlyOneValueThrowing} from 'rescape-ramda';

const {IS_ACTIVE, IS_SELECTED} = STATUS;

/*
describe('regionSelectors', () => {

  test('regionsSelector', () => {
    const state = {
      regions: {
        foo: {id: 'foo'},
        boo: {id: 'boo'}
      }
    };
    const expected = state.regions;
    expect(regionsSelector(state)).toEqual(expected);
  });

  test('activeUserRegionsSelector', () => {
    const state = {
      regions: {
        foo: {id: 'foo', name: 'Foo'},
        boo: {id: 'boo', name: 'Boo'}
      },
      users: {
        blinky: {
          [IS_ACTIVE]: true,
          regions: {foo: {id: 'foo'}, boo: {id: 'boo', [IS_SELECTED]: true}}
        },
        pinky: {}
      }
    };
    // only the selected region of the active user should be selected
    const expected = R.values(mergeDeep(state.users.blinky.regions, state.regions));
    expect(activeUserRegionsSelector(state)).toEqual(expected);
  });


  test('activeUserSelectedRegionsSelector', () => {
    const state = {
      regions: {
        foo: {},
        boo: {id: 'boo'}
      },
      users: {
        blinky: {
          [IS_ACTIVE]: true,
          regions: {foo: {id: 'foo'}, boo: {id: 'boo', [IS_SELECTED]: true}}
        },
        pinky: {}
      }
    };
    // only the selected region of the active user should be selected
    const expected = [{
      id: 'boo',
      [IS_SELECTED]: true
    }];
    expect(activeUserSelectedRegionsSelector(state)).toEqual(expected);
  });

  test('regionIdsSelector', () => {
    const state = {
      regions: {
        'oakland': {id: 'oakland', name: 'Oakland'}
      }
    };
    expect(onlyOneValueThrowing(regionIdsSelector(state))).toEqual('oakland');
  });
})
;
 */