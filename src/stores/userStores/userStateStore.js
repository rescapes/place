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
import {
  addMutateKeyToMutationResponse,
  createCacheOnlyProps,
  makeMutationRequestContainer,
  makeMutationWithClientDirectiveContainer,
  makeQueryContainer,
  mergeCacheable
} from 'rescape-apollo';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {
  regionOutputParams,
  regionOutputParamsMinimized,
  regionReadInputTypeMapper
} from '../scopeStores/region/regionStore';
import {
  projectOutputParams,
  projectOutputParamsMinimized,
  projectReadInputTypeMapper
} from '../scopeStores/project/projectStore';
import {
  capitalize,
  composeWithChain,
  composeWithChainMDeep, mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs, mapToNamedResponseAndInputs,
  reqStrPathThrowing
} from 'rescape-ramda';
import {selectionOutputParamsFragment} from './selectionStore';
import {activityOutputParamsFragment} from './activityStore';
import {omitClientFields} from 'rescape-apollo';
import {of} from 'folktale/concurrency/task'
import moment from 'moment';

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be dervived from the schema
const userReadInputTypeMapper = {
  'data': 'DataTypeofUserTypeRelatedReadInputType'
};

export const userStateReadInputTypeMapper = {
  'user': 'UserTypeofUserStateTypeRelatedReadInputType',
  'data': 'UserStateDataTypeofUserStateTypeRelatedReadInputType'
};

export const userOutputParams = {
  id: 1,
  lastLogin: 1,
  username: 1,
  firstName: 1,
  lastName: 1,
  email: 1,
  isStaff: 1,
  isActive: 1,
  dateJoined: 1
};


/**
 * Creates userState output params
 * @param userScopeFragmentOutputParams Object keyed by 'region', 'project', etc with
 * the output params those should return within userState.data.[userRegions|userProject|...]
 * @return {*} The complete UserState output params
 * @return {*{}}
 */
export const userStateOutputParamsCreator = userScopeFragmentOutputParams => {
  return ({
    id: 1,
    user: {id: 1},
    data: userScopeFragmentOutputParams
  });
};

/**
 * User state output params with full scope output params. This should only be used for querying when values of the scope
 * instances are needed beyond the ids
 * @param {Object} outputParams
 * @return {{data: {userProjects: *, userRegions: *}, id: number, user: {id: number}}}
 */
export const userStateOutputParamsFull = () => {
  return {
    id: 1,
    user: {id: 1},
    data: {
      userRegions: R.mergeAll([{
        region: regionOutputParams
      },
        selectionOutputParamsFragment,
        activityOutputParamsFragment
      ]),
      userProjects: R.mergeAll([{
        project: projectOutputParams
      },
        selectionOutputParamsFragment,
        activityOutputParamsFragment
      ])
    }
  };
};

/***
 * userProjects output params fragment when we only want the project ids or something custom.
 * The project property represents a single project and the other properties represent the relationship
 * between the user and the project. This can be properties that are stored on the server or only in cache.
 * @param {String} scopeName 'project' or 'region'
 * @param {Object} [userScopeOutputParams] Defaults to {project: {id: 1}}
 */
export const userScopeOutputParamsFragmentDefaultOnlyIds = (scopeName, userScopeOutputParams = {}) => {
  const capitalized = capitalize((scopeName));
  return {
    [`user${capitalized}s`]: R.merge({
        [scopeName]: R.propOr({id: 1}, scopeName, userScopeOutputParams)
      },
      R.omit([scopeName], userScopeOutputParams)
    )
  };
};

/**
 * User state output params with id-only scope output params. Should be used for mutations and common cases when
 * only the scope ids of the user state are needed (because scope instances are already loaded, for instance)
 */
export const userStateOutputParamsOnlyIds = userStateOutputParamsCreator({
  ...userScopeOutputParamsFragmentDefaultOnlyIds('region'),
  ...userScopeOutputParamsFragmentDefaultOnlyIds('project')
});

export const userStateMutateOutputParams = userStateOutputParamsOnlyIds;

// Paths to prop values that we don't store in the database, but only in the cache
// The prop paths are marked with a client directive when querying (see settingsOutputParams)
// so we never try to load them from the database.
const cacheOnlyObjs = ['data.userProjects.*.selection', 'data.userRegions.*.selection'];
const filterOutCacheOnlyObjs = obj => {
  // TODO this should be done with wildcard lens 'data.userProjects|userRegions.*.selection' to handle arrays
  return R.compose(
    ...R.map(
      userScopePath => composedObj => R.over(
        R.lensPath(['data', userScopePath]),
        userScopeObjs => R.map(
          userScopeObj => R.omit(['selection'], userScopeObj),
          userScopeObjs || []
        ),
        composedObj
      ),
      ['userRegions', 'userProjects']
    )
  )(obj);
};


// These values come back from the server and get merged into cacheOnlyProps for identification
const cacheIdProps = [
  'id',
  '__typename',
  'data.__typename',
  // Use region.id to identify the userRegion
  'data.userRegions.*.region',
  'data.userRegions.*.region.id',
  'data.userRegions.*.region.__typename',
  // Use project.id to identify the userProject
  'data.userProjects.*.project',
  'data.userProjects.*.project.id',
  'data.userProjects.*.project.__typename'
];

