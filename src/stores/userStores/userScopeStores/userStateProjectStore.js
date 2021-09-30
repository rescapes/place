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
import {v} from '@rescapes/validate';
import {projectsQueryContainer} from '../../scopeStores/project/projectStore.js';
import {
  userScopeOrNullAndProps
} from './userScopeHelpers.js';
import {
  normalizeDefaultUserStatePropsForMutating,
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from '../userStateStore.js';
import {renameKey} from '@rescapes/ramda';
import {userStateProjectOutputParams} from './userStateProjectStoreHelpers.js'
import {
  queryAndMergeInUserScopeRelatedInstancesContainer,
  queryUserScopeRelatedInstancesContainer, userStateScopeObjsMutationContainer, userStateScopeObjsQueryContainer,
  userStateScopeObjsSetPropertyThenMutationContainer
} from "./userScopeStore.js";
import {regionsQueryContainer} from "../../scopeStores/region/regionStore.js";

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
 * @param {Object} config
 * @param {Object} config.apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} config.apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} outputParamSets Optional outputParam sets to override the defaults
 * @param {Object} [outputParamSets.userStateProjectOutputParams] Optional userProject output params.
 * Defaults to projectStore.projectOutputParams
 * @param {Object} propSets The props used for the query. userState and project objects are required
 * @param {Object} [propSets.userState] Props for the UserStates queries {user: {id: }} is to limit
 * the query to one user. If omitted then the current user is queried
 * @param {Object} [propSets.userProject] Object matching the shape of the userProject to mutate in the user state
 * If not specified the mutation will have a skipped status and not be able to run
 * @param {Object} [propSets.userProject.project] Object matching the shape of the project to mutate in the user state
 * @param {Number} [propSets.userProject.project.id] Required id of the project to update or add in userState.data.userProjec
 * Projects will be limited to those returned by the UserState query. These should not specify ids since
 * the UserState query selects the ids
 * @returns {Object} The resulting Projects in a Task in {data: usersProjects: [...]}}
 */
export const userStateProjectsQueryContainer = v(R.curry((
  apolloConfig, {
    userStateProjectOutputParams: explicitUserProjectOutputParams
  }, propSets) => {
    const scopeName = 'project';
    return userStateScopeObjsQueryContainer(
      apolloConfig,
      {
        scopeQueryContainer: projectsQueryContainer,
        scopeName,
        readInputTypeMapper: userStateReadInputTypeMapper,
        userStateOutputParamsCreator: userScopeOutputParams => {
          const params = userStateOutputParamsCreator(
            userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
          );
          return params;
        },
        // Default to the user state params with only ids for the project. This prevents an extra query to
        // load the project data
        userScopeOutputParams: explicitUserProjectOutputParams || userStateProjectOutputParams({
          explicitProjectOutputParams: {id: 1}
        })
      },
      renameKey(R.lensPath([]), 'userProject', 'userScope', propSets)
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParamSets', PropTypes.shape({
      userStateProjectOutputParams: PropTypes.shape()
    })],
    ['propSets', PropTypes.shape({
      userState: PropTypes.shape(),
      userProject: PropTypes.shape({
        project: PropTypes.shape()
      })
    })]
  ], 'userStateProjectsQueryContainer');

/**
 *  Mutates the given userState.data.userProjects with the given project
 * If a matching project is in userState.data.userProjects it is updated, otherwise it is added
 * @param {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param {Object} options
 * @param {Function} [options.normalizeUserStatePropsForMutating] Default normalizeDefaultUserStatePropsForMutating
 * @param {Object} options.userScopeOutputParams Project output params that will be returned for the mutated project
 * within the user state
 * @param {Object} propSets Object matching the shape of a userState and project for the create or update
 * @param {Object} [props.userState] props for the UserState. If omitted defaults to the current userState query
 * @param {Object} propSets.userState.data The data to mutate. For updates any array in data will replace that
 * on the server, but otherwise this data is deep merged with the existing data on the server
 * @param {Object} propSets.userProject Object matching the shape of userState.data[*}.userProject
 * @param {Object} propSets.userProject.project Object matching the shape of the project to mutate in the user state
 * @param {Number} propSets.userProject.project.id Required id of the project to update or add in userState.data.userProjects
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const userStateProjectMutationContainer = v(R.curry((apolloConfig, {normalizeUserStatePropsForMutating=normalizeDefaultUserStatePropsForMutating, userProjectOutputParams}, propSets) => {
    const scopeName = 'project';
    return userStateScopeObjsMutationContainer(
      apolloConfig,
      {
        normalizeUserStatePropsForMutating,
        scopeName,
        scopeQueryContainer: projectsQueryContainer,
        readInputTypeMapper,
        userStateOutputParamsCreator: scopeOutputParams => {
          return userStateOutputParamsCreator(
            userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds(scopeName, scopeOutputParams)
          );
        },
        userScopeOutputParams: userProjectOutputParams
      },
      // Create the userScope param from userProject if we have a userProject
      userScopeOrNullAndProps('userProject', 'project', propSets)
    );
  }), [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationStructure', PropTypes.shape({
      userProjectOutputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape({
      userState: PropTypes.shape(),
      // Not required because userProject can be null when the mutation is created
      // To be able to make a mutation, it must be specified
      userProject: PropTypes.shape({
        project: PropTypes.shape({
          id: PropTypes.number.isRequired
        })
      })
    }).isRequired]
  ],
  'userStateProjectMutationContainer'
);

/**
 * Convenience method for updating the property of a userProject and then mutating
 * @type {(function(...[*]): *)|*}
 */
