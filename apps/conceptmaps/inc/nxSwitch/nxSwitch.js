"use strict";

(function($) {
	
	//constructor
	function nxSwitch(parent, id, data) {
		const states = data.options;
		const count = states.length;
		if (!count > 1) return;
		const width = count * 40 + 40;
		const iconLibrary = [];
		for (const i in states) {
			iconLibrary[i] = [];
			for (const j in states[i].icons) {
				iconLibrary[i][j] = new Image();
				iconLibrary[i][j].src = states[i].icons[j];
			}
		}
		const callback = data.callback;
		if (typeof(parent) == 'string') {
			parent = $('#'+parent);
		}
		const div = parent.append('<div class="nxSwitch"></div>').find('div').last();
		div.attr('id', id);
		div.addClass('nxSwitch');
		div.append('<div class="nxswGloss">');
		div.append('<div class="nxswDisplay"></div>');
		const display = div.find('.nxswDisplay');
		const items = [];
		let totalWidth = 40;
		for (const i in states) {
			let type = '';
			totalWidth += 40;
			if (states[i].type === 'split') {
				type = 'nxswSplit';
			} else {
				type = 'nxswSimple';
			}
			display.append(stringf('<div id="%@_%@" class="nxswItem %@" state="%@"><div id="%@_%@Main" class="nxswItemMain"></div><span data-translate="'+states[i].title+'" class="toolsLabel">'+states[i].tooltip+'</span></div>', id, i, type, i, id, i));
			items[i] = $(stringf("#%@_%@", id, i));
			if (states[i].tooltip) {
				items[i].attr('title', states[i].tooltip);
			}
			if (type === 'nxswSplit') {
				items[i].append(stringf('<div id="%@_%@Lock" class="nxswItemLock"></div>', id, i));
			}
			$(stringf("#%@_%@Main", id, i)).append(iconLibrary[i][0]);
			if (states[i].separator) {
				const space = Math.floor(states[i].separator / 2);
				display.append(stringf('<div class="nxswSeparator" style="margin-left: %@px; margin-right: %@px;"></div>', space, space));
				totalWidth += 2 * space + 2;
			}
		}
		div.css('width', totalWidth + 'px');
		const touch = data.touch || false;
		let state = data.active || 0;
		const fallbackState = data.fallback || 0;
		let value;
		let lockState = 'locked';
		setState(state, lockState);
		if (touch) {
			div.find('.nxswItem').on('touchstart', clicked);
		} else {
			div.find('.nxswItem').on('click', clicked);
		}
		$('.nxswItem img').on('dragstart', function(e) {
			return false;
		});
	
		//called when main part of the button is clicked/touched
		function clicked(event) {
			if ($(event.delegateTarget).hasClass('single') || $(event.delegateTarget).hasClass('nxswSimple')) {
				setState($(event.delegateTarget).attr('state'), 'locked');
			} else if (!$(event.delegateTarget).hasClass('locked')) {		/* this would be used instead of next row to keep vutton from gong back to single mode from locked mode */
			//} else {
				setState($(event.delegateTarget).attr('state'), 'single');
			}
		}
		
		//make all the modifications when state changes
		function setState(n, mode) {
			if (typeof(n) != 'undefined') state = parseInt(n);
			$('.nxswItem').css('background-color', '');
			div.find('.nxswItem').removeClass('single').removeClass('locked');
			items[state].addClass(mode);
			items[state].css('background-color', states[state].color);
			value = states[state].value;
			lockState = mode;
			if (callback) callback(id, value, mode);
		}
		
		//getter
		function getValue() {
			return value;
		}
		
		//setter
		function setValue(v) {
			state = -1;
			for (const i in states) {
				if (states[i].value === v) {
					setState(i);
					return;
				}
			}
			setState();
		}
		
		//reset to default value
		function reset() {
			setState(0);
		}

		function stringf(s) {
			for(let i = 1; i < arguments.length; i++) {
				s = s.replace(/%@/, arguments[i]);
			}
			return s;
		}
		
		/*
		 *		methods 
		 */
		
		this.setIcon = function(n, icon) {
			/*
				n is the number of the tool starting at 0 from left to right
				icon is the number of the icon for that tool also starting at 0
			*/
			if (iconLibrary && iconLibrary[n]) {
				$(stringf('#%@_%@Main', id, n)).html(iconLibrary[n][icon]);
				return true;
			} else {
				return false;
			}
		};
		
		this.fallback = function() {
			if (lockState === 'single') {
				setState(fallbackState, 'locked');
				return true;
			} else {
				return false;
			}
		};
		
		this.getMetaData = function() {
			const data = {
				title: states[state].title,
				color:  states[state].color
			};
			return data;
		};

		// UG added
		this.setState = setState;
		
	}
	
	window.nxSwitch = nxSwitch;

})(jQuery);
