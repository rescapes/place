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

import * as R from 'ramda';
import {v} from '@rescapes/validate';
import {
  composeFuncAtPathIntoApolloConfig,
  createReadInputTypeMapper, filterOutNullDeleteProps,
  filterOutReadOnlyVersionProps,
  makeMutationRequestContainer,
  makeQueryContainer, relatedObjectsToIdForm,
  versionOutputParamsMixin
} from '@rescapes/apollo';
import PropTypes from 'prop-types';
import {mapboxOutputParamsFragment} from '../../mapStores/mapboxOutputParams.js';
import {queryVariationContainers} from '../../helpers/variedRequestHelpers.js';
import {strPathOr} from '@rescapes/ramda';

// TODO should be derived from the remote schema
const RELATED_PROPS = [
  'user', 'locations', 'region'
];

// Every complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
export const projectReadInputTypeMapper = createReadInputTypeMapper(
  'project', R.concat(['geojson'], RELATED_PROPS)
);

export const projectOutputParamsMinimized = {
  id: 1,
  key: 1,
  name: 1,
  createdAt: 1,
  updatedAt: 1
};

export const projectOutputParamsMinimizedWithLocations = {
  id: 1,
  key: 1,
  name: 1,
  locations: {
    id: 1
  },
  createdAt: 1,
  updatedAt: 1
};

export const projectOutputParams = {
  id: 1,
  deleted: 1,
  key: 1,
  name: 1,
  locations: {
    id: 1
  },
  geojson: {
    type: 1,
    features: {
      type: 1,
      id: 1,
      geometry: {
        type: 1,
        coordinates: 1
      },
      properties: 1
    },
    generator: 1,
    copyright: 1
  },
  data: R.merge({
      locations: {
        // unstructured json represent location search params
        params: 1
      }
    },
    mapboxOutputParamsFragment
  ),
  ...versionOutputParamsMixin
};

export const projectVariationQueries = ['queryProjects', 'queryProjectsMinimized', 'queryProjectsPaginated', 'queryProjectsPaginatedAll'];

/**
 * Normalized project props for for querying
 * @param {Object} project
 * @return {Object} the props modified
 */
export const normalizeProjectPropsForQuerying = project => {
  return filterOutNullDeleteProps(project);
};

/**
 * Queries projects
 * @params {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param {Object} apolloClient An authorized Apollo Client
 * @params {Object} queryConfig
 * @params {Object} queryConfig.outputParams OutputParams for the query such as projectOutputParams
 * @params {Object} props Arguments for the Projects query. This can be {} or null to not filter.
 * @returns {Task} A Task containing the Projects in an object with obj.data.projects or errors in obj.errors
 */
export const projectsQueryContainer = v(R.curry((apolloConfig, {outputParams}, props) => {
    return makeQueryContainer(
      composeFuncAtPathIntoApolloConfig(
        apolloConfig,
        'options.variables',
        normalizeProjectPropsForQuerying
      ),
      {name: 'projects', readInputTypeMapper: projectReadInputTypeMapper, outputParams},
      props
    );
  }),
  [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['queryConfig', PropTypes.shape({
      outputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape().isRequired]
  ],
  'projectsQueryContainer');

/**
 * Normalized project props for for mutation
 * @param {Object} projectOrObj Either a project or an object with project
 * @return {Object} the props modified
 */
export const normalizeProjectPropsForMutating = projectOrObj => {
  return R.compose(
    // Make sure related objects only have an id
    project => relatedObjectsToIdForm(RELATED_PROPS, project),
    project => filterOutNullDeleteProps(project),
    project => filterOutReadOnlyVersionProps(project)
  )(R.when(R.has('project'), R.prop('project'))(projectOrObj));
};

/**
 * Makes a project mutation
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} requestConfig
 * @param {Object} [requestConfig.outputParams]. Default projectOutputParamsMinimized. output parameters for the query
 * @param {String} [projectPropsPath] If the project to be mutated is not at the base of props, this
 * path separates it, such as 'project'
 * @param {Object} props Object matching the shape of a project or matching the shape of the project at projectPropsPath.
 * E.g. {id: 1, city: "Stavanger", data: {foo: 2}}
 * Optionally specify the region props at props.project or similar in order to pass other props through the container
 *  @param {Object} [props.project] Optional to use as the props to save if passing other props through the container.
 *  If you use this option you must specify in apolloConfig
 *  {
 *     variables: (props) => {
 *      return R.propOr({}, 'project', props);
 *    }
 *  }
 *  @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 *  we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const projectMutationContainer = v(R.curry((
  apolloConfig,
  {outputParams = projectOutputParamsMinimized, projectPropsPath = null},
  props
) => {
  return makeMutationRequestContainer(
    // if apolloConfig.options.variables is defined, call it and then call normalizeProjectPropsForMutating
    composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables', normalizeProjectPropsForMutating),
    {
      name: 'project',
      outputParams
    },
    props
  );
}), [
  ['apolloConfig', PropTypes.shape().isRequired],
  ['mutationStructure', PropTypes.shape({
    outputParams: PropTypes.shape()
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'projectMutationContainer');

/**
 * Returns an object with different versions of the project query container: 'minimized', 'paginated', 'paginatedAll'
 * with only one potentially skip: false based on the prop value of projectQueryKey.
 * The prop user or userState.user must also exist to avoid skipping all.
 * @param {Object} apolloConfig
 * @param {Object} options
 * @param {String} [allowRequestPropPath] Default 'projectQueryKey'
 * @param {String} [outputParams] Default projectOutputParams
 * @returns {Object} keyed by the variation: 'projects', 'projectsMinimized', 'projectsPaginated', 'projectsPaginatedAll',
 * valued by the query container
 */
export const projectQueryVariationContainers = (apolloConfig, {
  allowRequestPropPath = 'projectQueryKey',
  outputParams = projectOutputParams
}) => {
  return queryVariationContainers(
    apolloConfig,
    {
      name: 'project',
      // Only allow the query matching the value of props.projectQueryKey so we never run multiple
      // query variations. This allows us to dynamically change which query we use, so that if
      // we expect a large list we can page, or if we need to minimize or maximize outputParams
      allowRequestPropPath,
      requestTypes: [
        {},
        {type: 'minimized', args: {outputParams: projectOutputParamsMinimized}},
        // Note that we don't pass page and page size here because we want to be able to query for different pages
        // We either pass page and page size here or in props instead
        {type: 'paginated', args: {}},
        // Note that we don't pass page size here because we want to be able to query for different pages
        // We either pass page and page size here or in props instead
        {type: 'paginatedAll', args: {}}
      ],
      queryConfig: {
        outputParams,
        readInputTypeMapper: projectReadInputTypeMapper
      },
      queryContainer: projectsQueryContainer
    }
  );
};

