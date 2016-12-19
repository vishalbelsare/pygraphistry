/*
 *
 * BITROTTEN AND BROKEN
 *
 *

import { SplunkPivot } from '../connectors/splunk.js';
import stringhash from 'string-hash';

const SPLUNK_INDICES = {
    HEALTH: 'index="health_demo"'
};

const HEALTH_FIELDS = [
    `PrimaryDiagnosisCode`,
    `PrimaryDiagnosisDescription`,
    `AdmissionID`,
    `LabName`,
    `PatientGender`,
    `PatientRace`,
    `PatientLanguage`,
    `PatientMaritalStatus`
];

const HEALTH_ATTRIBUTES = [
    `PatientID`,
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
            if (node.pointColor === undefined) {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
};


const SEARCH_SPLUNK_HEALTH = new SplunkPivot({
    attributes: HEALTH_ATTRIBUTES,
    connections: HEALTH_FIELDS,
    encodings: HEALTH_DEMO_ENCODINGS,
    kind: 'text',
    label: 'Query:',
    name: 'Search Splunk (health)',
    tags: ['HealthDemo'],

    toSplunk: function (pivotParameters) {
        return `search ${SPLUNK_INDICES.HEALTH} ${pivotParameters['input']} ${this.constructFieldString()}`
    }
});

const SEARCH_PATIENT = new SplunkPivot({
    attributes: HEALTH_ATTRIBUTES,
    connections: HEALTH_FIELDS,
    encodings: HEALTH_DEMO_ENCODINGS,
    kind: 'text',
    label: 'PatientID:',
    name: 'Search Patient',
    tags: ['HealthDemo'],

    toSplunk: function (pivotParameters) {
        return `search PatientID=${ pivotParameters['Search'] } ${SPLUNK_INDICES.HEALTH} ${this.constructFieldString()}`
    }

});

const SEARCH_LAB = new SplunkPivot({
    attributes: HEALTH_ATTRIBUTES,
    connections: HEALTH_FIELDS,
    encodings: HEALTH_DEMO_ENCODINGS,
    kind: 'text',
    label: 'LabName',
    name: 'Search Lab',
    tags: ['HealthDemo'],

    toSplunk: function (pivotParameters) {
        return `search LabName=${ pivotParameters['Search'] } ${SPLUNK_INDICES.HEALTH} ${this.constructFieldString()}`
    }

});

const PATIENT = new SplunkPivot({
    attributes: HEALTH_ATTRIBUTES,
    connection: HEALTH_FIELDS,
    encodings: HEALTH_DEMO_ENCODINGS,
    kind: 'button',
    label: 'Any Patient in:',
    name: 'Expand Patients',
    tags: ['HealthDemo'],

    toSplunk: function (pivotParameters, pivotCache) {
        const attribs = 'PatientID';
        const rawSearch =
            `[{{${pivotParameters['input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.HEALTH}]`;
        return `search ${this.expandTemplate(rawSearch, pivotCache)} ${this.constructFieldString()}`;
    },

});
*/
