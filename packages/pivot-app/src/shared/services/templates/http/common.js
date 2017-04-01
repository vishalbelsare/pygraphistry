import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


export const PARAMETERS = [
    {
        name: 'endpoint',
        inputType: 'text',
        label: 'URL:',
        placeholder: 'http://'
    },
    {
        name: 'jq',
        inputType: 'text',
        label: 'Postprocess with jq:',
        placeholder: '.'
    },
    {
        name: 'nodes',
        inputType: 'multi',
        label: 'Nodes:',
        options: [],
    },
    {
        name: 'attributes',
        inputType: 'multi',
        label: 'Attributes:',
        options: [],
    }
];





////////////////////////////////////////////////////////////

import stringhash from 'string-hash';

const COLORS = {
    'Host': 0,
        'host': 0,
    'Internal IPs': 1,
        'ip': 1,
    'User': 2,
        'registry': 2,
        'cmd': 2,
        'user': 2,
    'External IPs': 6,
    'Fire Eye MD5': 4,
    'Message': 5,
        'alert': 5,
    'Fire Eye URL': 6,
        'site': 6,
        'domain': 6,
        'url': 6,
        'URL': 6,
        'correlated.0': 6,
        'correlated.1': 6,
        'correlated.2': 6,
        'correlated.3': 6,
        'correlated.4': 6,
        'correlated.5': 6,
        'correlated.6': 6,
        'correlated.7': 6,
        'correlated.8': 6,
        'correlated.9': 6,
        'correlated.10': 6,
    'EventID': 7,
    'Search': 8,
        'origin': 8

};

const SIZES = {
    'Host':1.0,
        'host':1.0,
    'Internal IPs':1.5,
        'ip': 1.5,
    'Fire Eye Source IP': 10.1,
    'External IPs':1.5,
    'User':0.5,
        'registry': 0.5,
        'cmd': 0.5,
        'user': 0.5,    
    //    'AV Alert Name':5.1,
    'Fire Eye MD5':10.1,
    //'Fire Eye Alert Name':10.1,
    'Fire Eye URL':2.1,
        'site': 2.1,
        'domain': 2.1,
        'url': 2.1,
        'URL': 2.1,
        'correlated.0': 2.1,
        'correlated.1': 2.1,
        'correlated.2': 2.1,
        'correlated.3': 2.1,
        'correlated.4': 2.1,
        'correlated.5': 2.1,
        'correlated.6': 2.1,
        'correlated.7': 2.1,
        'correlated.8': 2.1,
        'correlated.9': 2.1,
        'correlated.10': 2.1,
    'Message': 7.1,
        'alert': 7.1,
    'EventID':0.1,
    'Search': 1,
        'origin': 1

};


const ICONS = {
    'Host': 'globe',
        'host': 'globe',
    'Internal IPs': 'laptop',
        'ip': 'laptop',
    'User': 'user',
        'user': 'user',
        'registry': 'file',
        'cmd': 'file',
    'External IPs': 'user-secret',
    'Fire Eye MD5': 'hashtag',
    'Message': 'bell',
        'alert': 'bell',
    'Fire Eye URL': 'globe',
        'site': 'globe',
        'domain': 'globe',
        'url': 'globe',
        'URL': 'globe',
        'correlated.0': 'globe',
        'correlated.1': 'globe',
        'correlated.2': 'globe',
        'correlated.3': 'globe',
        'correlated.4': 'globe',
        'correlated.5': 'globe',
        'correlated.6': 'globe',
        'correlated.7': 'globe',
        'correlated.8': 'globe',
        'correlated.9': 'globe',
        'correlated.10': 'globe',
    'EventID': 'exclamation-circle',
    'Search': 'search',
        'origin': 'table'
};




export const demoEncodings = {
    point: {
        pointColor: function(node) {
            node.pointColor = COLORS[node.type];
            if (node.pointColor === undefined) {
                node.pointColor = stringhash(node.type) % 12;
            }
        },
        pointSizes: function(node) {
            node.pointSize = SIZES[node.type];
            if (node.pointSize === undefined) {
                node.pointSize = 0.5;
            }
        },
        pointIcon: function (node) {
            node.pointIcon = ICONS[node.type];
            if (node.pointIcon === undefined) {
                node.pointIcon = 'fw';
            }
        }
    }
};
