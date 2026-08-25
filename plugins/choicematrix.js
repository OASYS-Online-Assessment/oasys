/*
 * OASYS metafield plugin
 *
 * choiceMatrix
 *
 */

"use strict";

(function ($) {

		const type = 'oasysChoiceMatrix';

		function registerPlugin() {
			if (typeof (plugins) !== 'undefined') {
				plugins[type] = {
					id: type,
					constructor: oasysChoiceMatrix,
					category: 'metafields'
				};
			}
		}

		function oasysChoiceMatrix(parent, options, item, currentValue, language) {

			/* mandatory settings */
			if (typeof (parent) === 'string') {
				parent = $(parent);
			}

			/* optional settings */
			if (!options) return;

			let jsph = jsPointerHandler.instance;

			/* creation */
			let maxWidth = (parent.parent().innerWidth());
			let tableLayout = true;
			let columnCount = options.labels.length;

			let required = columnCount * (options.fieldWidth + 10) + options.labelWidth;
			if (maxWidth < required) {
				tableLayout = false;
			}

			parent.find('.matrixTableHeader').css('grid-template-columns', `1fr repeat(${columnCount}, ${options.fieldWidth}px)`);

			if (tableLayout === true) {
				parent.addClass('matrixTableLayout');
				parent.find('.matrixRow').css('grid-template-columns', `1fr repeat(${columnCount}, ${options.fieldWidth}px)`);
			} else {
				parent.addClass('matrixStackedLayout');
				parent.find('.matrixRow').css('grid-template-columns', `repeat(${columnCount}, 1fr)`);
			}

			if (options.shuffle === true) {
				let shuffledOrder = [];
				//if order was established before use cached version
				if (typeof (options.rowOrder) !== 'undefined') {
					shuffledOrder = options.rowOrder;
				} else {
					for (let i = 0; i < options.rows.length; i++) {
						shuffledOrder[i] = i + 2;
					}
					shuffleArray(shuffledOrder);
					options.rowOrder = shuffledOrder;
				}
				parent.find(".matrixRow").each(function (idx, el) {
					$(el).css('grid-row', shuffledOrder[idx].toString());
					if (shuffledOrder[idx] % 2 === 0) {
						$(el).addClass('dark');
					}
				});
			} else {
				parent.find(".matrixRow").each(function (idx, el) {
					if (idx % 2 === 0) {
						$(el).addClass('dark');
					}
				});
			}

			return this;

		}

		registerPlugin();

	}

)(jQuery);