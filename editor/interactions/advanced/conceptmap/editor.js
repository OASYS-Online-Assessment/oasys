class conceptmapEditor extends InteractionEditor {

	static name = 'conceptmap';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];

	static {
		super.registerInteractionClass();
	}

	constructor(id) {
		super(id);
		this.config.blocks.scoring = false;
		this.config.blocks.preview = false;
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

		this.gui.launchButton = new editorButton({
			parent: this.contentEditor,
			alignment: 'center',
			label: UILANG.m('Open concept maps tool'),
			callback: () => this.launchTool()
		});

		this.gui.info = new editorInfobox({
			parent: this.contentEditor,
			label: UILANG.m('The concept maps tool allows creating a document with which the test takers are to start out. This may also be left entirely blank.')
		});

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
	}

	updateContent(data) {
		this.gui.question.contents = data['question'][selectedLanguage];
	}

	updateConceptMap(data) {
		this.setContent(data, 'conceptmap');
	}

	launchTool() {
		let url = "../apps/conceptmaps/";
		openExternalEditor({
			url: url,
			updateCallback: (data) => this.updateConceptMap(data),
			data: JSON.stringify(this.controller.getData('conceptmap')),
			question: this.prepareQuestionForEditor()
		});
	}

	prepareQuestionForEditor() {
		let question = this.controller.getData('question', selectedLanguage);
		return question.replace(/fetchMediaFile\.php/g, settings.JSrootURL + "fetchMediaFile.php");
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.question?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		return `<p>${data.question[lang]}</p><p>${UILANG.m('no preview available for concept maps')}</p>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
