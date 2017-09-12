const getDatabaseConnection = require('../database');

const createUser = (username, password) => new Promise((resolve, reject) => {
  const knex = getDatabaseConnection();
  return knex.insert({ username: username, password: password }, ['id', 'username', 'admin'])
    .into('users')
    .then(rows => knex.destroy() && resolve(rows[0]))
    .catch(e => knex.destroy() && reject(e));
});

const getUserById = id => new Promise((resolve, reject) => {
  const knex = getDatabaseConnection();

  return knex('users')
    .where({ id: parseInt(id) })
    .returning(['id', 'username', 'admin'])
    .then(user => {
      knex.destroy();
      const result = user[0];
      if (!result) {
        throw new Error("No user found with id " + id);
      }
      return resolve(result)
    })
    .catch(e => knex.destroy() && reject(e));
});


const updateUser = (id, user) => new Promise((resolve, reject) => {
  const knex = getDatabaseConnection();

  knex('users')
    .where('id', '=', parseInt(id))
    .update(user, ['id', 'username'])
    .then(user => {
      knex.destroy();
      const result = user[0];
      if (!result) {
        throw new Error("No user found with id " + id);
      }
      return resolve(result)
    })
});

module.exports = {
  createUser,
  getUserById,
  updateUser
};