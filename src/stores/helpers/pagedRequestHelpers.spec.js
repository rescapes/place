/**
 * Created by Andy Likuski on 2020.03.04
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {queryPageContainer, queryUsingPaginationContainer} from './pagedRequestHelpers';
import {
  composeWithChain,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs, mergeDeep,
  reqStrPathThrowing
} from '@rescapes/ramda';
import {createSampleProjectsContainer} from '../scopeStores/project/projectStore.sample';
import * as R from 'ramda';
import {projectOutputParams} from '../scopeStores/project/projectStore';
import {testAuthTask} from '../../helpers/testHelpers';
import {currentUserQueryContainer, userOutputParams} from '@rescapes/apollo';

test('queryUsingPaginationContainer', done => {
  const task = composeWithChain([
    ({apolloConfig, projects}) => {
      return queryUsingPaginationContainer(
        {apolloConfig, regionConfig: {}},
        {
          typeName: 'project',
          name: 'projectsPaginated',
          pageSize: 1,
          outputParams: projectOutputParams,
          normalizeProps: props => {
            return props;
          }
        },
        {
          idIn: R.map(R.prop('id'), projects)
        }
      );
    },
    mapToNamedResponseAndInputs('projects',
      ({apolloConfig, user}) => createSampleProjectsContainer(apolloConfig, {user})
    ),
    mapToNamedPathAndInputs('user', 'data.currentUser',
      ({apolloConfig}) => {
        return currentUserQueryContainer(apolloConfig, userOutputParams, {});
      }
    ),
    mapToNamedResponseAndInputs('apolloConfig',
      ({}) => {
        return testAuthTask;
      }
    )
  ])({});
  const errors = [];
  task.run().listen(defaultRunConfig({
    onResolved: projects => {
      expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projects))).toEqual(10);
    }
  }, errors, done));
}, 100000);

test('queryPageContainer', done => {
  const pageSize = 1;
  expect.assertions(6);
  const task = composeWithChain([
    mapToNamedResponseAndInputs('projectsPagedSkipped2',
      ({apolloConfig, projects}) => {
        return queryPageContainer(
          {apolloConfig, regionConfig: {}},
          {
            pageSize,
            // No page argument, so skip
            typeName: 'project',
            name: 'projectsPaginated',
            filterObjsByConfig: ({regionConfig}, objs) => objs,
            outputParams: projectOutputParams,
            normalizeProps: props => {
              return props;
            }
          },
          {idIn: R.map(R.prop('id'), projects)}
        );
      }
    ),
    mapToNamedResponseAndInputs('projectsPagedSkipped',
      ({apolloConfig, projects}) => {
        return queryPageContainer(
          {apolloConfig: mergeDeep(apolloConfig, {options: {skip: true}}), regionConfig: {}},
          {
            pageSize,
            page: 10,
            typeName: 'project',
            name: 'projectsPaginated',
            filterObjsByConfig: ({regionConfig}, objs) => objs,
            outputParams: projectOutputParams,
            normalizeProps: props => {
              return props;
            }
          },
          {idIn: R.map(R.prop('id'), projects)}
        );
      }
    ),
    mapToNamedResponseAndInputs('projectsPaged10',
      ({apolloConfig, projects}) => {
        return queryPageContainer(
          {apolloConfig, regionConfig: {}},
          {
            pageSize,
            page: 10,
            typeName: 'project',
            name: 'projectsPaginated',
            filterObjsByConfig: ({regionConfig}, objs) => objs,
            outputParams: projectOutputParams,
            normalizeProps: props => {
              return props;
            }
          },
          {idIn: R.map(R.prop('id'), projects)}
        );
      }
    ),
    mapToNamedResponseAndInputs('projectsPaged1',
      ({apolloConfig, projects}) => {
        return queryPageContainer(
          {apolloConfig, regionConfig: {}},
          {
            pageSize,
            page: 1,
            typeName: 'project',
            name: 'projectsPaginated',
            filterObjsByConfig: ({regionConfig}, objs) => objs,
            outputParams: projectOutputParams,
            normalizeProps: props => {
              return props;
            }
          },
          {idIn: R.map(R.prop('id'), projects)}
        );
      }),
    mapToNamedResponseAndInputs('projects',
      ({apolloConfig, user}) => createSampleProjectsContainer(apolloConfig, {user})
    ),
    mapToNamedPathAndInputs('user', 'data.currentUser',
      ({apolloConfig}) => {
        return currentUserQueryContainer(apolloConfig, userOutputParams, {});
      }
    ),
    mapToNamedResponseAndInputs('apolloConfig',
      ({}) => {
        return testAuthTask;
      }
    )
  ])({});
  const errors = [];
  task.run().listen(defaultRunConfig({
    onResolved: ({projectsPaged1, projectsPaged10, projectsPagedSkipped,projectsPagedSkipped2 }) => {
      expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projectsPaged1))).toEqual(1);
      expect(reqStrPathThrowing('data.projectsPaginated.pages', projectsPaged1)).toEqual(10);
      expect(R.length(reqStrPathThrowing('data.projectsPaginated.objects', projectsPaged10))).toEqual(1);
      expect(reqStrPathThrowing('data.projectsPaginated.hasNext', projectsPaged10)).toEqual(false);
      expect(projectsPagedSkipped.skip).toBeTruthy()
      expect(projectsPagedSkipped2.skip).toBeTruthy()
    }
  }, errors, done));
}, 100000);