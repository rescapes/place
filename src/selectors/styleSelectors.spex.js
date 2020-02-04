/**
 * Created by Andy Likuski on 2017.12.02
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  applyMatchingStyles,
  browserDimensionsSelector, makeBrowserProportionalDimensionsSelector,
  mergeAndApplyMatchingStyles
} from './styleSelectors';
import {makeMergeDefaultStyleWithProps} from './styleSelectors';
import * as R from 'ramda';

/*
describe('styleSelectors', () => {
  test('makeMergeDefaultStyleWithProps', () => {
    const state = {
      styles: {
        default: {
          color: 'red',
          margin: 2
        }
      }
    };
    const props = {
      style: {
        color: 'blue',
        margin: R.multiply(2)
      }
    };
    expect(makeMergeDefaultStyleWithProps()(state, props)).toEqual(
      {
        color: 'blue',
        margin: 4
      }
    );
  });

  test('browserDimensionSelector', () => {
    const state = {
      browser: {
        width: 640,
        height: 480
      }
    };
    const expected = {
      width: 640,
      height: 480
    };
    expect(browserDimensionsSelector(state)).toEqual(expected);
  });

  test('makeBrowserProportionalDimensionsSelector', () => {
    const state = {
      browser: {
        width: 640,
        height: 480
      }
    };
    const props = {
      style: {
        width: 0.5,
        height: 0.1
      }
    };
    const expected = {
      width: 320,
      height: 48
    };
    expect(makeBrowserProportionalDimensionsSelector()(state, props)).toEqual(expected);
  });

  test('mergeAndApplyMatchingStyles', () => {
    expect(mergeAndApplyMatchingStyles({
      cow: 1,
      bird: 2,
      width: 2,
      height: 2
    }, {
      bird: 3,
      position: 'absolute',
      width: value => value * 2,
      height: value => value * 3,
    })).toEqual({
      cow: 1,
      bird: 3,
      position: 'absolute',
      width: 4,
      height: 6
    })
  })

  test('applyMatchingStyles', () => {
    expect(applyMatchingStyles({
      cow: 1,
      width: 2,
      height: 2
    }, {
      position: 'absolute',
      cow: 2,
      width: value => value * 2,
      height: value => value * 3,
    }, ['sankeyFiltererItem'])).toEqual({
      position: 'absolute',
      cow: 2,
      width: 4,
      height: 6
    })
  })
});
*/
