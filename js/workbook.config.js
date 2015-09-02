'use strict';



module.exports = {
    loadDocument: function (workbookSpecifier) {
        var url = urllib.parse(workbookSpecifier);

    },
    /** Describes URL parameters that can persist across save/reload instead of just override per view: */
    URLParamsThatPersist: ['dataset', 'datasetname', 'layout', 'controls']
};
