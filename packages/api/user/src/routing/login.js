const { send, json } = require('micro');
const { getUserByUsername, passwordIsValid } = require('../services/user');
const { login } = require('../services/session');

const visualize = require('micro-visualize');
const microCors = require('micro-cors');
const cors = microCors({ allowMethods: ['POST'] });
const Cookie = require('tough-cookie').Cookie;

module.exports = visualize(
  cors(async (req, res) => {
    const { username, password } = await json(req);
    try {
      const token = await login(username, password);
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly;`);

      send(res, 200);
    } catch (e) {
      send(res, 400, e.message);
    }
  }),
  process.env.NODE_ENV === 'development' ? 'dev' : ''
);
