function pivotToSplunk(pivotDict) {
    return "search * | head 10";
}

module.exports = {
    pivotToSplunk: pivotToSplunk
}
