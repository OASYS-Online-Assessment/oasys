"use strict";

/**
 * let the IDE know that these variables are created dynamically in PHP
 * @var {number} pageId
 */


$(onReady);

// rixToolsSetPrefs('debugLevel', 1);
// rixToolsSetPrefs('debugMethod', 'trace');

window.interactionClasses = {};
window.interactionConfigs = {};

//gui elements
let mode = 'page';
let serverData = {group: {id: -1}}; //this will only hold the group id for the jsMediaPlugin to work correctly
let kbHandler;
let waitDialog;
let buttons = {blocks: []};
let gui = {};
let selectedLanguage;
let controller;
let jsph;
let draggingWidget = null;
let draggingBlock = null;
let draggingCoords = null;
let draggingInitialCoords = null;
let draggingGhostVisible = false;
let ghost;
let blocks;
let insertionArrow;
let blockStates = [];
let blockManifest;
let editorFactory;
let editor; //instance of currently open editor
let closeEditorAfterSaving = false;
let previewAfterSaving = false;
let reviewAfterSaving = false;
let mediaManagerAfterSaving = false;
let callbacks = {};
let externalEditorSettings = {};
let kbHandlerActive = true;
let saveInProgress = false;
let pageChangeRevision = 0;
let saveRevision = null;


function onReady() {
	rixToolsDebug(1, `onReady()`);

	if (settings.allowContextMenu === false) {
		$(document).on("contextmenu", function (e) {
			e.preventDefault();
			return false;
		});
	}

	getManifest();
}

async function getManifest() {
	rixToolsDebug(1, `async getManifest()`);
	let response = await fetch('interactions/manifest.json?seed=' + Math.random());
	blockManifest = await response.json();
	initialize();
}

function initialize() {
	rixToolsDebug(1, `initialize()`);

	jsph = jsPointerHandler.instance;
	editorFactory = new EditorFactory();
	gui.boxes = {};

	//setup in the beginning (e.g. onload or onready)
	$.ajaxSetup({
		type: "POST",
		cache: false,
		dataType: "json",
		timeout: 300000,
		url: "pagesActions.php"
	});

	//prohibit dropping files into the browser
	$('body').on('dragover', function (e) {
		e.preventDefault();
	});
	$('body').on('drop', function (e) {
		e.preventDefault();
	});

	controller = new Controller('pages');
	$(document).off('oasys:mediaRenamed.pages').on('oasys:mediaRenamed.pages', handleMediaRename);

	waitDialog = new jsModalWait(UILANG.m('please wait'));
	kbHandler = new jsKeyboardHandler();
	kbHandler.registerShortcut('CTRL+Z', undo, {
		executeOnChildren: true,
		blacklist: ['tinymce']
	});
	kbHandler.registerShortcut('CTRL+Y', redo, {
		executeOnChildren: true,
		blacklist: ['tinymce']
	});
	kbHandler.registerShortcut('CTRL+SHIFT+Z', redo, {
		executeOnChildren: true,
		blacklist: ['tinymce']
	});
	kbHandler.registerShortcut('CTRL+S', save, {
		executeOnChildren: true,
		preventDefault: true
	});
	kbHandler.registerShortcut('CTRL+P', preview, {
		executeOnChildren: true,
		preventDefault: true
	});
	kbHandler.registerShortcut('SHIFT+TAB', cycleLanguage, {
		executeOnChildren: true
	});
	kbHandler.registerShortcut('ESC', abortEditing, {
		executeOnChildren: true
	});
	kbHandler.permissionHandler(acceptKeyStrokes);

	initGUI(true);

	createMainButtons();

	gui.statusBar = new jsStatusBar('#outerUI', 'statusBar', {
		prepend: true,
		prefix: '<strong style="margin-right: 10px;">' + UILANG.m('Content:') + '</strong>',
		message: UILANG.m('editing page')
	});

	$('#UI').append("<div id='editorPane'></div>");
	gui.languageTabs = new jsTabs($("#editorPane"), "languageTabs");

	$('#editorPane').append("<div id='interactionBlocksToolbar'></div><div id='interactionBlocks'></div><div id='blockEditor'></div>");
	gui.interactionBlocksToolbar = $('#interactionBlocksToolbar');
	gui.interactionBlocks = $('#interactionBlocks');
	gui.blockEditor = $('#blockEditor').hide();
	buttons.expandAllBlocks = new nxButton(gui.interactionBlocksToolbar, 'bExpandAllBlocks', {
		label: UILANG.m('expand all'),
		callback: () => setAllBlockPreviews(true)
	});
	buttons.collapseAllBlocks = new nxButton(gui.interactionBlocksToolbar, 'bCollapseAllBlocks', {
		label: UILANG.m('collapse all'),
		callback: () => setAllBlockPreviews(false)
	});
	updateInteractionBlocksToolbar(0);
	let sections = {order: blockManifest.sections.order, labels: {}};
	for (let i in blockManifest.sections.labels) {
		sections.labels[i] = UILANG.m(blockManifest.sections.labels[i]); //*** skip langcheck ***
	}

	//left panel
	gui.lPanel = new jsSidePanel($('#UI'), 'itemFormats', {
		sections: sections,
		dock: 'left',
		width: 250,
		minWidth: 160,
		maxWidth: 600,
		title: UILANG.m('Interactions')
	});
	for (let i in blockManifest.sections.blocks) {
		let section = gui.lPanel.getSection(i);
		let html = "<div class='interactionGrid'>";
		for (let j of blockManifest.sections.blocks[i].order) {
			let lbl = blockManifest.sections.blocks[i].labels[j];
			html += `<div class='interactionWidget' data-section="${i}" data-interaction="${j}"><div class='interactionWidgetIcon'><img src='interactions/${i}/${j}/icon.svg' alt=""></div><div class="interactionWidgetLabel">${UILANG.m(lbl)}</div></div>`;
		}
		html += "</div>";
		section.append(html);
	}

	//right panel
	gui.rPanel = new jsSidePanel($('#UI'), 'properties', {
		sections: {
			order: ['page'],
			labels: {page: UILANG.m('page')}
		},
		dock: 'right',
		width: 370,
		minWidth: 270,
		maxWidth: 600,
		title: UILANG.m('Properties')
	});
	gui.pageProperties = gui.rPanel.getSection("page");

	gui.pageId = insertStaticText(gui.pageProperties, 'pageId', `<b>${UILANG.m('page id:')}</b>`);
	gui.pageName = insertStaticText(gui.pageProperties, 'pageName', `<b>${UILANG.m('page name:')}</b>`);
	gui.pageCode = insertStaticText(gui.pageProperties, 'pageCode', `<b>${UILANG.m('page code:')}</b>`);
	gui.useAsStimulus = insertToggleswitch(gui.pageProperties, 'useAsStimulus', `<b>${UILANG.m('use as stimulus:')}</b>`, {
		changeCallback: (sender, checked) => toggleStimulusRole(sender, checked),
		alignment: 'left'
	});
	gui.dlStimuli = insertDropdown(gui.pageProperties, 'pageLink', `<b>${UILANG.m('link stimulus:')}</b>`, {
		elements: [],
		noChoiceTitle: UILANG.m('no stimulus in group'),
		listTitle: '',
		dataId: 'link',
		theme: 'backend',
		onChange: onStimulusSelect,
		order: 'label',
		width: '100%'
	}, {
		twoRows: true
	});
	gui.dlStimuli.hide();
	insertSpacer(gui.pageProperties);
	gui.pageCustomCSS = insertStaticText(gui.pageProperties, 'pageCustomCSS', `<b>${UILANG.m('custom CSS:')}</b>`, {}, {twoRows: true});
	gui.cssButtonStrip = insertButtons(gui.pageProperties, 'cssButtonStrip', '', {
		'cssButton': {
			callback: () => customCSSDialog(),
			label: UILANG.m('edit CSS')
		}
	}, {noLabel: true});
	insertSpacer(gui.pageProperties);
	gui.pageComment = insertStaticText(gui.pageProperties, 'pageComment', `<b>${UILANG.m('comments:')}</b>`, {}, {twoRows: true});
	gui.buttonStrip = insertButtons(gui.pageProperties, 'buttonStrip', '', {
		'commentButton': {
			callback: () => commentsDialog(),
			label: UILANG.m('edit comments')
		}
	}, {noLabel: true});


	rixToolsDebug(1, `registering views in controller`);
	controller.registerView(gui.pageId.getPropertyField().setText, 'id');
	controller.registerView(gui.pageName.getPropertyField().setText, 'name');
	controller.registerView(gui.pageCode.getPropertyField().setText, 'itemCode');
	controller.registerView(gui.useAsStimulus.reset, 'metadata', 'useAsStimulus');
	controller.registerView(updateCustomCSSSummary, 'metadata', 'customCSS');
	controller.registerView(gui.pageComment.setText, 'metadata', 'comments');
	controller.registerView(stimulusRoleObserver, 'metadata', 'useAsStimulus');
	controller.registerView(updateStimulusLink, 'link');
	controller.registerView(updateInteractionBlocks, 'blocks');

	controller.registerView((list) => gui.languageTabs.setTabs(list), 'languages');
	let eventName = gui.languageTabs.getEventType('select');
	if (eventName) {
		$(window).on(eventName, switchLanguageClick);
	}

	// noinspection HtmlUnknownTarget
	$('body').append("<div id='dragAndDropGhost'></div><div id='insertionArrow'><img src='images/insert_arrow.svg' alt='arrow'></div>");
	ghost = $('#dragAndDropGhost').hide();
	insertionArrow = $('#insertionArrow').hide();

	jsph.listen($(".interactionWidget"), {
		callbacks: {
			down: interactionWidgetDragStart,
			move: interactionWidgetDrag,
			up: interactionWidgetDrop,
			out: interactionWidgetDrop
		}
	});

	$("#interactionBlocks").on('scroll', onScroll);

	//create hidden form for previewing and review mode
	hiddenForm('previewForm', 'post', '../index.php', '_blank', ['action', 'data']);
	hiddenForm('reviewModeForm', 'post', 'review.php', '_blank', ['pageId']);

	//get page contents
	startAjax('fetchPage', {
		id: pageId
	});

}

