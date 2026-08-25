/*

	jsTextField v1.13
		(c) 2014 by Eric J. Francois

	Usage:

	include the JS file in your HTML document
	instantiate the list with:
		new jsTextField(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			label				string or jQuery obj	the element that will serve to hold the label of the text field
														since the label may not be right before or after the text field, this element is not created here
			labelText			string					the text which must be shown as label
			dataId				string					reference to what the textfield contains (e.g. name of the database field)
														this is sent with the callback; defaults to an empty string
			onInput				function				callback that executes immediately on every change of the field (even if still focussed)
				Returns:
				param 1 => id of the sender
				param 2 => current value of the text field
				param 3 => dirty flag indicating if changes have been made since original value
				param 4 => dataId
			onLockedClick		function				callback for click on field in readOnly mode
				Returns:
				param 1 => id of the sender
				param 2 => current value of the text field
				param 3 => dataId
			width				string or number		either a CSS-style string or the number of pixels for the width of the field
			attribs				map						additional attributes to set (e.g. HTML5 "data-" attributes)
			value				string					default value to enter into the field upon creation, defaults to ''
			readOnly			boolean					enable readOnly mode, defaults to FALSE
			prefix				string					sets an unchangeable prefix for the value in the textfield


	METHODS:
		reset(s)			reset the textfield and set the value to s (optional parameter)
		setLabel(s)			change the label of the textfield to s
		setDataId(s)		change the dataId of the textfield to s
		getDataId()			return the dataId of the textfield
		lock()				enable readOnly mode
		unlock()			disable readOnly mode
		activate()			focus the textfield
		setPrefix(s)		sets a new prefix value

	EXAMPLE:

*/

"use strict";

(function($) {

	function jsTextField(parent, id, options) {

		/* mandatory settings */

		if (typeof(parent) == 'string') {
			parent = $(parent);
		}

		/* optional settings */

		if (!options) options = {};
		let label = options.label ?? null;
		if (typeof(label) == 'string') {
			label = $(label);
		}
		let labelText = options.labelText ?? '';
		const inputCallback = options.onInput ?? null;
		const focusOutCallback = options.onFocusOut ?? null;
		const clickCallback = options.onLockedClick ?? null;
		let dataId = options.dataId ?? '';
		let width = options.width ?? null;
		if (typeof(width) == 'number') {
			width = width + 'px';
		}
		const attribs = options.attribs ?? null;
		let value = options.value ?? '';
		let readOnly = options.readOnly ?? false;
		let prefix = options.prefix ?? '';
		if (prefix) {
			const pattern = new RegExp('^' + escapeForRegex(prefix));
			value = value.replace(pattern, '');
		}


		/* creation */
		let html;
		if (prefix === ''){
			html = `<input type='text' id='${id}' name='${id}' class='jsTextField' /><span id='${id}_disabled' class='jsDisabledFormField'></span>`;
		} else {
			html = `<span id='${id}_Prefix' class='jsTextFieldPrefix'>${prefix}</span><input type='text' id='${id}' name='${id}' class='jsTextField' /><span id='${id}_disabled' class='jsDisabledFormField'></span>`;
		}
		parent.append(html);
		const element = $('#' + id);
		const disabledElement = $(`#${id}_disabled`);
		const prefixCell = $(`#${id}_Prefix`);
		element.val(value);
		disabledElement.html(value);
		if (clickCallback) {
			disabledElement.addClass('clickable');
		}
		if (readOnly) lock(); else unlock();
		if (label) {
			label.html(labelText);
		}
		if (width) {
			element.css('width', width);
		}
		if (attribs) {
			for (let k in attribs) {
				let v = attribs[k];
				element.attr(k, v);
			}
		}
		let originalValue = value;
		let dirty = false;
		element.on({input: onInput, focusout:onFocusOut});
		disabledElement.on({click: onClick});
		const self = this;

		/* event handler */

		function onFocusOut(e){
			if (focusOutCallback) {
				focusOutCallback.call(self, id, prefix + value, dirty, dataId);
			}
		}

		function onInput(e) {
			value = element.val();
			disabledElement.html(value);
			if (value === originalValue) {
				dirty = false;
			} else {
				dirty = true;
			}
			if (inputCallback) {
				inputCallback.call(self, id, prefix + value, dirty, dataId);
			}
		}

		function onClick(e) {
			if (clickCallback) {
				clickCallback.call(self, id, prefix + value, dataId);
			}
		}

		/* public methods */

		function reset(v) {
			//resets text field and optionally fill in the value v
			if (prefix) {
				//if prefix is set, remove it from the start of the value to be filled in
				const rx = new RegExp("^" + escapeForRegex(prefix));
				v = v.replace(rx, '');
			}
			value = v ?? '';
			originalValue = value;
			element.val(value);
			disabledElement.html(value);
			dirty = false;
		}

		function setPrefix(s) {
			prefix = s ?? '';
			prefixCell.html(prefix);
		}

		function setLabel(newLabelText) {
			labelText = newLabelText ?? '';
			if (label) {
				label.html(labelText);
			}
		}

		function setDataId(newDataId) {
			dataId = newDataId;
		}

		function getDataId() {
			return dataId;
		}

		function lock() {
			readOnly = true;
			element.hide();
			disabledElement.show();
		}

		function unlock() {
			readOnly = false;
			element.show();
			disabledElement.hide();
		}

		function activate() {
			element.trigger('focus');
		}

		/* private methods */

		function escapeForRegex(str) {
			return str.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
		}

		//export methods
		this.reset = reset;
		this.setLabel = setLabel;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.lock = lock;
		this.unlock = unlock;
		this.activate = activate;
		this.setPrefix = setPrefix;
		this.element = element;		//expose the jQuery element of the textfield for advanced manipulation

	}

	//export class
	window.jsTextField = jsTextField;

})(jQuery);
