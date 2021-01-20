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
  addMutateKeyToMutationResponse, composeFuncAtPathIntoApolloConfig,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  createCacheOnlyProps,
  createReadInputTypeMapper,
  currentUserQueryContainer,
  filterOutNullDeleteProps,
  filterOutReadOnlyVersionProps,
  getRenderPropFunction,
  makeMutationRequestContainer,
  makeCacheMutationContainer,
  makeQueryContainer,
  mergeCacheable,
  omitClientFields,
  relatedObjectsToIdForm,
  versionOutputParamsMixin,
  callMutationNTimesAndConcatResponses, mapTaskOrComponentToNamedResponseAndInputs
} from '@rescapes/apollo';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {
  regionOutputParams,
  regionOutputParamsMinimized,
  regionReadInputTypeMapper
} from '../scopeStores/region/regionStore.js';
import {
  projectOutputParams,
  projectOutputParamsMinimized,
  projectReadInputTypeMapper
} from '../scopeStores/project/projectStore.js';
import {
  capitalize,
  composeWithChain,
  mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  mergeDeep,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import {selectionOutputParamsFragment} from './selectionStore.js';
import {activityOutputParamsFragment} from './activityStore.js';
import T from 'folktale/concurrency/task/index.js';
import moment from 'moment';

const {of} = T;

// TODO should be derived from the remote schema
const RELATED_PROPS = ['user'];
const RELATED_DATA_PROPS = ['data.userRegions.region', 'data.userProjects.project'];

// Variables of complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const userStateReadInputTypeMapper = createReadInputTypeMapper(
  'userState', R.concat(['data'], RELATED_PROPS)
);

/**
 * Creates userState output params
 * @param userScopeFragmentOutputParams Object keyed by 'region', 'project', etc with
 * the output params those should return within userState.data.[userRegions|userProject|...]
 * @return {*} The complete UserState output params
 * @return {Object} The params
 */
export const userStateOutputParamsCreator = userScopeFragmentOutputParams => {
  return ({
    id: 1,
    user: {id: 1},
    data: userScopeFragmentOutputParams,
    ...versionOutputParamsMixin
  });
};

/**
 * User state output params with full scope output params. This should only be used for querying when values of the scope
 * instances are needed beyond the ids
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

/**
 * When meta data of the user scope instances is needed but only the id of the scope instances
 * @returns {Object} Props such as activity and selection for each userScope instance, but just
 * ids for the scope instance
 */
export const userStateOutputParamsFullMetaOnlyScopeIds = () => {
  return {
    id: 1,
    user: {id: 1},
    data: {
      userRegions: R.mergeAll([{
        region: regionOutputParamsMinimized
      },
        selectionOutputParamsFragment,
        activityOutputParamsFragment
      ]),
      userProjects: R.mergeAll([{
        project: projectOutputParamsMinimized
      },
        selectionOutputParamsFragment,
        activityOutputParamsFragment
      ])
    }
  };
};

/***
 * userState data for scope objects (Project, Region, etc) output params fragment when we only want the project ids or
 * something custom.
 * The project property represents a single project and the other properties represent the relationship
 * between the user and the project. This can be properties that are stored on the server or only in cache.
 * @param {String} scopeName 'project' or 'region'
 * @param {Object} [userScopeOutputParams] Defaults to {} deep merged with {[scopeName]: {id: 1, deleted: 1}} We include deleted
 * for the odd case that the userState has maintained references to deleted scope instances. The Server
 * returns deleted instances when they are referenced.
 */
export const userScopeOutputParamsFragmentDefaultOnlyIds = (scopeName, userScopeOutputParams = {}) => {
  const capitalized = capitalize((scopeName));
  return {
    [`user${capitalized}s`]: R.merge({
        [scopeName]: mergeDeep(
          {id: 1, deleted: true},
          R.propOr({}, scopeName, userScopeOutputParams)
        )
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
    idPathLookup: userStateDataTypeIdPathLookup,
    cacheOnlyFieldLookup: {
      userRegions: {selection: true},
      userProjects: {selection: true}
    }
  },
  // cacheOnly true instructs the merge function not to overwrite existing objects on this
  // field if the incoming object is not defined. This is because we add to the cache when
  // we mutate but subsequent queries don't have the cache only data, but we dont want to lose the cache-only data
  {type: 'UserRegionDataType', fields: ['selection']},
  {type: 'UserProjectDataType', fields: ['selection']}
];

export const createCacheOnlyPropsForUserState = props => {
  return createCacheOnlyProps({name: 'userStore', cacheIdProps, cacheOnlyObjs}, props);
};

/**
 * Queries userState for the current user as identified by the apollo client.
 * @param {Object} apolloClient The Apollo Client
 * @param [Object] outputParams OutputParams for the query
 * @param {Object} props Arguments for the UserState query. Likely null unless testing whether the current
 * user state has passes a certain predicate
 * @returns {Task|Just<Object>} A Task containing the single item user state response {data: {usersStates: []}}
 */
export const currentUserStateQueryContainer = v(R.curry(
  (apolloConfig, {outputParams}, props) => {
    return composeWithComponentMaybeOrTaskChain([
      response => {
        if (!strPathOr(null, 'data.currentUser', response)) {
          // Loading
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction(props),
              response
            }
          );
        }
        const user = strPathOr(null, 'data.currentUser', response);
        // Get the current user state
        return makeQueryContainer(
          composeFuncAtPathIntoApolloConfig(
            apolloConfig,
            'options.variables',
            props => {
              // Merge any other props (usually null) with current user
              return R.merge(
                props,
                // Limit to the number version of the id
                {
                  user: R.pick(
                    ['id'],
                    user
                  )
                }
              );
            }
          ),
          {name: 'userStates', readInputTypeMapper: userStateReadInputTypeMapper, outputParams},
          props
        );
      },
      // Get the current user
      props => {
        return currentUserQueryContainer(apolloConfig, {id: 1}, props);
      }
    ])(props);
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape()]
  ], 'currentUserStateQueryContainer');

