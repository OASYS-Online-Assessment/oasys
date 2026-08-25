/**
 * @var tinyMCE
 */

class guiFactory {

	constructor() {
	}

	/* returns a new instance of the selected editor element */
	createElement(type, settings) {
		switch (type) {
			case 'editorInfobox':
				return new editorInfobox(settings);
			case 'editorLabel':
				return new editorLabel(settings);
			case 'editorTextField':
				return new editorTextField(settings);
			case 'editorList':
				return new editorList(settings);
			case 'editorCheckList':
				return new editorCheckList(settings);
			case 'editorCheckListGrid':
				return new editorCheckListGrid(settings);
			case 'editorDropDown':
				return new editorDropDown(settings);
			case 'editorButton':
				return new editorButton(settings);
			case 'editorInlineEditor':
				return new editorInlineEditor(settings);
			case 'editorMultiList':
				return new editorMultiList(settings);
			case 'editorPreview':
				return new editorPreview(settings);
			case 'propsToggleDiv':
				return new propsToggleDiv(settings);
			case 'propsDiv':
				return new propsDiv(settings);
			case 'propsLabel':
				return new propsLabel(settings);
			case 'propsTextField':
				return new propsTextField(settings);
			case 'propsDropDown':
				return new propsDropDown(settings);
			case 'propsList':
				return new propsList(settings);
			case 'propsSpinnerRow':
				return new propsSpinnerRow(settings);
			case 'propsCheckboxRow':
				return new propsCheckboxRow(settings);
			case 'propsSwitchRow':
				return new propsSwitchRow(settings);
			case 'Sanitizer':
				return new Sanitizer(settings);
			default:
				return null;
		}
	}
}

/* ====================================== */

class editorInfobox {

	static counter = 0;

	constructor(settings) {
		if (!settings.parent) {
			console.error("editorInfobox error: missing parent");
			return;
		}
		editorInfobox.counter++;
		this.id = `editorInfobox_${editorInfobox.counter}`;
		this.controller = settings.controller ?? null;
		this.paths = settings.paths ?? null;
		this.label = settings.label ?? "";
		this.converter = settings.converter ?? null;
		this.localized = Boolean(settings.localized);
		this.header = settings.header ?? '';

		let html = `<div class="editorProperty"><div class="editorInfoboxWrapper"><div class="editorInfoboxHeader">${this.header}</div><div id="${this.id}" class="editorInfobox"></div></div></div>`;
		settings.parent.append(html);
		this.element = $(`#${this.id}`);
		if (settings.paths && settings.controller) {
			for (let path of this.paths) {
				this.controller.registerView(() => this.update(), ...path)
			}
		}
		this.update();
		if (typeof (settings.dblClick) === 'function') {
			this.jsph = jsPointerHandler.instance;
			this.jsph.listen(this.element, {
				callbacks: {
					dblclick: settings.dblClick
				}
			})
		}
	}

	update() {
		let data = [];
		if (Array.isArray(this.paths)) {
			for (let path of this.paths) {
				if (this.localized === true) {
					data.push(this.controller.getData(...path, selectedLanguage));
				} else {
					data.push(this.controller.getData(...path));
				}
			}
		}
		if (typeof (this.converter) === 'function') {
			let val = this.converter.call(this, ...data);
			this.element.html(sf(this.label, val));
		} else {
			this.element.html(sf(this.label, ...data));
		}
	}

}

/* ====================================== */

class editorLabel {

	static counter = 0;

	constructor(settings) {
		if (!settings.parent) {
			console.error("editorLabel error: missing parent");
			return;
		}
		editorLabel.counter++;
		if (!settings.label) {
			settings.label = "label";
		}
		let html = `<div id="editorLabel_${editorLabel.counter}" class="editorLabel editorSection"><div class="editorSectionHeader">${settings.label}:</div><div class="tinyMCE_toolbar_container" id="editorLabelToolbar_${editorLabel.counter}"></div><div class="editorLabelFrame"><div class="editorLabelText tex2jax_ignore">${settings.text || ''}</div><div class="editorLabelButton"></div></div></div>`;
		settings.parent.append(html);
		this.element = $(`#editorLabel_${editorLabel.counter}`);
		this.textbox = this.element.find(".editorLabelText");
		this.lastKnownData = '';
		let buttonData = {
			iconHeight: 25,
			callback: settings.callback || null,
			icon: svgIcons.editBlock,
			value: 1
		};
		this.editButton = new nxButton($('.editorLabelButton').last(), `editorLabel_${editorLabel.counter}_editButton`, buttonData);

		this.controller = settings.controller;
		this.path = settings.path;
		this.ready = false;
		this.delayedContent = null;

		/* init tinymce in inline mode */
		const tinyConfig_editorLabel = {
			selector: `#editorLabel_${editorLabel.counter} .editorLabelText`,
			menubar: false,
			inline: true,
			forced_root_block: "div",
			plugins: [],
			toolbar: 'bold italic underline | forecolor backcolor',
			paste_as_text: true,
			fixed_toolbar_container: `#editorLabelToolbar_${editorLabel.counter}`,
			setup: (ed) => {
				this.inlineEditor = ed; //save instance of editor as property of editorLabel instance
				ed.on('keyup', () => {
					this.storeChanges();
				});
				ed.on('BeforeAddUndo', (e) => {
					this.storeChanges();
					return false;
				});
				/*	Fix for #OA-1207:
					When simply removing the selection on blur, there seems to be a race condition in Firefox:
					If the onBlur event is triggered by clicking into another editor, the selection may or may not
					have moved already to the new editor. This can lead to the selection being removed from the
					new editor, which results in the caret being placed at the beginning of the text.
				 */
				ed.on('Blur', () => {
					const selection = window.getSelection();
					//check if there's a selection and if its anchor node is within the editor
					if (selection.rangeCount > 0) {
						const range = selection.getRangeAt(0);
						const editorBody = ed.getBody();
						//if the anchor node is within the editor, remove the selection, as this editor is losing focus
						if (editorBody.contains(range.startContainer)) {
							window.getSelection().removeAllRanges();
						}
					}
				});
				ed.on('init', () => {
					this.ready = true;
					if (this.delayedContent) {
						this.inlineEditor.setContent(this.delayedContent);
						this.delayedContent = null;
					}
				});
				/*	Fix for #OA-1207:
					Firefox does not set the cursor at the end of an inline editor by default.
					Sometimes the cursor is in the beginning, or the whole text is selected on focus.
					This quick and dirty fix waits for 5 ms on focus and changes the caret position to
					be at the end of the text. A flash of a wrongly position caret will however be
					visible, but this is a good as it gets. */
				ed.on('focus', () => {
					setTimeout(function () {
						// Move cursor to the end of the content
						// ed.selection.select(ed.getBody(), true);
						// ed.selection.collapse(false);
					}, 5); // Adjust timeout if needed;
				});
			}
		};

		window.tinymce.init(tinyConfig_editorLabel);


		/*	disabled the double click to open the popup editor, as dbl click is now used to select a word in inline editor
			if we decide to keep the inline editor, this can be deleted for good. */
		/*
			this.jsph = jsPointerHandler.instance;
			this.jsph.listen(this.textbox, {
				callbacks: {
					dblclick: settings.callback || null
				}
			})
		*/
	}

