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
import {v} from '@rescapes/validate';
import {
  capitalize,
  compact, eqStrPath, flattenObj, mapMDeep,
  mergeDeep,
  mergeDeepAll, omitDeep,
  onlyOneThrowing,
  pathOr,
  pickDeepPaths,
  renameKey,
  reqPathThrowing,
  reqStrPathThrowing, strPathEq,
  strPathOr,
  toNamedResponseAndInputs
} from '@rescapes/ramda';
import {
  composeFuncAtPathIntoApolloConfig,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  filterOutReadOnlyVersionProps,
  getRenderPropFunction,
  makeQueryContainer,
  nameComponent
} from '@rescapes/apollo';
import PropTypes from 'prop-types';
import {
  currentUserStateQueryContainer,
  normalizeDefaultUserStatePropsForMutating,
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateMutationContainer,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from '../../userStores/userStateStore.js';
import {inspect} from "util";
import {isResolvePropPathForAllSets} from "@rescapes/ramda/src/monadHelpers";

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
 * @param {Object} apolloConfig
 * @param {Object} apolloConfig.apolloClient The Apollo Client for non-component queries
 * @param {Object} [apolloConfig.options]
 * @param {Function} [apolloConfig.options.variables] Function to limit the props for the scope query. This
 * is not used for the userState query
 * @param {Object} requestConfig
 * @param {Object} [requestConfig.completeWithRenderProp] Default true, set false if this is being
 * used within another call to composeWithComponentMaybeOrTaskChain
 * @param {Function} scopeQueryContainer Task querying the scope class, such as regionsQueryContainer
 * @param {String} scopeName The name of the scope, such as 'region' or 'project'
 * @param {Function} userStateOutputParamsCreator Unary function expecting scopeOutputParams
 * and returning output parameters for each the scope class query. If don't have to query scope separately
 * then scopeOutputParams is passed to this. Otherwise we just was ['id'] since that's all the initial query needs
 * @param {[Object]} [userScopeOutputParams] Output parameters for each the user scope class query. For example
 * {region: {id: 1, name: 1, key: 1}, activity: {isActive: 1}} If null it must be defaulted in the call to
 * userStateOutputParamsCreator
 * @param {Object} userStateArgumentsCreator arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} props Props to query with. userState is required and a scope property that can contain none
 * or more of region, project, etc. keys with their query values
 * @param {Object} [props.userState] props for the UserState. If omitted defaults to the current userState query
 * @param {Object} props.userScope props for the region, project, etc. query in the form {region|project: {}}. This can be {} or null to not filter.
 * Scope will be limited to those scope values returned by the UserState query. These should not specify ids since
 * the UserState query selects the ids
 * @returns {Task|Just} The resulting Scope objects in a Task or Just.Maybe in the form {data: usersScopeName: [...]}}
 * where ScopeName is the capitalized and pluralized version of scopeName (e.g. region is Regions)
 */
