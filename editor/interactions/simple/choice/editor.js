class choiceEditor extends InteractionEditor {

	//static property for editor name, can be used inside instance methods as this.constructor.name
	static name = 'choice';
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
			path: ['choices'],
			subPath: ['value']
		});
		this.controller.addConsistencyRule({
			type: 'notEmpty',
			path: ['choices'],
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

		this.gui.choices = new editorList({
			parent: this.contentEditor,
			label: UILANG.m('choices'),
			buttonLabel: UILANG.m('add choice'),
			importLabel: UILANG.m('import choice labels'),
			importTitle: UILANG.m('import choice labels'),
			callback: (...path) => this.editField(...path),
			controller: this.controller,
			path: ['choices']
		});

		this.gui.processing = new propsDropDown({
			parent: this.scoringEditor,
			label: UILANG.m("answer processing"),
			width:"240px",
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

		this.gui.checkList = new editorCheckList({
			parent: this.gui.autoToggleDivMain.getElement(),
			label: UILANG.m('correct answer(s)'),
			controller: this.controller,
			path: ['correction'],
			itemsPath: ['choices'],
			typePath: ['choiceType']
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
			itemsPath: ['choices']
		});


		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.gui.choices.renderItems();
		this.gui.checkList.updateList();
		this.gui.noreply.updateDropDown();
		this.preview();
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
	}

	/* static methods */
	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
		for (let i in data.choices) {
			delete (data.choices[i].label?.[lang]);
		}
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
		for (let i in data.choices) {
			initPath(data, "", 'choices', i, 'label', lang);
		}
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.question) {
			return "";
		}
		if (data.__valid === false) {
			return UILANG.m('Error: invalid values. Please correct the interaction.');
		}

		let html = `<p>${data.question[lang]}</p>`;
		if (data.choiceType === 'dropdown') {
			html += "<p><span class='previewTag_DD'>&#9660;</span></p>";
		} else {
			let width;
			switch (data.size) {
				case 's':
					width = '50px';
					break;
				case 'm':
					width = '200px';
					break;
				case 'l':
					width = '400px';
					break;
				case 'xl':
					width = '800px';
					break;
				case 'custom':
					width = data.width;
					break;
			}

			let fieldHTML;
			let customFields = [];
			if (data.choiceType === 'single') {
				fieldHTML = "<span class='previewTag_RB'>&nbsp;</span>";
				if (data.textfields.single === true) {
					customFields.push(data.choices.length - 1); //last choice to get a textfield
				}
			} else {
				fieldHTML = "<span class='previewTag_CB'>&nbsp;</span>";
				if (data.textfields.multiple > 0) {
					for (let i = 1; i <= data.textfields.multiple; i++) {
						customFields.push(data.choices.length - i); //x last choices to get a textfield each
					}
				}
			}

			let choices = deepCopy(data.choices);
			if (data.order === 'alphabet') {
				orderArrayByProperty(choices, 'label', lang);
			} else if (data.order === 'random' && !options.skipShuffling) {
				shuffleArray(choices);
			}

			html += `<div class='choiceWrapper choiceAlignment_${data.alignment}'><div style="grid-row-gap: ${data.rowgap}px; grid-column-gap: ${data.colgap}px" class='choiceBlock choiceLayout_${data.layout} choiceLabelPosition_${data.labelPosition}'>`;
			for (let i in data.choices) {
				let choiceHTML = '';
				if ((data.layout === 'horizontal' && (data.labelPosition === 'above' || data.labelPosition === 'below')) || data.layout === 'twocolumns') {
					choiceHTML += "<div class='choiceCell'>";
				} else {
					choiceHTML += "<div class='choiceCellInline'>";
				}
				if (data.labelPosition === 'right' || data.labelPosition === 'below') {
					choiceHTML += `<div class='choiceElement'>${fieldHTML}</div>`;
					choiceHTML += `<div class='choiceLabel'>${choices[i].label[lang]}`;
					if (customFields.includes(parseInt(i))) {
						if (data.order === 'manual') {
							choiceHTML += `&nbsp;<span class='previewTag_TF' style='width: ${width}'>&nbsp;</span>`;
						}
					}
					choiceHTML += "</div>";
				} else if (data.labelPosition === 'left' || data.labelPosition === 'above' || data.labelPosition === 'only') {
					choiceHTML += `<div class='choiceLabel'>${choices[i].label[lang]}`;
					if (customFields.includes(parseInt(i))) {
						if (data.order === 'manual') {
							choiceHTML += `&nbsp;<span class='previewTag_TF' style='width: ${width}'>&nbsp;</span>`;
						}
					}
					choiceHTML += "</div>";
					choiceHTML += `<div class='choiceElement'>${fieldHTML}</div>`;
				}
				choiceHTML += "</div>";
				html += choiceHTML;
			}
			html += '</div></div>';
		}

		return html;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', {path: ['choices'], subpath: ['label']}];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
