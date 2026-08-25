/*
 * OASYS static plugin
 *
 * testIndex
 *
 */

"use strict";

(function ($) {

	const type = 'oasysTestIndex';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysTestIndex,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function oasysTestIndex(parent, options, item, currentValue, language) {

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* replacing */
		let snippet = "<ul class='oasysTestIndex'>";
		let lastStimId = -1;
		for (let i in test.structure.items) {
			const itemId = test.structure.items[i].hiddenID;
			let stimId;
			if (test.items[itemId].role === 0) {
				if (options['includeStandAlone'] === false) {
					continue;
				}
				stimId = itemId;
			} else {
				stimId = test.items[itemId].link;
			}
			if (!stimId || lastStimId === stimId || state.currentItemId === stimId) {
				//console.log(`i=${i}: stimId=${stimId}, lastStimId=${lastStimId}, currentItemId=${state.currentItemId}`);
				continue;
			}
			lastStimId = stimId;
			const title = test.items[stimId].name;

			snippet += `<li data-targetItem='${i}'>${title}</li>`;
		}
		snippet += "</ul>";

		parent.replaceWith(snippet);
		$('ul.oasysTestIndex > li').css('cursor', 'pointer').click(function (e) {
			core_gotoItem($(e.delegateTarget).attr('data-targetItem'));
		});

		return this;

	}

	registerPlugin();

})(jQuery);