export const userStateScopeObjsQueryContainer = v(R.curry(
  (apolloConfig,
   {
     scopeQueryContainer,
     scopeName,
     readInputTypeMapper,
     userStateOutputParamsCreator,
     userScopeOutputParams = {[scopeName]: {id: 1}}
   },
   props) => {
    const scopeOutputParams = R.propOr({}, scopeName, userScopeOutputParams);
    // Since we only store the id of the scope obj in the userState, if there are other queryParams
    // besides id we need to do a second query on the scope objs directly
    return composeWithComponentMaybeOrTaskChain([
      // If we got Result.Ok and there are scope props, query for the user's scope objs
      // Result Object -> Task Object
      nameComponent('queryScopeObjsOfUserStateContainerIfUserScope', userStatesResponse => {
        if (!strPathOr(false, 'data', userStatesResponse)) {
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: userStatesResponse
            }
          );
        }
        const userScopeName = _userScopeName(scopeName);
        const userStateScopePath = `data.userStates.0.data.${userScopeName}`;
        const userScopeObjs = strPathOr(null, userStateScopePath, userStatesResponse);

        return queryScopeObjsOfUserStateContainerIfUserScopeOrOutputParams(apolloConfig, {
          scopeQueryContainer,
          scopeName,
          userScopeName,
          userScopeOutputParams
        }, R.merge(props, {userStatesResponse, userScopeObjs}));
      }),

      // First query for UserState
      // Dig into the results and return the userStates with the scope objects
      // where scope names is 'Regions', 'Projects', etc
      nameComponent('queryUserStates', props => {
        const userPropPaths = ['id', 'user.id'];
        // Use currentUserStateQueryContainer unless user params are specified.
        // Only admins can query for other users (to be controlled on the server)
        const userState = strPathOr({}, 'userState', props);
        const queryContainer = R.any(p => strPathOr(null, p, userState), userPropPaths) ?
          makeQueryContainer :
          currentUserStateQueryContainer;

        return queryContainer(
          mergeDeep(
            apolloConfig,
            // Keep all props
            {
              options: {
                variables: ({userState}) => {
                  return pickDeepPaths(userPropPaths, userState || {});
                },
                errorPolicy: 'all',
                partialRefetch: true
              }
            }
          ),
          {
            name: 'userStates',
            readInputTypeMapper,
            outputParams: userStateOutputParamsCreator(
              // If we have to query for scope objs separately then
              // pass null to default to the id
              R.when(
                () => hasScopeParams(R.omit(['id'], scopeOutputParams)),
                // Just query for the id of the scope object, since we have to query more thoroughly later
                // The userState.data only has the ids of the scope objects. We need to query them separately
                // to get other properties
                userScopeOutputParams => R.over(
                  R.lensProp(scopeName),
                  () => ({id: 1}),
                  userScopeOutputParams
                )
              )(userScopeOutputParams)
            )
          },
          props
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
      userScopeOutputParams: PropTypes.shape()
    }).isRequired],
    ['props', PropTypes.shape({
      userState: PropTypes.shape({
        user: PropTypes.shape({
          id: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number
          ])
        })
      }),
      scope: PropTypes.shape()
    })]
  ], 'userStateScopeObjsQueryContainer'
);

/**
 * Calls queryScopeObjsOfUserStateContainer if the scope objects need to be filtered.
 */
