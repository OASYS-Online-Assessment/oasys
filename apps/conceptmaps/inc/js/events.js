"use strict";

function initCanvas() {
	canvasHeight = Math.floor(paperHeight * resolution);
	canvasWidth = Math.floor(paperWidth * resolution);
	$("#wrapper").css({width: canvasWidth + 'px', height: canvasHeight + 'px'});


	canvas = Raphael('canvas', canvasWidth, canvasHeight);
	Ox = $('#canvas').offset().left;
	Oy = $('#canvas').offset().top;

	$(document).on("contextmenu", onContextMenu);
	$(document).keydown(docKeyDown);
	//$(window).on('beforeunload', closeEditorWarning);
	$('svg').css('zoom', zoom);
	drawHandles();
	drawMarquee();
	setGrid(gridSize);
	canvas.setViewBox(0, 0, canvasWidth, canvasHeight, false);
	$('#canvas').append('<div id="textOverlay" title="' + UILANG.m("text editor") + '" data-translate="text editor" class="icon-pencil"></div>');
	textOverlay = $('#textOverlay').hide();
	$(window).on("message", onMessage);
}

function onMessage(e) {
	switch (e.originalEvent.data) {
		case 'forceClose':
			$(window).off('beforeunload');
			OASYSCOM.saveToOasys();
	}
}

function getURLParameters() {
	let rx = /[?&](.+?)=([^&]*)/g;
	let allParams = {};
	let param = '';
	RegExp.lastIndex = 0;
	do {
		param = rx.exec(window.location);
		if (param) allParams[decodeURI(param[1])] = decodeURI(param[2]);
	} while (param);
	return allParams;
}


