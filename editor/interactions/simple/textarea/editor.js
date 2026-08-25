class textareaEditor extends InteractionEditor {

	static name = 'textarea';
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
				}
			],
			controller: this.controller,
			path: [
				"processing"
			]
		});

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.preview();
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
		delete (data.placeholder?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
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
		let height;
		switch (data.size) {
			case 's':
				width = '200px';
				height = '100px';
				break;
			case 'm':
				width = '400px';
				height = '200px';
				break;
			case 'l':
				width = '800px';
				height = '400px';
				break;
			case 'xl':
				width = '100%';
				height = '600px';
				break;
			case 'custom':
				width = data.width;
				height = data.height;
				break;
		}
		return `<p>${data.question[lang]}</p><p><textarea class="quickPreview" readonly style="width: ${width}; height: ${height}; resize: ${data.resize}; max-width: calc(100% - 10px)"></textarea></p>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', 'placeholder'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
