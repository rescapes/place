import {locationOutputParams, locationOutputParamsMinimized} from "../../scopeStores/location/locationOutputParams";
import {versionOutputParamsMixin} from "@rescapes/apollo";
import {pickDeepPaths} from "@rescapes/ramda";

/**
 * This lacks any data property since the rescape-region SearchLocation.data property is just an example
 * Implementors should merge in their own data and other property
 * TODO this is just a copy from the server. It should be built by reading the remote schema instead
 */
export const defaultSearchLocationOutputParams = {
    id: true,
    name: true,
    identification: {
        identifier: true,
        identifierContains: true,
        identifierContainsNot: true
    },
    street: {
        name: true,
        nameContains: true,
        nameContainsNot: true,
    },
    jurisdictions: {
        id: true,
        geojson: {
            type: true,
            features: {
                type: true,
                id: true,
                geometry: {
                    type: true,
                    coordinates: true,
                },
                properties: true
            },
            generator: true,
            copyright: true
        },
        data: {
            country: true,
            countryContains: true,
            countryContainsNot: true,
            state: true,
            stateContains: true,
            stateContainsNot: true,
            city: true,
            cityContains: true,
            cityContainsNot: true,
            county: true,
            countyContains: true,
            countyContainsNot: true,
            borough: true,
            boroughContains: true,
            boroughContainsNot: true,
            district: true,
            districtContains: true,
            districtContainsNot: true,
            neighborhood: true,
            neighborhoodContains: true,
            neighborhoodContainsNot: true,
        },
        deleted: true,
        createdAt: true,
        updatedAt: true,
        versionNumber: true,
        revisionId: true,
    },
    geojson: {
        type: true,
        features: {
            type: true,
            id: true,
            geometry: {
                type: true,
                coordinates: true,
            },
            properties: true,
        },
        generator: true,
        copyright: true
    },
    ...versionOutputParamsMixin,
    deleted: true
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