function domReady() {
	$('#controls-container').on('click', e => e.preventDefault());
	$('#innerLeftPanel').on('click', e => e.preventDefault());
	params = getURLParameters();
	documentName = params['document'] || 'untitled document';
	if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)) {
		handleSize = 25;
		touchDevice = true;
	}
	$.ajaxSetup({
		type: "POST",
		cache: false,
		dataType: "json",
		timeout: 10000,
		success: onAjaxData,
		error: onAjaxError,
		url: 'actions.php'
	});
	initCanvas();
	// UG here
	drawMode = 'rectangle';
	connectMode = 'straight';
	objStyle["stroke"] = conColor;
	objStyle["fill"] = objColor;
	connectorStyle["stroke"] = conColor;
	let toolsData = {
		options: [
			//{icons: ['images/select_icon.png'], value: 'selecting', type: 'simple', color: 'var(--main-highlight_bg-color)', title: 'Selection', tooltip: UILANG.m('selection tool'), translate: 'selection tool', separator: 20},
			//{icons: ['images/draw_icon.png','images/drawing_RoundRectangle_S.png','images/drawing_Ellipse_S.png','images/drawing_Diamond_S.png'], value: 'drawing', type: 'split', color: 'var(--main-highlight_bg-color)', title: 'Drawing Tool', tooltip: UILANG.m('drawing tool'), translate: 'drawing tool'},
			{
				icons: ['images/icons/ic_cms_select.png'],
				value: 'selecting',
				type: 'simple',
				color: 'var(--color-active-1)',
				title: 'selection tool',
				tooltip: UILANG.m('selection tool'),
				translate: 'selection tool',
				separator: 20
			},
			{
				icons: ['images/icons/ic_cms_add.png'],
				value: 'drawing',
				type: 'simple',
				color: 'var(--color-active-2)',
				title: 'drawing tool',
				tooltip: UILANG.m('drawing tool'),
				translate: 'drawing tool'
			},
			{
				icons: ['images/icons/ic_cms_connect_straight.png'],
				value: 'connecting',
				type: 'simple',
				color: 'var(--color-active-3)',
				title: 'connection tool',
				tooltip: UILANG.m('connection tool'),
				translate: 'connection tool'
			}
		],
		callback: toolCallback,
		active: 1,	//which tool is active on start
		fallback: 0	//which tool to fall back on when in single mode
	};
	const zoomButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('zoom settings'),*/
		label: UILANG.m('zoom settings'),
		translate: 'zoom settings',
		value: 'zoomButton',
		/*symbol: 'icon-search',*/
		icon: 'images/icons/ic_cms_zoom.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}

	};
	const deleteButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('delete selected elements'),*/
		label: UILANG.m('delete selected elements'),
		translate: 'delete selected elements',
		value: 'deleteButton',
		/*symbol: 'icon-remove',*/
		icon: 'images/icons/ic_cms_delete.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const uploadBtnData = {
		callback: uploadDocument,
		/*tooltip: UILANG.m('upload document'),*/
		label: UILANG.m('upload document'),
		translate: 'upload document',
		value: 'x',
		icon: 'images/icons/ic_tb_cms_upload.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const downloadButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('download document'),*/
		label: UILANG.m('download document'),
		translate: 'download document',
		value: 'downloadButton',
		icon: 'images/icons/ic_tb_cms_download.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const openButtonData = {
		callback: uploadDocument,
		/*tooltip: UILANG.m('upload document'),*/
		label: UILANG.m('open'),
		translate: 'open',
		value: 'x',
		icon: 'images/icons/ic_tb_cm_openFile.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const LockButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('redo'),*/
		label: UILANG.m('Lock'),
		translate: 'Lock',
		value: 'lockButton',
		/*symbol: 'icon-redo',*/
		icon: 'images/icons/ic_tb_cm_opt_locked_all.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const showButtonData = {
		callback: OASYSCOM.showQuestion,
		/*tooltip: UILANG.m('download document'),*/
		label: UILANG.m('Show question'),
		translate: 'Show question',
		value: 'showButton',
		icon: 'images/icons/ic_tb_cms_q_preview.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const saveButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('download document'),*/
		label: UILANG.m('save'),
		translate: 'save',
		value: 'downloadButton',
		/*symbol: 'icon-file-download',*/
		icon: 'images/icons/ic_tb_cms_save2oasys.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const save2oasisButtonData = {
		callback: OASYSCOM.saveToOasys,
		/*tooltip: UILANG.m('download document'),*/
		label: UILANG.m('save'),
		translate: 'save',
		value: 'save2oasisButton',
		/*symbol: 'icon-file-download',*/
		icon: 'images/icons/ic_tb_cms_save2oasys.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const closeEditorButtonData = {
		callback: OASYSCOM.closeEditor,
		/*tooltip: UILANG.m('download document'),*/
		label: UILANG.m('Close'),
		translate: 'Close',
		value: 'closeEditorButton',
		icon: 'images/icons/ic_tb_cms_close_editor.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const returnToTestButtonData = {
		callback: OASYSCOM.closeEditor,
		label: UILANG.m('Return to test'),
		translate: 'Return to test',
		value: 'returnToTestButton',
		icon: 'images/icons/ic_tb_back.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const gridButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('grid settings'),*/
		label: UILANG.m('grid settings'),
		translate: 'grid settings',
		value: 'gridButton',
		/*symbol: 'icon-grid',*/
		icon: 'images/icons/ic_cms_grid.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}

	};
	const scrollButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('scroll document'),*/
		label: UILANG.m('scroll document'),
		translate: 'scroll document',
		value: 'scrollButton',
		/*symbol: 'icon-move',*/
		icon: 'images/icons/ic_cms_hand.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const undoButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('undo'),*/
		label: UILANG.m('undo'),
		translate: 'undo',
		value: 'undoButton',
		/*symbol: 'icon-undo',*/
		icon: 'images/icons/ic_cms_undo.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}

	};
	const redoButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('redo'),*/
		label: UILANG.m('redo'),
		translate: 'redo',
		value: 'redoButton',
		/*symbol: 'icon-redo',*/
		icon: 'images/icons/ic_cms_redo.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};
	const clearCanvasButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('redo'),*/
		label: UILANG.m('clear canvas'),
		translate: 'clear canvas',
		value: 'clearCanvasButton',
		/*symbol: 'icon-redo',*/
		icon: 'images/icons/ic_cms_clearCanvas.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};

	const helpBtnData = {
		// width: 36,
		// height: 36,
		/*tooltip: UILANG.m('help'),*/
		label: UILANG.m('help'),
		translate: 'help',
		value: 'x',
		icon: 'images/icons/ic_cms_info.svg',
		iconWidth: '36',
		iconHeight: '36',
		callback: showHelp,
	};
	const langButtonData = {
		callback: toolCallback,
		/*tooltip: UILANG.m('language'),*/
		label: UILANG.m('language'),
		translate: 'language',
		value: 'langButton',
		/*symbol: 'icon-home',*/
		icon: 'images/icons/ic_cms_language.svg',
		iconWidth: '36px',
		iconHeight: '36px',
		style: {}
	};

	const drawingToolData = {
		options: [
			{icon: 'images/drawing_Rectangle.png', value: 'rectangle'},
			{icon: 'images/drawing_RoundRectangle.png', value: 'roundedRectangle'},
			{icon: 'images/drawing_Ellipse.png', value: 'ellipse'},
			{icon: 'images/drawing_Diamond.png', value: 'diamond'}
		],
		"undefined": 'images/drawing_undefined.png',
		useIcons: true,
		callback: toolCallback,
		style: 'white',
		tooltip: UILANG.m('object shape'),
		translate: 'object shape',
		hideWhenDisabled: false,
		active: true
	};
	const connectorToolData = {
		options: [
			{icon: 'images/connectors_bez.png', value: 'bezier'},
			{icon: 'images/connectors_rect.png', value: 'lines'},
			{icon: 'images/connectors_straight.png', value: 'straight'}
		],
		"undefined": 'images/connectors_undefined.png',
		useIcons: true,
		callback: toolCallback,
		style: 'white',
		tooltip: UILANG.m('connector shape'),
		translate: 'connector shape',
		hideWhenDisabled: false,
		active: true
	};
	const styleData = {
		options: [
			{icon: 'images/lineStyle-01.png', value: ''},
			{icon: 'images/lineStyle-02.png', value: '.'},
			{icon: 'images/lineStyle-03.png', value: '. '},
			{icon: 'images/lineStyle-04.png', value: '-'},
			{icon: 'images/lineStyle-05.png', value: '- '},
			{icon: 'images/lineStyle-06.png', value: '--'}
		],
		"undefined": 'images/lineStyle_undefined.png',
		useIcons: true,
		callback: toolCallback,
		style: 'white',
		tooltip: UILANG.m('line style'),
		translate: 'line style',
		hideWhenDisabled: false,
		active: true
	};
	const widthData = {
		options: [
			{icon: 'images/lineWidth-01.png', value: 1},
			{icon: 'images/lineWidth-02.png', value: 2},
			{icon: 'images/lineWidth-03.png', value: 3},
			{icon: 'images/lineWidth-04.png', value: 4}
		],
		"undefined": 'images/lineWidth_undefined.png',
		useIcons: true,
		callback: toolCallback,
		style: 'white',
		tooltip: UILANG.m('line width'),
		translate: 'line width',
		hideWhenDisabled: false,
		active: true
	};


	//create sections
	leftPanel = $('#leftPanel');
	addSection('innerLeftPanel', 'propertiesSection', '', '<div id="properties"></div>');
	addSeparator('innerLeftPanel', 'verticalSpace', 0, 40);
	/* autosave notice for assessment context */
	/*addSection('innerLeftPanel', 'autosaveNotice', '', '<p class="sectionTitle" style="color:#ffffff;" data-translate="All changes will be automatically saved.">' + UILANG.m('All changes will be automatically saved.') + '</p>');*/

	//create buttons in sidebar
	bDrawingTool = new nxMultiState('properties', 'drawingTool', drawingToolData); // UG done shape
	$('#properties').append('<div id="container_cm_objects_color"><input type="text" id="cm_objects_color"></div>');
	$('#cm_objects_color').spectrum({
    	showPalette: true,
    	color: objColor,
    	chooseText: "OK",
    	cancelText: "",
    	clickoutFiresChange: false,
    	palette: [
    	    ['black', 'white', 'red', 'blue'],
    	],
    	replacerClassName: 'colorpicker',
    	change: function(color) {
    		if ((color ?? null) === null) return;
    		let c = color.toHexString(); // #ff0000
    		toolCallbackInterface({'data':{sender:'colorButton', color:c}});
		}
	});
	function toolCallbackInterface(e) { // interface providing expected data to toolCallback
		toolCallback(e.data.sender, e.data.color);
	}
	bConnectorTool = new nxMultiState('properties', 'connectorTool', connectorToolData); // connector style UG done
	bStyle = new nxMultiState('properties', 'styleButton', styleData); // linestyle, both UG doner
	bWidth = new nxMultiState('properties', 'widthButton', widthData); // UG done

	$('#properties').append('<div id="container_cm_stroke_color"><input type="text" id="cm_stroke_color"></div>');
	$('#cm_stroke_color').spectrum({
    	showPalette: true,
    	preferredFormat: "hex",
    	color: conColor,
    	chooseText: "OK",
    	cancelText: "",
    	clickoutFiresChange: false,
    	palette: [
    	    ['black', 'white', 'red', 'blue'],
    	],
    	replacerClassName: 'colorpicker',
    	change: function(color) {
    		if ((color ?? null) === null) return;
    		let c = color.toHexString(); // #ff0000
    		toolCallbackInterface({'data':{sender:'strokeColorButton', color:c}});
		}
	});

	// remove unicode arrow from sidebar colorpickers
	$('.colorpicker .sp-dd').empty();

	// tool switch in topbar
	bTools = new nxSwitch('tools-container', 'toolSwitch', toolsData); // topbar done
	setProperties();
	addSeparator('controls', 'horizontalSpace', 5, 5);
	// tools in center topbar
	bZoom 		= new nxButton($('#controls'), 'zoomButton', zoomButtonData);
	bDelete 	= new nxButton($('#controls'), 'deleteButton', deleteButtonData);
	bUpload 	= new nxButton($('#controls'), 'uploadButton', uploadBtnData);
	bDownload 	= new nxButton($('#controls'), 'downloadButton', downloadButtonData);

	// standalone save and open
	bOpen 	= new nxButton($('#controls'), 'openButton', openButtonData);
	bSave 	= new nxButton($('#controls'), 'saveButton', saveButtonData);

	bGrid 		= new nxButton($('#controls'), 'gridButton', gridButtonData);

	if (touchDevice) bScroll = new nxButton($('#controls'), 'scrollButton', scrollButtonData);

	bUndo = new nxButton($('#controls'), 'undoButton', undoButtonData);
	bRedo = new nxButton($('#controls'), 'redoButton', redoButtonData);
	bClearCanvas = new nxButton($('#controls'), 'clearCanvasButton', clearCanvasButtonData);


	bHelp 		 = new nxButton($('#controls_right'), 'helpButton', helpBtnData);
	bLock 		 = new nxButton($('#controls_right'), 'lockButton', LockButtonData);
	bShow		 = new nxButton($('#controls_right'), 'showButton', showButtonData);
	bSave2oasys  = new nxButton($('#controls_right'), 'save2oasysButton', save2oasisButtonData);
	bSave2oasys.disable(); //nothing to save before anything is changed...
	bCloseEditor = new nxButton($('#controls_right'), 'closeEditorButton', closeEditorButtonData);
	bReturnToTest = new nxButton($('#controls_right'), 'returnToTestButton', returnToTestButtonData);
	bLang 		 = new nxButton($('#controls_right'), 'langButton', langButtonData);
	bUndo.disable();
	bRedo.disable();
	bDelete.disable();

	// register for translation
	UILANG.registerNxButton ([bZoom, bDelete, bUpload, bGrid, bScroll, bUndo, bRedo, bDownload, bLang, bHelp, bClearCanvas, bSave2oasys, bCloseEditor, bReturnToTest, bOpen, bSave, bShow, bLock]);
	//create popups
	let zoomContents = '<table id="zoomTable"><tr class="sliderTableGraduation"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td colspan="8" class="sliderTableSpacer"></td></tr><tr><td colspan="8" id="zoomSlider"></td></tr></table>';
	zoomPopup = new nxPopup('zoomPopup', {
		width: 500,
		height: 60,
		fixedTopMargin: '7',
		background: 'rgba(255, 255, 255, 0.5)',
		contents: zoomContents
	});
	let gridContents = '<div class="hoverHilight"><input type="checkbox" id="cbViewGrid"><label data-translate=" grid visible">' + UILANG.m(' grid visible') + '</label></div><div class="hoverHilight"><input type="checkbox" id="cbSnapToGrid"><label data-translate=" snap to grid">' + UILANG.m(' snap to grid') + '</label></div>';
	gridPopup = new nxPopup('gridPopup', {
		/*anchor: $('#gridButton'),*/
		width: 250,
		height: 60,
		fixedTopMargin: '7',
		background: 'rgba(255, 255, 255, 0.5)',
		contents: gridContents
	});

	let lockContents = '<div><input type="checkbox" id="cbLockShapes"><label data-translate="Lock content">' + UILANG.m('Lock content') + '</label></div><div><input type="checkbox" id="cbLabelsEditable"><label data-translate="Labels editable">' + UILANG.m('Labels editable') + '</label></div>';
	lockPopup = new nxPopup('lockPopup', {
		width: 250,
		height: 60,
		fixedTopMargin: '7',
		background: 'rgba(255, 255, 255, 0.5)',
		contents: lockContents
	});
	let langContents = '<ul id="languageSelectList">'+
	'<li><button class="langSelButton" id="langEN" onclick="languageChanged(this)" value="EN">EN</button></li>'+
    '<li><button class="langSelButton" id="langDE" onclick="languageChanged(this)" value="DE">DE</button></li>'+
    '<li><button class="langSelButton" id="langFR" onclick="languageChanged(this)" value="FR">FR</button></li>'+
    '<li><button class="langSelButton" id="langLU" onclick="languageChanged(this)" value="LU">LU</button></li>'+
	'</ul>';
	langPopup = new nxPopup('langPopup', {
		width: 70,
		height: 130,
		fixedTopMargin: '-47',
		background: 'rgba(255, 255, 255, 0.5)',
        contents: langContents
	});

	let shortcutsContents = '<p data-translate="Keyboard shortcuts" class="sectionTitle" style="touch-action: none;"><strong>'+UILANG.m('Keyboard shortcuts')+'</strong></p>'
		+ '<p data-translate="select: cmd/ctrl+1">' + UILANG.m('select: cmd/ctrl+1') + '</p>'
		+ '<p data-translate="draw: cmd/ctrl+2">' + UILANG.m('draw: cmd/ctrl+2') + '</p>'
		+ '<p data-translate="connect: cmd/ctrl+3">' + UILANG.m('connect: cmd/ctrl+3') + '</p>'
		+ '<p data-translate="zoom: cmd/ctrl+m">' + UILANG.m('zoom: cmd/ctrl+m') + '</p>'
		+ '<p data-translate="grid: cmd/ctrl+g">' + UILANG.m('grid: cmd/ctrl+g') + '</p>'
		+ '<p data-translate="delete: del/backspace">' + UILANG.m('delete: del/backspace') + '</p>'
		+ '<p data-translate="undo: cmd/ctrl+z">' + UILANG.m('undo: cmd/ctrl+z') + '</p>'
		+ '<p data-translate="redo: cmd/ctrl+shift+z">' + UILANG.m('redo: cmd/ctrl+shift+z') + '</p>'
		+ '<p class="hideWhenAssessment hideWhenEditor" data-translate="load document: cmd/ctrl+o">' + UILANG.m('load document: cmd/ctrl+o') + '</p>'
		+ '<p class="hideWhenAssessment hideWhenEditor" data-translate="save document: cmd/ctrl+s">' + UILANG.m('save document: cmd/ctrl+s') + '</p>'
		+ '<p class="hideWhenNotEditor" data-translate="import: cmd/ctrl+o">' + UILANG.m('import: cmd/ctrl+o') + '</p>'
		+ '<p class="hideWhenNotEditor" data-translate="export: cmd/ctrl+s">' + UILANG.m('export: cmd/ctrl+s') + '</p>';
	shortcutsPopup = new nxPopup('shortcutsPopup', {
		width: 220,
		height: 340,
		fixedTopMargin: '7',
		background: 'rgba(255, 255, 255, 0.5)',
		contents: shortcutsContents
	});

	let labelEditorContent = '<div style="touch-action: none;" class="section" onclick="{e => e.preventDefault()}"><div id="label-editor-header"><p data-translate="Label" class="sectionTitle" id="labelEditorSection_title" style="touch-action: none; float: left;">'+UILANG.m('Label')+'</p></div>' +
		'<div id="labelEditorContainer"> '+
		'<div class="popup-toolbar">' +
			'<div class="popup-btn cm_toolbar_bold_btn_'+UILANG.currentLang()+'" id="cm_toolbar_bold_btn" data-key="font-weight"></div>' +
			'<div class="popup-btn cm_toolbar_italic_btn_'+UILANG.currentLang()+'" id="cm_toolbar_italic_btn"></div>' +
			'<input type="text" id="cm_toolbar_color">' +
			'<form class="font-dropdown">' +
			'<label for="cm_toolbar_size" data-translate="Font size">' + UILANG.m('Font size') + '</label>\n' +
			' <select name="cm_toolbar_size" id="cm_toolbar_size">\n' +
				' <option value="8">  8</option>\n' +
				' <option value="10"> 10</option>\n' +
				' <option value="12"> 12</option>\n' +
				' <option value="16"> 16</option>\n' +
				' <option value="20"> 20</option>\n' +
			'  </select>\n' +
			'</form>' +
		'</div>' +
		'<textarea id="labelEditor" spellcheck="false" style="touch-action: none;"></textarea>' +
		'</div>' +
		'<img id="labelEditorCloseBtn" src="images/icons/ic_cm_ok_btn.svg" style="height: 40px; width: 40px; display: block; margin-left: auto;" class="nxButtonIcon nxButtonSmallIcon">' +
		'</div>';
	labelEditorPopup = new nxPopup('labelEditorPopup', {
		//anchor: $('#helpButton'),
		width: 400,
		height: 270,
		background: 'rgba(255, 255, 255, 0.5)',
		contents: labelEditorContent,
		callbacks: {
			show: () => {
				setTimeout(() => {$('#cm_toolbar_color').spectrum("enable");}, 10);
			},
			hide: () => {
				$('#cm_toolbar_color').spectrum("disable");
			}
		}
	});

	//labelEditorSection = $('#labelEditorSection');
	labelEditor = $('#labelEditor');
	labelEditor.on({focus: editorFocused, blur: editorLostFocus, input: onEditorActivity});

	$('#cm_toolbar_color').spectrum({
		showPalette: true,
		chooseText: "OK",
		cancelText: "",
		palette: [
			['black', 'white', 'red', 'blue'],
		],
		disabled: true,
		change: function(color) {
			let c = color.toHexString(); // #ff0000
			formatLabel({'data':{sender:'cm_toolbar_color', color:c}});
		},
	});

	let pointerHandler = jsPointerHandler.instance;
	pointerHandler.listen($('#labelEditorCloseBtn'), {
		callbacks: {
			up: () => {
					labelEditorPopup.toggle();
				},
		}
	});
	pointerHandler.listen($('#cm_toolbar_bold_btn'), {
		callbacks: {
			up: () => formatLabel({'data':{sender:'cm_toolbar_bold_btn'}})
		}
	});
	pointerHandler.listen($('#cm_toolbar_italic_btn'), {
		callbacks: {
			up: () => formatLabel({'data':{sender:'cm_toolbar_italic_btn'}})
		}
	});


	$('#cm_toolbar_size').on('change',{sender:'cm_toolbar_size'}, formatLabel);

	$('#cbSnapToGrid').prop('checked', gridMode);
	$('#cbViewGrid').prop('checked', gridVisible);
	$('.hoverHilight').click(hoverHilightClick).children().css('pointer-events', 'none');

	$('#cbLabelsEditable, #cbLockShapes').on('click', lockStateChange);

	$("#zoomSlider").html("<input type='range' id='zoomRange' min='-4' max='4' value='0'>");
	$("#zoomRange").on("input", zoomSlide);

	// scroll message //
	$('body').append('<div id="scrollMsg" class="nxPopup"><p data-translate="scrollmode active">'+UILANG.m('scrollmode active')+'</p></div>');
	$( "#scrollMsg" ).on( "click", function() { // turn off scroll mode
  		toolCallback('scrollButton');
	});
	$('#scrollMsg').toggle();

	if (params.file) {
		loadFile(params.file);
		if (bTools) bTools.fallback(); //activate selector tool if user loads an existing document, rather than the default draw tool
	}
	newUndoStep();

	if (OASYSCOM.getContext() !== 'manualCorrection') { // stop all in manual correction context
		pointerHandler.listen($("#canvas"), {
			callbacks: {
				move: canvasMouseMove,
				down: canvasMouseDown,
				up: canvasMouseUp,
				out: canvasMouseUp,
				outsidewindow: canvasMouseUp,
				leave: canvasLeave,
				over: canvasEnter,
			},
		});

		pointerHandler.listen($('#textOverlay'), {
			callbacks: {
				//move: canvasMouseMove,
				down: textOverlayMouseDown,
				up: textOverlayMouseUp,
				//leave: canvasMouseMove,
				//down: textOverlayMouseUp
			},
			waitForDblclick: true,
			hoverClass:'textOverlayHover'
		});
	}
	pointerHelper = new jsPointerHelper({'minDeltaX':5, 'minDeltaY':5});
	//savingWatcher = new SavingWatcher();
	OASYSCOM.doContext();

	// prevent double tap zoom on tablets for all div 
	$('div').attr('onClick', '{e => e.preventDefault()}'); // yes, kinda ugly, blame Apple, not me...

	$('#lang'+UILANG.currentLang()).addClass('currentLang');
}

