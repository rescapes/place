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
  callMutationNTimesAndConcatResponses,
  composeWithComponentMaybeOrTaskChain,
  createReadInputTypeMapper, deleteItemsOfExistingResponses,
  makeMutationRequestContainer,
  makeQueryContainer,
  mapTaskOrComponentToNamedResponseAndInputs
} from '@rescapes/apollo';
import {reqStrPathThrowing} from '@rescapes/ramda';
import PropTypes from 'prop-types';
import {v} from '@rescapes/validate';
import {locationOutputParams, locationOutputParamsMinimized} from './locationOutputParams.js';
import T from 'folktale/concurrency/task/index.js';
import {queryVariationContainers} from '../../helpers/variedRequestHelpers.js';
import {composeFuncAtPathIntoApolloConfig} from "@rescapes/apollo";

const {of} = T;


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
 * @param {Object} apolloConfig The Apollo config
 * @param {Object} queryStructure.outputParams The output params of the query
 * @param {Object} props The props for the query
 * @return {Task|Maybe} A task or Maybe containing the locations and the queryParams
 */
export const queryLocationsContainer = v(R.curry(
  (apolloConfig, {outputParams}, props) => {
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
    ['apolloConfig', PropTypes.shape().isRequired
    ],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
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
    return makeMutationRequestContainer(
      composeFuncAtPathIntoApolloConfig(
        apolloConfig,
        'options.variables',
        props => {
          return R.over(
            // If locationPropsPath is null, over will operate on props
            R.lensPath(locationPropsPath ? R.split('.', locationPropsPath) : []),
            props => {
              return props;
            },
            props
          )
        }
      ),
      {
        name: 'location',
        outputParams
      },
      props
    );
  }), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['mutationStructure', PropTypes.shape({
    outputParams: PropTypes.shape().isRequired
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'makeLocationMutationContainer');

/**
 * Returns and object with different versions of the location query container: 'minimized', 'paginated', 'paginatedAll'
 * @param configapolloConfig
 * @return {Object} keyed by the variation, valued by the query container
 */
export const locationQueryVariationContainers = (apolloConfig) => {
  return queryVariationContainers(
    apolloConfig,
    {
      name: 'location',
      // Only allow the query matching the value of props.locationQueryKey so we never run multiple
      // query variations. This allows us to dynamically change which query we use, so that if
      // we expect a large list we can page, or if we need to minimize or maximize outputParams
      allowRequestPropPath: 'locationQueryKey',
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
 * @param {Object} options
 * @param {Boolean} [options.forceDelete] Default true. Delete all instances and recreate
 * @param {Function} [options.existingItemMatch] Required if forceDelete is false. Expects
 * item and existingItemResponses and returns the existingItemResponse that matches item if any.
 * @param {Object} props Props matching the locations to delete
 * @return {Object} {deleted[scope name]s: deleted objects, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteLocationsContainer = (
  apolloConfig,
  {forceDelete, existingItemMatch},
  props
) => {
  return composeWithComponentMaybeOrTaskChain([
    // Delete those test scope objects
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedLocationResponse',
      ({locationsResponse}) => {
        return deleteItemsOfExistingResponses(
          apolloConfig,
          {
            forceDelete: forceDelete !== false,
            queryResponsePath: 'data.locations',
            mutationContainer: makeLocationMutationContainer,
            responsePath: 'result.data.mutate.location',
          },
          R.mergeRight(props, {existingItemResponses: locationsResponse})
        );
      }
    ),
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'locationsResponse',
      // Get scope objects to delete
      ({props}) => {
        return queryLocationsContainer(
          apolloConfig,
          {
            outputParams: {id: 1, deleted: 1}
          },
          props
        );
      }
    )
  ])({props});
};