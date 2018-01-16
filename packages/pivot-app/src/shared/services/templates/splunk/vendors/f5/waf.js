export const defaultFields = [
    'f5_alert_text',
    'f5_evt_time',
    'f5_method',
    'f5_misc',
    'f5_misc_message',
    'f5_nation',
    'f5_path',
    'f5_protocol',
    'f5_reason',
    'f5_request_status',
    'f5_response',
    'f5_response_code',
    'f5_route_domain',
    'f5_session_id',
    'f5_severity',
    'f5_st',
    'f5_uri',
    'f5_violation_details',
    'f5_violation_rating',
    'f5_violations'
];

export const desiredEntities = ['f5_path', 'f5_uri', 'f5_violation_details'];
export const desiredAttributes = [
    'f5_alert_text',
    'f5_evt_time',
    'f5_method',
    'f5_misc',
    'f5_misc_message',
    'f5_nation',
    'f5_path',
    'f5_protocol',
    'f5_reason',
    'f5_request_status',
    'f5_response',
    'f5_response_code',
    'f5_route_domain',
    'f5_session_id',
    'f5_severity',
    'f5_st',
    'f5_uri',
    'f5_violation_details',
    'f5_violation_rating',
    'f5_violations'
];

export const colTypes = {
    f5_alert_text: 'alert',
    f5_misc_message: 'alert',
    f5_nation: 'geo',
    f5_path: 'url',
    f5_reason: 'alert',
    f5_request_status: 'alert',
    f5_response: 'alert',
    f5_session_id: 'id',
    f5_severity: 'alert',
    f5_uri: 'url',
    f5_violation_details: 'alert',
    f5_violations: 'ip'
};

export const refTypes = {
    f5_alert_text: 'payload',
    f5_method: 'payload',
    f5_nation: 'src',
    f5_path: 'payload',
    f5_protocol: 'payload',
    f5_reason: 'payload',
    f5_request_status: 'payload',
    f5_response: 'payload',
    f5_response_code: 'payload',
    f5_session_id: 'session',
    f5_severity: 'payload',
    f5_uri: 'dst',
    f5_violation_details: 'payload',
    f5_violation_rating: 'payload',
    f5_violations: 'payload'
};

export const product = 'F5';
export const productIdentifier = {};

export const fieldsBlacklist = [];
export const attributesBlacklist = [];
export const entitiesBlacklist = defaultFields.filter(v => desiredEntities.indexOf(v) === -1);
