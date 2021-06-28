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
  callMutationNTimesAndConcatResponses,
  composeFuncAtPathIntoApolloConfig,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  createCacheOnlyProps,
  createReadInputTypeMapper,
  currentUserQueryContainer,
  filterOutNullDeleteProps,
  filterOutReadOnlyVersionProps,
  getRenderPropFunction,
  makeCacheMutationContainer,
  makeMutationRequestContainer,
  makeQueryContainer,
  mapTaskOrComponentToNamedResponseAndInputs,
  mergeCacheable,
  omitClientFields,
  relatedObjectsToIdForm,
  versionOutputParamsMixin
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
  mergeDeep,
  pathOr,
  pickDeepPaths,
  reqPathThrowing,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import {selectionOutputParamsFragment} from './selectionStore.js';
import {activityOutputParamsMixin} from './activityStore.js';
import moment from 'moment';
import {createUserSearchOutputParams} from "./userScopeStores/userSearchStore";
import {
  defaultSearchLocationOutputParams,
  defaultSearchLocationOutputParamsMinimized
} from "../search/searchLocation/defaultSearchLocationOutputParams";
import {userStateRegionOutputParams} from "./userScopeStores/userStateRegionStoreHelpers";
import {userStateProjectOutputParams} from "./userScopeStores/userStateProjectStoreHelpers";
import {logicalOrValueAtPathIntoApolloConfig} from "@rescapes/apollo/src/helpers/queryHelpers";


// TODO should be derived from the remote schema
const RELATED_PROPS = ['user'];
export const USER_STATE_RELATED_DATA_PROPS = [
  'data.userRegions.region', 'data.userProjects.project',
  // Although related, leave these out since we can create searchLocations when we save a user state
  'data.userRegions.userSearch.userSearchLocations.searchLocation',
  'data.userProjects.userSearch.userSearchLocations.searchLocation',
];
// User search locations can be saved with the following props when we mutate a userState
export const USER_SEARCH_LOCATION_ALLOWED_PROPS = ['name', 'identification', 'street', 'jurisdictions', 'geojson', 'data']
const USER_STATE_RELATED_DATA_PROPS_ALLOWED = {
  'data.userRegions.userSearch.userSearchLocations.searchLocation': USER_SEARCH_LOCATION_ALLOWED_PROPS,
  'data.userProjects.userSearch.userSearchLocations.searchLocation': USER_SEARCH_LOCATION_ALLOWED_PROPS,
}

// Variables of complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const userStateReadInputTypeMapper = createReadInputTypeMapper(
  'userState', R.concat(['data'], RELATED_PROPS)
);

/***
 * userState data for scope objects (Project, Region, etc) output params fragment when we only want ids or
 * something custom.
 * The project property represents a single project and the other properties represent the relationship
 * between the user and the project. This can be properties that are stored on the server or only in cache.
 * @param {String} scopeName 'project' or 'region'
 * @param {Object} [userScopeOutputParams] Defaults to {activity: {isActive:1}} deep merged with {[scopeName]: {id: 1, deleted: 1}} We include deleted
 * for the odd case that the userState has maintained references to deleted scope instances. The Server
 * returns deleted instances when they are referenced.
 */
export const userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds = (
  scopeName,
  userScopeOutputParams = {[scopeName]: {id: 1, deleted: 1}}) => {
  const capitalized = capitalize((scopeName));
  return {
    [`user${capitalized}s`]: R.merge({
        [scopeName]: mergeDeep(
          {id: 1, deleted: 1},
          R.propOr({}, scopeName, userScopeOutputParams)
        ),
        activity: {isActive: 1}
      },
      R.omit([scopeName], userScopeOutputParams)
    )
  };
};

/**
 * Gets all the django model ids as output params for userState.date.userRegions|userProjects
 * @param {String} scopeName 'region' or 'project'
 * @returns {Object} The userRegion or userProject outputParams
 */
export const userScopeOutputParamsOnlyIds = scopeName => {
  return R.compose(
    userScopeData => {
      return pickDeepPaths(
        [`${scopeName}.id`, 'userSearch.userSearchLocations.searchLocation.id', 'activity'],
        userScopeData
      )
    },
    userScopeName => {
      return reqPathThrowing(['data', userScopeName], userStateOutputParamsMetaAndScopeIds({
          searchLocationOutputParams: defaultSearchLocationOutputParamsMinimized,
        })
      )
    },
    scopeName => {
      const capitalized = capitalize((scopeName));
      return `user${capitalized}s`;
    }
  )(scopeName)
}


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
}

/**
 * User state output params with full scope output params. This should only be used for querying when values of the scope
 * instances are needed beyond the ids
 * @return {Object} The outputParams
 */
