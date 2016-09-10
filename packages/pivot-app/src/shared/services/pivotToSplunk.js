export function pivotToSplunk(pivotDict) {
    var searchCriteria = pivotDict['Search'];
    return "search " + searchCriteria + " | fields * | head 500";
}
