"use strict";

$(onReady);
$(document).on("contextmenu", function(e) {
	e.preventDefault();
	return false;
});

//gui elements
let kbHandler;
let waitDialog;
let buttons = {};
let gui = {};
let animationPlaying = false;

//details of the selections in the different edit levels
let selection = [];
let itemSelection = null;

//data loaded from server
const serverData = {
	group: null,
	item: null,
	items: [],
	preview: null
}; //group level means either a group or a folder wich contains groups

const PAGE_PUBLISHED_LOCK_MESSAGE = 'This page is used in at least one published (locked) test and cannot be edited to secure test results. Please use the preview to view its content.';

//what part of the editor is currently active
let mode = 'browsing'; //browsing, editGroup, editPage

//the location displayed in the library
let loc = {
	folder: 1,
	path: 'library'
};
let oldLoc = {
	folder: 1,
	path: 'library',
	prefix: ''
};
//the breadcrumbs of the current location
let breadcrumbs;

//variables for delayed edit handling
let editOnData = false;
let pendingItemGroupId = null;
let pendingItemGroupToken = null;
let pendingItemGroupRequest = null;
let ajaxRequestToken = 0;
let preserveLibraryScrollOnNextSelection = false;

//track editor changes
const oldEditorContents = '';
const ignoreEditorChanges = false;

//permission to edit
let mayEditGroup = false;
let mayEditItem = false;

//Save&CloseFlag
let closeTest = false;

//keeping track of errors in data
let parseErrors;

//global counter for id creation that will never reset
let globalCounter = 0;

//timer to update lock state of page group
let lockTimer;
let lockedPage = null;

// global vars for blocked object handling
let curFFlist = null;
let showBlocked = true;

let jsph;

function onReady() {

	//setup in the beginning (e.g. onload or onready)
	$.ajaxSetup({
		type: "POST",
		cache: false,
		dataType: "json",
		timeout: 300000,
		success: ajaxSuccess,
		error: ajaxError,
		url: "itemActions.php"
	});
	$('body').append('<div id="hiddenElements" style="visibility: hidden; position: fixed;"></div>');

	// get show blocked object setting from user settings
	showBlocked = settings.showLockedObjects;

	//prohibit dropping files into the browser
	$('body').on('dragover', function(e) {
		e.preventDefault();
	});
	$('body').on('drop', function(e) {
		e.preventDefault();
	});

	waitDialog = new jsModalWait(UILANG.m('please wait'), false, {ignoreList: ['fetchItem', 'lockItem']});
	kbHandler = new jsKeyboardHandler();
	kbHandler.permissionHandler(mayAcceptKeyStrokes);
	kbHandler.registerShortcut('CR', function() {
		editSelection('shortcut');
	}, {
		preventDefault: false
	});
	kbHandler.registerShortcut('ESC', abortEditing, {
		executeOnChildren: true
	});
	kbHandler.registerShortcut('CTRL+A', ctrlA);
	kbHandler.registerShortcut('del', deleteKey);
	kbHandler.registerShortcut('up', cursorUp);
	kbHandler.registerShortcut('down', cursorDown);
	kbHandler.registerShortcut('SHIFT+UP', cursorShiftUp);
	kbHandler.registerShortcut('SHIFT+DOWN', cursorShiftDown);
	kbHandler.registerShortcut('CTRL+C', clipboardActivity, {
		parameters: ['copy']
	});
	kbHandler.registerShortcut('CTRL+V', clipboardActivity, {
		parameters: ['paste']
	});
	kbHandler.registerShortcut('CTRL+X', clipboardActivity, {
		parameters: ['cut']
	});
	kbHandler.registerShortcut('BACKSPACE', deleteSelection);
	kbHandler.registerShortcut('tab', null, {
		executeOnChildren: true
	}); //prevent tabbing to the URL input field of the browser
	initGUI();
	gui = {
		boxes: {},
		group: {},
		itemProperties: {},
		item: {},
		fields: {}
	};
	gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
		prepend: true,
		prefix: '<strong style="margin-right: 10px;">' + UILANG.m('Content:') + '</strong>',
		message: UILANG.m('browsing page groups')
	});

	createMainButtons();
	createBoxes();

	window.preSelect = Number(preSelect);
	window.preType = Number(preType);

	if (preSelect && preType && typeof preSelect === 'number' && typeof preType === 'number') {
		startAjax('fetchPreSelect', {
			id: preSelect,
			type: preType
		});
	} else {
		//get library contents
		startAjax('fetchLibrary', {
			location: loc.folder,
			showBlocked: showBlocked
		});
	}

	//create hidden form for previewing
	hiddenForm('previewForm', 'post', '../index.php', '_blank', ['action', 'data']);

	//on close
	$(window).on('beforeunload', onUnload);

	switchMode();

	lockTimer = setInterval(updateLock, 15000);

	jsph = jsPointerHandler.instance;
}

function createMainButtons() {
	buttons.abortEditing = new jsButton2($('header'), 'bAbortEditing', {
		label: UILANG.m('Close group'),
		icon: '../images/toolbarIcons/ic_tb_back.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: abortEditing,
		disabled: true
	});
	buttons.searchFiler = new jsButton2($('header'), 'bSearch', {
		label: UILANG.m('search'),
		icon: '../images/toolbarIcons/ic_tb_search.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: clickSearch,
		disabled: false
	});
	buttons.newFolder = new jsButton2($('header'), 'bNewFolder', {
		label: UILANG.m('New folder'),
		icon: '../images/toolbarIcons/ic_tb_newFolder.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: newFolder,
		disabled: false
	});
	buttons.newItemGroup = new jsButton2($('header'), 'bNewItemGroup', {
		label: UILANG.m('New page group'),
		icon: '../images/toolbarIcons/ic_tb_addItemGroup.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: newItemGroup,
		disabled: false
	});
	insertVerticalDivider('header');
	buttons.rename = new jsButton2($('header'), 'bRename', {
		labels: {
			group: UILANG.m('Rename'),
			item: UILANG.m('Rename & edit code')
		},
		icons: {
			group: '../images/toolbarIcons/ic_tb_rename.png',
			item: '../images/toolbarIcons/ic_tb_renameCode.png'
		},
		mode: 'group',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: rename,
		disabled: true
	});
	buttons.editSelection = new jsButton2($('header'), 'bEditSelection', {
		labels: {
			group: UILANG.m('Edit page group'),
			item: UILANG.m('Edit page')
		},
		icons: {
			group: '../images/toolbarIcons/ic_tb_editItemGroup.png',
			item: '../images/toolbarIcons/ic_tb_edit_white.png'
		},
		mode: 'group',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: editSelection,
		disabled: true
	});
	buttons.duplicate = new jsButton2($('header'), 'bDuplicate', {
		labels: {
			group: UILANG.m('Duplicate page group'),
			item: UILANG.m('Duplicate page')
		},
		icons: {
			group: '../images/toolbarIcons/ic_tb_duplicateItemGroup.png',
			item: '../images/toolbarIcons/ic_tb_duplicateItemGroup.png'
		},
		mode: 'group',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: duplicate,
		disabled: true
	});

	buttons.deleteSelection = new jsButton2($('header'), 'bDelete', {
		labels: {
			browsing: UILANG.m('Delete'),
			language: UILANG.m('Delete language')

		},
		icons: {
			browsing: '../images/toolbarIcons/ic_tb_trashcan.png',
			language: '../images/toolbarIcons/ic_tb_trashcan.png'
		},
		mode: 'browsing',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: deleteSelection,
		disabled: true
	});
	if (window.pageGroupPackageAdmin === true) {
		insertVerticalDivider('header', 'cmTransferStart');
		buttons.exportPageGroups = new jsButton2($('header'), 'bExportPageGroups', {
			label: UILANG.m('Export page groups'),
			icon: '../images/toolbarIcons/ic_tb_download.png',
			iconWidth: 48,
			width: 88,
			height: 100,
			callback: exportPageGroups,
			disabled: true
		});
		buttons.importPageGroups = new jsButton2($('header'), 'bImportPageGroups', {
			label: UILANG.m('Import page groups'),
			icon: '../images/toolbarIcons/ic_tb_upload.png',
			iconWidth: 48,
			width: 88,
			height: 100,
			callback: openPageGroupPackageImport,
			disabled: true
		});
		insertVerticalDivider('header', 'cmTransferEnd');
	}
	buttons.loadExistingPages = new jsButton2($('header'), 'bLoadExistingPages', {
		label: UILANG.m('Load existing test pages'),
		icon: '../images/toolbarIcons/ic_tb_copy.png',
		iconWidth: 48,
		width: 88,
		height: 100,
		callback: openExistingPagesDialog,
		disabled: false
	});
	buttons.media = new jsButton2($('header'), 'bMedia', {
		label: UILANG.m('Media Manager'),
		icon: '../images/toolbarIcons/ic_tb_mediaManager.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: mediaManager,
		disabled: false
	});
	buttons.preview = new jsButton2($('header'), 'bPreview', {
		label: UILANG.m('Preview page group'),
		icon: '../images/toolbarIcons/ic_tb_preview.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: preview,
		disabled: true
	});
}

function createBoxes() {
	gui.s1 = createFlexSection('UI', 'sect001', 450, 450); //library
	gui.s2 = createFlexSection('UI', 'sect002', 260, 410); //group properties and page list
	gui.s3 = createFlexSection('UI', 'sect003', 340, 490); //page properties
	gui.s10 = createFlexSection('UI', 'sect010', 846, 846); //browse preview

	// section 1 (browser)
	gui.boxes.itemGroups = createFlexBox(gui.s1, 'itemGroupList', {
		title: UILANG.m('Page Groups'),
		minHeight: 480,
		flex: 1,
		noPadding: true
	});

	/* eye icon toggle for blocked items */

	// set starting state when pre-selection
	let eyeStart;
	if (showBlocked) {
		eyeStart = "../images/flexSectionToolBar/ic_flex_locked_hidden.png";
		$('#bv_toggle').data("val", 1)
	} else {
		eyeStart = "../images/flexSectionToolBar/ic_flex_locked_shown.png";
		$('#bv_toggle').data("val", 0);
	}

	let bvdv = (settings.showLockedObjects) ? 1 : 0;
	$('#title_itemGroupList').append( /* html */ `<img data-val=${bvdv} id="bv_toggle" src="../images/${eyeStart}"/>`);

	$('#bv_toggle').on("click", function() {
		if ($(this).data("val") === 0) {
			showBlocked = true;
			$(this).data("val", 1);
			this.src = "../images/flexSectionToolBar/ic_flex_locked_hidden.png";
		} else {
			showBlocked = false;
			$(this).data("val", 0);
			this.src = "../images/flexSectionToolBar/ic_flex_locked_shown.png";
		}

		startAjax('fetchLibrary', {
			location: loc.folder,
			showBlocked: showBlocked
		});
	});

	let vbttdur = (settings.disableAnimations) ? 0 : 250;

	$('#bv_toggle').prop('title', UILANG.m("Toggle blocked item visibility"));
	$('#bv_toggle').tooltip({
		track: true,
		classes: {
			"ui-tooltip-content": "uitt-upgrader"
		},
		show: {
			effect: "fadeIn",
			duration: vbttdur
		},
		hide: {
			effect: "fadeOut",
			duration: vbttdur
		}
	});

	//noinspection HtmlUnknownTarget
	gui.boxes.items = createFlexBox(gui.s2, 'itemList', {
		title: UILANG.m('Pages'),
		minHeight: 480,
		flex: 1,
		locked: true,
		lockedClick: clickLockedBox,
		lockedText: '<img alt="edit" style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
		useVeil: true
	});

	gui.itemList = new jsSelectList(gui.boxes.items.getInnerBox(), 'itemSelector', {
		labelKey: 'name',
		orderKey: 'name',
		idKey: 'id',
		prefixKey: 'listBadges',
		forceSelect: true,
		sections: {'active': UILANG.m('active'), 'archived': UILANG.m('archived')},
		sectionGetter: (obj) => {
			if (obj.metadata && obj.metadata.archived) {
				return 'archived';
			} else {
				return 'active';
			}
		},
		classConditions: {
			'pageRole_stimulus': {
				path: ['metadata', 'useAsStimulus'],
				value: true
			},
			'pageLocked_published': {
				path: ['publishedLocked'],
				value: true
			}
		},
		hideButtonsKey: 'publishedLocked',
		headerButton: {
			label: UILANG.m('New page'),
			name: 'addItem',
			callback: newItem,
			params: ['itemList']
		},
		buttons: [{
			name: 'deleteItem',
			icon: '../images/inlineActions/ic_fl_inline_delete.png',
			tooltip: UILANG.m('Delete'),
			callback: deleteObjects,
			width: 22,
			height: 22
		}, {
			name: 'duplicateItem',
			icon: '../images/inlineActions/ic_fl_inline_duplicate.png',
			tooltip: UILANG.m('Duplicate'),
			callback: duplicateItem,
			width: 22,
			height: 22
		}, {
			name: 'editItem',
			icon: '../images/inlineActions/ic_fl_inline_edit.png',
			tooltip: UILANG.m('Edit'),
			callback: editHovered,
			width: 22,
			height: 22
		}],
		selectionCallback: groupSelChanged,
		activationCallback: listItemActivated,
		cancelSingleClickOnDoubleClick: false
	});
	gui.itemList.disable();

	gui.boxes.metaTags = createFlexBox(gui.s2, 'metaTags', {
		title: UILANG.m('Meta-tags'),
		minHeight: 240,
		flex: 0,
		locked: true,
		lockedClick: clickLockedBox,
		useVeil: true,
		panelHeight: 30
	});
	gui.boxes.metaTags.getInnerBox().append('<div id="metaTagList"></div>');
	gui.metaView = new JsTagEditor('metaTagList', {
		onChange: groupMetaChanged,
		keyLabel: UILANG.m('Meta-key (e.g. "Subject"):'),
		valueLabel: UILANG.m('Meta-value (e.g. "Mathematics"):'),
		inputClass: 'iri'
	});
	gui.metaView.lock();
	gui.boxes.metaTags.getPanel().append('<div><div id="metaTbText"></div><div id="metaTbButton"></div></div>');
	window.metaTbButtons = {};
	metaTbButtons.addElements = new nxButton($('#metaTbButton'), 'mTbAdd', {
		icon: '../images/add48.png',
		iconWidth: 22,
		callback: addGroupMetaTag,
		tooltip: UILANG.m('Add meta tag'),
		disabled: true
	});
	gui.s2.hide();
	gui.s10.hide();

	//section 3 (page level)
	gui.boxes.itemProperties = createFlexBox(gui.s3, 'itemProperties', {
		title: UILANG.m('Page Properties'),
		minHeight: 300,
		flex: 0,
		locked: true
	});
	gui.boxes.itemProperties.getInnerBox().append('<div id="inlineWaitMessage">' + UILANG.m('Please wait …') + '</div>');
	gui.inlineWaitMessage = $('#inlineWaitMessage');
	// gui.inlineWaitMessage.hide();
	gui.fields.itemName = insertTextfield(gui.boxes.itemProperties.getInnerBox(), 'tfItemName', UILANG.m('Name'), {
		readOnly: true,
		onLockedClick: cmOpenSelectedPageRename
	});
	gui.fields.itemName.getPropertyCell().closest('.jsInterfaceRow').addClass('cmItemPropertyRenameAction');
	gui.fields.itemCode = insertTextfield(gui.boxes.itemProperties.getInnerBox(), 'tfItemCode', UILANG.m('code'), {
		readOnly: true,
		onLockedClick: cmOpenSelectedPageRename
	});
	gui.fields.itemCode.getPropertyCell().closest('.jsInterfaceRow').addClass('cmItemPropertyRenameAction');
	gui.fields.languages = insertTextfield(gui.boxes.itemProperties.getInnerBox(), 'tfLanguages', UILANG.m('languages'), {
		readOnly: true
	});
	gui.fields.languages.getPropertyCell().closest('.jsInterfaceRow').addClass('cmItemPropertyGapAfter');
	gui.fields.useAsStimulus = insertToggleswitch(gui.boxes.itemProperties.getInnerBox(), 'cbStimulus', UILANG.m('Use as stimulus'), {
		changeCallback: (...params) => toggleStimulusRole(...params),
		alignment: 'left'
	});
	gui.fields.archived = insertToggleswitch(gui.boxes.itemProperties.getInnerBox(), 'cbArchived', UILANG.m('Archived'), {
		changeCallback: (...params) => toggleArchivedFlag(...params),
		alignment: 'left'
	});
	gui.fields.archived.getPropertyCell().closest('.jsInterfaceRow').addClass('cmItemPropertyGapAfter');
	gui.fields.dlStimuli = insertDropdown(gui.boxes.itemProperties.getInnerBox(), 'dlStimuli', UILANG.m('Linked stimulus'), {
		elements: [],
		noChoiceTitle: UILANG.m('no stimulus in group'),
		listTitle: '',
		dataId: 'link',
		theme: 'backend',
		onChange: (sender, value) => onStimulusSelect(value),
		order: 'label',
		width: '100%'
	}, {
			twoRows: true
		});
	gui.fields.dlStimuli.getPropertyCell().closest('.jsInterfaceRow').addClass('cmLinkedStimulusRow');
	gui.fields.linkedStimulusValue = insertStaticText(gui.boxes.itemProperties.getInnerBox(), 'linkedStimulusValue', UILANG.m('Linked stimulus'), {
		text: '',
		classes: ['cmLinkedStimulusReadOnly']
	}, {
		twoRows: true
	});
	gui.fields.linkedStimulusValue.hide();
	gui.s3.hide();
	insertSpacer(gui.boxes.itemProperties.getInnerBox());
	gui.fields.pageComment = insertStaticText(gui.boxes.itemProperties.getInnerBox(), 'pageComment', `<b>${UILANG.m('Comments:')}</b>`, {
		classes: ['cmPageCommentText']
	}, { twoRows: true });

	gui.boxes.itemContent = createFlexBox(gui.s3, 'itemContent', {
		title: UILANG.m('page') + ' ' + UILANG.m('Content') + ' (' + UILANG.m('Interactions') + ')',
		minHeight: 420,
		flex: 1,
		noPadding: true
	});
	gui.boxes.itemContent.getInnerBox().append('<div id="itemContentInteractions" class="cmPageContentBlank">' + UILANG.m('Content') + '</div>');

	gui.boxes.contentPreview = createFlexBox(gui.s10, 'contentPreview', {
		title: UILANG.m('Page group preview'),
		minHeight: 480,
		flex: 1,
		noPadding: true,
		panelHeight: 30
	});
	gui.boxes.contentPreview.getInnerBox().append('<div id="contentPreviewContent" class="tmPreviewBlank"></div>');


	//fileManager
	breadcrumbs = [{
		id: 1,
		name: "Home"
	}];
	const fileOpPermissions = {
		copyFolders: false,
		copyItems: true,
		copyMultiple: true,
		cutFolders: true,
		cutItems: true,
		cutMultiple: true
	};
	gui.library = new FileManager("#itemGroupList", "_idSuffix", [], breadcrumbs, fileOpPermissions, true, libraryEvent, 'all', true);

	registerContextMenus();
}

