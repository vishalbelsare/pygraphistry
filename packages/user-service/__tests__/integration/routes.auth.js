const chai = require('chai');
const should = chai.should();
const config = require('../../knexfile')[process.env.NODE_ENV || 'DEVELOPMENT'];
const Knex = require('knex');

const routes = require('../../src/routes');
const { createServer } = require('microrouter-test-server');

const getConnection = () => Knex(config);

let server; 

beforeAll(async () => {
  const knex = getConnection();
  server = await createServer(routes);

  return knex.migrate.rollback()
    .then(() => knex.migrate.latest())
    .then(() => knex.seed.run())
    .then(() => knex.destroy());    
});
  
afterAll(async () => {
  server.destroy();
  const knex = getConnection();
  
  return knex.migrate.rollback()
    .then(() => knex.destroy());
});
  
test('POST / should create a new user', async () => {
  console.log('does this work?');
  const result = await server.post('/', {json: true, body: {username: 'username', password: 'foobar'}});
  expect(result).toEqual('username');
});
  