export const userStateDataTypeIdPathLookup = {
  // Merge userRegions by region. The two paths apply for non-ref and ref versions
  userRegions: ['region.id', 'region.__ref'],
  userProjects: ['project.id', 'project.__ref']
};

// These fields need deep merge methods to keep cache only values
export const userStateStorePoliciesConfig = [
  {type: 'UserStateType', fields: ['data']},
  {
    type: 'UserStateDataType',
    fields: ['userRegions', 'userProjects'],
    idPathLookup: userStateDataTypeIdPathLookup
  },
  {type: 'UserRegionDataType', fields: ['selection']},
  {type: 'UserProjectDataType', fields: ['selection']}
];

export const createCacheOnlyPropsForUserState = props => {
  return createCacheOnlyProps({name: 'userStore', cacheIdProps, cacheOnlyObjs}, props);
};

/**
 * Queries users
 * @params {Object} apolloClient The Apollo Client
 * @params {Object} ouptputParams OutputParams for the query such as userOutputParams
 * @params {Object} props Unused but here to match the Apollo Component pattern. Use null or {}.
 * @returns {Task<Result>} A Task containing the Result.Ok with a User in an object with Result.Ok({data: currentUser: {}})
 * or errors in Result.Error({errors: [...]})
 */
export const makeCurrentUserQueryContainer = v(R.curry((apolloConfig, outputParams, props) => {
    return makeQueryContainer(
      apolloConfig,
      {
        // If we have to query for users separately use the limited output userStateOutputParamsCreator
        name: 'currentUser', readInputTypeMapper: userReadInputTypeMapper, outputParams
      },
      // No arguments, the server resolves the current user based on authentication
      {}
    );
  }),
  [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['outputParams', PropTypes.shape().isRequired],
    ['props', PropTypes.shape()]
  ], 'makeCurrentUserQueryContainer');

/**
 * Queries userState for the current user as identified by the apollo client.
 * @param {Object} apolloClient The Apollo Client
 * @param [Object] outputParams OutputParams for the query
 * @param {Object} props Arguments for the UserState query. Likely null unless testing whether the current
 * user state has passes a certain precicate
 * @returns {Task|Just<Object>} A Task containing the single item user state response {data: {usersStates: []}}
 */
export const makeCurrentUserStateQueryContainer = v(R.curry(
  (apolloConfig, {outputParams}, props) => {
    return composeWithChainMDeep(1, [
      ({apolloConfig, outputParams, user, props}) => {
        // Get the current user state
        return makeQueryContainer(
          apolloConfig,
          {name: 'userStates', readInputTypeMapper: userStateReadInputTypeMapper, outputParams},
          // Merge any other props (usually null) with current user
          R.merge(
            props,
            // Limit to the number version of the id
            {user: R.pick(['id'], R.over(R.lensProp('id'), id => parseInt(id), user))}
          )
        );
      },
      // Get the current user
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, {id: 1}, null);
        }
      )
    ])({apolloConfig, outputParams, props});
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape()]
  ], 'makeCurrentUserStateQueryContainer');

/**
 * Admin only. Queries userState. This will fail unless the apollo client is authenticated to an admin
 * @param {Object} apolloClient The Apollo Client
 * @param [Object] outputParams OutputParams for the query
 * @param {Object} userStateArguments Arguments for the UserState query. This can be {} or null to not filter.
 * @returns {Task} A Task containing the Regions in an object with obj.data.userStates or errors in obj.errors
 */
