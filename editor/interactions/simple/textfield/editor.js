class textfieldEditor extends InteractionEditor {

	static name = 'textfield';
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
			label: UILANG.m('Question'),
			controller: this.controller,
			path: ['question'],
			callback: () => this.editField('question')
		});

		this.gui.suffix = new editorLabel({
			parent: this.contentEditor,
			label: UILANG.m('Suffix'),
			controller: this.controller,
			path: ['suffix'],
			callback: () => this.editField('suffix')
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

		this.gui.scoringOptions = new propsDiv({
			div: this.gui.autoToggleDivMain,
			label: UILANG.m('options')
		});

		this.gui.case = new propsSwitchRow({
			div: this.gui.scoringOptions,
			label: UILANG.m('answers are case sensitive'),
			controller: this.controller,
			addClass: 'editorContainerRow',
			path: ['case']
		});

		this.gui.answerList = new propsList({
			div: this.gui.autoToggleDivMain,
			label: UILANG.m('correct answers'),
			controller: this.controller,
			path: ['correction']
		});

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.gui.suffix.contents = this.controller.getData('suffix', lang);
		this.preview();
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
		this.gui.suffix.contents = data['suffix'][selectedLanguage];
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
		delete (data.suffix?.[lang]);
		delete (data.placeholder?.[lang]);
	}

	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
		initPath(data, "", 'suffix', lang);
		initPath(data, "", 'placeholder', lang);
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.question) {
			return "";
		}

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
		return `<p>${data.question[lang] ?? ''}</p><div class="preview_inlineWrapper"><div class='previewTag_TF' style="width: ${width}; max-width: calc(100% - 10px)"></div>${data.suffix[lang] ?? ''}</div>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', 'suffix', 'placeholder'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
