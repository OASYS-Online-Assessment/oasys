/*

	jsKeyboardHandler v1.30
		(c) 2014-2026 by Eric J. Francois

	DESCRIPTION:
		this class simplifies handling of shortcuts in the DOM

	USAGE:

	include the JS file in your HTML document
	instantiate the list with:
		new jsKeyboardHandler();


	METHODS:
		registerShortcut(shortcut, callback):		registers the given shortcut to call the callback function (see example below)
		handler(event): 							exports the keyboard handler, so that other components can forward an event to it
		permissionHandler(f):						register a function f that checks if a keyStroke may be accepted (true = ok, false = stop)
													note that it blocks any keyboard activity, even those strokes that are not registered
		destroy():									unregister event listener (necessary if a temporary kbHandler is to removed)

	EXAMPLE:
		kbHandler = new jsKeyboardHandler();
		kbHandler.registerShortcut('CTRL+S', save);

*/

"use strict";

(function($) {

	function jsKeyboardHandler(id = 'jsKeyboardHandler') {

		const shortcuts = {};
		let permissionsCallback = null;
		const codes = {
			'backspace': 8,
			'tab': 9,
			'lf': 10,
			'numlock': 12,
			'cr': 13,
			'esc': 27,
			'space': 32,
			'pageup': 33,
			'pagedown': 34,
			'end': 35,
			'home': 36,
			'left': 37,
			'up': 38,
			'right': 39,
			'down': 40,
			'del': 46,
			'0': 48,
			'1': 49,
			'2': 50,
			'3': 51,
			'4': 52,
			'5': 53,
			'6': 54,
			'7': 55,
			'8': 56,
			'9': 57,
			'a': 65,
			'b': 66,
			'c': 67,
			'd': 68,
			'e': 69,
			'f': 70,
			'g': 71,
			'h': 72,
			'i': 73,
			'j': 74,
			'k': 75,
			'l': 76,
			'm': 77,
			'n': 78,
			'o': 79,
			'p': 80,
			'q': 81,
			'r': 82,
			's': 83,
			't': 84,
			'u': 85,
			'v': 86,
			'w': 87,
			'x': 88,
			'y': 89,
			'z': 90,
			'f1': 112,
			'f2': 113,
			'f3': 114,
			'f4': 115,
			'f5': 116,
			'f6': 117,
			'f7': 118,
			'f8': 119,
			'f9': 120,
			'f10': 121,
			'f11': 122,
			'f12': 123,
			'f13': 124,
			'f14': 125,
			'f15': 126,
			'f16': 127,
			'f17': 128,
			'f18': 129,
			'f19': 130
		};

		$(window).on("keydown." + id, onKeyDown);

		/* public methods */

		this.registerShortcut = function(shortcut, callback, options) {
			if (!shortcut ) return;
			if (!options) options = {};
			let ctrl = false;
			let shift = false;
			let alt = false;
			let code;
			shortcut = shortcut.toLowerCase();
			const pieces = shortcut.split(/\+/);
			for (let k in pieces) {
				switch (pieces[k]) {
					case 'shift':
						shift = true;
						break;
					case 'ctrl':
					case 'cmd':
						ctrl = true;
						break;
					case 'alt':
					case 'opt':
						alt = true;
						break;
					default:
						code = codes[pieces[k]] || 0;
				}
			}
			let preventDefault = true;
			if (options.preventDefault === false) preventDefault = false;
			let stopPropagation = true;
			if (options.stopPropagation === false) stopPropagation = false;
			const stopImmediatePropagation = options.stopImmediatePropagation || false;
			const executeOnChildren = options.executeOnChildren || false;
			const blacklist = options.blacklist || [];
			const parameters = options.parameters || [];
			const sendOriginalEvent = options.sendOriginalEvent || false;
			shortcuts[shortcut] = {
				ctrl: ctrl,
				alt: alt,
				shift: shift,
				preventDefault: preventDefault,
				stopPropagation: stopPropagation,
				stopImmediatePropagation: stopImmediatePropagation,
				executeOnChildren: executeOnChildren,
				blacklist: blacklist,
				code: code,
				callback: callback,
				parameters: parameters,
				sendOriginalEvent: sendOriginalEvent
			};
		};

		this.removeShortcut = function(shortcut) {
			delete shortcuts[shortcut.toLowerCase()];
		};

		this.permissionHandler = function(f) {
			if (typeof(f) === 'function') {
				permissionsCallback = f;
			}
		};

		/* private functions */

		function onKeyDown(e) {
			//check if we may accept keystrokes at this instant at all
			if (typeof(permissionsCallback) === 'function' && permissionsCallback() === false) return;
			for (let name in shortcuts) {
				const sc = shortcuts[name];
				if (e.which !== sc.code) continue;
				if ((sc.ctrl && (!e.ctrlKey && !e.metaKey)) || (!sc.ctrl && (e.ctrlKey || e.metaKey))) continue;
				if (sc.alt !== e.altKey || sc.shift !== e.shiftKey) continue;
				//once we get to this point, the shortcut has been identified as correct
				//if the window is not the target of the event check if callback should be executed anyway
				if (e.target !== $('body').get(0) && !sc.executeOnChildren) continue;
				//check if the id of the target is in the blacklist and don't execute callback if it's on the list
				if (e.target.id && $.inArray(e.target.id, sc.blacklist) > -1) continue;
				if (sc.preventDefault === true) e.preventDefault();
				if (sc.stopPropagation === true) e.stopPropagation();
				if (sc.stopImmediatePropagation === true) e.stopImmediatePropagation();
				if (sc.sendOriginalEvent) sc.parameters.unshift(e);
				//only at the end of all this, we'll check if are even allowed to accept keystrokes
				if (typeof(permissionsCallback) === 'function' && permissionsCallback() === false) return;
				if (sc.callback) sc.callback.apply(this, sc.parameters); //callback can be null if you only want to prevent default action without own callback
			}
		}

		function destroy() {
			$(window).off("keydown." + id);
		}

		//export methods
		this.handler = onKeyDown;
		this.destroy = destroy;

	}

	//export class
	window.jsKeyboardHandler = jsKeyboardHandler;

})(jQuery);
