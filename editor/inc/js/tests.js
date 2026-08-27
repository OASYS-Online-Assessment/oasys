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
let isAE = false;

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
//variables for delayed edit handling
let editOnData = false;
let pendingTestLevelId = null;
let pendingTestLevelToken = null;
let pendingTestLevelRequest = null;
let pendingPreviewCheckToken = null;
let pendingPreviewCheckTestId = null;
let previewPlausibilityResult = null;
let previewPlausibilityWarnings = {};
let ajaxRequestToken = 0;
let firstRun = false;
let skinOptionContainer;
//HTML frame for displaying test pages in the testpage-chooser
let itemsDisplayHTML = "";
//HTML frame for displaying test pages in the testpool-chooser
let itemsDisplayPoolsHTML = ("<div id='optContainer' class='fluidBlockOptions'></div><div id='igListContainer' class='fluidBlockPageList'></div>");
let chosenPool = {};
//Test page Selection
let itStiSelection;
//HTML frame for displaying labels in the changeLabel dialog
let changeLabelsDisplayHTML = ("<div id='optContainerLabel' class='assignLabelOptions'></div><div id='labContainer' class='assignLabelPreview'></div>");
let changesLabel = {};
//tmp values
let minTmpValue;
let maxTmpValue;
let minMaxTmpValues = {};
//HTML frame for test structures in the  in the assign-test-form
const testCountDisplayHTML = "<div id='presMsg'></div>";
const testStructureDisplayHTML = "<div class='tmMutationPreviewMeta' id='testID'></div><div class='tmMutationPreviewTableShell'><table class='tmMutationPreviewTableHead'><colgroup><col class='tmMutationPreviewColName'><col class='tmMutationPreviewColCode'></colgroup><thead></thead></table><div class='tmMutationPreviewTableWrap'><table id='testStrucDisplayHTML'><colgroup><col class='tmMutationPreviewColName'><col class='tmMutationPreviewColCode'></colgroup><tbody></tbody></table></div></div>";
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
    buttons.loadExistingLabels = new jsButton2($('header'), 'bLoadExistingLabels', {
        label: UILANG.m('Load existing'),
        icon: '../images/toolbarIcons/ic_tb_copy.png',
        iconWidth: 48,
        width: 88,
        height: 100,
        callback: function() {
            openExistingEditorEntriesDialog('labels');
        },
        disabled: false
    });
    buttons.loadExistingVariables = new jsButton2($('header'), 'bLoadExistingVariables', {
        label: UILANG.m('Load existing'),
        icon: '../images/toolbarIcons/ic_tb_copy.png',
        iconWidth: 48,
        width: 88,
        height: 100,
        callback: function() {
            openExistingEditorEntriesDialog('variables');
        },
        disabled: false
    });
    buttons.loadExistingTestpools = new jsButton2($('header'), 'bLoadExistingTestpools', {
        label: UILANG.m('Load existing'),
        icon: '../images/toolbarIcons/ic_tb_copy.png',
        iconWidth: 48,
        width: 88,
        height: 100,
        callback: openExistingTestpoolsDialog,
        disabled: false
    });
    buttons.loadExistingMutationStructure = new jsButton2($('header'), 'bLoadExistingMutationStructure', {
        label: UILANG.m('Load existing'),
        icon: '../images/toolbarIcons/ic_tb_copy.png',
        iconWidth: 48,
        width: 88,
        height: 100,
        callback: openExistingMutationStructureDialog,
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
    buttons.bulkEdit = new jsButton2($('header'), 'bBulkEdit', {
        label: UILANG.m('Bulk edit'),
        icon: '../images/toolbarIcons/ic_tb_bulkEdit.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: openBulkEditDialog,
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
    insertVerticalDivider('header', 'metaDivider');
    $('#metaDivider').hide();
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
    buttons.landingPage = new jsButton2($('header'), 'bLandingPage', {
        label: UILANG.m('Landing page'),
        icon: '../images/toolbarIcons/ic_tb_landingPage.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: landingPage,
        disabled: false
    });
    buttons.finishScreenEditor = new jsButton2($('header'), 'bFinishScreenEditor', {
        label: UILANG.m('Finish screen'),
        icon: '../images/toolbarIcons/ic_tb_finishScreen.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: finishScreen,
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
    gui.s10 = createFlexSection('UI', 'sect010', 846, 846); //test preview

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
        panelHeight: 35
    });
    gui.boxes.properties.getInnerBox().addClass('tmPropertyPanel');
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

    gui.boxes.metaTags.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.boxes.structure.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.boxes.assignedTestpools.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.boxes.fluidStructure.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.boxes.mutationStructure.getInnerBox().addClass('tmCompactFlexPanel');
    gui.s9.hide();

    //section 10 (browse preview)
    gui.boxes.testPreview = createFlexBox(gui.s10, 'testPreview', {
        title: UILANG.m('Test preview'),
        minHeight: 480,
        flex: 1,
        noPadding: true,
        panelHeight: 30
    });
    gui.s10.hide();
    gui.boxes.testPreview.getInnerBox().append('<div id="testPreviewContent" class="tmPreviewBlank"></div>');


    gui.boxes.assignedTestpools.getInnerBox().append('<div id="inactiveMsg"></div><div id="noAssignmentMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('nothing_added_yet') + '</h3></div><div id="testPanelList"></div>');

    gui.boxes.properties.subSectionTitle = insertSubSection(gui.boxes.properties.getInnerBox(), 'subSettingsTitle');
    gui.boxes.properties.subSectionTitle.append('<div id="tTypeTitle"></div>');
    $('#subSettingsTitle').css('border', 'none');

    gui.boxes.properties.subSectionData = insertSubSection(gui.boxes.properties.getInnerBox(), 'subSettingsData');
    gui.boxes.properties.subSectionData.append('<div id="tActivityData"></div>');
    $('#subSettingsData').css('border', 'none');

    gui.boxes.properties.subSectionState = insertSubSection(gui.boxes.properties.getInnerBox(), 'subTestState', UILANG.m('Test state'));
    gui.boxes.properties.stateSwitch = createTestStateSegmentedSwitch(gui.boxes.properties.subSectionState);
    gui.testLevel.stateSwitch = gui.boxes.properties.stateSwitch;

    gui.boxes.properties.subSection0 = insertSubSection(gui.boxes.properties.getInnerBox(), 'subSettings');
    gui.boxes.properties.subSection0.append('<div id="activeSettings"></div>');
    $('#subSettings').css('border', 'none');

    gui.boxes.properties.subSection7 = insertSubSection(gui.boxes.properties.getInnerBox(), 'mutHead', UILANG.m('Mutation'));

    gui.boxes.properties.mutationMethod = insertDropdown(gui.boxes.properties.subSection7, 'tmutation', UILANG.m('Pick method'), {
        dataId: 'mutationMethod',
        theme: 'backend',
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
        theme: 'backend',
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
    testpoolsTbButtons.loadExisting = new nxButton($('#testpoolsTbButton'), 'tpTbLoadExisting', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_load_structure.svg',
        iconWidth: 22,
        callback: openExistingTestpoolsDialog,
        tooltip: UILANG.m('Load existing testpools'),
        disabled: false
    });
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
    gui.library = new FileManager("#testList", "_idSuffix", [], breadcrumbs, fileOpPermissions, true, libraryEvent, 'all', true);

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
    gui.structureView = new JsSortableTable('structure', 'structure_table', STOptions);
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
    structureTbButtons.clearStructure = new nxButton($('#structureTbButton'), 'stTbClear', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_delete.png',
        iconWidth: 22,
        callback: clearTestStructure,
        tooltip: UILANG.m('Clear test structure'),
        disabled: true
    });
    $('#background_stTbClear').prependTo('#structureTbButton');
    structureTbButtons.loadExistingStructure = new nxButton($('#structureTbButton'), 'stTbLoadExistingStructure', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_load_structure.svg',
        iconWidth: 22,
        callback: openExistingStructureDialog,
        tooltip: UILANG.m('Load existing structure'),
        disabled: true
    });
    $('#background_stTbLoadExistingStructure').insertAfter('#background_stTbClear');
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
    gui.fluidStructureView = new JsSortableTable('fluidStructure', 'fluidStructure_table', STOptionsFluid);
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
    fluidStructureTbButtons.clearStructure = new nxButton($('#fluidStructureTbButton'), 'fluidStTbClear', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_delete.png',
        iconWidth: 22,
        callback: clearTestStructure,
        tooltip: UILANG.m('Clear test structure'),
        disabled: true
    });
    $('#background_fluidStTbClear').prependTo('#fluidStructureTbButton');

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
    gui.mutationStructureView = new JsSortableTable('mutationStructure', 'mutationStructure_table', STOptionsMut);
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
    mutationStructureTbButtons.clearStructure = new nxButton($('#mutationStructureTbButton'), 'mutStTbClear', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_delete.png',
        iconWidth: 22,
        callback: clearTestStructure,
        tooltip: UILANG.m('Clear test structure'),
        disabled: true
    });
    $('#background_mutStTbClear').prependTo('#mutationStructureTbButton');
    mutationStructureTbButtons.loadExistingStructure = new nxButton($('#mutationStructureTbButton'), 'mutStTbLoadExistingStructure', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_load_structure.svg',
        iconWidth: 22,
        callback: openExistingMutationStructureDialog,
        tooltip: UILANG.m('Load existing linear tests'),
        disabled: true
    });
    $('#background_mutStTbLoadExistingStructure').insertAfter('#background_mutStTbClear');

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
    gui.poolStructureView = new JsSortableTable('testPanelList', 'poolStructure_table', STPoolOptions);
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
        deleteConfirmation: confirmLabelDelete,
        linkExclusives: {
            default: UILANG.m('yes')
        }
    };
    gui.labelView = new JsSortableTable('testLabels', 'label_table', STLabelOptions);
    //Toolbar Test Structure
    gui.boxes.testLabels.getPanel().append('<div><div id="labelTbText"></div><div id="labelTbButton"></div></div>');
    window.labelTbButtons = {};
    labelTbButtons.loadExisting = new nxButton($('#labelTbButton'), 'labelStTbLoadExisting', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_load_structure.svg',
        iconWidth: 22,
        callback: function() {
            openExistingEditorEntriesDialog('labels');
        },
        tooltip: UILANG.m('Load existing labels'),
        disabled: false
    });
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
    variablesTbButtons.loadExisting = new nxButton($('#variablesTbButton'), 'variablesStTbLoadExisting', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_load_structure.svg',
        iconWidth: 22,
        callback: function() {
            openExistingEditorEntriesDialog('variables');
        },
        tooltip: UILANG.m('Load existing variables'),
        disabled: false
    });
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
        deleteConfirmation: confirmVariableDelete,
        actionField: false,
        fixedOrder: true
    };
    gui.varStringsView = new JsSortableTable('varStringsPanelList', 'varStringsPanelList_table', varOptions);


    //Meta Tags
    gui.metaView = new JsTagEditor('metaTagList', {
        onChange: metaChanged,
        keyLabel: UILANG.m('Meta-key (e.g. "Subject"):'),
        valueLabel: UILANG.m('Meta-value (e.g. "Mathematics"):'),
        inputClass: 'dfs'
    });
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

function updateMetaTagCounter(selector, count) {
    const label = count === 1 ? UILANG.m('meta tag') : UILANG.m('meta tags');
    $(selector).html(count + ' ' + label);
}

// --- OASYS root handling for meta pages ---
function getOasysRootURLForMeta() {
    const editorPath = window.location.pathname;
    const idx = editorPath.indexOf('/editor/');
    if (idx === -1) {
        return window.location.origin;
    }
    return window.location.origin + editorPath.substring(0, idx);
}

function expandOasysRoot(html) {
    if (typeof html !== 'string' || html === '') return html;
	// Older editor content may contain ../ or even .. directly before the
	// placeholder. Consume that prefix instead of producing invalid ..http URLs.
    return html.replace(/(?:(?:\.\.\/)+|\.\.)?\[@\s*OASYSROOT\s*@\]/g, getOasysRootURLForMeta());
}

function collapseOasysRoot(html) {
    if (typeof html !== 'string' || html === '') return html;
    const root = getOasysRootURLForMeta();
    const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Also clean malformed legacy prefixes that TinyMCE may return unchanged.
    const re = new RegExp('(?:(?:\\.\\.\\/)+|\\.\\.)?' + escapedRoot, 'g');
    return html.replace(re, '[@ OASYSROOT @]');
}

function openMetaPageCurrentPreview(editor, customCss, metaType) {
    if (!editor) return;

    const sourceHtml = editor.getContent();
	const conditionSource = document.createElement('div');
	conditionSource.innerHTML = sourceHtml;
	let highestPointBoundary = 0;
	conditionSource.querySelectorAll('.score-conditional-block[data-condition-metric="points"]').forEach(function (block) {
		['data-condition-value', 'data-condition-max-value'].forEach(function (attribute) {
			const boundary = Number(block.getAttribute(attribute));
			if (Number.isFinite(boundary)) highestPointBoundary = Math.max(highestPointBoundary, boundary);
		});
	});
	const total = Math.max(10, Math.ceil((highestPointBoundary + (highestPointBoundary > 0 ? 0.5 : 0)) * 2) / 2);
	const initialScored = Math.min(total, Math.max(0, Math.round(total * 0.7 * 2) / 2));

    function buildPreviewHtml(scored, percentage) {
        const previewRoot = document.createElement('div');
        previewRoot.innerHTML = sourceHtml;
        previewRoot.querySelectorAll('[contenteditable]').forEach(function (node) {
            node.removeAttribute('contenteditable');
        });

        if (metaType === 'score_screen') {
            previewRoot.querySelectorAll('.score-conditional-block').forEach(function (block) {
                const metric = block.getAttribute('data-condition-metric') || 'percentage';
                const operator = block.getAttribute('data-condition-operator') || '>=';
                const expected = Number(block.getAttribute('data-condition-value'));
				const maximum = Number(block.getAttribute('data-condition-max-value'));
                const actual = metric === 'points' ? scored : percentage;
				let visible = Number.isFinite(expected) && ({
                    '>': actual > expected,
                    '>=': actual >= expected,
                    '<': actual < expected,
                    '<=': actual <= expected,
                    '=': actual === expected
                }[operator] === true);
				if (operator === 'between') visible = Number.isFinite(expected) && Number.isFinite(maximum) && actual > expected && actual < maximum;
				if (operator === 'betweenInclusive') visible = Number.isFinite(expected) && Number.isFinite(maximum) && actual >= expected && actual <= maximum;
				if (operator === 'betweenUpperInclusive') visible = Number.isFinite(expected) && Number.isFinite(maximum) && actual > expected && actual <= maximum;
				if (operator === 'betweenLowerInclusive') visible = Number.isFinite(expected) && Number.isFinite(maximum) && actual >= expected && actual < maximum;
                block.style.display = visible ? '' : 'none';
            });
            previewRoot.querySelectorAll('.score-conditional-meta,.score-conditional-remove').forEach(function (node) {
                node.remove();
            });
            previewRoot.innerHTML = previewRoot.innerHTML
                .replace(/\[@\s*SCORED\s*@\]/gi, String(scored))
                .replace(/\[@\s*TOTAL\s*@\]/gi, String(total))
                .replace(/\[@\s*PERCENTAGE\s*@\]/gi, Math.round(Number(percentage)) + '%');
        } else if (metaType === 'landing_page') {
            previewRoot.querySelectorAll('.non-editable-variable:not(.button-variable)').forEach(function (node) {
                const token = (node.textContent || '').toUpperCase();
                if (token.includes('LANGUAGE-CHOOSER')) {
                    node.outerHTML = '<select id="languageChooser"><option>English</option><option>Deutsch</option><option>Français</option></select>';
                } else if (token.includes('PASSWORD')) {
                    node.outerHTML = '<input id="tfPassword" type="password" value="example">';
                } else if (token.includes('LOGIN')) {
                    node.outerHTML = '<input id="tfLogin" type="text" value="sample.user">';
                }
            });
        }

        previewRoot.querySelectorAll('.button-variable').forEach(function (node) {
            const label = node.getAttribute('data-label') || node.textContent || UILANG.m('Continue');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            if (metaType === 'landing_page') {
                button.className = node.className;
                button.classList.add('customLandingStartButton');
                if (node.hasAttribute('style')) button.setAttribute('style', node.getAttribute('style'));
                ['data-label', 'data-login', 'data-password'].forEach(function (attribute) {
                    if (node.hasAttribute(attribute)) button.setAttribute(attribute, node.getAttribute(attribute));
                });
            }
            node.replaceWith(button);
        });

        return expandOasysRoot(previewRoot.innerHTML);
    }

    const iframeId = 'metaPageCurrentPreviewFrame';
    let previewNote = UILANG.m('Preview of the current unsaved content.');
    if (metaType === 'landing_page') {
        previewNote += ' ' + UILANG.m('Example login: sample.user.');
    }
    const scoreControls = metaType === 'score_screen'
        ? '<div class="metaPagePreviewScoreControls">' +
			'<label>' + UILANG.m('Reached points') + ' <input id="metaPreviewScored" type="number" min="0" max="' + total + '" step="0.5" value="' + initialScored + '"></label>' +
            '<span>/ ' + total + '</span>' +
			'<label>' + UILANG.m('Percentage') + ' <input id="metaPreviewPercentage" type="number" min="0" max="100" step="1" value="' + Math.round((initialScored / total) * 100) + '"> %</label>' +
          '</div>'
        : '';
    new nxDialog('metaPageCurrentPreview', {
        buttons: [{label: UILANG.m('Close'), cancel: true, default: true, value: 'close'}],
        contents: '<div class="metaPagePreviewNote">' + previewNote + '</div>' + scoreControls +
            '<iframe id="' + iframeId + '" class="metaPagePreviewFrame" title="' + UILANG.m('Preview') + '"></iframe>',
        title: UILANG.m('Preview'),
        width: 1000
    });

    setTimeout(function () {
        const iframe = document.getElementById(iframeId);
        if (!iframe) return;
        const previewCss = expandOasysRoot(customCss || '');
        function renderPreview() {
            const scored = Number($('#metaPreviewScored').val() || 0);
            const percentage = Number($('#metaPreviewPercentage').val() || 0);
            const doc = iframe.contentDocument;
            doc.open();
            doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' +
                'html,body{box-sizing:border-box;min-height:100%;margin:0;padding:16px;font-family:Arial,sans-serif;}img,video{max-width:100%;height:auto;}' +
                previewCss + '</style></head><body>' + buildPreviewHtml(scored, percentage) + '</body></html>');
            doc.close();
        }
        function formatPreviewNumber(value) {
            return String(Math.round(value * 10000) / 10000);
        }
		function formatPreviewPercentage(value) {
			return String(Math.round(Number(value)));
		}
		function snapPreviewPoints(value) {
			return Math.min(total, Math.max(0, Math.round(value * 2) / 2));
		}
        renderPreview();
		$('#metaPreviewScored').on('change.metaPagePreview', function () {
            const rawScored = Number($(this).val() || 0);
			const scored = snapPreviewPoints(rawScored);
            if (scored !== rawScored) $(this).val(formatPreviewNumber(scored));
            $('#metaPreviewPercentage').val(formatPreviewPercentage((scored / total) * 100));
            renderPreview();
        });
		$('#metaPreviewPercentage').on('change.metaPagePreview', function () {
            const rawPercentage = Number($(this).val() || 0);
            const percentage = Math.min(100, Math.max(0, rawPercentage));
            if (percentage !== rawPercentage) $(this).val(formatPreviewNumber(percentage));
			const scored = snapPreviewPoints((percentage / 100) * total);
			$('#metaPreviewScored').val(formatPreviewNumber(scored));
			$('#metaPreviewPercentage').val(formatPreviewPercentage((scored / total) * 100));
            renderPreview();
        });
    }, 0);
}

function cleanupMetaTinyMceEditors() {
	if (typeof tinymce === 'undefined') return;
	Object.keys(languages || {}).forEach(function (languageKey) {
		const editorId = 'container_' + languageKey;
		const editor = typeof tinymce.get === 'function' ? tinymce.get(editorId) : null;
		if (!editor) return;
		try {
			editor.remove();
		} catch (error) {
			// A dialog may already have removed the editor DOM. Remove the stale
			// registry entry so reopening can initialize the same editor ID again.
			try {
				if (tinymce.EditorManager && typeof tinymce.EditorManager.remove === 'function') {
					tinymce.EditorManager.remove(editor);
				}
			} catch (cleanupError) {
				console.warn('TinyMCE cleanup warning:', cleanupError);
			}
		}
	});
}

function getTestState() {
    return serverData.testLevel?.structure?.state || 'draft';
}

function isTestPublished() {
    return getTestState() === 'published';
}

function isTestStateAdminAllowed() {
    return !!(window.isSuper || window.isAdmin || window.isAE || isAE);
}

function canSwitchPublishedToDraft() {
    if (isTestStateAdminAllowed()) return true;
    const access = serverData.testLevel?.activityAccess || {};
    const total = Number(access.total ?? $(serverData.testLevel?.activityData || []).length);
    const restricted = Number(access.restricted ?? Math.max(0, total - Number(access.accessible ?? 0)));
    return total === 0 || restricted === 0;
}

function publishedDraftErrorMessage() {
    const access = serverData.testLevel?.activityAccess || {};
    const total = Number(access.total ?? $(serverData.testLevel?.activityData || []).length);
    const accessible = Number(access.accessible ?? 0);
    const restricted = Number(access.restricted ?? Math.max(0, total - accessible));

    return '<div class="tmDraftRestriction">' +
        '<div class="tmDraftRestrictionIntro">' +
        '<strong>' + UILANG.m('Draft mode is unavailable') + '</strong>' +
        '<span>' + UILANG.m('This test has recorded results, and your account does not have access to every test taker with results.') + '</span>' +
        '</div>' +
        '<div class="tmDraftRestrictionGuidance">' +
        UILANG.m('Only Superadmins, Elevated Admins and Admins may switch this test back to Draft in this situation. Regular users need access to every test taker with results.') +
        '</div>' +
        '<div class="tmDraftRestrictionStats">' +
        '<div class="tmDraftRestrictionStat tmDraftRestrictionStatTotal"><span>' + UILANG.m('Recorded test takers') + '</span><strong>' + total + '</strong></div>' +
        '<div class="tmDraftRestrictionStat tmDraftRestrictionStatAccessible"><span>' + UILANG.m('Accessible') + '</span><strong>' + accessible + '</strong></div>' +
        '<div class="tmDraftRestrictionStat tmDraftRestrictionStatRestricted"><span>' + UILANG.m('Restricted') + '</span><strong>' + restricted + '</strong></div>' +
        '</div>' +
        '</div>';
}

function resetTestStateSwitch() {
    if (gui.boxes?.properties?.stateSwitch) {
        gui.boxes.properties.stateSwitch.reset(isTestPublished());
    }
}

function createTestStateSegmentedSwitch(parent) {
    if ($('#testStateSegmentStyles').length === 0) {
        $('head').append(
            '<style id="testStateSegmentStyles">' +
            '.test-state-seg-row{display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 0 4px;}' +
            '.test-state-seg{display:inline-flex;align-items:center;padding:2px;border:1px solid #b9c8d2;border-radius:16px;background:#edf3f7;box-shadow:inset 0 1px 0 rgba(255,255,255,.85);}' +
            '.test-state-seg button{border:0;background:transparent;color:#1d2730;font-weight:bold;font-size:12px;line-height:20px;padding:1px 13px;border-radius:13px;cursor:pointer;white-space:nowrap;}' +
            '.test-state-seg.can-edit button:hover{background:#e2e8f0;}' +
            '.test-state-seg.can-edit button[data-state="published"]:hover{background:#fecaca;}' +
            '.test-state-seg button.is-active{background:#227DAA;color:#fff;box-shadow:inset 0 1px 2px rgba(0,0,0,.15);}' +
            '.test-state-seg button[data-state="published"].is-active{background:#e11d48;box-shadow:inset 0 1px 2px rgba(0,0,0,.18);}' +
            '.test-state-seg.is-locked button{cursor:default;}' +
            '.test-state-seg.is-locked:not(.can-edit){opacity:.9;}' +
            '#testStateHelp{display:inline-flex;align-items:center;min-width:18px;}' +
            '.published-structure-lock .jsFlexBoxVeil{display:none !important;pointer-events:none !important;}' +
            '.published-structure-lock,.published-structure-lock *{cursor:not-allowed !important;}' +
            '</style>'
        );
    }

    parent.append(
        '<div class="test-state-seg-row">' +
        '<div id="testStateSegmentedSwitch" class="test-state-seg" role="group" aria-label="' + UILANG.m('Test state') + '">' +
        '<button type="button" data-state="draft">' + UILANG.m('Draft') + '</button>' +
        '<button type="button" data-state="published">' + UILANG.m('Published (Locked)') + '</button>' +
        '</div>' +
        '<span id="testStateHelp"></span>' +
        '</div>'
    );

    const testStateHelpHtml = UILANG.m('<p><strong>Draft</strong> is the working mode for a test. You can still change the test structure and content while you are preparing it.</p><p><strong>Published (Locked)</strong> protects a test after it is ready to use. The structure and test content are locked so existing results cannot be damaged by later changes.</p><p>You can publish a draft at any time. Switching a published test back to draft may be destricted when results of test takers exist you do not have access to.</p>');
    new OasysHelp('testStateHelp', {
        htmlContent: testStateHelpHtml,
        title: UILANG.m('Test state')
    });

    const seg = $('#testStateSegmentedSwitch');
    let locked = true;

    seg.on('click', 'button', function(e) {
        e.preventDefault();
        if (locked || mode === 'browsing') return;
        testStateChanged('testStateSegmentedSwitch', $(this).data('state') === 'published');
    });

    return {
        reset(published) {
            const state = published ? 'published' : 'draft';
            seg.find('button').each(function() {
                const active = $(this).data('state') === state;
                $(this).toggleClass('is-active', active);
                $(this).attr('aria-pressed', active ? 'true' : 'false');
            });
        },
        lock() {
            locked = true;
            seg.addClass('is-locked').removeClass('can-edit');
        },
        unlock() {
            locked = false;
            seg.removeClass('is-locked').addClass('can-edit');
        }
    };
}

function setPublishedUiState() {
    const published = isTestPublished();
    if (!serverData.testLevel || mode !== 'editTest') return;
    $('#box_structure,#box_fluidStructure,#box_mutationStructure').removeClass('published-structure-lock');

    if (published) {
        if (serverData.testLevel.structure.type === 'linear') {
            $('#box_structure').addClass('published-structure-lock');
            gui.boxes.structure.lock();
            gui.structureView.lock('greyout');
            structureTbButtons.addElements.disable();
            structureTbButtons.loadExistingStructure.disable();
            structureTbButtons.labelEditor.disable();
            structureTbButtons.resetOverridesLinear.disable();
            buttons.testVariables.disable();
            buttons.testLabels.disable();
        } else if (serverData.testLevel.structure.type === 'fluid') {
            $('#box_fluidStructure').addClass('published-structure-lock');
            gui.boxes.fluidStructure.lock();
            gui.fluidStructureView.lock('greyout');
            fluidStructureTbButtons.addElements.disable();
            fluidStructureTbButtons.poolEditor.disable();
            fluidStructureTbButtons.labelEditor.disable();
            fluidStructureTbButtons.resetOverridesFluid.disable();
            buttons.testVariables.disable();
            buttons.testLabels.disable();
            buttons.testPools.disable();
        }
    } else {
        if (serverData.testLevel.structure.type === 'linear') {
            gui.boxes.structure.unlock();
            gui.structureView.unlock();
            structureTbButtons.addElements.enable();
            structureTbButtons.loadExistingStructure.enable();
            structureTbButtons.labelEditor.enable();
            buttons.testVariables.enable();
            buttons.testLabels.enable();
        } else if (serverData.testLevel.structure.type === 'fluid') {
            gui.boxes.fluidStructure.unlock();
            gui.fluidStructureView.unlock();
            fluidStructureTbButtons.addElements.enable();
            fluidStructureTbButtons.poolEditor.enable();
            fluidStructureTbButtons.labelEditor.enable();
            buttons.testVariables.enable();
            buttons.testLabels.enable();
            buttons.testPools.enable();
        }
    }
    updateClearStructureButtons();
}

function updateClearStructureButtons() {
    if (typeof structureTbButtons === 'undefined' || typeof fluidStructureTbButtons === 'undefined' || typeof mutationStructureTbButtons === 'undefined') {
        return;
    }

    structureTbButtons.clearStructure.disable();
    structureTbButtons.loadExistingStructure.disable();
    fluidStructureTbButtons.clearStructure.disable();
    mutationStructureTbButtons.clearStructure.disable();
    mutationStructureTbButtons.loadExistingStructure.disable();

    if (!serverData.testLevel || mode !== 'editTest') return;
    const testType = serverData.testLevel.structure.type;
    const items = serverData.testLevel.structure.items || [];
    if (testType === 'linear' && !(isTestPublished() && testType !== 'mutation')) {
        structureTbButtons.loadExistingStructure.enable();
    } else if (testType === 'mutation') {
        mutationStructureTbButtons.loadExistingStructure.enable();
    }
    if (!items.length || (isTestPublished() && testType !== 'mutation')) return;

    if (testType === 'linear') {
        structureTbButtons.clearStructure.enable();
    } else if (testType === 'fluid') {
        fluidStructureTbButtons.clearStructure.enable();
    } else if (testType === 'mutation') {
        mutationStructureTbButtons.clearStructure.enable();
    }
}

function testStateChanged(sender, value) {
    if (!serverData.testLevel || mode === 'browsing') return;

    const targetState = value ? 'published' : 'draft';
    const currentState = getTestState();
    if (targetState === currentState) return;

    if (currentState === 'published' && targetState === 'draft' && !canSwitchPublishedToDraft()) {
        resetTestStateSwitch();
        showMessage(publishedDraftErrorMessage(), 'warning', 720);
        return;
    }

    serverData.testLevel.structure.state = targetState;
    resetTestStateSwitch();
    setPublishedUiState();

    const sendData = {
        id: serverData.testLevel.id,
        structureState: targetState,
        publishMutationChildren: serverData.testLevel.structure.type === 'mutation' && targetState === 'published'
    };
    if (serverData.testLevel.structure.type === 'mutation') {
        sendData.mSave = true;
    } else {
        sendData.currentSkin = serverData.testLevel.skin.skin;
    }
    startAjax('saveTest', sendData);
}

function switchMode(sender) {
    for (let b in buttons) {
        buttons[b].hide();
    }
    let visibleButtons = [];
    switch (mode) {
        case 'browsing':
            visibleButtons = ['newFolder', 'newTest', 'rename', 'editSelection', 'bulkEdit', 'duplicate', 'deleteSelection', 'resetTestResults', 'plausibilityCheck', 'preview', 'searchFiler'];
            structureTbButtons.addElements.disable();
            structureTbButtons.clearStructure.disable();
            structureTbButtons.loadExistingStructure.disable();
            fluidStructureTbButtons.addElements.disable();
            fluidStructureTbButtons.clearStructure.disable();
            mutationStructureTbButtons.addElements.disable();
            mutationStructureTbButtons.clearStructure.disable();
            mutationStructureTbButtons.loadExistingStructure.disable();
            fluidStructureTbButtons.poolEditor.disable();
            fluidStructureTbButtons.labelEditor.disable();
            structureTbButtons.resetOverridesLinear.disable();
            structureTbButtons.labelEditor.disable();
            structureTbButtons.loadExistingStructure.disable();
            fluidStructureTbButtons.resetOverridesFluid.disable();
            gui.testLevel.useTimer.lock();
            gui.testLevel.timeLimit.lock();
            gui.testLevel.saveResults.lock();
            gui.testLevel.hideTimeoutMsg.lock();
            gui.testLevel.limitNavigation.lock();
            gui.testLevel.showScore.lock();
            gui.testLevel.stateSwitch.lock();
            $('#metaDivider').hide();
            $.each(languages, function(k, v) {
                gui.testLevel[k].lock();
            });
            if (selection.length === 1 && selection[0].type === 'folder') {
                buttons.rename.enable();
                buttons.editSelection.disable();
                buttons.bulkEdit.disable();
                buttons.duplicate.disable();
            } else if (selection.length === 1 && selection[0].type === 'test') {
                buttons.plausibilityCheck.enable();
                buttons.rename.enable();
                buttons.editSelection.enable();
                buttons.bulkEdit.disable();
                buttons.duplicate.enable();
            } else {
                buttons.plausibilityCheck.disable();
                buttons.rename.disable();
                buttons.editSelection.disable();
                buttons.bulkEdit.disable();
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
                    const recordedResultsWarning = (message) => '<div class="csvImportConfirm"><strong>' + UILANG.m('Recorded results exist') + '</strong><span>' + message + '</span></div>';
                    if(serverData.testLevel.structure.type === 'mutation') {
                        showMessage(recordedResultsWarning(UILANG.m("Results have already been recorded for this test. You can add or remove assigned linear tests in a mutation test without affecting existing results. However, ensure that the linear tests themselves are not modified, as this might impact result accessibility.")), "warning")
                    } else {
                        showMessage(recordedResultsWarning(UILANG.m("Results have already been recorded for this test. If you modify the test, existing results might not be accessible anymore.")), "warning")
                    }
                }
            }
            structureTbButtons.addElements.enable();
            structureTbButtons.loadExistingStructure.enable();
            structureTbButtons.labelEditor.enable();
            fluidStructureTbButtons.addElements.enable();
            mutationStructureTbButtons.addElements.enable();
            mutationStructureTbButtons.loadExistingStructure.enable();
            fluidStructureTbButtons.poolEditor.enable();
            fluidStructureTbButtons.labelEditor.enable();
            buttons.abortEditing.enable();
            if (serverData.testLevel.structure.type === 'fluid') {
                visibleButtons = ['abortEditing', 'testLabels', 'testVariables', 'testPools', 'plausibilityCheck', 'preview', 'legalText', 'scoreScreenEditor', 'landingPage', 'finishScreenEditor'];
                $('#metaDivider').show();
                gui.fluidStructureView.clearWarnings();
                gui.boxes.fluidStructure.unlock();
            } else if (serverData.testLevel.structure.type === 'mutation') {
                $('#metaDivider').hide();
                $('#vdivider').hide();
                visibleButtons = ['abortEditing', 'loadExistingMutationStructure'];
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
                $('#metaDivider').show();
                visibleButtons = ['abortEditing', 'testLabels', 'testVariables', 'plausibilityCheck', 'preview', 'legalText', 'scoreScreenEditor', 'landingPage', 'finishScreenEditor'];
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
            gui.testLevel.stateSwitch.unlock();
            gui.boxes.metaTags.unlock();
            metaTbButtons.addElements.enable();
            gui.statusBar.setStatus(UILANG.m('Editing') + ' "' + serverData.testLevel.name + '"');
            quickCheck();
            killAct();
            setPublishedUiState();
            break;
        case 'poolEdit':
            visibleButtons = ['closePoolEditor', 'loadExistingTestpools', 'plausibilityCheck'];
            buttons.plausibilityCheck.disable();
            gui.statusBar.setStatus(UILANG.m('Pool-Editor for fluid test:') + ' "' + serverData.testLevel.name + '"');
            $('#noAssignmentMsg').hide();
            $('#testPanelList').hide();
            gui.testpools.clearSelection();
            selectionChanged();
            break;
        case 'labelEdit':
            visibleButtons = ['closeLabelEditor', 'loadExistingLabels'];
            gui.statusBar.setStatus(UILANG.m('Label-Editor for test:') + ' "' + serverData.testLevel.name + '"');
            break;
        case 'variablesEdit':
            visibleButtons = ['closeVariablesEditor', 'loadExistingVariables'];
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
            if (mode === 'browsing') librarySelection(data, true);
            break;
        case 'getSelectKeys':
            if (mode === 'browsing') librarySelection(data, true);
            break;
        case 'getSelectDblclick':
            if (mode === 'browsing') librarySelection(data, false);
            break;
        case 'onNavigate':
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
        case 'onMetaSearchRequest':
            startAjax('metaSearch', data);
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
    if (selection.length === 0) {
        buttons.deleteSelection.disable();
        buttons.resetTestResults.disable();
        buttons.editSelection.disable();
        buttons.bulkEdit.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        gui.s2.fadeOut(250);
        gui.s3.fadeOut(250);
        gui.s6.fadeOut(250);
        gui.s9.fadeOut(250);
        gui.s10.fadeOut(250);

    } else if (selection.length === 1) {
        buttons.deleteSelection.enable();
        buttons.resetTestResults.enable();
        buttons.rename.enable();
        if (selection[0].type === 'folder') {
            buttons.editSelection.disable();
            buttons.bulkEdit.disable();
            buttons.duplicate.disable();
        }
        if (selection[0].type === 'test') {
            if (!delayed) {
                editOnData = true; //user doubleclicked => go to edit mode as soon as data has loaded
            } else {
                editOnData = false;
            }
            buttons.bulkEdit.disable();
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

            gui.s2.fadeOut(0);
            gui.s3.fadeOut(0);
            gui.s6.fadeOut(0);
            gui.s9.fadeOut(0);
            gui.s10.fadeOut(0);
            gui.s10.fadeIn(0);
            renderTestPreviewLoading();
            editType = 'test';
            if (selection[0].testStructure.type !== 'mutation') {
                buttons.plausibilityCheck.enable();
                buttons.preview.enable();
            }
            if (permList[selection[0].dbId] && permList[selection[0].dbId].editSelection) {
                buttons.editSelection.enable();
            } else {
                buttons.editSelection.disable();
            }
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
	            pendingTestLevelId = selection[0].dbId;
	            pendingTestLevelToken = ++ajaxRequestToken;
	            if (pendingTestLevelRequest && pendingTestLevelRequest.readyState !== 4 && typeof pendingTestLevelRequest.abort === 'function') {
                pendingTestLevelRequest.abort();
            }
	            pendingTestLevelRequest = startAjax('fetchTest', {
	                dbId: selection[0].dbId,
	                location: loc.folder,
	                defaultSkin: settings['skin'],
	                _requestToken: pendingTestLevelToken
	            });
        } else if (delayed) {
            gui.s2.fadeOut(0);
            gui.s3.fadeOut(0);
            gui.s6.fadeOut(0);
            gui.s9.fadeOut(0);
            gui.s10.fadeOut(0);
        }
    } else {
        // Bulk edit eligibility: all selected must be tests AND linear/fluid (no folders, no mutation)
        (function(){
            let ok = selection.length > 1 && selection.every(it => {
                return it && it.type === 'test' && it.testStructure && (it.testStructure.type === 'linear' || it.testStructure.type === 'fluid');
            });
            if (ok) {
                buttons.bulkEdit.enable();
            } else {
                buttons.bulkEdit.disable();
            }
        })();
        buttons.deleteSelection.enable();
        buttons.resetTestResults.enable();
        buttons.editSelection.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        gui.s2.fadeOut(250);
        gui.s3.fadeOut(250);
        gui.s6.fadeOut(250);
        gui.s9.fadeOut(250);
        gui.s10.fadeOut(250);
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
            if (selection[0] !== undefined && selection[0].type === 'folder' && !['preview', 'editSelection', 'bulkEdit', 'duplicate'].includes(buttonName)) {
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
                if (!serverData.testLevel || String(serverData.testLevel.id) !== String(selection[0].dbId)) {
                    editOnData = true;
                    return;
                }
                mode = 'editTest';
                gui.s2.fadeIn(0);
                fillDataFields('editTest');
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
            gui.s10.fadeOut(0);
            hideSection(gui.s1, [gui.s2, gui.s3, gui.s6, gui.s9]);
    }
}

/* ========================================================================
 *  BULK EDIT – Helpers
 * ======================================================================== */

const BULK_KEEP = '__keep__'; // sentinel for "Keep existing" in bulk UI

// Tri-state dropdown for booleans (Keep / Yes / No), preselect Keep
function triBoolDropdown($parent, id, label, defVal /* true|false|undefined for hint only */) {
    const els = [
        { label: UILANG.m('Keep existing'), value: BULK_KEEP },
        { label: UILANG.m('Yes'),           value: 'true' },
        { label: UILANG.m('No'),            value: 'false' }
    ];
    const hint = (defVal === true || defVal === false)
        ? `<span class="bulkHint">(${UILANG.m('default')}: ${defVal ? UILANG.m('Yes') : UILANG.m('No')})</span>`
        : '';
    $parent.append(
        `<div class="aorow">
       <div class="aoleftcol2">${label}</div>
       <div class="aorightcol2"><div id="${id}"></div>${hint}</div>
     </div>`
    );
    const dd = new jsDropList(id, id + "_dd", {
        elements: els,
        theme: 'backend',
        width: 220,
        readOnly: false,
        initialValue: BULK_KEEP,
        listTitle: UILANG.m('Keep existing')
    });
    dd.reset(BULK_KEEP);
    return dd;          // dd.getValue() returns 'true' | 'false' | BULK_KEEP
}

function testStateBulkDropdown($parent, id, label) {
    const els = [
        { label: UILANG.m('Keep existing'), value: BULK_KEEP },
        { label: UILANG.m('Draft'), value: 'draft' },
        { label: UILANG.m('Published (Locked)'), value: 'published' }
    ];
    $parent.append(
        `<div class="aorow">
       <div class="aoleftcol2">${UILANG.m(label)}</div>
       <div class="aorightcol2"><div id="${id}"></div></div>
     </div>`
    );
    const dd = new jsDropList(id, id + "_dd", {
        elements: els,
        theme: 'backend',
        width: 220,
        readOnly: false,
        initialValue: BULK_KEEP,
        listTitle: UILANG.m('Keep existing')
    });
    dd.reset(BULK_KEEP);
    return dd;
}


// Number input with a "Keep existing" checkbox (disabled until unchecked)
function keepableNumberInput($parent, id, label, min, max) {
    const hardMin = (typeof min === 'number') ? min : 0;
    const hardMax = (typeof max === 'number') ? max : 999;

    const rowHtml =
        `<div class="aorow" id="${id}_row">
       <div class="aoleftcol2">${UILANG.m(label)}</div>
       <div class="aorightcol2">
         <label style="display:inline-flex;gap:8px;align-items:center">
           <input type="checkbox" id="${id}_keep" checked> ${UILANG.m('Keep existing')}
         </label>
         <input type="number" id="${id}_num" class="bulkNum" value="0"
                min="${hardMin}" max="${hardMax}" inputmode="numeric" disabled>
       </div>
     </div>`;
    $parent.append(rowHtml);

    const $keep = $(`#${id}_keep`);
    const $num  = $(`#${id}_num`);
    const $row  = $(`#${id}_row`);

    function sanitize() {
        let v = $num.val();
        if (v === '' || isNaN(+v)) { $num.val('0'); v = '0'; }
        let n = parseInt(v, 10);
        if (n < hardMin) n = hardMin;
        if (n > hardMax) n = hardMax;
        $num.val(String(n));
        $num.toggleClass('is-invalid', (parseInt(v,10) > hardMax));
    }

    function syncDisabledState() {
        const dis = $keep.is(':checked');
        $num.prop('disabled', dis);
        $row.toggleClass('bulkKept', dis);   // <-- add/remove greyed-out style
        if (!dis && ($num.val() === '' || isNaN(+$num.val()))) $num.val('0');
        sanitize();
    }

    $keep.on('change', syncDisabledState);
    $num.on('input change blur', sanitize);

    // initial state (Keep existing is checked)
    syncDisabledState();

    return {
        get: () => $keep.is(':checked') ? BULK_KEEP : (function(v){
            if (v === '' || isNaN(+v)) return BULK_KEEP;
            let n = Math.max(hardMin, Math.min(hardMax, parseInt(v,10)));
            $num.val(n);
            $num.removeClass('is-invalid');
            return n;
        })($num.val()),
        hide: (flag) => $row.toggle(!flag)
    };
}



function skinDropdown($parent) {
    const els = [{ label: UILANG.m('Keep existing'), value: BULK_KEEP }];
    for (let name in skins) els.push({ label: name, value: name });

    $parent.append(
        `<div class="aorow">
       <div class="aoleftcol2">${UILANG.m('Skin Name')}</div>
       <div class="aorightcol2"><div id="bulk_skin_dd"></div></div>
     </div>`
    );

    const dd = new jsDropList('bulk_skin_dd', 'bulk_skin_dd_inner', {
        elements: els,
        theme: 'backend',
        width: 220,
        readOnly: false,
        initialValue: BULK_KEEP,
        listTitle: UILANG.m('Keep existing'),
        onChange: (_id, value) => {
            ctl.skinNameValue = value;
            // always render into #bulk_skin_opts and use defaults (no “Keep existing”)
            renderSkinOptionsForBulk_NoKeep(value, $('#bulk_skin_opts'), ctl.skinOpts);
        }
    });

    dd.reset(BULK_KEEP);
    return dd;
}




// Render skin options with defaults (display only) – still KEEP until changed
function renderSkinOptionsForBulk_NoKeep(skinName, $container, sink) {
    $container.empty();
    sink.getters = {};

    if (skinName === BULK_KEEP) return;

    const opts = (skins[skinName] && skins[skinName].options) ? skins[skinName].options : {};
    if ($.isEmptyObject(opts)) {
        $container.append(`<div class="dialogStandardMessage" style="opacity:.8">${UILANG.m('This skin has no options.')}</div>`);
        return;
    }

    Object.keys(opts).forEach((k) => {
        const def = opts[k];                  // { name, type, defaultValue, ... }
        const label = UILANG.e(def.name || k);

        // Helper: resolve default with graceful fallback
        const dflt = (typeof def.defaultValue !== 'undefined')
            ? def.defaultValue
            : (typeof def.value !== 'undefined' ? def.value : '');

        if (def.type === 'boolean') {
            const id = `skinopt_${k}`;
            const els = [
                { label: UILANG.m('Yes'), value: 'true' },
                { label: UILANG.m('No'),  value: 'false' }
            ];
            $container.append(
                `<div class="aorow" id="${id}_row">
           <div class="aoleftcol2">${label}</div>
           <div class="aorightcol2"><div id="${id}"></div></div>
         </div>`
            );
            const init = (dflt === true) ? 'true' : 'false';
            const dd = new jsDropList(id, id + "_dd", {
                elements: els,
                theme: 'backend',
                width: 200,
                initialValue: init,
                listTitle: (init === 'true') ? UILANG.m('Yes') : UILANG.m('No')
            });
            dd.reset(init);
            sink.getters[k] = () => (dd.getValue() === 'true');

        } else if (def.type === 'intrange') {
            const id = `skinopt_${k}`;
            let minDef = '', maxDef = '';
            if (typeof dflt === 'string' && dflt.includes('...')) {
                [minDef, maxDef] = String(dflt).split('...');
            }
            $container.append(
                `<div class="aorow" id="${id}_row">
           <div class="aoleftcol2">${label}</div>
           <div class="aorightcol2">
             <input type="number" id="${id}_min" value="${UILANG.e(minDef)}" style="width:70px;margin-left:0"> ..
             <input type="number" id="${id}_max" value="${UILANG.e(maxDef)}" style="width:70px">
           </div>
         </div>`
            );
            sink.getters[k] = () => {
                const a = parseInt($(`#${id}_min`).val(), 10);
                const b = parseInt($(`#${id}_max`).val(), 10);
                return (isNaN(a) || isNaN(b)) ? '' : (a + '...' + b);
            };

        } else if (def.type === 'color' || def.type === 'textstring' || def.type === 'text') {
            const id = `skinopt_${k}`;
            const defVal = (dflt != null ? String(dflt) : '');
            $container.append(
                `<div class="aorow" id="${id}_row">
           <div class="aoleftcol2">${label}</div>
           <div class="aorightcol2">
             <input type="text" id="${id}" value="${UILANG.e(defVal)}" style="width:260px;margin-left:0">
           </div>
         </div>`
            );
            sink.getters[k] = () => $(`#${id}`).val();

        } else {
            // Fallback → prefill with default string
            const id = `skinopt_${k}`;
            const defVal = (dflt != null ? String(dflt) : '');
            $container.append(
                `<div class="aorow" id="${id}_row">
           <div class="aoleftcol2">${label}</div>
           <div class="aorightcol2">
             <input type="text" id="${id}" value="${UILANG.e(defVal)}" style="width:260px;margin-left:0">
           </div>
         </div>`
            );
            sink.getters[k] = () => $(`#${id}`).val();
        }
    });
}




/* ========================================================================
 *  BULK EDIT – Main dialog
 * ======================================================================== */

function openBulkEditDialog() {
    // Two-column, wide dialog
    const html = `
    <div id="bulkEditRoot" class="bulkEditRoot">
      <div class="bulkGrid">
        <div class="bulkCol" id="bulkColL">
          <div id="bulk_validity" class="bulkBlock"></div>
          <div id="bulk_timer" class="bulkBlock"></div>
          <div id="bulk_misc" class="bulkBlock"></div>
        </div>
        <div class="bulkCol" id="bulkColR">
          <div id="bulk_langs" class="bulkBlock"></div>
          <div id="bulk_skin" class="bulkBlock"></div>
	          <div id="bulk_state" class="bulkBlock"></div>
        </div>
      </div>
    </div>
  `;

    showDialog('bulkEditDialog', {
        buttons: [
            { label: UILANG.m('Cancel'), cancel: true, value: 'cancel' },
            { label: UILANG.m('Apply to selected…'), 'default': true, value: 'ok' }
        ],
        contents: html,
        title: UILANG.m('Bulk edit test options'),
        width: 1120,
        returnPromise: true
    }).then((res) => {
        if (res.button !== 'ok') return;

        // Build payload (only changed values)
        const payload = {
            targets: selection.map(it => it.dbId),
            changes: {}
        };

        // validity
        const validity = {};
        const vActive = ctl.onOffSwitch.getValue();         // 'true'|'false'|BULK_KEEP
        if (vActive !== BULK_KEEP) validity.onOffSwitch = (vActive === 'true');

        if (ctl.drVal !== BULK_KEEP) validity.dateRange       = ctl.drVal;       // obj | false
        if (ctl.trVal !== BULK_KEEP) validity.timeRestriction = ctl.trVal;       // obj | false
        if (ctl.tdVal !== BULK_KEEP) validity.testDays        = ctl.tdVal;       // obj | false

        const fl = ctl.forceLogoff.getValue();
        if (fl !== BULK_KEEP) validity.forceLogoff = (fl === 'true');

        if (Object.keys(validity).length) payload.changes.validity = validity;

        // timer
        const timer = {};
        const ut = ctl.useTimer.getValue();
        if (ut !== BULK_KEEP) timer.useTimer = (ut === 'true');
        const tl = ctl.timeLimit.get();
        if (tl !== BULK_KEEP) timer.timeLimit = tl;
        if (Object.keys(timer).length) payload.changes.timer = timer;

        // misc
        const misc = {};
        ['saveResults','limitNavigation','showScore','hideTimeoutMsg','waitForMediaCache'].forEach(k => {
            const v = ctl.misc[k].getValue();
            if (v !== BULK_KEEP) misc[k] = (v === 'true');
        });
        if (Object.keys(misc).length) payload.changes.misc = misc;

        // languages
        const langs = {};
        $.each(languages, function(k, vLabel){
            const v = ctl.lang[k].getValue();
            if (v !== BULK_KEEP) langs[k] = (v === 'true');
        });
        if (Object.keys(langs).length) payload.changes.languages = langs;

        // skin
        const skinName = ctl.skinName.getValue();
        if (skinName !== BULK_KEEP) {
            const skinObj = { name: skinName, options: {} };

            const getters = (ctl.skinOpts && ctl.skinOpts.getters) ? ctl.skinOpts.getters : {};
            Object.keys(getters).forEach(k => {
                // always include: defaults are pre-filled, user edits override
                skinObj.options[k] = getters[k]();
            });

            payload.changes.skin = skinObj;
        }

        // test state (admin/elevated/superadmin only)
        if (ctl.testState) {
            const testState = ctl.testState.getValue();
            if (testState !== BULK_KEEP) payload.changes.testState = testState;
        }

        // prune empty sections
        Object.keys(payload.changes).forEach(k => {
            if (payload.changes[k] && typeof payload.changes[k] === 'object' && !Object.keys(payload.changes[k]).length) {
                delete payload.changes[k];
            }
        });
        if (!Object.keys(payload.changes).length) {
            showMessage(UILANG.m("No changes selected. Nothing to apply."), "warning")
            return;
        }

        // Confirm
        const names = selection.map(it => UILANG.e(it.name || it.label || ('#'+it.dbId)));
        showDialog('bulkConfirm', {
            buttons: [
                { label: UILANG.m('Cancel'), cancel: true, value: 'cancel' },
                { label: UILANG.m('Apply'), 'default': true, value: 'ok' }
            ],
            title: UILANG.m('Confirm bulk changes'),
            width: 560,
            icon: "../images/warning.png",
            iconWidth: 64,
            contents:
                '<p>' + UILANG.m('Are you sure you want to apply these settings to the selected tests?') + '</p>',
            returnPromise: true
        }).then((res2) => {
            if (res2.button !== 'ok') return;
            startAjax('saveTestBulk', payload);
        });
    });

    // ===== Build controls inside the dialog =====
    const $valid  = $('#bulk_validity').append("<h3>" + UILANG.m('Validity') + "</h3>");
    const $timer  = $('#bulk_timer').append("<h3>" + UILANG.m('Timer') + "</h3>");
    const $misc   = $('#bulk_misc').append("<h3>" + UILANG.m('Miscellaneous') + "</h3>");
    const $langs  = $('#bulk_langs').append("<h3>" + UILANG.m('Languages') + "</h3>");
    const $skin = $('#bulk_skin').append(`<h3>${UILANG.m('Skin')}</h3><div id="bulk_skin_row"></div><div id="bulk_skin_opts"></div>`);
	    const $state = $('#bulk_state').append("<h3>" + UILANG.m('Test state') + "</h3>");
    var ctl = window.ctl = { misc:{}, lang:{}, skinOpts:{} };
    const $skinRow  = $('#bulk_skin_row');
    const $skinOpts = $('#bulk_skin_opts');

    ctl.skinName = skinDropdown($skinRow);   // uses onChange internally
    ctl.skinOpts = {};                       // container for getters set by renderer

    // VALIDITY
    ctl.onOffSwitch = triBoolDropdown($valid, 'bulk_active', 'Test active');

    // Date restriction (open cloned BULK editor)
    $valid.append(
        `<div class="aorow">
     <div class="aoleftcol2">${UILANG.m('Date restriction')}</div>
     <div class="aorightcol2">
       <button id="bulk_edit_date" class="btn-edit">${UILANG.m('Edit')}</button>
       <span id="bulk_dr_summary" class="bulkMinor">(${UILANG.m('Keep existing')})</span>
     </div>
   </div>`
    );
    ctl.drVal = BULK_KEEP;
    $('#bulk_edit_date').on('click', async () => {
        const result = await editDateRange(true, ctl.drVal);
        ctl.drVal = result;
        if (result === BULK_KEEP) {
            $('#bulk_dr_summary').text('(' + UILANG.m('Keep existing') + ')');
        } else if (result === false) {
            $('#bulk_dr_summary').text(UILANG.m('No restriction'));
        } else {
            $('#bulk_dr_summary').text(
                `${fmtEUDateTime(result.start)} → ${result.end === false ? UILANG.m('infinite') : fmtEUDateTime(result.end)}`
            );
        }
    });

    // Daily time restriction
    $valid.append(
        `<div class="aorow">
     <div class="aoleftcol2">${UILANG.m('Daily time restriction')}</div>
     <div class="aorightcol2">
       <button id="bulk_edit_time" class="btn-edit">${UILANG.m('Edit')}</button>
       <span id="bulk_tr_summary" class="bulkMinor">(${UILANG.m('Keep existing')})</span>
     </div>
   </div>`
    );
    ctl.trVal = BULK_KEEP;
    $('#bulk_edit_time').on('click', async () => {
        const result = await editTimeRestriction(true, ctl.trVal);
        ctl.trVal = result;
        if (result === BULK_KEEP) {
            $('#bulk_tr_summary').text('(' + UILANG.m('Keep existing') + ')');
        } else if (result === false) {
            $('#bulk_tr_summary').text(UILANG.m('No restriction'));
        } else {
            $('#bulk_tr_summary').text(`${result.start} – ${result.end}`);
        }
    });


    // Testing days
    $valid.append(
        `<div class="aorow">
     <div class="aoleftcol2">${UILANG.m('Testing days')}</div>
     <div class="aorightcol2">
       <button id="bulk_edit_days" class="btn-edit">${UILANG.m('Edit')}</button>
       <span id="bulk_td_summary" class="bulkMinor">(${UILANG.m('Keep existing')})</span>
     </div>
   </div>`
    );
    ctl.tdVal = BULK_KEEP;
    $('#bulk_edit_days').on('click', async () => {
        const result = await editTestDays(true, ctl.tdVal);
        ctl.tdVal = result;
        if (result === BULK_KEEP) {
            $('#bulk_td_summary').text('(' + UILANG.m('Keep existing') + ')');
        } else if (result === false) {
            $('#bulk_td_summary').text(UILANG.m('No restriction'));
        } else {
            const idxToName = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(n => UILANG.m(n));
            const names = (result.days || '').split(',').map(s=>s.trim()).filter(Boolean).map(i => idxToName[parseInt(i,10)]||i);
            $('#bulk_td_summary').text(names.join(', '));
        }
    });


    // Force logoff
    ctl.forceLogoff = triBoolDropdown($valid, 'bulk_forcelogoff', 'Force logoff on inactive test');

    // TIMER
    ctl.useTimer  = triBoolDropdown($timer, 'bulk_usetimer', 'Use timer');
    ctl.timeLimit = keepableNumberInput($timer, 'bulk_timelimit', 'Time limit (minutes)', 0, 999, '0');
    // Hide time limit when Use timer == No
    $('#bulk_usetimer_dd').on('change', function(){
        const v = ctl.useTimer.getValue();
        ctl.timeLimit.hide(v === 'false'); // hide if timer disabled
        if (v === 'false') {
            $('#bulk_timelimit_keep').prop('checked', true).trigger('change');
        }
    }).trigger('change');

    // MISC
    ctl.misc.saveResults       = triBoolDropdown($misc, 'bulk_save',     'Save results');
    ctl.misc.limitNavigation   = triBoolDropdown($misc, 'bulk_limitnav', 'Limit navigation');
    ctl.misc.showScore         = triBoolDropdown($misc, 'bulk_showscore','Show score');
    ctl.misc.hideTimeoutMsg    = triBoolDropdown($misc, 'bulk_hideto',   'Hide time out message');
    ctl.misc.waitForMediaCache = triBoolDropdown($misc, 'bulk_waitmedia','Wait for media to load');

    // LANGUAGES (all default to KEEP)
    $.each(languages, function(k, vLabel){
        ctl.lang[k] = triBoolDropdown($langs, 'bulk_lang_' + k, vLabel);
    });

    if ($state) {
        ctl.testState = testStateBulkDropdown($state, 'bulk_test_state', 'State');
    }
}

function fmtEUDateTime(iso /* 'YYYY-MM-DDTHH:MM' | false */) {
    if (iso === false) return UILANG.m('infinite');
    if (!iso || typeof iso !== 'string' || !iso.includes('T')) return '';
    const [d, t] = iso.split('T');          // 'YYYY-MM-DD', 'HH:MM'
    const [y, m, day] = d.split('-');       // keep exact values (no timezone shift)
    return `${day}.${m}.${y} ${t}`;
}


function tmPreviewEscape(value) {
    if (value === null || typeof value === 'undefined') return '';
    return $('<div>').text(String(value)).html();
}

function tmPreviewOption(key, fallback) {
    if (serverData.testLevel && serverData.testLevel.options && typeof serverData.testLevel.options[key] !== 'undefined') {
        return serverData.testLevel.options[key];
    }
    if (typeof settings[key] !== 'undefined') return settings[key];
    return fallback;
}

function tmPreviewBoolIcon(value, label) {
    const state = value === true || value === 'true' || value === 1 || value === '1';
    return '<span class="tmPreviewBool ' + (state ? 'is-yes' : 'is-no') + '">' +
        '<img src="../images/' + state + '.png" alt="" />' +
        '<span>' + tmPreviewEscape(label || (state ? UILANG.m('Yes') : UILANG.m('No'))) + '</span>' +
        '</span>';
}

function tmPreviewDataValue(value) {
    if (value && typeof value === 'object') {
        if (typeof value.data !== 'undefined') return value.data;
        if (typeof value.hiddenData !== 'undefined') return value.hiddenData;
    }
    return value;
}

function tmPreviewFormatDateRange(range) {
    if (!range) return UILANG.m('Not set');
    let out = UILANG.m('from') + ' ' + fmtEUDateTime(range.start);
    if (range.end) out += '<br>' + UILANG.m('to') + ' ' + fmtEUDateTime(range.end);
    return out;
}

function tmPreviewFormatTestDays(testDays) {
    if (!testDays || !testDays.days) return UILANG.m('All days');
    if (testDays.days === '0,1,2,3,4,5,6') return UILANG.m('All days');
    const names = {
        '0': UILANG.m('Mon'),
        '1': UILANG.m('Tue'),
        '2': UILANG.m('Wed'),
        '3': UILANG.m('Thu'),
        '4': UILANG.m('Fri'),
        '5': UILANG.m('Sat'),
        '6': UILANG.m('Sun')
    };
    return testDays.days.split(',').map(day => names[day] || day).join(', ');
}

function tmPreviewActiveLanguages() {
    const active = [];
    $.each(languages, function(code, label) {
        if (tmPreviewOption(code, false) === true) {
            active.push({code: code, label: label});
        }
    });
    return active;
}

function tmPreviewResultStats() {
    const previewStats = serverData.testLevel.previewResultStats || {};
    const access = serverData.testLevel.activityAccess || {};
    const activity = serverData.testLevel.activityData || [];
    const fallbackTotal = $(activity).length;
    const total = Number(previewStats.total_results ?? access.total ?? fallbackTotal);
    const accessible = Number(previewStats.accessible_results ?? access.accessible ?? fallbackTotal);
    const restricted = Number(previewStats.restricted_results ?? access.restricted ?? Math.max(0, total - accessible));
    return {total, accessible, restricted, hasDetails: Array.isArray(previewStats.testActivity) && previewStats.testActivity.length > 0};
}

function tmPreviewFormatSqlDateTime(value) {
    if (!value) return UILANG.m('Not available');
    if (typeof value !== 'string') return tmPreviewEscape(value);
    const normalized = value.replace('T', ' ');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
    if (match) {
        return match[3] + '.' + match[2] + '.' + match[1] + ' ' + match[4];
    }
    return fmtEUDateTime(value.replace(' ', 'T')) || tmPreviewEscape(value);
}

function tmPreviewLastBackendEditLine(editInfo) {
    if (!editInfo || !editInfo.ts) return '';
    const user = editInfo.userName ? editInfo.userName : UILANG.m('Not available');
    const ts = tmPreviewFormatSqlDateTime(editInfo.ts);
    return '<div class="tmPreviewLastChange">' + UILANG.m('Last change') + ': ' + tmPreviewEscape(user) + ', ' + tmPreviewEscape(ts) + '</div>';
}

function tmPreviewStatsIcon() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 21h18v-2H3v2zm3-4h3V9H6v8zm6 0h3V5h-3v12zm6 0h3V12h-3v5z"></path></svg>';
}

function tmPreviewResultsCard(stats) {
    const canShowStats = stats.accessible > 0;
    return /* html */ `
        <section class="tmPreviewCard tmPreviewStats">
            <h3>${UILANG.m('Results')}</h3>
            <div class="tmPreviewResultsCompact">
                <div class="tmPreviewResultNumbers">
                    <div><span>${UILANG.m('Test takers with results')}</span><strong>${stats.total}</strong></div>
                    <div><span>${UILANG.m('Accessible to you')}</span><strong>${stats.accessible}</strong></div>
                </div>
                <button type="button" id="tmPreviewStatsButton" class="tmPreviewStatsButton" ${canShowStats ? '' : 'disabled'} title="${UILANG.m('View statistics')}" aria-label="${UILANG.m('View statistics')}">
                    ${tmPreviewStatsIcon()}
                </button>
            </div>
        </section>
    `;
}

function tmPreviewProgressBar(value) {
    const val = Math.max(0, Math.min(100, Number(value) || 0));
    return /* html */ `
        <div class="tmResultMiniProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}" aria-label="${UILANG.m('Progress')}">
            <div class="tmResultMiniProgressFill" style="width:${val}%"></div>
            <div class="tmResultMiniProgressLabel">${val}%</div>
        </div>
    `;
}

function tmPreviewAdjustStructureHeight() {
    $('.tmPreviewStructureCard').removeClass('is-scrollable').css('height', '');
}

function showPreviewResultStatsDialog() {
    const d = serverData.testLevel.previewResultStats || {};
    const rows = Array.isArray(d.testActivity) ? d.testActivity : [];
    const totalAll = Number(d.total_results ?? tmPreviewResultStats().total ?? rows.length);
    const totalAccessible = Number(d.accessible_results ?? rows.length);
    const restricted = Number(d.restricted_results ?? Math.max(0, totalAll - totalAccessible));
    const totalForStats = totalAccessible || rows.length;
    const buckets = rows.reduce(function(acc, row) {
        const p = Number(row.progressField || 0);
        if (p >= 100) acc.eq100++;
        else if (p >= 81) acc.b81_99++;
        else if (p >= 61) acc.b61_80++;
        else if (p >= 41) acc.b41_60++;
        else if (p >= 21) acc.b21_40++;
        else acc.lt20++;
        return acc;
    }, {lt20: 0, b21_40: 0, b41_60: 0, b61_80: 0, b81_99: 0, eq100: 0});
    const defs = [
        {key: 'lt20', label: UILANG.m('less than 20 %')},
        {key: 'b21_40', label: '21-40 %'},
        {key: 'b41_60', label: '41-60 %'},
        {key: 'b61_80', label: '61-80 %'},
        {key: 'b81_99', label: '81-99 %'},
        {key: 'eq100', label: UILANG.m('100 % (complete)')}
    ];
    const pct = function(n) { return totalForStats ? (n * 100 / totalForStats) : 0; };
    const chartRows = defs.map(function(def) {
        const count = Number(buckets[def.key] || 0);
        const percent = pct(count);
        return /* html */ `
            <div class="tmResultBarRow">
                <div class="tmResultBarLabel">${tmPreviewEscape(def.label)}</div>
                <div class="tmResultBarTrack" aria-hidden="true"><div class="tmResultBarFill" style="width:${percent}%;"></div></div>
                <div class="tmResultBarPct">${percent.toFixed(2)} % - (${count})</div>
            </div>
        `;
    }).join('');
    const rowsSorted = rows.slice().sort(function(a, b) {
        return String(b.tsActiveServer || '').localeCompare(String(a.tsActiveServer || ''));
    });
    const listTable = rowsSorted.length ? /* html */ `
        <div class="tmResultStatsListWrap">
            <div class="tmResultStatsHeader">${UILANG.m('Recent activity')}</div>
            <div class="tmResultStatsList">
                <table class="tmResultStatsTable">
                    <thead><tr><th>${UILANG.m('Test taker')}</th><th>${UILANG.m('Password')}</th><th>${UILANG.m('Last activity')}</th><th>${UILANG.m('Progress')}</th></tr></thead>
                    <tbody>
                        ${rowsSorted.map(row => /* html */ `
                            <tr>
                                <td>${tmPreviewEscape(row.testeename || '')}</td>
                                <td>${tmPreviewEscape(row.testeepass || '')}<span class="tmResultPassTag">${tmPreviewEscape(row.passtag || '')}</span></td>
                                <td>${tmPreviewEscape(tmPreviewFormatSqlDateTime(row.tsActiveServer))}</td>
                                <td class="tmResultProgressCell">${tmPreviewProgressBar(row.progressField)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    ` : /* html */ `
        <div class="tmResultStatsListWrap">
            <div class="tmResultStatsHeader">${UILANG.m('Recent activity')}</div>
            <div class="tmResultStatsList"><div class="tmResultStatsEmpty">${UILANG.m('No detailed activity available.')}</div></div>
        </div>
    `;
    const meta = /* html */ `
        <div class="tmResultStatsMeta">
            <div>${UILANG.m('Test takers with results')}: <strong>${totalAll}</strong></div>
            <div>${UILANG.m('Accessible to you')}: <strong>${totalAccessible}</strong></div>
            <div>${UILANG.m('Restricted')}: <strong>${restricted}</strong></div>
        </div>
    `;
    const content = /* html */ `
        <div class="tmResultStatsWrap">
            <div class="tmResultStatsChart"><div class="tmResultStatsHeader">${UILANG.m('Progress statistics')}</div>${chartRows}</div>
            ${listTable}
        </div>
    `;
    new nxDialog('tmPreviewStatsDialog', {
        title: UILANG.m('Test stats') + ': ' + tmPreviewEscape(serverData.testLevel.name || ''),
        contents: meta + content,
        width: 1100,
        height: 600,
        buttons: [{label: UILANG.m('Close'), default: true, cancel: true, value: 'ok'}]
    });
}
function tmPreviewTypeLabel(type) {
    const map = {
        linear: UILANG.m('Linear test'),
        fluid: UILANG.m('Fluid test'),
        mutation: UILANG.m('Mutation test'),
        routed: UILANG.m('Routed test')
    };
    return map[type] || UILANG.m(type + ' test');
}

function tmPreviewStructureElementType(type) {
    const map = {
        linear: UILANG.m('Test page'),
        fluid: UILANG.m('Fluid block'),
        mutation: UILANG.m('Linear test'),
        routed: UILANG.m('Routed element')
    };
    return map[type] || UILANG.m('Structure element');
}

function tmPreviewTestTypeIcon(type) {
    const icons = {
        linear: 'testLinear.png',
        fluid: 'testFluid.png',
        mutation: 'testMutation.png'
    };
    const icon = icons[type] || icons.linear;
    return '<img src="../inc/filer/images/' + icon + '" alt="" />';
}

function tmPreviewStateBadgeHtml(state) {
    return '<div class="tmPreviewStateCallout ' + (state === 'published' ? 'is-published' : 'is-draft') + '">' +
        '<strong>' + (state === 'published' ? UILANG.m('Published (Locked)') : UILANG.m('Draft')) + '</strong>' +
        '<span id="tmPreviewStateHelp"></span>' +
        '</div>';
}

function tmPreviewLinearMaxScore(items) {
    items = Array.isArray(items) ? items : [];
    return items.reduce(function(total, item) {
        if (item.removed) return total;
        const score = item.maxScore || (serverData.testLevel.scoring && serverData.testLevel.scoring[item.hiddenID]) || 0;
        return total + (Number(score) || 0);
    }, 0);
}

function tmPreviewLinearScoreSummary(items) {
    const score = tmPreviewLinearMaxScore(items);
    const label = score === 1 ? UILANG.m('point') : UILANG.m('points');
    return '<div class="tmPreviewStructureSummary"><strong>' + UILANG.m('Maximum achievable score') + '</strong><span>' + tmPreviewEscape(score) + ' ' + tmPreviewEscape(label) + '</span></div>';
}

function renderTestPreviewLoading() {
    previewPlausibilityResult = null;
    previewPlausibilityWarnings = {};
    $('#testPreviewContent').removeClass('tmPreviewBlank').html(
        '<div class="tmPreviewLoading">' + UILANG.m('Loading test preview...') + '</div>'
    );
}

function renderTestPreview() {
    if (!serverData.testLevel) return;
    const test = serverData.testLevel;
    const type = test.structure && test.structure.type ? test.structure.type : 'linear';
    const state = getTestState();
    const canEdit = !!(permList[test.id] && permList[test.id].editSelection);
    const stats = tmPreviewResultStats();
    const activeLanguages = tmPreviewActiveLanguages();
    const restrictions = tmPreviewOption('restrictions', {}) || {};
    const timerActive = tmPreviewOption('useTimer', false) === true;
    const timeLimit = tmPreviewOption('timeLimit', 0) || 0;
    const metaTags = test.metatags && typeof test.metatags === 'object' ? test.metatags : {};
    const skin = test.skin || {skin: UILANG.m('Not set'), skinOptions: {}};
    const mutationMethod = tmPreviewOption('mutationMethod', 'random') === 'sequential' ? UILANG.m('Sequential') : UILANG.m('Random');
    const plausibilityHtml = buildPreviewPlausibilityHtml(previewPlausibilityResult);
    const structureHtml = buildTestStructurePreviewHtml(type, test.structure ? test.structure.items : []);

    $('#testPreviewContent').removeClass('tmPreviewBlank').html(/* html */ `
        <div class="tmPreview">
            <div class="tmPreviewHeroSticky">
            <div class="tmPreviewHero tmType-${tmPreviewEscape(type)}">
                <div class="tmPreviewTypeIcon">${tmPreviewTestTypeIcon(type)}</div>
                <div class="tmPreviewHeroMain">
                    <div class="tmPreviewName">${tmPreviewEscape(test.name)}</div>
                    <div class="tmPreviewMeta">
                        <span>ID ${tmPreviewEscape(test.id)}</span>
                        <span>${tmPreviewEscape(tmPreviewTypeLabel(type))}</span>
                        ${tmPreviewStateBadgeHtml(state)}
                    </div>
                </div>
                <div class="tmPreviewActions">
                    <div class="tmPreviewActionRow">
                        ${canEdit ? '<button type="button" id="tmPreviewEditButton">' + UILANG.m('Edit test') + '</button>' : '<div class="tmPreviewReadOnly">' + UILANG.m('Read only') + '</div>'}
                    </div>
                    ${tmPreviewLastBackendEditLine(test.lastBackendEdit)}
                </div>
            </div>
            </div>

            <div class="tmPreviewBody">
            <div class="tmPreviewGrid">
                <div class="tmPreviewColumn">
                    <section class="tmPreviewCard">
                        <h3>${UILANG.m('Validity')}</h3>
                        <div class="tmPreviewSettingGrid">
                            ${tmPreviewSetting(UILANG.m('Test active'), tmPreviewBoolIcon(tmPreviewOption('onOffSwitch', false)))}
                            ${tmPreviewSetting(UILANG.m('Date restriction'), tmPreviewFormatDateRange(restrictions.dateRange))}
                            ${tmPreviewSetting(UILANG.m('Daily time restriction'), restrictions.timeRestriction ? tmPreviewEscape(restrictions.timeRestriction.start + ' - ' + restrictions.timeRestriction.end) : UILANG.m('Not set'))}
                            ${tmPreviewSetting(UILANG.m('Testing days'), tmPreviewFormatTestDays(restrictions.testDays))}
                            ${tmPreviewSetting(UILANG.m('Force logoff on inactive test'), tmPreviewBoolIcon(tmPreviewOption('forceLogoff', false)))}
                        </div>
                    </section>

                    <section class="tmPreviewCard">
                        <h3>${UILANG.m('Timer')}</h3>
                        <div class="tmPreviewSettingGrid">
                            ${tmPreviewSetting(UILANG.m('Use timer'), tmPreviewBoolIcon(timerActive))}
                            ${timerActive ? tmPreviewSetting(UILANG.m('Time limit (minutes)'), tmPreviewEscape(timeLimit)) : ''}
                        </div>
                    </section>

                    ${type === 'mutation' ? '<section class="tmPreviewCard"><h3>' + UILANG.m('Mutation') + '</h3><div class="tmPreviewSettingGrid">' + tmPreviewSetting(UILANG.m('Pick method'), mutationMethod) + '</div></section>' : buildPreviewStandardSettings(activeLanguages, skin)}

                    <section class="tmPreviewCard">
                        <h3>${UILANG.m('Meta Tags')}</h3>
                        ${buildPreviewMetaTags(metaTags)}
                    </section>
                </div>

                <div class="tmPreviewColumn">
                    ${tmPreviewResultsCard(stats)}

                    <section class="tmPreviewCard">
                        <h3>${UILANG.m('Plausibility')}</h3>
                        <div id="tmPreviewPlausibilityBody">${plausibilityHtml}</div>
                    </section>

                    <section class="tmPreviewCard tmPreviewStructureCard">
                        <h3>${UILANG.m('Test structure')}</h3>
                        ${structureHtml}
                    </section>
                </div>
            </div>
            </div>
        </div>
    `);

    if (canEdit) {
        $('#tmPreviewEditButton').on('click', function(e) {
            e.preventDefault();
            editSelection('previewBox');
        });
    }
    $('#tmPreviewStatsButton:not(:disabled)').on('click', function(e) {
        e.preventDefault();
        showPreviewResultStatsDialog();
    });
    tmPreviewAdjustStructureHeight();
    $(window).off('resize.tmPreviewStructure').on('resize.tmPreviewStructure', tmPreviewAdjustStructureHeight);
    if ($('#tmPreviewStateHelp').length) {
        const testStateHelpHtml = UILANG.m('<p><strong>Draft</strong> is the working mode for a test. You can still change the test structure and content while you are preparing it.</p><p><strong>Published (Locked)</strong> protects a test after it is ready to use. The structure and test content are locked so existing results cannot be damaged by later changes.</p><p>You can publish a draft at any time. Switching a published test back to draft may be destricted when results of test takers exist you do not have access to.</p>');
        new OasysHelp('tmPreviewStateHelp', {
            htmlContent: testStateHelpHtml,
            title: UILANG.m('Test state')
        });
    }
}

function tmPreviewSetting(label, value) {
    return '<div class="tmPreviewSetting"><span>' + tmPreviewEscape(label) + '</span><strong>' + value + '</strong></div>';
}

function buildPreviewStandardSettings(activeLanguages, skin) {
    return /* html */ `
        <section class="tmPreviewCard">
            <h3>${UILANG.m('Miscellaneous')}</h3>
            <div class="tmPreviewSettingGrid">
                ${tmPreviewSetting(UILANG.m('Save results'), tmPreviewBoolIcon(tmPreviewOption('saveResults', false)))}
                ${tmPreviewSetting(UILANG.m('Limit navigation'), tmPreviewBoolIcon(tmPreviewOption('limitNavigation', false)))}
                ${tmPreviewSetting(UILANG.m('Show score'), tmPreviewBoolIcon(tmPreviewOption('showScore', false)))}
                ${tmPreviewSetting(UILANG.m('Hide time out message'), tmPreviewBoolIcon(tmPreviewOption('hideTimeoutMsg', false)))}
                ${tmPreviewSetting(UILANG.m('Wait for media to load'), tmPreviewBoolIcon(tmPreviewOption('waitForMediaCache', false)))}
            </div>
        </section>
        <section class="tmPreviewCard">
            <h3>${UILANG.m('Languages')}</h3>
            ${activeLanguages.length ? '<div class="tmPreviewChips">' + activeLanguages.map(lang => '<span>' + tmPreviewEscape(lang.label) + '</span>').join('') + '</div>' : '<p class="tmPreviewEmpty">' + UILANG.m('No language active.') + '</p>'}
        </section>
        <section class="tmPreviewCard">
            <h3>${UILANG.m('Skin')}</h3>
            <div class="tmPreviewSettingGrid">
                ${tmPreviewSetting(UILANG.m('Skin Name'), tmPreviewEscape(skin.skin || UILANG.m('Not set')))}
                ${buildPreviewSkinOptions(skin.skinOptions || {})}
            </div>
        </section>
    `;
}

function buildPreviewSkinOptions(skinOptions) {
    const rows = [];
    $.each(skinOptions, function(key, opt) {
        let value = opt.value;
        if (opt.type === 'boolean') {
            value = tmPreviewBoolIcon(value);
        } else if (opt.type === 'intrange' && typeof value === 'string') {
            value = tmPreviewEscape(value.replace('...', ' - '));
        } else if (opt.type === 'color') {
            value = '<span class="tmPreviewSwatch" style="background:' + tmPreviewEscape(value) + ';"></span>' + tmPreviewEscape(value);
        } else {
            value = tmPreviewEscape(value);
        }
        rows.push(tmPreviewSetting(opt.name || key, value));
    });
    return rows.length ? rows.join('') : tmPreviewSetting(UILANG.m('Settings'), UILANG.m('No skin settings'));
}

function buildPreviewMetaTags(metaTags) {
    const keys = Object.keys(metaTags).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
    if (!keys.length) return '<p class="tmPreviewEmpty">' + UILANG.m('No meta tags defined.') + '</p>';
    return '<div class="tmPreviewMetaTags">' + keys.map(key => {
        const single = metaTags[key] === '';
        const value = single ? UILANG.m('single tag') : metaTags[key];
        return '<div><span>' + tmPreviewEscape(key) + '</span><strong' + (single ? ' class="tmPreviewSingleTag"' : '') + '>' + tmPreviewEscape(value) + '</strong></div>';
    }).join('') + '</div>';
}

function buildTestStructurePreviewHtml(type, items) {
    items = Array.isArray(items) ? items : [];
    const summary = type === 'linear' ? tmPreviewLinearScoreSummary(items) : '';
    if (!items.length) return summary + '<p class="tmPreviewEmpty">' + UILANG.m('No structure elements have been added yet.') + '</p>';
    const rows = items.map(function(item, index) {
        const warning = previewPlausibilityWarnings[item.hiddenID];
        let meta = '';
        let score = '';
        if (type === 'fluid') {
            const used = tmPreviewDataValue(item.itemsUsed);
            const order = tmPreviewDataValue(item.itemOrder);
            meta = tmPreviewEscape(tmPreviewStructureElementType(type)) + ' | ' + UILANG.m('Pages') + ': ' + tmPreviewEscape(used) + ' / ' + tmPreviewEscape(item.itemsTotal) + ' | ' + UILANG.m('Order') + ': ' + tmPreviewEscape(UILANG.m(order));
        } else if (type === 'mutation') {
            let maxScore = 0;
            if (item.scoring && typeof item.scoring === 'object') {
                $.each(item.scoring, function(k, v) { maxScore += Number(v) || 0; });
            } else {
                maxScore = item.scoring || 0;
            }
            meta = tmPreviewEscape(tmPreviewStructureElementType(type)) + ' | ' + UILANG.m('Pages') + ': ' + tmPreviewEscape(item.structCount || 0) + ' | ' + UILANG.m('Test id') + ': ' + tmPreviewEscape(item.hiddenID);
            score = '<span>' + UILANG.m('Max score') + ': ' + tmPreviewEscape(item.removed ? '-' : maxScore) + '</span>';
        } else {
            const itemGroup = tmPreviewEscape(item.itemGroup || '-');
            const itemGroupId = item.itemGroupId === undefined || item.itemGroupId === null || String(item.itemGroupId).trim() === ''
                ? ''
                : ' (ID ' + tmPreviewEscape(item.itemGroupId) + ')';
            meta = tmPreviewEscape(tmPreviewStructureElementType(type)) + ' | ' + tmPreviewEscape(item.code || '-') + ' | ' + itemGroup + itemGroupId;
            score = '<span>' + UILANG.m('Max score') + ': ' + tmPreviewEscape(item.maxScore || serverData.testLevel.scoring?.[item.hiddenID] || 0) + '</span>';
        }
        return /* html */ `
            <div class="tmPreviewStructureRow ${item.removed ? 'is-removed' : ''} ${warning ? 'has-warning' : ''}">
                <div class="tmPreviewStructureNo">${index + 1}</div>
                <div class="tmPreviewStructureMain">
                    <strong>${tmPreviewEscape(item.name)}</strong>
                    <span>${meta}</span>
                    ${warning ? '<em>' + tmPreviewEscape(warning) + '</em>' : ''}
                </div>
                <div class="tmPreviewStructureScore">${item.removed ? UILANG.m('Missing') : score}</div>
            </div>
        `;
    }).join('');
    return summary + '<div class="tmPreviewStructureList tmPreviewStructure-' + tmPreviewEscape(type) + '">' + rows + '</div>';
}

function launchPreviewPlausibilityCheck() {
    if (!serverData.testLevel || mode !== 'browsing') return;
    if (serverData.testLevel.structure.type === 'mutation') {
        previewPlausibilityResult = {action: 'mutationPreviewOnly'};
        renderTestPreview();
        return;
    }
    const activeLanguages = tmPreviewActiveLanguages().map(lang => lang.code);
    const token = ++ajaxRequestToken;
    pendingPreviewCheckToken = token;
    pendingPreviewCheckTestId = serverData.testLevel.id;
    startAjax(serverData.testLevel.structure.type === 'fluid' ? 'plausibilityFluidCheck' : 'plausibilityCheck', {
        id: serverData.testLevel.id,
        languages: activeLanguages,
        structure: serverData.testLevel.structure.items,
        _previewCheckToken: token,
        _previewCheckTestId: serverData.testLevel.id
    });
}

function handlePreviewPlausibilityResult(res) {
    if (res._previewCheckToken !== pendingPreviewCheckToken ||
        String(res._previewCheckTestId) !== String(pendingPreviewCheckTestId) ||
        !serverData.testLevel ||
        String(serverData.testLevel.id) !== String(res._previewCheckTestId) ||
        selection.length !== 1 ||
        selection[0].type !== 'test' ||
        String(selection[0].dbId) !== String(res._previewCheckTestId) ||
        mode !== 'browsing') {
        return;
    }
    previewPlausibilityResult = normalizePreviewPlausibilityResult(res);
    previewPlausibilityWarnings = previewPlausibilityResult.warningMap || {};
    renderTestPreview();
}

function normalizePreviewPlausibilityResult(res) {
    const result = Object.assign({}, res);
    const timerActive = tmPreviewOption('useTimer', false) === true;
    const timerLimit = Number(tmPreviewOption('timeLimit', 0) || 0);
    result.timerIssue = timerActive && timerLimit === 0;
    result.noActiveLanguage = tmPreviewActiveLanguages().length === 0;
    result.labelErrors = [];
    if (serverData.testLevel && serverData.testLevel.labels) {
        $.each(serverData.testLevel.labels, function(labelName, labelData) {
            $.each(languages, function(langCode) {
                if (tmPreviewOption(langCode, false) === true) {
                    if (labelData.button && labelData.button[langCode] === '') {
                        result.labelErrors.push({name: labelName, issue: UILANG.m('Button'), langCode: langCode});
                    }
                    if (labelData.headline && labelData.headline[langCode] === '') {
                        result.labelErrors.push({name: labelName, issue: UILANG.m('Headline'), langCode: langCode});
                    }
                }
            });
        });
    }
    result.warningMap = buildPreviewWarningMap(result);
    return result;
}

function buildPreviewWarningMap(res) {
    const map = {};
    const add = function(id, msg) {
        if (!id) return;
        map[id] = map[id] ? map[id] + ' ' + msg : msg;
    };
    $.each(res.missing_items || [], function(k, v) { add(v.hiddenID, UILANG.m('Element is missing.')); });
    $.each(res.noContentError || [], function(k, v) { add(v.hiddenID, UILANG.m('Content is missing.')); });
    $.each(res.langError || [], function(k, v) { add(v.hiddenID, UILANG.m('Language content is incomplete.')); });
    $.each(res.deletedPool || [], function(k, v) { add(v.hiddenID, UILANG.m('Testpool is missing.')); });
    $.each(res.itemsAmountError || [], function(k, v) { add(v.hiddenID, UILANG.m('Pool has fewer pages than requested.')); });
    return map;
}

function buildPreviewPlausibilityHtml(res) {
    if (!res) return '<div class="tmPreviewCheckPending">' + UILANG.m('Checking plausibility...') + '</div>';
    if (res.action === 'mutationPreviewOnly') {
        return '<div class="tmPreviewCheckNeutral">' + UILANG.m('Mutation tests use assigned linear tests. Run detailed checks on the assigned tests when needed.') + '</div>';
    }
    const issues = [];
    const add = function(level, title, detail) {
        issues.push({level: level, title: title, detail: detail});
    };
    if (res.timerIssue) add('error', UILANG.m('Timer'), UILANG.m('Your test time is set to 0 minutes.'));
    if (res.noActiveLanguage) add('error', UILANG.m('Languages'), UILANG.m('No language active. Please select at least one language!'));
    if (res.pnNoContent) add('error', UILANG.m('Privacy note'), UILANG.m('The privacy note is enabled, but content is missing for active language(s).'));
    if (res.noItems) add('warning', UILANG.m('Structure'), serverData.testLevel.structure.type === 'fluid' ? UILANG.m('No fluid testblocks have been added yet.') : UILANG.m('No pages have been added yet.'));
    if (res.missing_items) add('error', UILANG.m('Missing elements'), Object.keys(res.missing_items).length + ' ' + UILANG.m('element(s) are no longer available.'));
    if (res.deletedPool) add('error', UILANG.m('Deleted testpools'), Object.keys(res.deletedPool).length + ' ' + UILANG.m('fluid block(s) reference deleted testpools.'));
    if (res.noContentError) add('warning', UILANG.m('Empty content'), Object.keys(res.noContentError).length + ' ' + UILANG.m('element(s) have no content.'));
    if (res.langError) add('warning', UILANG.m('Language coverage'), Object.keys(res.langError).length + ' ' + UILANG.m('element(s) are missing active languages.'));
    if (res.itemsAmountError) add('warning', UILANG.m('Pool size'), Object.keys(res.itemsAmountError).length + ' ' + UILANG.m('testpool(s) have fewer pages than selected.'));
    if (res.duplicates) add('warning', UILANG.m('Duplicates'), UILANG.m('The same test page appears multiple times.'));
    if (res.labelErrors && res.labelErrors.length) add('warning', UILANG.m('Labels'), res.labelErrors.length + ' ' + UILANG.m('label translation(s) are incomplete.'));
    if (!issues.length) {
        return '<div class="tmPreviewCheckOk"><strong>' + UILANG.m('Plausibility check completed successfully!') + '</strong><span>' + UILANG.m('No issues found in your test content.') + '</span></div>';
    }
    return '<div class="tmPreviewIssueList">' + issues.map(issue =>
        '<div class="tmPreviewIssue is-' + issue.level + '"><strong>' + tmPreviewEscape(issue.title) + '</strong><span>' + tmPreviewEscape(issue.detail) + '</span></div>'
    ).join('') + '</div>';
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
                if (caller === 'error') refreshTestLibraryForBrowsing();
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

function refreshTestLibraryForBrowsing(selectId) {
    if (!loc || !loc.folder) return;
    const payload = {
        location: loc.folder,
        rebuild: true,
        showBlocked: showBlocked
    };
    const selectedId = selectId || (serverData.testLevel && serverData.testLevel.id ? 't' + serverData.testLevel.id : (selection[0] && selection[0].id));
    if (selectedId) payload.select = selectedId;
    startAjax('fetchLibrary', payload);
}

function pCheckProceed(button, btn) {
    if (button === 'edit') {
        editSelection('pCheck');
    }
}

function pCheckSuccessHtml(intro, checks) {
    return '<div class="pCheckSuccessDiv"><h3>' + UILANG.m('Plausibility check completed successfully!') + '</h3><p>' + intro + '</p><ul class="pCheckUl">' + checks.map(function(check) {
        return '<li><img src="../images/ok.png" height="15px;" />&nbsp;' + check + '</li>';
    }).join('') + '</ul></div>';
}

function pCheckUniqueRows(rows, keyFn) {
    const seen = Object.create(null);
    const uniqueRows = [];
    $.each(rows || [], function(k, row) {
        const key = keyFn(row);
        if (seen[key]) return;
        seen[key] = true;
        uniqueRows.push(row);
    });
    return uniqueRows;
}

function pCheckLanguageKey(languages) {
    if (Array.isArray(languages)) return languages.join('/');
    if (languages && typeof languages === 'object') return Object.keys(languages).map(function(key) {
        return languages[key];
    }).join('/');
    return languages || '';
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
	                gui.testpools.setItems(Array.isArray(serverData.testLevel.testpools) ? serverData.testLevel.testpools : []);
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
            resetTestStateSwitch();
            let structureItems;
            if (serverData.testLevel.structure) {
                structureItems = serverData.testLevel.structure;
            }
            if (structureItems.type === 'fluid') {
                gui.fluidStructureView.clearElements(true);
                if (structureItems.items && structureItems.items.length > 0) {
                    $.each(structureItems.items, function(key, value) {
                        if (
                            value['itemOrder'] &&
                            typeof value['itemOrder'] === 'object' &&
                            typeof value['itemOrder'].data === 'string'
                        ) {
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
                        // itemGroupId is supplemental preview metadata, not a
                        // visible sortable-table column. Keep it in serverData,
                        // but do not pass it to jsSortableTable because that
                        // component renders every enumerable property as a cell.
                        const structureRow = {...value};
                        delete structureRow.itemGroupId;
                        gui.structureView.addElement(structureRow, true);
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
            let accessCount = serverData.testLevel.activityAccess?.accessible ?? actCount;
            if (actCount > 0) {
                if (actCount === 1) {
                    tActivityData.append('<div class="aoheader_activityData">' + UILANG.m('Data from') + ' ' + actCount + ' ' + UILANG.m('test taker.') + ' ' + UILANG.m('You have access to') + ' ' + accessCount + '.</div>');
                } else {
                    tActivityData.append('<div class="aoheader_activityData">' + UILANG.m('Data from') + ' ' + actCount + ' ' + UILANG.m('test takers.') + ' ' + UILANG.m('You have access to') + ' ' + accessCount + '.</div>');
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
            let mtags = serverData.testLevel.metatags;
            let sortedKeys = Object.keys(mtags).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
            gui.metaView.setItems(mtags, true);
            updateMetaTagCounter(metaTbText, sortedKeys.length);
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
                    contents: '<div class="tmDialogForm">' +
                        '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Skin option') + '</span><strong>' + dataId + '</strong></div>' +
                        '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Value') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
                    '</div>',
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
                let html = '<div class="tmDialogForm">' +
                    '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Skin option') + '</span><strong>' + dataId + '</strong></div>' +
                    '<div class="tmDialogFormField"><label>' + UILANG.m('Range') + '</label><table style="width:100%;"><tr><td style="width:50%;"><p id="minRangeContainer">min:&nbsp;&nbsp;</p></td><td><p id=maxRangeContainer>max:&nbsp;</p></td></tr></table></div>' +
                '</div>';

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

function confirmLabelDelete(rowId) {
    return confirmTestEditorDelete(
        UILANG.m('Delete label?'),
        UILANG.m('Are you sure you want to delete the selected label?'),
        getTestLabelNameByTmpId(rowId)
    );
}

function confirmVariableDelete(rowId) {
    return confirmTestEditorDelete(
        UILANG.m('Delete variable?'),
        UILANG.m('Are you sure you want to delete the selected variable?'),
        getTestVariableNameByTmpId(rowId)
    );
}

function confirmTestEditorDelete(title, prompt, entryName) {
    const message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + prompt + '</p></div>' +
        '<div class="deleteConfirmText"><strong>' + escapeHtml(entryName) + '</strong></div></div>';
    const dialogData = {
        buttons: [{
            label: UILANG.m('Cancel'),
            'cancel': true,
            'default': true,
            value: 'cancel'
        }, {
            label: UILANG.m('Delete'),
            value: 'delete'
        }],
        contents: message,
        title: title,
        returnPromise: true,
        width: 500,
        icon: "../images/warning.png",
        iconWidth: 64
    };
    return showDialog('testEditorDeleteDialog', dialogData).then((res) => res.button === 'delete');
}

function getTestLabelNameByTmpId(rowId) {
    let labelName = UILANG.m('selected label');
    $.each(serverData.testLevel.labels, function(k, v) {
        if (v.tmpId === rowId) {
            labelName = k;
            return false;
        }
    });
    return labelName;
}

function getTestVariableNameByTmpId(rowId) {
    let variableName = UILANG.m('selected variable');
    $.each(serverData.testLevel.variables, function(k, v) {
        if (v.tmpId === rowId) {
            variableName = k;
            return false;
        }
    });
    return variableName;
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


function buildVariableDialogLanguageFields(dataFields, extraClass = '') {
    let html = '<div class="variablesEditContainer tmVariableFields' + (extraClass ? ' ' + extraClass : '') + '"><div class="tmVariableFieldList">';
    $.each(languages, function(k, v) {
        const fieldId = k + '_textLoc';
        html += '<label class="tmVariableField" for="' + escapeHtml(fieldId) + '">' +
            '<span>' + escapeHtml(v) + '</span>' +
            '<input type="text" class="lblClick" id="' + escapeHtml(fieldId) + '">' +
            '</label>';
        dataFields.push(fieldId);
    });
    html += '</div></div>';
    return html;
}

function buildLabelDialogLanguageFields(dataFields) {
    let html = '<div class="variablesEditContainer tmLabelFields"><div class="tmLabelFieldList">';
    $.each(languages, function(k, v) {
        const buttonId = k + '_button';
        const headlineId = k + '_headline';
        html += '<section class="tmLabelLanguageGroup">' +
            '<h3>' + escapeHtml(v) + '</h3>' +
            '<label class="tmLabelField" for="' + escapeHtml(buttonId) + '">' +
            '<span>' + UILANG.m('Button') + '</span>' +
            '<input type="text" class="lblClick" id="' + escapeHtml(buttonId) + '">' +
            '</label>' +
            '<label class="tmLabelField" for="' + escapeHtml(headlineId) + '">' +
            '<span>' + UILANG.m('Headline') + '</span>' +
            '<input type="text" class="lblClick" id="' + escapeHtml(headlineId) + '">' +
            '</label>' +
            '</section>';
        dataFields.push(buttonId);
        dataFields.push(headlineId);
    });
    html += '</div></div>';
    return html;
}

/* editing loc strings variables */
function editLocStrings(varName, data) {
    let srcVariable = varName;

    let dataFields = [];
    let editlocHTML = '<div class="localizationDialogContainer tmVariableDialog tmVariableDialog-edit l10nEditStringsDialog">' +
        '<div class="tmVariableIntro"><span>' + UILANG.m('Localized content for variable:') + '</span><strong>' + escapeHtml(srcVariable) + '</strong></div>' +
        buildVariableDialogLanguageFields(dataFields, 'l10nEditStringsFields') +
        '</div>';

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
            structureState: getTestState(),
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
        structureState: getTestState(),
        publishMutationChildren: isTestPublished(),
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
        const invalidPage = v.name === 'Invalid test page!';
        const pageName = invalidPage ? UILANG.m('Invalid test page!') : UILANG.e(v.name);
        mStruct.append('<tr class="smFo' + (invalidPage ? ' is-invalid' : '') + '"><td>' + structCount + '</td><td>' + pageName + '</td><td>' + sglScore + '</td></tr>');
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
        id: clickedId,
        testId: serverData.testLevel.id
    });
}

function chgItemsUsed(testType, clickedId, parentId, hiddenData, rowName) {

    let pagesUsed;
    if (hiddenData.used > hiddenData.total) {
        pagesUsed = hiddenData.total;
    } else {
        pagesUsed = hiddenData.used;
    }
    let fiuHtml = '<div class="tmFluidUsageDialog">' +
        '<div class="tmFluidUsageIntro">' + UILANG.m('Number of test pages of this testpool to be used?') + '</div>' +
        '<div class="tmFluidUsageRow">' +
            '<div class="tmFluidUsageLabel">' + UILANG.m('Pages used') + '</div>' +
            '<div class="tmFluidUsageControl" id="itemUsageDroplistDiv"></div>' +
        '</div>' +
        '<div class="tmFluidUsageMeta"><span>' + UILANG.m('Pages total') + '</span><strong>' + hiddenData.total + '</strong></div>' +
    '</div>';

    let dialogData = {
        buttons: [
            { label: UILANG.m('Cancel'), 'cancel': true, 'default': true, value: 'cancel' },
            { label: UILANG.m('Save'), value: 'save' }
        ],
        contents: fiuHtml,
        title: UILANG.m('Save number of pages used'),
        returnPromise: true,
        width: 500
    };
    showDialog('iuDialog', dialogData).then(
        (res) => {
            if (res.button === 'save') {
                let fluidStructureId = parentId.slice(21);
                startAjax('saveFluidPageUsage', {
                    id: clickedId,
                    pageUsage: pagesUsed,
                    testId: serverData.testLevel.id
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
        theme: 'backend',
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


function editDateRange(bulkMode /* optional: boolean */, seed /* optional: {start:'YYYY-MM-DDTHH:MM', end:false|'YYYY-MM-DDTHH:MM'} | false | '__keep__' */) {
    const KEEP = '__keep__';
    const isBulk = (bulkMode === true);

    let helperObj = {};
    // ORIGINAL: let dr = serverData.testLevel.options.restrictions.dateRange;
    // BULK: seed if provided (and not KEEP), else fall back to original source
    let dr;
    if (isBulk && typeof seed !== 'undefined' && seed !== KEEP) {
        dr = seed; // {start, end:false|'…'} or false
    } else {
        dr = serverData.testLevel.options.restrictions.dateRange;
    }

    let head1 = UILANG.m('Define the date range where the test will be accessible. You can set a "start" and an optional "end" date and time.');
    let html =
        '<div id="dateRestrictionEditor" class="dateRestrictionEditor">' +
            '<div id="drMessage" class="dateRestrictionIntro">' + head1 + '</div>' +
            '<div id="drTimeContainer" class="dateRestrictionSummary">' +
                '<div class="drToFromContainer">' +
                    '<div class="drToFromText">' + UILANG.m("Valid from:") + '</div>' +
                    '<div id="drTimeFromContainer" class="dateRestrictionValue">' +
                        '<div id="drFrom"></div>' +
                        '<div id="drFromTime"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="drToFromContainer">' +
                    '<div class="drToFromText">' + UILANG.m("To:") + '</div>' +
                    '<div id="drTimeToContainer" class="dateRestrictionValue">' +
                        '<div id="drTo"></div>' +
                        '<div id="drToTime"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="dateRestrictionActions"><button type="button" id="drCb"></button></div>' +
            '<div id="drTable" class="dateRestrictionGrid">' +
                '<div class="dateRestrictionCard">' +
                    '<div class="dateRestrictionCardHeader">' + UILANG.m("Start") + '</div>' +
                    '<div class="drDpCell"><div id="drDp1"></div></div>' +
                    '<div class="dateRestrictionTimeLabel">' + UILANG.m("Time:") + '</div>' +
                    '<div class="drPadd"><div id="drSlider1"></div></div>' +
                '</div>' +
                '<div class="dateRestrictionCard">' +
                    '<div class="dateRestrictionCardHeader">' + UILANG.m("End") + '</div>' +
                    '<div class="drDpCell"><div id="drDp2"></div></div>' +
                    '<div id="toTimeHead" class="dateRestrictionTimeLabel">' + UILANG.m("Time:") + '</div>' +
                    '<div class="drPadd"><div id="drSlider2"></div></div>' +
                '</div>' +
            '</div>' +
        '</div>';
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

    // IMPORTANT: return the promise so bulk callers can await the result
    const p = showDialog('drDialog', dialogData).then(
        (res) => {
            if (!isBulk) {
                // ===== ORIGINAL SIDE-EFFECT BEHAVIOR (unchanged) =====
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
                // non-bulk: callers can ignore return value
                return res;
            } else {
                // ===== BULK MODE: no writes, return a value =====
                if (res.button === 'ok') {
                    // Build from the same helper fields your UI maintains
                    const fromD = helperObj.fromDate;
                    const fromT = helperObj.fromTime;
                    // If user didn’t actually set a valid start, don’t change anything
                    if (!fromD || !fromT) return KEEP;

                    const out = { start: fromD + 'T' + fromT, end: false };
                    if (helperObj.toDate && helperObj.toTime) {
                        out.end = helperObj.toDate + 'T' + helperObj.toTime;
                    } else {
                        out.end = false;
                    }
                    return out;
                } else if (res.button === 'delete') {
                    return false;     // explicit clear
                } else {
                    return KEEP;      // cancel → keep existing
                }
            }
        }
    );

    // ====== ORIGINAL UI INITIALIZATION (unchanged) ======

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
    });

    // bulk callers await the promise; normal callers can ignore it
    return p;
}


function editTimeRestriction(bulkMode /* optional: boolean */, seed /* optional: {start:'HH:MM', end:'HH:MM'} | false | '__keep__' */) {
    const KEEP = '__keep__';

    // detect bulk
    const isBulk = (bulkMode === true);

    // get current values (seed if bulk provided; otherwise original source)
    let tr;
    if (isBulk && typeof seed !== 'undefined' && seed !== KEEP) {
        tr = seed; // {start,end} or false
    } else {
        tr = serverData.testLevel.options.restrictions.timeRestriction;
    }

    let val1, val2, value1, value2;
    if (tr === false) {
        val1 = 28800;   // 08:00
        val2 = 57600;   // 16:00
    } else {
        // Handle both normal call (tr is object) and odd seeds
        const startStr = (tr && tr.start) ? tr.start : '08:00';
        const endStr   = (tr && tr.end)   ? tr.end   : '16:00';
        val1 = time2Secs(startStr);
        val2 = time2Secs(endStr);
    }

    let head1 = UILANG.m('Move the sliders to set the start and end time of the daily test time restriction. Outside of this daily range, test takers will not be able to run the test.');
    let html =
        '<div id="timeRestrictionEditor" class="timeRestrictionEditor">' +
            '<div class="timeRestrictionIntro">' + head1 + '</div>' +
            '<div class="timeRestrictionSummary">' +
                '<div class="timeRestrictionTimeCard">' +
                    '<span>' + UILANG.m('Start') + '</span>' +
                    '<strong id="trStart"></strong>' +
                '</div>' +
                '<div class="timeRestrictionTimeCard">' +
                    '<span>' + UILANG.m('End') + '</span>' +
                    '<strong id="trEnd"></strong>' +
                '</div>' +
            '</div>' +
            '<div class="timeRestrictionSliderCard">' +
                '<div class="timeRestrictionSliderHeader">' + UILANG.m('Allowed daily time window') + '</div>' +
                '<div id="trSlider"></div>' +
            '</div>' +
        '</div>';

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

    // IMPORTANT: we return the promise so bulk callers can await it
    const p = showDialog('timeRestrictionDialog', dialogData).then(
        (res) => {
            if (!isBulk) {
                // === ORIGINAL SIDE-EFFECT BEHAVIOR (unchanged) ===
                if (res.button === 'ok') {
                    serverData.testLevel.options.restrictions.timeRestriction = {};
                    serverData.testLevel.options.restrictions.timeRestriction.start = value1;
                    serverData.testLevel.options.restrictions.timeRestriction.end = value2;
                    optionsChanged('restrictionChange', false, false, 'timeRestriction');
                } else if (res.button === 'delete') {
                    serverData.testLevel.options.restrictions.timeRestriction = false;
                    optionsChanged('restrictionChange', false, false, 'timeRestriction');
                }
                // for non-bulk, nothing to return/consume
                return res;
            } else {
                // === BULK MODE: no writes, return a value ===
                if (res.button === 'ok') {
                    // return the chosen values (strings 'HH:MM')
                    return { start: value1, end: value2 };
                } else if (res.button === 'delete') {
                    return false; // explicit remove
                } else {
                    return KEEP;  // cancel → keep existing
                }
            }
        }
    );

    // Keep original UI behavior & timing (initialize immediately after opening)
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

    // In non-bulk mode callers can ignore the return value; in bulk mode they can await it
    return p;
}


function editTestDays(bulkMode /* optional: boolean */, seed /* optional: {days:'0,1,...'} | false | '__keep__' */) {
    const KEEP = '__keep__';
    const isBulk = (bulkMode === true);

    let days;
    let helperObj;

    let head1 = UILANG.m('On all selected days, test takers will be able to run the test. Unselect the week days the test should not be active and accessible.');
    let html =
        '<div id="testingDaysEditor" class="testingDaysEditor">' +
            '<div class="testingDaysIntro">' + head1 + '</div>' +
            '<div class="testingDaysPanel">' +
                '<div class="testingDaysPanelHeader">' + UILANG.m('Allowed testing days') + '</div>' +
                '<div class="weekDaysTable testingDaysGrid">' +
                    '<div class="weekDaysRow">' +
                        '<div data-0 class="weekDaysCells"></div>' +
                        '<div data-1 class="weekDaysCells"></div>' +
                        '<div data-2 class="weekDaysCells"></div>' +
                        '<div data-3 class="weekDaysCells"></div>' +
                        '<div data-4 class="weekDaysCells"></div>' +
                        '<div data-5 class="weekDaysCells"></div>' +
                        '<div data-6 class="weekDaysCells"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
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

    const p = showDialog('testDaysDialog', dialogData).then(
        (res) => {
            if (!isBulk) {
                // ===== ORIGINAL SIDE-EFFECT BEHAVIOR (unchanged) =====
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
                // non-bulk callers ignore return value
                return res;
            } else {
                // ===== BULK MODE: no writes, return a value =====
                if (res.button === 'ok') {
                    let hlp = '';
                    $.each(helperObj, function(k, v) {
                        $.each($(v).data(), function(k, v) {
                            hlp += k + ',';
                        });
                    });
                    hlp = hlp.slice(0, -1);

                    if (hlp === '0,1,2,3,4,5,6' || hlp === '') {
                        return false;                 // no restriction if all or none selected
                    }
                    return { days: hlp };
                } else if (res.button === 'delete') {
                    return false;                     // explicit delete
                } else {
                    return KEEP;                      // cancel → keep existing
                }
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

    // ===== get current values (seed for bulk, serverData for normal) =====
    let td;
    if (isBulk && typeof seed !== 'undefined' && seed !== KEEP) {
        td = seed;                                   // {days:'...'} or false
    } else {
        td = serverData.testLevel.options.restrictions.testDays;
    }

    if (td === false) {
        // original behavior: toggle all to selected to indicate "no restriction"
        $('.weekDaysCells').toggleClass('daySelected');
    } else if (td && td.days) {
        days = td.days.split(',');
        $.each(days, function(k, v) {
            $('div[data-' + v + ']').toggleClass('daySelected');
        });
    }
    helperObj = ($('.daySelected'));
    $('.weekDaysCells').on('click', function() {
        $(this).toggleClass('daySelected');
        helperObj = ($('.daySelected'));
    });

    // In bulk mode, callers await the return; in normal mode, return value is ignored.
    return p;
}



function editScripts(testType, clickedId, parentId, scriptObj, rowName) {
    let editScriptsHTML =
        '<div id="editScriptsDIV">' +
        '<h3>' + UILANG.m('Edit scripts for:') + ' <span class="soValue">"' + rowName + '"</span></h3>' +
        '<ul class="showTabs">' +
        '<li><a href="#editScriptsTabs-pre">Pre</a></li>' +
        '<li><a href="#editScriptsTabs-post">Post</a></li>' +
        '<li><a href="#editScriptsTabs-onActivity">on Activity</a></li>' +
        '</ul>' +
        '<div id="editScriptsTabs-pre"><textarea id="scriptsTextAreaPre" spellcheck="false"></textarea></div>' +
        '<div id="editScriptsTabs-post"><textarea id="scriptsTextAreaPost" spellcheck="false"></textarea></div>' +
        '<div id="editScriptsTabs-onActivity"><textarea id="scriptsTextAreaOnActivity" spellcheck="false"></textarea></div>' +
        '</div>';
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Testpool name') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
            '</div>',
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Test pool name') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
            '</div>',
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
        let message = sf('<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following testpool?') + '</p></div><div class="deleteConfirmText"><strong>%@</strong></div></div>', sel.name);
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Folder name') + '</label><input type="text" maxlength="200" id="dialogField1"></div>' +
            '</div>',
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
        contents: '<div class="tmDialogForm">' +
            '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Test name') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
            '<div class="tmDialogFormField"><label>' + UILANG.m('Type of test') + '<span id="testHelp"></span></label><div id="dialogField2"></div></div>' +
        '</div>',
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

                // Start new editable tests with the user's preferred page language enabled.
                if (ttChg !== 'mutation' && Object.hasOwn(languages, settings.defaultLanguage)) {
                    optionsData[settings.defaultLanguage] = true;
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
    const testHelpHtml = OasysHelp.layout({
        lead: UILANG.m('When creating a new test in OASYS, select the test type that best fits your testing needs.'),
        items: [{
            title: UILANG.m('Linear Tests:'),
            text: UILANG.m('Linear tests are composed of test pages that are presented in a specified order. The entire set of pages is used in the sequence defined during test creation.')
        }, {
            title: UILANG.m('Fluid Tests:'),
            text: UILANG.m('Fluid tests are composed of test blocks. Each block refers to a test pool, and can use all or selected items or stimuli in a specified or random order.')
        }, {
            title: UILANG.m('Mutation Tests:'),
            text: UILANG.m('Mutation tests are composed of linear tests. Each launch starts one assigned linear test, selected randomly or sequentially depending on the configuration.')
        }],
        note: UILANG.m('Choose the structure that matches how the test should be delivered to test takers.')
    });
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
        theme: 'backend',
        readOnly: false,
        width: '100%'
    };
    let ddFallbackList = new jsDropList('dialogField2', 'tTypeChooser', testTypeOpt);
    function testTypeChg(sender, typ, dirty, dataId) {
        ttChg = typ;
    }
}

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
        } else {
            const testType = (obj.testStructure && obj.testStructure.type) || (obj.structure && obj.structure.type) || obj.testType || 'linear';
            type += ' typetest-' + testType;
        }
        message += sf('<li class="%@">%@</li>', type, obj.label);
    }
    message += '</ul>';
    message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('really_delete') + '</p></div>' + message + '<p class="deleteConfirmWarning">' + UILANG.m('WARNING: Recorded data for the chosen tests will also be deleted.') + '</p>';
    if (foldersInSelection) {
        message += '<p class="deleteConfirmWarning">' + UILANG.m('warning_recursive') + '</p>';
    }
    message += '</div>';
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

function resetResults() {
    const description = selection.length === 1 && selection[0].type !== 'folder'
        ? sf(UILANG.m('Accessible results of the test "%@" will be deleted.'), escapeHtml(serverData.testLevel.name))
        : UILANG.m('Accessible results of the selected tests will be deleted.');
    const now = new Date();
    const dateNow = ('0' + now.getDate()).slice(-2) + '.' + ('0' + (now.getMonth() + 1)).slice(-2) + '.' + now.getFullYear();
    const hourOptions = Array.from({length: 24}, (_, hour) => {
        const value = ('0' + hour).slice(-2);
        return '<option value="' + value + '"' + (hour === now.getHours() ? ' selected' : '') + '>' + value + '</option>';
    }).join('');
    const minuteOptions = Array.from({length: 60}, (_, minute) => {
        const value = ('0' + minute).slice(-2);
        return '<option value="' + value + '"' + (minute === now.getMinutes() ? ' selected' : '') + '>' + value + '</option>';
    }).join('');
    const message = '<div class="tmActionConfirm tmActionConfirm-warning">' +
        '<div class="tmActionConfirmHeading"><strong>' + UILANG.m('Ready to reset') + '</strong><span id="testResetDateHelp"></span></div>' +
        '<span>' + description + '</span>' +
        '<div class="tmResetFilter">' +
            '<label for="testResetScope">' + UILANG.m('Delete') + '</label>' +
            '<select id="testResetScope">' +
                '<option value="all">' + UILANG.m('Everything') + '</option>' +
                '<option value="before">' + UILANG.m('Before date and time') + '</option>' +
                '<option value="after">' + UILANG.m('On or after date and time') + '</option>' +
            '</select>' +
            '<div id="testResetCutoffField" class="tmResetCutoff" hidden>' +
                '<label for="testResetCutoffDate">' + UILANG.m('Date and time') + '</label>' +
                '<div class="tmResetDateTime">' +
                    '<input id="testResetCutoffDate" type="text" inputmode="numeric" autocomplete="off" value="' + dateNow + '">' +
                    '<select id="testResetCutoffHour" aria-label="' + UILANG.m('Hour') + '">' + hourOptions + '</select>' +
                    '<span aria-hidden="true">:</span>' +
                    '<select id="testResetCutoffMinute" aria-label="' + UILANG.m('Minute') + '">' + minuteOptions + '</select>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
    '</div>';
    let resetSubmitted = false;
    const submitReset = function (values) {
        if (resetSubmitted) return true;
        const resetMode = values.testResetScope || 'all';
        let resetCutoff = null;
        if (resetMode !== 'all') {
            let cutoff = null;
            try {
                cutoff = $.datepicker.parseDate('dd.mm.yy', values.testResetCutoffDate);
                cutoff.setHours(Number(values.testResetCutoffHour), Number(values.testResetCutoffMinute), 0, 0);
            } catch (error) {
                cutoff = null;
            }
            if (!cutoff || Number.isNaN(cutoff.getTime())) return false;
            resetCutoff = Math.floor(cutoff.getTime() / 1000);
        }
        resetSubmitted = true;
        startAjax('resetResults', {selection: selection, resetMode: resetMode, resetCutoff: resetCutoff});
        return true;
    };
    const resetData = {
        buttons: [{label: UILANG.m('cancel'), cancel: true, default: true, value: 'cancel'}, {
            label: UILANG.m('Reset'), value: 'ok'
        }],
        contents: message,
        datafields: ['testResetScope', 'testResetCutoffDate', 'testResetCutoffHour', 'testResetCutoffMinute'],
        dataFormat: 'object',
        callback: function (button, values) {
            if (button === 'ok' && !submitReset(values)) {
                window.setTimeout(() => showMessage(UILANG.m('Please enter a valid date and time.')), 0);
            }
        },
        width: 600,
        title: UILANG.m('Reset test results?'),
        type: 'warning'
    };
    const resetDialog = new nxDialog('resetDialog', resetData);
    $('#resetDialog_button_1').on('click.resetFallback', function (event) {
        if (!document.documentElement.contains(this)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const submitted = submitReset({
            testResetScope: $('#testResetScope').val(),
            testResetCutoffDate: $('#testResetCutoffDate').val(),
            testResetCutoffHour: $('#testResetCutoffHour').val(),
            testResetCutoffMinute: $('#testResetCutoffMinute').val()
        });
        if (submitted && window.nxDialogManager.instances.resetDialog) resetDialog.dismiss();
    });
    $('#testResetScope').on('change', function () {
        $('#testResetCutoffField').prop('hidden', this.value === 'all');
    });
    $('#testResetCutoffDate').datepicker({
        dateFormat: 'dd.mm.yy', firstDay: 1, showOtherMonths: true, selectOtherMonths: true,
        beforeShow: () => $('#ui-datepicker-div').addClass('tmResetDatePicker'),
        onClose: () => $('#ui-datepicker-div').removeClass('tmResetDatePicker'),
        onSelect: function () { $(this).datepicker('hide').trigger('blur'); }
    });
    new OasysHelp('testResetDateHelp', {
        size: '16px', maxWidth: '460px', linkDecoration: 'none', title: UILANG.m('Date filtering'),
        htmlContent: OasysHelp.layout({
            lead: UILANG.m('Each complete test result and its scoring data are filtered by the last recorded activity.'),
            note: UILANG.m('Only results belonging to test takers you can access are deleted. Inaccessible results remain recorded.')
        })
    });
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
    gui.library.filerSearch('', {metaSearch: true});
}

function correctData() {
    if (serverData && serverData.testLevel) {
        if (serverData.testLevel.options instanceof Array) serverData.testLevel.options = {};
        if (!serverData.testLevel.structure) serverData.testLevel.structure = {};
        if (!serverData.testLevel.structure.state) serverData.testLevel.structure.state = 'draft';
    }
}

//Testpools editor
function testpools() {
    if (isTestPublished() && serverData.testLevel.structure.type === 'fluid') {
        showMessage(UILANG.m('This test is Published (Locked). Test pools cannot be created or edited while the test is locked.'), 'warning');
        return;
    }
    gui.s2.fadeOut(0);
    gui.s6.fadeOut(0);
    gui.s4.fadeIn(0);
    gui.s5.fadeIn(0);
    $('#vdivider').hide();
    $('#metaDivider').hide();
    mode = 'poolEdit';
    switchMode();
}

//Labels editor
function labels() {
    if (isTestPublished() && serverData.testLevel.structure.type !== 'mutation') {
        showMessage(UILANG.m('This test is Published (Locked). Labels cannot be edited while the test is locked.'), 'warning');
        return;
    }
    if (serverData.testLevel.structure.type === 'fluid') {
        gui.s6.fadeOut(0);
    } else {
        gui.s3.fadeOut(0);
    }
    gui.s2.fadeOut(0);
    gui.s7.fadeIn(0);
    $('#vdivider').hide();
    $('#metaDivider').hide();
    mode = 'labelEdit';
    switchMode();
}

//Variables editor
function variables() {
    if (isTestPublished() && serverData.testLevel.structure.type !== 'mutation') {
        showMessage(UILANG.m('This test is Published (Locked). Test variables cannot be edited while the test is locked.'), 'warning');
        return;
    }
    if (serverData.testLevel.structure.type === 'fluid') {
        gui.s6.fadeOut(0);
    } else {
        gui.s3.fadeOut(0);
    }
    gui.s2.fadeOut(0);
    gui.s8.fadeIn(0);
    $('#vdivider').hide();
    $('#metaDivider').hide();
    mode = 'variablesEdit';
    switchMode();
}

function clearTestStructure() {
    if (!serverData.testLevel || !serverData.testLevel.structure) return;

    const testType = serverData.testLevel.structure.type;
    const items = serverData.testLevel.structure.items || [];
    if (!items.length) return;

    const descriptions = {
        linear: UILANG.m('This removes all test pages from this test. The test pages themselves are not deleted.'),
        fluid: UILANG.m('This clears the fluid test structure. The configured test pools are kept.'),
        mutation: UILANG.m('This removes all assigned linear tests from this mutation test. The assigned tests themselves are not deleted.')
    };
    let contents = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' +
        UILANG.m('Are you sure you want to clear the complete test structure?') +
        '</p><p>' + descriptions[testType] + '</p>';
    if ($(serverData.testLevel.activityData).length > 0) {
        contents += '<p><strong>' + UILANG.m('Recorded results may no longer be accessible after this change.') + '</strong></p>';
    }
    contents += '</div></div>';

    const dialogData = {
        buttons: [{
            label: UILANG.m('Cancel'),
            cancel: true,
            default: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Clear structure'),
            value: 'clear'
        }],
        contents: contents,
        title: UILANG.m('Clear test structure'),
        returnPromise: true,
        width: 620,
        icon: '../images/warning.png',
        iconWidth: 64
    };

    showDialog('clearTestStructureDialog', dialogData).then(function(res) {
        if (res.button !== 'clear') return;
        const payload = {
            testId: serverData.testLevel.id
        };
        if (testType !== 'mutation') {
            payload.currentSkin = serverData.testLevel.skin.skin;
        }
        startAjax('clearTestStructure', payload);
    });
}

function openExistingEditorEntriesDialog(entryType) {
    if (!serverData.testLevel || !serverData.testLevel.id) return;

    const isLabelEditor = entryType === 'labels';
    const entryLabel = UILANG.m(isLabelEditor ? 'labels' : 'variables');
    const dialogId = isLabelEditor ? 'loadExistingLabelsDialog' : 'loadExistingVariablesDialog';
    const prefix = isLabelEditor ? 'tmExistingLabels' : 'tmExistingVariables';
    const currentEntries = isLabelEditor
        ? (serverData.testLevel.labels || {})
        : (serverData.testLevel.variables || {});
    let templates = [];
    let selectedTemplate = null;
    let selectedNames = new Set();
    let replaceExisting = false;

    const dialogData = {
        buttons: [{
            label: UILANG.m('Cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Load selected'),
            default: true,
            disabled: true,
            value: 'load'
        }],
        contents:
            '<div class="tmExistingEntriesDialog">' +
            '<aside class="tmExistingEntriesSources">' +
            '<label class="tmExistingEntriesFilter" for="' + prefix + 'Filter">' +
            '<span>' + UILANG.m('Filter tests') + '</span>' +
            '<input id="' + prefix + 'Filter" type="text" autocomplete="off">' +
            '</label>' +
            '<div id="' + prefix + 'Tests" class="tmExistingEntriesTestList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Loading available tests...') + '</div>' +
            '</div>' +
            '</aside>' +
            '<section class="tmExistingEntriesSelection">' +
            '<div class="tmExistingEntriesSelectionHeader">' +
            '<div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Source test') + '</span>' +
            '<strong id="' + prefix + 'SourceTitle">' + UILANG.m('Select a test') + '</strong></div>' +
            '<div class="tmExistingEntriesSelectionActions">' +
            '<button id="' + prefix + 'SelectAll" type="button" disabled>' + UILANG.m('Select all') + '</button>' +
            '<button id="' + prefix + 'SelectNone" type="button" disabled>' + UILANG.m('Deselect all') + '</button>' +
            '</div>' +
            '</div>' +
            '<div id="' + prefix + 'Entries" class="tmExistingEntriesEntryList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a test to see its') + ' ' + entryLabel + '.</div>' +
            '</div>' +
            '<label class="tmExistingEntriesReplace" for="' + prefix + 'Replace">' +
            '<input id="' + prefix + 'Replace" type="checkbox">' +
            '<span>' + UILANG.m('Replace entries with the same name') + '</span>' +
            '</label>' +
            '<div id="' + prefix + 'Summary" class="tmExistingEntriesSummary">' + UILANG.m('No entries selected.') + '</div>' +
            '</section>' +
            '</div>',
        title: UILANG.m('Load existing') + ' ' + entryLabel,
        width: 1020,
        returnPromise: true,
        replaceExisting: dialogId
    };
    const loadDialogResult = new nxDialog(dialogId, dialogData);
    const loadDialog = window.nxDialogManager.instances[dialogId];

    loadDialogResult.then(function(res) {
        if (res.button !== 'load' || !selectedTemplate || selectedNames.size === 0) return;
        startAjax('importEditorEntries', {
            testId: serverData.testLevel.id,
            sourceTestId: selectedTemplate.id,
            entryType: entryType,
            names: Array.from(selectedNames),
            replaceExisting: replaceExisting
        });
    });

    function updateSummary() {
        const selectedCount = selectedNames.size;
        const existingCount = Array.from(selectedNames).filter(function(name) {
            return Object.prototype.hasOwnProperty.call(currentEntries, name);
        }).length;
        let summary = UILANG.m('No entries selected.');
        if (selectedCount > 0) {
            summary = selectedCount + ' ' + UILANG.m(selectedCount === 1 ? 'entry selected.' : 'entries selected.');
            if (existingCount > 0) {
                summary += ' ' + existingCount + ' ' + UILANG.m(existingCount === 1 ? 'entry already exists.' : 'entries already exist.');
            }
            loadDialog.enableButton('load');
        } else {
            loadDialog.disableButton('load');
        }
        $('#' + prefix + 'Summary').text(summary);
    }

    function renderEntries() {
        const $entryList = $('#' + prefix + 'Entries').empty();
        const $sourceTitle = $('#' + prefix + 'SourceTitle');
        const $selectAll = $('#' + prefix + 'SelectAll');
        const $selectNone = $('#' + prefix + 'SelectNone');
        selectedNames = new Set();

        if (!selectedTemplate) {
            $sourceTitle.text(UILANG.m('Select a test'));
            $selectAll.prop('disabled', true);
            $selectNone.prop('disabled', true);
            $entryList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a test to see its') + ' ' + entryLabel + '.</div>');
            updateSummary();
            return;
        }

        const entries = selectedTemplate.entries || [];
        $sourceTitle.text(selectedTemplate.name);
        $selectAll.prop('disabled', entries.length === 0);
        $selectNone.prop('disabled', entries.length === 0);
        if (!entries.length) {
            $entryList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This test has no') + ' ' + entryLabel + '.</div>');
            updateSummary();
            return;
        }

        $.each(entries, function(_, entry) {
            const exists = Object.prototype.hasOwnProperty.call(currentEntries, entry.name);
            const $checkbox = $('<input type="checkbox">').val(entry.name);
            const $row = $('<label class="tmExistingEntriesEntry"></label>').append($checkbox);
            const $content = $('<span class="tmExistingEntriesEntryContent"></span>')
                .append($('<strong></strong>').text(entry.name));
            if (entry.preview) $content.append($('<small></small>').text(entry.preview));
            $row.append($content);
            if (exists) {
                $row.addClass('tmExistingEntriesEntryConflict')
                    .append($('<span class="tmExistingEntriesConflictBadge"></span>').text(UILANG.m('Already exists')));
            }
            $checkbox.on('change', function() {
                if (this.checked) selectedNames.add(entry.name);
                else selectedNames.delete(entry.name);
                updateSummary();
            });
            $entryList.append($row);
        });
        updateSummary();
    }

    function renderTestList(filter) {
        const $list = $('#' + prefix + 'Tests').empty();
        const query = String(filter || '').trim().toLocaleLowerCase();
        selectedTemplate = null;
        renderEntries();
        const visibleTemplates = templates.filter(function(template) {
            return !query || String(template.name || '').toLocaleLowerCase().indexOf(query) !== -1;
        });
        if (!visibleTemplates.length) {
            $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No accessible tests with') + ' ' + entryLabel + ' ' + UILANG.m('were found.') + '</div>');
            return;
        }
        $.each(visibleTemplates, function(_, template) {
            const $row = $('<button type="button" class="tmExistingEntriesTest"></button>')
                .text(template.name)
                .attr('title', template.name)
                .on('click', function() {
                    $('#' + prefix + 'Tests .tmExistingEntriesTest').removeClass('tmExistingEntriesTestSelected');
                    $row.addClass('tmExistingEntriesTestSelected');
                    selectedTemplate = template;
                    renderEntries();
                });
            $list.append($row);
        });
    }

    $('#' + prefix + 'Filter').on('input', function() {
        renderTestList($(this).val());
    });
    $('#' + prefix + 'Replace').on('change', function() {
        replaceExisting = this.checked;
    });
    $('#' + prefix + 'SelectAll').on('click', function() {
        if (!selectedTemplate) return;
        selectedNames = new Set((selectedTemplate.entries || []).map(function(entry) {
            return entry.name;
        }));
        $('#' + prefix + 'Entries input[type="checkbox"]').prop('checked', true);
        updateSummary();
    });
    $('#' + prefix + 'SelectNone').on('click', function() {
        selectedNames = new Set();
        $('#' + prefix + 'Entries input[type="checkbox"]').prop('checked', false);
        updateSummary();
    });

    startAjax('fetchEditorEntryTemplates', {
        entryType: entryType,
        targetTestId: serverData.testLevel.id
    }).then(function(res) {
        templates = res && res.data && Array.isArray(res.data.editorEntryTemplates)
            ? res.data.editorEntryTemplates
            : [];
        renderTestList('');
    }).catch(function() {
        templates = [];
        renderTestList('');
    });
}

function openExistingStructureDialog() {
    if (!serverData.testLevel || !serverData.testLevel.id || !serverData.testLevel.structure || serverData.testLevel.structure.type !== 'linear') return;
    if (isTestPublished()) {
        showMessage(UILANG.m('This test is Published (Locked). The test structure cannot be changed while the test is locked.'), 'warning');
        return;
    }

    const prefix = 'tmExistingStructure';
    const currentItems = serverData.testLevel.structure.items || [];
    const currentIds = new Set(currentItems.map(function(item) {
        return String(item.hiddenID);
    }));
    let templates = [];
    let selectedTemplate = null;
    let selectedPageIds = new Set();

    const dialogData = {
        buttons: [{
            label: UILANG.m('Cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Import structure'),
            default: true,
            disabled: true,
            value: 'load'
        }],
        contents:
            '<div class="tmExistingEntriesDialog tmExistingStructureDialog">' +
            '<aside class="tmExistingEntriesSources">' +
            '<label class="tmExistingEntriesFilter" for="' + prefix + 'Filter">' +
            '<span>' + UILANG.m('Filter tests') + '</span>' +
            '<input id="' + prefix + 'Filter" type="text" autocomplete="off">' +
            '</label>' +
            '<div id="' + prefix + 'Tests" class="tmExistingEntriesTestList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Loading available tests...') + '</div>' +
            '</div>' +
            '</aside>' +
            '<section class="tmExistingEntriesSelection">' +
            '<div class="tmExistingEntriesSelectionHeader">' +
            '<div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Source test') + '</span>' +
            '<strong id="' + prefix + 'SourceTitle">' + UILANG.m('Select a test') + '</strong></div>' +
            '<div class="tmExistingEntriesSelectionActions">' +
            '<button id="' + prefix + 'SelectAll" type="button" disabled>' + UILANG.m('Select all') + '</button>' +
            '<button id="' + prefix + 'SelectNone" type="button" disabled>' + UILANG.m('Deselect all') + '</button>' +
            '</div>' +
            '</div>' +
            '<div id="' + prefix + 'Pages" class="tmExistingEntriesEntryList tmExistingStructurePageList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a test to see its structure.') + '</div>' +
            '</div>' +
            '<div id="' + prefix + 'Summary" class="tmExistingEntriesSummary">' + UILANG.m('No test pages selected.') + '</div>' +
            '</section>' +
            '</div>',
        title: UILANG.m('Load existing structure'),
        width: 1020,
        returnPromise: true,
        replaceExisting: 'loadExistingStructureDialog'
    };
    const dialogResult = new nxDialog('loadExistingStructureDialog', dialogData);
    const loadDialog = window.nxDialogManager.instances.loadExistingStructureDialog;

    dialogResult.then(function(res) {
        if (res.button !== 'load' || !selectedTemplate || selectedPageIds.size === 0) return;
        startAjax('importLinearStructureFromTemplate', {
            targetTestId: serverData.testLevel.id,
            sourceTestId: selectedTemplate.id,
            pageIds: Array.from(selectedPageIds)
        });
    });

    function selectablePages() {
        if (!selectedTemplate) return [];
        return (selectedTemplate.pages || []).filter(function(page) {
            return page.exists && page.canRead !== false && !currentIds.has(String(page.hiddenID));
        });
    }

    function updateSummary() {
        const selectedCount = selectedPageIds.size;
        const missingCount = selectedTemplate ? (selectedTemplate.pages || []).filter(function(page) {
            return !page.exists;
        }).length : 0;
        const blockedCount = selectedTemplate ? (selectedTemplate.pages || []).filter(function(page) {
            return page.exists && page.canRead === false;
        }).length : 0;
        const duplicateCount = selectedTemplate ? (selectedTemplate.pages || []).filter(function(page) {
            return page.exists && page.canRead !== false && currentIds.has(String(page.hiddenID));
        }).length : 0;

        let summary = UILANG.m('No test pages selected.');
        if (selectedCount > 0) {
            summary = selectedCount + ' ' + UILANG.m(selectedCount === 1 ? 'test page selected.' : 'test pages selected.');
        }
        if (missingCount > 0) {
            summary += ' ' + missingCount + ' ' + UILANG.m(missingCount === 1 ? 'missing reference will be skipped.' : 'missing references will be skipped.');
        }
        if (blockedCount > 0) {
            summary += ' ' + blockedCount + ' ' + UILANG.m(blockedCount === 1 ? 'page is not accessible.' : 'pages are not accessible.');
        }
        if (duplicateCount > 0) {
            summary += ' ' + duplicateCount + ' ' + UILANG.m(duplicateCount === 1 ? 'page is already in this test.' : 'pages are already in this test.');
        }

        $('#' + prefix + 'Summary').text(summary);
        if (selectedCount > 0) loadDialog.enableButton('load');
        else loadDialog.disableButton('load');
    }

    function renderPages() {
        const $pageList = $('#' + prefix + 'Pages').empty();
        const $sourceTitle = $('#' + prefix + 'SourceTitle');
        const $selectAll = $('#' + prefix + 'SelectAll');
        const $selectNone = $('#' + prefix + 'SelectNone');
        selectedPageIds = new Set();

        if (!selectedTemplate) {
            $sourceTitle.text(UILANG.m('Select a test'));
            $selectAll.prop('disabled', true);
            $selectNone.prop('disabled', true);
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a test to see its structure.') + '</div>');
            updateSummary();
            return;
        }

        const pages = selectedTemplate.pages || [];
        const importablePages = selectablePages();
        $sourceTitle.text(selectedTemplate.name);
        $selectAll.prop('disabled', importablePages.length === 0);
        $selectNone.prop('disabled', importablePages.length === 0);
        if (!pages.length) {
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This linear test has no test pages.') + '</div>');
            updateSummary();
            return;
        }

        selectedPageIds = new Set(importablePages.map(function(page) {
            return String(page.hiddenID);
        }));

        $.each(pages, function(_, page) {
            const pageId = String(page.hiddenID);
            const missing = !page.exists;
            const blocked = page.exists && page.canRead === false;
            const duplicate = page.exists && !blocked && currentIds.has(pageId);
            const disabled = missing || blocked || duplicate;
            const $checkbox = $('<input type="checkbox">').val(pageId).prop('disabled', disabled);
            if (!disabled) $checkbox.prop('checked', selectedPageIds.has(pageId));

            const $row = $('<label class="tmExistingEntriesEntry tmExistingStructurePage"></label>').append($checkbox);
            if (missing) $row.addClass('tmExistingStructureMissing');
            if (blocked) $row.addClass('tmExistingStructureMissing');
            if (duplicate) $row.addClass('tmExistingStructureDuplicate');

            const subline = missing
                ? UILANG.m('Missing test page reference') + ' ID: ' + pageId
                : blocked
                    ? UILANG.m('You do not have read access to this test page.')
                : [page.itemGroup, page.code ? UILANG.m('Code') + ': ' + page.code : ''].filter(Boolean).join(' · ');
            const $content = $('<span class="tmExistingEntriesEntryContent"></span>')
                .append($('<strong></strong>').text(missing ? UILANG.m('Test page has been deleted!') : (blocked ? UILANG.m('Blocked test page') : page.name)))
                .append($('<small></small>').text(subline));
            $row.append($content);
            if (missing) {
                $row.append($('<span class="tmExistingEntriesConflictBadge tmExistingStructureMissingBadge"></span>').text(UILANG.m('Missing')));
            } else if (blocked) {
                $row.append($('<span class="tmExistingEntriesConflictBadge tmExistingStructureMissingBadge"></span>').text(UILANG.m('No access')));
            } else if (duplicate) {
                $row.append($('<span class="tmExistingEntriesConflictBadge"></span>').text(UILANG.m('Already in test')));
            } else if (Number(page.maxScore) > 0) {
                $row.append($('<span class="tmExistingStructureScoreBadge"></span>').text(page.maxScore + ' ' + UILANG.m(Number(page.maxScore) === 1 ? 'point' : 'points')));
            }

            $checkbox.on('change', function() {
                if (this.checked) selectedPageIds.add(pageId);
                else selectedPageIds.delete(pageId);
                updateSummary();
            });
            $pageList.append($row);
        });
        updateSummary();
    }

    function renderTestList(filter) {
        const $list = $('#' + prefix + 'Tests').empty();
        const query = String(filter || '').trim().toLocaleLowerCase();
        selectedTemplate = null;
        renderPages();
        const visibleTemplates = templates.filter(function(template) {
            return !query || String(template.name || '').toLocaleLowerCase().indexOf(query) !== -1;
        });
        if (!visibleTemplates.length) {
            $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No accessible linear tests with a structure were found.') + '</div>');
            return;
        }
        $.each(visibleTemplates, function(_, template) {
            const pageCount = (template.pages || []).length;
            const $row = $('<button type="button" class="tmExistingEntriesTest tmExistingStructureTest"></button>')
                .attr('title', template.name)
                .append($('<strong></strong>').text(template.name))
                .append($('<small></small>').text(pageCount + ' ' + UILANG.m(pageCount === 1 ? 'test page' : 'test pages')))
                .on('click', function() {
                    $('#' + prefix + 'Tests .tmExistingEntriesTest').removeClass('tmExistingEntriesTestSelected');
                    $row.addClass('tmExistingEntriesTestSelected');
                    selectedTemplate = template;
                    renderPages();
                });
            $list.append($row);
        });
    }

    $('#' + prefix + 'Filter').on('input', function() {
        renderTestList($(this).val());
    });
    $('#' + prefix + 'SelectAll').on('click', function() {
        selectedPageIds = new Set(selectablePages().map(function(page) {
            return String(page.hiddenID);
        }));
        $('#' + prefix + 'Pages input[type="checkbox"]:not(:disabled)').prop('checked', true);
        updateSummary();
    });
    $('#' + prefix + 'SelectNone').on('click', function() {
        selectedPageIds = new Set();
        $('#' + prefix + 'Pages input[type="checkbox"]').prop('checked', false);
        updateSummary();
    });

    startAjax('fetchLinearStructureTemplates', {
        targetTestId: serverData.testLevel.id
    }).then(function(res) {
        templates = res && res.data && Array.isArray(res.data.linearStructureTemplates)
            ? res.data.linearStructureTemplates
            : [];
        renderTestList('');
    }).catch(function() {
        templates = [];
        renderTestList('');
    });
}

function openExistingTestpoolsDialog() {
    if (!serverData.testLevel || !serverData.testLevel.id || !serverData.testLevel.structure || serverData.testLevel.structure.type !== 'fluid') return;
    if (isTestPublished()) {
        showMessage(UILANG.m('This test is Published (Locked). Test pools cannot be changed while the test is locked.'), 'warning');
        return;
    }

    const prefix = 'tmExistingTestpools';
    const currentPools = serverData.testLevel.testpools || [];
    const currentPoolNames = new Set(currentPools.map(function(pool) {
        return String(pool.name || '').toLocaleLowerCase();
    }));
    let templates = [];
    let selectedTemplate = null;
    let selectedPoolIds = new Set();
    let previewPool = null;

    const dialogData = {
        buttons: [{
            label: UILANG.m('Cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Import testpools'),
            default: true,
            disabled: true,
            value: 'load'
        }],
        contents:
            '<div class="tmExistingEntriesDialog tmExistingTestpoolsDialog">' +
            '<aside class="tmExistingEntriesSources">' +
            '<label class="tmExistingEntriesFilter" for="' + prefix + 'Filter">' +
            '<span>' + UILANG.m('Filter tests') + '</span>' +
            '<input id="' + prefix + 'Filter" type="text" autocomplete="off">' +
            '</label>' +
            '<div id="' + prefix + 'Tests" class="tmExistingEntriesTestList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Loading available tests...') + '</div>' +
            '</div>' +
            '</aside>' +
            '<section class="tmExistingEntriesSelection">' +
            '<div class="tmExistingEntriesSelectionHeader">' +
            '<div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Source fluid test') + '</span>' +
            '<strong id="' + prefix + 'SourceTitle">' + UILANG.m('Select a test') + '</strong></div>' +
            '<div class="tmExistingEntriesSelectionActions">' +
            '<button id="' + prefix + 'SelectAll" type="button" disabled>' + UILANG.m('Select all') + '</button>' +
            '<button id="' + prefix + 'SelectNone" type="button" disabled>' + UILANG.m('Deselect all') + '</button>' +
            '</div>' +
            '</div>' +
            '<div id="' + prefix + 'Pools" class="tmExistingEntriesEntryList tmExistingTestpoolList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a fluid test to see its testpools.') + '</div>' +
            '</div>' +
            '<div id="' + prefix + 'Summary" class="tmExistingEntriesSummary">' + UILANG.m('No testpools selected.') + '</div>' +
            '</section>' +
            '<section class="tmExistingTestpoolPreview">' +
            '<div class="tmExistingEntriesSelectionHeader">' +
            '<div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Included test pages') + '</span>' +
            '<strong id="' + prefix + 'PreviewTitle">' + UILANG.m('Select a testpool') + '</strong></div>' +
            '</div>' +
            '<div id="' + prefix + 'Pages" class="tmExistingEntriesEntryList tmExistingTestpoolPagePreview">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Select a testpool to see its included test pages.') + '</div>' +
            '</div>' +
            '</section>' +
            '</div>',
        title: UILANG.m('Load existing testpools'),
        width: 1260,
        returnPromise: true,
        replaceExisting: 'loadExistingTestpoolsDialog'
    };
    const dialogResult = new nxDialog('loadExistingTestpoolsDialog', dialogData);
    const loadDialog = window.nxDialogManager.instances.loadExistingTestpoolsDialog;

    dialogResult.then(function(res) {
        if (res.button !== 'load' || !selectedTemplate || selectedPoolIds.size === 0) return;
        startAjax('importFluidTestpoolsFromTemplate', {
            targetTestId: serverData.testLevel.id,
            sourceTestId: selectedTemplate.id,
            poolIds: Array.from(selectedPoolIds)
        });
    });

    function poolImportable(pool) {
        return !currentPoolNames.has(String(pool.name || '').toLocaleLowerCase()) && Number(pool.importablePageCount || 0) > 0;
    }

    function selectablePools() {
        if (!selectedTemplate) return [];
        return (selectedTemplate.pools || []).filter(poolImportable);
    }

    function poolCounts(pool) {
        const pages = pool.pages || [];
        return {
            total: pages.length,
            importable: Number(pool.importablePageCount || 0),
            missing: Number(pool.missingPageCount || 0),
            blocked: Number(pool.blockedPageCount || 0)
        };
    }

    function formatPoolCountLine(pool) {
        const counts = poolCounts(pool);
        const parts = [];
        parts.push(counts.importable + ' ' + UILANG.m(counts.importable === 1 ? 'importable test page' : 'importable test pages'));
        if (counts.blocked > 0) {
            parts.push(counts.blocked + ' ' + UILANG.m(counts.blocked === 1 ? 'page without access' : 'pages without access'));
        }
        if (counts.missing > 0) {
            parts.push(counts.missing + ' ' + UILANG.m(counts.missing === 1 ? 'missing page' : 'missing pages'));
        }
        return parts.join(' · ');
    }

    function updateSummary() {
        const selectedCount = selectedPoolIds.size;
        const pools = selectedTemplate ? (selectedTemplate.pools || []) : [];
        const conflictCount = pools.filter(function(pool) {
            return currentPoolNames.has(String(pool.name || '').toLocaleLowerCase());
        }).length;
        const unavailableCount = pools.filter(function(pool) {
            return !currentPoolNames.has(String(pool.name || '').toLocaleLowerCase()) && Number(pool.importablePageCount || 0) === 0;
        }).length;
        const blockedPages = pools.reduce(function(total, pool) {
            return total + Number(pool.blockedPageCount || 0);
        }, 0);
        const missingPages = pools.reduce(function(total, pool) {
            return total + Number(pool.missingPageCount || 0);
        }, 0);

        let summary = UILANG.m('No testpools selected.');
        if (selectedCount > 0) {
            summary = selectedCount + ' ' + UILANG.m(selectedCount === 1 ? 'testpool selected.' : 'testpools selected.');
        }
        if (conflictCount > 0) {
            summary += ' ' + conflictCount + ' ' + UILANG.m(conflictCount === 1 ? 'testpool already exists.' : 'testpools already exist.');
        }
        if (unavailableCount > 0) {
            summary += ' ' + unavailableCount + ' ' + UILANG.m(unavailableCount === 1 ? 'testpool has no importable pages.' : 'testpools have no importable pages.');
        }
        if (blockedPages > 0) {
            summary += ' ' + blockedPages + ' ' + UILANG.m(blockedPages === 1 ? 'page is not accessible.' : 'pages are not accessible.');
        }
        if (missingPages > 0) {
            summary += ' ' + missingPages + ' ' + UILANG.m(missingPages === 1 ? 'missing page reference will be skipped.' : 'missing page references will be skipped.');
        }

        $('#' + prefix + 'Summary').text(summary);
        if (selectedCount > 0) loadDialog.enableButton('load');
        else loadDialog.disableButton('load');
    }

    function renderPoolPreview() {
        const $pageList = $('#' + prefix + 'Pages').empty();
        const $previewTitle = $('#' + prefix + 'PreviewTitle');
        if (!previewPool) {
            $previewTitle.text(UILANG.m('Select a testpool'));
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Select a testpool to see its included test pages.') + '</div>');
            return;
        }

        const pages = previewPool.pages || [];
        $previewTitle.text(previewPool.name);
        if (!pages.length) {
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This testpool has no test pages.') + '</div>');
            return;
        }

        $.each(pages, function(index, page) {
            const missing = !page.exists;
            const blocked = page.exists && page.canRead === false;
            const $row = $('<div class="tmExistingTestpoolPreviewPage"></div>');
            if (missing || blocked) $row.addClass('tmExistingTestpoolPreviewPageBlocked');
            $row.append($('<span class="tmExistingTestpoolPreviewIndex"></span>').text(index + 1));

            const $content = $('<span class="tmExistingEntriesEntryContent"></span>');
            $content.append($('<strong></strong>').text(missing ? UILANG.m('Missing test page') : (blocked ? UILANG.m('Blocked test page') : page.name)));
            if (missing) {
                $content.append($('<small></small>').text(UILANG.m('deleted reference') + ' ID: ' + page.hiddenID));
            } else if (blocked) {
                $content.append($('<small></small>').text(UILANG.m('no read access')));
            } else {
                $content.append($('<small></small>').text([page.itemGroup, page.code ? UILANG.m('Code') + ': ' + page.code : ''].filter(Boolean).join(' · ')));
            }
            $row.append($content);

            if (missing) {
                $row.append($('<span class="tmExistingEntriesConflictBadge tmExistingStructureMissingBadge"></span>').text(UILANG.m('Missing')));
            } else if (blocked) {
                $row.append($('<span class="tmExistingEntriesConflictBadge tmExistingStructureMissingBadge"></span>').text(UILANG.m('No access')));
            }
            $pageList.append($row);
        });
    }

    function renderPools() {
        const $poolList = $('#' + prefix + 'Pools').empty();
        const $sourceTitle = $('#' + prefix + 'SourceTitle');
        const $selectAll = $('#' + prefix + 'SelectAll');
        const $selectNone = $('#' + prefix + 'SelectNone');
        selectedPoolIds = new Set();
        previewPool = null;

        if (!selectedTemplate) {
            $sourceTitle.text(UILANG.m('Select a test'));
            $selectAll.prop('disabled', true);
            $selectNone.prop('disabled', true);
            $poolList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a fluid test to see its testpools.') + '</div>');
            renderPoolPreview();
            updateSummary();
            return;
        }

        const pools = selectedTemplate.pools || [];
        const importablePools = selectablePools();
        $sourceTitle.text(selectedTemplate.name);
        $selectAll.prop('disabled', importablePools.length === 0);
        $selectNone.prop('disabled', importablePools.length === 0);
        if (!pools.length) {
            $poolList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This fluid test has no testpools.') + '</div>');
            renderPoolPreview();
            updateSummary();
            return;
        }

        selectedPoolIds = new Set(importablePools.map(function(pool) {
            return String(pool.id);
        }));
        previewPool = importablePools[0] || pools[0] || null;

        $.each(pools, function(_, pool) {
            const poolId = String(pool.id);
            const exists = currentPoolNames.has(String(pool.name || '').toLocaleLowerCase());
            const noImportablePages = Number(pool.importablePageCount || 0) === 0;
            const disabled = exists || noImportablePages;
            const $checkbox = $('<input type="checkbox">').val(poolId).prop('disabled', disabled);
            if (!disabled) $checkbox.prop('checked', selectedPoolIds.has(poolId));

            const $row = $('<div class="tmExistingEntriesEntry tmExistingTestpoolEntry"></div>');
            if (exists) $row.addClass('tmExistingEntriesEntryConflict');
            if (noImportablePages) $row.addClass('tmExistingStructureMissing');

            const $content = $('<span class="tmExistingEntriesEntryContent tmExistingTestpoolContent"></span>')
                .append($('<strong></strong>').text(pool.name))
                .append($('<small></small>').text(formatPoolCountLine(pool)));

            const $label = $('<label class="tmExistingTestpoolSelect"></label>').append($checkbox).append($content);
            const pageCount = (pool.pages || []).length;
            const $pageButton = $('<button type="button" class="tmExistingTestpoolPageButton"></button>')
                .attr('title', UILANG.m('Show test pages'))
                .append($('<strong></strong>').text(pageCount))
                .append($('<span></span>').text(UILANG.m(pageCount === 1 ? 'page' : 'pages')))
                .on('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    previewPool = pool;
                    $('#' + prefix + 'Pools .tmExistingTestpoolEntry').removeClass('tmExistingTestpoolEntryPreviewed');
                    $row.addClass('tmExistingTestpoolEntryPreviewed');
                    renderPoolPreview();
                });

            let $badge = null;
            if (exists) {
                $badge = $('<span class="tmExistingEntriesConflictBadge"></span>').text(UILANG.m('Already exists'));
            } else if (noImportablePages) {
                $badge = $('<span class="tmExistingEntriesConflictBadge tmExistingStructureMissingBadge"></span>').text(UILANG.m('No import'));
            } else if (Number(pool.blockedPageCount || 0) > 0 || Number(pool.missingPageCount || 0) > 0) {
                $badge = $('<span class="tmExistingEntriesConflictBadge tmExistingTestpoolPartialBadge"></span>').text(UILANG.m('Partial import'));
            }
            $row.append($label);
            if ($badge) $row.append($badge);
            $row.append($pageButton);

            $checkbox.on('change', function() {
                if (this.checked) selectedPoolIds.add(poolId);
                else selectedPoolIds.delete(poolId);
                updateSummary();
            });
            if (previewPool && String(previewPool.id) === poolId) {
                $row.addClass('tmExistingTestpoolEntryPreviewed');
            }
            $poolList.append($row);
        });
        renderPoolPreview();
        updateSummary();
    }

    function renderTestList(filter) {
        const $list = $('#' + prefix + 'Tests').empty();
        const query = String(filter || '').trim().toLocaleLowerCase();
        selectedTemplate = null;
        renderPools();
        const visibleTemplates = templates.filter(function(template) {
            return !query || String(template.name || '').toLocaleLowerCase().indexOf(query) !== -1;
        });
        if (!visibleTemplates.length) {
            $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No accessible fluid tests with testpools were found.') + '</div>');
            return;
        }
        $.each(visibleTemplates, function(_, template) {
            const poolCount = (template.pools || []).length;
            const importableCount = (template.pools || []).filter(poolImportable).length;
            const $row = $('<button type="button" class="tmExistingEntriesTest tmExistingStructureTest"></button>')
                .attr('title', template.name)
                .append($('<strong></strong>').text(template.name))
                .append($('<small></small>').text(poolCount + ' ' + UILANG.m(poolCount === 1 ? 'testpool' : 'testpools') + ' · ' + importableCount + ' ' + UILANG.m('importable')))
                .on('click', function() {
                    $('#' + prefix + 'Tests .tmExistingEntriesTest').removeClass('tmExistingEntriesTestSelected');
                    $row.addClass('tmExistingEntriesTestSelected');
                    selectedTemplate = template;
                    renderPools();
                });
            $list.append($row);
        });
    }

    $('#' + prefix + 'Filter').on('input', function() {
        renderTestList($(this).val());
    });
    $('#' + prefix + 'SelectAll').on('click', function() {
        selectedPoolIds = new Set(selectablePools().map(function(pool) {
            return String(pool.id);
        }));
        $('#' + prefix + 'Pools input[type="checkbox"]:not(:disabled)').prop('checked', true);
        updateSummary();
    });
    $('#' + prefix + 'SelectNone').on('click', function() {
        selectedPoolIds = new Set();
        $('#' + prefix + 'Pools input[type="checkbox"]').prop('checked', false);
        updateSummary();
    });

    startAjax('fetchFluidTestpoolTemplates', {
        targetTestId: serverData.testLevel.id
    }).then(function(res) {
        templates = res && res.data && Array.isArray(res.data.fluidTestpoolTemplates)
            ? res.data.fluidTestpoolTemplates
            : [];
        renderTestList('');
    }).catch(function() {
        templates = [];
        renderTestList('');
    });
}

function openExistingMutationStructureDialog() {
    if (!serverData.testLevel || !serverData.testLevel.id || !serverData.testLevel.structure || serverData.testLevel.structure.type !== 'mutation') return;

    const prefix = 'tmExistingMutation';
    const currentItems = serverData.testLevel.structure.items || [];
    const currentIds = new Set(currentItems.map(function(item) {
        return String(item.hiddenID);
    }));
    let templates = [];
    let selectedTemplate = null;
    let selectedTestIds = new Set();
    let previewTest = null;

    const dialogData = {
        buttons: [{
            label: UILANG.m('Cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Import linear tests'),
            default: true,
            disabled: true,
            value: 'load'
        }],
        contents:
            '<div class="tmExistingEntriesDialog tmExistingMutationDialog">' +
            '<aside class="tmExistingEntriesSources">' +
            '<label class="tmExistingEntriesFilter" for="' + prefix + 'Filter">' +
            '<span>' + UILANG.m('Filter tests') + '</span>' +
            '<input id="' + prefix + 'Filter" type="text" autocomplete="off">' +
            '</label>' +
            '<div id="' + prefix + 'Tests" class="tmExistingEntriesTestList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Loading available mutation tests...') + '</div>' +
            '</div>' +
            '</aside>' +
            '<section class="tmExistingEntriesSelection">' +
            '<div class="tmExistingEntriesSelectionHeader">' +
            '<div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Source mutation test') + '</span>' +
            '<strong id="' + prefix + 'SourceTitle">' + UILANG.m('Select a test') + '</strong></div>' +
            '<div class="tmExistingEntriesSelectionActions">' +
            '<button id="' + prefix + 'SelectAll" type="button" disabled>' + UILANG.m('Select all') + '</button>' +
            '<button id="' + prefix + 'SelectNone" type="button" disabled>' + UILANG.m('Deselect all') + '</button>' +
            '</div>' +
            '</div>' +
            '<div id="' + prefix + 'LinearTests" class="tmExistingEntriesEntryList tmExistingMutationLinearList">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a mutation test to see its linear tests.') + '</div>' +
            '</div>' +
            '<div id="' + prefix + 'Summary" class="tmExistingEntriesSummary">' + UILANG.m('No linear tests selected.') + '</div>' +
            '</section>' +
            '<section class="tmExistingTestpoolPreview tmExistingMutationPreview">' +
            '<div class="tmExistingEntriesSelectionHeader">' +
            '<div><span class="tmExistingEntriesEyebrow">' + UILANG.m('Test pages') + '</span>' +
            '<strong id="' + prefix + 'PreviewTitle">' + UILANG.m('Select a linear test') + '</strong></div>' +
            '</div>' +
            '<div id="' + prefix + 'Pages" class="tmExistingEntriesEntryList tmExistingTestpoolPagePreview">' +
            '<div class="tmExistingEntriesEmpty">' + UILANG.m('Select a linear test to see its test pages.') + '</div>' +
            '</div>' +
            '</section>' +
            '</div>',
        title: UILANG.m('Load existing linear tests'),
        width: 1260,
        returnPromise: true,
        replaceExisting: 'loadExistingMutationStructureDialog'
    };
    const dialogResult = new nxDialog('loadExistingMutationStructureDialog', dialogData);
    const loadDialog = window.nxDialogManager.instances.loadExistingMutationStructureDialog;

    dialogResult.then(function(res) {
        if (res.button !== 'load' || !selectedTemplate || selectedTestIds.size === 0) return;
        startAjax('importMutationStructureFromTemplate', {
            targetTestId: serverData.testLevel.id,
            sourceTestId: selectedTemplate.id,
            testIds: Array.from(selectedTestIds)
        });
    });

    function linearImportable(linearTest) {
        return linearTest.exists &&
            linearTest.type === 'linear' &&
            linearTest.canRead !== false &&
            linearTest.canEdit !== false &&
            !currentIds.has(String(linearTest.hiddenID));
    }

    function selectableLinearTests() {
        if (!selectedTemplate) return [];
        return (selectedTemplate.linearTests || []).filter(linearImportable);
    }

    function linearStatus(linearTest) {
        const id = String(linearTest.hiddenID);
        if (!linearTest.exists) return {badge: UILANG.m('Missing'), className: 'tmExistingStructureMissingBadge', text: UILANG.m('The referenced linear test has been deleted.')};
        if (linearTest.canRead === false || linearTest.canEdit === false) return {badge: UILANG.m('No import'), className: 'tmExistingStructureMissingBadge', text: UILANG.m('Linear test blocked')};
        if (linearTest.type !== 'linear') return {badge: UILANG.m('No import'), className: 'tmExistingStructureMissingBadge', text: UILANG.m('Only linear tests can be imported into a mutation test.')};
        if (currentIds.has(id)) return {badge: UILANG.m('Already in test'), className: '', text: UILANG.m('This linear test is already assigned to the current mutation test.')};
        return null;
    }

    function pageCountText(count) {
        return count + ' ' + UILANG.m(count === 1 ? 'page' : 'pages');
    }

    function updateSummary() {
        const selectedCount = selectedTestIds.size;
        const linearTests = selectedTemplate ? (selectedTemplate.linearTests || []) : [];
        const duplicateCount = linearTests.filter(function(linearTest) {
            return linearTest.exists && currentIds.has(String(linearTest.hiddenID));
        }).length;
        const missingCount = linearTests.filter(function(linearTest) {
            return !linearTest.exists;
        }).length;
        const blockedCount = linearTests.filter(function(linearTest) {
            return linearTest.exists && (linearTest.canRead === false || linearTest.canEdit === false || linearTest.type !== 'linear');
        }).length;
        const missingPages = linearTests.reduce(function(total, linearTest) {
            return total + Number(linearTest.missingPageCount || 0);
        }, 0);

        let summary = UILANG.m('No linear tests selected.');
        if (selectedCount > 0) {
            summary = selectedCount + ' ' + UILANG.m(selectedCount === 1 ? 'linear test selected.' : 'linear tests selected.');
        }
        if (duplicateCount > 0) {
            summary += ' ' + duplicateCount + ' ' + UILANG.m(duplicateCount === 1 ? 'linear test is already in this mutation test.' : 'linear tests are already in this mutation test.');
        }
        if (blockedCount > 0) {
            summary += ' ' + blockedCount + ' ' + UILANG.m(blockedCount === 1 ? 'linear test is not ready to import.' : 'linear tests are not ready to import.');
        }
        if (missingCount > 0) {
            summary += ' ' + missingCount + ' ' + UILANG.m(missingCount === 1 ? 'linear test reference is missing.' : 'linear test references are missing.');
        }
        if (missingPages > 0) {
            summary += ' ' + missingPages + ' ' + UILANG.m(missingPages === 1 ? 'missing test page reference will remain visible in preview.' : 'missing test page references will remain visible in preview.');
        }

        $('#' + prefix + 'Summary').text(summary);
        if (selectedCount > 0) loadDialog.enableButton('load');
        else loadDialog.disableButton('load');
    }

    function renderLinearPreview() {
        const $pageList = $('#' + prefix + 'Pages').empty();
        const $previewTitle = $('#' + prefix + 'PreviewTitle');
        if (!previewTest) {
            $previewTitle.text(UILANG.m('Select a linear test'));
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Select a linear test to see its test pages.') + '</div>');
            return;
        }

        const pages = previewTest.pages || [];
        $previewTitle.text(previewTest.name || UILANG.m('Linear test'));
        if (!previewTest.exists) {
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('The referenced linear test has been deleted.') + '</div>');
            return;
        }
        if (previewTest.canRead === false) {
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('You do not have read access to this linear test.') + '</div>');
            return;
        }
        if (!pages.length) {
            $pageList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This linear test has no test pages.') + '</div>');
            return;
        }

        $.each(pages, function(index, page) {
            const missing = !page.exists;
            const $row = $('<div class="tmExistingTestpoolPreviewPage"></div>');
            if (missing) $row.addClass('tmExistingTestpoolPreviewPageBlocked');
            $row.append($('<span class="tmExistingTestpoolPreviewIndex"></span>').text(index + 1));

            const $content = $('<span class="tmExistingEntriesEntryContent"></span>');
            $content.append($('<strong></strong>').text(missing ? UILANG.m('Missing test page') : page.name));
            if (missing) {
                $content.append($('<small></small>').text(UILANG.m('deleted reference') + ' ID: ' + page.hiddenID));
            } else {
                $content.append($('<small></small>').text([page.itemGroup, page.code ? UILANG.m('Code') + ': ' + page.code : ''].filter(Boolean).join(' · ')));
            }
            $row.append($content);

            if (missing) {
                $row.append($('<span class="tmExistingEntriesConflictBadge tmExistingStructureMissingBadge"></span>').text(UILANG.m('Missing')));
            }
            $pageList.append($row);
        });
    }

    function renderLinearTests() {
        const $linearList = $('#' + prefix + 'LinearTests').empty();
        const $sourceTitle = $('#' + prefix + 'SourceTitle');
        const $selectAll = $('#' + prefix + 'SelectAll');
        const $selectNone = $('#' + prefix + 'SelectNone');
        selectedTestIds = new Set();
        previewTest = null;

        if (!selectedTemplate) {
            $sourceTitle.text(UILANG.m('Select a test'));
            $selectAll.prop('disabled', true);
            $selectNone.prop('disabled', true);
            $linearList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('Choose a mutation test to see its linear tests.') + '</div>');
            renderLinearPreview();
            updateSummary();
            return;
        }

        const linearTests = selectedTemplate.linearTests || [];
        const importableTests = selectableLinearTests();
        $sourceTitle.text(selectedTemplate.name);
        $selectAll.prop('disabled', importableTests.length === 0);
        $selectNone.prop('disabled', importableTests.length === 0);
        if (!linearTests.length) {
            $linearList.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('This mutation test has no assigned linear tests.') + '</div>');
            renderLinearPreview();
            updateSummary();
            return;
        }

        selectedTestIds = new Set(importableTests.map(function(linearTest) {
            return String(linearTest.hiddenID);
        }));
        previewTest = importableTests[0] || linearTests[0] || null;

        $.each(linearTests, function(_, linearTest) {
            const testId = String(linearTest.hiddenID);
            const status = linearStatus(linearTest);
            const disabled = status !== null;
            const $checkbox = $('<input type="checkbox">').val(testId).prop('disabled', disabled);
            if (!disabled) $checkbox.prop('checked', selectedTestIds.has(testId));

            const $row = $('<div class="tmExistingEntriesEntry tmExistingTestpoolEntry tmExistingMutationLinearEntry"></div>');
            if (disabled) $row.addClass('tmExistingStructureMissing');

            const name = linearTest.name || (linearTest.exists ? UILANG.m('Blocked linear test') : UILANG.m('Missing linear test'));
            const subline = status ? status.text : pageCountText(Number(linearTest.pageCount || 0));
            const $content = $('<span class="tmExistingEntriesEntryContent tmExistingTestpoolContent"></span>')
                .append($('<strong></strong>').text(name))
                .append($('<small></small>').text(subline));

            const $label = $('<label class="tmExistingTestpoolSelect"></label>').append($checkbox).append($content);
            const pageCount = Number(linearTest.pageCount || 0);
            const $pageButton = $('<button type="button" class="tmExistingTestpoolPageButton"></button>')
                .attr('title', UILANG.m('Show test pages'))
                .append($('<strong></strong>').text(pageCount))
                .append($('<span></span>').text(UILANG.m(pageCount === 1 ? 'page' : 'pages')))
                .on('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    previewTest = linearTest;
                    $('#' + prefix + 'LinearTests .tmExistingMutationLinearEntry').removeClass('tmExistingTestpoolEntryPreviewed');
                    $row.addClass('tmExistingTestpoolEntryPreviewed');
                    renderLinearPreview();
                });

            $row.append($label);
            if (status) {
                $row.append($('<span class="tmExistingEntriesConflictBadge ' + status.className + '"></span>').text(status.badge));
            }
            $row.append($pageButton);

            $checkbox.on('change', function() {
                if (this.checked) selectedTestIds.add(testId);
                else selectedTestIds.delete(testId);
                updateSummary();
            });
            if (previewTest && String(previewTest.hiddenID) === testId) {
                $row.addClass('tmExistingTestpoolEntryPreviewed');
            }
            $linearList.append($row);
        });
        renderLinearPreview();
        updateSummary();
    }

    function renderTestList(filter) {
        const $list = $('#' + prefix + 'Tests').empty();
        const query = String(filter || '').trim().toLocaleLowerCase();
        selectedTemplate = null;
        renderLinearTests();
        const visibleTemplates = templates.filter(function(template) {
            return !query || String(template.name || '').toLocaleLowerCase().indexOf(query) !== -1;
        });
        if (!visibleTemplates.length) {
            $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No accessible mutation tests with assigned linear tests were found.') + '</div>');
            return;
        }
        $.each(visibleTemplates, function(_, template) {
            const testCount = (template.linearTests || []).length;
            const importableCount = (template.linearTests || []).filter(linearImportable).length;
            const $row = $('<button type="button" class="tmExistingEntriesTest tmExistingStructureTest"></button>')
                .attr('title', template.name)
                .append($('<strong></strong>').text(template.name))
                .append($('<small></small>').text(testCount + ' ' + UILANG.m(testCount === 1 ? 'linear test' : 'linear tests') + ' · ' + importableCount + ' ' + UILANG.m('importable')))
                .on('click', function() {
                    $('#' + prefix + 'Tests .tmExistingEntriesTest').removeClass('tmExistingEntriesTestSelected');
                    $row.addClass('tmExistingEntriesTestSelected');
                    selectedTemplate = template;
                    renderLinearTests();
                });
            $list.append($row);
        });
    }

    $('#' + prefix + 'Filter').on('input', function() {
        renderTestList($(this).val());
    });
    $('#' + prefix + 'SelectAll').on('click', function() {
        selectedTestIds = new Set(selectableLinearTests().map(function(linearTest) {
            return String(linearTest.hiddenID);
        }));
        $('#' + prefix + 'LinearTests input[type="checkbox"]:not(:disabled)').prop('checked', true);
        updateSummary();
    });
    $('#' + prefix + 'SelectNone').on('click', function() {
        selectedTestIds = new Set();
        $('#' + prefix + 'LinearTests input[type="checkbox"]').prop('checked', false);
        updateSummary();
    });

    startAjax('fetchMutationStructureTemplates', {
        targetTestId: serverData.testLevel.id
    }).then(function(res) {
        templates = res && res.data && Array.isArray(res.data.mutationStructureTemplates)
            ? res.data.mutationStructureTemplates
            : [];
        renderTestList('');
    }).catch(function() {
        templates = [];
        renderTestList('');
    });
}

//Legal text editor
function legalText() {
	cleanupMetaTinyMceEditors();

    let lteDialogNormalized = false;

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
        replaceExisting: 'lteEditor',

        width: 1250
    };

    showDialog('lteEditor', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                const writeObj = {};
                $.each(languages, function (key, value) {
                    let html = tinymce.get('container_' + key).getContent();
                    html = collapseOasysRoot(html);
                    writeObj[key] = html;
                });
                writeObj.customCSS = legalCustomCss || '';

                startAjax('saveTest', {
                    id: serverData.testLevel.id,
                    metaData: writeObj,
                    metaType: 'privacy_policy',
                    currentSkin: serverData.testLevel.skin.skin
                });
            }
			cleanupMetaTinyMceEditors();
        }
    );

    // Top info bar: text on the left, "Load existing" on the right (same height)
    $('#legalMsg').append(
        '<div id="legalMsgBar" ' +
        'style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
        '<div id="legalMsgText" style="flex:1;margin-right:10px;">' +
        UILANG.m('Create or edit your privacy policy in different languages here and set the visibility using the skin settings of your test (might not be available for all skins).') +
        '</div>' +
        '<div style="flex:0 0 auto;display:flex;align-items:center;">' +
        '<button type="button" id="btnLoadPrivacyFromExisting" class="nx-btn nx-btn-small" ' +
        'style="display:inline-flex;align-items:center;padding:4px 10px;">' +
        '<span class="nx-icon nx-icon-folder-open"></span>' +
        '<span>' + UILANG.m('Load existing') + '</span>' +
        '</button>' +
        '</div>' +
        '</div>'
    );

    const legalTabs = new jsTabs($('#legalTextEditor'), 'lte');
    const tabList = {};
    const containers = [];
    let currentLegalLanguage = null; // track active language tab

    $('#legalTextEditor').append('<div id="editorCont"></div>');

    let userLang;
    switch (settings.interfaceLanguage) {
        case "DE":
            userLang = "de";
            break;
        case "FR":
            userLang = "fr_FR";
            break;
        default:
            userLang = "en";
            break;
    }

    // prepare content – metadata may be null/empty/invalid
    let content = {};
    try {
        if (serverData.testLevel.metadata) {
            content = JSON.parse(serverData.testLevel.metadata);
        }
    } catch (e) {
        content = {};
    }

    let legalCustomCss = '';
    if (content &&
        content.privacy_policy &&
        typeof content.privacy_policy === 'object' &&
        Object.prototype.hasOwnProperty.call(content.privacy_policy, 'customCSS')
    ) {
        legalCustomCss = content.privacy_policy.customCSS || '';
    }

    const legalEditors = [];
    // Inject CSS into all privacy-policy TinyMCE instances of this dialog
    function applyLegalCustomCssToAllEditors() {

        if (!legalEditors.length) {
            return;
        }

        legalEditors.forEach(function (ed) {
            if (!ed) return;

            try {
                const doc = ed.getDoc && ed.getDoc();
                if (doc) {
                    const old = doc.querySelector('style[data-legal-css="1"]');
                    if (old) {
                        old.parentNode.removeChild(old);
                    }
                }
            } catch (e) {
                console.warn('Error cleaning old legal CSS style:', e);
            }

            // nothing more to do if CSS is empty – we just removed the old style
            if (!legalCustomCss) {
                return;
            }

            try {
                if (ed.dom && typeof ed.dom.addStyle === 'function') {
                    ed.dom.addStyle(legalCustomCss);

                    const doc = ed.getDoc && ed.getDoc();
                    if (doc) {
                        const styles = doc.getElementsByTagName('style');
                        if (styles.length > 0) {
                            styles[styles.length - 1].setAttribute('data-legal-css', '1');
                        }
                    }
                }
            } catch (e) {
                console.warn('Error injecting legal CSS into editor', ed.id, e);
            }
        });
    }



// Custom CSS dialog using your nxDialog/showDialog infrastructure
    function openLegalCustomCssDialog() {

        const escCss = legalCustomCss || '';

        const dialogDataCss = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: 'Save',
                default: true,
                value: 'ok'
            }],
            title: 'Custom CSS',
            width: 900,
            returnPromise: true,
            datafields: ['legalCustomCssArea'],
            dataFormat: 'object',
            doNotStripHTML: true,

            contents:
                '<div>' +
                '<div style="margin-bottom:6px;">' +
                UILANG.m('Enter custom CSS that will be applied to all languages of the privacy policy editor.') +
                '</div>' +
                '<textarea id="legalCustomCssArea" data-tabindent ' +
                'style="width:100%;height:360px;resize:vertical;' +
                'font-family:monospace;font-size:12px;' +
                'border:1px solid #ccc;border-radius:4px;padding:6px;">' +
                $('<div/>').text(escCss).html() +
                '</textarea>' +
                '</div>'
        };

        // use the same helper you use for the main meta dialog
        showDialog('lteCustomCss', dialogDataCss).then(function (res) {
            if (res && res.button === 'ok' && res.data) {
                // VALUE COMES FROM nxDialog, NOT FROM $('#...') (DOM is already removed)
                legalCustomCss = res.data.legalCustomCssArea || '';
                // apply immediately in all language editors
                applyLegalCustomCssToAllEditors();
            }
        });
    }


    $.each(languages, function (key, value) {
        tabList[key] = key;
        // Add container for each language and preload content
        containers.push('container_' + key);
        let preLoad;
        if (content && content.privacy_policy && Object.prototype.hasOwnProperty.call(content.privacy_policy, key)) {
            preLoad = content.privacy_policy[key];
        } else {
            preLoad = '';
        }

        preLoad = expandOasysRoot(preLoad);

        $('#editorCont').append(
            '<div id="div_' + key + '">' +
            '<textarea id="container_' + key + '">' + preLoad + '</textarea>' +
            '</div>'
        );

        tinymce.init({
            selector: '#container_' + key,
            testId: serverData.testLevel.id,
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
                "fullscreen",
                "tmimagebrowser"
            ],
            toolbar: [
                'undo redo | blocks fontsize | bold italic underline forecolor backcolor | ' +
                'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | hr | tmimagebrowser | fullscreen metapreviewbutton',
                'customcss'
            ],
            menubar: 'edit view insert format tools table',
            contextmenu: 'undo redo | bold italic underline | link | align',
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            menu: {
                edit: { title: 'Edit', items: 'undo redo | cut copy paste | selectall | searchreplace' },
                view: { title: 'View', items: 'metapreview | code | visualchars visualblocks | fullscreen' },
                insert: { title: 'Insert', items: 'link inserttable charmap hr insertdatetime' },
                format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | formats blockformats fontsize align | forecolor backcolor | removeformat' },
                tools: { title: 'Tools', items: 'code' },
                table: { title: 'Table', items: 'inserttable tableprops deletetable row column cell' }
            },
            // Disable image upload and image-related options
            image_advtab: false,
            paste_data_images: false,
            min_height: 500,
            resize: false,
            language: userLang,
            setup: function (editor) {
                legalEditors.push(editor);
                editor.ui.registry.addButton('customcss', {
                    text: UILANG.m('Custom CSS'),
                    icon: 'sourcecode',
                    tooltip: 'Custom CSS',
                    onAction: function () {
                        openLegalCustomCssDialog();
                    }
                });
                editor.ui.registry.addMenuItem('metapreview', {
                    text: UILANG.m('Preview'),
                    icon: 'preview',
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, legalCustomCss, 'privacy_policy');
                    }
                });
                editor.ui.registry.addButton('metapreviewbutton', {
                    icon: 'preview',
                    tooltip: UILANG.m('Preview'),
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, legalCustomCss, 'privacy_policy');
                    }
                });
                editor.on('init', function () {
                    if (legalCustomCss) {
                        applyLegalCustomCssToAllEditors();
                    }
                    if (!lteDialogNormalized) {
                        lteDialogNormalized = true;
                        requestAnimationFrame(() => {
                            const dlg = window.nxDialogManager?.instances?.lteEditor;
                            if (dlg && typeof dlg.normalizeInitialPosition === 'function') {
                                dlg.normalizeInitialPosition();
                            }
                        });
                    }
                });
            }
        });
    });

    // determine initial tab based on test options
    let initialLanguage = null;

    const testOptions =
        serverData &&
        serverData.testLevel &&
        serverData.testLevel.options &&
        !Array.isArray(serverData.testLevel.options)
            ? serverData.testLevel.options
            : {};

    $.each(languages, function (key) {
        if (!initialLanguage && testOptions[key] === true) {
            initialLanguage = key;
        }
    });

    // fallback: first tab
    if (!initialLanguage) {
        initialLanguage = Object.keys(tabList)[0];
    }

    legalTabs.setTabs(tabList, initialLanguage);

    // init jsTabs click handler
    let tSel = legalTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function (ret) {
        for (let c in containers) {
            $('#div_' + containers[c].replace("container_", "")).hide();
        }
        const selectedLang = ret.originalEvent.detail;
        $('#div_' + selectedLang).show();
        currentLegalLanguage = selectedLang;
    });

    // initial visibility: show first language, hide others
    $.each(containers, function (key, val) {
        let lang = val.replace("container_", "");
        if (lang === initialLanguage) {
            $('#div_' + lang).show();
            currentLegalLanguage = lang;
        } else {
            $('#div_' + lang).hide();
        }
    });

    // wire up "Load existing" button
    $('#btnLoadPrivacyFromExisting').off('click').on('click', function () {
        openPrivacyFromExistingDialog(currentLegalLanguage);
    });

    // ---------------------------------------------------------------------
    // Helper dialog: load privacy policy text from another test
    // ---------------------------------------------------------------------
    function openPrivacyFromExistingDialog(initialLanguage) {
        let selectedTemplate = null;
        let templates = [];
        let previewLanguage = initialLanguage || null;

        function resetPreview() {
            const $prev = $('#ltlPreview');
            const $header = $('#ltlPreviewHeader');
            if ($prev.length) $prev.empty();
            if ($header.length) $header.text('');
            selectedTemplate = null;
        }

        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                value: 'cancel'
            }, {
                label: UILANG.m('Use selected'),
                'default': true,
                value: 'ok'
            }],
            contents:
                '<div id="ltlRoot" class="tmMetaLoadDialog">' +
                '<aside id="ltlLeft" class="tmMetaLoadSources">' +
                '<label class="tmExistingEntriesFilter" for="ltlFilter"><span>' + UILANG.m('Filter tests') + '</span><input id="ltlFilter" type="text" autocomplete="off"></label>' +
                '<div id="ltlList" class="tmExistingEntriesTestList"></div>' +
                '</aside>' +
                '<section id="ltlRight" class="tmMetaLoadPreview">' +
                '<div id="ltlTabs"></div>' +
                '<div id="ltlPreviewWrapper" class="tmMetaLoadPreviewWrapper">' +
                '<div id="ltlPreviewHeader" class="tmMetaLoadPreviewHeader"></div>' +
                '<div id="ltlPreview" class="tmMetaLoadPreviewContent"></div>' +
                '</div>' +
                '</section>' +
                '</div>',
            title: UILANG.m('Load existing privacy policy'),
            returnPromise: true,
            width: 1150
        };

        showDialog('legalTextLoadExisting', dialogData).then(function (res) {
            if (res.button === 'ok' && selectedTemplate && selectedTemplate.privacy_policy) {

                // Build metaData payload from selected template
                const metaData = {};
                $.each(languages, function (langKey) {
                    metaData[langKey] = selectedTemplate.privacy_policy[langKey] || '';
                });
                metaData.customCSS = selectedTemplate.privacy_policy.customCSS || '';

                startAjax('normalizeMetaUploads', {
                    id: serverData.testLevel.id,
                    metaType: 'privacy_policy',
                    metaData: metaData
                }).then((resp) => {
					if (resp.error) return;
                    const normalized = resp.metaData || metaData;

                    $.each(languages, function (langKey) {
                        const vRaw = normalized[langKey] || '';
                        const v    = expandOasysRoot(vRaw);
                        const ed   = tinymce.get('container_' + langKey);
                        if (ed) {
                            ed.setContent(v);
                        }
                    });

                    legalCustomCss = normalized.customCSS || metaData.customCSS || '';
                    applyLegalCustomCssToAllEditors();
                });
            }
        });


        // --- jsTabs for language selection in preview ---
        const langKeys = Object.keys(languages);
        if (!previewLanguage || $.inArray(previewLanguage, langKeys) === -1) {
            previewLanguage = langKeys[0];
        }

        const previewTabs = new jsTabs($('#ltlTabs'), 'ltlTabs');
        const previewTabList = {};
        $.each(langKeys, function (i, langKey) {
            previewTabList[langKey] = langKey;
        });

        const pSel = previewTabs.getEventType('select');
        $(window).off(pSel);
        $(window).on(pSel, function (ret) {
            // jsTabs dispatches selected key here
            previewLanguage = ret.detail;
            renderPreview();
        });

        // IMPORTANT: preselect the current language via jsTabs API
        previewTabs.setTabs(previewTabList, previewLanguage);

        // Initially: disable tabs until a template is selected
        disablePreviewTabs();

        function disablePreviewTabs() {
            const $tabs = $('#ltlTabs .jsTab');
            $tabs.removeClass('jstActive')
                .addClass('jstDisabled')
                .css({
                    opacity: 0.3,
                    pointerEvents: 'none'
                });
        }

        function enablePreviewTabs() {
            const $tabs = $('#ltlTabs .jsTab');
            $tabs.removeClass('jstDisabled')
                .css({
                    opacity: '',
                    pointerEvents: ''
                });
            // ensure correct language tab is marked active
            previewTabs.select(previewLanguage);
        }


        function renderPreview() {
            const $prev   = $('#ltlPreview');
            const $header = $('#ltlPreviewHeader');
            if (!$prev.length) return;

            // Clear old content and measure actual usable width
            $prev.empty();

            const rect = $prev[0].getBoundingClientRect();
            const style = window.getComputedStyle($prev[0]);

            const paddingLeft  = parseFloat(style.paddingLeft);
            const paddingRight = parseFloat(style.paddingRight);
            const borderLeft   = parseFloat(style.borderLeftWidth);
            const borderRight  = parseFloat(style.borderRightWidth);

            const prevWidth = rect.width - paddingLeft - paddingRight - borderLeft - borderRight;

            $header.text(selectedTemplate ? selectedTemplate.name : '');

            if (!selectedTemplate || !selectedTemplate.privacy_policy) {
                return;
            }

            let html = selectedTemplate.privacy_policy[previewLanguage] || '';
            html = expandOasysRoot(html);

            let customCss = selectedTemplate.privacy_policy.customCSS || '';
            customCss = customCss.replace(/\bbody\b/g, '#ltlPreview');
            const cssBlock = customCss ? `<style>${customCss}</style>` : '';

            $prev.html(cssBlock + '<div id="ltlPreviewInner">' + html + '</div>');
            const $inner = $('#ltlPreviewInner');

            $inner.css({
                transform: '',
                transformOrigin: '',
                width: ''
            });

            const contentWidth = $inner[0] ? $inner[0].scrollWidth : 0;

            if (prevWidth > 0 && contentWidth > prevWidth) {
                const scale = prevWidth / contentWidth;
                $inner.css({
                    transform: 'scale(' + scale + ')',
                    transformOrigin: 'top left',
                    width: contentWidth + 'px'
                });
            }
        }

        function renderList(filter) {
            const $list = $('#ltlList');
            $list.empty();

            // always clear preview when (re)rendering the list
            resetPreview();

            if (!templates.length) {
                $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No tests with a privacy policy were found.') + '</div>');
                return;
            }

            const q = (filter || '').toLowerCase();

            $.each(templates, function (idx, t) {
                if (q && t.name.toLowerCase().indexOf(q) === -1) {
                    return; // filtered out
                }

                const $row = $('<button type="button" class="tmExistingEntriesTest ltlRow"></button>')
                    .text(t.name)
                    .attr('data-idx', idx)
                    .on('click', function () {
                        $('.ltlRow').removeClass('selected tmExistingEntriesTestSelected');
                        $(this).addClass('selected tmExistingEntriesTestSelected');
                        selectedTemplate = templates[idx];
                        // enable language tabs once we have a template
                        enablePreviewTabs();
                        renderPreview();
                    });

                $list.append($row);
            });
        }

        $('#ltlFilter').on('input', function () {
            renderList($(this).val());
        });

        // Load templates from backend
        startAjax('fetchPrivacyTemplates', {
			languages: Object.keys(languages),
			targetTestId: serverData.testLevel.id
        })
            .then(function (res) {
                if (res && res.data && res.data.privacyTemplates) {
                    templates = res.data.privacyTemplates;
                } else {
                    templates = [];
                }
                renderList('');
            })
            .catch(function (err) {
                console.error('Error loading privacy templates', err);
                templates = [];
                renderList('');
            });
    }
}


//Score screen editor
function scoreScreen() {
	cleanupMetaTinyMceEditors();

    let seDialogNormalized = false;

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            default: true,
            value: 'ok'
        }],
        contents: '<div id="scoreMsg"></div><div style="height:550px;" id="scoreScreenEditor"></div>',
        title: UILANG.m('Edit score screen'),
        returnPromise: true,
        replaceExisting: 'seEditor',
        width: 1250
    };

    showDialog('seEditor', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                const writeObj = {};
                $.each(languages, function (key) {
                    let html = getScoreContentForSave(tinymce.get('container_' + key));
                    html = collapseOasysRoot(html);
                    writeObj[key] = html;
                });
                writeObj.customCSS = scoreCustomCss || '';

                startAjax('saveTest', {
                    id: serverData.testLevel.id,
                    metaData: writeObj,
                    metaType: 'score_screen',
                    currentSkin: serverData.testLevel.skin.skin
                });
            }
			cleanupMetaTinyMceEditors();
        }
    );

    $('#scoreMsg').append(
        '<div id="scoreMsgBar" ' +
        'style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
        '<div id="scoreMsgText" style="flex:1;margin-right:10px;">' +
        UILANG.m('Customize the score screen displayed after a test using the WYSIWYG editor. Add variables, conditional blocks and navigation button using the custom icons in the toolbar.') +
        '</div>' +
        '<div style="flex:0 0 auto;display:flex;align-items:center;">' +
        '<button type="button" id="btnLoadScoreFromExisting" class="nx-btn nx-btn-small" ' +
        'style="display:inline-flex;align-items:center;padding:4px 10px;">' +
        '<span class="nx-icon nx-icon-folder-open"></span>' +
        '<span>' + UILANG.m('Load existing') + '</span>' +
        '</button>' +
        '</div>' +
        '</div>'
    );

    const scoreTabs = new jsTabs($('#scoreScreenEditor'), 'lte');
    const tabList = {};
    const containers = [];
    let currentScoreLanguage = null;

    $('#scoreScreenEditor').append('<div id="editorCont"></div>');

    let userLang;
    switch (settings.interfaceLanguage) {
        case 'DE':
            userLang = 'de';
            break;
        case 'FR':
            userLang = 'fr_FR';
            break;
        default:
            userLang = 'en';
            break;
    }

    let content = {};
    try {
        if (serverData.testLevel.metadata) {
            content = JSON.parse(serverData.testLevel.metadata);
        }
    } catch (e) {
        content = {};
    }

    let scoreCustomCss = '';
    if (
        content &&
        content.score_screen &&
        typeof content.score_screen === 'object' &&
        Object.prototype.hasOwnProperty.call(content.score_screen, 'customCSS')
    ) {
        scoreCustomCss = content.score_screen.customCSS || '';
    }

    const scoreEditors = [];

    function getScoreContentForSave(editor) {
        if (!editor) return '';
        const wrapper = document.createElement('div');
        wrapper.innerHTML = editor.getContent();
        wrapper.querySelectorAll('.score-conditional-remove').forEach(function (removeNode) {
            removeNode.remove();
        });
        return wrapper.innerHTML;
    }

    function getScoreEditorBaseCss() {
        return (
            '.non-editable-variable {' +
            'background-color:#eee;' +
            'padding:2px 5px;' +
            'border-radius:4px;' +
            'font-weight:bold;' +
            '}' +
            '.button-variable {' +
            'background-color:#d9edf7;' +
            'color:#31708f;' +
            'cursor:pointer !important;' +
            'user-select:none;' +
            '}' +
            '.button-variable * {' +
            'cursor:pointer !important;' +
            '}' +
            '.score-conditional-block {' +
            'position:relative;' +
            'border:2px solid #f0ad4e;' +
            'border-radius:8px;' +
            'padding:14px 42px 12px 12px;' +
            'margin:12px 0;' +
            'background:#fffaf2;' +
            '}' +
            '.score-conditional-meta {' +
            'display:inline-block;' +
            'margin-bottom:10px;' +
            'padding:4px 8px;' +
            'border-radius:999px;' +
            'background:#f0ad4e;' +
            'color:#fff;' +
            'font-size:12px;' +
            'font-weight:bold;' +
            'cursor:pointer !important;' +
            'user-select:none;' +
            '}' +
            '.score-conditional-meta * {' +
            'cursor:pointer !important;' +
            '}' +
            '.score-conditional-remove {' +
            'position:absolute;' +
            'top:10px;' +
            'right:10px;' +
            'width:22px;' +
            'height:22px;' +
            'display:grid;' +
            'place-items:center;' +
            'border-radius:999px;' +
            'box-sizing:border-box;' +
            'background:#d9534f;' +
            'color:#fff;' +
            'font-family:Arial,sans-serif;' +
            'font-size:18px;' +
            'font-weight:bold;' +
            'line-height:1;' +
            'padding:0;' +
            'text-align:center;' +
            'cursor:pointer !important;' +
            'user-select:none;' +
            'z-index:2;' +
            '}' +
            '.score-conditional-remove * {' +
            'cursor:pointer !important;' +
            '}' +
            '.score-conditional-content {' +
            'min-height:30px;' +
            '}'
        );
    }

    function applyScoreCustomCssToAllEditors() {
        if (!scoreEditors.length) {
            return;
        }

        const baseVarCss = getScoreEditorBaseCss();

        scoreEditors.forEach(function (ed) {
            if (!ed) {
                return;
            }

            try {
                const doc = ed.getDoc && ed.getDoc();
                if (doc) {
                    const old = doc.querySelector('style[data-score-css="1"]');
                    if (old) {
                        old.parentNode.removeChild(old);
                    }
                }
            } catch (e) {
                console.warn('Error cleaning old score CSS style:', e);
            }

            if (!scoreCustomCss && !baseVarCss) {
                return;
            }

            try {
                if (ed.dom && typeof ed.dom.addStyle === 'function') {
                    const combinedCss = baseVarCss + '\n' + (scoreCustomCss || '');
                    ed.dom.addStyle(combinedCss);

                    const doc = ed.getDoc && ed.getDoc();
                    if (doc) {
                        const styles = doc.getElementsByTagName('style');
                        if (styles.length > 0) {
                            styles[styles.length - 1].setAttribute('data-score-css', '1');
                        }
                    }
                }
            } catch (e) {
                console.warn('Error injecting score CSS into editor', ed.id, e);
            }
        });
    }

    function openScoreCustomCssDialog() {
        const escCss = scoreCustomCss || '';

        const dialogDataCss = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: 'Save',
                default: true,
                value: 'ok'
            }],
            title: 'Custom CSS',
            width: 900,
            returnPromise: true,
            datafields: ['scoreCustomCssArea'],
            dataFormat: 'object',
            doNotStripHTML: true,
            contents:
                '<div>' +
                '<div style="margin-bottom:6px;">' +
                UILANG.m('Enter custom CSS that will be applied to all languages of the score screen editor.') +
                '</div>' +
                '<textarea id="scoreCustomCssArea" data-tabindent ' +
                'style="width:100%;height:360px;resize:vertical;' +
                'font-family:monospace;font-size:12px;' +
                'border:1px solid #ccc;border-radius:4px;padding:6px;">' +
                $('<div/>').text(escCss).html() +
                '</textarea>' +
                '</div>'
        };

        showDialog('scoreCustomCss', dialogDataCss).then(function (res) {
            if (res && res.button === 'ok' && res.data) {
                scoreCustomCss = res.data.scoreCustomCssArea || '';
                applyScoreCustomCssToAllEditors();
            }
        });
    }

    $.each(languages, function (key) {
        tabList[key] = key;
        containers.push('container_' + key);
        let preLoad;

        const defaultContent = {
            DE: `<h1 style="text-align: center;"><strong></strong></h1>
<h1 style="text-align: center;"><strong>Punktzahl</strong></h1>
<h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span> / <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1>
<p style="text-align: center;"><strong></strong></p>
<p style="text-align: center;"><strong><span class="non-editable-variable button-variable" contenteditable="false" data-url="" data-action="close" data-label="Test beenden">Test beenden</span></strong></p>`,

            EN: `<h1 style="text-align: center;"><strong></strong></h1>
<h1 style="text-align: center;"><strong>Score</strong></h1>
<h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span> / <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1>
<p style="text-align: center;"><strong></strong></p>
<p style="text-align: center;"><strong><span class="non-editable-variable button-variable" contenteditable="false" data-url="" data-action="close" data-label="Close test">Close test</span></strong></p>`,

            FR: `<h1 style="text-align: center;"><strong></strong></h1>
<h1 style="text-align: center;"><strong>Score</strong></h1>
<h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span> / <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1>
<p style="text-align: center;"><strong></strong></p>
<p style="text-align: center;"><strong><span class="non-editable-variable button-variable" contenteditable="false" data-url="" data-action="close" data-label="Fermer le test">Fermer le test</span></strong></p>`,

            LU: `<h1 style="text-align: center;"><strong></strong></h1>
<h1 style="text-align: center;"><strong>Punktzuel</strong></h1>
<h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span> / <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1>
<p style="text-align: center;"><strong></strong></p>
<p style="text-align: center;"><strong><span class="non-editable-variable button-variable" contenteditable="false" data-url="" data-action="close" data-label="Test zoumaachen">Test zoumaachen</span></strong></p>`
        };

        if (
            content &&
            content.score_screen &&
            Object.prototype.hasOwnProperty.call(content.score_screen, key) &&
            typeof content.score_screen[key] === 'string' &&
            content.score_screen[key].trim() !== ''
        ) {
            preLoad = content.score_screen[key];
        } else {
            preLoad = defaultContent.hasOwnProperty(key)
                ? defaultContent[key]
                : defaultContent[languageFallbacks[key]];
        }

        preLoad = expandOasysRoot(preLoad);

        $('#editorCont').append('<div id="div_' + key + '"><textarea id="container_' + key + '">' + preLoad + '</textarea></div>');

        tinymce.init({
            selector: '#container_' + key,
            testId: serverData.testLevel.id,
            promotion: false,
            plugins: [
                'charmap',
                'code',
                'preview',
                'searchreplace',
                'table',
                'visualblocks',
                'visualchars',
                'wordcount',
                'lists',
                'advlist',
                'autolink',
                'link',
                'anchor',
                'insertdatetime',
                'fullscreen',
                'tmimagebrowser'
            ],
            toolbar: [
                'undo redo | blocks fontsize | bold italic underline forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | hr | tmimagebrowser | fullscreen metapreviewbutton',
                'customcss scored total percentage addbutton conditionalblock'
            ],
            menubar: 'edit view insert format tools table',
            contextmenu: 'undo redo | bold italic underline | link | align | bullist numlist | table',
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            menu: {
                edit: { title: 'Edit', items: 'undo redo | cut copy paste | selectall | searchreplace' },
                view: { title: 'View', items: 'metapreview | code | visualchars visualblocks | fullscreen' },
                insert: { title: 'Insert', items: 'link inserttable charmap hr insertdatetime' },
                format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | formats blockformats fontsize align | forecolor backcolor | removeformat' },
                tools: { title: 'Tools', items: 'code' },
                table: { title: 'Table', items: 'inserttable tableprops deletetable row column cell' }
            },
            min_height: 500,
            resize: false,
            language: userLang,
            valid_elements: '*[*]',
			extended_valid_elements: 'span[class|style|contenteditable|data-url|data-action|data-label],div[class|style|contenteditable|data-condition-metric|data-condition-operator|data-condition-value|data-condition-max-value]',
            setup: function (editor) {
                const translations = {
                    en: {
                        scored: 'Scored',
                        total: 'Total',
                        percentage: 'Percentage',
                        addbutton: 'Add Button',
                        conditionalblock: 'Conditional Block',
                        definebuttonlabel: 'Button label',
                        enter_url: 'Enter URL',
                        insert: 'Insert',
                        update: 'Update',
                        cancel: 'Cancel',
                        choose_action: 'Choose Action',
                        close_test: 'Close test',
                        open_url: 'Open URL',
                        url_required: 'URL is required for "Open URL"',
                        url_invalid: 'Please enter a valid URL starting with http:// or https://',
                        condition_metric: 'Condition type',
                        condition_operator: 'Operator',
                        condition_value: 'Value',
						condition_max_value: 'Upper value',
						condition_min_value: 'Lower value',
						between: 'Between',
						between_inclusive: 'Between (inclusive)',
						between_upper_inclusive: 'Between (lower exclusive, upper inclusive)',
						between_lower_inclusive: 'Between (lower inclusive, upper exclusive)',
						include_lower: 'Included',
						include_upper: 'Included',
                        points: 'Points',
                        percentage_label: 'Percentage',
                        show_when: 'Show when',
                        remove_block: 'Remove block',
                        nested_condition_not_allowed: 'A conditional block cannot be placed inside another conditional block.',
                        condition_value_required: 'Please enter a value for the condition.',
                        condition_value_invalid: 'Please enter a numeric value.',
						condition_percentage_range: 'Percentage must be between 0 and 100.',
						condition_range_order: 'The upper value must be greater than the lower value.',
						condition_points_increment: 'Points must be entered as whole or half points.'
                    },
                    de: {
                        scored: 'Erreicht',
                        total: 'Gesamt',
                        percentage: 'Prozent',
                        addbutton: 'Button',
                        conditionalblock: 'Bedingter Block',
                        definebuttonlabel: 'Button-Beschriftung',
                        enter_url: 'URL eingeben',
                        insert: 'Einfugen',
                        update: 'Aktualisieren',
                        cancel: 'Abbrechen',
                        choose_action: 'Aktion auswahlen',
                        close_test: 'Test beenden',
                        open_url: 'URL offnen',
                        url_required: 'Eine URL ist erforderlich fur "URL offnen"',
                        url_invalid: 'Bitte eine gultige URL mit http:// oder https:// eingeben.',
                        condition_metric: 'Bedingungstyp',
                        condition_operator: 'Operator',
                        condition_value: 'Wert',
						condition_max_value: 'Oberer Wert',
						condition_min_value: 'Unterer Wert',
						between: 'Zwischen',
						between_inclusive: 'Zwischen (inklusive)',
						between_upper_inclusive: 'Zwischen (unten exklusiv, oben inklusiv)',
						between_lower_inclusive: 'Zwischen (unten inklusiv, oben exklusiv)',
						include_lower: 'Eingeschlossen',
						include_upper: 'Eingeschlossen',
                        points: 'Punkte',
                        percentage_label: 'Prozent',
                        show_when: 'Anzeigen wenn',
                        remove_block: 'Block entfernen',
                        nested_condition_not_allowed: 'Ein bedingter Block kann nicht in einem anderen bedingten Block platziert werden.',
                        condition_value_required: 'Bitte einen Wert fur die Bedingung eingeben.',
                        condition_value_invalid: 'Bitte einen numerischen Wert eingeben.',
						condition_percentage_range: 'Der Prozentwert muss zwischen 0 und 100 liegen.',
						condition_range_order: 'Der obere Wert muss grosser als der untere Wert sein.',
						condition_points_increment: 'Punkte mussen als ganze oder halbe Punkte eingegeben werden.'
                    },
                    fr_FR: {
                        scored: 'Obtenu',
                        total: 'Total',
                        percentage: 'Pourcentage',
                        addbutton: 'Bouton',
                        conditionalblock: 'Bloc conditionnel',
                        definebuttonlabel: 'Libelle du bouton',
                        enter_url: 'Entrer URL',
                        insert: 'Inserer',
                        update: 'Mettre a jour',
                        cancel: 'Annuler',
                        choose_action: 'Choisir une action',
                        close_test: 'Fermer le test',
                        open_url: 'Ouvrir URL',
                        url_required: 'Une URL est requise pour "Ouvrir URL"',
                        url_invalid: 'Veuillez saisir une URL valide commencant par http:// ou https://.',
                        condition_metric: 'Type de condition',
                        condition_operator: 'Operateur',
                        condition_value: 'Valeur',
						condition_max_value: 'Valeur superieure',
						condition_min_value: 'Valeur inferieure',
						between: 'Entre',
						between_inclusive: 'Entre (inclusif)',
						between_upper_inclusive: 'Entre (borne basse exclusive, haute inclusive)',
						between_lower_inclusive: 'Entre (borne basse inclusive, haute exclusive)',
						include_lower: 'Inclus',
						include_upper: 'Inclus',
                        points: 'Points',
                        percentage_label: 'Pourcentage',
                        show_when: 'Afficher si',
                        remove_block: 'Supprimer le bloc',
                        nested_condition_not_allowed: 'Un bloc conditionnel ne peut pas être placé dans un autre bloc conditionnel.',
                        condition_value_required: 'Veuillez saisir une valeur pour la condition.',
                        condition_value_invalid: 'Veuillez saisir une valeur numerique.',
						condition_percentage_range: 'Le pourcentage doit etre compris entre 0 et 100.',
						condition_range_order: 'La valeur superieure doit etre plus grande que la valeur inferieure.',
						condition_points_increment: 'Les points doivent etre saisis en points entiers ou demi-points.'
                    }
                };

                const lang = translations[userLang] || translations.en;

                function insertVariable(variable) {
                    editor.insertContent(
                        `<span class="non-editable-variable" contenteditable="false">[@ ${variable} @]</span>&nbsp;`
                    );
                }

                function getConditionMetricLabel(metric) {
                    return metric === 'points' ? lang.points : lang.percentage_label;
                }

				function buildConditionalLabel(metric, operator, value, maxValue) {
					if (operator === 'between') return `${lang.show_when} ${value} < ${getConditionMetricLabel(metric)} < ${maxValue}`;
					if (operator === 'betweenInclusive') return `${lang.show_when} ${value} ≤ ${getConditionMetricLabel(metric)} ≤ ${maxValue}`;
					if (operator === 'betweenUpperInclusive') return `${lang.show_when} ${value} < ${getConditionMetricLabel(metric)} ≤ ${maxValue}`;
					if (operator === 'betweenLowerInclusive') return `${lang.show_when} ${value} ≤ ${getConditionMetricLabel(metric)} < ${maxValue}`;
					return `${lang.show_when} ${getConditionMetricLabel(metric)} ${operator} ${value}`;
                }

				function createConditionalMetaNode(doc, metric, operator, value, maxValue) {
                    const meta = doc.createElement('div');
                    meta.className = 'score-conditional-meta';
                    meta.setAttribute('contenteditable', 'false');
					meta.textContent = buildConditionalLabel(metric, operator, value, maxValue);
                    return meta;
                }

                function createConditionalRemoveNode(doc) {
                    const remove = doc.createElement('div');
                    remove.className = 'score-conditional-remove';
                    remove.setAttribute('contenteditable', 'false');
                    remove.setAttribute('title', lang.remove_block);
                    remove.setAttribute('aria-label', lang.remove_block);
                    remove.textContent = '\u00d7';
                    return remove;
                }

                function normalizeConditionalBlocks() {
                    const body = editor.getBody();
                    if (!body) {
                        return;
                    }

                    const blocks = body.querySelectorAll('.score-conditional-block');
                    blocks.forEach(function (block) {
                        const metric = block.getAttribute('data-condition-metric') || 'percentage';
                        const operator = block.getAttribute('data-condition-operator') || '>=';
                        const value = block.getAttribute('data-condition-value') || '0';
						const maxValue = block.getAttribute('data-condition-max-value') || '';

                        let meta = block.querySelector(':scope > .score-conditional-meta');
                        let removeNode = block.querySelector(':scope > .score-conditional-remove');
                        let contentNode = block.querySelector(':scope > .score-conditional-content');

                        if (!contentNode) {
                            contentNode = editor.getDoc().createElement('div');
                            contentNode.className = 'score-conditional-content';

                            Array.from(block.childNodes).forEach(function (child) {
                                if ((meta && child === meta) || (removeNode && child === removeNode)) {
                                    return;
                                }
                                contentNode.appendChild(child);
                            });

                            block.appendChild(contentNode);
                        }

                        if (!meta) {
							meta = createConditionalMetaNode(editor.getDoc(), metric, operator, value, maxValue);
                            block.insertBefore(meta, block.firstChild);
                        } else {
                            meta.setAttribute('contenteditable', 'false');
							meta.textContent = buildConditionalLabel(metric, operator, value, maxValue);
                        }

                        if (!removeNode) {
                            removeNode = createConditionalRemoveNode(editor.getDoc());
                            block.insertBefore(removeNode, block.firstChild);
                        } else {
                            removeNode.setAttribute('contenteditable', 'false');
                            removeNode.setAttribute('title', lang.remove_block);
                            removeNode.setAttribute('aria-label', lang.remove_block);
                            removeNode.textContent = '\u00d7';
                        }

                    });
                }

                function isSelectionInsideConditionalBlock() {
                    const node = editor.selection && editor.selection.getNode();
                    return !!(node && node.closest && node.closest('.score-conditional-block'));
                }

                function isSelectionTouchingConditionalMeta() {
                    const selection = editor.selection;
                    if (!selection) {
                        return false;
                    }

                    const node = selection.getNode();
                    if (node && node.closest && node.closest('.score-conditional-meta')) {
                        return true;
                    }

                    const rng = selection.getRng();
                    if (!rng) {
                        return false;
                    }

                    const startNode = rng.startContainer && rng.startContainer.nodeType === 1
                        ? rng.startContainer
                        : rng.startContainer && rng.startContainer.parentNode;
                    const endNode = rng.endContainer && rng.endContainer.nodeType === 1
                        ? rng.endContainer
                        : rng.endContainer && rng.endContainer.parentNode;

                    return !!(
                        startNode && startNode.closest && startNode.closest('.score-conditional-meta')
                    ) || !!(
                        endNode && endNode.closest && endNode.closest('.score-conditional-meta')
                    );
                }

                function validateConditionalValue(metric, rawValue) {
                    const value = String(rawValue || '').trim();

                    if (!value) {
                        editor.windowManager.alert(lang.condition_value_required);
                        return null;
                    }

                    const numericValue = Number(value);
                    if (Number.isNaN(numericValue)) {
                        editor.windowManager.alert(lang.condition_value_invalid);
                        return null;
                    }

                    if (metric === 'percentage' && (numericValue < 0 || numericValue > 100)) {
                        editor.windowManager.alert(lang.condition_percentage_range);
                        return null;
                    }

					if (metric === 'points' && Math.abs(numericValue * 2 - Math.round(numericValue * 2)) > Number.EPSILON) {
						editor.windowManager.alert(lang.condition_points_increment);
						return null;
					}

                    return value;
                }

                function openConditionalBlockDialog(editorInstance, existingBlock) {
                    const initialMetric = existingBlock ? (existingBlock.getAttribute('data-condition-metric') || 'percentage') : 'percentage';
					const storedOperator = existingBlock ? (existingBlock.getAttribute('data-condition-operator') || '>=') : '>=';
					const initialOperator = isRangeOperator(storedOperator) ? 'range' : storedOperator;
                    const initialValue = existingBlock ? (existingBlock.getAttribute('data-condition-value') || '80') : '80';
					const initialMaxValue = existingBlock ? (existingBlock.getAttribute('data-condition-max-value') || '') : '';
					const initialIncludeLower = storedOperator === 'betweenInclusive' || storedOperator === 'betweenLowerInclusive';
					const initialIncludeUpper = storedOperator === 'betweenInclusive' || storedOperator === 'betweenUpperInclusive';

					function isRangeOperator(operator) {
						return ['range', 'between', 'betweenInclusive', 'betweenUpperInclusive', 'betweenLowerInclusive'].includes(operator);
					}

					function showRangeFields(show) {
						setTimeout(function () {
							const labels = Array.from(document.querySelectorAll('.tox-dialog .tox-label, .tox-dialog .tox-checkbox__label'));
							const groupsFor = function (text) {
								return labels.filter(function (node) { return (node.textContent || '').trim() === text; }).map(function (label) {
									return label.closest('.tox-form__group');
								}).filter(Boolean);
							};
							const groupFor = function (text) {
								const label = labels.find(function (node) { return (node.textContent || '').trim() === text; });
								return label && label.closest('.tox-form__group');
							};
							const valueGroup = groupFor(lang.condition_value);
							const rangeValueGroup = groupFor(lang.condition_min_value);
							const maxValueGroup = groupFor(lang.condition_max_value);
							const includedGroups = groupsFor(lang.include_lower).concat(
								lang.include_upper === lang.include_lower ? [] : groupsFor(lang.include_upper)
							);
							let rangeGrid = rangeValueGroup && rangeValueGroup.parentElement;
							while (rangeGrid && (!maxValueGroup || !rangeGrid.contains(maxValueGroup) || includedGroups.some(function (group) { return !rangeGrid.contains(group); }))) {
								rangeGrid = rangeGrid.parentElement;
							}
							includedGroups.forEach(function (group) {
								group.classList.add('scoreConditionalIncludedGroup');
								const checkbox = group.querySelector('input[type="checkbox"]');
								if (checkbox) checkbox.classList.add('scoreConditionalIncludedCheckbox');
							});
							[rangeValueGroup, maxValueGroup].forEach(function (group) {
								const input = group && group.querySelector('input');
								if (input) input.classList.add('scoreConditionalRangeInput');
							});
							if (valueGroup) valueGroup.style.display = show ? 'none' : '';
							if (rangeGrid) {
								rangeGrid.classList.add('scoreConditionalRangeGrid');
								rangeGrid.style.display = show ? 'grid' : 'none';
								rangeGrid.style.setProperty('grid-template-columns', 'minmax(280px, 1fr) max-content', 'important');
							}
						}, 0);
					}

					const dialogApi = editorInstance.windowManager.open({
                        title: lang.conditionalblock,
                        body: {
                            type: 'panel',
                            items: [
                                {
                                    type: 'selectbox',
                                    name: 'metric',
                                    label: lang.condition_metric,
                                    items: [
                                        { text: lang.points, value: 'points' },
                                        { text: lang.percentage_label, value: 'percentage' }
                                    ]
                                },
                                {
                                    type: 'selectbox',
                                    name: 'operator',
                                    label: lang.condition_operator,
                                    items: [
                                        { text: '>', value: '>' },
                                        { text: '>=', value: '>=' },
                                        { text: '<', value: '<' },
                                        { text: '<=', value: '<=' },
										{ text: '=', value: '=' },
										{ text: lang.between, value: 'range' }
                                    ]
                                },
                                {
                                    type: 'input',
                                    name: 'value',
                                    label: lang.condition_value
								},
								{
									type: 'grid',
									columns: 2,
									items: [
										{type: 'input', name: 'rangeValue', label: lang.condition_min_value},
										{type: 'checkbox', name: 'includeLower', label: lang.include_lower},
										{type: 'input', name: 'maxValue', label: lang.condition_max_value},
										{type: 'checkbox', name: 'includeUpper', label: lang.include_upper}
									]
                                }
                            ]
                        },
                        initialData: {
                            metric: initialMetric,
                            operator: initialOperator,
							value: initialValue,
							rangeValue: initialValue,
							maxValue: initialMaxValue,
							includeLower: initialIncludeLower,
							includeUpper: initialIncludeUpper
                        },
                        buttons: [
                            { type: 'cancel', text: lang.cancel },
                            {
                                type: 'submit',
                                text: existingBlock ? lang.update : lang.insert,
                                primary: true
                            }
                        ],
						onChange: function (api, details) {
							if (details.name === 'operator') showRangeFields(api.getData().operator === 'range');
						},
                        onSubmit: function (api) {
                            const data = api.getData();
							const sanitizedValue = validateConditionalValue(data.metric, data.operator === 'range' ? data.rangeValue : data.value);
                            if (sanitizedValue === null) {
                                return;
                            }
							const isRange = data.operator === 'range';
							const sanitizedMaxValue = isRange ? validateConditionalValue(data.metric, data.maxValue) : null;
							if (isRange && sanitizedMaxValue === null) return;
							if (isRange && Number(sanitizedMaxValue) <= Number(sanitizedValue)) {
								editorInstance.windowManager.alert(lang.condition_range_order);
								return;
							}

							let savedOperator = data.operator;
							if (isRange) {
								if (data.includeLower && data.includeUpper) savedOperator = 'betweenInclusive';
								else if (data.includeLower) savedOperator = 'betweenLowerInclusive';
								else if (data.includeUpper) savedOperator = 'betweenUpperInclusive';
								else savedOperator = 'between';
							}
							const labelText = buildConditionalLabel(data.metric, savedOperator, sanitizedValue, sanitizedMaxValue);

                            if (existingBlock) {
                                existingBlock.setAttribute('data-condition-metric', data.metric);
								existingBlock.setAttribute('data-condition-operator', savedOperator);
                                existingBlock.setAttribute('data-condition-value', sanitizedValue);
								if (isRange) existingBlock.setAttribute('data-condition-max-value', sanitizedMaxValue);
								else existingBlock.removeAttribute('data-condition-max-value');

                                const metaNode = existingBlock.querySelector('.score-conditional-meta');
                                if (metaNode) {
                                    metaNode.textContent = labelText;
                                }
                            } else {
                                const conditionalHtml =
									`<div class="score-conditional-block" data-condition-metric="${data.metric}" data-condition-operator="${savedOperator}" data-condition-value="${sanitizedValue}"${isRange ? ` data-condition-max-value="${sanitizedMaxValue}"` : ''}>` +
                                    `<div class="score-conditional-remove" contenteditable="false" title="${tinymce.DOM.encode(lang.remove_block)}" aria-label="${tinymce.DOM.encode(lang.remove_block)}">&times;</div>` +
                                    `<div class="score-conditional-meta" contenteditable="false">${tinymce.DOM.encode(labelText)}</div>` +
                                    '<div class="score-conditional-content"><p></p></div>' +
                                    '</div><p></p>';

                                editorInstance.insertContent(conditionalHtml);
                            }

                            setTimeout(function () {
                                normalizeConditionalBlocks();
                            }, 0);

                            api.close();
                        }
                    });
					showRangeFields(dialogApi.getData().operator === 'range');
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
                    icon: 'plus',
                    onAction: function () {
                        openButtonDialog(editor, '', 'close', lang.close_test, false);
                    }
                });

                editor.ui.registry.addButton('conditionalblock', {
                    text: lang.conditionalblock,
                    icon: 'embed',
                    onAction: function () {
                        if (isSelectionInsideConditionalBlock()) {
                            editor.windowManager.alert(lang.nested_condition_not_allowed);
                            return;
                        }
                        openConditionalBlockDialog(editor, null);
                    }
                });

                scoreEditors.push(editor);

                editor.ui.registry.addButton('customcss', {
                    text: 'Custom CSS',
                    icon: 'sourcecode',
                    onAction: function () {
                        openScoreCustomCssDialog();
                    }
                });
                editor.ui.registry.addMenuItem('metapreview', {
                    text: UILANG.m('Preview'),
                    icon: 'preview',
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, scoreCustomCss, 'score_screen');
                    }
                });
                editor.ui.registry.addButton('metapreviewbutton', {
                    icon: 'preview',
                    tooltip: UILANG.m('Preview'),
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, scoreCustomCss, 'score_screen');
                    }
                });

                editor.on('init', function () {
                    applyScoreCustomCssToAllEditors();

                    if (!seDialogNormalized) {
                        seDialogNormalized = true;
                        requestAnimationFrame(() => {
                            const dlg = window.nxDialogManager && window.nxDialogManager.instances && window.nxDialogManager.instances.seEditor;
                            if (dlg && typeof dlg.normalizeInitialPosition === 'function') {
                                dlg.normalizeInitialPosition();
                            }
                        });
                    }
                });

                function openButtonDialog(editorInstance, urlValue, actionType, labelValue, isEditing) {
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
                                    ...(selectedAction === 'open_url'
                                        ? [{
                                            type: 'input',
                                            name: 'url',
                                            label: lang.enter_url,
                                            placeholder: 'https://example.com',
                                            value: urlValue,
                                            required: true
                                        }]
                                        : [])
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
                                const selectedAction = data.action;
                                const url = selectedAction === 'open_url' ? (data.url || '').trim() : '';

                                if (selectedAction === 'open_url') {
                                    if (!url) {
                                        editorInstance.windowManager.alert(lang.url_required);
                                        return;
                                    }
                                    if (typeof isValidHttpUrl === 'function' && !isValidHttpUrl(url)) {
                                        editorInstance.windowManager.alert(lang.url_invalid);
                                        return;
                                    }
                                }

                                const labelText =
                                    data.label ||
                                    (selectedAction === 'open_url' ? lang.open_url : lang.close_test);

                                const buttonVar =
                                    `<span class="non-editable-variable button-variable" contenteditable="false" ` +
                                    `data-action="${selectedAction}" data-url="${url}" data-label="${labelText}">${labelText}</span>&nbsp;`;

                                const selectedNode = editorInstance.selection.getNode();
                                if (selectedNode.classList && selectedNode.classList.contains('button-variable')) {
                                    selectedNode.outerHTML = buttonVar;
                                } else {
                                    editorInstance.insertContent(buttonVar);
                                }

                                api.close();
                            }
                        };
                    }

                    editorInstance.windowManager.open(getDialogConfig(actionType));
                }

                editor.on('click', function (e) {
                    const target = e.target;

                    if (target && target.closest) {
                        const removeNode = target.closest('.score-conditional-remove');
                        if (removeNode) {
                            e.preventDefault();
                            const blockToRemove = removeNode.closest('.score-conditional-block');
                            if (blockToRemove) {
                                blockToRemove.remove();
                            }
                            return;
                        }

                        const metaNode = target.closest('.score-conditional-meta');
                        if (metaNode) {
                            e.preventDefault();
                            const block = metaNode.closest('.score-conditional-block');
                            if (block) {
                                openConditionalBlockDialog(editor, block);
                            }
                            return;
                        }
                    }

                    if (target && target.classList && target.classList.contains('non-editable-variable')) {
                        e.preventDefault();
                        if (target.classList.contains('button-variable')) {
                            const currentAction = target.getAttribute('data-action') || 'close';
                            const currentUrl = target.getAttribute('data-url') || '';
                            const currentLabel = target.getAttribute('data-label') || lang.close_test;
                            openButtonDialog(editor, currentUrl, currentAction, currentLabel, true);
                        }
                    }
                });

                editor.on('keydown', function (e) {
                    if ((e.key === 'Backspace' || e.key === 'Delete') && isSelectionTouchingConditionalMeta()) {
                        e.preventDefault();
                    }
                });

                editor.on('SetContent change input undo redo', function () {
                    setTimeout(function () {
                        normalizeConditionalBlocks();
                    }, 0);
                });
            },
            content_style: getScoreEditorBaseCss()
        });
    });

    let initialLanguage = null;

    const testOptions =
        serverData &&
        serverData.testLevel &&
        serverData.testLevel.options &&
        !Array.isArray(serverData.testLevel.options)
            ? serverData.testLevel.options
            : {};

    $.each(languages, function (key) {
        if (!initialLanguage && testOptions[key] === true) {
            initialLanguage = key;
        }
    });

    if (!initialLanguage) {
        initialLanguage = Object.keys(tabList)[0];
    }

    scoreTabs.setTabs(tabList, initialLanguage);

    let tSel = scoreTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function (ret) {
        for (let c in containers) {
            $('#div_' + containers[c].replace('container_', '')).hide();
        }
        const selectedLang = ret.originalEvent.detail;
        $('#div_' + selectedLang).show();
        currentScoreLanguage = selectedLang;
    });

    $.each(containers, function (key, val) {
        let lang = val.replace('container_', '');
        if (lang === initialLanguage) {
            $('#div_' + lang).show();
            currentScoreLanguage = lang;
        } else {
            $('#div_' + lang).hide();
        }
    });

    $('#btnLoadScoreFromExisting').off('click').on('click', function () {
        openScoreFromExistingDialog(currentScoreLanguage);
    });

    function openScoreFromExistingDialog(initialLanguageForPreview) {
        let selectedTemplate = null;
        let templates = [];
        let previewLanguage = initialLanguageForPreview || null;

        function resetPreview() {
            const $prev = $('#sslPreview');
            const $header = $('#sslPreviewHeader');
            if ($prev.length) {
                $prev.empty();
            }
            if ($header.length) {
                $header.text('');
            }
            selectedTemplate = null;
        }

        const dialogDataLoad = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: UILANG.m('Use selected'),
                default: true,
                value: 'ok'
            }],
            contents:
                '<div id="sslRoot" class="tmMetaLoadDialog">' +
                '<aside id="sslLeft" class="tmMetaLoadSources">' +
                '<label class="tmExistingEntriesFilter" for="sslFilter"><span>' + UILANG.m('Filter tests') + '</span><input id="sslFilter" type="text" autocomplete="off"></label>' +
                '<div id="sslList" class="tmExistingEntriesTestList"></div>' +
                '</aside>' +
                '<section id="sslRight" class="tmMetaLoadPreview">' +
                '<div id="sslTabs"></div>' +
                '<div id="sslPreviewWrapper" class="tmMetaLoadPreviewWrapper">' +
                '<div id="sslPreviewHeader" class="tmMetaLoadPreviewHeader"></div>' +
                '<div id="sslPreview" class="tmMetaLoadPreviewContent"></div>' +
                '</div>' +
                '</section>' +
                '</div>',
            title: UILANG.m('Load existing score screen'),
            returnPromise: true,
            width: 1150
        };

        showDialog('scoreScreenLoadExisting', dialogDataLoad).then(function (res) {
            if (res.button === 'ok' && selectedTemplate && selectedTemplate.score_screen) {
                const metaData = {};
                $.each(languages, function (langKey) {
                    metaData[langKey] = selectedTemplate.score_screen[langKey] || '';
                });
                metaData.customCSS = selectedTemplate.score_screen.customCSS || '';

                startAjax('normalizeMetaUploads', {
                    id: serverData.testLevel.id,
                    metaType: 'score_screen',
                    metaData: metaData
                }).then((resp) => {
					if (resp.error) return;
                    const normalized = resp.metaData || metaData;

                    $.each(languages, function (langKey) {
                        const vRaw = normalized[langKey] || '';
                        const v = expandOasysRoot(vRaw);
                        const ed = tinymce.get('container_' + langKey);
                        if (ed) {
                            ed.setContent(v);
                        }
                    });

                    scoreCustomCss = normalized.customCSS || metaData.customCSS || '';
                    applyScoreCustomCssToAllEditors();
                });
            }
        });

        const langKeys = Object.keys(languages);
        if (!previewLanguage || $.inArray(previewLanguage, langKeys) === -1) {
            previewLanguage = langKeys[0];
        }

        const previewTabs = new jsTabs($('#sslTabs'), 'sslTabs');
        const previewTabList = {};
        $.each(langKeys, function (i, langKey) {
            previewTabList[langKey] = langKey;
        });

        const pSel = previewTabs.getEventType('select');
        $(window).off(pSel);
        $(window).on(pSel, function (ret) {
            previewLanguage = ret.detail;
            renderPreview();
        });

        previewTabs.setTabs(previewTabList, previewLanguage);
        disablePreviewTabs();

        function disablePreviewTabs() {
            const $tabs = $('#sslTabs .jsTab');
            $tabs.removeClass('jstActive')
                .addClass('jstDisabled')
                .css({
                    opacity: 0.4,
                    pointerEvents: 'none'
                });
        }

        function enablePreviewTabs() {
            const $tabs = $('#sslTabs .jsTab');
            $tabs.removeClass('jstDisabled')
                .css({
                    opacity: '',
                    pointerEvents: ''
                });
            previewTabs.select(previewLanguage);
        }

        function renderPreview() {
            const $prev = $('#sslPreview');
            const $header = $('#sslPreviewHeader');
            if (!$prev.length) {
                return;
            }

            $prev.empty();

            const rect = $prev[0].getBoundingClientRect();
            const style = window.getComputedStyle($prev[0]);

            const paddingLeft = parseFloat(style.paddingLeft);
            const paddingRight = parseFloat(style.paddingRight);
            const borderLeft = parseFloat(style.borderLeftWidth);
            const borderRight = parseFloat(style.borderRightWidth);

            const prevWidth = rect.width - paddingLeft - paddingRight - borderLeft - borderRight;

            $header.text(selectedTemplate ? selectedTemplate.name : '');

            if (!selectedTemplate || !selectedTemplate.score_screen) {
                return;
            }

            let html = selectedTemplate.score_screen[previewLanguage] || '';
            html = expandOasysRoot(html);

            const baseCss =
                '<style>' +
                getScoreEditorBaseCss() +
                '#sslPreview .button-variable,' +
                '#sslPreview .button-variable *,' +
                '#sslPreview .score-conditional-meta,' +
                '#sslPreview .score-conditional-meta *,' +
                '#sslPreview .score-conditional-remove,' +
                '#sslPreview .score-conditional-remove * {' +
                'cursor:default !important;' +
                '}' +
                '</style>';

            let customCss = selectedTemplate.score_screen.customCSS || '';
            customCss = customCss.replace(/\bbody\b/g, '#sslPreview');
            const cssBlock = customCss ? `<style>${customCss}</style>` : '';

            $prev.html(baseCss + cssBlock + '<div id="sslPreviewInner">' + html + '</div>');
            const $inner = $('#sslPreviewInner');

            $inner.css({
                transform: '',
                transformOrigin: '',
                width: ''
            });

            const contentWidth = $inner[0] ? $inner[0].scrollWidth : 0;

            if (prevWidth > 0 && contentWidth > prevWidth) {
                const scale = prevWidth / contentWidth;
                $inner.css({
                    transform: 'scale(' + scale + ')',
                    transformOrigin: 'top left',
                    width: contentWidth + 'px'
                });
            }
        }

        function renderList(filter) {
            const $list = $('#sslList');
            $list.empty();
            resetPreview();

            if (!templates.length) {
                $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No tests with a score screen were found.') + '</div>');
                return;
            }

            const q = (filter || '').toLowerCase();

            $.each(templates, function (idx, t) {
                if (q && t.name.toLowerCase().indexOf(q) === -1) {
                    return;
                }

                const $row = $('<button type="button" class="tmExistingEntriesTest sslRow"></button>')
                    .text(t.name)
                    .attr('data-idx', idx)
                    .on('click', function () {
                        $('.sslRow').removeClass('selected tmExistingEntriesTestSelected');
                        $(this).addClass('selected tmExistingEntriesTestSelected');
                        selectedTemplate = templates[idx];
                        enablePreviewTabs();
                        renderPreview();
                    });

                $list.append($row);
            });
        }

        $('#sslFilter').on('input', function () {
            renderList($(this).val());
        });

        startAjax('fetchScoreTemplates', {
			languages: Object.keys(languages),
			targetTestId: serverData.testLevel.id
        })
            .then(function (res) {
                if (res && res.data && res.data.scoreTemplates) {
                    templates = res.data.scoreTemplates;
                } else {
                    templates = [];
                }
                renderList('');
            })
            .catch(function (err) {
                console.error('Error loading score templates', err);
                templates = [];
                renderList('');
            });
    }
}

// Optional frontend helper for the rendered score screen.
// Call this after inserting the saved HTML into the DOM.
function applyScoreConditionsToScoreScreen(rootEl, scored, total) {
    if (!rootEl) {
        return;
    }

    const percentage = total > 0 ? (scored / total) * 100 : 0;

    function evaluateCondition(actual, operator, expected, maximum) {
        switch (operator) {
            case '>':
                return actual > expected;
            case '>=':
                return actual >= expected;
            case '<':
                return actual < expected;
            case '<=':
                return actual <= expected;
            case '=':
                return actual === expected;
			case 'between':
				return Number.isFinite(maximum) && actual > expected && actual < maximum;
			case 'betweenInclusive':
				return Number.isFinite(maximum) && actual >= expected && actual <= maximum;
			case 'betweenUpperInclusive':
				return Number.isFinite(maximum) && actual > expected && actual <= maximum;
			case 'betweenLowerInclusive':
				return Number.isFinite(maximum) && actual >= expected && actual < maximum;
            default:
                return false;
        }
    }

    rootEl.querySelectorAll('.score-conditional-block').forEach(function (block) {
        const metric = block.getAttribute('data-condition-metric') || 'percentage';
        const operator = block.getAttribute('data-condition-operator') || '>=';
        const rawValue = block.getAttribute('data-condition-value') || '0';
        const expected = Number(rawValue);
		const rawMaximum = block.getAttribute('data-condition-max-value');
		const maximum = rawMaximum === null || rawMaximum.trim() === '' ? NaN : Number(rawMaximum);

        if (Number.isNaN(expected)) {
            block.style.display = 'none';
            return;
        }

        const actual = metric === 'points' ? Number(scored) : percentage;
		const isVisible = evaluateCondition(actual, operator, expected, maximum);

        block.style.display = isVisible ? '' : 'none';
    });
}


function landingPage() {
	cleanupMetaTinyMceEditors();

    let lpDialogNormalized = false;

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            default: true,
            value: 'ok'
        }],
        contents:
            '<div id="landingMsg"></div>' +
            '<div id="landingOptions" style="padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f8f8;font-size:0.9rem;">' +
            '<div style="margin-bottom:4px;font-weight:bold;">' + UILANG.m('Landing page behaviour') + '</div>' +
            '<label style="display:block;margin-bottom:4px;">' +
            '<input type="radio" name="landingMode" value="default" style="margin-right:4px;">' +
            UILANG.m('Use global landing page from system settings') +
            '</label>' +
            '<div id="landingGlobalInfo" style="margin:4px 0 8px 23px;font-size:0.85rem;color:#555;"></div>' +
            '<label style="display:block;margin-bottom:0;">' +
            '<input type="radio" name="landingMode" value="custom" style="margin-right:4px;">' +
            UILANG.m('Use a custom landing page per language') +
            '</label>' +
            '</div>' +
            '<div style="height:605px;display:flex;flex-direction:column;" id="landingPageEditor">' +
            '<div id="lpTabsContainer"></div>' +
            '<div id="landingEditorCont" style="flex:1 1 auto;"></div>' +
            '</div>',
        title: UILANG.m('Edit landing page'),
        returnPromise: true,
        replaceExisting: 'lpEditor',
        width: 1250
    };

    showDialog('lpEditor', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                const mode = selectedLandingMode || 'default';

                const writeObj = {
                    mode: mode
                };

                $.each(languages, function (key) {
                    const ed = tinymce.get('container_' + key);
                    let html = ed ? ed.getContent() : '';
                    html = collapseOasysRoot(html);
                    writeObj[key] = html;
                });
                writeObj.customCSS = landingCustomCss || '';
                startAjax('saveTest', {
                    id: serverData.testLevel.id,
                    metaData: writeObj,
                    metaType: 'landing_page',
                    currentSkin: serverData.testLevel.skin.skin
                });
            }
			cleanupMetaTinyMceEditors();
        }
    );

    $('#landingMsg').append(
        '<div id="landingMsgBar" ' +
        'style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
        '<div id="landingMsgText" style="flex:1;margin-right:10px;">' +
        UILANG.m('Configure the landing page a user should see. You can either use the global system setting or define a custom landing page per language.') +
        '</div>' +
        '<div style="flex:0 0 auto;display:flex;align-items:center;">' +
        '<button type="button" id="btnLoadLandingFromExisting" class="nx-btn nx-btn-small" ' +
        'style="align-items:center;padding:4px 10px;">' +
        '<span class="nx-icon nx-icon-folder-open"></span>' +
        '<span>' + UILANG.m('Load existing') + '</span>' +
        '</button>' +
        '</div>' +
        '</div>'
    );

    const landingTabs = new jsTabs($('#lpTabsContainer'), 'lpTabs');
    const tabList = {};
    const containers = [];
    let currentLandingLanguage = null;

    let userLang;
    switch (settings.interfaceLanguage) {
        case 'DE':
            userLang = 'de';
            break;
        case 'FR':
            userLang = 'fr_FR';
            break;
        default:
            userLang = 'en';
            break;
    }

    const languageFallbacks = {
        DE: 'EN',
        FR: 'EN',
        LU: 'DE'
    };

    let baseLandingUrl = '';
    if (settings && settings.rootURL) {
        let ru = settings.rootURL.trim().replace(/\/+$/, '');

        if (/^https?:\/\//i.test(ru) || /^\/\//.test(ru)) {
            baseLandingUrl = ru;
        } else if (window.location && window.location.origin) {
            if (ru.charAt(0) !== '/') {
                ru = '/' + ru;
            }
            baseLandingUrl = window.location.origin + ru;
        }
    } else if (window.location && window.location.origin) {
        let path = window.location.pathname.replace(/\/+$/, '');
        baseLandingUrl = window.location.origin + path;
    } else {
        baseLandingUrl = '';
    }

    const testId = serverData.testLevel.id;

    let content = {};
    let landingOptions = { mode: 'default' };

    try {
        const meta = JSON.parse(serverData.testLevel.metadata || '{}');
        if (meta && typeof meta === 'object' && meta.landing_page && typeof meta.landing_page === 'object') {
            content = meta.landing_page;
            landingOptions.mode = content.mode || 'default';
        }
    } catch (e) {
        content = {};
        landingOptions = { mode: 'default' };
    }

    let landingCustomCss = '';
    if (content && typeof content === 'object' &&
        Object.prototype.hasOwnProperty.call(content, 'customCSS')
    ) {
        landingCustomCss = content.customCSS || '';
    }

    const landingEditors = [];

    const currentMode = landingOptions.mode || 'default';

    let selectedLandingMode = currentMode;

    $('input[name="landingMode"][value="' + currentMode + '"]').prop('checked', true);
    if (!$('input[name="landingMode"]:checked').length) {
        $('input[name="landingMode"][value="default"]').prop('checked', true);
    }
    selectedLandingMode = $('input[name="landingMode"]:checked').val() || 'default';

    const globalLanding = (settings && typeof settings.landingPage !== 'undefined' && settings.landingPage !== null)
        ? ('' + settings.landingPage)
        : '';
    if (globalLanding && globalLanding.trim() !== '') {
        $('#landingGlobalInfo').html(
            UILANG.m('Current global landing page from system settings:') +
            ' <code>' + $('<div/>').text(globalLanding).html() + '</code>'
        );
    } else {
        $('#landingGlobalInfo').html(
            UILANG.m('No global landing page is defined in the system settings. The standard login page will be used.')
        );
    }

    function applyLandingCustomCssToAllEditors() {
        if (!landingEditors.length) {
            return;
        }

        const baseVarCss =
            '.non-editable-variable {' +
            'background-color:#eee;' +
            'padding:2px 5px;' +
            'border-radius:4px;' +
            'font-weight:bold;' +
            '}' +
            '.button-variable {' +
            'background-color:#d9edf7;' +
            'color:#31708f;' +
            'cursor:pointer !important;' +
            'user-select:none;' +
            '}' +
            '.button-variable * {' +
            'cursor:pointer !important;' +
            '}';

        landingEditors.forEach(function (ed) {
            if (!ed) {
                return;
            }

            try {
                const doc = ed.getDoc && ed.getDoc();
                if (doc) {
                    const old = doc.querySelector('style[data-landing-css="1"]');
                    if (old) {
                        old.parentNode.removeChild(old);
                    }
                }
            } catch (e) {
                console.warn('Error cleaning old landing CSS style:', e);
            }

            if (!landingCustomCss && !baseVarCss) {
                return;
            }

            try {
                if (ed.dom && typeof ed.dom.addStyle === 'function') {
                    const combinedCss = baseVarCss + '\n' + (landingCustomCss || '');
                    ed.dom.addStyle(combinedCss);

                    const doc = ed.getDoc && ed.getDoc();
                    if (doc) {
                        const styles = doc.getElementsByTagName('style');
                        if (styles.length > 0) {
                            styles[styles.length - 1].setAttribute('data-landing-css', '1');
                        }
                    }
                }
            } catch (e) {
                console.warn('Error injecting landing CSS into editor', ed.id, e);
            }
        });
    }

    function openLandingCustomCssDialog() {
        const escCss = landingCustomCss || '';

        const dialogDataCss = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: 'Save',
                default: true,
                value: 'ok'
            }],
            title: 'Custom CSS',
            width: 900,
            returnPromise: true,
            datafields: ['landingCustomCssArea'],
            dataFormat: 'object',
            doNotStripHTML: true,
            contents:
                '<div>' +
                '<div style="margin-bottom:6px;">' +
                UILANG.m('Enter custom CSS that will be applied to all languages of the landing page editor.') +
                '</div>' +
                '<textarea id="landingCustomCssArea" data-tabindent ' +
                'style="width:100%;height:360px;resize:vertical;' +
                'font-family:monospace;font-size:12px;' +
                'border:1px solid #ccc;border-radius:4px;padding:6px;">' +
                $('<div/>').text(escCss).html() +
                '</textarea>' +
                '</div>'
        };

        showDialog('landingCustomCss', dialogDataCss).then(function (res) {
            if (res && res.button === 'ok' && res.data) {
                landingCustomCss = res.data.landingCustomCssArea || '';
                applyLandingCustomCssToAllEditors();
            }
        });
    }

    function updateLandingModeUI() {
        const mode = $('input[name="landingMode"]:checked').val() || 'default';
        selectedLandingMode = mode;

        const isCustom = (mode === 'custom');

        $('#landingPageEditor').css({
            visibility: isCustom ? 'visible' : 'hidden',
            pointerEvents: isCustom ? 'auto' : 'none'
        });

        $('#btnLoadLandingFromExisting').css({
            visibility: isCustom ? 'visible' : 'hidden',
            pointerEvents: isCustom ? 'auto' : 'none'
        });
    }

    $('input[name="landingMode"]').on('change', function () {
        const val = $(this).val();
        selectedLandingMode = val || 'default';
        updateLandingModeUI();
    });

    $.each(languages, function (key) {
        tabList[key] = key;
        containers.push('container_' + key);

        const defaultContent = {
            DE: '',
            EN: '',
            FR: '',
            LU: ''
        };

        let preLoad;
        if (content && Object.prototype.hasOwnProperty.call(content, key) &&
            typeof content[key] === 'string' && content[key].trim() !== '') {
            preLoad = content[key];
        } else {
            if (Object.prototype.hasOwnProperty.call(defaultContent, key)) {
                preLoad = defaultContent[key];
            } else {
                const fb = languageFallbacks[key] || 'EN';
                preLoad = defaultContent[fb] || defaultContent.EN;
            }
        }

        preLoad = expandOasysRoot(preLoad);

        const sep = baseLandingUrl.indexOf('?') === -1 ? '?' : '&';

        const landingUrl = baseLandingUrl
            ? (baseLandingUrl + sep +
                'landingPageId=' + encodeURIComponent(testId))
            : '';

        let urlHintHtml = '';
        if (landingUrl) {
            urlHintHtml =
                '<div class="landing-url-hint" ' +
                'style="font-size:0.8rem;color:#555;margin-top:6px;"><strong>' +
                UILANG.m('Link for this landing page:') + ' ' +
                '</strong><code id="lpLink_' + key + '" style="word-break:break-all;">' +
                $('<div/>').text(landingUrl).html() +
                '</code>' +
                '<span class="lp-copy-link" data-lang="' + key + '" ' +
                'title="' + UILANG.m('Copy to clipboard') + '" ' +
                'style="' +
                'margin-left:8px;' +
                'display:inline-flex;' +
                'align-items:center;' +
                'justify-content:center;' +
                'cursor:pointer;' +
                'opacity:0.7;' +
                'vertical-align:middle;' +
                '">' +
                '<svg xmlns="http://www.w3.org/2000/svg" ' +
                'width="18" height="18" ' +
                'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
                'style="display:block;">' +
                '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
                '<path d="M5 15H4a2 2 0 0 1-2-2V4 ' +
                'a2 2 0 0 1 2-2h9 ' +
                'a2 2 0 0 1 2 2v1"></path>' +
                '</svg>' +
                '</span>' +
                '</div>';
        }

        $('#landingEditorCont').append(
            '<div id="div_' + key + '">' +
            '<textarea id="container_' + key + '">' + preLoad + '</textarea>' +
            urlHintHtml +
            '</div>'
        );

        tinymce.init({
            selector: '#container_' + key,
            testId: serverData.testLevel.id,
            promotion: false,
            plugins: [
                'charmap',
                'code',
                'preview',
                'searchreplace',
                'table',
                'visualblocks',
                'visualchars',
                'wordcount',
                'lists',
                'advlist',
                'autolink',
                'link',
                'anchor',
                'insertdatetime',
                'fullscreen',
                'tmimagebrowser'
            ],
            toolbar: [
                'undo redo | blocks fontsize | bold italic underline forecolor backcolor | ' +
                'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | hr | tmimagebrowser | fullscreen metapreviewbutton',
                'customcss languagechooser login password loginbutton'
            ],
            menubar: 'edit view insert format tools table',
            contextmenu: 'undo redo | bold italic underline | link | align | bullist numlist | table',
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            menu: {
                edit:   { title: 'Edit',   items: 'undo redo | cut copy paste | selectall | searchreplace' },
                view:   { title: 'View',   items: 'metapreview | code | visualchars visualblocks | fullscreen' },
                insert: { title: 'Insert', items: 'link inserttable charmap hr insertdatetime' },
                format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript | blockformats fontsize align | forecolor backcolor | removeformat' },
                tools:  { title: 'Tools',  items: 'spellchecker spellcheckerlanguage | code' },
                table:  { title: 'Table',  items: 'inserttable tableprops deletetable row column cell' }
            },
            min_height: 525,
            resize: false,
            language: userLang,
            valid_elements: '*[*]',
            extended_valid_elements: 'span[class|style|contenteditable|data-url|data-action|data-label|data-login|data-password]',
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
            cursor: pointer !important;
            user-select: none;
        }
        .button-variable * {
            cursor: pointer !important;
        }`,
            setup: function (editor) {
                landingEditors.push(editor);

                const translations = {
                    en: {
                        languagechooser: 'Language chooser',
                        login: 'Login field',
                        password: 'Password field',
                        loginbutton: 'Login button',
                        definebuttonlabel: 'Button label',
                        login_value: 'Login (optional)',
                        password_value: 'Password (optional)',
                        default_label: 'Start',
                        insert: 'Insert',
                        update: 'Update',
                        cancel: 'Cancel'
                    },
                    de: {
                        languagechooser: 'Sprachauswahl',
                        login: 'Login-Feld',
                        password: 'Passwort-Feld',
                        loginbutton: 'Login-Button',
                        definebuttonlabel: 'Button-Beschriftung',
                        login_value: 'Login (optional)',
                        password_value: 'Passwort (optional)',
                        default_label: 'Start',
                        insert: 'Einfügen',
                        update: 'Aktualisieren',
                        cancel: 'Abbrechen'
                    },
                    fr_FR: {
                        languagechooser: 'Sélecteur de langue',
                        login: 'Champ login',
                        password: 'Champ mot de passe',
                        loginbutton: 'Bouton de connexion',
                        definebuttonlabel: 'Libellé du bouton',
                        login_value: 'Login (optionnel)',
                        password_value: 'Mot de passe (optionnel)',
                        default_label: 'Start',
                        insert: 'Insérer',
                        update: 'Mettre à jour',
                        cancel: 'Annuler'
                    }
                };

                const lang = translations[userLang] || translations.en;

                function insertVariable(variable) {
                    editor.insertContent(
                        `<span class="non-editable-variable" contenteditable="false">[@ ${variable} @]</span>&nbsp;`
                    );
                }

                editor.ui.registry.addButton('languagechooser', {
                    style: 'color:red',
                    text: lang.languagechooser,
                    icon: 'code-sample',
                    onAction: function () {
                        insertVariable('LANGUAGE-CHOOSER');
                    }
                });

                editor.ui.registry.addButton('login', {
                    text: lang.login,
                    icon: 'code-sample',
                    onAction: function () {
                        insertVariable('LOGIN');
                    }
                });

                editor.ui.registry.addButton('password', {
                    text: lang.password,
                    icon: 'code-sample',
                    onAction: function () {
                        insertVariable('PASSWORD');
                    }
                });

                function openLandingLoginButtonDialog(labelValue, loginValue, passwordValue, isEditing) {
                    editor.windowManager.open({
                        title: lang.loginbutton,
                        body: {
                            type: 'panel',
                            items: [
                                {
                                    type: 'input',
                                    name: 'label',
                                    label: lang.definebuttonlabel,
                                    value: labelValue || '',
                                    placeholder: lang.default_label
                                },
                                {
                                    type: 'input',
                                    name: 'login',
                                    label: lang.login_value,
                                    value: loginValue || ''
                                },
                                {
                                    type: 'input',
                                    name: 'password',
                                    label: lang.password_value,
                                    value: passwordValue || ''
                                }
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
                            label: labelValue || '',
                            login: loginValue || '',
                            password: passwordValue || ''
                        },
                        onSubmit: function (api) {
                            const data = api.getData();

                            const labelText = (data.label || '').trim() || lang.default_label;
                            const loginText = (data.login || '').trim();
                            const passwordText = (data.password || '').trim();

                            const buttonVar =
                                `<span class="non-editable-variable button-variable" contenteditable="false" ` +
                                `data-login="${loginText}" data-password="${passwordText}" data-label="${labelText}">` +
                                `${labelText}</span>&nbsp;`;

                            const selectedNode = editor.selection.getNode();
                            if (selectedNode.classList && selectedNode.classList.contains('button-variable')) {
                                selectedNode.outerHTML = buttonVar;
                            } else {
                                editor.insertContent(buttonVar);
                            }

                            api.close();
                        }
                    });
                }

                editor.ui.registry.addButton('loginbutton', {
                    text: lang.loginbutton,
                    icon: 'plus',
                    onAction: function () {
                        openLandingLoginButtonDialog('', '', '', false);
                    }
                });

                editor.on('click', function (e) {
                    if (e.target.classList && e.target.classList.contains('button-variable')) {
                        e.preventDefault();
                        const currentLabel = e.target.getAttribute('data-label') || '';
                        const currentLogin = e.target.getAttribute('data-login') || '';
                        const currentPassword = e.target.getAttribute('data-password') || '';
                        openLandingLoginButtonDialog(currentLabel, currentLogin, currentPassword, true);
                    }
                });

                editor.ui.registry.addButton('customcss', {
                    text: 'Custom CSS',
                    icon: 'sourcecode',
                    onAction: function () {
                        openLandingCustomCssDialog();
                    }
                });
                editor.ui.registry.addMenuItem('metapreview', {
                    text: UILANG.m('Preview'),
                    icon: 'preview',
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, landingCustomCss, 'landing_page');
                    }
                });
                editor.ui.registry.addButton('metapreviewbutton', {
                    icon: 'preview',
                    tooltip: UILANG.m('Preview'),
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, landingCustomCss, 'landing_page');
                    }
                });

                editor.on('init', function () {
                    if (landingCustomCss) {
                        applyLandingCustomCssToAllEditors();
                    }
                    if (!lpDialogNormalized) {
                        lpDialogNormalized = true;
                        requestAnimationFrame(() => {
                            const dlg = window.nxDialogManager?.instances?.lpEditor;
                            if (dlg && typeof dlg.normalizeInitialPosition === 'function') {
                                dlg.normalizeInitialPosition();
                            }
                        });
                    }
                });
            }
        });
    });

    $('#landingEditorCont')
        .off('click.landingCopy mouseenter.landingCopy mouseleave.landingCopy')
        .on('click.landingCopy', '.lp-copy-link', function () {
            const lang = $(this).data('lang');
            const $code = $('#lpLink_' + lang);
            if (!$code.length) return;

            const text = $code.text();
            if (!text) return;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function (err) {
                    console.warn('Clipboard copy failed (landing page):', err);
                });
            } else {
                const $tmp = $('<input type="text" style="position:absolute;left:-9999px;">')
                    .val(text)
                    .appendTo('body');
                $tmp.select();
                try {
                    document.execCommand('copy');
                } catch (e) {
                    console.warn('execCommand copy failed (landing page):', e);
                }
                $tmp.remove();
            }
        })
        .on('mouseenter.landingCopy', '.lp-copy-link', function () {
            $(this).css('opacity', '1');
        })
        .on('mouseleave.landingCopy', '.lp-copy-link', function () {
            $(this).css('opacity', '0.7');
        });

    let initialLanguage = null;

    const testOptions =
        serverData &&
        serverData.testLevel &&
        serverData.testLevel.options &&
        !Array.isArray(serverData.testLevel.options)
            ? serverData.testLevel.options
            : {};

    $.each(languages, function (key) {
        if (!initialLanguage && testOptions[key] === true) {
            initialLanguage = key;
        }
    });

    if (!initialLanguage) {
        initialLanguage = Object.keys(tabList)[0];
    }

    landingTabs.setTabs(tabList, initialLanguage);

    let tSel = landingTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function (ret) {
        for (let c in containers) {
            $('#div_' + containers[c].replace('container_', '')).hide();
        }
        const selectedLang = ret.originalEvent.detail;
        $('#div_' + selectedLang).show();
        currentLandingLanguage = selectedLang;
    });

    $.each(containers, function (key, val) {
        let lang = val.replace('container_', '');
        if (lang === initialLanguage) {
            $('#div_' + lang).show();
            currentLandingLanguage = lang;
        } else {
            $('#div_' + lang).hide();
        }
    });

    $('#btnLoadLandingFromExisting').off('click').on('click', function () {
        openLandingFromExistingDialog(currentLandingLanguage);
    });

    updateLandingModeUI();

    function openLandingFromExistingDialog(initialLanguageForPreview) {
        let selectedTemplate = null;
        let templates = [];
        let previewLanguage = initialLanguageForPreview || null;

        function resetPreview() {
            const $prev = $('#lplPreview');
            const $header = $('#lplPreviewHeader');
            if ($prev.length) $prev.empty();
            if ($header.length) $header.text('');
            selectedTemplate = null;
        }

        const dialogDataLoad = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: UILANG.m('Use selected'),
                default: true,
                value: 'ok'
            }],
            contents:
                '<div id="lplRoot" class="tmMetaLoadDialog">' +
                '<aside id="lplLeft" class="tmMetaLoadSources">' +
                '<label class="tmExistingEntriesFilter" for="lplFilter"><span>' + UILANG.m('Filter tests') + '</span><input id="lplFilter" type="text" autocomplete="off"></label>' +
                '<div id="lplList" class="tmExistingEntriesTestList"></div>' +
                '</aside>' +
                '<section id="lplRight" class="tmMetaLoadPreview">' +
                '<div id="lplTabs"></div>' +
                '<div id="lplPreviewWrapper" class="tmMetaLoadPreviewWrapper">' +
                '<div id="lplPreviewHeader" class="tmMetaLoadPreviewHeader"></div>' +
                '<div id="lplPreview" class="tmMetaLoadPreviewContent"></div>' +
                '</div>' +
                '</section>' +
                '</div>',
            title: UILANG.m('Load existing landing page'),
            returnPromise: true,
            width: 1150
        };

        showDialog('landingPageLoadExisting', dialogDataLoad).then(function (res) {
            if (res.button === 'ok' && selectedTemplate) {
                selectedLandingMode = 'custom';
                $('input[name="landingMode"][value="custom"]').prop('checked', true);
                updateLandingModeUI();

                if (selectedTemplate.landing_page) {
                    const metaData = {};
                    $.each(languages, function (langKey) {
                        metaData[langKey] = selectedTemplate.landing_page[langKey] || '';
                    });
                    metaData.customCSS = selectedTemplate.landing_page.customCSS || '';

                    startAjax('normalizeMetaUploads', {
                        id: serverData.testLevel.id,
                        metaType: 'landing_page',
                        metaData: metaData
                    }).then((resp) => {
						if (resp.error) return;
                        const normalized = resp.metaData || metaData;

                        $.each(languages, function (langKey) {
                            const vRaw = normalized[langKey] || '';
                            const v = expandOasysRoot(vRaw);
                            const ed = tinymce.get('container_' + langKey);
                            if (ed) {
                                ed.setContent(v);
                            }
                        });

                        landingCustomCss = normalized.customCSS || metaData.customCSS || '';
                        applyLandingCustomCssToAllEditors();
                    });
                }
            }
        });

        const langKeys = Object.keys(languages);
        if (!previewLanguage || $.inArray(previewLanguage, langKeys) === -1) {
            previewLanguage = langKeys[0];
        }

        const previewTabs = new jsTabs($('#lplTabs'), 'lplTabs');
        const previewTabList = {};
        $.each(langKeys, function (i, langKey) {
            previewTabList[langKey] = langKey;
        });

        const pSel = previewTabs.getEventType('select');
        $(window).off(pSel);
        $(window).on(pSel, function (ret) {
            previewLanguage = ret.detail;
            renderPreview();
        });

        previewTabs.setTabs(previewTabList, previewLanguage);
        disablePreviewTabs();

        function disablePreviewTabs() {
            const $bar = $('#lplTabs');
            const $tabs = $('#lplTabs .jsTab');

            $bar.css({
                borderBottomColor: '#ccc',
                opacity: 0.4,
                pointerEvents: 'none'
            });

            $tabs.removeClass('jstActive').css({
                opacity: 0.6
            });
        }

        function enablePreviewTabs() {
            const $bar = $('#lplTabs');
            const $tabs = $('#lplTabs .jsTab');

            $bar.css({
                borderBottomColor: '#217EAA',
                opacity: '',
                pointerEvents: ''
            });

            $tabs.css({
                opacity: ''
            });

            previewTabs.select(previewLanguage);
        }

        function renderPreview() {
            const $prev = $('#lplPreview');
            const $header = $('#lplPreviewHeader');
            if (!$prev.length) return;

            $prev.empty();

            const rect = $prev[0].getBoundingClientRect();
            const style = window.getComputedStyle($prev[0]);

            const paddingLeft = parseFloat(style.paddingLeft);
            const paddingRight = parseFloat(style.paddingRight);
            const borderLeft = parseFloat(style.borderLeftWidth);
            const borderRight = parseFloat(style.borderRightWidth);

            const prevWidth = rect.width - paddingLeft - paddingRight - borderLeft - borderRight;

            $header.text(selectedTemplate ? selectedTemplate.name : '');

            if (!selectedTemplate || !selectedTemplate.landing_page) {
                return;
            }

            let html = selectedTemplate.landing_page[previewLanguage] || '';
            html = expandOasysRoot(html);

            const baseCss =
                '<style>' +
                '.non-editable-variable{background-color:#eee;padding:2px 5px;border-radius:4px;font-weight:bold;}' +
                '.button-variable{background-color:#d9edf7;color:#31708f;cursor:pointer !important;user-select:none;}' +
                '.button-variable *{cursor:pointer !important;}' +
                '#lplPreview .button-variable,' +
                '#lplPreview .button-variable *{' +
                'cursor:default !important;' +
                '}' +
                '</style>';

            let customCss = selectedTemplate.landing_page.customCSS || '';
            customCss = customCss.replace(/\bbody\b/g, '#lplPreview');
            const cssBlock = customCss ? `<style>${customCss}</style>` : '';

            $prev.html(baseCss + cssBlock + '<div id="lplPreviewInner">' + html + '</div>');
            const $inner = $('#lplPreviewInner');

            $inner.css({
                transform: '',
                transformOrigin: '',
                width: ''
            });

            const contentWidth = $inner[0] ? $inner[0].scrollWidth : 0;

            if (prevWidth > 0 && contentWidth > prevWidth) {
                const scale = prevWidth / contentWidth;
                $inner.css({
                    transform: 'scale(' + scale + ')',
                    transformOrigin: 'top left',
                    width: contentWidth + 'px'
                });
            }
        }

        function renderList(filter) {
            const $list = $('#lplList');
            $list.empty();

            resetPreview();
            disablePreviewTabs();

            if (!templates.length) {
                $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No tests with custom landing pages were found.') + '</div>');
                return;
            }

            const q = (filter || '').toLowerCase();

            $.each(templates, function (idx, t) {
                if (q && t.name.toLowerCase().indexOf(q) === -1) {
                    return;
                }

                const $row = $('<button type="button" class="tmExistingEntriesTest lplRow"></button>')
                    .text(t.name)
                    .attr('data-idx', idx)
                    .on('click', function () {
                        $('.lplRow').removeClass('selected tmExistingEntriesTestSelected');
                        $(this).addClass('selected tmExistingEntriesTestSelected');
                        selectedTemplate = templates[idx];
                        enablePreviewTabs();
                        renderPreview();
                    });

                $list.append($row);
            });
        }

        $('#lplFilter').on('input', function () {
            renderList($(this).val());
        });

        startAjax('fetchLandingTemplates', {
			languages: Object.keys(languages),
			targetTestId: serverData.testLevel.id
        })
            .then(function (res) {
                if (res && res.data && res.data.landingTemplates) {
                    templates = res.data.landingTemplates.filter(function (t) {
                        if (t.landing_mode !== 'custom') return false;
                        if (!t.landing_page) return false;
                        const langs = Object.keys(languages);
                        for (let i = 0; i < langs.length; i++) {
                            const lk = langs[i];
                            const v = t.landing_page[lk] || '';
                            if (typeof v === 'string' && v.trim() !== '') {
                                return true;
                            }
                        }
                        return false;
                    });
                } else {
                    templates = [];
                }
                renderList('');
            })
            .catch(function (err) {
                console.error('Error loading landing templates', err);
                templates = [];
                renderList('');
            });
    }
}



function finishScreen() {
	cleanupMetaTinyMceEditors();

    let feDialogNormalized = false;

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'),
            cancel: true,
            value: 'cancel'
        }, {
            label: UILANG.m('Save'),
            default: true,
            value: 'ok'
        }],
        contents:
            '<div id="finishMsg"></div>' +
            '<div id="finishOptions" style="padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f8f8;font-size:0.9rem;">' +
            '<div style="margin-bottom:4px;font-weight:bold;">' + UILANG.m('Finish behaviour') + '</div>' +
            '<label style="display:block;margin-bottom:4px;">' +
            '<input type="radio" name="finishMode" value="default" style="margin-right:4px;">' +
            UILANG.m('Return to login page after test (no finish screen)') +
            '</label>' +
            '<label style="display:block;margin-bottom:4px;">' +
            '<input type="radio" name="finishMode" value="url" style="margin-right:4px;">' +
            UILANG.m('Open a custom URL after test:') +
            ' <input type="text" id="finishUrl" style="width:55%;margin-left:6px;padding:3px 5px;border-radius:4px;border:1px solid #ccc;" placeholder="https://example.com">' +
            '</label>' +
            '<label style="display:block;margin-bottom:0;">' +
            '<input type="radio" name="finishMode" value="custom" style="margin-right:4px;">' +
            UILANG.m('Show a custom finish screen (per language)') +
            '</label>' +
            '</div>' +
            '<div style="height:585px;display:flex;flex-direction:column;" id="finishScreenEditor">' +
            '<div id="feTabsContainer"></div>' +
            '<div id="finishEditorCont" style="flex:1 1 auto;"></div>' +
            '</div>',
        title: UILANG.m('Edit finish screen'),
        returnPromise: true,
        replaceExisting: 'feEditor',
        width: 1250
    };

    showDialog('feEditor', dialogData).then(
        (res) => {
            if (res.button === 'ok') {

                const mode = selectedFinishMode || 'default';
                let url = (typeof enteredFinishUrl === 'string') ? enteredFinishUrl.trim() : '';

                const writeObj = {
                    mode: mode,
                    url: url
                };

                $.each(languages, function (key) {
                    const ed = tinymce.get('container_' + key);
                    let html = ed ? ed.getContent() : '';
                    html = collapseOasysRoot(html);
                    writeObj[key] = html;
                });
                writeObj.customCSS = finishCustomCss || '';
                startAjax('saveTest', {
                    id: serverData.testLevel.id,
                    metaData: writeObj,
                    metaType: 'finish_screen',
                    currentSkin: serverData.testLevel.skin.skin
                });
            }
			cleanupMetaTinyMceEditors();
        }
    );

    $('#finishMsg').append(
        '<div id="finishMsgBar" ' +
        'style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
        '<div id="finishMsgText" style="flex:1;margin-right:10px;">' +
        UILANG.m('Configure what happens when the test is finished. You can either return to the login page, open a custom URL, or show a custom finish screen per language.') +
        '</div>' +
        '<div style="flex:0 0 auto;display:flex;align-items:center;">' +
        '<button type="button" id="btnLoadFinishFromExisting" class="nx-btn nx-btn-small" ' +
        'style="align-items:center;padding:4px 10px;">' +
        '<span class="nx-icon nx-icon-folder-open"></span>' +
        '<span>' + UILANG.m('Load existing') + '</span>' +
        '</button>' +
        '</div>' +
        '</div>'
    );

    const finishTabs = new jsTabs($('#feTabsContainer'), 'feTabs');
    const tabList = {};
    const containers = [];
    let currentFinishLanguage = null;

    let userLang;
    switch (settings.interfaceLanguage) {
        case 'DE':
            userLang = 'de';
            break;
        case 'FR':
            userLang = 'fr_FR';
            break;
        default:
            userLang = 'en';
            break;
    }

    const languageFallbacks = {
        DE: 'EN',
        FR: 'EN',
        LU: 'DE'
    };

    let content = {};
    let finishOptions = { mode: 'default', url: '' };

    try {
        const meta = JSON.parse(serverData.testLevel.metadata || '{}');
        if (meta && typeof meta === 'object' && meta.finish_screen && typeof meta.finish_screen === 'object') {
            content = meta.finish_screen;
            finishOptions.mode = content.mode || 'default';
            finishOptions.url = typeof content.url === 'string' ? content.url : '';
        }
    } catch (e) {
        content = {};
        finishOptions = { mode: 'default', url: '' };
    }

    let finishCustomCss = '';
    if (content && typeof content === 'object' &&
        Object.prototype.hasOwnProperty.call(content, 'customCSS')
    ) {
        finishCustomCss = content.customCSS || '';
    }

    const finishEditors = [];

    const currentMode = finishOptions.mode || 'default';
    const currentUrl = finishOptions.url || '';

    let selectedFinishMode = currentMode;
    let enteredFinishUrl = currentUrl;

    $('input[name="finishMode"][value="' + currentMode + '"]').prop('checked', true);
    if (!$('input[name="finishMode"]:checked').length) {
        $('input[name="finishMode"][value="default"]').prop('checked', true);
    }
    $('#finishUrl').val(currentUrl);

    selectedFinishMode = $('input[name="finishMode"]:checked').val() || 'default';
    enteredFinishUrl = $('#finishUrl').val() || '';

    function validateFinishUrl() {
        const $field = $('#finishUrl');
        if (!$field.length) return;

        const raw = $field.val();
        const val = (typeof raw === 'string') ? raw.trim() : '';
        let isValid = true;

        if (selectedFinishMode === 'url') {
            isValid = isValidHttpUrl(val);
        } else {
            isValid = true;
        }

        $field.css('border-color', isValid ? '' : '#d9534f');
    }

    function updateFinishModeUI() {
        const mode = $('input[name="finishMode"]:checked').val() || 'default';
        selectedFinishMode = mode;

        const isCustom = (mode === 'custom');
        const isUrl = (mode === 'url');

        $('#finishScreenEditor').css({
            visibility: isCustom ? 'visible' : 'hidden',
            pointerEvents: isCustom ? 'auto' : 'none'
        });

        $('#btnLoadFinishFromExisting').css({
            visibility: isCustom ? 'visible' : 'hidden',
            pointerEvents: isCustom ? 'auto' : 'none'
        });

        $('#finishUrl').prop('disabled', !isUrl);

        validateFinishUrl();
    }

    $('input[name="finishMode"]').on('change', function () {
        const val = $(this).val();
        selectedFinishMode = val || 'default';
        updateFinishModeUI();
    });

    $('#finishUrl').on('input', function () {
        const raw = $(this).val();
        enteredFinishUrl = (typeof raw === 'string') ? raw : '';
        validateFinishUrl();
    });

    function applyFinishCustomCssToAllEditors() {
        if (!finishEditors.length) {
            return;
        }

        const baseVarCss =
            '.non-editable-variable {' +
            'background-color:#eee;' +
            'padding:2px 5px;' +
            'border-radius:4px;' +
            'font-weight:bold;' +
            '}' +
            '.button-variable {' +
            'background-color:#d9edf7;' +
            'color:#31708f;' +
            'cursor:pointer !important;' +
            'user-select:none;' +
            '}' +
            '.button-variable * {' +
            'cursor:pointer !important;' +
            '}';

        finishEditors.forEach(function (ed) {
            if (!ed) return;

            try {
                const doc = ed.getDoc && ed.getDoc();
                if (doc) {
                    const old = doc.querySelector('style[data-finish-css="1"]');
                    if (old) {
                        old.parentNode.removeChild(old);
                    }
                }
            } catch (e) {
                console.warn('Error cleaning old finish CSS style:', e);
            }

            if (!finishCustomCss && !baseVarCss) {
                return;
            }

            try {
                if (ed.dom && typeof ed.dom.addStyle === 'function') {
                    const combinedCss = baseVarCss + '\n' + (finishCustomCss || '');
                    ed.dom.addStyle(combinedCss);

                    const doc = ed.getDoc && ed.getDoc();
                    if (doc) {
                        const styles = doc.getElementsByTagName('style');
                        if (styles.length > 0) {
                            styles[styles.length - 1].setAttribute('data-finish-css', '1');
                        }
                    }
                }
            } catch (e) {
                console.warn('Error injecting finish CSS into editor', ed.id, e);
            }
        });
    }

    function openFinishCustomCssDialog() {
        const escCss = finishCustomCss || '';

        const dialogDataCss = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: 'Save',
                default: true,
                value: 'ok'
            }],
            title: 'Custom CSS',
            width: 900,
            returnPromise: true,
            datafields: ['finishCustomCssArea'],
            dataFormat: 'object',
            doNotStripHTML: true,
            contents:
                '<div>' +
                '<div style="margin-bottom:6px;">' +
                UILANG.m('Enter custom CSS that will be applied to all languages of the finish screen editor.') +
                '</div>' +
                '<textarea id="finishCustomCssArea" data-tabindent ' +
                'style="width:100%;height:360px;resize:vertical;' +
                'font-family:monospace;font-size:12px;' +
                'border:1px solid #ccc;border-radius:4px;padding:6px;">' +
                $('<div/>').text(escCss).html() +
                '</textarea>' +
                '</div>'
        };

        showDialog('finishCustomCss', dialogDataCss).then(function (res) {
            if (res && res.button === 'ok' && res.data) {
                finishCustomCss = res.data.finishCustomCssArea || '';
                applyFinishCustomCssToAllEditors();
            }
        });
    }

    $.each(languages, function (key) {
        tabList[key] = key;
        containers.push('container_' + key);

        const defaultContent = {
            DE: '',
            EN: '',
            FR: '',
            LU: ''
        };

        let preLoad;
        if (content && Object.prototype.hasOwnProperty.call(content, key) &&
            typeof content[key] === 'string' && content[key].trim() !== '') {
            preLoad = content[key];
        } else {
            if (Object.prototype.hasOwnProperty.call(defaultContent, key)) {
                preLoad = defaultContent[key];
            } else {
                const fb = languageFallbacks[key] || 'EN';
                preLoad = defaultContent[fb] || defaultContent.EN;
            }
        }

        preLoad = expandOasysRoot(preLoad);

        $('#finishEditorCont').append('<div id="div_' + key + '"><textarea id="container_' + key + '">' + preLoad + '</textarea></div>');

        tinymce.init({
            selector: '#container_' + key,
            testId: serverData.testLevel.id,
            promotion: false,
            plugins: [
                'charmap', 'code', 'preview', 'searchreplace', 'table',
                'visualblocks', 'visualchars', 'wordcount', 'lists',
                'advlist', 'autolink', 'link', 'anchor', 'insertdatetime',
                'fullscreen', 'tmimagebrowser'
            ],
            toolbar: ['undo redo | blocks fontsize | bold italic underline forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | hr | tmimagebrowser | fullscreen metapreviewbutton', 'customcss addbutton'],
            menubar: 'edit view insert format tools table',
            contextmenu: 'undo redo | bold italic underline | link | align | bullist numlist | table',
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            menu: {
                edit: { title: 'Edit', items: 'undo redo | cut copy paste | selectall | searchreplace' },
                view: { title: 'View', items: 'metapreview | code | visualchars visualblocks | fullscreen' },
                insert: { title: 'Insert', items: 'link inserttable charmap hr insertdatetime' },
                format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | formats blockformats fontsize align | forecolor backcolor | removeformat' },
                tools: { title: 'Tools', items: 'spellchecker spellcheckerlanguage | code' },
                table: { title: 'Table', items: 'inserttable tableprops deletetable row column cell' }
            },
            min_height: 535,
            resize: false,
            language: userLang,
            valid_elements: '*[*]',
            extended_valid_elements: 'span[class|style|contenteditable|data-url|data-action|data-label]',
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
                    cursor: pointer !important;
                    user-select: none;
                }
                .button-variable * {
                    cursor: pointer !important;
                }
            `,
            setup: function (editor) {
                finishEditors.push(editor);
                const translations = {
                    en: {
                        addbutton: 'Add Button',
                        definebuttonlabel: 'Button label',
                        enter_url: 'Enter URL',
                        insert: 'Insert',
                        update: 'Update',
                        cancel: 'Cancel',
                        choose_action: 'Choose action',
                        return_login: 'Return to login screen',
                        open_url: 'Open URL',
                        url_required: 'URL is required for "Open URL"',
                        url_invalid: 'Please enter a valid URL starting with http:// or https://'
                    },
                    de: {
                        addbutton: 'Button',
                        definebuttonlabel: 'Button-Beschriftung',
                        enter_url: 'URL eingeben',
                        insert: 'Einfügen',
                        update: 'Aktualisieren',
                        cancel: 'Abbrechen',
                        choose_action: 'Aktion auswählen',
                        return_login: 'Zur Login-Seite zurückkehren',
                        open_url: 'URL öffnen',
                        url_required: 'Eine URL ist erforderlich für „URL öffnen“',
                        url_invalid: 'Bitte eine gültige URL mit http:// oder https:// eingeben.'
                    },
                    fr_FR: {
                        addbutton: 'Bouton',
                        definebuttonlabel: 'Libellé du bouton',
                        enter_url: 'Entrer l’URL',
                        insert: 'Insérer',
                        update: 'Mettre à jour',
                        cancel: 'Annuler',
                        choose_action: 'Choisir une action',
                        return_login: 'Revenir à la page de connexion',
                        open_url: 'Ouvrir URL',
                        url_required: 'Une URL est requise pour "Ouvrir URL"',
                        url_invalid: 'Veuillez saisir une URL valide commençant par http:// ou https://.'
                    }
                };

                const lang = translations[userLang] || translations.en;

                editor.ui.registry.addButton('addbutton', {
                    text: lang.addbutton,
                    icon: 'plus',
                    onAction: function () {
                        openButtonDialog(editor, '', 'returnToLogin', '', false);
                    }
                });
                editor.ui.registry.addButton('customcss', {
                    text: 'Custom CSS',
                    icon: 'sourcecode',
                    onAction: function () {
                        openFinishCustomCssDialog();
                    }
                });
                editor.ui.registry.addMenuItem('metapreview', {
                    text: UILANG.m('Preview'),
                    icon: 'preview',
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, finishCustomCss, 'finish_screen');
                    }
                });
                editor.ui.registry.addButton('metapreviewbutton', {
                    icon: 'preview',
                    tooltip: UILANG.m('Preview'),
                    onAction: function () {
                        openMetaPageCurrentPreview(editor, finishCustomCss, 'finish_screen');
                    }
                });

                editor.on('init', function () {
                    if (finishCustomCss) {
                        applyFinishCustomCssToAllEditors();
                    }
                    if (!feDialogNormalized) {
                        feDialogNormalized = true;
                        requestAnimationFrame(() => {
                            const dlg = window.nxDialogManager?.instances?.feEditor;
                            if (dlg && typeof dlg.normalizeInitialPosition === 'function') {
                                dlg.normalizeInitialPosition();
                            }
                        });
                    }
                });

                function openButtonDialog(editorInstance, existingUrl, existingAction, existingLabel, isEditing = false) {
                    let actionType = existingAction || 'returnToLogin';
                    let urlValue = existingUrl !== undefined ? existingUrl : '';
                    let labelValue =
                        existingLabel ||
                        (actionType === 'open_url' ? lang.open_url : lang.return_login);

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
                                        placeholder: lang.return_login
                                    },
                                    {
                                        type: 'selectbox',
                                        name: 'action',
                                        label: lang.choose_action,
                                        items: [
                                            { text: lang.return_login, value: 'returnToLogin' },
                                            { text: lang.open_url, value: 'open_url' }
                                        ],
                                        value: selectedAction || actionType
                                    },
                                    ...(selectedAction === 'open_url'
                                        ? [{
                                            type: 'input',
                                            name: 'url',
                                            label: lang.enter_url,
                                            placeholder: 'https://example.com',
                                            value: urlValue,
                                            required: true
                                        }]
                                        : [])
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
                                label: labelValue,
                                action: selectedAction || actionType,
                                url: urlValue
                            },
                            onChange: function (api, details) {
                                const data = api.getData();
                                labelValue = data.label;
                                if (typeof data.url !== 'undefined') {
                                    urlValue = data.url;
                                }

                                if (details.name === 'action') {
                                    api.redial(getDialogConfig(data.action));
                                }
                            },
                            onSubmit: function (api) {
                                const data = api.getData();
                                const selectedAction = data.action;
                                const url = selectedAction === 'open_url'
                                    ? (data.url || '').trim()
                                    : '';

                                if (selectedAction === 'open_url') {
                                    if (!url) {
                                        editorInstance.windowManager.alert(lang.url_required);
                                        return;
                                    }
                                    if (typeof isValidHttpUrl === 'function' && !isValidHttpUrl(url)) {
                                        editorInstance.windowManager.alert(lang.url_invalid);
                                        return;
                                    }
                                }

                                const labelText =
                                    data.label ||
                                    (selectedAction === 'open_url'
                                        ? lang.open_url
                                        : lang.return_login);

                                const buttonVar =
                                    `<span class="non-editable-variable button-variable" ` +
                                    `contenteditable="false" data-action="${selectedAction}" ` +
                                    `data-url="${url}" data-label="${labelText}">${labelText}</span>&nbsp;`;

                                const selectedNode = editorInstance.selection.getNode();
                                if (selectedNode.classList &&
                                    selectedNode.classList.contains('button-variable')) {
                                    selectedNode.outerHTML = buttonVar;
                                } else {
                                    editorInstance.insertContent(buttonVar);
                                }

                                api.close();
                            }
                        };
                    }

                    editorInstance.windowManager.open(getDialogConfig(actionType));
                }

                editor.on('click', function (e) {
                    if (e.target.classList &&
                        e.target.classList.contains('non-editable-variable') &&
                        e.target.classList.contains('button-variable')) {

                        e.preventDefault();
                        const currentAction =
                            e.target.getAttribute('data-action') || 'returnToLogin';
                        const currentUrl =
                            e.target.getAttribute('data-url') !== undefined
                                ? e.target.getAttribute('data-url')
                                : '';
                        const currentLabel =
                            e.target.getAttribute('data-label') || lang.return_login;

                        openButtonDialog(editor, currentUrl, currentAction, currentLabel, true);
                    }
                });
            }

        });
    });

    let initialLanguage = null;

    const testOptions =
        serverData &&
        serverData.testLevel &&
        serverData.testLevel.options &&
        !Array.isArray(serverData.testLevel.options)
            ? serverData.testLevel.options
            : {};

    $.each(languages, function (key) {
        if (!initialLanguage && testOptions[key] === true) {
            initialLanguage = key;
        }
    });

    if (!initialLanguage) {
        initialLanguage = Object.keys(tabList)[0];
    }

    finishTabs.setTabs(tabList, initialLanguage);

    let tSel = finishTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function (ret) {
        for (let c in containers) {
            $('#div_' + containers[c].replace('container_', '')).hide();
        }
        const selectedLang = ret.originalEvent.detail;
        $('#div_' + selectedLang).show();
        currentFinishLanguage = selectedLang;
    });

    $.each(containers, function (key, val) {
        let lang = val.replace('container_', '');
        if (lang === initialLanguage) {
            $('#div_' + lang).show();
            currentFinishLanguage = lang;
        } else {
            $('#div_' + lang).hide();
        }
    });

    $('#btnLoadFinishFromExisting').off('click').on('click', function () {
        openFinishFromExistingDialog(currentFinishLanguage);
    });

    updateFinishModeUI();
    validateFinishUrl();

    function openFinishFromExistingDialog(initialLanguageForPreview) {
        let selectedTemplate = null;
        let templates = [];
        let previewLanguage = initialLanguageForPreview || null;

        function resetPreview() {
            const $prev = $('#fslPreview');
            const $header = $('#fslPreviewHeader');
            if ($prev.length) $prev.empty();
            if ($header.length) $header.text('');
            selectedTemplate = null;
        }

        const dialogDataLoad = {
            buttons: [{
                label: UILANG.m('cancel'),
                cancel: true,
                value: 'cancel'
            }, {
                label: UILANG.m('Use selected'),
                default: true,
                value: 'ok'
            }],
            contents:
                '<div id="fslRoot" class="tmMetaLoadDialog">' +
                '<aside id="fslLeft" class="tmMetaLoadSources">' +
                '<label class="tmExistingEntriesFilter" for="fslFilter"><span>' + UILANG.m('Filter tests') + '</span><input id="fslFilter" type="text" autocomplete="off"></label>' +
                '<div id="fslList" class="tmExistingEntriesTestList"></div>' +
                '</aside>' +
                '<section id="fslRight" class="tmMetaLoadPreview">' +
                '<div id="fslTabs"></div>' +
                '<div id="fslPreviewWrapper" class="tmMetaLoadPreviewWrapper">' +
                '<div id="fslPreviewHeader" class="tmMetaLoadPreviewHeader"></div>' +
                '<div id="fslPreview" class="tmMetaLoadPreviewContent"></div>' +
                '</div>' +
                '</section>' +
                '</div>',

            title: UILANG.m('Load existing finish screen'),
            returnPromise: true,
            width: 1150
        };

        showDialog('finishScreenLoadExisting', dialogDataLoad).then(function (res) {
            if (res.button === 'ok' && selectedTemplate) {

                selectedFinishMode = 'custom';
                $('input[name="finishMode"][value="custom"]').prop('checked', true);
                updateFinishModeUI();

                if (selectedTemplate.finish_screen) {
                    const metaData = {};
                    $.each(languages, function (langKey) {
                        metaData[langKey] = selectedTemplate.finish_screen[langKey] || '';
                    });
                    metaData.customCSS = selectedTemplate.finish_screen.customCSS || '';

                    startAjax('normalizeMetaUploads', {
                        id: serverData.testLevel.id,
                        metaType: 'finish_screen',
                        metaData: metaData
                    }).then((resp) => {
						if (resp.error) return;
                        const normalized = resp.metaData || metaData;

                        $.each(languages, function (langKey) {
                            const vRaw = normalized[langKey] || '';
                            const v = expandOasysRoot(vRaw);
                            const ed = tinymce.get('container_' + langKey);
                            if (ed) {
                                ed.setContent(v);
                            }
                        });

                        finishCustomCss = normalized.customCSS || metaData.customCSS || '';
                        applyFinishCustomCssToAllEditors();
                    });
                }
            }
        });

        const langKeys = Object.keys(languages);
        if (!previewLanguage || $.inArray(previewLanguage, langKeys) === -1) {
            previewLanguage = langKeys[0];
        }

        const previewTabs = new jsTabs($('#fslTabs'), 'fslTabs');
        const previewTabList = {};
        $.each(langKeys, function (i, langKey) {
            previewTabList[langKey] = langKey;
        });

        const pSel = previewTabs.getEventType('select');
        $(window).off(pSel);
        $(window).on(pSel, function (ret) {
            previewLanguage = ret.detail;
            renderPreview();
        });

        previewTabs.setTabs(previewTabList, previewLanguage);
        disablePreviewTabs();

        function disablePreviewTabs() {
            const $bar = $('#fslTabs');
            const $tabs = $('#fslTabs .jsTab');

            $bar.css({
                borderBottomColor: '#ccc',
                opacity: 0.4,
                pointerEvents: 'none'
            });

            $tabs.removeClass('jstActive').css({
                opacity: 0.6
            });
        }

        function enablePreviewTabs() {
            const $bar = $('#fslTabs');
            const $tabs = $('#fslTabs .jsTab');

            $bar.css({
                borderBottomColor: '#217EAA',
                opacity: '',
                pointerEvents: ''
            });

            $tabs.css({
                opacity: ''
            });

            previewTabs.select(previewLanguage);
        }

        function renderPreview() {
            const $prev = $('#fslPreview');
            const $header = $('#fslPreviewHeader');
            if (!$prev.length) return;

            $prev.empty();

            const rect = $prev[0].getBoundingClientRect();
            const style = window.getComputedStyle($prev[0]);

            const paddingLeft = parseFloat(style.paddingLeft);
            const paddingRight = parseFloat(style.paddingRight);
            const borderLeft = parseFloat(style.borderLeftWidth);
            const borderRight = parseFloat(style.borderRightWidth);

            const prevWidth = rect.width - paddingLeft - paddingRight - borderLeft - borderRight;

            $header.text(selectedTemplate ? selectedTemplate.name : '');

            if (!selectedTemplate || !selectedTemplate.finish_screen) {
                return;
            }

            let html = selectedTemplate.finish_screen[previewLanguage] || '';
            html = expandOasysRoot(html);

            const baseCss =
                '<style>' +
                '.non-editable-variable{background-color:#eee;padding:2px 5px;border-radius:4px;font-weight:bold;}' +
                '.button-variable{background-color:#d9edf7;color:#31708f;cursor:pointer !important;user-select:none;}' +
                '.button-variable *{cursor:pointer !important;}' +
                '#fslPreview .button-variable,' +
                '#fslPreview .button-variable *{' +
                'cursor:default !important;' +
                '}' +
                '</style>';

            let customCss = selectedTemplate.finish_screen.customCSS || '';
            customCss = customCss.replace(/\bbody\b/g, '#fslPreview');
            const cssBlock = customCss ? `<style>${customCss}</style>` : '';

            $prev.html(baseCss + cssBlock + '<div id="fslPreviewInner">' + html + '</div>');
            const $inner = $('#fslPreviewInner');

            $inner.css({
                transform: '',
                transformOrigin: '',
                width: ''
            });

            const contentWidth = $inner[0] ? $inner[0].scrollWidth : 0;

            if (prevWidth > 0 && contentWidth > prevWidth) {
                const scale = prevWidth / contentWidth;
                $inner.css({
                    transform: 'scale(' + scale + ')',
                    transformOrigin: 'top left',
                    width: contentWidth + 'px'
                });
            }
        }

        function renderList(filter) {
            const $list = $('#fslList');
            $list.empty();

            resetPreview();
            disablePreviewTabs();

            if (!templates.length) {
                $list.append('<div class="tmExistingEntriesEmpty">' + UILANG.m('No tests with custom finish screens were found.') + '</div>');
                return;
            }

            const q = (filter || '').toLowerCase();

            $.each(templates, function (idx, t) {
                if (q && t.name.toLowerCase().indexOf(q) === -1) {
                    return;
                }

                const $row = $('<button type="button" class="tmExistingEntriesTest fslRow"></button>')
                    .text(t.name)
                    .attr('data-idx', idx)
                    .on('click', function () {
                        $('.fslRow').removeClass('selected tmExistingEntriesTestSelected');
                        $(this).addClass('selected tmExistingEntriesTestSelected');
                        selectedTemplate = templates[idx];
                        enablePreviewTabs();
                        renderPreview();
                    });

                $list.append($row);
            });
        }

        $('#fslFilter').on('input', function () {
            renderList($(this).val());
        });

        startAjax('fetchFinishTemplates', {
			languages: Object.keys(languages),
			targetTestId: serverData.testLevel.id
        })
            .then(function (res) {
                if (res && res.data && res.data.finishTemplates) {
                    templates = res.data.finishTemplates.filter(function (t) {
                        if (t.finish_mode !== 'custom') return false;
                        if (!t.finish_screen) return false;
                        const langs = Object.keys(languages);
                        for (let i = 0; i < langs.length; i++) {
                            const lk = langs[i];
                            const v = t.finish_screen[lk] || '';
                            if (typeof v === 'string' && v.trim() !== '') {
                                return true;
                            }
                        }
                        return false;
                    });
                } else {
                    templates = [];
                }
                renderList('');
            })
            .catch(function (err) {
                console.error('Error loading finish templates', err);
                templates = [];
                renderList('');
            });
    }
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
        const nameLabel = selection[0]['type'] === 'folder' ? UILANG.m('Folder name') : UILANG.m('Test name');
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + nameLabel + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
            '</div>',
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
    let createlocHTML = '<div class="tmVariableDialog tmVariableDialog-create">' +
        '<div class="tmVariableIntro"><span>' + UILANG.m('Enter the name for the new variable:') + '</span></div>' +
        '<label class="tmVariableNameField" for="newVariableName"><span>' + UILANG.m('Variable name') + '</span>' +
        '<input type="text" class="lblClick" id="newVariableName" maxlength="200"></label>' +
        '<div class="tmVariableIntro tmVariableHint"><span>' + UILANG.m('Localized content for the new variable:') + '</span><em>' + UILANG.m('Please add at least the languages you use in your test.') + '</em></div>' +
        buildVariableDialogLanguageFields(dataFields) +
        '</div>';

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

    let dataFields = ['labelname'];
    let newlabelHTML = '<div class="tmLabelDialog tmLabelDialog-create">' +
        '<label class="tmVariableNameField" for="labelname"><span>' + UILANG.m('Label name') + '</span>' +
        '<input type="text" id="labelname" maxlength="200"></label>' +
        buildLabelDialogLanguageFields(dataFields) +
        '</div>';

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
    let dataFields = ['labelname'];
    let editlabelHTML = '<div class="tmLabelDialog tmLabelDialog-edit">' +
        '<div class="tmVariableIntro"><span>' + UILANG.m('Current name for the label:') + '</span></div>' +
        '<label class="tmVariableNameField" for="labelname"><span>' + UILANG.m('Label name') + '</span>' +
        '<input type="text" id="labelname" maxlength="200"></label>' +
        buildLabelDialogLanguageFields(dataFields) +
        '</div>';

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
            contents: "<div class='tmAddPagesDialog' id='IGCHOOSER'></div>",
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
            contents: "<div class='tmAddPagesDialog' id='IGCHOOSER'></div>",
            title: UILANG.m('Add test pages to test structure'),
            width: 950,
            callback: proceeder
        };
    }
    window.igBrowser = new nxDialog('addItemsDialog', dialogData);

    gui.extra1 = createFlexSection('IGCHOOSER', 'extra001', 905, 905, 0, 'tmAddPagesSection');
    gui.boxes.tests = createFlexBox(gui.extra1, 'itemChooser', {
        minHeight: 500,
        flex: 1,
        noPadding: true
    });

    $('#itemChooser').append(
        "<div class='tmAddPagesLayout'>" +
            "<div class='tmAddPagesFileColumn'><div id='igContainer'></div></div>" +
            "<div class='tmAddPagesRightColumn'>" +
                "<div id='igContainerToolBar'></div>" +
                "<div id='igPreviewZone'><div class='tmAddPagesEmptyState'>" + UILANG.m('Select a page group to choose test pages.') + "</div></div>" +
            "</div>" +
        "</div>"
    );
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
    gui.library2 = new FileManager("#igContainer", "_itemGroups", [], itembreadcrumbs, itemGroupsOpPermissions, false, itemGroupLibraryEvent);

    function clickSearchIG() {
        gui.library2.filerSearch('', {metaSearch: true});
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
            case 'onMetaSearchRequest':
                startAjax('igSearch', {...data, searchMode: 'meta'});
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
            if(btnClicked==='add2'){deSelectItems();}
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
        contents: "<div class='tmMutationAssignDialog' id='tChooser'></div>",
        title: UILANG.m('Assign test to mutation test'),
        width: 950,
        callback: addTestToStructureList
    };

    window.testsBrowser = new nxDialog('addTestsDialog', dialogData);

    gui.extra1 = createFlexSection('tChooser', 'extra001', 905, 905, 0, 'tmMutationAssignSection');
    gui.boxes.tests = createFlexBox(gui.extra1, 'testChooser', {
        minHeight: 500,
        flex: 1,
        noPadding: true
    });

    $('#testChooser').append(
        "<div class='tmMutationAssignLayout'>" +
            "<div class='tmMutationAssignFileColumn'><div id='testsBrowserContainer'></div></div>" +
            "<div class='tmMutationAssignRightColumn'>" +
                "<div id='testsContainerToolBar'></div>" +
                "<div id='tMsg'></div>" +
                "<div id='tPreviewZone'><div class='tmMutationAssignEmptyState'>" + UILANG.m('Select a linear test to preview its test pages.') + "</div></div>" +
            "</div>" +
        "</div>"
    );
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
    gui.library2 = new FileManager("#testsBrowserContainer", "_tests", [], testbreadcrumbs, testsOpPermissions, false, testsLibraryEvent);

    function tClickSearch() {
        gui.library2.filerSearch('', {metaSearch: true});
    }

    //get library contents
    startAjax('fetchTestLibraryInt', {
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
                startAjax('fetchTestLibraryInt', {
                    location: tLoc.folder,
                    current: oldtLoc
                });
                break;
            case 'onBreadcrumbNavigate':
                oldtLoc = cloneObj(tLoc);
                tLoc.folder = data;
                startAjax('fetchTestLibraryInt', {
                    location: tLoc.folder,
                    current: oldtLoc
                });
                break;
            case 'onSearchRequest':
                startAjax('testsSearch', {
                    searchString: data
                });
                break;
            case 'onMetaSearchRequest':
                startAjax('testsSearch', {...data, searchMode: 'meta'});
                break;
            case 'onSearchItemClick':
                oldtLoc = cloneObj(tLoc);
                tLoc.folder = data.pid.replace(/^\D*/i, '');
                startAjax('fetchTestLibraryInt', {
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
        fluidHtml = '<div id="fluidContainer" class="fluidBlockDialog"><div class="fluidBlockIntro">' + UILANG.m('The fluid test') + ' <strong>' + serverData.testLevel.name + '</strong> ' + UILANG.m('has') + ' <strong>' + serverData.testLevel.testpools.length + '</strong> ' + testPoolsTxt + '!</div><div id="cList" class="fluidBlockPoolSelect"></div><div id="poolContentContainer"></div></div>';
    } else {
        fluidHtml = '<div id="fluidContainer" class="fluidBlockDialog"><div class="fluidBlockIntro">' + UILANG.m('The fluid test') + ' <strong>' + serverData.testLevel.name + '</strong> ' + UILANG.m('has') + ' <strong>0</strong> ' + UILANG.m('testpools. Please create testpools first!') + '</div></div>';
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
        theme: 'backend',
        readOnly: false,
        width: '100%',
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
    let skinOverridesItemHTML =
        '<div id="editOverridesDIV" class="skinOverrideEditor">' +
            '<div class="skinOverrideHeader">' +
                '<div class="skinOverrideHeaderMain">' +
                    '<span>' + UILANG.m('Change skin settings for:') + '</span>' +
                    '<strong>' + skinOverrideEscape(rowName) + '</strong>' +
                '</div>' +
                '<div class="skinOverrideHeaderMeta">' +
                    '<span>' + UILANG.m('Active skin:') + '</span>' +
                    '<strong>' + skinOverrideEscape(serverData.testLevel.skin.skin) + '</strong>' +
                '</div>' +
            '</div>' +
            '<div class="skinOverrideTableWrap">' +
                '<table id="itemSkinOverrides" class="skinOverrideTable">' +
                    '<colgroup><col class="skinOverrideColLabel"><col class="skinOverrideColDefault"><col class="skinOverrideColControlA"><col class="skinOverrideColControlB"></colgroup>' +
                    '<thead><tr><th colspan="2">' + UILANG.m('Current skin settings') + '</th><th colspan="2">' + UILANG.m('Current settings test page') + '</th></tr></thead>' +
                    '<tbody></tbody>' +
                '</table>' +
            '</div>' +
        '</div>';
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
        width: 760,
        callback: saveOverridesFunc
    };
    window.overridesSaver = new nxDialog('editOverridesDialog', dialogData);

    //Show defaults and settings per item
    let itemSkinOverridesTable = $('#itemSkinOverrides tbody');

    //Defaults
    let sOpts = serverData.testLevel.skin.skinOptions;
    let skinOverridesObj = {};
    let saveOverrides = {};

    if (sOverridesObj !== undefined) {
        saveOverrides = Object.assign({}, sOverridesObj);
    }

    $.each(sOpts, function(key, value) {
        const controlCell = '<td colspan="2" id="so__' + key + '" class="skinOverrideControl"></td>';
        const noOverrideCell = '<td colspan="2" class="skinOverrideControl overrideNullCell"><span>' + UILANG.m('No override allowed for this option!') + '</span></td>';

        switch (value.type) {
            case 'boolean':
                if (!$.isEmptyObject(sOpts[key].perItem)) {
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideBoolValue(value.value), controlCell, 'is-boolean'));
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
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideBoolValue(value.value), noOverrideCell, 'is-boolean'));
                }
                break;
            case 'textstring':
                if (!$.isEmptyObject(sOpts[key].perItem)) {
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideEscape(value.value), controlCell, 'is-text'));
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
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideEscape(value.value), noOverrideCell, 'is-text'));
                }
                break;
            case 'intrange':
                if (!$.isEmptyObject(sOpts[key].perItem)) {

                    let defaultVals = String(value.value).split('...');
                    let vals = String(key in saveOverrides ? saveOverrides[key] : value.value).split('...');
                    let minRangeContainer = 'minRangeContainer_' + key;
                    let maxRangeContainer = 'maxRangeContainer_' + key;

                    minMaxTmpValues[key] = vals[0] + '...' + vals[1];
                    itemSkinOverridesTable.append(
                        '<tr class="skinOverrideRow is-range">' +
                            '<td class="skinDefaultsCell skinOverrideLabel">' + UILANG.m(value.name) + '</td>' +
                            '<td class="skinDefaultsCell skinOverrideDefault">' + skinOverrideRangeValue(defaultVals) + '</td>' +
                            '<td id="' + minRangeContainer + '" class="skinOverrideRangeCell"><span>min</span></td>' +
                            '<td id="' + maxRangeContainer + '" class="skinOverrideRangeCell"><span>max</span></td>' +
                        '</tr>'
                    );
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
                    let minRangeX = new jsNumberInput(minRangeContainer, 'minRange_' + key, minRangeOptions);
                    let maxRangeX = new jsNumberInput(maxRangeContainer, 'maxRange_' + key, maxRangeOptions);
                } else {
                    let vals = value.value.split('...');
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideRangeValue(vals), noOverrideCell, 'is-range'));
                }
                break;
            case 'color':
                if (!$.isEmptyObject(sOpts[key].perItem)) {
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideColorValue(value.value), controlCell, 'is-color'));
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
                    itemSkinOverridesTable.append(skinOverrideRow(UILANG.m(value.name), skinOverrideColorValue(value.value), noOverrideCell, 'is-color'));
                }
                break;
        }
    });

    function soChanged(sender, value, dirty, dataId, type) {
        overridesSaver.enableButton('add');
        if (sender.indexOf('minRange_') === 0 || sender.indexOf('maxRange_') === 0) {
            let vals = minMaxTmpValues[dataId].split('...');
            if (sender.indexOf('minRange_') === 0) {
                value = value + '...' + vals[1];
            } else {
                value = vals[0] + '...' + value;
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

    function skinOverrideRow(label, defaultValue, controlCell, rowClass) {
        return '<tr class="skinOverrideRow ' + rowClass + '">' +
            '<td class="skinDefaultsCell skinOverrideLabel">' + label + '</td>' +
            '<td class="skinDefaultsCell skinOverrideDefault">' + defaultValue + '</td>' +
            controlCell +
        '</tr>';
    }

    function skinOverrideBoolValue(value) {
        return '<span class="skinOverrideBool"><img src="../images/' + skinOverrideEscape(value) + '.png" alt="" /></span>';
    }

    function skinOverrideRangeValue(vals) {
        return '<span class="skinOverrideRangeValue">' + skinOverrideEscape(vals[0]) + ' &rarr; ' + skinOverrideEscape(vals[1]) + '</span>';
    }

    function skinOverrideColorValue(value) {
        let color = skinOverrideEscape(value);
        return '<span class="skinOverrideColorValue"><span class="skinOverrideSwatch" style="background-color:' + color + ';"></span><span>' + color + '</span></span>';
    }

    function skinOverrideEscape(value) {
        return $('<div>').text(value == null ? '' : String(value)).html();
    }
}

//change label of test item
function changeLabel(testType, clickedId, parentId, hiddenData, rowName) {
    changesLabel = {};
    changesLabel.parentId = parentId;
    changesLabel.testType = testType;
    let labelCount = Object.keys(serverData.testLevel.labels).length;
    let labelHTML =
        '<div id="labelContainer" class="assignLabelDialog">' +
            '<div class="assignLabelSummary">' +
                '<div class="assignLabelSummaryMain">' +
                    '<span>' + UILANG.m('Current label assigned:') + '</span>' +
                    '<strong>' + tmPreviewEscape(hiddenData) + '</strong>' +
                '</div>' +
                '<div class="assignLabelSummaryMeta">' +
                    '<span>' + UILANG.m('labels found for test') + '</span>' +
                    '<strong>' + labelCount + '</strong>' +
                '</div>' +
            '</div>' +
            '<div class="assignLabelChooser">' +
                '<label for="lList">' + UILANG.m('Please choose a label:') + '</label>' +
                '<div id="lList"></div>' +
            '</div>' +
            '<div id="labelContentContainer" class="assignLabelContent"></div>' +
        '</div>';

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
        width: 760,
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
        theme: 'backend',
        width: '100%',
        readOnly: false,
        cssCollapsed: {
            'font-size': '12px'
        },
        cssExpanded: {
            'font-size': '12px'
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
            labelOptC.append(
                '<div class="assignLabelOptionRow">' +
                    '<span>' + UILANG.m('Assign chosen label to:') + '</span>' +
                    '<div id="labelChangeOptionsDiv"></div>' +
                '</div>'
            );
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
                theme: 'backend',
                readOnly: false,
                width: '280px',
                cssCollapsed: {
                    'font-size': '12px'
                },
                cssExpanded: {
                    'font-size': '12px'
                }
            };
            let labelOption = new jsDropList('labelChangeOptionsDiv', 'labelOpt', labelOptions);
            changesLabel.saveOption = 'current';

            labelListC.append('<h3>' + UILANG.m('Label-Content:') + '</h3>');
            labelListC.append('<table id="labelExampleTable"></table>');
            let labelExampleTable = $('#labelExampleTable');

            let htmlHeadLabelExample = '<thead><tr><th>' + UILANG.m('Language') + '</th><th>' + UILANG.m('Button') + '</th><th>' + UILANG.m('Headline') + '</th></tr></thead><tbody></tbody>';
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
                let buttonText = btnJson && typeof btnJson[k] !== 'undefined' ? btnJson[k] : '';
                let headlineText = headlineJson && typeof headlineJson[k] !== 'undefined' ? headlineJson[k] : '';
                let html = sf("<tr><td>%@</td><td>%@</td><td>%@</td></tr>", tmPreviewEscape(k), tmPreviewEscape(buttonText), tmPreviewEscape(headlineText));
                labelExampleTable.find('tbody').append(html);
            });
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

function showMessage(msg, type, width) {
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
        contents: formatActionErrorMessage(msg),
        width: width || 500,
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

let uniqueId = function() {
    return 'id-' + Math.random().toString(36).substring(2, 18);
};

/* server communication */
function startAjax(action, data) {
    waitDialog.show();
    const requestToken = data && data._requestToken;
    const previewCheckToken = data && data._previewCheckToken;
    const previewCheckTestId = data && data._previewCheckTestId;
    const payload = data ? Object.assign({}, data) : {};
	if (action === 'saveTest' && serverData.testLevel &&
		String(payload.id) === String(serverData.testLevel.id) && serverData.testLevel.editRevision) {
		payload.editRevision = serverData.testLevel.editRevision;
	}
    delete payload._requestToken;
    delete payload._previewCheckToken;
    delete payload._previewCheckTestId;
    let params = {
        action: action,
        data: JSON.stringify(payload)
    };
    return $.ajax({
        data: params,
        success: function(res) {
            if (typeof requestToken !== 'undefined') res._requestToken = requestToken;
            if (typeof previewCheckToken !== 'undefined') res._previewCheckToken = previewCheckToken;
            if (typeof previewCheckTestId !== 'undefined') res._previewCheckTestId = previewCheckTestId;
            ajaxSuccess(res);
        }
    });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    if (textStatus === 'abort') {
        waitDialog.hide();
        return;
    }
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
    startAjax('fetchMetaTagSuggestions', {})
        .then(function(res) {
            if (res && !res.error && gui.metaView) {
                gui.metaView.setSuggestions(res.suggestions || {});
            }
            gui.metaView.openNewDialog();
        });
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Meta-key') + '</label><input class="dfs" type="text" maxlength="200" id="dialogField1" placeholder="Subject"></div>' +
                '<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Meta-value') + '</label><input class="dfs" type="text" id="dialogField2" maxlength="200" placeholder="Mathematics"></div>' +
            '</div>',
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

/**
 * Inject the custom CSS for the editor's meta type into its iframe <head>.
 */
function applyMetaCustomCssToEditor(editor) {
    if (!editor) return;

    const metaType = editor.metaPageMetaType;
    if (!metaType || !Object.prototype.hasOwnProperty.call(metaPageCustomCss, metaType)) {
        return;
    }

    const css = metaPageCustomCss[metaType] || '';

    try {
        const doc = editor.getDoc && editor.getDoc();
        if (!doc) return;

        let styleEl = doc.getElementById('meta-custom-css');
        if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = 'meta-custom-css';
            doc.head.appendChild(styleEl);
        }

        styleEl.textContent = css;
    } catch (e) {
        console.warn('applyMetaCustomCssToEditor error:', e);
    }
}

/**
 * Open the "Custom CSS" dialog for the given editor/meta type.
 * The same CSS is shared across all language instances of that meta page.
 */
function openMetaCustomCssDialog(editor) {
    if (!editor) return;

    const metaType = editor.metaPageMetaType;
    if (!metaType || !Object.prototype.hasOwnProperty.call(metaPageCustomCss, metaType)) {
        return;
    }

    editor.windowManager.open({
        title: UILANG.m('Custom CSS'),
        size: 'large',
        body: {
            type: 'panel',
            items: [
                {
                    type: 'textarea',
                    name: 'css',
                    label: UILANG.m('CSS rules'),
                    flex: true
                }
            ]
        },
        initialData: {
            css: metaPageCustomCss[metaType] || ''
        },
        buttons: [
            {
                type: 'cancel',
                text: UILANG.m('cancel')
            },
            {
                type: 'submit',
                text: UILANG.m('save'),
                primary: true
            }
        ],
        onSubmit(api) {
            const data = api.getData();
            metaPageCustomCss[metaType] = data.css || '';

            // Update all editors that belong to the same meta block (all languages)
            if (typeof tinymce !== 'undefined' && tinymce.editors && tinymce.editors.length) {
                tinymce.editors.forEach(function (ed) {
                    if (ed.metaPageMetaType === metaType) {
                        applyMetaCustomCssToEditor(ed);
                    }
                });
            }

            api.close();
        }
    });
}



function isValidHttpUrl(str) {
    if (typeof str !== 'string') return false;
    const val = str.trim();
    if (!val) return false;
    // Require http/https, at least one dot in host and a 2+ letter TLD
    const pattern = /^(https?):\/\/([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(\/.*)?$/;
    return pattern.test(val);
}
function ajaxSuccess(res) {
    if ("isSuper" in res) window.isSuper = res.isSuper; // check for superadmin level status
    if ("isAdmin" in res) window.isAdmin = res.isAdmin; // check for admin level status
    if ("isAE" in res) window.isAE = isAE = res.isAE; // check for elevated admin status
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
            contents: formatActionErrorMessage('<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError),
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
        // if the error is from fetchTestLibraryInt, we need to reset the test folder target back to home (1)
        if (res.action === 'fetchTestLibraryInt') tLoc.folder = 1;

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
                contents: formatActionErrorMessage('<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error),
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
                contents: formatActionErrorMessage('<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error),
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
                    if (res.reloadTest && serverData.testLevel && serverData.testLevel.id) {
                        startAjax('fetchTest', {
                            dbId: serverData.testLevel.id,
                            location: loc.folder,
                            preSelect: true,
                            defaultSkin: settings['skin']
                        });
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

    if ((res.action === 'plausibilityCheck' || res.action === 'plausibilityFluidCheck') &&
        typeof res._previewCheckToken !== 'undefined') {
        handlePreviewPlausibilityResult(res);
        return;
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
            if (Number(res.resetAccessible || 0) > 0) {
                new nxDialog('resetResultsOutcome', {
                    title: UILANG.m('Results reset'),
                    type: 'success',
                    width: 580,
                    contents: '<div class="tmActionConfirm tmActionConfirm-success">' +
                        '<div class="tmActionConfirmHeading"><strong>' + UILANG.m('Reset complete') + '</strong></div>' +
                        '<span>' + (res.resetMode && res.resetMode !== 'all'
                            ? UILANG.m('All accessible result data matching the selected date criteria was deleted.')
                            : UILANG.m('All selected accessible result data was deleted.')) + '</span>' +
                        (res.warning ? '<p class="tmActionConfirmNote">' + escapeHtml(res.warning) + '</p>' : '') +
                    '</div>',
                    buttons: [{label: UILANG.m('OK'), value: 'ok', default: true, cancel: true}]
                });
            } else {
                const noResetMessage = res.resetMode && res.resetMode !== 'all'
                    ? UILANG.m('Nothing was deleted because no accessible results matched your criteria.')
                    : UILANG.m('No accessible results found to delete.');
                new nxDialog('resetResultsOutcome', {
                    title: UILANG.m('No matching results'),
                    type: 'warning',
                    width: 580,
                    contents: '<div class="tmActionConfirm tmActionConfirm-warning">' +
                        '<div class="tmActionConfirmHeading"><strong>' + UILANG.m('Nothing was deleted') + '</strong></div>' +
                        '<span>' + noResetMessage + '</span>' +
                        (res.warning ? '<p class="tmActionConfirmNote">' + escapeHtml(res.warning) + '</p>' : '') +
                    '</div>',
                    buttons: [{label: UILANG.m('OK'), value: 'ok', default: true, cancel: true}]
                });
            }
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
            itemsDisplayHTML =
                "<div class='tmAddPagesPreviewHeader'>" +
                    "<h4 class='igTableTitle'>" + UILANG.m('Available pages:') + "</h4>" +
                    "<p class='igPreviewZoneTitle'>" + UILANG.m('Please select what you like to add to the test! Pages defined as stimulus are marked as such.') + "</p>" +
                "</div>" +
                "<div class='tmAddPagesPreviewTableShell'><table class='tmAddPagesPreviewTableHead'><colgroup><col class='tmAddPagesPreviewColName'><col class='tmAddPagesPreviewColCode'><col class='tmAddPagesPreviewColPoints'><col class='tmAddPagesPreviewColCheck'></colgroup><thead><tr class='igHeads'><th>" + UILANG.m('Name') + "</th><th>" + UILANG.m('code') + "</th><th>" + UILANG.m('P') + "</th><th></th></tr></thead></table><div class='tmAddPagesPreviewTableWrap'><table id='itemsDisplayTable'><colgroup><col class='tmAddPagesPreviewColName'><col class='tmAddPagesPreviewColCode'><col class='tmAddPagesPreviewColPoints'><col class='tmAddPagesPreviewColCheck'></colgroup><tbody></tbody></table></div></div>";
            $('#igPreviewZone').append(itemsDisplayHTML);
            $.each(res['data'], function(key, value) {
                let html = sf("<tr id='itstim__%@'><td>%@</td><td>%@</td><td>%@</td><td><img src='../inc/filer/images/unchecked_checkbox.png' id='igChk%@' class='unchk' data-id='%@' data-code='%@' data-maxscore='%@' data-name='%@' data-igname='%@' /></td></tr>", value.id, escapeHtml(value.name), escapeHtml(value.itemCode), value.maxScore, value.id, value.id, value.itemCode, value.maxScore, value.name, value.igName);
                //Test Pages
                $('#itemsDisplayTable tbody').append(html);
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
                            $("#igChk" + value.id + "").attr('src', '.././inc/filer/images/unchecked_checkbox.png');
                        } else {
                            $("#igChk" + value.id + "").addClass('chk');
                            $("#igChk" + value.id + "").removeClass('unchk');
                            $("#itstim__" + value.id).addClass('itStiChecked');
                            $("#igChk" + value.id + "").attr('src', '.././inc/filer/images/checked_checkbox.png');
                        }
                    } else if (e.type === 'dblclick') {
                        $("#igChk" + value.id + "").addClass('chk');
                        $("#igChk" + value.id + "").removeClass('unchk');
                        $("#itstim__" + value.id).addClass('itStiChecked');
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
                $('#itemsDisplayTable tbody').empty();
                $('#itemsDisplayTable tbody').append('<tr><td colspan="4" class="itemsDisplayTableMissingMessage">' + UILANG.m('This page group has no test pages!') + '</td></tr>');
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
            firstRun = true;
            if (res.action === 'newTest') {
                gui.library.setSelection([{
                    id: res.data.id
                }], true);
                gui.library.getSelectDblclick();
            } else {
                gui.library.setSelection([{
                    id: res.data.id
                }]);
                gui.library.getSelect();
            }
            break;
        case 'fetchTestLibraryInt':
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
                $('#testID').html('<div class="tm_linear"><span>' + UILANG.m('linear test') + '</span><span>ID: ' + res.data.id + '</span></div>');
                $('.tmMutationPreviewTableHead thead').append("<tr><th>" + UILANG.m('Name test page') + "</th><th>" + UILANG.m('Code') + "</th></tr>");
                $.each(res.data.structure.items, function(key, value) {
                    let html;
                    if (value.name === 'Invalid test page!') {
                        html = sf("<tr class='is-invalid'><td>%@</td><td>%@</td></tr>", UILANG.m('Invalid test page!'), value.code);
                    } else {
                        html = sf("<tr><td>%@</td><td>%@</td></tr>", UILANG.e(value.name), value.code);
                    }
                    $('#testStrucDisplayHTML tbody').append(html);
                })
            }
            break;
        case 'testsSearch':
            if (res.data.list.length > 0) {
                gui.library2.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library2, {metaSearch: true});
            }
            break;
        case 'newTestpool':
            gui.statusBar.setStatus(UILANG.m('Testpool saved!'), 3000, '#0A0');
            switchMessage(res.testpools.length);
	            serverData.testLevel.testpools = Array.isArray(res.testpools) ? res.testpools : [];
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
                optC.append('<div class="fluidBlockEmpty">' + UILANG.m('The testpool') + ' <strong>"' + UILANG.e(res.data.name) + '"</strong> ' + UILANG.m('has no test pages assigned. Please use the testpool-editor to add test pages to the testpool!') + '</div>');
                addFluidBlock.disableButton('add');
            } else {
                //Create Options
                addFluidBlock.enableButton('add');
                optC.append('<div class="fluidBlockPoolSummary"><strong>' + res.data.structure.items.length + '</strong> ' + UILANG.m('elements found in testpool') + ' <strong>"' + UILANG.e(res.data.name) + '"</strong></div>');
                optC.append('<div class="fluidBlockOptionRow"><div class="fluidBlockOptionLabel">' + UILANG.m('Number of test pages of this testpool to be used?') + '</div><div class="fluidBlockOptionControl" id="itemUsageDroplistDiv"></div></div>');
                optC.append('<div class="fluidBlockOptionRow"><div class="fluidBlockOptionLabel">' + UILANG.m('Use test pages in random order or as defined in the testpool?') + '</div><div class="fluidBlockOptionControl" id="itemOrderDiv"></div></div>');

                let poolItemUsageOptions = {
                    onChange: itemUsageChanged,
                    initialValue: res.data.structure.items.length,
                    elements: [{
                        value: res.data.structure.items.length,
                        label: UILANG.m('Use all') + ' (' + res.data.structure.items.length + ')'
                    }],
                    dataId: 'piu',
                    theme: 'backend',
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
                    theme: 'backend',
                    readOnly: false,
                    width: 185
                };
                let poolItemOrder = new jsDropList('itemOrderDiv', 'itemOrder', poolItemOrderOptions);
                chosenPool.poolItemOrderValue = 'poolorder';
                //Create testpool content view
                igListC.append(
                    '<div class="fluidBlockPagesHeader">' +
                        '<div>' + UILANG.m('Test page') + '</div>' +
                        '<div>' + UILANG.m('Code') + '</div>' +
                        '<div>' + UILANG.m('Page group') + '</div>' +
                    '</div>' +
                    '<div class="fluidBlockPagesBody">' +
                        '<table id="stimuPoolDisplayTable" class="fluidBlockPagesTable"><colgroup><col class="fluidBlockColPage"><col class="fluidBlockColCode"><col class="fluidBlockColGroup"></colgroup><tbody></tbody></table>' +
                    '</div>'
                );
                let stiPoTable = $('#stimuPoolDisplayTable');

                $.each(res['data']['structure']['items'], function(key, value) {
                    let html = sf('<tr><td>%@</td><td>%@</td><td>%@</td></tr>', UILANG.e(value.name ?? ''), UILANG.e(value.code ?? ''), UILANG.e(value.itemGroup ?? ''));
                    stiPoTable.find('tbody').append(html);
                });
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
        case 'saveTestBulk': {
            // reload current folder first so user immediately sees updates
            startAjax('fetchLibrary', {
                location: loc.folder,
                rebuild: true,
                showBlocked: showBlocked
            });

            // Build the same style “Operation completed!” dialog as in addToSelected
            if ($("#bulkSaveDiv").length === 0) {
                $('body').append('<div id="bulkSaveDiv" style="display:none;"></div>');
            }
            const $boxRoot = $('#bulkSaveDiv').empty();
            $boxRoot.append('<div id="bulkSaveInfoBox"></div>');
            const $box = $('#bulkSaveInfoBox');

            $box.append('<h3>' + UILANG.m('Operation completed!') + '</h3>');

            // “Tasks” (succinct change summary from backend)
            if ((res.changes || []).length > 1) {
                $box.append('<strong>' + UILANG.m('Tasks:') + '</strong><br />');
            } else {
                $box.append('<strong>' + UILANG.m('Task:') + '</strong><br />');
            }
            (res.changes || []).forEach(line => $box.append(UILANG.e(line) + '<br />'));
            $box.append('<br />');

            // Warnings (e.g., skipped IDs, not found, no permission, etc.)
	            if ((res.warnings || []).length > 0) {
	                $boxRoot.append('<br /><div class="add2selError">' +
	                    UILANG.m('Warning:') + ' ' + UILANG.m('The following issues have been detected:') + '</div><br />');
	                (res.warnings || []).forEach(w => {
	                    const testId = (w && typeof w.testId !== 'undefined') ? String(w.testId) : '';
	                    const testName = (w && w.testName) ? String(w.testName) : '';
	                    const testLabel = testName
	                        ? UILANG.e(testName) + (testId ? ' <span style="font-weight:400;color:#60758a;">(ID: ' + UILANG.e(testId) + ')</span>' : '')
	                        : (testId ? UILANG.m('Test ID') + ': ' + UILANG.e(testId) : '');
	                    const heading = testLabel
	                        ? '<div style="font-weight:700;color:#173c55;margin-bottom:8px;">' + testLabel + '</div>'
	                        : '';
	                    const details = (w && w.html)
	                        ? w.html
	                        : '<div>' + UILANG.e((w && w.message) ? w.message : String(w)) + '</div>';
	                    $boxRoot.append(
	                        '<div style="margin:0 0 12px;padding:12px 14px;border:1px solid #edc36c;border-radius:7px;background:#fffaf0;">' +
	                        heading + details + '</div>'
	                    );
	                });
	            } else {
                $boxRoot.append('<br /><div class="add2selSuccessDiv">' +
                    UILANG.m('All tasks completed successfully. No issues found!') + '</div>');
            }
            $boxRoot.append('<br />');

            new nxDialog('bulkSaveMsgBox', {
                buttons: [{ label: UILANG.m('Close'), 'default': true, disabled: false, value: 'close' }],
                contentId: 'bulkSaveDiv',
                title: UILANG.m('Bulk edit tests'),
                width: 700
            });

            // Short status bar toast too
            const okCount = res.updated || 0;
            gui.statusBar.setStatus(
                UILANG.m('Bulk changes saved for [@count] test(s).').replace('[@count]', String(okCount)),
                4000, '#0A0'
            );
            break;
        }
        case 'importLinearStructureFromTemplate':
        case 'importMutationStructureFromTemplate':
        case 'saveTest':
        case 'saveSkinAssignment':
        case 'saveFluidPoolOrder':
        case 'saveFluidPageUsage':
        case 'clearTestStructure':
            if (res.startPreview) {
                /*  if the save routine was automatically triggered by the preview, we need to start the preview after
                    saving is done. In that case no need to do a fetchTest, as the editor is still up to date. */
                preview_step2();
            } else if (mode === 'browsing') {
                refreshTestLibraryForBrowsing();
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
            serverData.testLevel.editRevision = res.editRevision || serverData.testLevel.editRevision;
            gui.metaView.setItems(serverData.testLevel.metatags, true);
            updateMetaTagCounter(metaTbText, Object.keys(serverData.testLevel.metatags).length);
            break;
        case 'newMetaTag':
            serverData.testLevel.metatags = res.meta;
            serverData.testLevel.editRevision = res.editRevision || serverData.testLevel.editRevision;
            gui.metaView.setItems(serverData.testLevel.metatags, true);
            updateMetaTagCounter(metaTbText, Object.keys(serverData.testLevel.metatags).length);
            break;
	        case 'fetchTest':
	            if (mode === 'browsing' && typeof res._requestToken !== 'undefined') {
	                const responseTestId = res.data && (res.data.dbId || res.data.id);
	                if (res._requestToken !== pendingTestLevelToken ||
	                    String(responseTestId) !== String(pendingTestLevelId) ||
	                    selection.length !== 1 ||
	                    selection[0].type !== 'test' ||
	                    String(selection[0].dbId) !== String(responseTestId)) {
	                    return;
	                }
	            }
	            serverData.testLevel = res.data;
			serverData.testLevel.editRevision = res.editRevision || null;
            serverData.testLevel.testpools = res.testpools;
            serverData.testLevel.labels = res.labels;
            serverData.testLevel.activityData = res.activityData;
            serverData.testLevel.activityAccess = res.activityAccess;
            serverData.testLevel.previewResultStats = res.previewResultStats || null;
            serverData.testLevel.lastBackendEdit = res.lastBackendEdit || null;
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
            if (mode === 'browsing' && !editOnData) {
                previewPlausibilityResult = null;
                previewPlausibilityWarnings = {};
                renderTestPreview();
                launchPreviewPlausibilityCheck();
            } else {
                fillDataFields('editTest');
                setPublishedUiState();
            }
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
	                        aclMsgDataTable.append('<tr style="border-bottom:1px dotted #ccc;"><td style="padding:3px;">' + tmPreviewEscape(value.name) + '</td></tr>');
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
        case 'importEditorEntries':
            if (res.entryType === 'labels') {
                serverData.testLevel.labels = res.labels;
                listLabels();
            } else {
                serverData.testLevel.variables = res.refreshData;
                varLength = getObjectSize(serverData.testLevel.variables);
                if (varLength === 1) {
                    $('#variablesTbText').html(varLength + UILANG.m(' variable for your test found'));
                } else {
                    $('#variablesTbText').html(varLength + UILANG.m(' variables for your test found'));
                }
                listVariables();
            }
            if (res.importedCount > 0) {
                gui.statusBar.setStatus(res.importedCount + ' ' + UILANG.m(res.importedCount === 1 ? 'entry loaded.' : 'entries loaded.'), 3000, '#157347');
            }
            break;
        case 'importFluidTestpoolsFromTemplate':
            serverData.testLevel.testpools = res.testpools || [];
            gui.testpools.setItems(serverData.testLevel.testpools);
            switchMessage(serverData.testLevel.testpools.length);
            if (res.id) {
                currPoolId = res.id;
                gui.testpools.setSelection([res.id]);
                selectionChanged(gui.testpools.getSelection());
            } else {
                selectionChanged();
            }
            if (res.importedCount > 0) {
                gui.statusBar.setStatus(res.importedCount + ' ' + UILANG.m(res.importedCount === 1 ? 'testpool loaded.' : 'testpools loaded.'), 3000, '#157347');
            }
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
            $('#inactiveMsg').hide();

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
        case 'igSearch':
            if (res.data.list.length > 0) {
                gui.library2.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library2, {metaSearch: true});
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
                pbCheckHtml.append(pCheckSuccessHtml(UILANG.m('No issues found in your test content:'), [
                    UILANG.m('All test pages are still in the Content Manager.'),
                    UILANG.m('All test pages are not empty and have a content.'),
                    UILANG.m('All test pages are available in the active language(s).')
                ]));
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
                $.each(pCheckUniqueRows(res.noContentError, function(v) { return (v.itemCode || v.name || v.hiddenID); }), function(k, v) {
	                    $('#item_nocontent').append('<tr><td>' + tmPreviewEscape(v.name) + '</td><td>' + tmPreviewEscape(v.itemCode) + '</td></tr>');
                })
                $.each(res.noContentError, function(k, v) {
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
                $.each(pCheckUniqueRows(res.langError, function(v) { return (v.itemCode || v.name || v.hiddenID) + '|' + pCheckLanguageKey(v.languages); }), function(k, v) {
                    $.each(v.languages, function(key, value) {
                        if (missLangs === '') {
                            missLangs = value;
                        } else {
                            missLangs = missLangs + ' / ' + value;
                        }
                    });
	                    $('#item_languageconflict').append('<tr><td>' + tmPreviewEscape(v.name) + '</td><td>' + tmPreviewEscape(missLangs) + '</td><td>' + tmPreviewEscape(v.itemCode) + '</td></tr>');
                    missLangs = '';
                })
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
                        html: '<strong>' + UILANG.m('Warning') + ':</strong><br />' + UILANG.m('This page is not available in all languages of your test!') + ' ' + UILANG.m('Missing languages') + ': ' + missLangs
                    };
                    missLangs = '';
                })
            }
            // Test pages which have been added several times in the test
            if (res.duplicates) {
                pbCheckHtml.append('<p class="pCheckWarning">' + UILANG.m('Warning: The same test page has been added multiple times!') + '</p><table id="item_duplicates"></table><br />');
                $('#item_duplicates').append('<tr class="pCheckTableHead"><th class="langnamecol">' + UILANG.m('Test page') + '</th><th class="langlangcol">' + UILANG.m('Occurrences') + '</th></tr>');
                $.each(pCheckUniqueRows(res.duplicates, function(v) { return (v.name || v.hiddenID) + '|' + v.dupeCount; }), function(k, v) {
	                    $('#item_duplicates').append('<tr><td>' + tmPreviewEscape(v.name) + '</td><td>' + tmPreviewEscape(v.dupeCount) + '</td></tr>');
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
	                    $('#label_errorTable').append('<tr><td>' + tmPreviewEscape(v.name) + '</td><td>' + tmPreviewEscape(v.langCode) + '</td><td>' + tmPreviewEscape(v.issue) + '</td></tr>');
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
                pbCheckHtml.append(pCheckSuccessHtml(UILANG.m('No issues found in your test content:'), [
                    UILANG.m('All test pages are still in the Content Manager.'),
                    UILANG.m('All test pages are not empty and have a content.'),
                    UILANG.m('All test pages are available in the active language(s).')
                ]));
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
                $.each(pCheckUniqueRows(res.missing_items, function(v) { return v.name || v.hiddenID; }), function(k, v) {
	                    $('#item_missing').append('<tr><td>' + tmPreviewEscape(v.name) + '</td></tr>');
                })
                $.each(res.missing_items, function(k, v) {
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
                $.each(pCheckUniqueRows(res.itemsAmountError, function(v) { return (v.name || v.hiddenID) + '|' + v.itemsUsed + '|' + v.itemsTotal; }), function(k, v) {
	                    $('#item_neItems').append('<tr><td>' + tmPreviewEscape(v.name) + '</td><td>' + tmPreviewEscape(v.itemsUsed) + '</td><td>' + tmPreviewEscape(v.itemsTotal) + '</td></tr>');
                })
                $.each(res.itemsAmountError, function(k, v) {
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
                $.each(pCheckUniqueRows(res.noContentError, function(v) { return v.poolname || v.hiddenID; }), function(k, v) {
                    //Create line with poolname
	                    $('#item_nocontent').append('<tr class="pCheckSubHeadline"><td colspan="2"><strong>Testpool: </strong>' + tmPreviewEscape(v.poolname) + '</td></tr>');
                    // Create data lines
                    $('#item_nocontent').append('<tr class="pCheckTableHead"><th class="namecol">' + UILANG.m('Name') + '</th><th class="codecol">' + UILANG.m('Code') + '</th></tr>');
                    $.each(pCheckUniqueRows(v.data, function(value) { return value.itemCode || value.name; }), function(key, value) {
	                        $('#item_nocontent').append('<tr><td>' + tmPreviewEscape(value.name) + '</td><td>' + tmPreviewEscape(value.itemCode) + '</td></tr>');
                    });
                })
                $.each(res.noContentError, function(k, v) {
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
                $.each(pCheckUniqueRows(res.langError, function(v) { return v.poolname || v.hiddenID; }), function(k, v) {
                    //Create line with poolname
	                    $('#item_languageconflict').append('<tr class="pCheckSubHeadline"><td colspan="3"><strong>' + UILANG.m('Testpool') + ': </strong>' + tmPreviewEscape(v.poolname) + '</td></tr>');
                    // Create data lines
                    $('#item_languageconflict').append('<tr class="pCheckTableHead"><th class="langnamecol">' + UILANG.m('Name') + '</th><th class="langlangcol">' + UILANG.m('Languages') + '</th><th class="langcodecol">' + UILANG.m('Code') + '</th></tr>');
                    $.each(pCheckUniqueRows(v.data, function(value) { return (value.itemCode || value.name) + '|' + pCheckLanguageKey(value.languages); }), function(key, value) {
                        missLangs = '';
                        $.each(value.languages, function(key2, value2) {
                            if (missLangs === '') {
                                missLangs = value2;
                            } else {
                                missLangs = missLangs + ' / ' + value2;
                            }
                        });
	                        $('#item_languageconflict').append('<tr><td>' + tmPreviewEscape(value.name) + '</td><td>' + tmPreviewEscape(missLangs) + '</td><td>' + tmPreviewEscape(value.itemCode) + '</td></tr>');
                    });
                })
                $.each(res.langError, function(k, v) {
                    missLangs = '';
                    $.each(v.data || [], function(key, value) {
                        $.each(value.languages || [], function(key2, value2) {
                            if (missLangs === '') {
                                missLangs = value2;
                            } else {
                                missLangs = missLangs + ' / ' + value2;
                            }
                        });
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
                const renderedDuplicatePages = {};

                // Iterate through each test pool in res.duplicates
                $.each(res.duplicates, function(key, pool) {
                    // Iterate through the pages within each pool
                    $.each(pCheckUniqueRows(pool.pages, function(page) { return (pool.poolName || '') + '|' + (page.name || page.hiddenID) + '|' + page.dupeCount; }), function(pageKey, page) {
                        const duplicateKey = (pool.poolName || '') + '|' + (page.name || page.hiddenID) + '|' + page.dupeCount;
                        if (renderedDuplicatePages[duplicateKey]) return;
                        renderedDuplicatePages[duplicateKey] = true;
                        // Append the pool name, page name, and occurrence count to the table
	                        $('#item_duplicates').append('<tr><td>' + tmPreviewEscape(pool.poolName) + '</td><td>' + tmPreviewEscape(page.name) + '</td><td>' + tmPreviewEscape(page.dupeCount) + '</td></tr>');
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
	                    $('#label_errorTable').append('<tr><td>' + tmPreviewEscape(v.name) + '</td><td>' + tmPreviewEscape(v.langCode) + '</td><td>' + tmPreviewEscape(v.issue) + '</td></tr>');
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
    // Shield TinyMCE dialogs (Codeview, Link-Dialog, etc.) from global shortcuts like nxDialog's Enter/Escape handling
    (function () {
        // helper: check if event target is inside a TinyMCE dialog/aux container
        function isInTinyMceDialog(target) {
            if (!target || !target.closest) return false;
            return !!(target.closest('.tox-tinymce-aux') || target.closest('.tox-dialog'));
        }

        // Capture keydown *before* it reaches document-level handlers (like nxDialog)
        document.addEventListener('keydown', function (e) {
            if (!isInTinyMceDialog(e.target)) return;

            // In TinyMCE-Dialogs Enter/Escape sollen nicht bis zu nxDialog hochbubblen
            if (e.key === 'Enter' || e.keyCode === 13 || e.key === 'Escape' || e.keyCode === 27) {
                e.stopPropagation();
                // NICHT preventDefault(), damit TinyMCE selbst Enter/Escape weiterhin verarbeiten kann
            }
        }, true); // <- capture phase!

        // Gleiches für keyup, damit nxDialog-Keyup-Handler auch nichts mehr bekommen
        document.addEventListener('keyup', function (e) {
            if (!isInTinyMceDialog(e.target)) return;

            if (e.key === 'Enter' || e.keyCode === 13 || e.key === 'Escape' || e.keyCode === 27) {
                e.stopPropagation();
            }
        }, true);
    })();

}
