/**
 * Created by Andy Likuski on 2018.04.25
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {containerForApolloType, makeQueryContainer} from 'rescape-apollo';
import {
  capitalize,
  composeWithChain,
  composeWithChainMDeep,
  composeWithMapMDeep,
  mapToNamedResponseAndInputs,
  reqPathThrowing,
  reqStrPathThrowing,
  traverseReduceWhile
} from 'rescape-ramda';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {loggers} from 'rescape-log';
import {of} from 'folktale/concurrency/task';

const log = loggers.get('rescapeDefault');


/**
 * Queries for all objects using pagination to break up query results. All results are combined
 * Note that pageSize and page can either be passed to queryConfig or in via props, but props takes precedence
 * @type {function(): any}
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} config.regionConfig
 * @param {Number} [queryConfig.pageSize] Optional pageSize, defaults to 100
 * @param {String} queryConfig.typeName the type name of the object being queried, such as 'region' or 'project'
 * @param {String} queryConfig.name the name matching the paginated query name on the server,
 * such as regionsPaginated or projectsPaginated
 * @param {String} queryConfig.paginatedObjectsName The name for the query
 * @param {Function} queryConfig.paginatedQueryContainer The query container function. This is passed most of the parameters
 * @param {Function} [queryConfig.filterObjsByConfig] Optional function expecting ({regionConfig}, objs)
 * to filter objects returned by pagination based on the regionConfig, where objs are all objects returned by pagination.
 * This is used to filter out objects that can't easily be filtered out using direct props on the pagination query,
 * such as properties embedded in json data
 * @param {Object} queryConfig.outputParams
 * @param {Object} [queryConfig.readInputTypeMapper] This should not be needed, it specifies the graphql input type.
 * By default it is assumed to by {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType`}
 * Where objects are the paginated objects returned by the query and thus
 * `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType` is the input type argument we can use for
 * filtering
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and limits what props are
 * passed to the query. Defaults to passing all of them
 * @param {Object} props
 * @returns {Task|Object} Object or Task resolving to the all the matching objects of all pages
 */
