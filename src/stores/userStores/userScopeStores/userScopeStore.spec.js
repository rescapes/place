import {userStateScopeObjsSetPropertyThenMutationContainer} from './userScopeStore.js'
import {
  composeWithChain,
  defaultRunConfig,
  mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import * as R from 'ramda';
import {mutateSampleUserStateWithProjectsAndRegionsContainer} from '../userStateStore.sample.js';
import {currentUserQueryContainer, deleteItemsOfExistingResponses, userOutputParams} from '@rescapes/apollo';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import {
  currentUserStateQueryContainer,
  normalizeDefaultUserStatePropsForMutating, userScopeOutputParamsOnlyIds,
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateMutationContainer,
  userStateOutputParamsOnlyIds
} from '../userStateStore.js';
import {regionsQueryContainer} from "../../scopeStores/region/regionStore";
import {defaultSearchLocationOutputParams} from "../../search/searchLocation/defaultSearchLocationOutputParams";

describe('userStateHelpers', () => {
  test('userStateScopeObjsSetPropertyThenMutationContainer', done => {
    const errors = [];
    composeWithChain([
      // Since this is a mutation, it's okay to not have a userRegion defined, but then we can't mutate
      mapToNamedResponseAndInputs('updatedUserState',
        ({apolloConfig, userState, settingsResponse}) => {
          const userRegion = reqStrPathThrowing('data.userRegions.0', userState)
          const region = reqStrPathThrowing('region', userRegion)
          const userRegionOutputParams = userScopeOutputParamsOnlyIds('region')
          return userStateScopeObjsSetPropertyThenMutationContainer(
            apolloConfig,
            {
              scopeName: 'region',
              userScopeOutputParams: userRegionOutputParams,
              scopeQueryContainer: regionsQueryContainer,
              normalizeUserStatePropsForMutating: normalizeDefaultUserStatePropsForMutating,
              userStatePropPath: 'userState',
              userScopeInstancePropPath: 'userRegion',
              scopeInstancePropPath: 'region',
              setPath: 'activity.isActive',
              setPropPath: 'newIsActiveValue'
            },
            {
              // The userState is optional. The current userState will be fetched from the cache or server
              //userState,
              region,
              newIsActiveValue: !userRegion.activity.isActive
            }
          );
        }
      ),
      // Set the UserState, returns previous values and {userState, project, region}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user, settingsResponse}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig,
            {
            },
            {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila'],
              searchLocationNames: ['search me', 'i am innocent'],
            }
          );
        }
      ),

      mapToMergedResponseAndInputs(
        ({apolloConfig, userStateResponses}) => {
          return deleteItemsOfExistingResponses(
            apolloConfig, {
              queryResponsePath: 'data.userStates',
              forceDelete: true,
              mutationContainer: userStateMutationContainer,
              responsePath: 'result.data.mutate.userState',
              outputParams: {id: 1, deleted: 1}
            },
            {existingItemResponses: userStateResponses}
          );
        }
      ),

      // Resolve the user state
      mapToNamedResponseAndInputs('userStateResponses',
        ({apolloConfig}) => {
          return currentUserStateQueryContainer(apolloConfig, {outputParams: userStateOutputParamsOnlyIds}, {});
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        ({userState, updatedUserState}) => {
          // We should have added on designFeatureLayer
          expect(strPathOr(null, 'result.data.mutate.userState.data.userRegions.0.activity.isActive', updatedUserState)).toEqual(
            false
          );
        }
    }, errors, done));
  }, 100000);
});
