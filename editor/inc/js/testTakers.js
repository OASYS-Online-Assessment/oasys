"use strict";

/**
 * let the IDE know that these variables are created dynamically in PHP
 * @var {string} preSelect
 */

/**
 * @var {string} preType
 */


$(onReady);
$(document).on("contextmenu", function (e) {
    e.preventDefault();
    return false;
});
//gui elements
let kbHandler;
let waitDialog;
const buttons = {};
let gui = {};
let animationPlaying = false;

//details of the selection in the library
let selection = [];
let currPwId;
let filerPath;
//loginType
let stuLog = false;
let fileWizardType;
//data loaded from server
const serverData = {
    testLevel: null
};
let editType;
let add2allFlag = false;
//wizard data object
const wizardData = {};
wizardData.pwds = [];
wizardData.pwdMode = 'off';
wizardData.structure = [];
wizardData.currentPwId = 0;
wizardData.pwdsSameForAll = false;
wizardData.assignTests = false;
wizardData.pwdDigits = 0;
wizardData.noTestees = 1;
wizardData.startCount = 1;
wizardData.noAutoPwds = 1;
wizardData.leadingZeros = false;
wizardData.prefix = '';
wizardData.suffix = '';
wizardData.overrides = false;
wizardData.oAdditionalTime = 0;
wizardData.oSetTimer = false;
wizardData.oSetSaving = false;
wizardData.oSetNavLimit = false;
wizardData.oDemoMode = false;
wizardData.assignMtags = false;
wizardData.deleteExistingPwds = false;
wizardData.deleteExistingMtags = false;
wizardData.metaTags = {};
const wizardErrors = {};
let wizState = false;
let selHasStudent = false;
let wizardId;
let uploader;
//CreateFromFile data
let cffName;
let cffData;
//Test already assigned to password;
let testPresent = false;
//what part of the editor is currently active
let mode = 'browsing'; //browsing, editTest
//the location displayed in the library
let loc = {
    folder: 1, path: 'library', prefix: ''
};
let oldLoc = {
    folder: 1, path: 'library', prefix: ''
};
//the location displayed in the tests chooser
let igLoc = {
    folder: 1
};
//the breadcrumbs of the current location
let breadcrumbs;
//the breadcrumbs of the current location
let testbreadcrumbs;
//selected test in testbrowser
let testSelection;
//variables for tracking doubleclicks
let waitingForDblClick;
let libraryTimeout;
let editOnData = false;
//HTML frame for test structures in the  in the assign-test-form
const testStructureDisplayHTML = "<div id='presMsg'></div><div id='testID'></div><table id='testStrucDisplayHTML'></table><br />";
//OasysHelp
let standardLoginHtml, standardLoginTitle, studentLoginHtml, studentLoginTitle;
// global vars for blocked object handling
let curFFlist = null;
let showBlocked = true;

let jsph;

function onReady() {
    //setup in the beginning (e.g. onload or onready)
    //prohibit dropping files into the browser
    $('body').on('dragover', function (e) {
        e.preventDefault();
    });
    $('body').on('drop', function (e) {
        e.preventDefault();
    });

    $.ajaxSetup({
        type: "POST",
        cache: false,
        dataType: "json",
        timeout: 300000,
        success: ajaxSuccess,
        error: ajaxError,
        url: "testTakersActions.php"
    });

    // get show blocked object setting from user settings
    showBlocked = settings.showLockedObjects;

    waitDialog = new jsModalWait(UILANG.m('please wait'));
    kbHandler = new jsKeyboardHandler();
    kbHandler.permissionHandler(mayAcceptKeyStrokes);
    kbHandler.registerShortcut('ESC', abortEditing, {
        executeOnChildren: true
    });
    kbHandler.registerShortcut('CR', function () {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('del', deleteKey);
    kbHandler.registerShortcut('SHIFT+UP', cursorShiftUp);
    kbHandler.registerShortcut('CTRL+A', ctrlA);
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
    initGUI();
    gui = {
        boxes: {}, testLevel: {}
    };

    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">' + UILANG.m('Test Takers') + ':</strong>',
        message: UILANG.m('browsing test takers (logins)')
    });

    //main buttons
    buttons.abortEditing = new jsButton2($('header'), 'bAbortEditing', {
        label: UILANG.m('Close test taker'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: abortEditing,
        disabled: true
    });
    buttons.abortWizard = new jsButton2($('header'), 'bAbortWizard', {
        label: UILANG.m('Abort wizard'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: abortEditingReq,
        disabled: false
    });
    buttons.save = new jsButton2($('header'), 'bSave', {
        label: UILANG.m('Create test takers'),
        icon: '../images/toolbarIcons/ic_tb_saveButton.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: createFromWizard,
        disabled: false
    });
    buttons.addToSelection = new jsButton2($('header'), 'bAddToSelection', {
        label: UILANG.m('Add to selected'),
        icon: '../images/toolbarIcons/ic_tb_saveButton.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: addToSelected,
        disabled: false
    });
    buttons.saveFromFile = new jsButton2($('header'), 'bSaveFromFile', {
        label: UILANG.m('Import from file'),
        icon: '../images/toolbarIcons/ic_tb_csvUpload.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: createFromFile,
        disabled: true
    });
    buttons.resetCffWizard = new jsButton2($('header'), 'bReset', {
        label: UILANG.m('Reset'),
        icon: '../images/toolbarIcons/ic_tb_reset.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: resetCff,
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
    buttons.newTesteeTemplate = new jsButton2($('header'), 'bNewTesteeTemplate', {
        label: UILANG.m('New tt template'),
        icon: '../images/toolbarIcons/ic_tb_ttTemplate.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: newTest,
        disabled: false
    });
    buttons.newTest = new jsButton2($('header'), 'bNewTest', {
        label: UILANG.m('New test taker'),
        icon: '../images/toolbarIcons/ic_tb_TT.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: newTest,
        disabled: false
    });
    buttons.newStudentLogin = new jsButton2($('header'), 'bNewStudLog', {
        label: UILANG.m('New student login'),
        icon: '../images/toolbarIcons/ic_tb_addStudent.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: newStudentLogin,
        disabled: false
    });
    insertVerticalDivider('header', 'wizardStart');
    buttons.wizard = new jsButton2($('header'), 'bWizard', {
        label: UILANG.m('Test taker wizard'),
        icon: '../images/toolbarIcons/ic_tb_createMultipleTT.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: enterWizard,
        disabled: false
    });
    buttons.addPwdsTests = new jsButton2($('header'), 'bAddPwdsTests', {
        label: UILANG.m('Add to selected'),
        icon: '../images/toolbarIcons/ic_tb_users.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: enterWizard,
        disabled: true
    });
    buttons.wizardFile = new jsButton2($('header'), 'bWizardFile', {
        label: UILANG.m('Import from CSV'),
        icon: '../images/toolbarIcons/ic_tb_csvUpload.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: enterFileWizard,
        disabled: false
    });
    insertVerticalDivider('header', 'wizardEnd');
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
        label: UILANG.m('Edit'),
        icon: '../images/toolbarIcons/ic_tb_editDocuments.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: editSelection,
        disabled: true
    });
    buttons.duplicate = new jsButton2($('header'), 'bDuplicate', {
        label: UILANG.m('Duplicate'),
        icon: '../images/toolbarIcons/ic_tb_duplicateTT.png',
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
    buttons.resetResultsTestee = new jsButton2($('header'), 'bResetResTestee', {
        label: UILANG.m('Reset Results'),
        icon: '../images/toolbarIcons/ic_tb_reset_results.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: resetTestee,
        disabled: true
    });
    buttons.overrideSettings = new jsButton2($('header'), 'bOverrides', {
        label: UILANG.m('Override settings'),
        icon: '../images/toolbarIcons/ic_tb_overrideSetting.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: editOverrides,
        disabled: true
    });
    buttons.resetTestee = new jsButton2($('header'), 'bResTestee', {
        label: UILANG.m('Reset test taker results'),
        icon: '../images/toolbarIcons/ic_tb_reset_results.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: resetTestee,
        disabled: true
    });
    buttons.changeLoginType = new jsButton2($('header'), 'bChgType', {
        label: UILANG.m('Change login type'),
        icon: '../images/toolbarIcons/ic_tb_changeLoginType.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: changeLoginType,
        disabled: true
    });
    insertVerticalDivider('header', 'pCheckDivider');
    buttons.plausibilityCheck = new jsButton2($('header'), 'bpCheck', {
        label: UILANG.m('Plausibility check'),
        icon: '../images/toolbarIcons/ic_tb_pCheck.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: plausibilityCheck,
        disabled: true
    });
    buttons.wizardToFile = new jsButton2($('header'), 'bWizardToFile', {
        label: UILANG.m('Export list'),
        icon: '../images/toolbarIcons/ic_tb_csvDownload.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: enterFileToWizard,
        disabled: true
    });

    gui.s1 = createFlexSection('UI', 'sect001', 450, 450); //library
    gui.s2 = createFlexSection('UI', 'sect002', 336, 336); //passwords / meta tags
    gui.s3 = createFlexSection('UI', 'sect003', 580, 580); //tests
    gui.s4 = createFlexSection('UI', 'sect004', 450, 450); //wizard_main
    gui.s5 = createFlexSection('UI', 'sect005', 300, 300); //wizard_passwords
    gui.s6 = createFlexSection('UI', 'sect006', 450, 450); //wizard_tests
    gui.s7 = createFlexSection('UI', 'sect007', 1000, 1000); //create from csv
    gui.s8 = createFlexSection('UI', 'sect008', 350, 350); //wizard_Meta Tags
    gui.s9 = createFlexSection('UI', 'sect009', 350, 350); //login Settings Student logins

    // section 1 (browser)
    gui.boxes.tests = createFlexBox(gui.s1, 'testList', {
        title: UILANG.m('Test takers (Logins)'), minHeight: 480, flex: 1, noPadding: true
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
    $('#title_testList').append( /* html */ `<img alt="" data-val=${bvdv} id="bv_toggle" src="../images/${eyeStart}"/>`);

    $('#bv_toggle').on("click", function () {
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
            location: loc.folder, showBlocked: showBlocked
        });
    });

    let vbttdur = (settings.disableAnimations) ? 0 : 250;

    $('#bv_toggle').prop('title', UILANG.m("Toggle blocked item visibility"));
    $('#bv_toggle').tooltip({
        track: true, classes: {
            "ui-tooltip-content": "uitt-upgrader"
        }, show: {
            effect: "fadeIn", duration: vbttdur
        }, hide: {
            effect: "fadeOut", duration: vbttdur
        }
    });
    //section 2 login settings
    gui.boxes.loginSettings = createFlexBox(gui.s2, 'loginSettings', {
        title: UILANG.m('Login Settings'),
        minHeight: 168,
        flex: 0,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img alt="" style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });

    gui.boxes.loginSettings.getPanel().append('<div id="loginSettingsPanel"></div>');
    gui.boxes.loginSettings.getInnerBox().append('<div id="loginSettings"></div>');

    //section 2meta tags
    gui.boxes.metaTags = createFlexBox(gui.s2, 'metaTags', {
        title: UILANG.m('Meta-Tags'),
        minHeight: 220,
        flex: 0,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img alt="" style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });
    gui.boxes.metaTags.getInnerBox().append('<div id="metaTagList"></div>');

    //section 2 (passwords)
    gui.boxes.passwords = createFlexBox(gui.s2, 'passwords', {
        title: UILANG.m('Passwords'),
        minHeight: 300,
        flex: 1,
        locked: true,
        lockedClick: editSelection,
        lockedText: '<img alt="" style="cursor:pointer;" src="../images/ic_fl_veil_edit.png" />',
        useVeil: true,
        panelHeight: 30
    });
    gui.s2.hide();

    //section 3 (tests)
    gui.boxes.assignedTests = createFlexBox(gui.s3, 'assignedTests', {
        title: UILANG.m('Tests assigned'), minHeight: 480, flex: 1, panelHeight: 30
    });
    gui.s3.hide();

    gui.boxes.assignedTests.getInnerBox().append('<div id="inactiveMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('Please create a password first!') + '</h3></div><div id="noAssignmentMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('No test assigned yet. Click on the Plus-Icon to assign a test!') + '</h3></div><div id="testPanelList"></div>');

    //section 4 (Wizard_main)
    gui.boxes.wizard = createFlexBox(gui.s4, 'wizard', {
        title: UILANG.m('Test taker wizard'), minHeight: 480, flex: 1
    });
    gui.s4.hide();

    gui.boxes.wizard.getInnerBox().append('<div id="wiz_mainfr"></div>');

    //section 5 (wizard_passwords)
    gui.boxes.wpasswords = createFlexBox(gui.s5, 'wpasswords', {
        title: UILANG.m('Passwords'), minHeight: 480, flex: 1, locked: true, panelHeight: 30
    });
    gui.s5.hide();

    //section 6 (wizard_tests)
    gui.boxes.wtests = createFlexBox(gui.s6, 'wtests', {
        title: UILANG.m('Assigned Tests'), minHeight: 480, flex: 1, locked: true, panelHeight: 30
    });
    gui.s6.hide();
    gui.boxes.wtests.getInnerBox().append('<div id="wInactiveMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('Please create a password first!') + '</h3></div><div id="wNoAssignmentMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('No test assigned yet. Click on the Plus-Icon to assign a test!') + '</h3></div><div id="wTestPanelList"></div>');

    //section 7 (Create from CSV)
    gui.boxes.createFromCSV = createFlexBox(gui.s7, 'createFromCSV', {
        title: UILANG.m('Create from CSV'), minHeight: 480, flex: 1
    });
    gui.s7.hide();

    gui.boxes.createFromCSV.getInnerBox().append('<div id="csv_mainfr"><div id="infoZone" style="text-align:center;display:none;"></div><div id="uploadZone" style="text-align:center;display:none;"><h4>' + UILANG.m('Please select a csv-file from your local disk.') + '</h4><div id="mmBrowseDiv"><button>' + UILANG.m('Select a file') + '</button><input type="file" multiple id="browseDialog"></div></div><br /><br /><br /><div id="infomsg"></div>');

    //section 8 wizard meta tags
    gui.boxes.wMetaTags = createFlexBox(gui.s8, 'wMetaTags', {
        title: UILANG.m('Meta-tags'), minHeight: 480, flex: 1, locked: true, panelHeight: 30
    });
    gui.s8.hide();

    gui.boxes.wMetaTags.getInnerBox().append('<div id="wMetaTagList"></div>');

    const nxUploaderSettings = {
        filebrowser: 'browseDialog',
        action: 'read',
        readType: 'text',
        formatPattern: /(\.txt$|\.csv$|\.tsv$)/i,
        successCallback: onImport,
        dropMessage: UILANG.m('Drop CSV-file here!'),
        invalidFiletypeMessage: UILANG.m('The file you are trying to upload is not a valid CSV-file (comma separated values):'),
        singleUpload: true
    };
    uploader = new nxUploader(nxUploaderSettings);
    uploader.setInactive();

    //fileManager
    breadcrumbs = [{
        id: 1, name: "Home"
    }];
    const fileOpPermissions = {
        copyFolders: false, copyItems: true, copyMultiple: true, cutFolders: true, cutItems: true, cutMultiple: true
    };
    gui.library = new fileMgr("#testList", "_idSuffix", [], breadcrumbs, fileOpPermissions, true, libraryEvent, 'all', true);

    preSelect = Number(preSelect);
    preType = Number(preType);

    if (preSelect && preType && typeof preSelect === 'number' && typeof preType === 'number') {
        startAjax('fetchPreSelect', {
            id: preSelect, type: preType
        });
    } else {
        //get library contents
        startAjax('fetchLibrary', {
            location: loc.folder, showBlocked: showBlocked
        });
    }

    //Passwords
    gui.passwords = new jsSelectList(gui.boxes.passwords.getInnerBox(), 'itemSelector', {
        labelKey: 'name',
        orderKey: 'tag',
        secondaryOrderKey: 'name',
        postfixKey: 'tag',
        postfixFormat: "<span class='passwTagClass'>[%@]</span>",
        idKey: 'id',
        classConditions: {
            'passwordRequired': {
                path: ['metadata', 'pwReq'], value: true
            }
        },
        buttons: [{
            name: 'deletePassword',
            icon: '../images/inlineActions/ic_fl_inline_delete.png',
            tooltip: UILANG.m('Delete'),
            callback: deleteHovered,
            parameters: ['password'],
            width: 22,
            height: 22
        }, {
            name: 'editPassword',
            icon: '../images/inlineActions/ic_fl_inline_edit.png',
            tooltip: UILANG.m('Rename'),
            callback: editHovered,
            parameters: ['password'],
            width: 22,
            height: 22
        }, {
            name: 'setPassword',
            icon: '../images/inlineActions/ic_inline_set_pasw2.png',
            tooltip: UILANG.m('Set password'),
            callback: setPasswordForLabel,
            parameters: ['password'],
            width: 22,
            height: 22
        }],
        selectionCallback: selectionChanged,
        cancelSingleClickOnDoubleClick: false
    });
    gui.passwords.disable();

    //Toolbar passwords
    gui.boxes.passwords.getPanel().append('<div><div id="passwordsTbText"></div><div id="passwordsTbButton"></div></div>');
    const passwordsTbText = $('#passwordsTbText');

    window.passwordsTbButtons = {};
    passwordsTbButtons.addQuickPass = new nxButton($('#passwordsTbButton'), 'pwTbQuickAdd', {
        icon: '../images/addQuickPass.png',
        iconWidth: 22,
        callback: addQuickPassword,
        tooltip: UILANG.m('Add quick random password (6 characters)'),
        disabled: true
    });
    passwordsTbButtons.addElements = new nxButton($('#passwordsTbButton'), 'pwTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: selectListBtnNewPw,
        tooltip: UILANG.m('Add password'),
        disabled: true
    });
    //Wizard Passwords
    gui.wpasswords = new jsSelectList(gui.boxes.wpasswords.getInnerBox(), 'wPasswords', {
        labelKey: 'name',
        orderKey: 'name',
        postfixKey: 'tag',
        postfixFormat: "<span class='passwTagClass'>[%@]</span>",
        idKey: 'id',
        classConditions: {
            'passwordRequired': {
                path: ['metadata', 'pwReq'], value: true
            }
        },
        buttons: [{
            name: 'deletePassword',
            icon: '../images/inlineActions/ic_fl_inline_delete.png',
            tooltip: UILANG.m('Delete'),
            callback: deleteHovered,
            parameters: ['wizard'],
            width: 22,
            height: 22
        }, {
            name: 'editPassword',
            icon: '../images/inlineActions/ic_fl_inline_edit.png',
            tooltip: UILANG.m('Rename'),
            callback: editHovered,
            parameters: ['wizard'],
            width: 22,
            height: 22
        }, {
            name: 'setPassword',
            icon: '../images/inlineActions/ic_inline_set_pasw2.png',
            tooltip: UILANG.m('Set password'),
            callback: setPasswordForLabel,
            parameters: ['wizard'],
            width: 22,
            height: 22
        }],
        selectionCallback: wizardSelectionChanged,
        cancelSingleClickOnDoubleClick: false
    });
    //Toolbar passwords
    gui.boxes.wpasswords.getPanel().append('<div><div id="wpasswordsTbText"></div><div id="wpasswordsTbButton"></div></div>');
    const wpasswordsTbText = $('#wpasswordsTbText');

    window.wpasswordsTbButtons = {};
    wpasswordsTbButtons.addElements = new nxButton($('#wpasswordsTbButton'), 'wpwTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: selectListBtnNewWizardPw,
        tooltip: UILANG.m('Add password'),
        disabled: false
    });


    //structureView
    const STOptions = {
        onChange: testsChanged,
        onClick: resetTest,
        elements: [],
        tdSizes: {
            name: '300px', ID: '65px'
        },
        tableHead: {
            name: 'Tests', ID: 'Test-ID'
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'border': '0px', 'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px', 'background-color': 'transparent', 'border-bottom': '1px dotted #CCC', 'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px', 'background-color': '#e8e8e8', 'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'structure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionField: true,
        actionFieldSize: '96px',
        cssStylesAFdefault: {
            // 'background-color': '#eee',
            'color': '#bebebe', 'text-align': 'left',
        },
        cssStylesAFmodified: {
            'color': '#dd1a00', 'text-align': 'left',
        },
        cssStylesAFinactive: {
            'color': '#bebebe', 'text-align': 'left',
        },
        actionButton: false,
        actionFieldColText: UILANG.m('Results'),
        actionFieldDefaultText: UILANG.m('no data yet'),
        actionFieldModifiedText: UILANG.m('Reset'),
        actionFieldInactiveText: 'n / a',
        showTextOnly: 'default'
    };
    gui.structureView = new jsSortableTable('testPanelList', 'assignedTests_table', STOptions);
    gui.structureView.lock('greyout');
    //Toolbar Test Structure
    gui.boxes.assignedTests.getPanel().append('<div><div id="structureTbText"></div><div id="structureTbButton"></div></div>');
    const structureTbText = $('#structureTbText');

    window.structureTbButtons = {};
    structureTbButtons.copyLink = new nxButton($('#structureTbButton'), 'pwTbCopy', {
        icon: '../images/flexSectionToolBar/ic_flex_tb_copy_url.png',
        iconWidth: 22,
        callback: copyLoginLink,
        tooltip: UILANG.m('Copy login link to clipboard'),
        disabled: true
    });
    structureTbButtons.resetPass = new nxButton($('#structureTbButton'), 'pwTbReset', {
        icon: '../images/resetPass.png',
        iconWidth: 22,
        callback: resetPassword,
        tooltip: UILANG.m('Reset all tests for selected password'),
        disabled: true
    });
    structureTbButtons.addElements = new nxButton($('#structureTbButton'), 'stTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addTests,
        tooltip: UILANG.m('Assign tests'),
        disabled: true
    });

    //Meta Tags
    const metaList = {
        onChange: metaChanged,
        elements: [],
        tdSizes: {
            metakey: '120px', metavalue: '185px'
        },
        tableHead: {
            metakey: 'Meta-Key', metavalue: 'Meta-Value'
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'border': '0px', 'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px', 'background-color': 'transparent', 'border-bottom': '1px dotted #CCC', 'height': '20px'
        },
        cssHeadCells: {
            'padding': '5px', 'background-color': '#e8e8e8', 'height': '20px'
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
    const metaTbText = $('#metaTbText');
    window.metaTbButtons = {};
    metaTbButtons.addElements = new nxButton($('#metaTbButton'), 'mTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addMetaTag,
        tooltip: UILANG.m('Add meta tag'),
        disabled: true
    });

    //Wizard Meta Tags
    const wMetaList = {
        onChange: wMetaChanged,
        elements: [],
        tdSizes: {
            metakey: '120px', metavalue: '155px'
        },
        tableHead: {
            metakey: UILANG.m('Meta-Key'), metavalue: UILANG.m('Meta-Value')
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '320px', 'border': '0px', 'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px', 'background-color': 'transparent', 'border-bottom': '1px dotted #CCC', 'height': '20px'
        },
        cssHeadCells: {
            'padding': '5px', 'background-color': '#e8e8e8', 'height': '20px'
        },
        dataId: 'metatags',
        consecutiveNumbers: false,
        tableHeadDisplay: true,
        fixedOrder: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false
    };
    gui.wMetaView = new jsSortableTable('wMetaTagList', 'wMetaTagList_table', wMetaList);

    gui.boxes.wMetaTags.getPanel().append('<div><div id="wMetaTbText"></div><div id="wMetaTbButton"></div></div>');
    const wMetaTbText = $('#metaTbText');
    window.wMetaTbButtons = {};
    wMetaTbButtons.addElements = new nxButton($('#wMetaTbButton'), 'wMtbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: wAddMetaTag,
        tooltip: UILANG.m('Add meta tag'),
        disabled: false
    });

    //Assigning tests in the wizard
    const WSTOptions = {
        onChange: wtestsChanged,
        elements: [],
        tdSizes: {
            name: '240px', ID: '45px'
        },
        tableHead: {
            name: 'Tests', ID: 'Test-ID'
        },
        deleteLinkSize: '20px',
        cssStylesTable: {
            'width': '415px', 'border': '0px', 'border-spacing': '0px'
        },
        cssStylesCells: {
            'padding': '3px', 'background-color': 'transparent', 'border-bottom': '1px dotted #CCC', 'height': '25px'
        },
        cssHeadCells: {
            'padding': '5px', 'background-color': '#e8e8e8', 'height': '20px'
        },
        consecutiveNumbersSize: '30px',
        consecutiveNumbersText: '#',
        dataId: 'wstructure',
        consecutiveNumbers: true,
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false
    };
    gui.wStructureView = new jsSortableTable('wTestPanelList', 'wTests_table', WSTOptions);
    //Toolbar Test Structure
    gui.boxes.wtests.getPanel().append('<div><div id="wStructureTbText"></div><div id="wStructureTbButton"></div></div>');
    const wStructureTbText = $('#wStructureTbText');

    window.wStructureTbButtons = {};
    wStructureTbButtons.addElements = new nxButton($('#wStructureTbButton'), 'wStTbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addTests,
        tooltip: UILANG.m('Assign tests'),
        disabled: false
    });

    jsph = jsPointerHandler.instance;

    //OasysHelp
    standardLoginHtml = UILANG.m('<p>A standard login in OASYS is designed to connect users directly to specific tests. This type of login can have one or more passwords, each of which is linked to one or more tests. When a user logs in with a standard login, they are immediately connected to the tests associated with their credentials.</p><p>This setup is ideal for situations where users need direct access to specific tests without additional navigation.</p>');
    standardLoginTitle = UILANG.m('Standard Login');
    studentLoginHtml=UILANG.m('<p>A student login in OASYS is specifically designed to provide students with access to their personalized user dashboard. Unlike standard logins, which may connect users directly to specific tests, a student login directs the student to a dashboard where they can access all their available and active tests.</p>');
    studentLoginTitle = UILANG.m('Student Logins');

    switchMode();
}

function mayAcceptKeyStrokes() {
    return !waitDialog.busy() && !animationPlaying;
}

function switchMode() {
    for (let b in buttons) {
        buttons[b].hide();
    }
    let visibleButtons = [];
    switch (mode) {
        case 'browsing':
            gui.s3.fadeOut(0);
            gui.s4.fadeOut(0);
            gui.s5.fadeOut(0);
            gui.s6.fadeOut(0);
            gui.s7.fadeOut(0);
            gui.s8.fadeOut(0);
            //Dividers
            $('#wizardStart').show();
            $('#wizardEnd').show();
            $('#pCheckDivider').show();
            passwordsTbButtons.addElements.disable();
            passwordsTbButtons.addQuickPass.disable();
            visibleButtons = ['newFolder', 'newTest', 'newTesteeTemplate', 'newStudentLogin', 'rename', 'editSelection', 'duplicate', 'deleteSelection', 'resetResultsTestee', 'plausibilityCheck', 'searchFiler', 'wizard', 'addPwdsTests', 'wizardFile', 'wizardToFile'];
            gui.passwords.disable();
            buttons.addPwdsTests.disable();
            if (selection.length === 1 && selection[0].type === 'folder') {
                buttons.rename.enable();
                buttons.editSelection.disable();
                buttons.duplicate.disable();
            } else if ((selection.length === 1 && selection[0].type === 'testee') || (selection.length === 1 && selection[0].type === 'template') || (selection.length === 1 && selection[0].type === 'cloned')) {
                buttons.plausibilityCheck.enable();
                buttons.overrideSettings.enable();
                buttons.rename.enable();
                buttons.wizardToFile.disable();
                buttons.editSelection.enable();
                buttons.duplicate.disable();
                buttons.addPwdsTests.enable()
            } else {
                buttons.plausibilityCheck.disable();
                buttons.overrideSettings.disable();
                buttons.rename.disable();
                buttons.editSelection.disable();
                buttons.duplicate.disable();
                if (selection.some(item => item.type === 'folder')) {
                    buttons.addPwdsTests.disable();
                } else {
                    buttons.addPwdsTests.enable();
                }
            }
            buttons.resetTestee.disable();
            gui.boxes.passwords.lock();
            gui.boxes.metaTags.lock();
            gui.boxes.loginSettings.lock();
            librarySelection(gui.library.getSelect(), true);
            gui.statusBar.setStatus(UILANG.m('browsing test takers (logins)'));
            metaTbButtons.addElements.disable();
            break;

        case 'editTest':
            $('#wizardStart').show();
            $('#wizardEnd').hide();
            $('#pCheckDivider').show();
            gui.s3.fadeIn(250);
            if (selection[0].type === 'testee' || selection[0].type === 'cloned') buttons.resetTestee.enable();
            passwordsTbButtons.addElements.enable();
            passwordsTbButtons.addQuickPass.enable();
            buttons.abortEditing.enable();
            visibleButtons = ['abortEditing', 'overrideSettings', 'resetTestee', 'changeLoginType', 'plausibilityCheck'];
            gui.boxes.passwords.unlock();
            gui.boxes.metaTags.unlock();
            gui.boxes.loginSettings.unlock();
            gui.statusBar.setStatus(UILANG.m('Editing') + ' "' + serverData.testLevel.name + '"');
            $('#testPanelList').hide();
            if (serverData.testLevel.passwords.length > 500) passwordsTbButtons.addQuickPass.disable();
            metaTbButtons.addElements.enable();
            break;

        case 'wizard':
            $('#wizardStart').hide();
            $('#wizardEnd').hide();
            $('#pCheckDivider').hide();
            gui.s2.fadeOut(250);
            gui.s4.fadeIn(250);
            visibleButtons = ['abortWizard', 'save'];
            gui.statusBar.setStatus(UILANG.m('Test taker wizard'));
            filerPath = '';
            $.each(loc.path, function (k, v) {
                filerPath += '/' + v.fullname;
            });
            gui.statusBar.setStatus(UILANG.m('Test taker wizard - Test takers (Logins) will be created in: "') + filerPath + '"');
            break;

        case 'add2selected':
            $('#wizardStart').hide();
            $('#wizardEnd').hide();
            $('#pCheckDivider').hide();
            gui.s2.fadeOut(250);
            gui.s4.fadeIn(250);
            visibleButtons = ['abortWizard', 'addToSelection'];
            if (stuLog || selHasStudent) {
                gui.statusBar.setStatus(UILANG.m('Add to selected - Add labels/tests/meta tags to selected test takers or redefine override settings'));
            } else {
                gui.statusBar.setStatus(UILANG.m('Add to selected - Add password/tests/meta tags to selected test takers or redefine override settings'));
            }
            break;

        case 'fileWizard':
            $('#wizardStart').hide();
            $('#wizardEnd').hide();
            $('#pCheckDivider').hide();
            gui.s2.fadeOut(250);
            gui.s7.fadeIn(250);
            visibleButtons = ['abortWizard', 'saveFromFile', 'resetCffWizard'];
            gui.statusBar.setStatus(UILANG.m('Create test takers from CSV-file'));
            filerPath = '';
            $.each(loc.path, function (k, v) {
                filerPath += '/' + v.fullname;
            });
            gui.statusBar.setStatus(UILANG.m('Create test takers from CSV-file - Test takers (Logins) will be created in: "') + filerPath + '"');
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
                location: loc.folder, current: oldLoc, showBlocked: showBlocked
            });
            break;
        case 'onBreadcrumbNavigate':
            oldLoc = cloneObj(loc);
            loc.folder = data;
            startAjax('fetchLibrary', {
                location: loc.folder, current: oldLoc, showBlocked: showBlocked
            });
            break;
        case 'onRenameRequest':
            rename(data);
            break;
        case 'onDeleteRequest':
            deleteSelection('contextMenu');
            break;
        case 'onFolderRequest':
            newFolder('contextmenu');
            break;
        case 'onDuplicateRequest':
            duplicate();
            break;
        case 'onMove':
        case 'onCutPaste':
            sources = {
                folders: [], tests: []
            };
            target = data[0].target;
            if (typeof target === 'string' || target instanceof String) {
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
                location: loc.folder, locInfo: loc, selInfo: data, libType: 'move'
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
                folders: [], tests: []
            };
            target = data[0].target;
            if (typeof target === 'string' || target instanceof String) {
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
                location: loc.folder, select: data.id, showBlocked: showBlocked
            });
            break;
        case 'quickMessage':
            gui.statusBar.setStatus(data.qMessage, 3000, data.msgColor);
            break;
        case 'onClipboardSuccess':
            let msg = '';
            if (!data) return;
            if (data[0].totalClipboard === 0) {
                gui.statusBar.setStatus(UILANG.m('Nothing selected ... nothing copied to clipboard!'), 3000, '#dd1a00');
                return;
            } else {
                let fString = '';
                if (data[0].cbFolders > 1) fString = data[0].cbFolders + ' ' + UILANG.m('folders') + ' ';
                if (data[0].cbFolders === 1) fString = '1 ' + UILANG.m('folder') + ' ';
                if (data[0].cbFolders === 0) fString = '';
                msg = fString;
                let gString = '';
                if (data[0].cbFiles > 1) gString = data[0].cbFiles + ' ' + UILANG.m('Test Takers') + ' ';
                if (data[0].cbFiles === 1) gString = '1 ' + UILANG.m('test taker') + ' ';
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
                        gui.statusBar.setStatus(UILANG.m('warning_folder_copy'), 3000, '#dd1a00');
                        gui.library.clearClipboard();
                        return;
                    }
                    msg += ' ' + UILANG.m('copied to clipboard for duplication');
                }
            }
            gui.statusBar.setStatus(msg, 3000, '#0A0');
            break;
        case 'onPermEditRequest':
            editPermDiag(`ctxMenu_${data.src}`, null, (data.selLen > 1), null);
            break;
        case 'onWatchListToggle':
            startAjax('updateWatchList', {
                id: parseInt(data.id), status: data.status, type: data.type
            });
            break;
    }
}

