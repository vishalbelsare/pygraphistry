export const SEARCH_PIVOT = 'search-pivot';
export const SPLICE_PIVOT = 'splice-pivot';
export const INSERT_PIVOT = 'insert-pivot';
export const PLAY_INVESTIGATION = 'play-investigation';

export const searchPivot = ({index}) => {
    return ({
        index, type: SEARCH_PIVOT
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

export const playInvestigation = ({ index }) => {
    return ({
        index, type: PLAY_INVESTIGATION
    });
};

