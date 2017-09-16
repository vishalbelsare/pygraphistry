const { send, json } = require('micro');
const visualize = require('micro-visualize');
const microCors = require('micro-cors')
const cors = microCors({ allowMethods: ['POST'] })
const { getCurrentUser } = require('../services/session');

module.exports = visualize(cors(async (req, res) => {
  const token = req.headers.cookie.split('session=')[1];
  try {
    const user = await getCurrentUser(token);
    send(res, 200, user);
  } catch (e) {
    send(res, 500, e.message);
  }

}), process.env.NODE_ENV === "development" ? "dev" : "");