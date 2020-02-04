import {makeRegionMutationContainer, regionOutputParams} from './regionStore';
import {mergeDeep} from 'rescape-ramda';

/**
 * Created by Andy Likuski on 2019.01.22
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Creates a sample region
 * @params apolloClient
 * @params {Object} [component] Optional, for apollo component tests only
 * @params {Object} props Optional overrides to defaults
 * @return {Object} {data: region: {...}}}
 */
export const createSampleRegionContainer = ({apolloClient}, component, props = {}) => {
  // Create the prop function and pass it sample props to return a Task
  return makeRegionMutationContainer(
    {apolloClient},
    {outputParams: regionOutputParams},
    // Null for Apollo client queries, or a component for Apollo component queries
    component,
    mergeDeep({
        key: 'pincherCreek',
        name: 'Pincher Creek',
        geojson: {
          'type': 'FeatureCollection',
          'features': [{
            "type": "Feature",
            "geometry": {
              "type": "Polygon",
              "coordinates": [[[49.54147, -114.17439], [49.42996, -114.17439], [49.42996, -113.72635], [49.54147, -113.72635], [49.54147, -114.174390]]]
            }
          }]
        },
        data: {
          locations: {
            params: {
              city: 'Pincher Creek',
              state: 'Alberta',
              country: 'Canada'
            }
          },
          mapbox: {
            viewport: {
              latitude: 49.54147,
              longitude: -114.17439,
              zoom: 7
            }
          }
        }
      },
      props)
  );
};
