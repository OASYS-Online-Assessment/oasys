class imageEditor extends InteractionEditor {

	static name = 'image';
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

		this.gui.browse = new editorButton({
			parent: this.contentEditor,
			alignment: 'center',
			label: UILANG.e('select file'),
			callback: () => this.browse()
		});

		this.gui.filename = new editorInfobox({
			parent: this.contentEditor,
			label: '%@',
			header: UILANG.e('selected file:'),
			paths: [['filename']],
			controller: this.controller,
			localized: true,
			dblClick: () => this.browse()
		});

		this.gui.width = new editorTextField({
			parent: this.contentEditor,
			label: UILANG.e('width'),
			path: ["width"],
			controller: this.controller,
			localized: true,
			cssValidator: true,
			alignment: 'center',
			validationMessage: UILANG.e('not a valid CSS value')
		});

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor')
			/* updateCallback omitted here to prevent the browser
			   from reloading the media file at each change of width */
		});


	}

	browse() {
		new jsMediaPlugin('oasysImageBrowser', {
			mediaTypes: 'image',
			hideOptions: true,
			onClose: (sender, data) => {
				this.controller.setData(data.mediaFileName, 'filename', selectedLanguage);
				this.controller.setData(data.fileId, 'fileid', selectedLanguage);
				this.controller.setData(data.checksum, 'filechecksum', selectedLanguage);
				this.controller.setData(data.width, 'width', selectedLanguage);
				this.controller.setData(data.width / data.height, 'ratio', selectedLanguage);
			}
		});
	}

	switchLanguage(lang) {
		this.gui.filename.update();
		this.gui.width.update();
		this.preview();
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.filename?.[lang]);
		delete (data.fileid?.[lang]);
		delete (data.filechecksum?.[lang]);
		delete (data.width?.[lang]);
		delete (data.ratio?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, '', 'filename', lang);
		initPath(data, '', 'fileid', lang);
		initPath(data, '', 'filechecksum', lang);
		initPath(data, '', 'width', lang);
		initPath(data, '', 'ratio', lang);
	}

	static getTitle(data, lang) {
		return data?.filename?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.fileid[lang]) {
			return "";
		}

		let width = data.width[lang];
		if (!isNaN(width)) {
			width = width + 'px';
		}
		let css = `max-width: 100%; width: ${width};`;
		return `<div style="text-align: ${data.align}"><img src="${settings.JSrootURL}fetchMediaFile.php?fileid=${data.fileid[lang]}&amp;checksum=${data.filechecksum[lang]}" style="${css}"></div>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['filename', 'fileid', 'filechecksum', 'width'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
