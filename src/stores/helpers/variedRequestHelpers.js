/**
 * Created by Andy Likuski on 2020.03.03
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as R from 'ramda';
import {queryPageContainer, queryUsingPaginationContainer} from './pagedRequestHelpers';
import {capitalize, composeWithChain} from 'rescape-ramda';
import {containerForApolloType} from 'rescape-apollo';

/**
 * Given a query container and request type returns version of the query for the given request types.
 * @param {Object} apolloConfig
 * @param {Object} requestConfig
 * @param {String} requestConfig.name
 * @param {[Object]} requestConfig.requestTypes
 * @param {Object} requestConfig.queryContainer
 * @param requestTypes List of objects with type and outputParams. The following options are available
 * Returns the queryContainer using the given outputParams. The name of the query is name + capitalized(type)
 * {
 *   type: string or null or undefined
 *   args: arguments to pass to the container
 *   outputParams
 * }
 * A paged version of queryContainer
 * {
 *   type: 'paged'
 *   outputParams
 * }
 * @param {Function} [queryConfig.postProcessObjsByConfig] Optional function expecting ({regionConfig}, objs)
 * to filter or maps objects returned by pagination based on the regionConfig, where objs are all objects returned by pagination.
 * This is used to filter out objects that can't easily be filtered out using direct props on the pagination query,
 * such as properties embedded in json data. I can be also used to add derived data to results
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and limits what props are
 * passed to the query. Defaults to passing all of them
 * @param {Object} props
 */
export const queryVariationContainers = R.curry((
  {apolloConfig, regionConfig},
  {
    name,
    requestTypes,
    queryConfig,
    queryContainer,
    postProcessObjsByConfig = (config, objs) => objs,
    normalizeProps = R.identity
  }
) => {
  return R.fromPairs(R.map(
    ({type, args}) => {
      const pluralName = `${name}s`;
      const key = `${pluralName}${capitalize(type || '')}`;
      return [
        key,
        props => {
          return R.cond([
            // Queries for one page at a time
            [R.equals('paginated'),
              () => {
                return queryPageContainer(
                  {apolloConfig, regionConfig: regionConfig || {}},
                  R.omit(['readInputTypeMapper'],
                    R.mergeAll([
                      queryConfig,
                      {
                        typeName: name,
                        name: `${pluralName}Paginated`
                      },
                      postProcessObjsByConfig,
                      normalizeProps,
                      args
                    ])
                  ),
                  props
                );
              }
            ],
            // Queries for all objects using pages whose results are combined.
            // This prevents large query results that tax the server
            [R.equals('paginatedAll'),
              () => {
                return queryUsingPaginationContainer(
                  {apolloConfig, regionConfig: regionConfig || {}},
                  R.omit(['readInputTypeMapper'],
                    R.mergeAll([
                        queryConfig, {
                          typeName: name,
                          name: `${pluralName}Paginated`
                        },
                        postProcessObjsByConfig,
                        normalizeProps,
                        args
                      ]
                    )
                  ),
                  props
                );
              }
            ],
            // Normal queries such as with full outputParams or minimized outputParams
            // Type is optional here
            [R.T,
              () => {
                return composeWithChain([
                  objs => {
                    // postProcessObjsByConfig (defaults to R.identity)
                    return containerForApolloType(apolloConfig,
                      R.when(
                        R.identity,
                        objs => {
                          return postProcessObjsByConfig({regionConfig}, objs);
                        }
                      )(objs)
                    );
                  },
                  ({apolloConfig, queryConfig, args, props, normalizeProps}) => {
                    // Perform the normal query
                    return queryContainer(
                      apolloConfig,
                      R.mergeAll([queryConfig, args]),
                      normalizeProps(props)
                    );
                  }
                ])({apolloConfig, regionConfig, queryConfig, args, normalizeProps, props});
              }
            ]
          ])(type);
        }
      ];
    },
    requestTypes
  ));
});