function zoomSlide(e) {
	let v = $('#zoomRange').val();
	if (v < 0) {
		zoom = 1 + 0.125 * v;
		setGrid(24 + 3 * v);
	} else {
		zoom = 1 + 0.25 * v;
		setGrid(24 + 6 * v);
	}
	$("#wrapper").css({width: Math.round(zoom * canvasWidth) + 'px', height: Math.round(zoom * canvasHeight) + 'px'});
	$("#canvas").css({width: Math.round(zoom * canvasWidth) + 'px', height: Math.round(zoom * canvasHeight) + 'px'});
	canvas.setSize(Math.round(zoom * canvasWidth), Math.round(zoom * canvasHeight));
	showTextOverlay();
	log('set zoom level: %@', zoom);
}

function hoverHilightClick(e) {
	const target = $(e.delegateTarget).find('input[type=checkbox]');
	if (target.prop('checked')) {
		target.prop('checked', false);
		settingsChanged(target.attr('id'), false);
	} else {
		target.prop('checked', true);
		settingsChanged(target.attr('id'), true);
	}
}

function docKeyDown(e) {
	if (OASYSCOM.getContext() === 'manualCorrection') return;
	// return if there are any open dialogs
	if (e.ctrlKey || e.metaKey) {
		if ($('#veil_overwriteDialog').length) return;
		if ($('#veil_saveDialog').length) return;
		if ($('#veil_renameDialog').length) return;
		if ($('#veil_helpDialog').length) return;
		if ($('#veil_langDialog').length) return;
		if ($('#veil_questionDisplay').length) return;
		/* close popups */
		zoomPopup.hide();
		langPopup.hide();
		gridPopup.hide();
		shortcutsPopup.hide();
	}
	//delete or backspace
	if (e.which === 8 || e.which === 46) { // delete
		const n = $('*:focus').length;
		if (n === 0) {
			e.preventDefault();
			toolCallback('deleteButton');
		}
	} else if (e.which === 90 && (e.ctrlKey || e.metaKey)) { // z undo/redo
		if (e.shiftKey) {
			//redo
			e.preventDefault();
			if (bRedo.getDisabled() === false) {
				redoAction();
			}
		} else {
			//undo
			e.preventDefault();
			if (bUndo.getDisabled() === false) {
				undoAction();
			}
		}
	} else if (e.which === 0x53 && (e.ctrlKey || e.metaKey)) { // s(ave)
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		if (OASYSCOM.getContext() === 'assessment') return;
		downloadDocument();

	} else if (e.which === 79 && (e.ctrlKey || e.metaKey)) { // o(pen)
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		if (OASYSCOM.getContext() === 'assessment') return;
		uploadDocument();

	} else if (e.which === 49 && (e.ctrlKey || e.metaKey)) { // 1 select
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		bTools.setState(0);
	} else if (e.which === 50 && (e.ctrlKey || e.metaKey)) { // 2 draw
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		bTools.setState(1, 'locked');
	} else if (e.which === 51 && (e.ctrlKey || e.metaKey)) { // 3 connect
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		bTools.setState(2);
	} else if (e.which === 77 && (e.ctrlKey || e.metaKey)) { // m(agnify)
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		zoomPopup.toggle();
	} else if (e.which === 71 && (e.ctrlKey || e.metaKey)) { // g(rid)
		// editor
		labelEditorPopup.hide();
		e.preventDefault();
		gridPopup.toggle();
	}
}

