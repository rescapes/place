/**
 * Created by Andy Likuski on 2018.12.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {
  composeFuncAtPathIntoApolloConfig,
  createReadInputTypeMapper,
  filterOutNullDeleteProps,
  filterOutReadOnlyVersionProps,
  makeMutationRequestContainer,
  makeQueryContainer,
  relatedObjectsToIdForm,
  versionOutputParamsMixin
} from '@rescapes/apollo';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {queryVariationContainers} from '../../helpers/variedRequestHelpers.js';

// TODO should be derived from the remote schema
const RELATED_PROPS = [];

export const regionTypePolicy = {type: 'RegionType', fields: ['data']};

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const regionReadInputTypeMapper = createReadInputTypeMapper(
  'region', R.concat(['geojson'], RELATED_PROPS)
);

export const regionOutputParamsMinimized = {
  id: 1,
  key: 1,
  name: 1
};

export const regionOutputParams = {
  id: 1,
  deleted: 1,
  key: 1,
  name: 1,
  geojson: {
    type: 1,
    features: {
      type: 1,
      id: 1,
      geometry: {
        type: 1,
        coordinates: 1
      },
      properties: 1
    },
    generator: 1,
    copyright: 1
  },
  data: {
    locations: {
      params: 1
    },
    mapbox: {
      viewport: {
        latitude: 1,
        longitude: 1,
        zoom: 1
      }
    }
  },
  ...versionOutputParamsMixin
};

const normalizeRegionPropsForQuerying = region => {
  return filterOutNullDeleteProps(region);
};

/**
 * Queries regions
 * @params {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @params {Object} outputParams OutputParams for the query such as regionOutputParams
 * @params {Object} props Arguments for the Regions query. This can be {} or null to not filter.
 * @returns {Task} A Task containing the Regions in an object with obj.data.regions or errors in obj.errors
 */
export const makeRegionsQueryContainer = v(R.curry((apolloConfig , {outputParams}, props) => {
    return makeQueryContainer(
      composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables', normalizeRegionPropsForQuerying),
      {name: 'regions', readInputTypeMapper: regionReadInputTypeMapper, outputParams},
      props
    );
  }),
  [
    ['apolloConfig', PropTypes.shape()],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape().isRequired]
  ],
  'makeRegionsQueryContainer'
);

/**
 * Normalized region props for for mutation
 * @param {Object} region
 * @return {Object} the props modified
 */
export const normalizeRegionPropsForMutating = region => {
  return R.compose(
    // Make sure related objects only have an id
    region => relatedObjectsToIdForm(RELATED_PROPS, region),
    region => filterOutNullDeleteProps(region),
    region => filterOutReadOnlyVersionProps(region)
  )(region);
};
/**
 * Makes a Region mutation
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo component
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param [Object] [outputParams] Default regionOutputParamsMinimized output parameters for the query in this style json format:
 *  {id: 1,
 *   {
 *        data: {
 *         foo: 1,
 *          properties: {
 *             type: 1,
 *         },
 *         bar: 1,
 *       }
 *    }
 * }
 *  @param {Object} props Object matching the shape of a region. E.g. {id: 1, key: 'canada', name: 'Canada', data: {foo: 2}}
 *  Optionally specify the region props at props.region in order to pass other props through the container
 *  @param {Object} [props.region] Optional to use as the region to save if passing other props through the container.
 *  If you use this option you must specify in apolloConfig
 *  {
 *     variables: (props) => {
 *      return R.propOr({}, 'region', props);
 *    }
 *  }
 *  @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 *  we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const makeRegionMutationContainer = v(R.curry(
  (apolloConfig, {outputParams = regionOutputParamsMinimized}, props) => makeMutationRequestContainer(
    // if apolloConfig.options.variables is defined, call it and then call normalizeRegionPropsForMutating
    composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables', normalizeRegionPropsForMutating),
    {
      name: 'region',
      outputParams
    },
    props
  )
), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['mutationStructure', PropTypes.shape({
    outputParams: PropTypes.shape()
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'makeRegionMutationContainer');

/**
 * Returns and object with different versions of the region query container: 'minimized', 'paginated', 'paginatedAll'
 * @param apolloConfig
 * @return {Object} keyed by the variation, valued by the query container
 */
export const regionQueryVariationContainers = (apolloConfig) => {
  return queryVariationContainers(
    apolloConfig,
    {
      name: 'region',
      requestTypes: [
        {},
        {type: 'minimized', args: {outputParams: regionOutputParamsMinimized}},
        // Note that we don't pass page and page size here because we want to be able to query for different pages
        // We either pass page and page size here or in props instead
        {type: 'paginated', args: {}},
        // Note that we don't pass page size here because we want to be able to query for different pages
        // We either pass page and page size here or in props instead
        {type: 'paginatedAll', args: {}}
      ],
      queryConfig: {
        outputParams: regionOutputParams,
        readInputTypeMapper: regionReadInputTypeMapper
      },
      queryContainer: makeRegionsQueryContainer
    }
  );
};


