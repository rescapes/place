import {matchingUserStateScopeInstance, matchingUserStateScopeInstances} from './userStateHelpers';
import {reqStrPathThrowing, strPathOr} from 'rescape-ramda';
import * as R from 'ramda';

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
});