/**
 * Admin only. Queries userState. This will fail unless the apollo client is authenticated to an admin
 * @param {Object} apolloClient The Apollo Client
 * @param [Object] outputParams OutputParams for the query
 * @param {Object} userStateArguments Arguments for the UserState query. This can be {} or null to not filter.
 * @returns {Task} A Task containing the Regions in an object with obj.data.userStates or errors in obj.errors
 */
export const adminUserStateQueryContainer = v(R.curry(
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
  ], 'adminUserStateQueryContainer');

/**
 * Normalized project props for for mutation
 * @param {Object} project
 * @return {Object} the props modified
 */
export const normalizeUserStatePropsForMutating = userState => {
  return R.compose(
    // Make sure related objects only have an id
    userState => relatedObjectsToIdForm(R.concat(RELATED_PROPS, RELATED_DATA_PROPS), userState),
    userState => filterOutReadOnlyVersionProps(userState),
    userState => filterOutNullDeleteProps(userState),
    userState => filterOutCacheOnlyObjs(userState)
  )(userState);
};
/**
 * Soft delete scope instances and the references to them in the user state
 * TODO: There is currently no way to prevent deleting regions that do not belong to the user
 * This will be fixed when Region ownership permissions are set up
 * @param {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param {Object} mutationConfig
 * @param {Boolean} [mutationConfig.skip] Default false, For components, if true the mutation isn't ready to run.
 * Neuter the mutation function that is produced and warn if it's run. Also return skip=true to
 * along with the mutation and result object in the component
 * @param [Object] mutationConfig.outputParams OutputParams for the query of the mutation
 * @param {Object} props Object matching the shape of a userState for the create or update
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const userStateMutationContainer = v(R.curry((apolloConfig, {skip = false, outputParams}, props) => {
    return makeMutationRequestContainer(
      R.merge(
        apolloConfig,
        {
          // Skip if passed in or in apolloConfig
          options: {
            skip: R.propOr(skip, 'option.skip', apolloConfig),
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
              makeCacheMutationContainer(
                R.merge(apolloConfig, {store}),
                {
                  name: 'userState',
                  // Always pass the full params so can pick out the cache only props
                  outputParams: userStateOutputParamsFull(),
                  // For merging cached array items of userState.data.userRegions|userProjedts
                  idPathLookup: userStateDataTypeIdPathLookup
                },
                filterOutReadOnlyVersionProps(propsWithCacheOnlyItems)
              );
            }
          }
        }
      ),
      {
        name: 'userState',
        outputParams
      },
      normalizeUserStatePropsForMutating(props)
    );
  }), [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationConfig', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape().isRequired]
  ],
  'userStateMutationContainer'
);

/***
 * Deletes the scope instances created by mutateSampleUserStateWithProjectAndRegionTask,
 * both the references in userState and the instances themselves
 * @param apolloConfig
 * @param {Object} config
 * @param {Object} props
 * @param {Object} props.userState
 * @param {Object} props.scopeProps Keyed by 'region' and 'project'. Values are search props for
 * regions and projects of the userState to remove.
 * @param {Object} [props.render] The render function for component requests
 * E.g. {region: {keyContains: 'test'}, project: {keyContains: 'test'}}
 * @return {*}
 */
