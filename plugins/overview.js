/*
 * OASYS static plugin
 *
 * Overview
 *
 */

"use strict";

(function ($) {

	const type = 'oasysOverview';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysOverview,
				category: 'static'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	function oasysOverview(parent, options, item, currentValue, language) {

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}

		/* options */
		if (!options) return;

		console.log(options);

		switch (options.overviewType) {
			case 'checkmark':
				createCheckmark();
				break;
			case 'value':
				createValue();
				break;
			case 'list':
				createList();
				break;
			case 'progress':
				createProgress();
				break;
		}

		function getGlobalVariable(varName) {
			//if varName contains a dot, it is a nested variable, split it and access the nested properties
			let path;
			if (varName.includes('.')) {
				path = varName.split('.');
			} else {
				path = [varName];
			}
			let value = fetchFromPath(globalVariables, ...path);
			return value;
		}

		function createCheckmark() {
			let value = getGlobalVariable(options.source);
			if (value) {
				parent.html('✓');
				parent.css({
					'color': options.colour,
					'font-size': options.fontsize
				});
			} else {
				if (value === false) {
					parent.html('✗');
				} else {
					parent.html('');
				}
			}
		}

		function createValue() {
			let value = getGlobalVariable(options.source);
			if (typeof (value) === 'boolean') {
				value = value ? 'true' : 'false';
			}
			if (value || value === 0) {
				parent.html(value);
				parent.css({
					'color': options.colour,
					'font-size': options.fontsize
				});
			} else {
				parent.html('');
			}
		}

		function createList() {
			if (!options.list) return;
			if (getGlobalVariable(options.source) !== null) {
				let lb = options.list[language][getGlobalVariable(options.source)];
				if (!lb) {
					//if no label was defined for this value, show the value itself as fallback
					lb = getGlobalVariable(options.source);
					console.warn('No label defined for value: ' + getGlobalVariable(options.source));
				}
				parent.html(lb);
				parent.css({
					'color': options.colour,
					'font-size': options.fontsize
				});
			} else {
				parent.html('');
			}
		}

		function createProgress() {
			let html = "<div class='ovProgressTrack'><div class='ovProgressBar'></div></div><span class='ovProgressLabel'></span>";
			parent.html(html);
			let track = parent.find(".ovProgressTrack");
			let bar = track.find(".ovProgressBar");
			let lbl = parent.find(".ovProgressLabel");
			if (getGlobalVariable(options.source)) {
				track.css({
					'width': options.width,
					'height': options.height
				});
				bar.css({
					'background-color': options.colour
				});
				let progress = (getGlobalVariable(options.source) - options.min) / (options.max - options.min) * 100;
				bar.css('width', progress + '%');
				if (options.hideLabel === true) {
					lbl.hide();
				} else {
					lbl.html(getGlobalVariable(options.source));
					lbl.css({
						'color': options.colour,
						'font-size': options.fontsize
					});
				}
				track.show();
			} else {
				track.hide();
				lbl.html('');
			}
		}

		return this;

	}


	registerPlugin();

})(jQuery);