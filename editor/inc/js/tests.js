"use strict";

/**
 * let the IDE know that these variables are created dynamically in PHP
 * @var {string} preSelect
 */

/**
 * @var {string} preType
 */


$(onReady);
$(document).on("contextmenu", function(e) {
    e.preventDefault();
    return false;
});

//getCursorPosition
new function($) {
    $.fn.getCursorPosition = function() {
        let position = 0;
        let element = $(this).get(0);
        //IE Support
        if (document.selection) {
            element.focus();
            let select = document.selection.createRange();
            let selectLength = document.selection.createRange().text.length;
            select.moveStart('character', -element.value.length);
            position = select.text.length - selectLength;
        }
        //Firefox support
        else if (element.selectionStart || element.selectionStart === 0)
            position = element.selectionStart;
        return position;
    }
}(jQuery);

//let i;
//gui elements
let jsph = null;
let kbHandler;
let waitDialog;
let buttons = {};
let gui = {};
let animationPlaying = false;

//details of the selection in the library
let selection = [];
//data loaded from server
const serverData = {
    testLevel: null
};
let currPoolId;
//what part of the editor is currently active
let mode = 'browsing';
//what type of object is being edited
let editType = null; //folder, test (this applies to testLevel, where we actually have a choice)
//the location displayed in the library
let loc = {
    folder: 1,
    path: 'library',
    prefix: ''
};
let oldLoc = {
    folder: 1,
    path: 'library',
    prefix: ''
};
//the location displayed in the test page chooser (add test pages to test structure)
let igLoc = {
    folder: 1
};
//the location displayed in the tests chooser
let tLoc = {
    folder: 1
};
//the breadcrumbs of the current location
let testbreadcrumbs;
//the breadcrumbs of the current location
let breadcrumbs;
//the breadcrumbs of the current location
let itembreadcrumbs;
//selected test in testbrowser
let testSelection;
//linear tests in current folder
let linTests;
//variables for tracking doubleclicks
let waitingForDblClick;
let libraryTimeout;
let editOnData = false;
let firstRun = false;
let skinOptionContainer;
//HTML frame for displaying test pages in the testpage-chooser
let itemsDisplayHTML = "";
//HTML frame for displaying test pages in the testpool-chooser
let itemsDisplayPoolsHTML = ("<div id='optContainer'></div><div id='igListContainer'></div>");
let chosenPool = {};
//Test page Selection
let itStiSelection;
//HTML frame for displaying labels in the changeLabel dialog
let changeLabelsDisplayHTML = ("<div id='optContainerLabel'></div><div id='labContainer'></div>");
let changesLabel = {};
//tmp values
let minTmpValue;
let maxTmpValue;
let minMaxTmpValues = {};
//HTML frame for test structures in the  in the assign-test-form
const testCountDisplayHTML = "<div id='presMsg'></div>";
const testStructureDisplayHTML = "<div id='testID'></div><table id='testStrucDisplayHTML'></table><br />";
// global vars for blocked object handling
let curFFlist = null;
let showBlocked = true;
//languageFallbacks
let languageFallbacks;

