import {versionOutputParamsMixin} from "@rescapes/apollo";
import {pickDeepPaths} from "@rescapes/ramda";
import {geojsonOutputParams, geojsonOutputParamsMinimized} from "../../geojsonOutputParams.js";
import {geojsonByType} from "@rescapes/helpers";

/**
 * This lacks any data property since the rescape-region SearchLocation.data property is just an example
 * Implementors should merge in their own data and other property
 * TODO this is just a copy from the server. It should be built by reading the remote schema instead
 */
export const defaultSearchLocationOutputParams = {
    id: 1,
    name: 1,
    category: 1,
    identification: {
        identifier: 1,
        identifierIn: 1,
        identifierInNot: 1,
    },
    street: {
        name: 1,
        nameContains: 1,
        nameContainsNot: 1,
        nameIn: 1,
        nameInNot: 1,
    },
    jurisdictions: {
        id: 1,
        geojson: geojsonOutputParams,
        data: {
            country: 1,
            countryContains: 1,
            countryContainsNot: 1,
            countryIn: 1,
            countryInNot: 1,
            state: 1,
            stateContains: 1,
            stateContainsNot: 1,
            stateIn: 1,
            stateInNot: 1,
            city: 1,
            cityContains: 1,
            cityContainsNot: 1,
            cityIn: 1,
            cityInNot: 1,
            county: 1,
            countyContains: 1,
            countyContainsNot: 1,
            countyIn: 1,
            countyInNot: 1,
            borough: 1,
            boroughContains: 1,
            boroughContainsNot: 1,
            boroughIn: 1,
            boroughInNot: 1,
            district: 1,
            districtContains: 1,
            districtContainsNot: 1,
            districtIn: 1,
            districtInNot: 1,
            neighborhood: 1,
            neighborhoodContains: 1,
            neighborhoodContainsNot: 1,
            neighborhoodIn: 1,
            neighborhoodInNot: 1
        },
        deleted: 1,
        createdAt: 1,
        updatedAt: 1,
        versionNumber: 1,
        revisionId: 1,
    },
    geojson: geojsonOutputParams,
    ...versionOutputParamsMixin,
    deleted: 1
}

// Minimized default search location output params. I've picked these arbitrary.
// It's hard to know what minimum search params are. Change as needed
export const defaultSearchLocationOutputParamsMinimized = pickDeepPaths(
    [
        'id', 'name', 'identification', 'street.name',
        'jursidiction.country', 'jurisdiction.state', 'jurisdiction.city', 'jurisdiction.neighborhood',
        'createdAt', 'updatedAt', 'deleted'
    ],
    defaultSearchLocationOutputParams
)
