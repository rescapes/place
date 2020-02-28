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
import {makeMutationRequestContainer, makeQueryContainer} from 'rescape-apollo';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {mapboxOutputParamsFragment} from '../mapStores/mapboxOutputParams';

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'geojson': 'FeatureCollectionDataTypeofRegionTypeRelatedReadInputType'
};

export const regionOutputParams = [
  'id',
  'deleted',
  'key',
  'name',
  'createdAt',
  'updatedAt',
  {
    geojson: [
      'type',
      {
        features: [
          'type',
          'id',
          {
            geometry: [
              'type',
              'coordinates'
            ]
          },
          'properties'
        ]
      },
      'generator',
      'copyright'
    ],
    data: [
      {
        locations: [
          'params'
        ],
        ...mapboxOutputParamsFragment
      }
    ]
  }
];

/**
 * Queries regions
 * @params {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @params {Object} outputParams OutputParams for the query such as regionOutputParams
 * @params {Object} props Arguments for the Regions query. This can be {} or null to not filter.
 * @returns {Task} A Task containing the Regions in an object with obj.data.regions or errors in obj.errors
 */
export const makeRegionsQueryContainer = v(R.curry((apolloConfig, {outputParams}, props) => {
    return makeQueryContainer(
      apolloConfig,
      {name: 'regions', readInputTypeMapper, outputParams},
      props
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.array.isRequired,
    })],
    ['props', PropTypes.shape().isRequired]
  ],
  'makeRegionsQueryContainer'
);

/**
 * Makes a Region mutation
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo component
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param [String|Object] outputParams output parameters for the query in this style json format:
 *  ['id',
 *   {
 *        data: [
 *         'foo',
 *         {
 *            properties: [
 *             'type',
 *            ]
 *         },
 *         'bar',
 *       ]
 *    }
 *  ]
 *  @param {Object} props Object matching the shape of a region. E.g. {id: 1, city: "Stavanger", data: {foo: 2}}
 *  @returns {Task|Object} A container. For ApolloClient mutations we get a Task back. For Apollo components
 *  we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const makeRegionMutationContainer = v(R.curry(
  (apolloConfig, {outputParams}, props) => makeMutationRequestContainer(
    apolloConfig,
    {
      name: 'region',
      outputParams
    },
    props
  )), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['mutationStructure', PropTypes.shape({
    outputParams: PropTypes.array.isRequired
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'makeRegionMutationContainer');
