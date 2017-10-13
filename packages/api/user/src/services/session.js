const getDatabaseConnection = require('@graphistry/db');
const config = require('../../config');
const { getUserByUsername, getUserById } = require('./user');
const bcrypt = require('bcryptjs');
const uuid = require('uuid');

const NODE_ENV = config.get('env');

const passwordIsValid = (userPassword, databasePassword) =>
    bcrypt.compareSync(userPassword, databasePassword);

const getCurrentUser = session_id =>
    new Promise(async (resolve, reject) => {
        const knex = getDatabaseConnection(NODE_ENV);
        const session = await knex('sessions')
            .where('session_id', '=', session_id)
            .first()
            .catch(e => reject(e));

        if (!session) {
            return reject(new Error(`No such session found: ${session_id}`));
        }

        const user_id = session.id;

        if (!user_id) {
            return reject(new Error('Session has no user - weird.'));
        }

        const user = await getUserById(user_id);

        if (!user) {
            return reject(new Error(`No user exists with the id ${user_id}`));
        }
        delete user.password;
        knex.destroy();
        resolve(user);
    });

const login = (username, password) =>
    new Promise(async (resolve, reject) => {
        const user = await getUserByUsername(username)
            .then(user => {
                if (passwordIsValid(password, user.password)) {
                    return user;
                }

                return null;
            })
            .catch(e => reject(e));

        if (!user) {
            return reject(new Error('Invalid password!'));
        }

        const token = uuid.v4();
        const knex = getDatabaseConnection(NODE_ENV);
        knex
            .insert({ user_id: user.id, session_id: token }, 'session_id')
            .into('sessions')
            .then(rows => knex.destroy() && resolve(rows[0]))
            .catch(e => knex.destroy() && reject(e));
    });

const logout = token =>
    new Promise((resolve, reject) => {
        const knex = getDatabaseConnection(NODE_ENV);
        knex('sessions')
            .where('session_id', '=', token)
            .del()
            .then(() => knex.destroy() && resolve())
            .catch(e => knex.destroy() && reject(e));
    });

module.exports = {
    login,
    logout,
    getCurrentUser
};
