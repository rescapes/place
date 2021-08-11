import {activityOutputParamsMixin} from "../activityStore.js";

export const createUserSearchLocationOutputParams = searchLocationsOutputParams => {
    return {
        searchLocation: searchLocationsOutputParams,
        ...activityOutputParamsMixin
    }
}