function clipboardActivity(action) {
    if (mode !== 'browsing') return;
    switch (action) {
        case 'copy':
            startAjax('clipboardCheck', {
                id: selection, location: loc.folder
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
                id: selection, location: loc.folder
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
    if (path) testbreadcrumbs = path;
    gui.library2.setItems(list, testbreadcrumbs);
}

function moveObjects(sources, target) {
    startAjax('moveObjects', {
        location: loc.folder, sources: sources, target: target, showBlocked: showBlocked
    });
}

function duplicateObjects(sources, target) {
    startAjax('duplicateObjects', {
        location: loc.folder, sources: sources, target: target, showBlocked: showBlocked
    });
}

function librarySelection(data, delayed) {
    if (typeof (data) == 'undefined') {
        return;
    }
    editOnData = false;
    selection = data;
    buttons.plausibilityCheck.disable();
    buttons.overrideSettings.disable();
    buttons.addPwdsTests.disable();
    clearTimeout(libraryTimeout);
    if (selection.length === 0) {
        buttons.deleteSelection.disable();
        buttons.resetResultsTestee.disable();
        buttons.editSelection.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        buttons.wizardToFile.disable();
        gui.s2.fadeOut(250);
    } else if (selection.length === 1) {
        if (!waitingForDblClick) {
            waitingForDblClick = data;
            libraryTimeout = setTimeout(function () {
                librarySelection(data, true);
            }, 250);
            return;
        } else if (selection[0] !== waitingForDblClick[0]) {
            waitingForDblClick = data;
            libraryTimeout = setTimeout(function () {
                librarySelection(data, true);
            }, 250);
            return;
        }
        waitingForDblClick = null;
        buttons.deleteSelection.enable();
        buttons.resetResultsTestee.enable();
        buttons.rename.enable();
        buttons.wizardToFile.enable();
        if (selection[0].type === 'folder') {
            buttons.editSelection.disable();
            buttons.duplicate.disable();
        }
        if (selection[0].type === 'testee' || selection[0].type === 'template' || selection[0].type === 'cloned') {
            if (!delayed) {
                editOnData = true; //user doubleclicked => go to edit mode as soon as data has loaded
            } else {
                editOnData = false;
            }

            // if the user can edit, allow pencil icon veil, otherwise, don't
            let showPencil = permList[selection[0].dbId].editSelection;
            if (!showPencil) {
                gui.boxes.metaTags.unlock();
                gui.boxes.loginSettings.unlock();
                gui.boxes.passwords.unlock();
            } else {
                gui.boxes.metaTags.lock();
                gui.boxes.loginSettings.lock();
                gui.boxes.passwords.lock();
            }

            gui.s2.fadeIn(0);
            editType = 'testee';
            buttons.plausibilityCheck.enable();
            buttons.overrideSettings.enable();
            buttons.editSelection.enable();
            buttons.duplicate.enable();
            buttons.addPwdsTests.enable();
            gui.structureView.clearElements(true);
            if (data.length >= 2) selIcheck(loc, data);
            startAjax('fetchTest', {
                dbId: selection[0].dbId, location: loc.folder
            });
        } else if (delayed) {
            gui.s2.fadeOut(0);
            gui.s3.fadeOut(0);
        }
    } else {
        buttons.deleteSelection.enable();
        buttons.resetResultsTestee.enable();
        buttons.editSelection.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        buttons.wizardToFile.enable();
        if (selection.some(item => item.type === 'folder')) {
            buttons.addPwdsTests.disable();
        } else {
            buttons.addPwdsTests.enable();
        }
        gui.s2.fadeOut(250);
        gui.s3.fadeOut(250);
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
            location: loc.folder, locInfo: loc, selInfo: data, libType: 'selection'
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
        permValue['newTesteeTemplate'] = permValue['newTest']; // new template button will always have the same value as the new test button
        permValue['newStudentLogin'] = permValue['newTest']; // new studentlogin button will always have the same value as the new test button
        permValue['wizardFile'] = permValue['wizard']; // new wizard button will always have the same value as the new test button

    } else if (selection.length === 1) {
        // permValue = Object.assign(permValue, permList[parseInt(selection[0].dbId)], permList['basePerm']);
        permValue = Object.assign(permList['basePerm'], permList[parseInt(selection[0].dbId)]);
    } else {
        permValue = Object.assign(permList['basePerm'], permList[parseInt(selection[0].dbId)]);

        selection.forEach(element => {
            let entry = permList[element.dbId];
            for (const key in entry) {
                if (!['deleteSelection', 'resetResultsTestee', 'addPwdsTests'].includes(key)) continue;
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

    let permArr = function () {
        const retVal = [];
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
                if (buttonName==='addPwdsTests')buttons.addPwdsTests.disable();
            } else if (selection[0] === undefined && ['newFolder', 'newTest', 'newStudentLogin', 'wizard', 'wizardFile', 'newTesteeTemplate'].includes(buttonName)) {
                buttons[buttonName].enable();
            }
        } else {
            buttons[buttonName].disable();
        }
    });
}

/* Wizard Start*/
function buildWizard(add2sel) {
    wizardId = 1;
    wizState = false;
    const wizardMainframe = $('#wiz_mainfr');
    wizardMainframe.empty();
    $('#wInactiveMsg').hide();
    $('#wNoAssignmentMsg').hide();
    wizardData.pwdsSameForAll = false;
    wizardData.leadingZeros = false;
    wizardData.oSetTimer = false;
    wizardData.oSetSaving = false;
    wizardData.oSetNavLimit = false;
    wizardData.oDemoMode = false;
    wizardData.assignMtags = false;
    wizardData.metaTags = {};
    wizardData.deleteExistingPwds = false;
    wizardData.deleteExistingMtags = false;
    //Testees/Logins
    //Testees section for Add2Selection-Wizard
    if (!add2sel) {
        //General info Wizard only
        wizardMainframe.append('<div class="wizard_msg">' + UILANG.m('This wizard creates standard logins only. Use CSV import for bulk adding student logins.'));
        //Testees section for regular Wizard
        wizardMainframe.append('<br /><div class="aoheader">' + UILANG.m('Test takers/Logins') + '</div>');
        wizardMainframe.append('<div class="wizard_msg2"><strong>' + UILANG.m('Example name test taker/login') + '<br /></strong><span class="precolor">' + UILANG.m('PREFIX') + '</span> + <span class="countercolor">' + UILANG.m('COUNTER') + '</span> + <span class="sufcolor">' + UILANG.m('SUFFIX') + '</span><br /><span id="wpre" class="precolor"></span><span id="wcounter" class="countercolor">1</span><span id="wsuf" class="sufcolor"></span></div>');

        const wNoTestees = insertSpinner(wizardMainframe, 'noTestees', UILANG.m('Test Takers') + '<span class="minmax">&nbsp;(max. 150)</span>', {
            dataId: 'noTestees', range: '1..150', step: 1, height: 20, width: 30, initialValue: 1, onChange: wOptions
        });
        wizardData.noTestees = 1;
        $(wNoTestees).css('margin-top', '-15px');

        wizardMainframe.append('<div id="div_preTestees" class ="wizarditem">&nbsp;<span class="precolor">' + UILANG.m('Prefix') + '</span> ' + UILANG.m('test taker name') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_preTestees" /></div>');
        wizardMainframe.append('<div id="sub_preTestees" class ="subwizarditemtestees"></div>');
        const preTesteesSub = $("#sub_preTestees");
        preTesteesSub.append('<input id="preTesteesInput" maxlength="15" />');

        wizardMainframe.append('<div id="div_sufTestees" class ="wizarditem">&nbsp;<span class="sufcolor">' + UILANG.m('Suffix') + '</span> ' + UILANG.m('test taker name') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_sufTestees" /></div>');
        wizardMainframe.append('<div id="sub_sufTestees" class ="subwizarditemtestees"></div>');
        const sufTesteesSub = $("#sub_sufTestees");
        sufTesteesSub.append('<input id="sufTesteesInput" maxlength="15" />');

        insertSpinner(wizardMainframe, 'countStart', UILANG.m('Start') + ' <span class="countercolor">' + UILANG.m('counter') + '</span> ' + UILANG.m('at'), {
            dataId: 'countStart', range: '1..849', step: 1, height: 20, width: 30, initialValue: 1, onChange: wOptions
        });
        wizardData.startCount = 1;
        wizardMainframe.append('<div id="div_leadingZeros" class ="wizarditem">&nbsp;<span class="countercolor">' + UILANG.m('Counter') + '</span> ' + UILANG.m('with leading zeros') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_leadingZeros" /></div>');
        //wizardMainframe.append('<br />');

        const prefixTestees = $("#div_preTestees");
        const prefixTesteesIMG = $("#img_preTestees");
        const suffixTestees = $("#div_sufTestees");
        const suffixTesteesIMG = $("#img_sufTestees");
        const leadingZeros = $("#div_leadingZeros");
        const leadingZerosIMG = $("#img_leadingZeros");
        const prefixInput = $('#preTesteesInput');
        const suffixInput = $('#sufTesteesInput');
        preTesteesSub.hide();
        sufTesteesSub.hide();

        //check for invalid chars input fields and update example name at the top
        prefixInput.on('keyup', function () {
            wizState = true;
            const start = this.selectionStart, end = this.selectionEnd;
            const thisInput = $(this);
            thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
                if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                prefixInput.trigger('blur');
                return '';
            }));
            $('#wpre').html(thisInput.val());
            wizardData.prefix = thisInput.val();
            this.setSelectionRange(start, end);
        });
        suffixInput.on('keyup', function () {
            wizState = true;
            const start = this.selectionStart, end = this.selectionEnd;
            const thisInput = $(this);
            thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
                if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                suffixInput.trigger('blur');
                return '';
            }));
            $('#wsuf').html(thisInput.val());
            wizardData.suffix = thisInput.val();
            this.setSelectionRange(start, end);
        });

        prefixTestees.on("click", function () {
            wizState = true;
            prefixTestees.toggleClass('wizChecked');
            if (prefixTestees.hasClass('wizChecked')) {
                preTesteesSub.show('fast', function () {
                    prefixInput.trigger('focus');
                });
                prefixTesteesIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                preTesteesSub.hide('fast');
                prefixInput.val('');
                $('#wpre').html('');
                wizardData.prefix = '';
                prefixTesteesIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        });

        suffixTestees.on("click", function () {
            wizState = true;
            suffixTestees.toggleClass('wizChecked');
            if (suffixTestees.hasClass('wizChecked')) {
                sufTesteesSub.show('fast', function () {
                    suffixInput.trigger('focus');
                });
                suffixTesteesIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                sufTesteesSub.hide('fast');
                suffixInput.val('');
                $('#wsuf').html('');
                wizardData.suffix = '';
                suffixTesteesIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        });

        leadingZeros.on("click", function () {
            wizState = true;
            if (leadingZeros.hasClass('wizarditemhover')) {
                leadingZeros.toggleClass('wizChecked');
                if (leadingZeros.hasClass('wizChecked')) {
                    $('#wcounter').html(pad(wizardData.startCount, 3));
                    wizardData.leadingZeros = true;
                    leadingZerosIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                } else {
                    $('#wcounter').html(wizardData.startCount);
                    wizardData.leadingZeros = false;
                    leadingZerosIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                }
            }
        });
        //End Testees section for regular Wizard
    }
    if (add2sel) buttons.addToSelection.disable();
    //Passwords section
    wizardMainframe.append('<br class="brRem" /><div id="pwHeader" class="aoheader">' + UILANG.m('Passwords') + '</div>');
    wizardMainframe.append('<div id="div_aPasswords" class ="wizarditem">&nbsp;' + UILANG.m('Auto passwords') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_aPasswords" /></div>');
    wizardMainframe.append('<div id="sub_aPasswords" class ="subwizarditem"></div>');

    const wizardPasswordsSub = $("#sub_aPasswords");
    wizardPasswordsSub.append('<div class="wizard_msg"><strong>' + UILANG.m('Please note:') + '</strong> ' + UILANG.m('Automatically created passwords will be alphanumeric, but will not use 0,1,l and no vowels!') + '</div>');
    const wPwdDigits = insertSpinner(wizardPasswordsSub, 'pwdDigits', UILANG.m('Characters') + '<span class="minmax">&nbsp;(min. 3, max. 15)</span>', {
        dataId: 'pwdDigits', range: '3..15', step: 1, height: 20, width: 30, initialValue: 5, onChange: wOptions
    });
    wizardData.pwdDigits = 5;
    const wNoAutoPwds = insertSpinner(wizardPasswordsSub, 'noAutoPwds', UILANG.m('PWs per test taker') + '<span class="minmax">&nbsp;(max. 99)', {
        dataId: 'noAutoPwds', range: '1..99', step: 1, height: 20, width: 30, initialValue: 1, onChange: wOptions
    });
    wizardData.noAutoPwds = 1;
    wizardPasswordsSub.append('<div id="sub_pwds_same" class ="wizarditem">&nbsp;' + UILANG.m('Same password(s) for each test taker') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_pwds_same" /></div>');
    if (add2sel) {
        wizardPasswordsSub.append('<div id="sub_pwds_delExisting" class ="wizarditem">&nbsp;' + UILANG.m('Delete existing password(s)') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_pwds_delExisting" /></div>');
    }

    wizardMainframe.append('<div id="div_mPasswords" class ="wizarditem">&nbsp;' + UILANG.m('Manual passwords') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_mPasswords" /></div>');

    let subManualPasswords;
    if (add2sel) {
        wizardMainframe.append('<div id="sub_mPasswords" class ="subwizarditem"></div>');
        subManualPasswords = $("#sub_mPasswords");
        subManualPasswords.append('<div id="sub_mpwds_delExisting" class ="wizarditem">&nbsp;' + UILANG.m('Delete existing password(s)') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_mpwds_delExisting" /></div>');
        subManualPasswords.hide();
    }

    //Assigned Tests
    wizardMainframe.append('<br class="brRem" /><div  id="testsHeader" class="aoheader">' + UILANG.m('Tests') + '</div>');
    wizardMainframe.append('<div id="div_aTests" class ="wizarditem">&nbsp;' + UILANG.m('Assign tests') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_aTests" /></div><br />');

    //Override Settings
    wizardMainframe.append('<div class="aoheader">' + UILANG.m('Override settings') + '</div>');
    wizardMainframe.append('<div id="div_overrides" class ="wizarditem">&nbsp;' + UILANG.m('Define override settings') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_overrides" /></div>');
    wizardMainframe.append('<div id="sub_overrides" class ="subwizarditem"></div>');
    const wizardOverridesSub = $("#sub_overrides");

    wizardOverridesSub.append('<div id="div_oSetTimer" class ="wizarditem">&nbsp;' + UILANG.m('Disable Timer') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_oSetTimer" /></div>');

    const wAdditionalTime = insertSpinner(wizardOverridesSub, 'wAdditionalTime', UILANG.m('Additional time (%)'), {
        dataId: 'wAdditionalTime', range: '0..100', step: 1, height: 20, width: 30, initialValue: 0, onChange: wOptions
    });

    wizardOverridesSub.append('<div id="div_oSetSaving" class ="wizarditem">&nbsp;' + UILANG.m('Disable saving') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_oSetSaving" /></div>');
    wizardOverridesSub.append('<div id="div_oSetNavLimit" class ="wizarditem">&nbsp;' + UILANG.m('Disable navigation limitation') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_oSetNavLimit" /></div>');
    wizardOverridesSub.append('<div id="div_oDemoMode" class ="wizarditem">&nbsp;' + UILANG.m('Demo Mode') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_oDemoMode" /></div>');


    //Meta Tags
    wizardMainframe.append('<br /><div class="aoheader">' + UILANG.m('Meta Tags') + '</div>');
    if (add2sel) wizardMainframe.append('<div id="mTagsMsg" class="wizard_msg"><strong>' + UILANG.m('Please note:') + '</strong> ' + UILANG.m('Values of existing meta tags with matching keys will be overwritten!') + '</div>');
    wizardMainframe.append('<div id="div_mTags" class ="wizarditem">&nbsp;' + UILANG.m('Assign meta tags') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_mTags" /></div>');
    const mTagsMessage = $("#mTagsMsg");
    mTagsMessage.hide();

    let wizardMTagsSub;
    if (add2sel) {
        wizardMainframe.append('<div id="sub_mTags" class ="subwizarditem"></div>');
        wizardMTagsSub = $("#sub_mTags");
        wizardMTagsSub.append('<div id="sub_mTags_delExisting" class ="wizarditem">&nbsp;' + UILANG.m('Delete existing meta tag(s)') + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_mTags_delExisting" /></div>');
        wizardMTagsSub.hide();
    }


    //show path
    if (!add2sel) wizardMainframe.append('<div class="wizard_msg">' + UILANG.m('Your test takers will be created in folder:') + '<br /><strong>' + filerPath + '</strong></div>');

    $('.wizarditem').addClass('wizarditemhover');

    const activePasswords = $("#div_aPasswords");
    const manualPasswords = $("#div_mPasswords");
    const activePasswordsIMG = $("#img_aPasswords");
    const manualPasswordsIMG = $("#img_mPasswords");
    const subActivePasswords = $("#sub_aPasswords");
    const samePasswords = $("#sub_pwds_same");
    const samePasswordsIMG = $("#img_pwds_same");
    const activeTests = $("#div_aTests");
    const activeTestsIMG = $("#img_aTests");
    const mTags = $("#div_mTags");
    const mTagsIMG = $("#img_mTags");

    let delExistPwds;
    let delExistPwdsIMG;
    let delExistMPwds;
    let delExistMPwdsIMG;
    let delExistMtags;
    let delExistMtagsIMG;
    if (add2sel) {
        delExistPwds = $("#sub_pwds_delExisting");
        delExistPwdsIMG = $("#img_pwds_delExisting");
        delExistMPwds = $("#sub_mpwds_delExisting");
        delExistMPwdsIMG = $("#img_mpwds_delExisting");
        delExistMtags = $("#sub_mTags_delExisting");
        delExistMtagsIMG = $("#img_mTags_delExisting");
    }

    activeTests.addClass('disabled').removeClass('wizarditemhover');
    activeTestsIMG.addClass('disabled').css('cursor', 'not-allowed');
    subActivePasswords.hide();
    function buttonStatus() {
        if (activePasswords.hasClass('wizChecked') || manualPasswords.hasClass('wizChecked') || overrides.hasClass('wizChecked') || mTags.hasClass('wizChecked')) {
            buttons.addToSelection.enable();
        } else {
            buttons.addToSelection.disable();
        }
    }

    wizardData.pwdMode = 'off';
    activePasswords.on("click", function () {
        wizState = true;
        activePasswords.toggleClass('wizChecked');
        if (activePasswords.hasClass('wizChecked')) {
            if (add2sel) buttonStatus();
            gui.s5.fadeOut(250);
            $(wpasswordsTbText).html('0 ' + UILANG.m('passwords'));
            $(wStructureTbText).html('0 ' + UILANG.m('tests assigned'));
            wStructureTbButtons.addElements.enable();
            $('#wTestPanelList').hide();
            $('#wInactiveMsg').hide();
            $('#wNoAssignmentMsg').show();
            $('#wStructureTbText').hide();
            wizardData.pwds = [];
            gui.wpasswords.clearList();
            subActivePasswords.show('fast');
            gui.wStructureView.clearElements(true);
            wizardData.structure = [];
            wizardData.pwdMode = 'auto';
            wizardData.currentPwId = 0;
            if (add2sel) {
                subManualPasswords.hide('fast');
                if (delExistMPwds.hasClass('wizChecked')) delExistMPwds.trigger('click');
            }
            manualPasswords.removeClass('wizChecked');
            activeTests.removeClass('disabled').addClass('wizarditemhover');
            activeTestsIMG.removeClass('disabled').css('cursor', 'pointer');
            manualPasswordsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            activePasswordsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            wPwdDigits.reset();
            wNoAutoPwds.reset();
        } else {
            if (add2sel) buttonStatus();
            subActivePasswords.hide('fast');
            wizardData.pwdMode = 'off';
            if (add2sel) if (delExistPwds.hasClass('wizChecked')) delExistPwds.trigger('click');
            if (samePasswords.hasClass('wizChecked')) samePasswords.trigger('click');
            if (activeTests.hasClass('wizChecked')) activeTests.trigger('click');
            activePasswordsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            activeTests.addClass('disabled').removeClass('wizarditemhover');
            activeTestsIMG.addClass('disabled').css('cursor', 'not-allowed');
        }
    });

    manualPasswords.on("click", function () {
        wizState = true;
        manualPasswords.toggleClass('wizChecked');
        if (manualPasswords.hasClass('wizChecked')) {
            if (add2sel) buttonStatus();
            gui.s5.fadeIn(250);
            $(wpasswordsTbText).html('0 ' + UILANG.m('passwords'));
            $(wStructureTbText).html('');
            $('#wTestPanelList').hide();
            $('#wInactiveMsg').show();
            $('#wNoAssignmentMsg').hide();
            wStructureTbButtons.addElements.disable();
            wizardData.pwds = [];
            wizardData.pwdMode = 'manual';
            gui.wpasswords.clearList();
            if (add2sel) subManualPasswords.show('fast');
            gui.wStructureView.clearElements(true);
            wizardData.structure = [];
            wizardData.currentPwId = 0;
            activeTests.removeClass('disabled').addClass('wizarditemhover');
            activeTestsIMG.removeClass('disabled').css('cursor', 'pointer');
            activePasswords.removeClass('wizChecked');
            subActivePasswords.hide('fast');
            if (add2sel) if (delExistPwds.hasClass('wizChecked')) delExistPwds.trigger('click');
            if (samePasswords.hasClass('wizChecked')) samePasswords.trigger('click');
            manualPasswordsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            activePasswordsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
        } else {
            if (add2sel) buttonStatus();
            gui.s5.fadeOut(250);
            $(wpasswordsTbText).html('0 ' + UILANG.m('passwords'));
            $('#wTestPanelList').show();
            $('#wInactiveMsg').hide();
            wizardData.pwdMode = 'off';
            $(wStructureTbText).html('0 ' + UILANG.m('tests assigned'));
            wStructureTbButtons.addElements.enable();
            gui.wStructureView.clearElements(true);
            wizardData.structure = [];
            wizardData.currentPwId = 0;
            wizardData.pwds = [];
            gui.wpasswords.clearList();
            if (add2sel) {
                if (delExistMPwds.hasClass('wizChecked')) delExistMPwds.trigger('click');
                subManualPasswords.hide('fast');
            }
            if (activeTests.hasClass('wizChecked')) activeTests.trigger('click');
            activeTests.addClass('disabled').removeClass('wizarditemhover');
            manualPasswordsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            activeTestsIMG.addClass('disabled').css('cursor', 'not-allowed');
        }
    });

    samePasswords.on("click", function () {
        wizState = true;
        samePasswords.toggleClass('wizChecked');
        if (samePasswords.hasClass('wizChecked')) {
            wizardData.pwdsSameForAll = true;
            samePasswordsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');

        } else {
            wizardData.pwdsSameForAll = false;
            samePasswordsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
        }
    });

    if (add2sel) {
        delExistPwds.on("click", function () {
            wizState = true;
            delExistPwds.toggleClass('wizChecked');
            if (delExistPwds.hasClass('wizChecked')) {
                wizardData.deleteExistingPwds = true;
                delExistPwdsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');

            } else {
                wizardData.deleteExistingPwds = false;
                delExistPwdsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        });
        delExistMPwds.on("click", function () {
            wizState = true;
            delExistMPwds.toggleClass('wizChecked');
            if (delExistMPwds.hasClass('wizChecked')) {
                wizardData.deleteExistingPwds = true;
                delExistMPwdsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');

            } else {
                wizardData.deleteExistingPwds = false;
                delExistMPwdsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        });
        delExistMtags.on("click", function () {
            wizState = true;
            delExistMtags.toggleClass('wizChecked');
            if (delExistMtags.hasClass('wizChecked')) {
                wizardData.deleteExistingMtags = true;
                delExistMtagsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');

            } else {
                wizardData.deleteExistingMtags = false;
                delExistMtagsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        });
    }

    activeTests.on("click", function () {
        wizState = true;
        if (activeTests.hasClass('wizarditemhover')) {
            activeTests.toggleClass('wizChecked');
            if (activeTests.hasClass('wizChecked')) {
                gui.s6.fadeIn(250);
                wizardData.assignTests = true;
                wizardSelectionChanged(gui.wpasswords.getSelection());
                activeTestsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                gui.s6.fadeOut(250);
                wizardData.assignTests = false;
                activeTestsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        }
    });


    if(selHasStudent){
        activePasswords.hide();
        manualPasswords.hide();
        $('#pwHeader').hide();
        manualPasswords.trigger('click');
        subManualPasswords.hide();
        activeTests.trigger('click');
        activeTests.hide();
        $('#testsHeader').hide();
        $('.brRem').hide();
        $(wpasswordsTbText).html('0 ' + UILANG.m('labels'));
        $('#title_wpasswords').html('<span>' + UILANG.m('Labels') + '</span>');
        $('#tooltip_wpwTbAdd').html('<div class="nxButtonTooltipPointFrame"><div class="nxButtonTooltipPoint"></div></div>' + UILANG.m('Add label'));
    } else {
        $(wpasswordsTbText).html('0 ' + UILANG.m('passwords'));
        $('#title_wpasswords').html('<span>' + UILANG.m('Passwords') + '</span>');
        $('#tooltip_wpwTbAdd').html('<div class="nxButtonTooltipPointFrame"><div class="nxButtonTooltipPoint"></div></div>' + UILANG.m('Add password'));
    }

    const oSetTimer = $("#div_oSetTimer");
    const oSetTimerIMG = $("#img_oSetTimer");
    const oSetSaving = $("#div_oSetSaving");
    const oSetSavingIMG = $("#img_oSetSaving");
    const oSetNavLimit = $("#div_oSetNavLimit");
    const oSetNavLimitIMG = $("#img_oSetNavLimit");
    const oDemoMode = $("#div_oDemoMode");
    const oDemoModeIMG = $("#img_oDemoMode");
    const overrides = $("#div_overrides");
    const overridesIMG = $("#img_overrides");
    wizardOverridesSub.hide();
    wizardData.overrides = false;

    overrides.on("click", function () {
        wizState = true;
        overrides.toggleClass('wizChecked');
        if (overrides.hasClass('wizChecked')) {
            wizardOverridesSub.show('fast');
            if (add2sel) buttonStatus();
            overridesIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            wizardData.overrides = true;
            wAdditionalTime.reset();
        } else {
            wizardOverridesSub.hide('fast');
            if (add2sel) buttonStatus();
            overridesIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            wizardData.overrides = false;
        }
    });

    oSetTimer.on("click", function () {
        wizState = true;
        if (oSetTimer.hasClass('wizarditemhover')) {
            oSetTimer.toggleClass('wizChecked');
            if (oSetTimer.hasClass('wizChecked')) {
                wizardData.oSetTimer = true;
                oSetTimerIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                wAdditionalTime.hide(200);
            } else {
                wizardData.oSetTimer = false;
                oSetTimerIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                wAdditionalTime.show(200);
            }
        }
    });
    oSetSaving.on("click", function () {
        wizState = true;
        if (oSetSaving.hasClass('wizarditemhover')) {
            oSetSaving.toggleClass('wizChecked');
            if (oSetSaving.hasClass('wizChecked')) {
                wizardData.oSetSaving = true;
                oSetSavingIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                wizardData.oSetSaving = false;
                oSetSavingIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        }
    });
    oSetNavLimit.on("click", function () {
        wizState = true;
        if (oSetNavLimit.hasClass('wizarditemhover')) {
            oSetNavLimit.toggleClass('wizChecked');
            if (oSetNavLimit.hasClass('wizChecked')) {
                wizardData.oSetNavLimit = true;
                oSetNavLimitIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                wizardData.oSetNavLimit = false;
                oSetNavLimitIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        }
    });
    oDemoMode.on("click", function () {
        wizState = true;
        if (oDemoMode.hasClass('wizarditemhover')) {
            oDemoMode.toggleClass('wizChecked');
            if (oDemoMode.hasClass('wizChecked')) {
                wizardData.oDemoMode = true;
                oDemoModeIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                wizardData.oDemoMode = false;
                oDemoModeIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        }
    });

    mTags.on("click", function () {
        wizState = true;
        if (mTags.hasClass('wizarditemhover')) {
            mTags.toggleClass('wizChecked');
            if (mTags.hasClass('wizChecked')) {
                gui.s8.fadeIn(250);
                wizardData.assignMtags = true;
                if (add2sel) mTagsMessage.show('fast');
                if (add2sel) buttonStatus();
                $('#wMetaTbText').html('0 meta tags');
                if (add2sel) wizardMTagsSub.show('fast');
                wizardData.metaTags = {};
                gui.wMetaView.clearElements(true);
                mTagsIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
            } else {
                gui.s8.fadeOut(250);
                wizardData.assignMtags = false;
                if (add2sel) mTagsMessage.hide('fast');
                if (add2sel) wizardMTagsSub.hide('fast');
                if (add2sel) buttonStatus();
                if (add2sel) if (delExistMtags.hasClass('wizChecked')) delExistMtags.trigger('click');
                mTagsIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
            }
        }
    });
}

function createFromWizard(sender, button) {
    if (!button) {
        let message;
        if (wizardData.noTestees === 1) {
            message = sf('<p>' + UILANG.m('The number of testees to be created is set to 1. Are you sure you want to create %@ new test taker in the folder "%@" ?') + '</p>', wizardData.noTestees, filerPath);
        } else {
            message = sf('<p>' + UILANG.m('Are you sure you want to create %@ new test takers in the folder "%@" ?') + '</p>', wizardData.noTestees, filerPath);
        }

        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Create'), value: 'ok'
            }],
            contents: message,
            width: 450,
            callback: createFromWizard,
            title: UILANG.m('Create test takers'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('confirmWizard', dialogData, arguments);
    }
    if (button === 'ok') {
        startAjax('wizardCreate', {
            assignTests: wizardData.assignTests,
            leadingZeros: wizardData.leadingZeros,
            noAutoPwds: wizardData.noAutoPwds,
            noTestees: wizardData.noTestees,
            startCount: wizardData.startCount,
            prefix: wizardData.prefix,
            pwdDigits: wizardData.pwdDigits,
            pwdMode: wizardData.pwdMode,
            pwds: wizardData.pwds,
            pwdsSameForAll: wizardData.pwdsSameForAll,
            structure: wizardData.structure,
            suffix: wizardData.suffix,
            oSetTimer: wizardData.oSetTimer,
            oAdditionalTime: wizardData.oAdditionalTime,
            oSetSaving: wizardData.oSetSaving,
            oSetNavLimit: wizardData.oSetNavLimit,
            oDemoMode: wizardData.oDemoMode,
            overrides: wizardData.overrides,
            assignMtags: wizardData.assignMtags,
            metaTags: wizardData.metaTags,
            pid: loc.folder
        });
    }
}

function addToSelected(sender, button) {

    if (!button) {
        const message = '<p>' + UILANG.m('Are you sure to save the modifications to all your selected test takers?') + '</p>';

        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Add to selected test takers'), value: UILANG.m('OK')
            }],
            contents: message,
            width: 450,
            callback: addToSelected,
            title: UILANG.m('Save modifications to selected test takers(s)?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('confirmAdding', dialogData, arguments);
    }
    if (button === 'OK') {

        wizardData.pwds.forEach(obj => {
            if (obj.hasOwnProperty('label')) {
                let temp = obj.name;
                obj.name = obj.label;
                obj.label = temp;
            } else {
                obj.label = null;
            }
            if (!obj.hasOwnProperty('metadata')) {
                obj.metadata = null;
            }
        });

        let sLogFlag = false;
        if(stuLog || selHasStudent)sLogFlag=true;

        startAjax('addToSelected', {
            assignTests: wizardData.assignTests,
            noAutoPwds: wizardData.noAutoPwds,
            pwdDigits: wizardData.pwdDigits,
            pwdMode: wizardData.pwdMode,
            pwds: wizardData.pwds,
            pwdsSameForAll: wizardData.pwdsSameForAll,
            structure: wizardData.structure,
            selection: selection,
            oSetTimer: wizardData.oSetTimer,
            oAdditionalTime: wizardData.oAdditionalTime,
            oSetSaving: wizardData.oSetSaving,
            oSetNavLimit: wizardData.oSetNavLimit,
            oDemoMode: wizardData.oDemoMode,
            overrides: wizardData.overrides,
            assignMtags: wizardData.assignMtags,
            metaTags: wizardData.metaTags,
            deleteExistingPwds: wizardData.deleteExistingPwds,
            deleteExistingMtags: wizardData.deleteExistingMtags,
            pid: loc.folder,
            sLogFlag: sLogFlag
        });
    }
}

function enterWizard(sender) {
    if (mode === "browsing"){
            if (sender === 'bAddPwdsTests') {
                let hasLocal = false;
                let hasStudent = false;
                selection.forEach(item => {
                    switch (item.loginType) {
                        case 'local':
                            hasLocal = true;
                            break;
                        case 'directPass':
                        case 'LDAP':
                        case 'SAML':
                            hasStudent = true;
                            break;
                    }
                });
                if (hasLocal && hasStudent) {
                    showMessage(UILANG.m('In your selection, there are both standard and student logins. Bulk editing is only possible when all selected logins are of the same type.'));
                } else {
                    mode = 'add2selected';
                    selHasStudent = hasStudent;
                    switchMode();
                    buildWizard(true);
                    hideMenu();
                    hideSection(gui.s1, [gui.s4, gui.s5, gui.s6]);
                }
            } else {
                mode = 'wizard';
                switchMode();
                buildWizard();
                hideMenu();
                hideSection(gui.s1, [gui.s4, gui.s5, gui.s6]);
            }
    }
}

function enterFileWizard() {
    const dHtml='<p>'+UILANG.m('Please choose the type of logins you want to import:')+'</p><div class="csv-button-wrapper"><div class="csv-button-container"><button id="import-csv-standard" class="csv-button">'+UILANG.m('Standard logins')+'</button><button id="upload-csv-student" class="csv-button">'+UILANG.m('Student logins')+'</button></div></div>';

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
        }],
        contents: dHtml,
        title: UILANG.m('Import CSV'),
        width: 400
    };
    let impCsvDia = new nxDialog('impCsvDialog', dialogData);

    $("#import-csv-standard").on("click", function() {
        fileWizardType = 'standard';
        impCsvDia.dismiss();
        launchFileWizard();
    });
    $("#upload-csv-student").on("click", function() {
        fileWizardType = 'student';
        impCsvDia.dismiss();
        launchFileWizard();
    });
}

function launchFileWizard() {
    if (mode === 'browsing') {
        mode = 'fileWizard';
        switchMode();
        buildFileWizard();
        hideMenu();
        hideSection(gui.s1, [gui.s7]);
        uploader.setActive();
    }
}


function enterFileToWizard(sender) {
    startAjax('exportCSV', {
        selection: selection, pid: loc.folder
    });
}

/* Create from CSV */
function buildFileWizard() {

    $('#infomsg').empty();
    let csvText1, csvText2, csvText3, csvText4, csvText5, csvText6, csvText7, csvText8, csvText9, csvText10, loginTypeHtml, loginTypeTitle;

    if (fileWizardType === 'student') {
        csvText1 = UILANG.m('The CSV-file for importing student logins (direct password, SAML or LDAP) and their labels & assigned tests into the database needs the following format:');
        csvText2 = UILANG.m('the first line contains the key names: testtaker, authentication, password, label, tag, test-id, subfolder and displayname');
        csvText3 = UILANG.m('field separators can be "," or ";"');
        csvText4 = UILANG.m('the password field is required only when the authentication method is set to "direct." If left blank, the system will generate a password for direct login.');
        csvText5 = UILANG.m('a data line must have the name of the test taker, authentification type, a password (for authentification direct password), a label to be shown in the dashboard for the student login, the tag of the label and the ID(s) of the assigned test(s) for this label. The IDs of the tests can be found at the top of the properties box in the test manager');
        csvText6 = UILANG.m('to assign more than one test to a label, use \\ as separator');
        csvText7 = UILANG.m('in the field subfolder you can specify a subfolder or subfolder path (\\ as separator). Your defined path will be created in your current folder.');
        csvText8 = UILANG.m('you can enter the name of the test taker in the column displayname (optional)');
        csvText9 = UILANG.m('you can specify meta tags (optional) for the test takers (meta keys & meta values). Make sure you modify the first line accordingly.');
        csvText10 = 'testtaker,authentication,password,label,tag,test-id,subfolder,displayname,metakey1,metavalue1,metakey2,metavalue2,metakey3,metavalue3<br />Student1,direct,jghu7667f,German test,3219\\3220\\3221,,Anne Muller,School,CLN,Class,7c,Teacher,"Miller, Glenn"<br />Student2,SAML,,English test,3179,folder1,Luc Wagner,School,CLN,Class,7c,Teacher,"Miller, Glenn"<br />Student3,LDAP,,Maths test,3183\\3967,folder1\\subfolder1,Sophie Schmit,School,ABC,Class,9c,Teacher,"Smith, Adrian"';

        $('#infomsg').html('<strong>' + UILANG.m('CSV-File structure for student logins:') + '</strong><span id="loginTypeHelp"></span><br />' + csvText1 + '<br /><ul id="csvMsg"><li>' + csvText2 + '</li><li>' + csvText3 + '</li><li>' + csvText4 + '</li><li>' + csvText5 + '</li><li>' + csvText6 + '</li><li>' + csvText7 + '</li><li>' + csvText8 + '</li><li>' + csvText9 + '</li></ul><br /><table width="100%"><tr><td><strong>' + UILANG.m('Example CSV-file:') + '</strong><br />' + csvText10 + '</td><td><div id="exFileButton"></div></div></td></tr></table></div>');
        loginTypeHtml = studentLoginHtml;
        loginTypeTitle = studentLoginTitle;
    } else {
        csvText1 = UILANG.m('The CSV-file for importing standard logins and their passwords & assigned tests into the database needs the following format:');
        csvText2 = UILANG.m('the first line contains the key names: testtaker, password, tag, test-id, subfolder and displayname');
        csvText3 = UILANG.m('field separators can be "," or ";"');
        csvText4 = UILANG.m('a data line must have the name of the test taker, a password, the tag of the password and the ID(s) of the assigned test(s) for the password. The IDs of the tests can be found at the top of the properties box in the test manager');
        csvText5 = UILANG.m('to assign more than one test to a password, use \\ as separator');
        csvText6 = UILANG.m('in the field subfolder you can specify a subfolder or subfolder path (\\ as separator). Your defined path will be created in your current folder.');
        csvText7 = UILANG.m('you can enter the name of the test taker in the column displayname (optional)');
        csvText8 = UILANG.m('you can specify meta tags (optional) for the test takers (meta keys & meta values). Make sure you modify the first line accordingly.');
        csvText9 = 'testtaker,password,tag,test-id,subfolder,displayname,metakey1,metavalue1,metakey2,metavalue2,metakey3,metavalue3<br />Student1,ffgthg,3219\\3220\\3221,,Anne Muller,School,CLN,Class,7c,Teacher,"Miller, Glenn"<br />Student2,ertfgd,3179,folder1,Luc Wagner,School,CLN,Class,7c,Teacher,"Miller, Glenn"<br />Student3,eewwsd,3183\\3967,folder1\\subfolder1,Sophie Schmit,School,ABC,Class,9c,Teacher,"Smith, Adrian"';

        $('#infomsg').html('<strong>' + UILANG.m('CSV-File structure for standard logins:') + '</strong><span id="loginTypeHelp"></span><br />' + csvText1 + '<br /><ul id="csvMsg"><li>' + csvText2 + '</li><li>' + csvText3 + '</li><li>' + csvText4 + '</li><li>' + csvText5 + '</li><li>' + csvText6 + '</li><li>' + csvText7 + '</li><li>' + csvText8 + '</li></ul><br /><table width="100%"><tr><td><strong>' + UILANG.m('Example CSV-file:') + '</strong><br />' + csvText9 + '</td><td><div id="exFileButton"></div></div></td></tr></table></div>');
        loginTypeHtml = standardLoginHtml;
        loginTypeTitle = standardLoginTitle;
    }

    //show online help
    new OasysHelp('loginTypeHelp', {
        htmlContent: loginTypeHtml,
        maxWidth: '400px',
        title: loginTypeTitle
    });

    window.exFile = {};
    exFile.exampleFile = new jsButton2($('#exFileButton'), 'bExampleFile', {
        label: UILANG.m('Download Example'),
        icon: '../images/toolbarIcons/ic_tb_csvDownload.png',
        iconWidth: 48,
        width: 100,
        height: 100,
        callback: buildExampleFileCSV,
        disabled: false
    });

    buttons.saveFromFile.disable();
    buttons.resetCffWizard.disable();
    $('#infoZone').empty();
    $('#infoZone').hide();
    $(uploadZone).show();
    $('#infomsg').show();
}

function onImport(name, text) {
    $('#uploadZone').hide();
    $('#infomsg').hide();
    //fill data object
    let delimiter;
    if (/\r\n/.test(text)) {
        delimiter = "\r\n"; //windows line breaks
    } else if (/\n/.test(text)) {
        delimiter = "\n"; //Mac OS X, Unix & Linux line breaks
    } else {
        delimiter = "\r"; //Mac classic line breaks
    }
    const readData = text.split(delimiter);
    let data = [];
    let pos;
    let lim;
    if (readData[0].charAt(0) === '"') {
        pos = 11;
    } else {
        pos = 9;
    }

    lim = readData[0].charAt(pos);
    //Convert CSV lines to arrays
    $.each(readData, function (k, v) {
        if (v !== '') {
            data.push(csvToArray(v, lim));
        }
    });
    data = [].concat.apply([], data);

    //Check Header
    function chkHead(d) {
        let x = true;
        if(fileWizardType==='student'){
            if (d[0][0] !== 'testtaker') x = false;
            if (d[0][1] !== 'authentication') x = false;
            if (d[0][2] !== 'password') x = false;
            if (d[0][3] !== 'label') x = false;
            if (d[0][4] !== 'tag') x = false;
            if (d[0][5] !== 'test-id') x = false;
            if (d[0][6] !== 'subfolder') x = false;
            if (d[0][7] !== 'displayname') x = false;
        } else {
            if (d[0][0] !== 'testtaker') x = false;
            if (d[0][1] !== 'password') x = false;
            if (d[0][2] !== 'tag') x = false;
            if (d[0][3] !== 'test-id') x = false;
            if (d[0][4] !== 'subfolder') x = false;
            if (d[0][5] !== 'displayname') x = false;
        }
        return x;
    }

    function chkMetaKeys(d) {
        let x = true;
        let metaSet = 0;
        let metaStart = 6;
        if(fileWizardType==='student')metaStart = 8;
        $.each(d[0], function (k, v) {
            if (x) {
                if (k >= metaStart) {
                    if (k % 2 === 0) {
                        metaSet++;
                        if (v !== 'metakey' + metaSet) {
                            showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('Keyline field %@ has wrong identifier "%@". Expected:"metakey%@"'), k + 1, v, metaSet));
                            x = false;
                        }
                    } else {
                        if (v !== 'metavalue' + metaSet) {
                            showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('Keyline field %@ has wrong identifier "%@". Expected:"metavalue%@"'), k + 1, v, metaSet));
                            x = false;
                        }
                    }
                }
            }

        });
        return x;
    }

    function chkTts(d) {
        let x = true;
        let regex;
        let line = 1;

        let subfolderindex, dNameIndex, metaIndex, testIndex, passwordIndex;
        if(fileWizardType==='student'){
            subfolderindex = 6;
            dNameIndex = 7;
            metaIndex = 8;
            testIndex = 5;
            passwordIndex = 2;
        } else {
            subfolderindex = 4;
            dNameIndex = 5;
            metaIndex = 6;
            testIndex = 3;
            passwordIndex = 1;
        }

        //Common checks
        $.each(d, function (k, v) {
            if (x) {
                if(line > 1) {
                    //check for non-allowed chars in test taker fields (logins)
                    regex = /[^\w\s.(){}\[\]-]/ig;
                    if (v[0].match(regex)) {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ has non allowed characters. Valid characters are: Letters & numbers plus ( ){ } [ ] / . _ - and SPACE.'), line, 1));
                        x = false;
                        return false;
                    }

                    //check for non-allowed chars in test taker fields (passwords)
                    regex = /[^\w.(){}\[\]-]/ig;
                    if (v[passwordIndex].match(regex)) {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ has non allowed characters. Valid characters are: Letters & numbers plus ( ){ } [ ] / . _ -'), line, 1));
                        x = false;
                        return false;
                    }

                    //check for empty test taker fields
                    if (v[0] === '') {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ (Testtaker) is empty. Aborting import!'), line, 1));
                        x = false;
                        return false;
                    }

                    //check if subfolder is always the same for a specific test taker
                    $.each(d, function (key, val) {
                        if (val[0] === v[0] && val[subfolderindex] !== v[subfolderindex]) {
                            showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('The test taker "%@" in line %@ has a different subfolder than the same test taker in another line of the CSV-file.'), v[0], line));
                            x = false;
                            return false;
                        }
                    });
                    //check if displayname is always the same for a specific test taker
                    $.each(d, function (key, val) {
                        if (val[0] === v[0] && val[dNameIndex] !== v[dNameIndex]) {
                            showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('The test taker "%@" in line %@ has a different display name than the same test taker in another line of the CSV-file.'), v[0], line));
                            x = false;
                            return false;
                        }
                    });
                    //check if meta tags are always the same for a specific test taker
                    $.each(d, function (key, val) {
                        if (val[0] === v[0]) {
                            for (let i = metaIndex; i < val.length; i++) {
                                if (val[i] !== v[i]) {
                                    showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('The test taker "%@" in line %@ has a different set of meta tags than the same test taker in another line of the CSV-file.'), v[0], line));
                                    x = false;
                                    return false;
                                }
                            }
                        }
                    });
                    //Check if test id field only contains numbers and separators
                    if (v[testIndex] === '\\') {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ only contains \\ . Please add at least one test-id or leave the field empty!'), line, testIndex));
                        x = false;
                        return false;
                    }
                    if (/\\\\/.test(v[testIndex])) {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ has at least two folder separators (\\) consecutive.'), line, testIndex));
                        x = false;
                        return false;
                    }
                    regex = /[^0-9\\]/ig;
                    if (v[testIndex].match(regex)) {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ has non allowed characters. Valid characters are: Numbers and the delimiter \\ !'), line, testIndex));
                        x = false;
                        return false;
                    }

                    //Check subfolder path
                    if (/\\\\/.test(v[subfolderindex])) {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ has at least two folder separators (\\) consecutive.'), line, subfolderindex));
                        x = false;
                        return false;
                    }

                    if ($.trim(v[subfolderindex]).length === 0 && v[subfolderindex] !== '' || line > 1 && v[subfolderindex] === '\\') {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ contains only spaces. Please use valid folder names.'), line, subfolderindex));
                        x = false;
                        return false;
                    }
                    let folderCount = v[subfolderindex].split("\\");
                    if (folderCount.length > 14) {
                        showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ contains a folder path with too many levels. Please use maximum 15 subfolder levels.'), line, subfolderindex));
                        x = false;
                        return false;
                    }
                }
                line++;
            }
        });

        if(fileWizardType==='student'){
            let line = 1;
            $.each(d, function (k, v) {
                if (x) {
                    if (line > 1) {
                        //Additional checks for student login CSV file
                        //Check for valid authentification type
                        const validValues = ["direct", "saml", "ldap"];
                        if (!validValues.includes(v[1].toLowerCase())) {
                            showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('line %@ field %@ (Authentication) has an invalid value. Aborting import!'), line, 1));
                            x = false;
                            return false;
                        }
                    }
                    line++;
                }
            });
        }
        return x;
    }

    function chkLineLenghts(d) {
        let length = d[0].length;
        let x = true;
        let key;
        $.each(d, function (k, v) {
            if (k !== 0 && v.length !== length) {
                x = false;
                key = k;
            }
        });
        return [x, key];
    }

    //Check if minimum header is present and ok
    if (chkHead(data) !== true) {
        if(fileWizardType==='student'){
            showMessage(sf(UILANG.m('The file "%@" is not recognized. Ensure it has correct separators (, or ;) and the following key names in the first row: testtaker, authentification, password, label, tag, test-id, subfolder & displayname. Optional meta tags (metakeyX, metavalueX) may also be included.<br /><br /> Refer to the example file in the application for guidance.'), name));
        } else {
            showMessage(sf(UILANG.m('The file "%@" is not recognized. Ensure it has correct separators (, or ;) and the following key names in the first row: testtaker, password, tag, test-id, subfolder & displayname. Optional meta tags (metakeyX, metavalueX) may also be included.<br /><br /> Refer to the example file in the application for guidance.'), name));
        }
        resetCff();
        return;
    }
    //Check if all data lines have the same number if fields
    let cll = chkLineLenghts(data);
    if (cll[0] !== true) {
        showMessage(sf(UILANG.m('ERROR: line %@ has a different number of fields than the previous lines! Aborting import!'), cll[1] + 1));
        resetCff();
        return;
    }
    //Check if the meta tags in the header are correct
    if (chkMetaKeys(data) !== true) {
        resetCff();
        return;
    }
    //Check complete data
    if (chkTts(data) !== true) {
        resetCff();
        return;
    }
    parseFile(name, data, readData);
}

function parseFile(name, data) {

    cffName = name;
    cffData = data;

    const infoZone = $('#infoZone');
    infoZone.show();
    infoZone.empty();
    const dataLines = data.length - 1;
    infoZone.append('<div class=infoZoneMsg>' + UILANG.m('The data from your file') + ' "' + name + '" ' + UILANG.m('is ready to be imported. 1 headerline and') + ' ' + dataLines + ' ' + UILANG.m('data-lines have been read.') + '</div>');
    infoZone.append('<br />');

    const table = $("<table class='csvResults' />");

    $.each(data, function (k, v) {
        let row = $("<tr />");
        $.each(v, function (key, val) {
            let cell = $("<td />");
            cell.html(escapeHtml(val));
            row.append(cell);
        });
        table.append(row);
    });

    infoZone.append(table);

    buttons.saveFromFile.enable();
    buttons.resetCffWizard.enable();
    cffData.shift();
}

function createFromFile(sender, button) {

    if (!button) {
        const message = sf('<p>' + UILANG.m('Are you sure you want to import to the folder "%@" ?') + '</p>', filerPath);

        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Import'), value: 'ok'
            }],
            contents: message,
            width: 450,
            callback: createFromFile,
            title: UILANG.m('Start import?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('confirmFileWizard', dialogData, arguments);
    }
    if (button === 'ok') {
        startAjax('wizardCreateFromFile', {
            csvFilename: cffName,
            csvData: cffData,
            fileWizardType: fileWizardType,
            pid: loc.folder
        });
    }
}

function resetCff() {
    buttons.resetCffWizard.disable();
    buildFileWizard();
}

//leading Zeros
function pad(str, max) {
    str = str.toString();
    return str.length < max ? pad("0" + str, max) : str;
}

/* editing */
function editSelection(sender) {
    if (selection[0].type === "testee" || selection[0].type === "template" || selection[0].type === "cloned") {
        startAjax('checkTestee', {
            testee: selection[0].dbId, location: loc.folder
        });
    } else {
        oldLoc = cloneObj(loc);
        loc.folder = selection[0].dbId;
        startAjax('fetchLibrary', {
            location: loc.folder, current: oldLoc, showBlocked: showBlocked
        });
    }
}

function editSelectionAfterCheck() {
    if (!buttons.editSelection.isActive()) {
        return;
    }
    if (mode === "browsing") {
        startAjax('fetchTest', {
            dbId: selection[0].dbId, location: loc.folder
        });
        if (editType === 'testee') {
            mode = 'editTest';
            gui.structureView.unlock();
            gui.metaView.unlock();
            gui.passwords.enable();
        }
        switchMode();
        hideMenu();
        hideSection(gui.s1, [gui.s2, gui.s3]);
    }
}

function abortEditingReq() {
    if (wizState) {
        let dialogData = {
            buttons: [{label: UILANG.m('Continue'), 'cancel': true, value: 'cancel'}, {
                label: UILANG.m('Close'),
                'default': true,
                value: 'ok'
            }],
            contents: UILANG.m('Do you want to exit without saving or continue?'),
            title: UILANG.m('Abort wizard'),
            returnPromise: true,
            width: 400,
            icon: "../images/warning.png",
            iconWidth: 64
        };
        showDialog('abortWiz', dialogData).then((res) => {
            if (res.button === 'ok') {
                abortEditing();
            }
        });
    } else {
        abortEditing();
    }
}

function abortEditing() {
    switch (mode) {
        case 'editTest':
            gui.metaView.lock('greyout');
            $('#passwords').scrollTop(0);
            $('#assignedTests').scrollTop(0);
            $('#metaTags').scrollTop(0);
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
            });
            break;
        case 'wizard':
        case 'add2selected':
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
                wizardData.prefix = '';
                wizardData.suffix = '';
            });
            break;
        case 'fileWizard':
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
            });
            uploader.setInactive();
            break;
    }
}

