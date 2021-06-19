import {
  findUserScopeInstance,
  matchingUserStateScopeInstance,
  matchingUserStateScopeInstances,
  setPathOnResolvedUserScopeInstance,
  userScopeFromProps,
  userStateScopeObjsQueryContainer
} from './userStateHelpers.js';
import {
  composeWithChain,
  defaultRunConfig,
  expectKeysAtPath,
  mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  strPathOr
} from '@rescapes/ramda';
import * as R from 'ramda';
import {userStateProjectOutputParams} from './userStateProjectStoreHelpers.js';
import {mutateSampleUserStateWithProjectsAndRegionsContainer} from '../userStateStore.sample.js';
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import {projectsQueryContainer} from '../../scopeStores/project/projectStore.js';
import {
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from '../userStateStore.js';

describe('userStateHelpers', () => {
  const userState = {
    data: {
      userProjects: [
        {
          selection: {
            isSelected: true
          },
          activity: {
            isActive: true
          },
          project: {
            id: 1353,
            key: 'smurf',
            name: 'Smurf'
          }
        },
        {
          selection: {
            isSelected: true
          },
          activity: {
            isActive: false
          },
          project: {
            id: 1354,
            key: 'azrael',
            name: 'Azrael'
          }
        },
        {
          selection: {
            isSelected: false
          },
          activity: {
            isActive: false
          },
          project: {
            id: 1355,
            key: 'ogre',
            name: 'Ogre'
          }
        }
      ]
    }
  };
  test('matchingUserStateScopeInstance', () => {
    expect(matchingUserStateScopeInstance('project', strPathOr(false, 'activity.isActive'), userState)).toEqual(
      R.head(reqStrPathThrowing('data.userProjects', userState))
    );
  });

  test('matchingUserStateScopeInstances', () => {
    expect(matchingUserStateScopeInstances('project', strPathOr(false, 'selection.isSelected'), userState)).toEqual(
      R.slice(0, 2, reqStrPathThrowing('data.userProjects', userState))
    );
  });

  test('userStateScopeObjsQueryContainer', done => {
    expect.assertions(2);
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    composeWithChain([
      // Filter for projects where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Projects so we can filter by Project
      ({apolloConfig, user, projects}) => {
        // Get the name since it will be Shrangrila29 or whatever
        const projectNames = R.map(R.prop('name'), projects);
        const scopeName = 'project';
        return userStateScopeObjsQueryContainer(
          apolloConfig,
          {
            scopeQueryContainer: projectsQueryContainer,
            scopeName,
            readInputTypeMapper: userStateReadInputTypeMapper,
            userStateOutputParamsCreator: userScopeOutputParams => {
              return userStateOutputParamsCreator(
                userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
              );
            },
            userScopeOutputParams: userStateProjectOutputParams({})
          },
          {
            // Just use the current user
            userState: {},
            userScope: {
              project: {geojson: {type: 'FeatureCollection'}, name: projectNames[0]}
            }
          }
        );
      },
      // Set the UserState, returns previous values and {userState, projects, regions}
      // where project and region are scope instances of userState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig, {forceDleete: true}, {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila', 'pangea']
            });
        }),
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
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userStates.0.data.userProjects.0.project', response);
          expect(R.length(reqStrPathThrowing('data.userStates.0.data.userProjects', response))).toEqual(1);
        }
    }, errors, done));
  }, 1000000);

  test('findUserScopeInstance', () => {
    const userState = {
      data: {
        userRegions: [
          {region: {id: 1}},
          {region: {id: 2}}
        ]
      }
    };
    const region = {id: 2};
    const found = findUserScopeInstance({
      userScopeCollectionName: 'userRegions',
      scopeName: 'region',
      userStatePropPath: 'userState',
      scopeInstancePropPath: 'region'
    }, {userState, region});

    expect(found).toEqual(userState['data']['userRegions'][1]);
    const notFound = findUserScopeInstance({
      userScopeCollectionName: 'userRegions',
      scopeName: 'region',
      userStatePropPath: 'userState',
      scopeInstancePropPath: 'region'
    }, {userState, region: {id: 'fred'}});
    expect(notFound).toEqual(undefined);
  });

  test('userScopeFromProps', () => {
    const userState = {
      data: {
        userRegions: [
          {region: {id: 1}},
          {region: {id: 2}}
        ]
      }
    };
    const region = {id: 2};
    const userRegion = userState.data.userRegions[1]
    const found = userScopeFromProps({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region'
    }, {userState, region});
    expect(found).toEqual(userState['data']['userRegions'][1]);

    const foundAgain = userScopeFromProps({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region'
    }, {userState, userRegion});
    expect(foundAgain).toEqual(userState['data']['userRegions'][1]);

    const notFound = userScopeFromProps({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region'
    }, {userState, region: {id: 'fred'}});
    expect(notFound).toEqual(undefined);

    const notFoundNotAgain = userScopeFromProps({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      scopeInstancePropPath: 'region'
    }, {userState, userRegion: {region: {id: 'fred'}}});
    expect(notFoundNotAgain).toEqual(undefined);
  })

  test('setPathOnResolvedUserScopeInstance', () => {
    const userState = {
      data: {
        userRegions: [
          {region: {id: 1}},
          {region: {id: 2}}
        ]
      }
    };
    const region = {id: 2};
    const fooData = {foo: true}

    // Using scopeInstancePropPath
    const found = setPathOnResolvedUserScopeInstance({
      scopeName: 'region',
      userStatePropPath: 'userState',
      scopeInstancePropPath: 'region',
      setPath: 'foo',
      setPropPath: 'fooData'
    }, {userState, region, fooData});
    expect(found).toEqual(R.set(R.lensProp('foo'), fooData, userState.data.userRegions[1]))

    // Using userScopeInstancePropPath
    const foundAgain = setPathOnResolvedUserScopeInstance({
      scopeName: 'region',
      userStatePropPath: 'userState',
      userScopeInstancePropPath: 'userRegion',
      setPath: 'foo',
      setPropPath: 'fooData'
    }, {userState, userRegion: {region}, fooData});
    expect(foundAgain).toEqual(R.set(R.lensProp('foo'), fooData, userState.data.userRegions[1]))

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

});
