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
	item: null
}; //group level means either a group or a folder wich contains groups

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

//variables for tracking doubleclicks
let waitingForDblClick;
let libraryTimeout;
let editOnData = false;

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
	gui.s2 = createFlexSection('UI', 'sect002', 300, 450); //group properties and page list
	gui.s3 = createFlexSection('UI', 'sect003', 300, 450); //page properties

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
			}
		},
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
	gui.s2.hide();

	//section 3 (page level)
	gui.boxes.itemProperties = createFlexBox(gui.s3, 'itemProperties', {
		title: UILANG.m('Page Properties'),
		minHeight: 480,
		flex: 1,
		locked: true
	});
	gui.boxes.itemProperties.getInnerBox().append('<div id="inlineWaitMessage">' + UILANG.m('Please wait …') + '</div>');
	gui.inlineWaitMessage = $('#inlineWaitMessage');
	// gui.inlineWaitMessage.hide();
	gui.fields.itemName = insertTextfield(gui.boxes.itemProperties.getInnerBox(), 'tfItemName', UILANG.m('Name'), {
		readOnly: true
	});
	gui.fields.itemCode = insertTextfield(gui.boxes.itemProperties.getInnerBox(), 'tfItemCode', UILANG.m('code'), {
		readOnly: true
	});
	gui.fields.languages = insertTextfield(gui.boxes.itemProperties.getInnerBox(), 'tfLanguages', UILANG.m('languages'), {
		readOnly: true
	});
	gui.fields.useAsStimulus = insertToggleswitch(gui.boxes.itemProperties.getInnerBox(), 'cbStimulus', UILANG.m('Use as stimulus'), {
		changeCallback: (...params) => toggleStimulusRole(...params),
		alignment: 'left'
	});
	gui.fields.archived = insertToggleswitch(gui.boxes.itemProperties.getInnerBox(), 'cbArchived', UILANG.m('Archived'), {
		changeCallback: (...params) => toggleArchivedFlag(...params),
		alignment: 'left'
	});
	gui.fields.dlStimuli = insertDropdown(gui.boxes.itemProperties.getInnerBox(), 'dlStimuli', UILANG.m('Linked stimulus'), {
		elements: [],
		noChoiceTitle: UILANG.m('no stimulus in group'),
		listTitle: '',
		dataId: 'link',
		onChange: (sender, value) => onStimulusSelect(value),
		order: 'label',
		width: '100%'
	}, {
		twoRows: true
	});
	gui.s3.hide();
	insertSpacer(gui.boxes.itemProperties.getInnerBox());
	gui.fields.pageComment = insertStaticText(gui.boxes.itemProperties.getInnerBox(), 'pageComment', `<b>${UILANG.m('Comments:')}</b>`, {}, { twoRows: true });


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
	gui.library = new fileMgr("#itemGroupList", "_idSuffix", [], breadcrumbs, fileOpPermissions, true, libraryEvent, 'all', true);

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
	let visibleButtons = [];
	switch (mode) {

		case 'browsing':
			visibleButtons = ['newFolder', 'newItemGroup', 'editSelection', 'deleteSelection', 'preview', 'duplicate', 'searchFiler', 'rename'];
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
			librarySelection(gui.library.getSelect(), true);
			break;

		case 'editGroup':
			buttons.abortEditing.enable();
			visibleButtons = ['abortEditing', 'media', 'preview', 'rename'];
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
			gui.boxes.itemProperties.lock();
			break;

	}
	for (let i in visibleButtons) {
		b = visibleButtons[i];
		buttons[b].show();
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
	}

	waitDialog.hide('*');
	updateLock();
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
			librarySelection(data);
			break;
		case 'getSelectKeys':
			if (mode === 'browsing') librarySelection(data, true);
			break;
		case 'onNavigate':
			clearTimeout(libraryTimeout);
			waitingForDblClick = null;
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

	clearTimeout(libraryTimeout);

	if (selection.length === 0) {
		/* if nothing is selected */

		buttons.deleteSelection.disable();
		buttons.editSelection.disable();
		buttons.rename.disable();
		buttons.preview.disable();
		buttons.duplicate.disable();
		// buttons.editPerm.disable();
		gui.s2.hide();
		mayEditGroup = false;

	} else if (selection.length === 1) {
		/* if a single entry is selected */

		if (!waitingForDblClick) {
			/* if the librarySelection call is not preceded by another, shortly before
		 then we wait to see if user will do a doubleclick => timer 250 ms to return here */
			waitingForDblClick = data;
			libraryTimeout = setTimeout(function() {
				librarySelection(data, true);
			}, 250);
			return;

		} else if (selection[0] !== waitingForDblClick[0]) {
			/* if the call is indeed preceded by another call within 250 ms,
		 but the selection is a different one => save new data and start new 250ms timer */
			waitingForDblClick = data;
			libraryTimeout = setTimeout(function() {
				librarySelection(data, true);
			}, 250);
			return;
		}

		/* This is either the second click in a double click or the timer has triggered this call as there will be no double click */

		waitingForDblClick = null;
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

			gui.s2.show();
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

			startAjax('fetchItemGroup', {
				id: selection[0].dbId,
				location: loc.folder
			});
			// FOLDER CLICK: SINGLE
		} else if (delayed) {
			/* if it's a folder, and the method was triggered by the timer
		 (a doubleclick on a folder will not enter the edit mode, but open the folder instead) */
			gui.s2.hide();
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
		gui.s3.show();
		$('#itemProperties').removeClass('blank');
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
		gui.inlineWaitMessage.removeClass('visible');
		$('#itemProperties').addClass('blank');
	}
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

