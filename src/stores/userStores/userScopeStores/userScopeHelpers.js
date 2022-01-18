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
import {
  capitalize,
  hasStrPath,
  isResolvePropPathForAllSets,
  onlyOneThrowing,
  pathOr, pickDeepPaths,
  renameKey,
  reqStrPathThrowing,
  strPathOr,
  toNamedResponseAndInputs
} from '@rescapes/ramda';
import {filterOutReadOnlyVersionProps} from '@rescapes/apollo';
import {inspect} from "util";
import {getPathObjects} from "@rescapes/apollo/src/helpers/requestHelpers.js";

/**
 * returns userState.data.user[Project|Region]` based on scopeName = 'project' \ 'region'
 * @param scopeName
 * @return {string} The attribute of userState.data
 * @private
 */
export const _userScopeName = scopeName => {
  return `user${capitalize(scopeName)}s`;
};

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
 * @param props {Object} Must contain a userState at userStatePropPath. Must contain either a scope instance
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
  }, props) => {
  return R.cond([
    [
      // If the userScope instance is given
      propSets => hasStrPath(userScopeInstancePropPath || '', propSets),
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
            propSets => R.mergeRight({[scopeName]: strPathOr(undefined, `${userScopeInstancePropPath}.${scopeName}`, propSets)}, propSets)
          )(propSets)
        )
      }
    ],
    [
      // If the scope instance is given
      propSets => hasStrPath(scopeInstancePropPath || '', propSets),
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
  ])(props)
}

/***
 * Calls userScopeFromProps to resolve the user scope instance (userRegion or userProject)
 * and additionally adds the value props[...setPropPath...] * to userScope[...setPath...].
 * If config.limitUserScopeToSetPropPath is true (default true) only paths setPath and scopeName are returned
 * in the userScope. This prevents a mutation from passing userScope data that isn't updated
 * and might be out of date if a mutation container was built with the userScope.
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
 * @param {String} config.setPropPath String path of value in propSets to use for setting.
 * The corresponding prop value does not have to be available at this point, because
 * it might be set by a user action that triggers the mutation. If the prop is defined
 * we update the userScope to it.
 * @param {Boolean} [config.limitUserScopeToSetPropPath] Default true. Limits the userScope to the scope instance
 * and the setPath so that mutations don't use stale userScope data.
 * @param props {Object} Must contain a userState at userStatePropPath. Must contain either a scope instance
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
    setPropPath,
    limitUserScopeToSetPropPath=true
  },
  props) => {
  // If any propPathSet doesn't have a corresponding value in propSets, return null.
  // This indicates a loading state or lack of selection by the user
  if (!isResolvePropPathForAllSets(props, [
    [userStatePropPath],
    [userScopeInstancePropPath, scopeInstancePropPath]]
  )) {
    return null;
  }
  return R.compose(
    userScope => {
      // Limit userScope to scopeName and setPath unless limitUserScopeToSetPropPath is set false
      return R.when(
        userScope => R.and(userScope, limitUserScopeToSetPropPath),
        userScope => {
          return pickDeepPaths([scopeName, setPath], userScope)
        }
      )(userScope)
    },
    // Set setPath to the object at props[...setPropPath...] if userScope was resolved
    // and the prop at setPropPath exists. It doesn't need to exist because it
    // might be passed in directly to the mutation function
    userScope => {
      return R.when(
        userScope => R.and(userScope, null !== strPathOr(null, setPropPath, props)),
        userScope => R.set(
          R.lensPath(R.unless(Array.isArray, R.split('.'), setPath)),
          reqStrPathThrowing(setPropPath, props),
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
  )(props)
}


/**
 * Function to tell whether scope props are defined
 * @param scope
 * @returns {*}
 */
export const hasScopeParams = scope => {
  return R.compose(R.length, R.keys)(R.defaultTo({}, scope));
};

/**
 * Calls userScopeFromProps to resolve the user scope instance (userRegion or userProject)
 * and additionally gets the value from userScope[...getPath...].
 * This method is used to create convenient API methods that get a given property of
 * user.data.userRegions|userProjects[x].[...getPath...] and query for the full values of that properties.
 * For instance, if get path pointed at userSearchLocations that each had {
 *  activity: {isActive: true|false},
 *  searchLocation: {id: }
 * }
 * then getPath 'userSearchLocations.searchLocation.id' would result in
 * all of the searchLocations [{id: }, {id: }, ...]
 * @param {Object} config
 * @param {String} config.scopeName Required scope name 'region' for userRegions or 'project' for userProjects
 * @param {String} config.userStatePropPath Required propSets path to the userState, e.g. 'userState'
 * @param {String} [config.scopeInstancePropPath] Required if userScopeInstancePropPath not given. propSets path to the scope instance, e.g' 'region' or 'project'
 * @param {String} [config.userScopeInstancePropPath] Required if scopeInstancePropPath not given. propSets path to the scope instance, e.g' 'userRegion' or 'userProject'
 * @param {String | [String]} config.getPath Array or string path used to make a lens to set the value at propSets[setPropPath]
 * @param {Object} props Must contain a userState at userStatePropPath. Must contain either a scope instance
 * at scopeInstancePropPath or a user scope instance
 * @param {[String]} [getProps] Default [], Normally we just desire the id of the instances that match getPath, but we can
 * request other props here
 * @returns {Object} The resolved and user scope instance with setPath set to propSets[...setPropPath...]
 * If anything isn't available then null is returned
 */
export const getPathOnResolvedUserScopeInstances = (
  {
    scopeName,
    userStatePropPath,
    userScopeInstancePropPath,
    scopeInstancePropPath,
    getPath,
    getProps = []
  },
  props) => {
  // If any propPathSet doesn't have a corresponding value in propSets, return null.
  // This indicates a loading state or lack of selection by the user
  if (!isResolvePropPathForAllSets(props, [
    [userStatePropPath],
    [userScopeInstancePropPath, scopeInstancePropPath]]
  )) {
    return null;
  }
  return R.compose(
    // Set setPath to the object at setPropPath if userScope was resolved
    userScope => {
      return R.when(
        R.identity,
        userScope => {
          return getPathObjects(
            {
              propPath: getPath,
              allowedFields: getProps
            },
            userScope
          )
        }
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
  )(props)
}
