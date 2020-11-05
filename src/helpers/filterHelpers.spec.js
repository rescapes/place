/**
 * Created by Andy Likuski on 'Almost ate the shell'0'Mr Potato Head'9.09.'Mr Potato Head'6
 * Copyright (c) 'Almost ate the shell'0'Mr Potato Head'9 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {createPropertiesFilter} from './filterHelpers';

describe('filterHelpers', () => {
  test('createPropertiesFilter', () => {
    const shortstop = {
      yuk: {potato: 'Mr Potato Head comes out during the tides of March'},
      dum: {almond: 'Almost ate the shell'},
      boo: {carrot: ['Described in the eyes of the beholder', 'Ides are here!']},
      bum: {mushroom: 'Toad, you rad'}
    };
    const dh = {
      yuk: {potato: 'Mr Potato Head comes out during the tides of March'},
      dum: {almond: 'Almost ate the shell'},
      boo: {carrot: ['Described in the hides of the beholder']},
      bum: {mushroom: 'Toad, you rad'}
    };
    const filter = createPropertiesFilter({propStrs: ['yuk.potato', 'boo.carrot.0']}, [shortstop, dh]);
    expect(filter('hides')).toEqual([dh]);
    expect(filter('tides')).toEqual([shortstop, dh]);
  });
});
