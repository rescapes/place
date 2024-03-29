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
  addMutateKeyToMutationResponse, authenticatedUserLocalContainer,
  callMutationNTimesAndConcatResponses,
  composeFuncAtPathIntoApolloConfig,
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  createCacheOnlyProps,
  createReadInputTypeMapper,
  currentUserQueryContainer, filterOutNullAndEmptyDeep,
  filterOutNullDeleteProps,
  filterOutReadOnlyVersionProps,
  getRenderPropFunction, logicalOrValueAtPathIntoApolloConfig,
  makeCacheMutationContainer,
  makeMutationRequestContainer,
  makeQueryContainer,
  mapTaskOrComponentToNamedResponseAndInputs,
  mergeCacheable,
  omitClientFields,
  updateRelatedObjectsToIdForm,
  versionOutputParamsMixin
} from '@rescapes/apollo';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {
  capitalize,
  mergeDeep,
  omitDeep,
  pathOr,
  pickDeepPaths,
  reqPathThrowing,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import {selectionOutputParamsFragment} from './selectionStore.js';
import {activityOutputParamsMixin} from './activityStore.js';
import moment from 'moment';
import {
  defaultSearchLocationOutputParams,
  defaultSearchLocationOutputParamsMinimized
} from "../search/searchLocation/defaultSearchLocationOutputParams.js";
import {userStateRegionOutputParams} from "./userScopeStores/userStateRegionStoreHelpers.js";
import {userStateProjectOutputParams} from "./userScopeStores/userStateProjectStoreHelpers.js";
import {
  regionOutputParams,
  regionOutputParamsMinimized,
  regionReadInputTypeMapper
} from "../scopeStores/region/regionStore.js";
import {
  projectOutputParams,
  projectOutputParamsMinimized,
  projectReadInputTypeMapper
} from "../scopeStores/project/projectStore.js";
import {createUserSearchOutputParams} from "./userScopeStores/userSearchStore.js";
import {makeQueryFromCacheContainer} from "@rescapes/apollo/src/helpers/queryCacheHelpers.js";
import {readInputTypeMapper} from "@rescapes/apollo/src/helpers/settingsStore.js";
import {taskToPromise} from "@rescapes/ramda/src/monadHelpers.js";


// TODO should be derived from the remote schema
const RELATED_PROPS = ['user'];
export const USER_STATE_RELATED_DATA_PROPS = [
  'data.userRegions.region', 'data.userProjects.project',
  'data.userProjects.project.locations',
  // These two are listed explicitly so we can limit their props in USER_STATE_RELATED_DATA_PROPS_ALLOWED
  'data.userRegions.userSearch.userSearchLocations',
  'data.userProjects.userSearch.userSearchLocations',
  'data.userRegions.userSearch.userSearchLocations.searchLocation',
  'data.userProjects.userSearch.userSearchLocations.searchLocation',
  'data.userRegions.userSearch.userSearchLocations.searchLocation.jurisdictions',
  'data.userProjects.userSearch.userSearchLocations.searchLocation.jurisdictions',
];
// User search locations can be saved with the following props when we mutate a userState
export const USER_SEARCH_LOCATION_ALLOWED_PROPS = ['name', 'identification', 'street', 'jurisdictions', 'geojson', 'data']
export const USER_STATE_RELATED_DATA_PROPS_ALLOWED = {
  // These two prevent extra fields in userSearchLocations that were used as context in forming the search
  'data.userRegions.userSearch.userSearchLocations': ['searchLocation', 'activity'],
  'data.userProjects.userSearch.userSearchLocations': ['searchLocation', 'activity'],
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
    [`user${capitalized}s`]: R.mergeRight({
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
        [`${scopeName}.id`, 'userSearch.userSearchLocations.activity', 'userSearch.userSearchLocations.searchLocation.id', 'activity'],
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
  const mergedOutputFragment = scopeName => R.mergeRight({
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
 * Queries userState for the current user as identified on the server via the Apollo Client
 * @param {Object} apolloClient The Apollo Client
 * @param {Object} options
 * @param {Object} options.outputParams OutputParams for the UserState query
 * @param {Object} [options.readInputTypeMapper] Defaults to userStateReadInputTypeMapper
 * @param {String} [options.userStatePropPath] Default null. Instructs the query where to find props to limit
 * the UserState query. This is only useful for checking for filtering out the current UserState
 * @param {Object} props Arguments for the UserState query. Usually empty except for the render method of component queries
 * @returns {Task|Object} A Task or apollo container resolving to the single item user state response {data: {usersStates: []}}
 */
export const currentUserStateQueryContainer = v((apolloConfig, {outputParams, readInputTypeMapper=userStateReadInputTypeMapper, userStatePropPath}, props) => {
    return composeWithComponentMaybeOrTaskChain([
      props => {
        return makeQueryContainer(
          R.compose(
            apolloConfig => {
              // Combine the possible passed in skip with our own here
              return logicalOrValueAtPathIntoApolloConfig(apolloConfig, 'options.skip', !strPathOr(false, 'userResponse.data.currentUser', props))
            },
            apolloConfig => {
              // Compose passed in apollo.options.variables (unusual) with our own
              return composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables',
                props => {
                  // Get props at the userStatePropPath (unusual) or return no props
                  return userStatePropPath ? strPathOr({}, userStatePropPath, props) : {}
                }
              )
            }
          )(apolloConfig),
          {name: 'userStates', readInputTypeMapper, outputParams},
          props
        )
      },
      // Resolve the current user from the cache
      mapTaskOrComponentToNamedResponseAndInputs(apolloConfig, 'userResponse',
        props => {
          return authenticatedUserLocalContainer(apolloConfig, props)
        }
      )
    ])(props)
  },
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryStructure', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape()]
  ], 'currentUserStateQueryContainer');

/**
 * Admin only. Queries userState. This will return only the current user unless the user is_staff or is_superuser
 * on the server
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
  // If we don't have a userState and are skipping the mutation, return without doing anything
  if (!userState) {
    return userState
  }
  return R.compose(
    // Remove nulls and empty objs, since this object can be huge
    userState => {
      return filterOutNullAndEmptyDeep({}, userState)
    },
    // Omit in case we are updating data that came from a query
    userState => {
      return omitDeep(['__typename'], userState)
    },
    // Make sure related objects only have an id
    userState => {
      return updateRelatedObjectsToIdForm(
        {relatedPropPaths, relatedPropPathsToAllowedFields},
        userState
      )
    },
    userState => {
      return filterOutReadOnlyVersionProps(userState)
    },
    userState => {
      return filterOutNullDeleteProps(userState)
    },
    userState => {
      return filterOutCacheOnlyObjs(userState)
    }
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
 * @param {String} [mutationConfig.userStatePropPath] Default 'userState', The prop path to the userState
 * Normalization function for userStateProps. If overriding make sure to include the logic in the default
 * @param {Object} props Object matching the shape of a userState for the create or update
 * @param {Object} [props.userState] Default 'userState',
 * Object matching the shape of a userState for the create or update.
 * @param {Function} [props.render] required for component mutations
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const userStateMutationContainer = v(R.curry((
    apolloConfig,
    {
      outputParams,
      normalizeUserStatePropsForMutating = normalizeDefaultUserStatePropsForMutating,
      userStatePropPath = 'userState'
    },
    props
  ) => {
    return makeMutationRequestContainer(
      R.compose(
        // Merge in the update function
        apolloConfig => {
          return mergeDeep(apolloConfig, {
              options: {
                skip: !strPathOr(null, userStatePropPath, props),
                update: (store, {data, render, ...rest}) => {
                  const response = {result: {data}, ...rest};
                  // Add mutate to response.data so we dont' have to guess if it's a create or update
                  const userState = reqStrPathThrowing(
                    'result.data.mutate.userState',
                    addMutateKeyToMutationResponse({silent: true}, response)
                  );
                  userStateCacheMutationContainer(
                    // Omit options here so we don't winnow props with the options.variables func
                    R.mergeRight(R.omit(['options'], apolloConfig), {store}),
                    {outputParams},
                    props,
                    userState
                  )
                }
              }
            }
          )
        },
        apolloConfig => {
          // Compose 'options.variables' with a function that might have been passed in
          return composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables',
            props => {
              // If the userState resolves to null, the mutation will be marked skipped so it can't run
              const userState = strPathOr(null, userStatePropPath, props)
              return normalizeUserStatePropsForMutating(userState)
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
      render: PropTypes.func
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
          R.mergeRight(scopeProps, {render})
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

/**
 * Cache-only query of the current UserState
 * @param apolloConfig
 * @param outputParams
 * @param props
 * @return {*}
 */
export const currentUserStateLocalQueryContainer = (apolloConfig, {outputParams}, props) => {
  return makeQueryFromCacheContainer(
    composeFuncAtPathIntoApolloConfig(
      apolloConfig,
      'options.variables',
      props => {
        return {}
      }
    ),
    {name: 'userStates', readInputTypeMapper, outputParams},
    props
  );
};

/***
 * Cache the UserState at its id and as a singleton.
 * @param apolloConfig
 * @param outputParams
 * @param {Object} props
 * @param {Object} props.userState The UserState passed to the mutation
 * @param {Object} userState The UserState returned from the mutation
 */
const userStateCacheMutationContainer = (apolloConfig, {outputParams}, props, userState) => {
  // Add the cache only values to the persisted userState
  // Deep merge the result of the mutation with the props so that we can add cache only values
  // TODO the cache write should call mergeFields and preserve cache-only values, but it does not preserve
  const propsWithCacheOnlyItems = mergeCacheable(
    {idPathLookup: userStateDataTypeIdPathLookup},
    // If the UserState is cached, use it, otherwise use the userState passed to the mutation
    // The latter case only applies when we mutate a UserState to the server before we read it from the server,
    // which is only the create new user scenario.
    strPathOr({}, 'userState', props),
    userState
  );

  // These run immediately even though they are containers. The results are returned async for tasks
  // and via the render prop for components, but we discard the results of cache mutations

  // Mutate the cache to save settings to the database that are not stored on the server
  makeCacheMutationContainer(
    apolloConfig,
    {
      name: 'userState',
      // Always pass the full params so can pick out the cache only props
      outputParams: userStateLocalOutputParamsFull(),
      // For merging cached array items of userState.data.userRegions|userProjects
      idPathLookup: userStateDataTypeIdPathLookup
    },
    filterOutReadOnlyVersionProps(propsWithCacheOnlyItems)
  );
  makeCacheMutationContainer(
    apolloConfig,
    {
      name: 'userState',
      // Always pass the full params so can pick out the cache only props
      outputParams: userStateLocalOutputParamsFull(),
      // For merging cached array items of userState.data.userRegions|userProjects
      idPathLookup: userStateDataTypeIdPathLookup,
      singleton: true
    },
    filterOutReadOnlyVersionProps(propsWithCacheOnlyItems)
  );
}