const queryScopeObjsOfUserStateContainerIfUserScopeOrOutputParams = R.curry(
  (apolloConfig,
   {scopeQueryContainer, scopeName, userScopeName, userScopeOutputParams},
   props
  ) => {
    const userScope = R.prop('userScope', props);
    const scopeOutputParams = R.propOr({}, scopeName, userScopeOutputParams);
    return R.ifElse(
      () => {
        // If there are not no-id scope params and scopeOutputParams is minimized, we're done
        // We don't need to query if we already have the scope ids we need and we don't need other properties
        // of those scope objects
        return R.and(
          // userScope is empty or just filtering by scope id
          R.compose(
            flattened => !R.length(R.keys(flattened)),
            userScope => flattenObj(userScope),
            userScope => R.over(
              R.lensProp(scopeName),
              scopeProps => R.omit(['id'], scopeProps), userScope
            ),
          )(userScope),
          // Only requesting id from the userScope instances
          R.and(
            R.equals(1, R.length(R.keys(scopeOutputParams))),
            R.propOr(false, 'id', scopeOutputParams)
          )
        );
      },
      // Done, return all of the userScopeObjs in the appropriate containers
      () => {
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: reqStrPathThrowing('userStatesResponse', props)
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
 * @param {Object} options
 * @param {Function} [options.normalizeUserStatePropsForMutating] Default normalizeDefaultUserStatePropsForMutating. UserState normalization function
 * @param {Function} options.scopeQueryContainer Task querying the scope class, such as regionsQueryContainer
 * @param {String} options.scopeName The name of the scope, such as 'region' or 'project'
 * @param {Function} userStateOutputParamsCreator Unary function expecting scopeOutputParams
 * and returning output parameters for each the scope class query. If don't have to query scope seperately
 * then scopeOutputParams is passed to this. Otherwise we just was ['id'] since that's all the initial query needs
 * @param {[Object]} userScopeOutputParams Output parameters for the user state mutation
 * @param {Object} userStateArgumentsCreator arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} props Props to query with. userState is required and a scope property that can contain none
 * or more of region, project, etc. keys with their query values
 * @param {Object} [props.userState] props for the UserState. Defaults to the current user
 * @param {Object} [props.userState.id] Either this or user.id can be used to identify the user
 * @param {Object} [props.userState.user.id]
 * @param {Object} props.userScope userRegion, userProject, etc. query to add/update in the userState.
 * @param {Number} props.userScope.[region|project].id
 * Required id of the scope instance to add or update within userState.data[scope]
 * @returns {Task|Just} The resulting Scope objects in a Task or Just.Maybe in the form {
 * createUserState|updateUserState: {userState: {data: [userScopeName]: [...]}}}}
 * where userScopeName is the capitalized and pluralized version of scopeName (e.g. region is UserRegions)
 */
export const userStateScopeObjsMutationContainer = v(R.curry(
  (apolloConfig,
   {normalizeUserStatePropsForMutating=normalizeDefaultUserStatePropsForMutating, scopeQueryContainer, scopeName, readInputTypeMapper, userStateOutputParamsCreator, userScopeOutputParams},
   {userState, userScope, render, ...props}) => {

    if (!userScope) {
      return userStateMutationContainer(
        // Skip if we don't have the variable ready
        R.set(R.lensPath(['options', 'skip']), true, apolloConfig),
        {
          outputParams: userStateOutputParamsCreator(
            userScopeOutputParams
          ),
          normalizeUserStatePropsForMutating
        },
        {userState: null, render, ...props}
      );
    }

    const userScopeName = _userScopeName(scopeName);
    return composeWithComponentMaybeOrTaskChain([
      // If there is a match with what the caller is submitting, update it, else add it
      nameComponent('userStateMutation', userScopeObjsResponse => {

          // If we are in a loading or error state, return the response without proceeding
          if (R.any(prop => R.prop(prop, userScopeObjsResponse), ['loading', 'error'])) {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                response: userScopeObjsResponse
              }
            );
          }
          // Find the userScopeObjs that we just queried for
          // There might be none if nothing in our userState exists yet
          const existingUserScopeObjs = strPathOr(null, `data.userStates.0.data.${userScopeName}`, userScopeObjsResponse);

          // Operate on the userScope instances in useState
          const userStateWithCreatedOrUpdatedScopeObj = R.over(
            R.lensPath(['data', userScopeName]),
            (userScopeObjs = []) => {
              // First merge userScope with what's in the given userState
              const [existingUserScopeObjsById, userScopeObjsById, userScopeById] = R.map(
                userScopeObjs => {
                  return R.compose(
                    userScopeObjs => R.indexBy(
                      userScopeObj => {
                        return reqPathThrowing(
                          [scopeName, 'id'],
                          userScopeObj
                        );
                      },
                      userScopeObjs
                    ),
                    userScopeObjs => R.map(
                      userScopeObj => {
                        // Modify the scope instance to only contain the id. We can't submit any changes to the scope instance
                        return R.over(
                          R.lensProp(scopeName),
                          scopeInstance => R.pick(['id'], scopeInstance),
                          userScopeObj
                        );
                      },
                      userScopeObjs
                    )
                  )(userScopeObjs);
                },
                [existingUserScopeObjs || [], userScopeObjs || [], [userScope]]
              );
              // Merge deep all userScopeObjs. When matches exist prefer those in userState over existing,
              // and prefer userScope over all.
              const merged = mergeDeepAll([
                existingUserScopeObjsById,
                userScopeObjsById,
                userScopeById
              ]);
              // Return the merged values
              return R.values(merged);
            }
          )(userState);
          // Save the changes to the userScope objs
          return userStateMutationContainer(
            // Skip if we don't have the variable ready
            R.over(
              R.lensPath(['options', 'skip']),
              skip => skip || R.complement(R.propOr)(false, 'data', userScopeObjsResponse),
              apolloConfig
            ),
            {
              outputParams: userStateOutputParamsCreator(
                userScopeOutputParams
              ),
              normalizeUserStatePropsForMutating
            },
            {userState: userStateWithCreatedOrUpdatedScopeObj, render}
          );
        }
      ),
      // Query for userScopeObjs that match the userScope
      nameComponent('queryUserScopeObjs',
        ({
           userState, userScope, render
         }) => {
          // Query for the userScope instance by id to see if the userState already contains the userScope object
          // UserState defaults to the current user
          return userStateScopeObjsQueryContainer(
            apolloConfig,
            {
              scopeQueryContainer,
              scopeName,
              readInputTypeMapper,
              userStateOutputParamsCreator,
              userScopeOutputParams
            },
            {
              // We can only query userState by id or user.id or neither to use the current user
              userState: pickDeepPaths(['id', 'user.id'], userState),
              userScope: pickDeepPaths([`${scopeName}.id`], userScope),
              render
            }
          );
        }
      )
    ])(
      {userState: userState || {}, userScope, render, ...props}
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['scopeSettings', PropTypes.shape({
      scopeQueryContainer: PropTypes.func.isRequired,
      scopeName: PropTypes.string.isRequired,
      readInputTypeMapper: PropTypes.shape().isRequired,
      userStateOutputParamsCreator: PropTypes.func.isRequired,
      userScopeOutputParams: PropTypes.shape().isRequired
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
      }),
      // Not required when setting up mutation
      userScope: PropTypes.shape({})
    })]
  ], 'userStateScopeObjsMutationContainer');

