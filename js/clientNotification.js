'use strict';

function loadingStatus(socket, message, percentage) {
    var payload = {
        message: message,
        percentage: percentage
    };

    console.log('UPDATING LOADINGSTATUS: ', message);
    socket.emit('update_loading_status', payload);
}

module.exports = {
    loadingStatus: loadingStatus
};
