const { createUser, getCurrentUser, getUserById, login, logout, updateUser } = require('./handlers');
const {get, post, put} = require("microrouter");

module.exports = [
  post('/', createUser),
  get('/', getCurrentUser),
  get('/:id', getUserById),
  put('/:id', updateUser),
  post('/login', login),
  post('/logout', logout)
];