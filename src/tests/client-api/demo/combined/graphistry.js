function Graphistry (iframe) {
    this.iframe = iframe;
}

Graphistry.prototype.__transmit = function (msg) {
    msg.mode = 'graphistry-action';
    this.iframe.contentWindow.postMessage(msg, '*');
    return this;
}



//TODO really want to handle expr="point:degree < 5", not adding a filter
Graphistry.prototype.addFilter = function (expr) {
    return this.__transmit({
        type: 'add-expression',
        args: ["degree", "number", "point:degree"]});
};
//TODO really want something like
Graphistry.prototype.updateSetting = function (name, val) {
    return this.__transmit({type: 'set-control-value', args: {id: name, value: 10}})
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

