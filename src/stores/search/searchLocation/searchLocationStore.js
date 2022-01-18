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

import * as R from 'ramda';
import {
  composeWithComponentMaybeOrTaskChain,
  createReadInputTypeMapper,
  deleteItemsOfExistingResponses, filterOutNullAndEmptyDeep, filterOutReadOnlyVersionProps,
  makeMutationRequestContainer,
  makeQueryContainer,
  mapTaskOrComponentToNamedResponseAndInputs, updateRelatedObjectsToIdForm
} from '@rescapes/apollo';
import PropTypes from 'prop-types';
import {v} from '@rescapes/validate';
import {
  defaultSearchLocationOutputParams,
  defaultSearchLocationOutputParamsMinimized
} from './defaultSearchLocationOutputParams.js';
import T from 'folktale/concurrency/task/index.js';
import {composeFuncAtPathIntoApolloConfig} from "@rescapes/apollo"
import {strPathOr} from "@rescapes/ramda";
import {cleanGeojson} from "@rescapes/osm";

const {of} = T;


// Don't include searchIntersections or searchJurisdictions here because they are can be created
// when we create of update searchLocations
export const RELATED_PROPS = [];

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this searchLocation.data is represented as follows:
export const searchLocationReadInputTypeMapper = createReadInputTypeMapper(
  'searchLocation',
  ['identification', 'street', 'jurisdictions', 'geojson'],
  // This special argument adds 'Search' to the start of each ReadInputType, since our Graphql type differs
  // from the django field name (because we want the django field name to match those of Location)
  'search'
);

export const searchLocationIdPathLookup = {
};

export const searchLocationTypePolicy = {
  type: 'LocationType',
  keyFields: null,
  // Create a merge function for these fields since we sometimes query fewer fields than other times and don't
  // want lose cache data with the default merge strategy. All fields will deep merge and jurisdiction
  // will deep merge array items based on matching id
  fields: ['identification', 'street', 'jurisdictions', 'geojson'],
  idPathLookup: searchLocationIdPathLookup,
  cacheOnlyFieldLookup: {}
}

/**
 * Omits some unsupported searchLocation props from querying
 * Does nothing at the moment
 * @param {Object} searchLocation
 * @return {Object}
 */
export const normalizeSearchLocationPropsForQuerying = searchLocation => {
  // Placeholder
  return searchLocation
}

/**
 * Omits some unsupported location props from mutating
 * @param {Object} options
 * @param {String} [options.searchLocationPropsPath] Path of location in props. By default
 * props are the location
 * @param {Object} props
 * @return {Object} The normalized location in props or props itself
 */
export const normalizeSearchLocationPropsForMutating = ({searchLocationPropsPath}, props) => {
  return R.over(
    // If locationPropsPath is null, over will operate on props
    R.lensPath(searchLocationPropsPath ? R.split('.', searchLocationPropsPath) : []),
    props => {
      return R.compose(
        searchLocation => {
          // Remove nulls and empty dicts/arrays
          return filterOutNullAndEmptyDeep({}, searchLocation)
        },
        searchLocation => {
          return updateRelatedObjectsToIdForm({relatedPropPaths: RELATED_PROPS}, searchLocation)
        },
        searchLocation => {
          return filterOutReadOnlyVersionProps(searchLocation)
        },
        // If we have geojson, make sure each feature has clean geojson.
        // The main problem is feature property tags sometimes have colon keys like tiger:, which
        // graphql can't handle.
        searchLocation => {
          return R.when(
            searchLocation => strPathOr(null, 'geojson.features', searchLocation),
            searchLocation => R.over(
              R.lensPath(['geojson', 'features']),
              features => R.map(cleanGeojson, features || []),
              searchLocation
            )
          )(searchLocation)
        }
      )(props);
    },
    props);
}

/**
 * Chained Task to query searchLocations and return searchLocations and the queryParams
 * @param {Object} apolloConfig The Apollo config
 * @param {Object} options
 * @param {Object} [options.outputParams] Defaults to defaultSearchLocationOutputParams, The output params of the query
 * @param {OBject} [options.readInputTypeMapper] Defaults to searchLocationReadInputTypeMapper
 * @param {Object} props The props for the query
 * @return {Task|Object} A task or React container containing the searchLocations and the queryParams
 */
export const querySearchLocationsContainer = v(R.curry(
    (apolloConfig, {
      outputParams = defaultSearchLocationOutputParams,
      readInputTypeMapper = searchLocationReadInputTypeMapper
    }, props) => {
      return makeQueryContainer(
        apolloConfig,
        {
          name: 'searchLocations',
          readInputTypeMapper,
          outputParams,
          normalizeProps: normalizeSearchLocationPropsForQuerying
        },
        props
      );
    }),
  [
    ['apolloConfig', PropTypes.shape().isRequired
    ],
    ['options', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ], 'querySearchLocationsContainer'
);

/**
 * Creates a container to create or update a searchLocation
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one inst
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} options
 * @param {Object} [options.outputParams] Default defaultSearchLocationOutputParamsMinimized. output parameters for the query. See defaultSearchLocationOutputParams
 * @param {String} [options.searchLocationPropPath] Optional The path in props to the searchLocation if the props itself isn't a searchLocation
 * @param {Object} props Object matching the shape of the searchLocation.
 * @returns {Task|Object} A task or Reach container that resolves to the mutation
 */
export const makeSearchLocationMutationContainer = v(R.curry(
  (apolloConfig, {outputParams = defaultSearchLocationOutputParamsMinimized, searchLocationPropsPath}, props) => {
    return makeMutationRequestContainer(
      composeFuncAtPathIntoApolloConfig(
        apolloConfig,
        'options.variables',
        props => normalizeSearchLocationPropsForMutating({searchLocationPropsPath}, props)
      ),
      {
        name: 'searchLocation',
        outputParams
      },
      props
    );
  }), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['options', PropTypes.shape({
    outputParams: PropTypes.shape().isRequired
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'makeSearchLocationMutationContainer');

/**
 * Soft delete searchLocations matching the props
 * @param {Object} apolloConfig The Apollo config
 * @param {Object} options
 * @param {Boolean} [options.forceDelete] Default true. Delete all instances and recreate
 * @param {Function} [options.existingItemMatch] Required if forceDelete is false. Expects
 * item and existingItemResponses and returns the existingItemResponse that matches item if any.
 * @param {Object} props Props matching the searchLocations to delete
 * @return {Object} {deleted[scope name]s: deleted objects, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteSearchLocationsContainer = (
  apolloConfig,
  {forceDelete, existingItemMatch},
  props
) => {
  return composeWithComponentMaybeOrTaskChain([
    // Delete those test scope objects
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedSearchLocationResponse',
      ({searchLocationsResponse}) => {
        return deleteItemsOfExistingResponses(
          apolloConfig,
          {
            forceDelete: forceDelete !== false,
            queryResponsePath: 'data.searchLocations',
            mutationContainer: makeSearchLocationMutationContainer,
            responsePath: 'result.data.mutate.searchLocation',
          },
          R.mergeRight(props, {existingItemResponses: searchLocationsResponse})
        );
      }
    ),
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'searchLocationsResponse',
      // Get scope objects to delete
      ({props}) => {
        return querySearchLocationsContainer(
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