function registerContextMenus() {

	//menu for pages box when clicking empty part of the box
	$.contextMenu({
		selector: '#itemList',
		callback: contextMenuItemList,
		items: {
			"newItem": {
				name: UILANG.m("New page"),
				icon: "newItem"
			}
		}
	});

	//menu for pages box when clicking a page
	$.contextMenu({
		selector: '#itemSelector li',
		callback: contextMenuItemList,
		items: {
			"edit": {
				name: UILANG.m("Edit"),
				icon: "edit"
			},
			"duplicate": {
				name: UILANG.m("Duplicate"),
				icon: "duplicate"
			},
			"rename": {
				name: UILANG.m("Rename"),
				icon: "rename"
			},
			"delete": {
				name: UILANG.m("Delete"),
				icon: "delete"
			},
			"sep1": "---------",
			"newItem": {
				name: UILANG.m("New page"),
				icon: "newItem"
			}
		}
	});
}

function mayAcceptKeyStrokes() {
	return !waitDialog.busy() && !gui.itemList.delayed() && !animationPlaying;
}

function buttonClicked() {
	//dummy function for unimplemented callbacks
	showMessage('This functionality is not implemented yet. Please come back later!');
}

function switchMode() {
	let b;
	for (b in buttons) {
		buttons[b].hide();
	}
	$('#cmTransferStart, #cmTransferEnd').hide();
	let visibleButtons = [];
	switch (mode) {

		case 'browsing':
			visibleButtons = ['newFolder', 'newItemGroup', 'editSelection', 'deleteSelection', 'exportPageGroups', 'importPageGroups', 'preview', 'duplicate', 'searchFiler', 'rename'];
			if (buttons.exportPageGroups && buttons.importPageGroups) $('#cmTransferStart, #cmTransferEnd').show();
			buttons.editSelection.switchMode('group');
			buttons.duplicate.switchMode('group');
			buttons.rename.switchMode('group');
			if (selection.length === 1) {
				buttons.editSelection.enable();
				mayEditGroup = true;
			} else {
				buttons.editSelection.disable();
				mayEditGroup = false;
			}
			buttons.deleteSelection.switchMode('browsing');
			gui.itemList.disable();
			gui.statusBar.setStatus(UILANG.m('browsing page groups'));
			gui.boxes.items.lock();
			gui.boxes.metaTags.lock();
			gui.metaView.lock();
			if (window.metaTbButtons) metaTbButtons.addElements.disable();
			librarySelection(gui.library.getSelect(), true);
			break;

		case 'editGroup':
			cmHideBrowsePreviewSection();
			gui.s2.show();
			buttons.abortEditing.enable();
			visibleButtons = ['abortEditing', 'loadExistingPages', 'media', 'preview', 'rename'];
			buttons.editSelection.disable();
			mayEditItem = false;
			buttons.editSelection.switchMode('item');
			buttons.duplicate.switchMode('item');
			buttons.deleteSelection.switchMode('browsing');
			buttons.rename.switchMode('item');
			buttons.preview.enable();
			gui.itemList.enable();
			groupSelChanged(itemSelection);
			gui.statusBar.setStatus(UILANG.m('Editing') + ' "' + serverData.group.name + '"');
			gui.boxes.items.unlock();
			gui.boxes.metaTags.unlock();
			gui.metaView.unlock();
			if (window.metaTbButtons) metaTbButtons.addElements.enable();
			gui.boxes.itemProperties.lock();
			break;

	}
	for (let i in visibleButtons) {
		b = visibleButtons[i];
		if (buttons[b]) buttons[b].show();
	}
}

function listItemActivated(sel) {
	groupSelChanged(sel, true);
}

function clickLockedBox(sender) {
	editSelection(sender);
}

function editSelection() {
	switch (mode) {
		case "browsing":
			if (selection[0].type === "itemGroup") {
				startAjax('checkItemGroup', {
					itemgroup: selection[0].dbId,
					location: loc.folder
				});
			} else {
				oldLoc = cloneObj(loc);
				loc.folder = selection[0].dbId;
				startAjax('fetchLibrary', {
					location: loc.folder,
					current: oldLoc,
					showBlocked: showBlocked
				});
			}
			break;
		case "editGroup":
			if (itemSelection && itemSelection.publishedLocked === true) {
				showMessage(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE));
				return;
			}
			startAjax('checkItem', {
				item: serverData.item.id,
				location: loc.folder
			});
			break;
	}
}

function editSelectionAfterCheck() {
	switch (mode) {
		case "browsing":
			cmHideBrowsePreviewSection();
			startAjax('fetchItemGroup', {
				id: selection[0].dbId,
				location: loc.folder
			});
			if (!mayEditGroup) {
				return;
			}
			mode = 'editGroup';
			switchMode();
			hideMenu();
			hideSection(gui.s1, gui.s2);
			break;
		case "editGroup":
			openPageEditor();
			break;
	}
}

function openPageEditor(id) {
	waitDialog.show();
	mode = "editPage";
	let frame = $('#pageEditor');
	if (typeof (id) === 'undefined') {
		id = serverData.item.id;
	}
	frame.attr('src', "pages.php?id=" + id);
	frame.removeClass('hidden');
	frame.trigger('focus');
	updateLock();
}

function closePageEditor() {
	let frame = $('#pageEditor');
	frame.removeAttr('src');
	frame.addClass('hidden');
	mode = "editGroup";

	//reload item data, which may have changed since opening editor
	let selectedItem = gui.itemList.getSelection();
	if (selectedItem) selectedItem = selectedItem.id;
	if (selectedItem) {
		gui.itemList.setSelection([selectedItem]);
		startAjax('fetchItem', {
			id: selectedItem
		});
		if (serverData.group && serverData.group.id) {
			startAjax('fetchItemGroup', {
				id: serverData.group.id,
				location: loc.folder
			});
		}
	}

	waitDialog.hide('*');
	updateLock();
}

function refreshContentLibraryForBrowsing(selectId, options) {
	if (!loc || !loc.folder) return;
	options = options || {};
	const payload = {
		location: loc.folder,
		rebuild: true,
		showBlocked: showBlocked
	};
	const selectedId = selectId || (serverData.group && serverData.group.id ? 'ig' + serverData.group.id : (selection[0] && selection[0].id));
	if (selectedId) payload.select = selectedId;
	preserveLibraryScrollOnNextSelection = options.preserveScroll === true;
	startAjax('fetchLibrary', payload);
}

function editHovered(obj) {
	gui.itemList.setSelection([obj.id]);
	groupSelChanged(obj, true);
}

function abortEditing() {
	gui.s3.hide();
	showMenu();
	if (mode !== 'browsing') {
		showSection(gui.s1, gui.s2, function() {
			mode = 'browsing';
			itemSelection = null;
			$(window).trigger('resize');
			switchMode();
			refreshContentLibraryForBrowsing(null, {
				preserveScroll: true
			});
		});
	}
}

function clipboardActivity(action) {
	if (mode !== 'browsing') return;
	switch (action) {
		case 'copy':
			startAjax('clipboardCheck', {
				id: selection,
				location: loc.folder
			}).then((res) => {
				if (res.error) {
					gui.library.clearClipboard();
				} else {
					gui.library.itemsToClipboard('cp');
				}
			});
			break;
		case 'cut':
			startAjax('clipboardCheck', {
				id: selection,
				location: loc.folder
			}).then((res) => {
				if (res.error) {
					gui.library.clearClipboard();
				} else {
					gui.library.itemsToClipboard('cut');
				}
			});
			break;
		case 'paste':
			gui.library.filerPaste();
			break;
	}
}

function toggleStimulusRole(id, checked, dirty, dataId) {
	if (checked === true) {
		//if box is checked, verify if this page does not also link to a stimulus itself and if so, warn the user
		let link = serverData.item.link;
		if (link !== null) {
			let dialogData = {
				buttons: [
					{ label: UILANG.e('Cancel'), 'cancel': true, value: 'cancel' },
					{ label: UILANG.e('OK'), 'default': true, value: 'ok' }
				],
				contents: UILANG.e("This page is already linked to a stimulus. Do you want to remove the link to the stimulus and use this page as a stimulus itself?"),
				title: UILANG.e('Stimulus conflict'),
				returnPromise: true,
				width: 400
			};
			showDialog('stimulusConflictDialog', dialogData).then(
				(res) => {
					if (res.button === 'ok') {
						serverData.item.link = null;
						serverData.item.metadata.useAsStimulus = true;
						gui.fields.useAsStimulus.reset(true);
						gui.fields.dlStimuli.hide();
						saveData('item');
					} else {
						gui.fields.useAsStimulus.reset(false);
					}
				}
			);
		} else {
			serverData.item.metadata.useAsStimulus = true;
			gui.fields.dlStimuli.hide();
			saveData('item');
		}
	} else {
		//if box is unchecked, verify if this page is linked as a stimulus to another page and if so, warn the user
		if (serverData.items.some(page => page.link === serverData.item.id)) {
			let dialogData = {
				buttons: [
					{ label: UILANG.e('Cancel'), 'cancel': true, value: 'cancel' },
					{ label: UILANG.e('OK'), 'default': true, value: 'ok' }
				],
				contents: UILANG.e("This page is linked as a stimulus to at least one other page. Do you want to remove any existing links? Be aware that this change cannot be undone!"),
				title: UILANG.e('Stimulus conflict'),
				returnPromise: true,
				width: 400
			};
			showDialog('stimulusConflictDialog', dialogData).then(
				(res) => {
					if (res.button === 'ok') {
						delete serverData.item.metadata.useAsStimulus;
						saveData('item');
						startAjax('removeLinks', { 'id': serverData.item.id, 'groupId': serverData.group.id });
						gui.fields.dlStimuli.show();
					} else {
						gui.fields.useAsStimulus.reset(true);
					}
				}
			);
		} else {
			delete serverData.item.metadata.useAsStimulus;
			saveData('item');
			gui.fields.dlStimuli.show();
		}
	}
}

function toggleArchivedFlag(id, checked, dirty, dataId) {
	if (checked === true) {
		serverData.item.metadata.archived = true;
		saveData('item');
	} else {
		delete serverData.item.metadata.archived;
		saveData('item');
	}
}

function libraryEvent(type, data) {
	let obj;
	let i;
	let sources;
	let target;
	switch (type) {
		case 'clear':
			if (curFFlist !== null) paintBlocked(curFFlist);
			break;
		case 'getSelect':
			librarySelection(data, true);
			break;
		case 'getSelectKeys':
			if (mode === 'browsing') librarySelection(data, true);
			break;
		case 'getSelectDblclick':
			if (mode === 'browsing') librarySelection(data, false);
			break;
		case 'onNavigate':
			oldLoc = cloneObj(loc);
			loc.folder = parseInt(data.dbId);
			startAjax('fetchLibrary', {
				location: loc.folder,
				current: oldLoc,
				showBlocked: showBlocked
			});
			break;
		case 'onBreadcrumbNavigate':
			oldLoc = cloneObj(loc);
			loc.folder = parseInt(data);
			startAjax('fetchLibrary', {
				location: loc.folder,
				current: oldLoc,
				showBlocked: showBlocked
			});
			break;
		case 'onRenameRequest':
			libraryRename(data);
			break;
		case 'onDeleteRequest':
			deleteSelection('contextMenu');
			break;
		case 'onMove':
		case 'onCutPaste':
			sources = {
				folders: [],
				files: []
			};
			target = data[0].target;
			if (typeof (target) === 'string') {
				target = target.replace(/.*?(\d+)$/, '$1');
				target = parseInt(target);
			}
			for (i in data[0].sources) {
				obj = data[0].sources[i];
				if (obj.type === 'folder') {
					sources.folders.push(obj.dbId);
				} else {
					sources.files.push(obj.dbId);
				}
			}
			startAjax('interactionCheck', {
				location: loc.folder,
				locInfo: loc,
				selInfo: data,
				libType: 'move'
			}).then((res) => {
				if (res.error) {
					gui.library.clearClipboard();
				} else {
					moveObjects(sources, target);
				}
			});

			break;
		case 'onSearchRequest':
			startAjax('search', {
				searchString: data
			});
			break;
		case 'onMetaSearchRequest':
			startAjax('metaSearch', data);
			break;
		case 'onSearchItemClick':
			loc.folder = parseInt(data.pid.replace(/^\D*/i, ''));
			startAjax('fetchLibrary', {
				location: loc.folder,
				select: data.id,
				current: oldLoc,
				showBlocked: showBlocked
			});
			break;
		case 'onPaste':
			sources = {
				folders: [],
				files: []
			};
			target = data[0].target;
			if (typeof target === 'string' || target instanceof String) {
				if (target.charAt(0) === 't') {
					target = target.substring(1, target.length)
				}
				if (target.charAt(0) === 'ig') {
					target = target.substring(2, target.length)
				}
			}
			for (i in data[0].sources) {
				obj = data[0].sources[i];
				if (obj.type === 'folder') {
					sources.folders.push(obj.dbId);
				} else {
					sources.files.push(obj.dbId);
				}
			}
			pasteItemGroup(sources, target);
			break;
		case 'quickMessage':
			gui.statusBar.setStatus(data.qMessage, 3000, data.msgColor);
			break;
		case 'onClipboardSuccess':
			let msg = '';
			if (!data) return;
			if (data[0].totalClipboard === 0) {
				gui.statusBar.setStatus(UILANG.m('nothing_selected'), 3000, '#F00');
				return;
			} else {
				let fString = '';
				if (data[0].cbFolders > 1) fString = data[0].cbFolders + ' ' + UILANG.m('folders') + ' ';
				if (data[0].cbFolders === 1) fString = '1 ' + UILANG.m('folder') + ' ';
				msg = fString;
				let gString = '';
				if (data[0].cbFiles > 1) gString = data[0].cbFiles + ' ' + UILANG.m('page groups') + ' ';
				if (data[0].cbFiles === 1) gString = '1 ' + UILANG.m('page group') + ' ';
				if (msg === '') {
					msg = gString;
				} else {
					if (gString !== '') {
						msg += UILANG.m('and') + ' ' + gString;
					}
				}
				if (data[0].task === 'cut') {
					msg += ' ' + UILANG.m('copied to clipboard for moving');
				} else {
					if (data[0].cbFolders > 0) {
						gui.statusBar.setStatus(UILANG.m('warning_folder_copy'), 3000, '#F00');
						gui.library.clearClipboard();
						return;
					} else {
						msg += ' ' + UILANG.m('copied to clipboard for duplication');
					}
				}
			}
			gui.statusBar.setStatus(msg, 3000, '#0A0');
			break;
		case 'onFolderRequest':
			newFolder('contextMenu');
			break;
		case 'onDuplicateRequest':
			duplicate();
			break;
		case 'onPermEditRequest':
			// FYI: short-circuit regular perm edit routine on bulk edit condition
			editPermDiag(`ctxMenu_${data.src}`, null, data.selLen > 1, null);
			// waitDialog.hide();
			break;
		case 'onWatchListToggle':
			startAjax('updateWatchList', {
				id: parseInt(data.id),
				status: data.status,
				type: data.type
			});
			break;
		default:
			break;
	}
}