function settingsChanged(id, checked) {
	switch (id) {
		case 'cbViewGrid':
			gridVisible = checked;
			setGrid(gridSize);
			if (checked) {
				log('show grid');
			} else {
				log('hide grid');
			}
			break;
		case 'cbSnapToGrid':
			gridMode = checked;
			if (checked) {
				log('snap to grid enabled');
			} else {
				log('snap to grid disabled');
			}
			break;
	}
}
function languageChanged(selectedLang){
	if(selectedLang.value !== UILANG.currentLang()){
		UILANG.updateLang(selectedLang.value);
		$('.langSelButton').removeClass('currentLang');
		$('#lang'+selectedLang.value).addClass('currentLang');
		localStorage.setItem('lang', selectedLang.value);
	}
	$("#veil_langPopup").hide(); //close language dialog on selection

}
function lockStateChange(e) {
	if(e.target.id === 'cbLockShapes') {
		DATAFORMAT.setObjectsLocked($('#cbLockShapes').prop('checked'));
		if($('#cbLockShapes').prop('checked') === true) {
			DATAFORMAT.setLabelsLocked(true);
			$('#cbLabelsEditable').prop('checked', false);
			$('#cbLabelsEditable').prop('disabled', false);
		} else {
			$('#cbLabelsEditable').prop('disabled', true);
			$('#cbLabelsEditable').prop('checked', false);
			DATAFORMAT.setLabelsLocked(false);
		}
	}
	if(e.target.id === 'cbLabelsEditable') {
		let tralse = !$('#cbLabelsEditable').prop('checked'); // if checked is then locked is false
		DATAFORMAT.setLabelsLocked(tralse);
	}
	if (OASYSCOM.getContext() === 'editor')savingWatcher.setSaved(false);
}

