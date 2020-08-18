/**
 * Created by Andy Likuski on 2018.04.28
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export {makeFeaturesByTypeSelector, makeGeojsonSelector, makeMarkersByTypeSelector} from './selectors/geojsonSelectors';
export {mapboxSelector, viewportSelector} from './selectors/mapboxSelectors';
export {
  activeUserRegionsSelector,
  activeUserSelectedRegionsSelector,
  regionIdsSelector,
  regionSelector,
  regionsSelector
} from './selectors/regionSelectors';
export {mapboxSettingsSelector, settingsSelector} from './selectors/settingsSelectors';
export {
  makeActiveUserAndSettingsSelector,
  makeActiveUserRegionsAndSettingsSelector,
  makeActiveUserSelectedRegionAndSettingsSelector
} from './selectors/storeSelectors';
export {
  browserDimensionsSelector,
  makeBrowserProportionalDimensionsSelector,
  makeMergeDefaultStyleWithProps
} from './selectors/styleSelectors';
export {
  activeUsersSelector,
  activeUserSelectedRegionSelector,
  activeUserValueSelector,
  userRegionsSelector,
  userResolvedRegionsSelector,
  userSelectedRegionSelector,
  userSelector,
  usersSelector
} from './selectors/userSelectors';
export {
  makeMapboxQueryContainer,
  makeRegionMutationTask,
  projectMapboxOutputParamsCreator,
  regionMapboxOutputParamsCreator,
  scopeObjMapboxOutputParamsCreator,
  userStateMapboxOutputParamsCreator
} from './stores/mapStores/mapboxStore';

export {
  mapboxOutputParamsFragment
} from './stores/mapStores/mapboxOutputParams';

export {
  projectOutputParams,
  projectOutputParamsMinimized,
  makeProjectMutationContainer,
  makeProjectsQueryContainer,
  projectReadInputTypeMapper,
  projectQueryVariationContainers
} from './stores/scopeStores/project/projectStore';
export {
  regionOutputParams,
  regionOutputParamsMinimized,
  regionReadInputTypeMapper,
  makeRegionMutationContainer,
  makeRegionsQueryContainer,
  regionQueryVariationContainers
} from './stores/scopeStores/region/regionStore';

export {
  makeUserStateMutationContainer,
  makeAdminUserStateQueryContainer,
  userStateMutateOutputParams,
  userStateOutputParamsCreator,
  userStateOutputParamsFull,
  userStateOutputParamsOnlyIds,
  makeCurrentUserStateQueryContainer,
  userScopeOutputParamsFragmentDefaultOnlyIds,
  deleteSampleUserStateScopeObjectsContainer
} from './stores/userStores/userStateStore';

export {
  userStateRegionsQueryContainer,
  userStateRegionMutationContainer,
  userStateRegionOutputParams
} from './stores/userStores/userScopeStores/userStateRegionStore';

export {
  userStateProjectsQueryContainer,
  userStateProjectMutationContainer,
  userStateProjectOutputParams
} from './stores/userStores/userScopeStores/userStateProjectStore';

export {
  queryUsingPaginationContainer,
  accumulatedSinglePageQueryContainer
} from './stores/helpers/pagedRequestHelpers';

export {
  typePoliciesConfig
} from './config';

export {
  createUserProjectWithDefaults,
  createUserRegionWithDefaults,
  mutateSampleUserStateWithProjectAndRegionTask,
  mutateSampleUserStateWithProjectsAndRegionsContainer
} from './stores/userStores/userStateStore.sample';

export {queryVariationContainers} from './stores/helpers/variedRequestHelpers';

export {
  queryAndDeleteIfFoundContainer
} from './stores/helpers/scopeHelpers';

export {
  createSampleProjectContainer,
  createSampleProjectsContainer,
} from './stores/scopeStores/project/projectStore.sample';

export {
  createSampleRegionContainer,
  createSampleRegionsContainer
} from './stores/scopeStores/region/regionStore.sample';

export {matchingUserStateScopeInstances, matchingUserStateScopeInstance} from './stores/userStores/userScopeStores/userStateHelpers'
