import _ from 'underscore';

export const defaultFields = [
	'act', 'app_risk', 'cid',
	'devicePayloadId', 'dmac', 'dpt', 'dvc_ip', 'dvchost', 
	'ext_ref', 'externalId',
	'fileHash', 'filePath', 'fileType', 'file_hash', 'fname', 'fsize',
	'id', 'infURL', 'objURL', 'occurred', 'product_version',
	'proto', 'requestClientApplication', 'requestMethod', 'rt', 'shost', 'smac', 
	'sproc', 'spt', 'signature', 
	'transport',

	'cef_dproduct', 'cef_dvendor', 'cef_dversion', 'cef_name', 'cef_severity', 'cef_sid', 
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
	'dmac',
	'fileHash', 'filePath', 'file_hash', 'fname', 'objURL',
	'smac', 'sproc', 'signature'
];	

export const desiredAttributes = [
	'act', 'app_risk', 'cid',
	'devicePayloadId', 'dmac', 'dpt', 'dvc_ip', 'dvchost', 
	'ext_ref', 'externalId',
	'fileHash', 'filePath', 'fileType', 'file_hash', 'fname', 'fsize',
	'id', 'infURL', 'objURL', 'occurred', 'product_version',
	'proto', 'requestClientApplication', 'requestMethod', 'rt', 'shost', 'smac', 
	'sproc', 'spt', 'signature', 
	'transport',
];

export const colTypes = { // alert, event, file, hash, id, ip, mac, url	
	'devicePayloadId': 'id',
	'dmac': 'mac',
	'dvc_ip': 'ip',
	'ext_ref': 'url',
	'externalId': 'id',
	'fileHash': 'hash',
	'filePath': 'url',
	'file_hash': 'hash',
	'fname': 'file',
	'id': 'id',
	'infURL': 'url',
	'objURL': 'url',
	'smac': 'mac',
	'sproc': 'file',
	'signature': 'alert'
};

export const refTypes = {
	devicePayloadId: '?',
	dmac: 'dst',
	dvc_ip: 'device',
	'ext_ref': '?',
	'externalId': '?',
	'fileHash': 'payload',
	'filePath': 'payload',
	'file_hash': 'payload',
	'fname': 'payload',
	'id': '?',
	'infURL': '?',
	'objURL': '?',
	'smac': 'src',
	'sproc': 'src',
	'signature': 'payload'
}

export const product = "Web MPS";
export const productIdentifier = {
	product: "Web MPS",
	vendor: "FireEye"
};
export const fieldsBlacklist = [];
export const attributesBlacklist = _.range(0, 150).map((v) => `field${v}`);
export const entitiesBlacklist = defaultFields.filter((v) => desiredEntities.indexOf(v) === -1);