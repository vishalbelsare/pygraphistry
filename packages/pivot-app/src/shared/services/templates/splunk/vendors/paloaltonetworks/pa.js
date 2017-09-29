import _ from 'underscore';

export const defaultFields = [
	'X_OpenDNS_Session',
	'action', 'action_flags', 'app',
	'app_able_to_transfer_file', 'app_category', 'app_default_ports', 
	'app_evasive', 'app_excessive_bandwidth', 'app_has_known_vulnerability',
	'app_is_saas', 'app_is_sanctioned_saas','app_pervasive_use', 
	'app_prone_to_misuse', 'app_risk',
	'app_subcategory', 'app_technology', 'app_tunnels_other_application',
	'app_used_by_malware',
	'application', 'cid', 'client_ip', 'client_location', 'content_type', 	
	'dest_translated_port', 'direction',
	'flags', 'generated_time', 'ids_type', 'log_forwarding_profile', 'log_subtype',
	'major_content_type', 'misc', 'pcap_id',
	'receive_time', 'repeat_count', 'report_id', 'rule',
	'sequence_number', 'server_location',
	'session_id', 'serial_number', 'signature_id', 'src_translated_ip', 'src_translated_port',
	'tag__eventtype', 'threat_name', 'threat_id', 'type', 'url', 'url_index',
	'vendor_action', 'vendor_product', 'vendor_protocol', 'virtual_system', 'vsys'
].concat(_.range(0,10).map((v) => `devicegroup_level${v}`));

export const desiredEntities = [ 
	'client_ip', 'client_location',
	'rule', 'server_location',
	'threat_name'];
export const desiredAttributes = defaultFields;
export const colTypes = {
	'client_ip': 'ip',
	'client_location': 'geo',	
	'pcap_id': 'id',
	'rule': 'alert',
	'server_location': 'geo',
	'session_id': 'id',
	'signature_id': 'id',
	'threat_name': 'alert',
	'url': 'url'
};	
export const refTypes = {
	'client_ip': 'src',
	'client_location': 'src',
	'pcap_id': 'payload',
	'rule': 'payload',
	'server_location': 'dst',
	'session_id': 'session',
	'signature_id': 'payload',
	'threat_name': 'payload',
	'url': 'payload'
};

export const product = "Palo Alto Networks Firewall";
export const productIdentifier = {
	vendor_product: "Palo Alto Networks Firewall",
	vendor: "Palo Alto Networks"
};

export const fieldsBlacklist = [];
export const attributesBlacklist = [];
export const entitiesBlacklist = defaultFields.filter((v) => desiredEntities.indexOf(v) === -1);

	