function Graphistry (iframe) {
    this.iframe = iframe;
}

Graphistry.prototype.__transmitAction = function (msg) {
    msg.mode = 'graphistry-action';
    this.iframe.contentWindow.postMessage(msg, '*');
    return this;
}

Graphistry.prototype.__transmitActionStreamgl = function (msg) {
    msg.mode = 'graphistry-action-streamgl';
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



Graphistry.prototype.startClustering = function (duration) {
    return this.__transmitActionStreamgl({
        type: 'startClustering',
        args: [duration]});
}

Graphistry.prototype.stopClustering = function () {
    return this.__transmitActionStreamgl({type: 'stopClustering'});
}

/*
['text-color', 'background-color', 'transparency', 'show-labels', 'show-points-of-interest', 'tau',
'gravity', 'scalingRatio', 'edgeInfluence', 'strongGravity', 'dissuadeHubs', ' linLog']
*/
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