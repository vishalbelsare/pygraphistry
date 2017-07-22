//http://docs.splunk.com/Documentation/Splunk/6.6.2/Data/Aboutdefaultfields
export const splunkDefaultFields = [

    '_raw', '_time', '_indextime', '_cd',

    'host', 'index', 'linecount', 'punct', 'source', 'sourcetype', 'splunk_server', 'timestamp',

    'date_hour', 'date_mday', 'date_minute', 'date_month', 'date_second', 'date_wday', 'date_year', 'date_zone',

    //undocumented
    '_bkt', '_indextime', '_kv', '_serial', '_si', '_sourcetype', '_title',
    'dvc', 'file', 'eventtype', 'splunk_server_group'

];


//TODO make configurable
export const splunkDesiredAttributes = [
    '_time', '_indextime', '_raw', 'host', 'index', 'source', 'file', 'sourcetype', 'date_zone'
];
//subset of attributes
export const splunkDesiredEntities = [
	'host', 'index', 'source'
];


export const splunkFieldsBlacklist = splunkDefaultFields.filter(x => splunkDesiredAttributes.indexOf(x) === -1);
export const splunkAttributesBlacklist = splunkDefaultFields.filter(x => splunkDesiredAttributes.indexOf(x) === -1);
export const splunkEntitiesBlacklist = splunkDefaultFields.filter(x => splunkDesiredEntities.indexOf(x) === -1);