const visualize = require('micro-visualize');
const microCors = require('micro-cors');
const cors = microCors({ allowMethods: ['GET'] });

const { send } = require('micro');
const { getUserById } = require('../services/user');

module.exports = visualize(
    cors(async (req, res) => {
        try {
            const user = await getUserById(req.params.id);
            send(res, 200, user);
        } catch (e) {
            send(res, 400, { error: e.message });
        }
    }),
    process.env.NODE_ENV === 'development' ? 'dev' : ''
);
