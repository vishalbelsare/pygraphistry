import _ from 'underscore';

export const defaultFields = [
    'agentId',
    'agentVersion',
    'categoryBehavior',
    'categoryDeviceType',
    'categoryDeviceGroup',
    'categoryObject',
    'categoryOutcome',
    'categorySignificance',
    'categoryTechnique',
    'categoryTupleDescription',
    'deviceCustomDate1',
    'deviceCustomDate1Label',
    'ioc_name',
    'start',

].concat(
    _.range(0, 10).map((v) => `cn${v}`),
    _.range(0, 10).map((v) => `cn${v}Label`),
    _.range(0, 10).map((v) => `cs${v}`),
    _.range(0, 10).map((v) => `cs${v}Label`),
    _.range(0, 150).map((v) => `field${v}`),
    _.range(0, 10).map((v) => `flexString${v}`),
    _.range(0, 10).map((v) => `flexString${v}Label`),
    _.range(0, 10).map((v) => `future_use${v}`) 
);

export const desiredEntities = [ 
    'ioc_name'
];  

export const desiredAttributes = [
    'categoryBehavior',
    'categoryDeviceType',
    'categoryObject',
    'categoryOutcome',    
    'categorySignificance',    
    'categoryTechnique',
    'categoryTupleDescription',
    'deviceCustomDate1',
    'deviceCustomDate1Label',    
    'ioc_name',
    'start'
];

export const colTypes = { // alert, event, file, hash, id, ip, mac, url 
    'ioc_name': 'alert'
};

export const refTypes = { //device, dst, payload, src
    'ioc_name': 'payload'
}

export const product = 'FireEye HX';
export const productIdentifier = {
    product: 'HX',
    vendor: 'fireeye'
};
export const fieldsBlacklist = [];
export const attributesBlacklist = _.range(0, 150).map((v) => `field${v}`);
export const entitiesBlacklist = defaultFields.filter((v) => desiredEntities.indexOf(v) === -1);