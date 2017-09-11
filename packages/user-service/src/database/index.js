const config = require('../../knexfile')[process.env.NODE_ENV || 'DEVELOPMENT'];
const Knex = require('knex');

const getConnection = () => Knex(config);

const createUser = (username, password) => new Promise((resolve, reject) => {
  const knex = getConnection();
  return knex.insert({ user_name: username, password: password })
    .into('users')
    .returning('username, admin')
    .then(row => knex.destroy() && resolve(row))
    .catch(e => knex.destroy() && reject(e));
});

const getCurrentUser = () => new Promise((resolve, reject) => {
  
});

const getUserById = id => new Promise((resolve, reject) => {
  const knex = getConnection();
  return knex('users')
    .where({
      id: parseInt(id)
    })
    .then(user => knex.destroy() && resolve(user[0]))
    .catch(e => knex.destroy() && reject(e));
});

const login = (username, password) => new Promise((resolve, reject) => {

});

const logout = () => new Promise((resolve, reject) => {

});

const updateUser = (id, user) => new Promise((resolve, reject) => {

});

module.exports = {
  getConnection,
  getUserById,
  getCurrentUser,
  createUser,
  login,
  logout,
  updateUser
};