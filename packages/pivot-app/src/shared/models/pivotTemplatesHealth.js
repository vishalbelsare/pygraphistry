import { expandTemplate } from '../services/support/splunkMacros.js';

const SPLUNK_INDICES = {
        HEALTH: 'index="health_demo"'
};

const SEARCH_SPLUNK_HEALTH = {
    name: 'Search Splunk (health)',
    label: 'Query:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `${SPLUNK_INDICES.HEALTH} ${fields['Search']}`
        }
    }
};


const SEARCH_PATIENT = {
    name: 'Search Patient',
    label: 'PatientID:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `PatientID=${ fields['Search'] } ${SPLUNK_INDICES.HEALTH}`
        }
    }
};

const SEARCH_LAB = {
    name: 'Search Lab',
    label: 'LabName',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `LabName=${ fields['Search'] } ${SPLUNK_INDICES.HEALTH}`
        }
    }
};

const PATIENT = {
    name: 'Expand Patients',
    label: 'Any Patient in:',
    kind: 'button',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            const attribs = 'PatientID';
            const rawSearch =
                `[{{${fields['Input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.HEALTH}]`;
            return expandTemplate(rawSearch, pivotCache);
        }
    }
};


export default [
    SEARCH_SPLUNK_HEALTH, SEARCH_PATIENT, SEARCH_LAB, PATIENT
];