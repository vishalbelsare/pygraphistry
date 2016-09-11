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
            return `${fields['Search']} ${SPLUNK_INDICES.HEALTH}`
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

export default [
    SEARCH_SPLUNK_HEALTH, SEARCH_PATIENT, SEARCH_LAB
];