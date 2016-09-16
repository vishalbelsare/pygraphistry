import { expandTemplate, constructFieldString } from '../services/support/splunkMacros.js';

const SPLUNK_INDICES = {
        HEALTH: 'index="health_demo"'
};
const HEALTH_FIELDS = [
    `PatientID`,
    `PrimaryDiagnosisCode`,
    `PrimaryDiagnosisDescription`,
    `AdmissionID`,
    `LabName`,
    `PatientGender`,
    `PatientRace`,
    `PatientLanguage`,
    `PatientMaritalStatus`
];
//TODO update shapeSplunkResults and searchSplunk to use these
const HEALTH_ATTRIBUTES = [
    `LabDateTime`,
    `LabValue`,
    `LabUnits`,
    `AdmissionEndDate`,
    `AdmissionStartDate`,
    `PatientDateOfBirth`,
    `PatientPopulationPercentageBelowPoverty`
];

const HEALTH_DEMO_NODE_COLORS = {
    'PatientID': 0,
    'PrimaryDiagnosisCode': 1,
    'PrimaryDiagnosisDescription': 2,
    'AdmissionID': 3,
    'LabName': 4,
    'PatientGender': 5,
    'PatientRace': 6,
    'PatientLanguage': 7,
    'PatientMaritalStatus': 8,
    'EventID': 9
};
const HEALTH_DEMO_ENCODINGS = {
    point: {
        pointColor: function(node) {
            node.pointColor = HEALTH_DEMO_NODE_COLORS[node.type];
        }
    }
};

const SEARCH_SPLUNK_HEALTH = {
    name: 'Search Splunk (health)',
    label: 'Query:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.HEALTH} ${fields['Search']} ${constructFieldString(this)}`
        },
        fields: HEALTH_FIELDS,
        encodings: HEALTH_DEMO_ENCODINGS,
        attributes: HEALTH_ATTRIBUTES
    }
};


const SEARCH_PATIENT = {
    name: 'Search Patient',
    label: 'PatientID:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `search PatientID=${ fields['Search'] } ${SPLUNK_INDICES.HEALTH} ${constructFieldString(this)}`
        },
        fields: HEALTH_FIELDS,
        encodings: HEALTH_DEMO_ENCODINGS,
        attributes: HEALTH_ATTRIBUTES
    }
};

const SEARCH_LAB = {
    name: 'Search Lab',
    label: 'LabName',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `search LabName=${ fields['Search'] } ${SPLUNK_INDICES.HEALTH} ${constructFieldString(this)}`
        },
        fields: HEALTH_FIELDS,
        encodings: HEALTH_DEMO_ENCODINGS,
        attributes: HEALTH_ATTRIBUTES
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
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this)}`;
        },
        fields: HEALTH_FIELDS,
        encodings: HEALTH_DEMO_ENCODINGS,
        attributes: HEALTH_ATTRIBUTES
    }
};


export default [
    SEARCH_SPLUNK_HEALTH, SEARCH_PATIENT, SEARCH_LAB, PATIENT
];