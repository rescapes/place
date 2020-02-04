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
import {makeFeaturesByTypeSelector, makeMarkersByTypeSelector, makeGeojsonSelector} from './geojsonSelectors';
import {STATUS} from 'rescape-helpers';

const {IS_SELECTED, IS_ACTIVE} = STATUS;

/*
describe('geojsonSelectors', () => {
  const locations = {
    features: [
      {
        id: 'node/3572156993',
        properties: {
          '@id': 'node/3572156993'
        }
      }
    ]
  };
  const features = [
    {
      type: 'Feature',
      id: 'way/29735335',
      properties: {
        '@id': 'way/29735335'
      }
    }
  ];
  const state = {
    regions: {
      foo: {
        mapbox: {
          viewport: {some: 'thing'}
        },
        geojson: {
          features
        },
        locations
      },
      boo: {
        mapbox: {
          viewport: {what: 'ever'}
        },
        geojson: {
          features
        },
        locations
      }
    },
    users: {
      blinky: {
        [IS_ACTIVE]: true,
        regions: {foo: {id: 'foo'}, boo: {id: 'boo', [IS_SELECTED]: true}}
      }
    }
  };

  test('makeGeojsonSelector', () => {

    const region = state.regions.foo;
    const expected = {
      features,
    };
    expect(makeGeojsonSelector()(state, {region})).toEqual(expected);
  });
});
 */