function librarySelection(data, delayed) {
	if (typeof (data) === 'undefined') {
		return;
	}
	selection = data; //FYI: required for permission compatibility

	if (selection.length === 0) {
		/* if nothing is selected */

		buttons.deleteSelection.disable();
		buttons.editSelection.disable();
		buttons.rename.disable();
		buttons.preview.disable();
		buttons.duplicate.disable();
		// buttons.editPerm.disable();
		gui.s2.hide();
		cmHideBrowsePreviewSection();
		mayEditGroup = false;

	} else if (selection.length === 1) {
		buttons.deleteSelection.enable();
		buttons.rename.enable();
		mayEditGroup = true;

		if (selection[0].type === 'itemGroup') {
			/* If the selected entry is a page group */

			// if the user can edit, allow pencil icon veil, otherwise, don't
			let showPencil = permList[selection[0].dbId].editSelection;
			if (!showPencil) {
				gui.boxes.items.unlock();
			} else {
				gui.boxes.items.lock();
			}

			cmShowBrowsePreviewSection();
			renderContentPreviewLoading();
			if (!delayed) {
				// ITEMGROUP DOUBLECLICK
				/* this was not triggered by the timer, but by the second click in a doubleclick
				 * => the user wants to edit the group as soon as the data has been loaded => set the editOnData flag */
				editOnData = true;
			} else {
				// ITEMGROUP SINGLECLICK
				/* this was triggered by the timer, so there was no doubleclick => clear the editOnData flag */
				editOnData = false;
			}
			// buttons.editPerm.enable();
			buttons.editSelection.enable();
			buttons.preview.enable();
			buttons.duplicate.enable();

			if (data.length >= 2) selIcheck(loc, data);

			pendingItemGroupId = selection[0].dbId;
			pendingItemGroupToken = ++ajaxRequestToken;
			if (pendingItemGroupRequest && pendingItemGroupRequest.readyState !== 4 && typeof pendingItemGroupRequest.abort === 'function') {
				pendingItemGroupRequest.abort();
			}
			pendingItemGroupRequest = startAjax('fetchItemGroup', {
				id: selection[0].dbId,
				location: loc.folder,
				_requestToken: pendingItemGroupToken
			});
			// FOLDER CLICK: SINGLE
		} else if (delayed) {
			/* if it's a folder, and the method was triggered by the timer
		 (a doubleclick on a folder will not enter the edit mode, but open the folder instead) */
			gui.s2.hide();
			cmHideBrowsePreviewSection();
			// buttons.editPerm.enable();
			buttons.editSelection.disable();
			buttons.preview.disable();
			buttons.duplicate.disable();
		}
	} else {
		// More than single page selected
		// buttons.editPerm.disable();
		buttons.rename.disable();
		buttons.deleteSelection.enable();
		buttons.editSelection.disable();
		mayEditGroup = false;
		buttons.preview.disable();
		buttons.duplicate.disable();
		gui.s2.hide();
		cmHideBrowsePreviewSection();
	}

	/* existence validation checks on file interaction */
	if (!delayed) {
		selIcheck(loc, data);
	} else if (data.length >= 2) { // for any multi-select condition since file fetch has already run a check
		selIcheck(loc, data);
	} else if (selection.length === 1 && selection[0].type === 'folder') { // should only run check on 1 len items if folder (file items have already had another check done)
		selIcheck(loc, data);
	}

	// activate permission set to selectively enable/disable buttons and context menu options
	setLibPerms();
	updatePageGroupPackageButtons();
}

function updatePageGroupPackageButtons() {
	if (!buttons.exportPageGroups || !buttons.importPageGroups) return;
	const onlyPageGroups = selection.length > 0 && selection.every((entry) => entry.type === 'itemGroup');
	const folderCanCreate = buttons.newItemGroup && buttons.newItemGroup.isActive();
	const mayTransferPackages = window.pageGroupPackageAdmin === true;
	if (mode === 'browsing' && onlyPageGroups && mayTransferPackages) buttons.exportPageGroups.enable();
	else buttons.exportPageGroups.disable();
	if (mode === 'browsing' && folderCanCreate && mayTransferPackages) buttons.importPageGroups.enable();
	else buttons.importPageGroups.disable();
}

function selIcheck(loc, data) {
	startAjax('interactionCheck', {
		location: loc.folder,
		locInfo: loc,
		selInfo: data,
		libType: 'selection'
	}).then((res) => {
		if (res.error) {
			gui.library.clearClipboard();
		}
	});
}


function setLibPerms() {

	let permValue = {};
	if (window.permList === undefined) return;

	if (selection.length === 0) {
		permValue = permList['basePerm'];

	} else if (selection.length === 1) {
		permValue = Object.assign(permValue, permList['basePerm'], permList[parseInt(selection[0].dbId)]);

	} else {
		permValue = Object.assign(permList['basePerm'], permList[parseInt(selection[0].dbId)]);

		selection.forEach(element => {
			let entry = permList[element.dbId];
			for (const key in entry) {
				if (!['deleteSelection'].includes(key)) continue;
				const element = entry[key];
				if (element === false) {
					permValue[key] = false;
				} else {
					if (permValue[key] !== false) permValue[key] = element;
				}
			}
		});
		permValue['rename'] = false; // force renaming to always be disabled during multiple selection condition
	}

	let permArr = function() {
		let retVal = [];
		for (let fldItem in permList) {
			for (let pArr in permList[fldItem]) {
				if (retVal.indexOf(pArr) === -1) retVal.push(pArr);
			}
		}
		return retVal;
	}();

	if (permArr === undefined || permValue === undefined) return;

	permArr.forEach(buttonName => {
		if (buttonName === 'fetchLibrary' || buttonName === 'type' || buttonName === 'fetchIgPerm') return;

		if (permValue[buttonName] === true) {
			if (selection[0] !== undefined && selection[0].type === 'folder' && !['preview', 'editSelection', 'duplicate'].includes(buttonName)) {
				buttons[buttonName].enable();
			} else if (selection[0] === undefined && ['newFolder', 'newItemGroup'].includes(buttonName)) {
				buttons[buttonName].enable();
			}
		} else {
			buttons[buttonName].disable();
		}
	});
}

function groupSelChanged(sel, editWhenFinished) {
	//sel is the serverData.items[x] object
	if (typeof (editWhenFinished) === 'undefined') editWhenFinished = false;
	itemSelection = sel;
	if (itemSelection) {
		buttons.editSelection.enable();
		mayEditItem = true;
		buttons.duplicate.enable();
		buttons.deleteSelection.enable();
		buttons.rename.enable();
		if (itemSelection.publishedLocked === true) {
			buttons.editSelection.disable();
			buttons.deleteSelection.disable();
			buttons.rename.disable();
			mayEditItem = false;
		}
		cmApplySelectedPageReadOnlyState();
		gui.s3.show();
		$('#itemProperties').removeClass('blank');
		renderPageContentInteractions(sel.id);
		if (!serverData.item || serverData.item.id !== sel.id) {
			editOnData = editWhenFinished;
			startAjax('fetchItem', {
				id: sel.id,
				groupId: sel.groupId
			});
			gui.inlineWaitMessage.addClass('visible');
		} else if (editWhenFinished) {
			gui.inlineWaitMessage.removeClass('visible');
			editSelection('dblclick');
		}
	} else {
		buttons.editSelection.disable();
		mayEditItem = false;
		buttons.duplicate.disable();
		buttons.deleteSelection.disable();
		buttons.rename.disable();
		cmApplySelectedPageReadOnlyState(false);
		gui.inlineWaitMessage.removeClass('visible');
		$('#itemProperties').addClass('blank');
		renderPageContentInteractions(null);
	}
}

function cmIsPagePublishedLocked(page) {
	return !!(page && page.publishedLocked === true);
}

function cmApplySelectedPageReadOnlyState(forceState) {
	const isLocked = (typeof forceState === 'boolean') ? forceState : cmIsPagePublishedLocked(itemSelection);
	$('#itemProperties').toggleClass('cmLockedPageSelected', isLocked);

	if (gui.fields && gui.fields.linkedStimulusValue) {
		if (isLocked) {
			gui.fields.linkedStimulusValue.setText(cmSelectedLinkedStimulusLabel());
			gui.fields.linkedStimulusValue.show();
			if (gui.fields.dlStimuli) gui.fields.dlStimuli.hide();
		} else {
			gui.fields.linkedStimulusValue.hide();
		}
	}

	['useAsStimulus', 'archived', 'dlStimuli'].forEach((fieldName) => {
		const field = gui.fields && gui.fields[fieldName];
		if (!field) return;
		if (isLocked) {
			field.lock();
		} else if (fieldName !== 'dlStimuli') {
			field.unlock();
		}
	});
}

function cmSelectedLinkedStimulusLabel() {
	let linkedId = itemSelection && itemSelection.link;
	if (!linkedId && serverData.item && itemSelection && String(serverData.item.id) === String(itemSelection.id)) {
		linkedId = serverData.item.link;
	}
	if (!linkedId) {
		return UILANG.m('no stimulus linked');
	}
	const linkedItem = (serverData.items || []).find((item) => String(item.id) === String(linkedId));
	if (linkedItem) {
		return linkedItem.itemCode ? linkedItem.name + ' [' + linkedItem.itemCode + ']' : linkedItem.name;
	}
	const previewEntry = cmPagePreviewEntry(linkedId);
	if (previewEntry) {
		return previewEntry.code ? previewEntry.name + ' [' + previewEntry.code + ']' : previewEntry.name;
	}
	return UILANG.m('linked stimulus') + ' #' + linkedId;
}

function rename() {
	switch (mode) {
		case 'browsing':
			libraryRename(selection[0]);
			break;
		case 'editGroup':
			itemRename(itemSelection);
			break;
	}
}

function cmOpenSelectedPageRename() {
	if (mode !== 'editGroup' || !itemSelection) return;
	if (cmIsPagePublishedLocked(itemSelection)) {
		showMessage(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE));
		return;
	}
	itemRename(itemSelection);
}

function libraryRename(data, button, name) {
	if (!button) {
		const nameLabel = data.type === 'folder' ? UILANG.m('Folder name') : UILANG.m('Page group name');
		const dialogData = {
			buttons: [{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			}, {
				label: UILANG.m('OK'),
				'default': true,
				value: 'ok'
			}],
			datafields: ['dialogField1'],
			mandatory: ['dialogField1'], //disable OK button if field is empty or contains only whitespace
			blackList: {
				dialogField1: [data.name]
			}, //disable OK button if name has not been changed
			focus: 'dialogField1',
			values: {
				dialogField1: data.name
			},
			contents: '<div class="tmDialogForm">' +
				'<div class="tmDialogFormField"><label for="dialogField1">' + nameLabel + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
			'</div>',
			title: data.type === 'folder' ? UILANG.m('Rename folder') : UILANG.m('Rename page group'),
			width: 400,
			callback: libraryRename
		};
		new nxDialog('renameDialog', dialogData, [data]);

	}

	if (data.type === 'folder') {
		$("#dialogField1").inputFilter(function(value) {
			return /^[^\\]*$/.test(value);
		});
	}
	if (button === 'ok' && !name.match(/^\s*$/) && name !== data.name) {
		startAjax('renameGroupOrFolder', {
			name: name,
			type: data.type,
			id: data.dbId,
			location: loc.folder
		});
	}
}

function itemRename(data, button, name, itemCode) {
	if (data && data.publishedLocked === true) {
		showMessage(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE));
		return;
	}
	if (!button) {
		const dialogData = {
			buttons: [{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			}, {
				label: UILANG.m('OK'),
				'default': true,
				value: 'ok'
			}],
			datafields: ['dialogField1', 'dialogField2'],
			mandatory: ['dialogField1'], //disable OK button if name is empty or contains only whitespace
			focus: 'dialogField1',
			values: {
				dialogField1: data.name,
				dialogField2: data.itemCode
			},
			contents: '<div class="tmDialogForm">' +
				'<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Page name') + '</label><input class="iri" type="text" id="dialogField1" maxlength="200"></div>' +
				'<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Code') + '</label><input class="iri" type="text" id="dialogField2" maxlength="200"></div>' +
			'</div>',
			title: UILANG.m('Edit name and code'),
			width: 400,
			callback: itemRename
		};
		new nxDialog('renameDialog', dialogData, [data]);
	}
	if (button === 'ok' && (data.name !== name || data.itemCode !== itemCode)) {
		startAjax('renameItem', {
			name: name,
			itemCode: itemCode,
			id: data.id,
			groupId: serverData.group.id
		});
	}
}

function saveData(type) {
	switch (type) {
		case 'group':
			startAjax('saveItemGroup', serverData.group);
			break;
		case 'item':
			let itemData = cloneObj(serverData.item);
			delete itemData.listBadges;
			startAjax('saveItem', itemData);
			break;
	}
}

function updateMetaTagCounter(selector, count) {
	const label = count === 1 ? UILANG.m('meta tag') : UILANG.m('meta tags');
	$(selector).html(count + ' ' + label);
}

function refreshGroupMetaTags() {
	if (!gui.metaView || !serverData.group) return;
	const metaTags = serverData.group.info && typeof serverData.group.info === 'object' ? serverData.group.info : {};
	gui.metaView.setItems(metaTags, true);
	updateMetaTagCounter('#metaTbText', Object.keys(metaTags).length);
}

function addGroupMetaTag() {
	startAjax('fetchMetaTagSuggestions', {scope: 'itemGroups'})
		.then(function(res) {
			if (res && !res.error && gui.metaView) {
				gui.metaView.setSuggestions(res.suggestions || {});
			}
			gui.metaView.openNewDialog();
		});
}

function groupMetaChanged(deleted, id, currValue) {
	const helperObj = {};
	$.each(currValue, function(k, v) {
		helperObj[v.metakey] = v.metavalue;
	});
	serverData.group.info = helperObj;
	updateMetaTagCounter('#metaTbText', Object.keys(helperObj).length);
	saveData('group');
}

function fillDataFields() {
	updateItemsFromItem();
	gui.fields.itemName.getPropertyField().reset(findData('item', 'name'));
	const itemCode = findData('item', 'itemCode') ?? '';
	gui.fields.itemCode.getPropertyField().reset(itemCode);
	const itemCodeDisplay = $('#tfItemCode_disabled');
	const hasItemCode = String(itemCode).trim() !== '';
	itemCodeDisplay
		.toggleClass('cmEmptyItemCode', !hasItemCode)
		.text(hasItemCode ? itemCode : '<no code set>');
	const languageEnumeration = findData('item', 'languages');
	gui.fields.languages.getPropertyField().reset(languageEnumeration.join(", "));
	gui.fields.useAsStimulus.getPropertyField().reset(findData('item', 'metadata', 'useAsStimulus'));
	if (findData('item', 'metadata', 'useAsStimulus')) {
		gui.fields.dlStimuli.hide();
	} else {
		gui.fields.dlStimuli.show();
	}
	gui.fields.archived.getPropertyField().reset(findData('item', 'metadata', 'archived'));
	const linkedStimulus = findData('item', 'link');
	gui.fields.dlStimuli.getPropertyField().reset(linkedStimulus);
	renderPageComment(findData('item', 'metadata', 'comments'));
	renderPageContentInteractions(findData('item', 'id'));
	cmApplySelectedPageReadOnlyState();
}

function renderPageComment(comment) {
	const row = gui.fields.pageComment;
	const rowElement = row.getPropertyCell().closest('.jsInterfaceRow');
	const text = comment === null || typeof comment === 'undefined' ? '' : String(comment);
	if (text.trim() === '') {
		row.setLabel('');
		rowElement.addClass('noLabel');
		row.getPropertyField().setText(UILANG.m('No comments available.'));
		return;
	}
	rowElement.removeClass('noLabel');
	row.setLabel(`<b>${UILANG.m('Comments:')}</b>`);
	row.getPropertyField().setText(text);
}

function updateLibrary(list, path) {
	if (path) breadcrumbs = path;
	gui.library.setItems(list, breadcrumbs);
}

function newFolder(sender, button, nfName) {
	if (loc.path.length > 14) {
		showMessage(UILANG.m('You have reached the maximum number of allowed folder levels in the file manager. It is not possible to create a folder here!'));
		return;
	}
	if (!button) {
		let nfContent = '<div class="tmDialogForm">' +
			'<div class="tmDialogFormField"><label for="newFolderName">' + UILANG.m('Folder name') + '</label><input type="text" maxlength="200" id="newFolderName"></div>' +
		'</div>';

		const dialogData = {
			buttons: [{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			}, {
				label: UILANG.m('OK'),
				'default': true,
				value: 'ok'
			}],
			datafields: ['newFolderName'],
			mandatory: ['newFolderName'],
			focus: 'newFolderName',
			contents: nfContent,
			title: UILANG.m('New folder'),
			width: 400,
			callback: newFolder
		};

		new nxDialog('newFolderDialog', dialogData, arguments);
	}

	$("#newFolderName").inputFilter(function(value) {
		return /^[^\\]*$/.test(value);
	});

	if (button === 'ok' && nfName !== '') {

		startAjax('newFolder', {
			location: loc.folder,
			name: nfName,
			showBlocked: showBlocked
		});
	}
	if (button === 'ok' && nfName === '') {
		showMessage(UILANG.m('You need to enter a name for the new folder!'));
	}
}

