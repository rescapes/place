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

/**
 * @fileoverview Deprecated
 */

import {createSelector} from 'reselect';
import {filterWithKeys, reqPathThrowing} from 'rescape-ramda';
import * as R from 'ramda';

/**
 * Extracts the browser window dimensions from the state to pass to props
 * that resize based on the browser
 */
export const browserDimensionsSelector = createSelector(
  [
    R.compose(
      R.pick(['width', 'height']),
      // Default each to 0
      R.merge({width: 0, height: 0}),
      reqPathThrowing(['browser'])
    )
  ],
  R.identity
);

/** *
 * Creates a selector that resolves the browser width and height from the state and multiplies each by the fraction
 * stored in the local props (which can either come from parent or from the component's style). If props
 * width or height is not defined they default to 1
 * @props {Object} state Expected to have a browser.[width and height]
 * @props {Object} props Expected to have a style.[width and height]
 * @returns {Object} a width and height relative to thte browser.
 */
export const makeBrowserProportionalDimensionsSelector = () => (state, props) => createSelector(
  [browserDimensionsSelector],
  dimensions => ({
    width: R.multiply(R.pathOr(1, ['style', 'width'], props), R.prop('width', dimensions)),
    height: R.multiply(R.pathOr(1, ['style', 'height'], props), R.prop('height', dimensions))
  })
)(state, props);

const defaultStyleSelector = (state) =>
  reqPathThrowing(['styles', 'default'], state);


/**
 * Returns a function that creates a selector to
 * merge the defaultStyles in the state with the style object of the given props
 * @param {Object} state The Redux state
 * @param {Object} state.styles.default The default styles. These should be simple values
 * @param {Object} [props] Optional The props
 * @param {Object} [props.style] Optional The style object with simple values or
 * unary functions to transform the values from the state (e.g. { margin: 2, color: 'red', border: scale(2) })
 * where scale(2) returns a function that transforms the border property from the state
 * @returns {Object} The merged object
 */
export const makeMergeDefaultStyleWithProps = () => (state, props) => createSelector(
  [defaultStyleSelector],
  defaultStyle => mergeAndApplyMatchingStyles(defaultStyle, R.propOr({}, 'style', props))
)(state, props);
