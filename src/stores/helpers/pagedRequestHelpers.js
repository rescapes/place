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
  makeQueryContainer,
  nameComponent
} from '@rescapes/apollo';
import {capitalize, mergeDeep, reqPathThrowing, strPathOr, toArrayIfNot} from '@rescapes/ramda';
import PropTypes from 'prop-types';
import {v} from '@rescapes/validate';
import {loggers} from '@rescapes/log';
const log = loggers.get('rescapeDefault');


/**
 * Queries for all objects using pagination to break up query results. All results are combined
 * Note that pageSize and page can either be passed to queryConfig or in via props, but props takes precedence
 * @type {function(): any}
 * @param {Object} apolloConfig
 * @param {Number} [queryConfig.pageSize] Optional pageSize, defaults to 100
 * @param {String} queryConfig.typeName the type name of the object being queried, such as 'region' or 'project'
 * @param {String} queryConfig.name the name matching the paginated query name on the server,
 * such as regionsPaginated or projectsPaginated
 * @param {String} queryConfig.paginatedObjectsName The name for the query
 * @param {Function} queryConfig.paginatedQueryContainer The query container function. This is passed most of the parameters
 * @param {Object} queryConfig.outputParams
 * @param {Object} [queryConfig.orderBy': Order by for the paged query. Default 'id'. Can be a django-query-compliant
 * string like "-data__dimensions__foo"
 * @param {Object} [queryConfig.regionReadInputTypeMapper] This should not be needed, it specifies the graphql input type.
 * By default it is assumed to by {objects: `${capitalize(typeName)}TypeofPaginatedTypeMixinFor(capitalize(typeName))TypeRelatedReadInputType`}
 * Where objects are the paginated objects returned by the query and thus
 * `${capitalize(typeName)}TypeofPaginated{capitalize(typeName)}TypeMixinRelatedReadInputType` is the input type argument we can use for
 * filtering
 * @param {Object|{[Object]}} props The props for querying the object. This can also be an array of filter objects
 * that are or'd, since the objects parameter is a toMany the api expects an array of arguments
 * @returns {Task|Object} Object or Task resolving to the all the matching objects of all pages
 */
