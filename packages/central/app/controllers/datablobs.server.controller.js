'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	errorHandler = require('./errors'),
	DataBlob = mongoose.model('DataBlob'),
	_ = require('lodash');

/**
 * Create a datablob
 */
exports.create = function(req, res) {
	var datablob = new DataBlob(req.body);
	datablob.user = req.user;

	datablob.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(datablob);
		}
	});
};

/**
 * Show the current datablob
 */
exports.read = function(req, res) {
	res.jsonp(req.datablob);
};

/**
 * Update a datablob
 */
exports.update = function(req, res) {
	var datablob = req.datablob;

	datablob = _.extend(datablob, req.body);

	datablob.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(datablob);
		}
	});
};

/**
 * Delete an datablob
 */
exports.delete = function(req, res) {
	var datablob = req.datablob;

	datablob.remove(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(datablob);
		}
	});
};

/**
 * List of DataBlobs
 */
exports.list = function(req, res) {
	DataBlob.find().sort('-created').populate('user', 'displayName').exec(function(err, datablobs) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(datablobs);
		}
	});
};

/**
 * DataBlob middleware
 */
exports.datablobByID = function(req, res, next, id) {
	DataBlob.findById(id).populate('user', 'displayName').exec(function(err, datablob) {
		if (err) return next(err);
		if (!datablob) return next(new Error('Failed to load datablob ' + id));
		req.datablob = datablob;
		next();
	});
};

/**
 * DataBlob authorization middleware
 */
exports.hasAuthorization = function(req, res, next) {
	if (req.datablob.user.id !== req.user.id) {
		return res.status(403).send({
			message: 'User is not authorized'
		});
	}
	next();
};