/**
 * Given resolved objects from the user state about the scope and further arguments to filter those scope objects,
 * query for the scope objects
 * @param {Object} apolloClient The Apollo Client
 * @param {Function} scopeQueryContainer Task querying the scope class, such as regionsQueryContainer
 * @param {Object} scopeSettings
 * @param {String} scopeSettings.scopeName The name of the scope, such as 'region' or 'project'
 * @param {[Object]} scopeSettings.scopeOutputParams Output parameters for each the scope class query
 * @param {Object} props The props for the queries. userState and scope are required
 * @param {Object} props.scope Arguments for the scope class query. ids are ignored but other properties are passed
 * unless we don't have any usersScopeObjects, in which cases ids are passed
 * @param {Object} props.userScopeObjs The userScopeObjs in the form {scopeName: {id: x}}
 * where scopeName is 'region', 'project', etc
 * @param {Object} [props.scope] The scope props for the queries, such as region, project, etc.
 * This can be null or {} to not filter by scope
 * @return {Task|Object} Task resolving to or Component resolving to the scope objs that match the scopeArguments
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
        // If we are in a loading or error state, return the response without proceeding
        if (R.any(prop => R.prop(prop, scopeObjsResponse), ['loading', 'error'])) {
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response: scopeObjsResponse
            }
          );
        }

        const matchingScopeObjs = pathOr([], ['data', scopeNamePlural], scopeObjsResponse)
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
                {userStates: [{data: {[userScopeName]: compactedMatchingUserScopeObjs}}]},
                scopeObjsResponse
              )
            )(compactedMatchingUserScopeObjs);
            return containerForApolloType(
              apolloConfig,
              {
                // The render prop is based with the response for components
                render: getRenderPropFunction(scopeObjsResponse),
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

      // Find the scope instances that match the ids of userScopeObj
      nameComponent('scopeQueryContainer', props => {
        const {userScope, userScopeObjs} = props;
        const scopeProps = R.prop(scopeName, userScope);
        // Hack, filter by activity.isActive. We have no way to filter by non scope objects yet.
        // TODO This should instead by done by setting variables within the graphql query: e.g. userRegions(variables)
        // but we don't support that yet on the client
        const _userScopeObjs = R.filter(
          userScopeObj => !R.has('activity', userScope) || eqStrPath('activity.isActive', userScope, userScopeObj),
          userScopeObjs
        )
        return scopeQueryContainer(
          composeFuncAtPathIntoApolloConfig(
            R.mergeDeepRight(
              apolloConfig,
              {
                options: {
                  // If userScopeObjs is null, it means a dependent query is not ready
                  // See userStateScopeObjsQueryContainer for an example
                  // If it is simply empty, we still want to query
                  skip: !userScopeObjs
                }
              }
            ),
            'options.variables',
            _props => {
              // If there is not a previous filter, filter
              return R.when(
                () => {
                  return R.complement(strPathOr)(false, 'options.variables', apolloConfig);
                },
                p => {
                  const userScopeObjs = R.propOr(null, 'userScopeObjs', p);
                  return R.merge(
                    // Limit by any properties in the scope that aren't id. Keep id if we don't have userScopeObjs
                    R.omit(R.length(userScopeObjs || []) ? ['id'] : [], scopeProps || {}),
                    R.filter(R.length, {
                      // Map each scope object to its id
                      idIn: R.map(
                        userScopeObj => reqPathThrowing([scopeName, 'id'], userScopeObj),
                        // If we don't have any we'll skip the query above
                        userScopeObjs || []
                      )
                    })
                  );
                }
              )(_props);
            }
          ),
          {
            outputParams: scopeOutputParams
          },
          R.merge(props, {userScopeObjs: _userScopeObjs})
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

/**
 * Matches 0 or 1 userState scope instances for the scope given by scopeName (e.g. region, project, location).
 * The predicate is called for each scope instance.
 * @param {String} scopeName Scope name. If 'project', the userState.data.userProjects array is sought.
 * Each user scope instance (e.g. userProject) is called on predicate for a match.
 * @param {Function} predicate. Unary function expecting a UserState scope instance. For example strPathOr(false, 'activity.isActive')
 * to find UserState scope instance that is active.
 * @param {Object} userState The userState to search or null
 * @returns {Object} The matching UserState scope instance (e.g. the UserState project {activity: {isActive: true}, selection: {isSelected: true}, project}
 * Raises an error if multiple values match the predicate. Use matchingUserStateScopeInstances to support multiple matches
 */
