/*
 * OASYS interaction plugin
 * 
 * dropdown field
 *   
 */

"use strict";

(function($) {

	const type = 'oasysDropDown';
	let defaultValue;
	let instance;

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysDropDown,
				validResponse: validResponse,
				scoring: {},
				cleanup: cleanUp,
				supportLabels: false,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/*
		definition of what constitutes a well formatted answer
		depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer) {
		return (answer !== defaultValue && typeof(answer) !== 'undefined');
	}

	/* test instance of dropdown */
	function oasysDropDown(parent, options, item, currentValue, language) {
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
		defaultValue = '0';
		const dlData = {
			onChange: onChange,
			elements: options.values[state.questionLanguage],
			initialValue: currentValue,
			readOnly: options.readOnly,
			dataId: options.id,
			width: options.width,
			listTitle: '&nbsp;'
		};
		if (typeof(currentValue) === 'undefined') {
			dlData.initialValue = defaultValue;
		}
		let lastValue = dlData.initialValue;

		//check if skin defines a custom theme for check boxes
		const theme = fetchFromObjPath(skin, ['customCSS', 'jsDL']);
		if (theme) {
			dlData.theme = theme;
		}

		instance = new jsDropList(parent, options.id, dlData);

		if (options.required) state.requiredFields[options.id] = hasValue();

		initObj(window, ['oasysAdvancedDropDowns', options.code, 'handle'], instance);


		/* private methods */

		function onChange(id, value) {
			if (value === lastValue) return;
			sendData(id, value);
			lastValue = value;
		}

		function sendData(id, value) {
			const data = {
				itemId: item.id,
				type: 'answer',
				fieldType: type,
				fieldId: id,
				value: value,
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
		}

		function hasValue() {
			return validResponse(instance.getValue());
		}

		return this;

	}

	function cleanUp() {
		for (let code in window.oasysAdvancedDropDowns) {
			window.oasysAdvancedDropDowns[code].handle.destroy();
		}
		window.oasysAdvancedDropDowns = {};
	}


	registerPlugin();

})(jQuery);