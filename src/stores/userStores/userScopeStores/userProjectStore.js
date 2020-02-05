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
  makeProjectsQueryContainer,
  projectOutputParams as defaultProjectOutputParams
} from '../../scopeStores/projectStore';
import {makeUserScopeObjsQueryContainer} from './scopeHelpers';
import {
  userProjectsOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from '../userStore';
import {reqStrPathThrowing} from 'rescape-ramda';

// Variables of complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'user': 'UserTypeofUserStateTypeRelatedReadInputType'
};

/**
 * Queries projects that are in the scope of the user and the values of that project
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} outputParamSets Optional outputParam sets to override the defaults
 * @param {Object} [outputParamSets.projectOutputParams] Optional project output params.
 * Defaults to projectStore.projectOutputParams
 * @param {Function} [component] Optional component when doing and Apollo Component query
 * @param {Object} propSets The props used for the query. userState and project objects are required
 * @param {Object} propSets.userState Props for the UserStates queries {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} propSets.project Props for the Projects query. This can be {} or null to not filter.
 * Projects will be limited to those returned by the UserState query. These should not specify ids since
 * the UserState query selects the ids
 * @returns {Object} The resulting Projects in a Task in {data: usersProjects: [...]}}
 */
export const userProjectsQueryContainer = v(R.curry((apolloConfig, {projectOutputParams}, component, propSets) => {
    return makeUserScopeObjsQueryContainer(
      apolloConfig,
      {
        scopeQueryTask: makeProjectsQueryContainer,
        scopeName: 'project',
        readInputTypeMapper: userStateReadInputTypeMapper,
        userStateOutputParamsCreator: scopeOutputParams => userStateOutputParamsCreator(
          userProjectsOutputParamsFragmentDefaultOnlyIds(scopeOutputParams)
        ),
        scopeOutputParams: projectOutputParams || defaultProjectOutputParams
      },
      component,
      {userState: reqStrPathThrowing('userState', propSets), scope: reqStrPathThrowing('project', propSets)}
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParamSets', PropTypes.shape({
      projectOutputParams: PropTypes.shape()
    })],
    ['component', PropTypes.func],
    ['propSets', PropTypes.shape({
      userState: PropTypes.shape({
        user: PropTypes.shape({
          id: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number
          ])
        }).isRequired
      }).isRequired,
      project: PropTypes.shape().isRequired
    })]
  ], 'userProjectsQueryContainer');
