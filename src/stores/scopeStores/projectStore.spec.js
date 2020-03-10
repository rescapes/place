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
import {
  composeWithChain,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing
} from 'rescape-ramda';
import {expectKeysAtPath} from 'rescape-helpers-test';
import {localTestAuthTask} from '../../helpers/testHelpers';
import * as R from 'ramda';
import {
  makeProjectMutationContainer,
  makeProjectsQueryContainer,
  projectOutputParams,
  projectOutputParamsMinimized,
  readInputTypeMapper
} from './projectStore';
import {createSampleProjectsTask, createSampleProjectTask} from './projectStore.sample';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStores/userStore';
import {queryVariationContainers} from '../helpers/variedRequestHelpers';
import {of} from 'folktale/concurrency/task';

const someProjectKeys = ['id', 'key', 'geojson'];
describe('projectStore', () => {
  const errors = [];
  test('makeProjectMutationContainer', done => {
    expect.assertions(1);
    composeWithChain([
      mapToNamedPathAndInputs('project', 'data.createProject.project',
        ({apolloClient, userId}) => createSampleProjectTask({apolloClient}, {user: {id: userId}})
      ),
      // Get the current user
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloClient}) => makeCurrentUserQueryContainer({apolloClient}, userOutputParams, {})
      ),
      () => localTestAuthTask
    ])().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'project', response);
        }
    }, errors, done));
  });

  test('queryProjectVariationsContainers', done => {
    expect.assertions(4);
    const task = composeWithChain([
      mapToNamedResponseAndInputs('projectsPagedAll',
        ({projects, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), projects)};
          // Returns all 10 with 2 queries of pageSize 5
          return reqStrPathThrowing('projectsPaginatedAll', variations)(R.merge(props, {pageSize: 5}));
        }
      ),
      mapToNamedResponseAndInputs('projectsPaged',
        ({projects, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), projects)};
          // Returns 3 of the 10 projects on page 3
          return reqStrPathThrowing('projectsPaginated', variations)(R.merge(props, {pageSize: 3, page: 2}));
        }
      ),
      mapToNamedResponseAndInputs('projectsMinimized',
        ({projects, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), projects)};
          return reqStrPathThrowing('projectsMinimized', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('projectsFull',
        ({projects, variations}) => {
          const props = {idIn: R.map(reqStrPathThrowing('id'), projects)};
          return reqStrPathThrowing('projects', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('variations',
        ({apolloConfig}) => {
          return of(queryVariationContainers(
            {apolloConfig, regionConfig: {}},
            {
              name: 'project',
              requestTypes: [
                {},
                {type: 'minimized', args: {outputParams: projectOutputParamsMinimized}},
                // Note that we don't pass page and page size here because we want to be able to query for different pages
                // We either pass page and page size here or in props instead
                {type: 'paginated', args: {}},
                // Note that we don't pass page size here because we want to be able to query for different pages
                // We either pass page and page size here or in props instead
                {type: 'paginatedAll', args: {}}
              ],
              queryConfig: {
                outputParams: projectOutputParams,
                readInputTypeMapper: readInputTypeMapper
              },
              queryContainer: makeProjectsQueryContainer
            }
          ));
        }
      ),
      mapToNamedResponseAndInputs('projects',
        ({apolloConfig, user}) => createSampleProjectsTask(apolloConfig, {user})
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return localTestAuthTask;
        }
      )
    ])({});
    const errors = [];
    task.run().listen(defaultRunConfig({
      onResolved: ({projectsFull, projectsMinimized, projectsPaged, projectsPagedAll}) => {
        expect(R.length(reqStrPathThrowing('data.projects', projectsFull))).toEqual(10);
        expect(R.length(reqStrPathThrowing('data.projects', projectsMinimized))).toEqual(10);
        expect(R.length(reqStrPathThrowing('objects', projectsPaged))).toEqual(3);
        expect(R.length(projectsPagedAll)).toEqual(10);
      }
    }, errors, done));
  },100000);
});