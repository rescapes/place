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
import {queryVariationContainers} from './variedRequestHelpers.js';
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';
import {
  projectsQueryContainer,
  projectOutputParams,
  projectOutputParamsMinimized
} from '../../stores/scopeStores/project/projectStore.js';
import {
  composeWithChain,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing
} from '@rescapes/ramda';
import {testAuthTask} from '../../helpers/testHelpers.js';
import {createSampleProjectsContainer} from '../scopeStores/project/projectStore.sample.js';
import {projectReadInputTypeMapper} from '../scopeStores/project/projectStore.js';
import T from 'folktale/concurrency/task/index.js';

const {of} = T;
import * as R from 'ramda';

describe('variedRequestHelpers', () => {
  test('queryVariationContainers', done => {
    expect.assertions(5);
    const task = composeWithChain([
      mapToNamedResponseAndInputs('projectsPagedAllMinimized',
        ({projects, variations}) => {
          const props = {projectFilter: {idIn: R.map(reqStrPathThrowing('id'), projects)}};
          // Returns all 4 with 2 queries of pageSize 5
          return reqStrPathThrowing('queryProjectsPaginatedAllMinimized', variations)(
            // Teat the test prop queryVariationContainersTestAll
            R.mergeRight(props, {queryVariationContainersTestAll: true, pageSize: 5})
          );
        }
      ),
      mapToNamedResponseAndInputs('projectsPagedAll',
        ({projects, variations}) => {
          const props = {projectFilter: {idIn: R.map(reqStrPathThrowing('id'), projects)}};
          // Returns all 4 with 2 queries of pageSize 5
          return reqStrPathThrowing('queryProjectsPaginatedAll', variations)(R.mergeRight(props, {
            projectQueryKey: 'queryProjectsPaginatedAll',
            pageSize: 5
          }));
        }
      ),
      mapToNamedResponseAndInputs('projectsPaged',
        ({projects, variations}) => {
          const props = {projectFilter: {idIn: R.map(reqStrPathThrowing('id'), projects)}};
          // Returns 2 of the 4 projects on page 2
          return reqStrPathThrowing('queryProjectsPaginated', variations)(R.mergeRight(props, {
            projectQueryKey: 'queryProjectsPaginated',
            pageSize: 2,
            page: 2
          }));
        }
      ),
      mapToNamedResponseAndInputs('projectsMinimized',
        ({projects, variations}) => {
          const props = {projectFilter: {idIn: R.map(reqStrPathThrowing('id'), projects)}};
          return reqStrPathThrowing('queryProjectsMinimized', variations)(R.mergeRight(props, {projectQueryKey: 'queryProjectsMinimized'}));
        }
      ),
      mapToNamedResponseAndInputs('projectsFull',
        ({projects, variations}) => {
          const props = {projectFilter: {idIn: R.map(reqStrPathThrowing('id'), projects)}};
          return reqStrPathThrowing('queryProjects', variations)(R.mergeRight(props, {projectQueryKey: 'queryProjects'}));
        }
      ),
      mapToNamedResponseAndInputs('variations',
        ({apolloConfig}) => {
          return of(queryVariationContainers(
            R.mergeRight(apolloConfig, {
                options: {
                  variables: props => {
                    // Search by whatever props are passed into locationFilter
                    return R.propOr(null, 'projectFilter', props);
                  },
                  errorPolicy: 'all',
                  partialRefetch: true
                }
              }
            ),
            {
              name: 'project',
              allowRequestPropPath: 'projectQueryKey',
              requestTypes: [
                {},
                {type: 'minimized', args: {outputParams: projectOutputParamsMinimized}},
                // Note that we don't pass page and page size here because we want to be able to query for different pages
                // We either pass page and page size here or in props instead
                {type: 'paginated', args: {}},
                // Note that we don't pass page size here because we want to be able to query for different pages
                // We either pass page and page size here or in props instead
                {type: 'paginatedAll', args: {}},
                {
                  name: 'paginatedAllMinimized',
                  type: 'paginatedAll',
                  args: {outputParams: projectOutputParamsMinimized}
                }
              ],
              queryConfig: {
                outputParams: projectOutputParams,
                readInputTypeMapper: projectReadInputTypeMapper
              },
              queryContainer: projectsQueryContainer
            }
          ));
        }
      ),
      mapToNamedResponseAndInputs('projects',
        ({apolloConfig, user}) => {
          return createSampleProjectsContainer(apolloConfig, {count:4}, {user});
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => {
          return testAuthTask();
        }
      )
    ])({});
    const errors = [];
    task.run().listen(defaultRunConfig({
      onResolved: ({projectsFull, projectsMinimized, projectsPaged, projectsPagedAll, projectsPagedAllMinimized}) => {
        expect(R.length(reqStrPathThrowing('data.projects', projectsFull))).toEqual(4);
        expect(R.length(reqStrPathThrowing('data.projects', projectsMinimized))).toEqual(4);
        expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projectsPaged))).toEqual(2);
        expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projectsPagedAll))).toEqual(4);
        expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projectsPagedAllMinimized))).toEqual(4);
      }
    }, errors, done));
  }, 4000000);
});