function onReady() {
    //setup in the beginning (e.g. onload or onready)
    $('body').on('dragover', function(e) {
        e.preventDefault();
    });
    $('body').on('drop', function(e) {
        e.preventDefault();
    });


    $.ajaxSetup({
        type: "POST",
        cache: false,
        dataType: "json",
        timeout: 300000,
        success: ajaxSuccess,
        error: ajaxError,
        url: "testActions.php",
    });

    // get show blocked object setting from user settings
    showBlocked = settings.showLockedObjects;

    waitDialog = new jsModalWait(UILANG.m('please wait'));
    kbHandler = new jsKeyboardHandler();
    kbHandler.permissionHandler(mayAcceptKeyStrokes);
    kbHandler.registerShortcut('CTRL+A', ctrlA);
    kbHandler.registerShortcut('ESC', abortEditing, {
        executeOnChildren: true
    });
    kbHandler.registerShortcut('CR', function() {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('SHIFT+UP', cursorShiftUp);
    kbHandler.registerShortcut('SHIFT+DOWN', cursorShiftDown);
    kbHandler.registerShortcut('del', deleteKey);
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
    initGUI();
    gui = {
        boxes: {},
        testLevel: {}
    };
    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">Tests:</strong>',
        message: UILANG.m('browsing tests')
    });

    //main buttons
    buttons.abortEditing = new jsButton2($('header'), 'bAbortEditing', {
        label: UILANG.m('Close test'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: abortEditing,
        disabled: true
    });
    buttons.closePoolEditor = new jsButton2($('header'), 'bclosePoolEditor', {
        label: UILANG.m('Close Pool-Editor'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: closePoolEditor,
        disabled: false
    });
    buttons.closeLabelEditor = new jsButton2($('header'), 'bcloseLabelEditor', {
        label: UILANG.m('Close Label-Editor'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: closeLabelEditor,
        disabled: false
    });
    buttons.closeVariablesEditor = new jsButton2($('header'), 'bcloseVariablesEditor', {
        label: UILANG.m('Close Variables'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: closeVariablesEditor,
        disabled: false
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
    buttons.newTest = new jsButton2($('header'), 'bNewTest', {
        label: UILANG.m('New test'),
        icon: '../images/toolbarIcons/ic_tb_newTest.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: newTest,
        disabled: false
    });
    insertVerticalDivider('header', 'vdivider');
    buttons.rename = new jsButton2($('header'), 'bRename', {
        label: UILANG.m('Rename'),
        icon: '../images/toolbarIcons/ic_tb_rename.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: rename,
        disabled: true
    });
    buttons.editSelection = new jsButton2($('header'), 'bEditSelection', {
        label: UILANG.m('Edit test'),
        icon: '../images/toolbarIcons/ic_tb_editTest.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: editSelection,
        disabled: true
    });
    buttons.duplicate = new jsButton2($('header'), 'bDuplicate', {
        label: UILANG.m('Duplicate'),
        icon: '../images/toolbarIcons/ic_tb_duplicateTest.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: duplicate,
        disabled: true
    });
    buttons.deleteSelection = new jsButton2($('header'), 'bDelete', {
        label: UILANG.m('Delete'),
        icon: '../images/toolbarIcons/ic_tb_trashcan.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: deleteSelection,
        disabled: true
    });
    buttons.resetTestResults = new jsButton2($('header'), 'bResTest', {
        label: UILANG.m('Reset test results'),
        icon: '../images/toolbarIcons/ic_tb_reset_results.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: resetResults,
        disabled: true
    });
    buttons.testVariables = new jsButton2($('header'), 'bTestVariables', {
        label: UILANG.m('Test Variables'),
        icon: '../images/toolbarIcons/ic_tb_addVariable.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: variables,
        disabled: false
    });
    buttons.testLabels = new jsButton2($('header'), 'bTestLabels', {
        label: UILANG.m('Edit labels'),
        icon: '../images/toolbarIcons/ic_tb_editLabel.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: labels,
        disabled: false
    });
    buttons.testPools = new jsButton2($('header'), 'bTestPools', {
        label: UILANG.m('Create/Edit Testpools'),
        icon: '../images/toolbarIcons/ic_tb_editPool.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: testpools,
        disabled: false
    });
    buttons.plausibilityCheck = new jsButton2($('header'), 'bpCheck', {
        label: UILANG.m('Plausibility check'),
        icon: '../images/toolbarIcons/ic_tb_pCheck.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: plausibilityCheck,
        disabled: true
    });
    buttons.preview = new jsButton2($('header'), 'bPreview', {
        label: UILANG.m('Preview test'),
        icon: '../images/toolbarIcons/ic_tb_preview.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: preview,
        disabled: true
    });
    buttons.legalText = new jsButton2($('header'), 'bLegalText', {
        label: UILANG.m('Edit privacy policy'),
        icon: '../images/toolbarIcons/ic_tb_law.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: legalText,
        disabled: false
    });
    buttons.scoreScreenEditor = new jsButton2($('header'), 'bScoreScreenEditor', {
        label: UILANG.m('Edit score screen'),
        icon: '../images/toolbarIcons/ic_tb_customizePanels.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: scoreScreen,
        disabled: false
    });

    gui.s1 = createFlexSection('UI', 'sect001', 450, 450); //library
    gui.s2 = createFlexSection('UI', 'sect002', 400, 400); //test properties
    gui.s3 = createFlexSection('UI', 'sect003', 846, 846); //test structure linear test
    gui.s4 = createFlexSection('UI', 'sect004', 350, 350); //testpools
    gui.s5 = createFlexSection('UI', 'sect005', 637, 637); //testpool structure
    gui.s6 = createFlexSection('UI', 'sect006', 846, 846); //test structure fluid test
    gui.s7 = createFlexSection('UI', 'sect007', 650, 650); //labels
    gui.s8 = createFlexSection('UI', 'sect008', 600, 600); //variables
    gui.s9 = createFlexSection('UI', 'sect009', 846, 846); //test structure mutation test

    // section 1 (browser)
    gui.boxes.tests = createFlexBox(gui.s1, 'testList', {
        title: UILANG.m('Tests'),
        minHeight: 480,
        flex: 1,
        noPadding: true
    });

    /* eye icon toggle for blocked items */

    // set starting state when pre-selection
    let eyeStart;
    if (showBlocked) {
        eyeStart = "flexSectionToolBar/ic_flex_locked_hidden.png";
        $('#bv_toggle').data("val", 1)
    } else {
        eyeStart = "flexSectionToolBar/ic_flex_locked_shown.png";
        $('#bv_toggle').data("val", 0);
    }

    let bvdv = (settings.showLockedObjects) ? 1 : 0;
    $('#title_testList').append( /* html */ `<img data-val=${bvdv} id="bv_toggle" src="../images/${eyeStart}"/>`);

    $('#bv_toggle').on("click", function(e) {
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

    //section 2 (test properties)
    gui.boxes.properties = createFlexBox(gui.s2, 'propertyList', {
        title: UILANG.m('Properties'),
        minHeight: 236,
        flex: 1,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });
    gui.s2.hide();

    //section 2meta tags
    gui.boxes.metaTags = createFlexBox(gui.s2, 'metaTags', {
        title: UILANG.m('Meta-tags'),
        minHeight: 200,
        flex: 0,
        locked: true,
        lockedClick: editSelection,
        /*lockedText: '<img style="height:96px;cursor:pointer;" src="../images/editDocuments.png" />',*/
        useVeil: true,
        panelHeight: 30
    });
    gui.s2.hide();

    gui.boxes.metaTags.getInnerBox().append('<div id="metaTagList"></div>');

    //section 3 (test structure linear test)
    gui.boxes.structure = createFlexBox(gui.s3, 'structure', {
        title: UILANG.m('Test structure (Linear Test)'),
        minHeight: 480,
        flex: 1,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });
    gui.s3.hide();

    //section 4 (testpools)
    gui.boxes.testPools = createFlexBox(gui.s4, 'testPools', {
        title: UILANG.m('Testpools'),
        minHeight: 480,
        flex: 1,
        panelHeight: 30
    });
    gui.s4.hide();

    //section 5 (Assigned items to testpool)
    gui.boxes.assignedTestpools = createFlexBox(gui.s5, 'assignedItemsPool', {
        title: UILANG.m('Test pages assigned to testpool'),
        minHeight: 480,
        flex: 1,
        panelHeight: 30
    });
    gui.s5.hide();

    //section 6 (test structure fluid test)
    gui.boxes.fluidStructure = createFlexBox(gui.s6, 'fluidStructure', {
        title: UILANG.m('Test structure (Fluid test)'),
        minHeight: 480,
        flex: 1,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });
    gui.s6.hide();

    //section 7 (labels)
    gui.boxes.testLabels = createFlexBox(gui.s7, 'testLabels', {
        title: UILANG.m('Test-Labels'),
        minHeight: 480,
        flex: 1,
        panelHeight: 30
    });
    gui.s7.hide();

    //section 8 (variables)
    gui.boxes.testVariables = createFlexBox(gui.s8, 'testVariables', {
        title: UILANG.m('Test-Variables'),
        minHeight: 480,
        flex: 1,
        panelHeight: 30
    });
    gui.s8.hide();

    //section 9 (test structure mutation test)
    gui.boxes.mutationStructure = createFlexBox(gui.s9, 'mutationStructure', {
        title: UILANG.m('Linear tests for mutation'),
        minHeight: 480,
        flex: 1,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });
    gui.s9.hide();


    gui.boxes.assignedTestpools.getInnerBox().append('<div id="inactiveMsg"></div><div id="noAssignmentMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('nothing_added_yet') + '</h3></div><div id="testPanelList"></div>');

    gui.boxes.properties.subSectionTitle = insertSubSection(gui.boxes.properties.getInnerBox(), 'subSettingsTitle');
    gui.boxes.properties.subSectionTitle.append('<div id="tTypeTitle"></div>');
    $('#subSettingsTitle').css('border', 'none');

    gui.boxes.properties.subSectionData = insertSubSection(gui.boxes.properties.getInnerBox(), 'subSettingsData');
    gui.boxes.properties.subSectionData.append('<div id="tActivityData"></div>');
    $('#subSettingsData').css('border', 'none');

    gui.boxes.properties.subSection0 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subSettings');
    gui.boxes.properties.subSection0.append('<div id="activeSettings"></div>');
    $('#subSettings').css('border', 'none');

    gui.boxes.properties.subSection7 = insertSubSection(gui.boxes.properties.getInnerBox(), 'mutHead', UILANG.m('Mutation'));

    gui.boxes.properties.mutationMethod = insertDropdown(gui.boxes.properties.subSection7, 'tmutation', UILANG.m('Pick method'), {
        dataId: 'mutationMethod',
        elements: [{ label: UILANG.m('Random'), value: 'random' }, { label: UILANG.m('Sequential'), value: 'sequential' }],
        width: 184,
        onChange: optionsChanged
    });


    gui.boxes.properties.subSection6 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subOnOff', UILANG.m('Validity'));
    gui.boxes.properties.onOffSwitch = insertToggleswitch(gui.boxes.properties.subSection6, 'tsOnOffSwitch', UILANG.m('Test active'), {
        dataId: 'onOffSwitch',
        changeCallback: optionsChanged
    });
    gui.testLevel.onOffSwitch = gui.boxes.properties.onOffSwitch;

    gui.boxes.properties.dateRange = insertLink(gui.boxes.properties.subSection6, 'tsDateRangeOption', UILANG.m('Date restriction'), {
        dataId: 'dateRangeOption',
        onClick: editDateRange,
    });
    gui.boxes.properties.timeRestriction = insertLink(gui.boxes.properties.subSection6, 'tsTimeRestrictionOption', UILANG.m('Daily time restriction'), {
        dataId: 'timeRestrictionOption',
        onClick: editTimeRestriction,
    });
    gui.boxes.properties.testDays = insertLink(gui.boxes.properties.subSection6, 'tsTestDaysOption', UILANG.m('Testing days'), {
        dataId: 'testDaysOption',
        onClick: editTestDays,
    });

    gui.boxes.properties.forceLogoff = insertToggleswitch(gui.boxes.properties.subSection6, 'tsForceLogoff', UILANG.m('Force logoff on inactive test'), {
        dataId: 'forceLogoff',
        changeCallback: optionsChanged
    });
    gui.testLevel.forceLogoff = gui.boxes.properties.forceLogoff;

    gui.boxes.properties.subSection1 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subTimer', UILANG.m('Timer'));
    gui.boxes.properties.useTimer = insertToggleswitch(gui.boxes.properties.subSection1, 'tsUseTimer', UILANG.m('Use timer'), {
        dataId: 'useTimer',
        changeCallback: optionsChanged
    });
    gui.testLevel.useTimer = gui.boxes.properties.useTimer;

    gui.boxes.properties.timeLimit = insertSpinner(gui.boxes.properties.subSection1, 'timeLimit', UILANG.m('Time limit (minutes)'), {
        dataId: 'timeLimit',
        range: '0..999',
        step: 1,
        height: 20,
        width: 30,
        onChange: timeOptionsChanged
    });
    gui.testLevel.timeLimit = gui.boxes.properties.timeLimit;

    gui.boxes.properties.subSection2 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subMisc', UILANG.m('Miscellaneous'));
    gui.boxes.properties.saveResults = insertToggleswitch(gui.boxes.properties.subSection2, 'tsSaveResults', UILANG.m('Save results'), {
        dataId: 'saveResults',
        changeCallback: optionsChanged
    });
    gui.testLevel.saveResults = gui.boxes.properties.saveResults;

    gui.boxes.properties.limitNavigation = insertToggleswitch(gui.boxes.properties.subSection2, 'tslimitNavigation', UILANG.m('Limit navigation'), {
        dataId: 'limitNavigation',
        changeCallback: optionsChanged
    });
    gui.testLevel.limitNavigation = gui.boxes.properties.limitNavigation;

    gui.boxes.properties.showScore = insertToggleswitch(gui.boxes.properties.subSection2, 'tsShowScore', UILANG.m('Show score'), {
        dataId: 'showScore',
        changeCallback: optionsChanged
    });
    gui.testLevel.showScore = gui.boxes.properties.showScore;

    gui.boxes.properties.hideTimeoutMsg = insertToggleswitch(gui.boxes.properties.subSection2, 'tshideTimeoutMsg', UILANG.m('Hide time out message'), {
        dataId: 'hideTimeoutMsg',
        changeCallback: optionsChanged
    });
    gui.testLevel.hideTimeoutMsg = gui.boxes.properties.hideTimeoutMsg;

    gui.boxes.properties.waitForMediaCache = insertToggleswitch(gui.boxes.properties.subSection2, 'tswaitForMediaCache', UILANG.m('Wait for media to load'), {
        dataId: 'waitForMediaCache',
        changeCallback: optionsChanged
    });
    gui.testLevel.hideTimeoutMsg = gui.boxes.properties.hideTimeoutMsg;

    gui.boxes.properties.subSection3 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subLang', UILANG.m('Languages'));

    $.each(languages, function(k, v) {
        gui.boxes.properties[k] = insertToggleswitch(gui.boxes.properties.subSection3, 'tsLang_' + k, v, {
            dataId: k,
            changeCallback: optionsChanged
        });
        gui.testLevel[k] = gui.boxes.properties[k];
    });

    gui.boxes.properties.subSection5 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subskin', UILANG.m('Skin'));

    let dlskins = [];
    for (let i in skins) {
        dlskins.push({
            label: i,
            value: i
        });
    }
    gui.boxes.properties.skin = insertDropdown(gui.boxes.properties.subSection5, 'tskin', UILANG.m('Change skin'), {
        dataId: 'skin',
        elements: dlskins,
        width: 184,
        initalValue: settings['skin'],
        onChange: skinTrigger
    });
    gui.boxes.properties.subSection5.append('<div id="skinOptionContainer"></div>');
    skinOptionContainer = $("#skinOptionContainer");

    //Testpools
    gui.testpools = new jsSelectList(gui.boxes.testPools.getInnerBox(), 'poolSelector', {
        labelKey: 'name',
        orderKey: 'name',
        idKey: 'id',
        buttons: [{
            name: 'deleteTestPool',
            icon: '../images/inlineActions/ic_fl_inline_delete.png',
            tooltip: UILANG.m('Delete'),
            callback: deleteHovered,
            parameters: ['testpool'],
            width: 20,
            height: 20
        },
        {
            name: 'editTestPool',
            icon: '../images/inlineActions/ic_fl_inline_edit.png',
            tooltip: UILANG.m('Rename'),
            callback: editHovered,
            parameters: ['testpool'],
            width: 20,
            height: 20
        }
        ],
        selectionCallback: selectionChanged,
        cancelSingleClickOnDoubleClick: false
    });

    //Toolbar passwords
    gui.boxes.testPools.getPanel().append('<div><div id="testpoolsTbText"></div><div id="testpoolsTbButton"></div></div>');

    window.testpoolsTbButtons = {};
    testpoolsTbButtons.addElements = new nxButton($('#testpoolsTbButton'), 'tpTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: selectListBtnNewTp,
        tooltip: UILANG.m('Add testpool'),
        disabled: false
    });

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
    gui.library = new fileMgr("#testList", "_idSuffix", [], breadcrumbs, fileOpPermissions, true, libraryEvent, 'all', true);

    preSelect = Number(preSelect);
    preType = Number(preType);

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

    //structureView linear test
    const STOptions = {
        onChange: propertiesChanged,
        onClick: propertiesClick,
        elements: [],
        tdSizes: {
            name: '180px',
            code: '100px',
            itemGroup: '120px',
            label: '140px',
            maxScore: '85px'

        },
        tableHead: {
            name: UILANG.m('Test page'),
            code: UILANG.m('Code'),
            itemGroup: UILANG.m('Page group'),
            label: UILANG.m('Label'),
            maxScore: UILANG.m('Points')
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '100%',
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'structure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionField: true,
        actionFieldSize: '100px',
        actionFieldDefaultText: UILANG.m('as test'),
        actionFieldModifiedText: UILANG.m('modified'),
        cssStylesAFdefault: {
            'background-color': 'transparent',
            'text-align': 'left',
        },
        cssStylesAFmodified: {
            // 'background-color': '#fe7d2c',
            'text-align': 'left',
            'color': '#ff5400',
        },
        cssStylesAFinactive: {
            'background-color': '#eee',
            'text-align': 'left',
        },
        actionButton: true,
        actionFieldColText: UILANG.m('Overrides'),
    };
    gui.structureView = new jsSortableTable('structure', 'structure_table', STOptions);
    gui.structureView.lock('greyout');
    //Toolbar Test Structure
    gui.boxes.structure.getPanel().append('<div><div id="structureTbText"></div><div id="structureTbButton"></div></div>');
    //Toolbar Test Properties
    gui.boxes.properties.getPanel().append('<div><div id="propertiesTbText">Test-ID:</div><div id="propertiesTbID"></div></div>');

    window.structureTbButtons = {};
    structureTbButtons.labelEditor = new nxButton($('#structureTbButton'), 'stTbLabelEditor', {
        icon: '../images/labelEditor.png',
        iconWidth: 22,
        callback: labels,
        tooltip: UILANG.m('Edit labels'),
        disabled: true
    });
    structureTbButtons.resetOverridesLinear = new nxButton($('#structureTbButton'), 'stTbResetLinear', {
        icon: '../images/resetOverrides.png',
        iconWidth: 22,
        callback: resetOverrides,
        tooltip: UILANG.m('Reset individual skin overrides'),
        disabled: true
    });
    structureTbButtons.addElements = new nxButton($('#structureTbButton'), 'stTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addItems,
        tooltip: UILANG.m('Add test pages'),
        disabled: true
    });
    //structureView fluid test
    const STOptionsFluid = {
        onChange: propertiesChangedFluid,
        onClick: propertiesClickFluid,
        elements: [],
        tdSizes: {
            name: '210px',
            itemsUsed: '60px',
            itemsTotal: '60px',
            itemOrder: '85px',
            label: '130px'
        },
        tableHead: {
            name: UILANG.m('Testpool'),
            itemsUsed: UILANG.m('Pages used'),
            itemsTotal: UILANG.m('Pages total'),
            itemOrder: UILANG.m('Order'),
            label: UILANG.m('Label'),
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '100%',
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'fluidStructure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionField: true,
        actionFieldSize: '80px',
        actionFieldDefaultText: UILANG.m('as test'),
        actionFieldModifiedText: UILANG.m('modified'),
        cssStylesAFdefault: {
            'background-color': 'transparent',
            'text-align': 'left',
        },
        cssStylesAFmodified: {
            // 'background-color': '#fe7d2c',
            'text-align': 'left',
            'color': '#ff5400',
        },
        cssStylesAFinactive: {
            'background-color': '#eee',
            'text-align': 'left',
        },
        actionButton: true,
        fixedPosButton: true
    };
    gui.fluidStructureView = new jsSortableTable('fluidStructure', 'fluidStructure_table', STOptionsFluid);
    //Toolbar Test Structure fluid
    gui.boxes.fluidStructure.getPanel().append('<div><div id="fluidStructureTbText"></div><div id="fluidStructureTbButton"></div></div>');

    window.fluidStructureTbButtons = {};

    fluidStructureTbButtons.poolEditor = new nxButton($('#fluidStructureTbButton'), 'stTPoolEditorFluid', {
        icon: '../images/poolEditor.png',
        iconWidth: 22,
        callback: testpools,
        tooltip: UILANG.m('Create/Edit Testpools'),
        disabled: true
    });
    fluidStructureTbButtons.labelEditor = new nxButton($('#fluidStructureTbButton'), 'stTbLabelEditorFluid', {
        icon: '../images/labelEditor.png',
        iconWidth: 22,
        callback: labels,
        tooltip: UILANG.m('Edit labels'),
        disabled: true
    });
    fluidStructureTbButtons.resetOverridesFluid = new nxButton($('#fluidStructureTbButton'), 'stTbResetFluid', {
        icon: '../images/resetOverrides.png',
        iconWidth: 22,
        callback: resetOverrides,
        tooltip: UILANG.m('Reset individual skin overrides'),
        disabled: true
    });
    fluidStructureTbButtons.addElements = new nxButton($('#fluidStructureTbButton'), 'fluidStTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addFluidItems,
        tooltip: UILANG.m('Add fluid test blocks'),
        disabled: true
    });

    //structureView mutation test
    const STOptionsMut = {
        onChange: mutationPropertiesChanged,
        onClick: propertiesClick,
        elements: [],
        tdSizes: {
            name: '380px',
            id: '80px',
            pages: '100px',
            maxScore: '100px'
        },
        tableHead: {
            name: UILANG.m('Test'),
            id: UILANG.m('ID'),
            pages: UILANG.m('Test pages'),
            maxScore: UILANG.m('Max score')
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '100%',
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'structure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionButtons: true,
        actionButtonsSize: '25px',
        actionButtonsColText: UILANG.m('Structure')
    };
    gui.mutationStructureView = new jsSortableTable('mutationStructure', 'mutationStructure_table', STOptionsMut);
    gui.mutationStructureView.lock('greyout');
    //Toolbar Test Structure
    gui.boxes.mutationStructure.getPanel().append('<div><div id="mutationStructureTbText"></div><div id="mutationStructureTbButton"></div></div>');

    window.mutationStructureTbButtons = {};
    mutationStructureTbButtons.addElements = new nxButton($('#mutationStructureTbButton'), 'mutStTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addMutationItems,
        tooltip: UILANG.m('Add tests'),
        disabled: true
    });

    //Structure view fluid tests - testpool editor
    const STPoolOptions = {
        onChange: poolPropertiesChanged,
        onClick: poolPropertiesClick,
        elements: [],
        tdSizes: {
            name: '200px',
            code: '100px',
            itemGroup: '170px'
        },
        tableHead: {
            name: UILANG.m('Test page'),
            code: UILANG.m('Code'),
            itemGroup: UILANG.m('Page group'),
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '100%',
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'poolStructure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionButton: true
    };
    gui.poolStructureView = new jsSortableTable('testPanelList', 'poolStructure_table', STPoolOptions);
    //Toolbar Test Structure
    gui.boxes.assignedTestpools.getPanel().append('<div><div id="poolStructureTbText"></div><div id="poolStructureTbButton"></div></div>');
    window.poolStructureTbButtons = {};
    poolStructureTbButtons.addElements = new nxButton($('#poolStructureTbButton'), 'poolStTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addItems,
        tooltip: UILANG.m('Add test pages'),
        disabled: true
    });


    //View test labels - Label editor
    const STLabelOptions = {
        onChange: labelsChanged,
        onClick: labelsClick,
        elements: [],
        tdSizes: {
            name: '387px',
            default: '105px'
        },
        tableHead: {
            name: UILANG.m('Label'),
            default: UILANG.m('Default')
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '100%',
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'labelStructure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        fixedOrder: true,
        linkExclusives: {
            default: UILANG.m('yes')
        }
    };
    gui.labelView = new jsSortableTable('testLabels', 'label_table', STLabelOptions);
    //Toolbar Test Structure
    gui.boxes.testLabels.getPanel().append('<div><div id="labelTbText"></div><div id="labelTbButton"></div></div>');
    window.labelTbButtons = {};
    labelTbButtons.addElements = new nxButton($('#labelTbButton'), 'labelStTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addLabel,
        tooltip: UILANG.m('Add label'),
        disabled: false
    });

    //Test variables
    gui.boxes.testVariables.getPanel().append('<div><div id="variablesTbText"></div><div id="variablesTbButton"></div></div>');
    gui.boxes.testVariables.getInnerBox().append('<div id="varStringsPanelList"></div>');
    window.variablesTbButtons = {};
    variablesTbButtons.addElements = new nxButton($('#variablesTbButton'), 'variablesStTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addVariable,
        tooltip: UILANG.m('Add variable'),
        disabled: false
    });

    const varOptions = {
        onChange: variablesChanged,
        onClick: variablesClick,
        elements: [],
        tdSizes: {
            name: '150px',
            text: '430px'
        },
        tableHead: {
            name: UILANG.m('Variable'),
            text: UILANG.m('Click string to edit other languages')
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '100%',
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        consecutiveNumbers: true,
        dataId: 'varStringsTable',
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionField: false,
        fixedOrder: true
    };
    gui.varStringsView = new jsSortableTable('varStringsPanelList', 'varStringsPanelList_table', varOptions);


    //Meta Tags
    const metaList = {
        onChange: metaChanged,
        elements: [],
        tdSizes: {
            metakey: '120px',
            metavalue: '185px'
        },
        tableHead: {
            metakey: 'Meta-Key',
            metavalue: 'Meta-Value'
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'border': '0px',
            'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px',
            'background-color': 'transparent',
            'border-bottom': '1px dotted #CCC',
            'height': '20px'
        },
        cssHeadCells: {
            'padding': '5px',
            'background-color': '#e8e8e8',
            'height': '20px'
        },
        dataId: 'metatags',
        consecutiveNumbers: false,
        tableHeadDisplay: true,
        fixedOrder: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false
    };
    gui.metaView = new jsSortableTable('metaTagList', 'metaTagList_table', metaList);
    gui.metaView.lock('greyout');

    gui.boxes.metaTags.getPanel().append('<div><div id="metaTbText"></div><div id="metaTbButton"></div></div>');
    window.metaTbButtons = {};
    metaTbButtons.addElements = new nxButton($('#metaTbButton'), 'mTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addMetaTag,
        tooltip: 'Add meta tag',
        disabled: true
    });

    //create hidden form for previewing
    hiddenForm('previewForm', 'post', '../index.php', '_blank', ['action', 'data']);
    switchMode();

    jsph = jsPointerHandler.instance;
}

function mayAcceptKeyStrokes() {
    return !waitDialog.busy() && !animationPlaying;
}

function switchMode(sender) {
    for (let b in buttons) {
        buttons[b].hide();
    }
    let visibleButtons = [];
    switch (mode) {
        case 'browsing':
            visibleButtons = ['newFolder', 'newTest', 'rename', 'editSelection', 'duplicate', 'deleteSelection', 'resetTestResults', 'plausibilityCheck', 'preview', 'searchFiler'];
            structureTbButtons.addElements.disable();
            fluidStructureTbButtons.addElements.disable();
            mutationStructureTbButtons.addElements.disable();
            fluidStructureTbButtons.poolEditor.disable();
            fluidStructureTbButtons.labelEditor.disable();
            structureTbButtons.resetOverridesLinear.disable();
            structureTbButtons.labelEditor.disable();
            fluidStructureTbButtons.resetOverridesFluid.disable();
            gui.testLevel.useTimer.lock();
            gui.testLevel.timeLimit.lock();
            gui.testLevel.saveResults.lock();
            gui.testLevel.hideTimeoutMsg.lock();
            gui.testLevel.limitNavigation.lock();
            gui.testLevel.showScore.lock();

            $.each(languages, function(k, v) {
                gui.testLevel[k].lock();
            });
            if (selection.length === 1 && selection[0].type === 'folder') {
                buttons.rename.enable();
                buttons.editSelection.disable();
                buttons.duplicate.disable();
            } else if (selection.length === 1 && selection[0].type === 'test') {
                buttons.plausibilityCheck.enable();
                buttons.rename.enable();
                buttons.editSelection.enable();
                buttons.duplicate.enable();
            } else {
                buttons.plausibilityCheck.disable();
                buttons.rename.disable();
                buttons.editSelection.disable();
                buttons.duplicate.disable();
            }
            librarySelection(gui.library.getSelect(), true);
            gui.boxes.properties.lock();
            gui.boxes.metaTags.lock();
            gui.boxes.structure.lock();
            gui.boxes.fluidStructure.lock();
            gui.boxes.mutationStructure.lock();
            gui.statusBar.setStatus(UILANG.m('browsing tests'));
            metaTbButtons.addElements.disable();
            break;
        case 'editTest':
            if (sender !== 'abortReq') {
                let actCount = $(serverData.testLevel.activityData).length;
                if (actCount > 0) {
                    if(serverData.testLevel.structure.type === 'mutation') {
                        showMessage(UILANG.m("Results have already been recorded for this test. You can add or remove assigned linear tests in a mutation test without affecting existing results. However, ensure that the linear tests themselves are not modified, as this might impact result accessibility."), "warning")
                    } else {
                        showMessage(UILANG.m("Results have already been recorded for this test. If you modify the test, existing results might not be accessible anymore."), "warning")
                    }
                }
            }
            structureTbButtons.addElements.enable();
            structureTbButtons.labelEditor.enable();
            fluidStructureTbButtons.addElements.enable();
            mutationStructureTbButtons.addElements.enable();
            fluidStructureTbButtons.poolEditor.enable();
            fluidStructureTbButtons.labelEditor.enable();
            buttons.abortEditing.enable();
            if (serverData.testLevel.structure.type === 'fluid') {
                visibleButtons = ['abortEditing', 'testLabels', 'testVariables', 'testPools', 'plausibilityCheck', 'preview', 'legalText', 'scoreScreenEditor'];
                gui.fluidStructureView.clearWarnings();
                gui.boxes.fluidStructure.unlock();
            } else if (serverData.testLevel.structure.type === 'mutation') {
                visibleButtons = ['abortEditing'];
                gui.mutationStructureView.clearWarnings();
                gui.boxes.mutationStructure.unlock();
                gui.boxes.properties.subSection7.show();
                gui.boxes.properties.subSection5.hide();
                gui.boxes.properties.subSection1.hide();
                gui.boxes.properties.subSection2.hide();
                gui.boxes.properties.subSection3.hide();
                //Select mutation method dropdown
                gui.boxes.properties.mutationMethod.reset(serverData.testLevel.options.mutationMethod);
            } else {
                visibleButtons = ['abortEditing', 'testLabels', 'testVariables', 'plausibilityCheck', 'preview', 'legalText', 'scoreScreenEditor'];
                gui.structureView.clearWarnings();
                gui.boxes.structure.unlock();
            }

            if (serverData.testLevel.structure.type !== 'mutation') {
                gui.boxes.properties.subSection5.show();
                gui.boxes.properties.subSection1.show();
                gui.boxes.properties.subSection2.show();
                gui.boxes.properties.subSection3.show();
                gui.testLevel.useTimer.unlock();
                gui.testLevel.timeLimit.unlock();
                gui.testLevel.saveResults.unlock();
                gui.testLevel.hideTimeoutMsg.unlock();
                gui.testLevel.limitNavigation.unlock();
                gui.testLevel.showScore.unlock();
                $.each(languages, function(k, v) {
                    gui.testLevel[k].unlock();
                });
                //en-disable reset skin overrides button in structure header
                let rSwitch = false;
                $.each(serverData.testLevel.structure.items, function(k, v) {
                    if (v.actionField.hiddenData) rSwitch = true;
                });

                if (rSwitch) {
                    switch (serverData.testLevel.structure.type) {
                        case 'linear':
                            structureTbButtons.resetOverridesLinear.enable();
                            break;
                        case 'fluid':
                            fluidStructureTbButtons.resetOverridesFluid.enable();
                            break;
                    }
                } else {
                    switch (serverData.testLevel.structure.type) {
                        case 'linear':
                            structureTbButtons.resetOverridesLinear.disable();
                            break;
                        case 'fluid':
                            fluidStructureTbButtons.resetOverridesFluid.disable();
                            break;
                    }
                }
            }
            gui.boxes.properties.subSection0.hide();
            gui.boxes.properties.subSection6.show();
            gui.boxes.properties.unlock();
            gui.boxes.metaTags.unlock();
            metaTbButtons.addElements.enable();
            gui.statusBar.setStatus(UILANG.m('Editing') + ' "' + serverData.testLevel.name + '"');
            quickCheck();
            killAct();
            break;
        case 'poolEdit':
            visibleButtons = ['closePoolEditor', 'plausibilityCheck'];
            buttons.plausibilityCheck.disable();
            gui.statusBar.setStatus(UILANG.m('Pool-Editor for fluid test:') + ' "' + serverData.testLevel.name + '"');
            $('#noAssignmentMsg').hide();
            $('#testPanelList').hide();
            gui.testpools.clearSelection();
            selectionChanged();
            break;
        case 'labelEdit':
            visibleButtons = ['closeLabelEditor'];
            gui.statusBar.setStatus(UILANG.m('Label-Editor for test:') + ' "' + serverData.testLevel.name + '"');
            break;
        case 'variablesEdit':
            visibleButtons = ['closeVariablesEditor'];
            gui.statusBar.setStatus(UILANG.m('Variables for test:') + ' "' + serverData.testLevel.name + '"');
            break;
    }

    for (let i in visibleButtons) {
        let b = visibleButtons[i];
        buttons[b].show();
    }
}

/* library */

function libraryEvent(type, data) {
    let sources;
    let target;
    let obj;
    switch (type) {
        case 'clear':
            if (curFFlist !== null) paintBlocked(curFFlist);
            break;
        case 'getSelect':
            if (mode === 'browsing') librarySelection(data);
            break;
        case 'getSelectKeys':
            if (mode === 'browsing') librarySelection(data, true);
            break;
        case 'onNavigate':
            clearTimeout(libraryTimeout);
            waitingForDblClick = null;
            oldLoc = cloneObj(loc);
            loc.folder = data.dbId;
            startAjax('fetchLibrary', {
                location: loc.folder,
                current: oldLoc,
                showBlocked: showBlocked
            });
            break;
        case 'onFolderRequest':
            newFolder('contextMenu');
            break;
        case 'onDuplicateRequest':
            duplicate();
            break;
        case 'onBreadcrumbNavigate':
            oldLoc = cloneObj(loc);
            loc.folder = data;
            startAjax('fetchLibrary', {
                location: loc.folder,
                current: oldLoc,
                showBlocked: showBlocked
            });
            break;
        case 'onRenameRequest':
            rename(data);
            break;
        case 'onDeleteRequest':
            deleteSelection('contextMenu');
            break;
        case 'onMove':
        case 'onCutPaste':
            sources = {
                folders: [],
                tests: []
            };
            target = data[0].target;
            if (typeof target == 'string' || target instanceof String) {
                if (target.charAt(0) === 't' || target.charAt(0) === 'f') {
                    target = target.substring(1)
                }
            }
            for (let i in data[0].sources) {
                obj = data[0].sources[i];
                if (obj.type === 'folder') {
                    sources.folders.push(obj.dbId);
                } else {
                    sources.tests.push(obj.dbId);
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
        case 'onPaste':
            sources = {
                folders: [],
                tests: []
            };
            target = data[0].target;
            if (typeof target === 'string' || target instanceof String) {
                if (target.charAt(0) === 't' || target.charAt(0) === 'f') {
                    target = target.substring(1);
                }
            }
            for (let i in data[0].sources) {
                obj = data[0].sources[i];
                if (obj.type === 'folder') {
                    sources.folders.push(obj.dbId);
                } else {
                    sources.tests.push(obj.dbId);
                }
            }
            duplicateObjects(sources, target);
            break;
        case 'onSearchRequest':
            startAjax('search', {
                searchString: data
            });
            break;
        case 'onSearchItemClick':
            loc.folder = data.pid.replace(/^\D*/i, '');
            startAjax('fetchLibrary', {
                location: loc.folder,
                select: data.id,
                showBlocked: showBlocked
            });
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
                if (data[0].cbFolders === 0) fString = '';
                msg = fString;
                let gString = '';
                if (data[0].cbFiles > 1) gString = data[0].cbFiles + ' ' + UILANG.m('tests') + ' ';
                if (data[0].cbFiles === 1) gString = '1 ' + UILANG.m('test') + ' ';
                if (data[0].cbFiles === 0) gString = '';
                if (msg === '') {
                    msg = gString;
                } else if (msg !== '' && gString !== '') {
                    msg += UILANG.m('and') + ' ' + gString;
                }
                if (data[0].task === 'cut') {
                    msg += ' ' + UILANG.m('copied to clipboard for moving');
                } else {
                    if (data[0].cbFolders > 0) {
                        gui.statusBar.setStatus(UILANG.m('warning_folder_copy'), 3000, '#F00');
                        gui.library.clearClipboard();
                        return;
                    }
                    msg += ' ' + UILANG.m('copied to clipboard for duplication');
                }
            }
            gui.statusBar.setStatus(msg, 3000, '#0A0');
            break;
        case 'onPermEditRequest':
            editPermDiag(`ctxMenu_${data.src}`, null, ((data.selLen > 1)), null);
            break;
        case 'onWatchListToggle':
            startAjax('updateWatchList', {
                id: parseInt(data.id),
                status: data.status,
                type: data.type
            });
            break;
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

function updateLibrary(list, path) {
    if (path) breadcrumbs = path;
    gui.library.setItems(list, breadcrumbs);
}

function updateIgLibrary(list, path) {
    if (path) itembreadcrumbs = path;
    gui.library2.setItems(list, itembreadcrumbs);
}

function moveObjects(sources, target) {
    startAjax('moveObjects', {
        location: loc.folder,
        sources: sources,
        target: target,
        showBlocked: showBlocked
    });
}

function duplicateObjects(sources, target) {
    startAjax('duplicateObjects', {
        location: loc.folder,
        sources: sources,
        target: target,
        showBlocked: showBlocked
    });
}

function librarySelection(data, delayed) {
    if (typeof (data) == 'undefined') {
        return;
    }
    selection = data; //FYI: required for permission compatibility

    editOnData = false;
    selection = data;
    buttons.preview.disable();
    buttons.plausibilityCheck.disable();
    clearTimeout(libraryTimeout);
    if (selection.length === 0) {
        buttons.deleteSelection.disable();
        buttons.resetTestResults.disable();
        buttons.editSelection.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        gui.s2.fadeOut(250);
        gui.s3.fadeOut(250);
        gui.s6.fadeOut(250);
        gui.s9.fadeOut(250);

    } else if (selection.length === 1) {
        if (!waitingForDblClick) {
            waitingForDblClick = data;
            libraryTimeout = setTimeout(function() {
                librarySelection(data, true);
            }, 250);
            return;
        } else if (selection[0] !== waitingForDblClick[0]) {
            waitingForDblClick = data;
            libraryTimeout = setTimeout(function() {
                librarySelection(data, true);
            }, 250);
            return;
        }
        waitingForDblClick = null;
        buttons.deleteSelection.enable();
        buttons.resetTestResults.enable();
        buttons.rename.enable();
        if (selection[0].type === 'folder') {
            buttons.editSelection.disable();
            buttons.duplicate.disable();
        }
        if (selection[0].type === 'test') {
            if (!delayed) {
                editOnData = true; //user doubleclicked => go to edit mode as soon as data has loaded
            } else {
                editOnData = false;
            }

            // if the user can edit, allow pencil icon veil, otherwise, don't
            let showPencil = permList[selection[0].dbId].editSelection;
            if (!showPencil) {
                gui.boxes.properties.unlock();
                gui.boxes.structure.unlock();
                gui.boxes.fluidStructure.unlock();
                gui.boxes.mutationStructure.unlock();
                gui.boxes.metaTags.unlock();
            } else {
                gui.boxes.properties.lock();
                gui.boxes.structure.lock();
                gui.boxes.fluidStructure.lock();
                gui.boxes.mutationStructure.lock();
                gui.boxes.metaTags.lock();
            }

            gui.s2.fadeIn(0);
            editType = 'test';
            if (selection[0].testStructure.type !== 'mutation') {
                buttons.plausibilityCheck.enable();
                buttons.preview.enable();
            }
            buttons.editSelection.enable();
            buttons.duplicate.enable();
            gui.boxes.properties.subSection0.show();
            gui.boxes.properties.subSection1.hide();
            gui.boxes.properties.subSection2.hide();
            gui.boxes.properties.subSection3.hide();
            gui.boxes.properties.subSection5.hide();
            gui.boxes.properties.subSection6.hide();
            gui.boxes.properties.subSection7.hide();
            gui.structureView.clearElements(true);
            gui.fluidStructureView.clearElements(true);
            if (data.length >= 2) selIcheck(loc, data);
            startAjax('fetchTest', {
                dbId: selection[0].dbId,
                location: loc.folder,
                defaultSkin: settings['skin']
            });
        } else if (delayed) {
            gui.s2.fadeOut(0);
            gui.s3.fadeOut(0);
            gui.s6.fadeOut(0);
            gui.s9.fadeOut(0);
        }
    } else {
        buttons.deleteSelection.enable();
        buttons.resetTestResults.enable();
        buttons.editSelection.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        gui.s2.fadeOut(250);
        gui.s3.fadeOut(250);
        gui.s6.fadeOut(250);
        gui.s9.fadeOut(250);
    }

    /* existence validation checks on file interaction */
    if (!delayed) {
        selIcheck(loc, data);
    } else if (data.length >= 2) { // for any multi-select condition since file fetch has already run a check
        selIcheck(loc, data);
    } else if (selection.length === 1 && selection[0].type === 'folder') { // should only run check on 1 len items if folder (file items have already had another check done)
        selIcheck(loc, data);
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

    // activate permission set to selectively enable/disable buttons and context menu options
    setLibPerms();

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
                if (!['deleteSelection', 'resetTestResults'].includes(key)) continue;
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
            } else if (selection[0] === undefined && ['newFolder', 'newTest'].includes(buttonName)) {
                buttons[buttonName].enable();
            }
        } else {
            buttons[buttonName].disable();
        }
    });
}

/* editing */
function editSelection(sender) {
    if (selection[0].type === "test") {
        startAjax('checkTest', {
            test: selection[0].dbId,
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
}

function editSelectionAfterCheck() {
    if (!buttons.editSelection.isActive()) {
        return;
    }
    if(mode==="browsing"){
            if (editType === 'test') {
                mode = 'editTest';
                if (serverData.testLevel.structure.type === 'fluid') {
                    gui.fluidStructureView.unlock();
                } else if (serverData.testLevel.structure.type === 'mutation') {
                    gui.mutationStructureView.unlock();
                } else {
                    gui.structureView.unlock();
                }
                gui.metaView.unlock();
            }
            switchMode();
            hideMenu();
            hideSection(gui.s1, [gui.s2, gui.s3, gui.s6, gui.s9]);
    }
}

function abortEditing(caller) {
    switch (mode) {
        case 'poolEdit':
            gui.s4.fadeOut(0);
            gui.s5.fadeOut(0);
            //deliberate fallthrough
        case 'editTest':
            gui.metaView.lock('greyout');
            $('#propertyList').scrollTop(0);
            $('#structure').scrollTop(0);
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3, gui.s6, gui.s9], function() {
                mode = 'browsing';
                switchMode();
            });
            if (caller !== 'error') {
                if (serverData.testLevel.structure.type === 'mutation') {
                    startAjax('saveTest', {
                        id: serverData.testLevel.id,
                        options: serverData.testLevel.options,
                        mSave: true
                    });
                } else {
                    startAjax('saveTest', {
                        id: serverData.testLevel.id,
                        options: serverData.testLevel.options,
                        currentSkin: serverData.testLevel.skin.skin
                    });
                }
            }
            break;
    }
}

function pCheckProceed(button, btn) {
    if (button === 'edit') {
        editSelection('pCheck');
    }
}

/* data fields */
function fillDataFields(fillMode) {
    fillMode = fillMode || mode;
    if (fillMode === 'editTest') {
            let optionNames;
            if (serverData.testLevel.structure.type === 'mutation') {
                optionNames = ['onOffSwitch', 'forceLogoff'];
            } else {
                //testpools
                gui.testpools.setItems(serverData.testLevel.testpools);
                listLabels();
                listVariables();
                optionNames = ['onOffSwitch', 'forceLogoff', 'useTimer', 'saveResults', 'limitNavigation', 'showScore', 'hideTimeoutMsg', 'waitForMediaCache', 'timeLimit'];
            }

            let languageNames = [];
            $.each(languages, function(k, v) {
                optionNames.push(k);
                languageNames.push(k);
            });
            for (let i in optionNames) {
                let option = optionNames[i];
                let value;
                if (settings[option]) {
                    value = settings[option];
                } else {
                    value = false;
                }
                if (typeof (serverData.testLevel.options[option]) != 'undefined') {
                    value = serverData.testLevel.options[option];
                }
                gui.boxes.properties[option].reset(value);
            }
            let structureItems;
            if (serverData.testLevel.structure) {
                structureItems = serverData.testLevel.structure;
            }
            if (structureItems.type === 'fluid') {
                gui.fluidStructureView.clearElements(true);
                if (structureItems.items && structureItems.items.length > 0) {
                    $.each(structureItems.items, function(key, value) {
                        if (value['itemOrder'] && typeof value['itemOrder'].data === 'object') {
                            value['itemOrder'].data = UILANG.m(value['itemOrder'].data);
                        }
                        gui.fluidStructureView.addElement(value, true);
                    })
                }
                if (mode !== 'editTest') gui.fluidStructureView.lock('greyout');
            } else if (structureItems.type === 'mutation') {
                gui.mutationStructureView.clearElements(true);
                $.each(structureItems['items'], function(key, value) {
                    let objInsert;
                    if (value.removed) {
                        objInsert = {
                            name: value.name,
                            id: value.hiddenID,
                            pages: '-',
                            maxScore: '-',
                            hiddenID: value.hiddenID,
                            removed: true,
                            actionButtons: [
                                {
                                    hiddenData: value.hiddenID,
                                    name: 'removedTest',
                                    classes: 'removed'
                                }
                            ]
                        }
                    } else {
                        let msTotal = 0;
                        $.each(value.scoring, function(k, v) {
                            msTotal += v;
                        });
                        objInsert = {
                            name: value.name,
                            id: value.hiddenID,
                            pages: value.structCount,
                            maxScore: msTotal,
                            hiddenID: value.hiddenID,
                            actionButtons: [
                                {
                                    hiddenData: value.hiddenID,
                                    name: 'viewStructure',
                                    classes: 'testStructView'
                                }
                            ]
                        }
                    }
                    gui.mutationStructureView.addElement(objInsert, true);
                });
                if (mode !== 'editTest') gui.mutationStructureView.lock('greyout');
            } else {
                gui.structureView.clearElements(true);
                if (structureItems.items && structureItems.items.length > 0) {
                    $.each(structureItems.items, function(key, value) {
                        if (!serverData.testLevel.scoring[value.hiddenID]) {
                            if (value.removed) {
                                value.maxScore = '-';
                            } else {
                                value.maxScore = 0;
                            }
                        } else {
                            value.maxScore = serverData.testLevel.scoring[value.hiddenID];
                        }
                        gui.structureView.addElement(value, true);
                    })
                }
                if (mode !== 'editTest') gui.structureView.lock('greyout');
            }
            //fill active overrides
            let tTypeTitle = $('#tTypeTitle');
            tTypeTitle.empty();
            tTypeTitle.append('<div class="aoheader_' + serverData.testLevel.structure.type + '">' + UILANG.m(serverData.testLevel.structure.type + ' test') + '</div>');
            let tActivityData = $('#tActivityData');
            tActivityData.empty();
            let actCount = $(serverData.testLevel.activityData).length;
            if (actCount > 0) {
                if (actCount === 1) {
                    tActivityData.append('<div class="aoheader_activityData">' + UILANG.m('Data from') + ' ' + actCount + ' ' + UILANG.m('test taker recorded.') + '</div>');
                } else {
                    tActivityData.append('<div class="aoheader_activityData">' + UILANG.m('Data from') + ' ' + actCount + ' ' + UILANG.m('test takers recorded.') + '</div>');
                }
            } else {
                tActivityData.append('<div class="aoheader_noActivityData">' + UILANG.m('No data recorded yet.') + '</div>');
            }

            //Depending on test type display appropriate structure box
            if (serverData.testLevel.structure.type === 'fluid') {
                gui.s3.fadeOut(0);
                gui.s9.fadeOut(0);
                gui.s6.fadeIn(0);
            } else if (serverData.testLevel.structure.type === 'mutation') {
                gui.s3.fadeOut(0);
                gui.s6.fadeOut(0);
                gui.s9.fadeIn(0);
            } else {
                gui.s6.fadeOut(0);
                gui.s9.fadeOut(0);
                gui.s3.fadeIn(0);
            }
            let activeSettings = $('#activeSettings');
            activeSettings.empty();
            if (serverData.testLevel.options.length === 0) {
                activeSettings.append('<h4 style="text-align:center;">' + UILANG.m('No data available.') + ' ' + UILANG.m('Contact administrator!') + '</h4>');
            } else {
                let langFlag = true;
                let optFlag = true;
                if (serverData.testLevel.structure.type === 'mutation') {
                    activeSettings.append('<div class="aoheader">' + UILANG.m('Mutation') + '</div>');
                    let mMethod;
                    if (serverData.testLevel.options['mutationMethod'] === 'random') {
                        mMethod = UILANG.m('Random');
                    } else {
                        mMethod = UILANG.m('Sequential');
                    }
                    activeSettings.append('<div class="aoleftcol">' + UILANG.m('Pick method') + '</div><div class="aorightcol"><span class="notFoundText">' + mMethod + '</span></div>');
                }

                $.each(optionNames, function(k, v) {
                    let propertyState;
                    if (v in serverData.testLevel.options) {
                        propertyState = serverData.testLevel.options[v];
                    } else {
                        serverData.testLevel.options[v] = settings[v];
                        propertyState = serverData.testLevel.options[v];
                        if (!propertyState) propertyState = false;
                    }
                    if (v !== 'timeLimit') {
                        //creating headers
                        if (v === 'onOffSwitch') activeSettings.append('<div class="aoheader">' + UILANG.m('Validity') + '</div>');
                        if (v === 'useTimer') activeSettings.append('<div class="aoheader">' + UILANG.m('Timer') + '</div>');
                        if ($.inArray(v, ['saveResults', 'limitNavigation', 'showScore', 'hideTimeoutMsg']) >= 0 && optFlag) {
                            activeSettings.append('<div class="aoheader">' + UILANG.m('Miscellaneous') + '</div>');
                            optFlag = false;
                        }
                        if ($.inArray(v, languageNames) >= 0 && langFlag) {
                            if (serverData.testLevel.structure.type !== 'mutation') activeSettings.append('<div class="aoheader">' + UILANG.m('Languages') + '</div>');
                            langFlag = false;
                        }
                        //adding content line
                        let nameFill;
                        let s = false;
                        switch (v) {
                            case 'onOffSwitch':
                                nameFill = UILANG.m('Test active');
                                break;
                            case 'forceLogoff':
                                nameFill = UILANG.m('Force logoff on inactive test');
                                break;
                            case 'useTimer':
                                nameFill = UILANG.m('Use timer');
                                break;
                            case 'saveResults':
                                nameFill = UILANG.m('Save results');
                                break;
                            case 'limitNavigation':
                                nameFill = UILANG.m('Limit navigation');
                                break;
                            case 'showScore':
                                nameFill = UILANG.m('Show score');
                                break;
                            case 'hideTimeoutMsg':
                                nameFill = UILANG.m('Hide time out message');
                                break;
                            case 'waitForMediaCache':
                                nameFill = UILANG.m('Wait for media to load');
                                break;
                            default:
                                if (serverData.testLevel.structure.type === 'mutation') s = true;
                                nameFill = languages[v];
                        }
                        if (s === false) activeSettings.append('<div class="aoleftcol">' + nameFill + '</div><div class="aorightcol"><img src="../images/' + propertyState + '.png" height="18px" /></div>');
                        s = false;
                        if (v === 'onOffSwitch') {
                            if (!serverData.testLevel.options.restrictions) serverData.testLevel.options.restrictions = {
                                dateRange: false,
                                timeRestriction: false,
                                testDays: false
                            };
                            let restrict = serverData.testLevel.options.restrictions;
                            let fillText;
                            let date;

                            if (restrict.dateRange) {
                                date = new Date(restrict.dateRange.start);
                                fillText = UILANG.m("from");
                                fillText += '&nbsp;';
                                fillText += date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear() + '&nbsp;&nbsp;' + (date.getHours() < 10 ? '0' : '') + date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();

                                //Add Times
                                if (restrict.dateRange.end) {
                                    fillText += '<br />';
                                    fillText += UILANG.m("to");
                                    fillText += '&nbsp;';
                                    date = new Date(restrict.dateRange.end);
                                    fillText += date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear() + '&nbsp;&nbsp;' + (date.getHours() < 10 ? '0' : '') + date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
                                }
                                activeSettings.append('<div class="aoleftcol linespread">' + UILANG.m('Date restriction') + '</div><div class="aorightcol"><span class="notFoundText">' + fillText + '</span></div>');
                                gui.boxes.properties.dateRange.reset(fillText);
                            } else {
                                activeSettings.append('<div class="aoleftcol linespread">' + UILANG.m('Date restriction') + '</div><div class="aorightcol"><span class="notFoundText">' + UILANG.m('Not set') + '</span></div>');
                                gui.boxes.properties.dateRange.reset(UILANG.m('Not set'));
                            }
                            if (restrict.timeRestriction) {
                                activeSettings.append('<div class="aoleftcol linespread">' + UILANG.m('Daily time restriction') + '</div><div class="aorightcol"><span class="notFoundText">' + restrict.timeRestriction.start + ' - ' + restrict.timeRestriction.end + '</span></div>');
                                gui.boxes.properties.timeRestriction.reset(restrict.timeRestriction.start + ' - ' + restrict.timeRestriction.end);
                            } else {
                                activeSettings.append('<div class="aoleftcol linespread">' + UILANG.m('Daily time restriction') + '</div><div class="aorightcol"><span class="notFoundText">' + UILANG.m('Not set') + '</span></div>');
                                gui.boxes.properties.timeRestriction.reset(UILANG.m('Not set'));
                            }
                            if (restrict.testDays) {
                                if (restrict.testDays.days === '0,1,2,3,4,5,6') {
                                    fillText = UILANG.m('All days');
                                }
                                let days = restrict.testDays.days.split(',');
                                fillText = '';
                                $.each(days, function(k, v) {
                                    switch (v) {
                                        case '0':
                                            fillText += UILANG.m('Mon') + ',';
                                            break;
                                        case '1':
                                            fillText += UILANG.m('Tue') + ',';
                                            break;
                                        case '2':
                                            fillText += UILANG.m('Wed') + ',';
                                            break;
                                        case '3':
                                            fillText += UILANG.m('Thu') + ',';
                                            break;
                                        case '4':
                                            fillText += UILANG.m('Fri') + ',';
                                            break;
                                        case '5':
                                            fillText += UILANG.m('Sat') + ',';
                                            break;
                                        case '6':
                                            fillText += UILANG.m('Sun') + ',';
                                            break;
                                    }
                                });
                                fillText = fillText.slice(0, -1);
                            } else {
                                fillText = UILANG.m('All days');
                            }
                            activeSettings.append('<div class="aoleftcol linespread">' + UILANG.m('Testing days') + '</div><div class="aorightcol"><span class="notFoundText">' + fillText + '</span></div>');
                            gui.boxes.properties.testDays.reset(fillText);
                        }
                        if (v === 'useTimer' && propertyState === true) {
                            let tAmount = serverData.testLevel.options['timeLimit'] || 0;
                            activeSettings.append('<div class="aoleftcol">' + UILANG.m('Time limit (minutes)') + '</div><div class="aorightcol">' + tAmount + '</div>');
                        }
                    }
                })
            }

            if (serverData.testLevel.structure.type !== 'mutation') {
                // SKIN OPTIONS
                //Build options view
                activeSettings.append('<div class="aoheader">' + UILANG.m('Skin') + '</div>');
                //Build editable options
                skinTrigger();
            }
            //metatags
            gui.metaView.clearElements(true);
            let mtags = serverData.testLevel.metatags;
            let sortedKeys = Object.keys(mtags).sort();
            $.each(sortedKeys, function(key, value) {
                let objInsert = {
                    metakey: value,
                    metavalue: mtags[value],
                    hiddenID: key
                };
                //add to structure list
                gui.metaView.addElement(objInsert, true);
            });

            if (sortedKeys.length === 1) {
                $(metaTbText).html(sortedKeys.length + ' ' + UILANG.m('meta tag'));
            } else {
                $(metaTbText).html(sortedKeys.length + ' ' + UILANG.m('meta tags'));
            }
    }
    adjustOptionsVisibility();

}

function skinChange(value) {
    //Skin clicked in dropdown
    if (serverData.testLevel.skin.skin !== value) {
        let skinOpts = skins[value].options;
        delete serverData.testLevel.skin.skinOptions;
        serverData.testLevel.skin.skin = value;
        serverData.testLevel.skin.skinOptions = $.extend(true, {}, skinOpts);
        // copy default Value to new key value
        $.each(serverData.testLevel.skin.skinOptions, function(k, v) {
            v.value = v.defaultValue;
        });
        //Write to database
        startAjax('saveSkinAssignment', {
            id: serverData.testLevel.id,
            skinData: serverData.testLevel.skin,
            skinSwitch: true,
            resetSkinOptions: true
        });
    }
}

function skinChangeRequest(value, button) {
    if (!value) return;
    if (serverData.testLevel.skin.skin === value) {
        gui.boxes.properties.skin.reset(value);
        return;
    }
    if (!button) {
        let message = sf('<p>' + UILANG.m('Are you sure you want to change the skin to') + ' "<strong>%@</strong>"' + UILANG.m('All individual settings will be lost.') + '</p>', value);
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                'default': true,
                value: 'cancel'
            }, {
                label: UILANG.m('Change skin'),
                value: 'ok'
            }],
            contents: message,
            width: 450,
            callback: skinChangeRequest,
            title: UILANG.m('Warning'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('changeSkinDialog', dialogData, arguments);
    }
    if (button === 'ok') {
        skinChange(value);
    } else if (button === 'cancel') {
        gui.boxes.properties.skin.reset(serverData.testLevel.skin.skin);
    }
}

function skinTrigger(sender, value, dirty, dataId) {
    let activeSettings = $('#activeSettings');
    let saveTrigger = false;
    let skinOpts;
    if (value) {
        skinChangeRequest(value);
        saveTrigger = true;
    } else {
        activeSettings.append('<div class="aoleftcol2">' + UILANG.m('Skin Name') + '</div>');
        activeSettings.append('<div class="aorightcol2">' + serverData.testLevel.skin["skin"] + '</div>');
        // regular run open or edit test
        if (skins[serverData.testLevel.skin.skin]) {
            skinOpts = skins[serverData.testLevel.skin.skin].options;
        } else {
            skinOpts = skins['Default Responsive'].options;
            serverData.testLevel.skin.skin = 'Default Responsive';
            saveTrigger = true;
        }
        if ($.isEmptyObject(serverData.testLevel.skin.skinOptions)) {
            //Test is new and opened for the first time with default skin or skin has no options
            if (!$.isEmptyObject(skinOpts)) {
                //copy options to the test
                serverData.testLevel.skin.skinOptions = $.extend(true, {}, skinOpts);
                // copy default Value to new key value
                $.each(serverData.testLevel.skin.skinOptions, function(k, v) {
                    v.value = v.defaultValue;
                    switch (v.type) {
                        case 'boolean':
                            activeSettings.append('<div class="aoleftcol">' + UILANG.e(v.name) + '</div>');
                            activeSettings.append('<div class="aorightcol"><img src="../images/' + v.value + '.png" height="18px" /></div>');
                            break;
                        case 'textstring':
                            activeSettings.append('<div class="aoleftcol2">' + UILANG.e(v.name) + '</div>');
                            activeSettings.append('<div class="aorightcol2">' + v.value + '</div>');
                            break;
                        case 'intrange':
                            let vals = v.value.split('...');
                            activeSettings.append('<div class="aoleftcol2">' + UILANG.m(v.name) + '</div>');
                            activeSettings.append('<div class="aorightcol2">' + vals[0] + ' &rarr; ' + vals[1] + '</div>');
                            break;
                        case 'color':
                            activeSettings.append('<div class="aoleftcol2">' + v.name + '</div>');
                            activeSettings.append('<span class="aorightcol2">' + v.value + ' <span style="border:1px solid #7b7b7b;background-color:' + v.value + ';">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>');
                            break;
                    }
                });
                saveTrigger = true;
                //Write to database
                startAjax('saveSkinAssignment', {
                    id: serverData.testLevel.id,
                    skinData: serverData.testLevel.skin
                });
            }

        } else {
            //Check if settings have been added to or removed from skin
            $.each(skinOpts, function(k, v) {
                if (!serverData.testLevel.skin.skinOptions[k]) {
                    serverData.testLevel.skin.skinOptions[k] = v;
                    serverData.testLevel.skin.skinOptions[k].value = serverData.testLevel.skin.skinOptions[k].defaultValue;
                    saveTrigger = true;
                }
            });
            $.each(serverData.testLevel.skin.skinOptions, function(k, v) {
                if (!skinOpts[k]) {
                    delete serverData.testLevel.skin.skinOptions[k];
                    saveTrigger = true;
                } else {
                    if (serverData.testLevel.skin.skinOptions[k].defaultValue !== skinOpts[k].defaultValue) {
                        serverData.testLevel.skin.skinOptions[k].defaultValue = skinOpts[k].defaultValue;
                        saveTrigger = true;
                    }
                }
            });

            if (saveTrigger) {
                //Write to database
                startAjax('saveSkinAssignment', {
                    id: serverData.testLevel.id,
                    skinData: serverData.testLevel.skin,
                    recheckDefaults: true
                });
            }
            //Show settings
            $.each(serverData.testLevel.skin.skinOptions, function(k, v) {
                switch (v.type) {
                    case 'boolean':
                        activeSettings.append('<div class="aoleftcol">' + UILANG.e(v.name) + '</div>');
                        activeSettings.append('<div class="aorightcol"><img src="../images/' + v.value + '.png" height="18px" /></div>');
                        break;
                    case 'textstring':
                        activeSettings.append('<div class="aoleftcol2">' + UILANG.e(v.name) + '</div>');
                        activeSettings.append('<div class="aorightcol2">' + v.value + '</div>');
                        break;
                    case 'intrange':
                        let vals = v.value.split('...');
                        activeSettings.append('<div class="aoleftcol2">' + UILANG.e(v.name) + '</div>');
                        activeSettings.append('<div class="aorightcol2">' + vals[0] + ' &rarr; ' + vals[1] + '</div>');
                        break;
                    case 'color':
                        activeSettings.append('<div class="aoleftcol2">d' + UILANG.e(v.name) + '</div>');
                        activeSettings.append('<span class="aorightcol2">' + v.value + ' <span style="border:1px solid #7b7b7b;background-color:' + v.value + ';">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>');
                        break;
                }
            })
        }
        skinOptionContainer.empty();
        let skinOptions = {};
        $.each(serverData.testLevel.skin.skinOptions, function(k, v) {
            switch (v.type) {
                case 'boolean':
                    skinOptions.k = insertToggleswitch(skinOptionContainer, 'so' + k, UILANG.e(v.name), {
                        dataId: k,
                        changeCallback: skinOptionChanged
                    });
                    skinOptions.k.reset(v.value);
                    break;
                case 'textstring':
                    skinOptions.k = insertLink(skinOptionContainer, 'so' + k, UILANG.e(v.name), {
                        dataId: k,
                        type: 'textstring',
                        onClick: skinOptionClicked,
                    });
                    skinOptions.k.reset(v.value);
                    break;
                case 'intrange':
                    let vals = v.value.split('...');
                    let formattedValue = vals[0] + ' &rarr; ' + vals[1];
                    skinOptions.k = insertLink(skinOptionContainer, 'so' + k, UILANG.e(v.name), {
                        dataId: k,
                        type: 'intrange',
                        onClick: skinOptionClicked,
                    });
                    skinOptions.k.reset(formattedValue);
                    break;
                case 'color':
                    skinOptions.k = insertLink(skinOptionContainer, 'so' + k, UILANG.e(v.name), {
                        dataId: k,
                        type: 'color',
                        color: true,
                        onClick: skinOptionClicked,
                    });
                    skinOptions.k.reset(v.value);
                    break;
            }
        })
    }
    if (!saveTrigger) {
        gui.boxes.properties.skin.reset(serverData.testLevel.skin.skin);
        killAct();
        if (mode === "editTest") {
            let rSwitch = false;
            $.each(serverData.testLevel.structure.items, function(k, v) {
                if (v.actionField.hiddenData) rSwitch = true;
            });

            if (rSwitch) {
                switch (serverData.testLevel.structure.type) {
                    case 'linear':
                        structureTbButtons.resetOverridesLinear.enable();
                        break;
                    case 'fluid':
                        fluidStructureTbButtons.resetOverridesFluid.enable();
                        break;
                }
            } else {
                switch (serverData.testLevel.structure.type) {
                    case 'linear':
                        structureTbButtons.resetOverridesLinear.disable();
                        break;
                    case 'fluid':
                        fluidStructureTbButtons.resetOverridesFluid.disable();
                        break;
                }
            }
        }
    }
}

function killAct() {
    if (serverData.testLevel.structure.type === 'mutation') { return; }
    //Setting n/a to overrides id chosen skin has no options
    let disableOverrideLinks = false;
    if ($(serverData.testLevel.skin.skinOptions).length < 1) {
        disableOverrideLinks = true;
    } else {
        disableOverrideLinks = true;
        $.each(serverData.testLevel.skin.skinOptions, function(k, v) {
            if (v.perItem.length !== 0) {
                disableOverrideLinks = false;

            }
        })
    }
    if (disableOverrideLinks) {
        switch (serverData.testLevel.structure.type) {
            case 'linear':
                gui.structureView.killActionFields();
                break;
            case 'fluid':
                gui.fluidStructureView.killActionFields();
                break;
        }
    }
}

function skinOptionClicked(sender, value, dirty, dataId, type, button, newValue) {
    //Launch dialoque for fetching the changes depending on type
    if (!button) {
        let dialogData;
        switch (type) {
            case 'textstring':
                dialogData = {
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
                        dialogField1: [value]
                    }, //disable OK button if name has not been changed
                    focus: 'dialogField1',
                    values: {
                        dialogField1: value
                    },
                    contents: '<p>' + UILANG.m('Please modify string for skin option') + ' "' + dataId + '":<br><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
                    title: UILANG.m('Modify string'),
                    width: 400,
                    callback: skinOptionClicked
                };
                new nxDialog('editDialog', dialogData, arguments);
                break;
            case 'intrange':
                let vals = value.split(' &rarr; ');
                minTmpValue = vals[0];
                maxTmpValue = vals[1];
                let html = UILANG.m('Please modify range for skin option') + ' "' + dataId + '":<table style="width:100%;"><tr><td style="width:50%;"><p id="minRangeContainer">min:&nbsp;&nbsp;</p></td><td><p id=maxRangeContainer>max:&nbsp;</p></td></tr></table>';

                dialogData = {
                    buttons: [{
                        label: UILANG.m('cancel'),
                        'cancel': true,
                        value: 'cancel'
                    }, {
                        label: UILANG.m('OK'),
                        'default': true,
                        value: 'ok'
                    }],
                    contents: html,
                    title: UILANG.m('Modify range'),
                    width: 400,
                    callback: skinOptionClicked
                };
                new nxDialog('editDialog', dialogData, arguments);
                //create number inputs
                let minRangeOptions = {
                    onChange: minMaxChange,
                    height: '20px',
                    width: '60px',
                    initialValue: vals[0],
                    dataId: 'minValue',
                    readOnly: false
                };
                let maxRangeOptions = {
                    onChange: minMaxChange,
                    height: '20px',
                    width: '60px',
                    initialValue: vals[1],
                    dataId: 'maxValue',
                    readOnly: false
                };
                let minRangeX = new jsNumberInput('minRangeContainer', 'minRange', minRangeOptions);
                let maxRangeX = new jsNumberInput('maxRangeContainer', 'maxRange', maxRangeOptions);
                break;
            case 'color':
                //Write color to database
                serverData.testLevel.skin.skinOptions[dataId].value = value;
                startAjax('saveSkinAssignment', {
                    id: serverData.testLevel.id,
                    skinData: serverData.testLevel.skin,
                    recheckDefaults: true
                });
                break;
        }
    }

    function minMaxChange(source, newValue, dataId) {
        switch (dataId) {
            case 'minValue':
                minTmpValue = newValue;
                break;
            case 'maxValue':
                maxTmpValue = newValue;
                break;
        }
    }

    if (button) {
        if (button === 'ok') {
            let writeValue;
            switch (type) {
                case 'textstring':
                    writeValue = newValue;
                    break;
                case 'intrange':
                    writeValue = minTmpValue + '...' + maxTmpValue;
                    break;
            }
            serverData.testLevel.skin.skinOptions[dataId].value = writeValue;
            //Write to database
            startAjax('saveSkinAssignment', {
                id: serverData.testLevel.id,
                skinData: serverData.testLevel.skin,
                recheckDefaults: true
            });
        }
    }
}

function skinOptionChanged(sender, value, dirty, dataId) {

    serverData.testLevel.skin.skinOptions[dataId].value = value;
    //Write to database
    startAjax('saveSkinAssignment', {
        id: serverData.testLevel.id,
        skinData: serverData.testLevel.skin,
        recheckDefaults: true
    });
}


function listLabels() {
    //labels
    gui.labelView.clearElements(true);
    let labelLength = getObjectSize(serverData.testLevel.labels);
    if (labelLength === 1) {
        $('#labelTbText').html(labelLength + UILANG.m(' label for your test pages'));
    } else {
        $('#labelTbText').html(labelLength + UILANG.m(' labels for your test pages'));
    }
    $.each(serverData.testLevel.labels, function(k, v) {
        serverData.testLevel.labels[k].tmpId = uniqueId();
        let tmpId = serverData.testLevel.labels[k].tmpId;
        let labelName = {
            id: tmpId,
            data: k,
            hiddenData: {
                button: v.button,
                headline: v.headline
            }
        };
        let defaultLabel = {
            id: tmpId,
            data: UILANG.m(v.default)
        };
        let objInsert = {
            name: labelName,
            hiddenID: tmpId,
            default: defaultLabel
        };
        gui.labelView.addElement(objInsert, true);
    })
    //end labels
}

function listVariables() {
    gui.varStringsView.clearElements(true);
    $.each(serverData.testLevel.variables, function(k, v) {
        serverData.testLevel.variables[k].tmpId = uniqueId();
        let varTmpId = serverData.testLevel.variables[k].tmpId;
        let clickStr;
        $.each(v.text, function(key, val) {
            if (val !== '') {
                clickStr = key + ': ' + val;
                return false;
            }
        });
        if (clickStr === undefined) clickStr = UILANG.m('* No strings found, click here to add. *');
        let insertObj = {
            hiddenData: v.text,
            data: clickStr,
            id: k
        };
        let objInsert = {
            name: k,
            text: insertObj,
            hiddenID: varTmpId,
        };
        gui.varStringsView.addElement(objInsert, true);
    })
}

function variablesChanged(deleted, id, currValue, dirty, dataId, deletedHiddenData) {
    if (deleted) {
        $.each(serverData.testLevel.variables, function(k, v) {
            if (v.tmpId === deleted) {
                startAjax('deleteVariable', {
                    var2delete: k,
                    id: serverData.testLevel.id
                });
            }
        })
    }
}

function variablesClick(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {
    editLocStrings(rowName, hiddenData);
}


/* editing loc strings variables */
function editLocStrings(varName, data) {
    let srcVariable = varName;

    let editlocHTML = '<p>' + UILANG.m('Localized content for variable:') + ' <Strong>' + srcVariable + '</Strong><br></p><div class="variablesEditContainer"><table style="width:97%;border:0px;border-spacing:0px;">';
    let dataFields = [];
    $.each(languages, function(k, v) {
        editlocHTML += '<tr><td class="variableTfTitle"><strong>' + v + '</strong></td></tr>';
        editlocHTML += '<tr><td><input type="text" class="lblClick" id="' + k + '_textLoc" style="width: 100%;"></td></tr>';
        dataFields.push(k + '_textLoc');
    });
    editlocHTML += '</table><br /></div>';

    let editLocDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save changes'),
            'default': true,
            disabled: true,
            value: 'save'
        }],
        contents: editlocHTML,
        datafields: dataFields,
        dataFormat: 'object',
        title: UILANG.m('Edit localization content variables'),
        width: 850,
        callback: saveChangedLoc
    };
    window.editLocDialog = new nxDialog('editLocDialog', editLocDialogData);


    //pre-populate input fields with available data
    $.each(data, function(k, v) {
        $('#' + k + '_textLoc').val(v);
        if ($('#' + k + '_textLoc').val().length < 1) {
            $('#' + k + '_textLoc').addClass("textField-alert");
        } else {
            $('#' + k + '_textLoc').removeClass('textField-alert');
        }
    });

    //check for invalid chars & status
    $('.lblClick').on('keyup', function() {
        if ($(this).val().length < 1) {
            $(this).addClass("textField-alert")
        } else {
            $(this).removeClass("textField-alert");
        }
    });

    function saveChangedLoc(button, dataObject) {
        if (button === 'save') {
            startAjax('saveLocChanges', {
                id: serverData.testLevel.id,
                clickVariable: srcVariable,
                locData: dataObject
            });
        }
    }
}

function propertiesChanged(deleted, id, currValue, dirty, dataId) {
    if ($(serverData.testLevel.activityData).length > 0 && deleted) {
        let html = UILANG.m('You are trying to remove a page from a test for which results have already been collected. These results will not be available anymore after deletion. Please confirm!');
        let dialogData = {
            buttons: [
                { label: UILANG.m('Cancel'), 'cancel': true, 'default': true, value: 'cancel' },
                { label: UILANG.m('Delete'), value: 'delete' }
            ],
            contents: html,
            title: UILANG.m('Confirm deletion'),
            returnPromise: true,
            width: 650,
            icon: "../images/warning.png",
            iconWidth: 64
        };
        showDialog('drDialog', dialogData).then(
            (res) => {
                if (res.button === 'delete') {
                    proceedLinear();
                } else {
                    startAjax('fetchTest', {
                        dbId: serverData.testLevel.id,
                        location: loc.folder,
                        preSelect: true,
                        defaultSkin: settings['skin']
                    });
                }
            }
        );

    } else {
        proceedLinear();
    }

    function proceedLinear() {
        gui.structureView.clearWarnings();
        startAjax('saveTest', {
            id: serverData.testLevel.id,
            structure: currValue,
            testtype: 'linear',
            options: serverData.testLevel.options,
            currentSkin: serverData.testLevel.skin.skin
        });
    }
}

function mutationPropertiesChanged(deleted, id, currValue, dirty, dataId) {
    gui.mutationStructureView.clearWarnings();
    startAjax('saveTest', {
        id: serverData.testLevel.id,
        structure: currValue,
        mSave: true
    });
}

function propertiesClick(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {
    switch (fieldDesc) {
        case 'label':
            changeLabel('linear', clickedId, parentId, hiddenData, rowName);
            break;
        case 'actionField':
            editOverrides('linear', clickedId, parentId, hiddenData, rowName);
            break;
        case 'actionButton':
            editScripts('linear', clickedId, parentId, hiddenData, rowName);
            break;
        case 'viewStructure':
            viewSubTest(hiddenData);
            break;
    }
}

function viewSubTest(id) {
    startAjax('fetchLinearTestStructure', {
        dbId: id,
        subTestView: true
    });
}

function viewSubTestDialog(structure) {

    let message = '<div id="mutTestCont"><div id="mutTestInfo"></div><div id="mutTestOptions"></div><div id="mutTestStructure"><table id="mutSubStruct"></table></div></div>';

    const dialogData = {
        buttons: [{
            label: UILANG.m('close'),
            'cancel': true,
            'default': true,
            value: 'cancel'
        }],
        contents: message,
        returnPromise: true,
        width: 800,
        title: UILANG.m('Structure of linear test: ') + structure.name
    };
    showDialog('deleteDialog', dialogData).then(
        (res) => {
        }
    );

    let mInfo = $('#mutTestInfo');
    let mOpt = $('#mutTestOptions');
    let mStruct = $('#mutSubStruct');
    let o = structure.options;
    let skin = structure.skin.skin;

    //Subtest Info
    mInfo.append('<h2>' + structure.name + ' (ID: ' + structure.id + ')</h2>');
    mInfo.append('<p class="mutInf">' + Object.keys(structure.structure.items).length + ' ' + UILANG.m('test pages') + '</p>');
    mInfo.append('<p class="mutInf">' + UILANG.m('Skin:') + ' ' + structure.skin.skin + '</p>');


    //Subtest Options
    mOpt.append('<p class="mutInf mutIt">' + UILANG.m('These are the original options of the subtest. They will also be used when launched in the mutation test. Only the validity will be overridden!') + '</p>');
    mOpt.append('<div class="mutHeader">' + UILANG.m('Timer') + '</div>');
    if (o.useTimer) {
        mOpt.append('<div class="aoleftcol">' + UILANG.m('Use timer') + '</div><div class="aorightcol"><img src="../images/' + o.useTimer + '.png" height="18px" /></div>');
        mOpt.append('<div class="aoleftcol">' + UILANG.m('Time limit (minutes)') + '</div><div class="aorightcol">' + o.timeLimit + '</div>');

    } else {
        mOpt.append('<div class="aoleftcol">' + UILANG.m('Use timer') + '</div><div class="aorightcol"><img src="../images/' + o.useTimer + '.png" height="18px" /></div>');
    }
    mOpt.append('<div class="mutHeader">' + UILANG.m('Miscellaneous') + '</div>');
    mOpt.append('<div class="aoleftcol">' + UILANG.m('Save results') + '</div><div class="aorightcol"><img src="../images/' + o.saveResults + '.png" height="18px" /></div>');
    mOpt.append('<div class="aoleftcol">' + UILANG.m('Limit navigation') + '</div><div class="aorightcol"><img src="../images/' + o.limitNavigation + '.png" height="18px" /></div>');
    mOpt.append('<div class="aoleftcol">' + UILANG.m('Show score') + '</div><div class="aorightcol"><img src="../images/' + o.showScore + '.png" height="18px" /></div>');
    mOpt.append('<div class="aoleftcol">' + UILANG.m('Hide time out message') + '</div><div class="aorightcol"><img src="../images/' + o.hideTimeoutMsg + '.png" height="18px" /></div>');
    mOpt.append('<div class="mutHeader">' + UILANG.m('Languages') + '</div>');
    $.each(languages, function(k, v) {
        let lFill = false;
        if (o[k]) lFill = o[k];
        mOpt.append('<div class="aoleftcol">' + v + '</div><div class="aorightcol"><img src="../images/' + lFill + '.png" height="18px" /></div>');
    });
    mOpt.append('<div class="mutHeader">' + UILANG.m('Skin') + '</div>');
    mOpt.append('<div>' + skin + '</div>');

    //Subtest Structure
    mStruct.append('<tr class="smFo"><th>#</th><th class="tabName">' + UILANG.m('Page name') + '</th><th>' + UILANG.m('Points') + '</th></tr>');
    let scores;
    let structCount = 1;
    $.each(serverData.testLevel.structure.items, function(k, v) {
        if (v.hiddenID === structure.id) {
            scores = v.scoring;
            return false;
        }
    });
    let sglScore;
    $.each(structure.structure.items, function(k, v) {

        if (scores[v.hiddenID]) {
            sglScore = scores[v.hiddenID];
        } else {
            sglScore = 0;
        }
        mStruct.append('<tr class="smFo"><td>' + structCount + '</td><td>' + v.name + '</td><td>' + sglScore + '</td></tr>');
        structCount++;
    })
}


function propertiesChangedFluid(deleted, id, currValue, dirty, dataId) {
    if ($(serverData.testLevel.activityData).length > 0 && deleted) {
        let html = UILANG.m('You are trying to remove a fluid block for which results have already been collected. These results will not be available anymore after deletion. Please confirm!');
        let dialogData = {
            buttons: [
                { label: UILANG.m('Cancel'), 'cancel': true, 'default': true, value: 'cancel' },
                { label: UILANG.m('Delete'), value: 'delete' }
            ],
            contents: html,
            title: UILANG.m('Confirm deletion'),
            returnPromise: true,
            width: 650,
            icon: "../images/warning.png",
            iconWidth: 64
        };
        showDialog('drDialog', dialogData).then(
            (res) => {
                if (res.button === 'delete') {
                    proceedFluid();
                } else {
                    startAjax('fetchTest', {
                        dbId: serverData.testLevel.id,
                        location: loc.folder,
                        preSelect: true,
                        defaultSkin: settings['skin']
                    });
                }
            }
        );

    } else {
        proceedFluid();
    }

    function proceedFluid() {
        gui.fluidStructureView.clearWarnings();
        if (deleted) {
            startAjax('updateFluidBlocks', {
                deletedFluidBlock: deleted,
                newStructure: currValue,
                testId: serverData.testLevel.id,
                currentSkin: serverData.testLevel.skin.skin
            });
        } else {
            startAjax('updateFluidBlocks', {
                newStructure: currValue,
                testId: serverData.testLevel.id,
                currentSkin: serverData.testLevel.skin.skin
            });
        }
    }
}

function propertiesClickFluid(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {

    switch (fieldDesc) {
        case 'label':
            changeLabel('fluid', clickedId, parentId, hiddenData, rowName);
            break;
        case 'actionField':
            editOverrides('fluid', clickedId, parentId, hiddenData, rowName);
            break;
        case 'actionButton':
            editScripts('fluid', clickedId, parentId, hiddenData, rowName);
            break;
        case 'fixedPosition':
            saveFixedPositionChange('fluid', clickedId, parentId, hiddenData, rowName);
            break;
        case 'itemOrder':
            saveItemOrder('fluid', clickedId, parentId, hiddenData, rowName);
            break;
        case 'itemsUsed':
            chgItemsUsed('fluid', clickedId, parentId, hiddenData, rowName);
            break;
    }
}

function saveItemOrder(testType, clickedId, parentId, posFlag, rowName) {
    startAjax('saveFluidPoolOrder', {
        id: clickedId
    });
}

function chgItemsUsed(testType, clickedId, parentId, hiddenData, rowName) {

    let pagesUsed;
    if (hiddenData.used > hiddenData.total) {
        pagesUsed = hiddenData.total;
    } else {
        pagesUsed = hiddenData.used;
    }
    let fiuHtml = '<div class="divMain"><div class="dmText">' + UILANG.m('Number of test pages of this testpool to be used?') + '</div><div  class="divSub" id="itemUsageDroplistDiv"</div></div><br />';

    let dialogData = {
        buttons: [
            { label: UILANG.m('Cancel'), 'cancel': true, 'default': true, value: 'cancel' },
            { label: UILANG.m('Save'), value: 'save' }
        ],
        contents: fiuHtml,
        title: UILANG.m('Save number of pages used'),
        returnPromise: true,
        width: 600
    };
    showDialog('iuDialog', dialogData).then(
        (res) => {
            if (res.button === 'save') {
                let fluidStructureId = parentId.slice(21);
                startAjax('saveFluidPageUsage', {
                    id: clickedId,
                    pageUsage: pagesUsed
                });
            }
        }
    );

    let poolItemUsageOptions = {
        onChange: itemUsageChg,
        initialValue: 2,
        elements: [{
            value: hiddenData.total,
            label: UILANG.m('Use all') + ' (' + hiddenData.total + ')'
        }],
        dataId: 'piu2',
        readOnly: false,
        width: 185
    };
    let poolItemUsage = new jsDropList('itemUsageDroplistDiv', 'itemUsageOptions', poolItemUsageOptions);
    for (let i = hiddenData.total - 1; i > 0; i--) {
        poolItemUsage.addElement(i, i);
    }
    poolItemUsage.reset(pagesUsed, false);

    function itemUsageChg(sender, itemUsage, dirty, dataId) {
        pagesUsed = itemUsage;
    }
}

function saveFixedPositionChange(testType, clickedId, parentId, posFlag, rowName) {
    let dialogData;
    if (posFlag === false) {
        posFlag = true;
        let fixedPosHTML = UILANG.m('Set fluid block') + ' <strong>"' + rowName + '"</strong> ' + UILANG.m('on_fixed_position') + '</h3></div>';
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                'default': true,
                value: 'cancel'
            }, {
                label: UILANG.m('Save'),
                value: 'add'
            }],
            contents: fixedPosHTML,
            title: UILANG.m('Set fluid block to fixed position'),
            width: 520,
            callback: saveFixedPosFlag
        };

    } else {
        posFlag = false;
        let fixedPosHTML = UILANG.m('Do you want to remove the fixed position flag from the fluid block') + ' <strong>"' + rowName + '"</strong> ?';
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                'default': true,
                value: 'cancel'
            }, {
                label: UILANG.m('Save'),
                value: 'add'
            }],
            contents: fixedPosHTML,
            title: UILANG.m('Remove fixed position flag from fluid block'),
            width: 520,
            callback: saveFixedPosFlag
        };
    }

    window.fixedPosSaver = new nxDialog('fixedPosDialog', dialogData);

    function saveFixedPosFlag(btnClicked) {
        if (btnClicked === 'add') {
            gui.fluidStructureView.updateHiddenData(clickedId, posFlag, true);
        }
    }
}

