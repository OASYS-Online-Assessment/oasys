"use strict";

/*
 nxButton v3.26

 Depencies:
	 jQuery 1.7 or newer
	 jsPointerHandler v2.1.0 or newer
 */

(function ($) {

	const debugMode = false;

	function nxButton(parent, id, data) {
		if (typeof(parent) === 'string') {
			parent = $('#' + parent);
		}
		const label = data.label || "";
		let icon = data.icon || false;
		if (typeof(data.symbol) === 'string') {
			icon = `<svg><use href="#${data.symbol}"></use></svg>`;
		}
		const hoverIcon = data.hoverIcon || icon;
		if (typeof(data.hoverSymbol) === 'string') {
			icon = `<svg><use href="#${data.hoverSymbol}"></use></svg>`;
		}
		const selectedIcon = data.selectedIcon || icon;
		if (typeof(data.selectedSymbol) === 'string') {
			icon = `<svg><use href="#${data.selectedSymbol}"></use></svg>`;
		}
		let iconHeight = data.iconHeight || false;
		if (typeof(iconHeight) === 'number') {
			iconHeight += 'px';
		}
		let iconWidth = data.iconWidth || false;
		if (typeof(iconWidth) === 'number') {
			iconWidth += 'px';
		}
		let iconPosition = data.iconPosition || 'left';
		if (iconPosition !== 'left' && iconPosition !== 'right') {
			iconPosition = 'left;'
		}
		const callback = data.callback || null;
		let callBackParams = data.params || null;
		const eventType = data.eventType || null;
		const style = data.style || null;
		const frameStyle = data.frameStyle || null;
		const tooltip = data.tooltip || false;
		let translate = data.translate || false;
		let value = data.value;
		if (typeof (data.value) === 'undefined') value = null;
		let selected = data.selected || false;
		let disabled = data.disabled || false;
		const overlay = data.overlay || false;
		const toggle = data.toggle || false;
		const states = data.states || [];
		const theme = "theme_" + (data.theme || 'default');
		const svgLayer = data.svgLayer || "";
		const statesIndex = {};
		let mode = 0; //0 = label only, 1 = small icon & label, 2 = big icon without label
		let timer; //timer for tooltip

		/* if no states are defined, let's define one from the global variables */
		if (states.length === 0) {
			states.push({
				'icon': icon,
				'hoverIcon': hoverIcon,
				'selectedIcon': selectedIcon,
				'label': label,
				'translate': translate,
				'value': value,
				'params': callBackParams
			});
			statesIndex['value'] = 0;
			if (icon) {
				if (label !== '') {
					mode = 1;
				} else {
					mode = 2;
				}
			}
		} else {
			/* fill in properties of every state, that may have been given globally if they remain unchanged no matter the state */
			let labelsPresent = true;
			let iconsPresent = true;
			for (let i in states) {
				if (typeof(states[i].icon) === 'undefined') states[i].icon = icon;
				if (typeof(states[i].symbol) === 'string') states[i].icon = `<svg><use href="#${states[i].symbol}"></use></svg>`;
				if (typeof(states[i].hoverIcon) === 'undefined') states[i].hoverIcon = hoverIcon || states[i].icon;
				if (typeof(states[i].hoverSymbol) === 'string') states[i].hoverIcon = `<svg><use href="#${states[i].hoverSymbol}"></use></svg>`;
				if (typeof(states[i].selectedIcon) === 'undefined') states[i].selectedIcon = selectedIcon || states[i].icon;
				if (typeof(states[i].selectedSymbol) === 'string') states[i].selectedIcon = `<svg><use href="#${states[i].selectedSymbol}"></use></svg>`;
				if (typeof(states[i].label) === 'undefined') states[i].label = label;
				if (typeof(states[i].translate) === 'undefined') states[i].translate = translate;
				if (typeof(states[i].value) === 'undefined') states[i].value = value;
				if (typeof(states[i].params) === 'undefined') states[i].params = callBackParams;
				statesIndex[states[i].value] = i; //builds an index to find the right state for a certain value
				if (states[i].icon === false) iconsPresent = false;
				if (states[i].label === '') labelsPresent = false;
			}
			if (iconsPresent) {
				if (labelsPresent) {
					mode = 1;
				} else {
					mode = 2;
				}
			}
		}
		let state = 0;
		if (statesIndex[data.state]) {
			state = statesIndex[data.state];
		} else if (typeof(data.state) === 'number') {
			state = data.state;
		}

		/* preload icons for all states */
		for (let i in states) {
			if (mode > 0) {
				if (/^<svg/i.test(states[i].icon)) {
					//if source is an SVG file it must be handled differently than a bitmap image
					states[i].image = $.parseHTML(states[i].icon);
					$(states[i].image).attr('id', 'icon_' + id);
					states[i].imageType = 'svg';
					if (typeof(iconHeight) === 'string') $(states[i].image).css('height', iconHeight);
					if (typeof(iconWidth) === 'string') $(states[i].image).css('width', iconWidth);
					$(states[i].image).addClass('nxButtonIcon');
					if (mode === 1) {
						$(states[i].image).addClass('nxButtonSmallIcon');
					} else {
						$(states[i].image).addClass('nxButtonBigIcon');
					}
				} else {
					//if source is not SVG we'll simply preload the bitmap images
					states[i].imageType = 'bitmap';
					states[i].image = new Image();
					states[i].image.src = states[i].icon;
					states[i].image.id = 'icon_' + id;
					if (typeof(iconHeight) === 'string') $(states[i].image).css('height', iconHeight);
					if (typeof(iconWidth) === 'string') $(states[i].image).css('width', iconWidth);
					$(states[i].image).addClass('nxButtonIcon');
					if (mode === 1) {
						$(states[i].image).addClass('nxButtonSmallIcon');
					} else {
						$(states[i].image).addClass('nxButtonBigIcon');
					}

					if (states[i].hoverIcon === states[i].icon) {
						states[i].hoverImage = null;
					} else {
						states[i].hoverImage = new Image();
						states[i].hoverImage.src = states[i].hoverIcon;
						states[i].hoverImage.id = 'hoverIcon_' + id;
						if (typeof(iconHeight) === 'string') $(states[i].hoverImage).css('height', iconHeight);
						if (typeof(iconWidth) === 'string') $(states[i].hoverImage).css('width', iconWidth);
						$(states[i].hoverImage).addClass('nxButtonHoverIcon');
						if (mode === 1) {
							$(states[i].hoverImage).addClass('nxButtonSmallIcon');
						} else {
							$(states[i].hoverImage).addClass('nxButtonBigIcon');
						}
					}

					if (states[i].selectedIcon === states[i].icon) {
						states[i].selectedImage = null;
					} else {
						states[i].selectedImage = new Image();
						states[i].selectedImage.src = states[i].selectedIcon;
						states[i].selectedImage.id = 'selectedIcon_' + id;
						if (typeof(iconHeight) === 'string') $(states[i].selectedImage).css('height', iconHeight);
						if (typeof(iconWidth) === 'string') $(states[i].selectedImage).css('width', iconWidth);
						$(states[i].selectedImage).addClass('nxButtonSelectedIcon');
						if (mode === 1) {
							$(states[i].selectedImage).addClass('nxButtonSmallIcon');
						} else {
							$(states[i].selectedImage).addClass('nxButtonBigIcon');
						}
					}

				}
			} else {
				states[i].imageType = 'none';
				states[i].image = null;
				states[i].selectedImage = null;
			}
		}

		let tooltipHTML = '';
		if (tooltip) {
			tooltipHTML = `<div id='tooltip_${id}' class='nxButtonTooltip' style='display: none;'><div class='nxButtonTooltipPointFrame'><div class='nxButtonTooltipPoint'></div></div>${tooltip}</div>`;
		}
		let svgLayerHTML = "";
		if (svgLayer) {
			svgLayerHTML = `<div id='svgLayer_${id}' class='nxButtonSVGLayer'>${svgLayer}</div>`;
		}
		$('body').append(tooltipHTML);
		const html = `<div id='background_${id}' class='nxButtonBackground'>${svgLayerHTML}<div id='${id}' class='nxButton'></div></div></div>`;
		parent.append(html);
		const button = $('#' + id);
		const tooltipElement = $('#tooltip_' + id);
		if (translate) {
			tooltipElement.attr('data-translate', translate);
		}
		const background = $('#background_' + id);
		if (mode === 2) {
			background.addClass('nxButtonIconOnly');
			button.addClass('nxButtonIconOnly');
		}
		background.addClass(theme);
		button.addClass(theme);

		/* prevent contextmenu event on button to bubble */
		button.on('contextmenu',function (e) {
			e.stopPropagation();
			e.preventDefault();
		});

		updateState();

		if (style) {
			button.css(style);
		}
		if (frameStyle) {
			background.css(frameStyle);
		}
		if (overlay) {
			background.addClass('nxButtonOverlay');
			setPosition(overlay);
		}

		const pointerHandler = jsPointerHandler.instance;

		pointerHandler.listen(button, {
			callbacks: {
				down: mousedown,
				up: mouseup,
				over: buttonEnter,
				leave: buttonLeave,
				out: mouseout
			},
			hoverClass: 'nxButtonHovered',
			pressClass: 'nxButtonPressed',
			activeClass: 'nxButtonActive'
		});

		if (data['default']) {
			button.addClass('defaultButton');
			button.parent().addClass('defaultButton');
		}
		let active = false;
		if (selected) buttonSelected(true);
		if (disabled) disable();

		function showTooltip() {
			tooltipElement.show();
			const ttWidth = tooltipElement.outerWidth();
			const offset = button.offset();
			const w = button.outerWidth();
			const h = button.outerHeight();
			tooltipElement.css({
				'margin-left': -(ttWidth / 2) + 'px',
				top: (offset.top + h) + 'px',
				left: (offset.left + w / 2) + 'px'
			});
		}

		function buttonEnter(e) {
			debug('buttonenter');
			if (selected || disabled) return;
			if (tooltip) {
				clearTimeout(timer);
				timer = setTimeout(showTooltip, 300);
			}
		}

		function buttonLeave() {
			debug('buttonleave');
			if (selected || disabled) return;
			if (tooltip) {
				clearTimeout(timer);
				timer = null;
				tooltipElement.hide();
			}
		}

		function mousedown(e) {
			debug('mousedown');
			if (selected || disabled) return;
			active = true;
			e.stopPropagation();
			document.activeElement.blur();
		}

		function mouseup(e) {
			debug('mouseup');
			if (active && callback) {
				if (callBackParams === null) {
					if (typeof(value) === 'function') {
						callback.call(this, value.call(this));
					} else {
						callback.call(this, value);
					}
				} else {
					callback.apply(this, callBackParams);
				}
			} else if (active && eventType) {
				let custEvent;
				if (callBackParams === null) {
					if (typeof(value) === 'function') {
						custEvent = new CustomEvent(eventType, {
							detail: value.call(this)
						});
					} else {
						custEvent = new CustomEvent(eventType, {
							detail: value
						});
					}
				} else {
					custEvent = new CustomEvent(eventType, {
						detail: callBackParams
					});
				}
				window.dispatchEvent(custEvent);
			}
			e.stopPropagation();
			active = false;
			if (toggle) state++;
			updateState();
		}

		function mouseout(e) {
			active = false;
		}

		function buttonSelected(newState) {
			debug('buttonSelected');
			selected = newState;
			if (selected) {
				pointerHandler.pause(button);
				active = false;
				button.addClass('nxButtonSelected');

				// in this case we need to clear the classes manually to prevent a graphic glitch as the
				// jsPointerHandler is paused while the classes exist already
				button.removeClass('nxButtonHovered');
				button.removeClass('nxButtonPressed');
				button.removeClass('nxButtonActive');
			} else {
				pointerHandler.resume(button);
				button.removeClass('nxButtonSelected');
			}
			updateState();
		}

		function disable() {
			disabled = true;
			button.addClass('nxButtonDisabled');
			pointerHandler.pause(button);
		}

		function enable() {
			disabled = false;
			button.removeClass('nxButtonDisabled');
			pointerHandler.resume(button);
		}

		function hide(reserveSpace) {
			if (!reserveSpace) {
				background.hide();
			} else {
				background.css('visibility', 'hidden');
			}
		}

		function show() {
			background.show();
			background.css('visibility', 'visible');
		}

		function setPosition(position) {
			if (typeof(position.left) === 'number') position.left += 'px';
			if (typeof(position.left) === 'string') background.css('left', position.left);
			if (typeof(position.right) === 'number') position.right += 'px';
			if (typeof(position.right) === 'string') background.css('right', position.right);
			if (typeof(position.top) === 'number') position.top += 'px';
			if (typeof(position.top) === 'string') background.css('top', position.top);
			if (typeof(position.bottom) === 'number') position.bottom += 'px';
			if (typeof(position.bottom) === 'string') background.css('bottom', position.bottom);
		}

		function setState(v) {
			if (typeof(statesIndex[v]) === 'undefined') {
				console.warn(`nxButton with id "${id}": setState(${v}) failed, unkown state!`);
				return;
			}
			state = statesIndex[v];
			updateState();
		}

		function updateState() {
			if (state >= states.length) state = state % states.length;

			//copy properties of new state to global variables
			callBackParams = states[state].params;
			value = states[state].value;

			//update the look of the button
			button.html('');

			if (mode < 2 && iconPosition === 'right') {
				button.append('<span>' + states[state].label + '</span>');
			}
			if (mode > 0) {
				if (states[state].hoverImage) {
					button.append(states[state].hoverImage);
				}
				if (states[state].selectedImage && selected) {
					button.append(states[state].selectedImage);
				} else {
					button.append(states[state].image);
				}
			}
			if (mode < 2 && iconPosition === 'left') {
				button.append('<span>' + states[state].label + '</span>');
			}

			if (states[state].translate) { // add data-translate attribute
				button.find('span').attr('data-translate', states[state].translate);
			}
		}

		function setLabel(newLabels) {
			if (typeof(newLabels) === 'string') {
				newLabels = [newLabels];	//if a single string is given, create an array with this string as single item
			}
			//check if number of given labels corresponds to number of states, then update labels
			if (newLabels.length && newLabels.length === states.length) {
				for (let i = 0; i < states.length; i++) {
					states[i].label = newLabels[i];
				}
			}
			updateState();
		}

		function getTranslate () {
			return translate;
		}

		function getDisabled () {
			return disabled;
		}

		function getLabel () {
			return button.find('span')[0].innerHTML;
		}

		function setClass(s) {
			button.addClass(s);
			background.addClass(s);
		}

		function clearClass(s) {
			button.removeClass(s);
			background.removeClass(s);
		}

		function destroy() {
			pointerHandler.clear(button);
			tooltipElement.remove();
			background.remove();
		}

		/* functions for use with nxDialog or other widgets that handle keyboard input
		 * nxButton does not have a keyboard listener on its own */

		this.keydown = function () {
			if (selected || disabled) return;
			button.addClass('nxButtonActive');
		};

		this.keyup = function () {
			if (selected || disabled) return;
			button.removeClass('nxButtonActive');
			if (callback) {
				if (callBackParams === null) {
					if (typeof(value) === 'function') {
						callback.call(this, value.call(this));
					} else {
						callback.call(this, value);
					}
				} else {
					callback.apply(this, callBackParams);
				}
			} else if (eventType) {
				let custEvent;
				if (callBackParams === null) {
					if (typeof(value) === 'function') {
						custEvent = new CustomEvent(eventType, {
							detail: value.call(this)
						});
					} else {
						custEvent = new CustomEvent(eventType, {
							detail: value
						});
					}
				} else {
					custEvent = new CustomEvent(eventType, {
						detail: callBackParams
					});
				}
				window.dispatchEvent(custEvent);
			}
			if (toggle) state++;
			updateState();
		};

		this.buttonSelected = buttonSelected;
		this.setPosition = setPosition;
		this.setState = setState;
		this.hide = hide;
		this.show = show;
		this.enable = enable;
		this.disable = disable;
		this.buttonLeave = buttonLeave;
		this.setLabel = setLabel;
		this.getLabel = getLabel;
		this.setClass = setClass;
		this.clearClass = clearClass;
		this.destroy = destroy;
		this.element = background;
		this.getTranslate = getTranslate;
		this.getDisabled = getDisabled;
	}

	function debug(msg) {
		if (!debugMode) return;
		if (console) {
			let ts = performance.now();
			ts = Math.round(ts);
			const ms = lpad(ts % 1000, 2, '0');
			ts = Math.floor(ts / 1000);
			const s = lpad(ts % 60, 2, '0');
			ts = Math.floor(ts / 60);
			const m = lpad(ts % 60, 2, '0');
			ts = Math.floor(ts / 60);
			const h = lpad(ts % 24, 2, '0');

			const tsString = `${h}:${m}:${s}.${ms}: `;
			console.log(tsString + msg);
		}
		if ($('#console').length > 0) {
			$('#console').append(msg + '<br>');
		}
	}

	window.nxButton = nxButton;

})(jQuery);