export const userStateProjectSetPropertyThenMutationContainer = v((apolloConfig, {
    normalizeUserStatePropsForMutating,
    userProjectOutputParams,
    setPath,
    setPropPath
  }, propSets) => {
    return userStateScopeObjsSetPropertyThenMutationContainer(
      apolloConfig, {
        scopeName: 'project',
        userScopeOutputParams: userProjectOutputParams,
        scopeQueryContainer: projectsQueryContainer,
        normalizeUserStatePropsForMutating,
        userStatePropPath: 'userState',
        userScopeInstancePropPath: 'userProject',
        scopeInstancePropPath: 'project',
        setPath,
        setPropPath,
      },
      propSets
    )
  }, [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationStructure', PropTypes.shape({
      normalizeUserStatePropsForMutating: PropTypes.func.isRequired,
      userProjectOutputParams: PropTypes.shape().isRequired,
      setPath: PropTypes.string.isRequired,
      setPropPath: PropTypes.string.isRequired
    })],
    ['props', PropTypes.shape({
      userState: PropTypes.shape(),
      userProject: PropTypes.shape({
        project: PropTypes.shape()
      }),
      project: PropTypes.shape(),
    }).isRequired]
  ],
  'userStateProjectSetPropertyThenMutationContainer'
);

/**
 * Convenience method that calls userStateProjectsQueryContainer but sets propSets.userProject.activity.isActive to true
 * so we only get userProjects that are active (normally just 1)
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} options Optional outputParam sets to override the defaults
 * @param {Object} [options.userStateProjectOutputParams] Optional userProject output params.
 * Defaults to projectStore.projectOutputParams
 * @param {Object} propSets The props used for the query. userState objects are required
 * @param {Object} propSets.userState Props for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @returns {Object} The resulting User Projects in a Task in {data: usersProjects: [...]}}
 */
export const userStateProjectsActiveQueryContainer = (
  apolloConfig,
  {userStateProjectOutputParams},
  propSets
) => {
  const userProject = {activity: {isActive: true}}
  return userStateProjectsQueryContainer(apolloConfig, {userStateProjectOutputParams}, R.merge(propSets, {userProject}))
}


/**
 * Convenience wrapper around getPathOnResolvedUserScopeInstanceAndQuery for projects
 * @param apolloConfig
 * @param {Object} config
 * @param {String} config.userScopePath Path to the userScope object from userProject, such as 'userSearch.userSearchLocations'
 * @param {String} config.instancePath Path to the instance in the userScope object, e.g. 'searchLocation'
 * @param config.queryContainer
 * @param config.queryOptions
 * @param props
 * @returns {Task|Object}
 */
export const queryAndMergeInUserProjectRelatedInstancesContainer = (
  apolloConfig, {
    userScopePath, instancePath, queryContainer, queryOptions
  }, props
) => {
  return queryAndMergeInUserScopeRelatedInstancesContainer(
    apolloConfig, {
      scopeName: 'project',
      // Assume the userState is at propPath
      userStatePropPath:  'userState',
      // propSets needs to either contain a userRegion at 'userRegion' or a project at 'project'
      // We don't have a valid mutation container until then
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'project',
      userScopePath,
      instancePath,
      queryContainer,
      queryOptions
    },
    props
  )
}