const { send, json } = require('micro');
const bcrypt = require('bcryptjs');
const db = require('../database');

module.exports = async (req, res) => {
  const {username, password} = await json(req);
  const salt = bcrypt.genSaltSync();
  const hash = bcrypt.hashSync(password, salt);
  const user = await db
    .createUser(username, hash)
    .returning("username");
  
  send(res, 200, user);
}