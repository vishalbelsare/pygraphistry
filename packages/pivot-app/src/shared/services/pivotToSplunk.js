function pivotToSplunk(pivotDict) {
    var searchCriteria = pivotDict['Search'];
    return "search " + searchCriteria + " | head 500";
}

module.exports = {
    pivotToSplunk: pivotToSplunk
}
