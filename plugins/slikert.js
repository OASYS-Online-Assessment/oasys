/*
 * OASYS interaction plugin
 * 
 * slikert v1.1
 *   
 */

"use strict";

(function ($) {

	const type = 'oasysSlikert';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysSlikert,
				validResponse: validResponse,
				scoring: {},
				supportLabels: false,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/*
		definition of what constitutes a well formatted answer
		depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer) {
		return (answer !== null && typeof (answer) !== "undefined");
	}


	/* test instance of slikert */
	function oasysSlikert(parent, options, item, currentValue, language) {
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
		const code = options.code;

		/* fallback for slikert version 1.0 data */
		if (typeof(options.labelPosition) === 'undefined') {
			options.labelPosition = 'below';
		}
		if (typeof(options.labelWidth) === 'undefined') {
			options.labelWidth = 100;
		}
		if (typeof(options.tooltip) === 'undefined') {
			options.tooltip = true;
		}
		/* fallback end */

		parent = $(parent);
		let html = `	<div class='slikertFrame slikertLabelPosition_${options.labelPosition}' id='${code}' style='position:relative;'>
							<div class='slikertTooltip ${options.tooltip === true ? '' : 'hidden'}'>&nbsp;</div>
							<div class="slikertTrackGrid">
								<div class="slikertOutsideLabelLeft">${options.labelLeft[language]}</div>
								<div class='slikertTrackFrame'></div>
								<div class="slikertOutsideLabelRight">${options.labelRight[language]}</div>
							</div>
							<div class='slikertLabelFrame'></div>
						</div>
						<div id="slikertNoReplyFrame_${code}" class="slikertNoReplyFrame"></div>`;
		parent.html(html);
		const element = $('#' + code);

		//DEBUGGING
		//console.log(options);

		const valuesTable = [];
		const min = options.min;
		const max = options.max;
		const step = options.step;
		const origin = options.origin;
		const valueCount = Math.floor((max - min) / step + 1);

		if (min >= max || (max - min) % step !== 0 || valueCount > 10) {
			let errorMsg = global_getText('test', "cannotRenderField");
			element.html(errorMsg);
			return;
		}

		let idxOrigin = 0;
		let idxValue = null;
		if (origin === 'R') {
			idxOrigin = valueCount - 1;
		} else if (origin === 'C') {
			idxOrigin = (valueCount - 1) / 2;
		}
		let value = null;
		if (typeof (currentValue) === 'number') {
			value = currentValue;
		} else if (typeof (currentValue) === 'string') {
			value = parseFloat(currentValue);
		} else if (typeof (options.value) !== 'undefined') {
			value = options.value;
		}
		if (step > 0) {
			const stepDivider = 1 / step;
			for (let i = 0; i < valueCount; i++) {
				const details = {
					v: min + i / stepDivider,
					x: 0 //to be calculated later
				};
				valuesTable.push(details);
				if (min + i / stepDivider === value) {
					idxValue = i;
				}
			}
		}
		const trackFrame = element.find('.slikertTrackFrame');
		const trackGrid = element.find('.slikertTrackGrid');
		const outsideLabels = element.find('[class^=slikertOutsideLabel]');
		const tooltip = element.find('.slikertTooltip');
		const labelFrame = element.find('.slikertLabelFrame');
		const noReplyFrame = element.find('.slikertNoReplyFrame');
		const inactiveStroke = '#B3B3B3';
		const inactiveOuterBg = '#FFFFFF';
		const inactiveRingBg = '#E6E6E6';
		const inactiveInnerBg = '#FFFFFF';
		const rightStroke = '#7DBD84';
		const rightOuterBg = '#A9FFA3';
		const rightRingBg = '#E6E6E6';
		const rightInnerBg = '#00E417';
		const leftStroke = '#B74242';
		const leftOuterBg = '#FF8989';
		const leftRingBg = '#E6E6E6';
		const leftInnerBg = '#EA4040';
		const uniStroke = '#7daabd';
		const uniOuterBg = '#a4e3fd';
		const uniRingBg = '#E6E6E6';
		const uniInnerBg = '#01a0e3';
		const handleBg = '#666666';
		const handleArrows = '#FFFFFF';
		const tooltipBg = '#666666';
		const tooltipColour = '#FFFFFF';
		const decimalDigits = 3;
		tooltip.css({
			color: tooltipColour,
			"background-color": tooltipBg,
			visibility: 'hidden'
		});
		let r0 = 24; //radius of handle
		let r1 = 18; //radius of outer circle
		let r2 = 12; //radius of middle circle
		let r3 = 7; //radius of inner circle
		let l = 70; //length of straight piece between 2 circles
		const angle = 22 * Math.PI / 180;

		//responsiveness
		const availableWidth = element.innerWidth();
		let requiredWidth = (valueCount - 1) * l + (valueCount - 1) * r1 * 2 * Math.cos(angle) + 2 * r0;
		while (requiredWidth > availableWidth && l > 20) {
			l -= 5;
			requiredWidth = (valueCount - 1) * l + (valueCount - 1) * r1 * 2 * Math.cos(angle) + 2 * r0;
		}
		const modifier = availableWidth / requiredWidth;
		if (modifier < 1) {
			//only recalculate size if too big
			r0 = r0 * modifier;
			r1 = r1 * modifier;
			r2 = r2 * modifier;
			r3 = r3 * modifier;
			l = l * modifier;
		}
		requiredWidth = (valueCount - 1) * l + (valueCount - 1) * r1 * 2 * Math.cos(angle) + 2 * r0;
		trackGrid.css('grid-template-columns',`${options.labelWidth}px ${requiredWidth}px ${options.labelWidth}px`);
		if (options.labelPosition === 'outside') {
			requiredWidth += 2 * options.labelWidth;
		}
		const requiredHeight = (r0 * 2) + 2;
		element.width(requiredWidth);
		trackFrame.width(requiredWidth);
		trackFrame.height(requiredHeight);
		outsideLabels.css('line-height', requiredHeight+'px');

		let x0 = r0;
		valuesTable[0].x = x0;
		for (let i = 1; i < valueCount; i++) {
			x0 += l + 2 * r1 * Math.cos(angle);
			valuesTable[i].x = x0;
		}
		const xMax = valuesTable[valueCount - 1].x; //rightmost boundary for handle to move to
		const xMin = valuesTable[0].x; //leftmoust boundary for handle to move to

		let svg = `<svg id='slikertTrack_${code}' class='slikertTrackBack' xmlns='http://www.w3.org/2000/svg' style='height: ${requiredHeight}px; width: ${requiredWidth}px; overflow: hidden; position: absolute;'>`;
		svg += "<defs>";
		svg += `<mask id='slikertTrackMaskL_${code}' x='0' y='0' width='${requiredWidth}' height='${requiredHeight}'><rect x='0' y='0' width='0' height='${requiredHeight}' style='stroke: none; fill: #FFFFFF' /></mask>`;
		svg += `<mask id='slikertTrackMaskR_${code}' x='0' y='0' width='${requiredWidth}' height='${requiredHeight}'><rect x='0' y='0' width='0' height='${requiredHeight}' style='stroke: none; fill: #FFFFFF' /></mask>`;
		svg += "</defs>";
		svg += createTrack(0, valueCount - 1, inactiveStroke, inactiveOuterBg, inactiveRingBg, inactiveInnerBg);

		if (options.origin !== 'none') {
			if (idxOrigin > 0) {
				if (options.bicolour === true) {
					svg += createTrack(0, idxOrigin, leftStroke, leftOuterBg, leftRingBg, leftInnerBg, 'slikertTrackMaskL_' + code);
				} else {
					svg += createTrack(0, idxOrigin, uniStroke, uniOuterBg, uniRingBg, uniInnerBg, 'slikertTrackMaskL_' + code);
				}
			}

			if (idxOrigin < valueCount - 1) {
				if (options.bicolour === true) {
					svg += createTrack(idxOrigin, valueCount - 1, rightStroke, rightOuterBg, rightRingBg, rightInnerBg, 'slikertTrackMaskR_' + code);
				} else {
					svg += createTrack(idxOrigin, valueCount - 1, uniStroke, uniOuterBg, uniRingBg, uniInnerBg, 'slikertTrackMaskR_' + code);
				}
			}
		}

		const handleCoords = {
			x: null,
			xClient: null,
			xCursor: null,
			idxValue: idxValue
		};

		if (value !== null) {
			svg += createHandle(idxValue);
		} else {
			svg += createHandle(idxOrigin);
		}
		svg += "</svg>";
		trackFrame.append(svg);
		const track = $("#slikertTrack_" + code);
		pointerHandler.listen(track, {
			callbacks: {
				click: trackClicked
			},
			waitForDblclick: false
		});
		const handle = $("#slikertHandle_" + code);
		pointerHandler.listen(handle, {
			callbacks: {
				down: handleClicked,
				up: handleReleased,
				out: handleReleased,
				move: handleMoved
			},
			waitForDblclick: false
		});
		handle.hide();

		const maskL = $('#slikertTrackMaskL_' + code + ' > rect');
		const maskR = $('#slikertTrackMaskR_' + code + ' > rect');
		if (value !== null) {
			handle.show();
			tooltip.css('visibility', 'visible');
			updateTooltip();
			updateMasks();
		}

		/* creating the labels */
		html = "<div class='slikertLabelLeft'></div><div class='slikertLabelCentre'></div><div class='slikertLabelRight'></div>";
		labelFrame.html(html);
		const lbLeft = labelFrame.find("div.slikertLabelLeft");
		const lbCentre = labelFrame.find("div.slikertLabelCentre");
		const lbRight = labelFrame.find("div.slikertLabelRight");

		lbLeft.html(options.labelLeft[language]);
		lbCentre.html(options.labelCentre[language]);
		lbRight.html(options.labelRight[language]);

		if (options.required) state.requiredFields[options.id] = hasValue();

		let noReplyInstance = null;
		if (options.noReply !== true) {
			noReplyFrame.hide();
		} else {
			let noReplyData = {
				type: 'cb',
				onChange: (sender, v) => onNoReplyChange(v),
				element: {
					elementParent: `slikertNoReplyFrame_${code}`,
					labelParent: `slikertNoReplyFrame_${code}`,
					label: options.labelNoReply[language],
					value: 'noReply'
				},
				order: 'elementFirst'
			};
			noReplyInstance = new jsMultipleChoice(`slikertNoReply_${code}`, noReplyData);
		}

		if (value !== null) {
			if (value === 'N/A' && noReplyInstance !== null) {
				noReplyInstance.reset(true);
			} else {
				handle.show();
				updateTooltip();
			}
		}
		updateMasks();

		function onNoReplyChange(v) {
			if (v === true) {
				handle.hide();
				tooltip.css('visibility', 'hidden');
				value = 'N/A';
			} else {
				value = null;
			}
			sendData();
			updateMasks();
		}

		function createTrack(idx1, idx2, stroke, outerBg, ringBg, innerBg, maskId) {
			let raggedLeft = false;
			let raggedRight = false;
			if (idx1 !== Math.floor(idx1)) {
				idx1 = Math.ceil(idx1);
				raggedLeft = true;
			}
			if (idx2 !== Math.floor(idx2)) {
				idx2 = Math.floor(idx2);
				raggedRight = true;
			}
			let x0 = valuesTable[idx1].x;
			const y0 = 1 + r0;
			let x = x0 + r1 * Math.cos(angle);
			const y1 = y0 - r1 * Math.sin(angle);
			const y2 = y0 + r1 * Math.sin(angle);
			let svg = '';
			let path;

			if (!raggedLeft) {
				//leftmost bubble
				path = `M ${x} ${y1} A ${r1} ${r1} 0 1 0 ${x} ${y2} `;
			} else {
				x = x0 + r1 * Math.cos(angle);
				path = `M ${x} ${y1} `;
				x = x0 - r1 * Math.cos(angle);
				path += `A ${r1} ${r1} 0 0 0 ${x} ${y1} `;
				path += `h ${-l / 2} V ${y2} h ${l / 2} `;
				x = x0 + r1 * Math.cos(angle);
				path += `A ${r1} ${r1} 0 0 0 ${x} ${y2} `;
			}

			if (idx2 - idx1 > 1) {
				//lower part of slikert from left to right except for last bubble
				for (let i = idx1 + 1; i < idx2; i++) {
					path += `h ${l} `;
					x0 = valuesTable[i].x;
					x = x0 + r1 * Math.cos(angle);
					path += `A ${r1} ${r1} 0 0 0 ${x} ${y2} `;
				}
			}

			path += `h ${l} `;
			x += l;

			if (!raggedRight) {
				//rightmost bubble
				path += `A ${r1} ${r1} 0 1 0 ${x} ${y1} `;
			} else {
				x0 = valuesTable[idx2].x;
				x = x0 + r1 * Math.cos(angle);
				path += `A ${r1} ${r1} 0 0 0 ${x} ${y2} `;
				path += `h ${l / 2} V ${y1} h ${-l / 2} `;
				x = x0 - r1 * Math.cos(angle);
				path += `A ${r1} ${r1} 0 0 0 ${x} ${y1} `;
			}

			if (idx2 - idx1 > 1) {
				//upper part of slikert from right to left except for first bubble
				for (let i = idx2 - 1; i > idx1; i--) {
					path += `h ${-l} `;
					x0 = valuesTable[i].x;
					x = x0 - r1 * Math.cos(angle);
					path += `A ${r1} ${r1} 0 0 0 ${x} ${y1} `;
				}
			}
			path += `h ${-l} `;
			if (maskId) {
				svg += `<g style='mask: url(#${maskId});'>`;
			} else {
				svg += "<g>";
			}
			svg += `<path d='${path}' style='stroke: ${stroke}; stroke-width: 1px; fill: ${outerBg};' />`;

			for (let i = idx1; i <= idx2; i++) {
				x0 = valuesTable[i].x;
				svg += `<circle cx='${x0}' cy='${y0}' r='${r2}' style='stroke: ${stroke}; stroke-width: 1px; fill: ${ringBg};' />`;
				svg += `<circle cx='${x0}' cy='${y0}' r='${r3}' style='stroke: ${stroke}; stroke-width: 1px; fill: ${innerBg};' />`;
			}
			svg += "</g>";

			return svg;
		}

		function createHandle(xIdx) {
			const y0 = 1 + r0;
			let x0;
			if (xIdx !== Math.floor(xIdx)) {
				x0 = valuesTable[0].x;
			} else {
				x0 = valuesTable[xIdx].x;
			}
			handleCoords.x = x0;
			handleCoords.xClient = trackFrame.offset().left + x0;
			let svg = `<g id="slikertHandle_${code}" transform="translate(${x0})">`;
			svg += `<circle cx='0' cy='${y0}' r='${r0}' style='stroke: none; fill: ${handleBg}; opacity: 25%' />`;
			svg += `<circle cx='0' cy='${y0}' r='${r1}' style='stroke: ${handleBg}; stroke-width: 2px; fill: ${handleBg};' />`;
			let path = "";
			let x1 = -1.5 * 2 * r1 / 5;
			let x2 = -0.4 * 2 * r1 / 5;
			let y1 = y0 - 0.6 * 2 * r1 / 3;
			let y2 = y0 + 0.6 * 2 * r1 / 3;
			path += `M ${x1} ${y0} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y0}`;
			svg += `<path d='${path}' style='stroke: none; fill: ${handleArrows};' />`;
			path = "";
			x1 = 1.5 * 2 * r1 / 5;
			x2 = 0.4 * 2 * r1 / 5;
			y1 = y0 - 0.6 * 2 * r1 / 3;
			y2 = y0 + 0.6 * 2 * r1 / 3;
			path += `M ${x1} ${y0} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y0}`;
			svg += `<path d='${path}' style='stroke: none; fill: ${handleArrows};' />`;
			svg += '</g>';
			return svg;
		}

		function trackClicked(e) {
			e.preventDefault();
			e.stopPropagation();
			const x = e.clientX - trackFrame.offset().left;
			let d = Infinity;
			const v = null;
			for (let i in valuesTable) {
				const p = valuesTable[i];
				if (Math.abs(x - p.x) < d) {
					d = Math.abs(x - p.x);
					handleCoords.idxValue = parseInt(i);
					handleCoords.x = p.x;
					handleCoords.xClient = p.x + trackFrame.offset().left;
				}
			}
			handle.attr('transform', `translate(${handleCoords.x})`);
			value = valuesTable[handleCoords.idxValue].v;
			updateMasks();
			updateTooltip();
			handle.show();
			tooltip.css('visibility', 'visible');
			sendData();
			if (options.noReply === true) {
				noReplyInstance.reset(false);
			}
		}

		function handleClicked(e) {
			/*  in order for slikert to be draggable on touch device while page is also scrollable we need to disable
				scrolling once dragging starts and reenable it on release  */
			skin_disableScrolling();
			handleCoords.xCursor = e.clientX - handleCoords.xClient;
			handleMoved({x: e.clientX, y: e.clientY});
		}

		function handleReleased(e) {
			handleCoords.x = valuesTable[handleCoords.idxValue].x;
			handleCoords.xClient = handleCoords.x + trackFrame.offset().left;
			handle.attr('transform', `translate(${handleCoords.x})`);
			value = valuesTable[handleCoords.idxValue].v;
			updateMasks();
			updateTooltip();
			sendData();
			skin_enableScrolling();
		}

		function handleMoved(coords) {
			handleCoords.xClient = coords.x - handleCoords.xCursor;
			handleCoords.x = handleCoords.xClient - trackFrame.offset().left;
			if (handleCoords.x < xMin) {
				handleCoords.x = xMin;
				handleCoords.xClient = xMin + trackFrame.offset().left;
			} else if (handleCoords.x > xMax) {
				handleCoords.x = xMax;
				handleCoords.xClient = xMax + trackFrame.offset().left;
			}
			let d = Infinity;
			const v = null;
			for (let i in valuesTable) {
				const p = valuesTable[i];
				if (Math.abs(handleCoords.x - p.x) < d) {
					d = Math.abs(handleCoords.x - p.x);
					handleCoords.idxValue = parseInt(i);
				}
			}
			handle.attr('transform', `translate(${handleCoords.x})`);
			updateMasks();
			updateTooltip();
		}

		function updateMasks() {
			if (options.origin === 'none') {
				return; //skip if no origin selected
			}
			if (value === null || isNaN(value)) {
				//hide colored line if value is not set or 'N/A'
				maskL.attr({x: 0, width: 0});
				maskR.attr({width: 0});
			} else {
				maskL.attr({x: handleCoords.x, width: requiredWidth - handleCoords.x});
				maskR.attr({width: handleCoords.x});
			}
		}

		function updateTooltip() {
			if (options.tooltip === false) {
				return; //skip if no tooltip shown
			}
			if (handleCoords.idxValue === null) {
				return;
			}
			tooltip.text(+valuesTable[handleCoords.idxValue].v.toFixed(decimalDigits));
			const w = tooltip.outerWidth();
			let x = handleCoords.x - w / 2;
			if (options.labelPosition === 'outside') {
				x += options.labelWidth + 10;
			}
			tooltip.css('margin-left', x);
		}

		/* private methods */
		function hasValue() {
			return validResponse(value);
		}

		function sendData() {
			const data = {
				itemId: item.id,
				type: 'answer',
				fieldType: type,
				fieldId: options.id,
				value: value,
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};
			core_userEvent(data);
		}

		/* export methods */
		this.focus = focus;

		return this;

	}

	registerPlugin();

})(jQuery);