function pCheckProceed(button, btn) {
    if (button === 'edit') {
        editSelection('pCheck');
    }
}

function buildExampleFileCSV() {
    const writeArray = [];
    if(fileWizardType === 'student'){
        writeArray.push(['testtaker', 'authentication', 'password', 'label', 'tag', 'test-id', 'subfolder', 'displayname', 'metakey1', 'metavalue1', 'metakey2', 'metavalue2']);
        writeArray.push(['Tester1', 'direct', 'yk4565juia', 'English test', 'Just%20a%20test%20tag', '3001\\3005\\3008', '', 'Anne Muller' , 'School', 'ABC', 'Class', '9a']);
        writeArray.push(['Tester2', 'SAML', '', 'English test', '', '3001', 'subfolder for tester', 'Luc Wagner' , 'School', 'DEF', 'Class', '9b']);
        writeArray.push(['Tester3', 'LDAP', '', 'German test', 'tags%20are%20optional', '', 'subfolder for tester\\secondsubfolder', '', 'Company', 'XYZ', '', '']);
        writeArray.push(['Tester1', 'direct', 'yk4565juia', 'French test', '', '4001\\4002', '', 'Anne Muller' , 'School', 'ABC', 'Class', '9a']);
    } else {
        writeArray.push(['testtaker', 'password', 'tag', 'test-id', 'subfolder', 'displayname', 'metakey1', 'metavalue1', 'metakey2', 'metavalue2']);
        writeArray.push(['Tester1', 'xyZh75f', 'Just%20a%20test%20tag', '3001\\3005\\3008', '', 'Anne Muller' , 'School', 'ABC', 'Class', '9a']);
        writeArray.push(['Tester2', '89hgZ75', '', '3001', 'subfolder for tester', 'Luc Wagner' , 'School', 'DEF', 'Class', '9b']);
        writeArray.push(['Tester3', 'HNBJsge7', 'tags%20are%20optional', '', 'subfolder for tester\\secondsubfolder', '', 'Company', 'XYZ', '', '']);
        writeArray.push(['Tester1', 'xXFf736', '', '4001\\4002', '', 'Anne Muller' , 'School', 'ABC', 'Class', '9a']);
    }
    //Write data to array
    const csvString = writeArray.join("%0A");
    const universalBOM = "\uFEFF";
    const element = document.createElement('a');
    element.setAttribute('href', 'data:attachment/csv,' + universalBOM + csvString);
    element.setAttribute('download', 'example.csv');
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element)
}