function libraryRename(data, button, name) {
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
			mandatory: ['dialogField1'], //disable OK button if field is empty or contains only whitespace
			blackList: {
				dialogField1: [data.name]
			}, //disable OK button if name has not been changed
			focus: 'dialogField1',
			values: {
				dialogField1: data.name
			},
			contents: '<p>' + UILANG.m('Please enter a new name:') + '<br><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
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
			contents: '<p>' + UILANG.m('Please enter a new name:') + '<br><input class="iri" type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('And a new code:') + '<br><input class="iri" type="text" id="dialogField2" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
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
			id: data.id
		});
	}
}

function saveData(type) {
	switch (type) {
		case 'group':
			startAjax('saveItemGroup', serverData.group);
			break;
		case 'item':
			startAjax('saveItem', serverData.item);
			break;
	}
}

function fillDataFields() {
	updateItemsFromItem();
	gui.fields.itemName.getPropertyField().reset(findData('item', 'name'));
	gui.fields.itemCode.getPropertyField().reset(findData('item', 'itemCode'));
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
	gui.fields.pageComment.getPropertyField().setText(findData('item', 'metadata', 'comments'));
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
		let nfContent = `<p>` + UILANG.m('Please enter a name for the folder:') + `<br>
		<input type="text" maxlength="200" id="newFolderName" style="width: 100%; margin-top: 10px;">
		</p>`;

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
			contents: '<p>' + UILANG.m('Please enter a name:') + '<br><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
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
				message = '<p>' + UILANG.m('really_delete_item') + '</p>' + message;
				if (foldersInSelection) {
					message += '<p class="red">' + UILANG.m('warning_recursive') + '</p>';
				}
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
			if (!button) {
				message = '';
				if (serverData.items.some(page => page.link === sel.id)) {
					message += '<p>' + UILANG.m('This page is linked as a stimulus to at least one other page. Deleting it will remove all existing links.') + '</p>';
				}
				message += '<p>' + UILANG.m('delete_this') + '</p>' + sel.name;
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
					title: UILANG.m('Delete selection')
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
			contents: '<p>' + UILANG.m('Please enter a name:') + '<br><input class="nii" type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('And optionally a code:') + '<br><input class="nii" type="text" id="dialogField2" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
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
			contents: '<p>' + UILANG.m('Please enter a name:') + '<br><input class="dii" type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('And optionally a code:') + '<br><input class="dii" type="text" id="dialogField2" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
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
	gui.library.filerSearch();
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
	gui.itemList.updateItem(tempObj);
	updateStimulusList();
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
		contents: msg,
		width: 500,
		callback: callback,
		title: UILANG.m("Error"),
		icon: "../images/error.png",
		iconWidth: 64
	};
	new nxDialog('Message', dialogData, params);
}