export const makeAdminUserStateQueryContainer = v(R.curry(
  (apolloConfig, {outputParams}, props) => {
    return makeQueryContainer(
      apolloConfig,
      {name: 'userStates', readInputTypeMapper: userStateReadInputTypeMapper, outputParams},
      props
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape().isRequired]
  ], 'makeAdminUserStateQueryContainer');

/**
 * Soft delete scope instances and the references to them in the user state
 * TODO: There is currently no way to prevent deleting regions that do not belong to the user
 * This will be fixed when Region ownership permissions are set up
 * @param {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param {Object} mutationConfig
 * @param [Object] mutationConfig.outputParams OutputParams for the query of the mutation
 * @param {Object} props Object matching the shape of a userState for the create or update
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const makeUserStateMutationContainer = v(R.curry((apolloConfig, {outputParams}, props) => {
    return makeMutationRequestContainer(
      R.merge(
        apolloConfig,
        {
          options: {
            update: (store, response) => {
              // Add mutate to response.data so we dont' have to guess if it's a create or udpate
              const userState = reqStrPathThrowing(
                'data.mutate.userState',
                addMutateKeyToMutationResponse({silent: true}, response)
              );
              // Add the cache only values to the persisted settings
              // Deep merge the result of the mutation with the props so that we can add cache only values
              // in props. We'll only cache values that are cache only since the mutation will have put
              // the other return objects from the server into the cache
              // TODO this is a bit redundant since the cache write also triggers a merge
              const propsWithCacheOnlyItems = mergeCacheable({idPathLookup: userStateDataTypeIdPathLookup}, userState, props);

              // Mutate the cache to save settings to the database that are not stored on the server
              makeMutationWithClientDirectiveContainer(
                apolloConfig,
                {
                  name: 'userState',
                  // Always pass the full params so can pick out the cache only props
                  outputParams: userStateOutputParamsFull(),
                  // For merging cached array items of userState.data.userRegions|userProjedts
                  idPathLookup: userStateDataTypeIdPathLookup
                },
                propsWithCacheOnlyItems
              );
            }
          }
        }
      ),
      {
        name: 'userState',
        outputParams
      },
      // Remove client-side only values
      filterOutCacheOnlyObjs(props)
    );
  }), [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationConfig', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape().isRequired]
  ],
  'makeUserStateMutationContainer'
);

/***
 * Deletes the scope instances created by mutateSampleUserStateWithProjectAndRegionTask,
 * both the references in userState and the instances themselves
 * @param apolloConfig
 * @param userState
 * @param {Object} scopeProps Keyed by 'region' and 'project'. Values are search props for
 * regions and projects of the userState to remove.
 * E.g. {region: {keyContains: 'test'}, project: {keyContains: 'test'}}
 * @return {*}
 */
export const deleteSampleUserStateScopeObjectsTask = (apolloConfig, userState, scopeProps) => {
  return composeWithChain([
    mapToMergedResponseAndInputs(
      // clearedScopeObjsUserState is the userState with the regions cleared
      ({apolloConfig, clearedScopeObjsUserState}) => {
        return deleteScopeObjectsTask(
          apolloConfig,
          {
            outputParams: projectOutputParamsMinimized,
            readInputTypeMapper: projectReadInputTypeMapper,
            scopeName: 'project',
            scopeProps: R.merge(
              reqStrPathThrowing('project', scopeProps),
              // Only allow deleting projects owned by this user
              {user: R.pick(['id'], reqStrPathThrowing('user', clearedScopeObjsUserState))}
            )
          },
          clearedScopeObjsUserState
        );
      }
    ),
    mapToMergedResponseAndInputs(
      ({apolloConfig, userState}) => {
        return deleteScopeObjectsTask(
          apolloConfig,
          {
            outputParams: regionOutputParamsMinimized,
            readInputTypeMapper: regionReadInputTypeMapper,
            scopeName: 'region',
            scopeProps: reqStrPathThrowing('region', scopeProps)
          },
          userState
        );
      }
    )
  ])({apolloConfig, userState});
};

/**
 * Soft delete scope instances and the references to them in the user state
 * TODO: There is currently no way to prevent deleting regions that do not belong to the user
 * This will be fixed when Region ownership permissions are set up
 * @param {Object} apolloConfig The Apollo config
 * @param {Object} scopeConfig
 * @param {Object} scopeConfig.outputParams
 * @param {Object} scopeConfig.readInputTypeMapper
 * @param {Object} scopeConfig.scopeName e.g. 'project' or 'region'
 * @param {Object} scopeConfig.scopeProps The scope props to match test the scope, such as {keyContains: 'test'}
 * @param {Object} userState The user state for which to delete scope objects
 * @return {Object} {deleted[scope name]s: deleted objects, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteScopeObjectsTask = (
  apolloConfig,
  {outputParams, readInputTypeMapper, scopeName, scopeProps},
  userState
) => {
  const capitalized = capitalize(scopeName);
  return composeWithChain([
    // Delete those test scope objects
    mapToNamedResponseAndInputs(`deleted${capitalized}s`,
      ({apolloConfig, scopeObjsToDelete}) => {
        return R.traverse(
          of,
          scopeObj => {
            return makeMutationRequestContainer(
              apolloConfig,
              {
                name: scopeName,
                outputParams: {id: 1}
              },
              R.set(R.lensProp('deleted'), moment().toISOString(true), scopeObj)
            );
          },
          scopeObjsToDelete
        );
      }),
    // Get test scope objects to delete
    mapToNamedPathAndInputs('scopeObjsToDelete', `data.${scopeName}s`,
      ({apolloConfig}) => {
        return makeQueryContainer(
          apolloConfig,
          {
            name: `${scopeName}s`,
            outputParams: outputParams,
            readInputTypeMapper,
          },
          scopeProps
        );
      }
    ),
    // Remove existing scope objects from the userState
    mapToNamedPathAndInputs('clearedScopeObjsUserState', 'data.mutate.userState',
      ({apolloConfig, userState}) => {
        const modifiedUserState = R.set(R.lensPath(['data', `user${capitalized}s`]), [], userState);
        return makeUserStateMutationContainer(
          apolloConfig,
          // userStateOutputParamsFull is needed so our update writes everything to the tempermental cache
          {outputParams: omitClientFields(userStateOutputParamsFull())},
          modifiedUserState
        );
      }
    )
  ])(({apolloConfig, userState}));
};
