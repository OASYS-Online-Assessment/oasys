/*
 * OASYS interaction plugin
 * 
 * textfield
 *   
 */

"use strict";

(function ($) {

	const type = 'oasysInline_Textfield';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysInline_Textfield,
				validResponse: validResponse,
				scoring: {},
				supportLabels: true,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/*
		definition of what constitutes a well formatted answer
		depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer, options) {
		return (typeof (answer) === 'string' && answer.length > 0);
	}


	/* test instance of textfield */
	function oasysInline_Textfield(parent, options, item, currentValue, language) {
		/*
		 parent:			string or jQuery object		container element for this object
		 options:			object						structure depends on properties of plugin (see above)
		 item:	{
		 -			id:		int							id of current item in database
		 -			code:	string						item code set in item manager
		 }
		 currentValue:		string						may need to be parsed to number, boolean, object depending on plugin
		 */

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* creation */
		parent.each(function (idx, span) {
			span = $(span);
			let align = options.align ?? 'center';
			const html = `<input autocomplete="off" id='${options.code}' name='${options.code}' type='text' class="${align}Align">`;
			span.html(html);
		});

		const element = $('#' + options.code);
		element.width(options.width);
		element.css('max-width', options.maxwidth);
		let lastValue = options.value;
		if (typeof (currentValue) !== 'undefined' && currentValue !== null) {
			lastValue = currentValue;
		}
		element.val(lastValue);
		if (options.required) state.requiredFields[options.id] = hasValue();
		if (options.placeholder) element.attr('placeholder', options.placeholder[language]);
		element.on({
			focus: onFocus,
			input: onInput,
			blur: onBlur,
			keydown: onKeydown
		});

		/* public methods */
		function focus() {
			//this method will be called when a label is clicked
			element.trigger('focus');
		}

		/* private methods */
		function onFocus(e) {
			state.fieldBeingEdited = options.id;
		}

		function onInput(e) {
			//every letter typed will be sent to answers and field requirements will update, but data will not be pushed to queue yet
			if (options.pattern) {
				if (element.val() && !element.val().match(options.pattern)) {
					element.val(lastValue);
				} else {
					sendData();
					lastValue = element.val();
				}
			}
			sendData();
		}

		function onKeydown(e) {
			if (e.which === 13) {
				element.trigger('blur');
			}
		}

		function sendData() {
			const data = {
				type: 'answer',
				itemId: item.id,
				fieldType: type,
				fieldId: options.id,
				value: element.val(),
				editInProgress: true
			};
			core_userEvent(data);
		}

		function hasValue() {
			return validResponse(element.val(), options);
		}

		function onBlur(e) {
			/*
				textfield value will only be pushed to queue when input field loses focus
				the first step is to get the package number for this data and increment the global counter
			 */
			const data = {
				itemId: item.id,
				type: 'answer',
				fieldType: type,
				fieldId: options.id,
				value: element.val(),
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
			if (state.fieldBeingEdited === options.id) {
				state.fieldBeingEdited = false;
			}
		}

		function clear() {
			element.val("");
			element.trigger('blur');
		}

		/* export methods */
		this.focus = focus;
		this.clear = clear;

		return this;

	}

	registerPlugin();

})(jQuery);