function toolCallback(sender, value, lockState) {
	if (OASYSCOM.getContext() === 'manualCorrection' && sender === 'toolSwitch') return; // avoid drawing tool cursor
	switch (sender) {
		case 'toolSwitch':
			action = value;
			switch (action) {
				case 'selecting':
					clearSelection();
					mode = 'single';
					if (bDrawingTool) {
						bDrawingTool.setValue('undefined');
					}
					if (bConnectorTool) {
						bConnectorTool.setValue('undefined');
					}
					if (bStyle) bStyle.setValue('undefined');
					if (bWidth) bWidth.setValue('undefined');
					$('#canvas').css({cursor: 'default'});
					log('selector tool');
					break;
				case 'drawing':
					clearSelection();
					if (bDrawingTool) {
						bDrawingTool.activate();
						bDrawingTool.setValue(drawMode);
						mode = drawMode;
					} else {
						mode = 'rectangle';
					}
					if (bConnectorTool) {
						bConnectorTool.deactivate();
					}
					if (bStyle) {
						bStyle.activate();
						bStyle.setValue(objStyle["stroke-dasharray"]);
					}
					if (bWidth) {
						bWidth.activate();
						bWidth.setValue(objStyle["stroke-width"]);
					}
					$("#cm_objects_color").spectrum("set", objStyle["fill"]);
					$('#cm_stroke_color').spectrum("set", objStyle["stroke"]);
					$('#container_cm_objects_color').show();
					$('#container_cm_stroke_color').show();
					$('#canvas').css({cursor: 'pointer'});
					$('#canvas').css({cursor: 'url(images/cursor/draw_icon.png) 1 1, default'});
					log('drawing tool: %@', lockState || 'single');
					break;
				case 'connecting':
					clearSelection();
					if (bDrawingTool) {
						bDrawingTool.deactivate();
					}
					if (bConnectorTool) {
						bConnectorTool.activate();
						bConnectorTool.setValue(connectMode);
						mode = connectMode;
					} else {
						mode = 'straight';
					}
					if (bStyle) {
						bStyle.activate();
						bStyle.setValue(connectorStyle["stroke-dasharray"]);
					}
					if (bWidth) {
						bWidth.activate();
						bWidth.setValue(connectorStyle["stroke-width"]);
					}
					$('#cm_stroke_color').spectrum("set", connectorStyle["stroke"]);
					$('#container_cm_objects_color').hide();
					$('#container_cm_stroke_color').show();
					$('#canvas').css({cursor: 'pointer'});
					$('#canvas').css({cursor: 'url(images/cursor/link_icon.png) 1 1, default'});
					log('connector tool: %@', lockState || 'single');
					break;
			}
			setProperties();
			break;
		case 'drawingTool':
			if (value === 'undefined') return;
			if (action === 'drawing') {
				drawMode = mode = value;
				if (bTools) bTools.setIcon(1, bDrawingTool.state);
				log('drawing tool set to %@', mode);
			} else if (action === 'selecting') {
				updateSelectionElements('object', value);
			}
			showTextOverlay();
			newUndoStep();
			break;
		case 'connectorTool':
			if (value === 'undefined') return;
			if (action === 'connecting') {
				connectMode = mode = value;
				if (bTools) bTools.setIcon(2, bConnectorTool.state);
				log('connector tool set to %@', mode);
			} else if (action === 'selecting') {
				updateSelectionElements('connector', value);
			}
			showTextOverlay();
			newUndoStep();
			break;
		case 'deleteButton':
			for (let i in selection) {
				if (dd[i].locked === true && DATAFORMAT.getRespectLock() === true) {
					unselectObj(i);
					delete selection[i];
				}
			}
			updateSelection();
			if (jQuery.isEmptyObject(selection)) break;

			deleteObj(selection);
			newUndoStep();
			break;
		case 'widthButton':
			if (action === 'connecting') {
				connectorStyle["stroke-width"] = value;
				log('connector linewidth set to %@', value);
			} else if (action === 'drawing') {
				objStyle["stroke-width"] = value;
				log('drawing linewidth set to %@', value);
			} else if (action === 'selecting') {
				{
					for (let i in selection) {
						changeStrokeWidth(i, value);
					}
				}
			}
			newUndoStep();
			break;
		case 'colorButton':
			if (action === 'drawing') {
				objStyle["fill"] = value;
				objColor = value;
			}
			if (action === 'selecting') {
				{
					for (let i in selection) {
						if (dd[i].type === 'object') changeColor(i, value, 'colorButton');
					}
				}
			}
			newUndoStep();
			break;
		case 'strokeColorButton':
			if (action === 'connecting') {
				connectorStyle["stroke"] = value;
				labelBoxStyle["stroke"] = value;
				conColor = value;
			}
			if (action === 'drawing') objStyle["stroke"] = value;
			if (action === 'selecting') {
				{
					for (let i in selection) {
						changeColor(i, value, 'strokeColorButton');
					}
				}
			}
			newUndoStep();
			break;
		case 'styleButton':
			if (action === 'connecting') {
				connectorStyle["stroke-dasharray"] = value;
				log('connector linestyle set to %@', sLine(connectorStyle));
			} else if (action === 'drawing') {
				objStyle["stroke-dasharray"] = value;
				log('drawing linestyle set to %@', sLine(objStyle));
			} else if (action === 'selecting') {
				{
					for (let i in selection) {
						changeStroke(i, value);
					}
				}
			}
			newUndoStep();
			break;
		case 'zoomButton':
			zoomPopup.show();
			break;
		case 'gridButton':
			gridPopup.show();
			break;
		case 'scrollButton':
			if (!scrollMode) {
				scrollMode = true;
				$('body').addClass('scrollMode');
			} else {
				scrollMode = false;
				$('body').removeClass('scrollMode');
			}
			$('#scrollMsg').toggle();
			break;
		case 'uploadButton':
			log('upload document');
			// saveDocument(); UG remove
			uploadDocument();
			break;
		case 'downloadButton':
			log('download document');
			downloadDocument();
			break;
		case 'undoButton':
			undoAction();
			break;
		case 'redoButton':
			redoAction();
			break;

		case 'clearCanvasButton':
			savingWatcher.exitWithoutSaving();
			break;

		case 'langButton':
			showLangPopup();

			break;
		case 'lockButton':
			lockPopup.show();
			break;
	}
}

