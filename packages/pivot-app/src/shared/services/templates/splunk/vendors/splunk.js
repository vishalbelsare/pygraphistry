export const defaultFields = [	
	'EventID',


    '_cd', '_indextime', '_raw', '_time', 
    '_bkt', '_indextime', '_kv', '_serial', '_si', '_sourcetype', '_title',

	'category', 
	'date_hour', 'date_mday', 'date_minute', 'date_month', 'date_second', 'date_wday', 'date_year', 'date_zone',
	'dest', 'dest_class', 'dest_hostname', 'dest_interface', 'dest_ip',
	'dest_location', 'dest_mac', 'dest_port', 'dest_zone',
	'domain',
	'dst', 
	'dhost', 'dmac', 'dpt', 'dntdom',
	'dvc', 'dvc_host', 
	'eventtype', 'extracted_eventtype',
	'extracted_host', 'extracted_index', 'extracted_linecount',
	'extracted_source', 'extracted_sourcetype', 'extracted_splunk_server',
	'file', 'filename',
	'host', 'index', 'linecount', 'misc', 'msg', 'name', 'product', 'protocol', 'punct', 'raw', 
	'sequence_number', 'severity', 
	'signature', 'source', 'sourcetype', 'splunk_server', 'splunk_server_group',
	'smac', 'spt',
	'src', 'src_class', 'src_interface', 'src_host', 'src_ip', 'src_location', 'src_mac', 'src_port', 'src_user', 'src_zone',
	'time', 'timestamp', 'timeendpos', 'timestartpos', 
	'unix_category', 'unix_group', 'vendor', 
];

export const desiredAttributes = [
	'EventID',

	'category', 
	'dest', 'dest_class', 'dest_hostname', 'dest_interface', 'dest_ip', 
	'dest_location', 'dest_mac', 'dest_port', 'dest_zone',
	'domain',
	'dhost', 'dmac', 'dpt', 'dntdom',
	'dst', 'dvc', 'dvc_host', 
	'eventtype', 'extracted_eventtype',
	'extracted_host', 'extracted_index', 'extracted_linecount',
	'extracted_source', 'extracted_sourcetype', 'extracted_splunk_server',
	'file', 'filename',
	'host', 'index', 'linecount', 'misc', 'msg', 'name', 'product', 'protocol', 'punct', 'raw', 
	'sequence_number', 'severity', 
	'signature', 'source', 'sourcetype', 'splunk_server', 'splunk_server_group',
	'smac', 'spt',
	'src', 'src_class', 'src_host', 'src_interface', 'src_ip', 'src_location', 'src_mac', 'src_port', 'src_user', 'src_zone',
	'time', 'timestamp', 'unix_category', 'unix_group', 'vendor', 
];

export const desiredEntities = [
	'EventID',

	'dest', 'dest_hostname' , 'dest_ip', 'dest_mac', 'dest_user',
	'dhost', 'dmac',
	'dst', 'file', 'filename', 'msg',
	'sequence_number',
	'smac',
	'src', 'src_host', 'src_hostname' , 'src_ip', 'src_mac', 'src_user',
];

export const colTypes = {
	'dhost': 'url',
	'dmac': 'mac',
	'dest': 'ip',
	'dest_hostname': 'url',
	'dest_ip': 'ip',
        'dest_location': 'url',
	'dest_mac': 'mac',
	'dest_user': 'user',
	'dst': 'ip',
	'EventID': 'event',
	'file': 'file',
	'filename': 'file',
	'host': 'url',
	'msg': 'alert',
	'sequence_number': 'id',
	'smac': 'mac',
	'src': 'ip',
	'src_host': 'url',
	'src_hostname': 'url',
	'src_ip': 'ip',
        'src_location': 'url',
	'src_mac': 'mac',
	'src_user': 'user',

};

export const refTypes = {
	'dhost': 'dst',
	'dmac': 'dst',
	'dest': 'dst',
	'dest_hostname': 'dst',
	'dest_ip': 'dst',
	'dest_mac': 'dst',
	'dest_user': 'dst',
	'dst': 'dst',
	'EventID': 'event',
	'file': 'payload',
	'filename': 'payload',
	'host': '?',
	'msg': 'payload',
	'sequence_number': '?',
	'smac': 'src',
	'src': 'src',
	'src_host': 'src',
	'src_hostname': 'src',
	'src_ip': 'src',
	'src_mac': 'src',
	'src_user': 'src'
}

export const fieldsBlacklist = defaultFields.filter(
	x => (desiredAttributes.indexOf(x) === -1) && (desiredEntities.indexOf(x) === -1));
export const attributesBlacklist = defaultFields.filter(x => desiredAttributes.indexOf(x) === -1);
export const entitiesBlacklist = defaultFields.filter(x => desiredEntities.indexOf(x) === -1);

export const product = 'Splunk';
export const productIdentifier = {};
