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
import {queryPageContainer, queryUsingPaginationContainer} from './pagedRequestHelpers.js';
import {capitalize, mergeDeep, strPathEq, strPathOr} from '@rescapes/ramda';
import {
    composeFuncAtPathIntoApolloConfig,
    containerForApolloType,
    getRenderPropFunction, nameComponent
} from '@rescapes/apollo';


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
 *   name: Use as the name instead of teh type
 *   args: arguments to pass to the container
 *   outputParams
 * }
 * A paged version of queryContainer
 * {
 *   type: 'paged'
 *   name: 'someNameOtherThanType'
 *   outputParams
 * }
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and limits what props are
 * passed to the query. Defaults to passing all of them
 * @param {String} queryConfig.allowRequestPropPath The prop to check for a string match of key of the query that should not be skipped.
 * This makes all queries inactive except 0 or 1, since there's no reason to use two variations of query at the same time.
 * If there ever was we could make allowRequestPropPath match a prop that could be a list of strings.
 * Note that if queryContainer defines it's own skip, it should be set up to OR the skip passed in by queryVariationContainers
 * @param {[String]} [queryConfig.allowQueries] Disables allowRequestPropPath to allow the queries specified.
 * Example ['queryLocationsPaginated'] would allow a query by that name and skip all others
 * @param {Function} [queryConfig.authRequestFilter] If specified accepts props and returns true
 * if the queries are authorized to run, otherwise all queries are skipped. Note again that if queryContainer
 * defines it's own skip, it should be set up to OR the skip passed in by queryVariationContainers
 * @param {Object} props
 * @param {Boolean} props.queryVariationContainersTestAll Use this test prop to override allowRequestPropPath
 * and run all the query container
 * @returns {Object} keyed by query names, e.g. queryFoos, queryFoosPaginated, queryFoosMinimized, valued by
 * the query container
 */
export const queryVariationContainers = R.curry((
    apolloConfig,
    {
        name,
        requestTypes,
        queryConfig,
        queryContainer,
        normalizeProps = R.identity,
        allowRequestPropPath,
        allowQueries,
        authRequestFilter,
    }
) => {
    return R.fromPairs(R.map(
        ({type, name: typeName, args}) => {
            const pluralName = `${name}s`;
            const queryKey = `query${capitalize(pluralName)}${capitalize(typeName || type || '')}`;
            return [
                queryKey,
                props => {
                    // Skip if our skipFilter returns true or authRequestFilter returns false
                    const skip = R.anyPass([
                        // Skip unless the props['allowRequestPropPath'] equals queryKey
                        // This check is disabled by the presence of queryVariationContainersTestAll
                        // or allowQueries being non-null/non-empty
                        props => !R.propOr(false, 'queryVariationContainersTestAll', props) &&
                            !allowQueries &&
                            R.complement(strPathEq)(allowRequestPropPath, queryKey)(props),
                        // Skip queries not specified by queryKey in allowQueries if allowQueries is truthy
                        () => allowQueries && !R.includes(queryKey, allowQueries),
                        // If apolloConfig.options.skip is defined, test it
                        props => strPathOr(R.always(false), 'options.skip', apolloConfig)(props),
                        // If an authRequestFilter is provided test it. Usually it's better to test authentication
                        // using the options.skip function, so that the authentication props don't get hard-coded
                        // in a caller to queryVariationContainers
                        props => (R.complement(authRequestFilter || R.always(true)))(props)
                    ])(props);
                    // Update apolloConfig so that props.objects are passed to the optional options.variables function
                    const _apolloConfig = mergeDeep(
                        composeFuncAtPathIntoApolloConfig(
                            apolloConfig,
                            'options.variables',
                            normalizeProps
                        ),
                        // Merge skip into options
                        {options: {skip}}
                    )

                    return R.cond([
                        // Queries for one page at a time
                        [R.equals('paginated'),
                            () => {
                                return queryPageContainer(
                                    _apolloConfig,
                                    R.omit(['readInputTypeMapper'],
                                        R.mergeAll([
                                            // Defaults
                                            queryConfig,
                                            {
                                                typeName: name,
                                                name: `${pluralName}Paginated`
                                            },
                                            // Overrides for particular query type
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
                                    _apolloConfig,
                                    R.omit(['readInputTypeMapper'],
                                        R.mergeAll([
                                                // Defaults
                                                queryConfig,
                                                {
                                                    typeName: name,
                                                    name: `${pluralName}Paginated`
                                                },
                                                // Overrides for particular query type
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
                                // Perform the normal query
                                return nameComponent(queryKey, queryContainer(
                                    _apolloConfig,
                                    R.mergeAll([queryConfig, args]),
                                    props
                                ));
                            }
                        ]
                    ])(type);
                }
            ];
        },
        requestTypes
    ));
});

/**
 * Wraps queryVariationContainers in a function to verify authentication. If not authenticated, the queries don't
 * run and instead return null response, sort of like specifying the skip parameter for each
 * @param {Object} apolloConfig
 * @param {String} authenticationPath A path into props that must be truthy to indicate authentication
 * @param {Object} queryVariationContainers. Keyed by query and valued by query component/task. See queryVariationContainers
 * @returns {Object} queryVariationContainers or modified if not authenticated
 */
export const variationContainerAuthDependency = (apolloConfig, authenticationPath, queryVariationContainers) => {
    return R.map(
        component => {
            // Skip if not authenticated
            return props => {
                if (!strPathOr(false, authenticationPath, props)) {
                    return containerForApolloType(
                        apolloConfig,
                        {
                            render: getRenderPropFunction(props),
                            response: props
                        }
                    );
                }
                return component(props);
            };
        },
        queryVariationContainers
    );
};
