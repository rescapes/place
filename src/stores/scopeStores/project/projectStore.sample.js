import {makeProjectMutationContainer, makeProjectsQueryContainer, projectOutputParams} from './projectStore.js';
import {
  composeWithChain,
  mapToNamedResponseAndInputs,
  mergeDeep,
  reqStrPathThrowing,
  traverseReduce,
  compact
} from '@rescapes/ramda';
import * as R from 'ramda';
import moment from 'moment';
import T from 'folktale/concurrency/task/index.js';

const {fromPromised, of} = T;
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {queryAndDeleteIfFoundContainer} from '../../helpers/scopeHelpers.js';
import {createSampleLocationsContainer} from '../location/locationStore.sample.js';
import {callMutationNTimesAndConcatResponses, composeWithComponentMaybeOrTaskChain} from '@rescapes/apollo';
import {getRenderPropFunction} from '@rescapes/apollo/src/helpers/componentHelpersMonadic';
import {containerForApolloType} from '@rescapes/apollo/src/helpers/containerHelpers';
import {createSampleRegionContainer} from '../region/regionStore.sample';
import {makeRegionMutationContainer, makeRegionsQueryContainer, regionOutputParams} from '../region/regionStore';

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
 * @params {Function} options.locationsContainer Optional function to create locations for the project
 * @params {Object} options.outputParams Optional
 * @params {Object} props Overrides the defaults. {user: {id}} is required
 * @params {Object} props.user
 * @params {Number} props.user.id Required
 * @return {Object} {data: project: {...}}
 */
export const createSampleProjectContainer = (apolloConfig, {outputParams, locationsContainer}, props) => {

  return composeWithComponentMaybeOrTaskChain([
    locationResponses => {
      return makeProjectMutationContainer(
        apolloConfig,
        {outputParams: outputParams || projectOutputParams},
        projectSample(
          R.merge(
            props,
            {locations: R.map(reqStrPathThrowing('data.locations'), locationResponses)})
        )
      );
    },

    // Create sample locations (optional)
    props => {
      return R.ifElse(
        R.identity,
        f => f(apolloConfig, {}, R.pick(['render'], props)),
        () => {
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: []
            }
          );
        }
      )(locationsContainer);
    },
    // Delete all projects of this user
    props => {
      return queryAndDeleteIfFoundContainer(
        apolloConfig,
        {
          queryName: 'projects',
          queryContainer: makeProjectsQueryContainer(
            apolloConfig,
            {outputParams: projectOutputParams}
          ),
          mutateContainer: makeProjectMutationContainer,
          responsePath: 'result.data.mutate.project'
        },
        R.merge({
            user: {
              id: reqStrPathThrowing('user.id', props)
            }
          },
          compact({render: R.prop('render', props)})
        )
      );
    }
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
 * @param {Object} props
 * @param {Object} props.user
 * @param {Number} props.user.id
 * @return Task resolving to a list of 10 projects
 */
export const createSampleProjectsContainer = v((apolloConfig, props) => {
  return composeWithComponentMaybeOrTaskChain([
      response => {
        return callMutationNTimesAndConcatResponses(
          apolloConfig,
          {
            count: 10,
            mutationContainer: (apolloConfig, options, props) => {
              return createSampleProjectContainer(
                apolloConfig,
                R.merge(
                  options,
                  {locationsContainer: createSampleLocationsContainer}
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
            queryContainer: makeProjectsQueryContainer(
              apolloConfig,
              {outputParams: projectOutputParams}
            ),
            mutateContainer: makeProjectMutationContainer,
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
  ['props', PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.number.isRequired
    }).isRequired
  }).isRequired]
], 'createSampleProjectsContainer');