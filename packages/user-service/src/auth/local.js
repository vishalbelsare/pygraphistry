require('dotenv').config();
const moment = require('moment');
const jwt = require('jsonwebtoken');
const SECRET = process.env.GRAPHISTRY_SECRET;

const encodeToken = user => jwt.sign({ data: user.id }, SECRET, { expiresIn: '1h' });

const decodeToken = (token, callback) => {
  const payload = jwt.verify(token, process.env.GRAPHISTRY_SECRET);
  const now = moment().unix();
  // check if the token has expired
  if (now > payload.exp) callback('Token has expired.');
  else callback(null, payload);
}

module.exports = {
  encodeToken,
  decodeToken
};