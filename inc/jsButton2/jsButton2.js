/*

	jsButton2	v1.22
		(c) 2014 by Eric J. Francois

	Usage:

	include the CSS and the JS file in your HTML document
	instantiate the button with:
		new jsButton2(parent, id, options);

	PARAMETERS:
		parent:		name of parent HTML element or jQuery object
		id:			id for the new button
		options:	an object with the following options
			icons:		map			a list of icons that will be used for this button
			labels:		map			a list of labels to be used for this button, the keys must be the same as for the icons
			mode:		string		the key of the icon and label to be used at creation time
			icon:		string		URL of the icon file, relative to the HTML document (mandatory); alternative to defining multiple icons and a mode
			label:		string		label of the button; alternative to defining multiple labels and a mode
			iconWidth:	integer		width for displaying the icon, necessary when supporting retina icons (optional / default = image width)
			width:		integer		width of the complete button with the label (optional / default = auto)
			height:		integer		height of the complete button with the label (optional / default = auto)
									if several buttons are in a row it's recommended to set the height, so that all buttons fit together
			callback:	function	function to be called when button is clicked (optional / default => nothing happens when clicking the button)
									the callback function gets 1 parameter: the id of the sender
			disabled:	boolean		set to true to disable the button right after creation (optional / default = false)
			hidden:		boolean		sets display to 'none' after creation

	RETURNS:
		instance of the button

	EXAMPLE:
		var saveButton = new jsButton2('controls', 'bSave', {
	 		label: 'save',
	 		icon: '../../images/save.png',
			iconWidth: 48,
	 		width: 80,
	 		height: 100,
	 		callback: function(sender) {alert(sender);},
	 		disabled: false
	     });

	METHODS:
		disable():					disable the button, it will show grayscaled
		enable():					enable the button if it was previously disabled
		hide():						completely hide the button (display: none)
		show():						show hidden button
		trigger():					trigger the button as if it had been clicked
		switchMode(s): 				sets the label and icon to mode s; only if icons and labels maps have been defined at creation
		isActive(): 				returns true if button is not hidden nor disabled

*/

"use strict";

(function($) {

	function jsButton2(parent, id, options) {

		if (typeof(parent) == 'string') {
			parent = $('parent');
		}
		let mode = options.mode || null;
		let labels = options.labels || null;
		let iconURLs = options.icons || null;
		if (!labels || !iconURLs) {
			mode = null;
		}
		let label;
		let iconURL;
		const icons = {};
		if (!mode) {
			label = options.label || '';
			iconURL = options.icon;
			mode = 'default';
			labels = {'default' : label};
			iconURLs = {'default' : iconURL};
		} else {
			label = labels[mode];
		}
		const iconWidth = options.iconWidth || null;
		const width = options.width || null;
		const height = options.height || null;
		const callback = options.callback || null;
		let disabled = options.disabled || false;
		let hidden = options.hidden || false;

		const html = `<div id='${id}' class='jsButton2'><div id='${id}_icon' class='jsButton2Icon'></div></div>`;
		$(parent).append(html);
		const element = $('#' + id);
		let labelDiv = null;
		if (label !== '') {
			element.append(`<div id='${id}_label' class='jsButton2Label'>${label}</div>`);
			labelDiv = $(`#${id}_label`);
		}

		for (let i in iconURLs) {
			icons[i] = new Image();
			icons[i].src = iconURLs[i];
			if (iconWidth) {
				icons[i].width = iconWidth;
			}
		}
		const iconDiv = $(`#${id}_icon`);
		iconDiv.html(icons[mode]);
		if (disabled) {
			element.addClass('jsbDisabled');
		}

		if (width) element.css('width', width + 'px');
		if (height) element.css('height', height + 'px');
		element.on("click", clicked);
		element.on('dragstart', false);		//prevent icon from deing dragged
		if (hidden) {
			hide();
		}

		function disable() {
			element.addClass('jsbDisabled');
			disabled = true;
		}

		function enable() {
			element.removeClass('jsbDisabled');
			disabled = false;
		}

		function clicked(e) {
			if (disabled) return;
			if (callback) callback.call(this, id);
		}

		function hide() {
			element.hide();
			hidden = true;
		}

		function show() {
			element.show();
			hidden = false;
		}

		function switchMode(newMode) {
			mode = newMode;
			iconDiv.html(icons[mode]);
			setLabel(labels[mode]);
		}

		function setLabel(newLabel) {
			if (newLabel && newLabel !== '') {	//if the new label is not empty
				if (!labelDiv) {				//if the old label was empty, create a new label from scratch
					element.append(`<div id='${id}_label' class='jsButton2Label'>${newLabel}</div>`);
					labelDiv = $(`#${id}_label`);
				} else {						//if the old label was not empty change the text
					labelDiv.html(newLabel);
				}
			} else {							//if the new label is empty
				if (label !== '') {				//if the old label was not empty, remove the label altogether
					labelDiv.remove();
					labelDiv = null;
				}
			}
			label = newLabel;
		}

		function isActive() {
			return (!disabled && !hidden);
		}

		//export methods
		this.enable = enable;
		this.disable = disable;
		this.trigger = clicked;
		this.hide = hide;
		this.show = show;
		this.switchMode = switchMode;
		this.isActive = isActive;
	}

	//export class
	window.jsButton2 = jsButton2;

})(jQuery);
