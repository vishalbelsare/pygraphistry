'use strict';

angular.module('datablobs').controller('DataBlobsController', ['$scope', '$stateParams', '$location', 'Authentication', 'DataBlobs',
	function($scope, $stateParams, $location, Authentication, DataBlobs) {
        var crypto = require('crypto');
        var expiration = new Date();
        expiration.setHours(expiration.getHours() + 1);

        var policy = {
            expiration: expiration.toISOString(),
            conditions: [
                {bucket: 'graphistry.data'},
                ['starts-with', '$key', ''],
                {acl: 'private'},
                {success_action_redirect: 'http://54.183.185.65/#!/datablobs'},
                ['starts-with', '$Content-Type', 'image/'],
                ['content-length-range', 0, 1048576]
            ]
        };

        var awsKeyId = 'YOUR AWS KEY ID';
        var awsKey = 'YOUR AWS KEY';

        var policyString = JSON.stringify(policy);
        var encodedPolicyString = new Buffer(policyString).toString('base64');

        var hmac = crypto.createHmac('sha1', awsKey);
        hmac.update(encodedPolicyString);

        var digest = hmac.digest('base64');

	    $scope.awskeyid = awsKeyId;
	    $scope.policy = encodedPolicyString;
	    $scope.signature = digest;
		$scope.authentication = Authentication;

		$scope.create = function() {
			var datablob = new DataBlobs({
				title: this.key,
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
