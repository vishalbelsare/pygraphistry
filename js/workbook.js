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

var blankViewTemplate = {
    title: undefined,
    filters: [],
    sets: [
        {
            id: 'dataframe',
            type: 'system',
            title: 'Loaded Data'
        },
        {
            id: 'filtered',
            type: 'system',
            title: 'Visible Data'
        },
        {
            id: 'selection',
            type: 'system',
            title: 'Selected Data'
        }
    ],
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
