/**
 * Created by Andy Likuski on 2019.01.07
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {reqStrPathThrowing} from '@rescapes/ramda';

export const rescapePlaceDefaultSettingsKey = 'rescape-place.settings.default';
/***
 * The private test config is used for testing.
 * In production the application seeds the ApolloClient with settings from the application.
 * The production application would read a settings key from an environment variable and
 * pull the correct settings from a database or private file.
 * Settings are used to determine the shape and initial values of the Apollo in memory cache.
 * Since we have a settings class in the API, the settings must match the shape of the API's settings.data object,
 * unless they are cache only values like testAuthorization and mapboxApiAccessToken below.
 * See settingsStore.js
 */
export default {
  key: rescapePlaceDefaultSettingsKey,
  data: {
    domain: 'localhost',
    api: {
      protocol: 'http',
      host: 'localhost',
      port: '8008',
      path: '/graphql/'
    },
    // Used to authenticate with the API above in tests
    // @client only
    testAuthorization: {
      username: 'test',
      password: 'testpass'
    },
    // Overpass API configuration to play nice with the server's strict throttling
    overpass: {
      cellSize: 100,
      sleepBetweenCalls: 1000
    },
    mapbox: {
      // @client only
      mapboxAuthentication: {
        mapboxApiAccessToken: reqStrPathThrowing('MAPBOX_API_ACCESS_TOKEN', process.env)
      },
      // Initial viewport
      viewport: {
        zoom: 0,
        latitude: 0,
        longitude: 0
      }
    }
  }
};
