/*
 * OASYS interaction plugin
 *
 * radiobutton group
 *
 */

"use strict";

(function ($) {

	const type = 'oasysRadioButton';

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysRadioButton,
				cleanup: cleanUp,
				validResponse: validResponse,
				scoring: {},
				multipleInstancesAllowed: true,
				supportLabels: true,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/*
	 definition of what constitutes a well formatted answer
	 depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer) {
		return (answer !== "" && answer !== null && typeof (answer) !== 'undefined');
	}


	/* test instance of radiobutton */
	function oasysRadioButton(parent, options, item, currentValue, language) {
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
		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* creation */
		const group = options.id;
		const code = options.code;
		if (typeof (currentValue) === 'undefined') {
			currentValue = "";
		}
		const jsmcData = {
			type: 'rb',
			onChange: sendData,
			initialValue: currentValue,
			dataId: options.code,
			clickableParent: options.clickableParent ?? null
		};

		if (options.height) {
			jsmcData.height = options.height
		}

		//check if skin defines a custom theme for radiobuttons
		const theme = fetchFromObjPath(skin, ['customCSS', 'jsMC']);
		if (theme) {
			jsmcData.theme = theme;
		}

		parent.each(function (idx, span) {
			span = $(span);
			const value = span.attr('data-value');
			initObj(jsmcData, ['elements'], []);
			let element = {
				elementParent: span,
				value: decodeHex(value.toString()) //prevent value from being hex encoded a second time in widget
			};
			const label = $(`span.oasysLabel[data-id="${options.code}"][data-value="${value}"]`);
			if (label.length > 0) {
				const labelContents = label.html();
				label.html("");
				element.labelParent = label;
				element.label = labelContents;
			}
			jsmcData.elements.push(element);
		});

		parent.html("");
		const groupInstance = new jsMultipleChoice(code, jsmcData);
		initObj(window, ['oasysRadioButtonGroups', code, 'handle'], groupInstance);
		initObj(window, ['oasysRadioButtonGroups', code, 'value'], currentValue);
		if (options.required) state.requiredFields[options.id] = hasValue();

		/* private methods */
		function sendData(code, value) {
			window.oasysRadioButtonGroups[code].value = value;
			const data = {
				type: 'answer',
				itemId: item.id,
				fieldType: type,
				fieldId: group,
				value: value,
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
		}

		function hasValue() {
			return validResponse(fetchFromObjPath(window, ['oasysRadioButtonGroups', code, 'value']));
		}

		return this;

	}

	function cleanUp() {
		window.oasysRadioButtonGroups = {};
	}

	registerPlugin();

})(jQuery);