function newItemGroup(sender, button, name) {
	if (!button) {
		const dialogData = {
			buttons: [{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			}, {
				label: UILANG.m('OK'),
				'default': true,
				value: 'ok'
			}],
			datafields: ['dialogField1'],
			mandatory: ['dialogField1'],
			focus: 'dialogField1',
			values: {},
			contents: '<div class="tmDialogForm">' +
				'<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Page group name') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
			'</div>',
			title: UILANG.m('New item group'),
			width: 400,
			callback: newItemGroup
		};
		if (name) {
			dialogData.values.dialogField1 = name;
		}
		new nxDialog('newItemGroupDialog', dialogData, [sender]);
	}
	if (button === 'ok' && name !== '') {
		startAjax('newItemGroup', {
			location: loc.folder,
			name: name,
			showBlocked: showBlocked
		});
	}
}

function moveObjects(sources, target) {
	startAjax('moveObjects', {
		location: loc.folder,
		sources: sources,
		target: target,
		showBlocked: showBlocked
	});
}

function deleteSelection() {
	switch (mode) {
		case 'browsing':
			deleteObjects({
				location: loc.folder,
				selection: selection
			});
			break;
		case 'editGroup':
			deleteObjects(itemSelection);
			break;
	}
}

function deleteObjects(sel, button) {
	if (!sel || sel.selection?.length === 0) {
		return;
	}
	let dialogData;
	let message;
	switch (mode) {
		case 'browsing':
			if (!button) {
				message = '<ul class="deleteList">';
				let foldersInSelection = false;
				for (let i in sel.selection) {
					const obj = sel.selection[i];
					let type = 'typefile';
					if (obj.type === 'folder') {
						foldersInSelection = true;
						type = 'folder';
					}
					message += `<li class="${type}">${obj.label}</li>`;
				}
				message += '</ul>';
				message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('really_delete_item') + '</p></div>' + message;
				if (foldersInSelection) {
					message += '<p class="deleteConfirmWarning">' + UILANG.m('warning_recursive') + '</p>';
				}
				message += '</div>';
				dialogData = {
					buttons: [{
						label: UILANG.m('cancel'),
						'cancel': true,
						'default': true,
						value: 'cancel'
					}, {
						label: UILANG.m('Delete'),
						value: 'ok'
					}],
					contents: message,
					width: 640,
					callback: deleteObjects,
					title: UILANG.m('Delete selection'),
					icon: "../images/warning.png",
					iconWidth: 64
				};
				new nxDialog('deleteDialog', dialogData, arguments);
			}
			if (button === 'ok') {
				sel.showBlocked = showBlocked;
				startAjax('deleteSelection', sel);
			}
			break;
		case 'editGroup':
			if (!sel) return;
			if (sel.publishedLocked === true) {
				showMessage(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE));
				return;
			}
			if (!button) {
				message = '<div class="deleteConfirm">';
				if (serverData.items.some(page => page.link === sel.id)) {
					message += '<p class="deleteConfirmWarning">' + UILANG.m('This page is linked as a stimulus to at least one other page. Deleting it will remove all existing links.') + '</p>';
				}
				message += '<div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following test page?') + '</p></div><ul class="deleteList"><li>' + sel.name + '</li></ul></div>';
				dialogData = {
					buttons: [{
						label: UILANG.m('cancel'),
						'cancel': true,
						'default': true,
						value: 'cancel'
					}, {
						label: UILANG.m('Delete'),
						value: 'ok'
					}],
					contents: message,
					width: 450,
					callback: deleteObjects,
					title: UILANG.m('Delete selection'),
					icon: "../images/warning.png",
					iconWidth: 64
				};
				new nxDialog('deleteDialog', dialogData, arguments);
			}
			if (button === 'ok') {
				startAjax('deleteItem', {
					id: sel.id,
					groupId: serverData.group.id
				});
			}
			break;
	}
}

function findData() {
	let i;
	let tmpData;
	if (arguments.length === 0) return;
	if (typeof (serverData[arguments[0]]) !== 'undefined') {
		tmpData = serverData[arguments[0]];
		for (i = 1; i < arguments.length; i++) {
			if (typeof (tmpData[arguments[i]]) !== 'undefined') {
				tmpData = tmpData[arguments[i]];
			} else {
				tmpData = null;
				return;
			}
		}
	}
	return tmpData;
}

function newItem(sender, button, name, itemCode) {
	if (!button) {
		const dialogData = {
			buttons: [{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			}, {
				label: UILANG.m('OK'),
				'default': true,
				value: 'ok'
			}],
			datafields: ['dialogField1', 'dialogField2'],
			mandatory: ['dialogField1'],
			focus: 'dialogField1',
			values: {},
			contents: '<div class="tmDialogForm">' +
				'<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Page name') + '</label><input class="nii" type="text" id="dialogField1" maxlength="200"></div>' +
				'<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Code') + ' (' + UILANG.m('optional') + ')</label><input class="nii" type="text" id="dialogField2" maxlength="200"></div>' +
			'</div>',
			title: UILANG.m('New page'),
			width: 400,
			callback: newItem
		};
		if (name) {
			dialogData.values.dialogField1 = name;
		}
		new nxDialog('newItemDialog', dialogData, [sender]);
	}
	if (button === 'ok') {
		if (name === '') {
			showMessage(UILANG.m('missing_name'));
			return;
		}
		startAjax('newItem', {
			groupId: serverData.group.id,
			itemCode: itemCode,
			name: name,
			location: loc.folder
		});
	}
}

function duplicate() {
	switch (mode) {
		case 'browsing':
			const sources = {
				folders: [],
				files: []
			};
			sources.files.push(serverData.group.id);
			pasteItemGroup(sources, loc.folder);
			break;
		case 'editGroup':
			duplicateItem();
			break;
	}
}

function pasteItemGroup(sources, target) {
	startAjax('duplicateItemGroup', {
		location: loc.folder,
		sources: sources,
		target: target,
		showBlocked: showBlocked
	});
}

function duplicateItem(data, button, name, code) {
	let itemCode;
	let id;
	if (data) {
		itemCode = data.itemCode;
		name = name || data.name;
		id = data.id;
	} else {
		itemCode = code || serverData.item.itemCode;
		id = serverData.item.id;
		name = name || serverData.item.name;
	}
	if (!button) {
		const dialogData = {
			buttons: [{
				label: UILANG.m('cancel'),
				'cancel': true,
				value: 'cancel'
			}, {
				label: UILANG.m('OK'),
				'default': true,
				value: 'ok'
			}],
			datafields: ['dialogField1', 'dialogField2'],
			mandatory: ['dialogField1'],
			values: {
				dialogField1: name,
				dialogField2: itemCode
			},
			focus: 'dialogField1',
			contents: '<div class="tmDialogForm">' +
				'<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Page name') + '</label><input class="dii" type="text" id="dialogField1" maxlength="200"></div>' +
				'<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Code') + ' (' + UILANG.m('optional') + ')</label><input class="dii" type="text" id="dialogField2" maxlength="200"></div>' +
			'</div>',
			title: UILANG.m('Duplicate page'),
			width: 450,
			callback: duplicateItem
		};
		new nxDialog('duplicateItemDialog', dialogData, [data]);
	}
	if (button === 'ok') {
		// FYI: The user who is doing the duplication will be the owner of the newly copied object
		startAjax('duplicateItem', {
			groupId: serverData.group.id,
			itemCode: code,
			name: name,
			id: id,
			location: loc.folder
		});
	}
}


function archiveItem(data) {
	let pageId = data.id;
}


function contextMenuItemList(cmd, options) {
	let sender;
	let obj;
	switch (cmd) {
		case 'newItem':
			newItem('contextMenu');
			break;
		case 'edit':
			sender = gui.itemList.getId($(options.$trigger));
			gui.itemList.setSelection([sender]);
			obj = gui.itemList.getItem(sender);
			if (obj && obj.publishedLocked === true) {
				showMessage(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE));
				break;
			}
			groupSelChanged(gui.itemList.getSelection(), true);
			break;
		case 'duplicate':
			sender = gui.itemList.getId($(options.$trigger));
			obj = gui.itemList.getItem(sender);
			duplicateItem(obj);
			break;
		case 'delete':
			sender = gui.itemList.getId($(options.$trigger));
			obj = gui.itemList.getItem(sender);
			if (obj && obj.publishedLocked === true) {
				showMessage(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE));
				break;
			}
			deleteObjects(obj);
			break;
		case 'rename':
			sender = gui.itemList.getId($(options.$trigger));
			obj = gui.itemList.getItem(sender);
			itemRename(obj);
			break;
	}
}

function cursorUp() {
	switch (mode) {
		case 'browsing':
			gui.library.filerKeyUp();
			break;

		case 'editGroup':
			gui.itemList.moveUp();
			break;

		case 'eUgSelList':
			eUgSelList.moveUp();
			break;
	}
}

function cursorDown() {
	switch (mode) {

		case 'browsing':
			gui.library.filerKeyDown();
			break;

		case 'editGroup':
			gui.itemList.moveDown();
			break;

		case 'eUgSelList':
			eUgSelList.moveDown();
			break;
	}
}

function cursorShiftUp() {
	if (mode !== 'browsing') return;
	gui.library.filerShiftKeyUp();
}

function cursorShiftDown() {
	if (mode !== 'browsing') return;
	gui.library.filerShiftKeyDown();
}

function deleteKey() {
	if (mode === 'browsing' && selection.length > 0) {
		deleteSelection('delKey');
	}
}

function ctrlA() {
	if (mode === 'browsing') {
		gui.library.selectAll();
		gui.library.getSelect();

		if (showBlocked) {
			$('#filez_idSuffix').children().each(function(i, o) {
				if ($(o).hasClass("filerBlocked")) $(o).removeClass('ui-selected');
			});
		}
	}
}

function mediaManager(){
	new jsMediaPlugin('oasysImagePlugin', {
		mediaTypes: 'all',
		hideOptions: true,
		globalManager: true
	});
}


function preview() {
	if (serverData.items.length === 0) {
		showMessage(UILANG.m('empty_group'));
		return;
	}
	const pForm = document.forms['previewForm'];
	pForm.action.value = 'preview';
	let data;
	data = {
		previewMode: 'itemGroup',
		groupId: serverData.group.id,
		itemId: fetchFromObjPath(serverData, ['item', 'id']),
		language: settings.interfaceLanguage
	};
	if (!data['itemId']) delete data['itemId'];
	pForm.data.value = JSON.stringify(data);
	pForm.submit();
}

//search functionality
function clickSearch() {
	gui.library.filerSearch('', {metaSearch: true});
}

function exportPageGroups() {
	const groupIds = selection.filter((entry) => entry.type === 'itemGroup').map((entry) => Number(entry.dbId));
	if (groupIds.length === 0 || groupIds.length !== selection.length) return;
	startAjax('preparePageGroupExport', {groupIds: groupIds}).then((res) => {
		if (!res || res.error || !res.data || !res.data.downloadUrl) return;
		const link = document.createElement('a');
		link.href = res.data.downloadUrl;
		link.style.display = 'none';
		document.body.appendChild(link);
		link.click();
		link.remove();
		const filename = $('<div>').text(res.data.filename || 'oasys-page-groups.zip').html();
		new nxDialog('pageGroupExportReady', {
			title: UILANG.m('Export ready'),
			type: 'success',
			width: 470,
			contents: `<div class="cmPackageExportReady"><strong>${UILANG.m('Page-group package created')}</strong><span>${UILANG.m('Your download has started:')} <code>${filename}</code></span></div>`,
			buttons: [{label: UILANG.m('OK'), value: 'ok', 'default': true, cancel: true}]
		});
	});
}

function openPageGroupPackageImport() {
	const uploadLimit = getPageGroupPackageUploadLimit();
	const limitHint = uploadLimit > 0
		? `${UILANG.m('The effective PHP upload limit is')} <strong>${formatPageGroupPackageBytes(uploadLimit)}</strong>.`
		: '';
	new nxDialog('pageGroupPackageImport', {
		title: UILANG.m('Import page groups'),
		width: 560,
		contents: `
			<div class="cmPackageImportDialog">
				<div class="cmPackageImportIcon">&#8593;</div>
				<div>
					<strong>${UILANG.m('Select an OASYS page-group package')}</strong>
					<span>${UILANG.m('The package will be reviewed before any page groups are created. Import is cancelled if a page group with the same name already exists.')}</span>
					${limitHint ? `<span class="cmPackageUploadLimit">${limitHint}</span>` : ''}
				</div>
				<label class="cmPackageFilePicker" for="cmPageGroupPackageFile">${UILANG.m('Choose ZIP package')}</label>
				<input id="cmPageGroupPackageFile" type="file" accept="application/zip,.zip" hidden>
				<div id="cmPageGroupPackageName" class="cmPackageFileName">${UILANG.m('No package selected')}</div>
			</div>`,
		buttons: [
			{label: UILANG.m('Cancel'), value: 'cancel', cancel: true},
			{label: UILANG.m('Review package'), value: 'review', 'default': true}
		],
		callback: (button) => {
			if (button !== 'review') return;
			const file = $('#cmPageGroupPackageFile').get(0)?.files?.[0];
			if (!file) {
				showMessage(UILANG.m('Select an OASYS page-group ZIP package.'));
				return;
			}
			if (uploadLimit > 0 && file.size > uploadLimit) {
				showMessage(`${UILANG.m('The selected package is')} <strong>${formatPageGroupPackageBytes(file.size)}</strong>. ${UILANG.m('PHP currently accepts uploads up to')} <strong>${formatPageGroupPackageBytes(uploadLimit)}</strong>. ${UILANG.m('Increase upload_max_filesize and post_max_size, then restart the web server before importing this package.')}`);
				return;
			}
			stagePageGroupPackage(file);
		}
	});
	setTimeout(() => {
		$('#cmPageGroupPackageFile').off('change.cmPackage').on('change.cmPackage', function() {
			const file = this.files && this.files[0];
			$('#cmPageGroupPackageName').text(file ? file.name : UILANG.m('No package selected'));
		});
	}, 0);
}

function getPageGroupPackageUploadLimit() {
	const limits = [Number(settings?.upload_max_filesize), Number(settings?.post_max_size)].filter((limit) => Number.isFinite(limit) && limit > 0);
	return limits.length ? Math.min(...limits) : 0;
}

function formatPageGroupPackageBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / Math.pow(1024, index);
	return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function getPageGroupPackageError(response, fallback) {
	return response?.fatalError || response?.error || fallback;
}

function showPageGroupPackageError(response, fallback) {
	const message = typeof response === 'string' ? response : getPageGroupPackageError(response, fallback);
	showMessage(`<strong>${UILANG.m('action_not_completed')}</strong><br><p>${message}</p>`);
}

function stagePageGroupPackage(file) {
	const formData = new FormData();
	formData.append('action', 'stagePageGroupPackage');
	formData.append('data', JSON.stringify({location: loc.folder}));
	formData.append('package', file);
	waitDialog.show('stagePageGroupPackage');
	$.ajax({
		url: 'itemActions.php',
		type: 'POST',
		data: formData,
		processData: false,
		contentType: false,
		dataType: 'json',
		timeout: 1800000,
		global: false,
		success: $.noop,
		error: $.noop
	}).done((res) => {
		waitDialog.hide('stagePageGroupPackage');
		if (!res || res.error || res.fatalError || !res.data?.token || !res.data?.summary) {
			showPageGroupPackageError(res, UILANG.m('The page-group package could not be reviewed.'));
			return;
		}
		showPageGroupPackageReview(res.data);
	}).fail((xhr) => {
		waitDialog.hide('stagePageGroupPackage');
		let error = xhr.responseJSON && xhr.responseJSON.error;
		if (!error && xhr.responseText) {
			try {
				error = JSON.parse(xhr.responseText).error;
			} catch (e) {}
		}
		showPageGroupPackageError(error, UILANG.m('The page-group package could not be reviewed.'));
	});
}

function showPageGroupPackageReview(packageData) {
	const summary = packageData.summary || {};
	const groupCount = Number(summary.groupCount) || 0;
	const pageCount = Number(summary.pageCount) || 0;
	const mediaCount = Number(summary.mediaCount) || 0;
	const groupRows = (summary.groups || []).map((group) => {
		const name = $('<div>').text(group.name || '').html();
		const pageCount = Number(group.pageCount) || 0;
		const mediaCount = Number(group.mediaCount) || 0;
		return `<li><strong>${name}</strong><span>${pageCount} ${UILANG.m(pageCount === 1 ? 'test page' : 'test pages')} &middot; ${mediaCount} ${UILANG.m(mediaCount === 1 ? 'media file' : 'media files')} &middot; ${formatPageGroupPackageBytes(Number(group.mediaBytes) || 0)}</span></li>`;
	}).join('');
	new nxDialog('pageGroupPackageReview', {
		title: UILANG.m('Review page-group import'),
		width: 620,
		contents: `
			<div class="cmPackageReview">
				<strong>${UILANG.m('Ready to import')}</strong>
				<span>${UILANG.m('The following content will be created in the current folder:')}</span>
				<div class="cmPackageReviewTotals"><span>${groupCount} ${UILANG.m(groupCount === 1 ? 'page group' : 'page groups')}</span><span>${pageCount} ${UILANG.m(pageCount === 1 ? 'test page' : 'test pages')}</span><span>${mediaCount} ${UILANG.m(mediaCount === 1 ? 'media file' : 'media files')} (${formatPageGroupPackageBytes(Number(summary.mediaBytes) || 0)})</span></div>
				<ul>${groupRows}</ul>
				<small>${UILANG.m('The import will be cancelled if a page group with the same name now exists in the destination folder.')}</small>
			</div>`,
		buttons: [
			{label: UILANG.m('Cancel'), value: 'cancel', cancel: true},
			{label: UILANG.m('Start import'), value: 'import', 'default': true}
		],
		callback: (button) => {
			if (button === 'import') importStagedPageGroupPackage(packageData.token);
		}
	});
}