function poolPropertiesClick(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {
    editScripts('fluidPool', clickedId, parentId, hiddenData, rowName);
}

function poolPropertiesChanged(deleted, id, currValue, dirty, dataId) {
    if ($(serverData.testLevel.activityData).length > 0 && deleted) {
        let html = UILANG.m('You are trying to remove a test page for which results have already been collected. These results will not be available anymore after deletion. Please confirm!');
        let dialogData = {
            buttons: [
                { label: UILANG.m('Cancel'), 'cancel': true, 'default': true, value: 'cancel' },
                { label: UILANG.m('Delete'), value: 'delete' }
            ],
            contents: html,
            title: UILANG.m('Confirm deletion'),
            returnPromise: true,
            width: 650,
            icon: "../images/warning.png",
            iconWidth: 64
        };
        showDialog('drDialog', dialogData).then(
            (res) => {
                if (res.button === 'delete') {
                    proceedPool();
                } else {
                    startAjax('fetchTestsAssigned', {
                        id: currPoolId,
                        test: serverData.testLevel.id
                    });
                }
            }
        );

    } else {
        proceedPool();
    }

    function proceedPool() {
        startAjax('saveTestpoolAssignment', {
            structure: currValue,
            tpId: currPoolId,
            testId: serverData.testLevel.id
        });
    }
}

function labelsChanged(deleted, id, currValue, dirty, dataId) {

    if (deleted) {
        $.each(serverData.testLevel.labels, function(k, v) {
            if (v.tmpId === deleted) {
                startAjax('updateLabels', {
                    deletedLabel: k,
                    testId: serverData.testLevel.id
                });
            }
        })
    }
}

function labelsClick(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {
    switch (fieldDesc) {
        case 'name':
            editLabel(clickedId);
            break;
        case 'default':
            $.each(serverData.testLevel.labels, function(k, v) {
                if (v.tmpId === clickedId) {
                    startAjax('setDefaultLabel', {
                        label: k,
                        testId: serverData.testLevel.id
                    });
                }
            });
            break;
    }
}

function optionsChanged(sender, value, dirty, dataId) {
    if (mode !== 'browsing') {
        let options = serverData.testLevel.options;
        if (sender !== 'restrictionChange') options[dataId] = value;
        if (dataId === 'useTimer') adjustOptionsVisibility(true);
        let sendDat = { id: serverData.testLevel.id, options: serverData.testLevel.options };
        if (serverData.testLevel.structure.type === 'fluid') {
            gui.fluidStructureView.clearWarnings();
            sendDat.currentSkin = serverData.testLevel.skin.skin;
        } else if (serverData.testLevel.structure.type === 'mutation') {
            gui.mutationStructureView.clearWarnings();
            sendDat.mSave = true;
        } else {
            gui.structureView.clearWarnings();
            sendDat.currentSkin = serverData.testLevel.skin.skin;
        }
        startAjax('saveTest', sendDat);
    }
}

function timeOptionsChanged(sender, value, dataId){
        if(value > 999){
            gui.boxes.properties.timeLimit.reset(999);
            showMessage(UILANG.m('The maximum for the test duration is 999 minutes!'));
            value=999;
        }
        serverData.testLevel.options[dataId] = value;
}


function editDateRange() {
    let helperObj = {};
    let dr = serverData.testLevel.options.restrictions.dateRange;
    let head1 = UILANG.m('Define the date range where the test will be accessible. You can set a "start" and an optional "end" date and time.');
    let html = '<p id="drMessage" class="dialogStandardMessage">' + head1 + '</p>' +
        '</div>' +
        '<div id="drTimeContainer">' +
        '<div class="drToFromContainer">' +
        '<div class="drToFromText">' + UILANG.m("Valid from:") + '</div>' +
        '<div id="drTimeFromContainer">' +
        '<div id="drFrom"></div>' +
        '<div id="drFromTime" ></div>' +
        '</div></div>' +
        '<div class="drToFromContainer">' +
        '<div class="drToFromText">' + UILANG.m("To:") + '</div>' +
        '<div id="drTimeToContainer">' +
        '<div id="drTo"></div>' +
        '<div id="drToTime"></div>' +
        '</div></div>' +
        '</div>' +
        '<div id="drCb"></div>' +
        '<table id="drTable">' +
        '<tr>' +
        '<td colspan=2 class="drDpCell">' +
        '<div id="drDp1"></div>' +
        '</td>' +
        '<td colspan=2 class="drDpCell">' +
        '<div id="drDp2"></div>' +
        '</td>' +
        '</tr>' +
        '<tr>' +
        '<td colspan=2>' + UILANG.m("Time:") + '</td>' +
        '<td id="toTimeHead" colspan=2>' + UILANG.m("Time:") + '</td>' +
        '</tr>' +
        '<tr>' +
        '<td class="drPadd" colspan=2><div  id="drSlider1"></div></td>' +
        '<td class="drPadd" colspan=2><div id="drSlider2"></div></td>' +
        '</tr></table>';
    let dialogData = {
        buttons: [
            { label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel' },
            { label: UILANG.m('Delete restriction'), value: 'delete' },
            { label: UILANG.m('Save'), 'default': true, value: 'ok' }
        ],
        contents: html,
        title: UILANG.m('Edit date restriction'),
        returnPromise: true,
        width: 650
    };
    showDialog('drDialog', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                serverData.testLevel.options.restrictions.dateRange = {};
                serverData.testLevel.options.restrictions.dateRange.start = helperObj.fromDate + 'T' + helperObj.fromTime;
                if (helperObj.toDate) {
                    serverData.testLevel.options.restrictions.dateRange.end = helperObj.toDate + 'T' + helperObj.toTime;
                } else {
                    serverData.testLevel.options.restrictions.dateRange.end = false;
                }
                optionsChanged('restrictionChange', false, false, 'dateRange');
            } else if (res.button === 'delete') {
                serverData.testLevel.options.restrictions.dateRange = false;
                optionsChanged('restrictionChange', false, false, 'dateRange');
            }
        }
    );
    //Fill fields
    let initDateFrom;
    let initDateTo;
    if (dr) {
        initDateFrom = new Date(dr.start);
        helperObj.fromDate = initDateFrom.getFullYear() + '-' + ((initDateFrom.getMonth() + 1) < 10 ? '0' : '') + (initDateFrom.getMonth() + 1) + '-' + (initDateFrom.getDate() < 10 ? '0' : '') + initDateFrom.getDate();
        $('#drFrom').html(initDateFrom.getDate() + '.' + (initDateFrom.getMonth() + 1) + '.' + initDateFrom.getFullYear());
        $('#drFromTime').html(initDateFrom.getHours() + ':' + (initDateFrom.getMinutes() < 10 ? '0' : '') + initDateFrom.getMinutes());
        helperObj.fromTime = (initDateFrom.getHours() < 10 ? '0' : '') + initDateFrom.getHours() + ':' + (initDateFrom.getMinutes() < 10 ? '0' : '') + initDateFrom.getMinutes();
        if (dr.end) {
            initDateTo = new Date(dr.end);
            helperObj.toDate = initDateTo.getFullYear() + '-' + ((initDateTo.getMonth() + 1) < 10 ? '0' : '') + (initDateTo.getMonth() + 1) + '-' + (initDateTo.getDate() < 10 ? '0' : '') + initDateTo.getDate();
            $('#drTo').html(initDateTo.getDate() + '.' + (initDateTo.getMonth() + 1) + '.' + initDateTo.getFullYear());
            $('#drToTime').html(initDateTo.getHours() + ':' + (initDateTo.getMinutes() < 10 ? '0' : '') + initDateTo.getMinutes());
            helperObj.toTime = (initDateTo.getHours() < 10 ? '0' : '') + initDateTo.getHours() + ':' + (initDateTo.getMinutes() < 10 ? '0' : '') + initDateTo.getMinutes();
            $('#drCb').html(UILANG.m('Delete end date'));
            $("#drDp2").css('visibility', 'visible');
            $("#drSlider2").css('visibility', 'visible');
            $("#toTimeHead").css('visibility', 'visible');
            $("#drCb").addClass('tableCellSelected');
        } else {
            helperObj.toDate = false;
            helperObj.toTime = false;
            $('#drTo').html(UILANG.m('infinite'));
            $('#drToTime').html('');
            $('#drCb').html(UILANG.m('Set end date'));
            $("#drDp2").css('visibility', 'hidden');
            $("#drSlider2").css('visibility', 'hidden');
            $("#toTimeHead").css('visibility', 'hidden');
            $("#drCb").removeClass('tableCellSelected');
        }
    } else {
        initDateFrom = new Date();
        helperObj.fromDate = initDateFrom.getFullYear() + '-' + ((initDateFrom.getMonth() + 1) < 10 ? '0' : '') + (initDateFrom.getMonth() + 1) + '-' + (initDateFrom.getDate() < 10 ? '0' : '') + initDateFrom.getDate();
        $('#drFrom').html(initDateFrom.getDate() + '.' + (initDateFrom.getMonth() + 1) + '.' + initDateFrom.getFullYear());
        let mins = Math.floor(initDateFrom.getMinutes() / 5) * 5;
        $('#drFromTime').html(initDateFrom.getHours() + ':' + (mins < 10 ? '0' : '') + mins);
        helperObj.fromTime = (initDateFrom.getHours() < 10 ? '0' : '') + initDateFrom.getHours() + ':' + (mins < 10 ? '0' : '') + mins;
        $('#drTo').html(UILANG.m('infinite'));
        $('#drToTime').html('');
        $('#drCb').html(UILANG.m('Set end date'));
        helperObj.toDate = false;
        helperObj.toTime = false;
        $("#drDp2").css('visibility', 'hidden');
        $("#drSlider2").css('visibility', 'hidden');
        $("#toTimeHead").css('visibility', 'hidden');
        $("#drCb").removeClass('tableCellSelected');
    }

    $("#drDp1").datepicker({
        onSelect: writeDateFrom,
        dateFormat: 'yy-m-d'
    });
    $("#drDp2").datepicker({
        onSelect: writeDateTo,
        dateFormat: 'yy-m-d'
    });
    $("#drDp1").datepicker("setDate", initDateFrom);
    $("#drDp2").datepicker("setDate", initDateTo);
    $("#drDp2").datepicker("option", "minDate", initDateFrom);
    if ($('#drCb').hasClass("tableCellSelected")) $("#drDp1").datepicker("option", "maxDate", initDateTo);

    function writeDateFrom() {
        let selDate = $("#drDp1").datepicker("getDate");
        $('#drFrom').html($.datepicker.formatDate("d.m.yy", selDate));
        helperObj.fromDate = selDate.getFullYear() + '-' + ((selDate.getMonth() + 1) < 10 ? '0' : '') + (selDate.getMonth() + 1) + '-' + (selDate.getDate() < 10 ? '0' : '') + selDate.getDate();

        if ($('#drCb').hasClass("tableCellSelected")) {
            $("#drDp2").datepicker("option", "minDate", selDate);
            let dat2 = $.datepicker.formatDate("dd.mm.yy", selDate);
            let dat1 = $.datepicker.formatDate("dd.mm.yy", $("#drDp2").datepicker("getDate"));
            if (dat1 === dat2) {
                if ($("#drSlider1").slider("value") >= $("#drSlider2").slider("value")) {
                    $("#drSlider1").slider('value', 0);
                    $("#drSlider2").slider('value', 86100);
                    helperObj.fromTime = '00:00';
                    helperObj.toTime = '23:55';
                    $("#drFromTime").html('0:00');
                    $("#drToTime").html('23:55');
                }
            }
        }
    }

    function writeDateTo() {
        let selDate = $("#drDp2").datepicker("getDate");
        let selDate1 = $("#drDp1").datepicker("getDate");
        let dat2 = $.datepicker.formatDate("dd.mm.yy", selDate);
        let datView = $.datepicker.formatDate("d.m.yy", selDate);
        let dat1 = $.datepicker.formatDate("dd.mm.yy", selDate1);
        $('#drTo').html(datView);
        helperObj.toDate = selDate.getFullYear() + '-' + ((selDate.getMonth() + 1) < 10 ? '0' : '') + (selDate.getMonth() + 1) + '-' + (selDate.getDate() < 10 ? '0' : '') + selDate.getDate();
        $("#drDp1").datepicker("option", "maxDate", selDate);
        if (dat2 === dat1) {
            $("#drSlider1").slider('value', 0);
            $("#drSlider2").slider('value', 86100);
            helperObj.fromTime = '00:00';
            helperObj.toTime = '23:55';
            $("#drFromTime").html('0:00');
            $("#drToTime").html('23:55');
        }
    }

    let timeInitTo;

    if (helperObj.toTime !== false) {
        timeInitTo = time2Secs(helperObj.toTime);
    } else {
        timeInitTo = 0;
    }

    $("#drSlider1").slider({
        min: 0,
        max: 86100,
        value: time2Secs(helperObj.fromTime),
        step: 300,
        slide: function(event, ui) {
            let secs = ui.value;
            if ($('#drCb').hasClass("tableCellSelected") && secs >= $("#drSlider2").slider("value")) {
                let dat1 = $.datepicker.formatDate("dd.mm.yy", $("#drDp1").datepicker("getDate"));
                let dat2 = $.datepicker.formatDate("dd.mm.yy", $("#drDp2").datepicker("getDate"));
                if (dat1 === dat2) {
                    return false;
                }
            }
            let t = secs2Time(secs);
            if (t.charAt(0) === '0') t = t.slice(1);
            $("#drFromTime").html(t);
            helperObj.fromTime = secs2Time(secs);
        }
    });
    $("#drSlider2").slider({
        min: 0,
        max: 86100,
        value: timeInitTo,
        step: 300,
        slide: function(event, ui) {
            let secs = ui.value;
            if ($('#drCb').hasClass("tableCellSelected") && secs <= $("#drSlider1").slider("value")) {
                let dat1 = $.datepicker.formatDate("dd.mm.yy", $("#drDp1").datepicker("getDate"));
                let dat2 = $.datepicker.formatDate("dd.mm.yy", $("#drDp2").datepicker("getDate"));
                if (dat1 === dat2) {
                    return false;
                }
            }
            let t = secs2Time(secs);
            if (t.charAt(0) === '0') t = t.slice(1);
            $("#drToTime").html(t);
            helperObj.toTime = secs2Time(secs);
        }
    });

    $('#drCb').on('click', function() {
        $(this).toggleClass('tableCellSelected');
        if ($(this).hasClass("tableCellSelected")) {
            $(this).html(UILANG.m('Delete end date'));
            $("#drDp2").css('visibility', 'visible');
            $("#drSlider2").css('visibility', 'visible');
            $("#toTimeHead").css('visibility', 'visible');
            let date1 = $("#drDp1").datepicker('getDate', '+1d');
            date1.setDate(date1.getDate() + 1);
            $("#drDp2").datepicker("setDate", date1);
            $("#drDp2").datepicker("option", "minDate", $("#drDp1").datepicker("getDate"));
            $("#drDp1").datepicker("option", "maxDate", $("#drDp2").datepicker("getDate"));
            writeDateTo(date1);
            helperObj.toTime = helperObj.fromTime;
            $("#drToTime").html(helperObj.toTime);
            $("#drSlider2").slider('value', time2Secs(helperObj.toTime));
        } else {
            $(this).html(UILANG.m('Set end date'));
            $("#drDp2").css('visibility', 'hidden');
            $("#drSlider2").css('visibility', 'hidden');
            $("#toTimeHead").css('visibility', 'hidden');
            $('#drTo').html(UILANG.m('infinite'));
            $('#drToTime').html('');
            $("#drDp1").datepicker("option", "minDate", null);
            $("#drDp1").datepicker("option", "maxDate", null);
            helperObj.toDate = false;
            helperObj.toTime = false;
        }
    })
}

function editTimeRestriction() {
    //get current values
    let tr = serverData.testLevel.options.restrictions.timeRestriction;
    let val1, val2, value1, value2;
    if (tr === false) {
        val1 = 28800;
        val2 = 57600;
    } else {
        val1 = time2Secs(tr.start);
        val2 = time2Secs(tr.end);
    }

    let head1 = UILANG.m('Move the sliders to set the start and end time of the daily test time restriction. Outside of this daily range, test takers will not be able to run the test.');
    let html = '<p class="dialogStandardMessage">' + head1 + '</p><div class="rtHeadCont"><span id="trStart"></span>&nbsp;&nbsp;:&nbsp;&nbsp;<span id="trEnd"></span><div><br /><div id="trSlider"></div>';
    let dialogData = {
        buttons: [
            { label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel' },
            { label: UILANG.m('Delete restriction'), value: 'delete' },
            { label: UILANG.m('Save'), 'default': true, value: 'ok' }
        ],
        contents: html,
        title: UILANG.m('Edit daily time restriction'),
        returnPromise: true,
        width: 700
    };
    showDialog('timeRestrictionDialog', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                serverData.testLevel.options.restrictions.timeRestriction = {};
                serverData.testLevel.options.restrictions.timeRestriction.start = value1;
                serverData.testLevel.options.restrictions.timeRestriction.end = value2;
                optionsChanged('restrictionChange', false, false, 'timeRestriction');
            } else if (res.button === 'delete') {
                serverData.testLevel.options.restrictions.timeRestriction = false;
                optionsChanged('restrictionChange', false, false, 'timeRestriction');
            }
        }
    );
    $("#trStart").html(secs2Time(val1));
    $("#trEnd").html(secs2Time(val2));
    value1 = secs2Time(val1);
    value2 = secs2Time(val2);
    $("#trSlider").slider({
        range: true,
        min: 0,
        max: 86400,
        values: [val1, val2],
        step: 300,
        slide: function(event, ui) {
            let min = ui.values[0];
            let max = ui.values[1];
            value1 = secs2Time(min);
            value2 = secs2Time(max);
            $("#trStart").html(secs2Time(min));
            $("#trEnd").html(secs2Time(max));
        }
    });
}

