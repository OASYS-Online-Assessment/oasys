/*
 * OASYS static plugin
 *
 * testVariable
 *
 */

"use strict";

(function($) {

	const type = 'oasysTestVariable';

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysTestVariable,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function oasysTestVariable(parent, options, item, currentValue, language) {

		/* mandatory settings */
		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* fallback language handling ... we do not want the language of the fallback here, but the really selected one */
		language = state.language;

		/* replacing */
		if (typeof(test.variables) === 'undefined') {
			console.warn('ERROR: no variables defined');
			return;
		}

		if (typeof(test.variables[options.name]) === 'undefined') {
			console.warn('ERROR: variable not defined', options.name);
			return;
		}
		const details = test.variables[options.name];
		let snippet = '';
		if (details.global === true) {
			const i = getKey(details.text, 0);
			snippet = details.text[i];
		} else {
			if (typeof(details.text[language]) === 'undefined') {
				snippet = `<p>ERROR ... variable <b>${options.name}</b> not defined in this language!</p>`;
			} else {
				snippet = details.text[language];
			}
		}
		parent.replaceWith(snippet);

		return this;

	}

	registerPlugin();

})(jQuery);