	set contents(html) {
		if (this.ready === false) {
			this.delayedContent = html;
			return;
		}
		/*	first check if the html originates from the inline editor, because each time the content is changed by
			this function, the cursor is moved to the end. So we want to prevent this from happening when
			the inline editor is being used, since the content does not require any updates in this case. */
		if (html !== this.lastKnownData) {
			this.inlineEditor.setContent(html);
			this.lastKnownData = html;

			// set cursor to the end of the text field
			this.inlineEditor.focus();
			let range = document.createRange();
			let selection = window.getSelection();
			range.selectNodeContents(this.inlineEditor.getBody());
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	storeChanges() {
		let data = this.inlineEditor.getContent();
		this.lastKnownData = data;
		this.controller.setData(data, ...this.path, selectedLanguage);
	}

	destroy() {
		this.editButton.destroy();
		this.inlineEditor.destroy();
	}
}

/* ====================================== */

class editorInlineEditor {

	static counter = 0;

	constructor(settings) {
		this.debug = 0;
		if (!settings.parent) {
			console.error("editorInlineText error: missing parent");
			return;
		}
		this.interactionEditor = settings.interactionEditor;
		editorLabel.counter++;
		this.id = editorInlineEditor.counter;
		let html = `<div id="editorInlineEditor_${this.id}" class="editorInlineEditor editorSection"></div>`;
		settings.parent.append(html);
		this.element = $(`#editorInlineEditor_${this.id}`);
		this.buttonStripLabel = settings.buttonStripLabel ?? UILANG.m('Select a word and click on the button to convert the selection to a field.');
		let splitter = new columnSplitter({
			parent: this.element,
			class: 'editorInlineFrame',
			columns: [
				{
					width: {
						min: '250px'
					},
					contents: `<div class="editorSectionHeader">${settings.textBoxLabel}:</div>
								<div contentEditable="true" class="editorInlineTextBox tex2jax_ignore"></div>
								<div class="editorInlineEditorButtons"></div>`
				}, {
					width: {
						min: '200px',
						default: '25%'
					},
					contents: `<div class="editorSectionHeader">${settings.fieldsBoxLabel}:</div>
								<div class="editorInlineFields"></div>
								<ul class="editorInlineEditorMessage"></ul>`
				}
			]
		});

		this.textbox = this.element.find(".editorInlineTextBox");
		this.fields = this.element.find(".editorInlineFields");
		this.buttonStrip = this.element.find(".editorInlineEditorButtons");
		this.messageBox = this.element.find(".editorInlineEditorMessage");

		this.controller = settings.controller;
		this.paths = settings.paths;
		this.removeButtons = {};
		this.addButtons = {};

		//fieldPattern: matches field tokens like [[1#text]]
		this.fieldPattern = new RegExp(/\[{2}[1-9]\d?#[^<>\[\]]*?\]{2}/gu);
		//wrapperPattern: matches field tokens but captures everything within the outer brackets
		this.wrapperPattern = new RegExp(/\[(\[[1-9]\d?#[^<>\[\]]*?\])\]/gu);
		//fieldExtractorPattern: matches field tokens and captures the field number and field name separately and it only matches the first field token
		this.fieldExtractorPattern = new RegExp(/\[{2}([1-9]\d?)#([^<>\[\]]*?)\]{2}/u);
		//fieldHidePattern: matches field tokens and captures the field number and field name separately but does so for all occurrences
		this.fieldHidePattern = new RegExp(/\[{2}([1-9]\d?)#([^<>\[\]]*?)\]{2}/gu);
		this.textbox.on('input', () => this.sourceChange());
		this.textbox.on('blur', () => this.onBlur());
		this.controller.registerView((data) => this.updateSource(data), ...this.paths.source);
		this.controller.registerView((data) => this.setFields(data), ...this.paths.fields);
		this.setFields(this.controller.getData(...this.paths.fields));
		this.range = null;
		this.rangeBeforeBlur = null;
		this.clearAddButtons();

		$(document).on('selectionchange', (e) => this.handleSelectionChange(e));

		this.allowedTags = ['DIV', 'P', 'BR'];
		this.textbox.on('paste', (e) => {
			e.preventDefault();
			const clipboardData = e.originalEvent.clipboardData || window.clipboardData;
			const html = clipboardData.getData('text/html') || clipboardData.getData('text/plain');

			// Sanitize the pasted HTML
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');
			const body = doc.body;
			const cleanFragment = document.createDocumentFragment();
			Array.from(body.childNodes).forEach(node => {
				cleanFragment.appendChild(this.sanitizeNode(node));
			});


			// Insert the clean fragment at the caret position
			const selection = window.getSelection();
			if (!selection.rangeCount) return;

			const range = selection.getRangeAt(0);
			range.deleteContents();
			range.insertNode(cleanFragment);

			// Move the caret to the end
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);

			//trigger input event to update source
			this.sourceChange();
		});
	}

	switchLanguage() {
		this.db(1, "switchLanguage");
		this.clearAddButtons();
		this.range = null;
		this.updateSource(this.controller.getData(...this.paths.source));
	}

	sourceChange() {
		this.db(1, "editorSourceChange");
		this.source[selectedLanguage] = this.removeHTMLTags(this.textbox.html());
		this.markKeywords();
		this.storeSource();
		this.handleSelectionChange(); //added this line to fix #OA-1250
	}

	removeHTMLTags(input, allowExceptions = true) {
		//remove all span tags with class inlineField
		let output = input.replace(/<span class=(["'])inlineFieldKeyword\1>(.*?)<\/span>/gi, "$2");
		if (allowExceptions) {
			//remove all other tags except for the allowed ones
			output = output.replace(/<(?!(\/?span|\/?div|\/?p|\/?br|\/?b|\/?i|\/?u|\/?strong|\/?emph)).*?>/gi, "");
		} else {
			//remove all tags without exceptions
			output = output.replace(/<.*?>/gi, "");
		}
		return output;
	}

	parseSource() {
		this.db(1, "parseSource");
		this.clearMessages();
		this.fieldList = {};
		for (let lang in this.source) {
			let src = this.source[lang];
			let matches = src.matchAll(this.fieldPattern);
			let fieldList = {};
			for (let match of matches) {
				let indexStart = match.index;
				let indexEnd = match.index + match[0].length;
				let prefix = src.substring(0, indexStart);
				let suffix = src.substring(indexEnd);

				//remove all field tokens from prefix and suffix
				prefix = prefix.replace(this.fieldHidePattern, '$2');
				suffix = suffix.replace(this.fieldHidePattern, '$2');

				//shorten prefix and suffix to maximum 30 letters and add ellipsis
				if (prefix.length > 30) {
					prefix = '…' + prefix.substring(prefix.length - 30);
				}
				if (suffix.length > 30) {
					suffix = suffix.substring(0, 30) + '…';
				}

				//remove any HTML tags from prefix and suffix
				prefix = this.removeHTMLTags(prefix, false);
				suffix = this.removeHTMLTags(suffix, false);

				//remove partial words from prefix and suffix
				prefix = prefix.replace(/^…\S*/, '…');
				suffix = suffix.replace(/\S*…$/, '…');

				let extracted = match[0].match(this.fieldExtractorPattern);
				if (extracted) {
					let fieldNumber = parseInt(extracted[1]);
					let fieldName = extracted[2];
					if (fieldList[fieldNumber]) {
						//error: field number already exists
						this.addMessage(UILANG.m('Field number ${fieldNumber} already exists in language ${lang}', {
							fieldNumber: fieldNumber,
							lang: lang
						}));
					}
					fieldList[fieldNumber] = {number: fieldNumber, name: fieldName, prefix: prefix, suffix: suffix};
				}
			}
			this.fieldList[lang] = fieldList;
		}
		this.controller.setData(this.fieldList, ...this.paths.fields);
		this.markKeywords();
	}

	markKeywords() {
		this.dbGroup(1,"editorMarkKeywords");
		const cursorPosition = this.getCursorPosition();
		let source = this.textbox.html();
		let cleanedSource = this.removeHTMLTags(source);
		let html = cleanedSource.replace(this.wrapperPattern, `[<span class="inlineFieldKeyword">$1</span>]`);
		if (source !== html) {
			this.textbox.html(html);
			if (cursorPosition !== false) {
				this.setCursorPosition(cursorPosition);
			}
		}
		this.dbGroupEnd(1);
	}

	textBoxHasFocus() {
		return this.textbox.is(":focus");
	}

	storeSource() {
		this.db(1, "storeSource");
		this.controller.setData(this.source, ...this.paths.source);
	}

	updateSource(source) {
		this.db(1, "updateSource");
		this.source = source;
		if (this.removeHTMLTags(this.textbox.html()) !== this.source[selectedLanguage]) {
			this.textbox.html(this.source[selectedLanguage]);
		}
		this.parseSource();
	}

	setFields(fields) {
		this.db(1, "setFields");

		//destroy all buttons first
		for (let i in this.removeButtons) {
			this.removeButtons[i].destroy();
			delete this.removeButtons[i];
		}
		this.fields.html('');

		let tempFields = {};
		for (let lang in fields) {
			for (let i in fields[lang]) {
				if (!tempFields[i]) {
					tempFields[i] = {
						number: i,
						names: this.interactionEditor.getEmptyLanguageObject()
					};
				}
				tempFields[i].names[lang] = fields[lang][i].name;
			}
		}
		for (let i in tempFields) {
			for (let lang in tempFields[i].names) {
				if (!tempFields[i].names[lang]) {
					tempFields[i].names[lang] = `<span class='red'>_${lang}_</span>`;
				}
				//concatenate all names with commas inbetween and set as name property
				tempFields[i].name = Object.values(tempFields[i].names).join(', ');
			}
			this.appendField(tempFields[i]);
		}
	}

	appendField(field) {
		this.db(1, "appendField");
		let html = `	<div class="editorInlineField" data-id="${field.number}">
								<div class="editorInlineFieldNumber"><div class="numberToken">${field.number}</div></div>
								<div class="editorInlineFieldName">${field.name}</div>
								<div class="editorInlineFieldButton"></div>
							</div>`;
		this.fields.append(html);
		let buttonData = {
			iconHeight: 24,
			callback: (n) => {
				this.deleteField(n)
			},
			icon: svgIcons.removeBlock,
			value: field
		};
		this.removeButtons[field.number] = new nxButton(this.fields.find(`.editorInlineField[data-id=${field.number}] > .editorInlineFieldButton`), `delete-textBox_${this.id}-${field.number}`, buttonData);
	}

	deleteField(field) {
		this.db(1, "deleteField");
		for (let lang in this.fieldList) {
			let tempField = this.fieldList[lang][field.number];
			if (typeof (tempField) === 'undefined') {
				//field does not exist in this language, so skip
				continue;
			}
			let pattern = new RegExp(`\\[{2}${field.number}#.*?]{2}`, 'g');
			this.source[lang] = this.source[lang].replace(pattern, tempField.name);
		}
		this.storeSource();
		this.textbox.blur();
	}

	onBlur() {
		/* *** Special requirements for Safari ***
		* When something has been selected in the editor and the user clicks the button to define a field,
		* Safari removes the selection from the editor before the callback of the button can be executed.
		* As a remedy, we are saving the range as it was before the editor lost focus, but we only keep
		* this cache for half a second, before it's automatically cleared.
		* If the cached range was kept indefinitely, this could possibly cause other problems later. So we
		* make sure it's available only if the button is clicked immediately after. */
		this.db(1, "blur");
		this.rangeBeforeBlur = this.range?.cloneRange() ?? null;
		setTimeout(() => {
			this.rangeBeforeBlur = null
		}, 1000);
		setTimeout(() => this.clearAddButtons(), 200);
	}

	handleSelectionChange() {
		this.db(1, "handleSelectionChange");
		let selection = window.getSelection();
		if (selection.rangeCount > 0) {
			this.range = selection.getRangeAt(0);
			let commonAncestor = this.range.commonAncestorContainer;

			// Check if the common ancestor is within the contenteditable div
			if (this.textbox.get(0).contains(commonAncestor)) {
				if (!this.range.collapsed) {

					/*	if last node of selection is a <br> tag, remove it (necessary for Firefox)
						=> this should fix #OA-1213 */
					let endContainer = this.range.endContainer;
					let endOffset = this.range.endOffset;
					if (endContainer.nodeType === Node.ELEMENT_NODE) {
						// If the endContainer is an element, check if it's a <br> tag
						let childNode = endContainer.childNodes[endOffset - 1];
						if (childNode && childNode.nodeName === 'BR') {
							// Adjust the range to end just before the <br> tag
							this.range.setEndBefore(childNode);
						}
					}

					let selectionIsUsable = true;
					//check if selection starts within a field token
					if ((this.range.startContainer.nodeType === Node.ELEMENT_NODE
						? this.range.startContainer
						: this.range.startContainer.parentNode).closest('.inlineFieldKeyword')) {
						selectionIsUsable = false;
					}
					//check if selection ends within a field token
					if ((this.range.endContainer.nodeType === Node.ELEMENT_NODE
						? this.range.endContainer
						: this.range.endContainer.parentNode).closest('.inlineFieldKeyword')) {
						selectionIsUsable = false;
					}
					//check if selection contains a field token
					const fragment = this.range.cloneContents();
					if (fragment.querySelector('.inlineFieldKeyword')) {
						selectionIsUsable = false;
					}
					//check if selection contains an element node
					if (Array.from(fragment.childNodes).some(node => node.nodeType === Node.ELEMENT_NODE)) {
						selectionIsUsable = false;
					}
					//check if selection does not contain any letters or numbers, respecting UTF-8 characters
					if (!this.range.toString().match(/[\p{L}\p{N}]/u)) {
						selectionIsUsable = false;
					}
					//check if selection starts or ends with a square bracket or if it contains 2 consecutive square brackets
					if (this.range.toString().match(/[\[\]]{2}/) || this.range.toString().match(/^[\[\]]/) || this.range.toString().match(/[\[\]]$/)) {
						selectionIsUsable = false;
					}

					// if the selection is not suited for a field definition, return
					if (selectionIsUsable === false) {
						this.clearAddButtons();
						return;
					}
					let selectedText = this.range.toString();
					this.showAddButtons();
				} else {
					this.range = null;
					this.clearAddButtons();
				}
			}
		}
	}

	showAddButtons() {
		this.db(1, "showAddButtons");
		this.clearAddButtons();
		let keys = this.findAvailableKeys();
		if (keys.length > 0) {
			this.buttonStrip.html(""); //remove default message
		}
		for (let i of keys) {
			let buttonData = {
				callback: (n) => {
					this.defineField(n)
				},
				label: UILANG.m("define field #${num}", {num: i}),
				value: i
			};
			this.addButtons[i] = new nxButton(this.buttonStrip, `add-textBox_${this.id}-${i}`, buttonData);
		}
	}

	clearAddButtons() {
		this.db(1, "clearButtons");
		for (let i in this.addButtons) {
			this.addButtons[i].destroy();
		}
		this.addButtons = {};
		this.buttonStrip.html(this.buttonStripLabel);
	}


	defineField(n) {
		this.db(1, `defineField(${n})`);

		/* *** Special requirements for Safari ***
		* Check if a range was saved before the editor lost focus. If so, reestablish this range in the DOM.
		*/

		if (this.rangeBeforeBlur) {
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(this.rangeBeforeBlur);
			this.range = this.rangeBeforeBlur.cloneRange();
		}

		//replace selected text with field token: [[n#text]]
		let text = this.range.toString();
		//check if text begins or ends with spaces and count spaces respectively
		let startSpaces = text.match(/^(\s*)/)[0];
		let endSpaces = text.match(/(\s*)$/)[0];
		text = text.trim();
		//create replacement token, and move spaces outside of token
		let fieldToken = `${startSpaces}[[${n}#${text}]]${endSpaces}`;
		let selection = window.getSelection();
		this.range.deleteContents();
		let node = document.createTextNode(fieldToken);
		this.range.insertNode(node);
		selection.removeAllRanges();
		selection.addRange(this.range);
		this.sourceChange();
	}

	updateField(data) {
		this.db(1, "updateField(data)", data);
		let searchValue = `[[${data.number}#${data.oldLabel}]]`;
		let replaceValue = `[[${data.number}#${data.newLabel}]]`;
		this.source[selectedLanguage] = this.source[selectedLanguage].replace(searchValue, replaceValue);
		this.updateSource(this.source);
		this.storeSource();
	}

	findAvailableKeys() {
		this.db(1, "findAvailableKeys");
		const keys = Object.keys(this.fieldList[selectedLanguage]).map(Number);
		const maxKey = this.findMaxKey();
		const availableKeys = [];
		for (let i = 1; i <= maxKey + 1; i++) {
			if (!keys.includes(i) && i < 100) {
				availableKeys.push(i);
			}
		}
		return availableKeys;
	}

	findMaxKey() {
		this.db(1, "findMaxKey");
		let maxKeys = [];
		for (let lang in this.fieldList) {
			let keys = Object.keys(this.fieldList[lang]).map(Number);
			maxKeys.push(Math.max(...keys));
		}
		let max = Math.max(...maxKeys);
		if (max < 0 || isNaN(max)) {
			return 0;
		} else {
			return max;
		}
	}

	findUnusedKeys() {
		this.db(1, "findUnusedKeys");
		let unusedKeys = [];
		let maxKey = this.findMaxKey();
		for (let i = 1; i <= maxKey; i++) {
			if (this.keyExistsInAnyLanguage(i) === false) {
				unusedKeys.push(i);
			}
		}
		return unusedKeys;
	}

	keyExistsInAnyLanguage(key) {
		this.db(1, `keyExistsInAnyLanguage(${key})`);
		for (let lang in this.fieldList) {
			if (this.fieldList[lang][key]) {
				return true;
			}
		}
		return false;
	}

	getCursorPosition() {
		this.db(1, "getCursorPosition");
		if (!this.textBoxHasFocus()) {
			return false;
		}
		const selection = window.getSelection();
		if (selection.rangeCount === 0) {
			return null;
		}
		const range = selection.getRangeAt(0);
		const preCaretRange = range.cloneRange();
		preCaretRange.selectNodeContents(this.textbox.get(0));
		preCaretRange.setEnd(range.endContainer, range.endOffset);
		if (this.debug) console.log(`%ccursorPosition === ${preCaretRange.toString().length}`, 'color: orange');
		return preCaretRange.toString().length;
	}

	setCursorPosition(position) {
		if (position === null) {
			return;
		}

		this.dbGroup(1,`editorSetCursorPosition(${position})`);
		const range = document.createRange();
		range.setStart(this.textbox.get(0), 0);
		range.setEnd(this.textbox.get(0), 0);
		range.collapse(true);
		const selection = window.getSelection();
		let data = {charCount: 0}; //wrapped in object to be able to transfer by reference
		this.setRange(this.textbox.get(0), data, range, position);
		selection.removeAllRanges();
		selection.addRange(range);
		this.dbGroupEnd(1);
	}

	setCursorAtEnd() {
		let range = document.createRange();
		let selection = window.getSelection();
		range.selectNodeContents(this.textbox.get(0));
		range.collapse(false);  // Collapse the range at the end of the content
		selection.removeAllRanges();
		selection.addRange(range);
	}


	setRange(node, data, range, position) {
		this.db(1, `setRange(${node}, ${position})`);
		if (node.nodeType === 3) {
			const nextCharCount = data.charCount + node.length;
			if (data.charCount <= position && position <= nextCharCount) {
				range.setStart(node, position - data.charCount);
				range.setEnd(node, position - data.charCount);
				return true;
			}
			data.charCount = nextCharCount;
		} else {
			for (let i = 0; i < node.childNodes.length; i++) {
				if (this.setRange(node.childNodes[i], data, range, position)) {
					return true;
				}
			}
		}
		return false;
	}

	addMessage(message) {
		this.db(1, `addMessage(${message})`);
		this.messageBox.append(`<li>${message}</li>`);
	}

	clearMessages() {
		this.db(1, `clearMessages()`);
		this.messageBox.html('');
	}

	api(action, data) {
		switch (action) {
			case 'deleteField':
				this.deleteField(data);
				break;
			case 'updateField':
				this.updateField(data);
				break;
			default:
				console.error(`editorInlineEditor: unknown action ${action}`);
		}
	}

	db(level,...args) {
		if (this.debug >= level) {
			console.trace(`%cInlineEditor ${this.id}:`, "color: red; font-weight: bold;", ...args);
		}
	}

	dbGroup(level,...args) {
		if (this.debug >= level) {
			console.groupCollapsed(`%cInlineEditor ${this.id}:`, "color: red; font-weight: bold;", ...args);
		}
	}

	dbGroupEnd(level) {
		if (this.debug >= level) {
			console.groupEnd();
		}
	}

	//separate HTML cleaning method for text being pasted into the editor
	sanitizeNode(node) {
		// Remove disallowed elements
		if (node.nodeName !== '#text' && !this.allowedTags.includes(node.nodeName)) {
			// Replace the disallowed node with its children
			const fragment = document.createDocumentFragment();
			while (node.firstChild) {
				const child = node.removeChild(node.firstChild);
				fragment.appendChild(this.sanitizeNode(child));
			}
			return fragment;
		}

		// Remove any style attributes or classes
		node.removeAttribute?.('style');
		node.removeAttribute?.('class');

		// Sanitize children recursively
		const children = Array.from(node.childNodes);
		children.forEach(child => {
			const clean = this.sanitizeNode(child);
			if (clean !== child) {
				node.replaceChild(clean, child);
			}
		});

		return node;
	}

}

/* ====================================== */

class editorTextField {

	static counter = 0;

	constructor(settings) {
		editorTextField.counter++;
		if (!settings.parent || !settings.label || !settings.controller || !settings.path) {
			console.error("editorTextField error: missing one or more mandatory settings");
			return;
		}
		this.parent = settings.parent;
		this.validationMessage = settings.validationMessage || '';
		this.alignment = settings.alignment || 'left';
		this.id = `editorTF_${editorTextField.counter}`;
		let html = `<div  id="${this.id}_wrapper" class="editorProperty editorBlockAlign_${this.alignment}"><div>${settings.label}:<input type="text" class="editorTF" id="${this.id}"></div>
					<div class="editorTF_message">${this.validationMessage}</div></div>`;
		this.parent.append(html);
		this.controller = settings.controller;
		this.localized = Boolean(settings.localized);
		this.path = settings.path;
		this.pattern = settings.pattern ?? null;
		if (this.pattern === null && settings.cssValidator === true) {
			this.pattern = "^\\s*\\d+(\\.\\d+)?(px|em|rem|%|vw|vh|vmin|vmax|cm|mm|in|pt|pc)?\\s*$";
		}
		this.element = $(`#${this.id}`);
		this.message = $(`#${this.id}_wrapper > .editorTF_message`);
		if (this.pattern) {
			this.element.prop('pattern', this.pattern);
		}
		if (this.localized) {
			this.element.val(this.controller.getData(...this.path, selectedLanguage));
		} else {
			this.element.val(this.controller.getData(...this.path));
		}
		this.validate();
		this.element.on('input', (e) => this.onInput(e));
		this.controller.registerView((data) => this.onUpdate(data), ...this.path)
	}

	onInput() {
		if (this.localized) {
			this.controller.setData(this.element.val(), ...this.path, selectedLanguage);
		} else {
			this.controller.setData(this.element.val(), ...this.path);
		}
		this.validate();
	}

	validate() {
		if (!this.validationMessage || !this.pattern) {
			return;
		}
		if (this.element.is(":invalid")) {
			this.message.css('display', 'inline-block');
		} else {
			this.message.css('display', 'none');
		}
	}

	onUpdate(data) {
		if (this.localized) {
			this.element.val(data[selectedLanguage]);
		} else {
			this.element.val(data);
		}
		this.validate();
	}

	update() {
		this.onUpdate(this.controller.getData(...this.path));
	}

}

/* ====================================== */

class editorButton {

	static counter = 0;

	constructor(settings) {
		if (!settings.parent) {
			console.error("editorButton error: missing parent");
			return;
		}
		editorButton.counter++;
		if (!settings.label) {
			settings.label = "label";
		}
		settings.parent.append(`<div id='editorButtonContainer_${editorButton.counter}' class='editorButtonContainer'></div>`);
		this.parent = $(`#editorButtonContainer_${editorButton.counter}`);
		if (typeof (settings.alignment) !== 'undefined' && /^(left|center|right)$/.test(settings.alignment)) {
			this.parent.addClass('align_' + settings.alignment);
		}
		delete settings.parent;
		delete settings.alignment;
		this.button = new nxButton(this.parent, `editorButton_${editorButton.counter}`, settings);
	}

	destroy() {
		this.button.destroy();
	}
}

/* ====================================== */

class editorList {

	static counter = 0;

	constructor(settings) {
		this.debug = 0;
		if (this.debug > 0) {
			window.widget ??= this;
		}
		if (!settings.parent) {
			console.error("editorList error: missing parent");
			return;
		}
		editorList.counter++;
		if (!settings.label) {
			settings.label = "label";
		}

		/* init tinymce in inline mode */
		this.tinyConfig_inline = {
			menubar: false,
			inline: true,
			forced_root_block: "div",
			plugins: [],
			toolbar: 'bold italic underline | forecolor backcolor',
			paste_as_text: true,
			setup: (ed) => {
				this.inlineEditor = ed; //save instance of editor as property of editorList instance
				ed.on('keydown', (e) => {
					if (e.key === 'Tab') {
						e.preventDefault();
						let parent = $(ed.targetElm).closest('.editorListItem');
						let groupId = parent.data('groupid');
						let itemId = parent.data('itemid');
						let nextItem = $(`#editorList_${groupId} .editorListItem[data-itemid="${++itemId}"]`);
						if (nextItem.length === 0) {
							//if we are at the last item of the group, move to the next group
							while (groupId < editorList.counter && nextItem.length === 0) {
								//if group does not exist, skip and move to next group until we find an item or reach the last group
								nextItem = $(`#editorList_${++groupId} .editorListItem[data-itemid="0"]`);
							}
							//if we are at the last group, move to the first group
							if (groupId === editorList.counter && nextItem.length === 0) {
								groupId = 0;
								//repeat from the beginning and skip any missing groups
								while (groupId < editorList.counter && nextItem.length === 0) {
									nextItem = $(`#editorList_${++groupId} .editorListItem[data-itemid="0"]`);
								}
							}
							//when we arrive here we are bound to have found a new item … in the worst case it is the one we started from
						}
						let nextEditor = nextItem.find('.editorListLabelText');
						nextEditor.trigger('focus');
						tinyMCE.activeEditor.execCommand('SelectAll');
					}
				});
				ed.on('ExecCommand', (e) => {
					if (e.command !== 'mceFocus') {
						this.onLabelUpdate(e, ed.targetElm);
					}
				});
				ed.on('keyup', (e) => {
					this.onLabelUpdate(e, ed.targetElm);
				});
				ed.on('BeforeAddUndo', (e) => {
					return false;
				});
				/*	Fix for #OA-1207:
					When simply removing the selection on blur, there seems to be a race condition in Firefox:
					If the onBlur event is triggered by clicking into another editor, the selection may or may not
					have moved already to the new editor. This can lead to the selection being removed from the
					new editor, which results in the caret being placed at the beginning of the text.
				 */
				ed.on('Blur', () => {
					const selection = window.getSelection();
					//check if there's a selection and if its anchor node is within the editor
					if (selection.rangeCount > 0) {
						const range = selection.getRangeAt(0);
						const editorBody = ed.getBody();
						//if the anchor node is within the editor, remove the selection, as this editor is losing focus
						if (editorBody.contains(range.startContainer)) {
							window.getSelection().removeAllRanges();
						}
					}
				});
			}
		};

		this.settings = settings;
		this.id = editorList.counter;
		this.db(1, "settings", settings);
		let html = `<details id="editorList_${this.id}" class="editorList editorSection" open>
						<summary class="editorSectionHeader">${settings.label}:</summary>
						<div class="editorListToggleFrame">
							<div class="editorListDZ" id="editorList_${this.id}_dz"></div>
							<div class="editorListButtons" id="editorList_${this.id}_buttons"></div>
						</div>
					</details>`;
		settings.parent.append(html);
		this.element = $(`#editorList_${this.id}`);

		this.valuePrefix = settings.valuePrefix ?? 'value';
		this.plainText = settings.plainText ?? false;
		if (settings.displayLinks === true) {
			this.element.addClass('displayLinks');
		}

		this.toggleFrame = this.element.find('.editorListToggleFrame');
		this.dz = $(`#editorList_${this.id}_dz`);
		this.buttons = $(`#editorList_${this.id}_buttons`);
		this.buttonInstances = {delete: [], edit: []};
		this.linksApi = () => {
			console.error("editorList error: missing linksApi");
		};
		if (typeof (settings.linksApi) === 'function') {
			this.linksApi = settings.linksApi;
		}
		this.callback = settings.callback ?? null;
		this.itemLimit = settings.itemLimit ?? 500;

		let buttonData = {
			label: settings.buttonLabel ?? 'add item',
			callback: (e) => this.addItem(e),
			value: 'add'
		};
		this.addButton = new nxButton(this.buttons, `editorList_${this.id}_addButton`, buttonData);

		if (!settings.disableImportButton) {
			buttonData = {
				label: settings.importLabel ?? 'import labels',
				callback: (e) => this.importLabels(e),
				value: 'import'
			};
			this.addButton = new nxButton(this.buttons, `editorList_${this.id}_importButton`, buttonData);
		}
		this.controller = settings.controller;
		this.path = settings.path;
		this.items = this.controller.getData(...this.path);
		this.topOffset = $('#interactionEditorBox').offset().top;
		this.controller.registerView((data) => this.updateData(data), ...this.path);

		this.linkFields = false;
		this.fieldPath = settings.fieldPath ?? null;
		if (settings.displayLinks === true) {
			this.linkFields = true;
			this.controller.registerView((data) => {
				this.updateData(this.controller.getData(...this.path));
				this.updateFields(data);
			}, ...this.fieldPath);
			this.updateFields(this.controller.getData(this.fieldPath));
		}

		this.renderItems();
	}

	toggleVisibility(visible) {
		this.db(1, "togglevisibility", visible);
		if (visible === true) {
			this.toggleFrame.removeClass('hidden');
		} else {
			this.toggleFrame.addClass('hidden');
		}
	}

	sanitizeLinkedItems() {
		this.db(1, "sanitizeLinkedItems");
		let temp = {};
		for (let lang in this.fields) {
			for (let i in this.fields[lang]) {
				if (temp[i]) {
					temp[i].label[lang] = this.fields[lang][i].name;
				} else {
					temp[i] = {
						value: this.fields[lang][i].name,
						label: {[lang]: this.fields[lang][i].name},
						link: i
					};
				}
			}
		}

		//for all items that have a link property, update the label property and delete the item if the link does not exist
		let entriesToDelete = [];
		for (let i in this.items) {
			if (this.items[i].link) {
				if (temp[this.items[i].link]) {
					this.items[i].label = temp[this.items[i].link].label;
				} else {
					entriesToDelete.push(i);
				}
			}
		}
		//delete all items on the delete list, starting with the highest number to avoid index shifting
		entriesToDelete.sort((a, b) => b - a);
		for (let i of entriesToDelete) {
			this.items.splice(i, 1);
		}

		//for all fields in temp, add the field to items if there is none with the same link
		for (let i in temp) {
			if (indexFromArray(this.items, i.toString(), 'link') === -1) {
				this.items.push(temp[i]);
			}
		}

		this.renderItems();
		this.storeItems();
	}

	renderItems(forceRecreate = false) {
		this.db(1, `renderItems(${forceRecreate ? 'true' : 'false'})`);
		if (forceRecreate) {
			this.dz.html('');
		}
		//iterate over existing items and update them or delete them if no longer in items array
		let lastItemId = -1;
		$(this.dz).find('.editorListItem').each((i, el) => {
			let itemId = $(el).data('itemid');
			if (!this.items[itemId]) {
				//item no longer exists, so remove it
				jsph.clear($(el).find(`div.editorListHandle`));
				if (this.plainText) {
					$(el).find(`input.editorListLabelText`).off('input');
				}
				$(el).find(`input.editorListValue`).off('input');
				this.buttonInstances.delete[itemId]?.destroy();
				this.buttonInstances.edit[itemId]?.destroy();
				$(el).remove();
			} else {
				lastItemId = itemId;

				//update item if, and only if, necessary
				let item = this.items[itemId];
				let link = $(el).data('link');
				if ((item.link ?? -1) !== link) {
					$(el).data('link', item.link);
					$(el).find('.editorListFieldNumber').text(item.link ?? "");
				}
				let value = $(el).find('.editorListValue').val();
				if ((item.value ?? '') !== value) {
					$(el).find('.editorListValue').val(item.value?.replace(/"/g, '&quot;'));
				}
				let label;
				if (this.plainText) {
					label = $(el).find('.editorListLabelText').val();
					if ((item.label?.[selectedLanguage] ?? '') !== label) {
						$(el).find('.editorListLabelText').val(item.label?.[selectedLanguage]?.replace(/"/g, '&quot;') ?? '');
					}
					if (link > -1 && !this.fields?.[selectedLanguage]?.[link]) {
						$(el).find('.editorListLabelText').prop('readonly', true);
						$(el).find('.editorListLabelText').val(UILANG.m('Field not defined in current language'));
					} else {
						$(el).find('.editorListLabelText').prop('readonly', false);
					}
				} else {
					let edId = $(el).find('.editorListLabelText').attr('id');
					let editor = tinyMCE.get(edId);
					label = editor.getContent();
					if ((item.label?.[selectedLanguage] ?? '') !== label) {
						editor.setContent(item.label?.[selectedLanguage] ?? '');
					}
					if (link > -1 && !this.fields?.[selectedLanguage]?.[link]) {
						editor.mode.set('readonly');
						editor.setContent(UILANG.m('<i>Field not defined in current language</i>'));
					} else {
						editor.mode.set('design');
					}
				}
			}
		});

		let html;
		let buttonData;

		for (let i in this.items) {
			if (i <= lastItemId) {
				continue;
			}
			let label = this.items[i].label?.[selectedLanguage] ?? '';
			// Replace quotes outside of HTML tags with `&quot;` FIX for #OA-1281
			label = label.replace(/"(?![^<]*>)/g, '&quot;');
			let value = this.items[i].value?.replace(/"/g, '&quot;');
			let link = this.items[i].link ?? -1;
			let locked = false;
			if (link > -1 && !this.fields?.[selectedLanguage]?.[link]) {
				locked = true;
			}
			if (this.plainText) {
				html = `<div id="editorList_${this.id}_item_${i}" class="editorListItem" data-groupid="${this.id}" data-itemid="${i}" data-link="${link}">
							<div class="editorListHandle"></div>
							<div class="editorListFieldNumber numberToken">${link > -1 ? link : ""}</div>
							<div class="editorListLabel">
								<input type="text" class="editorListLabelText tex2jax_ignore" ${locked ? 'readonly' : ''} value="${locked ? UILANG.m('Field not defined in current language') : label}">
							</div>
							<input type="text" class="editorListValue" required value="${value}">
							<div class="editorListItemButtons"></div>
						</div>`;
			} else {
				html = `<div id="editorList_${this.id}_item_${i}" class="editorListItem" data-groupid="${this.id}" data-itemid="${i}" data-link="${link}">
							<div id="editorList_${this.id}_toolbar_${i}" class="editorList_toolbar"></div>
							<div class="editorListHandle"></div>
							<div class="editorListFieldNumber numberToken">${link > -1 ? link : ""}</div>
							<div class="editorListLabel">
								<div class="editorListLabelText tex2jax_ignore">${locked ? UILANG.m('Field not defined in current language') : label}</div>
							</div>
							<input type="text" class="editorListValue" required value="${value}">
							<div class="editorListItemButtons"></div>
						</div>`;
			}
			this.dz.append(html);
			if (!this.plainText) {
				let config = deepCopy(this.tinyConfig_inline);
				config.selector = `#editorList_${this.id}_item_${i} > .editorListLabel > .editorListLabelText`;
				config.fixed_toolbar_container = `#editorList_${this.id}_toolbar_${i}`;
				if (locked) config.readonly = true;
				window.tinymce.init(config);
			} else {
				$(`#editorList_${this.id}_item_${i} > .editorListLabel > .editorListLabelText`).on('input', (e) => this.onLabelUpdate(e));
			}

			jsph.listen(this.element.find(`#editorList_${this.id}_item_${i} div.editorListHandle`), {
				callbacks: {
					down: (e) => this.itemDragStart(e),
					move: (e) => this.itemDrag(e),
					up: (e) => this.itemDrop(e),
					out: (e) => this.itemDrop(e)
				}
			});

			buttonData = {
				iconHeight: 24,
				callback: () => this.removeItem(i),
				icon: svgIcons.removeBlock,
				toggle: true,
				style: {
					padding: '4px',
					height: '32px',
					'box-sizing': 'border-box'
				}
			};
			this.buttonInstances.delete[i] = new nxButton($(`#editorList_${this.id}_item_${i} > .editorListItemButtons`), `${this.id}_item${i}_removeButton`, buttonData);

			if (!this.plainText) {
				buttonData = {
					iconHeight: 25,
					callback: () => this.editLabel(parseInt(i)),
					icon: svgIcons.editBlock,
					overlay: {
						right: 0,
						top: 0
					}
				};
				this.buttonInstances.edit[i] = new nxButton($(`#editorList_${this.id}_item_${i} > .editorListLabel`), `editorList_${this.id}_editButton_${i}`, buttonData);
			}
		}

		$(`#editorList_${this.id} input.editorListValue`).on('input', (e) => this.onValueUpdate(e));
	}

	updateFields(data) {
		this.db(1, "updateFields", data);
		this.fields = data;
		this.sanitizeLinkedItems();
	}

	editLabel(itemId) {
		this.db(1, "editLabel", itemId);
		this.callback.call(this, ...this.path, itemId, 'label');
	}

	onLabelUpdate(event, targetElm = null) {
		this.db(1, "onLabelUpdate");
		let target = $(targetElm ?? event.target);
		let itemId = target.parents('.editorListItem').data('itemid');
		let data;
		if (this.plainText) {
			data = target.val();
		} else {
			let editorId = target.attr('id');
			data = tinyMCE.get(editorId).getContent();
		}
		let oldLabel = this.items[itemId].label[selectedLanguage];
		//update item in items array, if and only if the label has changed
		if (this.items[itemId].label[selectedLanguage] !== data) {
			this.items[itemId].label[selectedLanguage] = data;
			this.storeItems();
		}
		//check if item in items array has a link property and send update to linked item
		if (this.items[itemId].link) {
			let apiData = {
				oldLabel: oldLabel,
				newLabel: data,
				number: this.items[itemId].link
			};
			this.linksApi('updateField', apiData);
		}
	}

	onValueUpdate(e) {
		this.db(1, "onValueUpdate");
		let target = $(e.delegateTarget);
		let value = target.val();
		let id = target.parent().data('itemid');
		this.items[id].value = value;
		this.storeItems();
	}

	updateData(data) {
		this.db(1, "updateData", data);
		this.items = data;
		this.renderItems();
	}

	limitReached() {
		this.db(1, "limitReached");
		let dialogData = {
			buttons: [
				{
					label: UILANG.m('Ok'),
					default: true,
					cancel: true,
					value: 'ok'
				}
			],
			contents: sf(`<p>${UILANG.m('This list is limited to a maximum of %@ entries. No more can be inserted.')}</p>`, this.itemLimit),
			title: UILANG.m('Limit exceeded'),
			width: 400,
			returnPromise: false
		};

		showDialog('importDialog', dialogData);
	}

	addItem(skipRendering = false) {
		this.db(1, "addItem", skipRendering);
		if (this.items.length >= this.itemLimit) {
			this.limitReached();
			return;
		}
		let newItem = {
			value: this.valuePrefix + '_' + this.getNextValue()
		};
		initLanguageKeys(newItem, '', 'label');
		this.items.push(newItem);
		if (skipRendering !== true) {
			this.renderItems();
			this.storeItems();
		}
	}

	removeItem(itemId) {
		this.db(1, "removeItem", itemId);
		//check if item in items array has a link property and send delete to linked item
		if (this.items[itemId].link) {
			this.linksApi('deleteField', {number: this.items[itemId].link});
			return;
		}
		this.items.splice(itemId, 1);
		this.renderItems();
		this.storeItems();
	}

	storeItems() {
		this.db(1, "storeItems", this.items);
		this.controller.setData(this.items, ...this.path);
	}

	getImportString() {
		this.db(1, "getImportString");
		let str = '';
		for (let i in this.items) {
			str += this.items[i].label[selectedLanguage] + '__' + this.items[i].value + '\n';
		}
		return he.decode(str);
	}

	async importLabels() {
		this.db(1, "importLabels");
		let dialogData = {
			buttons: [
				{
					label: UILANG.m('cancel'),
					'cancel': true,
					value: 'cancel'
				},
				{
					label: UILANG.m('import'),
					'default': true,
					value: 'import'
				}
			],
			datafields: ['items'],
			mandatory: ['items'],
			focus: 'items',
			contents: `<p>${UILANG.m('Enter one label per line.<br>Values can be defined by adding two underscores followed by the desired value at the end of the row.')}</p><p>${UILANG.m('<b>Beware: </b>Import starts at the first line and <em>overwrites</em> any already existing labels.')}</p><p><textarea id="items" style="width: 100%; height: 300px; resize: none"></textarea></p>`,
			title: this.settings.importTitle ?? 'import',
			width: 800,
			doNotStripHTML: true,
			returnPromise: true,
			dataFormat: 'object'
		};

		let res = await showDialog('importDialog', dialogData);
		let raw = he.encode(res.data.items);
		let strings = raw.split(/\s*\r?\n\s*/g);
		switch (res.button) {
			case 'import':
				this.batchImport(strings);
				break;
			default:
				break;
		}
	}

	batchImport(strings, counter = 0) {
		this.db(1, "importLabels", strings, counter);
		for (let row of strings) {
			if (/^\s*$/.test(row)) {
				//skip empty lines
				continue;
			}
			let rxSplitRow = /^(.*)\s*_{2}\s*(.*)$/;
			let matches = row.match(rxSplitRow);
			let lbl = row;
			let value = this.valuePrefix + '_' + this.getNextValue();
			let overWriteValues = false;
			if (matches !== null) {
				lbl = matches[1];
				value = matches[2];
				overWriteValues = true;
			}
			//if lbl is not wrapped in <div> tags, wrap it to be consistent with tinyMCE container logic
			if (!/^<div>.*<\/div>$/.test(lbl)) {
				lbl = '<div>' + lbl + '</div>';
			}
			while (typeof (this.items[counter]?.link) !== 'undefined') {
				counter++;
			}
			if (this.items.length <= counter) {
				this.addItem(true);
			}
			this.items[counter].label[selectedLanguage] = lbl;
			if (overWriteValues === true) {
				this.items[counter].value = value;
			}
			if (this.itemLimit !== null && ++counter > this.itemLimit - 1) {
				this.limitReached();
				this.renderItems();
				this.storeItems();
				break;
			}
		}
		this.renderItems();
		this.storeItems();
	}

	async showDialog(id, dialogData) {
		this.db(1, "showDialog", id, dialogData);
		return new nxDialog(id, dialogData);
	}

	getNextValue() {
		this.db(1, "getNextValue");
		let valueCounter = 0;
		let valueFound;
		do {
			valueCounter++;
			valueFound = false;
			for (let item of this.items) {
				if (item.value === this.valuePrefix + "_" + valueCounter) {
					valueFound = true;
				}
			}
		} while (valueFound === true);
		return valueCounter;
	}

	itemDragStart(e) {
		this.db(1, "itemDragStart");
		let target = $(e.delegateTarget).parent();
		this.draggedItem = target.data('itemid');
		target.addClass('dragging');
		this.ghost = target;
		let ghostWidth = target.outerWidth() - 20;
		let y = e.clientY;
		this.dz.height(this.dz.outerHeight());
		this.ghost.css({
			left: this.dz.offset().left,
			top: y - this.topOffset - this.ghost.outerHeight() / 2,
			width: ghostWidth,
			position: 'absolute'
		}).show();
		this.itemDivs = this.dz.children(".editorListItem");
		this.itemOffsets = [];
		this.itemDivs.each((idx, el) => {
			this.itemOffsets[idx] = {top: $(el).offset().top, height: $(el).outerHeight()};
		});
		//the following must be in a separate loop, otherwise the top coordinates end up all the same … for no apparent reason
		this.itemDivs.each((idx, el) => {
			$(el).addClass('disableTransition');
			$(el).css({position: 'absolute', 'top': this.itemOffsets[idx].top - this.topOffset, width: ghostWidth + 4});
		});
		this.adjustPositions(this.draggedItem);
		this.itemDivs.each((idx, el) => {
			$(el).removeClass('disableTransition');
		});
	}

	itemDrag(e) {
		this.db(2, "itemDrag");
		let y = e.clientY;
		this.ghost.css({top: y - this.topOffset - this.ghost.outerHeight() / 2});
		let targetPos = this.determineItemPosition(y);
		this.adjustPositions(targetPos);
	}

	itemDrop(e) {
		this.db(2, "itemDrop");
		let y = e.clientY;
		let targetPos = this.determineItemPosition(y);
		if (targetPos !== this.draggedItem && targetPos !== this.draggedItem + 1) {
			let pos = this.determineItemPosition(y);
			this.reorderItems(pos, this.draggedItem);
		}
		this.draggedItem = null;
		this.ghost.hide();
		this.ghost.html("");
		$(".editorListItem").removeClass('dragging');
		this.dz.css('height', 'auto');

		this.renderItems(true);
		this.storeItems();
	}

	determineItemPosition(y) {
		this.db(2, "itemDetermineItemPosition", y);
		let pos = 0;
		for (let i = 0; i < this.itemOffsets.length; i++) {
			if (this.itemOffsets[i].top < y - 25) {
				if (this.itemOffsets[i].top + this.itemOffsets[i].height / 2 > y - 25) {
					pos = i;
				} else {
					pos = i + 1;
				}
			} else {
				break;
			}
		}
		return pos;
	}

	adjustPositions(pos) {
		this.db(2, "itemAdjustPositions", pos);
		this.itemDivs.each((idx, el) => {
			let itemId = $(el).data('itemid');
			if (itemId === this.draggedItem) {
				return;
			}
			if (itemId < pos) {
				$(el).css('top', this.itemOffsets[itemId].top - this.topOffset);
			} else {
				$(el).css('top', this.itemOffsets[itemId].top - this.topOffset + 44);
			}
		});
	}

	reorderItems(pos, itemId) {
		this.db(1, "itemReorderItems", pos, itemId);
		//if the item we remove precedes the target position we have to decrement the target position
		if (pos > itemId) {
			pos--;
		}
		let item = this.items[itemId];
		this.items.splice(itemId, 1);
		this.items.splice(pos, 0, item);
	}


	destroy() {
		this.db(1, "destroy");
		jsph.clear(this.element.find(`#editorList_${this.id}_dz div.editorListHandle`));
		$(`#editorList_${this.id} input`).off('input');
	}

	db(level,...args) {
		if (this.debug >= level) {
			console.trace(`%cEditorList ${this.id}:`, "color: green; font-weight: bold;", ...args);
		}
	}

}

/* ====================================== */

class editorCheckList {

	static counter = 0;

	constructor(settings) {
		this.debug = false;
		// this.debug = true;
		if (!settings.parent) {
			console.error("editorCheckList error: missing parent");
			return;
		}
		if (this.debug) {
			console.log("editorCheckList.constructor()", settings);
			window.widget ??= this;
		}
		editorCheckList.counter++;
		if (!settings.label) {
			settings.label = "label";
		}

		this.id = editorCheckList.counter;
		let html = `<div id="editorCheckList_${this.id}" class="editorCheckList editorSection"><div class="editorSectionHeader">${settings.label}:</div><div id="editorCheckListItems_${this.id}"></div></div>`;
		settings.parent.append(html);

		this.element = $(`#editorCheckListItems_${this.id}`);

		this.controller = settings.controller;
		this.path = settings.path;
		this.itemsPath = settings.itemsPath;
		this.typePath = settings.typePath;
		this.data = this.controller.getData(...this.path);
		this.items = this.controller.getData(...this.itemsPath);
		this.type = this.controller.getData(...this.typePath);
		this.updateData();
		this.controller.registerView((data) => this.updateItems(data), ...this.itemsPath);
		this.controller.registerView((data) => this.updateType(data), ...this.typePath);
	}

	updateItems(items) {
		if (this.debug) {
			console.log("editorCheckList.updateItems()", items);
		}
		this.items = items;
		this.updateData();
	}

	updateType(type) {
		if (this.debug) {
			console.log("editorCheckList.updateType()", type);
		}
		this.type = type;
		this.updateData();
	}

	updateData() {
		if (this.debug) {
			console.log("editorCheckList.updateData()");
		}
		let data;
		let values = [];
		for (let i in this.items) {
			values.push(this.items[i].value);
		}

		switch (this.type) {
			case 'single':
			case 'dropdown':
				this.mcType = 'rb';
				if (this.data instanceof Array && this.data.length > 0) {
					if (values.includes(this.data[0])) {
						data = this.data[0];
					} else {
						data = "";
					}
				} else if (typeof (this.data) === 'string') {
					if (values.includes(this.data)) {
						data = this.data;
					} else {
						data = "";
					}
				} else {
					data = '';
				}
				break;
			case 'multiple':
				this.mcType = 'cb';
				data = [];
				if (this.data instanceof Array) {
					for (let j in this.data) {
						if (values.includes(this.data[j])) {
							data.push(this.data[j]);
						}
					}
				} else if (typeof (this.data) === 'string') {
					if (values.includes(this.data)) {
						data.push(this.data);
					}
				}
				break;
			default:
				this.mcType = '';
				this.data = null;
				return;
		}

		this.data = data;
		this.saveData();
		this.updateList();
	}

	updateList() {
		if (this.debug) {
			console.log("editorCheckList.updateList()");
		}
		if (this.mcType === '') {
			return;
		}
		this.element.html("");
		let jsmcData = {
			type: this.mcType,
			onChange: (group, value) => this.onChange(value),
			initialValue: this.data,
			dataId: `editorCheckList_${this.id}`,
			elPrefix: "<div class='editorCheckListItem'>",
			lbPostfix: "</div>",
			elements: []
		};

		for (let i in this.items) {
			let el = {elementParent: this.element, labelParent: this.element};
			el.value = this.items[i].value;
			el.label = this.items[i].label[selectedLanguage];
			jsmcData.elements.push(el);
		}

		this.jsmc = new jsMultipleChoice(`editorCheckList_${this.id}_jsmc`, jsmcData);
	}

	onChange(value) {
		if (this.debug) {
			console.log("editorCheckList.onChange()", value);
		}
		this.data = value;
		this.saveData();
	}

	saveData() {
		if (this.debug) {
			console.log("editorCheckList.saveData()");
		}
		this.controller.setData(this.data, ...this.path);
	}

	destroy() {
		if (this.debug) {
			console.log("editorCheckList.destroy()");
		}
		this.element.html("");
	}

}

/* ====================================== */

class editorCheckListGrid {

	static counter = 0;

	constructor(settings) {
		this.debug = false;
		// this.debug = true;
		if (this.debug) {
			console.log("editorCheckListGrid.constructor()", settings);
		}
		if (!settings.parent) {
			console.error("editorCheckListGrid error: missing parent");
			return;
		}
		editorCheckListGrid.counter++;
		if (!settings.label) {
			settings.label = "label";
		}

		this.id = editorCheckListGrid.counter;
		this.controller = settings.controller;
		this.path = settings.path;
		this.rowsPath = settings.rowsPath;
		this.labelsPath = settings.labelsPath;
		this.typePath = settings.typePath;
		this.fieldWidthPath = settings.fieldWidthPath;
		this.layoutPath = settings.layoutPath;

		settings.parent.append(`<div id='editorCheckListGrid_${this.id}'></div>`);
		this.element = $(`#editorCheckListGrid_${this.id}`);

		this.data = this.controller.getData(...this.path);
		this.rows = this.controller.getData(...this.rowsPath);
		this.labels = this.controller.getData(...this.labelsPath);
		this.type = this.controller.getData(...this.typePath);
		this.layout = this.controller.getData(...this.layoutPath);

		this.controller.registerView((data) => {
			this.data = data;
			this.updateData();
		}, ...this.path);
		this.controller.registerView((data) => this.updateRows(data), ...this.rowsPath);
		this.controller.registerView((data) => this.updateLabels(data), ...this.labelsPath);
		this.controller.registerView((data) => this.updateType(data), ...this.typePath);
		this.controller.registerView((data) => this.updateLayout(data), ...this.layoutPath);
		this.jsph = jsPointerHandler.instance;
		this.updateData();
	}

	updateGrid() {
		if (this.debug) {
			console.log("editorCheckListGrid.updateGrid()");
		}
		this.fieldWidth = this.controller.getData(...this.fieldWidthPath);

		this.createMarkup();
		this.renderGrid();
	}

	createMarkup() {
		if (this.debug) {
			console.log("editorCheckListGrid.createMarkup()");
		}
		let duplicateCheck = {};
		let valid = true;
		let html = '';
		let legend = '<div class="legend">';
		html += `<div class='matrixBlock tableLayout'>`;
		html += `<div class='matrixHeader' style="grid-template-columns: 1fr repeat(${this.labels.length}, ${this.fieldWidth}px);">`;
		for (let i in this.labels) {
			if (this.layout === 'inplace') {
				html += `<div class='matrixHeaderCell'>${this.labels[i].label[selectedLanguage]}</div>`;
			} else {
				html += `<div class='matrixHeaderCell'>${parseInt(i) + 1}</div>`;
				legend += `<div class='legendLabel'>${parseInt(i) + 1} = ${this.labels[i].label[selectedLanguage]}</div>`;
			}
		}
		html += "</div>";
		for (let i in this.rows) {
			html += `<div class='matrixRow' style="grid-template-columns: 1fr repeat(${this.labels.length}, ${this.fieldWidth}px);">
						<div class='matrixRowLabel'>${this.rows[i].label[selectedLanguage]}</div>`;
			for (let j in this.labels) {
				html += `<div class='matrixChoiceCell' data-group="${encodeToHex(this.rows[i].value)}" data-value="${encodeToHex(this.labels[j].value)}"></div>`;
				/* check if values and variable names are unique */
				if (typeof (duplicateCheck[this.rows[i].value]) === 'undefined') {
					duplicateCheck[this.rows[i].value] = {};
				} else {
					if (typeof (duplicateCheck[this.rows[i].value][this.labels[j].value]) === 'undefined') {
						duplicateCheck[this.rows[i].value][this.labels[j].value] = true;
					} else {
						valid = false;
					}
				}
			}
			html += "</div>";
		}
		html += '</div>';
		legend += '</div>';

		if (this.layout === 'legend') {
			html = legend + html;
		}

		if (valid === false) {
			html = '';
		}
		this.element.html(html);
	}

	updateRows(rows) {
		if (this.debug) {
			console.log("editorCheckListGrid.updateRows()", rows);
		}
		this.rows = rows;
		this.updateData();
	}

	updateLabels(labels) {
		if (this.debug) {
			console.log("editorCheckListGrid.updateLabels()", labels);
		}
		this.labels = labels;
		this.updateData();
	}

	updateType(type) {
		if (this.debug) {
			console.log("editorCheckListGrid.updateType()", type);
		}
		this.type = type;
		this.updateData();
	}

	updateLayout(layout) {
		if (this.debug) {
			console.log("editorCheckListGrid.updateLayout()", layout);
		}
		this.layout = layout;
		this.updateGrid();
	}

	updateData() {
		if (this.debug) {
			console.log("editorCheckListGrid.updateData()");
		}
		let data = {};
		let values = [];
		for (let i in this.labels) {
			values.push(this.labels[i].value);
		}
		for (let i in this.rows) {
			let row = this.rows[i];
			let newRow;
			switch (this.type) {
				case 'single':
					this.mcType = 'rb';
					if (this.data?.[row.value] instanceof Array && this.data?.[row.value].length > 0) {
						if (values.includes(this.data[row.value][0])) {
							newRow = this.data[row.value][0];
						} else {
							newRow = "";
						}
					} else if (typeof (this.data?.[row.value]) === 'string') {
						if (values.includes(this.data[row.value])) {
							newRow = this.data[row.value];
						} else {
							newRow = "";
						}
					} else {
						newRow = '';
					}
					break;
				case 'multiple':
					this.mcType = 'cb';
					newRow = [];
					if (this.data?.[row.value] instanceof Array) {
						for (let j in this.data[row.value]) {
							if (values.includes(this.data[row.value][j])) {
								newRow.push(this.data[row.value][j]);
							}
						}
					} else if (typeof (this.data?.[row.value]) === 'string') {
						if (values.includes(this.data[row.value])) {
							newRow.push(this.data[row.value]);
						}
					}
					break;
				default:
					this.mcType = '';
					this.data = null;
					return;
			}
			data[row.value] = newRow;
		}
		this.data = data;
		this.saveData();
		this.updateGrid();
	}

	renderGrid() {
		if (this.debug) {
			console.log("editorCheckListGrid.renderGrid()");
		}
		if (this.mcType === '') {
			return;
		}
		this.buttons = [];

		for (let r in this.rows) {
			let group = this.rows[r].value;
			let jsmcData = {
				type: this.mcType,
				onChange: (id, value, dirty, group) => this.onChange(group, value),
				initialValue: this.data[group],
				elements: [],
				dataId: group
			};
			for (let i in this.labels) {
				let value = this.labels[i].value;
				let el = {elementParent: this.element.find(`.matrixChoiceCell[data-group='${encodeToHex(group)}'][data-value='${encodeToHex(value)}']`)};
				el.value = value;
				jsmcData.elements.push(el);
			}

			this.buttons.push(new jsMultipleChoice(`editorCheckListGrid_${encodeToHex(this.id)}_jsmcGroup_${encodeToHex(group)}`, jsmcData));
		}
	}

	onChange(group, value) {
		if (this.debug) {
			console.log("editorCheckListGrid.onChange()", group, value);
		}
		this.data[group] = value;
		this.saveData();
	}

	saveData() {
		if (this.debug) {
			console.log("editorCheckListGrid.saveData()");
		}
		this.controller.setData(this.data, ...this.path);
	}

	destroy() {
		if (this.debug) {
			console.log("editorCheckListGrid.destroy()");
		}
		this.element.html("");
	}

}

/* ====================================== */

class editorMultiList {

	static counter = 0;

	constructor(settings) {
		editorMultiList.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path || !settings.fieldsPath) {
			console.error("editorMultiList error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `editorMultiList_${editorMultiList.counter}`;
		let html = `<div class="editorProperty">`;
		html += `<div class="editorPropertyLabel">${settings.label}:</div>`;
		html += `<div class="editorMultiListFields" id="${this.id}"></div>`;
		html += `</div>`;
		html += `<div id="${this.id}_parking" class="editorMultiListParking"></div>`;
		this.section.append(html);
		this.list = $(`#${this.id}`);
		this.addButtons = {};
		this.parking = $(`#${this.id}_parking`);

		let buttonData = {
			iconHeight: 20,
			callback: () => this.removeItem(),
			icon: svgIcons.remove,
			toggle: true
		};
		this.removeButton = new nxButton($(`#${this.id}_parking`), `${this.id}_removeButton`, buttonData);

		this.controller = settings.controller;
		this.path = settings.path;
		this.fieldsPath = settings.fieldsPath;
		this.jsph = jsPointerHandler.instance;
		this.hoveredItem = null;
		this.editOnRefresh = null;

		this.controller.registerView((data) => this.onUpdate(data), ...this.fieldsPath);
		this.controller.registerView(() => this.displayFields(), ...this.path);
		this.onUpdate(this.controller.getData(...this.fieldsPath));
	}

	switchLanguage() {
		this.displayFields();
	}

	onUpdate(data) {
		this.fields = {};
		//merge field languages
		for (let i in data) {
			let list = data[i];
			for (let j in list) {
				let item = list[j];
				if (typeof (this.fields[j]) === 'undefined') {
					this.fields[j] = [item.name];
				} else if (!this.fields[j].includes(item.name)) {
					this.fields[j].push(item.name);
				}
			}
		}
		this.displayFields();
	}

	displayFields() {
		this.jsph.clear(this.list.find('li[data-locked=false]'));

		let html;
		let buttonData = {
			iconHeight: 25,
			callback: (v) => this.addItem(v),
			icon: svgIcons.add,
			toggle: true,
			disabled: true
		};

		for (let i in this.addButtons) {
			this.addButtons[i].destroy();
			delete this.addButtons[i];
		}

		this.list.html("");

		for (let i in this.fields) {
			html = '';
			let strings = this.fields[i];
			let field = this.controller.getData(this.fieldsPath, selectedLanguage, i);
			html += `<div class="editorMultiListHeader"><div class="numberToken">${i}</div>&nbsp;&nbsp;&nbsp;${field?.prefix ?? ''}<span class="editorMultiListHilight">${field?.name ?? ("<span class='editorMultiListError'>" + UILANG.m('ERROR: field missing in this language') + "</span>")}</span>${field?.suffix ?? ''}</div>`;
			html += `<div><input type="text" class="editorMultiListTextfield" id="${this.id}_input_${i}"> <div id="${this.id}_add_${i}" class="editorMultiListAddButton"></div></div>`;
			html += `<ul>`;
			for (let s of strings) {
				html += `<li data-fieldnumber="${i}" data-locked="true">${s}</li>`;
			}
			strings = this.controller.getData(this.path, i);
			if (Array.isArray(strings)) {
				for (let j in strings) {
					let s = strings[j];
					html += `<li data-fieldnumber="${i}" data-index="${j}" data-locked="false">${s}<div class="editorMultiListRemoveButton"></div></li>`;
				}
			}
			html += `</ul>`;
			this.list.append(html);
			buttonData.value = i;
			this.addButtons[i] = (new nxButton($(`#${this.id}_add_${i}`), `${this.id}_addButton_${i}`, buttonData));
			$(`#${this.id}_input_${i}`).on('keyup', (e) => this.onTextFieldInput(e, i));
		}


		this.jsph.listen(this.list.find("li[data-locked=false]"), {
			callbacks: {
				over: (e) => this.hoverListItem(e),
				leave: (e) => this.leaveListItem(e),
				dblclick: (e) => this.dblClickListItem(e)
			},
			hoverClass: 'hovered'
		});

		if (this.editOnRefresh !== null) {
			let tfId = `${this.id}_input_${this.editOnRefresh.field}`;
			$(`#${tfId}`).val(this.editOnRefresh.string).focus();
			this.editOnRefresh = null;
		}
	}

	onTextFieldInput(e, n) {
		if ($(`#${this.id}_input_${n}`).val().trim().length === 0) {
			this.addButtons[n].disable();
		} else {
			this.addButtons[n].enable();
			if (e.key === 'Enter') {
				this.addItem(n);
			}
		}
	}


	addItem(n) {
		let tfId = `${this.id}_input_${n}`;
		let s = $(`#${tfId}`).val();
		s = s.trim();
		if (s.length === 0) return;
		let data = this.controller.getData(...this.path, n);
		if (!Array.isArray(data)) {
			data = [];
		}
		if (data.includes(s)) {
			let index = data.indexOf(s);
			let element = $(`#${this.id} li[data-fieldnumber=${n}][data-index=${index}]`);
			this.flashItem(element);
			this.addButtons[n].disable();
		} else if (this.fields[n].includes(s)) {
			let element = $(`#${this.id} li[data-fieldnumber=${n}]`).filter(function () {
				return $(this).text().trim() === s;
			});
			this.flashItem(element);
			this.addButtons[n].disable();
		} else {
			data.push(s);
			data.sort();
			this.controller.setData(data, ...this.path, n);
		}
		$(`#${tfId}`).val("").focus();
	}

	flashItem(element) {
		element.addClass('editorMultiList_flash');
		setTimeout(() => element.removeClass('editorMultiList_flash'), 500);
	}

	removeItem() {
		if (this.hoveredItem === null) {
			return;
		}
		this.controller.eraseData(...this.path, this.hoveredItem.field, this.hoveredItem.index);
	}

	editItem() {
		if (this.hoveredItem === null) {
			return;
		}
		let s = this.controller.getData(...this.path, this.hoveredItem.field, this.hoveredItem.index);
		this.editOnRefresh = {field: this.hoveredItem.field, string: s};
		this.controller.eraseData(...this.path, this.hoveredItem.field, this.hoveredItem.index);
	}

	hoverListItem(e) {
		let item = $(e.target);
		this.hoveredItem = {field: item.data('fieldnumber'), index: item.data('index')};
		this.removeButton.element.appendTo(item.children('.editorMultiListRemoveButton'));
	}

	leaveListItem() {
		this.hoveredItem = null;
		this.removeButton.element.appendTo(this.parking);
	}

	dblClickListItem(e) {
		let item = $(e.delegateTarget);
		this.hoveredItem = {field: item.data('fieldnumber'), index: item.data('index')};
		this.editItem();
	}

	destroy() {
		this.jsph.clear(this.list.find('li[data-locked=false]'));
		this.removeButton.destroy();
		for (let i in this.addButtons) {
			this.addButtons[i].destroy();
		}
	}

}

/* ====================================== */

class editorDropDown {

	static counter = 0;

	constructor(settings) {
		if (!settings.parent) {
			console.error("editorDropDown error: missing parent");
			return;
		}
		editorDropDown.counter++;
		if (!settings.label) {
			settings.label = "label";
		}

		this.id = editorDropDown.counter;
		let html = `<div class="editorDropDown editorSection"><div class="editorSectionHeader">${settings.label}:</div><div id="editorDropDown_${this.id}_container"></div></div>`;
		settings.parent.append(html);

		this.controller = settings.controller;
		this.path = settings.path;
		this.itemsPath = settings.itemsPath;
		this.data = this.controller.getData(...this.path);
		this.items = this.controller.getData(...this.itemsPath);
		this.controller.registerView((data) => {
			this.data = data;
			this.triggerChange(data);
		}, ...this.path);
		this.controller.registerView((data) => this.updateItems(data), ...this.itemsPath);

		let dlSettings = {
			elements: [{value: "", label: ""}],
			listTitle: '',
			initialValue: this.data,
			theme: 'backend',
			onChange: (sender, value) => this.onChange(value)
		};

		for (let i in this.items) {
			let option = {value: encodeToHex(this.items[i].value), label: this.items[i].label[selectedLanguage]};
			dlSettings.elements.push(option);
		}

		this.element = new jsDropList(`editorDropDown_${this.id}_container`, `editorDropDown_${this.id}`, dlSettings);
	}

	updateItems(items) {
		this.items = items;
		this.updateDropDown();
		this.updateData();
	}

	updateData() {
		let data;
		let values = [];
		for (let i in this.items) {
			values.push(encodeToHex(this.items[i].value));
		}

		if (values.includes(this.data)) {
			data = this.data;
		} else {
			data = "";
		}

		this.data = data;
		this.saveData();
		this.element.reset(this.data);
	}

	updateDropDown() {
		let elements;
		if (this.controller.isDataValid()) {
			elements = [{value: "", label: ""}];
			for (let i in this.items) {
				let option = {value: encodeToHex(this.items[i].value), label: this.items[i].label[selectedLanguage]};
				elements.push(option);
			}
		} else {
			elements = [{value: "", label: "error in data structure"}];
		}
		this.element.setElements(elements, this.data);
	}

	onChange(value) {
		this.data = value;
		this.saveData();
	}

	triggerChange(value) {
		this.element.reset(value);
	}

	saveData() {
		this.controller.setData(this.data, ...this.path);
	}

	destroy() {
		$(`#editorDropDown_${this.id}_container`).html("");
		delete this.element;
	}

}

/* ====================================== */

class editorPreview {

	static counter = 0;

	constructor(settings) {
		editorPreview.counter++;
		if (!settings.parent) {
			console.error("editorPreview error: missing parent");
			return;
		}
		this.updateCallback = settings.updateCallback ?? null;
		let html = `<div class="editorSection"><div class="editorSectionHeader">${UILANG.m('preview:')}</div>
			<div class='previewControls'>${UILANG.e('preview width')}: <span id="preview_selector_${editorPreview.counter}_container" class="preview_selector_container"></span>
			<div id="preview_${editorPreview.counter}" class='preview'></div></div>`;
		settings.parent.append(html);
		this.preview = $(`#preview_${editorPreview.counter}`);
		this.maxWidth = this.preview.innerWidth() - 40;

		let dlSettings = {
			elements: [
				{value: this.maxWidth + 'px', label: UILANG.m('no constraint')},
				{value: '1024px', label: UILANG.m('1024px (default)')},
				{value: '962px', label: '962px'},
				{value: '800px', label: '800px'},
				{value: '768px', label: '768px'},
				{value: '601px', label: UILANG.m('601px (small tablet)')},
				{value: '414px', label: UILANG.m('414px (big phone)')},
				{value: '375px', label: '375px'},
				{value: '360px', label: '360px'},
				{value: '320px', label: UILANG.m('320px (small phone)')},
			],
			listTitle: '',
			initialValue: '1024px',
			theme: 'backend',
			onChange: (sender, value) => this.onChange(sender, value)
		};

		this.element = new jsDropList(`preview_selector_${editorPreview.counter}_container`, `preview_selector_${editorPreview.counter}`, dlSettings);
		this.onChange(this, '1024px');
	}

	onChange(sender, value) {
		this.preview.css('width', value);
		if (typeof (this.updateCallback) === 'function') {
			this.updateCallback.call(this);
		}
	}

	getWidth() {
		return parseInt(this.element.getValue());
	}

	update(contents) {
		this.preview.html(contents);
	}

	setCSS(css) {
		this.preview.css(css);
	}

}

/* ====================================== */

/* a div which toggles visibility based on a specific value sent by the controller and a whitelist (settings.conditions) */
class propsToggleDiv {

	static counter = 0;

	constructor(settings) {
		propsToggleDiv.counter++;
		this.timeout = -1;
		if ((!settings.div && !(settings.panel && settings.section) && !settings.parent) || !settings.controller || (!(settings.path && settings.conditions) && !(settings.logic && settings.logicOperator))) {
			console.error("propsToggleDiv error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			//if toggleDiv is to be added inside another toggleDiv or an empty property div
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			//if toggleDiv is to be created in any element given as parent
			this.section = settings.parent
		} else {
			//if toggleDiv is to be created in a specific section of a sidePanel
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `propsToggle_${propsToggleDiv.counter}`;
		if (settings.addClass) {
			this.addClass = settings.addClass;
		} else {
			this.addClass = "";
		}
		let gridClass;
		switch (settings.grid) {
			case '2col':
				gridClass = "grid_2col";
				break;
			case 'forFutureUse':
				/* there could be potentially more setups here if needed in the future */
				break;
			default:
				gridClass = "";
		}
		let html = `<div class='propsToggleDiv hidden ${gridClass} ${this.addClass}' id='${this.id}'></div>`;
		this.section.append(html);
		this.controller = settings.controller;
		this.path = settings.path ?? [];
		this.conditions = settings.conditions ?? null;
		this.logic = settings.logic ?? null;
		this.logicOperator = settings.logicOperator ?? null;
		this.hideIfDataInvalid = settings.hideIfDataInvalid ?? false;
		this.element = $(`#${this.id}`);
		this.controller.registerView((v) => this.updateVisibility(v), ...this.path);
		this.updateVisibility(this.controller.getData(...this.path), true);
	}

	updateVisibility(v, initializing = false) {
		let result;
		if (this.hideIfDataInvalid && !this.controller.isDataValid()) {
			/* if the controller is set to hide on invalid data, the data validity is the check with the highest priority */
			result = false;
		} else {
			if (!this.logic) {
				result = !!this.conditions.includes(v);
			} else {
				if (this.logicOperator === '||') {
					result = false;
				} else if (this.logicOperator === '&&') {
					result = true;
				} else {
					console.error("propsToggleDiv error: unkown operator", this.logicOperator);
					return;
				}
				for (let condition of this.logic) {
					let data = this.controller.getData(...condition.path);
					let currentResult;
					switch (condition.operator) {
						case '===':
							currentResult = (data === condition.value);
							break;
						case '!==':
							currentResult = (data !== condition.value);
							break;
						case '>':
							currentResult = (data > condition.value);
							break;
						case '>=':
							currentResult = (data >= condition.value);
							break;
						case '<':
							currentResult = (data < condition.value);
							break;
						case '<=':
							currentResult = (data <= condition.value);
							break;
						default:
							currentResult = false;
					}
					if (this.logicOperator === '||') {
						result = result || currentResult;
					} else {
						result = result && currentResult;
					}
				}
			}
		}
		if (this.timeout > 0) {
			clearTimeout(this.timeout);
		}
		if (result === true) {
			this.element.removeClass('hidden');
			if (!initializing) {
				this.element.addClass('toggleDivFlash');
				this.timeout = setTimeout(() => this.clearAnimation(), 1000);
			}
		} else {
			this.element.addClass('hidden');
		}
	}

	clearAnimation() {
		this.element.removeClass('toggleDivFlash');
		this.timeout = -1;
	}

	getElement() {
		return this.element;
	}

}

/* ====================================== */

class propsDiv {

	static counter = 0;

	constructor(settings) {
		propsDiv.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label) {
			console.error("propsTextField error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `propsDiv_${propsDiv.counter}`;
		let gridClass;
		switch (settings.grid) {
			case '2col':
				gridClass = "grid_2col";
				break;
			case 'forFutureUse':
				/* there could be potentially more setups here if needed in the future */
				break;
			default:
				gridClass = "";
		}
		let html = `<div id="${this.id}" class="editorProperty ${gridClass}"><div class="editorPropertyLabel">${settings.label}:</div></div>`;
		this.section.append(html);
		this.element = $(`#${this.id}`);
	}

	getElement() {
		return this.element;
	}

}

/* ====================================== */

class propsLabel {

	static counter = 0;

	constructor(settings) {
		propsLabel.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label) {
			console.error("propsLabel error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `propsLabel_${propsLabel.counter}`;
		let html = `<div class="editorProperty"><div id="${this.id}" class="propsLabel"></div></div>`;
		this.section.append(html);
		this.controller = settings.controller ?? null;
		this.paths = settings.paths ?? null;
		this.label = settings.label;
		this.errorLabel = settings.errorLabel;
		this.converter = settings.converter ?? null;
		this.element = $(`#${this.id}`);
		if (settings.paths && settings.controller) {
			for (let path of this.paths) {
				this.controller.registerView(() => this.onUpdate(), ...path)
			}
		}
		this.onUpdate();
	}

	onUpdate() {
		if (typeof (this.converter) === 'function') {
			let data = [];
			for (let path of this.paths) {
				data.push(this.controller.getData(...path));
			}
			let val = this.converter.call(this, ...data);
			if (val === false) {
				this.element.html(this.errorLabel);
			} else {
				this.element.html(sf(this.label, val));
			}
		} else {
			this.element.html(this.label);
		}
	}

}

/* ====================================== */

class propsTextField {

	static counter = 0;

	constructor(settings) {
		propsTextField.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path) {
			console.error("propsTextField error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.validationMessage = settings.validationMessage || '';
		this.id = `propsTF_${propsTextField.counter}`;
		let html = `<div class="editorProperty">
						<div class="editorPropertyLabel">${settings.label}:</div>
						<input type="text" class="propsTF" id="${this.id}" maxlength="255">
						<div class="propsTF_message">${this.validationMessage}</div>
					</div>`;
		this.section.append(html);

		this.controller = settings.controller;
		this.path = settings.path;
		this.pattern = settings.pattern ?? null;
		this.element = $(`#${this.id}`);
		this.message = $(`#${this.id} + .propsTF_message`);
		if (this.pattern) {
			this.element.prop('pattern', this.pattern);
		}
		this.element.val(this.controller.getData(...this.path));
		this.element.on('input', (e) => this.onInput(e));
		this.controller.registerView((data) => this.onUpdate(data), ...this.path)
		this.validate();
	}

	onInput() {
		this.controller.setData(this.element.val(), ...this.path);
		if (!this.validationMessage || !this.pattern) {
			return;
		}
		this.validate();
	}

	validate() {
		if (this.element.is(":invalid")) {
			this.message.show();
		} else {
			this.message.hide();
		}
	}

	onUpdate(data) {
		this.element.val(data);
		this.validate();
	}

}

/* ====================================== */

class propsDropDown {

	static counter = 0;

	constructor(settings) {
		propsDropDown.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path || (!settings.options && !settings.optionsObject)) {
			console.error("propsDropDown error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `propsDD_${propsDropDown.counter}`;
		let html = `<div class="editorProperty"><div class="editorPropertyLabel">${settings.label}:</div><div id="${this.id}_container"></div></div>`;
		if (settings.prepend === true) {
			this.section.prepend(html);
		} else {
			this.section.append(html);
		}
		this.controller = settings.controller;
		this.path = settings.path;
		if (typeof (settings.options) === 'undefined') {
			if (typeof (settings.optionsObject) !== 'object') {
				console.error("propsDropDown error: missing options");
				return;
			}
			settings.options = [{value: '', label: ''}];
			for (let i in settings.optionsObject) {
				settings.options.push({value: i, label: settings.optionsObject[i]});
			}
		}

		let dlSettings = {
			elements: settings.options,
			listTitle: '',
			width: settings.width ? settings.width : '100%',
			initialValue: this.controller.getData(...this.path),
			theme: 'backend',
			onChange: (sender, value) => this.onChange(sender, value)
		};

		this.element = new jsDropList(this.id + '_container', this.id, dlSettings);
		this.controller.registerView((data) => this.onUpdate(data), ...this.path);
	}

	onChange(sender, value) {
		this.controller.setData(value, ...this.path);
	}

	onUpdate(data) {
		this.element.reset(data);
	}

}

/* ====================================== */

class propsList {

	static counter = 0;

	constructor(settings) {
		propsList.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path) {
			console.error("propsList error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `propsList_${propsList.counter}`;
		let html = `<div class="editorProperty">`;
		html += `<div class="editorPropertyLabel">${settings.label}:</div>`;
		html += `<div><input type="text" class="propsListTextfield" id="${this.id}_input"> <div id="${this.id}_add" class="propsListAddButton"></div></div>`;
		html += `<div id="${this.id}_container"><ul id="${this.id}" class="propsList"></ul></div>`;
		html += `<div id="${this.id}_parking" class="propsListParking"></div>`;
		html += `</div>`;
		this.section.append(html);
		this.list = $(`#${this.id}`);
		this.textfield = $(`#${this.id}_input`);
		this.parking = $(`#${this.id}_parking`);
		let buttonData = {
			iconHeight: 25,
			callback: () => this.addItem(),
			icon: svgIcons.add,
			toggle: true,
			disabled: true
		};
		this.addButton = new nxButton($(`#${this.id}_add`), `${this.id}_addButton`, buttonData);

		buttonData = {
			iconHeight: 20,
			callback: () => this.removeItem(),
			icon: svgIcons.remove,
			toggle: true
		};
		this.removeButton = new nxButton($(`#${this.id}_parking`), `${this.id}_removeButton`, buttonData);

		this.controller = settings.controller;
		this.path = settings.path;
		this.jsph = jsPointerHandler.instance;
		this.hoveredItem = null;

		this.controller.registerView((data) => this.onUpdate(data), ...this.path);
		this.onUpdate(this.controller.getData(...this.path));
		this.textfield.on('keyup', (e) => this.onTextFieldInput(e));
	}

	onTextFieldInput(e) {
		if (this.textfield.val().trim().length === 0) {
			this.addButton.disable();
		} else {
			this.addButton.enable();
			if (e.key === 'Enter') {
				this.addItem();
			}
		}
	}

	addItem() {
		let val = this.textfield.val();
		val = val.trim();
		if (val.length === 0) return;
		let data = this.controller.getData(...this.path);
		if (!data.includes(val)) {
			data.push(val);
			data.sort();
			this.controller.setData(data, ...this.path);
		} else {
			let element = $(`#${this.id} li`).filter(function () {
				return $(this).text().trim() === val;
			});
			this.flashItem(element);
		}
		this.textfield.val('');
		this.addButton.disable();
	}

	flashItem(element) {
		element.addClass('propsList_flash');
		setTimeout(() => element.removeClass('propsList_flash'), 500);
	}

	removeItem() {
		if (this.hoveredItem === null) {
			return;
		}
		this.controller.eraseData(...this.path, this.hoveredItem);
	}

	editItem() {
		if (this.hoveredItem === null) {
			return;
		}
		let s = this.controller.getData(...this.path, this.hoveredItem);
		this.controller.eraseData(...this.path, this.hoveredItem);
		this.textfield.val(s);
	}

	onUpdate(data) {
		this.jsph.clear(this.list.children());

		let html = '';
		for (let i in data) {
			let s = data[i];
			html += `<li data-itemnumber="${i}">${s}<div class="propsListRemoveButton"></div></li>`;
		}
		this.list.html(html);

		this.jsph.listen(this.list.children(), {
			callbacks: {
				over: (e) => this.hoverListItem(e),
				leave: (e) => this.leaveListItem(e),
				dblclick: (e) => this.dblClickListItem(e)
			},
			hoverClass: 'hovered'
		});
	}

	hoverListItem(e) {
		let item = $(e.target);
		this.hoveredItem = item.data('itemnumber');
		this.removeButton.element.appendTo(item.children('.propsListRemoveButton'));
	}

	leaveListItem() {
		this.hoveredItem = null;
		this.removeButton.element.appendTo(this.parking);
	}

	dblClickListItem(e) {
		let item = $(e.delegateTarget);
		this.hoveredItem = item.data('itemnumber');
		this.editItem();
	}

	destroy() {
		this.jsph.clear(this.list.children());
		this.removeButton.destroy();
		this.addButton.destroy();
	}

}

/* ====================================== */

class propsSpinnerRow {

	static counter = 0;

	constructor(settings) {
		propsSpinnerRow.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path) {
			console.error("propsSpinnerRow error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		this.id = `propsSR_${propsSpinnerRow.counter}`;
		let minString = "";
		if (typeof (settings.min) === 'number') {
			this.min = settings.min;
			minString = `min="${settings.min}"`;
		} else {
			this.min = -Infinity;
		}
		let maxString = "";
		if (typeof (settings.max) === 'number') {
			this.max = settings.max;
			maxString = `max="${settings.max}"`;
		} else {
			this.max = Infinity;
		}
		if (settings.addClass) {
			this.addClass = settings.addClass;
		} else {
			this.addClass = "";
		}
		this.step = settings.step ?? 1;
		let html;
		if (settings.useGrid === true) {
			html = `<div class="propsSpinnerLabel">${settings.label}:</div>`;
			html += `<div class="propsSpinner"><input id="${this.id}" type="number" step="${this.step}" ${minString} ${maxString}><div class="propsSpinnerUnits">${settings.units ?? ''}</div></div>`;
		} else {
			html = `<div class="propsSpinnerRow ${this.addClass}">`;
			html += `<div class="editorInlineLabel">${settings.label}:</div>`;
			html += `<div class="propsSpinner"><input id="${this.id}" type="number" step="${this.step}" ${minString} ${maxString}><div class="propsSpinnerUnits">${settings.units ?? ''}</div></div>`;
			html += `</div>`;
		}
		this.section.append(html);
		this.controller = settings.controller;
		this.path = settings.path;
		this.sanitizer = null;

		this.element = $(`#${this.id}`);
		this.element.val(this.controller.getData(...this.path));
		this.element.on('input', () => this.onInput());
		this.element.on('blur', () => this.onBlur());
		this.element.on('keydown', (e) => this.onKeydown(e));
		this.controller.registerView((data) => this.onUpdate(data), ...this.path);
	}

	onKeydown(e) {
		if (e.key === 'Enter') {
			this.element.trigger('blur');
		}
	}

	onBlur() {
		let data = this.controller.getData(...this.path);
		this.onUpdate(data);
		if (this.sanitizer) {
			this.sanitizer.sanitize();
		} else {
			this.isValid(true);
		}
	}

	onUpdate(data) {
		if (!this.element.is(":focus")) {
			this.element.val(data);
		}
	}

	onInput() {
		let value = parseFloat(this.element.val().toString());
		this.isValid(!isNaN(value) && value >= this.min && value <= this.max);
		if (isNaN(value)) {
			return;
		}
		value = Math.round(value / this.step) * this.step;
		if (value < this.min) {
			value = this.min;
		} else if (value > this.max) {
			value = this.max;
		}
		this.controller.setData(value, ...this.path);
	}

	attachSanitizer(sanitizer) {
		this.sanitizer = sanitizer;
	}

	isValid(valid) {
		if (valid === true) {
			this.element.removeClass('invalid');
		} else if (valid === false) {
			this.element.addClass('invalid');
		}
		//do not change anything if neither true nor false is sent back
	}

}

/* ====================================== */

class propsCheckboxRow {

	static counter = 0;

	constructor(settings) {
		propsCheckboxRow.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path) {
			console.error("propsCheckboxRow error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		if (settings.addClass) {
			this.addClass = settings.addClass;
		} else {
			this.addClass = "";
		}
		this.id = `propsCBR_${propsCheckboxRow.counter}`;
		let html = `<div class="propsCheckboxRow">`;
		html += `<input type="checkbox" class="propsCheckbox ${this.addClass}" id="${this.id}"> <label for="${this.id}">${settings.label}</label>`;
		html += `</div>`;
		this.section.append(html);
		this.controller = settings.controller;
		this.path = settings.path;

		this.element = $(`#${this.id}`);
		this.element.prop('checked', this.controller.getData(...this.path));
		this.element.on('input', () => this.onChange());
		this.controller.registerView((data) => this.onUpdate(data), ...this.path)
	}

	onChange() {
		let value = this.element.prop('checked');
		this.controller.setData(value, ...this.path);
	}

	onUpdate(data) {
		this.element.prop('checked', data);
	}

}

/* ====================================== */

class propsSwitchRow {

	static counter = 0;

	constructor(settings) {
		propsSwitchRow.counter++;
		if ((!settings.div && (!settings.panel || !settings.section) && !settings.parent) || !settings.label || !settings.controller || !settings.path) {
			console.error("propsSwitchRow error: missing one or more mandatory settings");
			return;
		}
		if (settings.div) {
			this.section = settings.div.getElement();
		} else if (settings.parent) {
			this.section = settings.parent
		} else {
			this.panel = settings.panel;
			this.section = this.panel.getSection(settings.section);
		}
		if (settings.addClass) {
			this.addClass = settings.addClass;
		} else {
			this.addClass = "";
		}
		this.id = `propsSWR_${propsSwitchRow.counter}`;
		this.marginBottom = settings.marginBottom || 0;
		let html = `<div class="propsSwitchRow ${this.addClass}" style="margin-bottom: ${this.marginBottom}">`;
		html += `<div id="${this.id}_label" class="editorInlineLabel clickable">${settings.label}</div>`;
		html += `<div id="${this.id}_container" class="propsSwitch"></div>`;
		html += `</div>`;
		this.section.append(html);
		this.controller = settings.controller;
		this.path = settings.path;

		let options = {
			width: 60,
			height: 20,
			background: 'images/ic_ui_toggleswitch.png',
			changeCallback: (id, checked) => this.onChange(id, checked)
		};
		this.element = new jsToggleswitch($(`#${this.id}_container`), this.id, options);
		this.element.setSwitch(this.controller.getData(...this.path));
		this.label = $(`#${this.id}_label`);

		this.controller.registerView((data) => this.onUpdate(data), ...this.path);

		this.jsph = jsPointerHandler.instance;
		this.jsph.listen(this.label, {
			callbacks: {
				click: (e) => this.element.activate(e)
			}
		})

	}

	onChange(id, checked) {
		this.controller.setData(checked, ...this.path);
	}

	onUpdate(data) {
		this.element.setSwitch(data);
	}

}

/* ====================================== */

class columnSplitter {

	static counter = 0;

	constructor(settings) {
		if (!settings.parent || !settings.columns) {
			console.error("columnSplitter error: missing parent");
			return;
		}
		this.parent = settings.parent;
		this.id = `columnSplitter_${columnSplitter.counter}`;
		this.columns = settings.columns;
		this.class = settings.class ?? '';
		if (!Array.isArray(this.columns)) throw new Error("columnSplitter error: columns must be an array");
		if (this.columns.length !== 2) throw new Error("columnSplitter error: columns must have exactly two elements");
		/* establish which is the dominant column */
		if (typeof (this.columns[0]?.width?.default) !== 'undefined') {
			this.dominantColumn = 0;
			this.slaveColumn = 1;
			this.dominantGridColumn = 0;
			this.slaveGridColumn = 2;
		} else if (typeof (this.columns[1]?.width?.default) !== 'undefined') {
			this.dominantColumn = 1;
			this.slaveColumn = 0;
			this.dominantGridColumn = 2;
			this.slaveGridColumn = 0;
		} else {
			throw new Error("columnSplitter error: one of the columns must have a default width");
		}
		for (let i in this.columns) {
			let col = this.columns[i];
			if (typeof (col) !== 'object') throw new Error("columnSplitter error: constraint must be an object");
			if (typeof (col.contents) !== 'string') throw new Error("columnSplitter error: constraint.contents must be a string with HTML content");
			if (typeof (col.width) !== 'object') throw new Error("columnSplitter error: constraint.width must be an object");
			//if no min width is given, we consider it to be 0
			if (!col.width.min) col.width.min = '0';
			if (parseInt(i) === this.dominantColumn) {
				//if no max width is given for column to resize, we consider it to be 100%
				if (!col.width.max) col.width.max = '100%';
				//if no default width is given for column to resize, we consider it to be 1fr as failover
				if (!col.width.default) col.width.default = '1fr';
			} else {
				//for the other column, we always set max to 1fr
				col.width.max = '1fr';
			}
			col.id = this.id + `_col${i}`;
		}
		this.height = settings.height ?? {};
		this.jsph = jsPointerHandler.instance;
		let html = `<div class="columnSplitter ${this.class}" id="${this.id}">
			<div id="${this.columns[0].id}" class="columnSplitterColumn columnSplitter_left ${this.columns[0].class ?? ''}"></div>
			<div id="${this.id + '_handle'}" class="columnSplitterHandle"><div class="columnSplitterHandleMarker"></div></div>
			<div id="${this.columns[1].id}" class="columnSplitterColumn columnSplitter_right ${this.columns[1].class ?? ''}"></div>
		</div>`;
		this.parent.append(html);
		this.element = $(`#${this.id}`);
		this.handle = $(`#${this.id}_handle`);
		this.column0 = $(`#${this.id}_col0`);
		this.column1 = $(`#${this.id}_col1`);
		this.column0.html(this.columns[0].contents);
		this.column1.html(this.columns[1].contents);
		if (this.height.default) {
			this.element.css('height', this.height.default);
		}
		if (this.height.min) {
			this.element.css('min-height', this.height.min);
		}
		if (this.height.max) {
			this.element.css('max-height', this.height.max);
		}
		this.columnWidths = [null, '20px', null];
		this.updateWidths(this.columns[this.dominantColumn].width.default);
		this.jsph.listen(this.handle, {
			callbacks: {
				down: (e) => this.onDragStart(e),
				move: (e) => this.onDrag(e),
				up: (e) => this.onDragEnd(e),
				dblclick: (e) => this.updateWidths(this.columns[this.dominantColumn].width.default)
			}
		});
		this.dragging = false;
		$(window).on('resize', () => this.updateWidths());

		/* count elements in each column and find maximum, then set the grid-row-end of the handle accordingly */
		let rows = Math.max(this.column0.children().length, this.column1.children().length);
		this.handle.css('grid-row-end', `span ${rows}`);
	}

	onDragStart(e) {
		this.dragging = true;
		this.startX = e.clientX;
		let widths = this.getColumnWidths();
		this.startWidth = parseInt(widths[this.dominantGridColumn]);
	}

	onDrag(e) {
		if (!this.dragging) return;
		let diff = e.clientX - this.startX;
		let multiplier = this.dominantColumn === 0 ? 1 : -1;
		let newWidth = this.startWidth + multiplier * diff;
		this.updateWidths(newWidth);
	}

	onDragEnd(e) {
		this.dragging = false;
	}

	updateWidths(w) {
		if (typeof (w) === 'undefined') {
			//only used on window resize
			let currentWidths = this.getColumnWidths();
			w = currentWidths[this.dominantGridColumn];
		} else if (typeof (w) === 'number') {
			w = `${w}px`;
		}
		this.columnWidths[this.dominantGridColumn] = `clamp(${this.columns[this.dominantColumn].width.min}, ${w}, ${this.columns[this.dominantColumn].width.max})`;
		this.columnWidths[this.slaveGridColumn] = `minmax(${this.columns[this.slaveColumn].width.min}, ${this.columns[this.slaveColumn].width.max})`;
		let newWidth = this.columnWidths.join(' ');
		this.element.css('grid-template-columns', newWidth);
		let widths = this.getColumnWidths();
		let maxWidthTotal = this.element.innerWidth();
		let currentWidthTotal = parseInt(widths[0]) + parseInt(widths[1]) + parseInt(widths[2]);
		if (currentWidthTotal > maxWidthTotal) {
			/** if the total width of the columns exceeds the width of the parent, we will find the min width in pixels
				in widths[2] at this point, and we can use it to calculate an acceptable width for the left column **/
			w = maxWidthTotal - parseInt(widths[this.slaveGridColumn]) - parseInt(widths[1]) + 'px';
			this.columnWidths[this.dominantGridColumn] = `clamp(${this.columns[this.dominantColumn].width.min}, ${w}, ${this.columns[this.dominantColumn].width.max})`;
			newWidth = this.columnWidths.join(' ');
			this.element.css('grid-template-columns', newWidth);
		}
	}

	getColumnWidths() {
		return this.element.css('grid-template-columns').split(' ');
	}
}

/* ====================================== */

class Sanitizer {

	constructor(settings) {
		this.dataPaths = settings.dataPaths ?? [];
		this.callback = settings.callback;
		this.elements = settings.elements ?? [];
		this.controller = settings.controller;
		this.data = [];

		if (this.dataPaths.length === 0 || this.elements.length === 0) {
			console.error("Sanitizer error: missing one or more mandatory settings");
			return;
		}

		for (let id in this.dataPaths) {
			this.data[id] = this.controller.getData(...this.dataPaths[id]);
			this.controller.registerView((data) => this.onUpdate(id, data), ...this.dataPaths[id]);
		}

		this.sanitize();
	}

	onUpdate(id, data) {
		this.data[id] = data;
		this.sanitize();
	}

	sanitize() {
		let result = this.callback.call(this, ...this.data);
		for (let id in this.elements) {
			if (typeof (this.elements[id].isValid) !== 'function') {
				console.error("Sanitizer error: element is missing 'isValid' method");
				continue;
			}
			this.elements[id].isValid(result[id]);
		}
	}

}
