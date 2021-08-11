import {createUserSearchLocationOutputParams} from "./userSearchLocation.js";

export const createUserSearchOutputParams = searchLocationOutputParams => {
  return {
    userSearchLocations: createUserSearchLocationOutputParams(searchLocationOutputParams)
  }
}