function editTestDays() {
    let days;
    let helperObj;
    let head1 = UILANG.m('On all selected days, test takers will be able to run the test. Unselect the week days the test should not be active and accessible.');
    let html = '<p class="dialogStandardMessage">' + head1 + '</p><div class="weekDaysTable"><div class="weekDaysRow"><div data-0 class="weekDaysCells"></div><div data-1 class="weekDaysCells"></div><div data-2 class="weekDaysCells"></div><div data-3 class="weekDaysCells"></div><div data-4 class="weekDaysCells"></div><div data-5 class="weekDaysCells"></div><div data-6 class="weekDaysCells"></div></div></div>';
    let dialogData = {
        buttons: [
            { label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel' },
            { label: UILANG.m('Delete restriction'), value: 'delete' },
            { label: UILANG.m('Save'), 'default': true, value: 'ok' }
        ],
        contents: html,
        title: UILANG.m('Edit testing days restriction'),
        returnPromise: true,
        width: 700
    };
    showDialog('testDaysDialog', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                let hlp = '';
                $.each(helperObj, function(k, v) {
                    $.each($(v).data(), function(k, v) {
                        hlp += k + ',';
                    });
                });
                hlp = hlp.slice(0, -1);

                if (hlp === '0,1,2,3,4,5,6' || hlp === '') {
                    serverData.testLevel.options.restrictions.testDays = false;
                    optionsChanged('restrictionChange', false, false, 'testDays');
                } else {
                    serverData.testLevel.options.restrictions.testDays = {};
                    serverData.testLevel.options.restrictions.testDays.days = hlp;
                    optionsChanged('restrictionChange', false, false, 'testDays');
                }

            } else if (res.button === 'delete') {
                serverData.testLevel.options.restrictions.testDays = false;
                optionsChanged('restrictionChange', false, false, 'testDays');
            }
        }
    );

    $('div[data-0]').html(UILANG.m('Mon'));
    $('div[data-1]').html(UILANG.m('Tue'));
    $('div[data-2]').html(UILANG.m('Wed'));
    $('div[data-3]').html(UILANG.m('Thu'));
    $('div[data-4]').html(UILANG.m('Fri'));
    $('div[data-5]').html(UILANG.m('Sat'));
    $('div[data-6]').html(UILANG.m('Sun'));
    //get current values
    let td = serverData.testLevel.options.restrictions.testDays;
    if (td === false) {
        $('.weekDaysCells').toggleClass('daySelected');
    } else {
        days = td.days.split(',');
        $.each(days, function(k, v) {
            $('div[data-' + v + ']').toggleClass('daySelected');
        })
    }
    helperObj = ($('.daySelected'));
    $('.weekDaysCells').on('click', function() {
        $(this).toggleClass('daySelected');
        helperObj = ($('.daySelected'));
    })
}


function editScripts(testType, clickedId, parentId, scriptObj, rowName) {
    let editScriptsHTML = '<div id ="editScriptsDIV"><h3>' + UILANG.m('Edit scripts for:') + ' <span class="soValue">"' + rowName + '"</span></h3></p><ul class="showTabs"><li><a href="#editScriptsTabs-pre">Pre</a></li><li><a href="#editScriptsTabs-post">Post</a></li><li><a href="#editScriptsTabs-onActivity">on Activity</a></li></ul><div id="editScriptsTabs-pre"><textarea id="scriptsTextAreaPre"></textarea></div><div id="editScriptsTabs-post"><textarea id="scriptsTextAreaPost"></textarea></div><div id="editScriptsTabs-onActivity"><textarea id="scriptsTextAreaOnActivity"></textarea></div><br /></div>';
    let dataFields = ['scriptsTextAreaPre', 'scriptsTextAreaPost', 'scriptsTextAreaOnActivity'];
    const dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            value: 'add'
        }],
        contents: editScriptsHTML,
        datafields: dataFields,
        title: UILANG.m('Edit scripts'),
        width: 800,
        callback: saveScripts
    };
    window.overridesSaver = new nxDialog('editOverridesDialog', dialogData);


    $('ul.showTabs').each(function() {
        let $active, $content, $links = $(this).find('a');
        $active = $($links.filter('[href="' + location.hash + '"]')[0] || $links[0]);
        $active.addClass('active');
        $content = $($active[0].hash);
        $links.not($active).each(function() {
            $(this.hash).hide();
        });
        $(this).on('click', 'a', function(e) {
            $active.removeClass('active');
            $content.hide();
            $active = $(this);
            $content = $(this.hash);
            $active.addClass('active');
            $content.show();
            e.preventDefault();
        });
    });

    if (typeof (scriptObj) == 'object') {
        if (scriptObj.pre) $('#scriptsTextAreaPre').val(scriptObj.pre);
        if (scriptObj.post) $('#scriptsTextAreaPost').val(scriptObj.post);
        if (scriptObj.onActivity) $('#scriptsTextAreaOnActivity').val(scriptObj.onActivity);
    }

    function saveScripts(btnClicked, preVal, postVal, onActivityVal) {
        if (btnClicked === 'add') {
            //gather data
            let saveScripts = {};
            if (preVal.length > 0) saveScripts['pre'] = preVal;
            if (postVal.length > 0) saveScripts['post'] = postVal;
            if (onActivityVal.length > 0) saveScripts['onActivity'] = onActivityVal;

            switch (testType) {
                case 'linear':
                    gui.structureView.updateHiddenData(clickedId, saveScripts, true);
                    break;
                case 'fluid':
                    gui.fluidStructureView.updateHiddenData(clickedId, saveScripts, true);
                    break;
                case 'fluidPool':
                    gui.poolStructureView.updateHiddenData(clickedId, saveScripts, true);
                    break;
            }
        }
    }
}

function adjustOptionsVisibility(animated) {
    /* show/hide other options based on current changes */
    let options = serverData.testLevel.options || null;
    if (!options) return;
    let duration = 0;
    if (animated) duration = 250;
    if (options.useTimer === true) {
        gui.boxes.properties.timeLimit.show(duration);
    } else {
        gui.boxes.properties.timeLimit.hide(duration);
    }
}

function deleteHovered(type, obj) {
    obj.type = type;
    deleteTestpool(obj);
}

function editHovered(type, obj) {
    obj.type = type;
    editTestpool(obj);
}

function selectListBtnNewTp(sender, button, name) {
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
            contents: '<p>' + UILANG.m('Please enter a name for the new testpool:') + '<br><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('New testpool'),
            width: 400,
            callback: selectListBtnNewTp
        };
        new nxDialog('newTestDialog', dialogData, arguments);
    }
    if (button === 'ok' && name !== '') {
        startAjax('newTestpool', {
            test: selection[0].dbId,
            name: name,
            showBlocked: showBlocked
        });

    }
    if (button === 'ok' && name === '') {
        showMessage(UILANG.m('In order to create a testpool, you have to enter a name with which the testpool can be identified!'));
    }
}

function editTestpool(sel, button, name) {
    if (!sel) return;
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
                dialogField1: [sel.name]
            }, //disable OK button if name has not been changed
            focus: 'dialogField1',
            values: {
                dialogField1: sel.name
            },
            contents: '<p>' + UILANG.m('Please enter a new name:') + '<br><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('Rename'),
            width: 400,
            callback: editTestpool
        };
        new nxDialog('renameDialog', dialogData, arguments);
    }
    if (button === 'ok' && !name.match(/^\s*$/) && name !== sel.name) {

        let dupe = false;
        $.each(serverData.testLevel.testpools, function(k, v) {
            if ((v.name.toLowerCase() === name.toLowerCase()) && (v.id !== sel.id)) dupe = true;
        });

        if (dupe) {
            showMessage(UILANG.m('This name is allready in use. Please choose a different one.'))
        } else {
            startAjax('editTestpool', {
                id: sel.id,
                name: name,
                test: selection[0].dbId
            });
        }
    }
}

