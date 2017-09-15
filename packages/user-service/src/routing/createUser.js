const { send, json } = require('micro');
const bcrypt = require('bcryptjs');
const { createUser } = require('../services/user')
const visualize = require('micro-visualize');
const microCors = require('micro-cors')
const cors = microCors({ allowMethods: ['POST'] })

module.exports = visualize(cors(async (req, res) => {
  try {
    const {username, password} = await json(req);
    const salt = bcrypt.genSaltSync();
    const hash = bcrypt.hashSync(password, salt);
    const user = await createUser(username, hash);
    
    send(res, 200, user);
  } catch (e) {
    send(res, 500, {error: e.message});
  }
}), process.env.NODE_ENV === "DEVELOPMENT" ? "dev" : "");