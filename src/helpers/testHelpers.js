/**
 * Created by Andy Likuski on 2018.07.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {getCurrentConfig} from 'rescape-sample-data';
import * as R from 'ramda';
import {loginToAuthClientTask} from 'rescape-apollo'
import {createStateLinkDefaults, defaultStateLinkResolvers} from 'rescape-apollo'
import {capitalize, mapToNamedPathAndInputs, reqStrPathThrowing} from 'rescape-ramda';
import {makeUserStateMutationContainer, userStateMutateOutputParams} from '../stores/userStores/userStore';
import {createSampleProjectTask} from '../stores/scopeStores/projectStore.sample';
import {createSampleRegionContainer} from '../stores/scopeStores/regionStore.sample';
import privateTestSettings from './privateTestSettings';

/**
 * The config for test
 */
export const testConfig = getCurrentConfig({settings: privateTestSettings});

// Apollo Link State defaults are based on the config.
// TODO I've limited the keys here to keep out regions and users. If all tests are based on a server
// we should remove users and regions from our testConfig
const testStateLinkDefaults = createStateLinkDefaults(R.pick(['settings', 'browser'], testConfig));

export const testStateLinkResolversAndDefaults = {
  resolvers: defaultStateLinkResolvers, defaults: testStateLinkDefaults
};

/**
 * Task to return and authorized client for tests
 * Returns an object {apolloClient:An authorized client}
 */
export const localTestAuthTask = loginToAuthClientTask(
  reqStrPathThrowing('settings.api.uri', testConfig),
  testStateLinkResolversAndDefaults,
  reqStrPathThrowing('settings.testAuthorization', testConfig)
);

/***
 * Helper to create scope objects and set the user state to them
 * @param apolloClient
 * @param user
 * @param regionKey
 * @param projectKey
 * @returns {Object} {project, region, userState}
 */
export const mutateUserStateWithProjectAndRegion = ({apolloClient, user, regionKey, projectKey}) => R.composeK(
  // Set the user state of the given user to the region and project
  mapToNamedPathAndInputs('userState', 'data.createUserState.userState',
    ({apolloClient, user, region, project}) => makeUserStateMutationContainer(
      {apolloClient},
      {outputParams: userStateMutateOutputParams},
      null,
      createInputParams({user, region, project})
    )
  ),
  // Create a sample project
  mapToNamedPathAndInputs('project', 'data.createProject.project',
    ({apolloClient}) => createSampleProjectTask({apolloClient}, {
        key: projectKey,
        name: capitalize(projectKey),
        user: {id: user.id}
      }
    )
  ),

  // Create a sample region
  mapToNamedPathAndInputs('region', 'data.createRegion.region',
    ({apolloClient}) => createSampleRegionContainer({apolloClient}, {
      key: regionKey,
      name: capitalize(regionKey)
    })
  )
)({apolloClient, user, regionKey, projectKey});

/**
 * Helper to create input params for the user state
 * @param user
 * @param region
 * @param project
 * @returns {{data: {userProjects: {project: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}}[], userRegions: {region: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}}[]}, user: {id: number}}}
 */
const createInputParams = ({user, region, project}) => ({
  user: {id: parseInt(reqStrPathThrowing('id', user))},
  data: {
    userRegions: [
      {
        region: {
          id: parseInt(reqStrPathThrowing('id', region))
        },
        mapbox: {
          viewport: {
            // Use the defaults from the region
            latitude: region.data.mapbox.viewport.latitude,
            longitude: region.data.mapbox.viewport.longitude,
            // Zoom in one from he region's zoom
            zoom: region.data.mapbox.viewport.zoom + 1
          }
        }
      }
    ],
    userProjects: [
      {
        project: {
          id: parseInt(reqStrPathThrowing('id', project))
        },
        mapbox: {
          viewport: {
            // Use the defaults from the project
            latitude: project.data.mapbox.viewport.latitude,
            longitude: project.data.mapbox.viewport.longitude,
            // Zoom in one from he project's zoom
            zoom: project.data.mapbox.viewport.zoom + 1
          }
        }
      }
    ]
  }
});
