class advancedEditor extends InteractionEditor {

	static name = 'advanced';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];

	static {
		super.registerInteractionClass();
	}

	constructor(id) {
		super(id);
		this.config = {
			blocks: {
				'content': false,
				'scoring': false,
				'preview': false
			},
			sections: {
				'content': false,
				'scoring': false,
				'script': true
			}
		};
	}

	//override
	linkMasterController(controller, ...path) {
		super.linkMasterController(controller, ...path);
		this.controller.disableUndo();
	}

	storeChanges() {
		let data = tinymce.activeEditor.getContent();
		this.controller.setData(data, 'source', selectedLanguage);
	}

	//override
	createInterface(parent, sidePanel) {
		this.parent = parent;
		this.sidePanel = sidePanel;
		super.createContentEditor();

		this.parent.html("<div id='wysiwygEditor' class='spanningEditor'><div class='tinyPlaceHolder'></div></div>");
		this.createEditor();
	}

	createEditor() {
		let conf = {
			selector: '#wysiwygEditor > .tinyPlaceHolder',
			promotion: false,
			resize: true,
			height: '100%',
			schema: 'html5',
			paste_as_text: true,
			content_css: "editor/inc/css/editor.css?" + new Date().getTime(),
			plugins: [
				"charmap",
				"code",
				"preview",
				"searchreplace",
				"table",
				"visualblocks",
				"visualchars",
				"wordcount",
				"mediabrowser",
				"lists",
				"advlist",
				"template"
			],
			toolbar: "bold italic underline subscript superscript forecolor backcolor | bullist numlist table | alignleft aligncenter alignright alignjustify styles fontsize outdent indent mediabrowser template",
			toolbar_mode: 'sliding',
			menubar: 'edit insert view format table tools',
			menu: {
				edit: {title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace'},
				insert: {title: 'Insert', items: 'charmap hr mediabrowser template'},
				view: {title: 'View', items: 'visualchars visualblocks visualaid | preview'},
				format: {
					title: 'Format',
					items: 'bold italic underline strikethrough superscript subscript | formats | removeformat'
				},
				table: {title: 'Table', items: 'inserttable tableprops deletetable cell row column'},
				tools: {title: 'Tools', items: 'code'}
			},
			contextmenu: "mediabrowser inserttable | cell row column deletetable",
			hidden_input: false,
			paste_data_images: true,
			init_instance_callback: (ed) => {
				ed.resetContent(this.controller.getData('source', selectedLanguage));
			},
			setup: (ed) => {
				ed.on('keydown', kbHandler.handler);	//forwards keydown events to the main handler (e.g. for saving)
				ed.on('keyup', () => {
					this.storeChanges()
				});
				ed.on('change', () => {
					this.storeChanges()
				});
				ed.on('Redo', () => {
					this.storeChanges()
				});
				ed.on('Undo', () => {
					this.storeChanges()
				});
			},
			relative_urls: true,
			document_base_url: settings.JSrootURL,
			templates: 'inc/php/editorTemplates.php',
			table_class_list: [
				{title: 'None', value: ''},
				{title: 'Striped', value: 'striped'}
			]
		};

		switch (settings.interfaceLanguage) {
			case "DE":
				conf.language = "de";
				break;
			case "FR":
				conf.language = "fr_FR";
				break;
		}
		tinymce.init(conf);
	}

	switchLanguage(lang) {
		let ed = tinymce.activeEditor;
		ed.resetContent(this.controller.getData('source', selectedLanguage));
	}

	//override
	destroy() {
		tinymce.execCommand('mceRemoveControl', true, 'wysiwygEditor');
		this.sidePanel.removeSection('script');
	}

	/* static methods */

	/* in order to add or remove language data from a block when the editor is not open, use this static method */
	static removeLanguageData(data, lang) {
		delete (data.source?.[lang]);
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'source', lang);
	}

	static getTitle(data, lang) {
		return $(data?.source?.[lang] ?? '').text();
	}

	static generatePreview(data, lang, options = {}) {
		if (typeof (data.source) !== 'undefined' && typeof (data.source[lang]) !== 'undefined') {
			return data.source[lang];
		} else {
			return "";
		}
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['source'];
		super.moveLanguageData(data, oldLang, newLang, keys);
	}

}
