import {
  queryAndMergeInUserScopeRelatedInstancesContainer,
  queryUserScopeRelatedInstancesContainer,
  userStateScopeObjsSetPropertyThenMutationContainer
} from './userScopeStore.js'
import {
  composeWithChain,
  defaultRunConfig, hasStrPath,
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
  userStateMutationContainer,
  userStateOutputParamsOnlyIds
} from '../userStateStore.js';
import {regionsQueryContainer} from "../../scopeStores/region/regionStore.js";
import {querySearchLocationsContainer} from "../../search/searchLocation/searchLocationStore.js";
import {getPathOnResolvedUserScopeInstances, setPathOnResolvedUserScopeInstance} from "./userScopeHelpers.js";

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
              setPropPath: 'newIsActiveValue',
              userScopePreMutation: userScope => {
                // Do a side effect prior to mutation
                return R.compose(
                  userScope => R.set(R.lensPath(['userSearch', 'userSearchLocations', 1, 'activity', 'isActive']), true, userScope),
                  userScope => R.set(R.lensPath(['userSearch', 'userSearchLocations', 0, 'activity', 'isActive']), false, userScope)
                )(userScope)
              }
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
        ({apolloConfig, currentUserResponse, settingsResponse}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig,
            {},
            {
              user: R.pick(['id'], reqStrPathThrowing('data.currentUser', currentUserResponse)),
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
        ({apolloConfig, currentUserResponse}) => {
          return currentUserStateQueryContainer(apolloConfig, {outputParams: userStateOutputParamsOnlyIds}, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        ({userState, updatedUserState}) => {
          expect(strPathOr(null, 'result.data.mutate.userState.data.userRegions.0.activity.isActive', updatedUserState)).toEqual(
            false
          );
          expect(strPathOr(null, 'result.data.mutate.userState.data.userRegions.0.userSearch.userSearchLocations.0.activity.isActive', updatedUserState)).toEqual(
            false
          );
          expect(strPathOr(null, 'result.data.mutate.userState.data.userRegions.0.userSearch.userSearchLocations.1.activity.isActive', updatedUserState)).toEqual(
            true
          );
        }
    }, errors, done));
  }, 100000);


  test('setPathOnResolvedUserScopeInstance', () => {
    const userState = {
      data: {
        userRegions: [
          {region: {id: 1}, fiddles: [{fum: 1}, {fum: 2}], foo: {bill: 'kid'}},
          {region: {id: 2}, fiddles: [{fum: 1}, {fum: 2}], foo: {billy: 'goat'}}
        ]
      }
    };
    const region = {id: 2};
    const fooData = {billy: 'nanny'}

    // Using scopeInstancePropPath
    const found = setPathOnResolvedUserScopeInstance({
      scopeName: 'region',
      userStatePropPath: 'userState',
      scopeInstancePropPath: 'region',
      setPath: 'foo',
      setPropPath: 'fooData'
    }, {userState, region, fooData});
    expect(found).toEqual(R.set(R.lensProp('foo'), fooData, R.omit(['fiddles'], userState.data.userRegions[1])))

    // Using userScopeInstancePropPath
    const foundAgain = setPathOnResolvedUserScopeInstance({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      setPath: 'foo',
      setPropPath: 'fooData'
    }, {userState, userRegion: {region}, fooData});
    expect(found).toEqual(R.set(R.lensProp('foo'), fooData, R.omit(['fiddles'], userState.data.userRegions[1])))

    // If we are missing the given region
    const notFound = setPathOnResolvedUserScopeInstance({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region',
      setPropPath: 'fooData'
    }, {userState, region: {id: 'fred'}, fooData: 'moo'});
    expect(notFound).toEqual(undefined);


    // If we are missing something in propSets
    const notReady = setPathOnResolvedUserScopeInstance({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region',
      setPropPath: 'fooData'
    }, {userState})
    expect(notReady).toEqual(null);
  })


  test('getPathOnResolvedUserScopeInstance', () => {
    const userState = {
      data: {
        userRegions: [
          {
            region: {
              id: 1,
              foo: {id: 1, turnip: 'radish'},
              smileys: [{id: 1, carrot: 'sauce'}, {id: 2, carrot: 'stick'}]
            }
          },
          {
            region: {id: 2, foo: {id: 2, turnip: 'parsnip'}},
            smileys: [{id: 5, carrot: 'eyes'}, {id: 8, carrot: 'nose'}]
          }
        ]
      }
    };
    const region = {id: 2};
    const fooData = {foo: true}

    // Using scopeInstancePropPath
    const found = getPathOnResolvedUserScopeInstances({
      // Means search userState.data.userRegions
      scopeName: 'region',
      // Means get userState from props.userState
      userStatePropPath: 'userState',
      // Means match userState.data.userRegions.region.id with props.region.id
      scopeInstancePropPath: 'region',
      // Means fetch region.foo from the single matched userStater.data.userRegions
      getPath: 'region.foo',
      // Means get turnip in addition to id from foo
      getProps: ['turnip']
    }, {userState, region, fooData});
    expect(found).toEqual([R.view(R.lensPath(['region', 'foo']), userState.data.userRegions[1])])

    // Using userScopeInstancePropPath
    const foundAgain = getPathOnResolvedUserScopeInstances({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      getPath: 'smileys',
      getProps: ['carrot']
    }, {userState, userRegion: {region}, fooData});
    expect(foundAgain).toEqual(R.view(R.lensProp('smileys'), userState.data.userRegions[1]))

    // If we are missing the given region
    const notFound = getPathOnResolvedUserScopeInstances({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region',
      getPath: 'smileys',
    }, {userState, region: {id: 'fred'}, fooData: 'moo'});
    expect(notFound).toEqual(undefined);


    // If we are missing something in propSets
    const notReady = getPathOnResolvedUserScopeInstances({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region',
      getPath: 'smileys',
    }, {userState})
    expect(notReady).toEqual(null);
  })

  test('queryUserScopeInstancesContainer', done => {
    const errors = [];
    composeWithChain([
      // Filter for projects where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Projects so we can filter by Project
      ({apolloConfig, userState, projects}) => {
        return queryUserScopeRelatedInstancesContainer(
          apolloConfig, {
            scopeName: 'project',
            userStatePropPath: 'userState',
            scopeInstancePropPath: 'projects.0',
            userScopeInstancesPath: 'userSearch.userSearchLocations.searchLocation',
            queryContainer: querySearchLocationsContainer
          },
          {userState, projects}
        )
      },
      // Set the UserState, returns previous values and {userState, projects, regions}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig, {forceDleete: true}, {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila', 'pangea'],
              searchLocationNames: ['search me', 'i am innocent'],
            });
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask()
        }
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expect(R.length(reqStrPathThrowing('data.searchLocations', response))).toEqual(2);
        }
    }, errors, done));
  }, 10000);

  test('queryAndMergeInUserScopeInstancesContainer', done => {
    expect.assertions(2);
    const errors = [];
    composeWithChain([
      // Filter for projects where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Projects so we can filter by Project
      ({apolloConfig, userState, projects}) => {
        return queryAndMergeInUserScopeRelatedInstancesContainer(
          apolloConfig, {
            scopeName: 'project',
            userStatePropPath: 'userState',
            scopeInstancePropPath: 'projects.0',
            userScopePath: 'userSearch.userSearchLocations',
            instancePath: 'searchLocation',
            queryContainer: querySearchLocationsContainer
          },
          {userState, projects}
        )
      },
      // Set the UserState, returns previous values and {userState, projects, regions}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig, {forceDleete: true}, {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila', 'pangea'],
              searchLocationNames: ['search me', 'i am innocent'],
            });
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask()
        }
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expect(R.length(reqStrPathThrowing('data.userSearchLocations', response))).toEqual(2);
          // Make search the searchLocations got merged data from the instance queries
          expect(hasStrPath('data.userSearchLocations.0.searchLocation.geojson', response)).toBeTruthy()
        }
    }, errors, done));
  }, 10000);
});
