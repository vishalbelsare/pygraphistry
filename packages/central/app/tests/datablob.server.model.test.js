'use strict';

/**
 * Module dependencies.
 */
var should = require('should'),
	mongoose = require('mongoose'),
	User = mongoose.model('User'),
	DataBlob = mongoose.model('DataBlob');

/**
 * Globals
 */
var user, datablob;

/**
 * Unit tests
 */
describe('DataBlob Model Unit Tests:', function() {
	beforeEach(function(done) {
		user = new User({
			firstName: 'Full',
			lastName: 'Name',
			displayName: 'Full Name',
			email: 'test@test.com',
			username: 'username',
			password: 'password'
		});

		user.save(function() {
			datablob = new DataBlob({
				title: 'DataBlob Title',
				content: 'DataBlob Content',
				user: user
			});

			done();
		});
	});

	describe('Method Save', function() {
		it('should be able to save without problems', function(done) {
			return datablob.save(function(err) {
				should.not.exist(err);
				done();
			});
		});

		it('should be able to show an error when try to save without title', function(done) {
			datablob.title = '';

			return datablob.save(function(err) {
				should.exist(err);
				done();
			});
		});
	});

	afterEach(function(done) {
		DataBlob.remove().exec();
		User.remove().exec();
		done();
	});
});