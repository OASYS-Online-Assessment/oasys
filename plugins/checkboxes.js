/*
 * OASYS interaction plugin
 *
 * checkbox group
 *
 */

"use strict";

(function ($) {

	const type = 'oasysCheckBox';

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysCheckBox,
				cleanup: cleanUp,
				validResponse: validResponse,
				preProcessing: preProcessing,
				scoring: {},
				multipleInstancesAllowed: true,
				supportLabels: true,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function preProcessing(options) {
		//options is transmitted by reference and will be updated in its original position (test.items[iId].fields[fId])
		/* rules for required answer */
		if (typeof (options.maxRequired) === 'undefined') {
			options.maxRequired = -1;
		}
		if (typeof (options.minRequired) === 'undefined') {
			options.minRequired = 1;
		}
		if (options.rule) {
			const matches = options.rule.match(/^([<>])?\s*(\d+)\s*(\.{2})?\s*(\d+)?\s*([+\-])?$/);
			if (!matches) return;
			if (matches[1] === '<') options.maxRequired = parseInt(matches[2]) - 1;
			else if (matches[1] === '>') options.minRequired = parseInt(matches[2]) + 1;
			else if (matches[5] === '+') options.minRequired = parseInt(matches[2]);
			else if (matches[5] === '-') options.maxRequired = parseInt(matches[2]);
			else if (typeof(matches[3]) !== 'undefined' && typeof(matches[4]) !== 'undefined') {
				options.minRequired = parseInt(matches[2]);
				options.maxRequired = parseInt(matches[4]);
			} else {
				options.minRequired = parseInt(matches[2]);
				options.maxRequired = parseInt(matches[2]);
			}
		}
	}

	/*
	 definition of what constitutes a well formatted answer
	 depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer, options) {
		if (typeof (answer) === 'string' && answer !== '') {
			answer = JSON.parse(answer);
		}
		if (answer instanceof Array) {
			if (answer.length >= options.minRequired && (answer.length <= options.maxRequired || options.maxRequired === -1)) {
				return true;
			}
		}
		return false;
	}


	/* test instance of checkbox */
	function oasysCheckBox(parent, options, item, currentValue, language) {
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
		if (typeof (currentValue) === 'string' && currentValue !== '') {
			currentValue = JSON.parse(currentValue);
		} else {
			currentValue = [];
		}
		const jsmcData = {
			type: 'cb',
			onChange: sendData,
			initialValue: currentValue,
			dataId: code,
			clickableParent: options.clickableParent ?? null
		};

		if (options.height) {
			jsmcData.height = options.height;
		}

		if (options.max > 0) {
			jsmcData.maxClickableCB = options.max;
		}

		//check if skin defines a custom theme for check boxes
		const theme = fetchFromObjPath(skin, ['customCSS', 'jsMC']);
		if (theme) {
			jsmcData.theme = theme;
		}

		parent.each(function (idx, span) {
			span = $(span);
			const value = span.attr('data-value');
			initObj(jsmcData, ['elements', value], {});
			jsmcData.elements[value].elementParent = span;
			jsmcData.elements[value].value = decodeHex(value.toString()); //prevent second hex encoding inside widget
			const label = $(`span.oasysLabel[data-id="${options.code}"][data-value="${value}"]`);
			if (label.length > 0) {
				const labelContents = label.html();
				label.html("");
				jsmcData.elements[value].labelParent = label;
				jsmcData.elements[value].label = labelContents;
			}
		});

		parent.html("");
		const groupInstance = new jsMultipleChoice(code, jsmcData);
		initObj(window, ['oasysCheckBoxGroups', code, 'handle'], groupInstance);
		initObj(window, ['oasysCheckBoxGroups', code, 'value'], currentValue);
		if (options.required) state.requiredFields[options.id] = hasValue();

		/* private methods */
		function sendData(code, value) {
			window.oasysCheckBoxGroups[code].value = value;

			const data = {
				type: 'answer',
				itemId: item.id,
				fieldType: type,
				fieldId: group,
				value: JSON.stringify(value),
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
		}

		function hasValue() {
			return validResponse(fetchFromObjPath(window, ['oasysCheckBoxGroups', code, 'value']), options);
		}

		return this;

	}

	function cleanUp() {
		window.oasysCheckBoxGroups = {};
	}


	registerPlugin();

})(jQuery);