export const deleteSampleUserStateScopeObjectsContainer = (apolloConfig, {}, {userState, scopeProps, render}) => {
  return composeWithComponentMaybeOrTaskChain([
    ({deletedRegions, deletedProjects}) => {
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction({render}),
          // Override the data with the consolidated mapbox
          response: {deletedRegions, deletedProjects}
        }
      );
    },
    // clearedScopeObjsUserState is the userState with the regions cleared
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedProjects',
      ({userState, deletedRegions, clearedScopeObjsUserState}) => {
        const user = reqStrPathThrowing('user', userState);
        return R.ifElse(
          R.identity,
          project => {
            return deleteProjectsContainer(
              apolloConfig,
              {
                // Only allow deleting projects owned by userState.user
                // Also Clear the userState of these projects
                userState
              },
              R.merge(
                project,
                // Only allow deleting projects owned by this user
                {user: R.pick(['id'], user)}
              )
            );
          },
          _ => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                // Override the data with the consolidated mapbox
                response: {clearedScopeObjsUserState}
              }
            );
          }
        )(strPathOr(null, 'project', scopeProps));
      }),

    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'deletedRegions',
      ({userState}) => {
        return R.ifElse(
          R.identity,
          region => {
            return deleteRegionsContainer(apolloConfig, {}, {userState, scopeProps: region, render});
          },
          _ => {
            return containerForApolloType(
              apolloConfig,
              {
                render: getRenderPropFunction({render}),
                // Override the data with the consolidated mapbox
                response: {clearedScopeObjsUserState: {data: {mutate: {userState}}}}
              }
            );
          }
        )(strPathOr(null, 'region', scopeProps));
      })
  ])({userState, render});
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
 * @param {Object} props.userState The user state for which to delete scope objects
 * @param {Function} [props.render] Render function, required for component requests
 * @return {Object} {deleted[scope name]s: deleted objects, clearedScopeObjsUserState: Response after mutating the
 * user state to clear the scope instances. In the form {data: {mutate|updateUserState: {...}}}
 */
export const deleteScopeObjectsContainer = (
  apolloConfig,
  {outputParams, readInputTypeMapper, scopeName, scopeProps},
  {userState, render}
) => {
  const capitalized = capitalize(scopeName);
  return composeWithComponentMaybeOrTaskChain([
    // Delete those test scope objects
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'clearedScopeObjsUserState',
      ({userStateResponse, scopeObjsToDeleteResponse, userState}) => {
      const scopeObjsToDelete = strPathOr([], `data.${scopeName}s`, scopeObjsToDeleteResponse);
      return callMutationNTimesAndConcatResponses(
        apolloConfig,
        {
          items: scopeObjsToDelete,
          mutationContainer: makeMutationRequestContainer,
          responsePath: `data.mutate.${scopeName}`,
          propVariationFunc: ({item}) => {
            return R.compose(
              // And the deleted datetime
              item => R.set(R.lensProp('deleted'), moment().toISOString(true), item),
              // Just pass the id
              item => R.pick(['id'], item)
            )(item);
          },
          name: scopeName,
          outputParams: {id: 1}
        },
        {}
      );
    }),
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'scopeObjsToDeleteResponse',
    () => {
      return makeQueryContainer(
        apolloConfig,
        {
          name: `${scopeName}s`,
          outputParams: outputParams,
          readInputTypeMapper
        },
        scopeProps
      );
    }),
    // Remove existing scope objects from the userState if userState was given
    mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'clearedScopeObjsUserState',
    ({userState, render}) => {
      return R.ifElse(
        R.identity,
        userState => {
          const modifiedUserState = R.set(R.lensPath(['data', `user${capitalized}s`]), [], userState);
          return userStateMutationContainer(
            apolloConfig,
            // userStateOutputParamsFull is needed so our update writes everything to the tempermental cache
            {outputParams: omitClientFields(userStateOutputParamsFull())},
            modifiedUserState
          );
        },
        () => {
          return containerForApolloType(
            apolloConfig,
            {
              render: getRenderPropFunction({render}),
              // Override the data with the consolidated mapbox
              response: null
            }
          );
        }
      )(userState);
    })
  ])
  ({userState, render});
};

/**
 * Soft-delete the regions give by props. If userState is passed it will remove the deleted regions
 * from the userState (TODO perhaps we should search for all userStates containing the regions and remove themn)
 * @param apolloConfig
 * @param {Object} requestConfig
 * @param {Object} [requestConfig.userState] optional
 * @param props
 * @return {Object} {deleteRegions: deleted region, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteRegionsContainer = (apolloConfig, {}, {userState = null, scopeProps, render}) => {
  return deleteScopeObjectsContainer(
    apolloConfig,
    {
      outputParams: regionOutputParamsMinimized,
      readInputTypeMapper: regionReadInputTypeMapper,
      scopeName: 'region',
      scopeProps
    },
    {userState, render}
  );
};
/**
 * Soft-delete the projects give by props. If userState is passed it will remove the deleted projects
 * from the userState (TODO perhaps we should search for all userStates containing the projects and remove them)
 * @param apolloConfig
 * @param {Object} requestConfig
 * @param {Object} [requestConfig.userState] optional
 * @param props
 * @return {Object}  {deletedProjects: deleted project, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteProjectsContainer = (apolloConfig, {userState = null}, props) => {
  return deleteScopeObjectsContainer(
    apolloConfig,
    {
      outputParams: projectOutputParamsMinimized,
      readInputTypeMapper: projectReadInputTypeMapper,
      scopeName: 'project',
      scopeProps: props
    },
    userState
  );
};
