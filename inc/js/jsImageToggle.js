"use strict";
/*
 *  id:			string
 *  states:		Array of Objects with
 * 		value:		string
 * 		image:		string (path to image)
 * 		data:		Object with custom user data to be sent back with the callback
 * 	callback:	callback function for toggle event
 * 	style:		custom css string for the container
 */

(function($, global) {

	//constructor
	$.fn.jsImageToggle = function(id, states, callback, style, data) {
		const parent = this.first();
		const count = states.length;
		if (count < 2) return;
		const images = {};

		//preload images
		for (let i in states) {
			images[i] = new Image();
			images[i].src = states[i].image;
			$(images[i]).css({width: '100%'}); //adopt size of container => this way the size can be set in style parameter and we can assure retina resolution if we want
		}
		
		//create container
		parent.append(`<div id='${id}' class='jsImageToggle'></div>`);
		const div = $('#' + id.replace(/\./, '\\.'));
		if (style) {
			div.attr('style', style);
		}
		
		//initialize
		let state = 0;
		let value;
		setState();
		
		//event management
		if (window.hasOwnProperty && window.hasOwnProperty('ontouchend')) {
			div.on('touchend', rotateState);
		} else {
			div.on('click', rotateState);
		}
				
		//make all the modifications when state changes
		function setState() {
			value = states[state].value;
			div.html(images[state]);
		} 
		
		//executed on click or touch
		function rotateState(event) {
			state++;
			if (state >= count) state = 0;
			setState();
			if (callback) {
				callback.call(this, id, value, data);
			}
		}
		
		//setter
		function setValue(v) {
			for (let i in states) {
				if (states[i].value === v) state = i;
			}
			setState();
		}
		
		//reset to default value
		function reset() {
			state = 0;
			setState();
		}
		
		//getter
		function getValue() {
			return value;
		}

		//declare methods
		div.getValue = getValue;
		div.reset = reset;
		div.setValue = setValue;
		div.setState = setState;
		
		return div;
	};
	
})(jQuery, window);
