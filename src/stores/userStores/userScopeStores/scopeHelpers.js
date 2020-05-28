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
  composeWithChainMDeep,
  mapToNamedPathAndInputs,
  pickDeepPaths,
  reqPathThrowing,
  strPathOr
} from 'rescape-ramda';
import {
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction,
  makeQueryContainer,
  nameComponent
} from 'rescape-apollo';
import PropTypes from 'prop-types';
import {makeUserStateMutationContainer} from '../../userStores/userStateStore';

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
  return R.compose(R.length, R.keys)(R.defaultTo({}, scope));
};

/**
 * Queries scope objects (Region, Project, etc) that are in the scope of the given user. If scopeArguments are
 * specified the returned scope objects are queried by the scopeArguments to possibly reduce those matching
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryContainer Task querying the scope class, such as makeRegionsQueryContainer
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
   {scopeQueryContainer, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
   props) => {
    // Since we only store the id of the scope obj in the userState, if there are other queryParams
    // besides id we need to do a second query on the scope objs directly
    return composeWithComponentMaybeOrTaskChain([
      // If we got Result.Ok and there are scope props, query for the user's scope objs
      // Result Object -> Task Object
      nameComponent('queryScopeObjsOfUserStateContainerIfUserScope', userStatesResponse => {
        const userScopeName = _userScopeName(scopeName);
        const userStateScopePath = `data.userStates.0.data.${userScopeName}`;
        const userScopeObjs = strPathOr(null, userStateScopePath, userStatesResponse);

        return queryScopeObjsOfUserStateContainerIfUserScopeOrOutputParams(apolloConfig, {
          scopeQueryContainer,
          scopeName,
          userScopeName,
          scopeOutputParams
        }, R.merge(props, {userStatesResponse, userScopeObjs}));
      }),

      // First query for UserState
      // Dig into the results and return the userStates witht the scope objects
      // where scope names is 'Regions', 'Projects', etc
      nameComponent('queryUserStates', ({render, children, userState}) => {
        return makeQueryContainer(
          apolloConfig,
          {
            name: 'userStates',
            readInputTypeMapper,
            outputParams: userStateOutputParamsCreator(
              // If we have to query for scope objs separately then
              // pass null to default to the id
              R.when(hasScopeParams, R.always(null))(scopeOutputParams)
            )
          },
          // The props that identify the user state. Either the user state id or user id
          R.merge(
            {render, children},
            pickDeepPaths(['id', 'user.id'], userState)
          )
        );
      })
    ])(props);
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['scopeSettings', PropTypes.shape({
      scopeQueryContainer: PropTypes.func.isRequired,
      scopeName: PropTypes.string.isRequired,
      readInputTypeMapper: PropTypes.shape().isRequired,
      userStateOutputParamsCreator: PropTypes.func.isRequired,
      scopeOutputParams: PropTypes.shape().isRequired
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
      scope: PropTypes.shape()
    })]
  ], 'makeUserStateScopeObjsQueryContainer'
);

/**
 * Calls queryScopeObjsOfUserStateContainer if the scope objects need to be filtered.
 */
const queryScopeObjsOfUserStateContainerIfUserScopeOrOutputParams = R.curry(
  (apolloConfig,
   {scopeQueryContainer, scopeName, userScopeName, scopeOutputParams},
   props
  ) => {
    const scope = R.prop('scope', props);
    return R.ifElse(
      () => {
        // If there are not scope params and scopeOutputParams is minimized, we're done
        return R.and(
          R.complement(hasScopeParams)(scope),
          R.equals({id: 1}, scopeOutputParams)
        );
      },
      // Done, return all of the userScopeObjs in the appropriate containers
      () => {
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: R.prop('userStatesResponse', props)
          }
        );
      },
      // Query to get the desired outputParams and/ore limit by scope params
      props => {
        return queryScopeObjsOfUserStateContainer(
          apolloConfig,
          {scopeQueryContainer, scopeName, userScopeName, scopeOutputParams},
          props
        );
      }
    )(props);
  });

