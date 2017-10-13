const getDatabaseConnection = require('@graphistry/db');
const bcrypt = require('bcryptjs');
const config = require('../../config');
const NODE_ENV = config.get('env');

const createUser = (username, password) =>
  new Promise((resolve, reject) => {
    const knex = getDatabaseConnection(NODE_ENV);

    const salt = bcrypt.genSaltSync();
    const hash = bcrypt.hashSync(password, salt);

    return knex
      .insert({ username, password: hash }, ['id', 'username', 'admin'])
      .into('users')
      .then(rows => knex.destroy() && resolve(rows[0]))
      .catch(e => knex.destroy() && reject(e));
  });

const getUserByUsername = username =>
  new Promise((resolve, reject) => {
    const knex = getDatabaseConnection(NODE_ENV);

    knex('users')
      .where({ username })
      .first()
      .then(user => knex.destroy() && resolve(user))
      .catch(e => knex.destroy && reject(e));
  });

const getUserById = id =>
  new Promise((resolve, reject) => {
    const knex = getDatabaseConnection(NODE_ENV);
    // TODO: can we do prepared statements with knex?
    return knex('users')
      .where({ id: parseInt(id) })
      .returning(['id', 'username', 'admin'])
      .then(user => {
        knex.destroy();
        const result = user[0];
        if (!result) {
          throw new Error('No user found with id ' + id);
        }
        return resolve(result);
      })
      .catch(e => knex.destroy() && reject(e));
  });

const updateUser = (id, user) =>
  new Promise((resolve, reject) => {
    const knex = getDatabaseConnection(NODE_ENV);

    knex('users')
      .where('id', '=', parseInt(id))
      .update(user, ['id', 'username'])
      .then(user => {
        knex.destroy();
        const result = user[0];
        if (!result) {
          throw new Error('No user found with id ' + id);
        }
        return resolve(result);
      })
      .catch(e => knex.destroy() && reject(e));
  });

module.exports = {
  createUser,
  getUserById,
  getUserByUsername,
  updateUser
};