function createMainButtons() {
	rixToolsDebug(1, `createMainButtons()`);
	buttons.abortEditing = new jsButton2($('header'), 'bAbortEditing', {
		labels: {
			page: UILANG.m('Close page'),
			block: UILANG.m('Close editor')
		},
		icons: {
			page: '../images/toolbarIcons/ic_tb_back.png',
			block: '../images/toolbarIcons/ic_tb_back.png'
		},
		mode: 'page',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: abortEditing,
		disabled: false
	});
	buttons.save = new jsButton2($('header'), 'bSave', {
		label: UILANG.m('Save'),
		icon: '../images/toolbarIcons/ic_tb_saveButton.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: save,
		disabled: true
	});
	insertVerticalDivider('header');
	buttons.addLanguage = new jsButton2($('header'), 'bAddLanguage', {
		label: UILANG.m('Add language'),
		icon: '../images/toolbarIcons/ic_tb_addLanguage.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: addLanguage,
		disabled: false
	});
	buttons.changeLanguage = new jsButton2($('header'), 'bChangeLanguage', {
		label: UILANG.m('Change language'),
		icon: '../images/toolbarIcons/ic_tb_changeLanguage.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: changeLanguage,
		disabled: false
	});
	buttons.deleteLanguage = new jsButton2($('header'), 'bDeleteLanguage', {
		label: UILANG.m('Delete language'),
		icon: '../images/toolbarIcons/ic_tb_deleteLanguage.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: deleteLanguage,
		disabled: false
	});
	insertVerticalDivider('header');
	buttons.media = new jsButton2($('header'), 'bMedia', {
		label: UILANG.m('Media Manager'),
		icon: '../images/toolbarIcons/ic_tb_mediaManager.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: mediaManager,
		disabled: false
	});
	buttons.reviewerMode = new jsButton2($('header'), 'bReview', {
		label: UILANG.m('Review Translations'),
		icon: '../images/toolbarIcons/ic_tb_reviewerMode.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: reviewerMode,
		disabled: false
	});
	buttons.preview = new jsButton2($('header'), 'bPreview', {
		label: UILANG.m('Preview page'),
		icon: '../images/toolbarIcons/ic_tb_preview.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: preview,
		disabled: false
	});
	controller.registerOnChangeCallback(onControllerChange);
}

function save() {
	rixToolsDebug(1, `save()`);
	if (saveInProgress) {
		return;
	}
	if (controller.isChanged() || settings.debugSystem === true) {
		const pageData = encodeData();
		const data = {
			blocks: pageData.blocks,
			itemCode: pageData.pageCode ?? pageData.itemCode,
			languages: pageData.languages,
			link: pageData.link,
			metadata: pageData.metadata,
			name: pageData.name
		};
		if (Array.isArray(pageData.customCSS)) {
			data.customCSS = pageData.customCSS;
		}
		saveInProgress = true;
		saveRevision = pageChangeRevision;
		updateSaveButton(false);
		startAjax("savePage", {'id': pageId, 'pageData': data});
	}
}

function toggleStimulusRole(sender, checked) {
	rixToolsDebug(1, `toggleStimulusRole(sender, ${checked})`);
	if (checked) {
		//if box is checked, verify if this page does not also link to a stimulus itself and if so, warn the user
		let link = controller.getData('link');
		if (link !== null) {
			let dialogData = {
				buttons: [
					{label: UILANG.e('Cancel'), 'cancel': true, value: 'cancel'},
					{label: UILANG.e('OK'), 'default': true, value: 'ok'}
				],
				contents: UILANG.e("This page is already linked to a stimulus. Do you want to remove the link to the stimulus and use this page as a stimulus itself?"),
				title: UILANG.e('Stimulus conflict'),
				returnPromise: true,
				width: 400
			};
			showDialog('stimulusConflictDialog', dialogData).then(
				(res) => {
					if (res.button === 'ok') {
						controller.setData(null, 'link');
						controller.setData(checked, 'metadata', 'useAsStimulus');
					} else {
						gui.useAsStimulus.reset(false);
					}
				}
			);
		} else {
			controller.setData(checked, 'metadata', 'useAsStimulus');
		}
	} else {
		//if box is unchecked, verify if this page is linked as a stimulus to another page and if so, warn the user
		if (serverData.group.items.some(page => page['link'] === pageId)) {
			let dialogData = {
				buttons: [
					{label: UILANG.e('Cancel'), 'cancel': true, value: 'cancel'},
					{label: UILANG.e('OK'), 'default': true, value: 'ok'}
				],
				contents: UILANG.e("This page is linked as a stimulus to at least one other page. Do you want to remove any existing links? Be aware that this change cannot be undone!"),
				title: UILANG.e('Stimulus conflict'),
				returnPromise: true,
				width: 400
			};
			showDialog('stimulusConflictDialog', dialogData).then(
				(res) => {
					if (res.button === 'ok') {
						startAjax('removeLinks', {'id': pageId, 'groupId': serverData.group.id});
						controller.setData(checked, 'metadata', 'useAsStimulus');
					} else {
						gui.useAsStimulus.reset(true);
					}
				}
			);
		} else {
			controller.setData(checked, 'metadata', 'useAsStimulus');
		}
	}
}

function stimulusRoleObserver(checked) {
	rixToolsDebug(1, `stimulusRoleObserver(${checked ? 'true' : 'false'})`);
	if (checked) {
		gui.dlStimuli.hide();
	} else {
		gui.dlStimuli.show();
	}
}

function addLanguage() {
	rixToolsDebug(1, `addLanguage()`);
	let usedLanguages = controller.getData('languages');
	const dlLanguages = [];
	for (let i in window.languages) {
		if (usedLanguages.indexOf(i) === -1) {
			dlLanguages.push({
				label: window.languages[i],
				value: i
			});
		}
	}
	if (dlLanguages.length === 0) {
		showMessage(UILANG.m('all_lang_created'));
		return;
	}
	const dialogData = {
		buttons: [{
			label: UILANG.m('cancel'),
			'cancel': true,
			value: 'cancel'
		},
			{
				label: UILANG.m('Add language'),
				'default': true,
				value: 'add'
			}
		],
		datafields: ['newLang'],
		fieldTypes: {
			newLang: 'dropList'
		},
		fieldOptions: {
			newLang: {
				listTitle: UILANG.m('Choose language'),
				elements: dlLanguages,
				dataId: 'language',
				theme: 'backend',
				order: 'label'
			}
		},
		mandatory: ['newLang'],
		contents: '<div class="tmDialogForm">' +
			'<div class="tmDialogFormField"><label>' + UILANG.m('Language') + '</label><div>[@newLang]</div></div>' +
		'</div>',
		title: UILANG.m('Add new language'),
		width: 400,
		returnPromise: true,
		dataFormat: 'object'
	};

	showDialog('addLanguageDialog', dialogData).then(
		(res) => {
			if (res.button === 'add') {
				let languages = controller.getData('languages');
				languages.push(res.data.newLang);
				controller.disableUndo();
				controller.setData(languages, 'languages');
				let blocks = controller.getData('blocks');
				for (let block of blocks) {
					let editorClass = editorFactory.getEditorClass(block.type);
					if (editorClass !== null) {
						editorClass.addLanguageData(block, res.data.newLang);
					}
				}
				controller.setData(blocks, 'blocks');
				controller.enableUndo();
			}
		}
	);
}

