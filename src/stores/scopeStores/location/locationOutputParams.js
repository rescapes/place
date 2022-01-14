import {versionOutputParamsMixin} from '@rescapes/apollo';
import {geojsonOutputParams, geojsonOutputParamsMinimized} from "../../geojsonOutputParams.js";

export const locationOutputParamsMinimized = {
  id: 1,
  key: 1,
  name: 1,
  data: {
    example: 1
  },
  geojson: geojsonOutputParamsMinimized,
  deleted: 1,
  ...versionOutputParamsMixin
};

export const locationOutputParams = {
  id: 1,
  key: 1,
  name: 1,
  data: {
    example: 1
  },
  geojson: geojsonOutputParams,
  deleted: 1,
  ...versionOutputParamsMixin
};
