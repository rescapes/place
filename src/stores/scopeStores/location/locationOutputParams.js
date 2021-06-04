import {versionOutputParamsMixin} from '@rescapes/apollo';

export const locationOutputParamsMinimized = {
  id: 1,
  key: 1,
  name: 1,
  data: {
    example: 1
  },
  geojson: {
    type: 1,
    features: {
      type: 1,
      id: 1,
      geometry: {
        type: 1,
        coordinates: 1
      },
      properties: 1
    },
    generator: 1,
    copyright: 1
  },
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
  geojson: {
    type: 1,
    features: {
      type: 1,
      id: 1,
      geometry: {
        type: 1,
        coordinates: 1
      },
      properties: 1
    },
    generator: 1,
    copyright: 1
  },
  deleted: 1,
  ...versionOutputParamsMixin
};
