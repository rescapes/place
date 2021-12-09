import {projectMutationContainer, projectOutputParams, projectsQueryContainer} from './projectStore.js';
import {compact, mergeDeep, reqStrPathThrowing} from '@rescapes/ramda';
import * as R from 'ramda';
import moment from 'moment';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {queryAndDeleteIfFoundContainer} from '../../helpers/scopeHelpers.js';
import {createSampleLocationsContainer} from '../location/locationStore.sample.js';
import {
  callMutationNTimesAndConcatResponses,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction, mapTaskOrComponentToNamedResponseAndInputs
} from '@rescapes/apollo';

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
 * Creates a sample project. first if it exists
 * @params {Object} config
 * @params {Object} config.apolloConfig
 * @params {Object} options
 * @params {Boolean} [options.deleteExisting] Default false. If true delete existing projects of the user first
 * @params {Function} options.createSampleLocationsContainer Optional function to create locations for the project
 * @params {Object} options.outputParams Optional
 * @params {Object} props Overrides the defaults. {user: {id}} is required
 * @params {Object} props.user
 * @params {Number} props.user.id Required
 * @return {Object} {data: project: {...}}
 */
export const createSampleProjectContainer = (apolloConfig, {
  outputParams,
  createSampleLocationsContainer,
  deleteExisting = false
}, props) => {

  return composeWithComponentMaybeOrTaskChain([
    locations => {
      return projectMutationContainer(
        apolloConfig,
        {outputParams: outputParams || projectOutputParams},
        projectSample(
          R.merge(
            props,
            {locations})
        )
      );
    },

    // Create sample locations (optional)
    ({deletedResponse, ...props}) => {
      return R.ifElse(
        R.identity,
        f => f(apolloConfig, {}, R.pick(['render'], props)),
        () => {
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: {objects: []}
            }
          );
        }
      )(createSampleLocationsContainer);
    },
    // Delete all projects of this user if desired.
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedResponse',
    props => {
      return R.ifElse(
        () => deleteExisting,
        () => queryAndDeleteIfFoundContainer(
          apolloConfig,
          {
            queryName: 'projects',
            queryContainer: projectsQueryContainer(
              apolloConfig,
              {outputParams: projectOutputParams}
            ),
            mutateContainer: projectMutationContainer,
            responsePath: 'result.data.mutate.project'
          },
          R.merge({
              user: {
                id: reqStrPathThrowing('user.id', props)
              }
            },
            compact({render: R.prop('render', props)})
          )
        ),
        () => {
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: null
            }
          );
        }
      )(props);
    })
  ])(props);
};

export const projectSample = props => {
  const now = moment().format('HH-mm-ss-SSS');
  return mergeDeep(
    {
      key: `downtownPincher${now}`,
      name: `Downtown Pincher Creek`,
      geojson: {
        'type': 'FeatureCollection',
        'features': [{
          "type": "Feature",
          id: 'rel/99999',
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
      }
    },
    props
  );
};
/**
 * Creates 10 projects for the given user
 * @param {Object} apolloConfig
 * @param {Object} options
 * @param {Object} [options.count] Default 10 samples
 * @param {Object} props
 * @param {Object} props.user
 * @param {Number} props.user.id
 * @return Task resolving to a list of 10 projects
 */
export const createSampleProjectsContainer = v((apolloConfig, {count=10}, props) => {
  return composeWithComponentMaybeOrTaskChain([
      response => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig,
          {
            count,
            mutationContainer: (apolloConfig, options, props) => {
              return createSampleProjectContainer(
                apolloConfig,
                R.merge(
                  options,
                  {createSampleLocationsContainer}
                ),
                props
              );
            },
            responsePath: 'result.data.createProject.project',
            propVariationFunc: props => {
              return {
                key: `test${moment().format('HH-mm-ss-SSS')}`,
                user: {
                  id: reqStrPathThrowing('user.id', props)
                }
              };
            }
          },
          props
        );
      },
      props => {
        // Delete existing test regions for the test user
        return queryAndDeleteIfFoundContainer(
          apolloConfig,
          {
            queryName: 'projects',
            queryContainer: projectsQueryContainer(
              apolloConfig,
              {outputParams: projectOutputParams}
            ),
            mutateContainer: projectMutationContainer,
            responsePath: 'result.data.mutate.project'
          },
          {
            keyContains: 'test',
            user: {
              id: reqStrPathThrowing('user.id', props)
            }
          }
        );
      }
    ]
  )(props);
}, [
  ['apolloConfig', PropTypes.shape({}).isRequired],
  ['options', PropTypes.shape({
    count: PropTypes.number
  }).isRequired],
  ['props', PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.number.isRequired
    }).isRequired
  }).isRequired]
], 'createSampleProjectsContainer');