/*

	jsDropdown v1.3.1
		(c) 2014-2024 by Eric J. Francois

	DESCRIPTION:
		implements a single dropdown

	USAGE:

	include the JS file in your HTML document
	instantiate the list with:
		new jsDropdown(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			values				array					all the values to show in the dropdown in an array of objects with the properties 'value' and 'label'
			value				string					indicates the selected value after creation
			label				string or jQuery obj	the element that will serve to hold the label of the dropdown
														since the label may not be right before or after the dropdown, this element is not created here
			labelText			string					the text which must be shown as label
			dataId				string					reference to what the spinner contains (e.g. name of the database field)
														this is sent with the callback; defaults to an empty string
			onChange			function				callback for the onchange event
				Returns:
				param 1 => id of the sender
				param 2 => current value of the dropdown
				param 3 => dirty flag indicating if changes have been made since original value
				param 4 => dataId
			attribs				object					additional attributes to set (e.g. HTML5 "data-" attributes)
			readOnly			boolean					enable readOnly mode, defaults to FALSE
			css					object					a dictionary with css styles to apply


	METHODS:
		reset(c)						reset the dropdown (clear undo, redo and state) and set the state to the state c (optional parameter)
		setValues(newValues, newValue)	replaces options by the ones defined in newValues and selects the newValue option
		setLabel(s)						change the label of the dropdown to s
		setDataId(s)					change the dataId of the dropdown to s
		getDataId()						return the dataId of the dropdown
		lock()							enable readOnly mode
		unlock()						disable readOnly mode
		getValue()						returns the current value

*/

"use strict";

(function($) {

	function jsDropdown(parent, id, options) {

		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) options = {};
		let label = options.label ?? null;
		if (typeof(label) === 'string') {
			label = $(label);
		}
		let labelText = options.labelText ?? '';
		const changeCallback = options.onChange ?? null;
		let dataId = options.dataId ?? '';
		const attribs = options.attribs ?? null;
		let readOnly = options.readOnly ?? false;
		let values = options.values ?? [{value: '', label: ''}];
		let value = values[0].value;
		const css = options.css ?? null;
		if (typeof(options.value) !== 'undefined') value = options.value;
		

		/* creation */
		const html = `<select id='${id}' name='${id}' /><span id='${id}_disabled' class='jsDisabledFormField'></span>`;
		parent.append(html);
		const element = $('#' + id);
		const disabledElement = $(`#${id}_disabled`);

		for (let i in values) {
			element.append(`<option value='${values[i].value}'>${values[i].label}</option>`);
		}

		element.val(value);
		disabledElement.html(getValueLabel());
		if (css) {
			element.css(css);
			disabledElement.css(css);
		}
		if (readOnly) lock(); else unlock();
		if (label) {
			label.html(labelText);
		}
		if (options.attribs) {
			for (let k in options.attribs) {
				let v = options.attribs[k];
				element.attr(k, v);
			}
		}

		let originalValue = value;
		let dirty = false;
		element.on({click: onClick, change: onChange});
		const self = this;


		/* event handling */

		function onChange(e) {
			value = element.val();
			disabledElement.html(getValueLabel());
			if (value === originalValue) {
				dirty = false;
			} else {
				dirty = true;
			}
			if (changeCallback) {
				changeCallback.call(self, id, value, dirty, dataId);
			}
		}

		function onClick(e) {
			/* if dropdown occurs in a parent element that forwards clicks to the dropdown,
			   this prevents a click occurring on the dropdown itself to bubble upwards
			   and trigger the parent as well, which would result in having the dropdown toggled twice */
			e.stopImmediatePropagation();
		}


		/* private methods */
		
		function getValueLabel() {
			const obj = fetchObjectFromArray(values, {value: value});
			if (obj === false) {
				return '';
			} else {
				return obj.label;
			}
		}

		/* publics methods */
		
		function setValues(newValues, newValue) {
			values = newValues ?? [{value: '', label: ''}];		//insert new values, or if none are given insert an empty one
			if (newValue !== null) {							//if a new value is given, set it, otherwise keep the old one
				value = newValue;
				originalValue = newValue;
			}
			if (!fetchObjectFromArray(values, {value: value})) {	//check if the given (or old) value exists in new values list ...
				value = values[0].value;							//... and fallback to first from list if not
			}
			element.html('');									//clear old options
			for (let i in values) {
				element.append(`<option value='${values[i].value}'>${values[i].label}</option>`);
			}
			element.val(value);
			disabledElement.html(getValueLabel());
		}

		function getValue() {
			return value;
		}

		function reset(c) {
			//resets field and optionally set it to the state c
			value = c ?? false;
			originalValue = value;
			element.val(value);
			disabledElement.html(getValueLabel);
			dirty = false;
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

		/* export methods */
		this.reset = reset;
		this.setLabel = setLabel;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.lock = lock;
		this.unlock = unlock;
		this.setValues = setValues;
		this.getValue = getValue;

	}

	/* export class */
	window.jsDropdown = jsDropdown;

})(jQuery);
