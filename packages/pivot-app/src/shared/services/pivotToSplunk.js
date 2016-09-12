export function pivotToSplunk(pivotDict) {
    var searchCriteria = pivotDict['Search'];
    if (searchCriteria.indexOf(' fields ') === -1) {
        searchCriteria += ' | fields * ';
    }
    if (searchCriteria.indexOf(' head ') === -1) {
        searchCriteria += ' | head 1000';
    }
    return "search " + searchCriteria;
}