/* data fields */
function fillDataFields(fillMode) {
    fillMode = fillMode || mode;
    if (fillMode === 'editTest') {
        //loginSettings
        $('#loginSettingsPanel').empty();
        $('#loginSettings').empty();
        $('#loginSettingsPanel').css('background-color', '#E5E5E5');

        //display name - valid for all types
        let dName;
        if (serverData.testLevel.displayName === null || serverData.testLevel.displayName === '') {
            dName = '<span class="notSet">' + UILANG.m("- No display name -") + '</span>';
        } else {
            dName = serverData.testLevel.displayName;
        }

        $('#loginSettings').append('<div class="inPutFrame"><div class="inPutText">' + dName + '</div><div id= "disName" class="inPutDesc">' + UILANG.m("Display name") + '</div></div>');
        $('#disName').on('click', editDisName);
        $('.inPutText').on('click', editDisName);

        //passwords or labels display
        if (Array.isArray(serverData.testLevel.passwords)) {
            serverData.testLevel.passwords.forEach(password => {
                if (password.options !== null) {
                    password.metadata = JSON.parse(password.options);
                } else {
                    password.metadata = {};
                }
            });
        }

        switch (serverData.testLevel.template) {
            case 'template':
                $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Test taker template") + '</div>');
                $('#loginSettingsPanelText').css('color', '#d28383');
                buttons.changeLoginType.disable();
                break;
            case 'cloned':
                $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Cloned from template") + '</div>');
                $('#loginSettingsPanelText').css('color', '#aaa');
                $('#loginSettingsPanelText').css('font-style', 'italic');
                buttons.changeLoginType.disable();
                break;
            default:
                buttons.changeLoginType.enable();
                switch (serverData.testLevel.loginType) {
                    case 'directPass':
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Student login (Password)") + '</div>');
                        $('#loginSettingsPanel').css('background-color', '#00B00D');
                        $('#loginSettingsPanel').css('color', '#fff');
                        // Create password field
                        $('#loginSettings').append('<div class="inPutDivider"></div><div class="inPutFrame"><div class="inPutTextPwd">' + serverData.testLevel.password + '</div><div id="editDirectPassword" class="inPutDesc">'+UILANG.m("Direct password")+'</div></div>');
                        $('#editDirectPassword').on('click', editDirectPass);
                        $('.inPutTextPwd').on('click', editDirectPass);
                        prepData(serverData.testLevel.passwords);
                        break;
                    case 'LDAP':
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Student login (LDAP)") + '</div>');
                        $('#loginSettingsPanel').css('background-color', '#53BBE7');
                        $('#loginSettingsPanel').css('color', '#fff');
                        prepData(serverData.testLevel.passwords);
                        break;
                    case 'SAML':
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Student login (SAML)") + '</div>');
                        $('#loginSettingsPanel').css('background-color', '#C42501');
                        $('#loginSettingsPanel').css('color', '#fff');
                        prepData(serverData.testLevel.passwords);
                        break;
                    default:
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Standard login") + '</div>');
                        $('#loginSettingsPanelText').css('color', '#666');
                        prepDataStandard(serverData.testLevel.passwords);
                }
        }

        function prepDataStandard(passwords) {
            passwords.forEach(item => {
                if (item.metadata && typeof item.metadata === 'object' && item.metadata.hasOwnProperty('pwReq')) {
                    delete item.metadata.pwReq;
                }
            });
        }

        function prepData(passwords) {
            let counter = 1;
            passwords.forEach(item => {
                // Check if item.label is null or an empty string
                if (item.label === null || item.label === '') {
                    item.label = UILANG.m("Label") + ' ' + counter;
                    counter++;
                }
                // Swap the values of 'name' and 'label'
                let temp = item.name;
                item.name = item.label;
                item.label = temp;
            });
        }

        gui.passwords.setItems(serverData.testLevel.passwords);
        if (stuLog) {
            $('#pwTbCopy').hide();
        } else {
            $('#pwTbCopy').show();
            $('#itemSelector_button_setPassword').hide();
        }

        //metatags
        gui.metaView.clearElements(true);
        const mtags = serverData.testLevel.metatags;
        const sortedKeys = Object.keys(mtags).sort();
        $.each(sortedKeys, function (key, value) {
            const objInsert = {
                metakey: value, metavalue: mtags[value], hiddenID: key
            };
            //add to structure list
            gui.metaView.addElement(objInsert, true);
        });

        if (sortedKeys.length === 1) {
            $(metaTbText).html(sortedKeys.length + ' ' + UILANG.m('meta tag'));
        } else {
            $(metaTbText).html(sortedKeys.length + '  ' + UILANG.m('meta tags'));
        }
    }
}

