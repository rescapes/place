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
  makeQueryContainer, mergeCacheable
} from 'rescape-apollo';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {regionOutputParams} from '../scopeStores/regionStore';
import {projectOutputParams} from '../scopeStores/projectStore';
import {mapboxOutputParamsFragment} from '../mapStores/mapboxOutputParams';
import {
  composeWithChainMDeep,
  mapToNamedPathAndInputs,
  mergeDeepWithRecurseArrayItems,
  reqStrPathThrowing
} from 'rescape-ramda';
import {selectionOutputParamsFragment} from './selectionStore';

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
export const userStateOutputParamsCreator = userScopeFragmentOutputParams => ({
  id: 1,
  user: {id: 1},
  data: userScopeFragmentOutputParams
});

/**
 * User state output params with full scope output params. This should only be used for querying when values of the scope
 * instances are needed beyond the ids
 */
export const userStateOutputParamsFull = {
  id: 1,
  user: {id: 1},
  data: {
    userRegions: R.merge(
      {
        region: regionOutputParams
      },
      mapboxOutputParamsFragment
    ),
    userProjects: R.mergeAll([
      {
        project: projectOutputParams
      },
      mapboxOutputParamsFragment,
      selectionOutputParamsFragment
    ])
  }
};

/***
 * userRegions output params fragment when we only want the region ids.
 * The region property represents a single region and the other properties represent the relationship
 * between the user and the region. This can be properties that are stored on the server or only in cache.
 */
export const userRegionsOutputParamsFragmentDefaultOnlyIds = (regionOutputParams = ['id']) => ({
  userRegions: {
    region: regionOutputParams,
    ...mapboxOutputParamsFragment
  }
});

/***
 * userProjects output params fragment when we only want the project ids
 * The region property represents a single region and the other properties represent the relationship
 * between the user and the region. This can be properties that are stored on the server or only in cache.
 */
export const userProjectsOutputParamsFragmentDefaultOnlyIds = (projectOutputParams = ['id']) => ({
  userProjects: R.mergeAll([
    {project: projectOutputParams},
    mapboxOutputParamsFragment,
    selectionOutputParamsFragment
  ])
});

/**
 * User state output params with id-only scope output params. Should be used for mutations and common cases when
 * only the scope ids of the user state are needed (because scope instances are already loaded, for instance)
 */
export const userStateOutputParamsOnlyIds = userStateOutputParamsCreator({
  ...userRegionsOutputParamsFragmentDefaultOnlyIds(),
  ...userProjectsOutputParamsFragmentDefaultOnlyIds()
});


export const userStateMutateOutputParams = userStateOutputParamsOnlyIds;

// Paths to prop values that we don't store in the database, but only in the cache
// The prop paths are marked with a client directive when querying (see settingsOutputParams)
// so we never try to load them from the database.
const cacheOnlyObjs = ['data.userProjects.*.selection'];
const filterOutCacheOnlyObjs = obj => {
  // TODO this should be done with wildcard lens 'data.userProjects.*.selection' to handle arrays
  return R.over(
    R.lensPath(['data', 'userProjects']),
    userProjects => R.map(
      userProject => R.omit(['selection'], userProject),
      userProjects || []
    ),
    obj
  );
};


// These values come back from the server and get merged into cacheOnlyProps for identification
const cacheIdProps = [
  'id',
  '__typename',
  'data.__typename',
  'data.userProjects.__typename',
  // Use project.id to identify the userProject.
  'data.userProjects.*.project',
  'data.userProjects.*.project.id',
  'data.userProjects.*.project.__typename',
  // Use region.id to identify the userProject.
  'data.userRegions.*.region',
  'data.userRegions.*.region.id',
  'data.userRegions.*.region.__typename'
];

export const userStateDataTypeIdPathLookup = {
  // Merge userRegions by region. The two paths apply for non-ref and ref versions
  userRegions: ['region.id', 'region.__ref'],
  // Merge UserPojects by project. The two paths apply for non-ref and ref versions
  userProjects: ['project.id', 'project.__ref']
};

// These fields need deep merge methods to keep cache only values
export const userStateStorePoliciesConfig = [
  {type: 'UserStateType', fields: ['data']},
  {
    type: 'UserStateDataType',
    fields: ['userProjects', 'userRegions'],
    idPathLookup: userStateDataTypeIdPathLookup
  },
  {type: 'UserProjectDataType', fields: ['selection']},
  {type: 'UserRegionDataType', fields: ['selection']}
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
          return makeCurrentUserQueryContainer(apolloConfig, ['id'], null);
        }
      )
    ])({apolloConfig, outputParams, props});
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.arrayOf(
        PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.array,
          PropTypes.shape()
        ])
      ).isRequired
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
 * Client Directive mutation to cache cache-only props
 * @param apolloConfig
 * @param outputParams
 * @param props
 * @return {*}
 */
export const makeUserStateMutationWithClientDirective = (apolloConfig, {outputParams}, props) => {
  return makeMutationWithClientDirective(
    apolloConfig,
    {
      name: 'userState',
      outputParams: userStateOutputParamsFull
    },
    createCacheOnlyPropsForUserState(props)
  );
};

/**
 * Makes a UserState mutation container;
 * @param {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param {Object} mutationConfig
 * @param [Object] mutationConfig.outputParams OutputParams for the query
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
                  outputParams: userStateOutputParamsFull,
                  // For merging cached array items of userState.data.userRegions|userProjedts
                  idPathLookup: userStateDataTypeIdPathLookup
                },
                propsWithCacheOnlyItems
                //createCacheOnlyPropsForUserState(propsWithCacheOnlyItems)
              );

              // Mutate the cache to save settings to the database that are not stored on the server
              makeCacheMutation(
                apolloConfig,
                {
                  name: 'settings',
                  // output for the read fragment
                  outputParams
                },
                createCacheOnlyPropsForSettings({cacheOnlyObjs, cacheIdProps}, propsWithCacheOnlyItems)
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
