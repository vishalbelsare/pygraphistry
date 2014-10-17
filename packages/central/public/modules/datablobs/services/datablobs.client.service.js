'use strict';

//DataBlobs service used for communicating with the datablobs REST endpoints
angular.module('datablobs').factory('DataBlobs', ['$resource',
	function($resource) {
		return $resource('datablobs/:datablobId', {
			datablobId: '@_id'
		}, {
			update: {
				method: 'PUT'
			}
		});
	}
]);