function importStagedPageGroupPackage(token) {
	waitDialog.show('importStagedPageGroupPackage');
	$.ajax({
		url: 'itemActions.php',
		type: 'POST',
		data: {action: 'importStagedPageGroupPackage', data: JSON.stringify({location: loc.folder, token: token})},
		dataType: 'json',
		timeout: 1800000,
		global: false,
		success: $.noop,
		error: $.noop
	}).done((res) => {
		waitDialog.hide('importStagedPageGroupPackage');
		if (!res || res.error || res.fatalError) {
			showPageGroupPackageError(res, UILANG.m('The page-group package could not be imported.'));
			return;
		}
		const imported = res.data || {};
		gui.statusBar.setStatus(`${imported.groupCount || 0} ${UILANG.m('page group(s) imported')}`, 4000, '#1f6b4d');
		startAjax('fetchLibrary', {location: loc.folder, showBlocked: showBlocked});
	}).fail((xhr) => {
		waitDialog.hide('importStagedPageGroupPackage');
		let error = xhr.responseJSON && xhr.responseJSON.error;
		if (!error && xhr.responseText) {
			try {
				error = JSON.parse(xhr.responseText).error;
			} catch (e) {}
		}
		showPageGroupPackageError(error, UILANG.m('The page-group package could not be imported.'));
	});
}

/* keep track of lock state in database */

function updateLock() {
	switch (mode) {
		case "editGroup":
			if (lockedPage === null) {
				return;
			} else {
				startAjax('lockItem', { id: lockedPage, lock: false, update: true });
				lockedPage = null;
			}
			break;
		case "editPage":
			if (lockedPage !== null) {
				startAjax('lockItem', { id: lockedPage, lock: true, update: true });
				return;
			} else {
				lockedPage = serverData.item.id;
				startAjax('lockItem', { id: lockedPage, lock: true, update: false });
			}
			break;
		default:
			return;
	}
}

function onUnload() {
	if ("sendBeacon" in navigator && lockedPage !== null) {
		const beaconData = {
			id: lockedPage,
			lock: false,
			update: true
		};
		const fd = new FormData();
		fd.append('action', 'lockItem');
		fd.append('data', JSON.stringify(beaconData));
		navigator.sendBeacon("itemActions.php", fd);
	}
}

/* animations */
function hideSection(s1, s2, f, quick) {
	if (!(s2 instanceof Array)) {
		s2 = [s2];
	}
	let l = s2[0].position().left;
	let p = $('#UI').css('padding-left');
	p = parseInt(p.replace(/px/, ''));
	l = l - p;
	if (quick || settings.disableAnimations) {
		s1.hide();
		for (let i in s2) {
			s2[i].data('left', l);
			s2[i].css('left', l + 'px');
			s2[i].css({
				left: '0px'
			});
			if (f) f.call(this);
		}
	} else {
		jsph.forceHoverUpdates(true);
		animationPlaying = true;
		s1.fadeOut(250, () => {
			for (let i in s2) {
				s2[i].data('left', l);
				s2[i].css('left', l + 'px');
				s2[i].animate({
					left: '0px'
				}, 400, () => {
					animationPlaying = false;
					jsph.forceHoverUpdates(false);
					if (f) f.call(this);
				});
			}
		});
	}
}

function showSection(s1, s2, f, quick) {
	if (!(s2 instanceof Array)) {
		s2 = [s2];
	}
	for (let i = 0; i < s2.length; i++) {
		const l = s2[i].data('left');
		if (i === 0) {
			if (quick || settings.disableAnimations) {
				s2[i].css({
					left: l + 'px'
				});
				s1.show();
				if (f) f.call(this);
				s2[i].css('left', '0px');
			} else {
				jsph.forceHoverUpdates(true);
				animationPlaying = true;
				s2[i].animate({
					left: l + 'px'
				}, 400, function(section2, section1) {
					section1.fadeIn(250, f);
					section2.css('left', '0px');
					animationPlaying = false;
					jsph.forceHoverUpdates(false);
				}.bind(this, s2[i], s1));
			}
		} else {
			if (quick || settings.disableAnimations) {
				s2[i].css({
					left: l + 'px'
				});
				s2[i].css('left', '0px');
			} else {
				jsph.forceHoverUpdates(true);
				animationPlaying = true;
				s2[i].animate({
					left: l + 'px'
				}, 400, function(section2) {
					section2.css('left', '0px');
					animationPlaying = false;
					jsph.forceHoverUpdates(false);
				}.bind(this, s2[i]));
			}
		}
	}
}

function hideMenu(quick) {
	$("#statusBar strong").addClass('statusBarTextShift');
	if (quick || settings.disableAnimations) {
		$('#viewsPanel').hide();
		$('#interfaceFrame').css('max-width', '100%');
		$('#mainMenu').css({
			width: '0px'
		});
	} else {
		$('#viewsPanel').fadeOut(100, function() {
			$('#interfaceFrame').css('max-width', '100%');
			$('#mainMenu').animate({
				width: '0px'
			}, 400);
		});
	}
}

function showMenu(quick) {
	$("#statusBar strong").removeClass('statusBarTextShift');
	if (quick || settings.disableAnimations) {
		$('#mainMenu').css({
			width: '200px'
		});
		$('#viewsPanel').show();
		$('#interfaceFrame').css('max-width', 'calc(100% - 200px)');
	} else {
		$('#mainMenu').animate({
			width: '200px'
		}, 400, function() {
			$('#viewsPanel').fadeIn();
			$('#interfaceFrame').css('max-width', 'calc(100% - 200px)');
		});
	}
}

function paintBlocked(oData) {
	for (const a of Object.values(oData)) {
		if (a.isBlocked) {
			let iv1 = setInterval(() => {
				/* verify filer list is visible and available */
				if ($(`#_idSuffix${a.id}`).length === 1) {
					$(`#_idSuffix${a.id}`).off();
					$(`#_idSuffix${a.id}`).removeClass("droppable selectable ui-draggable ui-draggable-handle context").addClass("filerBlocked");
					$(`#_idSuffix${a.id}`).prop('title', UILANG.m("You do not have access to this object."));
					clearInterval(iv1);
				}
			}, 0);
		}
	}
}

function updateStimulusList() {
	let data = serverData.items.filter(page => page.metadata.useAsStimulus === true);
	gui.fields.dlStimuli.getPropertyCell().closest('.jsInterfaceRow').toggleClass('cmNoStimulusChoices', data.length === 0);
	let elements;
	if (data.length > 0) {
		elements = [{ label: '', value: null }];
		for (let row of data) {
			let lbl = row['name'];
			if (row['itemCode']) {
				lbl += ` [${row['itemCode']}]`;
			}
			elements.push({ value: row['id'], label: lbl });
		}
		gui.fields.dlStimuli.getPropertyField().unlock();
	} else {
		//if no stimuli are defined, we don't need an element with a null value, otherwise the
		//dropdown list will show an empty line instead of the noChoiceTitle
		elements = [];
		gui.fields.dlStimuli.getPropertyField().lock();
	}
	gui.fields.dlStimuli.getPropertyField().setElements(elements);
	if (cmIsPagePublishedLocked(itemSelection)) {
		gui.fields.dlStimuli.lock();
	}
}

function onStimulusSelect(value) {
	serverData.item.link = value;
	saveData('item');
}

function updateItemsFromItem() {
	let tempObj = fetchObjectFromArray(serverData.items, { id: serverData.item.id }, true);
	if (tempObj !== null) {
		for (let i in tempObj) {
			tempObj[i] = serverData.item[i];
		}
	}
	cmPrepareItemListItems([tempObj]);
	gui.itemList.updateItem(tempObj);
	updateStimulusList();
}

function cmShowBrowsePreviewSection() {
	if (mode !== 'browsing' || !gui.s10) return;
	gui.s2.hide();
	gui.s3.hide();
	gui.s10.show();
}

function cmHideBrowsePreviewSection() {
	if (gui.s10) gui.s10.hide();
}

function renderContentPreviewLoading() {
	serverData.preview = null;
	$('#contentPreviewContent').addClass('tmPreviewBlank').html('<div class="tmPreviewBlank">' + UILANG.m('Loading preview ...') + '</div>');
}

function cmPreviewEscape(value) {
	return $('<div>').text(value === null || typeof value === 'undefined' ? '' : String(value)).html();
}

function cmPreviewFormatDateTime(value) {
	if (!value) return UILANG.m('No backend edit recorded yet');
	const normalized = String(value).replace('T', ' ');
	const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::\d{2})?/);
	if (match) return match[3] + '.' + match[2] + '.' + match[1] + ' ' + match[4];
	return value;
}

function cmPreviewLastChange(lastBackendEdit) {
	if (!lastBackendEdit) return UILANG.m('No backend edit recorded yet');
	const user = lastBackendEdit.userName || UILANG.m('deleted');
	return UILANG.m('Last change:') + ' ' + cmPreviewFormatDateTime(lastBackendEdit.ts) + ' - ' + cmPreviewEscape(user);
}

function cmPreviewMetaTags(metaTags) {
	const keys = metaTags && typeof metaTags === 'object' ? Object.keys(metaTags) : [];
	if (keys.length === 0) return '<div class="tmPreviewMetaTags"><div class="tmPreviewEmpty">' + UILANG.m('No meta tags') + '</div></div>';
	keys.sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
	return '<div class="tmPreviewMetaTags">' + keys.map((key) => {
		const single = metaTags[key] === '';
		const value = single ? UILANG.m('single tag') : metaTags[key];
		return '<div><span>' + cmPreviewEscape(key) + '</span><strong' + (single ? ' class="tmPreviewSingleTag"' : '') + '>' + cmPreviewEscape(value) + '</strong></div>';
	}).join('') + '</div>';
}

function cmPreviewTestUsageLabel(testUsage) {
	if (!testUsage || testUsage.total === 0) return UILANG.m('Not used in tests');
	return testUsage.total + ' ' + UILANG.m('tests') + ' / ' +
		(testUsage.draft || 0) + ' ' + UILANG.m('draft') + ' / ' +
		(testUsage.published || 0) + ' ' + UILANG.m('published');
}

function cmPreviewMediaIcon(type) {
	type = String(type || '').toLowerCase();
	if (['mp3', 'wav', 'ogg', 'audio'].includes(type)) return '../inc/filer/images/audio.svg';
	if (['mp4', 'webm', 'mov', 'video'].includes(type)) return '../inc/filer/images/video.svg';
	if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'image'].includes(type)) return '../inc/filer/images/image.svg';
	return '../inc/filer/images/listDocuments.png';
}

function cmPreviewLockIcon(page) {
	if (!page.publishedLocked) return '';
	return '<span class="cmPreviewLockIcon" title="' + cmPreviewEscape(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE)) + '">&#128274;</span>';
}

function cmPreviewStimulusIcon(page) {
	if (!page.isStimulus) return '';
	return '<span class="cmPreviewStimulusIcon" title="' + cmPreviewEscape(UILANG.m('Stimulus page')) + '">S</span>';
}

function cmItemListBadges(item) {
	const badges = [];
	if (item && item.metadata && item.metadata.useAsStimulus === true) {
		badges.push('<span class="itemSelectorStateIcon itemSelectorStimulusIcon" title="' + cmPreviewEscape(UILANG.m('Stimulus page')) + '">S</span>');
	}
	if (item && item.publishedLocked === true) {
		badges.push('<span class="itemSelectorStateIcon itemSelectorLockIcon" title="' + cmPreviewEscape(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE)) + '">&#128274;</span>');
	}
	return badges.join('');
}

function cmPrepareItemListItems(items) {
	if (!Array.isArray(items)) return items;
	items.forEach((item) => {
		if (!item) return;
		item.listBadges = cmItemListBadges(item);
	});
	return items;
}

function cmPreviewInteractionCount(page) {
	const interactions = page && page.interactions && typeof page.interactions === 'object' ? page.interactions : {};
	return Object.values(interactions).reduce((total, val) => total + (Number(val) || 0), 0);
}

function cmPreviewPagesCard(pages) {
	if (!Array.isArray(pages) || pages.length === 0) {
		return '<div class="tmPreviewCard tmPreviewStructureCard"><h3>' + UILANG.m('Pages') + '</h3><div class="tmPreviewEmpty">' + UILANG.m('No pages in this group') + '</div></div>';
	}
	const activeCount = pages.filter((page) => !page.archived).length;
	const archivedCount = pages.length - activeCount;
	const lockedCount = pages.filter((page) => page.publishedLocked).length;
	const sortedPages = pages.slice().sort((a, b) => {
		if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
		const nameOrder = String(a.name || '').localeCompare(String(b.name || ''), undefined, {
			sensitivity: 'base',
			numeric: true
		});
		if (nameOrder !== 0) return nameOrder;
		return Number(a.id || 0) - Number(b.id || 0);
	});
	let archivedDividerShown = false;
	const rows = sortedPages.map((page, index) => {
		const details = [];
		if (page.code) details.push(UILANG.m('Code') + ': ' + page.code);
		details.push((page.languages || []).length ? UILANG.m('Languages') + ': ' + page.languages.join(', ') : UILANG.m('No languages'));
		if (page.linkedStimulusName) details.push(UILANG.m('Linked stimulus') + ': ' + page.linkedStimulusName);
		if (page.archived) details.push(UILANG.m('archived'));
		const tests = cmPreviewTestUsageLabel(page.testUsage);
		const interactionCount = cmPreviewInteractionCount(page);
		const classes = [
			'tmPreviewStructureRow',
			'cmPreviewPageRow',
			page.publishedLocked ? 'is-locked' : '',
			page.isStimulus ? 'is-stimulus' : ''
		].filter(Boolean).join(' ');
		const divider = page.archived && !archivedDividerShown ? '<div class="cmPreviewArchivedDivider">' + UILANG.m('Archived pages') + '</div>' : '';
		if (page.archived) archivedDividerShown = true;
		return divider + '<div class="' + classes + '">' +
			'<div class="cmPreviewPageMarker"><div class="tmPreviewStructureNo">' + (index + 1) + '</div><div class="cmPreviewPageBadges">' + cmPreviewStimulusIcon(page) + cmPreviewLockIcon(page) + '</div></div>' +
			'<div class="tmPreviewStructureMain"><strong>' + cmPreviewEscape(page.name) + '</strong>' +
			'<span>' + details.map(cmPreviewEscape).join(' | ') + '</span>' +
			'<em>' + cmPreviewEscape(tests) + '</em></div>' +
			'<button type="button" class="cmPreviewInteractionButton" data-page-id="' + page.id + '"><strong>' + interactionCount + '</strong><span>' + UILANG.m('interactions') + '</span></button>' +
			'</div>';
	}).join('');
	return '<div class="tmPreviewCard tmPreviewStructureCard cmPreviewPagesCard">' +
		'<h3>' + UILANG.m('Pages') + '</h3>' +
		'<div class="tmPreviewStructureSummary"><strong>' + pages.length + ' ' + UILANG.m('pages') + '</strong><span>' + activeCount + ' ' + UILANG.m('active') + ' / ' + archivedCount + ' ' + UILANG.m('archived') + ' / ' + lockedCount + ' ' + UILANG.m('locked') + '</span></div>' +
		'<div class="tmPreviewStructureList">' + rows + '</div>' +
		'</div>';
}

function cmPreviewMediaCard(media) {
	media = media || { total: 0, usedCount: 0, unusedCount: 0, byType: {}, used: [], unused: [] };
	const byType = media.byType || {};
	const typeRows = Object.keys(byType).map((type) => {
		const stats = byType[type];
		return '<button type="button" class="cmPreviewMediaType" data-media-type="' + cmPreviewEscape(type) + '"><img src="' + cmPreviewMediaIcon(type) + '" alt=""><strong>' + cmPreviewEscape(type) + '</strong><span>' + stats.total + ' ' + UILANG.m('total') + ' / ' + stats.used + ' ' + UILANG.m('used') + ' / ' + stats.unused + ' ' + UILANG.m('unused') + '</span></button>';
	}).join('') || '<div class="tmPreviewEmpty">' + UILANG.m('No uploaded media') + '</div>';
	return '<div class="tmPreviewCard cmPreviewMediaCard">' +
		'<h3>' + UILANG.m('Media') + '</h3>' +
		'<div class="cmPreviewMediaStats"><button type="button" data-media-list="uploaded"><span>' + UILANG.m('Uploaded') + '</span><strong>' + media.total + '</strong></button><button type="button" data-media-list="used"><span>' + UILANG.m('Used') + '</span><strong>' + media.usedCount + '</strong></button><button type="button" data-media-list="unused"><span>' + UILANG.m('Unused') + '</span><strong>' + media.unusedCount + '</strong></button></div>' +
		'<div class="cmPreviewMediaTypes">' + typeRows + '</div>' +
		'</div>';
}

