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
import {
  capitalize,
  compact,
  reqPathThrowing,
  reqStrPathThrowing,
  composeWithChainMDeep,
  mapToNamedResponseAndInputs, pickDeepPaths, strPathOr, strPathOrNullOk, mapToNamedPathAndInputs
} from 'rescape-ramda';
import {of} from 'folktale/concurrency/task';
import {makeQueryContainer} from 'rescape-apollo';
import {mapQueryTaskToNamedResultAndInputs, containerForApolloType} from 'rescape-apollo';
import PropTypes from 'prop-types';
import {makeUserStateMutationContainer} from '../userStore';

/**
 * returns userState.data.user[Project|Region]` based on scopeName = 'project' \ 'region'
 * @param scopeName
 * @return {string} The attribute of userState.data
 * @private
 */
const _userScopeName = scopeName => {
  return `user${capitalize(scopeName)}s`;
};

/* Function to tell whether scope props are defined */
const hasScopeParams = scope => {
  return () => {
    return R.compose(R.length, R.keys)(R.defaultTo({}, scope));
  };
};

/**
 * Queries scope objects (Region, Project, etc) that are in the scope of the given user. If scopeArguments are
 * specified the returned scope objects are queried by the scopeArguments to possibly reduce those matching
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryTask Task querying the scope class, such as makeRegionsQueryContainer
 * @param {String} scopeName The name of the scope, such as 'region' or 'project'
 * @param {Function} userStateOutputParamsCreator Unary function expecting scopeOutputParams
 * and returning output parameters for each the scope class query. If don't have to query scope separately
 * then scopeOutputParams is passed to this. Otherwise we just was ['id'] since that's all the initial query needs
 * @param {[Object]} scopeOutputParams Output parameters for each the scope class query
 * @param {Object} userStateArgumentsCreator arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} props Props to query with. userState is required and a scope property that can contain none
 * or more of region, project, etc. keys with their query values
 * @param {Object} props.userState props for the UserState
 * @param {Object} props.scope props for the region, project, etc. query. This can be {} or null to not filter.
 * Scope will be limited to those scope values returned by the UserState query. These should not specify ids since
 * the UserState query selects the ids
 * @returns {Task|Just} The resulting Scope objects in a Task or Just.Maybe in the form {data: usersScopeName: [...]}}
 * where ScopeName is the capitalized and pluralized version of scopeName (e.g. region is Regions)
 */
