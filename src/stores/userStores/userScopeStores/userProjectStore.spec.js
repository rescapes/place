/**
 * Created by Andy Likuski on 2019.01.04
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  userProjectsQueryContainer,
  userStateOutputParamsCreator,
  userStateProjectMutationContainer
} from './userProjectStore';
import {
  composeWithChainMDeep,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs
} from 'rescape-ramda';
import {createUserProjectWithDefaults, localTestAuthTask} from '../../../helpers/testHelpers';
import {expectKeysAtPath} from 'rescape-helpers-test';
import * as R from 'ramda';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStore';
import {makeProjectMutationContainer, projectOutputParams} from '../../..';
import moment from 'moment';

describe('userProjectStore', () => {
  test('userProjectsQueryContainer', done => {
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    composeWithChainMDeep(1, [
      ({apolloConfig, userId}) => userProjectsQueryContainer(
        apolloConfig,
        {},
        {
          userState: {user: {id: userId}},
          // The sample user is already limited to certain projects. We don't need to limit further
          project: {}
        }
      ),
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloConfig}) => makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => localTestAuthTask
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userProjects.0.project', response);
          done();
        }
    }, errors, done));
  }, 10000);

  test('userProjectQueryTaskWithProjectFilter', done => {
    expect.assertions(1);
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    composeWithChainMDeep(1, [
      // Filter for projects where the geojson.type is 'FeatureCollection'
      // This forces a separate query on Projects so we can filter by Project
      ({apolloConfig, userId}) => userProjectsQueryContainer(apolloConfig, {}, {
        userState: {user: {id: parseInt(userId)}},
        project: {geojson: {type: 'FeatureCollection'}}
      }),
      ({apolloConfig}) => mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => localTestAuthTask
      )
    ])({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userProjects.0.project', response);
        }
    }, errors, done));
  });

  test('makeActiveUserProjectQuery', done => {
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    R.composeK(
      ({apolloConfig, userId}) => userProjectsQueryContainer(
        apolloConfig,
        {},
        {userState: {user: {id: parseInt(userId)}}, project: {}}
      ),
      ({apolloConfig}) => mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => localTestAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.userProjects.0.project', response);
          done();
        }
    }, errors, done));
  });

  test('userStateProjectMutationContainer', done => {
    const errors = [];
    const someProjectKeys = ['id', 'key', 'name'];
    const projectKey = `testProjectKey${moment().format('HH-mm-SS')}`;
    const projectName = `TestProjectName${moment().format('HH-mm-SS')}`;
    R.composeK(
      ({apolloConfig, userId, project}) => {
        return userStateProjectMutationContainer(
          apolloConfig,
          {
            // We only need each project id back from userState.data.userProjects: [...]
            outputParams: ['id']
          },
          {
            userState: {user: {id: parseInt(userId)}},
            userProject: createUserProjectWithDefaults(
              R.over(
                R.lensProp('id'),
                id => parseInt(id),
                project
              )
            )
          }
        );
      },
      // Save a test project
      mapToNamedPathAndInputs('project', 'data.createProject.project',
        ({apolloConfig, userId}) => {
          return makeProjectMutationContainer(
            apolloConfig,
            {outputParams: projectOutputParams},
            {
              user: {id: userId},
              key: projectKey,
              name: projectName
            }
          );
        }
      ),
      // Resolve the user state
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => localTestAuthTask
      )
    )({}).run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'data.createUserState.userState.data.userProjects.0.project', response);
          done();
        }
    }, errors, done));
  }, 100000);
});