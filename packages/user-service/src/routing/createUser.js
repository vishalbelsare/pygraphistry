const { send, json } = require('micro');
const bcrypt = require('bcryptjs');
const { createUser } = require('../services/user')

module.exports = async (req, res) => {
  try {
    const {username, password} = await json(req);
    const salt = bcrypt.genSaltSync();
    const hash = bcrypt.hashSync(password, salt);
    const user = await createUser(username, hash);
    
    send(res, 200, user);
  } catch (e) {
    send(res, 500, {error: e.message});
  }
}