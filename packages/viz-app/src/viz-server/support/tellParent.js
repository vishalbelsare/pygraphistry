/**
 * Sends a message to the parent process this process was forked from, should one exist
 * @param  {string} message - The message to send (should be a unique identifier).
 * @param  {object} payload - Additional data to include with your message
 */
export function tellParent(message, payload) {
    if(typeof process.send !== 'function') {
        return;
    }

    payload = payload || {};

    process.send({
        message: message,
        payload: payload
    });
}
