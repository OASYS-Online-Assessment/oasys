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

		//if ratio is given, check width of image and calculate height -> keep space free before image has loaded
		if (typeof(options.ratio) !== 'undefined' && !isNaN(options.ratio[language])) {
			let ratio = options.ratio[language];
			adjustHeight(ratio);

			//check if image is resized due to window size changes and update height
			//thanks to ChatGPT for pointing out this solution ;-)
			const image = element.get(0);
			const observer = new ResizeObserver(entries => {
				for (let entry of entries) {
					adjustHeight(ratio);
				}
			});
			observer.observe(image);
		}

		function adjustHeight(ratio) {
			let w = element.outerWidth();
			let h = w / ratio;
			element.css('height', h + 'px');
		}

		return this;
	}

	registerPlugin();

})(jQuery);