import {localTestAuthTask, mutateUserStateWithProjectAndRegion} from '../../helpers/testHelpers';
import {makeCurrentUserQueryContainer, userOutputParams} from '../userStores/userStore';
import {makeMapboxesQueryResultTask} from '../mapStores/mapboxStore';
import * as R from 'ramda';
import {defaultRunConfig, mapToNamedPathAndInputs} from 'rescape-ramda';
import {mapboxOutputParamsFragment} from './mapboxOutputParams';
import {expectKeysAtPath} from 'rescape-helpers-test'

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
      ({apolloClient, user, region, project, userState}) => makeMapboxesQueryResultTask(
        {apolloClient},
        [mapboxOutputParamsFragment],
        {
          user: {id: parseInt(user.id)},
          region: {id: parseInt(region.id)},
          project: {id: parseInt(project.id)}
        }
      ),

      // Set the UserState
      ({apolloClient, user}) => mutateUserStateWithProjectAndRegion({
        apolloClient,
        user,
        regionKey: 'antarctica',
        projectKey: 'refrost'
      }),
      // Get the current user
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloClient}) => makeCurrentUserQueryContainer({apolloClient}, userOutputParams, {})
      ),
      // Authenticate
      mapToNamedPathAndInputs('apolloClient', 'apolloClient',
        () => localTestAuthTask
      )
    )().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeysAtPath(someMapboxKeys, 'data.mapboxes.0.region', response);
          done();
        }
    }, errors, done));
  }, 20000);
});