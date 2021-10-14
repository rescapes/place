import {
  currentUserStateQueryContainer,
  normalizeDefaultUserStatePropsForMutating,
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateMutationContainer,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from "../userStateStore.js";
import {
  _userScopeName,
  getPathOnResolvedUserScopeInstances,
  hasScopeParams,
  setPathOnResolvedUserScopeInstance
} from "./userScopeHelpers.js";
import * as R from 'ramda'
import {
  capitalize,
  compact,
  eqStrPath,
  flattenObj,
  mergeDeep,
  mergeDeepAll,
  pathOr,
  pickDeepPaths, renameKey,
  reqPathThrowing,
  reqStrPathThrowing,
  strPathOr
} from "@rescapes/ramda";
import {
  composeFuncAtPathIntoApolloConfig,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction,
  makeQueryContainer,
  mapTaskOrComponentToNamedResponseAndInputs,
  nameComponent
} from "@rescapes/apollo";
import {v} from "@rescapes/validate";
import PropTypes from 'prop-types'

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
  }
);

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
 * Mutates the given scope object (UserRegion, UserProject, etc) that are in the scope of the given user.
 * @param {Object} apolloClient The Apollo Client
 * @param {Object} options
 * @param {Function} [options.normalizeUserStatePropsForMutating] Default normalizeDefaultUserStatePropsForMutating. UserState normalization function
 * @param {Function} options.scopeQueryContainer Task querying the scope class, such as regionsQueryContainer
 * @param {String} options.scopeName The name of the scope, such as 'region' or 'project'
 * @[aram {String} [options.userStatePropPath] Default 'userState', path in the props to the userState, e.g.
 * 'queryCurrentUserState.data.userStates.0'
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
     {
       normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating,
       scopeQueryContainer,
       scopeName,
       readInputTypeMapper,
       userStateOutputParamsCreator,
       userScopeOutputParams,
       userStatePropPath = 'userState'
     },
     {userScope, render, ...props}) => {

      const userState = strPathOr(null, userStatePropPath, props)
      if (!userScope) {
        return userStateMutationContainer(
          // Skip if we don't have the variable ready
          R.set(R.lensPath(['options', 'skip']), true, apolloConfig),
          {
            outputParams: userStateOutputParamsCreator(
              userScopeOutputParams
            ),
            normalizeUserStatePropsForMutating,
            userStatePropPath
          },
          {render, ...props}
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
      // Not required when setting up mutation
      userScope: PropTypes.shape({})
    })]
  ], 'userStateScopeObjsMutationContainer');

/***
 * Convenience method for mutating the userState after setting a property on a target userScope instance
 * For instance, a method can be made to set the {activity: isActive: true|false} of the targeted userRegion or
 * userProject
 * @param apolloConfig
 * @param {Object} config
 * @param {Function} scopeQueryContainer Query container for resolving the scope instance, namely
 * regionsQueryContainer or projectsQueryContainer
 * @param {String} config.scopeName Required scope name 'region' for userRegions or 'project' for userProjects
 * @param {String} config.userStatePropPath Required propSets path to the userState, e.g. 'userState'
 * @param {String} config.scopeInstancePropPath Required propSets path the the scope instance, e.g' 'region' or 'project'
 * @param {String} config.userScopeInstancePropPath Required propSets path the the scope instance, e.g' 'userRegion' or 'userProject'
 * @param {String | [String]} config.setPath Array or string path used to make a lens to set the value at propSets[setPropPath]
 * @param {String} config.setPropPath String path of value in propSets to use for setting
 * @param {Function} [config.normalizeUserStatePropsForMutating] Default normalizeDefaultUserStatePropsForMutating.
 * apolloConfig.options.variables function to normalized the
 * userState, including the targeted user scope instance. This function must remove values in userState.data
 * instances not expected by the server, such as userState.data.userRegions[*].region.name (region should only
 * provide id)
 * @param propSets {Object} Must contain a userState at userStatePropPath. Must contain either a scope instance
 * @returns {*}
 */