//redefine a language as another, resp. swap contents of two languages if the user entered them the wrong way
function changeLanguage() {
	rixToolsDebug(1, `changeLanguage()`);
	const dlLanguages = [];
	for (let i in window.languages) {
		if (i !== selectedLanguage) {
			dlLanguages.push({
				label: window.languages[i],
				value: i
			});
		}
	}
	let dialogData = {
		buttons: [
			{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			},
			{
				label: UILANG.m('change language'),
				'default': true,
				value: 'change'
			}
		],
		datafields: ['newLang'],
		fieldTypes: {
			newLang: 'dropList'
		},
		fieldOptions: {
			newLang: {
				listTitle: UILANG.m('choose language'),
				elements: dlLanguages,
				dataId: 'language',
				theme: 'backend',
				order: 'label'
			}
		},
		mandatory: ['newLang'],
		contents: '<div class="tmDialogForm">' +
			'<div class="tmDialogFormField"><label>' + UILANG.m('Language') + '</label><div>[@newLang]</div></div>' +
		'</div>',
		title: UILANG.m('Change language'),
		width: 400,
		returnPromise: true,
		dataFormat: 'object'
	};

	showDialog('changeLanguageDialog', dialogData).then(
		(res) => {
			if (res.button === 'change') {
				let newLang = res.data.newLang;
				let languages = controller.getData('languages');
				if (languages.includes(newLang)) {
					/* if the target language already exists in this page, we warn the user and suggest exchanging the
						contents of both languages */
					dialogData = {
						buttons: [
							{
								label: UILANG.m('cancel'),
								'cancel': true,
								value: 'cancel'
							},
							{
								label: UILANG.m('swap contents'),
								'default': true,
								value: 'swap'
							}
						],
						contents: '<p>' + UILANG.m('The chosen language already exists in this page. Would you like to swap the contents of both languages?'),
						title: UILANG.m('Swap contents'),
						width: 400,
						returnPromise: true,
						dataFormat: 'object'
					};
					showDialog('changeLanguageDialog', dialogData).then(
						(res) => {
							if (res.button === 'swap') {
								let blocks = controller.getData('blocks');
								for (let block of blocks) {
									let editorClass = editorFactory.getEditorClass(block.type);
									if (editorClass !== null) {
										editorClass.moveLanguageData(block, selectedLanguage, newLang);
									}
								}
								controller.setData(blocks, 'blocks');
								switchLanguage(newLang);
							}
						}
					);
				} else {
					// if target language is unused so far we just copy data to new keys and delete old language keys
					let blocks = controller.getData('blocks');
					for (let block of blocks) {
						let editorClass = editorFactory.getEditorClass(block.type);
						if (editorClass !== null) {
							editorClass.moveLanguageData(block, selectedLanguage, newLang);
						}
					}
					controller.disableUndo();
					controller.pauseUpdates();
					controller.setData(blocks, 'blocks');
					controller.resumeUpdates();
					languages.splice(languages.indexOf(selectedLanguage), 1, newLang);
					controller.setData(languages, 'languages');
					controller.enableUndo();
					switchLanguage(newLang);
				}
			}
		}
	);


}

function deleteLanguage() {
	rixToolsDebug(1, `deleteLanguage()`);
	let usedLanguages = controller.getData('languages');
	if (usedLanguages.length < 2) {
		showMessage(UILANG.m("Language cannot be deleted. Every page requires to have at least one language."));
		return;
	}
	const html = sf("<p>" + UILANG.m('del_lang_part') + "</p>", window.languages[selectedLanguage]);
	const dialogData = {
		buttons: [
			{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			},
			{
				label: UILANG.m('Delete language'),
				'default': true,
				value: 'remove'
			}
		],
		contents: html,
		title: UILANG.m('Delete language'),
		width: 400,
		returnPromise: true,
		dataFormat: 'object'
	};

	showDialog('removeLanguageDialog', dialogData).then(
		(res) => {
			if (res.button === 'remove') {
				let languages = controller.getData('languages');
				let langToDelete = selectedLanguage;
				languages.splice(languages.indexOf(langToDelete), 1);
				controller.disableUndo();
				controller.setData(languages, 'languages');
				let blocks = controller.getData('blocks');
				for (let block of blocks) {
					let editorClass = editorFactory.getEditorClass(block.type);
					if (editorClass !== null) {
						editorClass.removeLanguageData(block, langToDelete);
					}
				}
				controller.setData(blocks, 'blocks');
				controller.enableUndo();
			}
		}
	);
}

/*  If a language was supported in the platform before, but no longer is now, then pages created previously might
	contain a language that's no longer valid. This function deletes invalid language data. */
function sanitizeLanguages() {
	rixToolsDebug(1, `sanitizeLanguages()`);
	let usedLanguages = controller.getData('languages');
	for (let lang of usedLanguages) {
		if (!(lang in window.languages)) {
			if (usedLanguages.length < 2) {
				let newLang = getKey(window.languages, 0);
				let blocks = controller.getData('blocks');
				for (let block of blocks) {
					let editorClass = editorFactory.getEditorClass(block.type);
					if (editorClass !== null) {
						editorClass.moveLanguageData(block, lang, newLang);
					}
				}
				controller.disableUndo();
				controller.setData(blocks, 'blocks');
				usedLanguages.splice(usedLanguages.indexOf(lang), 1, newLang);
				controller.setData(usedLanguages, 'languages');
				controller.enableUndo();
				switchLanguage(newLang);
			} else {
				usedLanguages.splice(usedLanguages.indexOf(lang), 1);
				controller.disableUndo();
				controller.setData(usedLanguages, 'languages');
				let blocks = controller.getData('blocks');
				for (let block of blocks) {
					let editorClass = editorFactory.getEditorClass(block.type);
					if (editorClass !== null) {
						editorClass.removeLanguageData(block, lang);
					}
				}
				controller.setData(blocks, 'blocks');
				controller.enableUndo();
			}
		}
	}
}

function cycleLanguage() {
	rixToolsDebug(1, `cycleLanguage()`);
	let langCodes = controller.getData('languages');
	if (langCodes.length === 1) {
		return;
	}
	let offset = langCodes.indexOf(selectedLanguage);
	if (offset === langCodes.length - 1) {
		offset = 0;
	} else {
		offset++;
	}
	switchLanguage(langCodes[offset]);
}

function switchLanguageClick(e) {
	rixToolsDebug(1, `switchLanguageClick(e)`);
	switchLanguage(e.detail);
}

function switchLanguage(lang) {
	rixToolsDebug(1, `switchLanguage("${lang}")`);
	selectedLanguage = lang;
	gui.languageTabs.select(selectedLanguage);
	if (mode === 'block') {
		editor.switchLanguage(selectedLanguage);
	}
	updateInteractionPreviews();
}

function getLanguage() {
	rixToolsDebug(1, `getLanguage()`);
	return selectedLanguage;
}

function abortEditing() {
	rixToolsDebug(1, `abortEditing()`);
	switch (mode) {
		case 'page':
			if ('closePageEditor' in window.parent) {
				if (controller.isChanged()) {
					unsavedChangesWarning();
				} else {
					window.parent.closePageEditor();
				}
			}
			break;
		case 'block':
			abortEditingBlock();
			break;
	}
}

