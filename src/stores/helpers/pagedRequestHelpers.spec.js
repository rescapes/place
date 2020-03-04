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

import {queryUsingPaginationContainer} from './pagedRequestHelpers';
import {
  composeWithChain,
  defaultRunConfig,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs, reqStrPathThrowing,
  traverseReduce
} from 'rescape-ramda';
import {testAuthTask} from 'rescape-apollo';
import {createSampleProjectTask} from '../scopeStores/projectStore.sample';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStores/userStore';
import * as R from 'ramda';
import {projectOutputParams} from '../..';
import {of, fromPromised} from 'folktale/concurrency/task';
import {localTestAuthTask} from '../../helpers/testHelpers';
import moment from 'moment';

test('queryUsingPaginationContainer', done => {
  const task = composeWithChain([
    ({apolloConfig, projects}) => {
      return queryUsingPaginationContainer(
        {apolloConfig, regionConfig: {}},
        {
          typeName: 'project',
          name: 'projectsPaginated',
          pageSize: 1,
          filterObjsByConfig: ({regionConfig}, objs) => objs,
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
      ({apolloConfig, user}) => {
        return traverseReduce(
          (projects, project) => {
            return R.concat(projects, [reqStrPathThrowing('data.createProject.project', project)]);
          },
          of([]),
          R.times(() => {
            return composeWithChain([
              () => {
                return createSampleProjectTask(apolloConfig, {
                    key: `test${moment().format('HH-mm-SS')}`,
                    user: {
                      id: user.id
                    }
                  }
                );
              },
              () => fromPromised(() => new Promise(r => setTimeout(r, 100)))()
            ])();
          }, 10)
        );
      }
    ),
    mapToNamedPathAndInputs('user', 'data.currentUser',
      ({apolloConfig}) => {
        return makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {});
      }
    ),
    mapToNamedResponseAndInputs('apolloConfig',
      ({}) => {
        return localTestAuthTask;
      }
    )
  ])({});
  const errors = [];
  task.run().listen(defaultRunConfig({
    onResolved: projects => {
      expect(R.length(projects)).toEqual(10);
    }
  }, errors, done));
}, 100000);