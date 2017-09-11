require('dotenv').config();

const {
  DBUSER,
  DBPASSWORD,
  DBHOST,
  DBPORT,
  DBNAME
} = process.env;

module.exports = {
  TEST: {
    client: 'postgresql',
    connection: `postgresql://${DBUSER}:${DBPASSWORD}@${DBHOST}:${DBPORT}/${DBNAME}-TEST`,
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  DEVELOPMENT: {
    client: 'postgresql',
    connection: `postgresql://${DBUSER}:${DBPASSWORD}@${DBHOST}:${DBPORT}/${DBNAME}`,
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  PRODUCTION: {
    client: 'postgresql',
    connection: `postgresql://${DBUSER}:${DBPASSWORD}@${DBHOST}:${DBPORT}/${DBNAME}`,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  }

};