function showMsgNoSrchResults(msg, searchTerm, component) {
	function showMsgNoSrchResultsCB(button) {
		if (button === 'new') {
			component.filerSearch(searchTerm);
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

async function startAjax(action, data) {
	waitDialog.show(action);
	const params = {
		action: action,
		data: JSON.stringify(data)
	};
	return $.ajax({
		data: params
	})
}

function ajaxError(jqXHR, textStatus, errorThrown) {
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

	let actionsFromThisScript = ['fetchPreSelect', 'fetchLibrary', 'checkItemGroup', 'checkItem', 'fetchItemGroup', 'fetchItem', 'clipboardCheck', 'removeLinks', 'interactionCheck', 'search', 'updateWatchList', 'renameGroupOrFolder', 'renameItem', 'saveItemGroup', 'saveItem', 'newFolder', 'newItemGroup', 'moveObjects', 'deleteSelection', 'deleteItem', 'newItem', 'duplicateItemGroup', 'duplicateItem', 'lockItem', 'errorLog'];

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
			contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError,
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
			contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error,
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
			if (res.data.select !== null) {
				gui.library.setSelection([{
					id: res.data.select
				}]);
			}
			window.permList = res.permList; // used for selective button enabling
			setLibPerms();
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
			serverData.group = res.data.group;
			serverData.items = res.data.items;
			if (decodeData(serverData.group, 'group')) return;
			if (decodeData(serverData.items, 'items')) return;
			gui.itemList.setItems(serverData.items);
			updateStimulusList();
			if (editOnData && mode === 'browsing') {
				editOnData = false;
				editSelection('dblclick');
			}
			break;

		case 'fetchItem':
			gui.inlineWaitMessage.removeClass('visible');
			serverData.item = res.data.item;
			if (decodeData(serverData.item, 'item')) return;
			fillDataFields();
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
					width: 400
				};
				//only one type of confirmation exists at this time, but let's prepare for adding others later if necessary
				if (res.confirmation === 'existingResults') {
					dialogData.contents = UILANG.m("This page is in use in one or more tests and results have already been recorded. If you modify the page, existing results might be falsified. Do you want to continue at your own risk?");
					dialogData.title = UILANG.m("Edit page");
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
			groupSelChanged(gui.itemList.getSelection());
			serverData.items = res.data.items;
			if (decodeData(serverData.items, 'items')) return;
			gui.itemList.setItems(res.data.items);
			gui.itemList.setSelection(res.data.id); //data.id is the id of the newly created item
			updateStimulusList();
			groupSelChanged(fetchObjectFromArray(serverData.items, { 'id': res.data.id }));
			break;

		case 'deleteItem':
			if (!res.confirmation) {
				gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
				serverData.group = res.data.group;
				serverData.items = res.data.items;
				if (decodeData(serverData.group, 'group')) return;
				if (decodeData(serverData.items, 'items')) return;
				gui.itemList.setItems(serverData.items);
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
				pid: 'ig' + res.data.parent,
				type: 'itemGroup',
				name: res.data.name,
				label: res.data.name,
				sortKey: res.data.name
			};
			gui.library.updateItem([libData]);
			serverData.group = res.data;
			fillDataFields();
			let selectedItem = gui.itemList.getSelection();
			if (selectedItem) selectedItem = selectedItem.id;
			gui.itemList.setItems(res.data.items);
			if (selectedItem) {
				gui.itemList.setSelection([selectedItem]);
				startAjax('fetchItem', {
					id: selectedItem
				});
			}
			gui.library.setSelection([{
				id: 'ig' + res.data.id
			}]);
			break;

		case 'renameItem':
		case 'saveItem':
			if (res.warning) {
				showMessage(res.warning);
			}
			serverData.item = res.data.item;
			if (decodeData(serverData.item, 'item')) return;
			gui.itemList.updateItem(res.data.item);
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
				showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library);
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