export const matchingUserStateScopeInstance = R.curry((scopeName, predicate, userState) => {
  return R.compose(
    R.head,
    onlyOneThrowing,
    matchingUserStateScopeInstances(scopeName, predicate)
  )(userState);
});

/**
 * Matches 0 or more userState scope instances for the scope given by scopeName (e.g. region, project, location).
 * The predicate is called for each scope instance.
 * @param {String} scopeName Scope name. If 'project', the userState.data.userProjects array is sought.
 * Each user scope instance (e.g. userProject) is called on predicate for a match.
 * @param {Function} predicate. Unary function expecting a UserState scope instance. For example strPathOr(false, 'selection.isSelected')
 * to find UserState scope instance that is active.
 * @param {Object} userState The userState to search or null
 * @returns {Object} The matching UserState scope instances (e.g. the UserState projects
 * [{selection: {isSelected: true}, activity: {isActive: true}, project}, {selection: {isSelected: true}, activity: {isActive: false}, project}]
 */
export const matchingUserStateScopeInstances = R.curry((scopeName, predicate, userState) => {
  const userScopeName = _userScopeName(scopeName);
  return R.filter(
    predicate,
    strPathOr([], `data.${userScopeName}`, userState)
  );
});

/**
 * Converts the prop at userScopeName with scope key scopeName to be called userScope
 * E.g. {userRegion: {region: ...}} is renamed {userScope: {region: ...}}
 * @param {String} userScopeName E.g. 'userRegion'
 * @param {String} scopeName E.g. 'region'
 * @param {Object} props
 * @returns {Object} The renamed prop to userScope and the other props that were in the propSets
 */
