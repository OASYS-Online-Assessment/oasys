/*

	jsSpinner v1.2
		(c) 2014-2024 by Eric J. Francois

	Usage:

	include the JS file in your HTML document
	instantiate the list with:
		new jsSpinner(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			label				string or jQuery obj	the element that will serve to hold the label of the text field
														since the label may not be right before or after the text field, this element is not created here
			labelText			string					the text which must be shown as label
			dataId				string					reference to what the spinner contains (e.g. name of the database field)
														this is sent with the callback; defaults to an empty string
			onInput				function				callback that executes immediately on every change of the field (even if still focussed)
				Returns:
				param 1 => id of the sender
				param 2 => current value of the text field
				param 3 => dirty flag indicating if changes have been made since original value
				param 4 => dataId
			width				string or number		either a CSS-style string or the number of pixels for the width of the field
			attribs				map						additional attributes to set (e.g. HTML5 "data-" attributes)
			value				number					default value to enter into the field upon creation, defaults to 0
			max					number					maximum number allowed
			min					number					minimum number allowed
			step				number					step to use when incrementing or decrementing
			readOnly			boolean					enable readOnly mode, defaults to FALSE


	METHODS:
		reset(s)			reset the spinner (clear undo, redo and value) and set the value to s (optional parameter)
		setLabel(s)			change the label of the spinner to s
		setDataId(s)		change the dataId of the spinner to s
		getDataId()			return the dataId of the spinner
		lock()				enable readOnly mode
		unlock()			disable readOnly mode
		activate()			focus the spinner
		setMax(v)			changes the max to v
		setMin(v)			changes the min to v
		setStep(v)			changes the step to v

	NOTES:
		since this uses the oninput event, it will not work in IE < 9 (and even in IE9 support is apparently buggy)

*/

"use strict";

(function($) {

	function jsSpinner(parent, id, options) {

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
		let dataId = options.dataId ?? '';
		let width = options.width ?? null;
		let max = options.max;
		let min = options.min;
		let step = options.step ?? 1;
		if (typeof(width) == 'number') {
			width = width + 'px';
		}
		const attribs = options.attribs ?? null;
		let value = options.value ?? '';
		let readOnly = options.readOnly ?? false;


		/* creation */

		const html = `<input type='number' id='${id}' name='${id}' class='jsSpinner' step='${step}' /><span id='${id}_disabled' class='jsDisabledFormField' style='text-align: right;'></span>`;
		parent.append(html);
		const element = $('#' + id);
		const disabledElement = $(`#${id}_disabled`);
		element.val(value);
		disabledElement.html(value);
		if (readOnly) lock(); else unlock();
		if (label) {
			label.html(labelText);
		}
		if (width) {
			element.css('width', width);
		}
		//if min resp. max are set (non zero or integer zero, but not null or undefined), set them on the element
		if (min || min === 0) {
			element.prop('min', min);
		}
		if (max || max === 0) {
			element.prop('max', max);
		}
		if (attribs) {
			for (let k in attribs) {
				let v = attribs[k];
				element.attr(k, v);
			}
		}
		let originalValue = '';
		let dirty = false;
		const self = this;

		/* event handler */

		function onInput(e) {
			value = element.val();
			disabledElement.html(value);
			if (min || min === 0) {
				if (value < min) value = min;
				element.val(value);
				disabledElement.html(value);
			}
			if (max || max === 0) {
				if (value > max) value = max;
				element.val(value);
				disabledElement.html(value);
			}
			if (value === originalValue) {
				dirty = false;
			} else {
				dirty = true;
			}
			if (inputCallback) {
				inputCallback.call(self, id, value, dirty, dataId);
			}
		}

		/* public methods */

		function reset(v) {
			//resets text field and optionally fill in the value v
			value = v ?? '';
			originalValue = value;
			element.val(value);
			disabledElement.html(value);
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

		function activate() {
			element.trigger('focus');
		}

		function setMax(v) {
			max = v;
			element.attrib('max', max);
		}

		function setMin(v) {
			min = v;
			element.attrib('min', min);
		}

		function setStep(v) {
			step = v;
			element.attrib('step', step);
		}

		//export methods
		this.reset = reset;
		this.setLabel = setLabel;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.lock = lock;
		this.unlock = unlock;
		this.activate = activate;
		this.setMax = setMax;
		this.setMin = setMin;
		this.setStep = setStep;
		this.element = element;		//expose the jQuery element of the spinner for advanced manipulation

	}

	//export class
	window.jsSpinner = jsSpinner;

})(jQuery);