function showLangPopup(){
	langPopup.show();
}

function setProperties() {
	if (!bTools) return;
	let data = bTools.getMetaData();
	$('#leftPanel').css('border-left-color', data.color);
}

function canvasMouseDown(e) {
	let obj;
	if (OASYSCOM.getContext() === 'manualCorrection') return;
	if (scrollMode) return;
	if (e.which !== 1) return;

	offCanvas = false;
	canvasActionInProgress = true;
	if (labelEditor.is(':focus')) {
		$('#labelEditor').blur();
		delayedEvent = e;
		return;
	}
	hideTextOverlay();
	mX = e.clientX / zoom - $('#canvas').offset().left / zoom;
	mY = e.clientY / zoom - $('#canvas').offset().top / zoom;
	x0 = mX;
	y0 = mY;
	//update hoverId for touch interface
	updateHoverId(e.clientX, e.clientY);
	if (action === 'selecting' && resizeMode !== '') {
		//start resizing (only possible if object selected)
		resizing = true;
		objInitialCoords.x = dd[resizeId].x;
		objInitialCoords.y = dd[resizeId].y;
		objInitialCoords.w = dd[resizeId].w;
		objInitialCoords.h = dd[resizeId].h;
		if (dd[resizeId].locked === false && DATAFORMAT.getRespectLock() === true) {
			undoHandler(quickResize, [resizeId, objInitialCoords.x, objInitialCoords.y, objInitialCoords.w, objInitialCoords.h]);
		} else if (OASYSCOM.getContext() !== 'assessment') {
			undoHandler(quickResize, [resizeId, objInitialCoords.x, objInitialCoords.y, objInitialCoords.w, objInitialCoords.h]);
		}
	} else if (action === 'selecting' && resizeMode === '') {
		//select object and start dragging
		if (e.metaKey || e.ctrlKey || e.shiftKey) {
			mode = 'multi';
		} else {
			mode = 'single';
		}
		if (mode === 'single' && hoverId === -1) {
			mode = "marquee";
			marqueeCoords.x0 = x0;
			marqueeCoords.y0 = y0;
			marqueeCoords.x1 = x0;
			marqueeCoords.y1 = y0;
			const marqueeAttribs = {
				x: Math.min(marqueeCoords.x0, marqueeCoords.x1),
				y: Math.min(marqueeCoords.y0, marqueeCoords.y1),
				width: Math.abs(marqueeCoords.x0 - marqueeCoords.x1),
				height: Math.abs(marqueeCoords.y0 - marqueeCoords.y1)
			};
			marquee.attr(marqueeAttribs);
			marquee.show();
			marquee.toFront();
			return;
		}
		if (mode === 'single' && hoverId > -1) {
			obj = canvas.getElementByPoint(e.clientX, e.clientY);
			if (obj) {
				let id = get(obj);
				if (dd[id] && dd[id].type === 'label') {
					id = dd[id].parent;
				}
				if (dd[id] && dd[id].type === 'labelBox') {
					draggingLabel = id;
				}
			}
		}
		if (mode === 'multi' || selection[hoverId] !== true) {
			selectObj(hoverId);
		}
		if (!draggingLabel) dragging = true;
		for (let i in selection) {
			if (dd[i].glow !== undefined) { // never remove a glow which doesn't exist...
				dd[i].glow.remove();
				delete dd[i].glow;
			}

		}
		saveInitialPositions(selection);
		if (dragging) {
			for (let i in selection) {
				const data = dd[i];
				if (dd[i].type === 'object') {
					if (dd[i].locked === false && DATAFORMAT.getRespectLock() === true) {
						undoHandler(quickResize, [i, data.x, data.y, data.w, data.h]);
					} else if (OASYSCOM.getContext() !== 'assessment') {
						undoHandler(quickResize, [i, data.x, data.y, data.w, data.h]);
					}
				}
			}
		} else if (draggingLabel) {
			const conId = dd[draggingLabel].parent;
			const pos = dd[conId].labelPosition;
			undoHandler(updateConnectorLabel, [conId, null, pos]);
		}
	} else if (action === 'drawing') {
		//draw a new object
		if (mode === 'rectangle') {
			obj = createRect(x0, y0, initialObjSize.w, initialObjSize.h, clone(objStyle), objColor, clone(txtStyle), null, null, null, DATAFORMAT.getObjectsLocked(), DATAFORMAT.getLabelsLocked());
			objInitialCoords.x = obj.attr('x');
			objInitialCoords.y = obj.attr('y');
		} else if (mode === 'roundedRectangle') {
			obj = createRoundedRect(x0, y0, initialObjSize.w, initialObjSize.h, clone(objStyle), objColor, clone(txtStyle), null, null, null, DATAFORMAT.getObjectsLocked(), DATAFORMAT.getLabelsLocked());
			objInitialCoords.x = obj.attr('x');
			objInitialCoords.y = obj.attr('y');
		} else if (mode === 'ellipse') {
			obj = createEllipse(x0, y0, initialObjSize.w, initialObjSize.h, clone(objStyle), objColor, clone(txtStyle), null, null, null, DATAFORMAT.getObjectsLocked(), DATAFORMAT.getLabelsLocked());
			objInitialCoords.x = obj.attr('cx');
			objInitialCoords.y = obj.attr('cy');
		} else if (mode === 'diamond') {
			obj = createDiamond(x0, y0, initialObjSize.w, initialObjSize.h, clone(objStyle), objColor, clone(txtStyle), null, null, null, DATAFORMAT.getObjectsLocked(), DATAFORMAT.getLabelsLocked());
			objInitialCoords.x = x0;
			objInitialCoords.y = y0;
		} else {
			alert('error: unknown drawing method');
			return;
		}
		dragging = true;
		let list = {};
		list[get(obj)] = true;
		lastId = get(obj);
		saveInitialPositions(list);
	} else if (hoverId !== -1 && action === 'connecting' && dd[hoverId].type !== 'connector') { // for now, starting a connection from a connector should do nothing
		//draw a new connection
		connecting = true;
		currentConnection = {startId: hoverId, endId: -1};
	}
}

