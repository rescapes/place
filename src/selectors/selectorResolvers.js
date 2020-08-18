/**
 * Created by Andy Likuski on 2017.12.01
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {makeGeojsonSelector} from '../selectors/geojsonSelectors';
import * as R from 'ramda';
import {reqPathThrowing} from 'rescape-ramda';
import {activeUserSelectedRegionsSelector, regionSelector} from '../selectors/regionSelectors';
import {activeUserSelectedRegionSelector, activeUsersSelector, userSelector} from '../selectors/userSelectors';
import {mapboxSelector} from '../selectors/mapboxSelectors';

// Trivial resolver for our dataSource, just strips object keys and returns values
const objectValues = field => parent => {
  return R.values(reqPathThrowing([field], parent));
};
// Calls the given selector, treating the dataSource state and passing props through
const selectorValues = selector => (parent, params, {options: {dataSource}}) => R.values(selector(dataSource, {params}));
const selectorValue = selector => (parent, params, {options: {dataSource}}) => selector(dataSource, {params});

// Calls the given selector with the parent merged into the props at the given parentKey
const parentSelectorValues = (parentKey, selector) => (parent, props, {options: {dataSource}}) => {
  return selector(dataSource, R.merge(props, {[parentKey]: parent}));
};

// Original example from: https://github.com/apollographql/graphql-tools
export const makeSelectorResolvers = () => ({
  //Operation: {

  //},
  //Permission: {
  //  operations: objectValues('operations')
  //},
  User: {
    //permissions: objectValues('permissions'),
    regions: objectValues('regions')
  },
  Location: {
    features: parent => objectValues('features')(parent)
  },
  Sankey: {},

  SankeyGraph: {},

  SankeyLink: {},

  //SankeyStage: {},

  Geojson: {
    features: parent => objectValues('features')(parent)
  },

  Bounds: {},
  Geospatial: {},
  Viewport: {},

  Mapbox: {},

  Region: {
    geojson: parentSelectorValues('region', makeGeojsonSelector()),
    mapbox: parentSelectorValues('region', mapboxSelector)
  },

  MapboxSettings: {
    // Default resolve settings.mapbox
  },

  ApiSettings: {
    // Default resolve settings.api
  },

  OverpassSettings: {
    // Default Resolve settings.overpass
  },

  Settings: {},


  Query: {
    // The resolvers here limit the user to the active user and regions to the active region(s)
    // A different resolver setup could load all regions of a user (for user admin) or all regions for (overall admin)
    // Resolves settings
    //settings: selectorValues(settingsSelector),
    // Resolves the active region(s) of the active user
    regions: selectorValues(activeUserSelectedRegionsSelector),
    region: selectorValue(regionSelector),
    // Resolves the active user in a container
    users: selectorValues(activeUsersSelector),
    // Resolves the specified user
    user: selectorValue(userSelector),
  },

  Mutation: {
    /***
     * Selects or deselects the sankey diagram of the given filterNodeCategory string. The selection of others
     * is not impacted
     * @param {void} _ Unused parameter
     * @param {String} filterNodeCategory The category name of the sankey diagram being selected/deselected
     * @param {Boolean} filterNodeValue true to select, false to deselect
     * @param dataSource
     */
    filterSankeyNodesMutation(_, {filterNodeCategory, filterNodeValue}, {options: {dataSource}}) {
      const region = activeUserSelectedRegionSelector(dataSource);
      region.geojson = region.geojson || {};
      region.geojson.sankey = region.geojson.sankey || {};
      region.geojson.sankey.selected = R.merge(region.geojson.sankey.selected, {[filterNodeCategory]: filterNodeValue});
    }
  }
});

/**
 * Modifies the given schema to add reselect functions as resolvers
 * The reselect selectors represent the way that we filter data for Components
 * by, for instance, limited the Regions to the one marked active
 * @param {Object} schema A GraphlQL SchemaObject
 * @param {Object} data A full data structure that matches to serve as a lookup for resolvers
 * the structure the schema
 * @returns {Object} The given GraphQLSchema with resolvers added
 */
/*
export const createSelectorResolvedSchema = (schema, data) => {
  addResolveFunctionsToSchema({schema, resolvers: makeSelectorResolvers()});
  return schema;
};
 */
