import {createUserSearchLocationOutputParams} from "./userSearchLocation";

export const createUserSearchOutputParams = searchLocationOutputParams => {
  return {
    userSearchLocations: createUserSearchLocationOutputParams(searchLocationOutputParams)
  }
}