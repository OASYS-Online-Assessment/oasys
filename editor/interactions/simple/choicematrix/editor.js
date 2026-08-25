class choiceMatrixEditor extends InteractionEditor {

	static name = 'choicematrix';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];

	static {
		super.registerInteractionClass();
	}

	constructor(id) {
		super(id);
	}

	/* define rules for controller to see if data is consistent */
	setValidators() {
		super.setValidators();
		this.controller.addConsistencyRule({
			type: 'unique',
			path: ['labels'],
			subPath: ['value']
		});
		this.controller.addConsistencyRule({
			type: 'unique',
			path: ['rows'],
			subPath: ['value']
		});
		this.controller.addConsistencyRule({
			type: 'notEmpty',
			path: ['labels'],
			subPath: ['value']
		});
		this.controller.addConsistencyRule({
			type: 'notEmpty',
			path: ['rows'],
			subPath: ['value']
		});
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

		this.gui.labels = new editorList({
			parent: this.contentEditor,
			label: UILANG.m('column labels'),
			buttonLabel: UILANG.m('add column'),
			importLabel: UILANG.m('import column labels'),
			importTitle: UILANG.m('import column labels'),
			callback: (...path) => this.editField(...path),
			controller: this.controller,
			itemLimit: 21,
			path: ['labels']
		});

		this.gui.rows = new editorList({
			parent: this.contentEditor,
			label: UILANG.m('row labels'),
			buttonLabel: UILANG.m('add row'),
			importLabel: UILANG.m('import row labels'),
			importTitle: UILANG.m('import row labels'),
			valuePrefix: 'row',
			callback: (...path) => this.editField(...path),
			controller: this.controller,
			path: ['rows']
		});

		this.gui.processing = new propsDropDown({
			parent: this.scoringEditor,
			label: UILANG.m("answer processing"),
			width: '240px',
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
			conditions: ['auto'],
			hideIfDataInvalid: true
		});

		this.gui.checkGrid = new editorCheckListGrid({
			parent: this.gui.autoToggleDivMain.getElement(),
			label: UILANG.m('correct answer(s)'),
			controller: this.controller,
			path: ['correction'],
			rowsPath: ['rows'],
			labelsPath: ['labels'],
			typePath: ['choiceType'],
			fieldWidthPath: ['fieldWidth'],
			layoutPath: ['layout']
		});

		this.gui.singleToggleDivMain = new propsToggleDiv({
			div: this.gui.autoToggleDivMain,
			controller: this.controller,
			path: ['choiceType'],
			conditions: ['single']
		});

		this.gui.noreply = new editorDropDown({
			parent: this.gui.singleToggleDivMain.getElement(),
			label: UILANG.m('consider the following answer as if no answer was given'),
			controller: this.controller,
			path: ['noreply'],
			itemsPath: ['labels']
		});

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.gui.labels.renderItems();
		this.gui.rows.renderItems();
		this.gui.checkGrid.updateGrid();
		this.preview();
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
		for (let i in data.labels) {
			delete (data.labels[i].label?.[lang]);
		}
		for (let i in data.rows) {
			delete (data.rows[i].label?.[lang]);
		}
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
		for (let i in data.labels) {
			initPath(data, "", 'labels', i, 'label', lang);
		}
		for (let i in data.rows) {
			initPath(data, "", 'rows', i, 'label', lang);
		}
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.question || data.labels.length === 0 || data.rows.length === 0) {
			return "";
		}
		if (data.__valid === false) {
			return UILANG.m('Error: invalid values or variable names. Please correct the interaction.');
		}

		let maxWidth = options.maxWidth ?? null;

		let html = `<p>${data.question[lang]}</p>`;

		let fieldHTML;
		if (data.choiceType === 'single') {
			fieldHTML = "<span class='previewTag_RB'>&nbsp;</span>";
		} else {
			fieldHTML = "<span class='previewTag_CB'>&nbsp;</span>";
		}

		let rows = deepCopy(data.rows);
		if (data.shuffle === true && !options.skipShuffling) {
			shuffleArray(rows);
		}

		let tableLayout = true;
		if (maxWidth !== null) {
			let required = data.labels.length * (data.fieldWidth + 10) + data.labelWidth;
			if (maxWidth < required) {
				tableLayout = false;
			}
		}

		let labels = [];
		let legend = '<div class="legend">';
		for (let i in data.labels) {
			if (data.layout === 'inplace') {
				labels[i] = data.labels[i].label[lang];
			} else {
				labels[i] = parseInt(i) + 1;
				legend += `<div class='legendLabel'><div>${labels[i]} = </div><div>${data.labels[i].label[lang]}</div></div>`;
			}
		}
		legend += '</div>';

		if (data.layout === 'legend') {
			html += legend;
		}

		if (tableLayout === true) {
			html += `<div class='matrixBlock tableLayout'>`;
			html += `<div class='matrixHeader' style="grid-template-columns: 1fr repeat(${data.labels.length}, ${data.fieldWidth}px);">`;
			for (let i in labels) {
				html += `<div class='matrixHeaderCell'>${labels[i]}</div>`;
			}
			html += "</div>";
			for (let i in rows) {
				html += `<div class='matrixRow' style="grid-template-columns: 1fr repeat(${data.labels.length}, ${data.fieldWidth}px);">
						<div class='matrixRowLabel'>${rows[i].label[lang]}</div>`;
				for (let j in data.labels) {
					html += `<div class='matrixChoiceCell' data-group="${rows[i].value}" data-value="${data.labels[j].value}">${fieldHTML}</div>`;
				}
				html += "</div>";
			}
			html += '</div>';
		} else {
			html += `<div class='matrixBlock stackedLayout'>`;
			let choices = `<div class='matrixHeader' style="grid-template-columns: repeat(${data.labels.length}, 1fr);">`;
			for (let i in labels) {
				choices += `<div class='matrixHeaderCell'>${labels[i]}</div>`;
				choices += `<div class='matrixChoiceCell'>${fieldHTML}</div>`;
			}
			choices += "</div>";
			for (let i in rows) {
				html += `<div class='matrixChoicesRow'>`;
				html += `<div class='matrixRowLabel'>${rows[i].label[lang]}</div>`;
				html += choices;
				html += `</div>`;
			}
			html += '</div>';
		}

		return html;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', {path: ['labels'], subpath: ['label']}, {path: ['rows'], subpath: ['label']}];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
