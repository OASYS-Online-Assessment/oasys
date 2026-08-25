class buttonEditor extends InteractionEditor {

	static name = 'button';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];

	static {
		super.registerInteractionClass();
	}

	constructor(id) {
		super(id);
		this.config.sections.scoring = false;
		this.config.blocks.scoring = false;
	}

	createContentEditor() {
		super.createContentEditor();

		this.gui.label = new editorLabel({
			parent: this.contentEditor,
			label: UILANG.m('label'),
			controller: this.controller,
			path: ['label'],
			callback: () => this.editField('label')
		});

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	switchLanguage(lang) {
		this.gui.label.contents = this.controller.getData('label', lang);
		this.preview();
	}

	updateContent(data) {
		this.gui.label.contents = data['label'][selectedLanguage];
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.label?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'label', lang);
	}

	static getTitle(data, lang) {
		return data?.label?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.label) {
			return "";
		}

		let previewHTML = `<div style='text-align: ${data.align}'><span class='previewTag_button'>${data.label[lang]}</span></div>`;
		if (data.action === 'switchLanguage') {
			previewHTML += `<div class="preview_warning">${UILANG.m("WARNING! The 'switch language' action is deprecated. Please use a language switcher interaction, instead.")}</div>`;
		}
		return previewHTML;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['label'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
