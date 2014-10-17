'use strict';

// Configuring the DataBlobs module
angular.module('datablobs').run(['Menus',
	function(Menus) {
		// Set top bar menu items
		Menus.addMenuItem('topbar', 'DataBlobs', 'datablobs', 'dropdown', '/datablobs(/create)?');
		Menus.addSubMenuItem('topbar', 'datablobs', 'List DataBlobs', 'datablobs');
		Menus.addSubMenuItem('topbar', 'datablobs', 'New DataBlob', 'datablobs/create');
	}
]);