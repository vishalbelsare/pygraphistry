export function pivotToSplunk(pivotDict) {
    var searchCriteria = pivotDict['Search'];
    return "search " + searchCriteria + " | head 500";
}
