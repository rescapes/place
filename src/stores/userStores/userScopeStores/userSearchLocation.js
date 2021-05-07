import {activityOutputParamsMixin} from "../activityStore";

export const createUserSearchLocationOutputParams = searchLocationsOutputParams => {
    return {
        searchLocation: searchLocationsOutputParams,
        ...activityOutputParamsMixin
    }
}