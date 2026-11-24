/*
 * OASYS static plugin
 *
 * Image
 *
 */

"use strict";

(function ($) {

	const type = 'oasysImage';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysImage,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function oasysImage(element, options, item, currentValue, language) {

		/* mandatory settings */
		if (typeof (element) === 'string') {
			element = $(element);
		}

		/* options */
		if (!options) return;
		let lastWidth;

		//if ratio is given, check width of image and calculate height -> keep space free before image has loaded
		if (typeof(options.ratio) !== 'undefined' && !isNaN(options.ratio[language])) {
			const ratio = options.ratio[language];
			adjustHeight(ratio);

			// Height changes also notify this observer; only respond to width changes.
			const image = element.get(0);
			let resizeFrame = null;
			const observer = new ResizeObserver(() => {
				if (resizeFrame !== null || element.outerWidth() === lastWidth) return;
				// Defer layout writes until the next frame to avoid a resize notification loop.
				resizeFrame = requestAnimationFrame(() => {
					resizeFrame = null;
					adjustHeight(ratio);
				});
			});
			observer.observe(image);
		}

		function adjustHeight(ratio) {
			const w = element.outerWidth();
			if (w === lastWidth) return;
			const h = w / ratio;
			element.css('height', h + 'px');
			lastWidth = w;
		}

		return this;
	}

	registerPlugin();

})(jQuery);
