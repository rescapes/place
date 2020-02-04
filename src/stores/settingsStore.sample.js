import {
  makeSettingsClientMutationContainer, makeSettingsMutationContainer,
  settingsOutputParams
} from './settingsStore';
import {mapToNamedResponseAndInputs, mapToNamedPathAndInputs, mergeDeep, omitDeepPaths, pickDeepPaths} from 'rescape-ramda';
import * as R from 'ramda';
import settings from '../helpers/privateTestSettings';
import moment from 'moment';

/**
 * Created by Andy Likuski on 2019.01.22
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Creates a sample settings
 * @params apolloClient
 * @return {Object} Returns the cacheOnlySettings, which are the settings stored in the cache that combine
 * what was written to the server with what is only stored in the cache. settings contains what was only
 * stored on the server
 */
export const createSampleSettingsTask = ({apolloClient}) => {
  return R.composeK(
    mapToNamedResponseAndInputs('cacheOnlySettings',
      ({props, settings, apolloClient}) => makeSettingsClientMutationContainer(
        {apolloClient},
        // These outputParams are used as output to the query of the cache before we update the cache with the cache only props
        {outputParams: settingsOutputParams(true)},
        // Component is always null for sample data tasks
        null,
        // Combine props with the results of the mutation so we have the id and Apollo __typename properties
        // We need these to write to the correct place in the cache
        mergeDeep(props, settings)
      )
    ),
    mapToNamedPathAndInputs('settings', 'data.createSettings.settings',
      ({props, apolloClient}) => makeSettingsMutationContainer(
        {apolloClient},
        {outputParams: settingsOutputParams()},
        // Component is always null for sample data tasks
        null,
        props
      )
    )
  )(
    // Settings is merged into the overall application state
    {
      apolloClient,
      props: {
        key: `test${moment().format('HH-mm-SS')}`,
        data: settings
      }
    }
  );
};
