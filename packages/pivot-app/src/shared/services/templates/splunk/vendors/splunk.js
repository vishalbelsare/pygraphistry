export const defaultFields = [	
	'EventID',


    '_cd', '_indextime', '_raw', '_time', 
    '_bkt', '_indextime', '_kv', '_serial', '_si', '_sourcetype', '_title',

	'category', 
	'date_hour', 'date_mday', 'date_minute', 'date_month', 'date_second', 'date_wday', 'date_year', 'date_zone',
	'dest_class', 'dest_hostname', 'dest_interface', 'dest_ip', 
	'dest_location', 'dest_mac', 'dest_port', 'dest_zone',
	'dst', 'dvc', 'dvc_host', 
	'eventtype', 'extracted_eventtype',
	'extracted_host', 'extracted_index', 'extracted_linecount',
	'extracted_source', 'extracted_sourcetype', 'extracted_splunk_server',
	'file', 'filename',
	'host', 'index', 'linecount', 'misc', 'name', 'product', 'protocol', 'punct', 'raw', 
	'sequence_number', 'severity', 
	'signature', 'source', 'sourcetype', 'splunk_server', 'splunk_server_group',
	'src', 'src_class', 'src_interface', 'src_ip', 'src_location', 'src_mac', 'src_port', 'src_user', 'src_zone',
	'time', 'timestamp', 'timeendpos', 'timestartpos', 
	'unix_category', 'unix_group', 'vendor', 
];

export const desiredAttributes = [
	'EventID',

	'category', 
	'dest_class', 'dest_hostname', 'dest_interface', 'dest_ip', 
	'dest_location', 'dest_mac', 'dest_port', 'dest_zone',
	'dst', 'dvc', 'dvc_host', 
	'eventtype', 'extracted_eventtype',
	'extracted_host', 'extracted_index', 'extracted_linecount',
	'extracted_source', 'extracted_sourcetype', 'extracted_splunk_server',
	'file', 'filename',
	'host', 'index', 'linecount', 'misc', 'name', 'product', 'protocol', 'punct', 'raw', 
	'sequence_number', 'severity', 
	'signature', 'source', 'sourcetype', 'splunk_server', 'splunk_server_group',
	'src', 'src_class', 'src_interface', 'src_ip', 'src_location', 'src_mac', 'src_port', 'src_user', 'src_zone',
	'time', 'timestamp', 'unix_category', 'unix_group', 'vendor', 
];

export const desiredEntities = [
	'EventID',

	'dest', 'dest_hostname' , 'dest_ip', 'dest_mac', 'dest_user',
	'dst', 'file', 'filename',
	'sequence_number',
	'src', 'src_hostname' , 'src_ip', 'src_mac', 'src_user',
];

export const colTypes = {
	'dest': 'ip',
	'dest_hostname': 'url',
	'dest_ip': 'ip',
	'dest_mac': 'mac',
	'dest_user': 'user',
	'dst': 'ip',
	'EventID': 'event',
	'file': 'file',
	'filename': 'file',
	'host': 'url',
	'sequence_number': 'id',
	'src': 'ip',
	'src_hostname': 'url',
	'src_ip': 'ip',
	'src_mac': 'mac',
	'src_user': 'user',
};

export const fieldsBlacklist = defaultFields.filter(
	x => (desiredAttributes.indexOf(x) === -1) && (desiredEntities.indexOf(x) === -1));
export const attributesBlacklist = defaultFields.filter(x => desiredAttributes.indexOf(x) === -1);
export const entitiesBlacklist = defaultFields.filter(x => desiredEntities.indexOf(x) === -1);