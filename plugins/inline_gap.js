/*
 * OASYS interaction plugin
 * 
 * gap
 *   
 */

"use strict";

(function ($) {

	const type = 'oasysInline_Gap';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysInline_Gap,
				installHooks: installHooks,
				validResponse: validResponse,
				currentResponse: currentResponse,
				scoring: {},
				supportLabels: false,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function installHooks() {
		core_registerUpdateCallback(jsDNDManager.update);
	}

	function currentResponse(id) {
		if (typeof (jsDNDManager.dzList[id]) === 'undefined' || typeof (jsDNDManager.dzList[id].instance) === 'undefined') return;
		const instance = jsDNDManager.dzList[id].instance;
		const objects = instance.getObjects();
		const response = objects.length > 0 ? objects[0].value : '';
		return response;
	}

	/*
		definition of what constitutes a well formatted answer
		depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer, options) {
		if (typeof (answer) === 'string' && answer !== '') {
			return true;
		}
		return false;
	}


	/* test instance of gap */
	function oasysInline_Gap(parent, options, item, currentValue, language) {
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

		let width = window.oasysInlineGapsManager[options.group].draggableWidth + 'px';

		/* creation */
		parent.each(function (idx, span) {
			span = $(span);
			let dndData = {
				id: options.id,
				behaviour: 'default',
				style: {width: width},
				class: 'inlineGap_dz',
				groups: [options.group],
				onFull: 'replace',
				// zIndexBaseValue: 0,
				maxDraggableCount: 1,
				orientation: 'horizontal',
				alignment: {x: 'left', y: 'top'},
				spacing: 0,
				gridSize: 0,
				onDrop: 'beginning',
				acceptClones: false,
				onChange: onChange
			};
			const instance = new jsDropZone(span, dndData);
			if (currentValue) {
				jsDNDManager.findAndMoveDraggableTo({value: currentValue}, options.group, instance, false);
			}
		});

		function onChange(id, objects) {
			const data = {
				itemId: item.id,
				type: 'answer',
				fieldType: type,
				fieldId: id,
				value: objects.length > 0 ? objects[0].value : '',
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
		}


		/* public methods */

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

		return this;

	}

	registerPlugin();

})(jQuery);