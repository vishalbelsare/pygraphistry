function Graphistry (iframe) {
    this.iframe = iframe;
}

// ===================== Non-Falcor APIs
Graphistry.prototype.__transmitActionStreamgl = function (msg) {
    msg.mode = 'graphistry-action-streamgl';
    msg.tag = '' + Math.random();
    console.log('parent posting', msg, this.iframe.contentWindow);
    this.iframe.contentWindow.postMessage(msg, '*');
    return this;
};

Graphistry.prototype.startClustering = function (milliseconds) {
    return this.__transmitActionStreamgl({type: 'startClustering', args: {duration: milliseconds || 0}});
};

Graphistry.prototype.stopClustering = function () {
    return this.__transmitActionStreamgl({type: 'stopClustering'});
};

Graphistry.prototype.autocenter = function (percentile) {
    return this.__transmitActionStreamgl({type: 'autocenter', args: {percentile: percentile || 0}});
};

Graphistry.prototype.saveWorkbook = function () {
    return this.__transmitActionStreamgl({type: 'saveWorkbook'});
};

Graphistry.prototype.exportStatic = function (name) {
    return this.__transmitActionStreamgl({type: 'exportStatic', args: {name: name}});
};


// ===================== Falcor
Graphistry.prototype.__transmitAction = function (msg) {
    msg.mode = 'graphistry-action';
    msg.tag = '' + Math.random();
    this.iframe.contentWindow.postMessage(msg, '*');
    return this;
}
Graphistry.prototype.addFilter = function (expr) {
    return this.__transmitAction({
        type: 'add-expression',
        args: ["degree", "number", "point:degree"]});
};
Graphistry.prototype.addExclusion = function (expr) {
    return this.__transmitAction({
        type: 'add-expression',
        args: ["degree", "number", "point:degree"]});
};

Graphistry.prototype.updateEncoding = function (entityType, encodingAttribute, encodingMode, dataAttribute) {
    console.warn('update-encoding is not a known encoding falcor action');
    return this.__transmitAction({
        type: 'update-encoding',
        args: [entityType, encodingAttribute, encodingMode, dataAttribute]});
}


Graphistry.prototype.updateSetting = function (name, val) {
    return this.__transmitAction({type: 'set-control-value', args: {id: name, value: val}})
}


function GraphistryLoader (iframe, cb) {

    cb = cb || function () {}

    try {
        if (!iframe) throw new Error("No iframe provided to Graphistry");

        var responded = false;
        var graphistryInit = function (event){
            if (event.data && event.data.graphistry === 'init' && !responded) {
                responded = true;
                cb(null, new Graphistry(iframe));
                iframe.removeEventListener('message', graphistryInit, false);
            }
        };
        window.addEventListener('message', graphistryInit, false);

        setTimeout(function () {
            if (!responded) {
                console.warn("Graphistry slow to respond, if at all");
            }
        }, 3000);

        //trigger hello if missed initial one
        iframe.contentWindow.postMessage({
                'graphistry': 'init',
                'agent': 'graphistryjs',
                'version': '0.0.0'
            }, '*');

    } catch (e) {
        console.error('Graphistry Load Exception', e);
    }

}