function cmPreviewMediaItems(kind) {
	const media = (serverData.preview && serverData.preview.media) || {};
	if (kind === 'used') return media.used || [];
	if (kind === 'unused') return media.unused || [];
	if (String(kind || '').startsWith('type:')) {
		const type = String(kind).substring(5);
		return [...(media.used || []), ...(media.unused || [])].filter((item) => String(item.filetype) === type);
	}
	return [...(media.used || []), ...(media.unused || [])];
}

function cmPreviewMediaUrl(item) {
	if (!item || !item.id || !item.uuid) return '';
	return 'fetchMediaFile.php?fileid=' + encodeURIComponent(item.id) + '&checksum=' + encodeURIComponent(item.uuid);
}

function cmPreviewMediaUsage(item) {
	const pages = Array.isArray(item.usedPages) ? item.usedPages : [];
	if (pages.length === 0) return '<span class="cmPreviewMediaNotUsed">' + UILANG.m('Not in use') + '</span>';
	return '<div class="cmPreviewMediaUsage">' + pages.map((page) => (
		'<em>' + (page.code ? cmPreviewEscape(page.code) + ' - ' : '') + cmPreviewEscape(page.name) + (page.archived ? ' (' + UILANG.m('archived') + ')' : '') + '</em>'
	)).join('') + '</div>';
}

function cmPreviewMediaInlinePreview(item) {
	const type = String(item.filetype || '').toLowerCase();
	const src = cmPreviewMediaUrl(item);
	if (!src) return '<img class="cmPreviewMediaThumbIcon" src="' + cmPreviewMediaIcon(type) + '" alt="">';
	if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'image'].includes(type)) {
		return '<img class="cmPreviewMediaThumb" src="' + src + '" alt="">';
	}
	if (['mp3', 'wav', 'ogg', 'audio'].includes(type)) {
		return '<audio class="cmPreviewMediaPlayer" controls preload="none" src="' + src + '"></audio>';
	}
	if (['mp4', 'webm', 'mov', 'video'].includes(type)) {
		return '<video class="cmPreviewMediaPlayer" controls preload="none" src="' + src + '"></video>';
	}
	return '<img class="cmPreviewMediaThumbIcon" src="' + cmPreviewMediaIcon(type) + '" alt="">';
}

function cmPreviewMediaLargePreview(item) {
	const type = String(item.filetype || '').toLowerCase();
	const src = cmPreviewMediaUrl(item);
	let visual;
	if (src && ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'image'].includes(type)) {
		visual = '<img class="cmPreviewMediaLargeImage" src="' + src + '" alt="">';
	} else if (src && ['mp3', 'wav', 'ogg', 'audio'].includes(type)) {
		visual = '<audio class="cmPreviewMediaLargePlayer" controls preload="none" src="' + src + '"></audio>';
	} else if (src && ['mp4', 'webm', 'mov', 'video'].includes(type)) {
		visual = '<video class="cmPreviewMediaLargePlayer" controls preload="none" src="' + src + '"></video>';
	} else {
		visual = '<img class="cmPreviewMediaLargeIcon" src="' + cmPreviewMediaIcon(type) + '" alt="">';
	}
	return '<div class="cmPreviewMediaPreview">' +
		'<div class="cmPreviewMediaPreviewStage">' + visual + '</div>' +
		'<div class="cmPreviewMediaPreviewInfo"><strong>' + cmPreviewEscape(item.name) + '</strong>' + cmPreviewMediaUsage(item) + '</div>' +
		'</div>';
}

function cmPreviewInteractionIcon(type) {
	const paths = {
		advanced: 'advanced',
		conceptmap: 'advanced',
		textfield: 'simple',
		textarea: 'simple',
		choice: 'simple',
		choicematrix: 'simple',
		slider: 'simple',
		slikert: 'simple',
		button: 'static',
		languageswitcher: 'static',
		wysiwyg: 'static',
		image: 'static',
		video: 'static',
		audio: 'static',
		inline_choices: 'inline',
		inline_textfields: 'inline',
		inline_gaps: 'inline',
		inline_hottext: 'inline'
	};
	const section = paths[type] || 'static';
	return 'interactions/' + section + '/' + type + '/block_icon.svg';
}

function cmPreviewInteractionScoring(interaction) {
	const fields = Array.isArray(interaction.fields) ? interaction.fields : [];
	const fieldMode = fields.map((field) => String(field.processing || '').toLowerCase()).find((mode) => ['none', 'manual', 'auto'].includes(mode));
	const settingsMode = interaction.settings && typeof interaction.settings === 'object' ? String(interaction.settings.processing || '').toLowerCase() : '';
	if (fieldMode) return fieldMode;
	if (['none', 'manual', 'auto'].includes(settingsMode)) return settingsMode;
	return 'none';
}

function cmPreviewInteractionId(interaction) {
	if (interaction.id) return interaction.id;
	const fields = Array.isArray(interaction.fields) ? interaction.fields : [];
	return fields.length ? fields[0].id : '';
}

function cmPreviewTranslate(value) {
	if (value === null || typeof value === 'undefined') return '';
	const text = String(value);
	return typeof UILANG !== 'undefined' && typeof UILANG.m === 'function' ? UILANG.m(text) : text;
}

function cmPreviewInteractionConfigItems(type) {
	const config = window.interactionConfigs && window.interactionConfigs[type];
	const items = [];
	const walk = (entries) => {
		if (!Array.isArray(entries)) return;
		entries.forEach((entry) => {
			if (!entry || typeof entry !== 'object') return;
			items.push(entry);
			walk(entry.children);
		});
	};
	if (config && typeof config === 'object') {
		Object.keys(config).forEach((section) => walk(config[section]));
	}
	return items;
}

function cmPreviewInteractionSettingMeta(type, key) {
	return cmPreviewInteractionConfigItems(type).find((entry) => {
		const settings = entry.settings || {};
		const path = settings.path || [];
		return settings.label && Array.isArray(path) && path.length === 1 && String(path[0]) === String(key);
	}) || null;
}

function cmPreviewInteractionSettingValue(meta, rawValue) {
	const rawText = String(rawValue);
	if (rawText === 'yes' || rawText === 'no') return cmPreviewTranslate(rawText);
	const options = meta && meta.settings && Array.isArray(meta.settings.options) ? meta.settings.options : [];
	const match = options.find((option) => String(option.value) === rawText);
	return cmPreviewTranslate(match ? match.label : rawText);
}

function cmPreviewInteractionSettingChip(type, key, rawValue) {
	const meta = cmPreviewInteractionSettingMeta(type, key);
	const label = cmPreviewTranslate(meta ? meta.settings.label : key);
	const value = cmPreviewInteractionSettingValue(meta, rawValue);
	return '<span class="cmPreviewInteractionField"><strong>' + cmPreviewEscape(label) + ':</strong> <em>' + cmPreviewEscape(value) + '</em></span>';
}

function cmPagePreviewEntry(pageId) {
	const pages = (serverData.preview && serverData.preview.pages) || [];
	return pages.find((entry) => String(entry.id) === String(pageId)) || null;
}

function cmCurrentPageId() {
	const selectedItem = gui.itemList && typeof gui.itemList.getSelection === 'function' ? gui.itemList.getSelection() : null;
	if (selectedItem && selectedItem.id) return selectedItem.id;
	if (itemSelection && itemSelection.id) return itemSelection.id;
	if (serverData.item && serverData.item.id) return serverData.item.id;
	return null;
}

function cmPageContentInteractionSettings(interaction) {
	if (!interaction.settings || typeof interaction.settings !== 'object') return '';
	return Object.keys(interaction.settings)
		.filter((key) => key !== 'processing' && (key !== 'case' || cmPreviewInteractionScoring(interaction) === 'auto'))
		.sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}))
		.map((key) => cmPreviewInteractionSettingChip(interaction.type, key, interaction.settings[key]))
		.join('');
}

function cmPageContentInteractionRow(interaction) {
	const scoring = cmPreviewInteractionScoring(interaction);
	const id = cmPreviewInteractionId(interaction);
	const settings = cmPageContentInteractionSettings(interaction);
	const typeLabel = cmPreviewTranslate(interaction.type);
	const title = interaction.title ? String(interaction.title) : '';
	const displayTitle = title || typeLabel;
	const meta = title ? [typeLabel, id ? 'ID: ' + id : ''].filter(Boolean).join(' | ') : (id ? 'ID: ' + id : '');
	return '<div class="cmPageContentInteractionRow">' +
		'<img src="' + cmPreviewInteractionIcon(interaction.type) + '" alt="">' +
		'<div class="cmPageContentInteractionMain">' +
		'<strong>' + cmPreviewEscape(interaction.position) + '. ' + cmPreviewEscape(displayTitle) + '</strong>' +
		(meta ? '<span class="cmPageContentMeta">' + cmPreviewEscape(meta) + '</span>' : '') +
		(settings ? '<div class="cmPageContentSettings">' + settings + '</div>' : '') +
		'</div>' +
		'<div class="cmPreviewScoringTile cmPageContentScoring is-' + cmPreviewEscape(scoring) + '"><span>' + UILANG.m('Scoring') + '</span><strong>' + cmPreviewEscape(cmPreviewTranslate(scoring)) + '</strong></div>' +
		'</div>';
}

function cmPageContentLockInfo() {
	if (!cmIsPagePublishedLocked(itemSelection)) return '';
	return '<div class="cmPageContentLockInfo">' + cmPreviewEscape(UILANG.m(PAGE_PUBLISHED_LOCK_MESSAGE)) + '</div>';
}

function cmPageContentHeader(count) {
	const label = count + ' ' + UILANG.m(count === 1 ? 'interaction' : 'interactions');
	const disabled = itemSelection && itemSelection.publishedLocked === true ? ' disabled' : '';
	return '<div class="cmPageContentHeader">' +
		'<strong>' + cmPreviewEscape(label) + '</strong>' +
		'<button type="button" class="cmPageContentEditButton"' + disabled + '>' + UILANG.m('Edit page') + '</button>' +
		'</div>';
}

function renderPageContentInteractions(pageId) {
	const container = $('#itemContentInteractions');
	if (!container.length) return;
	if (!pageId) {
		container.attr('class', 'cmPageContentBlank').html(UILANG.m('Content'));
		return;
	}
	const page = cmPagePreviewEntry(pageId);
	const details = page && Array.isArray(page.interactionDetails) ? page.interactionDetails : [];
	container.attr('class', 'cmPageContentList').html(cmPageContentLockInfo() + cmPageContentHeader(details.length) + details.map(cmPageContentInteractionRow).join(''));
	if (!cmIsPagePublishedLocked(itemSelection)) {
		container.find('.cmPageContentEditButton').on('click', function() {
			editSelection('pageContent');
		});
	}
}

function cmPreviewOpenMediaDialog(kind) {
	const labels = {
		uploaded: UILANG.m('Uploaded files'),
		used: UILANG.m('Used files'),
		unused: UILANG.m('Unused files')
	};
	if (String(kind || '').startsWith('type:')) labels[kind] = UILANG.m('Media type') + ': ' + String(kind).substring(5);
	const rows = cmPreviewMediaItems(kind);
	const previews = rows.map(cmPreviewMediaLargePreview);
	const body = rows.length ? '<div class="cmPreviewMediaDialogLayout"><div class="cmPreviewMediaDialogList">' + rows.map((item, index) => (
		'<button type="button" class="cmPreviewDialogRow cmPreviewMediaDialogRow' + (index === 0 ? ' is-active' : '') + '" data-index="' + index + '"><img src="' + cmPreviewMediaIcon(item.filetype) + '" alt=""><span>' + cmPreviewEscape(item.name) + '</span><strong>' + cmPreviewEscape(item.filetype) + '</strong></button>'
	)).join('') + '</div><div class="cmPreviewMediaPreviewPane">' + previews[0] + '</div></div>' : '<div class="tmPreviewEmpty">' + UILANG.m('No files available') + '</div>';
	new nxDialog('cmPreviewMediaDialog', {
		title: labels[kind] || labels.uploaded,
		contents: body,
		width: 820,
		replaceExisting: 'cmPreviewMediaDialog',
		allowMultipleInstances: false,
		buttons: [{label: UILANG.m('Close'), default: true, cancel: true, value: 'ok'}]
	});
	$('#cmPreviewMediaDialog').off('click.cmPreviewMedia').on('click.cmPreviewMedia', '.cmPreviewMediaDialogRow', function () {
		const index = Number($(this).attr('data-index'));
		if (!previews[index]) return;
		$('#cmPreviewMediaDialog .cmPreviewMediaDialogRow').removeClass('is-active');
		$(this).addClass('is-active');
		$('#cmPreviewMediaDialog .cmPreviewMediaPreviewPane').html(previews[index]);
	});
}

function cmPreviewOpenInteractionsDialog(pageId) {
	const pages = (serverData.preview && serverData.preview.pages) || [];
	const page = pages.find((entry) => String(entry.id) === String(pageId));
	if (!page) return;
	const details = Array.isArray(page.interactionDetails) ? page.interactionDetails : [];
	const body = details.length ? '<div class="cmPreviewDialogList cmPreviewInteractionDialogList">' + details.map((interaction) => {
		const meta = [];
		if (interaction.export) meta.push(UILANG.m('Export') + ': ' + interaction.export);
		if (interaction.visibility) meta.push(UILANG.m('Visibility') + ': ' + interaction.visibility);
		const settings = interaction.settings && typeof interaction.settings === 'object' ? Object.keys(interaction.settings).filter((key) => key !== 'processing' && (key !== 'case' || cmPreviewInteractionScoring(interaction) === 'auto')).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'})).map((key) => (
			cmPreviewInteractionSettingChip(interaction.type, key, interaction.settings[key])
		)).join('') : '';
		const scoring = cmPreviewInteractionScoring(interaction);
		const id = cmPreviewInteractionId(interaction);
		const typeLabel = cmPreviewTranslate(interaction.type);
		const title = interaction.title ? String(interaction.title) : '';
		const displayTitle = title || typeLabel;
		const titleMeta = title ? [typeLabel, id ? 'ID: ' + id : ''].filter(Boolean).join(' | ') : (id ? 'ID: ' + id : '');
		return '<div class="cmPreviewDialogRow cmPreviewInteractionDialogRow"><img src="' + cmPreviewInteractionIcon(interaction.type) + '" alt=""><div><strong><span>' + cmPreviewEscape(interaction.position) + '. ' + cmPreviewEscape(displayTitle) + '</span></strong>' + (titleMeta ? '<span>' + cmPreviewEscape(titleMeta) + '</span>' : '') + (meta.length ? '<span>' + cmPreviewEscape(meta.join(' | ')) + '</span>' : '') + '<div>' + settings + '</div></div><div class="cmPreviewScoringTile is-' + cmPreviewEscape(scoring) + '"><span>' + UILANG.m('Scoring') + '</span><strong>' + cmPreviewEscape(cmPreviewTranslate(scoring)) + '</strong></div></div>';
	}).join('') + '</div>' : '<div class="tmPreviewEmpty">' + UILANG.m('No interactions') + '</div>';
	new nxDialog('cmPreviewInteractionsDialog', {
		title: UILANG.m('Interactions') + ': ' + cmPreviewEscape(page.name),
		contents: body,
		width: 720,
		height: 420,
		buttons: [{label: UILANG.m('Close'), default: true, cancel: true, value: 'ok'}]
	});
}

