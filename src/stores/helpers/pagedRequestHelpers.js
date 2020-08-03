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

import {inspect} from 'util';
import * as R from 'ramda';
import {
  composeWithComponentMaybeOrTaskChain,
  containerForApolloType,
  getRenderPropFunction,
  makeQueryContainer
} from 'rescape-apollo';
import {
  capitalize,
  composeWithChain,
  composeWithChainMDeep,
  composeWithMapMDeep,
  mapToNamedResponseAndInputs,
  reqPathThrowing,
  reqStrPathThrowing, toArrayIfNot,
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
 * @param {Object} [queryConfig.regionReadInputTypeMapper] This should not be needed, it specifies the graphql input type.
 * By default it is assumed to by {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinFor(capitalize(typeName))TypeRelatedReadInputType`}
 * Where objects are the paginated objects returned by the query and thus
 * `${capitalize(typeName)}TypeofPaginated{capitalize(typeName)}TypeMixinRelatedReadInputType` is the input type argument we can use for
 * filtering
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and limits what props are
 * passed to the query. Defaults to passing all of them
 * @param {Object|{[Object]}} props The props for querying the object. This can also be an array of filter objects
 * that are or'd, since the objects parameter is a toMany the api expects an array of arguments
 * @returns {Task|Object} Object or Task resolving to the all the matching objects of all pages
 */
export const queryUsingPaginationContainer = v(R.curry((
  {apolloConfig, regionConfig},
  {
    pageSize,
    typeName,
    name,
    outputParams,
    readInputTypeMapper,
    normalizeProps = R.identity,
    postProcessObjsByConfig = (config, objs) => objs
  },
  {pageSize: propsPageSize, ...props}
) => {
  // Prefer the props page size and then page size and defult to 100
  const pageSizeOrDefault = propsPageSize || pageSize || 100;
  const className = capitalize(typeName);
  const readInputTypeMapperOrDefault = R.defaultTo(
    {objects: `[${className}TypeofPaginatedTypeMixinFor${className}TypeRelatedReadInputType]`},
    readInputTypeMapper
  );
  // Make object props and array if not.
  const propsAsArray = toArrayIfNot(props);

  return composeWithComponentMaybeOrTaskChain([
    // Take the first page response and use it to make the remaining queries
    // Each call to accumulatedSinglePageQueryContainer receives the accumulated results from previous
    // pages and concats the new response to them
    firstPage => {
      // Get the number of pages so we can query for the remaining pages if there are any
      const pageCount = reqPathThrowing(['data', name, 'pages'], firstPage);
      // Run a query for each page (based on the result of the first query)
      return composeWithComponentMaybeOrTaskChain(
        R.reverse(R.times(page => {
            // Query for the page and extract the objects, since we don't need intermediate page info
            return previousPages => {
              return accumulatedSinglePageQueryContainer(
                {apolloConfig, regionConfig},
                {
                  name,
                  outputParams,
                  readInputTypeMapper: readInputTypeMapperOrDefault,
                  normalizeProps,
                  pageSize: pageSizeOrDefault,
                  // Skip the first page + 1-based index
                  page: page + 2
                },
                // Pass the compbined previous results
                {previousPages},
                propsAsArray
              );
            };
          },
          // Skip the first page, we already have it
          pageCount - 1
        ))
      )(firstPage);
    },

    // Initial query determines tells us the number of pages
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
        propsAsArray
      );
    }
  ])({page: 1});
}), [
  ['config', PropTypes.shape(
    {
      apolloConfig: PropTypes.shape().isRequired
    },
    {
      regionConfig: PropTypes.shape().isRequired
    }
  ).isRequired
  ],
  ['queryConfig', PropTypes.shape({
    name: PropTypes.string.isRequired,
    typeName: PropTypes.string.isRequired,
    outputParams: PropTypes.shape().isRequired,
    readInputTypeMapper: PropTypes.shape()
  })
  ],
  ['props', PropTypes.oneOfType([PropTypes.shape(), PropTypes.arrayOf(PropTypes.shape())]).isRequired]
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
 * @param {Object} [queryConfig.regionReadInputTypeMapper] This should not be needed, it specifies the graphql input type.
 * By default it is assumed to by {objects: `${capitalize(typeName)}TypeofPaginatedTypeFor${capitalize(typeName)}TypeMixinRelatedReadInputType`}
 * Where objects are the paginated objects returned by the query and thus
 * `${capitalize(typeName)}TypeofPaginatedTypeMixin${capitalize(typeName)}TypeRelatedReadInputType` is the input type argument we can use for
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
      throw new Error(`Neither props.page nor queryConfig.page was specified. Props: ${inspect(props)}`);
    }
    const normalizePropsOrDefault = R.defaultTo(R.identity, normalizeProps);
    const className = capitalize(typeName);
    const readInputTypeMapperOrDefault = R.defaultTo(
      {objects: `[${className}TypeofPaginatedTypeMixinFor${className}TypeRelatedReadInputType]`},
      readInputTypeMapper
    );

    // Run a query for each page (based on the result of the first query)
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
  }),
  [
    ['config', PropTypes.shape(
      {
        apolloConfig: PropTypes.shape().isRequired
      },
      {
        regionConfig: PropTypes.shape().isRequired
      }
    ).isRequired
    ],
    ['queryConfig', PropTypes.shape({
      name: PropTypes.string.isRequired,
      typeName: PropTypes.string.isRequired,
      outputParams: PropTypes.shape().isRequired,
      readInputTypeMapper: PropTypes.shape()
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ],
  'queryPageContainer');

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
      outputParams: PropTypes.shape().isRequired
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ], 'queryObjectsPaginatedContainer');

/**
 * Paginated query for locations
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} [config.apolloConfig.options]
 * @param {Booleen} [config.apolloConfig.options.skip] Only relevant for component queries. Skips the query
 * if the dependent data isn't ready
 * @param {Object} config.regionConfig
 * @param {Object} queryConfig
 * @param {Object} queryConfig.outputParams Location outputParams (not the page)
 * @param {Object} queryConfig.pageSize
 * @param {Object} queryConfig.page
 * @param {Object} queryConfig.readInputTypeMapper Maps complex input types
 * @param {Function} [queryConfig.normalizeProps] Optionally takes props and limits what is passed to the query.
 * Default to passing everything
 * @param {Object|[Object]} props Props to resolve the instance. This can also be a list of prop sets
 * @param {Boolean} skip Skip the query if dependent props aren't ready (Only relevent for component queries)
 * @return {Task | Maybe} resolving to the page of location results
 * @private
 */
export const _paginatedQueryContainer = (
  {apolloConfig, regionConfig},
  {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
  props
) => {
  const propSets = toArrayIfNot(props);
  return queryObjectsPaginatedContainer(
    apolloConfig,
    {
      name,
      outputParams: {
        pageSize: 1,
        page: 1,
        pages: 1,
        hasNext: 1,
        hasPrev: 1,
        objects: outputParams
      },
      readInputTypeMapper,
      normalizeProps
    },
    // put the props in objects as an array. Pagination queries always accept plural objects, since it's
    // a many-to-many relationship. But normally we only pass one set of props
    // We also need to keep props.render at the top level if defined
    R.merge(
      {
        pageSize,
        page,
        // Omit render from each propSet. It would only be here for the single propSet case anyway
        objects: R.map(R.omit(['render']), propSets)
      },
      // If we have a render method, then we a single propset.
      // We'd never pass multiple propsSets
      R.pick(['render'], R.head(propSets))
    )
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
 * @param {Number} page The page number. If 1 then no query happens. previousPages is returned
 * since we already had to query it to get the total number of pages
 * @param props
 * @param {Object} previousPages Accumulated previous pages in the form {
 *   data: {
 *     [name]: {
 *       objects: [...all objects from previous pages...]
 *     }
 *   }
 * }
 * @return {*}
 * @private
 */
export const accumulatedSinglePageQueryContainer = (
  {apolloConfig, regionConfig},
  {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
  {previousPages},
  props
) => {
  return composeWithComponentMaybeOrTaskChain([
    pageResponse => {
      // Return the task or Apollo component with the current request response objects
      // concatenated to the previous
      return containerForApolloType(
        apolloConfig,
        {
          render: getRenderPropFunction(props),
          response: R.ifElse(
            pageResponse => R.propOr(false, 'data', pageResponse),
            pageResponse => R.compose(
              // Set the page size to the number of objects (just for consistency)
              // Hard-code page and pages to 1 since we're combining all results into a single page
              pageResponse => R.merge(
                pageResponse,
                {
                  pageSize: R.length(reqPathThrowing(['data', name, 'objects'], pageResponse)),
                  page: 1,
                  pages: 1,
                  hasPrev: false
                }
              ),
              // concatenate
              pageResponse => {
                return R.over(
                  R.lensPath(['data', name, 'objects']),
                  objects => {
                    return R.concat(reqPathThrowing(['data', name, 'objects'], previousPages), objects);
                  },
                  pageResponse
                );
              }
            )(pageResponse),
            // Data not ready
            R.identity
          )(pageResponse)
        }
      );
    },
    page => {
      return R.ifElse(
        R.equals(1),
        // Use the first result for page 1
        () => {
          return previousPages;
        },
        // Query for current page unless page.data is not ready (only relevant to component queries)
        // If the previous page is still loading, skip
        page => {
          return _paginatedQueryContainer(
            {
              apolloConfig: R.merge(
                apolloConfig,
                {options: {skip: R.complement(R.prop)('data', previousPages)}}
              ), regionConfig
            },
            {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
            props
          );
        }
      )(page);
    }
  ])(page);
};
