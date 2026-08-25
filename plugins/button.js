/*
 * OASYS static plugin
 * 
 * button
 *   
 */

"use strict";

(function($) {

	const type = 'oasysButton';

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				cleanup: cleanUp,
				constructor: oasysButton,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function oasysButton(parent, options, item, currentValue, language) {

		// console.log('oasysButton', parent, options, item, currentValue, language);

		/* mandatory settings */
		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* creation */
		if (typeof(window.oasysButtonManager) === 'undefined') {
			window.oasysButtonManager = {
				instances: {}
			};
		}

		let params = null;

		if (options.action === 'switchLanguage') {
			if (options.language === language) {
				//if button is supposed to switch to the language which is already active, don't create button
				if (parent.hasClass("buttonInteraction")) {
					parent.parent().hide();
				}
				return;
			}
			params = [options.action, {language: options.language}];
		} else if (options.action === 'nextPage' || options.action === 'previousPage') {
			params = [options.action, {force: options.ignoreNavigationConstraints ?? false}];
		}

		let buttonSettings = {
			label: options.label[language],
			callback: core_buttonAction,
			disabled: options.action === 'endTest' && options.disableOnTestIncomplete
		};

		if (params !== null) {
			buttonSettings.params = params;
		} else {
			buttonSettings.value = options.action;
		}

		options.instance = new nxButton(parent, options.code, buttonSettings);

		if (options.action === 'nextPage' || options.action === 'previousPage') {
			butler_registerButton(options.action, options.instance, {force: options.ignoreNavigationConstraints ?? false});
		} else if (options.action === 'endTest' && options.disableOnTestIncomplete) {
			updateState();
			registerHook();
		}

		function registerHook() {
			core_registerHook('userEvent', options.code, updateState);
			window.oasysButtonManager.instances[options.code] = options.instance;
		}

		function updateState() {
			if (state.testComplete) {
				options.instance.enable();
			} else {
				options.instance.disable();
			}
		}

		return this;

	}

	function cleanUp() {
		butler_clearButtons();
		if (typeof (window.oasysButtonManager?.instances) === 'undefined') {
			return;
		}
		for (let code in window.oasysButtonManager.instances) {
			core_removeHook('userEvent', code);
		}
		window.oasysButtonManager.instances = {};
	}

	registerPlugin();

})(jQuery);