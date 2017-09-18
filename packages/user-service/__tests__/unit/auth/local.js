const localAuth = require('../../../src/auth/local');
const chai = require('chai');
const should = chai.should();

describe("auth/local.js", () => {
  describe('encodeToken()', () => {
    it('should return a token', (done) => {
      const results = localAuth.encodeToken({id: 1});
      should.exist(results);
      results.should.be.a('string');
      done();
    });
  });

  describe('decodeToken()', () => {
    it('should return a payload', (done) => {
      const token = localAuth.encodeToken({id: 1});
      should.exist(token);
      token.should.be.a('string');
      localAuth.decodeToken(token, (err, res) => {
        should.not.exist(err);
        res.data.should.eql(1);
        res.exp.should.be.a('number');
        done();
      });
    });
  });
})