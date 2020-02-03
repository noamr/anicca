(async function (window) {
	'use strict';
	const initKal = (await import('../.kal/main.js')).default
	initKal({rootElements: {
		todosView: document.querySelector('.todoapp')
	}, routes: {
		routeFilter: '#'
	}})
	// Your starting point. Enjoy the ride!

})(window);
