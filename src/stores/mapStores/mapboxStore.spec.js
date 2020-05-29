import {testAuthTask} from '../../helpers/testHelpers';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStores/userStateStore';
import {makeMapboxesQueryResultTask} from '../mapStores/mapboxStore';
import * as R from 'ramda';
import {defaultRunConfig, mapToNamedPathAndInputs, mapToNamedResponseAndInputs} from 'rescape-ramda';
import {mapboxOutputParamsFragment} from './mapboxOutputParams';
import {mutateSampleUserStateWithProjectAndRegionTask} from '../userStores/userStateStore.sample';
import {rescapePlaceDefaultSettingsKey} from '../../helpers/privateSettings';
import {expectKeys} from 'rescape-apollo';

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
    const someMapboxKeys = ['viewport'];
    const errors = [];
    expect.assertions(1);
    R.composeK(
      // Now that we have a user, region, and project, we query
      ({apolloConfig, user, region, project}) => makeMapboxesQueryResultTask(
        apolloConfig,
        mapboxOutputParamsFragment,
        {
          settings: {key: rescapePlaceDefaultSettingsKey},
          user: {id: parseInt(user.id)},
          region: {id: parseInt(region.id)},
          project: {id: parseInt(project.id)}
        }
      ),

      // Set the UserState
      ({apolloConfig, user}) => mutateSampleUserStateWithProjectAndRegionTask({
        apolloConfig,
        user,
        regionKey: 'antarctica',
        projectKey: 'refrost'
      }),
      // Get the current user
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => makeCurrentUserQueryContainer(apolloConfig, userOutputParams, {})
      ),
      // Authenticate
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask
      )
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeys(someMapboxKeys, response);
          done();
        }
    }, errors, done));
  }, 2000000);
});