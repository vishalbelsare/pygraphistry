export const SEARCH_PIVOT = 'search-pivot';
export const SPLICE_PIVOT = 'splice-pivot';
export const INSERT_PIVOT = 'insert-pivot';
export const GRAPH_INVESTIGATION = 'graph-investigation';
export const DISMISS_ALERT = 'dismiss-alert';

export const searchPivot = ({ index, investigationId }) => {
    return ({
        investigationId, index, type: SEARCH_PIVOT
    });
};

export const splicePivot = ({ index }) => {
    return ({
        index, type: SPLICE_PIVOT
    });
};

export const insertPivot = ({ index }) => {
    return ({
        index, type: INSERT_PIVOT
    });
};

export const graphInvestigation = ({ length, investigationId }) => {
    return ({
        investigationId, length, type: GRAPH_INVESTIGATION
    });
};

export const dismissAlert = () => {
    return ({
        type: DISMISS_ALERT
    });
}
