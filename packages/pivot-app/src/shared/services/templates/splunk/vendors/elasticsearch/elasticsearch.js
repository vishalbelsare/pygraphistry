export const defaultFields = [
    '@timestamp',
    '@version',
    '_id',
    '_index',
    '_score',
    '_type',
    'syslog_hostname'
];

export const desiredEntities = [];
export const desiredAttributes = defaultFields;

export const colTypes = {
    _id: 'id'
};

export const refTypes = {
    _id: 'payload'
};

export const product = 'es';
export const productIdentifier = {};

export const fieldsBlacklist = [];
export const attributesBlacklist = [];
export const entitiesBlacklist = defaultFields.filter(v => desiredEntities.indexOf(v) === -1);
