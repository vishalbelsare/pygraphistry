export const defaultFields = [
    'geoip.city_name',
    'geoip.continent_code',
    'geoip.country_code2',
    'geoip.country_code3',
    'geoip.country_name',
    'geoip.ip',
    'geoip.latitude',
    'geoip.location',
    'geoip.longitude',
    'geoip.region_code',
    'geoip.region_name',
    'geoip.timezone'
];

export const desiredEntities = [];
export const desiredAttributes = defaultFields;

export const colTypes = {
    'geoip.city_name': 'geo',
    'geoip.continent_code': 'geo',
    'geoip.country_code2': 'geo',
    'geoip.country_code3': 'geo',
    'geoip.country_name': 'geo',
    'geoip.ip': 'ip',
    'geoip.latitude': 'geo',
    'geoip.location': 'geo',
    'geoip.longitude': 'geo',
    'geoip.region_code': 'geo',
    'geoip.region_name': 'geo'
};

export const refTypes = {
    'geoip.city_name': 'src',
    'geoip.continent_code': 'src',
    'geoip.country_code2': 'src',
    'geoip.country_code3': 'src',
    'geoip.country_name': 'src',
    'geoip.ip': 'src',
    'geoip.latitude': 'src',
    'geoip.location': 'src',
    'geoip.longitude': 'src',
    'geoip.region_code': 'src',
    'geoip.region_name': 'src'
};

export const product = 'es.geo';
export const productIdentifier = {};

export const fieldsBlacklist = [];
export const attributesBlacklist = [];
export const entitiesBlacklist = defaultFields.filter(v => desiredEntities.indexOf(v) === -1);