function setPasswordForLabel(sender, obj) {
    let setPass = false;
    let formCont = '<span class="sublineDialog">' + UILANG.m('Initially, the system creates a password (cannot be empty). If <strong>Activate Password</strong> is selected, the user must enter it; otherwise, the system uses it internally to open a test.') + '</span><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;margin-bottom:10px;"><br /><div id="spContainer"></div>';

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
        }, {
            label: UILANG.m('Save'), 'default': true, value: 'ok'
        }], datafields: ['dialogField1'], mandatory: ['dialogField1'], focus: 'dialogField1', values: {
            dialogField1: obj.label
        }, contents: formCont, title: UILANG.m('Set password'), returnPromise: true, width: 400
    };

    showDialog('setPassDialog', dialogData).then((res) => {
        if (res.button === 'ok' && res.data[0] !== '') {
            if(sender=== 'password'){
                startAjax('setPassword', {
                    id: obj.id, password: res.data[0], pwReq: setPass, testee: obj.loginID
                });
            } else {
                $.each(wizardData.pwds, function (k, v) {
                    if (v['id'] === obj.id) {
                        v['label'] = res.data[0];
                        if (!v['metadata']) {
                            v['metadata'] = {};
                        }
                        v['metadata']['pwReq'] = setPass;
                    }
                });
                gui.wpasswords.setItems(wizardData.pwds);
                gui.wpasswords.setSelection([obj.id]);
                if (stuLog || selHasStudent) {
                    if (wizardData.pwds.length === 1) {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('label'));
                    } else {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('labels'));
                    }
                } else {
                    $('#wPasswords_button_setPassword').hide();
                    if (wizardData.pwds.length === 1) {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('password'));
                    } else {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('passwords'));
                    }
                }

            }
        }
    });

    const setPassSwitch = insertToggleswitch('#spContainer', 'tsPass', UILANG.m('Activate Password'), {
        dataId: 'activePass', changeCallback: activePass
    });

    //set initial state
    if (obj.hasOwnProperty('metadata') && obj.metadata !== null && typeof obj.metadata === 'object' && obj.metadata.pwReq === true) {
        setPassSwitch.reset(true);
        setPass = true;
    }

    function activePass(sender, state) {
        setPass = state;
    }
}

function changeLoginType() {

    let startType;
    let startString;
    let targetType;

    const passwd = serverData.testLevel.password || '';

    switch (serverData.testLevel.loginType) {
        case 'directPass':
            startType = 'directPass';
            startString = UILANG.m('Student login (Password)');
            break;
        case 'LDAP':
            startType = 'LDAP';
            startString = UILANG.m('Student login (LDAP)');
            break;
        case 'SAML':
            startType = 'SAML';
            startString = UILANG.m('Student login (SAML)');
            break;
        default:
            startType = 'local';
            startString = UILANG.m('Standard login');
    }
    targetType = startType;

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
        }, {
            label: UILANG.m('Save'), 'default': true, value: 'ok'
        }],
        datafields: ['dialogField1', 'dialogField2'],
        focus: 'dialogField1',
        contents: '<p>' + UILANG.m('Current login type:') + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>' + startString + '</strong></p><p>' + UILANG.m('Change login type to:') + '<br><div id="dialogField1"></div></p><p id="pwBlock">' + UILANG.m('Password:') + '<br><span class="sublineDialog">' + UILANG.m('(Password will be auto-generated if the input field is left empty!)') + '</span><input type="text" id="dialogField2" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
        title: UILANG.m('Change login type'),
        values: {
            dialogField2: passwd
        },
        returnPromise: true,
        width: 400
    };

    showDialog('chgLoginTypeDialog', dialogData).then((res) => {
        if (res.button === 'ok') {
            startAjax('changeLoginType', {
                testee: serverData.testLevel.id, targetType: targetType, password: res.data[1], location: loc.folder
            });
        }
    });

    if (startType !== 'directPass') $('#pwBlock').css('visibility', 'hidden');

    let changeType = {
        onChange: changeTypeOpt, initialValue: startType, elements: [{
            value: 'local', label: UILANG.m('Standard login')
        }, {
            value: 'directPass', label: UILANG.m('Student login (Password)')
        }, {
            value: 'SAML', label: UILANG.m('Student login (SAML)')
        }, {
            value: 'LDAP', label: UILANG.m('Student login (LDAP)')
        }], dataId: 'ddcl', readOnly: false, width: '100%'
    };
    new jsDropList('dialogField1', 'tTypeChooser', changeType);

    function changeTypeOpt(sender, typ) {
        targetType = typ;
        if (typ === "directPass") {
            $('#pwBlock').css('visibility', 'initial');
        } else {
            $('#pwBlock').css('visibility', 'hidden');
        }
    }
}


function editDisName() {
    let dName;
    if (serverData.testLevel.displayName === null || serverData.testLevel.displayName === '') {
        dName = '';
    } else {
        dName = serverData.testLevel.displayName;
    }

    let dialogData = {
        buttons: [{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'}, {
            label: UILANG.m('Delete'),
            'delete': true,
            value: 'delete'
        }, {label: UILANG.m('Save'), 'default': true, value: 'save'}],
        title: UILANG.m('Edit display name'),
        datafields: ['dialogField1'],
        mandatory: ['dialogField1'],
        blackList: {
            dialogField1: [dName]
        },
        focus: 'dialogField1',
        contents: UILANG.m('Please enter or modify the display name of the login!') + '<input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;">',
        values: {
            dialogField1: dName
        },
        returnPromise: true,
        width: 400
    };
    showDialog('editDisName', dialogData).then((res) => {
        switch (res.button) {
            case 'save':
                startAjax('editDisplayName', {
                    testee: serverData.testLevel.id, displayName: res.data[0]
                });
                break;
            case 'delete':
                startAjax('editDisplayName', {
                    testee: serverData.testLevel.id, displayName: ''
                });
                break;
        }
    });
}

function editDirectPass() {
    let dPass = serverData.testLevel.password;

    let dialogData = {
        buttons: [{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'}, {
            label: UILANG.m('Save'),
            'default': true,
            value: 'save'
        }],
        contents: UILANG.m('Please enter or modify the direct password for the student login!') + '<input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;">',
        title: UILANG.m('Edit direct password'),
        datafields: ['dialogField1'],
        mandatory: ['dialogField1'],
        focus: 'dialogField1',
        blackList: {
            dialogField1: [dPass]
        },
        values: {
            dialogField1: dPass
        },
        returnPromise: true,
        width: 400
    };
    showDialog('editDirPass', dialogData).then((res) => {
        if (res.button === 'save') {
            startAjax('editDirPass', {
               testee: serverData.testLevel.id, password: res.data[0]
            });
        }
    });
}

function selectListBtnNewPw() {
    newPassword('selectListBtnNewPw');
}

function selectListBtnNewWizardPw() {
    newPassword('selectListBtnNewWizardPw');
}

function addQuickPassword() {
    startAjax('newQuickPassword', {
        testee: selection[0].dbId
    });
}

function resetTestee(sender, button) {
    if (!button) {
        let message;
        if (selection.length === 1 && selection[0].type !== 'folder') {
            message = sf('<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the test taker "%@"? This action is irreversible!') + '</p>', serverData.testLevel.name);
        } else {
            message = '<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the selected test takers? This action is irreversible!') + '</p>';
        }
        const resetData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Delete'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: resetTestee,
            title: UILANG.m('Reset test taker results?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('resetDialog', resetData, arguments);
    }
    if (button === 'ok') {
        startAjax('resetResultsTestee', {
            selection: selection
        });
    }
}

function resetPassword(sender, button) {
    if (!button) {
        let message;
        if(stuLog){
            message = sf('<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the label "%@"? This action is irreversible!') + '</p>', serverData.testLevel.activePass.label);
        } else {
            message = sf('<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the password "%@"? This action is irreversible!') + '</p>', serverData.testLevel.activePass.name);
        }
        const resetData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Delete'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: resetPassword,
            title: UILANG.m('Reset testee results?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('resetDialog', resetData, arguments);
    }
    if (button === 'ok') {
        startAjax('resetResultsPassword', {
            testee: selection[0].dbId, password: serverData.testLevel.activePass.id
        });
    }

}

function copyLoginLink() {
    let loginUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    loginUrl = loginUrl.slice(0, -22);
    loginUrl += '?login=' + encodeURIComponent(serverData.testLevel.name) + '&password=' + encodeURIComponent(serverData.testLevel.activePass.name);

    if (navigator.clipboard) {
        // Copy the login URL to the clipboard
        navigator.clipboard.writeText(loginUrl)
            .then(() => {
                gui.statusBar.setStatus(UILANG.m('Login link copied to clipboard successfully!'), 3000, '#0A0');
            })
            .catch((error) => {
                gui.statusBar.setStatus(UILANG.m('Error copying login link to clipboard: ') + error, 3000, '#dd1a00');
            });
    } else {
        // Fallback for older browsers or environments where navigator.clipboard is not available
        const textArea = document.createElement("textarea");
        textArea.value = loginUrl;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            // noinspection JSDeprecatedSymbols
            document.execCommand('copy');
            gui.statusBar.setStatus(UILANG.m('Login link copied to clipboard successfully!'), 3000, '#0A0');
        } catch (error) {
            gui.statusBar.setStatus(UILANG.m('Error copying login link to clipboard: ') + error, 3000, '#dd1a00');
        }
        document.body.removeChild(textArea);
    }
}

function resetTest(afId, id, fieldtype, afObject, sender, testName) {
    afObject['testName'] = testName;
    proceedTestReset(afObject)
}

function proceedTestReset(afObject, button) {
    if (!button) {
        const message = sf('<p>' + UILANG.m('Are you sure you want to reset <strong>all</strong> results of the test "%@"? This action is irreversible!') + '</p>', afObject.testName);
        const resetData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Delete'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: proceedTestReset,
            title: UILANG.m('Reset test taker results?'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('resetDialog', resetData, arguments);
    }
    if (button === 'ok') {
        startAjax('resetResultsTest', {
            testee: selection[0].dbId, password: serverData.testLevel.activePass.id, test: afObject.testId
        });
    }

}

function newPassword(sender, button, name, tag) {
    if (!button) {
        let contentStr;
        let contentTitle;

        if (stuLog && sender === 'selectListBtnNewPw'|| selHasStudent && sender === 'selectListBtnNewWizardPw') {
            contentStr = '<p>' + UILANG.m('Please enter a new label for the student login:') + '<br><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('Please enter a tag for the label (optional):') + '<br><input type="text" id="dialogField2" style="width: 100%; margin-top: 10px;">';
            contentTitle = UILANG.m('New label');
        } else {
            contentStr = '<p>' + UILANG.m('Please enter a new password for the test taker:') + '<br><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('Please enter a tag for the password (optional):') + '<br><input type="text" id="dialogField2" style="width: 100%; margin-top: 10px;">';
            contentTitle = UILANG.m('New password');
        }
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
            }],
            datafields: ['dialogField1', 'dialogField2'],
            mandatory: ['dialogField1'],
            focus: 'dialogField1',
            contents: contentStr,
            title: contentTitle,
            width: 400,
            callback: newPassword
        };
        new nxDialog('newTestDialog', dialogData, arguments);

        //check for invalid chars (only for passwords not for labels)
        if (!stuLog && sender === 'selectListBtnNewPw'|| !selHasStudent && sender === 'selectListBtnNewWizardPw') {
            $('#dialogField1').on('keyup', function () {
                const start = this.selectionStart, end = this.selectionEnd;
                const thisInput = $(this);
                thisInput.val(thisInput.val().replace(/[^\w.(){}\[\]-]/ig, function (str) {
                    if (str === ' ') str = '{SPACE}';
                    if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />Please use only valid characters: Letters & numbers plus ( ){ } [ ] . _ -');
                    $('#dialogField1').trigger('blur');
                    return '';
                }));
                this.setSelectionRange(start, end);
            });
        }
        $('#dialogField2').on('keyup', function () {
            const start = this.selectionStart, end = this.selectionEnd;
            const thisInput = $(this);
            thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
                if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                $('#dialogField2').trigger('blur');
                return '';
            }));
            this.setSelectionRange(start, end);
        });
    }
    if (button === 'ok' && name !== '') {
        if (sender === 'selectListBtnNewWizardPw') {
            if (!selHasStudent) {
                let dupe = false;
                $.each(wizardData.pwds, function (k, v) {
                    if (v['name'].toLowerCase() === name.toLowerCase()) dupe = true;
                });

                if (dupe) {
                    showMessage(UILANG.m('This password does already exist. Try creating a different password.'));
                } else {
                    addLabel();
                }
            } else {
                const passwordLength = 6;
                const randomPassword = generateRandomPassword(passwordLength);
                addLabel(randomPassword);
            }
            function addLabel(randomPassword) {
                let fill;
                if(randomPassword){
                    fill = {
                        //label is password
                        id: wizardId, name: name, tag: tag, label: randomPassword
                    };
                } else {
                    fill = {
                        id: wizardId, name: name, tag: tag
                    };
                }
                wizardData.pwds.push(fill);
                gui.wpasswords.setItems(wizardData.pwds);
                if (!stuLog && !selHasStudent) $('#wPasswords_button_setPassword').hide();
                gui.wpasswords.setSelection([wizardId]);
                wizardSelectionChanged(gui.wpasswords.getSelection());
                let wizTextSi, wizTextPlu;
                if(selHasStudent){
                    wizTextSi='label';
                    wizTextPlu='labels';
                } else {
                    wizTextSi='password';
                    wizTextPlu='passwords';
                }

                if (wizardData.pwds.length === 1) {
                    $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m(wizTextSi));
                } else {
                    $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m(wizTextPlu));
                }
                wizardId++;
            }
        } else {
            if (stuLog) {
                startAjax('newLabel', {
                    testee: selection[0].dbId, label: name, tag: tag
                });
            } else {
                startAjax('newPassword', {
                    testee: selection[0].dbId, name: name, tag: tag
                });
            }
        }
    }
    if (button === 'ok' && name === '') {
        showMessage(UILANG.m('You cannot create an empty password!'));
    }
}

