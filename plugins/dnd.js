/*
 * OASYS interaction plugin
 * 
 * dragAndDrop
 *   
 */

"use strict";

(function ($) {

	const type = 'oasysDND';
	let instance;
	let initializing = false;

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysDND,
				cleanup: cleanUp,
				installHooks: installHooks,
				validResponse: validResponse,
				preProcessing: preProcessing,
				currentResponse: currentResponse,
				scoring: {},
				supportLabels: false,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function preProcessing(options) {
		//options is transmitted by reference and will be updated in its original position (test.items[iId].fields[fId])
		/* rules for required answer */
		options.minRequired = 1;
		options.maxRequired = -1;
		if (options.rule) {
			const matches = options.rule.match(/^([<>])?\s*(\d+)\s*(\.{2})?\s*(\d+)?\s*([+\-])?$/);
			if (!matches) return;
			if (matches[1] === '<') options.maxRequired = parseInt(matches[2]) - 1;
			else if (matches[1] === '>') options.minRequired = parseInt(matches[2]) + 1;
			else if (matches[5] === '+') options.minRequired = parseInt(matches[2]);
			else if (matches[5] === '-') options.maxRequired = parseInt(matches[2]);
			else if (typeof (matches[3]) !== 'undefined' && typeof (matches[4]) !== 'undefined') {
				options.minRequired = parseInt(matches[2]);
				options.maxRequired = parseInt(matches[4]);
			} else {
				options.minRequired = parseInt(matches[2]);
				options.maxRequired = parseInt(matches[2]);
			}
		}
	}

	/*
		This installs a hook so that draggable positions are updated when the dropzones move (absolutely seen)
	 */
	function installHooks() {
		core_registerUpdateCallback(jsDNDManager.update);
	}

	function currentResponse(id) {
		if (typeof (jsDNDManager.dzList[id]) === 'undefined' || typeof (jsDNDManager.dzList[id].instance) === 'undefined') return;
		const instance = jsDNDManager.dzList[id].instance;
		const objects = instance.getObjects();
		const response = [];
		for (let i in objects) {
			response.push(objects[i].value);
		}
		return JSON.stringify(response);
	}

	/*
		definition of what constitutes a well formatted answer
		depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer, options) {
		/*
			A dropzone is special in the case that some dropzones start with draggables and must not contain any in the
			end. Such a dropzone which has a maxRequired of 0 should also be able to consider an undefined answer (which
			means that it is empty), so we treat an undefined answer as an empty array.
		 */
		//if (typeof (answer) === 'undefined') {
		//	answer = "[]";
		//}

		/* the above is temporarily deactivated, as it uncovers another bug which requires a lot of rewriting to be fixed */

		if (typeof (answer) === 'string' && answer !== '') {
			answer = JSON.parse(answer);
			if (answer.length >= options.minRequired && (answer.length <= options.maxRequired || options.maxRequired === -1)) {
				return true;
			}
		}
		return false;
	}


	/* test instance of dropdown */
	function oasysDND(parent, options, item, currentValue, language) {
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
		initializing = true;
		if (options.objectType === 'dz') {
			let dndData = cloneObj(options, ['id', 'behaviour', 'style', 'groups', 'type', 'onFull', 'padding', 'zIndexBaseValue', 'maxDraggableCount', 'orientation', 'alignment', 'spacing', 'gridSize', 'onDrop', 'orderBy', 'acceptClones']);
			dndData.html = options.html?.[language] ?? '';
			if (dndData['style']) {
				dndData['style'] = CSS2Object(dndData['style']);
			}
			dndData.onChange = onChange;
			if (typeof (currentValue) === 'string') {
				try {
					currentValue = JSON.parse(currentValue);
				} catch (e) {
					console.log(e);
					console.log(currentValue);
				}
			}
			const instance = new jsDropZone(parent, dndData);

			if (typeof (currentValue) === 'undefined') {
				if (typeof (options.initialDraggables) === 'undefined') {
					currentValue = [];
				} else {
					currentValue = options.initialDraggables;
				}
			}

			/* handle wildcard for the "CONTAINS" attribute */
			if (currentValue.length === 1 && currentValue[0] === "*" && typeof(jsDNDManager.dgData['*']) === "undefined") {
				currentValue = Object.keys(jsDNDManager.dgData);
			}

			for (let i in currentValue) {
				let v = currentValue[i];
				if (typeof (jsDNDManager.dgData[v]) === 'undefined') {
					console.warn("Draggable with value='" + v + "' [" + language + "] is not declared ... skipping");
				} else {
					createDraggable(options.id, jsDNDManager.dgData[v]);
				}
			}

		} else if (options.objectType === 'dg') {

			if (typeof (options.data.value) !== 'undefined') {
				let v = options.data.value;
				if (typeof (jsDNDManager.dgData[v]) !== 'undefined') {
					console.warn("Draggable with value='" + v + "' [" + language + "] redeclared ... ignoring 2nd declaration");
				} else {
					jsDNDManager.dgData[v] = options;
				}
			}

			/*
			since draggables are docked in a dropzone and not created where they were defined, we have to delete their
			parent and in order to not get empty paragraphs also remove the parent of the parent.
			 */
			const gramps = parent.parent();
			parent.remove();
			if (gramps.children().length === 0) {
				gramps.remove();
			}
			let mainDiv;
			if (typeof (skin_getMainDiv) === 'function') {
				mainDiv = skin_getMainDiv();
			} else {
				mainDiv = $('#main');
			}
			jsDNDManager.addListener(mainDiv);
		}
		initializing = false;

		function createDraggable(parentId, options) {
			const dndData = cloneObj(options, ['style', 'html', 'group', 'zIndexDragging', 'clone', 'data']);
			if (dndData['style']) {
				dndData['style'] = CSS2Object(dndData['style']);
			}
			dndData['html'] = dndData['html'][language];
			new jsDraggable(parentId, dndData);
		}

		/* private methods */
		function onChange(id, objects) {
			if (initializing) return; //do not send answers that are not created by the user
			const value = [];
			for (let i in objects) {
				value.push(objects[i].value);
			}
			const data = {
				itemId: item.id,
				type: 'answer',
				fieldType: type,
				fieldId: id,
				value: JSON.stringify(value),
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
		}

		return this;

	}

	function cleanUp() {
		window.jsDNDManager.removeAll();
	}


	registerPlugin();

})(jQuery);