export const createUserStateOutputParamsFull = searchLocationOutputParams => {
  return {
    id: 1,
    user: {id: 1},
    data: {
      userRegions: R.mergeAll([
        {
          region: regionOutputParams,
          userSearch: createUserSearchOutputParams(searchLocationOutputParams)
        },
        selectionOutputParamsFragment,
        activityOutputParamsMixin
      ]),
      userProjects: R.mergeAll([
        {
          project: projectOutputParams,
          userSearch: createUserSearchOutputParams(searchLocationOutputParams)
        },
        selectionOutputParamsFragment,
        activityOutputParamsMixin
      ])
    }
  };
};

// Local version of createUserStateOutputParamsFull for tests
export const userStateLocalOutputParamsFull = () => createUserStateOutputParamsFull(defaultSearchLocationOutputParams)

/**
 * When meta data of the user scope instances is needed but only the id of the scope instances
 * @param {Object} searchLocationOutputParams Required searchLocation outputParams
 * @param {Object} [additionalUserScopeOutputParams] Defaults to {}, use to add outputParams to userRegion and userProject
 * @returns {Object} Props such as activity and selection for each userScope instance, but just
 * ids for the scope instance
 */
export const userStateOutputParamsMetaAndScopeIds = ({
                                                       searchLocationOutputParams,
                                                       additionalUserScopeOutputParams = {}
                                                     }) => {
  return {
    id: 1,
    user: {id: 1},
    data: {
      userRegions: userStateRegionOutputParams({
        searchLocationOutputParams: searchLocationOutputParams,
        explicitRegionOutputParams: regionOutputParamsMinimized,
        additionalUserScopeOutputParams
      }),
      userProjects: userStateProjectOutputParams({
        searchLocationOutputParams: searchLocationOutputParams,
        explicitRegionOutputParams: projectOutputParamsMinimized,
        additionalUserScopeOutputParams
      }),
    }
  };
};

// Local version of createUserStateOutputParamsFull for tests
export const userStateLocalOutputParamsMetaAndScopeIds = () => createUserStateOutputParamsFull(
  defaultSearchLocationOutputParamsMinimized
)


/**
 * User state output params with id-only scope output params. Should be used for mutations and common cases when
 * only the scope ids of the user state are needed (because scope instances are already loaded, for instance)
 */
export const userStateOutputParamsOnlyIds = userStateOutputParamsCreator({
  ...userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds('region'),
  ...userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds('project')
});

/**
 * Creates UserState output params for a certain scope prop path value fragment.
 * For example if we want mapbox data from userState.data.regions[*].mapbox,  userState.data.projects[*].mapbox,
 * we would pass in
 mapbox: {
    viewport: {
      latitude: 1,
      longitude: 1,
      zoom: 1
    }
  }
 * @param {Object} scopePropPathValueOutputParamsFragment The fragment
 * @return {*[]}
 */
export const userStateScopePropPathOutputParamsCreator = scopePropPathValueOutputParamsFragment => {
  // Merge in {[scopeName]: {id: 1}} and {activity: {isActive: 1}} since we use often use that to filter the scope instances
  // we want
  const mergedOutputFragment = scopeName => R.merge({
      [scopeName]: {id: true},
      activity: {
        isActive: true
      }
    },
    scopePropPathValueOutputParamsFragment
  );
  return {
    data: {
      userGlobal: scopePropPathValueOutputParamsFragment,
      userRegions: mergedOutputFragment('region'),
      userProjects: mergedOutputFragment('project')
    }
  };
};

export const userStateMutateOutputParams = userStateOutputParamsOnlyIds;