function deleteHovered(type, obj) {
    obj.type = type;
    deletePassword(obj);
}

function editHovered(type, obj) {
    obj.type = type;
    editPassword(obj);
}

function selectionChanged(sel) {
    const testsList = $('#testPanelList');
    const inactiveMessage = $('#inactiveMsg');
    const noAssignmentMessage = $('#noAssignmentMsg');
    const structureTbTxt = $('#structureTbText');
    structureTbButtons.resetPass.disable();
    structureTbButtons.copyLink.disable();
    if (!sel) {
        currPwId = null;
        inactiveMessage.show();
        structureTbTxt.hide();
        noAssignmentMessage.hide();
        structureTbButtons.addElements.disable();
        testsList.hide();
        $(structureTbText).html('');
    } else {
        currPwId = sel.id;
        testsList.show();
        structureTbTxt.show();
        inactiveMessage.hide();
        structureTbButtons.addElements.enable();
        startAjax('fetchTestsAssigned', {
            id: sel.id, testee: selection[0].dbId
        });
    }
}

function wizardSelectionChanged(sel) {

    if (sel && $.isEmptyObject(sel) !== true) {
        wizardData.currentPwId = sel['id'];

        if (wizardData.assignTests) {
            const structureItems = wizardData.structure[wizardData.currentPwId];
            gui.wStructureView.clearElements(true);
            wStructureTbButtons.addElements.enable();
            $('#wTestPanelList').show();
            $('#wInactiveMsg').hide();
            $('#wStructureTbText').show();
            if (structureItems && structureItems.length > 0) {
                $.each(structureItems, function (key, value) {
                    value.ID = value.hiddenID;
                    gui.wStructureView.addElement(value, true);
                });
                if (structureItems.length === 1) {
                    $(wStructureTbText).html(structureItems.length + ' ' + UILANG.m('test assigned'));
                } else {
                    $(wStructureTbText).html(structureItems.length + ' ' + UILANG.m('tests assigned'));
                }
                $('#wNoAssignmentMsg').hide();
                $('#wTestPanelList').show();
                $('#wStructureTbText').show();
            } else {
                $(wStructureTbText).html('0 ' + UILANG.m('tests assigned'));
                $('#wNoAssignmentMsg').show();
                $('#wTestPanelList').hide();
                $('#wStructureTbText').hide();
            }
        }
    } else {
        if (wizardData.pwds.length > 0) {
            if (stuLog || selHasStudent) {
                $('#wInactiveMsg').html('<h3 style="text-align:center;color:#AAA">' + UILANG.m('Please select a label to show assigned tests!') + '</h3>');
            } else {
                $('#wInactiveMsg').html('<h3 style="text-align:center;color:#AAA">' + UILANG.m('Please select a password to show assigned tests!') + '</h3>');
            }
        } else {
            if (stuLog || selHasStudent) {
                $('#wInactiveMsg').html('<h3 style="text-align:center;color:#AAA">' + UILANG.m('Please create a label first!') + '</h3>');
            } else {
                $('#wInactiveMsg').html('<h3 style="text-align:center;color:#AAA">' + UILANG.m('Please create a password first!') + '</h3>');
            }
        }

        if (wizardData.pwdMode === 'auto') {
            $('#wTestPanelList').hide();
            $('#wNoAssignmentMsg').show();
            $('#wInactiveMsg').hide();
            wStructureTbButtons.addElements.enable();
        } else {
            gui.wStructureView.clearElements(true);
            $('#wTestPanelList').hide();
            $('#wNoAssignmentMsg').hide();
            $('#wInactiveMsg').show();
            wStructureTbButtons.addElements.disable();
        }
    }
}

function wOptions(sender, value) {
    wizState = true;
    let wErrorFlag = false;
    switch (sender) {
        case 'pwdDigits':
            if (value > 15 || value < 3) wErrorFlag = true;
            wizardData.pwdDigits = value;
            break;
        case 'noTestees':
            if (value > 150 || value < 1) wErrorFlag = true;
            wizardData.noTestees = value;
            break;
        case 'noAutoPwds':
            if (value > 99 || value < 1) wErrorFlag = true;
            wizardData.noAutoPwds = value;
            break;
        case 'wAdditionalTime':
            if (value > 100 || value < 0) wErrorFlag = true;
            wizardData.oAdditionalTime = value;
            break;
        case 'countStart':
            if (value > 849 || value < 1) wErrorFlag = true;
            wizardData.startCount = value;
            if (wizardData.startCount > 99) {
                $("#div_leadingZeros").addClass('disabled').removeClass('wizarditemhover');

            } else {
                $("#div_leadingZeros").removeClass('disabled').addClass('wizarditemhover');

            }
            if (wizardData.leadingZeros) {
                $('#wcounter').html(pad(wizardData.startCount, 3));
            } else {
                $('#wcounter').html(wizardData.startCount);
            }
            break;
    }
    //Enable/disable create button
    if (wErrorFlag) {
        if (!wizardErrors[sender]) {
            wizardErrors[sender] = [];
        }
        wizardErrors[sender].push(value);
    } else {
        delete wizardErrors[sender];
    }
    if (Object.keys(wizardErrors).length === 0) {
        buttons.save.enable();
    } else {
        buttons.save.disable();
    }
}

function deletePassword(sel, button) {
    //handles both passwords and labels!
    if (!sel) return;
    if (!button) {
        let message;
        let title;
        if (sel.dataPresent === true) {
            if (stuLog) {
                message = sf('<p>' + UILANG.m('Are you sure you want to delete the label <strong>%@</strong>?') + '</p><p class="red"><strong>' + UILANG.m('Warning:') + '</strong>&nbsp;&nbsp;    ' + UILANG.m('For this label user data has already been collected!') + '</p>', sel.name);
                title = UILANG.m('Delete label?');
            } else {
                message = sf('<p>' + UILANG.m('Are you sure you want to delete the password <strong>%@</strong>?') + '</p><p class="red"><strong>' + UILANG.m('Warning:') + '</strong>&nbsp;&nbsp;    ' + UILANG.m('For this password user data has already been collected!') + '</p>', sel.name);
                title = UILANG.m('Delete password?');
            }
        } else {
            if (stuLog || selHasStudent) {
                message = sf('<p>' + UILANG.m('Are you sure you want to delete the label <strong>%@</strong>?') + '</p>', sel.name);
                title = UILANG.m('Delete label?');
            } else {
                message = sf('<p>' + UILANG.m('Are you sure you want to delete the password <strong>%@</strong>?') + '</p>', sel.name);
                title = UILANG.m('Delete password?');
            }
        }
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Delete'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: deletePassword,
            title: title,
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('deleteDialog', dialogData, arguments);
    }
    if (button === 'ok') {
        if (sel.type === 'password') {
            startAjax('deletePassword', {
                testee: selection[0].dbId, pwId: sel.id
            });
        } else {
            wizardData.pwds = $.grep(wizardData.pwds, function (v) {
                if (v['name'] === sel.name) {
                    return false;
                }
                return true;
            });
            gui.wpasswords.setItems(wizardData.pwds);
            if (stuLog || selHasStudent) {
                if (wizardData.pwds.length === 1) {
                    $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('label'));
                } else {
                    $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('labels'));
                }
            } else {
                $('#wPasswords_button_setPassword').hide();
                if (wizardData.pwds.length === 1) {
                    $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('password'));
                } else {
                    $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('passwords'));
                }
            }
            wizardSelectionChanged();
        }
    }
}

function editPassword(sel, button, name, tag) {
    //handles both passwords and labels!
    if (!sel) return;
    if (!button) {
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
            }],
            datafields: ['dialogField1', 'dialogField2'],
            mandatory: ['dialogField1'], //disable OK button if field is empty or contains only whitespace
            blackList: {
                dialogField1: [sel.name], dialogField2: [sel.tag]
            }, //disable OK button if name has not been changed
            blackListLogic: 'or',
            focus: 'dialogField1',
            values: {
                dialogField1: sel.name, dialogField2: sel.tag
            },
            contents: '<p>' + UILANG.m('Please enter a new name:') + '<br><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('Current tag:') + '<br><input type="text" id="dialogField2" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('Rename'),
            width: 400,
            callback: editPassword
        };
        new nxDialog('renameDialog', dialogData, arguments);

        // Only for passwords, not for labels
        if (!stuLog && !selHasStudent) {
            //check for invalid chars
            $('#dialogField1').on('keyup', function () {
                const start = this.selectionStart, end = this.selectionEnd;
                const thisInput = $(this);
                thisInput.val(thisInput.val().replace(/[^\w.(){}\[\]-]/ig, function (str) {
                    if (str === ' ') str = '{SPACE}';
                    if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                    $('#dialogField1').trigger('blur');
                    return '';
                }));
                this.setSelectionRange(start, end);
            });
        }

        $('#dialogField2').on('keyup', function () {
            const start = this.selectionStart, end = this.selectionEnd;
            const thisInput = $(this);
            thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
                if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                $('#dialogField2').trigger('blur');
                return '';
            }));
            this.setSelectionRange(start, end);
        });
    }
    if (button === 'ok' && !name.match(/^\s*$/)) {
        if (sel.type === 'password') {
            if (stuLog) {
                startAjax('editLabel', {
                    id: sel.id, label: name, tag: tag, testee: selection[0].dbId
                });
            } else {
                startAjax('editPassword', {
                    id: sel.id, name: name, tag: tag, testee: selection[0].dbId
                });
            }
        } else {
            let dupe = false;
            $.each(wizardData.pwds, function (k, v) {
                if (v['name'] === name && v['id'] !== sel.id) dupe = true;
            });

            if (dupe) {
                showMessage(UILANG.m('This password does already exist. Try renaming to a different password.'))
            } else {
                let tId;
                $.each(wizardData.pwds, function (k, v) {
                    if (v['name'] === sel.name) {
                        v['name'] = name;
                        v['tag'] = tag;
                        tId = v['id'];
                    }
                });
                gui.wpasswords.setItems(wizardData.pwds);
                gui.wpasswords.setSelection([tId]);
                if (stuLog || selHasStudent) {
                    if (wizardData.pwds.length === 1) {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('label'));
                    } else {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('labels'));
                    }
                } else {
                    $('#wPasswords_button_setPassword').hide();
                    if (wizardData.pwds.length === 1) {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('password'));
                    } else {
                        $(wpasswordsTbText).html(wizardData.pwds.length + ' ' + UILANG.m('passwords'));
                    }
                }
            }
        }
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
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
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

    $("#dialogField1").inputFilter(function (value) {
        return /^[^\\]*$/.test(value);
    });

    if (button === 'ok' && name !== '') {
        startAjax('newFolder', {
            location: loc.folder, name: name, showBlocked: showBlocked
        });
    }
    if (button === 'ok' && name === '') {
        showMessage(UILANG.m('You need to enter a name for the new folder!'));
    }
}

function newTest(sender, button, name) {
    if (!button) {
        let userTask, userTaskHd;
        if (sender === 'bNewTesteeTemplate') {
            userTask = UILANG.m('Please enter a name for the template:');
            userTaskHd = UILANG.m('New template');
        } else {
            userTask = UILANG.m('Please enter a name for the test taker (login):');
            userTaskHd = UILANG.m('New standard login');
        }
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
            }],
            datafields: ['dialogField1'],
            mandatory: ['dialogField1'],
            focus: 'dialogField1',
            contents: '<p>' + userTask + '<span id="loginHelp"></span><br><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;"></p>',
            title: userTaskHd,
            width: 400,
            callback: newTest
        };
        new nxDialog('newTestDialog', dialogData, arguments);
        //check for invalid chars
        $('#dialogField1').on('keyup', function () {
            const start = this.selectionStart, end = this.selectionEnd;
            const thisInput = $(this);
            thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
                if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                $('#dialogField1').trigger('blur');
                return '';
            }));
            this.setSelectionRange(start, end);
        });

        //show online help
        let loginHelpHtml;
        let loginHelpTitle;

        if (sender === 'bNewTesteeTemplate') {
            loginHelpHtml = UILANG.m('<p>A test taker template in OASYS is a reusable login that can be connected to one or more passwords and linked to one or more tests. Each time a user logs in with a template, OASYS automatically clones this template in the background to create a standard login. These cloned logins are displayed in the test taker manager, allowing for easy tracking and management.</p><p>This functionality enables the ability to track results from questionnaires and tests efficiently in the results manager, as each login instance is uniquely identified and recorded.</p>');
            loginHelpTitle = UILANG.m('Reusable Login (Template)');
        } else {
            loginHelpHtml = standardLoginHtml;
            loginHelpTitle = standardLoginTitle;
        }

        new OasysHelp('loginHelp', {
            htmlContent: loginHelpHtml,
            maxWidth: '400px',
            title: loginHelpTitle
        });

    }
    if (button === 'ok' && name !== '') {
        let testeeType;
        if (sender === 'bNewTesteeTemplate') {
            testeeType = 'template';
        } else {
            testeeType = 'testee';
        }

        startAjax('newTest', {
            location: loc.folder, name: name, type: testeeType, showBlocked: showBlocked
        });
    }
    if (button === 'ok' && name === '') {
        showMessage(UILANG.m('In order to create a test taker, you have to enter a name with which the test taker can be identified!'));
    }
}

function newStudentLogin(sender, button) {
    let atChg = 'directPass';
    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
        }, {
            label: UILANG.m('OK'), 'default': true, value: 'ok'
        }],
        datafields: ['dialogField1', 'dialogField2', 'dialogField3'],
        mandatory: ['dialogField1'],
        focus: 'dialogField1',
        contents: '<p>' + UILANG.m('Please enter a name for the student login:') + '<span id="studentHelp"></span><br /><input type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"></p><p>' + UILANG.m('Authentication type:') + '<span id="authHelp"></span><br><div id="dialogField2"></div></p><p id="pwBlock">' + UILANG.m('Password:') + '<br><span class="sublineDialog">' + UILANG.m('(Password will be auto-generated if the input field is left empty!)') + '</span><input type="text" id="dialogField3" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
        title: UILANG.m('New student login'),
        returnPromise: true,
        width: 400
    };

    showDialog('newTestDialog', dialogData).then((res) => {
        if (res.button === 'ok' && res.data[0] !== '') {
            startAjax('newTest', {
                location: loc.folder,
                name: res.data[0],
                type: 'testee',
                loginType: atChg,
                password: res.data[2],
                showBlocked: showBlocked
            });
        }
        if (button === 'ok' && res.data[0] === '') {
            showMessage(UILANG.m('In order to create a login, you have to enter a name with which the test can be identified!'));
        }
    });

    //show online help
    new OasysHelp('studentHelp', {
        htmlContent: studentLoginHtml,
        maxWidth: '400px',
        title: studentLoginTitle
    });
    const authHelpHtml=UILANG.m('<p>When logging in as a student, there are three available authentication methods:</p><ul><li><strong>Direct Password</strong>: A password is set here within the OASYS system. Students will use this password to log in directly.</li><li><strong>SAML</strong>: This method uses SAML (Security Assertion Markup Language) authentication. It\'s typically used for single sign-on (SSO) across different systems. The student’s identity is authenticated by an external identity provider.</li><li><strong>LDAP</strong>: LDAP (Lightweight Directory Access Protocol) is used for authentication via an LDAP directory. This method allows students to log in using their LDAP credentials, which are usually managed by an organization\'s central directory.</li></ul><p>Please select the appropriate authentication method for your institution\'s needs.</p>');
    new OasysHelp('authHelp', {
        htmlContent: authHelpHtml,
        title: UILANG.m('Student Login Authentication Methods')
    });


    //check for invalid chars
    $('#dialogField1').on('keyup', function () {
        const start = this.selectionStart, end = this.selectionEnd;
        const thisInput = $(this);
        thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
            if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
            $('#dialogField1').trigger('blur');
            return '';
        }));
        this.setSelectionRange(start, end);
    });

    $('#dialogField3').on('keyup', function () {
        const start = this.selectionStart, end = this.selectionEnd;
        const thisInput = $(this);
        thisInput.val(thisInput.val().replace(/[^\w.(){}\[\]-]/ig, function (str) {
            if (str === ' ') str = '{SPACE}';
            if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />Please use only valid characters: Letters & numbers plus ( ){ } [ ] . _ -');
            $('#dialogField1').trigger('blur');
            return '';
        }));
        this.setSelectionRange(start, end);
    });


    let AuthTypeOpt = {
        onChange: authTypeChg, initialValue: 'Direct password', elements: [{
            value: 'directPass', label: 'Direct password'
        }, {
            value: 'SAML', label: 'SAML'
        }, {
            value: 'LDAP', label: 'LDAP'
        }], dataId: 'ddao', readOnly: false, width: '100%'
    };
    new jsDropList('dialogField2', 'tTypeChooser', AuthTypeOpt);

    function authTypeChg(sender, typ) {
        atChg = typ;
        if (typ === "directPass") {
            $('#pwBlock').css('visibility', 'initial');
        } else {
            $('#pwBlock').css('visibility', 'hidden');
        }
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
        const obj = selection[i];
        let type = 'typetestee';
        if (obj.type === 'folder') {
            foldersInSelection = true;
            type = 'folder';
        }
        if (obj.type === 'template') {
            type = 'typetemplate';
        }
        message += sf('<li class="%@">%@</li>', type, obj.label);
    }
    message += '</ul>';
    message = '<p>' + UILANG.m('Are you sure you want to delete the following test takers(s)/folder(s)? This action is irreversible!') + '</p>' + message + '<p class="red">' + UILANG.m('Warning:') + ' ' + UILANG.m('Recorded data for the chosen test takers will also be deleted.') + '</p>';
    if (foldersInSelection) {
        message += '<p class="red">' + UILANG.m('Warning:') + ' ' + UILANG.m('If the selected folder(s) contain files or subfolders, they will be deleted as well.') + '</p>';
    }
    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
        }, {
            label: UILANG.m('Delete'), value: 'ok'
        }],
        contents: message,
        returnPromise: true,
        width: 640,
        title: UILANG.m('Delete selection?'),
        icon: "../images/warning.png",
        iconWidth: 64
    };
    showDialog('deleteDialog', dialogData).then((res) => {
        if (res.button === 'ok') {
            startAjax('deleteSelection', {
                location: loc.folder, selection: selection, showBlocked: showBlocked
            });
        }
    });
}

function duplicate() {
    const sources = {
        folders: [], tests: []
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
        if (serverData.testLevel.overrides instanceof Array) serverData.testLevel.overrides = {};
    }
}


//plausibility check
function plausibilityCheck() {
    startAjax('plausibilityCheck', {
        id: serverData.testLevel.id
    });
}

