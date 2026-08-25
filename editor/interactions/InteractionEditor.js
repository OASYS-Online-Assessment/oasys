class InteractionEditor {

	constructor(id, config) {
		this.blockId = id;
		this.controller = new Controller('editor');
		this.controller.setUndoIgnorePaths(this.constructor.getUndoIgnorePaths());
		this.path = [];
		this.gui = {};
		this.config = {
			blocks: {
				'content': true,
				'scoring': true,
				'preview': true
			},
			sections: {
				'content': true,
				'scoring': true,
				'script': true
			}
		};
		this.blockCount = 0;
		this.previewHTML = '';
		this.editorOrder = [];
		this.setValidators();
		this.addSanityChecks();

		/* some global variables for convenience when developing */
		if (settings.developmentMode === true) {
			window.ed = this;
			window.con = this.controller;
		}

		/* whenever a correction has been entered on processing = 'auto' mode, reset to default value when processing changes */
		this.registerTrigger({
			paths: [
				['processing']
			],
			callback: (value) => {
				if (value !== 'auto') {
					if (this.controller.checkPath('correction')) {
						let correctionTemplates = this.constructor.defaultValues.filter((el) => el.path[0] === 'correction');
						let correction = {};
						for (let i in correctionTemplates) {
							let template = deepCopy(correctionTemplates[i]);
							if (template.path.length === 1 && template.path[0] === 'correction') {
								this.controller.setData(template.value, 'correction');
							} else {
								template.path.shift();
								initPath(correction, template.value, ...template.path);
							}
						}
						if (objectLength(correction) > 0) {
							this.controller.setData(correction, 'correction');
						}
					}
					if (this.controller.checkPath('noreply')) {
						let noReplyTemplates = this.constructor.defaultValues.filter((el) => el.path[0] === 'noreply');
						let noReply = {};
						for (let i in noReplyTemplates) {
							let template = deepCopy(noReplyTemplates[i]);
							if (template.path.length === 1 && template.path[0] === 'noreply') {
								this.controller.setData(template.value, 'noreply');
							} else {
								template.path.shift();
								initPath(noReply, template.value, ...template.path);
							}
						}
						if (objectLength(noReply) > 0) {
							this.controller.setData(noReply, 'noreply');
						}
					}
				}
			}
		})
	}

	linkMasterController(controller, ...path) {
		this.masterController = controller;
		this.masterPath = path;
		let data = this.constructor.initData(this.masterController.getData(...this.masterPath));
		this.controller.setData(data);
		this.controller.resetChangedFlag();
		this.controller.registerView((data) => {
			this.updateMasterController(data)
		});
		this.controller.registerView(() => {
			this.preview()
		});
		this.controller.registerContextGetterAndSetter(() => getLanguage(), (lang) => switchLanguage(lang));
	}

	getData() {
		return this.controller.getData(...this.path);
	}

	setData(data) {
		this.controller.setData(data, ...this.path);
	}

	updateMasterController(data) {
		this.masterController.setData(data, ...this.masterPath);
	}

	//get all used languages from master controller
	getLanguages() {
		return this.masterController.getData('languages');
	}

	//get empty language object with all used languages as keys
	getEmptyLanguageObject() {
		let languages = this.getLanguages();
		let obj = {};
		for (let lang of languages) {
			obj[lang] = null;
		}
		return obj;
	}

	preview() {
		if (this.gui.preview) {
			let newPreviewHTML = this.constructor.generatePreview(this.controller.getData(), selectedLanguage, {maxWidth: this.gui.preview.getWidth()});
			if (newPreviewHTML !== this.previewHTML) {
				//only update if there is any change
				this.previewHTML = newPreviewHTML;
				this.gui.preview.update(this.previewHTML);
				MathJax.typeset();
			}
		}
	}

	createEditorHeader(type) {
		if (this.blockCount < 2) {
			//do not create headers if there is only 1 block
			return '';
		}
		let html = '';
		html += `<div id='${type}EditorAnchor' class='interactionHeader'></div>`;
		html += `<div id='${type}EditorSwitch' class='interactionEditorSwitch'>${UILANG.m(type)}</div>`;
		return html;
	}

	createInterface(parent, sidePanel) {
		this.parent = parent;
		this.sidePanel = sidePanel;
		switch (settings.editorOrder) {
			case 'cps':
				if (this.config.blocks.content) {
					this.editorOrder.push('content');
				}
				if (this.config.blocks.preview) {
					this.editorOrder.push('preview');
				}
				if (this.config.blocks.scoring) {
					this.editorOrder.push('scoring');
				}
				break;
			case 'csp':
				if (this.config.blocks.content) {
					this.editorOrder.push('content');
				}
				if (this.config.blocks.scoring) {
					this.editorOrder.push('scoring');
				}
				if (this.config.blocks.preview) {
					this.editorOrder.push('preview');
				}
				break;
			case 'pcs':
				if (this.config.blocks.preview) {
					this.editorOrder.push('preview');
				}
				if (this.config.blocks.content) {
					this.editorOrder.push('content');
				}
				if (this.config.blocks.scoring) {
					this.editorOrder.push('scoring');
				}
				break;
		}

		/* count blocks */
		for (let i in this.config.blocks) {
			if (this.config.blocks[i] === true) {
				this.blockCount++;
			}
		}

		if (this.blockCount > 0) {
			let html = '';
			html += "<div id='interactionEditorBox'>";
			html += "<div id='interactionEditorTopButtons'></div>";
			for (let ed of this.editorOrder) {
				html += this.createEditorHeader(ed);
				html += `<div id='${ed}Editor' class='interactionEditor'></div>`;
			}
			html += "<div class='interactionEditorSpace'></div>";
			html += "</div>";
			parent.html(html);
		}

		/* create switches */
		if (this.blockCount > 1) {
			let html = '';
			for (let ed of this.editorOrder) {
				html += `<div id='${ed}EditorTopButton' class='editorTopButton' data-href="#${ed}EditorAnchor">${UILANG.m(ed)}</div>`;
			}
			$('#interactionEditorTopButtons').html(html).show();
		} else {
			$('#editorTopButtons').hide();
			$('#blockEditor > #interactionEditorBox').addClass('spanningEditor');
		}

		this.createContentEditor();

		this.switchLanguage(selectedLanguage);
		this.popupEditor = jsPopupEditor.getInstance();
		this.controller.registerView((data) => {
			this.updateContent(data)
		});

		this.preview();

		this.jsph = jsPointerHandler.instance;
		this.jsph.listen($('.interactionEditorSwitch'), {
			callbacks: {
				click: (e) => this.interactionEditorToggle(e)
			}
		});
		this.jsph.listen($('.editorTopButton'), {
			callbacks: {
				click: (e) => this.interactionEditorScrollTo(e)
			}
		});
	}

	interactionEditorToggle(e) {
		let target = $(e.delegateTarget);
		target.toggleClass('collapsed');
	}

	interactionEditorScrollTo(e) {
		let target = $(e.delegateTarget).data('href');
		let top = $(target).get(0).offsetTop - 50;
		$('#interactionEditorBox').animate({scrollTop: top},1000, 'easeOutQuint' );
	}

	createInterfaceElements(ui, section) {
		const panel = this.sidePanel;
		this.guiFactory = new guiFactory();
		this.translateUI(ui);
		for (let data of ui) {
			this.createNextElement(data, {panel: panel, section: section});
		}
	}

	translateUI(ui) {
		//translate values
		//all keys that end on "label", "title" & "message" will be UILANGed
		for (let k in ui) {
			if (/(.*[lL]abel|.*[tT]itle|.*[mM]essage)/.test(k) && typeof ui[k] === "string") {
				ui[k] = UILANG.e(ui[k]);
			} else if (typeof ui[k] === "object" && ui[k] !== null) {
				this.translateUI(ui[k]);
			}
		}
	}

	createNextElement(data, parent) {
		let settings = deepCopy(data.settings) ?? {};

		//copy parent information to settings construct
		if (parent.panel && parent.section) {
			settings.panel = parent.panel;
			settings.section = parent.section;
		} else if (parent.div) {
			settings.div = parent.div;
		}

		//assign controller
		settings.controller = this.controller;

		let element = this.guiFactory.createElement(data.type, settings);
		if (!element) {
			console.error('error creating user interface element:');
			console.log(data);
			return;
		}
		if (data.id && element) {
			if (this.gui[data.id]) {
				console.warn(`createInterfaceElements overwrites id='${data.id}'`);
			}
			this.gui[data.id] = element;
		}

		//recursively create children
		if (Array.isArray(data.children)) {
			for (let child of data.children) {
				this.createNextElement(child, {div: element});
			}
		}
	}

	editField(...path) {
		this.popupEditor.setController(this.controller);
		this.popupEditor.setPath(path);
		this.popupEditor.setLanguage(selectedLanguage);
		this.popupEditor.show((data, ...newPath) => this.setContent(data, ...newPath));
	}

	setContent(data, ...path) {
		this.controller.setData(data, ...path);
		MathJax.typeset();
	}

	destroy() {
		for (let k in this.gui) {
			let element = this.gui[k];
			if (typeof (element?.destroy) === 'function') {
				element.destroy();
			}
		}
		this.sidePanel.removeSection('editor');
		this.sidePanel.removeSection('script');
		this.sidePanel.removeSection('scoring');
	}

	createContentEditor() {
		if (this.config.sections.content) {
			this.sidePanel.addSection("editor", UILANG.m("content"), {"background-color": "var(--color-content)", "color": "white"});
			this.contentEditor = $("#contentEditor");
		}
		if (this.config.sections.scoring) {
			this.sidePanel.addSection("scoring", UILANG.m("scoring"), {"background-color": "var(--color-scoring)", "color": "white"});
			this.scoringEditor = $("#scoringEditor");
		}
		if (this.config.sections.script) {
			this.sidePanel.addSection("script", UILANG.m("scripting"), {"background-color": "var(--color-scripting)", "color": "white"});
			this.sidePanel.deactivateSection("script");
		}

		//create interface elements
		for (let section in window.interactionConfigs[this.constructor.name]) {
			this.createInterfaceElements(window.interactionConfigs[this.constructor.name][section], section);
		}

		this.attachScoreSanitizers();
	}

	setValidators() {
		/*
			setValidators method must be overridden in child class if consistency rules are required

			example of usage:

			this.controller.addConsistencyRule({
				type: 'unique',
				path: ['labels'],
				subPath: ['value']
			});

			In this case the array at path ['labels'] is iterated and for each entry, the property 'value' will be
			checked for uniqueness.
			Currently supported types are 'unique' and 'notEmpty', more to be added as needed.
		 */
	}

	addSanityChecks() {
		/*
			This adds some basic sanity checks that are recommended for all interaction types so that they do not need
			to be repeated in each interaction class config.
		 */

		//interaction id cannot start with _
		if (window.interactionConfigs[this.constructor.name]['editor']) {
			let entry = fetchObjectFromArray(window.interactionConfigs[this.constructor.name]['editor'], {id: 'id'}, true);
			if (entry) {
				entry.settings.pattern = "^[^_].*";
				entry.settings.validationMessage = "an interaction id cannot start with an underscore";
			}
		}
		//global variable for export cannot start with $ or _
		if (window.interactionConfigs[this.constructor.name]['script']) {
			let entry = fetchObjectFromArray(window.interactionConfigs[this.constructor.name]['script'], {id: 'export'}, true);
			if (entry) {
				entry.settings.pattern = "^[^$_].*";
				entry.settings.validationMessage = "a variable name cannot start with a dollar sign or an underscore";
			}
		}
	}

	attachScoreSanitizers() {
		if (!this.gui.scoreInitial || !this.gui.scoreCorrect || !this.gui.scoreMissing || !this.gui.scoreWrong) {
			//no score fields found
			return;
		}

		//sanitize score input fields
		this.gui.scoreSanitizer = new Sanitizer({
			controller: this.controller,
			dataPaths: [['score', 'initial'], ['score', 'correct'], ['score', 'missing'], ['score', 'wrong']],
			elements: [this.gui.scoreInitial, this.gui.scoreCorrect, this.gui.scoreMissing, this.gui.scoreWrong],
			callback: (initial, correct, missing, wrong) => {
				let results = {initial: true, correct: true, missing: true, wrong: true};
				if (correct < missing) {
					results.correct = false;
					results.missing = false;
				}
				if (correct < wrong) {
					results.correct = false;
					results.wrong = false;
				}
				if (missing < wrong) {
					results.missing = false;
					results.wrong = false;
				}
				if (correct < 0) {
					results.correct = false;
				}
				if (initial < 0) {
					results.initial = false;
				}
				return [results.initial, results.correct, results.missing, results.wrong];
			}
		});
		this.gui.scoreInitial.attachSanitizer(this.gui.scoreSanitizer);
		this.gui.scoreCorrect.attachSanitizer(this.gui.scoreSanitizer);
		this.gui.scoreMissing.attachSanitizer(this.gui.scoreSanitizer);
		this.gui.scoreWrong.attachSanitizer(this.gui.scoreSanitizer);
	}

	switchLanguage(selectedLanguage) {
		/*
			switchLanguage method must be overridden in inherited class
			not required if all interaction data is language agnostic
		 */
	}

	updateContent(data) {
		/*
			updateContent method must be overridden in inherited class
			not required if all views get their data directly from the MVC
		 */
	}

	registerTrigger(conf) {
		if (typeof(conf.callback) !== 'function' || !Array.isArray(conf.paths) || conf.paths.length === 0) {
			console.error("Error in registering trigger: missing or incorrect input data");
			return;
		}
		for (let path of conf.paths) {
			this.controller.registerView((data) => conf.callback.call(this, data), ...path);
		}
	}

	static initData(data) {
		if (data === null) data = {};
		for (let row of this.defaultValues) {
			if (row.localized === true) {
				initLanguageKeys(data, row.value, ...row.path);
			} else {
				initPath(data, row.value, ...row.path);
			}
		}
		return data;
	}

	static moveLanguageData(data, oldLang, newLang, keys) {
		for (let k of keys) {
			if (typeof (k) === 'string') {
				switchKeys(data[k], newLang, oldLang);
			} else {
				let a = fetchFromObjPath(data, deepCopy(k.path));
				for (let subData of a) {
					if (typeof k.subpath === 'undefined') {
						switchKeys(subData, newLang, oldLang);
					} else {
						let o = fetchFromObjPath(subData, deepCopy(k.subpath));
						switchKeys(o, newLang, oldLang);
					}
				}
			}
		}
	}

	static registerInteractionClass() {
		window.interactionClasses[this.name] = this;
	}

	static getUndoIgnorePaths() {
		return [];
	}

}