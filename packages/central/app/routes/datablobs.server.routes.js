'use strict';

/**
 * Module dependencies.
 */
var users = require('../../app/controllers/users'),
	datablobs = require('../../app/controllers/datablobs');

module.exports = function(app) {
	// DataBlob Routes
	app.route('/datablobs')
		.get(datablobs.list)
		.post(users.requiresLogin, datablobs.create);

	app.route('/datablobs/:datablobId')
		.get(datablobs.read)
		.put(users.requiresLogin, datablobs.hasAuthorization, datablobs.update)
		.delete(users.requiresLogin, datablobs.hasAuthorization, datablobs.delete);

	// Finish by binding the datablob middleware
	app.param('datablobId', datablobs.datablobByID);
};