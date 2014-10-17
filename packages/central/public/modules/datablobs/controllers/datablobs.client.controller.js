'use strict';

angular.module('datablobs').controller('DataBlobsController', ['$scope', '$stateParams', '$location', 'Authentication', 'DataBlobs',
	function($scope, $stateParams, $location, Authentication, DataBlobs) {
		$scope.authentication = Authentication;

		$scope.create = function() {
			var datablob = new DataBlobs({
				title: this.title,
				content: this.content
			});
			datablob.$save(function(response) {
				$location.path('datablobs/' + response._id);

				$scope.title = '';
				$scope.content = '';
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		$scope.remove = function(datablob) {
			if (datablob) {
				datablob.$remove();

				for (var i in $scope.datablobs) {
					if ($scope.datablobs[i] === datablob) {
						$scope.datablobs.splice(i, 1);
					}
				}
			} else {
				$scope.datablob.$remove(function() {
					$location.path('datablobs');
				});
			}
		};

		$scope.update = function() {
			var datablob = $scope.datablob;

			datablob.$update(function() {
				$location.path('datablobs/' + datablob._id);
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		$scope.find = function() {
			$scope.datablobs = DataBlobs.query();
		};

		$scope.findOne = function() {
			$scope.datablob = DataBlobs.get({
				datablobId: $stateParams.datablobId
			});
		};
	}
]);