const { send } = require('micro');
const db = require('../database');

module.exports = async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    send(res, 200, user);
  } catch(e) {
    send(res, 400, e.message);
  }
}