import {
  currentUserStateQueryContainer,
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from "../userStateStore";
import {setPathOnResolvedUserScopeInstance, userStateScopeObjsMutationContainer} from "./userStateHelpers";
import * as R from 'ramda'
import {composeWithChain, reqStrPathThrowing, strPathOr} from "@rescapes/ramda";
import {composeWithComponentMaybeOrTaskChain, mapTaskOrComponentToNamedResponseAndInputs} from "@rescapes/apollo";
import {containerForApolloType} from "@rescapes/apollo/src/helpers/containerHelpers";
import {getRenderPropFunction} from "@rescapes/apollo/src/helpers/componentHelpersMonadic";

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
 * @param {Function} config.normalizeUserStatePropsForMutating apolloConfig.options.variables function to normalized the
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
  normalizeUserStatePropsForMutating,
  userStatePropPath,
  userScopeInstancePropPath,
  scopeInstancePropPath,
  setPath,
  setPropPath
}, propSets) => {
  return composeWithComponentMaybeOrTaskChain([
    ({userStateResponse, ...props}) => {
      if (!strPathOr(null, 'data', userStateResponse)) {
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
        R.merge(
          apolloConfig,
          {
            options: {
              variables: props => {
                return normalizeUserStatePropsForMutating(props)
              }
            }
          }
        ),
        {
          scopeQueryContainer,
          scopeName,
          readInputTypeMapper: userStateReadInputTypeMapper,
          userStateOutputParamsCreator: userScopeOutputParams => {
            return userStateOutputParamsCreator(
              userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
            );
          },
          userScopeOutputParams,
        },
        R.merge(_props, {
          // Resolve the use scope instance and set scopeInstance[...setPath...] to the value propSets[..setPropPath...]
          userScope: setPathOnResolvedUserScopeInstance({
            scopeName,
            userStatePropPath,
            userScopeInstancePropPath,
            scopeInstancePropPath,
            // These mean set the value of the user scopeInstance[...setPath...]. from propSets[..setPropPath...]
            setPath,
            setPropPath
          }, _props)
        })
      )
    },
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userStateResponse',
      // Fetch the current userState if not passed in
      propSets => {
        return R.ifElse(
          propSets => strPathOr(false, 'userState', propSets),
          propSets => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction(propSets),
                response:  {data: {userStates: [reqStrPathThrowing('userState', propSets)]}}
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