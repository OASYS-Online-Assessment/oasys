class sliderEditor extends InteractionEditor {

	static name = 'slider';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];

	static {
		super.registerInteractionClass();
	}

	constructor(id) {
		super(id);
	}

	createContentEditor() {
		super.createContentEditor();

		this.gui.question = new editorLabel({
			parent: this.contentEditor,
			label: UILANG.m('question'),
			controller: this.controller,
			path: ['question'],
			callback: () => this.editField('question')
		});

		this.gui.labelLeft = new editorLabel({
			parent: this.contentEditor,
			label: UILANG.m('left label'),
			controller: this.controller,
			path: ['labelLeft'],
			callback: () => this.editField('labelLeft')
		});

		this.gui.labelCentre = new editorLabel({
			parent: this.contentEditor,
			label: UILANG.m('centre label'),
			controller: this.controller,
			path: ['labelCentre'],
			callback: () => this.editField('labelCentre')
		});

		this.gui.labelRight = new editorLabel({
			parent: this.contentEditor,
			label: UILANG.m('right label'),
			controller: this.controller,
			path: ['labelRight'],
			callback: () => this.editField('labelRight')
		});

		this.gui.noReplyToggleDiv = new propsToggleDiv({
			parent: this.contentEditor,
			controller: this.controller,
			path: ['noReply'],
			conditions: [true]
		});

		this.gui.labelNoReply = new editorLabel({
			parent: this.gui.noReplyToggleDiv.getElement(),
			label: UILANG.m('"no reply" label'),
			controller: this.controller,
			path: ['labelNoReply'],
			callback: () => this.editField('labelNoReply')
		});

		this.gui.processing = new propsDropDown({
			parent: this.scoringEditor,
			label: UILANG.m("answer processing"),
			width: "240px",
			options: [
				{
					label: UILANG.m("none"),
					value: "none"
				},
				{
					label: UILANG.m("manual"),
					value: "manual"
				},
				{
					label: UILANG.m("automatic"),
					value: "auto"
				}
			],
			controller: this.controller,
			path: [
				"processing"
			]
		});

		this.gui.autoToggleDivMain = new propsToggleDiv({
			parent: this.scoringEditor,
			controller: this.controller,
			path: ['processing'],
			conditions: ['auto']
		});

		this.gui.answerType = new propsDropDown({
			div: this.gui.autoToggleDivMain,
			label: UILANG.m('correct answer type'),
			controller: this.controller,
			path: ['correction', 'type'],
			options: [
				{value: 'value', label: UILANG.m('single value')},
				{value: 'range', label: UILANG.m('range of values')}
			]
		});

		this.gui.valueToggleDivMain = new propsToggleDiv({
			div: this.gui.autoToggleDivMain,
			controller: this.controller,
			path: ['correction', 'type'],
			addClass: 'scoringRangeContainer',
			grid: '2col',
			conditions: ['value']
		});

		this.gui.scoringValue = new propsSpinnerRow({
			div: this.gui.valueToggleDivMain,
			label: UILANG.m('value'),
			controller: this.controller,
			path: ['correction', 'value'],
			addClass: 'scoringRangeContainer',
			useGrid: true,
			step: 1
		});

		this.gui.rangeToggleDivMain = new propsToggleDiv({
			div: this.gui.autoToggleDivMain,
			controller: this.controller,
			path: ['correction', 'type'],
			grid: '2col',
			addClass: 'scoringRangeContainer',
			conditions: ['range']
		});

		this.gui.scoringMin = new propsSpinnerRow({
			div: this.gui.rangeToggleDivMain,
			label: UILANG.m('range start'),
			controller: this.controller,
			path: ['correction', 'min'],
			useGrid: true,
			step: 1
		});

		this.gui.scoringMax = new propsSpinnerRow({
			div: this.gui.rangeToggleDivMain,
			label: UILANG.m('range end'),
			controller: this.controller,
			path: ['correction', 'max'],
			useGrid: true,
			step: 1
		});

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

		this.gui.minMaxStep = new Sanitizer({
			controller: this.controller,
			dataPaths: [['min'], ['max'], ['step']],
			elements: [this.gui.min, this.gui.max, this.gui.step],
			callback: (min, max, step) => {
				if (max <= min) {
					return [false, false, true]; //set min and max fields to invalid
				} else if ((max - min) % step !== 0) {
					return [false, false, false]; //set min, max and step field to invalid
				} else if (Math.floor((max - min) / step) > 1000) {
					return [false, false, true];
				} else {
					return [true, true, true]; //set min, max and step field to valid
				}
			}
		});

		this.gui.scoringValueSanitizer = new Sanitizer({
			controller: this.controller,
			dataPaths: [['min'], ['max'], ['step'], ['correction', 'value']],
			elements: [this.gui.scoringValue],
			callback: (min, max, step, value) => {
				if ((max - value) % step !== 0) {
					return [false]; //set value field to invalid if incompatible with step
				} else if (value < min || value > max) {
					return [false];
				} else {
					return [true];
				}
			}
		});

		this.gui.scoringRangeSanitizer = new Sanitizer({
			controller: this.controller,
			dataPaths: [['min'], ['max'], ['correction', 'min'], ['correction', 'max']],
			elements: [this.gui.scoringMin, this.gui.scoringMax],
			callback: (min, max, scoringMin, scoringMax) => {
				if (scoringMin > scoringMax) {
					return [false, false];
				} else if ((min > scoringMin || max < scoringMin) && (max < scoringMax || min > scoringMax)) {
					return [false, false];
				} else if (min > scoringMin || max < scoringMin) {
					return [false, true];
				} else if (max < scoringMax || min > scoringMax) {
					return [true, false];
				} else {
					return [true, true];
				}
			}
		});

		//link sanitizer to concerned fields so that they can trigger it if necessary
		this.gui.min.attachSanitizer(this.gui.minMaxStep);
		this.gui.max.attachSanitizer(this.gui.minMaxStep);
		this.gui.step.attachSanitizer(this.gui.minMaxStep);
		this.gui.scoringValue.attachSanitizer(this.gui.scoringValueSanitizer);
		this.gui.scoringMin.attachSanitizer(this.gui.scoringRangeSanitizer);
		this.gui.scoringMax.attachSanitizer(this.gui.scoringRangeSanitizer);

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.gui.labelLeft.contents = this.controller.getData('labelLeft', lang);
		this.gui.labelCentre.contents = this.controller.getData('labelCentre', lang);
		this.gui.labelRight.contents = this.controller.getData('labelRight', lang);
		this.gui.labelNoReply.contents = this.controller.getData('labelNoReply', lang);
		this.preview();
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
		this.gui.labelLeft.contents = data['labelLeft'][selectedLanguage];
		this.gui.labelCentre.contents = data['labelCentre'][selectedLanguage];
		this.gui.labelRight.contents = data['labelRight'][selectedLanguage];
		this.gui.labelNoReply.contents = data['labelNoReply'][selectedLanguage];
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
		delete (data.labelLeft?.[lang]);
		delete (data.labelRight?.[lang]);
		delete (data.labelCentre?.[lang]);
		delete (data.labelNoReply?.[lang]);
	}

	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
		initPath(data, "", 'labelLeft', lang);
		initPath(data, "", 'labelRight', lang);
		initPath(data, "", 'labelCentre', lang);
		initPath(data, "", 'labelNoReply', lang);
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.question) {
			return "";
		}

		let maxWidth = options.maxWidth ?? 1024;

		let html = `<p>${data.question[lang]}</p>`;

		const code = 'preview';

		let min = data.min;
		let max = data.max;
		let step = data.step;
		if (min >= max) {
			return UILANG.m("Cannot render slider: 'maximum' needs to be bigger than 'minimum'");
		}
		if ((max - min) % step !== 0) {
			return UILANG.m("Cannot render slider: the range between 'minimum' and 'maximum' must be divisible by 'interval'");
		}

		if ((max - min) / step > 1000) {
			return UILANG.m("Cannot render a slider with more than 1000 segments!");
		}

		const trackStroke = '#888888';
		const trackFill = '#DDDDDD';
		const stepsStroke = '#666666';
		const handleBg = '#666666';
		const handleArrows = '#FFFFFF';

		let r0 = 24; //radius of handle
		let r1 = 18; //radius of inner handle circle

		//responsiveness
		let trackLength = maxWidth;
		const requiredHeight = (r0 * 2) + 2;

		const xMax = trackLength - r0; //rightmost boundary for handle to move to
		const xMin = r0; //leftmoust boundary for handle to move to
		const dxValue = (trackLength - 2 * r0) / (max - min);
		const dxStep = dxValue * step;

		let values = '';
		let svg = `<svg id='sliderTrack_${code}' class='sliderTrackBack' xmlns='http://www.w3.org/2000/svg' style='height: ${requiredHeight}px; width: 100%; overflow: hidden; position: absolute;'>`;
		svg += createTrack();
		svg += createHandle(xMin);
		svg += "</svg>";

		html += `	<p>
						<div class='sliderFrame' style='position:relative; width: ${maxWidth}px'>`;
		if (data.showValue === true) {
			html += `		<div class="sliderTooltipFrame"><div class='sliderTooltip'>${min}</div></div>`;
		}

		html += `			<div class='sliderTrackFrame' style="height: ${requiredHeight}px">${svg}</div>
							<div class='sliderValuesFrame'>${values}</div>
							<div class='sliderLabelFrame'>
								<div class='sliderLabelLeft'>${data.labelLeft[lang]}</div>
								<div class='sliderLabelCenter'>${data.labelCentre[lang]}</div>
								<div class='sliderLabelRight'>${data.labelRight[lang]}</div>
							</div>
						</div>`;

		if (data.noReply !== false) {
			html += `	<div class="sliderNoReplyFrame"><span class='previewTag_CB'>&nbsp;</span>&nbsp;${data.labelNoReply[lang]}</div>`;
		}

		html += `	</p>`;

		return html;

		function createTrack() {
			let path = `M ${xMin} ${r0 - 4} H ${xMax} A ${4} ${4} 0 0 1 ${xMax} ${r0 + 4} `;
			path += `H ${xMin} A ${4} ${4} 0 0 1 ${r0} ${r0 - 4}`;
			let svg = `<path d='${path}' style='stroke: ${trackStroke}; stroke-width: 1px; fill: ${trackFill};' />`;
			if (data.showSteps === true) {
				for (let i = min; i <= max; i += step) {
					svg += createTick(i);
				}
			}
			return svg;
		}

		function createTick(value) {
			let x = valueCoordinate(value);
			let path = `M ${x} ${r0 - 15} v 6`;
			let svg = `<path d='${path}' style='stroke: ${stepsStroke}; stroke-width: 1px;' />`;
			if (data.showAllValues) {
				let lbl_x = x - 50;
				values += `<div class='sliderValue' style='left: ${lbl_x}px'>${value}</div>`;
			}
			return svg;
		}

		function createHandle(x0) {
			const y0 = r0;
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

	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', 'labelLeft', 'labelCentre', 'labelRight', 'labelNoReply'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
