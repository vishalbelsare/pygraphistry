const { send } = require('micro');
const { getUserById } = require('../services/user')

module.exports = async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    send(res, 200, user);
  } catch(e) {
    send(res, 400, {error: e.message});
  }
}