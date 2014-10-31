var debug   = require('debug')('uber:main'),
    Rx      = require('rx');

function init (client) {

    //trigger animation on server
    client.socket.emit('graph_settings', {});


/*
    $(".dropdown-menu li a").click(function(){
        var opt = $(this).text();
        $(this).parents(".btn-group").find('.selection')
            .text(opt)
            .val(opt);
    });
*/

    //TODO try/catch because sc.html does not have tooltip
    try {
        $('#refresh')
            .tooltip()
            .on('click', function () {
                debug('reset_graph')
                client.socket.emit('reset_graph', {}, function () {
                    debug('page refresh');
                    window.location.reload();
                });
            });
    } catch (e) {

    }


    var elts = {
        nodeSlider: 'charge',
        edgeStrengthSlider: 'edgeStrength',
        edgeDistSlider: 'edgeDistance',
        gravitySlider: 'gravity'
    };

    $('.menu-slider').each(function () {

        var $this = $(this);

        $(this).slider();

        var name = elts[this.id];

        //send to server
        Rx.Observable
            .fromEvent($(this), 'slide')
            .sample(10)
            .distinctUntilChanged(function () {
                return $this.slider('getValue');
            })
            .subscribe(function () {
                var v = $this.slider('getValue');
                var val = (v < 0 ? -1 : 1) * Math.sqrt(Math.abs(v))/1000;
                var payload = {};
                payload[name] = val;

                client.socket.emit('graph_settings', payload);
                debug('settings', payload);

            });

    });


}


module.exports = init;