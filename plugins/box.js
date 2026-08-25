/*
 * OASYS static plugin
 *
 * box
 *
 */

"use strict";

(function ($) {

	const type = 'oasysBox';

	function registerPlugin() {
		if (typeof(plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysBox,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/* test instance of radiobutton */
	function oasysBox(parent, options) {
		/*
		 parent:			string or jQuery object		container element for this object
		 options:			object						structure depends on properties of plugin (see above)
		 */

		/* mandatory settings */
		if (typeof(parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* creation */
		const id = options.id;
		const width = options.width;
		const height = options.height;
		const innerHTML = options.innerHTML || "";
		const css = options.style || false;

		const cssObj = CSS2Object(css);

		if (width || width === 0) {
			cssObj.width = width;
		}
		if (height || height === 0) {
			cssObj.height = height;
		}

		const htmlId = "oasysBox_" + encodeToHex(id);

		parent.replaceWith(`<div id='${htmlId}'></div>`);
		$('div#' + htmlId).css(cssObj).html(innerHTML);

	}

	registerPlugin();

})(jQuery);