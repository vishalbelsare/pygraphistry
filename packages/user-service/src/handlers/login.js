const { send, json } = require('micro');
const db = require('../database');

module.exports = async (req, res) => {
  const {username, password} = await json(req);
  const user = await db.login(username, password);
  if (user) {
    delete user.password;
    send(res, 200, user);
  } else {
    send(res, 400, 'invalid login');
  }
}