const config = require('./config');

const Path = require('path');
const { username, password, dbname, host, port } = config.get('db');
const migrationDirectory = Path.join(__dirname, 'migrations');
const seedDirectory = Path.join(__dirname, 'seeds');

const configurations = {
    test: {
        client: 'postgresql',
        connection: `postgresql://${username}:${password}@${host}:${port}/${dbname}`,
        migrations: {
            tableName: 'knex_migrations',
            directory: migrationDirectory
        },
        seeds: {
            directory: seedDirectory
        }
    },

    development: {
        client: 'postgresql',
        connection: `postgresql://${username}:${password}@${host}:${port}/${dbname}`,
        migrations: {
            tableName: 'knex_migrations',
            directory: migrationDirectory
        },
        seeds: {
            directory: seedDirectory
        }
    },

    production: {
        client: 'postgresql',
        connection: `postgresql://${username}:${password}@${host}:${port}/${dbname}`,
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            tableName: 'knex_migrations'
        }
    }
};

module.exports = configurations;
