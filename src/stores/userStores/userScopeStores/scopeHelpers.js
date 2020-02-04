/**
 * Created by Andy Likuski on 2019.01.21
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {v} from 'rescape-validate';
import {capitalize, compact, reqPathThrowing, reqStrPathThrowing} from 'rescape-ramda';
import {of} from 'folktale/concurrency/task';
import {makeQueryContainer} from 'rescape-apollo';
import {mapQueryTaskToNamedResultAndInputs} from 'rescape-apollo';
import PropTypes from 'prop-types';

/**
 * Queries scope objects (Region, Project, etc) that are in the scope of the given user. If scopeArguments are
 * specified the returned scope objects are queried by the scopeArguments to possibly reduce those matching
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryTask Task querying the scope class, such as makeRegionsQueryContainer
 * @param {String} scopeName The name of the scope, such as 'region' or 'project'
 * @param {Function} userStateOutputParamsCreator Unary function expecting scopeOutputParams
 * and returning output parameters for each the scope class query. If don't have to query scope seperately
 * then scopeOutputParams is passed to this. Otherwise we just was ['id'] since that's all the initial query needs
 * @param {[Object]} scopeOutputParams Output parameters for each the scope class query
 * @param {Object} userStateArgumentsCreator arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Function} component The optional compnent for Apollo Compenent queries
 * @param {Object} props Props to query with. userState is required and a scope property that can contain none
 * or more of region, project, etc. keys with their query values
 * @param {Object} props.userState props for the UserState
 * @param {Object} props.scope props for the region, project, etc. query. This can be {} or null to not filter.
 * Scope will be limited to those scope values returned by the UserState query. These should not specify ids since
 * the UserState query selects the ids
 * @returns {Task|Just} The resulting Scope objects in a Task or Just.Maybe in the form {data: usersScopeName: [...]}}
 * where ScopeName is the capitalized and pluralized version of scopeName (e.g. region is Regions)
 */
export const makeUserScopeObjsQueryContainer = v(R.curry(
  (apolloConfig,
   {scopeQueryTask, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
   component,
   {userState, scope}) => {
    // Function to tell whether scope props are defined
    const hasScopeParams = () => R.compose(R.length, R.keys)(R.defaultTo({}, scope));
    const userScopeNames = `user${capitalize(scopeName)}s`;

    // Since we only store the id of the scope obj in the userState, if there are other queryParams
    // besides id we need to do a second query on the scope objs directly
    return R.composeK(
      // If we got Result.Ok and there are scope props, query for the user's scope objs
      // Result Object -> Task Object
      result => R.chain(
        ({data}) => {
          const userScopeObjs = reqStrPathThrowing(userScopeNames, data);
          return R.map(
            userScopeObjs => ({data: {[userScopeNames]: userScopeObjs}}),
            R.ifElse(
              hasScopeParams,
              userScopeObjs => queryScopeObjsOfUserStateContainer(
                apolloConfig,
                {scopeQueryTask, scopeName, scopeOutputParams},
                component,
                // The props
                {scope, userScopeObjs}
              ),
              of
            )(userScopeObjs)
          );
        },
        result
      ),
      // First query for UserState
      // Dig into the results and return a Result.Ok with the userScopeNames or a Result.Error if not found,
      // where scope names is 'Regions', 'Projects', etc
      // Result.Error prevents the next query from running
      () => mapQueryTaskToNamedResultAndInputs(
        makeQueryContainer(
          apolloConfig,
          {
            name: 'userStates',
            readInputTypeMapper,
            outputParams: userStateOutputParamsCreator(
              // If we have to query for scope objs separately then just query for their ids here
              R.when(hasScopeParams, R.always(['id']))(scopeOutputParams)
            )
          },
          component,
          // The props
          userState
        ),
        // We only ever get 1 userState since we are querying by user
        `userStates.0.data.${userScopeNames}`,
        userScopeNames
      )
    )();
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['scopeSettings', PropTypes.shape({
      scopeQueryTask: PropTypes.func.isRequired,
      scopeName: PropTypes.string.isRequired,
      readInputTypeMapper: PropTypes.shape().isRequired,
      userStateOutputParamsCreator: PropTypes.func.isRequired,
      scopeOutputParams: PropTypes.array.isRequired
    }).isRequired],
    ['component', PropTypes.shape()],
    ['props', PropTypes.shape({
      userState: PropTypes.shape({
        user: PropTypes.shape({
          id: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number
          ])
        })
      }).isRequired,
      scope: PropTypes.shape().isRequired
    })]
  ], 'makeUserScopeObjsQueryContainer');

/**
 * Given resolved objects from the user state about the scope and further arguments to filter those scope objects,
 * query for the scope objects
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryTask Task querying the scope class, such as makeRegionsQueryContainer
 * @param {String} scopeName The name of the scope, such as 'region' or 'project'
 * @param {[Object]} scopeOutputParams Output parameters for each the scope class query
 * @param {[Object]} scopeArguments Arguments for the scope class query
 * @param {Function} component The optional Apollo Component for compent queries
 * @param {Object} props The props for the queries. userState and scope are required
 * @param {Object} props.userScopeObjs The userScopeObjs in the form {scopeName: {id: x}}
 * where scopeName is 'region', 'project', etc
 * @param {Object} props.scope The scope props for the queries, such as region, project, etc
 * @return {Task|Maybe} Task or Maybe.Just that returns the scope objs that match the scopeArguments
 */
export const queryScopeObjsOfUserStateContainer = v(R.curry(
  (apolloConfig, {scopeQueryTask, scopeName, scopeOutputParams}, component, {scope, userScopeObjs}) => {
    const scopeNamePlural = `${scopeName}s`;
    return R.map(
      // Match any returned scope objs with the corresponding userScopeObjs
      scopeObjsResponse => {
        const matchingScopeObjs = reqPathThrowing(['data', scopeNamePlural], scopeObjsResponse);
        const matchingScopeObjsById = R.indexBy(R.prop('id'), matchingScopeObjs);
        return R.compose(
          compact,
          R.map(
            R.ifElse(
              // Does this user project's project match one of the project ids
              ur => R.has(ur[scopeName].id, matchingScopeObjsById),
              // If so merge the query result for that project with the user project
              ur => R.merge(ur, {[scopeName]: R.prop(ur[scopeName].id, matchingScopeObjsById)}),
              // Otherwise return null, which will remove the user scope obj from the list
              R.always(null)
            )
          )
        )(userScopeObjs);
      },
      // Find scope objs matching the ids and the given scope arguments
      scopeQueryTask(
        apolloConfig,
        {outputParams: scopeOutputParams},
        component,
        R.merge(scope, {
          // Map each scope object to its id
          idIn: R.map(
            R.compose(
              s => parseInt(s),
              reqPathThrowing([scopeName, 'id'])
            ),
            userScopeObjs
          )
        })
      )
    );
  }), [

    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['scopeSettings', PropTypes.shape({
      scopeQueryTask: PropTypes.func.isRequired,
      scopeName: PropTypes.string.isRequired,
      scopeOutputParams: PropTypes.array.isRequired
    }).isRequired],
    ['component', PropTypes.shape()],
    ['props', PropTypes.shape({
      scope: PropTypes.shape().isRequired,
      userScopeObjs: PropTypes.array.isRequired
    })]
  ], 'queryScopeObjsOfUserStateContainer'
);
