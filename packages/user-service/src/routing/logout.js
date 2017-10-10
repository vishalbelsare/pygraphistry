const { send, json } = require('micro');
const visualize = require('micro-visualize');
const microCors = require('micro-cors');
const cors = microCors({ allowMethods: ['POST'] });
const { logout } = require('../services/session');

module.exports = visualize(
  cors(async (req, res) => {
    const token = req.headers.cookie.split('session=')[1];
    try {
      await logout(token);
      res.clearCookie('session');
      send(res, 200);
    } catch (e) {
      send(res, 500, e.message);
    }
  }),
  process.env.NODE_ENV === 'development' ? 'dev' : ''
);
