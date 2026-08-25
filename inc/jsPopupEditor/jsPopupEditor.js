/*

jsPopupEditor v1.02

This is a popup tinyMCE editor for use in different interaction editors in OASYS.
The class is a singleton -> only one instance will ever be created as it relies on specific ids in the DOM

To get instantiate it use the static getInstance method rather than the "new" keyword:

let popupEditor = jsPopupEditor.getInstance();

*/

class jsPopupEditor {

	static instance = null;

	constructor() {
		if ($('#jsPopupEditorFrame').length > 0) {
			return jsPopupEditor.instance;
		}

		let html = "<div id='jsPopupEditorFrame'>";
		html += "<div id='jsPopupEditorWindow'>";
		html += "<div id='jsPopupEditorHeader'>WYSIWYG Editor</div>";
		html += "<div id='jsPopupEditorBreadCrumbs'></div>";
		html += "<div id='jsPopupEditorBody'></div>";
		html += "<div id='jsPopupEditorShortcuts'></div>";
		html += "<div id='jsPopupEditorButtonStrip'></div>";
		html += "</div>";
		html += "</div>";
		$('body').append(html);

		this.frame = $('#jsPopupEditorFrame');
		this.tabs = new jsTabs($("#jsPopupEditorBody"), "jsPopupEditorTabs");
		let eventName = this.tabs.getEventType('select');
		if (eventName) {
			$(window).on(eventName, (e) => this.switchLanguageClick(e));
		}

		$("#jsPopupEditorBody").append("<div id='jsPopupEditorToolbar'></div><div id='jsPopupEditorMain'><div id='jsPopupEditorContents'></div></div>");
		this.createEditor();
		let buttonData = {
			label: UILANG.m('Cancel'),
			callback: () => this.cancel()
		};
		let shortcuts = `<div>${UILANG.m('ESC')}: ${UILANG.m('Cancel')}</div><div>${UILANG.m('CTRL+S')}: ${UILANG.m('Save')}</div><div>${UILANG.m('CTRL+CR')}: ${UILANG.m('Confirm')}</div><div>${UILANG.m('SHIFT+TAB')}: ${UILANG.m('Switch language')}</div><div class="jspeShortcutForArrays">${UILANG.m('PageUp')}: ${UILANG.m('Previous label')}</div><div class="jspeShortcutForArrays">${UILANG.m('PageDown')}: ${UILANG.m('Next label')}</div>`;
		$('#jsPopupEditorShortcuts').html(shortcuts);

		new nxButton($('#jsPopupEditorButtonStrip'), 'cancelButton', buttonData);
		buttonData = {
			label: UILANG.m('Ok'),
			callback: () => this.confirm()
		};
		new nxButton($('#jsPopupEditorButtonStrip'), 'okButton', buttonData);
		this.hide();
		jsPopupEditor.instance = this;

		this.kbHandler = new jsKeyboardHandler('jsPopupEditorHandler');
		this.kbHandler.registerShortcut('CTRL+S', () => this.save(), {
			executeOnChildren: true,
			preventDefault: true
		});
		this.kbHandler.registerShortcut('CTRL+CR', () => this.confirm(), {
			executeOnChildren: true,
			preventDefault: true
		});
		this.kbHandler.registerShortcut('SHIFT+TAB', () => this.cycleLanguage(), {
			executeOnChildren: true
		});
		this.kbHandler.registerShortcut('ESC', () => this.cancel(), {
			executeOnChildren: true
		});
		this.kbHandler.registerShortcut('pageup', () => this.previousItem(), {
			executeOnChildren: true
		});
		this.kbHandler.registerShortcut('pagedown', () => this.nextItem(), {
			executeOnChildren: true
		});
		this.kbHandler.permissionHandler(() => this.acceptKeyStrokes());

		this.stateIsCleaned = true;
	}

	static getInstance() {
		if (this.instance === null) {
			new jsPopupEditor();
		}
		return this.instance;
	}

