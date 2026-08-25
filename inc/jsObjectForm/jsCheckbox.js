/*

	jsCheckbox v1.1.1
		(c) 2014-2024 by Eric J. Francois

	DESCRIPTION:
		implements a single checkbox

	USAGE:

	include the JS file in your HTML document
	instantiate the list with:
		new jsCheckbox(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			checked				boolean					indicates if the checkbox should be checked after creation
			label				string or jQuery obj	the element that will serve to hold the label of the checkbox
														since the label may not be right before or after the checkbox, this element is not created here
			labelText			string					the text which must be shown as label
			dataId				string					reference to what the spinner contains (e.g. name of the database field)
														this is sent with the callback; defaults to an empty string
			onChange			function				callback for the onchange event
				Returns:
				param 1 => id of the sender
				param 2 => current state of the checkbox
				param 3 => dirty flag indicating if changes have been made since original value
				param 4 => dataId
			attribs				object					additional attributes to set (e.g. HTML5 "data-" attributes)
			readOnly			boolean					enable readOnly mode, defaults to FALSE


	METHODS:
		reset(c)			reset the checkbox (clear undo, redo and state) and set the state to the boolean c (optional parameter)
		setLabel(s)			change the label of the checkbox to s
		setDataId(s)		change the dataId of the checkbox to s
		getDataId()			return the dataId of the checkbox
		lock()				enable readOnly mode
		unlock()			disable readOnly mode
		activate()			simulate a click on the checkbox

*/

"use strict";

(function($) {

	function jsCheckbox(parent, id, options) {

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
		let checked = options.checked ?? false;

		/* creation */
		const html = `<input type='checkbox' id='${id}' name='${id}' />`;
		parent.append(html);
		const element = $('#' + id);

		element.prop('checked', checked);
		element.prop('disabled', readOnly);
		if (label) {
			label.html(labelText);
		}
		if (options.attribs) {
			for (let k in options.attribs) {
				let v = options.attribs[k];
				element.attr(k, v);
			}
		}

		let originalValue = checked;
		let dirty = false;
		element.on({click: onClick, change: onChange});
		const self = this;


		/* event handling */

		function onChange(e) {
			checked = element.prop('checked');
			if (checked === originalValue) {
				dirty = false;
			} else {
				dirty = true;
			}
			if (changeCallback) {
				changeCallback.call(self, id, checked, dirty, dataId);
			}
		}

		function onClick(e) {
			/* if checkbox occurs in a parent element that forwards clicks to the checkbox,
			   this prevents a click occurring on the checkbox itself to bubble upwards
			   and trigger the parent as well, which would result in having the checkbox toggled twice */
			e.stopImmediatePropagation();
		}

		/* publics methods */

		function reset(c) {
			//resets field and optionally set it to the state c
			checked = c ?? false;
			originalValue = checked;
			element.prop('checked', checked);
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
			element.prop('disabled', readOnly);
		}

		function unlock() {
			readOnly = false;
			element.prop('disabled', readOnly);
		}

		function activate() {
			element.trigger('click');
		}

		/* export methods */
		this.reset = reset;
		this.setLabel = setLabel;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.lock = lock;
		this.unlock = unlock;
		this.activate = activate;

	}

	/* export class */
	window.jsCheckbox = jsCheckbox;

})(jQuery);
