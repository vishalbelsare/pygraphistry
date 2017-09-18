const configOptions = require('../../knexfile');
const Knex = require('knex');

module.exports = (env = process.env.NODE_ENV) => {
  const config = configOptions[env];
  return Knex(config);
}