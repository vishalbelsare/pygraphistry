import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:server:vbos');

function configureVBOsHandler(app, getSocket, vbosByClientId) {
    return function vbosHandler(req, res) {

        let buffer, buffers;
        const socket = getSocket();
        const { query: { buffer: bufferName }} = req;

        if (!bufferName) {
            logger.info('Failed to specify vbo in query');
            return res.status(404).send();
        } else if (!req.query.id) {
            logger.info('Failed to specify id in query');
            return res.status(404).send();
        } else if (!(buffers = vbosByClientId[req.query.id])) {
            logger.info('No vbos for client "%s"', req.query.id);
            return res.status(404).send();
        } else if (!(buffer = buffers[bufferName])) {
            logger.info('"%s" is not a buffer name', bufferName);
            return res.status(404).send();
        } else if (!socket || req.query.id !== socket.client.id) {
            logger.info('Not authorized to get "%s" buffer', bufferName);
            return res.status(401).send();
        }

        logger.info('HTTP GET request for vbo %s', bufferName);

        // performance monitor here?
        // profiling.debug('VBO request');

        const bufferTransferFinisher = app.bufferTransferFinisher;

        try {
            res.set('Content-Encoding', 'gzip').status(200).send(buffer);//.send();
            if (bufferTransferFinisher) {
                bufferTransferFinisher(bufferName);
            }
        } catch (err) {
            logger.error(err, 'bad /vbo request');
            res.status(502).send('Internal server error');
        }
    }
}

export { configureVBOsHandler };
export default configureVBOsHandler;
