function Graphistry (iframe) {
    this.iframe = iframe;
}
Graphistry.prototype.addFilter = function (expression) {

    this.iframe.contentWindow.postMessage({type: 'falcor-update', values: [
        { path: ['filters', 'controls', 0, 'selected'], value: true },
        { path: ['scene', 'controls', 1, 'selected'], value: false },
        { path: ['labels', 'controls', 0, 'selected'], value: false },
        { path: ['layout', 'controls', 0, 'selected'], value: false },
        { path: ['exclusions', 'controls', 0, 'selected'], value: false },
        { path: ['panels', 'left'], value: { $type: 'ref', value: ['filters'] } }
    ]}, '*')

};

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
        iframe.contentWindow.postMessage({'graphistry': 'init'}, '*');
    } catch (e) {
        console.error('Graphistry Load Exception', e);
    }

}

