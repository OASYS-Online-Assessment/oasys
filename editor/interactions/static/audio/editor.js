class audioEditor extends InteractionEditor {

	static name = 'audio';
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

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor')
			/* updateCallback omitted here to prevent the browser
			   from reloading the media file at each change of width */
		});

		this.registerTrigger({
			paths: [
				['limitPlayCount']
			],
			callback: (value) => {
				if (value === true) {
					this.controller.setData(true, 'disableControls');
				}
			}
		});

		this.registerTrigger({
			paths: [
				['disableControls']
			],
			callback: (value) => {
				if (value === false) {
					this.controller.setData(false, 'limitPlayCount');
				}
			}
		})

	}

	browse() {
		new jsMediaPlugin('oasysAudioBrowser', {
			mediaTypes: 'audio',
			hideOptions: true,
			onClose: (sender, data) => {
				this.controller.pauseUpdates();
				this.controller.setData(data.checksum, 'filechecksum', selectedLanguage);
				this.controller.setData(data.fileId, 'fileid', selectedLanguage);
				this.controller.resumeUpdates();
				this.controller.setData(data.mediaFileName, 'filename', selectedLanguage);
			}
		});
	}

	switchLanguage(lang) {
		this.gui.filename.update();
		this.preview();
	}

	/* static methods */

	/* in order to remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.filename?.[lang]);
		delete (data.fileid?.[lang]);
		delete (data.filechecksum?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, '', 'filename', lang);
		initPath(data, '', 'fileid', lang);
		initPath(data, '', 'filechecksum', lang);
	}

	static getTitle(data, lang) {
		return data?.filename?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.fileid[lang] || !data.filechecksum[lang]) {
			return "";
		}

		return `<audio controls src="${settings.JSrootURL}fetchMediaFile.php?fileid=${data.fileid[lang]}&amp;checksum=${data.filechecksum[lang]}" style='max-width: 100%'></audio>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['filename', 'fileid', 'filechecksum'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