export const queryUsingPaginationContainer = v(R.curry((
  apolloConfig,
  {
    pageSize,
    orderBy='id',
    typeName,
    name,
    outputParams,
    readInputTypeMapper,
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
  return composeWithComponentMaybeOrTaskChain([
    // Take the first page response and use it to make the remaining queries
    // Each call to accumulatedSinglePageQueryContainer receives the accumulated results from previous
    // pages and concats the new response to them
    nameComponent('tailPagesQueries', firstPageResponse => {
      // Get the number of pages so we can query for the remaining pages if there are any
      const pageCount = strPathOr(0, `data.${name}.pages`, firstPageResponse);
      if (pageCount < 2) {
        // Loading the first page or there is only 1 page
        return containerForApolloType(
          apolloConfig,
          {
            render: getRenderPropFunction(props),
            response: firstPageResponse
          }
        );
      }
      // Run a query for each page (based on the result of the first query). Reverse since we are composing
      return composeWithComponentMaybeOrTaskChain(
        R.reverse(R.times(page => {
            // Query for the page and extract the objects, since we don't need intermediate page info
            return nameComponent(`page${page}Query`, previousPages => {
              return accumulatedSinglePageQueryContainer(
                apolloConfig,
                {
                  name,
                  outputParams,
                  readInputTypeMapper: readInputTypeMapperOrDefault
                },
                // Pass the combined previous results
                {previousPages},
                // Skip the first page + 1-based index
                R.merge(props, {orderBy, pageSize: pageSizeOrDefault, page: page + 2})
              );
            });
          },
          // Skip the first page, we already have it
          pageCount - 1
        ))
      )(firstPageResponse);
    }),

    // Initial query determines tells us the number of pages
    ({page, ...props}) => {
      return _paginatedQueryContainer(
        apolloConfig,
        {
          name,
          outputParams,
          pageSize: pageSizeOrDefault,
          page,
          readInputTypeMapper: readInputTypeMapperOrDefault
        },
        props
      );
    }
  ])(R.merge({page: 1, orderBy}, props));
}), [
  ['apolloConfig', PropTypes.shape()],
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
 * @param {Object} apolloConfig
 * @param {Number} [queryConfig.pageSize] Optional pageSize, defaults to 100
 * @param {String} queryConfig.typeName the type name of the object being queried, such as 'region' or 'project'
 * @param {String} queryConfig.name the name matching the paginated query name on the server,
 * such as regionsPaginated or projectsPaginated
 * @param {String} queryConfig.paginatedObjectsName The name for the query
 * @param {Function} queryConfig.paginatedQueryContainer The query container function. This is passed most of the parameters
 * @param {Object} queryConfig.outputParams
 * @param {Object} [queryConfig.regionReadInputTypeMapper] This should not be needed, it specifies the graphql input type.
 * By default it is assumed to by {objects: `${capitalize(typeName)}TypeofPaginatedTypeFor${capitalize(typeName)}TypeMixinRelatedReadInputType`}
 * Where objects are the paginated objects returned by the query and thus
 * `${capitalize(typeName)}TypeofPaginatedTypeMixin${capitalize(typeName)}TypeRelatedReadInputType` is the input type argument we can use for
 * filtering
 * @param {Object} props
 * @returns {Task|Object} Object or Task resolving to the all the matching objects for the given page. Note
 * that if filterObjsByConfig removes objects then not all objects of the page will be returned, so don't rely
 * on the number of objects returned if using filterObjsByConfig
 */
export const queryPageContainer = v(R.curry((
  apolloConfig,
  {
    page, pageSize,
    typeName, name, filterObjsByConfig, outputParams, readInputTypeMapper
  },
  {pageSize: propsPageSize, page: propsPage, ...props}
  ) => {
    // Default to propsPageSize then pageSize then 100
    const pageSizeOrDefault = propsPageSize || pageSize || 100;
    const pageOrDefault = propsPage || page;
    const updatedApolloConfig = mergeDeep(
      apolloConfig,
      {
        options:
          {
            // Skip if we're already skipping or no page is given
            skip: strPathOr(false, 'options.skip', apolloConfig) || !pageOrDefault
          }
      }
    );
    if (!strPathOr(false, 'options.skip', updatedApolloConfig) && !pageOrDefault) {
      throw new Error(`Neither props.page nor queryConfig.page was specified. Props: ${inspect(props)}`);
    }
    const className = capitalize(typeName);
    const readInputTypeMapperOrDefault = R.defaultTo(
      {objects: `[${className}TypeofPaginatedTypeMixinFor${className}TypeRelatedReadInputType]`},
      readInputTypeMapper
    );

    // Run a query for each page (based on the result of the first query)
    return nameComponent(name, _paginatedQueryContainer(
      updatedApolloConfig,
      {
        name,
        outputParams,
        readInputTypeMapper: readInputTypeMapperOrDefault,
        pageSize: pageSizeOrDefault,
        page: pageOrDefault
      },
      props
    ));
  }),
  [
    ['apolloConfig', PropTypes.shape().isRequired
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
 * Paginated query for locations
 * @param {Object} apolloConfig
 * @param {Object} [apolloConfig.options]
 * @param {Booleen} [apolloConfig.options.skip] Only relevant for component queries. Skips the query
 * if the dependent data isn't ready
 * @param {Object} queryConfig
 * @param {Object} queryConfig.outputParams Location outputParams (not the page)
 * @param {Object} queryConfig.pageSize
 * @param {Object} queryConfig.page
 * @param {String} [queryConfig.orderBy] Default 'id' Optional path to order by
 * matching Django syntax. e.g. "-data__dimensions__fooDimension"
 * @param {Object} queryConfig.readInputTypeMapper Maps complex input types
 * @param {Object|[Object]} props Props to resolve the instance. This can also be a list of prop sets
 * Setting pageSize, page, and orderBy overrides that in options
 * @param {Boolean} skip Skip the query if dependent props aren't ready (Only relevent for component queries)
 * @return {Task | Object} Task resolving to query results or query component
 * @private
 */
export const _paginatedQueryContainer = (
  apolloConfig,
  {name, outputParams, readInputTypeMapper, pageSize, page, orderBy='id'},
  props
) => {
  return nameComponent(name, makeQueryContainer(
    // Modify options.variables to put props in objects: [...]
    _modifyApolloConfigOptionsVariablesForPagination(apolloConfig),
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
      readInputTypeMapper
    },
    R.merge({page, pageSize, orderBy}, props)
  ));
};

/**
 * Queries for a single page of a paginated query
 * @param apolloConfig
 * @param {Object} options
 * @param {String} options.name
 * @param {Object} options.outputParams
 * @param {Object} props
 * @param {Number} props.pageSize
 * @param {Number} props.page The page number. If 1 then no query happens. previousPages is returned
 * since we already had to query it to get the total number of pages
 * @param {String} props.orderBy Defaults to 'id'. Can be a django-query-compliant string "-data__dimensions__foo"
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
  apolloConfig,
  {name, outputParams, readInputTypeMapper},
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
    ({page, pageSize, ...props}) => {
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
            R.set(
              R.lensPath(['options', 'skip']),
              R.complement(R.prop)('data', previousPages),
              apolloConfig
            ),
            {name, outputParams, readInputTypeMapper, pageSize, page},
            props
          );
        }
      )(page);
    }
  ])(props);
};

/**
 * Modifies the props passed to options.variables for paginated queries, since options.variables
 * expects the model object params, not the pagination params
 * @param {Object} apolloConfig The apollo Config
 */
export const _modifyApolloConfigOptionsVariablesForPagination = apolloConfig => {
  const specialProps = ['render', 'page', 'pageSize', 'orderBy']
  return R.over(
    R.lensPath(['options', 'variables']),
    variables => {
      return props => {
        return R.merge(
          // Page props and render are combined with the objects prop
            R.pick(specialProps, props),
          {
            // objects are always an array of propSets, but for now assume only one set
            // the variables function can return an array of sets here if it wants
            objects: R.compose(
              toArrayIfNot,
              R.omit(specialProps),
              p => (variables || R.identity)(p)
            )(props)
          }
        );
      };
    }
  )(apolloConfig);
};