function canvasMouseMove(e) {

	if (!pointerHelper.checkDeltaX(e.x) && !pointerHelper.checkDeltaY(e.y)) { // movement too small
		return;
	}

	if (scrollMode) return;
	if (offCanvas === true) return;
	mX = e.clientX / zoom - $('#canvas').offset().left / zoom;
	mY = e.clientY / zoom - $('#canvas').offset().top / zoom;
	if (dragging) {
		//object being dragged
		const dx = mX - editList.prevX;
		const dy = mY - editList.prevY;
		editList.prevX = mX;
		editList.prevY = mY;

		for (let i in editList) {
			if (i === "prevX" || i === "prevY") continue;
			if (dd[i].locked === true && DATAFORMAT.getRespectLock() === true) continue;
			let obj = get(i);

			const stroke = (obj.attr('stroke-width'));
			const mvCorr = (stroke % 2) / 2;
			editList[i].exactX = editList[i].exactX + dx;
			editList[i].exactY = editList[i].exactY + dy;


			const newX = grid(editList[i].exactX - dd[i].w / 2) + dd[i].w / 2;
			const newY = grid(editList[i].exactY - dd[i].h / 2) + dd[i].h / 2;

			// check for off canvas position
			let offCanvasPosition = false;
			let bb = obj.getBBox();

			if (dd[i].subtype === 'diamond' || dd[i].subtype === 'ellipse') {
				if((newX - bb.width / 2) <= 0 || (newY - bb.height / 2) <= 0) { // diamond left or top
					offCanvasPosition = true;
				}
				if(newX + bb.width / 2 >= canvasWidth || newY + bb.height / 2 >= canvasHeight) {
					offCanvasPosition = true;
				}
			} else {
				if(newX <= 0 || newY <= 0) { // rect left or top
					offCanvasPosition = true;
				}
				if(newX + bb.width >= canvasWidth || newY + bb.height >= canvasHeight) {
					offCanvasPosition = true;
				}
			}

			if (offCanvasPosition === true) { // off canvas
				continue;
			}
			let dirty = false;
			if (dd[i].subtype === 'ellipse') {
				if (obj.attr('cx') !== newX || obj.attr('cy') !== newY) {
					obj.attr('cx', newX);
					obj.attr('cy', newY);
					dirty = true;
				}
			} else if (dd[i].subtype === 'diamond') {
				if (obj.attr('x') !== newX || obj.attr('y') !== newY) {
					obj.attr('x', newX);
					obj.attr('y', newY);
					const w = dd[i].w;
					const h = dd[i].h;
					const px0 = newX - w / 2;
					const py0 = newY - h / 2;
					const px1 = newX + w / 2;
					const py1 = newY + h / 2;
					const points = [
						{com: 'M', x: newX, y: py0},
						{com: 'L', x: px1, y: newY},
						{com: 'L', x: newX, y: py1},
						{com: 'L', x: px0, y: newY}
					];
					const pathString = createPathString(points, true);
					obj.attr('path', pathString);
					dirty = true;
				}
			} else {
				if (obj.attr('x') !== newX || obj.attr('y') !== newY) {
					obj.attr('x', grid(editList[i].exactX, mvCorr));
					obj.attr('y', grid(editList[i].exactY, mvCorr));
					dirty = true;
				}
			}
			if (dirty) {
				updateObjectData(i);
				updateChildPositions(obj);
				updateHandlePositions(obj);
				updateConnections(i);
			}
		}
	} else if (draggingLabel) {
		const conId = dd[draggingLabel].parent;
		const projection = getNearestPoint(get(conId), mX, mY);
		dd[conId].labelPosition = projection.l;
		dd[conId].labelPoint = projection.p;
		if (dd[conId].labelPoint) {
			updateConnectorLabel(conId);
		}
	} else if (resizing) {
		//object being resized
		resizeObj();
		updateConnections(resizeId);
	} else if (action === 'selecting') {
		marqueeCoords.x1 = mX;
		marqueeCoords.y1 = mY;
		const marqueeAttribs = {
			x: Math.min(marqueeCoords.x0, marqueeCoords.x1),
			y: Math.min(marqueeCoords.y0, marqueeCoords.y1),
			width: Math.abs(marqueeCoords.x0 - marqueeCoords.x1),
			height: Math.abs(marqueeCoords.y0 - marqueeCoords.y1)
		};
		marquee.attr(marqueeAttribs);
	} else if (action !== 'drawing') {
		//hovering
		updateHoverId(e.clientX, e.clientY);
		if (connecting) {
			drawTempConnection();
		}
	}

	//updateHoverId(e.clientX, e.clientY);
}