/*
	*** RELEASE NOTES ***

	v3.08:
		- added runtime translation support: translate property in data object

	v3.10:
		- added getter for translate property

	v3.20:
		- added getter for disabled property

	v3.21:
		- added getter for label

	v3.22:
		- bugfix for touch devices other than iPad

	v3.23:
		- reverting part of the fix in v3.22 as it caused trouble

	v3.24:
		- when clicked force a blur on active element which will be prevented to happen automatically on touch devices by pointer handler

	v3.25:
		- updated to use jsPointerHandler v2.1.0

	v3.26:
		- added missing debug information on mouseup event



	 *** USAGE ***

	 let buttonData = {
		label: <string>,
		callback: <function>,
		value: <string>,
		style: <map>
	 };
	 let b1 = new nxButton(parent, id, buttonData);

	 parent:		jQuery object to contain the new button
	 id:			string of the id the button should receive
	 data:
		 label:			string of text to show on button
		 callback:		the function to call when button is clicked
		 eventType:		the event to dispatch instead of calling a callback function
		 value:			a custom string to send back on activation; necessary to identify the sender if more than one button uses the same handler
		 params:		array of custom parameters to send back on click (value will not be sent if params is used)
		 style:			a javascript object (map) that identifies custom css style
		 icon:			url to image file to be used as icon (if label and icon are defined, the icon will show left of the label and if no label is defined, the icon will be the entire button)
		 symbol:        id of an svg symbol to use as icon. The symbol must be defined in the DOM. This replaces the icon
		 iconHeight:	height of the icon (a number will be interpreted as pixels, a string will be used as CSS string)
		 iconWidth:		width of the icon (a number will be interpreted as pixels, a string will be used as CSS string)
		 iconPosition: 'left' or 'right' => applicabale only if a button has both icon and label
		 overlay:		an object that may contain the properties left, right, top and bottom (as number of pixels or CSS string)
						if overlay is defined, the button will be positioned absolutely with the respective changes to the default position
		 states:		an array of objects with properties label, icon and either value or params
		 toggle:		if TRUE and states are defined, the button will cycle through these states at every click (usually 2 states as toggle button)
		 state:			number that indicates at which state the button is at creation time
		 disabled:		true if button starts in disabled mode
		 default:		boolean that decides if the buttons gets a special look as default button (this is purely cosmetic, keyboard must be handled separately)
		 translate:     key in UILANG translation object

 */