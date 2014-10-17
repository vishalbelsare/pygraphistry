'use strict';

// Setting up route
angular.module('datablobs').config(['$stateProvider',
	function($stateProvider) {
		// DataBlobs state routing
		$stateProvider.
		state('listDataBlobs', {
			url: '/datablobs',
			templateUrl: 'modules/datablobs/views/list-datablobs.client.view.html'
		}).
		state('createDataBlob', {
			url: '/datablobs/create',
			templateUrl: 'modules/datablobs/views/create-datablob.client.view.html'
		}).
		state('viewDataBlob', {
			url: '/datablobs/:datablobId',
			templateUrl: 'modules/datablobs/views/view-datablob.client.view.html'
		}).
		state('editDataBlob', {
			url: '/datablobs/:datablobId/edit',
			templateUrl: 'modules/datablobs/views/edit-datablob.client.view.html'
		});
	}
]);