function canvasMouseUp(e) {
	let oasysContext = OASYSCOM.getContext();
	if (oasysContext === 'manualCorrection') return; // don't allow any editing
	if (scrollMode) return;
	if (e.which !== 1) return;
	mX = e.clientX / zoom - $('#canvas').offset().left / zoom;
	mY = e.clientY / zoom - $('#canvas').offset().top / zoom;
	const timeStamp = new Date().getTime();
	let dblClick = false;
	if (e.delegateTarget.id === 'canvas') {
		if (timeStamp - lastClick < 200) {
			dblClick = true;
		}
		lastClick = timeStamp;
	}
	if (dragging) {
		let dragged = false;
		if (!undoMode && !redoMode) {
			for (let i in selection) {
				if (dd[i].type === 'object' && (editList[i].initialX !== dd[i].x || editList[i].initialY !== dd[i].y)) {
					log('drag object with id %@: from (%@, %@) to (%@, %@)', i, editList[i].initialX, editList[i].initialY, dd[i].x, dd[i].y);
					dragged = true;
					savingWatcher.setSaved(false);
				}
			}
		}
		dragging = false;
		editList = {};
		objInitialCoords = {
			x: -1,
			y: -1,
			w: -1,
			h: -1
		};
		if (action === 'selecting' && dblClick && !leftPanelVisible) {
			$('#labelButton').click();
		}
		if (action === 'selecting') {
			if (!undoMode && !redoMode) {
				let selectionString = '';
				for (let i in selection) {
					selectionString += i + ' ';
				}
				if (!dragged) {
					if (selectionString !== '') {
						log('select objects with ids %@', selectionString);
					} else {
						log('deselect all objects');
					}
				} else {
					// if something was in fact dragged
				}
			}
			const width = getSelectionProperty('stroke-width');
			if (bWidth) bWidth.setValue(width);
			const lineStyle = getSelectionProperty('stroke-dasharray');
			if (bStyle) bStyle.setValue(lineStyle);
			for (let i in selection) {
				setHoverStyle(i);
			}
		}
	} else if (draggingLabel) {
		const conId = dd[draggingLabel].parent;
		log('drag label of connection with id %@: %@%', conId, dd[conId].labelPosition * 100);
		selectObj(conId);
		draggingLabel = null;
	} else if (resizing) {
		resizing = false;
		if (objInitialCoords.x !== dd[resizeId].x || objInitialCoords.y !== dd[resizeId].y || objInitialCoords.w !== dd[resizeId].w || objInitialCoords.h !== dd[resizeId].h) {
			log('resize object with id %@: [x: %@, y: %@, width: %@, height: %@]', resizeId, dd[resizeId].x, dd[resizeId].y, dd[resizeId].w, dd[resizeId].h);
		}
		objInitialCoords = {
			x: -1,
			y: -1,
			w: -1,
			h: -1
		};
		resizeId = -1;
		resizeMode = '';
	} else if (connecting) {
		//remove tempConnector
		if (tempConnectorId) {
			canvas.getById(tempConnectorId).remove();
			tempConnectorId = null;
		}
		//check if a new connector can be drawn: is there a start object, not the same as the end object, none of them is a connector
		if (hoverId !== -1 && hoverId !== currentConnection.startId && dd[hoverId].type !== 'connector' && dd[currentConnection.startId].type !== 'connector') {
			currentConnection.endId = hoverId;
			if (!dd[currentConnection.startId].connections[currentConnection.endId]) {
				lastId = createConnection(currentConnection.startId, currentConnection.endId, mode);

				savingWatcher.setSaved(false);
			}
		} else {
			currentConnection = null;
			lastId = null;
		}
		unselectObj(hoverId);
		connecting = false;
	} else if (action === 'selecting') {
		if (mode === 'marquee') {
			marquee.hide();
			selectObjectsInMarquee();
			if (!undoMode && !redoMode) {
				let selectionString = '';
				for (let i in selection) {
					selectionString += i + ' ';
				}
				if (selectionString !== '') {
					log('select objects with ids %@', selectionString);
				} else {
					log('deselect all objects');
				}
			}
		}
		updateSelection();
	}
	if (canvasActionInProgress) {
		// UG commented out
		//if (Object.keys(selection).length === 1 && !editorVisible && dblClick) textOverlayMouseUp();
		//switch back to selector if in single mode
		if (bTools.fallback()) {
			if (lastId) selectObj(lastId);
			lastId = null;
		}
		newUndoStep();
		e.stopImmediatePropagation();
	}
	showTextOverlay();
	canvasActionInProgress = false;
	if(oasysContext === 'assessment') {
		//OASYSCOM.saveToOasys();
		savingWatcher.setSaved(false);
	}
}

function canvasLeave(e) {
	offCanvas = true;
}

function canvasEnter(e) {
	offCanvas = false;
}

function textOverlayMouseDown(e) {
	e.preventDefault();
	e.stopImmediatePropagation();
}

function textOverlayMouseUp(e) { // in fact called on mouse down
	if (OASYSCOM.getContext() === 'manualCorrection') return;
	if (scrollMode) return;
	if (e) e.stopImmediatePropagation();
	setEditorToolsState();
	labelEditorPopup.show();
	editorVisible = true;
	labelEditor.focus();
	// hideTextOverlay();
	log('show text editor');
	// the sidebar might be closed. last thing to do because of all the propagation stoppers...
	/* if (!leftPanelVisible) {
		toggleLeftPanel();
	} */
}

function onEditorActivity() {
	log('onEditorActivity');
	const txt = labelEditor.val();
	const i = getKey(selection, 0);
	if (dd[i].type === 'object') {
		updateObjectLabel(i, txt);
	} else if (dd[i].type === 'connector') {
		updateConnectorLabel(i, txt);
	}
}

function editorFocused() {
	oldTxt = labelEditor.val();
	txtObject = getKey(selection, 0);
}

function editorLostFocus() {
	if (labelEditor.val() !== oldTxt || (labelEditor.val() === "" && labelEditor.val() !== oldTxt)) {
		if (dd[txtObject].type === 'object') {
			log('update label of object with id %@: "%@"', txtObject, labelEditor.val());
			undoHandler(updateObjectLabel, [txtObject, oldTxt]);
		} else {
			log('update label of connector with id %@: "%@"', txtObject, labelEditor.val());
			undoHandler(updateConnectorLabel, [txtObject, oldTxt]);
		}
		newUndoStep();
	}
	if (delayedEvent) {
		canvasMouseDown(delayedEvent);
		delayedEvent = null;
	}
	/*
	 * if trying to undo or redo with keyboard shortcut while editor is active, the procedure must be intercepted
	 * this function must then be executed to set the necessary undo/redo data
	 * once that has been done, the original function (f) can be executed again
	 */
	if (interceptedFunction) {
		interceptedFunction.apply(this);
	}
	interceptedFunction = null;
}

function onContextMenu(e) {
	if (!/(192.168|localhost)/.test(window.location)) return false;
}

// UG unused
function closeEditorWarning() {
	if (!/(192.168|localhost)/.test(window.location)) return 'You are going to lose your document. Are you sure you want to proceed?'
}

function thereIsNoPlaceLikeHome() {
	window.location = "/conceptMaps";
}