function pivotToSplunk(pivotDict) {
    var searchCriteria = pivotDict['Search'];
    return "search " + searchCriteria + " | head 1000";
}

module.exports = {
    pivotToSplunk: pivotToSplunk
}