export const userScopeOrNullAndProps = (userScopeName, scopeName, props) => {
  return R.when(
    R.propOr(false, userScopeName),
    propSets => {
      return R.compose(
        propSets => renameKey(R.lensPath([]), userScopeName, 'userScope', propSets),
        propSets => R.over(R.lensPath([userScopeName, scopeName]), region => {
          // Simplify the region we are querying for. We can't query for version props
          return filterOutReadOnlyVersionProps(region);
        }, propSets)
      )(propSets);
    }
  )(props);
};

/**
 * Find the userScope instance that matches props[scopeInstancePropPath] by id
 * @param {Object} config
 * @param {String} config.userScopeCollectionName collection in props.userState.data, e,g. 'userProjects' or 'userRegions'
 * @param {String} config.scopeName The name of the scope instance in the user scope instance, e.g. 'project', or 'region'
 * @param {String} config.userStatePropPath The userState in props. For instance 'userState' or 'userStateResponse.data.userStates.0'
 * @param {String} config.scopeInstancePropPath The key props that points to the scope instance that we want to look
 * for in the user scopes
 * @param {Object} props The props to scour
 * @returns {Object} The matching userScope instance or undefined
 */
export const findUserScopeInstance = (
  {userScopeCollectionName, scopeName, userStatePropPath, scopeInstancePropPath},
  props) => {
  return R.compose(
    ({userScopes, scopeInstance}) => {
      return scopeInstance && R.find(
        userScope => {
          // Find a userScope.scope instance id that matches scopeInstances's id
          return R.eqProps(
            'id',
            scopeInstance,
            reqStrPathThrowing(scopeName, userScope)
          );
        },
        userScopes
      );
    },
    toNamedResponseAndInputs('scopeInstance',
      // If there is no scope instance in the props return null. The mutation won't be able to run
      // until we specify one.
      props => strPathOr(null, scopeInstancePropPath, props)
    ),
    toNamedResponseAndInputs('userScopes',
      // If there are no userStates then we can't find the one matching the scope instance, return empty
      props => strPathOr([], `${userStatePropPath}.data.${userScopeCollectionName}`, props)
    )
  )(props);
};


/**
 * Like findUserScopeInstance but can also use a combination of the scope instance and userState
 * to resolve the user scope instance. E.g. if a region and userState are given, the userState.data.userRegions
 * userRegion corresponding to region is returned if present.
 *
 * If the userScope instance is not found an error is thrown, since it is assumed that the user scope instance
 * is already expect to be present in the userState.data.
 * @param {String} scopeName Required scope name 'region' for userRegions or 'project' for userProjects
 * @param {String} userStatePropPath Required propSets path to the userState, e.g. 'userState'
 * @param {String} [scopeInstancePropPath] Required if userScopeInstancePropPath not given. propSets path to the scope instance, e.g' 'region' or 'project'
 * @param {String} [userScopeInstancePropPath] Required if scopeInstancePropPath not given. propSets path to the scope instance, e.g' 'userRegion' or 'userProject'
 * @param propSets {Object} Must contain a userState at userStatePropPath. Must contain either a scope instance
 * at scopeInstancePropPath or a user scope instance
 * @returns {Object} The resolved userScope instance at the key userScope.
 * userScope can resolve to null/undefined if something isn't loaded yet, but an error is thrown if propSets
 * lacks both properties scopeInstancePropPath and scopeInstancePropPath, which indicates a bad configuration
 */
