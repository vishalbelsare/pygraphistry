//Auto_Run	Cylance_Score	Detected_By	Device_Name	Drive_Type	Event_Name	Event_Type	File_Name	File_Type	Found_Date	IP_Address	Is_Malware	Is_Running	Is_Unique_To_Cylance	MD5	Path	Role	SHA256	Status	Threat_Class	Threat_Classification	Threat_Subclass	Zone_Names	_raw	_time	app	app:able_to_transfer_file	app:category	app:default_ports	app:evasive	app:excessive_bandwidth	app:has_known_vulnerability	app:is_saas	app:is_sanctioned_saas	app:pervasive_use	app:prone_to_misuse	app:risk	app:subcategory	app:technology	app:tunnels_other_application	app:used_by_malware	change_type	date_hour	date_mday	date_minute	date_month	date_second	date_wday	date_year	date_zone	enabled	eventtype	host	ids_type	index	linecount	object_category	product	punct	range	source	sourcetype	splunk_server	splunk_server_group	status	tag	tag::app	tag::eventtype	tag::source	timeendpos	timestartpos	user_type	vendor	vendor_category	vendor_product

export const defaultFields = [
    'Auto_Run',
    'Cylance_Score',
    'Detected_By',
    'Device_Name',
    'Drive_Type',
    'Event_Name',
    'Event_Type',
    'File_Name',
    'File_Type',
    'Found_Date',
    'IP_Address',
    'Is_Malware',
    'Is_Running',
    'Is_Unique_To_Cylance',
    'MD5',
    'Path',
    'Role',
    'SHA256',
    'Status',
    'Threat_Class',
    'Threat_Classification',
    'Threat_Subclass',
    'Zone_Names',
    'host'
];

export const desiredEntities = [
    'Device_Name',
    'Event_Name',
    'File_Name',
    'IP_Address',
    'MD5',
    'Threat_Classification',
    'Threat_Subclass'
];
export const desiredAttributes = defaultFields;

export const colTypes = {
    Device_Name: 'url',
    Event_Name: 'alert',
    File_Name: 'file',
    IP_Address: 'ip',
    MD5: 'hash',
    Path: 'url',
    SHA256: 'hash',
    Status: 'alert',
    Threat_Classification: 'alert',
    Threat_Subclass: 'alert'
};

export const refTypes = {
    Device_Name: 'src',
    Event_Name: 'payload',
    File_Name: 'payload',
    IP_Address: 'src',
    MD5: 'payload',
    Path: 'payload',
    Status: 'payload',
    Threat_Classification: 'payload',
    Threat_Subclass: 'payload'
};

export const product = 'Cylance';
export const productIdentifier = {
    product: 'Protect',
    vendor: 'Cylance'
};

export const fieldsBlacklist = [];
export const attributesBlacklist = [];
export const entitiesBlacklist = defaultFields.filter(v => desiredEntities.indexOf(v) === -1);
