/**
 * Created by Andy Likuski on 2018.04.25
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import moment from 'moment';
import * as R from 'ramda';
import {
  composeWithComponentMaybeOrTaskChain,
  createReadInputTypeMapper,
  makeMutationRequestContainer,
  makeQueryContainer
} from 'rescape-apollo';
import {mapToNamedPathAndInputs} from 'rescape-ramda';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {locationOutputParams, locationOutputParamsMinimized} from './locationOutputParams';
import {of} from 'folktale/concurrency/task';
import {queryVariationContainers} from 'rescape-place';


// Don't include intersections where because they are can be created when we create of update locations
// TODO we should normalized the way we deal with dependent objects like intersections
export const RELATED_PROPS = [];

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
export const locationReadInputTypeMapper = createReadInputTypeMapper(
  'location', ['data', 'geojson']
);

/**
 * Chained Task to query locations and return locations and the queryParams
 * @param {Object} config
 * @param {Object} config.apolloConfig The Apollo config
 * @param {Object} [config.regionConfig] Not currently used
 * @param {Object} queryStructure.outputParams The output params of the query
 * @param {Object} props The props for the query
 * @return {Task|Maybe} A task or Maybe containing the locations and the queryParams
 */
export const queryLocationsContainer = v(R.curry(
  ({apolloConfig, regionConfig}, {outputParams}, props) => {
    // TODO this has to support components. Move the two steps below to the server to make it easy
    return makeQueryContainer(
      apolloConfig,
      {
        name: 'locations',
        readInputTypeMapper:
        locationReadInputTypeMapper,
        outputParams
      },
      props
    );
  }),
  [
    ['config', PropTypes.shape(
      {
        apolloConfig: PropTypes.shape().isRequired
      },
      {
        regionConfig: PropTypes.shape()
      }
    ).isRequired
    ],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape.isRequired
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ], 'queryLocationsContainer'
);

/**
 * Creates a container to create or update a location
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one inst
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} requestConfig
 * @param {Object} requestConfig.outputParams output parameters for the query. See locationOutputParams
 * @param {String} [requestConfig.locationPropPath] Optional The path in props to the location if the props itself isn't a location
 * @param {Object} props Object matching the shape of the location.
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const makeLocationMutationContainer = v(R.curry(
  (apolloConfig, {outputParams, locationPropsPath}, props) => {
    return R.compose(
      normalizedProps => {
        return makeMutationRequestContainer(
          apolloConfig,
          {
            name: 'location',
            outputParams
          },
          normalizedProps
        );
      },
      props => R.over(
        // If locationPropsPath is null, over will operate on props
        R.lensPath(locationPropsPath ? R.split('.', locationPropsPath) : []),
        props => {
          return props
        },
        props
      )
    )(props);
  }), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['mutationStructure', PropTypes.shape({
    outputParams: PropTypes.shape.isRequired
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'makeLocationMutationContainer');

/**
 * Returns and object with different versions of the location query container: 'minimized', 'paginated', 'paginatedAll'
 * @param configapolloConfig
 * @return {Object} keyed by the variation, valued by the query container
 */
export const locationQueryVariationContainers = ({apolloConfig, regionConfig: {}}) => {
  return queryVariationContainers(
    {apolloConfig, regionConfig: {}},
    {
      name: 'location',
      requestTypes: [
        {},
        {type: 'minimized', args: {outputParams: locationOutputParamsMinimized}},
        // Note that we don't pass page and page size here because we want to be able to query for different pages
        // We either pass page and page size here or in props instead
        {type: 'paginated', args: {}},
        // Note that we don't pass page size here because we want to be able to query for different pages
        // We either pass page and page size here or in props instead
        {type: 'paginatedAll', args: {}},
        {type: 'paginatedAll', name: 'paginatedAllMinimized', args: {outputParams: locationOutputParamsMinimized}}
      ],
      queryConfig: {
        outputParams: locationOutputParams,
        readInputTypeMapper: locationReadInputTypeMapper
      },
      queryContainer: queryLocationsContainer
    }
  );
};

/**
 * Soft delete locations matching the props
 * @param {Object} apolloConfig The Apollo config
 * @param {Object} scopeConfig
 * @param {Object} scopeConfig.outputParams
 * @param {Object} scopeConfig.readInputTypeMapper
 * @param {Object} props Props matching the locations to delete
 * @return {Object} {deleted[scope name]s: deleted objects, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteLocationsContainer = (
  apolloConfig,
  {},
  props
) => {
  return composeWithComponentMaybeOrTaskChain([
    // Delete those test scope objects
    ({apolloConfig, locations}) => {
      return R.traverse(
        of, // TODO doesn't work with components!
        location => {
          return makeLocationMutationContainer(
            apolloConfig,
            {
              outputParams: {id: 1, deleted: 1}
            },
            R.compose(
              // And the deleted datetime
              R.set(R.lensProp('deleted'), moment().toISOString(true)),
              // Just pass the id
              R.pick(['id'])
            )(location)
          );
        },
        locations
      );
    },
    // Get scope objects to delete
    mapToNamedPathAndInputs('locations', 'data.locations',
      ({apolloConfig}) => {
        return queryLocationsContainer(
          {apolloConfig},
          {
            outputParams: {id: 1}
          },
          props
        );
      }
    )
  ])(({apolloConfig, props}));
};