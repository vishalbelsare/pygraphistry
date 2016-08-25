'use strict';

const Rx      = require('rxjs');

const persist = require('./persist.js');

const WorkbookDocName = 'workbook.json';

function getBlankLegendTemplate() {
    return {
        title: undefined,
        subtitle: undefined,
        nodes: undefined,
        edges: undefined
    };
}

// Template for viewConfig
function getBlankViewTemplate() {
    return {
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
                        type: 'LimitExpression',
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
        legend: getBlankLegendTemplate()
    };
}

function getBlankWorkbookTemplate() {
    return {
        title: undefined,
        contentName: undefined,
        datasetReferences: {},
        views: {default: getBlankViewTemplate()},
        currentView: 'default'
    };
}

module.exports = {

    blankViewTemplate: getBlankViewTemplate(),
    blankLegendTemplate: getBlankLegendTemplate(),
    blankWorkbookTemplate: getBlankWorkbookTemplate(),

    getBlankViewTemplate: getBlankViewTemplate,
    getBlankLegendTemplate: getBlankLegendTemplate,
    getBlankWorkbookTemplate: getBlankWorkbookTemplate,

    loadDocument: function (workbookSpecifier) {
        var workbookRoot = new persist.ContentSchema().subSchemaForWorkbook(workbookSpecifier);
        return Rx.Observable.fromPromise(workbookRoot.get(WorkbookDocName)).map(function (data) {
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