function unsavedChangesWarning() {
	rixToolsDebug(1, `unsavedChangesWarning()`);
	let dialogData = {
		buttons: [
			{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
			{label: UILANG.m('Discard'), value: 'discard'},
			{label: UILANG.m('Save'), 'default': true, value: 'save'}
		],
		contents: UILANG.m("There are unsaved changes! Do you want to save or discard the changes before closing the editor?"),
		title: UILANG.m('Unsaved changes'),
		returnPromise: true,
		width: 400
	};
	showDialog('unsavedChangesDialog', dialogData).then(
		(res) => {
			switch (res.button) {
				case 'save':
					save();
					closeEditorAfterSaving = true;
					break;
				case 'discard':
					window.parent.closePageEditor();
					break;
			}
		}
	);

}

function toggleBlockPreview(data, event) {
	rixToolsDebug(1, `toggleBlockPreview(data)`);
	if (event?.shiftKey) {
		setAllBlockPreviews(data.visible, data.block);
		return;
	}
	blockStates[data.block] = data.visible;
	if (data.visible) {
		$(`.interactionBlock[data-position="${data.block}"]`).addClass("expanded");
	} else {
		$(`.interactionBlock[data-position="${data.block}"]`).removeClass("expanded");
	}
}

function setAllBlockPreviews(visible, sourceBlock = null) {
	rixToolsDebug(1, `setAllBlockPreviews(${visible ? 'true' : 'false'})`);
	for (let i = 0; i < blockStates.length; i++) {
		blockStates[i] = visible;
		$(`.interactionBlock[data-position="${i}"]`).toggleClass('expanded', visible);
		if (String(i) !== String(sourceBlock)) {
			buttons.blocks[i]?.expandButton?.setState(!visible);
		}
	}
}

function updateInteractionBlocksToolbar(blockCount = blockStates.length) {
	let visible = mode === 'page' && blockCount > 1;
	gui.interactionBlocksToolbar.toggleClass('visible', visible);
	gui.interactionBlocks.toggleClass('hasBlocksToolbar', visible);
}

function editBlock(id) {
	rixToolsDebug(1, `editBlock(${id})`);
	if (mode === 'block') {
		/*failsafe to prevent entering into edit mode while already there; mainly used while debugging */
		return;
	}
	if (selectedLanguage === null) {
		showMessage(UILANG.m("Error: no language selected!"));
		return;
	}
	if (!controller.dataIsSet('blocks', id)) {
		/* this should normally only trigger while debugging */
		return;
	}
	mode = 'block';
	controller.disableUndo();
	buttons.abortEditing.switchMode(mode);
	gui.blockEditor.show();
	updateInteractionBlocksToolbar();
	gui.interactionBlocks.hide();
	gui.lPanel.hide();
	gui.rPanel.disableSection("page");
	let type = controller.getData('blocks', id, 'type');
	editor = editorFactory.createEditor(type, id);
	if (!editor) {
		alert("Unable to create editor for type: " + type);
		abortEditingBlock();
		return;
	}
	editor.linkMasterController(controller, 'blocks', id);
	editor.createInterface(gui.blockEditor, gui.rPanel);
	callbacks.editor_setData = (data) => editor.setData(data);
	controller.registerView(callbacks.editor_setData, 'blocks', id);
	gui.statusBar.setStatus(UILANG.m("editing interaction"));
	buttons.addLanguage.disable();
	buttons.changeLanguage.disable();
	buttons.deleteLanguage.disable();
}

function abortEditingBlock() {
	rixToolsDebug(1, `abortEditingBlock()`);
	if (mode === 'page') {
		/* failsafe to prevent exiting from edit mode while not there; mainly used while debugging */
		return;
	}
	controller.unregisterView(callbacks.editor_setData);
	mode = 'page';
	buttons.abortEditing.switchMode(mode);
	if (editor) {
		editor.destroy();
	}
	editor = null;
	gui.blockEditor.hide();
	updateInteractionBlocksToolbar();
	gui.interactionBlocks.show();
	gui.lPanel.show();
	gui.rPanel.enableSection("page");
	controller.enableUndo();
	updateInteractionPreviews();
	gui.statusBar.setStatus("editing page");
	buttons.addLanguage.enable();
	buttons.changeLanguage.enable();
	buttons.deleteLanguage.enable();
	/* destroy block editor so as to make sure any video or audio players which might still be playing are gone */
	gui.blockEditor.html("");
}

function mediaManager() {
	if (controller.isChanged()) {
		let dialogData = {
			buttons: [
				{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
				{label: UILANG.m('Save'), 'default': true, value: 'save'}
			],
			contents: UILANG.m('There are unsaved changes. In order to open the media manager you need to save the changes first!'),
			title: UILANG.m('Unsaved changes'),
			returnPromise: true,
			width: 400
		};
		showDialog('unsavedChangesDialog', dialogData).then((res) => {
			if (res.button !== 'save') return;
			mediaManagerAfterSaving = true;
			save();
		});
		return;
	}
	openMediaManager();
}

function openMediaManager() {
	new jsMediaPlugin('oasysImagePlugin', {
		mediaTypes: 'all',
		hideOptions: true,
		globalManager: true
	});
}

function preview() {
	rixToolsDebug(1, `preview()`);
	if (controller.isChanged()) {
		let dialogData = {
			buttons: [
				{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
				{label: UILANG.m('Save'), 'default': true, value: 'save'}
			],
			contents: UILANG.m("There are unsaved changes. In order to preview a page you need to save the changes first!"),
			title: UILANG.m('Unsaved changes'),
			returnPromise: true,
			width: 400
		};
		showDialog('unsavedChangesDialog', dialogData).then(
			(res) => {
				if (res.button === 'save') {
					save();
					previewAfterSaving = true;
				}
			}
		);
	} else {
		const pForm = document.forms['previewForm'];
		pForm.action.value = 'preview';

		let data;
		data = {
			previewMode: 'item',
			itemId: controller.getData('id'),
			language: settings.interfaceLanguage
		};
		pForm.data.value = JSON.stringify(data);
		pForm.submit();
	}
}

function reviewerMode() {
	rixToolsDebug(1, `reviewerMode()`);
	if (controller.isChanged()) {
		let dialogData = {
			buttons: [
				{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
				{label: UILANG.m('Save'), 'default': true, value: 'save'}
			],
			contents: UILANG.m("There are unsaved changes. In order to preview a page you need to save the changes first!"),
			title: UILANG.m('Unsaved changes'),
			returnPromise: true,
			width: 400
		};
		showDialog('unsavedChangesDialog', dialogData).then(
			(res) => {
				if (res.button === 'save') {
					save();
					reviewAfterSaving = true;
				}
			}
		);
	} else {
		const pForm = document.forms['reviewModeForm'];
		pForm.pageId.value = controller.getData('id');
		pForm.submit();
	}
}

/***** creating interactions *****/

/* dragging a widget from sidebar in order to create a new interaction block */
function interactionWidgetDragStart(e) {
	rixToolsDebug(1, `interactionWidgetDragStart(e)`);
	let target = $(e.delegateTarget);
	draggingWidget = target.data('interaction');
	let icon = target.find('.interactionWidgetIcon');
	let w = icon.outerWidth();
	let h = icon.outerHeight();
	let html = icon.html();
	ghost.addClass('interactionGhost');
	ghost.html(html);
	let x = e.clientX;
	let y = e.clientY;
	draggingCoords = {clientX: x, clientY: y};
	ghost.css({width: w, height: h, left: x, top: y, "margin-top": -h / 2, "margin-left": -w / 2}).show();
	let interactions = gui.interactionBlocks.children(".interactionBlock");
	blocks = [];
	interactions.each(function (idx, el) {
		blocks[idx] = {top: $(el).offset().top, bottom: $(el).offset().top + $(el).outerHeight()};
	});
	let blocksContainerWidth = $("#interactionBlocks").width();
	insertionArrow.css('width', blocksContainerWidth);
	insertionArrow.css('left', gui.interactionBlocks.offset().left);


}

function interactionWidgetDrag(e) {
	rixToolsDebug(2, `interactionWidgetDrag(e)`);
	let target = $(e.target);
	let x = e.clientX;
	let y = e.clientY;
	draggingCoords = {clientX: x, clientY: y};
	ghost.css({left: x, top: y});
	if (target.is(gui.interactionBlocks) || target.parents("#interactionBlocks").length === 1) {
		let pos = determineInsertPosition(y);
		let blocksContainerWidth = $("#interactionBlocks").width();
		insertionArrow.css('width', blocksContainerWidth);
		insertionArrow.show();

		insertionArrow.css('top', pos - 10);
	} else {
		insertionArrow.hide();
	}
}

function interactionWidgetDrop(e) {
	rixToolsDebug(1, `interactionWidgetDrop(e)`);
	let y = e.clientY;
	let target = $(e.target);
	if (target.is(gui.interactionBlocks) || target.parents("#interactionBlocks").length === 1) {
		let pos = determineBlockPosition(y);
		addInteractionBlock(pos, draggingWidget);
	}
	blocks = [];
	draggingWidget = null;
	draggingCoords = null;
	ghost.hide();
	ghost.html("");
	insertionArrow.hide();
}

/* dragging an already existing block for reordering purposes */
function interactionBlockDragStart(e) {
	rixToolsDebug(1, `interactionBlockDragStart(e)`);
	let target = $(e.delegateTarget);
	draggingBlock = target.data('position');
	let html = target.find('.interactionBlockHeader').html();
	let width = target.find('.interactionBlockHeader').width() - 100;
	target.addClass('dragging');
	ghost.addClass('ghostBlockHeader');
	ghost.html(html);
	let x = e.clientX;
	let y = e.clientY;
	draggingInitialCoords = {x: x, y: y};
	draggingCoords = {clientX: x, clientY: y};
	ghost.css({left: x, top: y, width: width, height: '40px'});
	let interactions = gui.interactionBlocks.children(".interactionBlock");
	blocks = [];
	interactions.each(function (idx, el) {
		blocks[idx] = {top: $(el).offset().top, bottom: $(el).offset().top + $(el).outerHeight()};
	});
	let blocksContainerWidth = $("#interactionBlocks").width();
	insertionArrow.css('left', gui.interactionBlocks.offset().left);
	insertionArrow.css('width', blocksContainerWidth);
}

function interactionBlockDrag(e) {
	rixToolsDebug(1, `interactionBlockDrag(e)`);
	let target = $(e.target);
	let x = e.clientX;
	let y = e.clientY;
	draggingCoords = {clientX: x, clientY: y};
	ghost.css({left: x, top: y});
	if (!draggingGhostVisible) {
		if (Math.abs(draggingInitialCoords.x - x) > 5 || Math.abs(draggingInitialCoords.y - y) > 5) {
			draggingGhostVisible = true;
			ghost.show();
		}
	}
	let blocksContainerWidth = $("#interactionBlocks").width();
	if (target.is(gui.interactionBlocks) || target.parents("#interactionBlocks").length === 1) {
		let targetPos = determineBlockPosition(y);
		if (targetPos === draggingBlock || targetPos === draggingBlock + 1) {
			insertionArrow.hide();
		} else {
			let targetY = getCoordinateForBlockPosition(targetPos);
			insertionArrow.show();
			insertionArrow.css('top', targetY - 10);
			insertionArrow.css('width', blocksContainerWidth);

		}
	} else {
		insertionArrow.hide();
	}
}

function interactionBlockDrop(e) {
	rixToolsDebug(1, `interactionBlockDrop(e)`);
	let y = e.clientY;
	let target = $(e.target);
	if (target.is(gui.interactionBlocks) || target.parents("#interactionBlocks").length === 1) {
		let targetPos = determineBlockPosition(y);
		if (targetPos !== draggingBlock && targetPos !== draggingBlock + 1) {
			let pos = determineBlockPosition(y);
			reorderInteractionBlock(pos, draggingBlock);
		}
	}
	blocks = [];
	draggingBlock = null;
	draggingCoords = null;
	draggingInitialCoords = null;
	draggingGhostVisible = false;
	ghost.removeClass('interactionHeaderGhost');
	ghost.hide();
	ghost.html("");
	insertionArrow.hide();
	$(".interactionBlock").removeClass('dragging');
}

function onScroll() {
	rixToolsDebug(1, `onScroll()`);
	if (draggingBlock !== null) {
		let interactions = gui.interactionBlocks.children(".interactionBlock");
		interactions.each(function (idx, el) {
			blocks[idx] = {top: $(el).offset().top, bottom: $(el).offset().top + $(el).outerHeight()};
		});
		//get new element over which house hovers
		draggingCoords.target = document.elementFromPoint(draggingCoords.clientX, draggingCoords.clientY);
		interactionBlockDrag(draggingCoords);
	} else if (draggingWidget !== null) {
		let interactions = gui.interactionBlocks.children(".interactionBlock");
		interactions.each(function (idx, el) {
			blocks[idx] = {top: $(el).offset().top, bottom: $(el).offset().top + $(el).outerHeight()};
		});
		//get new element over which house hovers
		draggingCoords.target = document.elementFromPoint(draggingCoords.clientX, draggingCoords.clientY);
		interactionWidgetDrag(draggingCoords);
	}
}

function determineInsertPosition(y) {
	rixToolsDebug(2, `determineInsertPosition(${y})`);
	let pos = determineBlockPosition(y);
	return getCoordinateForBlockPosition(pos);
}

function getCoordinateForBlockPosition(pos) {
	rixToolsDebug(2, `getCoordinateForBlockPosition(${pos})`);
	if (typeof (blocks[pos]) === 'undefined') {
		if (pos === 0) {
			return $("#interactionBlocks").offset().top + 30;
		} else {
			return blocks[pos - 1].bottom + 10;
		}
	} else {
		return blocks[pos].top;
	}
}

function determineBlockPosition(y) {
	rixToolsDebug(2, `determineBlockPosition(${y})`);
	let pos = 0;
	for (let i = 0; i < blocks.length; i++) {
		if (blocks[i].top < y) {
			if (blocks[i].bottom > y) {
				if (y - blocks[i].top > blocks[i].bottom - y) {
					pos = i + 1;
				} else {
					pos = i;
				}
			} else {
				pos = i + 1;
			}
		} else {
			break;
		}
	}
	return pos;
}

function addInteractionBlock(pos, type) {
	rixToolsDebug(1, `addInteractionBlock(${pos}. "${type}")`);
	let blocks = controller.getData('blocks');
	blocks.splice(pos, 0, {type: type});
	blockStates.splice(pos, 0, true);
	let editorClass = editorFactory.getEditorClass(type);
	if (editorClass !== null) {
		blocks[pos] = editorClass.initData(blocks[pos]);
	}
	controller.setData(blocks, 'blocks');
}

function removeInteractionBlock(pos) {
	rixToolsDebug(1, `removeInteractionBlock(${pos})`);
	let dialogData = {
		buttons: [
			{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
			{label: UILANG.m('OK'), 'default': true, value: 'ok'}
		],
		contents: '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m("Are you sure you want to delete the interaction?") + '</p></div></div>',
		icon: "../images/warning.png",
		iconWidth: 64,
		title: UILANG.m('Delete interaction'),
		returnPromise: true,
		width: 400
	};
	showDialog('removeBlockDialog', dialogData).then(
		(res) => {
			if (res.button === 'ok') {
				let blocks = controller.getData('blocks');
				blocks.splice(pos, 1);
				blockStates.splice(pos, 1);
				controller.setData(blocks, 'blocks');
			}
		}
	);
}

function reorderInteractionBlock(pos, blockId) {
	rixToolsDebug(1, `reorderInteractionBlock(${pos}, "${blockId}")`);
	let blocks = controller.getData('blocks');

	//if the block we remove precedes the target position we have to decrement the target position
	if (pos > blockId) {
		pos--;
	}

	let block = blocks[blockId];
	blocks.splice(blockId, 1);
	blocks.splice(pos, 0, block);

	//let's do the same with block preview states:
	let state = blockStates[blockId];
	blockStates.splice(blockId, 1);
	blockStates.splice(pos, 0, state);

	controller.setData(blocks, 'blocks');
}

/***** external editor support *****/

function openExternalEditor(editorSettings) {
	rixToolsDebug(1, `openExternalEditor(editorSettings)`);
	externalEditorSettings = editorSettings;
	let frame = $('#externalEditor');
	frame.removeClass('hidden');
	frame.attr('src', editorSettings.url);
	frame.on('load', function (e) {
		if (e.target.src !== '') {
			frame.off('load');
			if (typeof (frame.get(0).contentWindow.OASYSCOM) !== 'undefined') {
				/* Firefox applies the back button to the contents of the iFrame, causing it to become empty while still
				*  overlaying the OASYS editor and swallowing all pointer events. Therefore we are listening here to
				*  the pagehide event (unload works too, but is deprecated) to enable OASYS to hide the iFrame if the
				*  user chooses to click "back" while the external editor is open. */
				$(frame.get(0).contentWindow).on('pagehide', function () {
					setTimeout(closeExternalEditor, 250);
				});
			}
		}
	});
}

function getExternalContext() {
	rixToolsDebug(1, `getExternalContext()`);
	return 'editor';
}

function getExternalLanguage() {
	rixToolsDebug(1, `getExternalLanguage()`);
	return settings.interfaceLanguage ?? "EN";
}

function getExternalData() {
	rixToolsDebug(1, `getExternalData()`);
	return externalEditorSettings.data ?? null;
}

function getExternalQuestion() {
	rixToolsDebug(1, `getExternalQuestion()`);
	return externalEditorSettings.question ?? '';
}

function setExternalData(data) {
	rixToolsDebug(1, `setExternalData(data)`);
	if (typeof (externalEditorSettings.updateCallback) === "function") {
		externalEditorSettings.updateCallback.call(this, data);
	}
}

function closeExternalEditor() {
	rixToolsDebug(1, `closeExternalEditor()`);
	let frame = $('#externalEditor');
	$(frame.get(0).contentWindow).off('pagehide');
	frame.removeAttr('src');
	frame.addClass('hidden');

	externalEditorSettings = {};
}

/***** view updaters *****/

function onControllerChange(flag) {
	if (flag) {
		pageChangeRevision++;
	}
	updateSaveButton(flag);
}

function updateSaveButton(flag) {
	rixToolsDebug(1, `updateSaveButton(${flag ? 'true' : 'false'})`);
	if (flag && !saveInProgress) {
		buttons.save.enable();
	} else {
		buttons.save.disable();
	}
}

function updateStimulusList(data) {
	rixToolsDebug(1, `updateStimulusList(data)`);
	let elements;
	if (data.length > 0) {
		elements = [{label: '', value: null}];
		for (let row of data) {
			let lbl = row['name'];
			if (row['itemCode']) {
				lbl += ` [${row['itemCode']}]`;
			}
			elements.push({value: row['id'], label: lbl});
		}
		gui.dlStimuli.getPropertyField().unlock();
	} else {
		//if no stimuli are defined, we don't need an element with a null value, otherwise the
		//dropdown list will show an empty line instead of the noChoiceTitle
		elements = [];
		gui.dlStimuli.getPropertyField().lock();
	}
	gui.dlStimuli.getPropertyField().setElements(elements);
}

function updateStimulusLink(link) {
	rixToolsDebug(1, `updateStimulusLink(link)`);
	gui.dlStimuli.getPropertyField().reset(link);
}

function updateInteractionBlocks(blocks) {
	rixToolsDebug(1, `updateInteractionBlocks(blocks)`);
	updateInteractionBlocksToolbar(blocks.length);
	if (blockStates.length !== blocks.length) {
		//if block states are not up-to-date, expand all blocks by default -> happens on loading new page
		blockStates = [];
		for (let i in blocks) {
			blockStates[i] = true;
		}
	}
	jsph.clear($("div.interactionBlock"));
	for (let i in buttons.blocks) {
		for (let j in buttons.blocks[i]) {
			buttons.blocks[i][j].destroy();
			delete buttons.blocks[i][j];
		}
		delete buttons.blocks[i];
	}
	let view = gui.interactionBlocks.html("");
	for (let i in blocks) {
		buttons['blocks'][i] = {};
		let iconPath = 'interactions/' + blockManifest.paths[blocks[i].type] + '/' + blocks[i].type + '/block_icon.svg';
		let html = `<div id="block_${i}" data-position="${i}" class="interactionBlock"><div class="interactionBlockHeader"><div class="interactionBlockIcon"><img alt="${blocks[i].type}_icon" src="${iconPath}"></div><div id="block_${i}_title" class="interactionBlockTitle">${UILANG.m(blockManifest.sections.blocks[blockManifest.paths[blocks[i].type]].labels[blocks[i].type])} </div><div id="block_${i}_buttons" class="interactionBlockButtons"><div class="interactionBlockPreviewButton"></div><div class="interactionBlockEditButton"></div><div class="interactionBlockDuplicateButton"></div><div class="interactionBlockRemoveButton"></div></div></div><div id="block_${i}_preview" class="interactionBlockPreview"></div></div>`; //*** skip langcheck ***
		view.append(html);
		let buttonData = {
			iconHeight: 24,
			callback: (visible, event) => toggleBlockPreview({block: i, visible: visible}, event),
			passEvent: true,
			states: [{
				icon: svgIcons.eyeDown,
				value: true
			}, {
				icon: svgIcons.eyeUp,
				value: false
			}],
			state: blockStates[i] === true ? false : true,
			toggle: true
		};
		buttons['blocks'][i]['expandButton'] = new nxButton($(`#block_${i}_buttons > .interactionBlockPreviewButton`), `block_${i}_expandButton`, buttonData);
		buttons['blocks'][i]['expandButton'].element.attr('title', `Shift: ${UILANG.m('expand all')} / ${UILANG.m('collapse all')}`);
		if (blockStates[i] === true) {
			$(`#block_${i}`).addClass('expanded');
		}
		buttonData = {
			iconHeight: 24,
			callback: removeInteractionBlock,
			icon: svgIcons.removeBlock,
			value: i
		};
		buttons['blocks'][i]['removeButton'] = new nxButton($(`#block_${i}_buttons > .interactionBlockRemoveButton`), `block_${i}_removeButton`, buttonData);
		buttonData = {
			iconHeight: 24,
			callback: duplicateInteraction,
			icon: svgIcons.duplicateBlock,
			value: i
		};
		buttons['blocks'][i]['duplicateButton'] = new nxButton($(`#block_${i}_buttons > .interactionBlockDuplicateButton`), `block_${i}_duplicateButton`, buttonData);
		buttonData = {
			iconHeight: 24,
			callback: editBlock,
			icon: svgIcons.editBlock,
			value: i
		};
		buttons['blocks'][i]['editButton'] = new nxButton($(`#block_${i}_buttons > .interactionBlockEditButton`), `block_${i}_editButton`, buttonData);
	}
	updateInteractionPreviews();
	jsph.listen($("div.interactionBlock"), {
		callbacks: {
			down: interactionBlockDragStart,
			move: interactionBlockDrag,
			up: interactionBlockDrop,
			out: interactionBlockDrop,
			dblclick: (e) => {
				editBlock($(e.delegateTarget).data('position'));
			}
		}
	});
}

function duplicateInteraction(blockNum) {
	rixToolsDebug(1, `duplicateInteraction(${blockNum})`);
	let blocks = controller.getData('blocks');
	let blockData = deepCopy(blocks[blockNum]);
	let insertPosition = Number(blockNum) + 1;
	blockData.id = '';
	blocks.splice(insertPosition, 0, blockData);
	blockStates.splice(insertPosition, 0, true);
	controller.setData(blocks, 'blocks');
}

function updateInteractionPreviews() {
	rixToolsDebug(1, `updateInteractionPreviews()`);
	let blocks = controller.getData('blocks');
	for (let i in blocks) {
		let editorClass = editorFactory.getEditorClass(blocks[i].type);
		if (editorClass !== null) {
			let maxWidth = $(`#block_${i}_preview`).width();
			let previewHTML = editorClass.generatePreview(blocks[i], selectedLanguage, {maxWidth: maxWidth});
			$(`#block_${i}_preview`).html(previewHTML);
			let previewTitle = editorClass.getTitle(blocks[i], selectedLanguage);
			//remove all tags from title except for b,i,u,em,strong and img
			previewTitle = previewTitle?.replace(/<(?!\/?(b|i|u|em|strong|img)).*?>/g, '');
			$(`#block_${i}_title`).html(previewTitle);
		}
	}
	if (typeof (MathJax) !== 'undefined' && typeof (MathJax.typeset) === 'function') {
		MathJax.typeset();
	}
}

function handleMediaRename(event, media) {
	if (!media || Number(media.groupId) !== Number(serverData.group.id)) return;
	let pageBlocks = controller.getData('blocks');
	if (!Array.isArray(pageBlocks)) return;
	let changed = false;
	for (const block of pageBlocks) {
		if (!block || !['image', 'audio', 'video'].includes(block.type) || !block.fileid || typeof block.fileid !== 'object') continue;
		if (!block.filename || typeof block.filename !== 'object') block.filename = {};
		for (const [language, fileId] of Object.entries(block.fileid)) {
			if (String(fileId) !== String(media.id) || block.filename[language] === media.name) continue;
			block.filename[language] = media.name;
			changed = true;
		}
	}
	if (!changed) return;
	controller.setData(pageBlocks, 'blocks');
	updateInteractionPreviews();
}

function commentsDialog() {
	let dialogData = {
		buttons: [
			{label: 'Cancel', 'cancel': true, value: 'cancel'},
			{label: 'OK', 'default': true, value: 'ok'}
		],
		datafields: [
			'taComments'
		],
		focus: 'taComments',
		values: {
			taComments: controller.getData('metadata', 'comments')
		},
		dataFormat: 'object',
		contents: '<textarea type="text" id="taComments" style="width: 100%; margin-top: 10px; height: 300px; resize: none"></textarea>',
		title: UILANG.m('Page comments'),
		returnPromise: true,
		width: 600
	};

	showDialog('commentsDialog', dialogData).then(
		(res) => {
			if (res.button === 'ok') {
				controller.setData(res.data.taComments, 'metadata', 'comments');
			}
		}
	);
}

function updateCustomCSSSummary(cssRules) {
	const ruleCount = Array.isArray(cssRules) ? cssRules.length : 0;
	let summary = UILANG.m('No page-specific CSS');
	if (ruleCount === 1) {
		summary = UILANG.m('1 CSS rule defined');
	} else if (ruleCount > 1) {
		summary = sf(UILANG.m('%@ CSS rules defined'), ruleCount);
	}
	gui.pageCustomCSS.setText(summary);
}

function customCSSDialog(cssText = null) {
	if (cssText === null) {
		cssText = serializeCustomCSS(controller.getData('metadata', 'customCSS'));
	}
	const escapedCSS = $('<div>').text(cssText).html();
	const scopeGuidance = UILANG.m(
		'Use ${page} as the general page-content scope. Use ${stimulus} for stimulus pages or ${question} for question pages when the styles need to differ. Limit selectors to descendants of these containers so page CSS does not affect the surrounding skin.',
		{
			page: '<code>.oasys-page-content</code>',
			stimulus: '<code>.oasys-stimulus-content</code>',
			question: '<code>.oasys-question-content</code>'
		}
	);
	const dialogData = {
		buttons: [
			{label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'},
			{label: UILANG.m('save'), 'default': true, value: 'ok'}
		],
		contents: '<div class="pageCSSEditor">' +
			'<p>' + UILANG.m('Enter CSS that will be applied to this page in every language.') + '</p>' +
			'<p class="pageCSSEditorRecommendation"><strong>' + UILANG.m('Recommended:') + '</strong> ' + scopeGuidance + '</p>' +
			'<textarea id="pageCustomCSSArea" spellcheck="false" aria-label="' + UILANG.m('Custom CSS') + '">' + escapedCSS + '</textarea>' +
			'</div>',
		datafields: ['pageCustomCSSArea'],
		dataFormat: 'object',
		doNotStripHTML: true,
		focus: 'pageCustomCSSArea',
		returnPromise: true,
		title: UILANG.m('Page custom CSS'),
		width: 900
	};

	showDialog('pageCustomCSSDialog', dialogData).then((res) => {
		if (res.button !== 'ok') return;
		const enteredCSS = res.data.pageCustomCSSArea ?? '';
		try {
			controller.setData(parseCustomCSS(enteredCSS), 'metadata', 'customCSS');
		} catch (error) {
			showMessage(error.message, () => customCSSDialog(enteredCSS));
		}
	});
}

function serializeCustomCSS(cssRules) {
	if (!Array.isArray(cssRules)) return '';
	return cssRules.map((cssRule) => {
		if (!cssRule || typeof cssRule.selector !== 'string' || typeof cssRule.rules !== 'string') return '';
		return `${cssRule.selector} {\n\t${cssRule.rules}\n}`;
	}).filter(Boolean).join('\n\n');
}

function parseCustomCSS(cssText) {
	if (typeof cssText !== 'string' || cssText.trim() === '') return [];

	// Parse in a detached document so page selectors cannot affect the editor while the dialog is being saved.
	const cssDocument = document.implementation.createHTMLDocument('');
	const style = cssDocument.createElement('style');
	style.textContent = cssText;
	cssDocument.head.appendChild(style);
	try {
		const parsedRules = Array.from(style.sheet?.cssRules ?? []);
		if (parsedRules.length === 0) {
			throw new Error(UILANG.m('No valid CSS rules were found. Please check the CSS syntax.'));
		}
		return parsedRules.map((cssRule) => {
			const normalizedRule = cssRule.cssText;
			const openingBrace = normalizedRule.indexOf('{');
			const closingBrace = normalizedRule.lastIndexOf('}');
			if (openingBrace < 1 || closingBrace <= openingBrace) {
				throw new Error(UILANG.m('Only CSS rules with a declaration block are supported.'));
			}
			return {
				selector: normalizedRule.slice(0, openingBrace).trim(),
				rules: normalizedRule.slice(openingBrace + 1, closingBrace).trim()
			};
		});
	} finally {
		style.remove();
	}
}

/***** view onchange callbacks *****/

function onStimulusSelect(sender, value, dirty, key) {
	rixToolsDebug(1, `onStimulusSelect(sender, value, dirty, key)`);
	controller.setData(value, key);
}

/***** data processing *****/

//automatically encode JSON for sending to database
function encodeData() {
	rixToolsDebug(1, `encodeData()`);
	let data = controller.getData();
	if (typeof (data) === 'undefined') return;
	if (!Array.isArray(data.customCSS) && Array.isArray(data.metadata?.customCSS)) {
		data.customCSS = data.metadata.customCSS;
	}
	data.blocks = JSON.stringify(data.blocks);
	data.languages = JSON.stringify(data.languages);
	data.metadata = JSON.stringify(data.metadata);
	return data;
}

//automatically decode JSON strings contained in server data, based on type of data
function decodeData(data) {
	rixToolsDebug(1, `decodeData(data)`);
	if (typeof (data) === 'undefined') return;
	data.blocks = jsonDecode(data.blocks, data.id, 'blocks', []);
	data.languages = jsonDecode(data.languages, data.id, 'languages', []);
	data.metadata = jsonDecode(data.metadata, data.id, 'metadata', {});
}

//parse a single JSON string with fallback on empty object if null and exception handling
//if an unparsable string is found, it will be replaced with an empty object
function jsonDecode(s, id, key, template) {
	rixToolsDebug(1, `jsonDecode(s, id, key, template)`);
	if (typeof (template) === 'undefined') {
		//the template defines what an empty variable should be initialized with, default is a new object
		template = {};
	}
	if (s) {
		try {
			s = JSON.parse(s);
		} catch (e) {
			const d = new Date();
			console.error(`[${d.toString()}] parse error in ${id} ${key} ${s}: ${e}`);
			s = deepCopy(template);
		}
	} else {
		s = deepCopy(template);
	}
	return s;
}

function initPath(obj, template, ...path) {
	rixToolsDebug(1, `initPath(obj, template, ...path)`);
	if (path.length === 0) {
		console.error("[initPath] no path given!");
		return;
	}
	let key = path.shift();
	if (typeof (obj) !== 'object') {
		console.error("[initPath] trying to initialize the key of a non object!");
		return;
	}
	if (path.length === 0) {
		if (typeof (obj[key]) === 'undefined') {
			obj[key] = template;
		}
	} else {
		if (typeof (obj[key]) === 'undefined') {
			obj[key] = {};
		}
		initPath(obj[key], template, ...path);
	}
}

function initLanguageKeys(obj, template, ...path) {
	rixToolsDebug(1, `initLanguageKeys(obj, template, ...path)`);
	if (typeof (obj) !== 'object') {
		console.error("[initLanguageKeys] trying to initialize language keys of a non object!");
		return;
	}
	let usedLanguages = controller.getData('languages');
	for (let lang of usedLanguages) {
		let p = [...path, lang];
		initPath(obj, template, ...p);
	}
}


/***** helper tools *****/

async function showDialog(id, dialogData) {
	rixToolsDebug(1, `async showDialog("${id}", dialogData)`);
	return new nxDialog(id, dialogData);
}

function showMessage() {
	rixToolsDebug(1, `showMessage()`);
	let callback = null;
	const argv = [];
	const argc = arguments.length;
	const params = [];
	for (let i = 0; i < argc; i++) {
		if (callback !== null) {
			params.push(arguments[i]);
		} else if (typeof (arguments[i]) === 'function') {
			callback = arguments[i];
		} else {
			argv.push(arguments[i]);
		}
	}
	const msg = sf.apply(this, argv);
	const dialogData = {
		buttons: [{
			label: UILANG.m('OK'),
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: formatActionErrorMessage(msg),
		width: 500,
		callback: callback,
		title: UILANG.m("Error"),
		icon: "../images/error.png",
		iconWidth: 64
	};
	new nxDialog('Message', dialogData, params);
}

/***** undo handler *****/

function undo() {
	rixToolsDebug(1, `undo()`);
	if (mode === 'page') {
		controller.undo();
		updateInteractionPreviews();
	} else if (mode === 'block') {
		editor.controller.undo();
	}
}

function redo() {
	rixToolsDebug(1, `redo()`);
	if (mode === 'page') {
		controller.redo();
		updateInteractionPreviews();
	} else if (mode === 'block') {
		editor.controller.redo();
	}
}

/****** keyboard handler ******/

function acceptKeyStrokes() {
	rixToolsDebug(1, `acceptKeyStrokes()`);
	return kbHandlerActive;
}

/****** force the editor to close ******/

function forceCloseEditor(skipMessage) {
	rixToolsDebug(1, `forceCloseEditor(${skipMessage ? 'true' : 'false'})`);
	if (skipMessage === true) {
		window.parent.closePageEditor();
	} else {
		let dialogData = {
			buttons: [
				{label: UILANG.m('OK'), 'default': true, value: 'ok'}
			],
			returnPromise: true,
			contents: UILANG.m('Someone else has started editing this page while you lost connection to the server. You cannot continue editing it.'),
			title: UILANG.m('Editing conflict'),
			width: 400
		};
		showDialog('editConflictDialog', dialogData).then(
			() => {
				window.parent.closePageEditor();
			}
		);
	}
}

/***** show session timeout dialog *****/
function showSessionExpiryWarning() {
	rixToolsDebug(1, `showSessionExpiryWarning()`);
	let dialogData = {
		buttons: [
			{label: UILANG.m('Yes'), 'default': true, value: 'yes'}
		],
		returnPromise: true,
		allowMultipleInstances: false,
		contents: UILANG.m('Your session is about to time out. Are you still there?'),
		title: UILANG.m('Session expiring soon'),
		width: 400
	};
	showDialog('sessionExpiryWarning', dialogData).then(
		(res) => {
			//if the user clicked "yes" we will send a request to the server to keep the session alive
			if (res.button === 'yes') {
				startAjax('keepSessionAlive', {});
			}
		}
	);
}

function sessionExpired() {
	rixToolsDebug(1, `sessionExpired()`);
	//if the session expired we will show a dialog to the user and close the editor
	let dialogData = {
		buttons: [
			{label: UILANG.m('OK'), 'default': true, value: 'ok'}
		],
		returnPromise: true,
		allowMultipleInstances: false,
		replaceExisting: 'sessionExpiryWarning',
		contents: UILANG.m('Your session has timed out. Please log in again.'),
		title: UILANG.m('Session expired'),
		width: 400
	};
	showDialog('sessionExpiredDialog', dialogData).then(
		() => {
			// console.log('sessionExpired');
			window.top.location.replace(settings.JSrootURL + "editor/");
		}
	);
}

/***** server communication *****/

function startAjax(action, data) {
	rixToolsDebug(1, `startAjax("${action}", data)`);
	waitDialog.show();
	const params = {
		action: action,
		data: UTF8ToBase64(JSON.stringify(data))
	};
	$.ajax({
		data: params
	}).done(res => ajaxSuccess(res)).fail((jqXHR, textStatus, errorThrown) => ajaxError(jqXHR, textStatus, errorThrown, action));
}

function finishFailedSave(action) {
	if (action !== 'savePage' || !saveInProgress) {
		return;
	}
	saveInProgress = false;
	saveRevision = null;
	mediaManagerAfterSaving = false;
	updateSaveButton(controller.isChanged());
}

function ajaxError(jqXHR, textStatus, errorThrown, action) {
	rixToolsDebug(1, `ajaxError(jqXHR, textStatus, errorThrown)`);
	waitDialog.hide();
	finishFailedSave(action);
	let dialogData = {
		buttons: [{
			label: UILANG.m('OK'),
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: jqXHR?.responseJSON?.fatalError ?? 'no error details given',
		title: 'Error: ' + errorThrown,
		width: 500
	};
	new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
	rixToolsDebug(1, `ajaxSuccess(res)`);
	$('#un_val').html(res.loggedInName);
	if (waitDialog.busy()) {
		waitDialog.hide();
	}
	//if there was a fatal PHP error that prevented the script from finishing show that error
	//this data is created in PHP via the register_shutdown_function
	let dialogData;
	if (res.fatalError) {
		finishFailedSave(res.action);
		dialogData = {
			buttons: [{
				label: UILANG.m('OK'),
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: formatActionErrorMessage('<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError),
			title: UILANG.m("Error"),
			icon: "../images/error.png",
			iconWidth: 64,
			width: 500
		};
		new nxDialog('fatalError', dialogData);
		return;
	}
	//if a normal error occured in PHP that did not prevent the script from finishing, show it
	if (res.error !== false) {
		finishFailedSave(res.action);
		dialogData = {
			buttons: [{
				label: UILANG.m('OK'),
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: formatActionErrorMessage('<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error),
			title: UILANG.m("Error"),
			icon: "../images/error.png",
			iconWidth: 64,
			width: 700
		};
		new nxDialog('error', dialogData);
		return;
	}
	if (res.warnings) {
		for (let i in res.warnings) {
			showMessage(res.warnings[i]);
		}
	}

	switch (res.action) {
		case 'fetchPage':
			decodeData(res.data.page);
			if (typeof (res.data.page['link']) === 'number') {
				//make sure that the linked stimulus is recognized as such
				let linkedPage = fetchObjectFromArray(res.data.group, {id: res.data.page['link']});
				if (linkedPage.stimulus === 0) {
					res.data.page['link'] = null;
				}
			}
			//check if "useAsStimulus" is not set in metadata, initialize it with false
			if (typeof (res.data.page.metadata.useAsStimulus) === 'undefined') {
				res.data.page.metadata.useAsStimulus = false;
			}
			updateStimulusList(res.data.group.filter(page => page.stimulus === 1));
			let pageData = res.data.page;
			if (pageData.languages.length === 0) {
				pageData.languages.push(settings.defaultLanguage);
			}
			controller.setData(pageData);
			updateCustomCSSSummary(pageData.metadata.customCSS);
			controller.resetChangedFlag();
			serverData.group.id = controller.getData('groupId'); //hold groupId for jsMedia Plugin to function
			serverData.group.items = res.data.group; //hold item list of group needed to sanitize stimulus role and links
			sanitizeLanguages();

			/**** DEBUGGING ****/
			//check if key "autoDebugInteraction" in local storage exists and is set to true
			//if so, open the editor for the first interaction block
			//this is used for debugging purposes
			// if (localStorage.getItem("autoDebugInteraction") === "true") {
			// 	editBlock(0);
			// }
			break;

		case 'savePage':
			const changedWhileSaving = pageChangeRevision !== saveRevision;
			const compilationFailed = Boolean(res.compilationErrors);
			if (!changedWhileSaving) {
				controller.setData(res.data.blocks, 'blocks');
				controller.resetChangedFlag();
			}
			saveInProgress = false;
			saveRevision = null;
			updateSaveButton(controller.isChanged());
			if (!changedWhileSaving) {
				if (closeEditorAfterSaving === true) {
					window.parent.closePageEditor();
				} else if (previewAfterSaving === true) {
					previewAfterSaving = false;
					if (!compilationFailed) {
						preview();
					}
				} else if (reviewAfterSaving === true) {
					reviewAfterSaving = false;
					if (!compilationFailed) {
						reviewerMode();
					}
				} else if (mediaManagerAfterSaving === true) {
					mediaManagerAfterSaving = false;
					openMediaManager();
				}
			} else {
				mediaManagerAfterSaving = false;
			}
			if (res.compilationErrors) {
				showMessage(res.compilationErrors);
			}
			break;

		case 'removeLinks':
			serverData.group.items = res.data.group; //update item list of group needed to sanitize stimulus role and links
			break;

		default:
			break;
	}
}
