import {makeProjectMutationContainer, projectOutputParams} from './projectStore';
import {composeWithChain, mergeDeep, reqStrPathThrowing, traverseReduce} from 'rescape-ramda';
import * as R from 'ramda';
import moment from 'moment';
import {fromPromised, of} from 'folktale/concurrency/task';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {filterOutReadOnlyVersionProps} from 'rescape-apollo';

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
 * Creates a sample project
 * @params apolloClient
 * @params {Object} props Overrides the defauls. {user: {id}} is required
 * @params {Object} props.user
 * @params {Number} props.user.id Required
 * @return {Object} {data: project: {...}}
 */
export const createSampleProjectContainer = ({apolloClient}, props) => {
  return makeProjectMutationContainer(
    {apolloClient},
    {outputParams: projectOutputParams},
    mergeDeep(
      {
        key: 'downtownPincher',
        name: 'Downtown Pincher Creek',
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
          // Limits the possible locations by query
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
        },
        // This would the locations selected for the project within the confines of the query above
        locations: []
      },
      props
    )
  );
};

/**
 * Creates 10 projects for the given user
 * @param {Object} apolloConfig
 * @param {Object} props
 * @param {Object} props.user
 * @param {Number} props.user.id
 * @return Task resolving to a list of 10 projects
 */
export const createSampleProjectsContainer = v((apolloConfig, props) => {
  return traverseReduce(
    (projects, project) => {
      return R.concat(projects, [reqStrPathThrowing('data.createProject.project', project)]);
    },
    of([]),
    R.times(() => {
      return composeWithChain([
        () => {
          return createSampleProjectContainer(apolloConfig, {
              key: `test${moment().format('HH-mm-SS')}`,
              user: {
                id: reqStrPathThrowing('user.id', props)
              }
            }
          );
        },
        () => fromPromised(() => new Promise(r => setTimeout(r, 100)))()
      ])();
    }, 10)
  );
}, [
  ['apolloConfig', PropTypes.shape({}).isRequired],
  ['props', PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.number.isRequired
    }).isRequired
  }).isRequired]
], 'createSampleProjectsContainer');