// Paths to prop values that we don't store in the database, but only in the cache
// The prop paths are marked with a client directive when querying (see settingsOutputParams)
// so we never try to load them from the database.
const cacheOnlyObjs = ['data.userProjects.*.selection', 'data.userRegions.*.selection'];
const filterOutCacheOnlyObjs = obj => {
  // TODO this should be done with wildcard lens 'data.userProjects|userRegions.*.selection' to handle arrays
  return R.compose(
    ...R.map(
      userScopePath => {
        return composedObj => {
          return R.when(
            composedObj => pathOr(null, ['data', userScopePath], composedObj),
            composedObj => {
              return R.over(
                R.lensPath(['data', userScopePath]),
                userScopeObjs => R.map(
                  userScopeObj => R.omit(['selection'], userScopeObj),
                  userScopeObjs
                ),
                composedObj
              );
            }
          )(composedObj);
        };
      },
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
  'data.userRegions.*.userSearch.userSearchLocations.*.searchLocation',
  'data.userRegions.*.userSearch.userSearchLocations.*.searchLocation.id',
  'data.userRegions.*.userSearch.userSearchLocations.*.searchLocation.__typename',
  // Use project.id to identify the userProject
  'data.userProjects.*.project',
  'data.userProjects.*.project.id',
  'data.userProjects.*.project.__typename',
  'data.userProjects.*.userSearch.userSearchLocations.*.searchLocation',
  'data.userProjects.*.userSearch.userSearchLocations.*.searchLocation.id',
  'data.userProjects.*.userSearch.userSearchLocations.*.searchLocation.__typename',
];

export const userStateDataTypeIdPathLookup = {
  // Merge userRegions by region. The two paths apply for non-ref and ref versions
  userRegions: ['region.id', 'region.__ref'],
  userProjects: ['project.id', 'project.__ref']
};

// These fields need deep merge methods to keep cache only values
export const userStateStorePoliciesConfig = R.indexBy(R.prop('type'), [
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
]);

export const createCacheOnlyPropsForUserState = props => {
  return createCacheOnlyProps({name: 'userStore', cacheIdProps, cacheOnlyObjs}, props);
};

/**
 * Queries userState for the current user as identified by the apollo client.
 * @param {Object} apolloClient The Apollo Client
 * @param {Object} options
 * @param [Object] options.outputParams OutputParams for the query
 * @param {Object} props Arguments for the UserState query. Likely null unless testing whether the current
 * user state has passes a certain predicate
 * @returns {Task|Object} A Task or apollo container resolving to the single item user state response {data: {usersStates: []}}
 */
export const currentUserStateQueryContainer = v(R.curry(
  (apolloConfig, {outputParams}, props) => {
    return composeWithComponentMaybeOrTaskChain([
      response => {
        if (!strPathOr(null, 'data.currentUser', response)) {
          // Loading, error or skipped because not authenticated
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
 * @returns {Task|Object} A Task or Apollo container resolving the user states an object with obj.data.userStates or errors in obj.errors
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
 * Default version of normalizeUserStatePropsForMutating used for UserState mutations
 * @param userState
 * @returns {Object} The normalized userState
 */
export const normalizeDefaultUserStatePropsForMutating = userState => {
  return normalizeUserStatePropsForMutating({}, userState)
}

/**
 * Normalized project props for for mutation
 * @param {Object} config
 * @param {[String]} [config.relatedPropPaths] Default R.concat(RELATED_PROPS, USER_STATE_RELATED_DATA_PROPS)
 * Override this if an implementor has additional relatedPropPaths
 * @param {Object} [config.relatedPropPathsToAllowedFields] Default USER_STATE_SOP_RELATED_DATA_PROPS_ALLOWED
 * Allows relatedPropPaths to optional
 * be reduced to something more than just the id for cases when the object at the path is allowed to be mutated
 * during the userState mutation. This applies to things like searchLocations that don't need to be created
 * before mutating a userState that references them.
 * @param {Object} userState
 * @return {Object} The normalized userState
 */
export const normalizeUserStatePropsForMutating = (
  {
    relatedPropPaths = R.concat(RELATED_PROPS, USER_STATE_RELATED_DATA_PROPS),
    relatedPropPathsToAllowedFields = USER_STATE_RELATED_DATA_PROPS_ALLOWED
  },
  userState
) => {
  return R.compose(
    // Make sure related objects only have an id
    userState => relatedObjectsToIdForm(
      {relatedPropPaths, relatedPropPathsToAllowedFields},
      userState
    ),
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
 * @param {Object} apolloConfig.options
 * @param {Boolean} apolloConfig.options.skip Set true to skip the mutation or disable the ability
 * to call mutation (for component) when the props aren't ready
 * @param {Object} mutationConfig
 * @param {Object} mutationConfig.outputParams OutputParams for the query of the mutation
 * @param {Function} [mutationConfig.normalizeUserStatePropsForMutating] Defaults to normalizeDefaultUserStatePropsForMutating
 * Normalization function for userStateProps. If overriding make sure to include the logic in the default
 * @param {Object} props Object matching the shape of a userState for the create or update
 * @param {Object} [props.userState] Object matching the shape of a userState for the create or update.
 * If omitted then the other props will be assumed to be the props of the userState, minus the render prop
 * @param {Function} [props.render] required for component mutations
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const userStateMutationContainer = v(R.curry((
  apolloConfig,
  {outputParams, normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating},
  props
  ) => {
    return makeMutationRequestContainer(
      R.compose(
        // Merge in the update function
        apolloConfig => {
          return R.merge(apolloConfig, {
              update: (store, {data, render, ...rest}) => {
                const response = {result: {data}, ...rest};
                // Add mutate to response.data so we dont' have to guess if it's a create or update
                const userState = reqStrPathThrowing(
                  'result.data.mutate.userState',
                  addMutateKeyToMutationResponse({silent: true}, response)
                );
                // Add the cache only values to the persisted settings
                // Deep merge the result of the mutation with the props so that we can add cache only values
                // in props. We'll only cache values that are cache only since the mutation will have put
                // the other return objects from the server into the cache
                // TODO this is a bit redundant since the cache write also triggers a merge
                const propsWithCacheOnlyItems = mergeCacheable({idPathLookup: userStateDataTypeIdPathLookup}, userState, {
                  userState,
                  render
                });

                // Mutate the cache to save settings to the database that are not stored on the server
                makeCacheMutationContainer(
                  R.merge(apolloConfig, {store}),
                  {
                    name: 'userState',
                    // Always pass the full params so can pick out the cache only props
                    outputParams: userStateLocalOutputParamsFull(),
                    // For merging cached array items of userState.data.userRegions|userProjedts
                    idPathLookup: userStateDataTypeIdPathLookup
                  },
                  filterOutReadOnlyVersionProps(propsWithCacheOnlyItems)
                );
              }
            }
          )
        },
        apolloConfig => {
          // Compose 'options.variables' with a function that might have been passed in
          return composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables',
            props => {
              // If the userState is specified use it, otherwise assume the userState props are at the top-level
              const userState = R.ifElse(
                R.has('userState'),
                R.prop('userState'),
                R.omit(['render', 'children'])
              )(props);
              // If it's null, we'll skip the request, but set to {} so other filtering works.
              return R.ifElse(
                R.isNil,
                () => ({}),
                normalizeUserStatePropsForMutating
              )(userState);
            }
          )
        }
      )(apolloConfig),
      {
        name: 'userState',
        outputParams
      },
      props
    );
  }), [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationConfig', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape({
      userState: PropTypes.shape(),
      render: PropTypes.function
    }).isRequired]
  ],
  'userStateMutationContainer'
);


/**
 * Soft delete scope instances and the references to them in the user state
 * TODO: There is currently no way to prevent deleting regions that do not belong to the user
 * This will be fixed when Region ownership permissions are set up
 * @param {Object} apolloConfig The Apollo config
 * @param {Object} scopeConfig
 * @param {Object} scopeConfig.outputParams
 * @param {Object} [scopeConfig.normalizeUserStatePropsForMutating] Defaults to normalizeDefaultUserStatePropsForMutating,
 * the normalization function
 * @param {Object} scopeConfig.readInputTypeMapper
 * @param {Object} scopeConfig.scopeName e.g. 'project' or 'region'
 * @param {Object} scopeConfig.scopeProps The scope props to match test the scope, such as {keyContains: 'test'}
 * @param {Object} props
 * @param {Object} props.userState The user state for which to delete scope objects
 * @param {Function} [props.render] Render function, required for component requests
 * @return {Object} {deleted[scope name]s: deleted objects, clearedScopeObjsUserState: Response after mutating the
 * user state to clear the scope instances. In the form {data: {mutate|updateUserState: {...}}}
 */
export const deleteScopeObjectsContainer = (
  apolloConfig,
  {
    outputParams,
    normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating,
    readInputTypeMapper,
    scopeName,
    scopeProps
  },
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
            responsePath: `result.data.mutate.${scopeName}`,
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
      ({render}) => {
        return makeQueryContainer(
          apolloConfig,
          {
            name: `${scopeName}s`,
            outputParams: outputParams,
            readInputTypeMapper
          },
          R.merge(scopeProps, {render})
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
              {
                outputParams: omitClientFields(userStateLocalOutputParamsFull()),
                normalizeUserStatePropsForMutating
              },
              {userState: modifiedUserState, render}
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
 * @param {Object} options. None for now
 * @param {Object} props
 * @param {Object} [props.userState] optional
 * @param props
 * @return {Object} {deleteRegions: deleted region, clearedScopeObjsUserState: The user state post clearing}
 */
export const deleteRegionsContainer = (apolloConfig, {normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating}, {
  userState = null,
  scopeProps,
  render
}) => {
  return deleteScopeObjectsContainer(
    apolloConfig,
    {
      outputParams: regionOutputParamsMinimized,
      normalizeUserStatePropsForMutating,
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
export const deleteProjectsContainer = (apolloConfig, {
  userState = null,
  normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating
}, props) => {
  return deleteScopeObjectsContainer(
    apolloConfig,
    {
      outputParams: projectOutputParamsMinimized,
      normalizeUserStatePropsForMutating,
      readInputTypeMapper: projectReadInputTypeMapper,
      scopeName: 'project',
      scopeProps: props
    },
    userState
  );
};
