export const defaultFields = [
    /*
 'Access_Mask',
 'Access_Reasons',
 'Accesses',
 'Account_Domain',
 'Account_Name',
 'Activity_ID',
 'Additional_Information',
 'Authentication_Package',
 'Caller_Identity',
 'Certificate_Identity__if_any_',
 */
    'Client_Address',
    'Client_IP',
    'Client_Port',
    'ComputerName',
    /* 
 'Content_Length',
 'Date_And_Time',
 'Error_Code',
*/

    'EventCode',
    /* 
 'EventType',
 'Failure_Code',
 'HTTP_Method',
 'Handle_ID',
 'Impersonation_Level',
 'Key_Length',
 */
    'Keywords',
    /*
 'Local_IP',
 'Local_Port',
 */
    'LogName',
    'Logon_Account',
    'Logon_GUID',
    'Logon_ID',
    'Logon_Process',
    /*
 'Logon_Type',
 */
    'Message',
    /*
 'Network_Address',
 'Object_Name',
 'Object_Server',
 'Object_Type',
 */
    'OpCode',
    /*
 'Operation_Type',
 'Package_Name__NTLM_only_',
 'Parameter_1',
 'Port',
 'Pre_Authentication_Type',
 'Privileges',
 'Privileges_Used_for_Access_Check',
 */
    'Process_ID',
    'Process_Name',
    /*
 'Properties',
 'Proxy_DNS_name',
 'Query_string',
 'READ_CONTROL',
 'ReadAttributes',
 'ReadData__or_ListDirectory_',
 'ReadEA',
 */
    'RecordNumber',
    /*
 'Relative_Target_Name',
 'Restricted_SID_Count',
 'Result_Code',
 'SYNCHRONIZE',
 'Security_ID',
 'Service_ID',
 'Service_Name',
 'Share_Name',
 'Share_Path',
 'Sid',
 'SidType',
 */
    'SourceName',
    'Source_Address',
    'Source_Network_Address',
    'Source_Port',
    'Source_Workstation',
    /*
 'Supplied_Realm_Name',
 'System_Reflection_TargetInvocationException',
 */
    'Target_Server_Name',
    /*
 'Targeted_relying_party',
 */
    'TaskCategory',
    /*
 'Through_proxy',
 'Ticket_Encryption_Type',
 'Ticket_Options',
 'Transaction_ID',
 'Transited_Services',
 */
    'Type',
    'Url_Absolute_Path',
    'User',
    'User_Agent',
    'User_ID',
    'Workstation_Name',
    '_raw',
    '_time',
    'action',
    'app',
    'body',
    'dest',
    /*
 'dest_nt_domain',
 'dest_nt_host',
 'dvc',
 'dvc_nt_host',
 */
    'event_id',
    /*
 'eventtype',
 'host',
 'id',
 'index',
 'linecount',
 'member_dn',
 'member_id',
 'member_nt_domain',
 */
    'name',
    /*
 'object',
 */
    'privilege',
    'privilege_id',
    'product',
    /*
 'punct',
 */
    'session_id',
    'severity',
    'signature',
    'signature_id',
    'source',
    'sourcetype',
    /*
 'splunk_server',
 */
    'src',
    'src_ip',
    /*
 'src_nt_domain',
 'src_nt_host',
 'src_port',
 */
    'src_user',
    'status',
    'subject',
    /*
 'tag',
 'tag::Logon_Type',
 'tag::app',
 'tag::eventtype',
 */
    'user',
    'vendor',
    'vendor_privilege'
];

export const desiredEntities = [
    'Client_IP',
    'Source_Address',
    'Source_Network_Address',
    'Source_Workstation',
    'Target_Server_Name',
    'Url_Absolute_Path',
    'User',
    'Workstation_Name',
    'name',
    'subject'
];
export const desiredAttributes = defaultFields;
export const colTypes = {
    Client_IP: 'ip',
    Client_Port: 'port',
    ComputerName: 'host',
    EventCode: 'id',
    Logon_Account: 'user',
    Logon_GUID: 'id',
    Logon_ID: 'id',
    Logon_Process: 'process',
    Message: 'event',
    Process_ID: 'id',
    Process_Name: 'process',
    RecordNumber: 'id',
    SourceName: 'log',
    Source_Address: 'ip',
    Source_Network_Address: 'ip',
    Source_Port: 'port',
    Source_Workstation: 'user',
    Target_Server_Name: 'host',
    Url_Absolute_Path: 'url',
    User: 'agent',
    User_Agent: 'agent',
    User_ID: 'user',
    Workstation_Name: 'host',
    _raw: 'event',
    body: 'event',
    event_id: 'id',
    name: 'alert',
    product: 'log',
    session_id: 'id',
    signature_id: 'id',
    source: 'log',
    subject: 'alert',
    vendor: 'log'
};
export const refTypes = {};

export const product = 'Windows';
export const productIdentifier = {
    product: 'Windows',
    vendor: 'Microsoft'
};

export const fieldsBlacklist = [];
export const attributesBlacklist = [];
export const entitiesBlacklist = defaultFields.filter(v => desiredEntities.indexOf(v) === -1);
