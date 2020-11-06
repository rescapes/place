import {
  findUserScopeInstance,
  userStateScopeObjsQueryContainer,
  matchingUserStateScopeInstance,
  matchingUserStateScopeInstances, userScopeState
} from './userStateHelpers';
import {
  composeWithChain, defaultRunConfig, expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  strPathOr
} from 'rescape-ramda';
import * as R from 'ramda';
import {userStateProjectOutputParams, userStateProjectsQueryContainer} from './userStateProjectStore';
import {mutateSampleUserStateWithProjectsAndRegionsContainer} from '../userStateStore.sample';
import {currentUserQueryContainer, userOutputParams} from 'rescape-apollo';
import {testAuthTask} from '../../../helpers/testHelpers';
import {
  makeProjectsQueryContainer,
  userScopeOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator
} from '../../..';
import {userStateReadInputTypeMapper} from '../userStateStore';

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
            scopeQueryContainer: makeProjectsQueryContainer,
            scopeName,
            readInputTypeMapper: userStateReadInputTypeMapper,
            userStateOutputParamsCreator: userScopeOutputParams => {
              return userStateOutputParamsCreator(
                userScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
              );
            },
            userScopeOutputParams: userStateProjectOutputParams()
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
      ({apolloConfig, user}) => {
        return mutateSampleUserStateWithProjectsAndRegionsContainer({
          apolloConfig,
          user: R.pick(['id'], user),
          regionKeys: ['earth'],
          projectKeys: ['shrangrila', 'pangea']
        });
      },
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
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
      userScopeCollectName: 'userRegions',
      scopeName: 'region',
      userStatePropKey: 'userState',
      scopeInstancePropKey: 'region'
    }, {userState, region});

    expect(found).toEqual(userState['data']['userRegions'][1]);
    const notFound = findUserScopeInstance({
      userScopeCollectName: 'userRegions',
      scopeName: 'region',
      userStatePropKey: 'userState',
      scopeInstancePropKey: 'region'
    }, {userState, region: {id: 'fred'}});
    expect(notFound).toEqual(undefined);
  });
})