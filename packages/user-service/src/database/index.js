const getConfig = require('../../knexfile');
const Knex = require('knex');

module.exports = (env = process.env.NODE_ENV) => {
  const config = getConfig(env);
  return Knex(config);
}