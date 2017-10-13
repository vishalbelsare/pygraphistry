const configOptions = require('./knexfile');
const Knex = require('knex');

const verifyEnv = env => env === 'test' || env === 'development' || env === 'production';

module.exports = env => {
  if (!verifyEnv(env)) {
    throw new Error(
      `You must pass either "development", "production" or "test" as the argument to this function.`
    );
  }
  const config = configOptions[env];
  return Knex(config);
};
