const { send, json } = require('micro');
const { updateUser } = require('../services/user');
const visualize = require('micro-visualize');
const microCors = require('micro-cors');
const cors = microCors({ allowMethods: ['PUT'] });

module.exports = visualize(
  cors(async (req, res) => {
    try {
      const user = await json(req);
      const result = await updateUser(req.params.id, user);
      send(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  }),
  process.env.NODE_ENV === 'development' ? 'dev' : ''
);
