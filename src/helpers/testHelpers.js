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
import {
  createTestAuthTask, createTestNoAuthTask,
  defaultSettingsCacheIdProps,
  defaultSettingsCacheOnlyObjs,
  defaultSettingsOutputParams, defaultSettingsTypenames,
  defaultStateLinkResolvers,
  writeConfigToServerAndCache
} from '@rescapes/apollo';
import settings from './privateSettings.js';
import {cacheOptions} from '../config.js';

/**
 * The config for test. We add some cache only properties to
 */
export const testConfig = {
  settings,
  settingsConfig: {
    settingsOutputParams: defaultSettingsOutputParams,
    cacheOnlyObjs: defaultSettingsCacheOnlyObjs,
    cacheIdProps: defaultSettingsCacheIdProps,
    // This is used to help an unauthenticated user write default settings to the cache
    // If we make it possible to query the settings without authenticating (it should be),
    // we can get rid of this
    defaultSettingsTypenames,
  },
  apollo: {
    writeDefaultsCreator: writeConfigToServerAndCache,
    stateLinkResolvers: defaultStateLinkResolvers,
    // typePolicies config combines type policies
    cacheOptions
  }
};


/**
 * Task to return and authorized client for tests
 * Returns an object {apolloClient:An authorized client}
 */
export const testAuthTask = createTestAuthTask(testConfig);
export const testNoAuthTask = createTestNoAuthTask(testConfig);
