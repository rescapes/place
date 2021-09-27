import {v} from "@rescapes/validate";
import {defaultSearchLocationOutputParams} from "../../search/searchLocation/defaultSearchLocationOutputParams.js";
import {
  composeFuncAtPathIntoApolloConfig,
  logicalOrValueAtPathIntoApolloConfig,
  makeQueryContainer
} from "@rescapes/apollo";
import {
  querySearchLocationsContainer,
  searchLocationReadInputTypeMapper
} from "../../search/searchLocation/searchLocationStore.js";
import {strPathOr} from "@rescapes/ramda";

/**
 * Resolves the SearchLocation ids specified in the UserState for the given scope instance and then queries
 * for those SearchLocations by id
 * @param {Object} apolloConfig
 * @param {Object} config
 * @param {String} config.scopeName 'region' or 'project'
 * @param {Object} props
 * @param {Object} props.scope region or project instance
 * @returns {Object} Task or component resolving to the query results
 */
export const queryUserStateSearchLocationsContainer = v(
    (apolloConfig, {outputParams=defaultSearchLocationOutputParams}, props) => {
      const searchLocationIds = R.compose(
        userSearchLocations => {
          return R.map(userSearchLocation => strPathOr(null, 'searchLocation.id', userSearchLocation), userSearchLocations)
        },
        strPathOr([], 'userRegion.userSearch.userSearchLocations', props)
      )(props)
      return querySearchLocationsContainer(
        R.compose(
          apolloConfig => {
            return logicalOrValueAtPathIntoApolloConfig(apolloConfig, 'options.skip', !R.length(searchLocationIds))
          },
          apolloConfig => composeFuncAtPathIntoApolloConfig(apolloConfig, 'options.variables', props => {
            return R.pick(['idIn'], props)
          })
        )(apolloConfig),
        {outputParams: sopSearchLocationOutputParams},
        {idIn: searchLocationIds, ...props}
      );
    },
  [
    ['apolloConfig', PropTypes.shape().isRequired
    ],
    ['options', PropTypes.shape({
      outputParams: PropTypes.shape.isRequired
    })
    ],
    ['props', PropTypes.shape({

    }).isRequired]
  ], 'querySearchLocationsContainer'
);