function deleteTestpool(sel, button) {
    if (!sel) return;
    if (!button) {
        let message = sf('<p>' + UILANG.m('Are you sure you want to delete the following testpool?') + '<br><strong>%@</strong></p>', sel.name);
        const dialogData = {
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
            callback: deleteTestpool,
            title: UILANG.m('Delete Testpool?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('deleteDialog', dialogData, arguments);
    }
    if (button === 'ok') {
        startAjax('deleteTestpool', {
            test: selection[0].dbId,
            tbId: sel.id
        });
    }
}

function selectionChanged(sel) {
    let testsList = $('#testPanelList');
    let inactiveMessage = $('#inactiveMsg');
    let noAssignmentMessage = $('#noAssignmentMsg');
    let poolStructureTbTxt = $('#poolStructureTbText');
    if (!sel) {
        buttons.plausibilityCheck.disable();
        inactiveMessage.show();
        poolStructureTbTxt.hide();
        noAssignmentMessage.hide();
        poolStructureTbButtons.addElements.disable();
        testsList.hide();
        $(poolStructureTbTxt).html('');
    } else {
        buttons.plausibilityCheck.enable();
        currPoolId = sel.id;
        testsList.show();
        inactiveMessage.hide();
        poolStructureTbButtons.addElements.enable();
        startAjax('fetchTestsAssigned', {
            id: currPoolId,
            test: serverData.testLevel.id
        });
    }
}


/* creation */
function newFolder(sender, button, name) {

    if (loc.path.length > 14) {
        showMessage(UILANG.m('You have reached the maximum number of allowed folder levels in the file manager. It is not possible to create a folder here!'));
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
            datafields: ['dialogField1'],
            mandatory: ['dialogField1'],
            focus: 'dialogField1',
            contents: '<p>' + UILANG.m('Please enter a name for the folder:') + '<br><input type="text" maxlength="200" id="dialogField1" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('New folder'),
            width: 400,
            callback: newFolder
        };
        new nxDialog('newFolderDialog', dialogData, arguments);
    }

    $("#dialogField1").inputFilter(function(value) {
        return /^[^\\]*$/.test(value);
    });

    if (button === 'ok' && name !== '') {
        startAjax('newFolder', {
            location: loc.folder,
            name: name,
            showBlocked: showBlocked
        });
    }
    if (button === 'ok' && name === '') {
        showMessage(UILANG.m('You need to enter a name for the new folder!'));
    }
}

function newTest(sender, button, name, type) {
    let ttChg = 'linear';
    let dialogData = {
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
        contents: '<p>' + UILANG.m('Please enter a name for the test:') + '<br /><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('Type of test:') + '<span id="testHelp"></span><br><div id="dialogField2"></div></p>',
        title: UILANG.m('New test'),
        returnPromise: true,
        width: 400
    };

    showDialog('newTestDialog', dialogData).then(
        (res) => {
            if (res.button === 'ok' && res.data[0] !== '') {
                //Fetch current defaults
                let optionKeys = ['forceLogoff', 'useTimer', 'saveResults', 'limitNavigation', 'showScore', 'hideTimeoutMsg', 'timeLimit', 'mutationMethod'];
                $.each(languages, function(k, v) {
                    optionKeys.push(k);
                });
                let optionName, value;
                let optionsData = {};

                for (let i in optionKeys) {
                    optionName = optionKeys[i];
                    if (settings[optionName]) {
                        value = settings[optionName];
                    } else {
                        if (optionName === 'timeLimit') {
                            value = 0;
                        } else {
                            value = false;
                        }
                    }
                    optionsData[optionName] = value;
                }
                startAjax('newTest', {
                    location: loc.folder,
                    name: res.data[0],
                    defaultOptions: optionsData,
                    defaultSkin: settings['skin'],
                    testType: ttChg,
                    showBlocked: showBlocked
                });
            }
            if (button === 'ok' && res.data[0] === '') {
                showMessage(UILANG.m('In order to create a test, you have to enter a name with which the test can be identified!'));
            }
        }
    );

    //show online help
    const testHelpHtml=UILANG.m('<p>When creating a new test in OASYS, you need to select a test type. Below are the available test types and their descriptions:<br><br><strong>Linear Tests</strong>: Linear tests are composed of test pages that are presented in a specified order. The entire set of pages will be used in the sequence defined during test creation.<br><br><strong>Fluid Tests</strong>: Fluid tests are composed of test blocks. Each test block refers to a test pool, which contains chosen test pages. The test block can use all or just some of the items or stimuli from the test pool, and these can be presented in a specified or random order.<br><br><strong>Mutation Tests</strong>: Mutation tests are composed of linear tests. Each time a mutation test is launched by a test taker or a test taker template, one of the assigned linear tests is launched. The selection of the linear test can be either random or sequential, depending on the configuration.<br><br>Select the test type that best fits your testing needs to proceed with test creation.</p>');
    new OasysHelp('testHelp', {
        htmlContent: testHelpHtml,
        title: UILANG.m('Test types')
    });

    let testTypeOpt = {
        onChange: testTypeChg,
        initialValue: 'linear',
        elements: [{
            value: 'linear',
            label: 'linear'
        }, {
            value: 'fluid',
            label: 'fluid'
        }, {
            value: 'mutation',
            label: 'mutation'
        }],
        dataId: 'ddF1',
        readOnly: false,
        width: '100%'
    };
    let ddFallbackList = new jsDropList('dialogField2', 'tTypeChooser', testTypeOpt);
    function testTypeChg(sender, typ, dirty, dataId) {
        ttChg = typ;
    }
}

/* deletion */
function deleteSelection() {
    if (mode !== 'browsing') {
        return;
    }
    let message = '<ul class="deleteList">';
    let foldersInSelection = false;
    for (let i in selection) {
        let obj = selection[i];
        let type = 'typetest';
        if (obj.type === 'folder') {
            foldersInSelection = true;
            type = 'folder';
        }
        message += sf('<li class="%@">%@</li>', type, obj.label);
    }
    message += '</ul>';
    message = '<p>' + UILANG.m('really_delete') + '</p>' + message + '<p class="red">' + UILANG.m('WARNING: Recorded data for the chosen tests will also be deleted.') + '</p>';
    if (foldersInSelection) {
        message += '<p class="red">' + UILANG.m('warning_recursive') + '</p>';
    }
    const dialogData = {
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
        returnPromise: true,
        width: 640,
        title: UILANG.m('Delete selection'),
        icon: "../images/warning.png",
        iconWidth: 64
    };
    showDialog('deleteDialog', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                startAjax('deleteSelection', {
                    location: loc.folder,
                    selection: selection,
                    showBlocked: showBlocked
                });
            }
        }
    );
}

function resetResults(sender, button) {
    if (!button) {
        let message;
        if (selection.length === 1 && selection[0].type !== 'folder') {
            message = sf('<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the test "%@"? This action is irreversible!') + '</p>', serverData.testLevel.name);
        } else {
            message = '<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the selected tests? This action is irreversible!') + '</p>';
        }
        const resetData = {
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
            width: 600,
            callback: resetResults,
            title: UILANG.m('Reset test results?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('resetDialog', resetData, arguments);
    }
    if (button === 'ok') {
        startAjax('resetResults', {
            selection: selection
        });
    }
}

function duplicate() {
    let sources = {
        folders: [],
        tests: []
    };
    sources.tests.push(serverData.testLevel.id);
    duplicateObjects(sources, loc.folder);
}

//search functionality
function clickSearch() {
    gui.library.filerSearch();
}

function correctData() {
    if (serverData && serverData.testLevel) {
        if (serverData.testLevel.options instanceof Array) serverData.testLevel.options = {};
    }
}

//Testpools editor
function testpools() {
    gui.s2.fadeOut(0);
    gui.s6.fadeOut(0);
    gui.s4.fadeIn(0);
    gui.s5.fadeIn(0);
    $('#vdivider').hide();
    mode = 'poolEdit';
    switchMode();
}

//Labels editor
function labels() {
    if (serverData.testLevel.structure.type === 'fluid') {
        gui.s6.fadeOut(0);
    } else {
        gui.s3.fadeOut(0);
    }
    gui.s2.fadeOut(0);
    gui.s7.fadeIn(0);
    $('#vdivider').hide();
    mode = 'labelEdit';
    switchMode();
}

//Variables editor
function variables() {
    if (serverData.testLevel.structure.type === 'fluid') {
        gui.s6.fadeOut(0);
    } else {
        gui.s3.fadeOut(0);
    }
    gui.s2.fadeOut(0);
    gui.s8.fadeIn(0);
    $('#vdivider').hide();
    mode = 'variablesEdit';
    switchMode();
}

//Legal text editor
function legalText(){

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            'default': true,
            value: 'ok'
        }],
        contents: '<div id="legalMsg"></div><div style="height:550px;" id="legalTextEditor"></div>',
        title: UILANG.m('Edit privacy policy'),
        returnPromise: true,
        width: 1200
    };

    showDialog('lteEditor', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                const writeObj = {};
                $.each(languages, function(key, value) {
                    writeObj[key]=tinymce.get('container_'+key).getContent();
                });
                //Save modified privacy policy
                startAjax('saveTest', {
                    id: serverData.testLevel.id,
                    metaData: writeObj,
                    metaType: 'privacy_policy',
                    currentSkin: serverData.testLevel.skin.skin
                });
            }
            //Kill all editors
            tinymce.remove();
        }
    );

    $('#legalMsg').append(UILANG.m('Create or edit your privacy policy in different languages here and set the visibility using the skin settings of your test (might not be available for all skins).'));

    const legalTabs = new jsTabs($('#legalTextEditor'), 'lte');
    const tabList = {};
    const containers = [];

    $('#legalTextEditor').append('<div id="editorCont"></div>');

    let userLang;
    switch (settings.interfaceLanguage) {
        case "DE":
            userLang = "de";
            break;
        case "FR":
            userLang = "fr_FR";
            break;
    }

    //prepare content
    const content = JSON.parse(serverData.testLevel.metadata);

    $.each(languages, function(key, value) {
        tabList[key] = key;
        //Add container for each language and preload content
        containers.push('container_'+key);
        let preLoad;
        if (content && content.privacy_policy && Object.prototype.hasOwnProperty.call(content.privacy_policy, key)) {
            preLoad=content.privacy_policy[key];
        } else {
            preLoad='';
        }
        $('#editorCont').append('<div id="div_'+key+'"><textarea id="container_'+key+'">'+preLoad+'</textarea></div>');
        tinymce.init({
            selector: '#container_' + key,
            promotion: false,
            plugins: [
                "charmap",
                "code",
                "preview",
                "searchreplace",
                "table",
                "visualblocks",
                "visualchars",
                "wordcount",
                "lists",
                "advlist",
                "autolink",
                "link",
                "anchor",
                "insertdatetime",
                "fullscreen"
            ],
            toolbar: 'undo redo | formatselect | bold italic backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | table',
            menubar: 'edit view insert format tools table',
            menu: {
                edit: { title: 'Edit', items: 'undo redo | cut copy paste | selectall | searchreplace' },
                view: { title: 'View', items: 'code | visualaid visualchars visualblocks | preview fullscreen' },
                format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | formats blockformats fontsize align | forecolor backcolor | removeformat' },
                tools: { title: 'Tools', items: 'spellchecker spellcheckerlanguage | code wordcount' },
                table: { title: 'Table', items: 'inserttable tableprops deletetable row column cell' }
            },
            // Disable image upload and image-related options
            image_advtab: false,
            paste_data_images: false,
            min_height: 500,
            resize: false,
            language: userLang
        });
    });

    legalTabs.setTabs(tabList);

    // init jsTabs click handler
    let tSel = legalTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function(ret) {
        for (let c in containers) {
            $('#div_'+containers[c].replace("container_", "")).hide();
        }
        $('#div_'+ret.originalEvent.detail).show();
    });

    $.each(containers, function(key, val) {
        if(key!==0) {
            let lang=val.replace("container_", "");
            $('#div_'+lang).hide();
        }
    });
}

//Score screen editor
function scoreScreen(){

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            'default': true,
            value: 'ok'
        }],
        contents: '<div id="scoreMsg"></div><div style="height:550px;" id="scoreScreenEditor"></div>',
        title: UILANG.m('Edit score screen'),
        returnPromise: true,
        width: 1200
    };

    showDialog('seEditor', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                const writeObj = {};
                $.each(languages, function(key, value) {
                    writeObj[key]=tinymce.get('container_'+key).getContent();
                });
                //Save modified score screen
                startAjax('saveTest', {
                    id: serverData.testLevel.id,
                    metaData: writeObj,
                    metaType: 'score_screen',
                    currentSkin: serverData.testLevel.skin.skin
                });
            }
            //Kill all editors
            tinymce.remove();
        }
    );

    $('#scoreMsg').append(UILANG.m('Customize the score screen displayed after a test using the WYSIWYG editor. Add variables & navigation button using the custom icons in the toolbar.'));

    const legalTabs = new jsTabs($('#scoreScreenEditor'), 'lte');
    const tabList = {};
    const containers = [];

    $('#scoreScreenEditor').append('<div id="editorCont"></div>');

    let userLang;
    switch (settings.interfaceLanguage) {
        case "DE":
            userLang = "de";
            break;
        case "FR":
            userLang = "fr_FR";
            break;
    }

    //prepare content
    const content = JSON.parse(serverData.testLevel.metadata);

    $.each(languages, function(key, value) {
        tabList[key] = key;
        //Add container for each language and preload content
        containers.push('container_'+key);
        let preLoad;
        const defaultContent = {
            DE: `<h1 style="text-align: center;"><strong></strong></h1> 
     <h1 style="text-align: center;"><strong>Punktzahl</strong></h1> 
     <h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span>  
     /  <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1> 
     <p style="text-align: center;"><strong></strong></p> 
     <p style="text-align: center;"><strong><span class="non-editable-variable button-variable" 
     contenteditable="false" data-url="" data-action="close" data-label="Test beenden">Test beenden</span></strong></p>`,

            EN: `<h1 style="text-align: center;"><strong></strong></h1> 
     <h1 style="text-align: center;"><strong>Score</strong></h1> 
     <h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span>  
     /  <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1> 
     <p style="text-align: center;"><strong></strong></p> 
     <p style="text-align: center;"><strong><span class="non-editable-variable button-variable" 
     contenteditable="false" data-url="" data-action="close" data-label="Close test">Close test</span></strong></p>`,

            FR: `<h1 style="text-align: center;"><strong></strong></h1> 
     <h1 style="text-align: center;"><strong>Score</strong></h1> 
     <h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span>  
     /  <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1> 
     <p style="text-align: center;"><strong></strong></p> 
     <p style="text-align: center;"><strong><span class="non-editable-variable button-variable" 
     contenteditable="false" data-url="" data-action="close" data-label="Fermer le test">Fermer le test</span></strong></p>`,

            LU: `<h1 style="text-align: center;"><strong></strong></h1> 
     <h1 style="text-align: center;"><strong>Punktzuel</strong></h1> 
     <h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span>  
     /  <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1> 
     <p style="text-align: center;"><strong></strong></p> 
     <p style="text-align: center;"><strong><span class="non-editable-variable button-variable" 
     contenteditable="false" data-url="" data-action="close" data-label="Test zoumaachen">Test zoumaachen</span></strong></p>`
        };


        if (content && content.score_screen && Object.prototype.hasOwnProperty.call(content.score_screen, key) && content.score_screen[key].trim() !== "") {
            preLoad = content.score_screen[key];
        } else {
            preLoad = defaultContent.hasOwnProperty(key) ? defaultContent[key] : defaultContent[languageFallbacks[key]];
        }

        $('#editorCont').append('<div id="div_'+key+'"><textarea id="container_'+key+'">'+preLoad+'</textarea></div>');

        tinymce.init({
            selector: '#container_' + key,
            promotion: false,
            plugins: [
                "charmap", "code", "preview", "searchreplace", "table",
                "visualblocks", "visualchars", "wordcount", "lists",
                "advlist", "autolink", "link", "anchor", "insertdatetime",
                "fullscreen"
            ],
            toolbar: 'undo redo | formatselect | bold italic backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | table | scored total percentage addbutton',
            menubar: 'edit view insert format tools table',
            min_height: 500,
            resize: false, // Ensures the editor is NOT resizable
            language: userLang,
            valid_elements: '*[*]',
            extended_valid_elements: 'span[class|contenteditable|data-url|data-action]',
            setup: function (editor) {
                const translations = {
                    en: {
                        scored: 'Scored',
                        total: 'Total',
                        percentage: 'Percentage',
                        addbutton: 'Add Button',
                        definebuttonlabel: 'Button label',
                        enter_url: 'Enter URL',
                        insert: 'Insert',
                        update: 'Update',
                        cancel: 'Cancel',
                        choose_action: 'Choose Action',
                        close_test: 'Close Test',
                        open_url: 'Open URL',
                        url_required: 'URL is required for "Open URL"'
                    },
                    de: {
                        scored: 'Erreicht',
                        total: 'Gesamt',
                        percentage: 'Prozent',
                        addbutton: 'Button',
                        definebuttonlabel: 'Button label',
                        enter_url: 'URL eingeben',
                        insert: 'Einfügen',
                        update: 'Aktualisieren',
                        cancel: 'Abbrechen',
                        choose_action: 'Aktion auswählen',
                        close_test: 'Test beenden',
                        open_url: 'URL öffnen',
                        url_required: 'Eine URL ist erforderlich für „URL öffnen“'
                    },
                    fr_FR: {
                        scored: 'Obtenu',
                        total: 'Total',
                        percentage: 'Pourcentage',
                        addbutton: 'Bouton',
                        definebuttonlabel: 'Libellé du bouton',
                        enter_url: 'Entrer l’URL',
                        insert: 'Insérer',
                        update: 'Mettre à jour',
                        cancel: 'Annuler',
                        choose_action: 'Choisir une action',
                        close_test: 'Fermer le test',
                        open_url: 'Ouvrir URL',
                        url_required: 'Une URL est requise pour "Ouvrir URL"'
                    }
                };

                const lang = translations[userLang] || translations['en'];

                function insertVariable(variable) {
                    editor.insertContent(`<span class="non-editable-variable" contenteditable="false">[@ ${variable} @]</span>&nbsp;`);
                }

                editor.ui.registry.addButton('scored', {
                    text: lang.scored,
                    icon: 'code-sample',
                    onAction: function () {
                        insertVariable('SCORED');
                    }
                });

                editor.ui.registry.addButton('total', {
                    text: lang.total,
                    icon: 'code-sample',
                    onAction: function () {
                        insertVariable('TOTAL');
                    }
                });

                editor.ui.registry.addButton('percentage', {
                    text: lang.percentage,
                    icon: 'code-sample',
                    onAction: function () {
                        insertVariable('PERCENTAGE');
                    }
                });

                editor.ui.registry.addButton('addbutton', {
                    text: lang.addbutton,
                    icon: 'link',
                    onAction: function () {
                        openButtonDialog(editor, '', 'close', '', false);
                    }
                });

                function openButtonDialog(editor, existingUrl, existingAction, existingLabel, isEditing = false) {
                    let actionType = existingAction || 'close';
                    let urlValue = existingUrl !== undefined ? existingUrl : '';
                    let labelValue = existingLabel || lang.close_test;

                    function getDialogConfig(selectedAction) {
                        return {
                            title: lang.addbutton,
                            body: {
                                type: 'panel',
                                items: [
                                    {
                                        type: 'input',
                                        name: 'label',
                                        label: lang.definebuttonlabel,
                                        value: labelValue,
                                        placeholder: lang.close_test
                                    },
                                    {
                                        type: 'selectbox',
                                        name: 'action',
                                        label: lang.choose_action,
                                        items: [
                                            { text: lang.close_test, value: 'close' },
                                            { text: lang.open_url, value: 'open_url' }
                                        ],
                                        value: selectedAction
                                    },
                                    ...(selectedAction === 'open_url' ? [{
                                        type: 'input',
                                        name: 'url',
                                        label: lang.enter_url,
                                        placeholder: 'https://example.com',
                                        value: urlValue,
                                        required: true
                                    }] : [])
                                ]
                            },
                            buttons: [
                                { type: 'cancel', text: lang.cancel },
                                {
                                    type: 'submit',
                                    text: isEditing ? lang.update : lang.insert,
                                    primary: true
                                }
                            ],
                            initialData: {
                                action: selectedAction,
                                label: labelValue,
                                url: urlValue
                            },
                            onChange: function (api, details) {
                                const data = api.getData();
                                labelValue = data.label;
                                urlValue = data.url !== undefined ? data.url : urlValue;
                                if (details.name === 'action') {
                                    api.redial(getDialogConfig(data.action));
                                }
                            },
                            onSubmit: function (api) {
                                const data = api.getData();

                                if (data.action === 'open_url' && !data.url) {
                                    editor.windowManager.alert(lang.url_required);
                                    return;
                                }

                                const actionKeyword = data.label;
                                const buttonVar = `<span class="non-editable-variable button-variable" contenteditable="false" data-action="${data.action}" data-url="${data.action === 'close' ? '' : data.url}" data-label="${data.label}">${actionKeyword}</span>&nbsp;`;

                                const selectedNode = editor.selection.getNode();
                                if (selectedNode.classList.contains('button-variable')) {
                                    selectedNode.outerHTML = buttonVar;
                                } else {
                                    editor.insertContent(buttonVar);
                                }

                                api.close();
                            }
                        };
                    }

                    editor.windowManager.open(getDialogConfig(actionType));
                }
                editor.on('click', function (e) {
                    if (e.target.classList.contains('non-editable-variable')) {
                        e.preventDefault();
                        if (e.target.classList.contains('button-variable')) {
                            const currentAction = e.target.getAttribute('data-action') || 'close';
                            const currentUrl = e.target.getAttribute('data-url') !== undefined ? e.target.getAttribute('data-url') : '';
                            const currentLabel = e.target.getAttribute('data-label') || lang.close_test;
                            openButtonDialog(editor, currentUrl, currentAction, currentLabel, true);
                        }
                    }
                });

            },
            content_style: `
                .non-editable-variable {
                    background-color: #eee;
                    padding: 2px 5px;
                    border-radius: 4px;
                    font-weight: bold;
                }
                .button-variable {
                    background-color: #d9edf7;
                    color: #31708f;
                }`
        });
    });

    legalTabs.setTabs(tabList);

    // init jsTabs click handler
    let tSel = legalTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function(ret) {
        for (let c in containers) {
            $('#div_'+containers[c].replace("container_", "")).hide();
        }
        $('#div_'+ret.originalEvent.detail).show();
    });

    $.each(containers, function(key, val) {
        if(key!==0) {
            let lang=val.replace("container_", "");
            $('#div_'+lang).hide();
        }
    });
}

function closePoolEditor() {
    gui.s4.fadeOut(0);
    gui.s5.fadeOut(0);
    gui.s2.fadeIn(0);
    gui.s6.fadeIn(0);
    $('#vdivider').show();
    mode = 'editTest';
    switchMode('abortReq');
    startAjax('fetchTest', {
        dbId: selection[0].dbId,
        location: loc.folder,
        defaultSkin: settings['skin']
    });
    buttons.plausibilityCheck.enable();
}

function closeLabelEditor() {
    if (serverData.testLevel.structure.type === 'fluid') {
        gui.s6.fadeIn(0);
    } else {
        gui.s3.fadeIn(0);
    }
    gui.s7.fadeOut(0);
    gui.s2.fadeIn(0);
    $('#vdivider').show();
    mode = 'editTest';
    switchMode('abortReq');
    startAjax('fetchTest', {
        dbId: selection[0].dbId,
        location: loc.folder,
        defaultSkin: settings['skin']
    });
    buttons.plausibilityCheck.enable();
}

function closeVariablesEditor() {
    if (serverData.testLevel.structure.type === 'fluid') {
        gui.s6.fadeIn(0);
    } else {
        gui.s3.fadeIn(0);
    }
    gui.s8.fadeOut(0);
    gui.s2.fadeIn(0);
    $('#vdivider').show();
    mode = 'editTest';
    switchMode('abortReq');
    startAjax('fetchTest', {
        dbId: selection[0].dbId,
        location: loc.folder,
        defaultSkin: settings['skin']
    });
    buttons.plausibilityCheck.enable();
}

//plausibility check
function plausibilityCheck() {
    if (serverData.testLevel.structure.type === 'fluid') {
        if (mode === 'poolEdit') {
            launchCheck('plausibilityCheck');
        } else {
            launchCheck('plausibilityFluidCheck');
        }
    } else {
        launchCheck('plausibilityCheck');
    }
}

//quick plausibility check linear test
function quickCheck() {
    switch (mode) {
        case 'poolEdit':
            launchCheck('quickCheck');
            break;
        case 'editTest':
            if (!firstRun) {
                if (serverData.testLevel.structure.type === 'fluid') {
                    launchCheck('quickFluidCheck');
                } else if (serverData.testLevel.structure.type === 'linear') {
                    launchCheck('quickCheck');
                }
            }
            firstRun = false;
            break;

    }
}

function launchCheck(checktype) {
    let checkData = {};
    checkData.options = serverData.testLevel.options;
    if (mode === 'poolEdit') {
        checkData.structure = serverData.testLevel.currentPoolItems;
    } else {
        checkData.structure = serverData.testLevel.structure['items'];
    }
    checkData.id = serverData.testLevel.id;
    let activeLanguages = [];
    $.each(languages, function(k, v) {
        if (checkData['options'][k]) {
            activeLanguages.push(k);
        }
    });
    startAjax(checktype, {
        id: checkData['id'],
        languages: activeLanguages,
        structure: checkData['structure']
    });
}

//rename
function rename(sender, button, name) {

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
                dialogField1: [selection[0]['name']]
            }, //disable OK button if name has not been changed
            focus: 'dialogField1',
            values: {
                dialogField1: selection[0]['name']
            },
            contents: '<p>' + UILANG.m('Please enter a new name:') + '<br><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('Rename'),
            width: 400,
            callback: rename
        };
        new nxDialog('renameDialog', dialogData, [selection[0]['name']]);
    }

    if (selection[0]['type'] === 'folder') {
        $("#dialogField1").inputFilter(function(value) {
            return /^[^\\]*$/.test(value);
        });
    }

    if (button === 'ok' && !name.match(/^\s*$/) && name !== selection[0]['name']) {

        startAjax('renameTestOrFolder', {
            name: name,
            type: selection[0]['type'],
            id: selection[0]['dbId'],
            location: loc.folder,
            showBlocked: showBlocked
        });
    }
}

/* adding variables */
function addVariable(preFill) {
    if (preFill === 'addVariable') preFill = null;
    let dataFields = [];
    dataFields.push('newVariableName');
    let createlocHTML = '<p>' + UILANG.m('Enter the name for the new variable:') +
        '</p><input type="text" class="lblClick" id="newVariableName" maxlength="200" style="width: 50%;"><p>' + UILANG.m('Localized content for the new variable:') +
        '<br>' + UILANG.m('Please add at least the languages you use in your test.') +
        '<div class="variablesEditContainer">' +
        '</p><table style="width:97%;border:0px;border-spacing:0px;">';

    $.each(languages, function(k, v) {
        createlocHTML += '<tr><td class="variableTfTitle"><strong>' + v + '</strong></td></tr>';
        createlocHTML += '<tr><td><input type="text" class="lblClick" id="' + k + '_textLoc" style="width: 100%;"></td></tr>';
        dataFields.push(k + '_textLoc');
    });
    createlocHTML += '</table><br /></div>';

    let createLocDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Create new variable'),
            'default': true,
            disabled: true,
            value: 'save'
        }],
        contents: createlocHTML,
        datafields: dataFields,
        mandatory: ['newVariableName'],
        focus: 'newVariableName',
        dataFormat: 'object',
        title: UILANG.m('Create new variable'),
        width: 850,
        callback: saveNewLoc
    };
    window.createLocDialog = new nxDialog('createLocDialog', createLocDialogData);

    //Pre-Fill
    if (preFill) {
        //pre-populate input fields with available data after duplicate warning
        $.each(preFill, function(k, v) {
            $('#' + k).val(v);
            if ($('#' + k).val().length < 1) {
                $('#' + k).addClass("textField-alert");
            } else {
                $('#' + k).removeClass("textField-alert");
            }
        })
    }

    //check for invalid chars & status
    $('.lblClick').on('keyup', function() {
        if ($(this).val().length < 1) {
            $(this).addClass("textField-alert")
        } else {
            $(this).removeClass("textField-alert");
        }
    });

    function saveNewLoc(button, dataObject) {
        if (button === 'save') {
            startAjax('createNewVariable', {
                testId: serverData.testLevel.id,
                locData: dataObject
            });
        }
    }
}