export const makeUserStateScopeObjsQueryContainer = v(R.curry(
  (apolloConfig,
   {scopeQueryTask, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
   {userState, scope}) => {
    const userScopeNames = _userScopeName(scopeName);
    // Since we only store the id of the scope obj in the userState, if there are other queryParams
    // besides id we need to do a second query on the scope objs directly
    return composeWithChainMDeep(1, [
      // If we got Result.Ok and there are scope props, query for the user's scope objs
      // Result Object -> Task Object
      result => {
        return R.chain(
          ({data}) => {
            // This can be null or empty, but not undefined
            const userScopeObjs = strPathOrNullOk(undefined, userScopeNames, data);
            if (typeof userScopeObjs === 'undefined') {
              throw new Error(`data lacks property ${userScopeNames}: ${JSON.stringify(data, null, 2)}`);
            }
            // If there are no userScopeObj return an empty response
            else if (!userScopeObjs || !R.length(userScopeObjs)) {
              return containerForApolloType(apolloConfig, {data: {[userScopeNames]: []}});
            }

            return R.map(
              userScopeObjs => {
                return ({data: {[userScopeNames]: userScopeObjs}});
              },
              R.ifElse(
                userScopeObjs => {
                  return hasScopeParams(scope, userScopeObjs);
                },
                userScopeObjs => {
                  return queryScopeObjsOfUserStateContainer(
                    apolloConfig,
                    {scopeQueryTask, scopeName, scopeOutputParams},
                    // The props
                    {scope, userScopeObjs}
                  );
                },
                of
              )(userScopeObjs || [])
            );
          },
          result
        );
      },
      // First query for UserState
      // Dig into the results and return a Result.Ok with the userScopeNames or a Result.Error if not found,
      // where scope names is 'Regions', 'Projects', etc
      // Result.Error prevents the next query from running
      () => {
        return mapQueryTaskToNamedResultAndInputs(
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
            // The props
            R.pick(['id'], userState)
          ),
          // We only ever get 1 userState since we are querying by user
          `userStates.0.data.${userScopeNames}`,
          userScopeNames
        );
      }
    ])();
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
  ], 'makeUserStateScopeObjsQueryContainer');

/**
 * Mutates the given scope object (UserRegion, UserProject, etc) that are in the scope of the given user.
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryTask Task querying the scope class, such as makeRegionsQueryContainer
 * @param {String} scopeName The name of the scope, such as 'region' or 'project'
 * @param {Function} userStateOutputParamsCreator Unary function expecting scopeOutputParams
 * and returning output parameters for each the scope class query. If don't have to query scope seperately
 * then scopeOutputParams is passed to this. Otherwise we just was ['id'] since that's all the initial query needs
 * @param {[Object]} scopeOutputParams Output parameters for the user state mutation
 * @param {Object} userStateArgumentsCreator arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} props Props to query with. userState is required and a scope property that can contain none
 * or more of region, project, etc. keys with their query values
 * @param {Object} props.userState props for the UserState
 * @param {Object} props.scope userRegion, userProject, etc. query to add/update in the userState.
 * @param {Number} props.scope.[region|project].id
 * Required id of the scope instance to add or update within userState.data[scope]
 * @returns {Task|Just} The resulting Scope objects in a Task or Just.Maybe in the form {
 * createUserState|updateUserState: {userState: {data: [userScopeName]: [...]}}}}
 * where userScopeName is the capitalized and pluralized version of scopeName (e.g. region is UserRegions)
 */
export const makeUserStateScopeObjsMutationContainer = v(R.curry(
  (apolloConfig,
   {scopeQueryTask, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
   {userState, scope}) => {
    const userScopeName = _userScopeName(scopeName);
    return composeWithChainMDeep(1, [
      // If there is a match with what the caller is submitting, update it, else add it
      ({userStateOutputParamsCreator, userState, userScopeObjs}) => {
        // We have 1 or 0 scope objects. 1 for update case, 0 for insert case
        const userScopeObj = R.head(userScopeObjs);
        const userStateWithCreatedOrUpdatedScopeObj = R.over(
          R.lensPath(['data', userScopeName]),
          _scopeObjs => {
            const scopeObjs = R.defaultTo([], _scopeObjs);
            const matchingScopeInstance = R.find(
              // Find the matching project if there is one
              scopeObj => R.propEq('id', R.propOr(null, 'id', userScopeObj))(scopeObj),
              scopeObjs
            );
            const index = R.indexOf(matchingScopeInstance, scopeObjs);
            return R.ifElse(
              () => R.lte(0, index),
              // If we are updated merge in the matching obj
              scopeObjs => {
                return R.over(
                  R.lensIndex(index),
                  scopeObj => {
                    return R.merge(scopeObj, scope);
                  },
                  scopeObjs
                );
              },
              // Otherwise insert it
              scopeObjs => {
                return R.concat(scopeObjs, [scope]);
              }
            )(scopeObjs);
          }
        )(userState);
        // Save the changes to the scope objs
        return makeUserStateMutationContainer(
          apolloConfig,
          {
            outputParams: userStateOutputParamsCreator(
              // If we have to query for scope objs separately then just query for their ids here
              R.when(s => hasScopeParams(s), R.always(['id']))(scopeOutputParams)
            )
          },
          userStateWithCreatedOrUpdatedScopeObj
        );
      },
      // Query for userScopeObjs that match the scope
      mapToNamedPathAndInputs('userScopeObjs', `data.${userScopeName}`,
        ({
           apolloConfig,
           scopeQueryTask, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams,
           userState, scope
         }) => {
          // Query for the scope instance by id
          return makeUserStateScopeObjsQueryContainer(
            apolloConfig,
            {scopeQueryTask, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
            {userState, scope: pickDeepPaths([`${scopeName}.id`], scope)}
          );
        })
    ])({
      apolloConfig,
      scopeQueryTask, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams,
      userState, scope
    });
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
    ['props', PropTypes.shape({
      userState: PropTypes.shape({
        user: PropTypes.shape({
          id: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number
          ])
        })
      }).isRequired,
      scope: PropTypes.shape({}).isRequired
    })]
  ], 'makeUserStateScopeObjsMutationContainer');

/**
 * Given resolved objects from the user state about the scope and further arguments to filter those scope objects,
 * query for the scope objects
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryTask Task querying the scope class, such as makeRegionsQueryContainer
 * @param {Object} scopeSettings
 * @param {String} scopeSettings.scopeName The name of the scope, such as 'region' or 'project'
 * @param {[Object]} scopeSettings.scopeOutputParams Output parameters for each the scope class query
 * @param {Object} props The props for the queries. userState and scope are required
 * @param {Object} props.scope Arguments for the scope class query
 * @param {Object} props.userScopeObjs The userScopeObjs in the form {scopeName: {id: x}}
 * where scopeName is 'region', 'project', etc
 * @param {Object} props.scope The scope props for the queries, such as region, project, etc
 * @return {Task|Maybe} Task or Maybe.Just that returns the scope objs that match the scopeArguments
 */
export const queryScopeObjsOfUserStateContainer = v(R.curry(
  (apolloConfig,
   {scopeQueryTask, scopeName, scopeOutputParams},
   {scope, userScopeObjs}
  ) => {
    const scopeNamePlural = `${scopeName}s`;
    return R.map(
      // Match any returned scope objs with the corresponding userScopeObjs
      scopeObjsResponse => {
        const matchingScopeObjs = reqPathThrowing(['data', scopeNamePlural], scopeObjsResponse);
        const matchingScopeObjsById = R.indexBy(R.prop('id'), matchingScopeObjs);
        return R.compose(
          values => compact(values),
          R.map(
            R.ifElse(
              // Does this user project's project match one of the project ids
              userScopeObj => {
                return R.has(userScopeObj[scopeName].id, matchingScopeObjsById);
              },
              // If so merge the query result for that scope object with the user project
              userScopeObj => {
                return R.merge(
                  userScopeObj,
                  {
                    [scopeName]: R.compose(
                      // Convert the string id to int
                      matchingScopeObj => R.over(R.lensProp('id'), id => parseInt(id), matchingScopeObj),
                      // Get the matching scope object
                      matchingScopeObjsById => R.prop(userScopeObj[scopeName].id, matchingScopeObjsById)
                    )(matchingScopeObjsById)
                  }
                );
              },
              // Otherwise return null, which will remove the user scope obj from the list
              () => null
            )
          )
        )(userScopeObjs);
      },
      // Find scope objs matching the ids and the given scope arguments
      scopeQueryTask(
        apolloConfig,
        {outputParams: scopeOutputParams},
        R.merge(
          // Limit by an properties in the scope that aren't id
          R.omit(['id'], R.propOr({}, scopeName, scope)), {
            // Map each scope object to its id
            idIn: R.map(
              R.compose(
                s => parseInt(s),
                userScopeObj => reqPathThrowing([scopeName, 'id'], userScopeObj)
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
    ['props', PropTypes.shape({
      scope: PropTypes.shape().isRequired,
      userScopeObjs: PropTypes.array.isRequired
    })]
  ], 'queryScopeObjsOfUserStateContainer'
);