/**
 * Mutates the given scope object (UserRegion, UserProject, etc) that are in the scope of the given user.
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryContainer Task querying the scope class, such as makeRegionsQueryContainer
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
   {scopeQueryContainer, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
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
           scopeQueryContainer, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams,
           userState, scope
         }) => {
          // Query for the scope instance by id
          return makeUserStateScopeObjsQueryContainer(
            apolloConfig,
            {scopeQueryContainer, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams},
            {userState, scope: pickDeepPaths([`${scopeName}.id`], scope)}
          );
        })
    ])({
      apolloConfig,
      scopeQueryContainer, scopeName, readInputTypeMapper, userStateOutputParamsCreator, scopeOutputParams,
      userState, scope
    });
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['scopeSettings', PropTypes.shape({
      scopeQueryContainer: PropTypes.func.isRequired,
      scopeName: PropTypes.string.isRequired,
      readInputTypeMapper: PropTypes.shape().isRequired,
      userStateOutputParamsCreator: PropTypes.func.isRequired,
      scopeOutputParams: PropTypes.shape().isRequired
    }).isRequired
    ],
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
 * @param {Function} scopeQueryContainer Task querying the scope class, such as makeRegionsQueryContainer
 * @param {Object} scopeSettings
 * @param {String} scopeSettings.scopeName The name of the scope, such as 'region' or 'project'
 * @param {[Object]} scopeSettings.scopeOutputParams Output parameters for each the scope class query
 * @param {Object} props The props for the queries. userState and scope are required
 * @param {Object} props.scope Arguments for the scope class query
 * @param {Object} props.userScopeObjs The userScopeObjs in the form {scopeName: {id: x}}
 * where scopeName is 'region', 'project', etc
 * @param {Object} [props.scope] The scope props for the queries, such as region, project, etc.
 * This can be null or {} to not filter by scope
 * @return {Task|Function} Task resolving to or Component resolving to the scope objs that match the scopeArguments
 */
export const queryScopeObjsOfUserStateContainer = v(R.curry(
  (apolloConfig,
   {scopeQueryContainer, scopeName, userScopeName, scopeOutputParams},
   props
  ) => {
    const scopeNamePlural = `${scopeName}s`;
    return composeWithComponentMaybeOrTaskChain([
      // Match any returned scope objs with the corresponding userScopeObjs
      nameComponent('matchUserScopeObjs', scopeObjsResponse => {
        const matchingScopeObjs = R.view(R.lensPath(['data', scopeNamePlural]), scopeObjsResponse) || [];
        const matchingScopeObjsById = R.indexBy(R.prop('id'), matchingScopeObjs);
        const userScopeObjs = R.propOr([], 'userScopeObjs', props);
        return R.compose(
          // Return the task or component with the modified userScopeObj and render props
          matchingUserScopeObjs => {
            const compactedMatchingUserScopeObjs = R.ifElse(
              scopeObjsResponse => R.propOr(null, 'data', scopeObjsResponse),
              () => compact(matchingUserScopeObjs),
              () => null
            )(scopeObjsResponse);
            // If we have compactedMatchingUserScopeObjs, replace these values with the data of scopeObjsResponse
            // scopeObjsResponse is our most recent query, so we inject our data into it
            const scopeUserObjsResponse = R.when(
              R.identity,
              compactedMatchingUserScopeObjs => R.set(
                R.lensProp('data'),
                {[userScopeName]: compactedMatchingUserScopeObjs},
                scopeObjsResponse
              )
            )(compactedMatchingUserScopeObjs);
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction(props),
                // If the data isn't loaded then return scopeObjsResponse, which is either loading or was skipped
                response: scopeUserObjsResponse || scopeObjsResponse
              }
            );
          },
          userScopeObjs => {
            return R.map(
              R.ifElse(
                // Does this user scope's scope object match one of the scope ids
                userScopeObj => {
                  return R.has(userScopeObj[scopeName].id, matchingScopeObjsById);
                },
                // If so merge the query result for that scope object with the user scope version
                userScopeObj => {
                  return R.merge(
                    userScopeObj,
                    {
                      // Get the matching scope object
                      [scopeName]: R.prop(userScopeObj[scopeName].id, matchingScopeObjsById)
                    }
                  );
                },
                // Otherwise return null, which will remove the user scope obj from the list
                () => null
              ),
              userScopeObjs
            );
          }
        )(userScopeObjs);
      }),
      nameComponent('scopeQuery', ({render, children, scope, userScopeObjs}) => {
        return scopeQueryContainer(
          R.merge(
            {
              options: {
                skip: !R.length(userScopeObjs || [])
              }
            },
            apolloConfig
          ),
          {
            outputParams: scopeOutputParams
          },
          R.merge(
            // Limit by an properties in the scope that aren't id
            R.omit(['id'], scope || {}),
            {
              render,
              children,
              // Map each scope object to its id
              idIn: R.map(
                R.compose(
                  s => parseInt(s),
                  userScopeObj => reqPathThrowing([scopeName, 'id'], userScopeObj)
                ),
                // If we don't have any we'll skip the query above
                userScopeObjs || []
              )
            }
          )
        );
      })
    ])(props);
  }), [
  ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
  ['scopeSettings', PropTypes.shape({
    scopeQueryContainer: PropTypes.func.isRequired,
    scopeName: PropTypes.string.isRequired,
    scopeOutputParams: PropTypes.shape().isRequired
  }).isRequired
  ],
  ['props', PropTypes.shape({
    scope: PropTypes.shape(),
    userScopeObjs: PropTypes.array
  })]
], 'queryScopeObjsOfUserStateContainer');
