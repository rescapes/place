/**
 * Created by Andy Likuski on 2020.03.18
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


import {
  capitalize,
  composeWithChain,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs,
  mapWithArgToPath,
  reqStrPathThrowing
} from 'rescape-ramda';
import {makeUserStateMutationContainer, userStateMutateOutputParams} from './userStateStore';
import {createSampleProjectTask} from '../scopeStores/project/projectStore.sample';
import {createSampleRegionContainer} from '../scopeStores/region/regionStore.sample';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';

/***
 * Helper to create scope objects and set the user state to them
 * @param apolloClient
 * @param user
 * @param regionKey
 * @param projectKey
 * @returns {Task} {project, region, userState}
 */
export const mutateSampleUserStateWithProjectAndRegionTask = ({apolloConfig, user, regionKey, projectKey}) => {
  return composeWithChain([
    // Set the user state of the given user to the region and project
    mapToNamedPathAndInputs('userState', 'data.mutate.userState',
      ({apolloConfig, user, region, project}) => {
        return makeUserStateMutationContainer(
          apolloConfig,
          {outputParams: userStateMutateOutputParams},
          createSampleUserStateProps({user, regions: [region], projects: [project]})
        );
      }
    ),
    // Create a sample project
    mapToNamedPathAndInputs('project', 'data.mutate.project',
      ({apolloConfig, user}) => createSampleProjectTask(apolloConfig, {
          key: projectKey,
          name: capitalize(projectKey),
          user: R.pick(['id'], user)
        }
      )
    ),

    // Create a sample region
    mapToNamedPathAndInputs('region', 'data.mutate.region',
      ({apolloConfig}) => createSampleRegionContainer(apolloConfig, {
        key: regionKey,
        name: capitalize(regionKey)
      })
    )
  ])({apolloConfig, user, regionKey, projectKey});
};

/***
 * Helper to create scope objects and set the user state to them
 * @param apolloClient
 * @param user
 * @param regionKeys
 * @param projectKeys
 * @returns {Object} {projects, regions, userState}
 */
export const mutateSampleUserStateWithProjectsAndRegions = ({apolloConfig, user, regionKeys, projectKeys}) => {
  return composeWithChain([
    // Set the user state of the given user to the region and project
    mapToNamedPathAndInputs('userState', 'data.mutate.userState',
      ({apolloConfig, user, regions, projects}) => {
        return makeUserStateMutationContainer(
          apolloConfig,
          {outputParams: userStateMutateOutputParams},
          createSampleUserStateProps({user, regions, projects})
        );
      }
    ),
    // Create sample projects
    mapToNamedResponseAndInputs('projects',
      ({apolloConfig, user, projectKeys}) => {
        return R.traverse(
          of,
          projectKey => mapWithArgToPath('data.mutate.project',
            ({apolloConfig, user, projectKey}) => createSampleProjectTask(apolloConfig, {
                key: projectKey,
                name: capitalize(projectKey),
                user: R.pick(['id'], user)
              }
            )
          )({apolloConfig, user, projectKey}),
          projectKeys
        );
      }
    ),

    // Create sample regions
    mapToNamedResponseAndInputs('regions',
      ({apolloConfig, regionKeys}) => {
        return R.traverse(
          of,
          regionKey => mapWithArgToPath('data.mutate.region',
            ({apolloConfig, regionKey}) => createSampleRegionContainer(apolloConfig, {
                key: regionKey,
                name: capitalize(regionKey)
              }
            )
          )({apolloConfig, regionKey}),
          regionKeys
        );
      }
    )
  ])({apolloConfig, user, regionKeys, projectKeys});
};
/**
 * Populates the UserRegion properties with defaults based on the region's properties
 * @param {Object} region
 * @param {Number} region.id The region id
 * @return {{mapbox: {viewport: {latitude: number, zoom: number, longitude: (number|null)}}, region: {id: number}}}
 */
export const createUserRegionWithDefaults = region => {
  return {
    region: {
      id: parseInt(reqStrPathThrowing('id', region))
    },
    mapbox: {
      viewport: {
        // Use the defaults from the region
        latitude: reqStrPathThrowing('data.mapbox.viewport.latitude', region),
        longitude: reqStrPathThrowing('data.mapbox.viewport.longitude', region),
        // Zoom in one from he region's zoom
        zoom: reqStrPathThrowing('data.mapbox.viewport.zoom', region) + 1
      }
    }
  };
};

/**
 * Populates the UserProject properties with defaults based on the region's properties
 * @param {Object} project
 * @param {Number} project.id The project id
 * @return {{mapbox: {viewport: {latitude: number, zoom: number, longitude: (number|null)}}, project: {id: number}}}
 */
export const createUserProjectWithDefaults = project => {
  return {
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
    },
    selection: {
      isSelected: false
    },
    activity: {
      isActive: false
    }
  };
};

/**
 * Helper to create sample props for a UserState
 * @param {Object} user
 * @param {[Object]} regions
 * @param {[Object]} projects
 * @returns {Object} {
 * data: {
 * userProjects: [{project: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}}],
 * userRegions: [{region: {mapbox: {viewport: {latitude: (*|number), zoom: *, longitude: (*|number)}}, id: number}}]
 * },
 * user: {id: number}
 * }
 */
const createSampleUserStateProps = ({user, regions, projects}) => {
  return {
    user: {id: parseInt(reqStrPathThrowing('id', user))},
    data: {
      userRegions: R.map(region => createUserRegionWithDefaults(region), regions),
      userProjects: R.map(project => createUserProjectWithDefaults(project), projects)
    }
  };
};
