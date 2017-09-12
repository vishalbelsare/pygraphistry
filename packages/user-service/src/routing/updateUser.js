const { send, json } = require('micro');
const db = require('../database');
const { updateUser } = require('../services/user')

module.exports = async (req, res) => {
  try {
    const user = await json(req);
    const result = await updateUser(req.params.id, user);
    send(res, 200, result);
  } catch (e) {
    send(res, 400, {error: e.message});
  }
}