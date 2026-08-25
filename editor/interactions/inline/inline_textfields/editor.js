class inline_textfieldsEditor extends InteractionEditor {

	static name = 'inline_textfields';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];
	static fieldPattern = new RegExp(/(?<prefix>[\p{L}\-']*)\[{2}[1-9]\d?#(?<correct>[^<>\[\]]+?)\]{2}(?<suffix>[\p{L}\-']*)/gu);

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

		this.gui.inlineEditor = new editorInlineEditor({
			parent: this.contentEditor,
			textBoxLabel: UILANG.m('Text'),
			fieldsBoxLabel: UILANG.m('Fields'),
			buttonStripLabel: UILANG.m('Select some text and click on the button to convert the selection to a text entry.'),
			controller: this.controller,
			paths: {source: ['source'], fields: ['fields']},
			interactionEditor: this
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

		this.gui.answerOptions = new propsDiv({
			div: this.gui.autoToggleDivMain,
			label: UILANG.m('options')
		});

		this.gui.case = new propsSwitchRow({
			div: this.gui.answerOptions,
			label: UILANG.m('answers are case sensitive'),
			controller: this.controller,
			addClass: 'editorContainerRow',
			path: ['case']
		});

		this.gui.answerList = new editorMultiList({
			div: this.gui.autoToggleDivMain,
			label: UILANG.m('correct answers'),
			controller: this.controller,
			path: ['correction'],
			fieldsPath: ['fields']
		});

		this.controller.registerView((data) => this.sanitizeAnswerList(data), 'fields');

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	sanitizeAnswerList(fields) {
		let answerList = this.controller.getData('correction');
		//remove all answers from fields that no longer exist
		for (let i in answerList) {
			let found = false;
			for (let lang in fields) {
				if (typeof (fields[lang][i]) !== 'undefined') {
					found = true;
					break;
				}
			}
			if (found === false) {
				this.controller.eraseData('correction', i);
			}
		}
	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.gui.inlineEditor.switchLanguage(lang);
		this.gui.answerList.switchLanguage(lang);
		this.preview();
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
	}

	/* static methods */
	static getUndoIgnorePaths() {
		return [['fields']];
	}

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
		delete (data.placeholder?.[lang]);
		delete (data.source?.[lang]);
		delete (data.fields?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
		initPath(data, "", 'placeholder', lang);
		initPath(data, "", 'source', lang);
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.question || !data.source || typeof (lang) === 'undefined') {
			return "";
		}

		let width;
		switch (data.size) {
			case 's':
				width = '50px';
				break;
			case 'm':
				width = '100px';
				break;
			case 'l':
				width = '150px';
				break;
			case 'xl':
				width = '200px';
				break;
			case 'custom':
				width = data.width;
				break;
		}
		let source = data.source[lang];
		source = source.replace(this.fieldPattern, (match, g1, g2, g3, offset, string, groups) => {
			const prefix = groups.prefix || '';
			const suffix = groups.suffix || '';
			return `<span class="preview_noWrap">${prefix}<span class='previewTag_inlineText' style="width: ${width}"></span>${suffix}</span>`;
		});

		return `${data.question[lang]}<p class="inlineInteractionText">${source}</p>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', 'placeholder', 'source', 'fields'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
