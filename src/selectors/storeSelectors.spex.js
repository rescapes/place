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

import {STATUS} from 'rescape-helpers'
import {makeActiveUserRegionsAndSettingsSelector} from './storeSelectors';
import {
  makeActiveUserAndSettingsSelector,
  makeActiveUserSelectedRegionAndSettingsSelector
} from './storeSelectors';

const {IS_SELECTED, IS_ACTIVE} = STATUS;

/*
describe('storeSelectors', () => {
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
  test('makeActiveUserRegionsAndSettingsSelector', () => {
    expect(
      makeActiveUserRegionsAndSettingsSelector()({
        settings: 'dessert',
        users
      })
    ).toEqual(
      {
        settings: 'dessert',
        regions: [
          {
            id: 'pie',
            [IS_SELECTED]: true
          }
        ],
        user: users.blinky
      }
    );
  });
  test('makeActiveUserSelectedRegionAndSettingsSelector', () => {
    expect(
      makeActiveUserSelectedRegionAndSettingsSelector()({
        settings: 'dessert',
        users
      })
    ).toEqual(
      {
        settings: 'dessert',
        region: {
          id: 'pie',
          [IS_SELECTED]: true
        },
        user: users.blinky
      }
    );
  });
  test('makeActiveUserAndSettingsSelector', () => {
    expect(
      makeActiveUserAndSettingsSelector()({
        settings: 'dessert',
        users
      })
    ).toEqual(
      {
        settings: 'dessert',
        user: users.blinky
      }
    );
  });
});
 */