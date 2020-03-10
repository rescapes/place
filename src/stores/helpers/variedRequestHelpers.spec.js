/**
 * Created by Andy Likuski on 2020.03.03
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {queryVariationContainers} from './variedRequestHelpers';
import {
  makeCurrentUserQueryContainer,
  userOutputParams
} from '../../stores/userStores/userStore';
import {
  makeProjectsQueryContainer,
  projectOutputParams, projectOutputParamsMinimized
} from '../../stores/scopeStores/projectStore';
import {
  composeWithChain, defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing
} from 'rescape-ramda';
import {localTestAuthTask} from '../../helpers/testHelpers';
import {createSampleProjectTask} from '../scopeStores/projectStore.sample';
import {readInputTypeMapper} from '../scopeStores/projectStore';
import {of} from 'folktale/concurrency/task';
import * as R from 'ramda';

describe('variedRequestHelpers', () => {
  test('queryVariationContainers', done => {
    expect.assertions(4);
    const task = composeWithChain([
      mapToNamedResponseAndInputs('projectsPagedAll',
        ({project, variations}) => {
          const props = {id: reqStrPathThrowing('id', project)};
          return reqStrPathThrowing('projectsPaginatedAll', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('projectsPaged',
        ({project, variations}) => {
          const props = {id: reqStrPathThrowing('id', project)};
          return reqStrPathThrowing('projectsPaginated', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('projectsMinimized',
        ({project, variations}) => {
          const props = {id: reqStrPathThrowing('id', project)};
          return reqStrPathThrowing('projectsMinimized', variations)(props);
        }
      ),
      mapToNamedResponseAndInputs('projects',
        ({project, variations}) => {
          const props = {id: reqStrPathThrowing('id', project)};
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
                {type: 'paginated', args: {page: 1, pageSize: 1}},
                {type: 'paginatedAll', args: {page: 1}}
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
      mapToNamedPathAndInputs('project', 'data.createProject.project',
        ({apolloConfig, user}) => createSampleProjectTask(apolloConfig, {user: {id: user.id}})
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
      onResolved: ({projects, projectsMinimized, projectsPaged, projectsPagedAll}) => {
        expect(R.length(reqStrPathThrowing('data.projects', projects))).toEqual(1);
        expect(R.length(reqStrPathThrowing('data.projects', projectsMinimized))).toEqual(1);
        expect(R.length(reqStrPathThrowing('objects', projectsPaged))).toEqual(1);
        expect(projectsPagedAll).toEqual(1);
      }
    }, errors, done));
  });
});
