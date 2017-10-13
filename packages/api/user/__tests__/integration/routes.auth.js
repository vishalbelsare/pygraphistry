const chai = require('chai');
const should = chai.should();
const routes = require('../../src/routing');
const { router } = require('microrouter');
const getConnection = require('@graphistry/db');
const micro = require('micro');
const request = require('request');
const rp = require('request-promise');
const listen = require('test-listen');

const Cookie = require('tough-cookie').Cookie;

describe('Route integration test', () => {
  let server, url, cookiejar;

  beforeAll(async done => {
    server = await micro(router.apply(this, routes));
    url = await listen(server);
    done();
  });

  afterAll(async done => {
    await server.close();
    const knex = getConnection('test');
    knex.migrate
      .rollback()
      .then(() => knex.destroy())
      .then(() => done());
  });

  beforeEach(async done => {
    cookiejar = rp.jar();
    const knex = getConnection('test');
    return knex.migrate
      .rollback()
      .then(() => knex.migrate.latest())
      .then(() => knex.seed.run())
      .then(() => knex.destroy())
      .then(() => done());
  });

  describe('POST /', async () => {
    it('should create a new user', async () => {
      const result = await rp({
        method: 'post',
        json: true,
        uri: `${url}/`,
        body: { username: 'Jorge Borges', password: 'foobar' }
      });

      expect(result.username).toEqual('Jorge Borges');
      expect(result.id).toEqual(2);
    });
  });

  describe('GET /', async () => {
    it('retrieves the currently logged in user, if it exists.', async () => {
      const loginResponse = await rp({
        method: 'post',
        uri: `${url}/login`,
        json: true,
        body: { username: 'myk', password: 'graphs4lyfe' },
        resolveWithFullResponse: true
      });

      const setCookieHeaders = loginResponse.headers['set-cookie']
        .map(Cookie.parse)
        .forEach(cookie => cookiejar.setCookie(cookie, url));

      const currentUser = await rp({
        method: 'get',
        uri: `${url}/`,
        json: true,
        jar: cookiejar
      });

      expect(currentUser.username).toBe('myk');
      expect(currentUser.id).toBe(1);
      expect(currentUser.password).toBe(undefined);
    });

    it('returns null if nobody is logged in', () => {});
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
    });
  });

  describe('POST /login', async () => {
    it('should set a valid auth token on the response', async () => {
      const loginResponse = await rp({
        method: 'post',
        uri: `${url}/login`,
        json: true,
        body: { username: 'myk', password: 'graphs4lyfe' },
        resolveWithFullResponse: true
      });

      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.headers['set-cookie'].length).toBe(1);
      const [sessionCookie] = loginResponse.headers['set-cookie'];
      expect(sessionCookie.startsWith('session=')).toBe(true);
    });

    it('should not set an auth token if the password was invalid', async () => {
      let errorHit = false;
      try {
        const loginResponse = await rp({
          method: 'post',
          uri: `${url}/login`,
          json: true,
          body: { username: 'myk', password: 'THIS IS THE WRONG PASSWORD' },
          resolveWithFullResponse: true
        });
      } catch (e) {
        errorHit = true;
        expect(e.message).toBe('400 - "Invalid password!"');
      }

      expect(errorHit).toBeTruthy();
    });
  });

  describe('POST /logout', async () => {
    it('should clear the auth token from the response', () => {});

    it('should remove the user session from the session store', () => {});
  });
});
