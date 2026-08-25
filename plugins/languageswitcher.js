/*
 * OASYS interaction plugin
 * 
 * dropdown field
 *   
 */

"use strict";

(function($) {

	const type = 'oasysLanguageSwitcher';
	let defaultValue;
	let instance;

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysLanguageSwitcher,
				cleanup: cleanUp,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/* test instance of dropdown */
	function oasysLanguageSwitcher(parent, options, item, currentValue, language) {
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
		const elements = [];
		let languageOptions = core_getLanguageOptions();
		for (let code of languageOptions) {
			const entry = {value: code};
			entry.label = languages[code].name;
			elements.push(entry);
		}
		
		const dropListOptions = {
			elements: elements,
			order: 'label',
			theme: 'languageSelector',
			initialValue: language,
			dataId: 'languageCode',
			readOnly: false,
			onChange: (source, value, dirtyFlag, dataId) => core_switchLanguage(value),
			width: '180px'
		};

		// check if skin defines a custom theme for check boxes
		const theme = fetchFromObjPath(skin, ['customCSS', 'jsDL']);
		if (theme) {
			dropListOptions.theme = theme;
		}

		instance = new jsDropList(parent, options.id, dropListOptions);

		initObj(window, ['oasysLanguageSwitchers', options.code, 'handle'], instance);
		return this;

	}

	function cleanUp() {
		for (let code in window.oasysLanguageSwitchers) {
			window.oasysLanguageSwitchers[code].handle.destroy();
		}
		window.oasysLanguageSwitchers = {};
	}

	registerPlugin();

})(jQuery);