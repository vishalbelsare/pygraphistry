## User Service
This service was built using `micro` from zeit as well as `knex` for database access. `micro-router` parses incoming requests and routes them to the correct handler.

Unit tests run against specific functions, and integration tests run against a database instance to verify that endpoints work as expected.

`npm install` will install dependencies, `npm start` will start the service within a `pm2` context. `npm run restart` will restart the `pm2` service. `npm run dev` will start the service without using `pm2`. `npm run test` will run both unit and integration tests.

This service really does two things, at a high level:
  1. It supports CRUD operations for users,
  2. It enables session support, using a sessions table. It's possible these services should be decoupled.

### Database Migrations and Seed Data
Migrations and Seeds handled gracefully. See the `migrations/` and `seeds/` folder, respectively, for examples. To create new migrations, do `npm run migrate:make`. To run the latest migrations, do `npm run migrate:latest`.