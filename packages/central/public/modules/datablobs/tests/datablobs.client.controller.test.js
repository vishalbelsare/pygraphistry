'use strict';

(function() {
	// DataBlobs Controller Spec
	describe('DataBlobsController', function() {
		// Initialize global variables
		var DataBlobsController,
			scope,
			$httpBackend,
			$stateParams,
			$location;

		// The $resource service augments the response object with methods for updating and deleting the resource.
		// If we were to use the standard toEqual matcher, our tests would fail because the test values would not match
		// the responses exactly. To solve the problem, we define a new toEqualData Jasmine matcher.
		// When the toEqualData matcher compares two objects, it takes only object properties into
		// account and ignores methods.
		beforeEach(function() {
			jasmine.addMatchers({
				toEqualData: function(util, customEqualityTesters) {
					return {
						compare: function(actual, expected) {
							return {
								pass: angular.equals(actual, expected)
							};
						}
					};
				}
			});
		});

		// Then we can start by loading the main application module
		beforeEach(module(ApplicationConfiguration.applicationModuleName));

		// The injector ignores leading and trailing underscores here (i.e. _$httpBackend_).
		// This allows us to inject a service but then attach it to a variable
		// with the same name as the service.
		beforeEach(inject(function($controller, $rootScope, _$location_, _$stateParams_, _$httpBackend_) {
			// Set a new global scope
			scope = $rootScope.$new();

			// Point global variables to injected services
			$stateParams = _$stateParams_;
			$httpBackend = _$httpBackend_;
			$location = _$location_;

			// Initialize the DataBlobs controller.
			DataBlobsController = $controller('DataBlobsController', {
				$scope: scope
			});
		}));

		it('$scope.find() should create an array with at least one datablob object fetched from XHR', inject(function(DataBlobs) {
			// Create sample datablob using the DataBlobs service
			var sampleDataBlob = new DataBlobs({
				title: 'An DataBlob about MEAN',
				content: 'MEAN rocks!'
			});

			// Create a sample datablobs array that includes the new datablob
			var sampleDataBlobs = [sampleDataBlob];

			// Set GET response
			$httpBackend.expectGET('datablobs').respond(sampleDataBlobs);

			// Run controller functionality
			scope.find();
			$httpBackend.flush();

			// Test scope value
			expect(scope.datablobs).toEqualData(sampleDataBlobs);
		}));

		it('$scope.findOne() should create an array with one datablob object fetched from XHR using a datablobId URL parameter', inject(function(DataBlobs) {
			// Define a sample datablob object
			var sampleDataBlob = new DataBlobs({
				title: 'An DataBlob about MEAN',
				content: 'MEAN rocks!'
			});

			// Set the URL parameter
			$stateParams.datablobId = '525a8422f6d0f87f0e407a33';

			// Set GET response
			$httpBackend.expectGET(/datablobs\/([0-9a-fA-F]{24})$/).respond(sampleDataBlob);

			// Run controller functionality
			scope.findOne();
			$httpBackend.flush();

			// Test scope value
			expect(scope.datablob).toEqualData(sampleDataBlob);
		}));

		it('$scope.create() with valid form data should send a POST request with the form input values and then locate to new object URL', inject(function(DataBlobs) {
			// Create a sample datablob object
			var sampleDataBlobPostData = new DataBlobs({
				title: 'An DataBlob about MEAN',
				content: 'MEAN rocks!'
			});

			// Create a sample datablob response
			var sampleDataBlobResponse = new DataBlobs({
				_id: '525cf20451979dea2c000001',
				title: 'An DataBlob about MEAN',
				content: 'MEAN rocks!'
			});

			// Fixture mock form input values
			scope.title = 'An DataBlob about MEAN';
			scope.content = 'MEAN rocks!';

			// Set POST response
			$httpBackend.expectPOST('datablobs', sampleDataBlobPostData).respond(sampleDataBlobResponse);

			// Run controller functionality
			scope.create();
			$httpBackend.flush();

			// Test form inputs are reset
			expect(scope.title).toEqual('');
			expect(scope.content).toEqual('');

			// Test URL redirection after the datablob was created
			expect($location.path()).toBe('/datablobs/' + sampleDataBlobResponse._id);
		}));

		it('$scope.update() should update a valid datablob', inject(function(DataBlobs) {
			// Define a sample datablob put data
			var sampleDataBlobPutData = new DataBlobs({
				_id: '525cf20451979dea2c000001',
				title: 'An DataBlob about MEAN',
				content: 'MEAN Rocks!'
			});

			// Mock datablob in scope
			scope.datablob = sampleDataBlobPutData;

			// Set PUT response
			$httpBackend.expectPUT(/datablobs\/([0-9a-fA-F]{24})$/).respond();

			// Run controller functionality
			scope.update();
			$httpBackend.flush();

			// Test URL location to new object
			expect($location.path()).toBe('/datablobs/' + sampleDataBlobPutData._id);
		}));

		it('$scope.remove() should send a DELETE request with a valid datablobId and remove the datablob from the scope', inject(function(DataBlobs) {
			// Create new datablob object
			var sampleDataBlob = new DataBlobs({
				_id: '525a8422f6d0f87f0e407a33'
			});

			// Create new datablobs array and include the datablob
			scope.datablobs = [sampleDataBlob];

			// Set expected DELETE response
			$httpBackend.expectDELETE(/datablobs\/([0-9a-fA-F]{24})$/).respond(204);

			// Run controller functionality
			scope.remove(sampleDataBlob);
			$httpBackend.flush();

			// Test array after successful delete
			expect(scope.datablobs.length).toBe(0);
		}));
	});
}());