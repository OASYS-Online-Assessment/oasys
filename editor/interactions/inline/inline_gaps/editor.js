class inline_gapsEditor extends InteractionEditor {

	static name = 'inline_gaps';
	static defaultValues = [
		/*DEFAULTVALUES*/
	];
	static fieldPattern = new RegExp(/\[{2}[1-9]\d?#([^<>\[\]]+?)\]{2}/gu);

	static {
		super.registerInteractionClass();
	}

	constructor(id) {
		super(id);
		this.gui = {};
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
			buttonStripLabel: UILANG.m('Select some text and click on the button to convert the selection to a gap.'),
			controller: this.controller,
			paths: {source: ['source'], fields: ['fields']},
			interactionEditor: this
		});

		this.gui.answers = new editorList({
			parent: this.contentEditor,
			label: UILANG.m('answer options'),
			buttonLabel: UILANG.m('add distractor'),
			disableImportButton: true,
			callback: (...path) => this.editField(...path),
			controller: this.controller,
			path: ['answers'],
			fieldPath: ['fields'],
			plainText: true,
			displayLinks: true,
			linksApi: (action, data) => this.gui.inlineEditor.api(action, data)
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

		this.gui.preview = new editorPreview({
			parent: $('#previewEditor'),
			updateCallback: () => this.preview()
		});

	}

	switchLanguage(lang) {
		this.gui.question.contents = this.controller.getData('question', lang);
		this.gui.inlineEditor.switchLanguage(lang);
		this.gui.answers.renderItems(true);
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
		delete (data.source?.[lang]);
		delete (data.fields?.[lang]);
		for (let i in data.answers) {
			delete (data.answers[i].label?.[lang]);
		}
	}


	static addLanguageData(data, lang) {
		initPath(data, "", 'question', lang);
		initPath(data, "", 'source', lang);
		for (let i in data.answers) {
			initPath(data, "", 'answers', i, 'label', lang);
		}
	}

	static getTitle(data, lang) {
		return data?.question?.[lang];
	}

	static generatePreview(data, lang, options = {}) {
		//check if interaction has been initialized at all; return an empty string if not
		if (!data.question || !data.source || typeof (lang) === 'undefined') {
			return "";
		}

		let labels = data.answers.map(a => a.label[lang]);
		if (data.order === 'random') {
			//if order is random, shuffle the labels
			shuffleArray(labels);
		} else if (data.order === 'alphabet') {
			//if order is alphabet, sort the labels in a case-insensitive way
			labels.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		}
		let draggables = '';

		//create draggables and measure the maximum width needed
		let maxWidth = 0;
		for (const label of labels) {
			const div = document.createElement('div');
			div.style.display = 'inline-block';
			div.style.fontSize = '16px';
			div.innerText = label;
			document.body.appendChild(div); // temporarily add it
			const width = div.offsetWidth + 20; // Measure the width
			document.body.removeChild(div); // Remove it from DOM immediately
			maxWidth = Math.max(maxWidth, width);
			draggables += `<span class='previewTag_inlineDraggable' style="width: 1px">${label ?? '&nbsp;'}</span>`;
		}

		// replace 1px width by maxWidth in draggables
		draggables = draggables.replace(/width: 1px/g, `width: ${maxWidth}px`);

		let source = data.source[lang];
		source = source.replace(this.fieldPattern, `<span class='previewTag_inlineGap' style="width: ${maxWidth}px"></span>`);
		return `${data.question[lang]}<p class="inlineInteractionText">${source}</p><p class='previewTag_inlineDraggableStock' data-width="${maxWidth}">${draggables}</p>`;
	}

	static moveLanguageData(data, oldLang, newLang) {
		let keys = ['question', 'source', 'fields'];
		super.moveLanguageData(data, oldLang, newLang, keys);
		for (let i in data.answers) {
			super.moveLanguageData(data.answers[i], oldLang, newLang, ['label']);
		}
	}

}