function openExistingPagesDialog() {
	if (!serverData.group || !serverData.group.id) return;
	const targetGroupId = Number(serverData.group.id);
	const dialogId = 'loadExistingPagesDialog';
	let sourceGroups = [];
	let sourcePages = [];
	let selectedSourceGroup = null;
	let selectedPageIds = new Set();
	let activePageId = null;
	let targetMediaNames = new Set();
	let requestToken = 0;

	const dialogData = {
		title: UILANG.m('Load existing test pages'),
		width: 1240,
		returnPromise: true,
		replaceExisting: dialogId,
		buttons: [{
			label: UILANG.m('Cancel'),
			cancel: true,
			value: 'cancel'
		}, {
			label: UILANG.m('Load selected'),
			disabled: true,
			default: true,
			value: 'load'
		}],
		contents:
			'<div class="cmImportPagesDialog">' +
			'<aside class="cmImportPageGroups">' +
			'<label class="tmExistingEntriesFilter" for="cmImportGroupFilter"><span>' + UILANG.m('Filter page groups') + '</span><input id="cmImportGroupFilter" type="text" autocomplete="off"></label>' +
			'<div id="cmImportGroupList" class="tmExistingEntriesTestList"><div class="tmExistingEntriesEmpty">' + UILANG.m('Loading available page groups...') + '</div></div>' +
			'</aside>' +
			'<section class="cmImportPagesSelection">' +
			'<div class="tmExistingEntriesSelectionHeader"><div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Source page group') + '</span><strong id="cmImportSourceTitle">' + UILANG.m('Select a page group') + '</strong></div>' +
			'<div class="tmExistingEntriesSelectionActions"><button id="cmImportSelectAll" type="button" disabled>' + UILANG.m('Select all') + '</button><button id="cmImportSelectNone" type="button" disabled>' + UILANG.m('Deselect all') + '</button></div></div>' +
			'<div id="cmImportPageList" class="cmImportPageList"><div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a page group to see its test pages.') + '</div></div>' +
			'<div id="cmImportSummary" class="tmExistingEntriesSummary">' + UILANG.m('No test pages selected.') + '</div>' +
			'</section>' +
			'<aside class="cmImportPageDetails"><div class="cmImportPageDetailsTitle">' + UILANG.m('Interactions') + '</div><div id="cmImportInteractionDetails" class="cmImportInteractionDetails"><div class="tmExistingEntriesEmpty">' + UILANG.m('Select a test page to see its interactions.') + '</div></div></aside>' +
			'</div>'
	};

	const dialogResult = new nxDialog(dialogId, dialogData);
	const importDialog = window.nxDialogManager.instances[dialogId];
	dialogResult.then(function(result) {
		if (result.button !== 'load' || !selectedSourceGroup || selectedPageIds.size === 0) return;
		startAjax('importExistingPages', {
			groupId: targetGroupId,
			targetGroupId: targetGroupId,
			sourceGroupId: selectedSourceGroup.id,
			pageIds: Array.from(selectedPageIds)
		});
	});

	function selectedAndLinkedPages() {
		const byId = new Map(sourcePages.map(function(page) { return [Number(page.id), page]; }));
		const included = new Set(selectedPageIds);
		let changed = true;
		while (changed) {
			changed = false;
			Array.from(included).forEach(function(pageId) {
				const page = byId.get(Number(pageId));
				const linkedStimulusId = page ? Number(page.linkedStimulusId || 0) : 0;
				if (linkedStimulusId > 0 && byId.has(linkedStimulusId) && !included.has(linkedStimulusId)) {
					included.add(linkedStimulusId);
					changed = true;
				}
			});
		}
		return Array.from(included).map(function(pageId) { return byId.get(Number(pageId)); }).filter(Boolean);
	}

	function updateImportSummary() {
		const $summary = $('#cmImportSummary');
		if (!selectedPageIds.size) {
			$summary.removeClass('cmImportHasConflicts').text(UILANG.m('No test pages selected.'));
			importDialog.disableButton('load');
			return;
		}
		const pagesToImport = selectedAndLinkedPages();
		const mediaByName = new Map();
		const conflictsByName = new Map();
		const directlySelectedConflictPageIds = new Set();
		pagesToImport.forEach(function(page) {
			(page.media || []).forEach(function(media) {
				if (!media || !media.name) return;
				const name = String(media.name);
				mediaByName.set(name, media);
				if (!targetMediaNames.has(name)) return;
				if (!conflictsByName.has(name)) {
					conflictsByName.set(name, {name: name, filetype: String(media.filetype || ''), pageIds: [], pages: []});
				}
				const conflict = conflictsByName.get(name);
				if (!conflict.pageIds.includes(Number(page.id))) {
					conflict.pageIds.push(Number(page.id));
					conflict.pages.push(page.name);
				}
				if (selectedPageIds.has(Number(page.id))) directlySelectedConflictPageIds.add(Number(page.id));
			});
		});
		const conflicts = Array.from(conflictsByName.values());
		$('#cmImportPageList .cmImportPageRow').removeClass('cmImportPageHasConflict').find('.cmImportPageConflictBadge').remove();
		if (directlySelectedConflictPageIds.size) {
			$('#cmImportPageList .cmImportPageRow').each(function() {
				const pageId = Number($(this).attr('data-page-id'));
				if (!directlySelectedConflictPageIds.has(pageId)) return;
				$(this).addClass('cmImportPageHasConflict');
				$(this).find('.cmImportPageSelect span').append($('<em class="cmImportPageConflictBadge"></em>').text(UILANG.m('Media conflict')));
			});
		}
		const linkedCount = Math.max(0, pagesToImport.length - selectedPageIds.size);
		let text = selectedPageIds.size + ' ' + UILANG.m(selectedPageIds.size === 1 ? 'test page selected.' : 'test pages selected.') + ' ' + mediaByName.size + ' ' + UILANG.m(mediaByName.size === 1 ? 'media file required.' : 'media files required.');
		if (linkedCount > 0) text += ' ' + linkedCount + ' ' + UILANG.m(linkedCount === 1 ? 'linked stimulus page will also be imported.' : 'linked stimulus pages will also be imported.');
		if (conflicts.length) {
			const conflictRows = conflicts.map(function(conflict) {
				const type = conflict.filetype ? conflict.filetype.toUpperCase() : UILANG.m('Unknown type');
				return '<li><strong>' + cmPreviewEscape(conflict.name) + '</strong><span>' + cmPreviewEscape(type) + ' | ' + conflict.pages.map(cmPreviewEscape).join(', ') + '</span></li>';
			}).join('');
			$summary.addClass('cmImportHasConflicts').html('<strong>' + UILANG.m('Media conflicts') + '</strong><span>' + UILANG.m('Import is unavailable until these filename conflicts are resolved in the destination page group.') + '</span><ul>' + conflictRows + '</ul>');
			importDialog.disableButton('load');
			return;
		}
		$summary.removeClass('cmImportHasConflicts').text(text);
		importDialog.enableButton('load');
	}

	function renderInteractionDetails(pageId) {
		activePageId = Number(pageId) || null;
		const page = sourcePages.find(function(entry) { return Number(entry.id) === activePageId; });
		const $details = $('#cmImportInteractionDetails').empty();
		$('#cmImportPageList .cmImportPageRow').removeClass('is-active');
		$('#cmImportPageList .cmImportPageRow[data-page-id="' + activePageId + '"]').addClass('is-active');
		if (!page) {
			$details.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Select a test page to see its interactions.') + '</div>');
			return;
		}
		const details = Array.isArray(page.interactionDetails) ? page.interactionDetails : [];
		$details.append('<div class="cmImportPageDetailsHeading"><strong>' + cmPreviewEscape(page.name) + '</strong><span>' + details.length + ' ' + UILANG.m(details.length === 1 ? 'interaction' : 'interactions') + '</span></div>');
		if (!details.length) {
			$details.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No interactions') + '</div>');
			return;
		}
		$details.append(details.map(cmPageContentInteractionRow).join(''));
	}

	function renderPageList() {
		const $list = $('#cmImportPageList').empty();
		const $sourceTitle = $('#cmImportSourceTitle');
		const $selectAll = $('#cmImportSelectAll');
		const $selectNone = $('#cmImportSelectNone');
		selectedPageIds = new Set();
		activePageId = null;
		$('#cmImportInteractionDetails').html('<div class="tmExistingEntriesEmpty">' + UILANG.m('Select a test page to see its interactions.') + '</div>');
		if (!selectedSourceGroup) {
			$sourceTitle.text(UILANG.m('Select a page group'));
			$selectAll.prop('disabled', true);
			$selectNone.prop('disabled', true);
			$list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a page group to see its test pages.') + '</div>');
			updateImportSummary();
			return;
		}
		$sourceTitle.text(selectedSourceGroup.name);
		$selectAll.prop('disabled', sourcePages.length === 0);
		$selectNone.prop('disabled', sourcePages.length === 0);
		if (!sourcePages.length) {
			$list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This page group has no test pages.') + '</div>');
			updateImportSummary();
			return;
		}
		sourcePages.forEach(function(page) {
			const count = cmPreviewInteractionCount(page);
			const details = [];
			if (page.code) details.push(UILANG.m('Code') + ': ' + page.code);
			if (page.isStimulus) details.push(UILANG.m('Stimulus page'));
			if (page.linkedStimulusName) details.push(UILANG.m('Linked stimulus') + ': ' + page.linkedStimulusName);
			const $row = $('<div class="cmImportPageRow"></div>').attr('data-page-id', page.id);
			const $checkbox = $('<input type="checkbox">').val(page.id);
			const $label = $('<label class="cmImportPageSelect"></label>').append($checkbox).append(
				$('<span></span>').append($('<strong></strong>').text(page.name)).append($('<small></small>').text(details.join(' | ')))
			);
			const $interactions = $('<button type="button" class="cmPreviewInteractionButton cmImportInteractionButton"></button>')
				.attr('title', UILANG.m('Show interactions'))
				.append($('<strong></strong>').text(count)).append($('<span></span>').text(UILANG.m('interactions')));
			$checkbox.on('change', function() {
				if (this.checked) selectedPageIds.add(Number(page.id));
				else selectedPageIds.delete(Number(page.id));
				updateImportSummary();
			});
			$interactions.on('click', function(event) {
				event.preventDefault();
				event.stopPropagation();
				renderInteractionDetails(page.id);
			});
			$row.on('click', function(event) {
				if ($(event.target).is('input, button')) return;
				renderInteractionDetails(page.id);
			});
			$row.append($label, $interactions);
			$list.append($row);
		});
		updateImportSummary();
	}

	function renderSourceGroups(filter) {
		const $list = $('#cmImportGroupList').empty();
		const query = String(filter || '').trim().toLocaleLowerCase();
		selectedSourceGroup = null;
		sourcePages = [];
		targetMediaNames = new Set();
		renderPageList();
		const visibleGroups = sourceGroups.filter(function(group) {
			return !query || String(group.name || '').toLocaleLowerCase().indexOf(query) !== -1;
		});
		if (!visibleGroups.length) {
			$list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No accessible page groups with test pages were found.') + '</div>');
			return;
		}
		visibleGroups.forEach(function(group) {
			const label = group.name + ' (' + group.pageCount + ')';
			const $row = $('<button type="button" class="tmExistingEntriesTest cmImportGroupRow"></button>').text(label).attr('title', label);
			$row.on('click', function() {
				$('#cmImportGroupList .cmImportGroupRow').removeClass('tmExistingEntriesTestSelected');
				$row.addClass('tmExistingEntriesTestSelected');
				selectedSourceGroup = group;
				sourcePages = [];
				renderPageList();
				const thisToken = ++requestToken;
				$('#cmImportPageList').html('<div class="tmExistingEntriesEmpty">' + UILANG.m('Loading test pages...') + '</div>');
				startAjax('fetchExistingPageGroupPages', {
					groupId: targetGroupId,
					targetGroupId: targetGroupId,
					sourceGroupId: group.id
				}).then(function(response) {
					if (thisToken !== requestToken || !selectedSourceGroup || Number(selectedSourceGroup.id) !== Number(group.id)) return;
					const result = response && response.data ? response.data : {};
					sourcePages = Array.isArray(result.pages) ? result.pages : [];
					targetMediaNames = new Set((result.targetMediaNames || []).map(String));
					renderPageList();
				});
			});
			$list.append($row);
		});
	}

	$('#cmImportGroupFilter').on('input', function() {
		renderSourceGroups($(this).val());
	});
	$('#cmImportSelectAll').on('click', function() {
		selectedPageIds = new Set(sourcePages.map(function(page) { return Number(page.id); }));
		$('#cmImportPageList input[type="checkbox"]').prop('checked', true);
		updateImportSummary();
	});
	$('#cmImportSelectNone').on('click', function() {
		selectedPageIds = new Set();
		$('#cmImportPageList input[type="checkbox"]').prop('checked', false);
		updateImportSummary();
	});

	startAjax('fetchExistingPageGroups', {
		groupId: targetGroupId,
		targetGroupId: targetGroupId
	}).then(function(response) {
		sourceGroups = response && response.data && Array.isArray(response.data.pageGroups) ? response.data.pageGroups : [];
		renderSourceGroups('');
	});
}

function renderContentPreview() {
	if (mode !== 'browsing' || !serverData.group || !serverData.preview) return;
	const preview = serverData.preview;
	const pages = preview.pages || [];
	const metaTags = serverData.group.info || {};
	const canEdit = selection.length === 1
		&& selection[0].type === 'itemGroup'
		&& String(selection[0].dbId) === String(serverData.group.id)
		&& permList?.[selection[0].dbId]?.editSelection === true;
	const editAction = canEdit
		? '<button type="button" id="cmPreviewEditButton" class="tmPreviewEditButton">' + UILANG.m('Edit page group') + '</button>'
		: '<div class="tmPreviewReadOnly">' + UILANG.m('Read only') + '</div>';
	const html = '<div class="tmPreview cmPreview">' +
		'<div class="tmPreviewHeroSticky"><div class="tmPreviewHero cmPreviewHero">' +
		'<div class="tmPreviewTypeIcon"><img src="../inc/filer/images/listDocuments.png" alt=""></div>' +
		'<div class="tmPreviewHeroMain"><div class="tmPreviewName">' + cmPreviewEscape(serverData.group.name) + '</div>' +
		'<div class="tmPreviewMeta"><span>ID: ' + cmPreviewEscape(serverData.group.id) + '</span><span>' + UILANG.m('Page group') + '</span></div></div>' +
		'<div class="tmPreviewActions"><div class="tmPreviewActionRow">' + editAction + '</div><div class="tmPreviewLastChange">' + cmPreviewLastChange(preview.lastBackendEdit) + '</div></div>' +
		'</div></div>' +
		'<div class="tmPreviewBody"><div class="tmPreviewGrid"><div class="tmPreviewColumn">' +
		cmPreviewPagesCard(pages) +
		'</div><div class="tmPreviewColumn">' +
		cmPreviewMediaCard(preview.media) +
		'<div class="tmPreviewCard"><h3>' + UILANG.m('Meta-tags') + '</h3>' + cmPreviewMetaTags(metaTags) + '</div>' +
		'</div></div></div></div>';
	$('#contentPreviewContent').removeClass('tmPreviewBlank').html(html);
	if (canEdit) $('#cmPreviewEditButton').on('click', () => editSelection('preview'));
	$('.cmPreviewMediaStats button').on('click', function() {
		cmPreviewOpenMediaDialog($(this).data('media-list'));
	});
	$('.cmPreviewMediaType').on('click', function() {
		cmPreviewOpenMediaDialog('type:' + $(this).data('media-type'));
	});
	$('.cmPreviewInteractionButton').on('click', function() {
		cmPreviewOpenInteractionsDialog($(this).data('page-id'));
	});
	$('.cmPreviewStimulusIcon, .cmPreviewLockIcon').tooltip({
		track: true,
		classes: {"ui-tooltip-content": "uitt-upgrader"}
	});
}

function decorateLockedPageItems() {
	const stimulusIcons = $('#itemSelector .itemSelectorStimulusIcon');
	$('#itemSelector li.pageLocked_published').removeAttr('title');
	stimulusIcons.tooltip({
		track: true,
		position: {
			my: 'left+18 top+18',
			at: 'right bottom',
			collision: 'flipfit'
		},
		classes: {"ui-tooltip-content": "uitt-upgrader"}
	});
}

/* general helper functions */

function textSummary(obj) {
	if (typeof (obj) !== 'object') return 'error';
	const lang = Object.keys(obj);
	let summary;
	if (lang.length === 1 && lang[0] === 'XX' && obj['XX'] === '') {
		summary = 'empty';
	} else {
		summary = lang.join(', ');
	}
	return summary;
}

async function showDialog(id, dialogData) {
	return new nxDialog(id, dialogData);
}

