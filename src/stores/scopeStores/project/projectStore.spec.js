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
  expectKeysAtPath,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing, strPathOr
} from '@rescapes/ramda';
import {testAuthTask} from '../../../helpers/testHelpers.js';
import * as R from 'ramda';
import {makeProjectMutationContainer, projectQueryVariationContainers} from './projectStore.js';
import {createSampleProjectContainer, createSampleProjectsContainer} from './projectStore.sample';
import T from 'folktale/concurrency/task/index.js';

const {of} = T;
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';
import {createSampleLocationsContainer} from '../location/locationStore.sample.js';

const someProjectKeys = ['id', 'key', 'geojson'];
describe('projectStore', () => {
  test('makeProjectMutationContainer', done => {
    expect.assertions(1);
    const errors = [];
    composeWithChain([
      mapToNamedPathAndInputs('project', 'result.data.createProject.project',
        ({apolloConfig, userId}) => createSampleProjectContainer(
          apolloConfig,
          {locationsContainer: createSampleLocationsContainer},
          {user: {id: userId}}
        )
      ),
      // Get the current user
      mapToNamedPathAndInputs('userId', 'data.currentUser.id',
        ({apolloConfig}) => currentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someProjectKeys, 'project', response);
        }
    }, errors, done));
  }, 10000);

  test('queryProjectVariationsContainers', done => {
    expect.assertions(4);
    const errors = [];
    const task = composeWithChain([
      mapToNamedResponseAndInputs('projectsPagedAll',
        ({projectResponses, variations, user}) => {
          const props = {user, idIn: R.map(reqStrPathThrowing('id'), projectResponses)};
          // Returns all 10 with 2 queries of pageSize 5
          return reqStrPathThrowing('queryProjectsPaginatedAll', variations)(R.merge(props, {
            projectQueryKey: 'queryProjectsPaginatedAll',
            pageSize: 5
          }));
        }
      ),
      mapToNamedResponseAndInputs('projectsPaged',
        ({projectResponses, variations,user}) => {
          const props = {user, idIn: R.map(reqStrPathThrowing('id'), projectResponses)};
          // Returns 3 of the 10 projects on page 3
          return reqStrPathThrowing('queryProjectsPaginated', variations)(R.merge(props, {
            projectQueryKey: 'queryProjectsPaginated',
            pageSize: 3,
            page: 2
          }));
        }
      ),
      mapToNamedResponseAndInputs('projectsMinimized',
        ({projectResponses, variations, user}) => {
          const props = {user, idIn: R.map(reqStrPathThrowing('id'), projectResponses)};
          return reqStrPathThrowing('queryProjectsMinimized', variations)(R.merge(props, {projectQueryKey: 'queryProjectsMinimized'}));
        }
      ),
      mapToNamedResponseAndInputs('projectsFull',
        ({projectResponses, variations, user}) => {
          const props = {user, idIn: R.map(reqStrPathThrowing('id'), projectResponses)};
          return reqStrPathThrowing('queryProjects', variations)(R.merge(props, {projectQueryKey: 'queryProjects'}));
        }
      ),
      mapToNamedResponseAndInputs('variations',
        ({apolloConfig}) => {
          return of(projectQueryVariationContainers(
            R.merge(apolloConfig, {
              options: {
                skip: props => {
                  return !strPathOr('user', props);
                },
                variables: props => {
                  // Search by whatever props are passed into projectFilter
                  return R.merge(
                    R.pick(['idIn'], props),
                    {user: R.pick(['id'], reqStrPathThrowing('user', props))}
                  );
                },
                errorPolicy: 'all',
                partialRefetch: true
              }
            })
          ));
        }
      ),
      mapToNamedResponseAndInputs('projectResponses',
        ({apolloConfig, user}) => createSampleProjectsContainer(apolloConfig, {user})
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
    task.run().listen(defaultRunConfig({
      onResolved: ({projectsFull, projectsMinimized, projectsPaged, projectsPagedAll}) => {
        expect(R.length(reqStrPathThrowing('data.projects', projectsFull))).toEqual(10);
        expect(R.length(reqStrPathThrowing('data.projects', projectsMinimized))).toEqual(10);
        expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projectsPaged))).toEqual(3);
        expect(R.length((reqStrPathThrowing('data.projectsPaginated.objects', projectsPagedAll)))).toEqual(10);
      }
    }, errors, done));
  }, 100000);
});