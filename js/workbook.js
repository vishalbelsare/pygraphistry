'use strict';

var path    = require('path');
var Rx      = require('rx');

var persist     = require('./persist.js');

var WorkbookDocName = 'workbook.json';

var blankLegendTemplate = {
    title: undefined,
    subtitle: undefined,
    nodes: undefined,
    edges: undefined
};

// Template for viewConfig
var blankViewTemplate = {
    title: undefined,
    exclusions: [],
    filters: [
        // nodes/edges limited per client render estimate:
        {
            title: 'Point Limit',
            attribute: undefined,
            level: 'system',
            query: {
                type: 'point',
                ast: {
                    type: 'Limit',
                    value: {
                        type: 'Literal',
                        dataType: 'integer',
                        value: 8e5
                    }
                },
                inputString: 'LIMIT 800000'
            }
        }
    ],
    sets: [
        {
            id: 'dataframe',
            level: 'system',
            title: 'Loaded'
        },
        {
            id: 'filtered',
            level: 'system',
            title: 'Filtered'
        },
        {
            id: 'selection',
            level: 'system',
            title: 'Selected'
        }
    ],
    parameters: {
    },
    legend: blankLegendTemplate
};

var blankWorkbookTemplate = {
    title: undefined,
    contentName: undefined,
    datasetReferences: {},
    views: {default: blankViewTemplate},
    currentView: 'default'
};

module.exports = {
    blankViewTemplate: blankViewTemplate,
    blankWorkbookTemplate: blankWorkbookTemplate,
    loadDocument: function (workbookSpecifier) {
        var workbookRoot = new persist.ContentSchema().subSchemaForWorkbook(workbookSpecifier);
        return Rx.Observable.fromPromise(workbookRoot.download(WorkbookDocName)).map(function (data) {
            return JSON.parse(data);
        });
    },
    saveDocument: function (workbookSpecifier, workbookDoc) {
        var workbookRoot = new persist.ContentSchema().subSchemaForWorkbook(workbookSpecifier);
        return workbookRoot.uploadToS3(WorkbookDocName, JSON.stringify(workbookDoc));
    },
    /** Describes URL parameters that can persist across save/reload instead of just override per view: */
    URLParamsThatPersist: ['dataset', 'datasetname', 'layout', 'scene', 'controls', 'mapper', 'device']
};
