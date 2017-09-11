const { send, json } = require('micro');
const db = require('../database');

module.exports = async (req, res) => {
  try {
    const user = await json(req);
    const result = await db.updateUser(req.params.id, user);
  } catch (e) {
    send(res, 400, e.message);
  }
}