export const userStateScopeObjsSetPropertyThenMutationContainer = (apolloConfig, {
  scopeName,
  userScopeOutputParams,
  scopeQueryContainer,
  readInputTypeMapper,
  normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating,
  userStatePropPath,
  userScopeInstancePropPath,
  scopeInstancePropPath,
  setPath,
  setPropPath
}, propSets) => {
  return composeWithComponentMaybeOrTaskChain([
    ({userStateResponse, ...props}) => {
      if (
        !strPathOr(null, 'data', userStateResponse) ||
        !strPathOr(null, setPropPath, props) ||
        !strPathOr(null, userStatePropPath, props) ||
        (!strPathOr(null, userScopeInstancePropPath, props) &&
          !strPathOr(null, scopeInstancePropPath, props)
        )
      ) {
        // Loading
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: userStateResponse
          }
        );
      }
      // Update/Set userState to the response or what was passed in
      const _props = R.merge(props, {userState: reqStrPathThrowing('data.userStates.0', userStateResponse)})
      return userStateScopeObjsMutationContainer(
        apolloConfig,
        {
          normalizeUserStatePropsForMutating,
          scopeQueryContainer,
          scopeName,
          readInputTypeMapper: userStateReadInputTypeMapper,
          userStateOutputParamsCreator: userScopeOutputParams => {
            return userStateOutputParamsCreator(
              userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
            );
          },
          userScopeOutputParams,
          userStatePropPath
        },
        R.merge(_props, {
          // Resolve the use scope instance and set scopeInstance[...setPath...] to the value propSets[..setPropPath...]
          // The mutation will be set to skip if this resolves as null because of missing props
          userScope: setPathOnResolvedUserScopeInstance({
            scopeName,
            userStatePropPath,
            userScopeInstancePropPath,
            scopeInstancePropPath,
            // These mean set the value of the user scopeInstance[...setPath...]. from propSets[..setPropPath...]
            setPath,
            setPropPath
          }, _props),
        })
      )
    },
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateResponse',
      // Fetch the current userState if not passed in
      propSets => {
        return R.ifElse(
          propSets => strPathOr(false, userStatePropPath, propSets),
          propSets => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction(propSets),
                response: {data: {userStates: [reqStrPathThrowing(userStatePropPath, propSets)]}}
              }
            );
          },
          ({render, ...propSets}) => currentUserStateQueryContainer(apolloConfig, {
            outputParams: userStateOutputParamsCreator(
              userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
            )
          }, {render})
        )(propSets)
      }
    )
  ])(propSets);
}

/***
 * Gets related instance ids and query for the corresponding instances. This is used so that if a userState's
 * userRegions or userProjects reference instances such as searchLocations, that we have a way to load
 * the full searchLocations for the userRegion or userProject of the active region or project.
 * @param {Object} apolloConfig
 * @param {Object} config
 * @param {String} config.scopeName Required scope name 'region' for userRegions or 'project' for userProjects
 * @param {String} config.userStatePropPath Required propSets path to the userState, e.g. 'userState'
 * @param {String} [config.scopeInstancePropPath] Required if userScopeInstancePropPath not given. propSets path to the scope instance, e.g' 'region' or 'project'
 * @param {String} [config.userScopeInstancePropPath] Required if scopeInstancePropPath not given. propSets path to the scope instance, e.g' 'userRegion' or 'userProject'
 * @param {String | [String]} config.getPath Array or string path used to make a lens to set the value at propSets[setPropPath]
 * @param {Object} props Must contain a userState at userStatePropPath. Must contain either a scope instance
 * at scopeInstancePropPath or a user scope instance
 * @param {Function} queryContainer The queryContainer to call. It must match the types resolved by userStatePropPath.
 * The query is given a parameter, idIn: [..] where the ids are those found in the userState.userRegions|userProjects[*]
 * instance that was matched and within which the ids are exracted based on getPath
 * @param {Object} [queryOptions]. Default {} Options to pass to the second argument of queryContainer
 * @param {Function} [queryOptions.outputParams] The outputParams to send to the query. Might not be needed depending on the
 * query
 * @returns {Task|Object} The resolved tasked or Apollo component of the query
 */
export const queryUserScopeRelatedInstancesContainer = (
  apolloConfig,
  {
    scopeName,
    userStatePropPath,
    userScopeInstancePropPath,
    scopeInstancePropPath,
    userScopeInstancesPath,
    queryContainer,
    queryOptions = {},
  },
  props
) => {
  // Get the ids of the related objects that are in the userState.data.userRegions|userProjects instances specified
  // by scopeInstancePropPath and getPath
  const idInstances = getPathOnResolvedUserScopeInstances({
      scopeName,
      userStatePropPath,
      userScopeInstancePropPath,
      scopeInstancePropPath,
      getPath: userScopeInstancesPath,
      // We neve want more than the id, because we ware going to query by ids
      getProps: [],
    },
    props
  )
  return queryContainer(
    composeFuncAtPathIntoApolloConfig(
      R.merge(
        apolloConfig,
        // Skip if we didn't get idObjects
        {options: {skip: !idInstances}},
      ),
      'options.variables',
      props => {
        // TODO it might be desirable to merge props in here so that the caller could pass
        // other props that cam from another options.variable filter, but then we have to
        // check if options.variables is already defined before merging
        return {
          idIn: R.map(R.prop('id'), idInstances)
        }
      }
    ),
    queryOptions,
    props
  )
}