/* adding labels */
function addLabel() {

    let newlabelHTML = '<p>' + UILANG.m('Please enter a new name for the label:') + '<br><input type="text" id="labelname" maxlength="200" style="width: 100%; margin-top: 10px;"></p><div class="variablesEditContainer"><table style="width:100%;border:0px;border-spacing:0px;">';
    let dataFields = ['labelname'];
    $.each(languages, function(k, v) {
        newlabelHTML += '<tr><td colspan="2" class="labelTfTitle"><strong>' + UILANG.e(v) + '</strong></td></tr>';
        newlabelHTML += '<tr><td>' + UILANG.m('Button') + '</td><td><input type="text" class="lblClick" id="' + k + '_button" style="width: 100%;"></td></tr>';
        newlabelHTML += '<tr><td>' + UILANG.m('Headline') + '</td><td><input type="text" class="lblClick" id="' + k + '_headline" style="width: 100%;"></td></tr>';
        dataFields.push(k + '_button');
        dataFields.push(k + '_headline');
    });
    newlabelHTML += '</table><br /></div>';

    let newLabelDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Create Label'),
            'default': true,
            disabled: true,
            keepOpen: true,
            value: 'add'
        }],
        focus: 'labelname',
        mandatory: ['labelname'],
        dataFormat: 'object',
        contents: newlabelHTML,
        datafields: dataFields,
        title: UILANG.m('Create Label'),
        width: 700,
        callback: saveLabel
    };
    window.newLabelDialog = new nxDialog('newLabelDialog', newLabelDialogData);

    //Create contextmenu
    $.contextMenu('destroy', '.lblClick');
    $.contextMenu({
        selector: ".lblClick",
        items: {
            headl: {
                name: UILANG.m('Insert code for:'),
                disabled: true,
            },
            "counterAll": {
                name: UILANG.m('Counter current test page : [@counter_total]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@counter_total]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                }
            },
            "totalAll": {
                name: UILANG.m('Count of pages in the test : [@total_total]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@total_total]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                }
            },
            "counterLbl": {
                name: UILANG.m('Counter of the current test page in the labelgroup : [@counter_labelgroup]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@counter_labelgroup]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                }
            },
            "totalLbl": {
                name: UILANG.m('Count of test pages in the labelgroup : [@total_labelgroup]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@total_labelgroup]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                }
            }
        }
    });

    function saveLabel(button, labelDataObject) {
        if (button === 'add') {
            let saveFlag = true;
            $.each(serverData.testLevel.labels, function(k, v) {
                if (k === labelDataObject.labelname) {
                    showMessage(UILANG.m('The label name') + ' <strong>' + k + '</strong> ' + UILANG.m('already exists. Please use another name!'));
                    saveFlag = false;
                }
            });
            if (saveFlag) {
                startAjax('createLabel', {
                    testId: serverData.testLevel.id,
                    newLabelData: labelDataObject
                });
                window.newLabelDialog.dismiss();
            }
        }


    }
}

/* editing labels */
function editLabel(clickedId) {
    let editlabelHTML = '<p>' + UILANG.m('Current name for the label:') + '<br><input type="text" id="labelname" maxlength="200" style="width: 97%; margin-top: 10px;"></p><div class="variablesEditContainer"><table style="width:97%;border:0px;border-spacing:0px;">';
    let dataFields = ['labelname'];
    $.each(languages, function(k, v) {
        editlabelHTML += '<tr><td colspan="2" class="labelTfTitle"><strong>' + v + '</strong></td></tr>';
        editlabelHTML += '<tr><td>' + UILANG.m('Button') + '</td><td><input type="text" class="lblClick" id="' + k + '_button" style="width: 100%;"></td></tr>';
        editlabelHTML += '<tr><td>' + UILANG.m('Headline') + '</td><td><input type="text" class="lblClick" id="' + k + '_headline" style="width: 100%;"></td></tr>';
        dataFields.push(k + '_button');
        dataFields.push(k + '_headline');
    });
    editlabelHTML += '</table><br /></div>';

    let editLabelDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Change Label'),
            'default': true,
            disabled: true,
            keepOpen: true,
            value: 'save'
        }],
        contents: editlabelHTML,
        datafields: dataFields,
        focus: 'labelname',
        dataFormat: 'object',
        title: UILANG.m('Change Label'),
        width: 700,
        callback: saveChangedLabel
    };
    window.editLabelDialog = new nxDialog('editLabelDialog', editLabelDialogData);

    //pre-populate input fields with available data
    $.each(serverData.testLevel.labels, function(k, v) {
        if (v.tmpId === clickedId) {
            $('#labelname').val(UILANG.e(k));
            let buttonObj = v.button;
            let headlineObj = v.headline;
            $.each(buttonObj, function(key, value) {
                $('#' + key + '_button').val(value);
            });
            $.each(headlineObj, function(key, value) {
                $('#' + key + '_headline').val(value);
            })
        }
    });

    //Create contextmenu
    $.contextMenu('destroy', '.lblClick');
    $.contextMenu({
        selector: ".lblClick",
        items: {
            headl: {
                name: UILANG.m('Insert code for:'),
                disabled: true,
            },
            "counterAll": {
                name: UILANG.m('Counter current test page : [@counter_total]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@counter_total]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                    editLabelDialog.enableButton('save');
                }
            },
            "totalAll": {
                name: UILANG.m('Count of pages in the test : [@total_total]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@total_total]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                    editLabelDialog.enableButton('save');
                }
            },
            "counterLbl": {
                name: UILANG.m('Counter of the current test page in the labelgroup : [@counter_labelgroup]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@counter_labelgroup]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                    editLabelDialog.enableButton('save');
                }
            },
            "totalLbl": {
                name: UILANG.m('Count of test pages in the labelgroup : [@total_labelgroup]'),
                callback: function() {
                    let lblStrg = $(this).val();
                    let currPos = $(this).getCursorPosition();
                    lblStrg = lblStrg.slice(0, currPos) + "[@total_labelgroup]" + lblStrg.slice(currPos);
                    $(this).val(lblStrg);
                    editLabelDialog.enableButton('save');
                }
            }
        }
    });

    function saveChangedLabel(button, labelDataObject) {
        if (button === 'save') {
            let saveFlag = true;
            $.each(serverData.testLevel.labels, function(k, v) {
                if (k === labelDataObject.labelname && v.tmpId !== clickedId) {
                    showMessage(UILANG.m('The label name') + ' <strong>' + k + '</strong> ' + UILANG.m('already exists. Please use another name!'));
                    saveFlag = false;
                }
            });
            if (saveFlag) {
                $.each(serverData.testLevel.labels, function(k, v) {
                    if (v.tmpId === clickedId) {
                        startAjax('saveLabel', {
                            labelId: k,
                            testId: serverData.testLevel.id,
                            newLabelData: labelDataObject
                        });
                    }
                });
                window.editLabelDialog.dismiss();
            }
        }
    }
}

function resetOverrides() {
    let resetHTML = '<p>' + UILANG.m('Are you sure you want to reset all skin override settings?') + '</p>';
    let resetDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Reset'),
            'default': true,
            disabled: false,
            value: 'reset'
        }],
        contents: resetHTML,
        title: UILANG.m('Reset Skin Override Settings'),
        width: 700,
        callback: resetSkinOverrides,
        icon: "../images/warning.png",
        iconWidth: 64
    };
    window.resetDialog = new nxDialog('resetDialog', resetDialogData);


    function resetSkinOverrides(button) {
        if (button === 'reset') {
            //Write to database
            startAjax('saveSkinAssignment', {
                id: serverData.testLevel.id,
                skinData: serverData.testLevel.skin,
                resetSkinOptions: true
            });
        }
    }
}


/* adding items to tests structure*/
function addItems() {
    let dialogData;
    let testType;
    testType = serverData.testLevel.structure.type;
    if (testType === 'fluid') {
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                value: 'cancel'
            }, {
                label: UILANG.m('Add to selected pool'),
                'default': false,
                disabled: true,
                value: 'add2',
                keepOpen: true
            }, {
                label: UILANG.m('Add to selected pool & close dialog'),
                'default': true,
                disabled: true,
                value: 'add'
            }],
            contents: "<div style='height:550px;' id='IGCHOOSER'></div>",
            title: UILANG.m('Add test pages to testpool structure'),
            width: 950,
            callback: proceeder
        }
    } else {
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                value: 'cancel'
            }, {
                label: UILANG.m('Add to test'),
                'default': false,
                disabled: true,
                value: 'add2',
                keepOpen: true
            }, {
                label: UILANG.m('Add to test & close'),
                'default': true,
                disabled: true,
                value: 'add'
            }],
            contents: "<div style='height:550px;' id='IGCHOOSER'></div>",
            title: UILANG.m('Add test pages to test structure'),
            width: 950,
            callback: proceeder
        };
    }
    window.igBrowser = new nxDialog('addItemsDialog', dialogData);

    gui.extra1 = createFlexSection('IGCHOOSER', 'extra001', 905, 905);
    gui.boxes.tests = createFlexBox(gui.extra1, 'itemChooser', {
        title: UILANG.m('Page Groups'),
        minHeight: 500,
        flex: 1,
        noPadding: true
    });

    $('#itemChooser').append("<table style='border:0px;border-spacing:0px;'><tr><td><div id='igContainer' ></div></td><td style='background:#e8e8e8;'><div id='igContainerToolBar' style=''></div><div id='igPreviewZone' style=''></div></td></tr></table>");
    $('#extra001').css('padding', '0');
    $('#extra001>.jsFlexBox').css('box-shadow', 'none');
    $('#itemChooser').css('overflow', 'hidden');

    //adding search functionality to toolbar
    window.igChooserButtons = {};
    igChooserButtons.searchItemGroups = new jsButton2($('#igContainerToolBar'), 'igBSearch', {
        label: UILANG.m('search'),
        icon: '../images/toolbarIcons/ic_tb_search.png',
        iconWidth: 28,
        width: 60,
        height: 55,
        callback: clickSearchIG,
        disabled: false
    });
    igChooserButtons.selectAllItems = new jsButton2($('#igContainerToolBar'), 'igBSelect', {
        label: UILANG.m('Select all'),
        icon: '../images/selectAll.png',
        iconWidth: 28,
        width: 60,
        height: 55,
        callback: selectItems,
        disabled: true
    });
    igChooserButtons.deSelectAllItems = new jsButton2($('#igContainerToolBar'), 'igBdeSelect', {
        label: UILANG.m('Deselect all'),
        icon: '../images/deSelectAll.png',
        iconWidth: 28,
        width: 60,
        height: 55,
        callback: deSelectItems,
        disabled: true
    });


    //show item groups in a filer
    itembreadcrumbs = [{
        id: 1,
        name: "Home"
    }];

    let itemGroupsOpPermissions = {
        copyFolders: false,
        copyItems: false,
        copyMultiple: false,
        cutFolders: false,
        cutItems: false,
        cutMultiple: false
    };
    gui.library2 = new fileMgr("#igContainer", "_itemGroups", [], itembreadcrumbs, itemGroupsOpPermissions, false, itemGroupLibraryEvent);

    function clickSearchIG() {
        gui.library2.filerSearch();
    }

    function selectItems() {
        $(".unchk").trigger("click");
        igChooserButtons.selectAllItems.disable();
        igChooserButtons.deSelectAllItems.enable();
    }

    function deSelectItems() {
        $(".chk").trigger("click");
        igChooserButtons.deSelectAllItems.disable();
    }

    //get library contents
    startAjax('fetchItemLibrary', {
        location: igLoc.folder
    });

    function itemGroupLibraryEvent(type, data) {
        let rSource;
        rSource = 'structureAdd';
        switch (type) {
            case 'clear':
                $('#igPreviewZone').empty();
                if (igBrowser) {
                    igBrowser.disableButton('add');
                    igBrowser.disableButton('add2');
                }
                break;
            case 'getSelect':
            case 'getSelectKeys':
                if (data.length === 1 && data[0].type !== 'folder') {
                    startAjax('fetchItemsStimuli', {
                        dbId: data[0].dbId,
                        source: rSource
                    });
                    igChooserButtons.deSelectAllItems.disable();
                } else {
                    $('#igPreviewZone').empty();
                    if (igChooserButtons) {
                        igChooserButtons.selectAllItems.disable();
                    }
                    if (igBrowser) {
                        igBrowser.disableButton('add');
                        igBrowser.disableButton('add2');
                    }
                }
                break;
            case 'onNavigate':
                oldLoc = cloneObj(igLoc);
                igLoc.folder = data.dbId;
                startAjax('fetchItemLibrary', {
                    location: igLoc.folder,
                    current: oldLoc
                });
                break;
            case 'onBreadcrumbNavigate':
                oldLoc = cloneObj(igLoc);
                igLoc.folder = data;
                startAjax('fetchItemLibrary', {
                    location: igLoc.folder,
                    current: oldLoc
                });
                break;
            case 'onSearchRequest':
                startAjax('igSearch', {
                    searchString: data
                });
                break;
            case 'onSearchItemClick':
                oldLoc = cloneObj(igLoc);
                igLoc.folder = data.pid.replace(/^\D*/i, '');
                startAjax('fetchItemLibrary', {
                    location: igLoc.folder,
                    select: data.id,
                    current: oldLoc
                });
                break;
        }
    }

    function proceeder(btnClicked) {
        if (itStiSelection && btnClicked !== 'cancel') {
            $.each(itStiSelection, function(k, v) {
                if ($(v).data('id')) {
                    if (testType === 'fluid') {
                        let objInsert = {
                            name: $(v).data('name'),
                            hiddenID: '' + $(v).data('id'),
                            code: $(v).data('code'),
                            itemGroup: $(v).data('igname'),
                            actionButton: {}
                        };
                        gui.poolStructureView.addElement(objInsert, true);
                    } else {
                        let objInsert = {
                            name: $(v).data('name'),
                            hiddenID: '' + $(v).data('id'),
                            code: $(v).data('code'),
                            itemGroup: $(v).data('igname'),
                            maxScore: $(v).data('maxscore'),
                            actionField: {},
                            actionButton: {}
                        };
                        gui.structureView.addElement(objInsert, true);
                    }
                }
            });
            if (testType === 'fluid') {
                gui.poolStructureView.triggerCallback();
            } else {
                gui.structureView.triggerCallback();
            }
        }
    }
}

//add fluid test blocks to test
function addMutationItems() {
    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Add all tests from current folder & close'),
            'default': false,
            disabled: true,
            value: 'addAll'
        }, {
            label: UILANG.m('Add test'),
            'default': false,
            disabled: true,
            value: 'add',
            keepOpen: true
        }, {
            label: UILANG.m('Add test & close'),
            'default': true,
            disabled: true,
            value: 'addClose'
        }],
        contents: "<div style='height:550px;' id='tChooser'></div>",
        title: UILANG.m('Assign test to mutation test'),
        width: 950,
        callback: addTestToStructureList
    };

    window.testsBrowser = new nxDialog('addTestsDialog', dialogData);

    gui.extra1 = createFlexSection('tChooser', 'extra001', 905, 905);
    gui.boxes.tests = createFlexBox(gui.extra1, 'testChooser', {
        title: UILANG.m('Tests'),
        minHeight: 500,
        flex: 1,
        noPadding: true
    });

    $('#testChooser').append("<table style='border:0px;border-spacing:0px;'><tr><td><div id='testsBrowserContainer' ></div></td><td style='background:#e8e8e8;'><div id='testsContainerToolBar' ></div><div id='tMsg'></div><div id='tPreviewZone'></div></td></tr></table>");
    $('#extra001').css('padding', '0');
    $('#extra001>.jsFlexBox').css('box-shadow', 'none');
    $('#testChooser').css('overflow', 'hidden');

    //adding search functionality to toolbar
    window.testsChooserButtons = {};
    testsChooserButtons.searchItemGroups = new jsButton2($('#testsContainerToolBar'), 'testsBSearch', {
        label: UILANG.m('search'),
        icon: '../images/toolbarIcons/ic_tb_search.png',
        iconWidth: 28,
        width: 60,
        height: 55,
        callback: tClickSearch,
        disabled: false
    });

    //show tests in a filer
    testbreadcrumbs = [{
        id: 1,
        name: "Home"
    }];

    const testsOpPermissions = {
        copyFolders: false,
        copyItems: false,
        copyMultiple: false,
        cutFolders: false,
        cutItems: false,
        cutMultiple: false
    };
    gui.library2 = new fileMgr("#testsBrowserContainer", "_tests", [], testbreadcrumbs, testsOpPermissions, false, testsLibraryEvent);

    function tClickSearch() {
        gui.library2.filerSearch();
    }

    //get library contents
    startAjax('fetchTestLibrary', {
        location: tLoc.folder
    });

    function testsLibraryEvent(type, data) {
        let oldtLoc;
        switch (type) {
            case 'clear':
                $('#tPreviewZone').empty();
                $('#tMsg').empty();
                if (testsBrowser) {
                    testsBrowser.disableButton('add');
                    testsBrowser.disableButton('addAll');
                    testsBrowser.disableButton('addClose');
                }
                break;
            case 'getSelect':
            case 'getSelectKeys':
                testSelection = data;
                if (data.length === 1 && data[0].type !== 'folder') {
                    startAjax('fetchLinearTestStructure', {
                        dbId: data[0].dbId
                    });
                    testsBrowser.enableButton('add');
                    testsBrowser.enableButton('addClose');

                } else {
                    $('#tPreviewZone').empty();
                    testsBrowser.disableButton('add');
                    testsBrowser.disableButton('addAll');
                    testsBrowser.disableButton('addClose');
                }
                break;
            case 'onNavigate':
                oldtLoc = cloneObj(tLoc);
                tLoc.folder = data.dbId;
                startAjax('fetchTestLibrary', {
                    location: tLoc.folder,
                    current: oldtLoc
                });
                break;
            case 'onBreadcrumbNavigate':
                oldtLoc = cloneObj(tLoc);
                tLoc.folder = data;
                startAjax('fetchTestLibrary', {
                    location: tLoc.folder,
                    current: oldtLoc
                });
                break;
            case 'onSearchRequest':
                startAjax('testsSearch', {
                    searchString: data
                });
                break;
            case 'onSearchItemClick':
                oldtLoc = cloneObj(tLoc);
                tLoc.folder = data.pid.replace(/^\D*/i, '');
                startAjax('fetchTestLibrary', {
                    location: tLoc.folder,
                    select: data.id,
                    current: oldtLoc
                });
                break;
            case 'getSelectDblclick':
                testsBrowser.dismiss();
                break;
        }
    }

    function addTestToStructureList(btnClicked) {
        if (btnClicked !== 'cancel') {
            let objInsert;
            if (btnClicked === 'addAll') {
                $.each(linTests, function(k, v) {
                    if (v.type === 'test') {
                        objInsert = {
                            name: v.name,
                            id: v.dbId,
                            pages: 0,
                            maxScore: 0,
                            hiddenID: v.dbId,
                            actionButtons: [
                                {
                                    hiddenData: v.dbId,
                                    name: 'viewStructure',
                                    classes: 'testStructView'
                                }
                            ]
                        };
                        gui.mutationStructureView.addElement(objInsert, true);
                    }
                });
            } else {
                let t = testSelection[0];
                objInsert = {
                    name: t.name,
                    id: t.dbId,
                    pages: 0,
                    maxScore: 0,
                    hiddenID: t.dbId,
                    actionButtons: [
                        {
                            hiddenData: t.dbId,
                            name: 'viewStructure',
                            classes: 'testStructView'
                        }
                    ]
                };
                gui.mutationStructureView.addElement(objInsert, true);
            }
            gui.mutationStructureView.triggerCallback();
        }
    }
}

function updateTestLibrary(list, path) {
    if (path) testbreadcrumbs = path;
    gui.library2.setItems(list, testbreadcrumbs);
}

//add fluid test blocks to test
function addFluidItems() {
    chosenPool = {};
    let testPoolsTxt;
    let fluidHtml;
    //Build content
    if (serverData.testLevel.testpools.length > 0) {
        if (serverData.testLevel.testpools.length === 1) {
            testPoolsTxt = UILANG.m('Testpool');
        } else {
            testPoolsTxt = UILANG.m('Testpools');
        }
        fluidHtml = '<div id="fluidContainer"><p>' + UILANG.m('The fluid test') + ' <strong>' + serverData.testLevel.name + '</strong> ' + UILANG.m('has') + ' <strong>' + serverData.testLevel.testpools.length + '</strong> ' + testPoolsTxt + '!</p><div id="cList"></div><div id="poolContentContainer"></div></div>';
    } else {
        fluidHtml = '<div id="fluidContainer"><p>' + UILANG.m('The fluid test') + ' <strong>' + serverData.testLevel.name + '</strong> ' + UILANG.m('has') + ' <strong>0</strong> ' + UILANG.m('testpools. Please create testpools first!') + '</p></div>';
    }

    let fluidDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Add to fluid test'),
            'default': true,
            disabled: true,
            value: 'add'
        }],
        contents: fluidHtml,
        title: UILANG.m('Add fluid block to test:') + ' "' + serverData.testLevel.name + '"',
        width: 700,
        callback: saveFluidBlock
    };
    window.addFluidBlock = new nxDialog('addFluidBlockDialog', fluidDialogData);

    function saveFluidBlock(button) {
        if (button === 'add') {
            startAjax('saveNewFluidBlock', {
                testId: serverData.testLevel.id,
                poolId: chosenPool.poolId,
                itemsUsed: chosenPool.poolItemUsageValue,
                itemsOrder: chosenPool.poolItemOrderValue
            });
        }
    }

    let poolListOptions = {
        onChange: listChosen,
        listTitle: UILANG.m('Please choose a testpool:'),
        noChoiceTitle: UILANG.m('No choices available'),
        dataId: 'tpList',
        readOnly: false,
        width: 660,
        cssCollapsed: {
            'font-size': '14px'
        },
        cssExpanded: {
            'font-size': '14px'
        }
    };

    let testPoolList = new jsDropList('cList', 'testPoolList', poolListOptions);

    $.each(serverData.testLevel.testpools, function(k, v) {
        testPoolList.addElement(v.id, v.name);
    });


    function listChosen(sender, poolId, dirty, dataId) {
        if (poolId !== 'X') {
            testPoolList.removeElements(['X']);
            chosenPool.poolId = poolId;
            //fetch pool data
            startAjax('fetchPoolData', {
                testId: serverData.testLevel.id,
                selectedPool: poolId
            });
        }
    }
}

//modify skin overrides per test item
function editOverrides(testType, clickedId, parentId, sOverridesObj, rowName) {
    let skinOverridesItemHTML = '<div id ="editOverridesDIV"><h3>' + UILANG.m('Change skin settings for:') + ' <span class="soValue">"' + rowName + '"</span></h3><h4>' + UILANG.m('Active skin:') + ' <span class="soValue">"' + serverData.testLevel.skin.skin + '"</span></h4></p><table id="itemSkinOverrides" style="width:97%;border:0px;border-spacing:0px;"></table><br /></div>';
    const dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            'default': true,
            disabled: true,
            value: 'add'
        }],
        contents: skinOverridesItemHTML,
        title: UILANG.m('Skin override settings'),
        width: 820,
        callback: saveOverridesFunc
    };
    window.overridesSaver = new nxDialog('editOverridesDialog', dialogData);

    //Show defaults and settings per item
    let itemSkinOverridesTable = $('#itemSkinOverrides');
    itemSkinOverridesTable.append('<tr><th colspan="2" style="width:50%;">' + UILANG.m('Current skin settings') + '</th><th colspan="2" style="width:50%;">' + UILANG.m('Current settings test page') + '</th></tr>');

    //Defaults
    let sOpts = serverData.testLevel.skin.skinOptions;
    let skinOverridesObj = {};
    let saveOverrides = {};

    if (sOverridesObj !== undefined) {
        saveOverrides = Object.assign({}, sOverridesObj);
    }

    $.each(sOpts, function(key, value) {
        switch (value.type) {
            case 'boolean':
                if (!$.isEmptyObject(sOpts[key].perItem)) {
                    itemSkinOverridesTable.append('<tr><td class="skinDefaultsCell" style="width:35%">' + UILANG.m(value.name) + '</td><td class="skinDefaultsCell" style="width:15%"><img src="../images/' + value.value + '.png" height="18px" /></td><td colspan="2" id="so__' + key + '" style="width:50%"></td></tr>');
                    skinOverridesObj[key] = insertToggleswitch('#so__' + key, 'ts' + key, UILANG.m(sOpts[key].perItem.name), {
                        dataId: key,
                        changeCallback: soChanged
                    });
                    if (key in saveOverrides) {
                        skinOverridesObj[key].reset(saveOverrides[key]);
                    } else {
                        skinOverridesObj[key].reset(value.value);
                    }
                } else {
                    itemSkinOverridesTable.append('<tr><td class="skinDefaultsCell" style="width:35%">' + UILANG.m(value.name) + '</td><td class="skinDefaultsCell" style="width:15%"><img src="../images/' + value.value + '.png" height="18px" /></td><td colspan="2" class="overrideNullCell" style="width:50%">' + UILANG.m('No override allowed for this option!') + '</td></tr>');
                }
                break;
            case 'textstring':
                if (!$.isEmptyObject(sOpts[key].perItem)) {
                    itemSkinOverridesTable.append('<tr><td class="skinDefaultsCell" style="width:30%">' + UILANG.m(value.name) + '</td><td  class="skinDefaultsCell" style="width:20%">' + value.value + '</td><td colspan="2" id="so__' + key + '" style="width:50%"></td></tr>');
                    skinOverridesObj[key] = insertTextfield('#so__' + key, 'ts' + key, UILANG.m(sOpts[key].perItem.name), {
                        dataId: key,
                        width: '168px',
                        onInput: soChanged
                    });
                    if (key in saveOverrides) {
                        skinOverridesObj[key].reset(saveOverrides[key]);
                    } else {
                        skinOverridesObj[key].reset(value.value);
                    }
                } else {
                    itemSkinOverridesTable.append('<tr><td class="skinDefaultsCell" style="width:35%">' + UILANG.m(value.name) + '</td><td class="skinDefaultsCell" style="width:15%">' + value.value + '</td><td colspan="2" class="overrideNullCell" style="width:50%">' + UILANG.m('No override allowed for this option!') + '</td></tr>');
                }
                break;
            case 'intrange':
                if (!$.isEmptyObject(sOpts[key].perItem)) {

                    minMaxTmpValues[key] = sOpts[key].value;

                    if (key in saveOverrides) {
                        let vals = saveOverrides[key].split('...');
                    } else {
                        let vals = value.value.split('...');
                    }
                    itemSkinOverridesTable.append('<tr><td  class="skinDefaultsCell" style="width:30%;">' + UILANG.m(value.name) + '</td><td  class="skinDefaultsCell" style="width:20%">' + vals[0] + ' &rarr; ' + vals[1] + '</td><td id="minRangeContainer" style="width:25%;padding-left:4px;">min:&nbsp;&nbsp;</td><td id="maxRangeContainer" style="width:25%;text-align:right;padding-right:4px;">max:&nbsp;&nbsp;</td></tr>');
                    //create number inputs
                    let minRangeOptions = {
                        onChange: soChanged,
                        height: '20px',
                        width: '60px',
                        initialValue: vals[0],
                        dataId: key,
                        readOnly: false
                    };
                    let maxRangeOptions = {
                        onChange: soChanged,
                        height: '20px',
                        width: '60px',
                        initialValue: vals[1],
                        dataId: key,
                        readOnly: false
                    };
                    let minRangeX = new jsNumberInput('minRangeContainer', 'minRange', minRangeOptions);
                    let maxRangeX = new jsNumberInput('maxRangeContainer', 'maxRange', maxRangeOptions);
                } else {
                    let vals = value.value.split('...');
                    itemSkinOverridesTable.append('<tr><td  class="skinDefaultsCell" style="width:30%;">' + UILANG.m(value.name) + '</td><td  class="skinDefaultsCell" style="width:20%">' + vals[0] + ' &rarr; ' + vals[1] + '</td><td colspan="2" class="overrideNullCell" style="width:50%">' + UILANG.m('No override allowed for this option!') + '</td></tr>');
                }
                break;
            case 'color':
                if (!$.isEmptyObject(sOpts[key].perItem)) {
                    itemSkinOverridesTable.append('<tr><td  class="skinDefaultsCell" style="width:30%">' + UILANG.m(value.name) + '</td><td  class="skinDefaultsCell" style="width:20%">' + value.value + '&nbsp;<span style="border:1px solid #7b7b7b;background-color:' + value.value + ';">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></td><td colspan="2" id="so__' + key + '" style="width:50%"></td></tr>');
                    skinOverridesObj[key] = insertLink('#so__' + key, 'ts' + key, UILANG.m(sOpts[key].perItem.name), {
                        dataId: key,
                        type: 'color',
                        color: true,
                        appendPickerTo: '#veil_editOverridesDialog',
                        onClick: soChanged
                    });
                    if (key in saveOverrides) {
                        skinOverridesObj[key].reset(saveOverrides[key]);
                    } else {
                        skinOverridesObj[key].reset(value.value);
                    }
                } else {
                    itemSkinOverridesTable.append('<tr><td  class="skinDefaultsCell" style="width:30%">' + UILANG.m(value.name) + '</td><td  class="skinDefaultsCell" style="width:20%">' + value.value + '&nbsp;<span style="border:1px solid #7b7b7b;background-color:' + value.value + ';">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></td><td colspan="2" class="overrideNullCell" style="width:50%">' + UILANG.m('No override allowed for this option!') + '</td></tr>');
                }
                break;
        }
    });

    function soChanged(sender, value, dirty, dataId, type) {
        overridesSaver.enableButton('add');
        if (sender === 'minRange' || sender === 'maxRange') {
            let vals = minMaxTmpValues[dataId].split('...');
            switch (sender) {
                case 'minRange':
                    value = value + '...' + vals[1];
                    break;
                case 'maxRange':
                    value = vals[0] + '...' + value;
                    break;
            }
            minMaxTmpValues[dataId] = value;
        }
        if (type === 'color') {
            skinOverridesObj[dataId].reset(value);
        }
        if (sOpts[dataId].value !== value) {
            saveOverrides[dataId] = value;
        } else {
            delete saveOverrides[dataId];
        }
    }

    function saveOverridesFunc(btnClicked) {
        if (btnClicked === 'add') {
            if (testType === 'fluid') {
                gui.fluidStructureView.updateHiddenData(clickedId, saveOverrides, true)
            } else {
                gui.structureView.updateHiddenData(clickedId, saveOverrides, true)
            }
        }
    }
}

