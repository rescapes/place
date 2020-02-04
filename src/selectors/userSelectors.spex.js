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

import {STATUS} from 'rescape-helpers'
import {activeUsersSelector, userResolvedRegionsSelector} from './userSelectors';
import {
  activeUserSelectedRegionSelector, activeUserValueSelector, userRegionsSelector,
  userSelectedRegionSelector
} from './userSelectors';

const {IS_ACTIVE, IS_SELECTED} = STATUS;

/*
describe('userSelectors', () => {
  const users = {
    blinky: {
      name: 'Blinky',
      [IS_ACTIVE]: true,
      regions: {
        pie: {
          id: 'pie',
          [IS_SELECTED]: true
        }
      }
    },
    pinky: {
      name: 'Pinky',
      regions: {
        pie: {
          id: 'pie',
          [IS_SELECTED]: true
        }
      }
    }
  };

  test('activeUsersSelector', () => {
    const state = {
      users: {
        yuk: {name: 'Yuk'},
        duk: {name: 'Duk', [IS_ACTIVE]: true}
      }
    };
    expect(activeUsersSelector(state)).toEqual({duk: {name: 'Duk', [IS_ACTIVE]: true}});
  });

  test('activeUsersSelector', () => {
    const state = {
      users: {
        yuk: {name: 'Yuk'},
        dum: {name: 'Duk', [IS_ACTIVE]: true}
      }
    };
    expect(activeUserValueSelector(state)).toEqual({name: 'Duk', [IS_ACTIVE]: true});
  });

  test('activeUserSelectedRegionSelector', () => {
    const state = {
      users
    };
    expect(activeUserSelectedRegionSelector(state)).toEqual({
      id: 'pie',
      [IS_SELECTED]: true
    });
  });

  test('userRegionsSelector', () => {
    const state = {users};
    expect(userRegionsSelector(state, {user: users.blinky})).toEqual([{
      id: 'pie',
      [IS_SELECTED]: true
    }]);
  });

  test('userSelectedRegionSelector', () => {
    const state = {users}
    const user = users.blinky
    expect(userSelectedRegionSelector(state, {user})).toEqual(
      {
        id: 'pie',
        [IS_SELECTED]: true
      }
    )
  })

  test('userResolvedRegionsSelector', () => {
    const user = {
      id: 'dum,',
      name: 'Duk',
      [IS_ACTIVE]: true,
      regions:
        [{id: 'a'}, {id: 'b'}]
    };
    const state = {
      regions: {
        a: {
          id: 'a',
          name: 'A'
        },
        b: {
          id: 'b',
          name: 'B'
        }
      }
    };
    expect(userResolvedRegionsSelector(state, {user})).toEqual(R.values(state.regions));
  });
});
 */