export const userScopeFromProps = (
  {
    scopeName,
    userStatePropPath,
    userScopeInstancePropPath,
    scopeInstancePropPath
  }, propSets) => {
  return R.cond([
    [
      // If the userScope instance is given
      propSets => R.has(userScopeInstancePropPath, propSets),
      // Null is okay here. It means that the userScope instance is expected but not loaded yet
      // Returns propSets with userScope prop added
      propSets => {
        return findUserScopeInstance({
            userScopeCollectionName: `user${capitalize(scopeName)}s`,
            scopeName,
            userStatePropPath,
            scopeInstancePropPath: scopeName
          },
          R.compose(
            // Remove the user scope instance from the propSets
            propSets => R.omit([userScopeInstancePropPath], propSets),
            // Get the scopeName instance from the userScopeInstance
            propSets => R.merge({[scopeName]: pathOr(undefined, [userScopeInstancePropPath, scopeName], propSets)}, propSets)
          )(propSets)
        )
      }
    ],
    [
      // If the scope instance is given
      propSets => R.has(scopeInstancePropPath, propSets),
      propSets => {
        // Null is okay here. It means that the scope instance is expected but not loaded yet
        return findUserScopeInstance({
            userScopeCollectionName: `user${capitalize(scopeName)}s`,
            scopeName,
            userStatePropPath,
            scopeInstancePropPath
          },
          propSets
        )
      }
    ],
    [R.T,
      propSets => {
        throw new Error(`Expected either user scope instance in propSets at ${userScopeInstancePropPath} or 
        scope instance in propSets at ${scopeInstancePropPath}. Got instead ${inspect(propSets)}`)
      }
    ]
  ])(propSets)
}



/***
 * Calls userScopeFromProps to resolve the user scope instance (userRegion or userProject)
 * and additionally adds the value propSets[...setPropPath...] * to userScope[...setPath...].
 * This method is used to create convenient API methods that set a given property of
 * user.data.userRegions|userProjects[x].[...setPath...] when the caller specifies the userState and current
 * region or project and the values to set. For instance, if a caller wanted to make a certain region the active region
 * for the current user, they could pass the userState, that region, and {activity: {active: true}} to an API method
 * designed to make the given region active and the others inactive.
 * @param {Object} config
 * @param {String} config.scopeName Required scope name 'region' for userRegions or 'project' for userProjects
 * @param {String} config.userStatePropPath Required propSets path to the userState, e.g. 'userState'
 * @param {String} [config.scopeInstancePropPath] Required if userScopeInstancePropPath not given. propSets path to the scope instance, e.g' 'region' or 'project'
 * @param {String} [config.userScopeInstancePropPath] Required if scopeInstancePropPath not given. propSets path to the scope instance, e.g' 'userRegion' or 'userProject'
 * @param {String | [String]} config.setPath Array or string path used to make a lens to set the value at propSets[setPropPath]
 * @param {String} config.setPropPath String path of value in propSets to use for setting
 * @param propSets {Object} Must contain a userState at userStatePropPath. Must contain either a scope instance
 * at scopeInstancePropPath or a user scope instance
 * @returns {Object} The resolved and user scope instance with setPath set to propSets[...setPropPath...]
 * If anything isn't available then null is returned
 */
export const setPathOnResolvedUserScopeInstance = (
  {
    scopeName,
    userStatePropPath,
    userScopeInstancePropPath,
    scopeInstancePropPath,
    setPath,
    setPropPath
  },
  propSets) => {
  // If any propPathSet doesn't have a corresponding value in propSets, return null.
  // This indicates a loading state or lack of selection by the user
  if (!isResolvePropPathForAllSets(propSets,  [
    [userStatePropPath],
    [setPropPath],
    [userScopeInstancePropPath, scopeInstancePropPath]]
  )) {
    return null;
  }
  return R.compose(
    // Set setPath to the object at setPropPath if userScope was resolved
    userScope => {
      return R.when(
        R.identity,
        userScope => R.set(
          R.lensPath(R.unless(Array.isArray, R.split('.'), setPath)),
          reqStrPathThrowing(setPropPath, propSets),
          userScope
        )
      )(userScope)
    },
    // Extract the userScope instance, either a userRegion or userProject
    propSets => userScopeFromProps({
        scopeName,
        userStatePropPath,
        userScopeInstancePropPath,
        scopeInstancePropPath,
      },
      propSets
    )
  )(propSets)
}
