/**
 * Created by Andy Likuski on 2019.01.15
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {defaultRunConfig, reqStrPathThrowing, mapToNamedPathAndInputs} from 'rescape-ramda';
import {expectKeysAtStrPath, localTestAuthTask} from '../../helpers/testHelpers';
import * as R from 'ramda';
import {makeProjectMutationContainer, makeProjectsQueryContainer, projectOutputParams} from './projectStore';
import {createSampleProjectTask} from './projectStore.sample';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStores/userStore';

const someProjectKeys = ['id', 'key', 'geojson'];
describe('projectStore', () => {
  const errors = [];
  test('makeProjectMutationContainer', done => {
    expect.assertions(1);
    R.composeK(
      mapToNamedPathAndInputs('project', 'data.createProject.project',
        ({apolloClient, userId}) => createSampleProjectTask({apolloClient}, {user: {id: userId}})
      ),
      // Get the current user
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloClient}) => makeCurrentUserQueryContainer({apolloClient}, userOutputParams, null)
      ),
      () => localTestAuthTask
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtStrPath(someProjectKeys, 'project', response);
        }
    }, errors, done));
  });

  test('makeProjectsQueryContainer', done => {
    expect.assertions(1);
    const errors = [];
    R.composeK(
      ({apolloClient, project}) => makeProjectsQueryContainer(
        {apolloClient},
        {outputParams: projectOutputParams, propsStructure: {key: ''}},
        null,
        {key: reqStrPathThrowing('key', project)}
      ),
      mapToNamedPathAndInputs('project', 'data.createProject.project',
        ({apolloClient, user}) => createSampleProjectTask({apolloClient}, {user: {id: user.id}})
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloClient}) => makeCurrentUserQueryContainer({apolloClient}, userOutputParams, null)
      ),
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
        () => localTestAuthTask
      )
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtStrPath(someProjectKeys, 'data.projects.0', response);
        }
    }, errors, done));
  }, 50000);
});