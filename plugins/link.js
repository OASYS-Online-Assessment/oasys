/*
 * OASYS static plugin
 *
 * testVariable
 *
 */

"use strict";

(function($) {

	const type = 'oasysLink';
	let elements = [];
	let pointerHandler;

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysLink,
				cleanup: cleanUp,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function oasysLink(parent, options, item, currentValue, language) {

		/* mandatory settings */
		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		elements.push(parent);

		parent.html(options.html[language] || '');

		let targetPage = false;

		if (typeof(options.targetCode) !== 'undefined') {
			let itemId = core_lookupItemCode(options.targetCode);
			if (itemId === false) {
				console.log("Error in link! ItemId not found for targetCode: " + options.targetCode);
			} else {
				targetPage = core_getItemNumber(itemId);
				if (targetPage === false) {
					targetPage = core_getItemNumberForLink(itemId);
					if (targetPage === false) {
						console.log("Error in link! ItemCode not in structure: " + options.targetCode + " [id=" + itemId + "]");
					}
				}
			}
		}

		if (targetPage === false && typeof(options.targetRelative) !== 'undefined') {
			targetPage = state.currentItem + options.targetRelative;
			if (targetPage < 0 || targetPage > state.itemCount - 1) {
				console.log("Error in link! Relative target out of bounds: " + options.targetRelative);
				targetPage = false;
			}
		}

		if (targetPage === false && typeof(options.targetPage) !== 'undefined') {
			if (options.targetPage === -1) {
				options.targetPage = state.itemCount;
			}
			targetPage = options.targetPage - 1;
			if (targetPage < 0 || targetPage > state.itemCount - 1) {
				console.log("Error in link! Target page out of bounds: " + options.targetPage);
				targetPage = false;
			}
		}

		if (!pointerHandler) {
			pointerHandler = jsPointerHandler.instance;
		}

		pointerHandler.listen(parent, {
			callbacks: {
				click: function () {
					linkClicked(targetPage);
				}
			},
			hoverClass: 'oasysLinkHovered'
		});

		return this;

	}

	function linkClicked(targetPage) {
		if (targetPage !== false) {
			core_gotoItem(targetPage, true);
		} else {
			console.log("Error: Clicked link ignored due to errors with target.");
		}
	}

	function cleanUp() {
		if (!pointerHandler) {
			return;
		}
		while (elements.length > 0) {
			pointerHandler.clear(elements.pop());
		}
	}

	registerPlugin();

})(jQuery);