//rename
function rename(sender, button, name) {
    if (!button) {
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
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
            contents: '<p>' + UILANG.m('Please enter a new name (login):') + '<br><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('Rename'),
            width: 400,
            callback: rename
        };
        new nxDialog('renameDialog', dialogData, [selection[0]['name']]);

        //check for invalid chars
        if (selection[0]['type'] === 'folder') {
            $("#dialogField1").inputFilter(function (value) {
                return /^[^\\]*$/.test(value);
            });
        }
        if (selection[0]['type'] === 'testee') {
            $('#dialogField1').on('keyup', function () {
                const start = this.selectionStart, end = this.selectionEnd;
                const thisInput = $(this);
                thisInput.val(thisInput.val().replace(/[^\w\s.(){}\[\]-]/ig, function (str) {
                    if (!$('#veil_Message').length) showMessage(UILANG.m('You typed :') + ' ' + str + ' \n\n<br />' + UILANG.m('only_valid_chars') + ' ( ){ } [ ] . _ -');
                    $('#dialogField1').trigger('blur');
                    return '';
                }));
                this.setSelectionRange(start, end);
            });
        }
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

/* adding meta tags */
function addMetaTag() {
    addMetaTagFunc('editMode');
}

function wAddMetaTag() {
    addMetaTagFunc('wizardMode');
}

function addMetaTagFunc(sender, button, mkey, mvalue) {

    if (!button) {
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
            }],
            datafields: ['dialogField1', 'dialogField2'],
            mandatory: ['dialogField1', 'dialogField2'],
            focus: 'dialogField1',
            contents: '<p>' + UILANG.m('Please enter a new meta tag for the test taker.') + '<br /><br />' + UILANG.m('Meta-key (e.g. "Class"):') + '<br /><input class="amt" type="text" id="dialogField1" maxlength="200" style="width: 100%; margin-top: 10px;"><br /><br />' + UILANG.m('Meta-value (e.g. "9a"):') + '<br /><input class="amt" type="text" id="dialogField2" maxlength="200" style="width: 100%; margin-top: 10px;"></p>',
            title: UILANG.m('New meta-tag'),
            width: 400,
            callback: addMetaTagFunc
        };
        new nxDialog('newMetaDialog', dialogData, arguments);
    }
    if (button === 'ok') {
        let args;
        if (sender === 'wizardMode') {
            //Save new meta tag to wizard data
            if (mkey in wizardData.metaTags) {
                const dialogData2 = {
                    buttons: [{
                        label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
                    }, {
                        label: UILANG.m('Overwrite'), value: 'ok'
                    }],
                    contents: '<p>' + UILANG.m('A meta tag with the key "') + mkey + UILANG.m('" already exists. The current value is "') + wizardData.metaTags[mkey] + '". <br />' + UILANG.m('Do you want to overwrite it with "') + mvalue + '"?</p>',
                    title: UILANG.m('Warning'),
                    width: 500,
                    icon: "../images/warning.png",
                    iconWidth: 64,
                    callback: writeWizardMetaTag
                };
                args = [];
                args.push(mkey);
                args.push(mvalue);
                new nxDialog('newMetaWarning', dialogData2, args);
            } else {
                writeWizardMetaTag(mkey, mvalue);
            }

        } else {
            //Save new meta tag to db
            const mtags = serverData.testLevel.metatags;
            if (mkey in mtags) {
                const dialogData2 = {
                    buttons: [{
                        label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
                    }, {
                        label: UILANG.m('Overwrite'), value: 'ok'
                    }],
                    contents: '<p>' + UILANG.m('A meta tag with the key "') + mkey + '"' + UILANG.m('" already exists. The current value is "') + mtags[mkey] + '". <br />' + UILANG.m('Do you want to overwrite it with "') + mvalue + '"?</p>',
                    title: UILANG.m('Warning'),
                    width: 500,
                    icon: "../images/warning.png",
                    iconWidth: 64,
                    callback: writeMetaTag
                };
                args = [];
                args.push(selection[0].dbId);
                args.push(mkey);
                args.push(mvalue);
                new nxDialog('newMetaWarning', dialogData2, args);
            } else {
                writeMetaTag(selection[0].dbId, mkey, mvalue);
            }

        }
    }

    function writeMetaTag(testee, mkey, mvalue, button) {
        if (button === 'cancel') return;
        startAjax('newMetaTag', {
            testee: testee, mkey: mkey, mvalue: mvalue
        });
    }

    function writeWizardMetaTag(mkey, mvalue, button) {
        if (button === 'cancel') return;
        wizardData.metaTags[mkey] = mvalue;
        const sortedKeys = Object.keys(wizardData.metaTags).sort();
        gui.wMetaView.clearElements(true);
        $.each(sortedKeys, function (key, value) {
            const objInsert = {
                metakey: value, metavalue: wizardData.metaTags[value], hiddenID: key
            };
            //add to structure list
            gui.wMetaView.addElement(objInsert, true);
        });
        if (sortedKeys.length === 1) {
            $('#wMetaTbText').html(sortedKeys.length + ' ' + UILANG.m('meta tag'));
        } else {
            $('#wMetaTbText').html(sortedKeys.length + ' ' + UILANG.m('meta tags'));
        }
    }
}

/* adding tests to password */
function addTests() {
    let dialogData;
    if ((mode === 'wizard' && wizardData.currentPwId === 0) || (mode === 'add2selected' && wizardData.currentPwId === 0)) {
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('Add to selected'), 'default': false, disabled: true, value: 'add2', keepOpen: true
            }, {
                label: UILANG.m('Add to selected & close'), 'default': true, disabled: true, value: 'add'
            }],
            contents: "<div style='height:550px;' id='TCHOOSER'></div>",
            title: UILANG.m('Assign test'),
            width: 950,
            callback: addTestToStructureList
        };
    } else {
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('Add to all'), 'default': false, disabled: true, value: 'add2all2', keepOpen: true
            }, {
                label: UILANG.m('Add to all & close'), 'default': false, disabled: true, value: 'add2all'
            }, {
                label: UILANG.m('Add to selected'), 'default': false, disabled: true, value: 'add2', keepOpen: true
            }, {
                label: UILANG.m('Add to selected & close'), 'default': true, disabled: true, value: 'add'
            }],
            contents: "<div style='height:550px;' id='TCHOOSER'></div>",
            title: UILANG.m('Assign test'),
            width: 950,
            callback: addTestToStructureList
        };
    }
    window.testsBrowser = new nxDialog('addItemsDialog', dialogData);

    gui.extra1 = createFlexSection('TCHOOSER', 'extra001', 905, 905);
    gui.boxes.tests = createFlexBox(gui.extra1, 'testChooser', {
        title: UILANG.m('Tests'), minHeight: 500, flex: 1, noPadding: true
    });

    $('#testChooser').append("<table style='border:0;border-spacing:0;'><tr><td><div id='testsBrowserContainer' ></div></td><td style='background:#e8e8e8;'><div id='testsContainerToolBar' ></div><div id='igPreviewZone'></div></td></tr></table>");
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
        callback: clickSearch,
        disabled: false
    });

    //show tests in a filer
    testbreadcrumbs = [{
        id: 1, name: "Home"
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

    function clickSearch() {
        gui.library2.filerSearch();
    }

    //get library contents
    startAjax('fetchTestLibrary', {
        location: igLoc.folder
    });

    function testsLibraryEvent(type, data) {
        let oldigLoc;
        switch (type) {
            case 'clear':
                $('#igPreviewZone').empty();
                if (testsBrowser) {
                    testPresent = false;
                    testsBrowser.disableButton('add');
                    testsBrowser.disableButton('add2all');
                    testsBrowser.disableButton('add2');
                    testsBrowser.disableButton('add2all2');
                }
                break;
            case 'getSelect':
            case 'getSelectKeys':
                testSelection = data;
                testPresent = false;
                if (data.length === 1 && data[0].type !== 'folder') {
                    //check if test is already connected to password
                    let idPresent;
                    if (mode === 'wizard' || mode === 'add2selected') {
                        idPresent = gui.wStructureView.checkForId(data[0].dbId);
                    } else {
                        idPresent = gui.structureView.checkForId(data[0].dbId);
                    }
                    if (idPresent === true) {
                        testPresent = true;
                        startAjax('fetchTestStructure', {
                            dbId: data[0].dbId
                        });
                        testsBrowser.disableButton('add');
                        testsBrowser.disableButton('add2');
                        if (mode === 'editTest' && serverData.testLevel && serverData.testLevel.passwords.length > 1) {
                            testsBrowser.enableButton('add2all');
                            testsBrowser.enableButton('add2all2');
                        }
                        if ((mode === 'wizard' && wizardData.pwds.length > 1) || (mode === 'add2selected' && wizardData.pwds.length > 1)) {
                            testsBrowser.enableButton('add2all');
                            testsBrowser.enableButton('add2all2');
                        }
                    } else {
                        startAjax('fetchTestStructure', {
                            dbId: data[0].dbId, present: false
                        });
                        testsBrowser.enableButton('add');
                        testsBrowser.enableButton('add2');
                        if (mode === 'editTest' && serverData.testLevel && serverData.testLevel.passwords.length > 1) {
                            testsBrowser.enableButton('add2all');
                            testsBrowser.enableButton('add2all2');
                        }
                        if ((mode === 'wizard' && wizardData.pwds.length > 1) || (mode === 'add2selected' && wizardData.pwds.length > 1)) {
                            testsBrowser.enableButton('add2all');
                            testsBrowser.enableButton('add2all2');
                        }
                    }
                } else {
                    $('#igPreviewZone').empty();
                    testPresent = false;
                    testsBrowser.disableButton('add');
                    testsBrowser.disableButton('add2all');
                    testsBrowser.disableButton('add2');
                    testsBrowser.disableButton('add2all2');
                }
                break;
            case 'onNavigate':
                oldigLoc = cloneObj(igLoc);
                igLoc.folder = data.dbId;
                startAjax('fetchTestLibrary', {
                    location: igLoc.folder, current: oldigLoc
                });
                break;
            case 'onBreadcrumbNavigate':
                oldigLoc = cloneObj(igLoc);
                igLoc.folder = data;
                startAjax('fetchTestLibrary', {
                    location: igLoc.folder, current: oldigLoc
                });
                break;
            case 'onSearchRequest':
                startAjax('testsSearch', {
                    searchString: data
                });
                break;
            case 'onSearchItemClick':
                oldigLoc = cloneObj(igLoc);
                igLoc.folder = data.pid.replace(/^\D*/i, '');
                startAjax('fetchTestLibrary', {
                    location: igLoc.folder, select: data.id, current: oldigLoc
                });
                break;
            case 'getSelectDblclick':
                //addTestToStructureList('add'); -> Dismiss now already fires the callback
                testsBrowser.dismiss();
                break;
        }
    }

    function addTestToStructureList(btnClicked) {
        if (btnClicked !== 'cancel') {
            switch (mode) {
                case 'editTest':
                    if (testSelection) {
                        if (btnClicked === 'add2all' || btnClicked === 'add2all2') {
                            add2allFlag = true;
                        }
                        let objInsert = {
                            name: testSelection[0].name,
                            ID: testSelection[0].dbId,
                            actionField: {},
                            hiddenID: testSelection[0].dbId
                        };
                        //add to structure list
                        if (testPresent === true) {
                            gui.structureView.triggerCallback();
                        } else {
                            gui.structureView.addElement(objInsert, false);
                        }
                        if (serverData.testLevel.template === 'template') gui.structureView.killActionFields();
                        gui.library2.clearSelection();
                    }
                    break;
                case 'wizard':
                case 'add2selected':
                    if (testSelection) {
                        let objInsert = {
                            name: testSelection[0].name, ID: testSelection[0].dbId, hiddenID: testSelection[0].dbId
                        };
                        if (btnClicked === 'add2all' || btnClicked === 'add2all2') {
                            //add to structure list
                            if (testPresent !== true) gui.wStructureView.addElement(objInsert, true);
                            //add test to all passwords
                            $.each(wizardData.pwds, function (k, v) {
                                if (!wizardData.structure[v.id]) wizardData.structure[v.id] = [];
                                // check if not already attached
                                let attachTest = true;
                                $.each(wizardData.structure[v.id], function (key, value) {

                                    if (value['hiddenID'] === testSelection[0].dbId) attachTest = false;

                                });
                                if (attachTest === true) wizardData.structure[v.id].push(objInsert);
                            });
                            if (wizardData.structure[wizardData.currentPwId].length === 1) {
                                $(wStructureTbText).html(wizardData.structure[wizardData.currentPwId].length + ' ' + UILANG.m('test assigned'));
                            } else {
                                $(wStructureTbText).html(wizardData.structure[wizardData.currentPwId].length + ' ' + UILANG.m('tests assigned'));
                            }
                            $('#wNoAssignmentMsg').hide();
                            $('#wTestPanelList').show();
                            $('#wStructureTbText').show();
                        } else {
                            if (testPresent !== true) gui.wStructureView.addElement(objInsert, false);
                        }
                        gui.library2.clearSelection();
                    }
                    break;
            }
        }
    }
}

function editOverrides() {
    const orSetgs = serverData.testLevel.overrides;

    //Due to bug OA-1172 data might not be correct in the database, this cleans it up
    if (orSetgs['true']) delete orSetgs['true'];

    const dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
        }, {
            label: UILANG.m('Save'), 'default': true, disabled: true, value: 'add'
        }],
        contents: "<div style='height:140px;' id='overridesForm'></div>",
        title: UILANG.m('Override settings - Tests assigned to "') + serverData.testLevel.name + '"',
        width: 560,
        callback: saveOverrides
    };
    window.overridesSaver = new nxDialog('editOverridesDialog', dialogData);

    const orContainer = $('#overridesForm');
    const overrides = {};
    overrides.disableTimer = insertToggleswitch(orContainer, 'tsDisableTimer', UILANG.m('Disable Timer'), {
        dataId: 'disableTimer', changeCallback: orChanged
    });

    overrides.additionalTime = insertSpinner(orContainer, 'tsAdditionalTime', UILANG.m('Additional time (%)'), {
        dataId: 'additionalTime', range: '0..100', step: 1, height: 20, width: 33, onChange: orChanged
    });

    overrides.disableSaving = insertToggleswitch(orContainer, 'tsDisableSaving', UILANG.m('Disable saving'), {
        dataId: 'disableSaving', changeCallback: orChanged
    });
    overrides.allowNavigation = insertToggleswitch(orContainer, 'tsAllowNavigation', UILANG.m('Disable navigation limitation'), {
        dataId: 'allowNavigation', changeCallback: orChanged
    });
    overrides.demoMode = insertToggleswitch(orContainer, 'tsDemoMode', UILANG.m('Demo Mode'), {
        dataId: 'demoMode', changeCallback: orChanged
    });

    serverData.testLevel.overridesChanged = $.extend(true, {}, orSetgs);
    const saveOverridesChanged = serverData.testLevel.overridesChanged;

    $.each(orSetgs, function (key, value) {
        if (key === 'disableTimer') {
            if (value === true) {
                overrides.additionalTime.hide(0);
            } else {
                overrides.additionalTime.show(0);
            }
        }
        overrides[key].reset(value);
    });

    function saveOverrides(btnClicked) {
        if (btnClicked === 'add') {
            //save changes to database
            startAjax('saveOverrides', {
                overrides: saveOverridesChanged, id: serverData.testLevel.id
            });
        }
    }

    // Callbacks ToggleSwitches
    function orChanged(sender, value, dummy, dataId) {
        if (sender === 'tsDisableTimer' && value === true) {
            overrides.additionalTime.hide(200);
        } else {
            overrides.additionalTime.show(200);
        }
        overridesSaver.enableButton('add');
        saveOverridesChanged[dataId] = value;
    }
}

//CallbackHandling Tests assigned to password (sortableTable)
function wtestsChanged(deleted, id, currValue) {
    wizardData.structure[wizardData.currentPwId] = currValue;
    if (wizardData.structure[wizardData.currentPwId].length === 1) {
        $(wStructureTbText).html(wizardData.structure[wizardData.currentPwId].length + ' ' + UILANG.m('test assigned'));
    } else {
        $(wStructureTbText).html(wizardData.structure[wizardData.currentPwId].length + ' ' + UILANG.m('tests assigned'));
    }
    if (wizardData.structure[wizardData.currentPwId].length === 0) {
        $('#wNoAssignmentMsg').show();
        $('#wTestPanelList').hide();
        $('#wStructureTbText').hide();
    } else {
        $('#wNoAssignmentMsg').hide();
        $('#wTestPanelList').show();
        $('#wStructureTbText').show();
    }
}

function wMetaChanged(deleted, id, currValue) {
    wizardData.metaTags = {};
    $.each(currValue, function (index, value) {
        wizardData.metaTags[value.metakey] = value.metavalue;
    });
    const sortedKeys = Object.keys(wizardData.metaTags).sort();
    if (sortedKeys.length === 1) {
        $('#wMetaTbText').html(sortedKeys.length + ' ' + UILANG.m('meta tag'));
    } else {
        $('#wMetaTbText').html(sortedKeys.length + ' ' + UILANG.m('meta tags'));
    }
}

function testsChanged(deleted, id, currValue, dirty, dataId, deletedHiddenData) {
    if (add2allFlag === true) {
        startAjax('saveTestAssignmentsLibrary', {
            testeeId: serverData.testLevel.id, test2copy: testSelection[0].dbId, structure: currValue, id: currPwId
        });
        add2allFlag = false;
    } else {
        if (deleted !== false) {
            if (deletedHiddenData) {
                confirmDeletingTestWithData(currValue, currPwId, deleted);
            } else {
                startAjax('saveTestAssignmentsLibrary', {
                    structure: currValue, id: currPwId, testeeId: serverData.testLevel.id, deleteId: deleted
                });
            }
        } else {
            startAjax('saveTestAssignmentsLibrary', {
                structure: currValue, id: currPwId, testeeId: serverData.testLevel.id
            });
        }
    }
}

function confirmDeletingTestWithData(currValue, currPwId, deleted, button) {

    if (!button) {
        const message = sf('<p>' + UILANG.m('This test has data recorded. Are you sure you want to remove this test ID<strong>%@</strong>? Recorded data will be deleted!') + '</p>', deleted);
        const resetData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Delete'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: confirmDeletingTestWithData,
            title: UILANG.m('Confirm removing test'),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('resetDialog', resetData, arguments);
    }
    if (button === 'ok') {
        startAjax('saveTestAssignmentsLibrary', {
            structure: currValue, id: currPwId, testeeId: serverData.testLevel.id, deleteId: deleted
        });
    } else if (button === 'cancel') {
        startAjax('fetchTestsAssigned', {
            id: currPwId, testee: selection[0].dbId
        });
    }
}

function metaChanged(deleted, id, currValue) {
    const helperObj = {};
    $.each(currValue, function (k, v) {
        helperObj[v.metakey] = v.metavalue;
    });
    startAjax('saveMetaTagsChange', {
        metaStructure: helperObj, testeeId: serverData.testLevel.id
    });
}

