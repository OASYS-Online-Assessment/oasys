/*
 * OASYS interaction plugin
 *
 * slider
 *
 */

"use strict";

(function ($) {

	const type = 'oasysSlider';

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysSlider,
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


	/* test instance of slider */
	function oasysSlider(parent, options, item, currentValue, language) {
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

		//DEBUGGING
		// console.log(options);

		/* creation */
		const code = options.code;

		let html = `	<div class='sliderFrame' id='${code}' style='position:relative;'>
							<div class='sliderTooltip'>&nbsp;</div><div class='sliderTrackFrame'></div>
							<div class='sliderValuesFrame'></div><div class='sliderLabelFrame'></div>
						</div>
						<div id="sliderNoReplyFrame_${code}" class="sliderNoReplyFrame"></div>`;
		parent.html(html);
		const element = $('#' + code);


		let min = options.min;
		let max = options.max;
		let step = options.step;

		const valueCount = Math.floor((max - min) / step + 1);

		if (min >= max || (max - min) % step !== 0 || valueCount > 1001) {
			let errorMsg = global_getText('test', "cannotRenderField");
			element.html(errorMsg);
			return;
		}

		let value = null;
		if (typeof (currentValue) !== 'undefined') {
			value = currentValue;
		}

		const trackFrame = element.find('.sliderTrackFrame');
		const valuesFrame = element.find('.sliderValuesFrame');
		const tooltip = element.find('.sliderTooltip');
		const labelFrame = element.find('.sliderLabelFrame');
		const noReplyFrame = element.find('.sliderNoReplyFrame');
		const trackStroke = '#888888';
		const trackFill = '#DDDDDD';
		const stepsStroke = '#666666';
		const handleBg = '#666666';
		const handleArrows = '#FFFFFF';
		const tooltipBg = '#666666';
		const tooltipColour = '#FFFFFF';

		tooltip.css({
			color: tooltipColour,
			"background-color": tooltipBg,
			visibility: 'hidden'
		});
		if (options.showValue === false) {
			tooltip.hide(); //free up space occupied by tooltip by setting display to none rather than visibility to hidden
		}
		let r0 = 24; //radius of handle
		let r1 = 18; //radius of inner handle circle
		const angle = 22 * Math.PI / 180;

		//responsiveness
		let trackLength = element.innerWidth();
		const requiredHeight = (r0 * 2) + 2;
		trackFrame.height(requiredHeight);

		const xMax = trackLength - r0; //rightmost boundary for handle to move to
		const xMin = r0; //leftmoust boundary for handle to move to
		const dxValue = (trackLength - 2 * r0) / (max - min);
		const dxStep = dxValue * step;


		let svg = `<svg id='sliderTrack_${code}' class='sliderTrackBack' xmlns='http://www.w3.org/2000/svg' style='height: ${requiredHeight}px; width: 100%; overflow: hidden; position: absolute;'>`;
		svg += createTrack();

		const handleCoords = {
			x: null,
			xClient: null,
			xCursor: null,
			v: value
		};

		if (value !== null) {
			svg += createHandle(valueCoordinate(value));
		} else {
			svg += createHandle(xMin);
		}

		svg += "</svg>";
		trackFrame.append(svg);

		const track = $("#sliderTrack_" + code);
		pointerHandler.listen(track, {
			callbacks: {
				click: trackClicked
			},
			waitForDblclick: false
		});
		const handle = $("#sliderHandle_" + code);
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

		/* creating the labels */
		html = "<div class='sliderLabelLeft'></div><div class='sliderLabelCentre'></div><div class='sliderLabelRight'></div>";
		labelFrame.html(html);
		const lbLeft = labelFrame.find("div.sliderLabelLeft");
		const lbCentre = labelFrame.find("div.sliderLabelCentre");
		const lbRight = labelFrame.find("div.sliderLabelRight");

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
					elementParent: `sliderNoReplyFrame_${code}`,
					labelParent: `sliderNoReplyFrame_${code}`,
					label: options.labelNoReply[language],
					value: 'noReply'
				},
				order: 'elementFirst'
			};
			noReplyInstance = new jsMultipleChoice(`sliderNoReply_${code}`, noReplyData);
		}

		if (value !== null) {
			if (value === 'N/A' && noReplyInstance !== null) {
				noReplyInstance.reset(true);
			} else {
				handle.show();
				updateTooltip();
			}
		}

		function onNoReplyChange(v) {
			if (v === true) {
				handle.hide();
				tooltip.css('visibility', 'hidden');
				value = 'N/A';
				sendData();
			} else {
				value = null;
				sendData();
			}
		}

		function createTrack() {
			let path = `M ${xMin} ${r0 - 4} H ${xMax} A ${4} ${4} 0 0 1 ${xMax} ${r0 + 4} `;
			path += `H ${xMin} A ${4} ${4} 0 0 1 ${r0} ${r0 - 4}`;
			let svg = `<path d='${path}' style='stroke: ${trackStroke}; stroke-width: 1px; fill: ${trackFill};' />`;
			if (options.showSteps === true) {
				for (let i = min; i <= max; i+=step) {
					svg += createTick(i);
				}
			}
			return svg;
		}

		function createTick(value) {
			let x = valueCoordinate(value);
			let path = `M ${x} ${r0 - 15} v 6`;
			let svg = `<path d='${path}' style='stroke: ${stepsStroke}; stroke-width: 1px;' />`;
			if (options.showAllValues) {
				let lbl_x = x - 50;
				valuesFrame.append(`<div class='sliderValue' style='left: ${lbl_x}px'>${value}</div>`);
			}
			return svg;
		}

		function createHandle(x0) {
			const y0 = r0;
			handleCoords.x = x0;
			handleCoords.xClient = trackFrame.offset().left + x0;
			let svg = `<g id="sliderHandle_${code}" transform="translate(${x0})">`;
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

		function valueCoordinate(v) {
			/* get coordinate for specific value */
			return Math.round((v - min) * dxValue + xMin);
		}

		function coordinateValue(x) {
			/* get closest value for specific coordinate */
			return Math.round((x - xMin) / dxStep) * step + min;
		}

		function trackClicked(e) {
			e.preventDefault();
			e.stopPropagation();
			const x = e.clientX - trackFrame.offset().left;
			handleCoords.v = coordinateValue(x);
			handleCoords.x = valueCoordinate(handleCoords.v);
			handleCoords.xClient = handleCoords.x + trackFrame.offset().left;
			handle.attr('transform', `translate(${handleCoords.x})`);
			value = handleCoords.v;
			updateTooltip();
			handle.show();
			sendData();
			if (options.noReply === true) {
				noReplyInstance.reset(false);
			}
		}

		function handleClicked(e) {
			/*  in order for slider to be draggable on touch device while page is also scrollable we need to disable
				scrolling once dragging starts and reenable it on release  */
			skin_disableScrolling();
			handleCoords.xCursor = e.clientX - handleCoords.xClient;
			handleMoved({x: e.clientX, y: e.clientY});
		}

		function handleReleased(e) {
			handleCoords.x = valueCoordinate(handleCoords.v);
			handleCoords.xClient = handleCoords.x + trackFrame.offset().left;
			handle.attr('transform', `translate(${handleCoords.x})`);
			value = handleCoords.v;
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
			handleCoords.v = coordinateValue(handleCoords.x);
			handle.attr('transform', `translate(${handleCoords.x})`);
			updateTooltip();
		}

		function updateTooltip() {
			if (handleCoords.v === null || options.showValue === false) {
				return;
			}
			tooltip.text(handleCoords.v);
			const w = tooltip.outerWidth();
			const x = handleCoords.x - w / 2;
			tooltip.css('margin-left', x);
			tooltip.css('visibility', 'visible');
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