//change label of test item
function changeLabel(testType, clickedId, parentId, hiddenData, rowName) {
    changesLabel = {};
    changesLabel.parentId = parentId;
    changesLabel.testType = testType;
    let labelHTML = '<div id="labelContainer"><p>' + UILANG.m('Current label assigned:') + ' <strong>' + hiddenData + '</strong><br/>' + Object.keys(serverData.testLevel.labels).length + ' ' + UILANG.m('labels found for test') + ' "' + serverData.testLevel.name + '"</p><div id="lList"></div><div id="labelContentContainer"></div></div>';

    let labelDialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            'cancel': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Assign label'),
            'default': true,
            disabled: true,
            value: 'assign'
        }],
        contents: labelHTML,
        title: UILANG.m('Assign label'),
        width: 700,
        callback: saveLabelChange
    };
    window.changeLabelDialog = new nxDialog('changeLabelDialog', labelDialogData);

    function saveLabelChange(button) {
        if (button === 'assign') {
            switch (changesLabel.testType) {
                case 'linear':
                    gui.structureView.changetdid(changesLabel.parentId, changesLabel.labelId, changesLabel.saveOption);
                    gui.structureView.triggerCallback();
                    break;
                case 'fluid':
                    gui.fluidStructureView.changetdid(changesLabel.parentId, changesLabel.labelId, changesLabel.saveOption);
                    gui.fluidStructureView.triggerCallback();
                    break;
            }
        }
    }

    let labelListOptions = {
        onChange: labelSelected,
        listTitle: UILANG.m('Please choose a label:'),
        noChoiceTitle: UILANG.m('No choices available'),
        dataId: 'labelList',
        width: 660,
        readOnly: false,
        cssCollapsed: {
            'font-size': '14px'
        },
        cssExpanded: {
            'font-size': '14px'
        }
    };

    let labelList = new jsDropList('lList', 'labelList', labelListOptions);

    $.each(serverData.testLevel.labels, function(k, v) {
        labelList.addElement(k, k);
    });


    function labelSelected(sender, labelId, dirty, dataId) {
        if (labelId !== 'X') {
            labelList.removeElements(['X']);
            changesLabel.labelId = labelId;
            let lCont = $('#labelContentContainer');
            lCont.empty();
            lCont.append(changeLabelsDisplayHTML);
            let labelOptC = $('#optContainerLabel');
            let labelListC = $('#labContainer');
            //Create Options for assigning labels to test items
            changeLabelDialog.enableButton('assign');
            labelOptC.append('<br /><div class="divMain">' + UILANG.m('Assign chosen label to:') + '<div  class="divSub" id="labelChangeOptionsDiv"</div></div><br /><br />');
            let labelOptions = {
                onChange: labelOptionChanged,
                initialValue: 'current',
                elements: [{
                    value: 'current',
                    label: UILANG.m('current test page only')
                }, {
                    value: 'all',
                    label: UILANG.m('all test pages'),
                }, {
                    value: 'allsame',
                    label: UILANG.m('all test pages with same label'),
                }, {
                    value: 'alldifferent',
                    label: UILANG.m('all test pages with different label')
                }],
                dataId: 'lio',
                readOnly: false,
                width: 300,
                cssCollapsed: {
                    'font-size': '14px'
                },
                cssExpanded: {
                    'font-size': '14px'
                }
            };
            let labelOption = new jsDropList('labelChangeOptionsDiv', 'labelOpt', labelOptions);
            changesLabel.saveOption = 'current';

            labelListC.append('<h3>' + UILANG.m('Label-Content:') + '</h3>');
            labelListC.append('<table id="labelExampleTable" style="margin-bottom:0px;border:1px solid #ccc;background-color:#fff;padding:3px;width:660px;border:0px;border-spacing:0px;"></table>');
            let labelExampleTable = $('#labelExampleTable');

            let htmlHeadLabelExample = '<tr style="background-color:#EEE;border-top:1px solid #ccc;"><th>' + UILANG.m('Language') + '</th><th>' + UILANG.m('Button') + '</th><th>' + UILANG.m('Headline') + '</th></tr>';
            labelExampleTable.append(htmlHeadLabelExample);

            //Build data
            let btnJson, headlineJson;
            $.each(serverData.testLevel.labels, function(k, v) {
                if (k === labelId) {
                    btnJson = v.button;
                    headlineJson = v.headline;
                }
            });

            $.each(languages, function(k, v) {
                let html = sf("<tr style='border-bottom:1px dotted #ccc;'><td style='width:10%;padding:3px;'>%@</td><td style='width:20%;padding:3px;'>%@</td><td style='width:70%;padding:3px;'>%@</td></tr>", k, btnJson[k], headlineJson[k]);
                labelExampleTable.append(html);
            });
            $('#labelExampleTable td').addClass('lowerFontSize');
        }
    }
}

