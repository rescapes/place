import {versionOutputParamsMixin} from '@rescapes/apollo';

export const locationOutputParamsMinimized = {
  id: true,
  key: true,
  name: true,
  data: {
    example: 1
  },
  geojson: {
    type: true,
    features: {
      type: true,
      id: true,
      geometry: {
        type: true,
        coordinates: true
      },
      properties: true
    },
    generator: true,
    copyright: true
  },
  deleted: true,
  ...versionOutputParamsMixin
};

export const locationOutputParams = {
  id: true,
  key: true,
  name: true,
  data: {
    example: 1
  },
  geojson: {
    type: true,
    features: {
      type: true,
      id: true,
      geometry: {
        type: true,
        coordinates: true
      },
      properties: true
    },
    generator: true,
    copyright: true
  },
  deleted: true,
  ...versionOutputParamsMixin
};
