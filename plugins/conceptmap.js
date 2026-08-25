/*
 * OASYS static plugin
 * 
 * button
 *   
 */

"use strict";

(function($) {

	let type = 'oasysConceptMap';

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				validResponse: validResponse,
				constructor: oasysConceptMap,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function validResponse(answer, options) {
		return typeof(answer) !== 'undefined';
	}

	function oasysConceptMap(parent, options, item, currentValue, language) {

		/* mandatory settings */
		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* creation */
		options.instance = new nxButton(parent, options.code, {
			label: global_getText('test', "externalEditorButton"),
			callback: core_buttonAction,
			params: ['openConceptMap', {document: getCurrentValue, updateCallback: sendData, question: options.question[language]}]
		});

		function getCurrentValue() {
			if (typeof(answers[item.id][options.id]) !== 'undefined') {
				return answers[item.id][options.id];
			} else {
				return JSON.stringify(options.document);
			}
		}

		function sendData(document) {
			const data = {
				type: 'answer',
				itemId: item.id,
				fieldType: type,
				fieldId: options.id,
				value: JSON.stringify(document),
				language: state.language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft(),
				skipBehaviourLog: true
			};
			core_userEvent(data);
		}

		function hasValue() {
			return validResponse(getCurrentValue(), options);
		}

		return this;

	}

	registerPlugin();

})(jQuery);
