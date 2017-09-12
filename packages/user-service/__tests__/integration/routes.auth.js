require('dotenv').config();
const chai = require('chai');
const should = chai.should();
const routes = require('../../src/routing');
const { router } = require('microrouter');
const getConnection = require('../../src/database');
const micro = require('micro');
const request = require('request');
const rp = require('request-promise');
const listen = require('test-listen');

describe('Route integration test', () => {
  let server, url;
  
  beforeAll(async done => {
    server = await micro(router.apply(this, routes));
    url = await listen(server);
    done();
  });

  beforeEach(async done => {
    const knex = getConnection();
    return knex.migrate.rollback()
      .then(() => knex.migrate.latest())
      .then(() => knex.seed.run())
      .then(() => knex.destroy())
      .then(() => done());
  });

  afterEach(async done => {
    const knex = getConnection();    
    return knex.migrate.rollback()
      .then(() => knex.destroy())
      .then(() => done());
  });
  
  describe('POST /', async () => {
    it('should create a new user', async () => {
      const result = await rp({
        method: 'post', 
        json: true, 
        uri: `${url}/`,
        body: {username: 'Jorge Borges', password: 'foobar'}
      });
      
      expect(result.username).toEqual('Jorge Borges');
      expect(result.id).toEqual(2);      
    });
  });

  describe('GET /', async () => {

  });

  describe('GET /:id', async () => {
    it('should return the user with the provided ID', async () => {
      const userById = await rp(`${url}/1`).then(JSON.parse);
        
      expect(userById.username).toBe('myk');
      expect(userById.id).toBe(1);
    });
  });

  describe('PUT /:id', async () => {
    it('should update the user with the provided ID with new data', async () => {
      const initialRequest = await rp({
        method: 'put', 
        uri: `${url}/1`, 
        json: true, 
        body: { username: 'mykola' }
      });

      expect(initialRequest.id).toBe(1);
      expect(initialRequest.username).toBe('mykola');

      const updatedUser = await rp(`${url}/1`).then(JSON.parse);
  
      expect(updatedUser.id).toBe(1);
      expect(updatedUser.username).toBe('mykola');
    })
  });

  describe('POST /login', async () => {

  });

  describe('POST /logout', async () => {

  });
});
