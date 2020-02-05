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
import {v} from 'rescape-validate';
import {makeMutationRequestContainer, makeQueryContainer} from 'rescape-apollo';
import PropTypes from 'prop-types';
import {mapboxOutputParamsFragment} from '../mapStores/mapboxOutputParams';

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'geojson': 'FeatureCollectionDataTypeofProjectTypeRelatedReadInputType'
};

export const projectOutputParams = [
  'id',
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
 * Queries projects
 * @params {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param {Object} apolloClient An authorized Apollo Client
 * @params {Object} outputParams OutputParams for the query such as projectOutputParams
 * @params {Object} component Optional component for ApolloComponent queries. Leave null for client queries
 * @params {Object} props Arguments for the Regions query. This can be {} or null to not filter.
 * @returns {Task} A Task containing the Regions in an object with obj.data.regions or errors in obj.errors
 */
export const makeProjectsQueryContainer = v(R.curry((apolloConfig, {outputParams, propsStructure}, component, props) => {
    return makeQueryContainer(
      apolloConfig,
      {name: 'projects', readInputTypeMapper, outputParams, propsStructure},
      component,
      props
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.array.isRequired,
      propsStructure: PropTypes.shape()
    })
    ],
    ['component', PropTypes.func],
    ['props', PropTypes.shape().isRequired]
  ], 'makeRegionsQueryContainer');


/**
 * Makes a project mutation
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
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
 *  @param {Function} component The Apollo component if doing a component mutation. Otherwise null
 *  @param {Object} props Object matching the shape of a region. E.g. {id: 1, city: "Stavanger", data: {foo: 2}}
 *  @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 *  we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const makeProjectMutationContainer = v(R.curry(
  (apolloConfig, {outputParams}, component, props) => makeMutationRequestContainer(
    apolloConfig,
    {
      name: 'project',
      outputParams
    },
    component,
    props
  )), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['mutationStructure', PropTypes.shape({
    outputParams: PropTypes.array.isRequired
  })
  ],
  ['component', PropTypes.func],
  ['props', PropTypes.shape().isRequired]
], 'makeProjectMutationContainer');