	createEditor() {
		let conf = {
			language: UILANG.m('langcode'),
			selector: '#jsPopupEditorContents',
			promotion: false,
			resize: false,
			height: '100%',
			schema: 'html5',
			forced_root_block : "div",
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
				"imagebrowser",
				"lists",
				"advlist"
			],
			toolbar: "bold italic underline subscript superscript forecolor backcolor | bullist numlist table | alignleft aligncenter alignright alignjustify styleselect fontsizeselect outdent indent imagebrowser",
			toolbar_mode: 'sliding',
			menu: {
				edit: {title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace'},
				insert: {title: 'Insert', items: 'charmap hr imagebrowser'},
				view: {title: 'View', items: 'visualchars visualblocks visualaid | preview'},
				format: {
					title: 'Format',
					items: 'bold italic underline strikethrough superscript subscript | formats | removeformat'
				},
				table: {title: 'Table', items: 'inserttable tableprops deletetable cell row column'},
				tools: {title: 'Tools', items: 'code'}
			},
			contextmenu: "imagebrowser inserttable | cell row column deletetable",
			hidden_input: false,
			paste_data_images: true,
			relative_urls: true,
			document_base_url: settings.rootURL,
			setup: (ed) => {
				ed.on('keydown', (e) => {this.keydown(e)});
				ed.on('keyup', () => {this.storeChanges()});
				ed.on('change', () => {this.storeChanges()});
				ed.on('Redo', () => {this.storeChanges()});
				ed.on('Undo', () => {this.storeChanges()});
			},
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

		this.editor = tinymce.get('jsPopupEditorContents');
	}

	/* keyboard handler when focus is in editor needs to be handled separately */
	keydown(e) {
		switch (e.key) {
			case "Escape":
				this.cancel();
				break;
			case "Enter":
				//CTRL-Return / CMD-Return
				if (e.ctrlKey|| e.metaKey) {
					this.confirm();
				}
				break;
			case "s":
				//CTRL-S / CMD-S
				if (e.ctrlKey|| e.metaKey) {
					e.preventDefault();
					this.save();
				}
				break;
			case "Tab":
				//SHIFT-Tab
				if (e.shiftKey) {
					e.preventDefault();
					this.cycleLanguage();
				}
				break;
			case "PageUp":
				this.previousItem();
				break;
			case "PageDown":
				this.nextItem();
				break;
		}
	}

	storeChanges() {
		if (this.stateIsCleaned ===true) {
			return; //do not store if editor has been cleaned already -> JS error
		}
		let data = tinymce.activeEditor.getContent();
		if (!this.pathHasArray) {
			this.source[this.language] = data;
		} else {
			this.source[this.pathArrayIndex][this.pathSuffix][this.language] = data;
		}
	}

	save() {
		this.sendData();
		//forward save call to upper layer if save method exists
		if (typeof(save) === 'function') {
			save.call(this);
		}
	}

	cycleLanguage() {
		let langCodes;
		if (!this.pathHasArray) {
			langCodes = Object.keys(this.source);
		} else {
			langCodes = Object.keys(this.source[this.pathArrayIndex][this.pathSuffix]);
		}
		if (langCodes.length === 1) {
			return;
		}
		let offset = langCodes.indexOf(selectedLanguage);
		if (offset === langCodes.length - 1) {
			offset = 0;
		} else {
			offset++;
		}
		this.language = langCodes[offset];
		this.tabs.select(this.language); //switch local tab manually
		this.switchLanguage();
	}

	previousItem() {
		this.cyclePath(-1);
	}

	nextItem() {
		this.cyclePath(1);
	}

	switchLanguageClick(e) {
		this.language = e.detail;
		this.switchLanguage();
	}

	switchLanguage() {
		gui.languageTabs.select(this.language); //switch language also in main interface
		this.setContent();
		this.editor.focus();
	}

	setContent() {
		if (!this.pathHasArray) {
			this.editor.resetContent(this.source[this.language]);
		} else {
			this.editor.resetContent(this.source[this.pathArrayIndex][this.pathSuffix][this.language]);
		}
	}

	setTabs(list) {
		this.tabs.setTabs(list);
	}

	setData() {
		if (!this.pathHasArray) {
			this.source = this.controller.getData(...this.path);
			this.tabs.setTabs(Object.keys(this.source), this.language);
		} else {
			this.source = this.controller.getData(...this.pathPrefix);
			this.tabs.setTabs(Object.keys(this.source[this.pathArrayIndex][this.pathSuffix]), this.language);
		}
	}

	getData() {
		return this.source;
	}

	cancel() {
		this.hide();
		this.cleanup();
	}

	confirm() {
		this.sendData();
		this.hide();
		this.cleanup();
	}

	cleanup() {
		this.stateIsCleaned = true;
		this.editor.setContent('');
		this.source = null;
		this.path = [];
		this.pathPrefix = [];
		this.pathArrayIndex = 0;
		this.pathSuffix = [];
		this.pathHasArray = false;
		this.language = null;
		this.sendDataCallback = null;
		this.setBreadcrumbs('');
		$(this.frame).find('.jspeShortcutForArrays').hide();
	}

	setBreadcrumbs(text) {
		$(this.frame).find('#jsPopupEditorBreadCrumbs').html(text);
	}

	sendData() {
		this.storeChanges();
		if (!this.pathHasArray) {
			this.sendDataCallback.call(this, this.source, ...this.path);
		} else {
			this.sendDataCallback.call(this, this.source, ...this.pathPrefix);
		}
	}

	show(callback) {
		this.setData(this.controller.getData(...this.path), this.language);
		this.sendDataCallback = callback;
		this.tabs.select(this.language);
		this.setContent();
		this.frame.show();
		this.visible = true;
		kbHandlerActive = false;

		//position cursor at end of newly inserted text
		this.editor.selection.select(this.editor.getBody(), true);
		this.editor.selection.collapse(false);

		this.stateIsCleaned = false;
		this.editor.focus();
	}

	hide() {
		this.frame.hide();
		window.focus();
		this.visible = false;
		kbHandlerActive = true;
	}

	setController(controller) {
		this.controller = controller;
	}

	clearController() {
		this.controller = null;
	}

	setPath(path) {
		if (!this.controller) {
			console.error("No controller set for popup editor");
			return;
		}
		this.path = path;
		this.subDividePath();
	}

	cyclePath(direction) {
		if (!this.pathHasArray)	{
			return;
		}
		this.storeChanges();
		this.pathArrayIndex += direction;
		if (this.pathArrayIndex < 0) {
			this.pathArrayIndex = 0;
		} else if (this.pathArrayIndex >= this.controller.getLengthOfArray(...this.pathPrefix)) {
			if (this.controller.getLengthOfArray(...this.pathPrefix) === -1) {
				this.pathArrayIndex = 0;
				this.pathHasArray = false;
				return;
			} else {
				this.pathArrayIndex = this.controller.getLengthOfArray(...this.pathPrefix) - 1;
			}
		}
		this.path = [...this.pathPrefix, this.pathArrayIndex, ...this.pathSuffix];
		this.setContent();
		this.setBreadcrumbs(`${UILANG.m('Editing label:')} ${this.pathArrayIndex+1}`);
	}

	subDividePath() {
		this.pathPrefix = [];
		this.pathArrayIndex = 0;
		this.pathSuffix = [];
		this.pathHasArray = false;
		for (let i = this.path.length-1; i >= 0; i--) {
			//check if path contains one or more arrays and keep the one deepest in the hierarchy
			if (this.pathHasArray === false) {
				if (typeof(this.path[i]) === 'number') {
					this.pathArrayIndex = this.path[i];
					this.pathHasArray = true;
				} else {
					this.pathSuffix.push(this.path[i]);
				}
			} else {
				this.pathPrefix.push(this.path[i]);
			}
		}
		if (this.pathHasArray) {
			$(this.frame).find('.jspeShortcutForArrays').show();
			this.setBreadcrumbs(`${UILANG.m('Editing label:')} ${this.pathArrayIndex+1}`);
		} else {
			$(this.frame).find('.jspeShortcutForArrays').hide();
		}
	}

	setLanguage(lang) {
		this.language = lang;
	}

	acceptKeyStrokes() {
		return this.visible;
	}

}