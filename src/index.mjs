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


import {userStateRegionSetPropertyThenMutationContainer} from "./stores/userStores/userScopeStores/userStateRegionStore.js";

export {
  queryScopesMergeScopePropPathValueContainer
} from './stores/scopePropertyStore.js'

export {
  mapboxOutputParamsFragment
} from './stores/mapStores/mapboxOutputParams.js';

export {
  projectOutputParams,
  projectOutputParamsMinimized,
  projectOutputParamsMinimizedWithLocations,
  projectMutationContainer,
  projectsQueryContainer,
  projectReadInputTypeMapper,
  projectQueryVariationContainers,
  projectVariationQueries
} from './stores/scopeStores/project/projectStore.js';
export {
  regionOutputParams,
  regionOutputParamsMinimized,
  regionReadInputTypeMapper,
  regionMutationContainer,
  regionsQueryContainer,
  regionQueryVariationContainers,
  regionTypePolicy,
  regionVariationQueries
} from './stores/scopeStores/region/regionStore.js';

export {
  userStateMutationContainer,
  adminUserStateQueryContainer,
  userStateMutateOutputParams,
  userStateLocalOutputParamsFull,
  userStateOutputParamsOnlyIds,
  currentUserStateQueryContainer,
  userStateOutputParamsMetaAndScopeIds,
  userStateLocalOutputParamsMetaAndScopeIds,
  userStateOutputParamsCreator,
  userScopeOutputParamsFromScopeOutputParamsFragmentDefaultOnlyIds,
  userStateReadInputTypeMapper,
  USER_STATE_RELATED_DATA_PROPS,
  userScopeOutputParamsOnlyIds,
  normalizeUserStatePropsForMutating,
  USER_SEARCH_LOCATION_ALLOWED_PROPS
} from './stores/userStores/userStateStore.js';
export {
  userStateRegionsQueryContainer,
  userStateRegionMutationContainer,
  userStateRegionSetPropertyThenMutationContainer,
  userStateRegionsActiveQueryContainer,
  queryAndMergeInUserRegionRelatedInstancesContainer
} from './stores/userStores/userScopeStores/userStateRegionStore.js';

export {
  userStateRegionOutputParams
} from './stores/userStores/userScopeStores/userStateRegionStoreHelpers.js'

export {
  userStateProjectsQueryContainer,
  userStateProjectMutationContainer,
  userStateProjectSetPropertyThenMutationContainer,
  userStateProjectsActiveQueryContainer,
  queryAndMergeInUserProjectRelatedInstancesContainer
} from './stores/userStores/userScopeStores/userStateProjectStore.js';
export {
  userStateProjectOutputParams
} from './stores/userStores/userScopeStores/userStateProjectStoreHelpers.js'

export {
  queryUsingPaginationContainer,
  accumulatedSinglePageQueryContainer
} from './stores/helpers/pagedRequestHelpers.js';

export {
  typePolicies
} from './config.js';

export {
  createUserProjectWithDefaults,
  createUserRegionWithDefaults,
  mutateSampleUserStateWithProjectsAndRegionsContainer,
} from './stores/userStores/userStateStore.sample.js';

export {queryVariationContainers, variationContainerAuthDependency} from './stores/helpers/variedRequestHelpers.js';

export {
  queryAndDeleteIfFoundContainer
} from './stores/helpers/scopeHelpers.js';

export {
  createSampleProjectContainer,
  createSampleProjectsContainer
} from './stores/scopeStores/project/projectStore.sample.js';

export {
  createSampleRegionContainer,
  createSampleRegionsContainer
} from './stores/scopeStores/region/regionStore.sample.js';

export {
  matchingUserStateScopeInstances,
  matchingUserStateScopeInstance,
  findUserScopeInstance,
  userScopeOrNullAndProps,
  userScopeFromProps
} from './stores/userStores/userScopeStores/userScopeHelpers.js';

export {activityOutputParamsMixin, isActive} from './stores/userStores/activityStore.js';
export {selectionOutputParamsFragment, isSelected} from './stores/userStores/selectionStore.js';

export {
  testAuthTask, testNoAuthTask, testConfig
} from './helpers/testHelpers.js';

export {
  createPropertiesFilter
} from './helpers/filterHelpers.js'

export {
  createSampleSearchLocationContainer
} from './stores/search/searchLocation/searchLocationStore.sample.js'

export {deleteSearchLocationsContainer, querySearchLocationsContainer, makeSearchLocationMutationContainer, RELATED_PROPS, searchLocationReadInputTypeMapper} from './stores/search/searchLocation/searchLocationStore.js'
export {defaultSearchLocationOutputParams, defaultSearchLocationOutputParamsMinimized} from './stores/search/searchLocation/defaultSearchLocationOutputParams.js'
export {setPathOnResolvedUserScopeInstance} from "./stores/userStores/userScopeStores/userScopeHelpers.js";
export {getPathOnResolvedUserScopeInstances} from "./stores/userStores/userScopeStores/userScopeHelpers.js";