import {testAuthTask} from '../../helpers/testHelpers.js';
import moment from 'moment';
import {
  currentUserStateQueryContainer, userStateMutationContainer,
  userStateOutputParamsFull
} from '../userStores/userStateStore.js';
import {makeMapboxQueryContainer} from '../mapStores/mapboxStore.js';
import * as R from 'ramda';
import {
  composeWithChain,
  defaultRunConfig, mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  strPathOr
} from '@rescapes/ramda';
import {mapboxOutputParamsFragment} from './mapboxOutputParams.js';
import {rescapePlaceDefaultSettingsKey} from '../../helpers/privateSettings.js';
import T from 'folktale/concurrency/task/index.js';

const {of} = T;
import {
  expectKeys,
  currentUserQueryContainer,
  userOutputParams,
  deleteItemsOfExistingResponses
} from '@rescapes/apollo';
import {
  mutateSampleUserStateWithProjectsAndRegionsContainer
} from '../../stores/userStores/userStateStore.sample.js';
import {projectMutationContainer} from '../scopeStores/project/projectStore';

/**
 * Created by Andy Likuski on 2018.12.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
describe('mapboxStore', () => {
  test('makeMapboxStore', done => {
    const someMapboxKeys = ['data.mapbox.viewport.extent'];
    const errors = [];
    expect.assertions(1);
    composeWithChain([
      // Now that we have a user, region, and project, we query
      ({apolloConfig, user, regions, projects}) => {
        return makeMapboxQueryContainer(
          apolloConfig,
          {outputParams: mapboxOutputParamsFragment},
          {
            settings: {key: rescapePlaceDefaultSettingsKey},
            user: {id: parseInt(user.id)},
            regionFilter: {idIn: R.map(region => R.prop('id', region), regions)},
            projectFilter: {idIn: R.map(project => R.prop('id', project), projects)}
          }
        );
      },

      // Set the UserState
      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          const now = moment().format('HH-mm-ss-SSS');
          return mutateSampleUserStateWithProjectsAndRegionsContainer(
            apolloConfig, {forceDelete: true}, {
              user,
              regionKeys: [`testAntarctica${now}`],
              projectKeys: [`testRefrost${now}`, `testPoleVault${now}`]
            });
        }
      ),
      // Get the current user if we didn't get a userState
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig, userState}) => R.ifElse(
          R.identity,
          userState => of({data: {currentUser: R.prop('user', userState)}}),
          () => currentUserQueryContainer(apolloConfig, userOutputParams, {})
        )(userState)
      ),
      mapToNamedResponseAndInputs('void',
        ({apolloConfig, userStateResponses}) => {
          return R.ifElse(
            R.identity,
            userStateResponses => {
              return deleteItemsOfExistingResponses(
                apolloConfig, {
                  queryResponsePath: 'data.userStates',
                  forceDelete: true,
                  mutationContainer: userStateMutationContainer,
                  responsePath: 'result.data.mutate.userState',
                  outputParams: {id: 1, deleted: 1}
                },
                {existingItemResponses: userStateResponses}
              )
            },
            () => of({})
          )(userStateResponses);
        }),

      // Get the current user state
      mapToNamedResponseAndInputs('userStateResponses',
        ({apolloConfig}) => currentUserStateQueryContainer(
          apolloConfig,
          {outputParams: userStateOutputParamsFull()},
          {}
        )
      ),
      // Authenticate
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeys(someMapboxKeys, response);
          done();
        }
    }, errors, done));
  }, 2000000);
});