function showMessage() {
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

function showMsgNoSrchResults(msg, searchTerm, component, searchOptions) {
	function showMsgNoSrchResultsCB(button) {
		if (button === 'new') {
			component.filerSearch(searchTerm, searchOptions || {});
		}
	}

	const dialogData = {
		buttons: [{
			label: UILANG.m('New search'),
			value: 'new'
		}, {
			label: UILANG.m('OK'),
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: msg,
		width: 500,
		callback: showMsgNoSrchResultsCB,
		title: UILANG.m('No search results'),
		icon: "../images/warning.png",
		iconWidth: 64
	};
	new nxDialog('Message', dialogData);
}

//automatically decode JSON strings contained in server data, based on type of data
function decodeData(data, type) {
	if (typeof (data) === 'undefined') return;
	parseErrors = [];
	switch (type) {
		case 'group':
			data.options = jsonDecode(data.options, type, data.id, 'options');
			data.info = jsonDecode(data.info, type, data.id, 'info', {});
			break;
		case 'item':
			// data.options = jsonDecode(data.options, type, data.id, 'options', {});
			// data.blocks = jsonDecode(data.blocks, type, data.id, 'blocks', []);
			// data.parsed = jsonDecode(data.parsed, type, data.id, 'parsed', {});
			data.languages = jsonDecode(data.languages, type, data.id, 'languages', []);
			// data.fields = jsonDecode(data.fields, type, data.id, 'fields', {});
			data.metadata = jsonDecode(data.metadata, type, data.id, 'metadata', {});
			break;
		case 'items':
			for (let i in data) {
				data[i].languages = jsonDecode(data[i].languages, type, data[i].id, 'languages', []);
				data[i].fields = jsonDecode(data[i].fields, type, data[i].id, 'fields', {});
				data[i].metadata = jsonDecode(data[i].metadata, type, data[i].id, 'metadata', {});
			}
			break;
	}
	if (parseErrors.length > 0) {
		startAjax('errorLog', {
			messages: parseErrors
		});
		return true;
	}
}

//parse a single JSON string with fallback on empty object if null and exception handling
//if an unparsable string is found, it will be replaced with an empty object, and the erroneous will be logged in the key parserError
function jsonDecode(s, type, id, key, template) {
	if (typeof (template) === 'undefined') {
		//the template defines what an empty variable should be initialized with, default is a new object
		template = {};
	}
	if (s) {
		try {
			s = JSON.parse(s);
		} catch (e) {
			const d = new Date();
			console.error(`[${d.toString()}] parse error in ${type} ${id} ${key}: ${s} (${e})`);
			parseErrors.push(`[${d.toString()}] parse error in ${type} ${id} ${key}: ${s} (${e})`);
			s = deepCopy(template);
		}
	} else {
		s = deepCopy(template);
	}
	return s;
}

/* server communication */

function startAjax(action, data) {
	waitDialog.show(action);
	const requestToken = data && data._requestToken;
	const payload = data ? Object.assign({}, data) : {};
	delete payload._requestToken;
	const params = {
		action: action,
		data: JSON.stringify(payload)
	};
	const request = $.ajax({
		data: params,
		success: function(res) {
			if (typeof requestToken !== 'undefined') res._requestToken = requestToken;
			ajaxSuccess(res);
		}
	});
	request._waitDialogSender = action;
	return request;
}

function ajaxError(jqXHR, textStatus, errorThrown) {
	if (textStatus === 'abort') {
		waitDialog.hide(jqXHR._waitDialogSender || '*');
		return;
	}
	waitDialog.hide('*'); // hide the wait dialog no matter what, since action is not known
	let dialogData = {
		buttons: [{
			label: 'OK',
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: jqXHR.responseJSON.fatalError,
		title: 'Error: ' + errorThrown,
		width: 500
	};
	new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
	if ("isSuper" in res) window.isSuper = res.isSuper; // check for superadmin level status
	if ("isAdmin" in res) window.isAdmin = res.isAdmin; // check for admin level status
	$('#un_val').html(res.loggedInName);

	let actionsFromThisScript = ['fetchPreSelect', 'fetchLibrary', 'checkItemGroup', 'checkItem', 'fetchItemGroup', 'fetchItem', 'fetchExistingPageGroups', 'fetchExistingPageGroupPages', 'importExistingPages', 'preparePageGroupExport', 'clipboardCheck', 'removeLinks', 'interactionCheck', 'search', 'metaSearch', 'fetchMetaTagSuggestions', 'updateWatchList', 'renameGroupOrFolder', 'renameItem', 'saveItemGroup', 'saveItem', 'newFolder', 'newItemGroup', 'moveObjects', 'deleteSelection', 'deleteItem', 'newItem', 'duplicateItemGroup', 'duplicateItem', 'lockItem', 'errorLog'];

	// if the action is not from this script, but from an external included script, we hide the wait dialog without sender
	if (!actionsFromThisScript.includes(res.action)) {
		waitDialog.hide();
	} else {
		waitDialog.hide(res.action);
	}
	//if there was a fatal PHP error that prevented the script from finishing show that error
	//this data is created in PHP via the register_shutdown_function
	let dialogData;
	if (res.fatalError) {
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
		if (!$('#veil_error').length) new nxDialog('fatalError', dialogData);
		return;
	}
	//if a normal error occured in PHP that did not prevent the script from finishing, show it
	if (res.error !== false) {

		if (res.action.includes(['fetchItemGroup', 'moveObjects', 'duplicateObjects'])) {
			gui.library.clearClipboard();
		}

		// dismiss the edit permission dialog prior to launching the error msg to show
		if (res.action === "fetchIgPerm") {
			// close the edit perm user dialog
			editPermDialog.dismiss();

			// remove key capture handler initiated by editPermDialog
			$(document).off("keydown");
			$(document).off("keyup");
		}

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
			width: 700,
			callback: function(action, code, name) {

				if (res.forceLoginRedirect) {
					window.location = 'index.php';
				} else if (action === 'newItem' && !res.reloadFolder) {
					newItem('', null, name, code);
				} else if (action === 'duplicateItem') {
					startAjax('fetchItemGroup', {
						id: serverData.group.id,
						location: loc.folder
					});
				} else if (action === 'renameGroupOrFolder') {
					startAjax('fetchLibrary', {
						location: loc.folder,
						showBlocked: showBlocked
					});
				} else if (action === 'saveItem') {
					abortEditing();
					startAjax('fetchItemGroup', {
						id: serverData.group.id,
						location: loc.folder
					});
				} else if (action === 'fetchItem') {
					startAjax('fetchItemGroup', {
						id: serverData.group.id,
						location: loc.folder
					});
				} else if (['fetchExistingPageGroups', 'fetchExistingPageGroupPages', 'importExistingPages'].includes(action)) {
					return;
				} else {
					if (mode === "editGroup") {
						abortEditing(true);
					}
					if (res.reloadFolder) {
						if (res.openNewLocation) {
							startAjax('fetchLibrary', {
								location: res.openNewLocationId,
								rebuild: true,
								showBlocked: showBlocked
							});
						} else if (res.goToParent) {
							loc.folder = oldLoc.folder;
							startAjax('fetchLibrary', {
								location: oldLoc.folder,
								rebuild: true,
								showBlocked: showBlocked
							});
						} else {
							startAjax('fetchLibrary', {
								location: loc.folder,
								rebuild: true,
								showBlocked: showBlocked
							});
						}
					}

				}
			}.bind(this, res.action, res.code, res.name)
		};
		if (!$('#veil_error').length) new nxDialog('error', dialogData);
		return;
	}

	if (res.warnings) {
		for (let i in res.warnings) {
			showMessage(res.warnings[i]);
		}
	}

	//noinspection FallThroughInSwitchStatementJS
	switch (res.action) {

		case 'deleteSelection':
			if (!res.confirmation) {
				gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
				loc.folder = parseInt(res.data.loc);
				loc.path = res.data.path;
				updateLibrary(res.data.list, res.data.path);
				if (res.data.select !== null) {
					gui.library.setSelection([{
						id: res.data.select
					}]);
				}
			} else {
				let dialogData = {
					buttons: [
						{ label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel' },
						{ label: UILANG.m('OK'), 'default': true, value: 'ok' }
					],
					returnPromise: true,
					contents: res.confirmation,
					title: UILANG.m('Warning'),
					width: 400
				};
				showDialog('deleteSelectionDialog', dialogData).then(
					(dRes) => {
						if (dRes.button === 'ok') {
							startAjax('deleteSelection', {
								location: res.location,
								selection: res.selection,
								force: true,
								showBlocked: showBlocked
							});
						}
					}
				);
			}
			break;

		case 'fetchLibrary':
			if (!window.isSuper && !window.isAdmin) {
				curFFlist = res.data.list;
				paintBlocked(curFFlist);
				$('#bv_toggle').show();

				// on pre-selection, the entry may come in which requires a showBlock = true state from the start
				if (res.f_showBlocked === true) {
					showBlocked = true;
					$('#bv_toggle').attr("src", "../images/flexSectionToolBar/ic_flex_locked_hidden.png");
					$('#bv_toggle').data("val", 1);
				}
			}
		//break omitted intentionally -> fallthrough necessary
		case 'moveObjects':
			if (res.hasOwnProperty("ihMsg")) {
				new nxDialog('ihRemovedMsg', {
					contents: `<p>${res.ihMsg}</p>`,
					title: "Inheritance Removal Notice",
					icon: "../images/warning.png",
					buttons: [{
						label: "OK",
						default: true,
						value: "ok"
					}],
				});
			}
		//break omitted intentionally -> fallthrough necessary
		case 'newFolder':
		case 'newItemGroup':
		case 'duplicateItemGroup':
			loc.folder = parseInt(res.data.loc);
			loc.path = res.data.path;
			updateLibrary(res.data.list, res.data.path);
			window.permList = res.permList; // used for selective button enabling
			setLibPerms();
			if (res.data.select !== null) {
				const newSelection = [{
					id: res.data.select
				}];
				if (res.action === 'newItemGroup') {
					gui.library.setSelection(newSelection, true);
					gui.library.getSelectDblclick();
				} else {
					gui.library.setSelection(newSelection, {
						preserveScroll: preserveLibraryScrollOnNextSelection
					});
				}
			}
			preserveLibraryScrollOnNextSelection = false;
			break;

		case 'fetchPreSelect':
			let selected = res.preFix + res.data.id;
			startAjax('fetchLibrary', {
				location: res.data.parent,
				select: selected
			});
			break;

		case 'removeLinks':
		case 'fetchItemGroup':
			if (res.action === 'fetchItemGroup' && typeof res._requestToken !== 'undefined') {
				const responseGroupId = res.data.group && (res.data.group.dbId || res.data.group.id);
				if (res._requestToken !== pendingItemGroupToken ||
					String(responseGroupId) !== String(pendingItemGroupId) ||
					selection.length !== 1 ||
					selection[0].type !== 'itemGroup' ||
					String(selection[0].dbId) !== String(responseGroupId)) {
					return;
				}
			}
			serverData.group = res.data.group;
			serverData.items = res.data.items;
			serverData.preview = res.data.preview || null;
			if (decodeData(serverData.group, 'group')) return;
			if (decodeData(serverData.items, 'items')) return;
			gui.itemList.setItems(cmPrepareItemListItems(serverData.items));
			decorateLockedPageItems();
			refreshGroupMetaTags();
			updateStimulusList();
			if (mode === 'editGroup') renderPageContentInteractions(cmCurrentPageId());
			if (mode === 'browsing') renderContentPreview();
			if (editOnData && mode === 'browsing') {
				editOnData = false;
				editSelection('dblclick');
			}
			break;

		case 'fetchItem':
			gui.inlineWaitMessage.removeClass('visible');
			serverData.item = res.data.item;
			if (decodeData(serverData.item, 'item')) return;
			if (serverData.item) fillDataFields();
			if (editOnData && mode === 'editGroup') {
				editOnData = false;
				editSelection('dblclick');
			}
			break;

		case 'checkItemGroup':
			editSelectionAfterCheck();
			break;

		case 'checkItem':
			if (!res.confirmation) {
				editSelectionAfterCheck();
			} else {
				let dialogData = {
					buttons: [
						{ label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel' },
						{ label: UILANG.m('OK'), 'default': true, value: 'ok' }
					],
					returnPromise: true,
					width: 500
				};
				//only one type of confirmation exists at this time, but let's prepare for adding others later if necessary
				if (res.confirmation === 'existingResults') {
					dialogData.contents = '<div class="csvImportConfirm"><strong>' + UILANG.m('Recorded results exist') + '</strong><span>' + UILANG.m("This page is in use in one or more tests and results have already been recorded. If you modify the page, existing results might be falsified. Do you want to continue at your own risk?") + '</span></div>';
					dialogData.title = UILANG.m("Edit page");
					dialogData.type = 'warning';
				}
				showDialog('editPageDialog', dialogData).then(
					(res) => {
						if (res.button === 'ok') {
							editSelectionAfterCheck();
						}
					}
				);
			}
			break;

		case 'renameGroupOrFolder':
			gui.library.updateItem([res.data.libraryUpdate]);
			gui.library.setSelection([{
				id: res.data.libraryUpdate.id
			}]);
			break;

		case 'newItem':
		case 'duplicateItem':
		case 'importExistingPages':
			serverData.items = res.data.items;
			serverData.preview = res.data.preview || null;
			if (decodeData(serverData.items, 'items')) return;
			gui.itemList.setItems(cmPrepareItemListItems(res.data.items));
			decorateLockedPageItems();
			updateStimulusList();
			if (res.action === 'importExistingPages') {
				groupSelChanged(gui.itemList.getSelection());
				if (res.data.importedPageCount) {
					gui.statusBar.setStatus(res.data.importedPageCount + ' ' + UILANG.m(res.data.importedPageCount === 1 ? 'test page imported.' : 'test pages imported.'), 3000, '#0A0');
				}
			} else {
				gui.itemList.setSelection(res.data.id); //data.id is the id of the newly created item
				groupSelChanged(fetchObjectFromArray(serverData.items, { 'id': res.data.id }));
			}
			break;

		case 'deleteItem':
			if (!res.confirmation) {
				gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
				serverData.group = res.data.group;
				serverData.items = res.data.items;
				serverData.preview = res.data.preview || null;
				if (decodeData(serverData.group, 'group')) return;
				if (decodeData(serverData.items, 'items')) return;
				gui.itemList.setItems(cmPrepareItemListItems(serverData.items));
				decorateLockedPageItems();
				groupSelChanged(gui.itemList.getSelection());
				updateStimulusList();
				if (editOnData && mode === 'browsing') {
					editOnData = false;
					editSelection('dblclick');
				}
				break;
			} else {
				let dialogData = {
					buttons: [
						{ label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel' },
						{ label: UILANG.m('OK'), 'default': true, value: 'ok' }
					],
					returnPromise: true,
					contents: res.confirmation,
					title: UILANG.m('Warning'),
					width: 400
				};
				showDialog('deletePageDialog', dialogData).then(
					(dRes) => {
						if (dRes.button === 'ok') {
							startAjax('deleteItem', {
								id: res.data.id,
								groupId: serverData.group.id,
								force: true
							});
						}
					}
				);
			}
			break;

		case 'saveItemGroup':
			const libData = {
				id: 'ig' + res.data.id,
				dbId: res.data.id,
				pid: 'f' + res.data.parent,
				type: 'itemGroup',
				name: res.data.name,
				label: res.data.name,
				sortKey: res.data.name
			};
			serverData.group = res.data;
			serverData.preview = res.data.preview || null;
			if (decodeData(serverData.group, 'group')) return;
			if (mode === 'editGroup') {
				refreshGroupMetaTags();
				gui.statusBar.setStatus(UILANG.m('Saved'), 2000, '#0A0');
				break;
			}
			serverData.items = res.data.items;
			gui.library.updateItem([libData]);
			if (decodeData(serverData.items, 'items')) return;
			if (serverData.item) fillDataFields();
			refreshGroupMetaTags();
			let selectedItem = gui.itemList.getSelection();
			if (selectedItem) selectedItem = selectedItem.id;
			gui.itemList.setItems(cmPrepareItemListItems(serverData.items));
			decorateLockedPageItems();
			if (selectedItem) {
				gui.itemList.setSelection([selectedItem]);
				startAjax('fetchItem', {
					id: selectedItem
				});
			}
			if (mode === 'browsing') {
				gui.library.setSelection([{
					id: 'ig' + res.data.id
				}]);
				renderContentPreview();
			}
			break;

		case 'renameItem':
		case 'saveItem':
			if (res.warning) {
				showMessage(res.warning);
			}
			serverData.item = res.data.item;
			if (decodeData(serverData.item, 'item')) return;
			cmPrepareItemListItems([res.data.item]);
			gui.itemList.updateItem(res.data.item);
			decorateLockedPageItems();
			fillDataFields();
			itemSelection = gui.itemList.getSelection();
			groupSelChanged(itemSelection);
			if (closeTest === true) {
				closeTest = false;
				abortEditing();
			}
			break;

		case 'search':
			if (res.data.list.length > 0) {
				gui.library.searchShow(res.data.list, res.data.searchString);
			} else {
				showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library, {metaSearch: true});
			}
			break;
		case 'metaSearch':
			if (res.data.list.length > 0) {
				gui.library.searchShow(res.data.list, res.data.searchString);
			} else {
				showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library, {metaSearch: true});
			}
			break;

		case 'lockItem':
			if (res.confirmation === 'lockExpired') {
				let frame = $('#pageEditor');
				try {
					frame.get(0).contentWindow.forceCloseEditor();
				} catch (e) {
					/* The function executes fine, but when the iframe closes the event loop returns to this call
					 * Javascript throws an error because the function now no longer exists. Hence the try catch block
					 * merely to prevent an error message from being written to the console on successful execution. */
				}
			}
			if (res.sessionTimeLeft <= 120) {
				if (typeof($('#pageEditor').get(0).contentWindow.showSessionExpiryWarning) === 'function') {
					$('#pageEditor').get(0).contentWindow.showSessionExpiryWarning();
				}
				if (res.sessionTimeLeft < 15) {
					clearInterval(lockTimer);
					//set a timeout to ensure the session expired function is called the exact moment the session expires
					lockTimer = setTimeout(() => {
						if (typeof($('#pageEditor').get(0).contentWindow.sessionExpired) === 'function') {
							$('#pageEditor').get(0).contentWindow.sessionExpired();
						}
					}, res.sessionTimeLeft * 1000);
				}
			}
			break;

		/* FYI: Start of permission related Ajax returns */

		case 'fetchIgPerm':
			igp_return(res, 'content');
			break;

		case 'updatePerm':
			up_return(res, 'content');
			break;

		default:
			break;
		// #### END SWITCH ####
	}
}
