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
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {
  makeRegionsQueryContainer,
  regionOutputParams as defaultRegionOutputParams
} from '../../scopeStores/region/regionStore';
import {makeUserStateScopeObjsMutationContainer, makeUserStateScopeObjsQueryContainer} from './scopeHelpers';
import {
  userRegionsOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from '../userStateStore';
import {regionOutputParams} from '../../../stores/scopeStores/region/regionStore';
import {selectionOutputParamsFragment} from '../selectionStore';
import {activityOutputParamsFragment} from '../activityStore';

// Variables of complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'user': 'UserTypeofUserStateTypeRelatedReadInputType'
};

export const userRegionOutputParams = (explicitRegionOuputParams = regionOutputParams) => R.mergeAll([
  {
    region: explicitRegionOuputParams,
    mapbox: {
      viewport: {
        latitude: 1,
        longitude: 1,
        zoom: 1
      }
    }
  },
  selectionOutputParamsFragment,
  activityOutputParamsFragment
]);

/**
 * Queries regions that are in the scope of the user and the values of that region
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} outputParamSets Optional outputParam sets to override the defaults
 * @param {Object} [outputParamSets.userRegionOutputParams] Optional userRegion output params.
 * Defaults to regionStore.regionOutputParams
 * @param {Object} userStateArguments arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} propSets The props used for the query. userState objects are required
 * @param {Object} propSets.userState Props for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} propSets.scope Props for the Regions query. This can be {} or null to not filter.
 * @returns {Object} The resulting User Regions in a Task in {data: usersRegions: [...]}}
 */
export const userRegionsQueryContainer = v(R.curry(
  (apolloConfig, {userRegionOutputParams: explicitUserRegionOutputParams}, propSets) => {
    return makeUserStateScopeObjsQueryContainer(
      apolloConfig,
      {
        scopeQueryContainer: makeRegionsQueryContainer,
        scopeName: 'region',
        readInputTypeMapper: userStateReadInputTypeMapper,
        userStateOutputParamsCreator: scopeOutputParams => {
          const params = userStateOutputParamsCreator(
            userRegionsOutputParamsFragmentDefaultOnlyIds(scopeOutputParams)
          );
          return params;
        },
        userScopeOutputParams: explicitUserRegionOutputParams || userRegionOutputParams()
      },
      propSets
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParamSets', PropTypes.shape({
      regionOutputParams: PropTypes.shape()
    })],
    ['propSets', PropTypes.shape({
      userState: PropTypes.shape({
        user: PropTypes.shape({
          id: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number
          ])
        }).isRequired
      }).isRequired,
      region: PropTypes.shape()
    })]
  ], 'userRegionsQueryContainer');

/**
 *  Mutates the given userState.data.userRegions with the given region
 * If a matching region is in userState.data.userRegions it is updated, otherwise it is added
 * @param {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param [Object] outputParams outputParams Region output params for UserRegion
 * @param {Object} propSets Object matching the shape of a userState and region for the create or update
 * @param {Object} propSets.userState Object matching the shape of a userState.
 * @param {Object} propSets.userState.data The data to mutate. For updates any array in data will replace that
 * on the server, but otherwise this data is deep merged with the existing data on the server
 * @param {Object} propSets.userScope Object matching the shape of the userRegion to mutate in the user state
 * @param {Object} propSets.userScope.region Object matching the shape of the region to mutate in the user state
 * @param {Number} propSets.userScope.region.id Required id of the region to update or add in userState.data.userRegions
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const userStateRegionMutationContainer = v(R.curry((apolloConfig, {outputParams}, propSets) => {
    return makeUserStateScopeObjsMutationContainer(
      apolloConfig,
      {
        scopeQueryContainer: makeRegionsQueryContainer,
        scopeName: 'region',
        readInputTypeMapper,
        userStateOutputParamsCreator: scopeOutputParams => {
          return userStateOutputParamsCreator(
            userRegionsOutputParamsFragmentDefaultOnlyIds(scopeOutputParams)
          );
        },
        userScopeOutputParams: outputParams
      },
      propSets
    );
  }), [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape({
      userState: PropTypes.shape().isRequired,
      userScope: PropTypes.shape({
        region: PropTypes.shape({
          id: PropTypes.number.isRequired
        })
      }).isRequired
    }).isRequired]
  ],
  'userStateRegionMutationContainer'
);