/* navigation */
function cursorUp() {
    switch (mode) {
        case 'browsing':
            gui.library.filerKeyUp();
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

/* preview */
function preview() {
    //block preview when structure has deleted content or is empty
    let removedItems = false;
    let structure = serverData.testLevel.structure;

    if (!structure.items || Object.keys(structure.items).length === 0) {
        removedItems = true;
    } else {
        for (let key in structure.items) {
            if (structure.items[key].removed === true) {
                removedItems = true;
                break;
            }
        }
    }
    if(removedItems){
        showMessage(UILANG.m('The preview cannot be launched because the test structure is either empty or contains deleted pages or pools. Please review and update the structure.'));
    } else {
        if (mode !== 'browsing') {
         startAjax('saveTest', {
             id: serverData.testLevel.id,
             options: serverData.testLevel.options,
             currentSkin: serverData.testLevel.skin.skin,
             startPreview: true
         });
     } else {
         preview_step2();
     }
    }
}

function preview_step2() {
    let pForm = document.forms['previewForm'];
    pForm.action.value = 'preview';
    let data = {
        previewMode: 'test',
        testId: serverData.testLevel.id
    };
    pForm.data.value = JSON.stringify(data);
    pForm.submit();
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
        animationPlaying = true;
        jsph.forceHoverUpdates(true);
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
                animationPlaying = true;
                jsph.forceHoverUpdates(true);
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
                animationPlaying = true;
                jsph.forceHoverUpdates(true);
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

async function showDialog(id, dialogData) {
    let res = await new nxDialog(id, dialogData);
    return res;
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

/* general helper functions */
function escapeHtml(str) {
    if (str && isNaN(str)) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    } else {
        return str;
    }
}

function time2Secs(time) {
    let a = time.split(':');
    let seconds = a[0] * 3600 + a[1] * 60;
    return seconds;
}

function secs2Time(secs) {
    return new Date(secs * 1000).toISOString().substring(11, 16);
}

let getObjectSize = function(obj) {
    let len = 0,
        key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) len++;
    }
    return len;
};

function showMessage(msg, type) {
    let imgUrl, title;
    if (!type || type === 'error') {
        imgUrl = "../images/error.png";
        title = UILANG.m('Error');
    } else {
        imgUrl = "../images/warning.png";
        title = UILANG.m('Warning');
    }
    const dialogData = {
        buttons: [{
            label: UILANG.m('OK'),
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: msg,
        width: 500,
        title: title,
        icon: imgUrl,
        iconWidth: 64
    };
    new nxDialog('Message', dialogData);
}

function switchMessage(tbCount) {
    if (tbCount === 1) {
        $(testpoolsTbText).html(tbCount + ' testpool');
    } else {
        $(testpoolsTbText).html(tbCount + ' testpools');
    }
    if (tbCount > 0) {
        $(inactiveMsg).html('<h3 style="text-align:center;color:#AAA;">' + UILANG.m('Please select a testpool to show assigned test pages!') + '</h3>');
    } else {
        $(inactiveMsg).html('<h3 style="text-align:center;color:#AAA;">' + UILANG.m('Please create a testpool first!') + '</h3>');
    }
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

let uniqueId = function() {
    return 'id-' + Math.random().toString(36).substring(2, 18);
};

/* server communication */
async function startAjax(action, data) {
    waitDialog.show();
    let params = {
        action: action,
        data: JSON.stringify(data)
    };
    return $.ajax({
        data: params
    });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();
    if (jqXHR.responseJSON !== undefined) {
        const dialogData = {
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
}

function itemUsageChanged(sender, itemUsage, dirty, dataId) {
    chosenPool.poolItemUsageValue = itemUsage;
}

function itemOrderOptionChanged(sender, itemOrder, dirty, dataId) {
    chosenPool.poolItemOrderValue = itemOrder;
}

function labelOptionChanged(sender, saveOption, dirty, dataId) {
    changesLabel.saveOption = saveOption;
}


/* adding meta tags */
function addMetaTag() {
    addMetaTagFunc('editMode');
}

function addMetaTagFunc(sender, button, mkey, mvalue) {

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
            mandatory: ['dialogField1', 'dialogField2'],
            focus: 'dialogField1',
            contents: '<p>' + UILANG.m('Please enter a new meta tag for the test.') + '<br /><br />' + UILANG.m('Meta-key (e.g. "Subject"):') + '<br /><input class="dfs" type="text" maxlength="200" id="dialogField1" style="width: 100%; margin-top: 10px;"><br /><br />' + UILANG.m('Meta-value (e.g. "Mathematics"):') + '<br /><input class="dfs" type="text" id="dialogField2" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('New meta-tag'),
            width: 400,
            callback: addMetaTagFunc
        };
        new nxDialog('newMetaDialog', dialogData, arguments);
    }
    if (button === 'ok') {
        //Save new meta tag to db
        let mtags = serverData.testLevel.metatags;
        if (mkey in mtags) {
            const dialogData2 = {
                buttons: [{
                    label: 'Cancel',
                    'cancel': true,
                    'default': true,
                    value: 'cancel'
                }, {
                    label: 'Overwrite',
                    value: 'ok'
                }],
                contents: '<p>A meta tag with the key "' + mkey + '" already exists. The current value is "' + mtags[mkey] + '". <br />Do you want to overwrite it with "' + mvalue + '"?</p>',
                title: 'Warning',
                width: 500,
                icon: "../images/warning.png",
                iconWidth: 64,
                callback: writeMetaTag
            };
            let args = [];
            args.push(selection[0].dbId);
            args.push(mkey);
            args.push(mvalue);
            new nxDialog('newMetaWarning', dialogData2, args);
        } else {
            writeMetaTag(selection[0].dbId, mkey, mvalue);
        }
    }

    function writeMetaTag(test, mkey, mvalue, button) {
        if (button === 'cancel') return;
        startAjax('newMetaTag', {
            test: test,
            mkey: mkey,
            mvalue: mvalue
        });
    }
}

function metaChanged(deleted, id, currValue, dirty, dataId) {
    let helperObj = {};
    $.each(currValue, function(k, v) {
        helperObj[v.metakey] = v.metavalue;
    });
    startAjax('saveMetaTagsChange', {
        metaStructure: helperObj,
        testId: serverData.testLevel.id
    });
}

function ajaxSuccess(res) {
    if ("isSuper" in res) window.isSuper = res.isSuper; // check for superadmin level status
    if ("isAdmin" in res) window.isAdmin = res.isAdmin; // check for admin level status
    $('#un_val').html(res.loggedInName);

    waitDialog.hide();
    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    if (res.fatalError) {
        const dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError,
            title: UILANG.m('Error'),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        if (!$('#veil_error').length) new nxDialog('fatalError', dialogData);
        return;
    }
    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error !== false) {
        //FYI: required for permission compatibility BEGIN

        if (res.action.includes(['moveObjects', 'duplicateObjects'])) {
            gui.library.clearClipboard();
        }
        // if the error is from fetchTestLibrary, we need to reset the test folder target back to home (1)
        if (res.action === 'fetchTestLibrary') tLoc.folder = 1;

        // dismiss the edit permission dialog prior to launching the error msg to show
        if (res.action === "fetchIgPerm") {
            // close the edit perm user dialog
            editPermDialog.dismiss();

            // remove key capture handler initiated by editPermDialog
            $(document).off("keydown");
            $(document).off("keyup");
        }

        //FYI: required for permission compatibility END

        let dialogData;
        if (res.locData) {
            dialogData = {
                buttons: [{
                    label: UILANG.m('OK'),
                    'default': true,
                    cancel: true,
                    value: 'ok'
                }],
                contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error,
                title: UILANG.m('Error'),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500,
                callback: reOpenCreateForm
            };
        } else {
            dialogData = {
                buttons: [{
                    label: UILANG.m('OK'),
                    'default': true,
                    cancel: true,
                    value: 'ok'
                }],
                contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error,
                title: UILANG.m('Error'),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500,
                callback: function() {
                    if (res.forceLoginRedirect) {
                        window.location = 'index.php';
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
            };
        }
        if (!$('#veil_error').length) new nxDialog('error', dialogData);
        if (res.closeEditMode) {
            abortEditing('error');
        }
        if (res.closeNxdPoolchooser) {
            window.addFluidBlock.dismiss();
        }
        if (res.labelDeleteDefaultError) {
            serverData.testLevel.labels = res.labels;
            if (res.labels.length === 1) {
                $('#labelTbText').html(res.labels.length + UILANG.m(' label for your test pages'));
            } else {
                $('#labelTbText').html(res.labels.length + UILANG.m(' labels for your test pages'));
            }
            listLabels();
        }

        return;
    }

    function reOpenCreateForm(button) {
        if (res.forceLoginRedirect) {
            window.location = 'index.php';
        }

        if (button === 'ok') {
            addVariable(res.locData);
        }
    }

    let stWarnings;
    let checkLangs;
    let timerActive;
    let varLength;
    let pbCheck;
    let pbCheckHtml;
    let labelErr;
    let labelErrors;

    switch (res.action) {
        case 'deleteSelection':
            gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
            //fallthrough
        case 'fetchLibrary':
            if (!isSuper && !isAdmin) {
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
            //deliberate fallthrough
        case 'renameTestOrFolder':
        case 'moveObjects':
        case 'duplicateObjects':
            window.permList = res.permList; // used for selective button enabling
            setLibPerms();
            if (res.poolError) {
                showMessage(UILANG.m('One or more of the duplicated tests contained deleted testpools. They have not been copied to the new test(s)!'));
            }
            loc.folder = res.data.loc;
            loc.path = res.data.path;
            updateLibrary(res.data.list, res.data.path);
            if (res.data.select) {
                gui.library.setSelection([{
                    id: res.data.select
                }]);
            }
            break;
        case 'resetResults':
            gui.statusBar.setStatus(UILANG.m('Results successfully deleted!'), 3000, '#0A0');
            startAjax('fetchLibrary', {
                location: loc.folder,
                select: selection[0].id
            });
            break;
        case 'fetchPreSelect':
            let selected = res.preFix + res.data.id;
            startAjax('fetchLibrary', {
                location: res.data.parent,
                select: selected
            });
            break;
        case 'checkTest':
            editSelectionAfterCheck();
            break;
        case 'fetchItemLibrary':
            igLoc.path = res.data.path;
            updateIgLibrary(res.data.list, res.data.path);
            if (res.data.select) {
                gui.library2.setSelection([{
                    id: res.data.select
                }]);
                gui.library2.getSelect();
            }
            break;
        case 'fetchItemsStimuli':
            $('#igPreviewZone').empty();
            igBrowser.disableButton('add');
            igBrowser.disableButton('add2');
            itemsDisplayHTML = "<h4 class='igPreviewZoneTitle'>" + UILANG.m('Please select what you like to add to the test! Pages defined as stimulus are marked as such.') + "</h4><h4 class='igTableTitle'>" + UILANG.m('Available pages:') + "</h4><br /><table id='itemsDisplayTable'></table><br />";
            $('#igPreviewZone').append(itemsDisplayHTML);
            let htmlHead = '<tr class="igHeads" style="background-color:#EEE;"><th>' + UILANG.m('Name') + '</th><th>' + UILANG.m('code') + '</th><th>' + UILANG.m('P') + '</th><th></th></tr>';
            $('#stimuDisplayTable').append(htmlHead);
            $('#itemsDisplayTable').append(htmlHead);
            $.each(res['data'], function(key, value) {
                let html = sf("<tr id='itstim__%@' style='border-bottom:1px dotted #ccc;'><td style='width:66%;padding:3px;'>%@</td><td style='width:21%;padding:3px;'>%@</td><td style='width:7%;padding:3px;'>%@</td><td style='width:6%;padding:3px;'><img style='float:left;' src='../inc/filer/images/unchecked_checkbox.png' id='igChk%@' class='unchk' data-id='%@' data-code='%@' data-maxscore='%@' data-name='%@' data-igname='%@' /></td></tr>", value.id, escapeHtml(value.name), escapeHtml(value.itemCode), value.maxScore, value.id, value.id, value.itemCode, value.maxScore, value.name, value.igName);
                //Test Pages
                $('#itemsDisplayTable').append(html);
                $("#itstim__" + value.id).attr('data-role', 'item');
                $("#igChk" + value.id).attr('data-role', 'item');

                $("#itstim__" + value.id + ">td").css('cursor', 'pointer');
                $("#igChk" + value.id).css('cursor', 'pointer');

                if(value.stimulus === 1)$("#itstim__" + value.id).find("td:first").append("<span class='stimFlag'> Stimulus</span>");

                $("#itstim__" + value.id + ">td").on("click dblclick", function(e) {
                    if (e.type === 'click') {
                        if ($("#igChk" + value.id + "").hasClass('chk')) {
                            $("#igChk" + value.id + "").removeClass('chk');
                            $("#igChk" + value.id + "").addClass('unchk');
                            $("#itstim__" + value.id).removeClass('itStiChecked');
                            $("#itstim__" + value.id + ">td").css('background-color', 'transparent');
                            $("#igChk" + value.id + "").attr('src', '.././inc/filer/images/unchecked_checkbox.png');
                        } else {
                            $("#igChk" + value.id + "").addClass('chk');
                            $("#igChk" + value.id + "").removeClass('unchk');
                            $("#itstim__" + value.id).addClass('itStiChecked');
                            $("#itstim__" + value.id + ">td").css('background-color', '#e6e6e6');
                            $("#igChk" + value.id + "").attr('src', '.././inc/filer/images/checked_checkbox.png');
                        }
                    } else if (e.type === 'dblclick') {
                        $("#igChk" + value.id + "").addClass('chk');
                        $("#igChk" + value.id + "").removeClass('unchk');
                        $("#itstim__" + value.id).addClass('itStiChecked');
                        $("#itstim__" + value.id + ">td").css('background-color', '#e6e6e6');
                        $("#igChk" + value.id + "").attr('src', '.././inc/filer/images/checked_checkbox.png');
                    }
                    if ($('.itStiChecked').length === 0) {
                        igBrowser.disableButton('add');
                        igBrowser.disableButton('add2');
                    } else {
                        igBrowser.enableButton('add');
                        igBrowser.enableButton('add2');
                    }
                    itStiSelection = $('.chk');
                    if ($("img[data-role='item'].chk").length === $("tr[data-role='item']").length) {
                        igChooserButtons.selectAllItems.disable();
                    } else {
                        igChooserButtons.selectAllItems.enable();
                    }
                    if ($("img[data-role='item'].chk").length > 0) {
                        igChooserButtons.deSelectAllItems.enable();
                    } else {
                        igChooserButtons.deSelectAllItems.disable();
                    }
                    if (e.type === 'dblclick') igBrowser.dismiss();
                });
            });
            if ($("tr[data-role='item']").length === 0) {
                $('#itemsDisplayTable').empty();
                $('#itemsDisplayTable').append('<td class ="itemsDisplayTableMissingMessage">' + UILANG.m('This page group has no test pages!') + '</td>');
            }
            if ($("tr[data-role='item']").length > 0) {
                igChooserButtons.selectAllItems.enable();
            } else {
                igChooserButtons.selectAllItems.disable();
            }
            break;
        case 'newFolder':
        case 'newTest':
            window.permList = res.permList; // used for selective button enabling
            setLibPerms();
            updateLibrary(res.data.list, res.data.path);
            gui.library.setSelection([{
                id: res.data.id
            }]);
            firstRun = true;
            gui.library.getSelect();
            break;
        case 'fetchTestLibrary':
            tLoc.path = res.data.path;
            linTests = res.data.list;
            updateTestLibrary(res.data.list, res.data.path);
            if (res.data.select) {
                gui.library2.setSelection([{
                    id: res.data.select
                }]);
                gui.library2.getSelect();
            }
            if (res.tCounts > 0) {
                testsBrowser.enableButton('addAll');
            } else {
                testsBrowser.disableButton('addAll');
            }
            $('#tMsg').empty();
            $('#tMsg').append(testCountDisplayHTML);
            $('#presMsg').html('<h4>' + UILANG.m('Number of linear tests in the current directory: ') + res.tCounts + '</h4>');
            break;
        case 'fetchLinearTestStructure':
            if (res.subTestView) {
                viewSubTestDialog(res.data);
            } else {
                $('#tPreviewZone').empty();
                $('#tPreviewZone').append(testStructureDisplayHTML);
                $('#testID').html('<div class="tm_linear">' + UILANG.m('linear test') + '<br />ID: ' + res.data.id + '</div>');
                $('#testStrucDisplayHTML').append("<tr style='background-color:#ddd;border-bottom:1px solid #bbb;'><th style='width:262px'>" + UILANG.m('Name test page') + "</th><th style='width:102px'>" + UILANG.m('Code') + "</th></tr>");
                $.each(res.data.structure.items, function(key, value) {
                    let html;
                    if (value.name === 'Invalid test page!') {
                        //L10Ncheck: UILANG.m('Invalid test page!')
                        html = sf("<tr style='border-bottom:1px dotted #ccc;'><td style='color:#DD1A00;'>%@</td><td>%@</td></tr>", UILANG.m(value.name), value.code);
                    } else {
                        html = sf("<tr style='border-bottom:1px dotted #ccc;'><td>%@</td><td>%@</td></tr>", UILANG.e(value.name), value.code);
                    }
                    $('#testStrucDisplayHTML').append(html);
                })
            }
            break;
        case 'testsSearch':
            if (res.data.list.length > 0) {
                gui.library2.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library2);
            }
            break;
        case 'newTestpool':
            gui.statusBar.setStatus(UILANG.m('Testpool saved!'), 3000, '#0A0');
            switchMessage(res.testpools.length);
            serverData.testLevel.testpools = res.testpools;
            gui.testpools.setItems(res.testpools);
            gui.testpools.setSelection([res.id]);
            selectionChanged(gui.testpools.getSelection());
            break;
        case 'editTestpool':
            gui.statusBar.setStatus('Changes saved!', 3000, '#0A0');
            switchMessage(res.testpools.length);
            serverData.testLevel.testpools = res.testpools;
            gui.testpools.setItems(res.testpools);
            gui.testpools.setSelection([res.id]);
            selectionChanged(gui.testpools.getSelection());
            break;
        case 'deleteTestpool':
            gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
            switchMessage(res.testpools.length);
            serverData.testLevel.testpools = res.testpools;
            gui.testpools.setItems(res.testpools);
            selectionChanged(gui.testpools.getSelection());
            break;
        case 'fetchPoolData':
            let pCont = $('#poolContentContainer');
            pCont.empty();
            pCont.append(itemsDisplayPoolsHTML);
            let optC = $('#optContainer');
            let igListC = $('#igListContainer');

            if (res.data.structure.items.length === 0) {
                optC.append('<br />The testpool <strong>"' + res.data.name + '"</strong> ' + UILANG.m('has no test pages assigned. Please use the testpool-editor to add test pages to the testpool!') + '<br />');
                addFluidBlock.disableButton('add');
            } else {
                //Create Options
                addFluidBlock.enableButton('add');
                optC.append('<h4>' + res.data.structure.items.length + ' ' + UILANG.m('elements found in testpool') + ' "' + res.data.name + '"</h4>');
                optC.append('<div class="divMain"><div class="dmText">' + UILANG.m('Number of test pages of this testpool to be used?') + '</div><div  class="divSub" id="itemUsageDroplistDiv"</div></div><br />');
                optC.append('<div class="divMain"><div class="dmText">' + UILANG.m('Use test pages in random order or as defined in the testpool?') + '</div><div class="divSub" id="itemOrderDiv"</div></div><br />');

                let poolItemUsageOptions = {
                    onChange: itemUsageChanged,
                    initialValue: res.data.structure.items.length,
                    elements: [{
                        value: res.data.structure.items.length,
                        label: UILANG.m('Use all') + ' (' + res.data.structure.items.length + ')'
                    }],
                    dataId: 'piu',
                    readOnly: false,
                    width: 185
                };
                let poolItemUsage = new jsDropList('itemUsageDroplistDiv', 'itemUsageOptions', poolItemUsageOptions);
                chosenPool.poolItemUsageValue = res.data.structure.items.length;
                for (let i = res.data.structure.items.length - 1; i > 0; i--) {
                    poolItemUsage.addElement(i, i);
                }
                let poolItemOrderOptions = {
                    onChange: itemOrderOptionChanged,
                    initialValue: 'poolorder',
                    elements: [{
                        value: 'poolorder',
                        label: UILANG.m('As defined')
                    }, {
                        value: 'random',
                        label: UILANG.m('Random')
                    }],
                    dataId: 'pio',
                    readOnly: false,
                    width: 185
                };
                let poolItemOrder = new jsDropList('itemOrderDiv', 'itemOrder', poolItemOrderOptions);
                chosenPool.poolItemOrderValue = 'poolorder';
                //Create testpool content view
                igListC.append('<table id="stimuPoolDisplayTable" style="margin-bottom:0px;border:1px solid #ccc;background-color:#fff;padding:3px;width:660px;border:0px;border-spacing:0px;"></table>');
                let stiPoTable = $('#stimuPoolDisplayTable');

                let htmlHead = '<tr style="background-color:#EEE;border-top:1px solid #ccc;"><th>' + UILANG.m('Test page') + '</th><th>' + UILANG.m('Code') + '</th><th>' + UILANG.m('Page group') + '</th></tr>';
                stiPoTable.append(htmlHead);

                $.each(res['data']['structure']['items'], function(key, value) {
                    let html = sf("<tr style='border-bottom:1px dotted #ccc;'><td style='width:40%;padding:3px;'>%@</td><td style='width:30%;padding:3px;'>%@</td><td style='width:30%;padding:3px;'>%@</td></tr>", value.name, value.code, value.itemGroup);
                    stiPoTable.append(html);
                });
                $('#stimuPoolDisplayTable td').addClass('lowerFontSize');
            }
            break;
        case 'saveTestFolder':
            if (res.warning) {
                showMessage(res.warning);
            }
            let libData = {
                id: 'f' + res.data.id,
                dbId: res.data.id,
                pid: 'f' + res.data.parent,
                type: 'folder',
                code: '',
                name: res.data.name,
                label: res.data.name,
                sortKey: '00_' + res.data.name
            };
            gui.library.updateItem([libData]);
            serverData.testLevel = res.data;
            fillDataFields();
            break;
        case 'saveTest':
        case 'saveSkinAssignment':
        case 'saveFluidPoolOrder':
        case 'saveFluidPageUsage':
            if (res.startPreview) {
                /*  if the save routine was automatically triggered by the preview, we need to start the preview after
                    saving is done. In that case no need to do a fetchTest, as the editor is still up to date. */
                preview_step2();
            } else {
                startAjax('fetchTest', {
                    dbId: serverData.testLevel.id,
                    location: loc.folder,
                    preSelect: true,
                    defaultSkin: settings['skin']
                });
            }
            break;
        case 'saveMetaTagsChange':
            serverData.testLevel.metatags = res.meta;
            correctData();
            fillDataFields('editTest');
            break;
        case 'newMetaTag':
            serverData.testLevel.metatags = res.meta;
            correctData();
            fillDataFields('editTest');
            break;
        case 'fetchTest':
            serverData.testLevel = res.data;
            serverData.testLevel.testpools = res.testpools;
            serverData.testLevel.labels = res.labels;
            serverData.testLevel.activityData = res.activityData;
            serverData.testLevel.scoring = res.scoring;
            languageFallbacks = res.languageFallbacks.reduce((acc, item) => {
                acc[item.langcode] = item.fallback;
                return acc;
            }, {});
            if (res.select) {
                gui.library.setSelection([{
                    id: res.select
                }], true);
            }
            if (res.hasOwnProperty('testpools')) switchMessage(res.testpools.length);
            correctData();
            fillDataFields('editTest');
            if (editOnData) {
                editSelection('dblclick');
            }
            $('#propertiesTbID').html(res.data.id);
            if (serverData.testLevel.structure.type === 'mutation') {
                if (res.data.structure.items.length === 1) {
                    $(mutationStructureTbText).html(res.data.structure.items.length + UILANG.m(' test in your mutation test'));
                } else {
                    $(mutationStructureTbText).html(res.data.structure.items.length + UILANG.m(' tests in your mutation test'));
                }
            }
            if (serverData.testLevel.structure.type !== 'mutation') {
                let labelLength = getObjectSize(serverData.testLevel.labels);
                if (labelLength === 1) {
                    $('#labelTbText').html(labelLength + UILANG.m(' label for your test pages'));
                } else {
                    $('#labelTbText').html(labelLength + UILANG.m(' labels for your test pages'));
                }

                varLength = getObjectSize(serverData.testLevel.variables);
                if (varLength === 1) {
                    $('#variablesTbText').html(varLength + UILANG.m(' variable for your test found'));
                } else {
                    $('#variablesTbText').html(varLength + UILANG.m(' variables for your test found'));
                }

                if (serverData.testLevel.structure.type === 'fluid') {
                    if (res.data.structure.items.length === 1) {
                        $(fluidStructureTbText).html(res.data.structure.items.length + UILANG.m(' fluid test block in your test'));
                    } else {
                        $(fluidStructureTbText).html(res.data.structure.items.length + UILANG.m(' fluid test blocks in your test'));
                    }
                } else {
                    let msTotal = 0;
                    $.each(res.scoring, function(k, v) {
                        msTotal += v;
                    });
                    let ptsString = msTotal === 1 ? UILANG.m('</span> point') : UILANG.m('</span> points');
                    $(structureTbText).html(UILANG.m('Maximum achievable score: <span id="scoringPts">') + msTotal + ptsString);
                }
                quickCheck();
                if (res.skinChanged2Default) {
                    let skinChangeMsg = {
                        buttons: [{
                            label: UILANG.m('Close'),
                            'default': true,
                            disabled: false,
                            value: 'ok'
                        }],
                        contents: '<p>' + UILANG.m('skin_reset') + '</p>',
                        title: UILANG.m('Notice automatic skin change'),
                        icon: "../images/warning.png",
                        iconWidth: 64,
                        width: 500
                    };
                    new nxDialog('skinChangeMessage', skinChangeMsg);
                }
                if (res.acl) {
                    if (serverData.testLevel.structure.type === 'fluid') {
                        gui.fluidStructureView.triggerCallback();
                    } else {
                        gui.structureView.triggerCallback();
                    }
                    if ($("#aclHTML").length === 0) {
                        $('body').append('<div id="aclHTML" style="display:none;">' + UILANG.m('The following test pages have been set to the default label, because the assigned label has been deleted:') + '<br /><br /><table id="aclMsgTable" style="margin-bottom:0px;border:1px solid #ccc;background-color:#fff;padding:3px;width:100%;border:0px;border-spacing:0px;"><tr><th style="background-color:#EEE;border-top:1px solid #ccc;">' + UILANG.m('Modified test page') + '</th></tr></table></div>');
                    }
                    let aclMsgDataTable = $('#aclMsgTable');
                    $.each(res.acldata, function(key, value) {
                        aclMsgDataTable.append('<tr style="border-bottom:1px dotted #ccc;"><td style="padding:3px;">' + value.name + '</td></tr>');
                    });
                    $('#aclMsgDataTable td').addClass('lowerFontSize');
                    let aclMsg = {
                        buttons: [{
                            label: UILANG.m('Close'),
                            'default': true,
                            disabled: false,
                            value: 'ok'
                        }],
                        contentId: 'aclHTML',
                        title: UILANG.m('Notice automatic label change'),
                        icon: "../images/warning.png",
                        iconWidth: 64,
                        width: 500
                    };
                    new nxDialog('aclMessage', aclMsg);
                }
            }
            break;
        case 'saveNewFluidBlock':
        case 'updateFluidBlocks':
            startAjax('fetchTest', {
                dbId: selection[0].dbId,
                location: loc.folder,
                defaultSkin: settings['skin']
            });
            break;
        case 'updateLabels':
        case 'setDefaultLabel':
        case 'createLabel':
        case 'saveLabel':
            serverData.testLevel.labels = res.labels;
            listLabels();
            break;
        case 'saveLocChanges':
        case 'createNewVariable':
        case 'deleteVariable':
            serverData.testLevel.variables = res.refreshData;
            varLength = getObjectSize(serverData.testLevel.variables);
            if (varLength === 1) {
                $('#variablesTbText').html(varLength + UILANG.m(' variable for your test found'));
            } else {
                $('#variablesTbText').html(varLength + UILANG.m(' variables for your test found'));
            }
            listVariables();
            break;
        case 'fetchTestsAssigned':
            let poolItems = res.data.structure.items;

            if (poolItems.length === 1) {
                $('#poolStructureTbText').html(poolItems.length + UILANG.m(' test page in your testpool'));
            } else {
                $('#poolStructureTbText').html(poolItems.length + UILANG.m(' test pages in your testpool'));
            }
            serverData.testLevel.currentPoolItems = poolItems;
            if (poolItems.length > 0) {
                $('#noAssignmentMsg').hide();
                $('#testPanelList').show();
                $('#poolStructureTbText').show();
                gui.poolStructureView.clearElements(true);
                $.each(poolItems, function(key, value) {
                    gui.poolStructureView.addElement(value, true);
                });
                quickCheck();
            } else {
                $('#noAssignmentMsg').show();
                $('#testPanelList').hide();
                $('#poolStructureTbText').show();
                gui.poolStructureView.clearElements(true);
            }
            break;
        case 'saveTestpoolAssignment':
            startAjax('fetchTestsAssigned', {
                id: currPoolId,
                test: serverData.testLevel.id
            });
            break;
        case 'search':
            if (res.data.list.length > 0) {
                gui.library.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library);
            }
            break;
        case 'igSearch':
            if (res.data.list.length > 0) {
                gui.library2.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library2);
            }
            break;
        case 'plausibilityCheck':
            gui.structureView.clearWarnings();
            stWarnings = {};
            // Show results of plausibility check
            if ($("#pCheckErrorDiv").length === 0) {
                $('body').append('<div id="pCheckErrorDiv" style="display:none;"></div>')
            }
            pbCheckHtml = $('#pCheckErrorDiv');
            pbCheckHtml.empty();
            pbCheckHtml.append('<br />');
            // Check if timer is active and set to'0'!
            timerActive = settings['useTimer'];
            if (typeof (serverData.testLevel.options['useTimer']) != 'undefined') {
                timerActive = serverData.testLevel.options['useTimer'];
            }
            if (timerActive) {
                let timerLimit = settings['timeLimit'];
                if (typeof (serverData.testLevel.options['timeLimit']) != 'undefined') {
                    timerLimit = serverData.testLevel.options['timeLimit'];
                }
                if (timerLimit === 0) {
                    pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: Your test time is set to 0 minutes. Please select a correct value!') + '</p><br />');
                    res.timerIssue = true;
                }
            }
            // Check if all languages are set to off!
            checkLangs = [];
            $.each(languages, function(k, v) {
                checkLangs.push(k);
            });
            res.noActiveLanguage = true;
            for (let i in checkLangs) {
                let supportedLanguage = checkLangs[i];
                let value = settings[supportedLanguage];
                if (typeof (serverData.testLevel.options[supportedLanguage]) != 'undefined') {
                    value = serverData.testLevel.options[supportedLanguage];
                }
                if (value === true) res.noActiveLanguage = false;
            }
            if (res.noActiveLanguage === true) {
                pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: No language active. Please select at least one language!') + '</p><br />');
                serverData.testLevel.noActiveLanguage = true;
            } else {
                serverData.testLevel.noActiveLanguage = false;
            }
            // No errors found
            if (!res.missing_items && !res.noItems && !res.langError && !res.noContentError && !res.noActiveLanguage && !res.timerIssue && !res.pnNoContent) {
                pbCheckHtml.append('<div class="pCheckSuccessDiv"><h3>' + UILANG.m('Plausibility check completed successfully!') + '</h3>' + UILANG.m('No issues found in your test content:') + '<br /><ul class="pCheckUl"><li><img src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All test pages are still in the Content Manager.') + '</li><li><ul class="pCheckUl"><li><img src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All test pages are not empty and have a content.') + '</li><li><ul class="pCheckUl"><li><img src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All test pages are available in the active language(s).') + '</li></ul></div>');
            }
            // No items or stimuli found in the test
            if (res.noItems) {
                if (mode === 'poolEdit') {
                    pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: You have not added any pages to your pool yet. Please add test pages!') + '</p><br />');
                } else {
                    pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: You have not added any pages to your test yet. Please add test pages!') + '</p><br />');
                }
            }
            // Privacy note active but no content
            if (res.pnNoContent) {
                pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: The privacy note is enabled for this test, but no content has been provided or content for the active language(s) is missing!') + '</p><br />');
            }
            // Items from the test are not available anymore
            if (res.missing_items) {
                pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: Test pages have been deleted. Please remove them from your test!') + '</p><br />');
                $.each(res.missing_items, function(k, v) {
                    stWarnings[v.hiddenID] = {
                        type: 'error',
                        html: '<strong>' + UILANG.m('Error') + ':</strong><br />' + UILANG.m('This test page is not available anymore. Please remove it from your test!')
                    };
                })
            }
            // Test pages with no content found
            if (res.noContentError) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: These pages have no content!') + '</p><table id="item_nocontent"></table><br />');
                $('#item_nocontent').append('<tr class="pCheckTableHead"><th class="namecol">' + UILANG.m('Name') + '</th><th class="codecol">' + UILANG.m('Code') + '</th></tr>');
                $.each(res.noContentError, function(k, v) {
                    $('#item_nocontent').append('<tr><td>' + v.name + '</td><td>' + v.itemCode + '</td></tr>');
                    stWarnings[v.hiddenID] = {
                        type: 'warning',
                        html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This page has no content!')
                    };
                })
            }
            // Test pages found where not all active languages are available
            if (res.langError) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: These pages are not available in all languages of your test!') + '</p><table id="item_languageconflict"></table><br />');
                $('#item_languageconflict').append('<tr class="pCheckTableHead"><th class="langnamecol">' + UILANG.m('Name') + '</th><th class="langlangcol">' + UILANG.m('Missing languages') + '</th><th class="langcodecol">' + UILANG.m('Code') + '</th></tr>');
                let missLangs = '';
                $.each(res.langError, function(k, v) {
                    $.each(v.languages, function(key, value) {
                        if (missLangs === '') {
                            missLangs = value;
                        } else {
                            missLangs = missLangs + ' / ' + value;
                        }
                    });
                    $('#item_languageconflict').append('<tr><td>' + v.name + '</td><td>' + missLangs + '</td><td>' + v.itemCode + '</td></tr>');
                    stWarnings[v.hiddenID] = {
                        type: 'warning',
                        html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This page is not available in all languages of your test!') + ' ' + UILANG.m('Missing languages') + ': ' + missLangs
                    };
                    missLangs = '';
                })
            }
            // Test pages which have been added several times in the test
            if (res.duplicates) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: The same test page has been added multiple times!') + '</p><table id="item_duplicates"></table><br />');
                $('#item_duplicates').append('<tr class="pCheckTableHead"><th class="langnamecol">' + UILANG.m('Test page') + '</th><th class="langlangcol">' + UILANG.m('Occurrences') + '</th></tr>');
                let missLangs = '';
                $.each(res.duplicates, function(k, v) {
                    $('#item_duplicates').append('<tr><td>' + v.name + '</td><td>' + v.dupeCount + '</td></tr>');
                })
            }

            //check labels and show warning
            labelErr = false;
            labelErrors = [];
            $.each(serverData.testLevel.labels, function(k, v) {
                let buttonObj = v.button;
                let headlineObj = v.headline;
                $.each(languages, function(key, value) {
                    if (serverData.testLevel.options[key]) {
                        if (buttonObj[key] === '') {
                            labelErr = true;
                            labelErrors.push({
                                "name": k,
                                "issue": UILANG.m('Button'),
                                "langCode": key
                            });
                        }
                        if (headlineObj[key] === '') {
                            labelErr = true;
                            labelErrors.push({
                                "name": k,
                                "issue": UILANG.m('Headline'),
                                "langCode": key
                            });
                        }
                    }
                })
            });
            //label warning
            if (labelErr) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: Labels with missing content!') + '</p><table id="label_errorTable"></table><br />');
                $('#label_errorTable').append('<tr class="pCheckTableHead"><th class="labelcol">' + UILANG.m('Name') + '</th><th class="labellangcol">' + UILANG.m('Language') + '</th><th class="labelissuecol">' + UILANG.m('Missing content in') + '</th></tr>');
                $.each(labelErrors, function(k, v) {
                    $('#label_errorTable').append('<tr><td>' + v.name + '</td><td>' + v.langCode + '</td><td>' + v.issue + '</td></tr>');
                })
            }
            if (mode === 'browsing') {
                pbCheck = {
                    buttons: [{
                        label: UILANG.m('Close'),
                        'default': false,
                        disabled: false,
                        value: 'ok'
                    }, {
                        label: UILANG.m('Edit test'),
                        'default': true,
                        disabled: false,
                        value: 'edit'
                    }],
                    contentId: 'pCheckErrorDiv',
                    title: UILANG.m('Plausibility check results - Linear Test'),
                    width: 700,
                    callback: pCheckProceed
                };
            } else {
                pbCheck = {
                    buttons: [{
                        label: UILANG.m('Close'),
                        'default': true,
                        disabled: false,
                        value: 'ok'
                    }],
                    contentId: 'pCheckErrorDiv',
                    title: UILANG.m('Plausibility check results - Linear Test'),
                    width: 700
                };
            }
            new nxDialog('pCheckErrors', pbCheck);
            if (!permList[selection[0].dbId].editSelection) $('#background_pCheckErrors_button_1').hide(); /* hide 'edit test' button when the user does not have permission to edit test */

            //Set warning icons in sortable table
            $.each(stWarnings, function(k, v) {
                gui.structureView.setWarningMessage(v.html, v.type, k);
            });
            break;
        case 'plausibilityFluidCheck':
            gui.fluidStructureView.clearWarnings();
            stWarnings = {};
            // Show results of plausibility check
            if ($("#pCheckErrorDiv").length === 0) {
                $('body').append('<div id="pCheckErrorDiv" style="display:none;"></div>');
            }
            pbCheckHtml = $('#pCheckErrorDiv');
            pbCheckHtml.empty();
            pbCheckHtml.append('<br />');
            // Check if timer is active and set to'0'!
            timerActive = settings['useTimer'];
            if (typeof (serverData.testLevel.options['useTimer']) != 'undefined') {
                timerActive = serverData.testLevel.options['useTimer'];
            }
            if (timerActive) {
                let timerLimit = settings['timeLimit'];
                if (typeof (serverData.testLevel.options['timeLimit']) != 'undefined') {
                    timerLimit = serverData.testLevel.options['timeLimit'];
                }
                if (timerLimit === 0) {
                    pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: Your test time is set to 0 minutes. Please select a correct value!') + '</p><br />');
                    res.timerIssue = true;
                }
            }
            // Check if all languages are set to off!
            checkLangs = [];
            $.each(languages, function(k, v) {
                checkLangs.push(k);
            });
            res.noActiveLanguage = true;
            for (let i in checkLangs) {
                let supportedLanguage = checkLangs[i];
                let value = settings[supportedLanguage];
                if (typeof (serverData.testLevel.options[supportedLanguage]) != 'undefined') {
                    value = serverData.testLevel.options[supportedLanguage];
                }
                if (value === true) res.noActiveLanguage = false;
            }
            if (res.noActiveLanguage === true) {
                pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: No language active. Please select at least one language!') + '</p><br />');
                serverData.testLevel.noActiveLanguage = true;
            } else {
                serverData.testLevel.noActiveLanguage = false;
            }
            // No errors found
            if (!res.missing_items && !res.noItems && !res.langError && !res.noContentError && !res.noActiveLanguage && !res.timerIssue && !res.deletedPool && !res.itemsAmountError && !res.pnNoContent && !res.duplicates) {
                pbCheckHtml.append('<div class="pCheckSuccessDiv"><h3>' + UILANG.m('Plausibility check completed successfully!') + '</h3>' + UILANG.m('No issues found in your test content:') + '<br /><ul class="pCheckUl"><li><img src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All test pages are still in the Content Manager.') + '</li><li><ul class="pCheckUl"><li><img src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All test pages are not empty and have a content.') + '</li><li><ul class="pCheckUl"><li><img src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All test pages are available in the active language(s).') + '</li></ul></div>');
            }
            // No items or stimuli found in the test
            if (res.noItems) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: You have not added any fluid testblocks to your test yet!') + '</p><br />');
            }
            // Privacy note active but no content
            if (res.pnNoContent) {
                pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error: The privacy note is enabled for this test, but no content has been provided or content for the active language(s) is missing!') + '</p><br />');
            }
            // Items from the testpool are not available anymore
            if (res.missing_items) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: One or more of your testpools has deleted test pages!') + '</p><table id="item_missing"></table><br />');
                $('#item_missing').append('<tr class="pCheckTableHead"><th class="namecol">' + UILANG.m('Name') + '</th></tr>');
                $.each(res.missing_items, function(k, v) {
                    $('#item_missing').append('<tr><td>' + v.name + '</td></tr>');
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning:') + '</strong><br />' + UILANG.m('The testpool has deleted test pages. Please check the testpool!') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has deleted test pages. Please check the testpool!') + '<br />'
                        };
                    }
                })
            }
            if (res.deletedPool) {
                pbCheckHtml.append('<p class="pCheckError">' + UILANG.m('Error') + ': ' + UILANG.m('Testpools have been deleted. Please remove the blocks from your test!') + '</p><br />');
                $.each(res.deletedPool, function(k, v) {
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Error') + ':</strong><br />' + UILANG.m('The testpool from this fluid block is not available anymore. Please remove this fluid block from your test!') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'error',
                            html: '<strong>' + UILANG.m('Error') + ':</strong><br />' + UILANG.m('The testpool from this fluid block is not available anymore. Please remove this fluid block from your test!') + '<br />'
                        };
                    }
                })
            }
            if (res.itemsAmountError) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: These testpools have less pages than selected!') + '</p><table id="item_neItems"></table><br />');
                $('#item_neItems').append('<tr class="pCheckTableHead"><th class="namecol">name</th><th>' + UILANG.m('pages used') + '</th><th>' + UILANG.m('pages total') + '</th></tr>');
                $.each(res.itemsAmountError, function(k, v) {
                    $('#item_neItems').append('<tr><td>' + v.name + '</td><td>' + v.itemsUsed + '</td><td>' + v.itemsTotal + '</td></tr>');
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has less test pages than selected in the fluid block.') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has less test pages than selected in the fluid block.') + '<br />'
                        };
                    }
                })
            }

            // Testpools found where items have no content
            if (res.noContentError) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: These pages have no content!') + '</p><table id="item_nocontent"></table><br />');
                $.each(res.noContentError, function(k, v) {
                    //Create line with poolname
                    $('#item_nocontent').append('<tr class="pCheckSubHeadline"><td colspan="2"><strong>Testpool: </strong>' + v.poolname + '</td></tr>');
                    // Create data lines
                    $('#item_nocontent').append('<tr class="pCheckTableHead"><th class="namecol">' + UILANG.m('Name') + '</th><th class="codecol">' + UILANG.m('Code') + '</th></tr>');
                    $.each(v.data, function(key, value) {
                        $('#item_nocontent').append('<tr><td>' + value.name + '</td><td>' + value.itemCode + '</td></tr>');
                    });
                    //Create warning icon
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has pages with no content. Please check the testpool!') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has pages with no content. Please check the testpool!') + '<br />'
                        };
                    }
                })
            }

            // Testpools found where items are not supporting all chosen languages of the test
            if (res.langError) {
                let missLangs;
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: These pages are not available in all languages of your test!') + '</p><table id="item_languageconflict"></table><br />');
                $.each(res.langError, function(k, v) {
                    //Create line with poolname
                    $('#item_languageconflict').append('<tr class="pCheckSubHeadline"><td colspan="3"><strong>' + UILANG.m('Testpool') + ': </strong>' + v.poolname + '</td></tr>');
                    // Create data lines
                    $('#item_languageconflict').append('<tr class="pCheckTableHead"><th class="langnamecol">' + UILANG.m('Name') + '</th><th class="langlangcol">' + UILANG.m('Languages') + '</th><th class="langcodecol">' + UILANG.m('Code') + '</th></tr>');
                    $.each(v.data, function(key, value) {
                        missLangs = '';
                        $.each(value.languages, function(key2, value2) {
                            if (missLangs === '') {
                                missLangs = value2;
                            } else {
                                missLangs = missLangs + ' / ' + value2;
                            }
                        });
                        $('#item_languageconflict').append('<tr><td>' + value.name + '</td><td>' + missLangs + '</td><td>' + value.itemCode + '</td></tr>');
                    });
                    //Create warning icon
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This testpool has pages which are not available in all languages of your test! Languages missing:') + ' ' + missLangs + ' <br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This testpool has pages which are not available in all languages of your test! Languages missing:') + ' ' + missLangs + ' <br />'
                        };
                    }
                })
            }

            // Test pages which have been added several times in the test
            if (res.duplicates) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: There are duplicate test pages in your test pools!') + '</p><table id="item_duplicates"></table><br />');
                $('#item_duplicates').append('<tr class="pCheckTableHead"><th class="langnamecol">' + UILANG.m('Test pool') + '</th><th class="langnamecol">' + UILANG.m('Test page') + '</th><th class="langlangcol">' + UILANG.m('Occurrences') + '</th></tr>');

                // Iterate through each test pool in res.duplicates
                $.each(res.duplicates, function(key, pool) {
                    // Iterate through the pages within each pool
                    $.each(pool.pages, function(pageKey, page) {
                        // Append the pool name, page name, and occurrence count to the table
                        $('#item_duplicates').append('<tr><td>' + pool.poolName + '</td><td>' + page.name + '</td><td>' + page.dupeCount + '</td></tr>');
                    });
                });
            }

            //check labels and show warning
            labelErr = false;
            labelErrors = [];
            $.each(serverData.testLevel.labels, function(k, v) {
                let buttonObj = v.button;
                let headlineObj = v.headline;
                $.each(languages, function(key, value) {
                    if (serverData.testLevel.options[key]) {
                        if (buttonObj[key] === '') {
                            labelErr = true;
                            labelErrors.push({
                                "name": k,
                                "issue": UILANG.m('Button'),
                                "langCode": key
                            });
                        }
                        if (headlineObj[key] === '') {
                            labelErr = true;
                            labelErrors.push({
                                "name": k,
                                "issue": UILANG.m('Headline'),
                                "langCode": key
                            });
                        }
                    }
                })
            });

            //label warning
            if (labelErr) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: Labels with missing content!') + '</p><table id="label_errorTable"></table><br />');
                $('#label_errorTable').append('<tr class="pCheckTableHead"><th class="labelcol">' + UILANG.m('Name') + '</th><th class="labellangcol">' + UILANG.m('Language') + '</th><th class="labelissuecol">' + UILANG.m('Missing content in') + '</th></tr>');
                $.each(labelErrors, function(k, v) {
                    $('#label_errorTable').append('<tr><td>' + v.name + '</td><td>' + v.langCode + '</td><td>' + v.issue + '</td></tr>');
                })
            }

            if (mode === 'browsing') {
                pbCheck = {
                    buttons: [{
                        label: UILANG.m('Close'),
                        'default': false,
                        disabled: false,
                        value: 'ok'
                    }, {
                        label: UILANG.m('Edit test'),
                        'default': true,
                        disabled: false,
                        value: 'edit'
                    }],
                    contentId: 'pCheckErrorDiv',
                    title: UILANG.m('Plausibility check results - Fluid Test'),
                    width: 700,
                    callback: pCheckProceed
                };
            } else {
                pbCheck = {
                    buttons: [{
                        label: UILANG.m('Close'),
                        'default': true,
                        disabled: false,
                        value: 'ok'
                    }],
                    contentId: 'pCheckErrorDiv',
                    title: UILANG.m('Plausibility check results - Fluid Test'),
                    width: 700
                };
            }
            new nxDialog('pCheckErrors', pbCheck);
            //Set warning icons in sortable table
            $.each(stWarnings, function(k, v) {
                gui.fluidStructureView.setWarningMessage(v.html, v.type, k);
            });
            break;
        case 'quickFluidCheck':
            gui.fluidStructureView.clearWarnings();
            stWarnings = {};
            // Show results of quick check
            // Check if all languages are set to off!
            checkLangs = [];
            $.each(languages, function(k, v) {
                checkLangs.push(k);
            });
            res.noActiveLanguage = true;
            for (let i in checkLangs) {
                let supportedLanguage = checkLangs[i];
                let value = settings[supportedLanguage];
                if (typeof (serverData.testLevel.options[supportedLanguage]) != 'undefined') {
                    value = serverData.testLevel.options[supportedLanguage];
                }
                if (value === true) res.noActiveLanguage = false;
            }
            if (res.noActiveLanguage === true) {
                gui.statusBar.setStatus(UILANG.m('Error: No language active. Please select at least one language!'), 3000, '#f00');
                serverData.testLevel.noActiveLanguage = true;
            } else {
                serverData.testLevel.noActiveLanguage = false;
            }
            // Check if timer is active and set to'0'!
            timerActive = settings['useTimer'];
            if (typeof (serverData.testLevel.options['useTimer']) != 'undefined') {
                timerActive = serverData.testLevel.options['useTimer'];
            }
            if (timerActive) {
                let timerLimit = settings['timeLimit'];
                if (typeof (serverData.testLevel.options['timeLimit']) != 'undefined') {
                    timerLimit = serverData.testLevel.options['timeLimit'];
                }
                if (timerLimit === 0) {
                    gui.statusBar.setStatus(UILANG.m('Error: Your test time is set to 0 minutes. Please select a correct value!'), 3000, '#f00');
                    res.timerIssue = true;
                }
            }
            // No items or stimuli found in the test
            if (res.noItems) {
                gui.statusBar.setStatus(UILANG.m('Warning: You have not added any fluid blocks to your test yet. Please add fluid blocks!'), 3000, '#f00');
            }
            if (res.itemsAmountError) {
                $.each(res.itemsAmountError, function(k, v) {
                    stWarnings[v.hiddenID] = {
                        type: 'warning',
                        html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has less test pages than selected in the fluid block.') + '<br />'
                    };
                })
            }
            if (res.noContentError) {
                $.each(res.noContentError, function(k, v) {
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has pages with no content. Please check the testpool!') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has pages with no content. Please check the testpool!') + '<br />'
                        };
                    }
                })
            }
            if (res.langError) {
                $.each(res.langError, function(k, v) {
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has test pages which do not support every language of your test. Please check the testpool!') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has test pages which do not support every language of your test. Please check the testpool!') + '<br />'
                        };
                    }
                })
            }
            if (res.missing_items) {
                $.each(res.missing_items, function(k, v) {
                    if (stWarnings[v.hiddenID]) {
                        stWarnings[v.hiddenID]['html'] += '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has deleted test pages. Please check the testpool!') + '<br />';
                    } else {
                        stWarnings[v.hiddenID] = {
                            type: 'warning',
                            html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('The testpool has deleted test pages. Please check the testpool!') + '<br />'
                        };
                    }
                })
            }
            if (res.deletedPool) {
                $.each(res.deletedPool, function(k, v) {
                    stWarnings[v.hiddenID] = {
                        type: 'error',
                        html: '<strong>' + UILANG.m('Error') + ':</strong><br />' + UILANG.m('The testpool from this fluid block is not available anymore. Please remove this fluid block from your test!')
                    };
                })
            }
            // Set warning icons in sortable table
            $.each(stWarnings, function(k, v) {
                gui.fluidStructureView.setWarningMessage(v.html, v.type, k);
            });
            break;
        case 'quickCheck':
            gui.structureView.clearWarnings();
            stWarnings = {};
            // Show results of quick check
            // Check if all languages are set to off!
            checkLangs = [];
            $.each(languages, function(k, v) {
                checkLangs.push(k);
            });
            res.noActiveLanguage = true;
            for (let i in checkLangs) {
                let supportedLanguage = checkLangs[i];
                let value = settings[supportedLanguage];
                if (typeof (serverData.testLevel.options[supportedLanguage]) != 'undefined') {
                    value = serverData.testLevel.options[supportedLanguage];
                }
                if (value === true) res.noActiveLanguage = false;
            }
            if (mode !== 'poolEdit') {
                if (res.noActiveLanguage === true) {
                    gui.statusBar.setStatus(UILANG.m('Error: No language active. Please select at least one language!'), 3000, '#f00');
                    serverData.testLevel.noActiveLanguage = true;
                } else {
                    serverData.testLevel.noActiveLanguage = false;
                }
                // Check if timer is active and set to'0'!
                timerActive = settings['useTimer'];
                if (typeof (serverData.testLevel.options['useTimer']) != 'undefined') {
                    timerActive = serverData.testLevel.options['useTimer'];
                }
                if (timerActive) {
                    let timerLimit = settings['timeLimit'];
                    if (typeof (serverData.testLevel.options['timeLimit']) != 'undefined') {
                        timerLimit = serverData.testLevel.options['timeLimit'];
                    }
                    if (timerLimit === 0) {
                        gui.statusBar.setStatus(UILANG.m('Error: Your test time is set to 0 minutes. Please select a correct value!'), 3000, '#f00');
                        res.timerIssue = true;
                    }
                }
                // No items or stimuli found in the test
                if (res.noItems) {
                    gui.statusBar.setStatus(UILANG.m('Warning: You have not added any pages to your test yet. Please add test pages!'), 3000, '#f00');
                }
            }
            // Items from the test are not available anymore
            if (res.missing_items) {
                $.each(res.missing_items, function(k, v) {
                    stWarnings[v.hiddenID] = {
                        type: 'error',
                        html: '<strong>' + UILANG.m('Error') + ':</strong><br />' + UILANG.m('This test page is not available anymore. Please remove it from your test!')
                    };
                })
            }
            // Items with no content found
            if (res.noContentError) {
                $.each(res.noContentError, function(k, v) {
                    stWarnings[v.hiddenID] = {
                        type: 'warning',
                        html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This page has no content!')
                    };
                })
            }
            // Items found where not all active languages are available
            if (res.langError) {
                let missLangs = '';
                $.each(res.langError, function(k, v) {
                    $.each(v.languages, function(key, value) {
                        if (missLangs === '') {
                            missLangs = value;
                        } else {
                            missLangs = missLangs + ' / ' + value;
                        }
                    });
                    stWarnings[v.hiddenID] = {
                        type: 'warning',
                        html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This page is not available in all languages of your test!') + ' ' + UILANG.m('Languages missing:') + ' ' + missLangs
                    };
                    missLangs = '';
                })
            }

            // Set warning icons in sortable table
            if (mode === 'poolEdit') {
                $.each(stWarnings, function(k, v) {
                    gui.poolStructureView.setWarningMessage(v.html, v.type, k);
                })
            } else {
                $.each(stWarnings, function(k, v) {
                    gui.structureView.setWarningMessage(v.html, v.type, k);
                })
            }

            break;

        case 'fetchIgPerm':

            igp_return(res, 'tests');

            break;

        case 'updatePerm':
            gui.statusBar.setStatus(UILANG.m("Permission data successfully updated!"), 3000, '#0A0');

            startAjax('fetchLibrary', {
                location: loc.folder,
                showBlocked: showBlocked
            });

            break;

        default:
            break;
    }
}