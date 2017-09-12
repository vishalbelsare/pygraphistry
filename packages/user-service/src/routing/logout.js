const { send, json } = require('micro');
const db = require('../database');

module.exports = async (req, res) => {
  const result = await db.logout();
  send(res, 200, result);
}