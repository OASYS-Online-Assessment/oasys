/*
 * OASYS metafield plugin
 *
 * choiceMatrix
 *
 */

"use strict";

(function ($) {

		const type = 'oasysInline_Gaps';

		function registerPlugin() {
			if (typeof (plugins) !== 'undefined') {
				plugins[type] = {
					id: type,
					constructor: oasysInlineGaps,
					cleanup: cleanUp,
					category: 'metafields'
				};
			}
		}

		function oasysInlineGaps(parent, options, item, currentValue, language) {

			/* mandatory settings */
			if (typeof (parent) === 'string') {
				parent = $(parent);
			}

			/* optional settings */
			if (!options) return;

			const id = options.id + '_stock';
			const code = options.code;
			const stockWrapper = parent.next();
			const fieldAnswers = options.answers;

			//create temporary draggables mockups and measure the maximum width needed
			let maxWidth = 0;
			let maxHeight = 0;
			for (const {label} of fieldAnswers) {
				const div = document.createElement('div');
				div.style.display = 'inline-block';
				div.innerText = label[language];
				stockWrapper.get(0).appendChild(div); // temporarily add it
				const width = div.offsetWidth + 20; // Measure the width
				const height = div.offsetHeight; // Measure the height
				stockWrapper.get(0).removeChild(div); // Remove it from DOM immediately
				maxWidth = Math.max(maxWidth, width);
				maxHeight = Math.max(maxHeight, height);
			}


			let orderBy;

			switch (options.order) {
				case 'random':
					orderBy = 'rnd';
					break;
				case 'alphabet':
					orderBy = 'label';
					break;
				case 'manual':
					orderBy = 'idx';
					break;
			}

			/* stock creation */
			let dndData = {
				id: id,
				behaviour: 'default',
				// style: {width: '100%', height: stockHeight + 'px'},
				// html: '',
				groups: [code],
				onFull: 'refuse',
				class: 'inlineGaps_stock',
				// zIndexBaseValue: '',
				maxDraggableCount: 100,
				orientation: 'horizontal',
				alignment: {x: 'left', y: 'top'},
				spacing: 5,
				gridSize: 0,
				padding: {left: 5, right: 5, top: 5, bottom: 5},
				onDrop: 'auto',
				orderBy: orderBy,
				acceptClones: false
			};
			const stock = new jsDropZone(stockWrapper, dndData);

			//add invisible placeholders to the stock to make it adjust its size automatically
			let stockElement = window.jsDNDManager.dzList[id].element.get(0);
			for (let i = 0; i < fieldAnswers.length; i++) {
				let placeholder = document.createElement('span');
				placeholder.classList.add('inlineGaps_placeholder');
				placeholder.style.width = maxWidth + 'px';
				placeholder.style.height = maxHeight + 'px';
				stockElement.appendChild(placeholder);
			}


			/* draggable creation */
			let mainDiv;
			if (typeof (skin_getMainDiv) === 'function') {
				mainDiv = skin_getMainDiv();
			} else {
				mainDiv = $('#main');
			}

			let i=1;
			for (let {value, label} of fieldAnswers) {
				if (typeof (jsDNDManager.dgData[code + "_" + value]) !== 'undefined') {
					console.warn(`Draggable with group='${code}' and value='${value}' [${language}] redeclared ... ignoring 2nd declaration`);
				} else {
					let dgOptions = {
						// zIndexDragging: 0,
						style: {width: maxWidth + 'px'},
						class: 'inlineGaps_draggable',
						label: label[language],
						group: code,
						data: {value: value, label: label[language], idx: i++, rnd: Math.random()},
						clone: false,
						frameId: 'skinMainFrame',
						clipFrameTo: mainDiv
					};
					jsDNDManager.dgData[code + "_" + value] = dgOptions;
					new jsDraggable(stock, dgOptions);
				}
			}

			window.oasysInlineGapsManager = window.oasysInlineGapsManager ?? {};
			window.oasysInlineGapsManager[code] = {
				stock: stock,
				draggableWidth: maxWidth
			};

			jsDNDManager.addListener(mainDiv);

			return this;
		}

		function cleanUp() {
			window.jsDNDManager.removeAll();
			window.jsDNDManager.dgData = {};
		}

		registerPlugin();

	}

)(jQuery);