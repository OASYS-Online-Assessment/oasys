/*
 jsPointerHelper v1.00.00
 	(c) 2021 LUCET
 	author: ulrich geber
Provides tools to handle exaggerated precision of mouse coordinates and event density in some browser, 
specially on high-res displays.

PARAMETERS:
	options: object
			basically, all class properties can be overwritten by passing a value in options
	
PROPERTIES:
	minDeltaX: number
	minDeltaY: number
			minimum position deltas (check will return false if the actual delta is below)

	minDeltaMove: number
			minimum milliseconds delta for move (check will return false if the actual delta is below)
*/

"use strict";


(function ($) {

	function jsPointerHelper(options) {

		let lastX = null; // will be set at first check
		let lastY = null; // will be set at first check

		this.minDeltaX = options.minDeltaX || 5; // safari worst case
		this.minDeltaY = options.minDeltaY || 5; // safari worst case

		this.lastMoveEvent     = Date.now(); // set value if check passes
		this.minDeltaMoveEvent = options.minDeltaMove || 1; // 1 millisecond default


		/* public methods */
		this.checkDeltaX = function (x) {
			if (lastX === null) { // first call
				lastX = x;
			}
			let delta = Math.abs(Math.round(x) - Math.round(lastX));
			let deltaOk = false;
			if (delta >= this.minDeltaX) {
				lastX = x; // set new position for next check
				deltaOk = true;
			}

			return deltaOk;
		};

		this.checkDeltaY = function (y) {
			if (lastY === null) { // first call
				lastY = y;
			}
			let delta = Math.abs(Math.round(y) - Math.round(lastY));
			let deltaOk = false;
			if (delta >= this.minDeltaY) {
				lastY = y; // set new position for next check
				deltaOk = true;
			}

			return deltaOk;
		};

		this.getDelta = function (x,y) {
			if (lastX === null) { // first call
				lastX = x;
			}
			if (lastY === null) { // first call
				lastY = y;
			}
			let deltas = {};
			deltas.x = delta('x',x);
			deltas.y = delta('y',y);

			return deltas;
		};

		
		/* private methods */

		function delta (axis,currentPos) { // x or y
			let distance = null;
			if (axis === 'x') {
				distance = Math.abs(currentPos - lastX);
			} else if (axis === 'y') {
				distance = Math.abs(currentPos - lastY);
			}

			return distance;
		}

	}

	//export class
	window.jsPointerHelper = jsPointerHelper;

})(jQuery);