/***
 * Like queryUserScopeInstancesContainer but additionally merges the resolved instances
 * into the wrapper user instances (e.g. searchLocations are queried and merged into each userSearchLocation.searchLocation)
 * This gives us userInstances with complete data for use in React components without forcing us to query for
 * userScope instances in other userRegions or userProjects that aren't active
 * @param {Object} apolloConfig
 * @param {Object} config
 * @param {String} config.scopeName Required scope name 'region' for userRegions or 'project' for userProjects
 * @param {String} config.userStatePropPath Required propSets path to the userState, e.g. 'userState'
 * @param {String} [config.scopeInstancePropPath] Required if userScopeInstancePropPath not given. propSets path to the scope instance, e.g' 'region' or 'project'
 * @param {String} [config.userScopeInstancePropPath] Required if scopeInstancePropPath not given. propSets path to the scope instance, e.g' 'userRegion' or 'userProject'
 * @param {String | [String]} config.userScopePath Array or string path used to make a lens to set the value at propSets[setPropPath]
 * that leads to the userScope instances, not the instance themselves. For example. 'searchLocations.userSearchLocations'
 * returns the userSearchLocations that each have a searchLocation
 * @param {String} config.instancePath The path to the instance in the userScope instance, usually just one segment.
 * For example, if config.userScopePath is 'searchLocations.userSearchLocations', then config.instancePath is 'searchLocation'
 * @param {Object} props Must contain a userState at userStatePropPath. Must contain either a scope instance
 * at scopeInstancePropPath or a user scope instance
 * @param {Function} queryContainer The queryContainer to call. It must match the types resolved by userStatePropPath.
 * The query is given a parameter, idIn: [..] where the ids are those found in the userState.userRegions|userProjects[*]
 * instance that was matched and within which the ids are exracted based on getPath
 * @param {Object} [queryOptions]. Default {} Options to pass to the second argument of queryContainer
 * @param {Function} [queryOptions.outputParams] The outputParams to send to the query. Might not be needed depending on the
 * query
 * @returns {Task|Object} The resolved tasked or Apollo component of the query
 */
export const queryAndMergeInUserScopeRelatedInstancesContainer = (
  apolloConfig,
  {
    scopeName,
    userStatePropPath,
    scopeInstancePropPath,
    userScopeInstancePropPath,
    userScopePath,
    instancePath,
    queryContainer,
    queryOptions = {},
  },
  props
) => {
  // Get the ids of the related objects that are in the userState.data.userRegions|userProjects instances specified
  // by scopeInstancePropPath and getPath
  const userScopeObjects = getPathOnResolvedUserScopeInstances({
      scopeName,
      userStatePropPath,
      userScopeInstancePropPath,
      scopeInstancePropPath,
      getPath: userScopePath,
      // Don't limit to id, get everything since we are at the userScope level
      getProps: null
    },
    props
  );
  const idInstances = userScopeObjects ?
    R.map(reqStrPathThrowing(instancePath), userScopeObjects) :
    [];

  return composeWithComponentMaybeOrTaskChain([
    ({instancesResponse, ...props}) => {
      // Return the response unless data is loaded
      if (R.any(prop => R.prop(prop, instancesResponse), ['loading', 'error', 'skip'])) {
        return containerForApolloType(apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: instancesResponse
          }
        )
      }
      // Manipulate the response to replace instances with userScopeObjects
      const idToUserScopeObj = R.indexBy(reqPathThrowing([instancePath, 'id']), userScopeObjects)
      // Assume the response.data has just one key it with the responses
      const responseCollectionKey = R.head(R.keys(R.prop('data', instancesResponse)))
      const modifidResponse = R.compose(
        instancesResponse => {
          // Rename the key from responseCollectionKey to userResponseCollectionKey
          return renameKey(
            R.lensProp('data'),
            responseCollectionKey,
            `user${capitalize(responseCollectionKey)}`,
            instancesResponse
          )
        },
        instancesResponse => {
          return R.over(
            R.lensPath(['data', responseCollectionKey]),
            instances => {
              return R.map(
                instance => {
                  return mergeDeep(
                    // userScopeObject
                    R.prop(R.prop('id', instance), idToUserScopeObj),
                    // Place the full instance at userScopeObject[instancePath], preserving cache only data
                    // that might be at userScopeObject[instancePath]
                    {[instancePath]: instance}
                  )
                },
                instances
              )
            },
            instancesResponse
          )
        }
      )(instancesResponse)
      return containerForApolloType(apolloConfig, {
        render: getRenderPropFunction(props),
        response: modifidResponse
      })
    },
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'instancesResponse',
      props => {
        // Query for the ids of the instances we need
        return queryContainer(
          composeFuncAtPathIntoApolloConfig(
            R.merge(
              apolloConfig,
              // Skip if we didn't get idObjects
              {options: {skip: !R.length(idInstances)}},
            ),
            'options.variables',
            props => {
              return {
                idIn: R.map(R.prop('id'), idInstances)
              }
            }
          ),
          queryOptions,
          props
        )
      }
    )
  ])(props)
}