/* navigation */
function cursorUp() {
    switch (mode) {
        case 'browsing':
            gui.library.filerKeyUp();
            break;
        case 'editTest':
            gui.passwords.moveUp();
            break;
        case 'wizard':
            gui.wpasswords.moveUp();
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
        case 'editTest':
            gui.passwords.moveDown();
            break;
        case 'wizard':
            gui.wpasswords.moveDown();
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
    }

    if (showBlocked) {
        $('#filez_idSuffix').children().each(function (i, o) {
            if ($(o).hasClass("filerBlocked")) $(o).removeClass('ui-selected');
        });
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
                }, 400, function (section2, section1) {
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
                }, 400, function (section2) {
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
        $('#viewsPanel').fadeOut(100, function () {
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
        }, 400, function () {
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

async function showDialog(id, dialogData) {
    let res = await new nxDialog(id, dialogData);
    return res;
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

Object.size = function (obj) {
    let size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

function generateRandomPassword(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        password += chars[randomIndex];
    }
    return password;
}

function showMessage(msg) {
    const dialogData = {
        buttons: [{
            label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
        }], contents: msg, width: 600, title: UILANG.m("Error"), icon: "../images/error.png", iconWidth: 64
    };
    new nxDialog('Message', dialogData);
}

function handleChars(value) {
    if (value) {
        if (typeof value === 'string' || value instanceof String) {
            value = encodeURIComponent(value);
        }
    }
    return value;
}

function csvToArray(text, delimiter) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
    for (l of text) {
        if ('"' === l) {
            if (s && l === p) row[i] += l;
            s = !s;
        } else if (delimiter === l && s) l = row[++i] = ''; else if ('\n' === l && s) {
            if ('\r' === p) row[i] = row[i].slice(0, -1);
            row = ret[++r] = [l = ''];
            i = 0;
        } else row[i] += l;
        p = l;
    }
    return ret;
}

function showMsgNoSrchResults(msg, searchTerm, component) {
    function showMsgNoSrchResultsCB(button) {
        if (button === 'new') {
            component.filerSearch(searchTerm);
        }
    }

    const dialogData = {
        buttons: [{
            label: 'New search', value: 'new'
        }, {
            label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
        }],
        contents: msg,
        width: 500,
        callback: showMsgNoSrchResultsCB,
        title: UILANG.m("No search results"),
        icon: "../images/warning.png",
        iconWidth: 64
    };
    new nxDialog('Message', dialogData);
}

/* server communication */
async function startAjax(action, data) {
    waitDialog.show();
    const params = {
        action: action, data: JSON.stringify(data)
    };
    return $.ajax({
        data: params
    });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();
    const dialogData = {
        buttons: [{
            label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
        }], contents: jqXHR.responseJSON.fatalError, title: 'Error: ' + errorThrown, width: 500
    };
    new nxDialog('ajaxError', dialogData);
}

function switchMessage(pwCount) {
    switch (serverData.testLevel.loginType) {
        case 'directPass':
        case 'LDAP':
        case 'SAML':
            stuLog = true;
            $('#title_passwords').html('<span>' + UILANG.m('Labels') + '</span>');
            $('#pwTbQuickAdd').hide();
            $('#tooltip_pwTbAdd').html('<div class="nxButtonTooltipPointFrame"><div class="nxButtonTooltipPoint"></div></div>' + UILANG.m('Add label'));
            if (pwCount === 1) {
                $(passwordsTbText).html(pwCount + ' ' + UILANG.m('label'));
            } else {
                $(passwordsTbText).html(pwCount + ' ' + UILANG.m('labels'));
            }
            if (pwCount > 0) {
                $(inactiveMsg).html('<h3 style="text-align:center;color:#AAA;">' + UILANG.m('Please select a label to show assigned tests!') + '</h3>');
            } else {
                $(inactiveMsg).html('<h3 style="text-align:center;color:#AAA;">' + UILANG.m('Please create a label first!') + '</h3>');
            }
            break;
        case 'local':
            stuLog = false;
            $('#title_passwords').html('<span>' + UILANG.m('Passwords') + '</span>');
            $('#pwTbQuickAdd').show();
            $('#tooltip_pwTbAdd').html('<div class="nxButtonTooltipPointFrame"><div class="nxButtonTooltipPoint"></div></div>' + UILANG.m('Add password'));
            if (pwCount === 1) {
                $(passwordsTbText).html(pwCount + ' ' + UILANG.m('password'));
            } else {
                $(passwordsTbText).html(pwCount + ' ' + UILANG.m('passwords'));
            }
            if (pwCount > 0) {
                $(inactiveMsg).html('<h3 style="text-align:center;color:#AAA;">' + UILANG.m('Please select a password to show assigned tests!') + '</h3>');
            } else {
                $(inactiveMsg).html('<h3 style="text-align:center;color:#AAA;">' + UILANG.m('Please create a password first!') + '</h3>');
            }
            break;
    }
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
                label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.fatalError,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        if (!$('#veil_error').length) new nxDialog('fatalError', dialogData);
        return;
    }
    //if a normal error occured in PHP that  did not prevent the script from finishing, show it
    if (res.error !== false) {

        //FYI: required for permission compatibility BEGIN

        if (res.action.includes(['fetchTest', 'moveObjects', 'duplicateObjects'])) {
            gui.library.clearClipboard();
        }

        // if the error is from fetchTestLibrary, we need to reset the test folder target back to home (1)
        if (res.action === 'fetchTestLibrary') igLoc.folder = 1;

        // Refresh our assigned test list to keep updated view in case addition/removal didn't work
        if (res.action === 'saveTestAssignmentsLibrary') {
            startAjax('fetchTestsAssigned', {
                id: currPwId, testee: selection[0].dbId
            });
        }

        // dismiss the edit permission dialog prior to launching the error msg to show
        if (res.action === "fetchIgPerm") {
            // close the edit perm user dialog
            editPermDialog.dismiss();

            // remove key capture handler initiated by editPermDialog
            $(document).off("keydown");
            $(document).off("keyup");
        }

        //FYI: required for permission compatibility END

        let errorDetails = typeof res.errorDetails === 'undefined' ? '' : res.errorDetails;
        const dialogData = {
            buttons: [{
                label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.error + '<br>' + errorDetails,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500,
            callback: function () {
                if (res.forceLoginRedirect) {
                    window.location = 'index.php';
                }

                if (res.reloadFolder) {
                    if (res.openNewLocation) {
                        startAjax('fetchLibrary', {
                            location: res.openNewLocationId, rebuild: true, showBlocked: showBlocked
                        });
                    } else if (res.goToParent) {
                        loc.folder = oldLoc.folder;
                        startAjax('fetchLibrary', {
                            location: oldLoc.folder, rebuild: true, showBlocked: showBlocked
                        });
                    } else {
                        startAjax('fetchLibrary', {
                            location: loc.folder, rebuild: true, showBlocked: showBlocked
                        });
                    }
                }
            }
        };
        if (!$('#veil_error').length) new nxDialog('error', dialogData);

        if (res.closeEditMode) {
            abortEditing();
        }

        return;
    }
    switch (res.action) {
        case 'deleteSelection':
            gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
            //deliberate fallthrough
        case 'renameTestOrFolder':
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
        case 'moveObjects':
        case 'duplicateObjects':
            loc.folder = res.data.loc;
            loc.path = res.data.path;
            updateLibrary(res.data.list, res.data.path);
            if (res.data.select) {
                gui.library.setSelection([{
                    id: res.data.select
                }]);
                //gui.library.getSelect();
            }
            window.permList = res.permList; // used for selective button enabling
            setLibPerms();
            break;
        case 'fetchPreSelect':
            let selected = res.preFix + res.data.id;
            startAjax('fetchLibrary', {
                location: res.data.parent, select: selected
            });
            break;
        case 'fetchTestLibrary':
            igLoc.path = res.data.path;
            updateIgLibrary(res.data.list, res.data.path);
            if (res.data.select) {
                gui.library2.setSelection([{
                    id: res.data.select
                }]);
                gui.library2.getSelect();
            }
            break;
        case 'checkTestee':
            editSelectionAfterCheck();
            break;
        case 'fetchTestStructure':
            $('#igPreviewZone').empty();
            $('#igPreviewZone').append(testStructureDisplayHTML);

            if (testPresent === true) {
                $('#presMsg').html('<h4>' + UILANG.m('This test has already been added to the current password.') + '</h4>');
            }

            if (res.data.structure.type === 'fluid') {
                $('#testID').html('<div class="tm_fluid">' + UILANG.m('fluid test') + '<br />ID: ' + res.data.id + '</div>');
                //$('#testID').append('<h3>Test-ID: ' + res.data.id + '</h3>');
                $('#testStrucDisplayHTML').append("<tr style='background-color:#ddd;border-bottom:1px solid #bbb;'><th style='width:476px'>" + UILANG.m('Name fluid testblock') + "</th><th style='width:60px'>" + UILANG.m('Pages') + "</tr>");
                $.each(res.data.structure.items, function (key, value) {
                    let html;
                    if (value.name === 'Invalid testblock!') {
                        html = sf("<tr style='border-bottom:1px dotted #ccc;'><td style='color:#DD1A00;'>%@</td><td>%@</td></tr>", value.name, value.numberOfItems);
                    } else {
                        html = sf("<tr style='border-bottom:1px dotted #ccc;'><td>%@</td><td>%@</td></tr>", value.name, value.numberOfItems);
                    }
                    $('#testStrucDisplayHTML').append(html);
                })
            } else if (res.data.structure.type === 'mutation') {
                $('#testID').html('<div class="tm_mutation">' + UILANG.m('mutation test') + '<br />ID: ' + res.data.id + '</div>');
                //$('#testID').append('<h3>Test-ID: ' + res.data.id + '</h3>');
                $('#testStrucDisplayHTML').append("<tr style='background-color:#ddd;border-bottom:1px solid #bbb;'><th style='width:476px'>" + UILANG.m('Name linear test') + "</th><th style='width:60px'>" + UILANG.m('Pages') + "</tr>");
                $.each(res.data.structure.items, function (key, value) {
                    let html;
                    if (value.name === 'Invalid test!') {
                        html = sf("<tr style='border-bottom:1px dotted #ccc;'><td style='color:#DD1A00;'>%@</td><td>%@</td></tr>", value.name, value.structCount);
                    } else {
                        html = sf("<tr style='border-bottom:1px dotted #ccc;'><td>%@</td><td>%@</td></tr>", value.name, value.structCount);
                    }
                    $('#testStrucDisplayHTML').append(html);
                })
            } else {
                $('#testID').html('<div class="tm_linear">' + UILANG.m('linear test') + '<br />ID: ' + res.data.id + '</div>');
                //$('#testID').append('<h3>Test-ID: ' + res.data.id + '</h3>');
                $('#testStrucDisplayHTML').append("<tr style='background-color:#ddd;border-bottom:1px solid #bbb;'><th style='width:262px'>" + UILANG.m('Name test page') + "</th><th style='width:102px'>" + UILANG.m('Code') + "</th></tr>");
                $.each(res.data.structure.items, function (key, value) {
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
        case 'changeLoginType':
            abortEditing();
            startAjax('fetchLibrary', {
                location: res.id, select: 't' + res.testee, showBlocked: showBlocked
            });
            break;
        case 'newFolder':
        case 'newTest':
            window.permList = res.permList; // used for selective button enabling
            setLibPerms();
            updateLibrary(res.data.list, res.data.path);
            gui.library.setSelection([{
                id: res.data.id
            }]);
            gui.library.getSelect();
            break;
        case 'fetchFolder':
            serverData.testLevel = res.data;
            fillDataFields('editFolder');
            if (editOnData) {
                editSelection('dblclick');
            }
            break;
        case 'fetchTest':
            serverData.testLevel = res.data;
            serverData.testLevel.passwords = res.passwords;
            serverData.testLevel.activityData = res.activityData;
            switchMessage(res.passwords.length);
            correctData();
            fillDataFields('editTest');
            if (editOnData) {
                editSelection('dblclick');
            }
            if (mode === 'editTest') {
                if (serverData.testLevel.passwords.length === 1) {
                    gui.passwords.setSelection([serverData.testLevel.passwords[0].id]);
                    selectionChanged(gui.passwords.getSelection());
                } else {
                    selectionChanged();
                }
            }
            break;
        case 'newMetaTag':
            serverData.testLevel.metatags = res.meta;
            correctData();
            fillDataFields('editTest');

            break;
        case 'editDisplayName':
            serverData.testLevel.displayName = res.dn;
            correctData();
            fillDataFields('editTest');
            break;
        case 'editDirPass':
            serverData.testLevel.password = res.dp;
            correctData();
            fillDataFields('editTest');
            break;
        case 'saveOverrides':
            serverData.testLevel.overrides = res.overrides;
            break;
        case 'search':
            if (res.data.list.length > 0) {
                gui.library.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library);
            }
            break;
        case 'testsSearch':
            if (res.data.list.length > 0) {
                gui.library2.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library2);
            }
            break;
        case 'newPassword':
            gui.statusBar.setStatus(UILANG.m('Password saved!'), 3000, '#0A0');
            serverData.testLevel.passwords = res.passwords;
            switchMessage(res.passwords.length);
            correctData();
            fillDataFields('editTest');
            gui.passwords.setSelection([Number(res.id)]);
            selectionChanged(gui.passwords.getSelection());
            break;
        case 'newLabel':
            gui.statusBar.setStatus(UILANG.m('Label saved!'), 3000, '#0A0');
            serverData.testLevel.passwords = res.passwords;
            switchMessage(res.passwords.length);
            correctData();
            fillDataFields('editTest');
            gui.passwords.setSelection([Number(res.id)]);
            selectionChanged(gui.passwords.getSelection());
            break;
        case 'newQuickPassword':
            gui.statusBar.setStatus(UILANG.m('Password created!'), 3000, '#0A0');
            serverData.testLevel.passwords = res.passwords;
            switchMessage(res.passwords.length);
            correctData();
            fillDataFields('editTest');
            gui.passwords.setSelection([Number(res.id)]);
            selectionChanged(gui.passwords.getSelection());
            break;
        case 'deletePassword':
            gui.statusBar.setStatus(UILANG.m('Deletion successful!'), 3000, '#0A0');
            serverData.testLevel.passwords = res.passwords;
            gui.passwords.clearList();
            switchMessage(res.passwords.length);
            correctData();
            fillDataFields('editTest');
            selectionChanged();
            break;
        case 'editPassword':
        case 'editLabel':
        case 'setPassword':
            gui.statusBar.setStatus(UILANG.m('Changes saved!'), 3000, '#0A0');
            serverData.testLevel.passwords = res.passwords;
            gui.passwords.clearList();
            switchMessage(res.passwords.length);
            correctData();
            fillDataFields('editTest');
            gui.passwords.setSelection([res.id]);
            selectionChanged(gui.passwords.getSelection());
            break;
        case 'resetResultsTestee':
            gui.statusBar.setStatus(UILANG.m('Results of the test taker deleted!'), 3000, '#0A0');
            if (currPwId != null) {
                startAjax('fetchTestsAssigned', {
                    id: currPwId, testee: selection[0].dbId
                });
            }
            break;
        case 'resetResultsPassword':
            gui.statusBar.setStatus(UILANG.m('Results of the tests deleted!'), 3000, '#0A0');
            startAjax('fetchTestsAssigned', {
                id: currPwId, testee: selection[0].dbId
            });
            break;
        case 'resetResultsTest':
            gui.statusBar.setStatus(UILANG.m('Results of the test deleted!'), 3000, '#0A0');
            startAjax('fetchTestsAssigned', {
                id: currPwId, testee: selection[0].dbId
            });
            break;
        case 'saveTestAssignmentsLibrary':
            startAjax('fetchTestsAssigned', {
                id: currPwId, testee: selection[0].dbId
            });
            break;
        case 'saveMetaTagsChange':
            serverData.testLevel.metatags = res.meta;
            correctData();
            fillDataFields('editTest');
            break;
        case 'fetchTestsAssigned':
            serverData.testLevel.activePass = res.password;
            const structureItems = res.password.structure;
            gui.structureView.clearElements(true);
            if (structureItems && structureItems.length > 0) {
                $.each(structureItems, function (key, value) {
                    gui.structureView.addElement(value, true);
                });
                $('#noAssignmentMsg').hide();
                $('#testPanelList').show();
                $('#structureTbText').show();
                structureTbButtons.copyLink.enable();
                if ((serverData.testLevel.template === 'testee' || serverData.testLevel.template === 'cloned') && res.dataFlag === true) {
                    structureTbButtons.resetPass.enable();
                } else {
                    structureTbButtons.resetPass.disable();
                }

                if (serverData.testLevel.template === 'template') gui.structureView.killActionFields();
            } else {
                $('#noAssignmentMsg').show();
                $('#testPanelList').hide();
                structureTbButtons.copyLink.disable();
            }
            if (structureItems && structureItems.length === 1) {
                $(structureTbText).html(structureItems.length + ' ' + UILANG.m('test assigned'));
            } else {
                $(structureTbText).html(structureItems.length + ' ' + UILANG.m('tests assigned'));
            }
            break;
        case 'plausibilityCheck':
            // Show results of plausibility check
            if ($("#pCheckErrorDiv").length === 0) {
                $('body').append('<div id="pCheckErrorDiv" style="display:none;"></div>')
            }
            const pbCheckHtml = $('#pCheckErrorDiv');
            pbCheckHtml.empty();

            if(stuLog){
                // No errors found
                if (!res.noPws && !res.pwsWithoutTests && !res.pwsWithDeletedTests) {
                    pbCheckHtml.append('<div class="pCheckSuccessDiv"><h3>' + UILANG.m('Plausibility check completed successfully!') + '</h3>' + UILANG.m('No issues found for this test taker:') + '<br /><ul class="pCheckUl"><li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('Labels have been created.') + '</li><li><ul class="pCheckUl"><li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All labels have one or more tests assigned.') + '</li><li><ul class="pCheckUl"><li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All assigned tests are still present in the database.') + '</li></ul></div>');
                }
                // Passwords with no assigned tests found
                if (res.noPws) {
                    pbCheckHtml.append('<br /><p class="pCheckWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('No labels have been created for this test taker yet!') + '</p>');
                }
                // Password without assigned tests
                if (res.pwsWithoutTests) {
                    pbCheckHtml.append('<br /><p class="pCheckWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('There are labels where no tests have been assigned!') + '</p>');
                }
                // Passwords with no assigned tests found
                if (res.pwsWithDeletedTests) {
                    pbCheckHtml.append('<br /><p class="pCheckWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('One or more assigned tests are not available anymore!') + '</p>');
                }
            } else {
                // No errors found
                if (!res.noPws && !res.pwsWithoutTests && !res.pwsWithDeletedTests) {
                    pbCheckHtml.append('<div class="pCheckSuccessDiv"><h3>' + UILANG.m('Plausibility check completed successfully!') + '</h3>' + UILANG.m('No issues found for this test taker:') + '<br /><ul class="pCheckUl"><li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('Passwords have been created.') + '</li><li><ul class="pCheckUl"><li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All passwords have one or more tests assigned.') + '</li><li><ul class="pCheckUl"><li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + UILANG.m('All assigned tests are still present in the database.') + '</li></ul></div>');
                }
                // Passwords with no assigned tests found
                if (res.noPws) {
                    pbCheckHtml.append('<br /><p class="pCheckWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('No passwords have been created for this test taker yet!') + '</p>');
                }
                // Password without assigned tests
                if (res.pwsWithoutTests) {
                    pbCheckHtml.append('<br /><p class="pCheckWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('There are passwords where no tests have been assigned!') + '</p>');
                }
                // Passwords with no assigned tests found
                if (res.pwsWithDeletedTests) {
                    pbCheckHtml.append('<br /><p class="pCheckWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('One or more assigned tests are not available anymore!') + '</p>');
                }

            }

            let pbCheck;
            if (mode === 'browsing') {
                pbCheck = {
                    buttons: [{
                        label: UILANG.m('Close'), 'default': false, disabled: false, value: 'ok'
                    }, {
                        label: UILANG.m('Edit test taker'), 'default': true, disabled: false, value: 'edit'
                    }],
                    contentId: 'pCheckErrorDiv',
                    title: UILANG.m('Plausibility check'),
                    width: 700,
                    callback: pCheckProceed
                };
            } else {
                pbCheck = {
                    buttons: [{
                        label: UILANG.m('Close'), 'default': true, disabled: false, value: 'ok'
                    }], contentId: 'pCheckErrorDiv', title: 'Plausibility check', width: 700
                };
            }
            new nxDialog('pCheckErrors', pbCheck);
            break;
        case 'addToSelected':
            abortEditing();
            startAjax('fetchLibrary', {
                location: res.id, showBlocked: showBlocked
            });
            //Display success message with optional warnings
            if ($("#add2selDiv").length === 0) {
                $('body').append('<div id="add2selDiv" style="display:none;"></div>')
            }
            const add2selDiv = $('#add2selDiv');
            add2selDiv.empty();
            //Build HTML for message
            add2selDiv.append('<div id="add2selInfoBox"></div>');
            const add2selInfoBox = $('#add2selInfoBox');

            add2selInfoBox.append('<h3>' + UILANG.m('Operation completed!') + '</h3>');

            if ($(res.changes).length > 1) {
                add2selInfoBox.append('<strong>' + UILANG.m('Tasks:') + '</strong><br />');
            } else {
                add2selInfoBox.append('<strong>' + UILANG.m('Task:') + '</strong><br />');
            }

            $.each(res.changes, function (k, v) {
                add2selInfoBox.append(v + '<br />');
            });
            add2selInfoBox.append('<br />');
            //Show warnings

            if ($(res.warnings).length > 0) {
                add2selDiv.append('<br /><div class="add2selError">' + UILANG.m('Warning:') + ' ' + UILANG.m('The following issues have been detected:') + '</div>');
            } else {
                add2selDiv.append('<br /><div class="add2selSuccessDiv">' + UILANG.m('All tasks completed successfully. No issues found!') + '</div>');
            }
            add2selDiv.append('<br />');
            // Display Warnings
            $.each(res.warnings, function (k, v) {
                add2selDiv.append(v.message + '<hr class="add2selHR" />');
            });

            const add2selMsg = {
                buttons: [{
                    label: UILANG.m('Close'), 'default': true, disabled: false
                }], contentId: 'add2selDiv', title: UILANG.m('Add to selected test takers'), width: 700
            };
            new nxDialog('add2selMsgBox', add2selMsg);

            break;
        case 'wizardCreate':
        case 'wizardCreateFromFile':
            abortEditing();
            startAjax('fetchLibrary', {
                location: res.id, showBlocked: showBlocked
            });
            gui.statusBar.setStatus(UILANG.m('Your test takers (logins) have been created successfully!'), 3000, '#0A0');
            break;
        case 'exportCSV':
            //Exporting list of test takers for test admins
            //Creating header line CSV
            const writeArray = [];
            const headerLineArray = [];

            headerLineArray.push('Test Taker', 'Display Name', 'Login-Type', 'subfolder');
            if (res.mTagLength > 0) {
                for (let i = 1; i <= res.mTagLength; i++) {
                    headerLineArray.push('metakey' + i, 'metavalue' + i);
                }
            }
            const csvRowLength = headerLineArray.length;
            writeArray.push(headerLineArray);
            let tmpArray = [];

            //Creating CSV data lines
            for (let y = 0; y < res.CSVArray.length; y++) {
                tmpArray = [];
                //testee
                tmpArray.push(handleChars(res.CSVArray[y]['name']));
                //displayName
                if (res.CSVArray[y]['displayName'] === null) {
                    tmpArray.push('');
                } else {
                    tmpArray.push(res.CSVArray[y]['displayName']);
                }
                //loginType
                tmpArray.push(handleChars(res.CSVArray[y]['loginType']));

                //subfolder
                if (res.CSVArray[y]['folderPath'] !== false) {
                    tmpArray.push(handleChars(res.CSVArray[y]['folderPath']));
                } else {
                    tmpArray.push('');
                }
                //meta Tags
                if (res.CSVArray[y]['metaTags'] != null && typeof res.CSVArray[y]['metaTags'] === "object" && Object.entries(res.CSVArray[y]['metaTags']).length > 0) {
                    for (let key in res.CSVArray[y]['metaTags']) {
                        if (res.CSVArray[y]['metaTags'].hasOwnProperty(key)) {
                            tmpArray.push(handleChars(key));
                            tmpArray.push(handleChars(res.CSVArray[y]['metaTags'][key]));
                        }
                    }
                }

                //Fill up fields if needed
                let csvRealLength;
                if (res.CSVArray[y]['metaTags'] != null && typeof res.CSVArray[y]['metaTags'] === "object" && Object.size(res.CSVArray[y]['metaTags']) > 0) {
                    csvRealLength = (Object.size(res.CSVArray[y]['metaTags']) * 2) + 4;
                } else {
                    csvRealLength = 4;
                }
                for (let t = csvRealLength; t < csvRowLength; t++) {
                    tmpArray.push('');
                }
                writeArray.push(tmpArray);
            }
            //Write data to array
            const csvString = writeArray.join("%0A");
            const universalBOM = "\uFEFF";
            const element = document.createElement('a');
            element.setAttribute('href', 'data:attachment/csv,' + universalBOM + csvString);
            element.setAttribute('download', 'export.csv');
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            break;

        case 'fetchIgPerm':

            igp_return(res, 'testtakers');

            break;

        case 'updatePerm':
            gui.statusBar.setStatus("Permission data successfully updated!", 3000, '#0A0');

            startAjax('fetchLibrary', {
                location: loc.folder, showBlocked: showBlocked
            });

            break;


        default:
            break;
    }
}