export const queryUsingPaginationContainer = v(R.curry((
  {apolloConfig, regionConfig},
  {
    pageSize,
    typeName, name, filterObjsByConfig, outputParams, readInputTypeMapper, normalizeProps
  },
  {pageSize: propsPageSize, ...props}
) => {
  // Prefer the props page size and then page size and defult to 100
  const pageSizeOrDefault = propsPageSize || pageSize || 100;
  const normalizePropsOrDefault = R.defaultTo(R.identity, normalizeProps);
  const filterObjsByConfigOrDefault = R.defaultTo((config, objs) => objs, filterObjsByConfig);
  const readInputTypeMapperOrDefault = R.defaultTo(
    {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType`},
    readInputTypeMapper
  );
  log.debug(`Checking for existence of objects with props ${JSON.stringify(normalizePropsOrDefault(props))}`);

  return composeWithChainMDeep(1, [
    // Extract the paginated objects, removing those that don't pass regionConfig's feature property filters
    objs => {
      return containerForApolloType(apolloConfig,
        R.when(R.identity, objs => {
            return filterObjsByConfigOrDefault({regionConfig}, objs);
          }
        )(objs)
      );
    },

    firstPageObjs => {
      // Get the number of pages so we can query for the remaining pages if there are any
      const pageInfo = R.omit(['objects'], reqPathThrowing(['data', name], firstPageObjs));
      // Run a query for each page (based on the result of the first query)
      // TODO Should be traverseReduceBucketedWhile but there is a weird bug that causes it to resolve to a task
      return traverseReduceWhile({predicate: () => true, mappingFunction: R.chain},
        // Query for the page and extract the objects, since we don't need intermediate page info
        (previousResults, page) => {
          return _singlePageQueryContainer(
            {apolloConfig, regionConfig},
            {
              name,
              outputParams,
              readInputTypeMapper: readInputTypeMapperOrDefault,
              normalizeProps,
              pageSize: pageSizeOrDefault,
              page
            },
            {previousResults, firstPageLocations: firstPageObjs},
            props
          );
        },
        of([]),
        // Iterate the pages, 1-based index
        R.times(R.compose(of, R.add(1)), reqStrPathThrowing('pages', pageInfo))
      );
    },

    // Initial query determines tells us the number of pages
    page => {
      return _paginatedQueryContainer(
        {apolloConfig, regionConfig},
        {
          name,
          outputParams,
          pageSize: pageSizeOrDefault,
          page,
          readInputTypeMapper: readInputTypeMapperOrDefault,
          normalizeProps: normalizePropsOrDefault
        },
        props
      );
    }
  ])(1);
}), [
  ['config', PropTypes.shape(
    {
      apolloConfig: PropTypes.shape({
        apolloClient: PropTypes.shape().isRequired
      }).isRequired
    },
    {
      regionConfig: PropTypes.shape().isRequired
    }
  ).isRequired
  ],
  ['queryConfig', PropTypes.shape({
    name: PropTypes.string.isRequired,
    typeName: PropTypes.string.isRequired,
    outputParams: PropTypes.array.isRequired,
    readInputTypeMapper: PropTypes.shape()
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'queryUsingPaginationContainer');

/**
 * Queries for one page at a time. Note that pageSize and page can either be passed to queryConfig or in via props.
 * props takes precedence
 * @type {function(): any}
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} config.regionConfig
 * @param {Number} [queryConfig.pageSize] Optional pageSize, defaults to 100
 * @param {String} queryConfig.typeName the type name of the object being queried, such as 'region' or 'project'
 * @param {String} queryConfig.name the name matching the paginated query name on the server,
 * such as regionsPaginated or projectsPaginated
 * @param {String} queryConfig.paginatedObjectsName The name for the query
 * @param {Function} queryConfig.paginatedQueryContainer The query container function. This is passed most of the parameters
 * @param {Function} [queryConfig.filterObjsByConfig] Optional function expecting ({regionConfig}, objs)
 * to filter objects returned by pagination based on the regionConfig, where objs are all objects returned by pagination.
 * This is used to filter out objects that can't easily be filtered out using direct props on the pagination query,
 * such as properties embedded in json data
 * @param {Object} queryConfig.outputParams
 * @param {Object} [queryConfig.readInputTypeMapper] This should not be needed, it specifies the graphql input type.
 * By default it is assumed to by {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType`}
 * Where objects are the paginated objects returned by the query and thus
 * `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType` is the input type argument we can use for
 * filtering
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and limits what props are
 * passed to the query. Defaults to passing all of them
 * @param {Object} props
 * @returns {Task|Object} Object or Task resolving to the all the matching objects for the given page. Note
 * that if filterObjsByConfig removes objects then not all objects of the page will be returned, so don't rely
 * on the number of objects returned if using filterObjsByConfig
 */
export const queryPageContainer = v(R.curry((
  {apolloConfig, regionConfig},
  {
    page, pageSize,
    typeName, name, filterObjsByConfig, outputParams, readInputTypeMapper, normalizeProps
  },
  {pageSize: propsPageSize, page: propsPage, ...props}
  ) => {
    // Default to propsPageSize then pageSize then 100
    const pageSizeOrDefault = propsPageSize || pageSize || 100;
    const pageOrDefault = propsPage || page;
    if (!pageOrDefault) {
      throw new Error(`Neither props.page queryConfig.page was specified. Props: ${JSON.stringify(props)}`);
    }
    const normalizePropsOrDefault = R.defaultTo(R.identity, normalizeProps);
    const filterObjsByConfigOrDefault = R.defaultTo((config, objs) => objs, filterObjsByConfig);
    const readInputTypeMapperOrDefault = R.defaultTo(
      {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType`},
      readInputTypeMapper
    );
    log.debug(`Checking for existence of objects with props ${JSON.stringify(normalizePropsOrDefault(props))}`);

    return composeWithChain([
      // Extract the paginated objects, removing those that don't pass regionConfig's feature property filters
      ({objs}) => {
        return containerForApolloType(apolloConfig,
          R.when(
            R.identity,
            objs => {
              return filterObjsByConfigOrDefault(
                {regionConfig},
                reqPathThrowing(['data', name], objs)
              );
            }
          )(objs)
        );
      },
      mapToNamedResponseAndInputs('objs',
        ({}) => {
          // Run a query for each page (based on the result of the first query)
          // TODO Should be traverseReduceBucketedWhile but there is a weird bug that causes it to resolve to a task
          return _paginatedQueryContainer(
            {apolloConfig, regionConfig},
            {
              name,
              outputParams,
              readInputTypeMapper: readInputTypeMapperOrDefault,
              normalizeProps: normalizePropsOrDefault,
              pageSize: pageSizeOrDefault,
              page: pageOrDefault
            },
            props
          );
        }
      )
    ])({});
  }),
  [
    ['config', PropTypes.shape(
      {
        apolloConfig: PropTypes.shape({
          apolloClient: PropTypes.shape().isRequired
        }).isRequired
      },
      {
        regionConfig: PropTypes.shape().isRequired
      }
    ).isRequired
    ],
    ['queryConfig', PropTypes.shape({
      name: PropTypes.string.isRequired,
      typeName: PropTypes.string.isRequired,
      outputParams: PropTypes.array.isRequired,
      readInputTypeMapper: PropTypes.shape()
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ],
  'queryPageContainer'
);

/*
export const initQueryPageContainer = v((
  {apolloConfig, regionConfig},
  {
    pageSize,
    typeName, name, filterObjsByConfig, outputParams, readInputTypeMapper, normalizeProps
  },
  props
) => {
  const pageSizeOrDefault = R.defaultTo(100, pageSize);
  const readInputTypeMapperOrDefault = R.defaultTo(
    {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinRelatedReadInputType`},
    readInputTypeMapper
  );
  return composeWithMapMDeep(1, [
    ({firstPageObjs}) => {
      // Get the number of pages so we can query for the remaining pages if there are any
      return R.omit(['objects'], reqPathThrowing(['data', name], firstPageObjs));
    },

    // Initial query determines tells us the number of pages
    mapToNamedResponseAndInputs('firstPageObjs',
      ({page}) => {
        return _paginatedQueryContainer(
          {apolloConfig, regionConfig},
          {
            name,
            outputParams,
            pageSize: pageSizeOrDefault,
            page,
            readInputTypeMapper: readInputTypeMapperOrDefault,
            normalizeProps
          },
          props
        );
      }
    )
  ])({page: 1});
}, [
  ['config', PropTypes.shape(
    {
      apolloConfig: PropTypes.shape({
        apolloClient: PropTypes.shape().isRequired
      }).isRequired
    },
    {
      regionConfig: PropTypes.shape().isRequired
    }
  ).isRequired
  ],
  ['queryConfig', PropTypes.shape({
    name: PropTypes.string.isRequired,
    typeName: PropTypes.string.isRequired,
    outputParams: PropTypes.array.isRequired,
    readInputTypeMapper: PropTypes.shape()
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'initQueryPageContainer');
 */

/**
 * Query objects paginated and return objects and the queryParams
 * @param {Object} config.apolloConfig The Apollo config
 * @param {Object} config.regionConfig Passed to t
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and returns limited props
 * to pass to the query
 * @param {Object} queryConfig.outputParams The output params of the query. This is in the form
 * {
 *   pageSize,
 *   page,
 *   pages,
 *   hasNext,
 *   hasPrev,
 *   objects
 * }
 * @param {Object} queryConfig.propsStructure A structure of the props when using Apollo component
 * @param {Object} queryConfig.outputParams The output params of the query. This is in the form
 * @param {Object} props The props for the query. This must be in the form
 * {pageSize: the page size, page: the current page to request, objects: normal location props}
 * @return {Task|Maybe} A task or Maybe containing the locations and the queryParams
 */
export const queryObjectsPaginatedContainer = v(R.curry(
  (
    apolloConfig,
    {name, outputParams, readInputTypeMapper, normalizeProps},
    props
  ) => {
    return makeQueryContainer(
      apolloConfig,
      {name, readInputTypeMapper, outputParams},
      R.over(
        R.lensProp('objects'),
        objs => {
          // Apply the normalizeProps function if specified
          return (normalizeProps || R.identity)(objs);
        },
        props
      )
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryConfig', PropTypes.shape({
      outputParams: PropTypes.array.isRequired
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ], 'queryObjectsPaginatedContainer');

/**
 * Paginated query for locations
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} config.regionConfig
 * @param {Object} queryConfig
 * @param {Object} queryConfig.outputParams Location outputParams (not the page)
 * @param {Object} queryConfig.pageSize
 * @param {Object} queryConfig.page
 * @param {Object} queryConfig.readInputTypeMapper Maps complex input types
 * @param {Function} [queryConfig.normalizeProps] Optionally takes props and limits what is passed to the query.
 * Default to passing everything
 * @param {Object} props
 * @return {Task | Maybe} resolving to the page of location results
 * @private
 */
export const _paginatedQueryContainer = (
  {apolloConfig, regionConfig},
  {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
  props
) => {
  return queryObjectsPaginatedContainer(
    apolloConfig,
    {
      name,
      outputParams: ['pageSize', 'page', 'pages', 'hasNext', 'hasPrev', {objects: outputParams}],
      readInputTypeMapper,
      normalizeProps
    },
    {pageSize, page, objects: props}
  );
};

/**
 * Queries for a single page of a paginated query
 * @param apolloConfig
 * @param regionConfig
 * @param name
 * @param paginatedQueryContainer
 * @param outputParams
 * @param propsStructure
 * @param pageSize
 * @param page
 * @param props
 * @param firstPageObjects
 * @param previousResults
 * @return {*}
 * @private
 */
export const _singlePageQueryContainer = (
  {apolloConfig, regionConfig},
  {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
  {firstPageLocations: firstPageObjects, previousResults},
  props
) => {
  return composeWithMapMDeep(1, [
    pageLocations => {
      // Combine the objects responses, ignoring the pagination data
      return R.concat(
        previousResults,
        reqPathThrowing(['data', name, 'objects'], pageLocations)
      );
    },
    page => {
      return R.ifElse(
        R.equals(1),
        // Use the first result for page 1
        () => {
          return of(firstPageObjects);
        },
        // Query for remaining pages
        page => {
          return _paginatedQueryContainer(
            {apolloConfig, regionConfig},
            {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
            props
          );
        }
      )(page);
    }
  ])(page);
};
