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
let templateCloneBoxElement = null;
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
wizardData.oLoginForwarding = false;
wizardData.oForwardUrl = '';
wizardData.assignMtags = false;
wizardData.deleteExistingPwds = false;
wizardData.deleteExistingMtags = false;
wizardData.metaTags = {};
const wizardErrors = {};
let wizState = false;
let selHasStudent = false;
let bulkModifyContext = null;
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
//variables for delayed edit handling
let editOnData = false;
let pendingTestLevelId = null;
let pendingTestLevelToken = null;
let pendingTestLevelRequest = null;
let ajaxRequestToken = 0;
let pendingPreviewCheckToken = null;
let previewPlausibilityResult = null;
let suppressPreviewPlausibilityForTesteeId = null;
let suppressPreviewPlausibilityRemaining = 0;
let refreshPreviewAfterLibraryForTesteeId = null;
let preserveLibraryScrollOnNextSelection = false;
//HTML frame for test structures in the assign-test-form
const testStructureDisplayHTML = "<div id='presMsg'></div><div class='tmTestAssignPreviewMeta' id='testID'></div><div class='tmTestAssignPreviewTableShell'><table class='tmTestAssignPreviewTableHead'><colgroup><col class='tmTestAssignPreviewColName'><col class='tmTestAssignPreviewColInfo'></colgroup><thead></thead></table><div class='tmTestAssignPreviewTableWrap'><table id='testStrucDisplayHTML'><colgroup><col class='tmTestAssignPreviewColName'><col class='tmTestAssignPreviewColInfo'></colgroup><tbody></tbody></table></div></div>";
//OasysHelp
let standardLoginHtml, standardLoginTitle, studentLoginHtml, studentLoginTitle;
// global vars for blocked object handling
let curFFlist = null;
let showBlocked = true;

let jsph;

const TT_ALLOWED_PASSWORD_CHARACTERS = /[^\w.(){}\[\]-]/g;
const TT_ALLOWED_NAME_CHARACTERS = /[^\w .(){}\[\]-]/g;

function ttEscapeHtml(value) {
    return $('<div>').text(String(value)).html();
}

function ttShowInvalidCharacters(characters, allowSpaces, details, importStopped) {
    if ($('#veil_ttInvalidCharacters').length) return;
    const display = [...new Set(characters)].map((character) => {
        if (character === ' ') return '{SPACE}';
        if (character === '\t') return '{TAB}';
        if (character === '\n' || character === '\r') return '{LINE BREAK}';
        return character;
    }).join(' ');
    const allowed = allowSpaces
        ? 'A–Z  a–z  0–9  SPACE  ( )  { }  [ ]  .  _  -'
        : 'A–Z  a–z  0–9  ( )  { }  [ ]  .  _  -';
    const detailHtml = details ? '<p class="tmValidationContext">' + ttEscapeHtml(details) + '</p>' : '';
    const heading = importStopped
        ? UILANG.m('Unsupported character found in CSV')
        : UILANG.m('Unsupported character removed');
    const explanation = importStopped
        ? UILANG.m('The import was stopped. Correct the CSV file and try again.')
        : UILANG.m('Please use only the characters shown below.');
    const valueLabel = importStopped ? UILANG.m('Character found') : UILANG.m('You typed');
    new nxDialog('ttInvalidCharacters', {
        buttons: [{label: UILANG.m('OK'), 'default': true, value: 'ok'}],
        contents: '<div class="tmValidationMessage">' +
            '<div class="tmValidationBody"><strong>' + heading + '</strong>' +
            '<p>' + explanation + '</p>' + detailHtml +
            '<div class="tmValidationValue"><span>' + valueLabel + '</span><code>' + ttEscapeHtml(display) + '</code></div>' +
            '<div class="tmValidationAllowed"><span>' + UILANG.m('Allowed characters') + '</span><code>' + allowed + '</code></div>' +
            '</div></div>',
        title: importStopped ? UILANG.m('CSV import stopped') : UILANG.m('Check your entry'),
        type: 'warning',
        width: 500
    });
}

function ttBindAllowedCharacters(selector, allowSpaces) {
    const input = $(selector);
    input.addClass('tmValidatedInput').off('input.ttAllowedCharacters').on('input.ttAllowedCharacters', function () {
        const expression = allowSpaces ? TT_ALLOWED_NAME_CHARACTERS : TT_ALLOWED_PASSWORD_CHARACTERS;
        const value = this.value;
        const invalid = value.match(expression);
        if (!invalid) return;
        const cursor = this.selectionStart === null ? value.length : this.selectionStart;
        const removedBeforeCursor = (value.slice(0, cursor).match(expression) || []).length;
        this.value = value.replace(expression, '');
        const nextCursor = Math.max(0, cursor - removedBeforeCursor);
        if (typeof this.setSelectionRange === 'function') this.setSelectionRange(nextCursor, nextCursor);
        ttShowInvalidCharacters(invalid, allowSpaces);
    });
}

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
    gui.s10 = createFlexSection('UI', 'sect010', 846, 846); //preview

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
    gui.boxes.loginSettings.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.boxes.metaTags.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.boxes.passwords.getInnerBox().addClass('tmCompactFlexPanel');
    gui.s2.hide();

    //section 3 (tests)
    gui.boxes.assignedTests = createFlexBox(gui.s3, 'assignedTests', {
        title: UILANG.m('Tests assigned'), minHeight: 480, flex: 1, panelHeight: 30
    });
    gui.s3.hide();

    gui.boxes.assignedTests.getInnerBox().addClass('tmCompactFlexPanel');
    gui.boxes.assignedTests.getInnerBox().append('<div id="inactiveMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('Please create a password first!') + '</h3></div><div id="noAssignmentMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('No test assigned yet. Click on the Plus-Icon to assign a test!') + '</h3></div><div id="testPanelList"></div>');

    gui.boxes.templateClones = createFlexBox(gui.s3, 'templateClones', {
        title: UILANG.m('Recorded datasets'), minHeight: 480, flex: 1, panelHeight: 30
    });
    gui.boxes.templateClones.getInnerBox().addClass('tmCompactFlexPanel');
    gui.boxes.templateClones.getInnerBox().append('<div id="templateCloneList"></div>');
    gui.boxes.templateClones.getPanel().append(
        '<div><div id="templateClonesTbText"></div><div id="templateClonesTbButton">' +
        '<button type="button" id="templateClonesDeleteAll" class="tmTemplateCloneDelete" ' +
        'title="' + UILANG.m('Reset test taker results') + '" disabled></button></div></div>'
    );
    $('#templateClonesDeleteAll').on('click', function () {
        resetTestee();
    });
    templateCloneBoxElement = $('#box_templateClones');
    resetTemplateCloneBoxSizing();
    templateCloneBoxElement.detach();
    $(window).on('resize.templateCloneLayout', syncTemplateDatasetLayout);

    //section 10 (preview)
    gui.boxes.testeePreview = createFlexBox(gui.s10, 'testeePreview', {
        title: UILANG.m('Test taker preview'), minHeight: 480, flex: 1, noPadding: true
    });
    gui.s10.hide();
    gui.boxes.testeePreview.getInnerBox().append('<div id="testeePreviewContent"></div>');

    //section 4 (Wizard_main)
    gui.boxes.wizard = createFlexBox(gui.s4, 'wizard', {
        title: UILANG.m('Test taker wizard'), minHeight: 480, flex: 1
    });
    gui.s4.hide();

    gui.boxes.wizard.getInnerBox().addClass('tmCompactFlexPanel');
    gui.boxes.wizard.getInnerBox().append('<div id="wiz_mainfr"></div>');

    //section 5 (wizard_passwords)
    gui.boxes.wpasswords = createFlexBox(gui.s5, 'wpasswords', {
        title: UILANG.m('Passwords'), minHeight: 480, flex: 1, locked: true, panelHeight: 30
    });
    gui.boxes.wpasswords.getInnerBox().addClass('tmCompactFlexPanel');
    gui.s5.hide();

    //section 6 (wizard_tests)
    gui.boxes.wtests = createFlexBox(gui.s6, 'wtests', {
        title: UILANG.m('Assigned Tests'), minHeight: 480, flex: 1, locked: true, panelHeight: 30
    });
    gui.s6.hide();
    gui.boxes.wtests.getInnerBox().addClass('tmCompactFlexPanel');
    gui.boxes.wtests.getInnerBox().append('<div id="wInactiveMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('Please create a password first!') + '</h3></div><div id="wNoAssignmentMsg"><h3 style="text-align:center;color:#AAA">' + UILANG.m('No test assigned yet. Click on the Plus-Icon to assign a test!') + '</h3></div><div id="wTestPanelList"></div>');

    //section 7 (Create from CSV)
    gui.boxes.createFromCSV = createFlexBox(gui.s7, 'createFromCSV', {
        title: UILANG.m('Create from CSV'), minHeight: 480, flex: 1
    });
    gui.s7.hide();

    gui.boxes.createFromCSV.getInnerBox().addClass('tmCompactFlexPanel csvImportPanel');
    gui.boxes.createFromCSV.getInnerBox().append(
        '<div id="csv_mainfr" class="csvImportMain">' +
            '<div id="infoZone" class="csvImportPreview" style="display:none;"></div>' +
            '<div id="uploadZone" class="csvImportUpload" style="display:none;">' +
                '<div class="csvImportUploadText">' +
                    '<strong>' + UILANG.m('Select CSV file') + '</strong>' +
                    '<span>' + UILANG.m('Please select a csv-file from your local disk.') + '</span>' +
                '</div>' +
                '<div id="mmBrowseDiv"><button>' + UILANG.m('Select a file') + '</button><input type="file" multiple id="browseDialog"></div>' +
            '</div>' +
            '<div id="infomsg" class="csvImportInfo"></div>' +
        '</div>'
    );

    //section 8 wizard meta tags
    gui.boxes.wMetaTags = createFlexBox(gui.s8, 'wMetaTags', {
        title: UILANG.m('Meta-tags'), minHeight: 480, flex: 1, locked: true, panelHeight: 30
    });
    gui.s8.hide();

    gui.boxes.wMetaTags.getInnerBox().addClass('tmCompactFlexPanel');
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
    gui.library = new FileManager("#testList", "_idSuffix", [], breadcrumbs, fileOpPermissions, true, libraryEvent, 'all', true);

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
        prefixKey: 'listBadges',
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
        prefixKey: 'listBadges',
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
            name: '276px', ID: '65px'
        },
        tableHead: {
            name: '', ID: 'Test-ID'
        },
        iconColumn: {
            field: 'testType',
            title: 'Test',
            width: '24px',
            size: '20px',
            path: '../inc/filer/images/',
            icons: {
                linear: 'testLinear.png',
                fluid: 'testFluid.png',
                mutation: 'testMutation.png'
            },
            labels: {
                linear: UILANG.m('Linear test'),
                fluid: UILANG.m('Fluid test'),
                mutation: UILANG.m('Mutation test')
            }
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
    gui.structureView = new JsSortableTable('testPanelList', 'assignedTests_table', STOptions);
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
    gui.metaView = new JsTagEditor('metaTagList', {
        onChange: metaChanged,
        keyLabel: UILANG.m('Meta-key (e.g. "Class"):'),
        valueLabel: UILANG.m('Meta-value (e.g. "9a"):'),
        inputClass: 'amt'
    });
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
    gui.wMetaView = new JsTagEditor('wMetaTagList', {
        onChange: wMetaChanged,
        keyLabel: UILANG.m('Meta-key (e.g. "Class"):'),
        valueLabel: UILANG.m('Meta-value (e.g. "9a"):'),
        inputClass: 'amt'
    });

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
            name: '216px', ID: '45px'
        },
        tableHead: {
            name: '', ID: 'Test-ID'
        },
        iconColumn: {
            field: 'testType',
            title: 'Test',
            width: '24px',
            size: '20px',
            path: '../inc/filer/images/',
            icons: {
                linear: 'testLinear.png',
                fluid: 'testFluid.png',
                mutation: 'testMutation.png'
            },
            labels: {
                linear: UILANG.m('Linear test'),
                fluid: UILANG.m('Fluid test'),
                mutation: UILANG.m('Mutation test')
            }
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
    gui.wStructureView = new JsSortableTable('wTestPanelList', 'wTests_table', WSTOptions);
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
            gui.s2.fadeOut(0);
            gui.s3.fadeOut(0);
            gui.s4.fadeOut(0);
            gui.s5.fadeOut(0);
            gui.s6.fadeOut(0);
            gui.s7.fadeOut(0);
            gui.s8.fadeOut(0);
            if (!(selection.length === 1 && ['testee', 'template', 'cloned'].includes(selection[0].type))) {
                gui.s10.fadeOut(0);
            }
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
            ttRestoreEditSections();
            gui.s2.fadeIn(0);
            gui.s3.fadeIn(250);
            if (selection[0].type === 'testee' || selection[0].type === 'template' || selection[0].type === 'cloned') updateResetResultsAvailability();
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
            gui.s10.fadeOut(250);
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
            gui.s10.fadeOut(250);
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
            gui.s10.fadeOut(250);
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
        case 'onMetaSearchRequest':
            startAjax('metaSearch', data);
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

function normalizeTestTakerSelectionId(selectedId) {
    if (!selectedId) return null;
    return String(selectedId).replace(/^t/, '');
}

function findLibraryItemBySelectionId(list, selectedId) {
    const normalizedId = normalizeTestTakerSelectionId(selectedId);
    if (!normalizedId || !Array.isArray(list)) return null;
    return list.find(function(item) {
        return normalizeTestTakerSelectionId(item.id) === normalizedId || String(item.dbId) === normalizedId;
    }) || null;
}

function armBrowsePreviewRefresh(selectedId) {
    const normalizedId = normalizeTestTakerSelectionId(selectedId);
    if (!normalizedId) return;
    suppressPreviewPlausibilityForTesteeId = normalizedId;
    suppressPreviewPlausibilityRemaining = 2;
    refreshPreviewAfterLibraryForTesteeId = normalizedId;
}

function reloadBrowsePreviewForTestee(selectedId) {
    const dbId = normalizeTestTakerSelectionId(selectedId);
    if (!dbId) return;
    ttShowBrowsePreviewSection();
    renderTesteePreviewLoading();
    pendingTestLevelId = dbId;
    pendingTestLevelToken = ++ajaxRequestToken;
    if (pendingTestLevelRequest && pendingTestLevelRequest.readyState !== 4 && typeof pendingTestLevelRequest.abort === 'function') {
        pendingTestLevelRequest.abort();
    }
    pendingTestLevelRequest = startAjax('fetchTest', {
        dbId: dbId,
        location: loc.folder,
        _requestToken: pendingTestLevelToken
    });
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
    pendingPreviewCheckToken = null;
    previewPlausibilityResult = null;
    buttons.plausibilityCheck.disable();
    buttons.overrideSettings.disable();
    buttons.addPwdsTests.disable();
    if (selection.length === 0) {
        buttons.deleteSelection.disable();
        buttons.resetResultsTestee.disable();
        buttons.editSelection.disable();
        buttons.duplicate.disable();
        buttons.rename.disable();
        buttons.wizardToFile.disable();
        gui.s2.fadeOut(250);
        gui.s3.fadeOut(250);
        gui.s10.fadeOut(250);
    } else if (selection.length === 1) {
        buttons.deleteSelection.enable();
        buttons.resetResultsTestee.enable();
        buttons.rename.enable();
        buttons.wizardToFile.enable();
        if (selection[0].type === 'folder') {
            buttons.editSelection.disable();
            buttons.duplicate.disable();
            gui.s2.removeClass('ttPreviewCollapsedSection').hide();
            gui.s3.removeClass('ttPreviewCollapsedSection').hide();
            gui.s10.hide();
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

            if (editOnData) {
                ttRestoreEditSections();
                gui.s2.fadeIn(0);
            } else {
                ttShowBrowsePreviewSection();
                renderTesteePreviewLoading();
            }
            editType = 'testee';
            buttons.plausibilityCheck.enable();
            buttons.overrideSettings.enable();
            buttons.editSelection.enable();
            buttons.duplicate.enable();
            buttons.addPwdsTests.enable();
            gui.structureView.clearElements(true);
            if (data.length >= 2) selIcheck(loc, data);
            pendingTestLevelId = selection[0].dbId;
            pendingTestLevelToken = ++ajaxRequestToken;
            if (pendingTestLevelRequest && pendingTestLevelRequest.readyState !== 4 && typeof pendingTestLevelRequest.abort === 'function') {
                pendingTestLevelRequest.abort();
            }
            pendingTestLevelRequest = startAjax('fetchTest', {
                dbId: selection[0].dbId, location: loc.folder, _requestToken: pendingTestLevelToken
            });
        } else if (delayed) {
            gui.s2.hide();
            gui.s3.hide();
            gui.s10.hide();
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
    wizardData.oLoginForwarding = false;
    wizardData.oForwardUrl = '';
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

        ttBindAllowedCharacters(prefixInput, true);
        ttBindAllowedCharacters(suffixInput, true);
        // Update the example name while typing.
        prefixInput.on('input', function () {
            wizState = true;
            const thisInput = $(this);
            $('#wpre').text(thisInput.val());
            wizardData.prefix = thisInput.val();
        });
        suffixInput.on('input', function () {
            wizState = true;
            const thisInput = $(this);
            $('#wsuf').text(thisInput.val());
            wizardData.suffix = thisInput.val();
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

    // NEW: Login forwarding override
    wizardOverridesSub.append('<div id="div_oLoginForwarding" class ="wizarditem">&nbsp;'
        + UILANG.m('Forward login to other OASYS')
        + '<img src="../inc/filer/images/unchecked_checkbox.png" id="img_oLoginForwarding" /></div>');

    wizardOverridesSub.append(`
        <div id="sub_oForwardUrl" class="subwizarditem" style="display:none; margin-left:18px;">
            <div style="margin:6px 0 4px 0;font-size:14px;">${UILANG.m('Forward URL')}</div>
            <div style="display:flex; gap:6px;">
                <input id="oForwardUrlInput"
                       type="text"
                       placeholder="https://example.org/oasys"
                       style="flex:1; height:26px; box-sizing:border-box;" />
                <button id="oForwardUrlTest"
                        type="button"
                        class="nxButton">
                    ${UILANG.m('Test')}
                </button>
            </div>
            <div id="oForwardUrlStatus" style="margin-top:6px; font-size:12px;"></div>
        </div>
    `);


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


    // The student-specific password panel exists only in the add-to-selected wizard.
    if(add2sel && selHasStudent){
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
    const oLoginForwarding = $("#div_oLoginForwarding");
    const oLoginForwardingIMG = $("#img_oLoginForwarding");
    const oForwardUrlSub = $("#sub_oForwardUrl");
    const oForwardUrlInput = $("#oForwardUrlInput");
    const oForwardUrlTest = $("#oForwardUrlTest");
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
    oLoginForwarding.on("click", function () {
        wizState = true;
        if (oLoginForwarding.hasClass('wizarditemhover')) {
            oLoginForwarding.toggleClass('wizChecked');
            if (oLoginForwarding.hasClass('wizChecked')) {
                wizardData.oLoginForwarding = true;
                oLoginForwardingIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                oForwardUrlSub.show(200);

                // keep current input in wizardData
                wizardData.oForwardUrl = oForwardUrlInput.val() || wizardData.oForwardUrl || '';
            } else {
                wizardData.oLoginForwarding = false;
                oLoginForwardingIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                oForwardUrlSub.hide(200);
                setWizardForwardUrlStatus('');
                // policy: keep URL or clear. I’d keep it to avoid retyping.
            }
        }
    });

    oForwardUrlInput.on('input change', function () {
        wizState = true;
        wizardData.oForwardUrl = $(this).val();
        setWizardForwardUrlStatus('');
    });

    oForwardUrlTest.on('click', function () {
        const url = normalizeBaseUrl(oForwardUrlInput.val());
        const $status = $('#oForwardUrlStatus');

        // ALWAYS reset state at click time
        $status.removeClass('oasysStatusOk oasysStatusErr');

        if (!url) {
            $status
                .text(UILANG.m('Please enter a URL.'))
                .addClass('oasysStatusErr');
            return;
        }

        if (!/^https?:\/\//i.test(url)) {
            $status
                .text(UILANG.m('Please enter a full URL including http:// or https://'))
                .addClass('oasysStatusErr');
            return;
        }

        oForwardUrlTest.prop('disabled', true);

        // Checking = neutral (no class)
        $status.text(UILANG.m('Checking OASYS instance...'));

        startAjax('checkForwardUrl', { url: url });
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
                updateMetaTagCounter('#wMetaTbText', 0);
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

    function normalizeBaseUrl(url) {
        if (!url) return '';
        return ('' + url).trim().replace(/\/+$/, '');
    }

    function setWizardForwardUrlStatus(text) {
        $('#oForwardUrlStatus').text(text || '');
        $('#oForwardUrlTest').prop('disabled', false);
    }

    // Hook for ajaxSuccess -> case 'checkForwardUrl'
    window._wizardForwardUrlTestCb = function (res) {
        if (!res || res.action !== 'checkForwardUrl') return;

        const $status = $('#oForwardUrlStatus');
        const $btn = $('#oForwardUrlTest');
        if (!$status.length) return;

        // reset classes
        $status.removeClass('oasysStatusOk oasysStatusErr');

        if (res.ok === true && res.version) {
            const text = res.statusText || ('OASYS ' + res.version + ' ' + UILANG.m('found'));
            $status.text(text);

            // green only if supported, else red
            if (res.supported === true) {
                $status.addClass('oasysStatusOk');
            } else {
                $status.addClass('oasysStatusErr');
            }
        } else {
            $status.text(res.reason || UILANG.m('Reached URL, but no OASYS found'));
            $status.addClass('oasysStatusErr');
        }

        $btn.prop('disabled', false);
    };
}

function createFromWizard(sender, button) {
    if (!button) {
        const testTakerLabel = wizardData.noTestees === 1 ? UILANG.m('new test taker') : UILANG.m('new test takers');
        let detailMessage = sf(UILANG.m('You are about to create %@ %@.'), wizardData.noTestees, testTakerLabel);
        let note = '';
        if (wizardData.noTestees === 1) {
            note = '<p class="tmActionConfirmNote">' + UILANG.m('The number of test takers is set to 1. Continue only if this is intentional.') + '</p>';
        }
        const message = sf(
            '<div class="tmActionConfirm tmActionConfirm-warning">' +
                '<strong>' + UILANG.m('Ready to create') + '</strong>' +
                '<span>%@</span>' +
                '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Folder') + '</span><strong>"%@"</strong></div>' +
                '%@' +
            '</div>',
            detailMessage,
            filerPath,
            note
        );

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
            type: 'warning'
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
            oLoginForwarding: wizardData.oLoginForwarding,
            oForwardUrl: wizardData.oForwardUrl,
            overrides: wizardData.overrides,
            assignMtags: wizardData.assignMtags,
            metaTags: wizardData.metaTags,
            pid: loc.folder
        });
    }
}

function addToSelected(sender, button) {

    if (!button) {
        const selectedCount = selection.length || 0;
        const targetLabel = selectedCount === 1 ? UILANG.m('selected test taker') : UILANG.m('selected test takers');
        const message = sf(
            '<div class="tmActionConfirm tmActionConfirm-warning">' +
                '<strong>' + UILANG.m('Ready to apply') + '</strong>' +
                '<span>%@</span>' +
                '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Selection') + '</span><strong>%@ %@</strong></div>' +
            '</div>',
            UILANG.m('The current modifications will be saved to the selected test takers.'),
            selectedCount,
            targetLabel
        );

        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Apply to selected'), value: UILANG.m('OK')
            }],
            contents: message,
            width: 450,
            callback: addToSelected,
            title: UILANG.m('Apply to selected test takers?'),
            type: 'warning'
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
            oLoginForwarding: wizardData.oLoginForwarding,
            oForwardUrl: wizardData.oForwardUrl,
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

function openBulkSelectionMode(hasStudent) {
    const entryPlural = hasStudent ? UILANG.m('labels') : UILANG.m('passwords');
    const contents =
        '<div class="tmActionConfirm">' +
            '<strong>' + UILANG.m('What do you want to do?') + '</strong>' +
            '<span>' + sf(UILANG.m('Add new %@, or modify an existing one across the selected test takers.'), entryPlural) + '</span>' +
        '</div>';
    new nxDialog('bulkSelectionMode', {
        buttons: [{
            label: UILANG.m('Cancel'), cancel: true, value: 'cancel'
        }, {
            label: UILANG.m('Modify existing'), value: 'modify'
        }, {
            label: UILANG.m('Add new'), 'default': true, value: 'add'
        }],
        contents: contents,
        width: 520,
        callback: function(button) {
            if (button === 'add') {
                mode = 'add2selected';
                selHasStudent = hasStudent;
                switchMode();
                buildWizard(true);
                hideMenu();
                hideSection(gui.s1, [gui.s4, gui.s5, gui.s6]);
            } else if (button === 'modify') {
                startBulkExistingAnalysis(hasStudent);
            }
        },
        title: UILANG.m('Apply to selected')
    });
}

function startBulkExistingAnalysis(hasStudent) {
    startAjax('bulkModifyExisting', {
        phase: 'analyze',
        selection: selection,
        pid: loc.folder
    }).then(function(res) {
        if (res.error !== false || !res.bulkAnalysis) return;
        if (!res.bulkAnalysis.candidates.length) {
            showMessage(hasStudent
                ? UILANG.m('The selected test takers do not contain any labels that can be modified.')
                : UILANG.m('The selected test takers do not contain any passwords that can be modified.'));
            return;
        }
        selHasStudent = hasStudent;
        mode = 'modifyselected';
        wizardData.currentPwId = 1;
        wizardData.structure = [];
        wizardData.structure[1] = [];
        gui.wStructureView.clearElements(true);
        showBulkExistingDialog(res.bulkAnalysis);
    });
}

function showBulkExistingDialog(analysis) {
    bulkModifyContext = {
        analysis: analysis,
        selection: selection.slice()
    };
    const noun = analysis.kind === 'student' ? UILANG.m('label') : UILANG.m('password');
    const contents =
        '<div class="tmBulkModify">' +
            '<div class="tmBulkModifyIntro">' +
                '<strong>' + sf(UILANG.m('Modify an existing %@'), noun) + '</strong>' +
                '<span>' + sf(UILANG.m('Choose the %@ you want to change. It will be updated for every selected test taker that has it. Others will be skipped.'), noun) + '</span>' +
            '</div>' +
            '<label for="tmBulkTarget">' + UILANG.m('Current') + ' ' + noun + '</label>' +
            '<select id="tmBulkTarget"></select>' +
            '<div id="tmBulkTargetSummary" class="tmBulkModifySummary"></div>' +
            '<button type="button" id="tmBulkCurrentTests" class="tmBulkFoundTestsLink"></button>' +
            '<div class="tmBulkModifyGrid">' +
                '<div><label for="tmBulkNewName">' + UILANG.m('New') + ' ' + noun + '</label><input id="tmBulkNewName" maxlength="255"></div>' +
                '<div><label for="tmBulkNewTag">' + UILANG.m('Tag') + '</label><input id="tmBulkNewTag" maxlength="255"></div>' +
            '</div>' +
            (analysis.kind === 'student'
                ? '<div class="tmBulkStudentPassword">' +
                    '<label for="tmBulkPasswordMode">' + UILANG.m('Password for this label') + '</label>' +
                    '<div class="tmBulkModifyGrid">' +
                        '<div><select id="tmBulkPasswordMode">' +
                            '<option value="keep">' + UILANG.m('Keep unchanged') + '</option>' +
                            '<option value="set">' + UILANG.m('Create or replace password') + '</option>' +
                            '<option value="remove">' + UILANG.m('Remove password requirement') + '</option>' +
                        '</select></div>' +
                        '<div><input id="tmBulkNewPassword" type="text" maxlength="200" placeholder="' + UILANG.m('New password') + '"></div>' +
                    '</div>' +
                    '<div id="tmBulkPasswordSummary" class="tmBulkModifyHint"></div>' +
                '</div>'
                : '') +
            '<label for="tmBulkAssignmentMode">' + UILANG.m('Connected tests') + '</label>' +
            '<select id="tmBulkAssignmentMode">' +
                '<option value="keep">' + UILANG.m('Keep unchanged') + '</option>' +
                '<option value="add">' + UILANG.m('Add selected tests') + '</option>' +
                '<option value="remove">' + UILANG.m('Remove selected tests') + '</option>' +
                '<option value="replace">' + UILANG.m('Replace with selected tests') + '</option>' +
            '</select>' +
            '<div id="tmBulkTestControls" class="tmBulkTestControls">' +
                '<button type="button" id="tmBulkChooseTests">' + UILANG.m('Choose tests...') + '</button>' +
                '<button type="button" id="tmBulkModifyTestsSummary" class="tmBulkSelectedTestsLink" disabled>' + UILANG.m('No tests selected') + '</button>' +
            '</div>' +
            '<div id="tmBulkDestructiveNote" class="tmBulkModifyWarning">' +
                sf(UILANG.m('Removing a connected test also removes result and scoring data linked through this %@.'), noun) +
            '</div>' +
        '</div>';

    const bulkModifyDialog = new nxDialog('bulkModifyExistingDialog', {
        buttons: [{
            label: UILANG.m('Cancel'), cancel: true, value: 'cancel'
        }, {
            label: UILANG.m('Preview changes'), 'default': true, value: 'preview'
        }],
        contents: contents,
        width: 650,
        callback: bulkExistingDialogCallback,
        title: UILANG.m('Modify selected test takers')
    });
    const previewButton = document.getElementById('bulkModifyExistingDialog_button_1');
    if (previewButton) {
        let previewPointerDown = false;
        previewButton.addEventListener('pointerdown', function(event) {
            if (event.button !== 0 && event.pointerType === 'mouse') return;
            previewPointerDown = true;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
        previewButton.addEventListener('pointerup', function(event) {
            if (!previewPointerDown) return;
            previewPointerDown = false;
            event.preventDefault();
            event.stopImmediatePropagation();
            bulkModifyDialog.dismiss('preview');
        }, true);
        previewButton.addEventListener('pointercancel', function() {
            previewPointerDown = false;
        }, true);
    }

    const target = $('#tmBulkTarget');
    analysis.candidates.forEach(function(candidate, index) {
        $('<option/>', {
            value: index,
            text: candidate.name + (candidate.tag ? ' [' + candidate.tag + ']' : '')
        }).appendTo(target);
    });
    target.on('change', updateBulkTargetFields).trigger('change');
    ttBindAllowedCharacters('#tmBulkNewName', analysis.kind === 'student');
    if (analysis.kind === 'student') ttBindAllowedCharacters('#tmBulkNewPassword', false);
    $('#tmBulkAssignmentMode').on('change', updateBulkAssignmentControls).trigger('change');
    $('#tmBulkPasswordMode').on('change', updateBulkPasswordControls).trigger('change');
    $('#tmBulkChooseTests').on('click', function() {
        addTests();
    });
    $('#tmBulkModifyTestsSummary').on('click', showBulkSelectedTests);
    $('#tmBulkCurrentTests').on('click', showBulkFoundTests);
}

function updateBulkTargetFields() {
    if (!bulkModifyContext) return;
    const candidate = bulkModifyContext.analysis.candidates[Number($('#tmBulkTarget').val())];
    if (!candidate) return;
    $('#tmBulkNewName').val(candidate.name);
    $('#tmBulkNewTag').val(candidate.tag);
    $('#tmBulkTargetSummary').text(
        candidate.unique + '/' + bulkModifyContext.analysis.selected + ' ' + UILANG.m('unique matches') +
        ' · ' + candidate.missing + ' ' + UILANG.m('missing') +
        ' · ' + candidate.ambiguous + ' ' + UILANG.m('ambiguous') +
        ' · ' + candidate.assignmentVariants + ' ' + UILANG.m('assignment variants')
    );
    const assignedTests = candidate.assignedTests || [];
    $('#tmBulkCurrentTests').text(
        assignedTests.length
            ? assignedTests.length + ' ' + (assignedTests.length === 1 ? UILANG.m('test found') : UILANG.m('tests found'))
            : UILANG.m('No connected tests found')
    ).prop('disabled', assignedTests.length === 0);
    if (bulkModifyContext.analysis.kind === 'student') {
        $('#tmBulkPasswordSummary').text(
            (candidate.passwordRequired || 0) + ' ' + UILANG.m('currently require a password') +
            ' · ' + (candidate.passwordNotRequired || 0) + ' ' + UILANG.m('do not require one')
        );
    }
}

function updateBulkAssignmentControls() {
    const modeValue = $('#tmBulkAssignmentMode').val();
    $('#tmBulkTestControls').toggleClass('is-inactive', modeValue === 'keep')
        .attr('aria-hidden', modeValue === 'keep');
    $('#tmBulkTestControls button').prop('disabled', modeValue === 'keep');
    if (modeValue !== 'keep') {
        $('#tmBulkModifyTestsSummary').prop('disabled', (wizardData.structure[1] || []).length === 0);
    }
    $('#tmBulkDestructiveNote').toggleClass('is-inactive', modeValue !== 'remove' && modeValue !== 'replace')
        .attr('aria-hidden', modeValue !== 'remove' && modeValue !== 'replace');
}

function updateBulkPasswordControls() {
    const passwordMode = $('#tmBulkPasswordMode').val();
    $('#tmBulkNewPassword').prop('disabled', passwordMode !== 'set')
        .toggleClass('is-inactive', passwordMode !== 'set');
}

function showBulkSelectedTests() {
    const tests = (wizardData.structure[1] || []).slice();
    if (!tests.length) return;
    showBulkTestList(UILANG.m('Selected tests'), tests);
}

function showBulkFoundTests() {
    if (!bulkModifyContext) return;
    const candidate = bulkModifyContext.analysis.candidates[Number($('#tmBulkTarget').val())];
    const tests = candidate && candidate.assignedTests ? candidate.assignedTests : [];
    if (!tests.length) return;
    showBulkTestList(UILANG.m('Tests currently found'), tests);
}

function bulkTestType(test) {
    const candidates = [test.type, test.testType, test.testStructure];
    for (let type of candidates) {
        if (typeof type === 'string' && type.trim().charAt(0) === '{') {
            try {
                type = JSON.parse(type).type;
            } catch (_error) {
                type = null;
            }
        } else if (type && typeof type === 'object') {
            type = type.type || type.id;
        }
        if (['linear', 'fluid', 'mutation'].includes(type)) return type;
    }
    return 'linear';
}

function showBulkTestList(title, tests) {
    const list = $('<div/>', {'class': 'tmBulkSelectedTestsList'});
    tests.forEach(function(test) {
        const testId = test.hiddenID || test.id;
        const testType = bulkTestType(test);
        $('<div/>', {'class': 'tmBulkSelectedTest'}).append(
            $('<img/>', {
                'class': 'tmBulkSelectedTestIcon',
                src: '../inc/filer/images/test' + testType.charAt(0).toUpperCase() + testType.slice(1) + '.png',
                alt: ''
            }),
            $('<strong/>', {text: test.name || UILANG.m('Test')}),
            $('<span/>', {text: 'ID ' + testId})
        ).appendTo(list);
    });
    const holderId = 'tmBulkSelectedTestsContent';
    $('#' + holderId).remove();
    list.attr('id', holderId).appendTo('body').hide();
    new nxDialog('bulkSelectedTestsDialog', {
        buttons: [{
            label: UILANG.m('Close'), 'default': true, cancel: true, value: 'close'
        }],
        contentId: holderId,
        title: title,
        width: 480
    });
}

function bulkExistingDialogCallback(button) {
    if (button === 'cancel') {
        mode = 'browsing';
        bulkModifyContext = null;
        selHasStudent = false;
        return;
    }
    if (button !== 'preview' || !bulkModifyContext) return;
    const candidate = bulkModifyContext.analysis.candidates[Number($('#tmBulkTarget').val())];
    const newName = String($('#tmBulkNewName').val() || '').trim();
    const newTag = String($('#tmBulkNewTag').val() || '').trim();
    const assignmentMode = $('#tmBulkAssignmentMode').val();
    const passwordMode = bulkModifyContext.analysis.kind === 'student' ? $('#tmBulkPasswordMode').val() : 'keep';
    const newPassword = bulkModifyContext.analysis.kind === 'student'
        ? String($('#tmBulkNewPassword').val() || '').trim()
        : '';
    if (!candidate || !newName) {
        mode = 'browsing';
        showMessage(UILANG.m('Please select an entry and enter its new name.'));
        return;
    }
    if (candidate.ambiguous > 0) {
        mode = 'browsing';
        showMessage(bulkModifyContext.analysis.kind === 'student'
            ? UILANG.m('This label is ambiguous for one or more selected test takers and cannot be modified in bulk.')
            : UILANG.m('This password is ambiguous for one or more selected test takers and cannot be modified in bulk.'));
        return;
    }
    if (passwordMode === 'set' && !newPassword) {
        mode = 'browsing';
        showMessage(UILANG.m('Please enter the new password for the selected labels.'));
        return;
    }
    if (assignmentMode !== 'keep' && wizardData.structure[1].length === 0 && assignmentMode !== 'replace') {
        mode = 'browsing';
        showMessage(UILANG.m('Please choose at least one test for this assignment operation.'));
        return;
    }
    bulkModifyContext.request = {
        phase: 'preview',
        selection: bulkModifyContext.selection,
        matchName: candidate.name,
        matchTag: candidate.tag,
        newName: newName,
        newTag: newTag,
        passwordMode: passwordMode,
        newPassword: newPassword,
        assignmentMode: assignmentMode,
        structure: wizardData.structure[1] || [],
        pid: loc.folder
    };
    mode = 'browsing';
    startAjax('bulkModifyExisting', bulkModifyContext.request).then(function(res) {
        if (res.error !== false || !res.bulkPreview) {
            bulkModifyContext = null;
            return;
        }
        showBulkExistingPreview(res.bulkPreview);
    });
}

function showBulkExistingPreview(preview) {
    const destructive = preview.affectedActivity > 0 || preview.affectedScoring > 0;
    const entryPlural = bulkModifyContext && bulkModifyContext.analysis.kind === 'student'
        ? UILANG.m('Labels to update')
        : UILANG.m('Passwords to update');
    const missingEntryLabel = bulkModifyContext && bulkModifyContext.analysis.kind === 'student'
        ? UILANG.m('Selected test takers without this label')
        : UILANG.m('Selected test takers without this password');
    let contents =
        '<div class="tmActionConfirm ' + (destructive ? 'tmActionConfirm-warning' : '') + '">' +
            '<strong>' + UILANG.m('Bulk modification preview') + '</strong>' +
            '<div class="tmActionConfirmMeta"><span>' + entryPlural + '</span><strong>' + preview.matched + '</strong></div>' +
            '<div class="tmActionConfirmMeta"><span>' + missingEntryLabel + '</span><strong>' + preview.missing + '</strong></div>';
    if (preview.passwordsChanged > 0) {
        contents += '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Label passwords changed') + '</span><strong>' + preview.passwordsChanged + '</strong></div>';
    }
    contents += '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Test assignments removed') + '</span><strong>' + preview.removedAssignments + '</strong></div>';
    if (destructive) {
        contents +=
            '<span>' + UILANG.m('This operation removes linked result data and cannot be undone.') + '</span>' +
            '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Activity records affected') + '</span><strong>' + preview.affectedActivity + '</strong></div>' +
            '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Scoring records affected') + '</span><strong>' + preview.affectedScoring + '</strong></div>';
    }
    contents += '</div>';
    new nxDialog('bulkModifyExistingPreview', {
        buttons: [{
            label: UILANG.m('Cancel'), cancel: true, value: 'cancel'
        }, {
            label: destructive ? UILANG.m('Apply and remove data') : UILANG.m('Apply changes'),
            'default': true,
            value: 'apply'
        }],
        contents: contents,
        width: 540,
        callback: function(button) {
            if (button !== 'apply' || !bulkModifyContext) {
                mode = 'browsing';
                bulkModifyContext = null;
                selHasStudent = false;
                return;
            }
            const request = Object.assign({}, bulkModifyContext.request, {
                phase: 'apply',
                confirmDestructive: destructive
            });
            startAjax('bulkModifyExisting', request).then(function(res) {
                if (res.error !== false) bulkModifyContext = null;
            });
        },
        title: UILANG.m('Confirm bulk modification'),
        type: destructive ? 'warning' : undefined
    });
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
                    const message = '<div class="tmActionConfirm tmActionConfirm-warning">' +
                        '<strong>' + UILANG.m('Selection cannot be edited together') + '</strong>' +
                        '<span>' + UILANG.m('Bulk editing is only possible when all selected logins are of the same type.') + '</span>' +
                        '<p class="tmActionConfirmNote">' + UILANG.m('Select either standard logins or student logins, then try again.') + '</p>' +
                    '</div>';
                    new nxDialog('mixedLoginSelectionWarning', {
                        buttons: [{
                            label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
                        }],
                        contents: message,
                        width: 500,
                        title: UILANG.m('Selection warning'),
                        type: 'warning'
                    });
                } else {
                    openBulkSelectionMode(hasStudent);
                }
            } else {
                mode = 'wizard';
                // The regular creation wizard always creates standard logins and
                // must not inherit the previous bulk-selection login type.
                selHasStudent = false;
                switchMode();
                buildWizard();
                hideMenu();
                hideSection(gui.s1, [gui.s4, gui.s5, gui.s6]);
            }
    }
}

function enterFileWizard() {
    const dHtml =
        '<div class="csvImportChoiceDialog">' +
            '<div class="csvImportChoiceIntro">' +
                '<strong>' + UILANG.m('Choose import type') + '</strong>' +
                '<span>' + UILANG.m('Please choose the type of logins you want to import:') + '</span>' +
            '</div>' +
            '<div class="csv-button-wrapper">' +
                '<div class="csv-button-container">' +
                    '<button id="import-csv-standard" class="csv-button">' +
                        '<strong>' + UILANG.m('Standard logins') + '</strong>' +
                        '<span>' + UILANG.m('Passwords and assigned tests') + '</span>' +
                    '</button>' +
                    '<button id="upload-csv-student" class="csv-button">' +
                        '<strong>' + UILANG.m('Student logins') + '</strong>' +
                        '<span>' + UILANG.m('Authentication, labels and assigned tests') + '</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    let dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
        }],
        contents: dHtml,
        title: UILANG.m('Import CSV'),
        width: 620
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

function buildCsvFormatErrorMessage(fileName) {
    const requiredFields = fileWizardType === 'student'
        ? ['testtaker', 'authentication', 'password', 'label', 'tag', 'test-id', 'subfolder', 'displayname']
        : ['testtaker', 'password', 'tag', 'test-id', 'subfolder', 'displayname'];
    return '<div class="csvImportFormatError">' +
        '<strong>' + UILANG.m('CSV format not recognized') + '</strong>' +
        '<p>' + sf(UILANG.m('The file "%@" does not match the expected CSV structure.'), escapeHtml(fileName)) + '</p>' +
        '<div class="csvImportFormatBlock">' +
            '<span>' + UILANG.m('Check the first row') + '</span>' +
            '<code>' + requiredFields.join(', ') + '</code>' +
        '</div>' +
        '<ul>' +
            '<li>' + UILANG.m('Use comma or semicolon as field separator.') + '</li>' +
            '<li>' + UILANG.m('Optional meta tags may be added with metakeyX/metavalueX columns.') + '</li>' +
            '<li>' + UILANG.m('Refer to the example file in the application for guidance.') + '</li>' +
        '</ul>' +
    '</div>';
}

/* Create from CSV */
function buildFileWizard() {

    $('#infomsg').empty();
    let csvText1, csvText2, csvText3, csvText4, csvText5, csvText6, csvText7, csvText8, csvText9, csvText10, loginTypeHtml, loginTypeTitle, csvInfoTitle, csvInfoItems, csvExample;

    if (fileWizardType === 'student') {
        csvInfoTitle = UILANG.m('CSV-File structure for student logins:');
        csvText1 = UILANG.m('The CSV-file for importing student logins (direct password, SAML or LDAP) and their labels & assigned tests into the database needs the following format:');
        csvText2 = UILANG.m('the first line contains the key names: testtaker, authentication, password, label, tag, test-id, subfolder and displayname');
        csvText3 = UILANG.m('field separators can be "," or ";"');
        csvText4 = UILANG.m('the password field is required only when the authentication method is set to "direct." If left blank, the system will generate a password for direct login.');
        csvText5 = UILANG.m('a data line must have the name of the test taker, authentification type, a password (for authentification direct password), a label to be shown in the dashboard for the student login, the tag of the label and the ID(s) of the assigned test(s) for this label. The IDs of the tests can be found at the top of the properties box in the test manager');
        csvText6 = UILANG.m('to assign more than one test to a label, use \\ as separator');
        csvText7 = UILANG.m('in the field subfolder you can specify a subfolder or subfolder path (\\ as separator). Your defined path will be created in your current folder.');
        csvText8 = UILANG.m('you can enter the name of the test taker in the column displayname (optional)');
        csvText9 = UILANG.m('you can specify meta tags (optional) for the test takers. Use metakey1/metavalue1 columns for key-value tags. To add a single tag without a value, use a single column named metatag2 or singletag2; the cell value itself becomes the tag. A metakey column at the end of the file without a matching metavalue column is also imported as a single tag.');
        csvText10 = 'testtaker,authentication,password,label,tag,test-id,subfolder,displayname,metakey1,metavalue1,metatag2,metakey3,metavalue3<br />Student1,direct,jghu7667f,German test,,3219\\3220\\3221,,Anne Muller,School,CLN,NeedsReview,Teacher,"Miller, Glenn"<br />Student2,SAML,,English test,,3179,folder1,Luc Wagner,School,CLN,NeedsReview,Teacher,"Miller, Glenn"<br />Student3,LDAP,,Maths test,,3183\\3967,folder1\\subfolder1,Sophie Schmit,School,ABC,Remote,Teacher,"Smith, Adrian"';

        csvInfoItems = [csvText2, csvText3, csvText4, csvText5, csvText6, csvText7, csvText8, csvText9];
        csvExample = csvText10;
        loginTypeHtml = studentLoginHtml;
        loginTypeTitle = studentLoginTitle;
    } else {
        csvInfoTitle = UILANG.m('CSV-File structure for standard logins:');
        csvText1 = UILANG.m('The CSV-file for importing standard logins and their passwords & assigned tests into the database needs the following format:');
        csvText2 = UILANG.m('the first line contains the key names: testtaker, password, tag, test-id, subfolder and displayname');
        csvText3 = UILANG.m('field separators can be "," or ";"');
        csvText4 = UILANG.m('a data line must have the name of the test taker, a password, the tag of the password and the ID(s) of the assigned test(s) for the password. The IDs of the tests can be found at the top of the properties box in the test manager');
        csvText5 = UILANG.m('to assign more than one test to a password, use \\ as separator');
        csvText6 = UILANG.m('in the field subfolder you can specify a subfolder or subfolder path (\\ as separator). Your defined path will be created in your current folder.');
        csvText7 = UILANG.m('you can enter the name of the test taker in the column displayname (optional)');
        csvText8 = UILANG.m('you can specify meta tags (optional) for the test takers. Use metakey1/metavalue1 columns for key-value tags. To add a single tag without a value, use a single column named metatag2 or singletag2; the cell value itself becomes the tag. A metakey column at the end of the file without a matching metavalue column is also imported as a single tag.');
        csvText9 = 'testtaker,password,tag,test-id,subfolder,displayname,metakey1,metavalue1,metatag2,metakey3,metavalue3<br />Student1,ffgthg,,3219\\3220\\3221,,Anne Muller,School,CLN,NeedsReview,Teacher,"Miller, Glenn"<br />Student2,ertfgd,,3179,folder1,Luc Wagner,School,CLN,NeedsReview,Teacher,"Miller, Glenn"<br />Student3,eewwsd,,3183\\3967,folder1\\subfolder1,Sophie Schmit,School,ABC,Remote,Teacher,"Smith, Adrian"';

        csvInfoItems = [csvText2, csvText3, csvText4, csvText5, csvText6, csvText7, csvText8];
        csvExample = csvText9;
        loginTypeHtml = standardLoginHtml;
        loginTypeTitle = standardLoginTitle;
    }

    $('#infomsg').html(
        '<div class="csvImportInfoCard">' +
            '<div class="csvImportInfoHeader">' +
                '<strong>' + csvInfoTitle + '</strong><span id="loginTypeHelp"></span>' +
            '</div>' +
            '<div class="csvImportIntro">' + csvText1 + '</div>' +
            '<ul id="csvMsg" class="csvImportRules"><li>' + csvInfoItems.join('</li><li>') + '</li></ul>' +
            '<div class="csvImportExample">' +
                '<div class="csvImportExampleContent">' +
                    '<strong>' + UILANG.m('Example CSV-file:') + '</strong>' +
                    '<div class="csvImportExampleText">' + csvExample + '</div>' +
                '</div>' +
                '<div class="csvImportExampleAction"><div id="exFileButton"></div></div>' +
            '</div>' +
        '</div>'
    );

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
    $('#uploadZone').css('display', 'grid');
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
        for (let k = metaStart; k < d[0].length; k++) {
            const v = d[0][k];
            metaSet++;
            if (v === 'metakey' + metaSet) {
                if (k + 1 < d[0].length && d[0][k + 1] !== 'metavalue' + metaSet) {
                    showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('Keyline field %@ has wrong identifier "%@". Expected:"metavalue%@"'), k + 2, d[0][k + 1], metaSet));
                    x = false;
                    break;
                }
                if (k + 1 < d[0].length) k++;
            } else if (v !== 'metatag' + metaSet && v !== 'singletag' + metaSet) {
                showMessage(sf('<strong>' + UILANG.m('ERROR in import-file:') + '</strong><br />' + UILANG.m('Keyline field %@ has wrong identifier "%@". Expected:"metakey%@"'), k + 1, v, metaSet));
                x = false;
                break;
            }
        }
        return x;
    }

    function normalizeCsvMetaTags(d) {
        let metaStart = fileWizardType === 'student' ? 8 : 6;
        const header = d[0];
        if (header.length <= metaStart) return d;
        const normalized = d.map(row => row.slice(0, metaStart));
        let metaSet = 0;
        for (let k = metaStart; k < header.length; k++) {
            metaSet++;
            const isPair = header[k] === 'metakey' + metaSet && header[k + 1] === 'metavalue' + metaSet;
            normalized[0].push('metakey' + metaSet, 'metavalue' + metaSet);
            for (let rowIndex = 1; rowIndex < d.length; rowIndex++) {
                normalized[rowIndex].push(d[rowIndex][k] || '', isPair ? (d[rowIndex][k + 1] || '') : '');
            }
            if (isPair) k++;
        }
        return normalized;
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
                    regex = /[^\w .(){}\[\]-]/ig;
                    if (v[0].match(regex)) {
                        ttShowInvalidCharacters(v[0].match(regex), true, sf(UILANG.m('CSV line %@, field %@'), line, 1), true);
                        x = false;
                        return false;
                    }

                    //check for non-allowed chars in test taker fields (passwords)
                    regex = /[^\w.(){}\[\]-]/ig;
                    if (v[passwordIndex].match(regex)) {
                        ttShowInvalidCharacters(v[passwordIndex].match(regex), false, sf(UILANG.m('CSV line %@, password field %@'), line, passwordIndex + 1), true);
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
        showMessage(buildCsvFormatErrorMessage(name));
        resetCff();
        return;
    }

    if (data.length <= 1) {
        showMessage(sf(
            UILANG.m('ERROR: The file "%@" contains only the header row. Please add at least one test taker line and try again.'),
            name
        ));
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
    data = normalizeCsvMetaTags(data);
    parseFile(name, data, readData);
}

function parseFile(name, data) {

    cffName = name;
    cffData = data;

    const infoZone = $('#infoZone');
    infoZone.show();
    infoZone.empty();
    const dataLines = data.length - 1;
    infoZone.append(
        '<div class="infoZoneMsg">' +
            '<strong>' + UILANG.m('CSV file ready') + '</strong>' +
            '<span>' + UILANG.m('The data from your file') + ' "' + escapeHtml(name) + '" ' + UILANG.m('is ready to be imported. 1 headerline and') + ' ' + dataLines + ' ' + UILANG.m('data-lines have been read.') + '</span>' +
        '</div>'
    );

    const table = $("<table class='csvResults' />");

    $.each(data, function (k, v) {
        let row = $("<tr />");
        $.each(v, function (key, val) {
            let cell = $("<td />");
            const isSingleTagValue = key > 0 && data[0][key] && /^metavalue\d+$/.test(data[0][key]) && val === '' && v[key - 1] !== '';
            cell.html(isSingleTagValue ? '<span class="csvSingleTag">' + UILANG.m('single tag') + '</span>' : escapeHtml(val));
            row.append(cell);
        });
        table.append(row);
    });

    infoZone.append($('<div class="csvResultsFrame" />').append(table));

    buttons.saveFromFile.enable();
    buttons.resetCffWizard.enable();
    cffData.shift();
}

function createFromFile(sender, button) {

    if (!button) {
        const message = sf(
            '<div class="tmActionConfirm csvImportConfirm">' +
                '<strong>' + UILANG.m('Ready to import') + '</strong>' +
                '<span>' + UILANG.m('The CSV data is ready to be imported.') + '</span>' +
                '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Folder') + '</span><strong>"%@"</strong></div>' +
            '</div>',
            filerPath
        );

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
            type: 'warning'
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
            ttRestoreEditSections();
            gui.s2.show();
            gui.s3.show();
            if (serverData.testLevel && String(serverData.testLevel.id) === String(selection[0].dbId)) {
                fillDataFields('editTest');
            }
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
            contents: '<div class="tmActionConfirm tmActionConfirm-warning">' +
                '<strong>' + UILANG.m('Close without saving?') + '</strong>' +
                '<span>' + UILANG.m('Your current wizard changes will be discarded.') + '</span>' +
            '</div>',
            title: UILANG.m('Abort wizard'),
            returnPromise: true,
            width: 400,
            type: 'warning'
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

function refreshTestTakerLibraryForBrowsing(selectId, options) {
    if (!loc || !loc.folder) return;
    options = options || {};
    const payload = {
        location: loc.folder,
        rebuild: true,
        showBlocked: showBlocked
    };
    if (options.noSelection) {
        selection = [];
        serverData.testLevel = null;
        refreshPreviewAfterLibraryForTesteeId = null;
        if (gui.library && typeof gui.library.clearSelection === 'function') {
            gui.library.clearSelection();
        }
    }
    const selectedId = options.noSelection ? null : (selectId || (serverData.testLevel && serverData.testLevel.id ? 't' + serverData.testLevel.id : (selection[0] && selection[0].id)));
    if (selectedId) payload.select = selectedId;
    if (options.suppressPreviewPlausibility && selectedId) {
        armBrowsePreviewRefresh(selectedId);
    }
    preserveLibraryScrollOnNextSelection = options.preserveScroll === true;
    startAjax('fetchLibrary', payload);
}

function abortEditing() {
    switch (mode) {
        case 'editTest':
            const selectedTesteeId = serverData.testLevel && serverData.testLevel.id ? 't' + serverData.testLevel.id : (selection[0] && selection[0].id);
            armBrowsePreviewRefresh(selectedTesteeId);
            gui.metaView.lock('greyout');
            $('#passwords').scrollTop(0);
            $('#assignedTests').scrollTop(0);
            $('#metaTags').scrollTop(0);
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
                refreshTestTakerLibraryForBrowsing(null, {
                    suppressPreviewPlausibility: true,
                    preserveScroll: true
                });
                refreshPreviewAfterLibraryForTesteeId = null;
                reloadBrowsePreviewForTestee(selectedTesteeId);
            });
            break;
        case 'wizard':
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
                wizardData.prefix = '';
                wizardData.suffix = '';
                refreshTestTakerLibraryForBrowsing(null, {
                    noSelection: true
                });
            });
            break;
        case 'add2selected':
            const wizardReturnTesteeId = serverData.testLevel && serverData.testLevel.id ? 't' + serverData.testLevel.id : (selection[0] && selection[0].id);
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
                wizardData.prefix = '';
                wizardData.suffix = '';
                refreshTestTakerLibraryForBrowsing(wizardReturnTesteeId, {
                    suppressPreviewPlausibility: true,
                    preserveScroll: true
                });
            });
            break;
        case 'fileWizard':
            showMenu();
            showSection(gui.s1, [gui.s2, gui.s3], function () {
                mode = 'browsing';
                switchMode();
                refreshTestTakerLibraryForBrowsing(null, {
                    noSelection: true
                });
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

function ttPCheckSuccessHtml(intro, checks) {
    return '<div class="pCheckSuccessDiv"><h3>' + UILANG.m('Plausibility check completed successfully!') + '</h3><p>' + intro + '</p><ul class="pCheckUl">' + checks.map(function(check) {
        return '<li><img alt="" src="../images/ok.png" height="15px;" />&nbsp;' + check + '</li>';
    }).join('') + '</ul></div>';
}

function updateMetaTagCounter(selector, count) {
    const label = count === 1 ? UILANG.m('meta tag') : UILANG.m('meta tags');
    $(selector).html(count + ' ' + label);
}

function ttPreviewEscape(value) {
    if (value === null || typeof value === 'undefined') return '';
    return $('<div>').text(String(value)).html();
}

function ttPreviewIsStudentLogin(login) {
    return ['directPass', 'LDAP', 'SAML'].includes(login && login.loginType);
}

function ttEditTesteeLabel(login, selectedItem) {
    if ((login && login.template === 'template') || (selectedItem && selectedItem.type === 'template')) {
        return UILANG.m('Edit template');
    }
    if (ttPreviewIsStudentLogin(login)) {
        return UILANG.m('Edit student login');
    }
    return UILANG.m('Edit test taker');
}

function ttPreviewLoginTypeInfo(login) {
    const template = login && login.template;
    if (template === 'template') {
        return {label: UILANG.m('Test taker template'), icon: '../inc/filer/images/template.png', typeClass: 'template'};
    }
    if (template === 'cloned') {
        return {label: UILANG.m('Cloned from template'), icon: '../inc/filer/images/testee.png', typeClass: 'cloned'};
    }
    switch (login && login.loginType) {
        case 'directPass':
            return {label: UILANG.m('Student login (Password)'), icon: '../inc/filer/images/testTaker_DP.png', typeClass: 'direct'};
        case 'LDAP':
            return {label: UILANG.m('Student login (LDAP)'), icon: '../inc/filer/images/testTaker_LDAP.png', typeClass: 'ldap'};
        case 'SAML':
            return {label: UILANG.m('Student login (SAML)'), icon: '../inc/filer/images/testTaker_IAM.png', typeClass: 'saml'};
        default:
            return {label: UILANG.m('Standard login'), icon: '../inc/filer/images/testee.png', typeClass: 'standard'};
    }
}

function ttPreviewBoolIcon(value, label) {
    const state = value === true || value === 'true' || value === 1 || value === '1';
    return '<span class="tmPreviewBool ' + (state ? 'is-yes' : 'is-no') + '">' +
        '<img src="../images/' + state + '.png" alt="" />' +
        '<span>' + ttPreviewEscape(label || (state ? UILANG.m('Yes') : UILANG.m('No'))) + '</span>' +
        '</span>';
}

function ttPreviewFormatSqlDateTime(value) {
    if (!value) return UILANG.m('Not available');
    if (typeof value !== 'string') return ttPreviewEscape(value);
    const normalized = value.replace('T', ' ');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
    if (match) {
        return match[3] + '.' + match[2] + '.' + match[1] + ' ' + match[4] + ':' + (match[5] || '00');
    }
    return ttPreviewEscape(value);
}

function ttPreviewPasswordTitle(password, index) {
    if (ttPreviewIsStudentLogin(serverData.testLevel)) {
        return password.label || (UILANG.m('Label') + ' ' + (index + 1));
    }
    return password.name || ('#' + password.id);
}

function ttPreviewPasswordSubline(password) {
    const parts = [];
    if (!ttPreviewIsStudentLogin(serverData.testLevel) && password.tag) parts.push(password.tag);
    if (ttPreviewIsStudentLogin(serverData.testLevel) && password.tag) parts.push(password.tag);
    if (ttPreviewIsStudentLogin(serverData.testLevel) && password.metadata && password.metadata.pwReq === true) {
        parts.push(UILANG.m('Password required'));
    }
    return parts.join(' | ');
}

function ttPasswordListBadges(item) {
    if (item && item.metadata && item.metadata.pwReq === true) {
        return '<span class="ttPasswordActiveIcon" title="' + escapeHtml(UILANG.m('Password active')) + '">P</span>';
    }
    return '';
}

function ttPreparePasswordListItems(items) {
    if (!Array.isArray(items)) return items;
    items.forEach((item) => {
        if (!item) return;
        item.listBadges = ttPasswordListBadges(item);
    });
    return items;
}

function ttPreviewSettingsCard() {
    const login = serverData.testLevel;
    const typeInfo = ttPreviewLoginTypeInfo(login);
    const displayName = login.displayName ? login.displayName : UILANG.m('- No display name -');
    const directPass = login.loginType === 'directPass' ? /* html */ `
        <div class="tmPreviewSetting"><span>${UILANG.m('Direct password')}</span><strong>${ttPreviewEscape(login.password || UILANG.m('Not set'))}</strong></div>
    ` : '';
    return /* html */ `
        <section class="tmPreviewCard">
            <h3>${UILANG.m('Login')}</h3>
            <div class="tmPreviewSettingGrid">
                <div class="tmPreviewSetting"><span>${UILANG.m('Test taker name')}</span><strong>${ttPreviewEscape(login.name)}</strong></div>
                <div class="tmPreviewSetting"><span>${UILANG.m('Type of password')}</span><strong>${ttPreviewEscape(typeInfo.label)}</strong></div>
                <div class="tmPreviewSetting"><span>${UILANG.m('Display name')}</span><strong>${ttPreviewEscape(displayName)}</strong></div>
                ${directPass}
            </div>
        </section>
    `;
}

function ttPreviewSpecialConditionsCard() {
    const overrides = serverData.testLevel.overrides || {};
    const rows = [];
    if (overrides.disableTimer === true) rows.push([UILANG.m('Disable Timer'), ttPreviewBoolIcon(true), true]);
    if (overrides.disableTimer !== true && Number(overrides.additionalTime || 0) > 0) rows.push([UILANG.m('Additional time (%)'), Number(overrides.additionalTime || 0), false]);
    if (overrides.disableSaving === true) rows.push([UILANG.m('Disable saving'), ttPreviewBoolIcon(true), true]);
    if (overrides.allowNavigation === true) rows.push([UILANG.m('Disable navigation limitation'), ttPreviewBoolIcon(true), true]);
    if (overrides.demoMode === true) rows.push([UILANG.m('Demo Mode'), ttPreviewBoolIcon(true), true]);
    if (overrides.loginForwarding === true) {
        rows.push([UILANG.m('Forward login to other OASYS'), ttPreviewBoolIcon(true), true]);
        rows.push([UILANG.m('Forward URL'), overrides.forwardUrl || UILANG.m('Not set'), false]);
    }
    const body = rows.length ? rows.map(row => /* html */ `
        <div class="tmPreviewSetting"><span>${ttPreviewEscape(row[0])}</span><strong>${row[2] ? row[1] : ttPreviewEscape(row[1])}</strong></div>
    `).join('') : `<div class="tmPreviewEmpty">${UILANG.m('No special conditions active.')}</div>`;
    return /* html */ `
        <section class="tmPreviewCard">
            <h3>${UILANG.m('Special conditions')}</h3>
            <div class="tmPreviewSettingGrid">${body}</div>
        </section>
    `;
}

function ttPreviewMetaTagsCard() {
    const mtags = serverData.testLevel.metatags || {};
    const keys = Object.keys(mtags).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
    const body = keys.length ? keys.map(key => {
        const single = mtags[key] === '';
        return /* html */ `
            <div><span>${ttPreviewEscape(key)}</span><strong class="${single ? 'tmPreviewSingleTag' : ''}">${ttPreviewEscape(single ? UILANG.m('single tag') : mtags[key])}</strong></div>
        `;
    }).join('') : `<div class="tmPreviewEmpty ttPreviewSingleLine">${UILANG.m('No meta tags defined.')}</div>`;
    return /* html */ `
        <section class="tmPreviewCard">
            <h3>${UILANG.m('Meta tags')}</h3>
            <div class="tmPreviewMetaTags">${body}</div>
        </section>
    `;
}

function ttPreviewPlausibilityCard() {
    const student = ttPreviewIsStudentLogin(serverData.testLevel);
    if (!previewPlausibilityResult) {
        return /* html */ `
            <section class="tmPreviewCard"><h3>${UILANG.m('Plausibility check')}</h3><div class="tmPreviewCheckPending">${UILANG.m('Checking...')}</div></section>
        `;
    }
    if (previewPlausibilityResult.skipped === true) {
        return /* html */ `
            <section class="tmPreviewCard"><h3>${UILANG.m('Plausibility check')}</h3><div class="tmPreviewCheckPending">${UILANG.m('Not checked automatically.')}</div></section>
        `;
    }
    const issues = [];
    if (previewPlausibilityResult.noPws) {
        issues.push(student ? UILANG.m('No labels have been created for this test taker yet!') : UILANG.m('No passwords have been created for this test taker yet!'));
    }
    if (previewPlausibilityResult.pwsWithoutTests) {
        issues.push(student ? UILANG.m('There are labels where no tests have been assigned!') : UILANG.m('There are passwords where no tests have been assigned!'));
    }
    if (previewPlausibilityResult.pwsWithDeletedTests) {
        issues.push(UILANG.m('One or more assigned tests are not available anymore!'));
    }
    const body = issues.length ? `<div class="tmPreviewIssueList">${issues.map(issue => /* html */ `
        <div class="tmPreviewIssue is-warning"><strong>${UILANG.m('Warning')}</strong><span>${ttPreviewEscape(issue)}</span></div>
    `).join('')}</div>` : '<div class="tmPreviewCheckOk"><strong>' + UILANG.m('Plausibility check completed successfully!') + '</strong></div>';
    return /* html */ `<section class="tmPreviewCard"><h3>${UILANG.m('Plausibility check')}</h3>${body}</section>`;
}

function ttPreviewAssignmentsCard() {
    const passwords = serverData.testLevel.passwords || [];
    const label = ttPreviewIsStudentLogin(serverData.testLevel) ? UILANG.m('Labels and connected tests') : UILANG.m('Passwords and connected tests');
    const body = passwords.length ? passwords.map((password, index) => {
        const tests = Array.isArray(password.structureResolved) ? password.structureResolved : [];
        const subline = ttPreviewPasswordSubline(password);
        const testRows = tests.length ? tests.map((test, tIndex) => {
            const testType = bulkTestType(test);
            const typeLabel = {
                linear: UILANG.m('Linear test'),
                fluid: UILANG.m('Fluid test'),
                mutation: UILANG.m('Mutation test')
            }[testType];
            const typeIcon = test.removed ? '' : /* html */ `
                <img class="ttPreviewTestTypeIcon" src="../inc/filer/images/test${testType.charAt(0).toUpperCase() + testType.slice(1)}.png" alt="" title="${ttPreviewEscape(typeLabel)}" />
            `;
            return /* html */ `
            <div class="tmPreviewStructureRow ttPreviewAssignmentTestRow ${test.removed ? 'is-removed' : ''}">
                <div class="tmPreviewStructureNo">${tIndex + 1}</div>
                <div class="tmPreviewStructureMain">
                    <strong>${ttPreviewEscape(test.name || UILANG.m('Test has been deleted!'))}</strong>
                    <span>ID: ${ttPreviewEscape(test.id || '')}</span>
                </div>
                <div class="tmPreviewStructureScore">${test.removed ? UILANG.m('missing') : typeIcon}</div>
            </div>
        `;
        }).join('') : `<div class="tmPreviewEmpty">${UILANG.m('No test assigned yet.')}</div>`;
        return /* html */ `
            <div class="ttPreviewPassGroup">
                <div class="ttPreviewPassHeader">
                    <div><strong>${ttPreviewEscape(ttPreviewPasswordTitle(password, index))}</strong>${subline ? `<span>${ttPreviewEscape(subline)}</span>` : ''}</div>
                    <em>ID: ${ttPreviewEscape(password.id)}</em>
                </div>
                <div class="ttPreviewPassTests">${testRows}</div>
            </div>
        `;
    }).join('') : `<div class="tmPreviewEmpty">${ttPreviewIsStudentLogin(serverData.testLevel) ? UILANG.m('No labels have been created for this test taker yet!') : UILANG.m('No passwords have been created for this test taker yet!')}</div>`;
    return /* html */ `
        <section class="tmPreviewCard ttPreviewAssignmentCard">
            <h3>${label}</h3>
            <div class="ttPreviewAssignmentList">${body}</div>
        </section>
    `;
}

function ttPreviewProgressBar(value) {
    const val = Math.max(0, Math.min(100, Number(value) || 0));
    return /* html */ `
        <div class="tmResultMiniProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}" aria-label="${UILANG.m('Progress')}">
            <div class="tmResultMiniProgressFill" style="width:${val}%"></div>
            <div class="tmResultMiniProgressLabel">${val}%</div>
        </div>
    `;
}

function ttPreviewResultTestsCard() {
    const stats = serverData.testLevel.previewResultStats || {};
    const tests = Array.isArray(stats.resultTests) ? stats.resultTests : [];
    const isTemplate = serverData.testLevel && serverData.testLevel.template === 'template';
    const body = tests.length ? tests.map(test => {
        const passwords = !isTemplate && Array.isArray(test.passwords) ? test.passwords.join(', ') : '';
        const datasetCount = Number(test.datasetCount || 0);
        const datasets = isTemplate ? ` | ${datasetCount} ${datasetCount === 1 ? UILANG.m('dataset') : UILANG.m('datasets')}` : '';
        const progressValue = isTemplate ? test.avgProgress : test.maxProgress;
        const deletedHint = isTemplate && test.deletedFromTemplate
            ? `<span class="ttPreviewTemplateHint">${UILANG.m('Test removed from template')}</span>`
            : '';
        return /* html */ `
            <div class="ttPreviewResultRow">
                <div class="ttPreviewResultMain">
                    <strong>${ttPreviewEscape(test.testName || UILANG.m('Test has been deleted!'))}</strong>
                    <span>ID: ${ttPreviewEscape(test.testId || '')}${passwords ? ' | ' + ttPreviewEscape(passwords) : ''}${datasets}</span>
                    ${deletedHint}
                    <em>${UILANG.m('Last activity')}: ${ttPreviewEscape(ttPreviewFormatSqlDateTime(test.lastActivity))}</em>
                </div>
                <div class="ttPreviewResultProgress">
                    ${isTemplate ? `<div class="ttPreviewProgressCaption">${UILANG.m('Average progress')}</div>` : ''}
                    ${ttPreviewProgressBar(progressValue)}
                </div>
            </div>
        `;
    }).join('') : `<div class="tmPreviewEmpty">${UILANG.m('No results collected yet.')}</div>`;
    return /* html */ `
        <section class="tmPreviewCard ttPreviewResultsCard">
            <h3>${UILANG.m('Results collected')}</h3>
            ${ttPreviewTemplateDatasetSummary()}
            <div class="tmPreviewStructureSummary"><strong>${UILANG.m('Tests with results')}</strong><span>${Number(stats.total_result_tests || tests.length)}</span></div>
            <div class="ttPreviewResultList">${body}</div>
        </section>
    `;
}

function ttPreviewTemplateDatasetSummary() {
    if (!serverData.testLevel || serverData.testLevel.template !== 'template') return '';
    const summary = serverData.testLevel.templateCloneSummary || {};
    return /* html */ `
        <div class="tmPreviewTemplateDatasetSummary">
            <div><span>${UILANG.m('Datasets recorded')}</span><strong>${Number(summary.total || 0)}</strong></div>
            <div><span>${UILANG.m('Completed datasets')}</span><strong>${Number(summary.completed || 0)}</strong></div>
            <div><span>${UILANG.m('Average progress')}</span><strong>${Number(summary.avgProgress || 0)}%</strong></div>
            <div><span>${UILANG.m('Last activity')}</span><strong>${ttPreviewEscape(ttPreviewFormatSqlDateTime(summary.lastActivity))}</strong></div>
        </div>
    `;
}

function ttShowBrowsePreviewSection() {
    gui.s10.insertAfter(gui.s1);
    gui.s2.stop(true, true).addClass('ttPreviewCollapsedSection').hide();
    gui.s3.stop(true, true).addClass('ttPreviewCollapsedSection').hide();
    gui.s10.stop(true, true).removeClass('ttPreviewCollapsedSection').show();
}

function ttRestoreEditSections() {
    gui.s2.stop(true, true).removeClass('ttPreviewCollapsedSection');
    gui.s3.stop(true, true).removeClass('ttPreviewCollapsedSection');
    gui.s10.stop(true, true).hide();
}

function renderTesteePreviewLoading() {
    $('#testeePreviewContent').html('<div class="tmPreviewLoading">' + UILANG.m('Loading preview...') + '</div>');
}

function renderTesteePreview() {
    if (!serverData.testLevel || selection.length !== 1 || !['testee', 'template', 'cloned'].includes(selection[0].type)) {
        $('#testeePreviewContent').html('<div class="tmPreviewBlank">' + UILANG.m('Select a test taker to show the preview.') + '</div>');
        return;
    }
    const login = serverData.testLevel;
    const typeInfo = ttPreviewLoginTypeInfo(login);
    const canEdit = !!(window.permList && permList[selection[0].dbId] && permList[selection[0].dbId].editSelection === true);
    const editLabel = ttEditTesteeLabel(login, selection[0]);
    const editAction = canEdit ? `<button type="button" id="ttPreviewEditButton" class="tmPreviewEditButton">${editLabel}</button>` : `<div class="tmPreviewReadOnly">${UILANG.m('Read only')}</div>`;
    const html = /* html */ `
        <div class="tmPreview ttPreview">
            <div class="tmPreviewHeroSticky">
            <div class="tmPreviewHero ttPreviewHero ttType-${typeInfo.typeClass}">
                <div class="tmPreviewTypeIcon"><img src="${typeInfo.icon}" alt="" /></div>
                <div class="tmPreviewHeroMain">
                    <div class="tmPreviewName">${ttPreviewEscape(login.name)}</div>
                    <div class="tmPreviewMeta">
                        <span>ID: ${ttPreviewEscape(login.id)}</span>
                        <span>${ttPreviewEscape(typeInfo.label)}</span>
                    </div>
                </div>
                <div class="tmPreviewActions"><div class="tmPreviewActionRow">${editAction}</div></div>
            </div>
            </div>
            <div class="tmPreviewBody">
            <div class="tmPreviewGrid ttPreviewGrid">
                <div class="tmPreviewColumn">
                    ${ttPreviewSettingsCard()}
                    ${ttPreviewSpecialConditionsCard()}
                    ${ttPreviewMetaTagsCard()}
                    ${ttPreviewPlausibilityCard()}
                </div>
                <div class="tmPreviewColumn ttPreviewRightColumn">
                    ${ttPreviewResultTestsCard()}
                    ${ttPreviewAssignmentsCard()}
                </div>
            </div>
            </div>
        </div>
    `;
    ttShowBrowsePreviewSection();
    $('#testeePreviewContent').html(html);
    $('#ttPreviewEditButton').on('click', function() { editSelection('preview'); });
    ttPreviewAdjustAssignmentHeight();
}

function renderTemplateCloneList() {
    const box = getTemplateCloneBox();
    const list = box.find('#templateCloneList');
    if (!serverData.testLevel || serverData.testLevel.template !== 'template') {
        resetTemplateCloneBoxSizing();
        box.detach();
        list.empty();
        window.requestAnimationFrame(resetTemplateCloneBoxSizing);
        return;
    }

    if (box.parent().length === 0) box.insertAfter('#box_assignedTests');
    box.show();
    syncTemplateDatasetLayout();
    window.requestAnimationFrame(syncTemplateDatasetLayout);
    const summary = serverData.testLevel.templateCloneSummary || {};
    updateTemplateClonePanelText(Number(summary.total || 0));
    const clones = Array.isArray(summary.clones) ? summary.clones : [];
    if (clones.length === 0) {
        list.empty();
        return;
    }

    const rows = clones.map(clone => {
        const tests = renderTemplateCloneTestDetails(clone.tests);
        let activityLabel;
        if (Number(clone.activityRows || 0) > 0) {
            activityLabel = UILANG.m('Last activity') + ': ' + ttPreviewFormatSqlDateTime(clone.lastActivity);
        } else if (clone.createdAt) {
            activityLabel = UILANG.m('Logged in') + ': ' + ttPreviewFormatSqlDateTime(clone.createdAt) + ' · ' + UILANG.m('Test not started');
        } else {
            activityLabel = UILANG.m('Login time not available') + ' · ' + UILANG.m('Test not started');
        }
        return /* html */ `
            <div class="tmTemplateCloneRow" data-clone-id="${ttPreviewEscape(clone.id)}">
                <div class="tmTemplateCloneMain">
                    <strong>${ttPreviewEscape(clone.name)}</strong>
                    <em>${ttPreviewEscape(activityLabel)}</em>
                </div>
                <div class="tmTemplateCloneStats">
                    <div class="tmTemplateCloneTestsToggle" role="button" tabindex="0" title="${UILANG.m('Tests with data')}"><span>${UILANG.m('Tests')}</span><strong>${Number(clone.testsWithData || 0)}</strong></div>
                    <div><span>${UILANG.m('Avg. progress')}</span><strong>${Number(clone.avgProgress || 0)}%</strong></div>
                    <div><span>${UILANG.m('Max.')}</span><strong>${Number(clone.maxProgress || 0)}%</strong></div>
                </div>
                <button type="button" class="tmTemplateCloneDelete" data-clone-id="${ttPreviewEscape(clone.id)}" title="${UILANG.m('Delete')}"></button>
                ${tests}
            </div>
        `;
    }).join('');
    list.html(rows);
    $('.tmTemplateCloneTestsToggle').on('click keydown', function (event) {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        $(this).closest('.tmTemplateCloneRow').toggleClass('is-open');
    });
    $('.tmTemplateCloneDelete').on('click', function () {
        deleteTemplateClone(Number($(this).data('clone-id')));
    });
}

function renderTemplateCloneTestDetails(tests) {
    const testRows = Array.isArray(tests) ? tests : [];
    if (testRows.length === 0) {
        return `<div class="tmTemplateCloneTestsDetails"><em>${UILANG.m('No tests with data.')}</em></div>`;
    }
    const rows = testRows.map(test => {
        return /* html */ `
            <div class="tmTemplateCloneTestItem">
                <strong>${ttPreviewEscape(test.name || UILANG.m('Test has been deleted!'))}</strong>
                <span>ID: ${ttPreviewEscape(test.id || '')} | ${UILANG.m('Max.')}: ${Number(test.maxProgress || 0)}% | ${UILANG.m('Last activity')}: ${ttPreviewEscape(ttPreviewFormatSqlDateTime(test.lastActivity))}</span>
            </div>
        `;
    }).join('');
    return `<div class="tmTemplateCloneTestsDetails">${rows}</div>`;
}

function getTemplateCloneBox() {
    if (templateCloneBoxElement && templateCloneBoxElement.length > 0) return templateCloneBoxElement;
    templateCloneBoxElement = $('#box_templateClones');
    return templateCloneBoxElement;
}

function updateTemplateClonePanelText(datasetCount) {
    const label = datasetCount === 1 ? UILANG.m('dataset recorded') : UILANG.m('datasets recorded');
    getTemplateCloneBox().find('#templateClonesTbText').html(datasetCount + ' ' + label);
    getTemplateCloneBox().find('#templateClonesDeleteAll').prop('disabled', datasetCount === 0);
    if (selection.length === 1 && serverData.testLevel && serverData.testLevel.template === 'template') {
        updateResetResultsAvailability(datasetCount > 0);
    }
}

function updateResetResultsAvailability(hasResultsOverride) {
    if (selection.length !== 1 || !serverData.testLevel || selection[0].type === 'folder') return;
    const itemPermissions = window.permList && permList[selection[0].dbId];
    const canResetResults = !!(itemPermissions && itemPermissions.resetResultsTestee === true);
    const hasResults = typeof hasResultsOverride === 'boolean' ? hasResultsOverride :
        (serverData.testLevel.template === 'template'
            ? Number(serverData.testLevel.templateCloneSummary && serverData.testLevel.templateCloneSummary.total || 0) > 0
            : Array.isArray(serverData.testLevel.activityData) && serverData.testLevel.activityData.length > 0);
    if (canResetResults && hasResults) {
        buttons.resetResultsTestee.enable();
        buttons.resetTestee.enable();
    } else {
        buttons.resetResultsTestee.disable();
        buttons.resetTestee.disable();
    }
}

function syncTemplateDatasetLayout() {
    if (!serverData.testLevel || serverData.testLevel.template !== 'template') return;
    const box = getTemplateCloneBox();
    if (box.parent().length === 0) return;
    const passwordTitleTop = $('#title_passwords').offset() ? $('#title_passwords').offset().top : 0;
    const assignedTitleTop = $('#title_assignedTests').offset() ? $('#title_assignedTests').offset().top : 0;
    const boxTopMargin = Math.round(parseFloat($('#box_assignedTests').css('margin-top')) || 24);
    const boxBottomMargin = Math.round(parseFloat($('#box_assignedTests').css('margin-bottom')) || 0);
    const assignedHeight = Math.round(passwordTitleTop - assignedTitleTop - boxTopMargin - boxBottomMargin);
    const passwordBoxHeight = Math.round($('#box_passwords').outerHeight() || 0);
    if (!assignedHeight || !passwordBoxHeight || assignedHeight < 120 || passwordBoxHeight < 120) return;
    gui.s3.css('min-height', `${assignedHeight + passwordBoxHeight + (boxTopMargin * 2)}px`);
    $('#box_assignedTests').css({
        'box-sizing': 'border-box',
        flex: `0 0 ${assignedHeight}px`,
        '-webkit-flex': `0 0 ${assignedHeight}px`,
        height: `${assignedHeight}px`,
        'min-height': `${assignedHeight}px`,
        'max-height': `${assignedHeight}px`
    });
    box.css({
        'box-sizing': 'border-box',
        flex: `0 0 ${passwordBoxHeight}px`,
        '-webkit-flex': `0 0 ${passwordBoxHeight}px`,
        height: `${passwordBoxHeight}px`,
        'min-height': `${passwordBoxHeight}px`,
        'max-height': `${passwordBoxHeight}px`
    });
}

function getLoginSettingsColumnHeight() {
    const visibleHeight = Math.round(gui.s2.outerHeight() || 0);
    const minHeight = parseInt(gui.s2.css('min-height'), 10) || 0;
    let storedHeight = 0;
    gui.s2.children('.jsFlexBox').each(function () {
        storedHeight += Number($(this).data('height') || 0);
    });
    return Math.max(visibleHeight, minHeight, storedHeight, 530);
}

function resetTemplateCloneBoxSizing() {
    const box = getTemplateCloneBox();
    gui.boxes.assignedTests.setFlex(1);
    gui.s3.css('min-height', `${getLoginSettingsColumnHeight()}px`);
    $('#box_assignedTests').css({
        'box-sizing': '',
        height: '',
        'min-height': '450px',
        'max-height': ''
    });
    box.css({
        'box-sizing': '',
        flex: '0 0 0px',
        '-webkit-flex': '0 0 0px',
        height: '0',
        'min-height': '0',
        'max-height': '0'
    });
}

function deleteTemplateClone(cloneId) {
    if (!serverData.testLevel || serverData.testLevel.template !== 'template' || !cloneId) return;
    const clones = serverData.testLevel.templateCloneSummary && Array.isArray(serverData.testLevel.templateCloneSummary.clones)
        ? serverData.testLevel.templateCloneSummary.clones
        : [];
    const clone = clones.find(item => String(item.id) === String(cloneId));
    const cloneName = clone && clone.name ? clone.name : cloneId;
    const dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
        }, {
            label: UILANG.m('Delete'), value: 'ok'
        }],
        contents: '<div class="tmActionConfirm tmActionConfirm-warning">' +
            '<strong>' + UILANG.m('Ready to delete') + '</strong>' +
            '<span>' + UILANG.m('This recorded dataset will be deleted.') + '</span>' +
            '<div class="tmActionConfirmMeta"><span>' + UILANG.m('dataset') + '</span>' +
                '<strong>' + ttPreviewEscape(cloneName) + '</strong></div>' +
            '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
        '</div>',
        returnPromise: true,
        width: 520,
        title: UILANG.m('Delete dataset?'),
        type: 'warning'
    };
    showDialog('deleteTemplateCloneDialog', dialogData).then((res) => {
        if (res.button === 'ok') {
            startAjax('deleteTemplateClone', {
                id: serverData.testLevel.id,
                cloneId: cloneId,
                location: loc.folder
            });
        }
    });
}

function ttPreviewAdjustAssignmentHeight() {
    $('.ttPreviewAssignmentCard').removeClass('is-scrollable').css('height', '');
}

function startTesteePreviewPlausibilityCheck() {
    if (!serverData.testLevel || mode !== 'browsing') return;
    pendingPreviewCheckToken = ++ajaxRequestToken;
    startAjax('plausibilityCheck', {
        id: serverData.testLevel.id,
        _requestToken: pendingPreviewCheckToken
    });
}

function buildExampleFileCSV() {
    const writeArray = [];
    if(fileWizardType === 'student'){
        writeArray.push(['testtaker', 'authentication', 'password', 'label', 'tag', 'test-id', 'subfolder', 'displayname', 'metakey1', 'metavalue1', 'metatag2']);
        writeArray.push(['Tester1', 'direct', 'yk4565juia', 'English test', 'Just%20a%20test%20tag', '3001\\3005\\3008', '', 'Anne Muller' , 'School', 'ABC', 'NeedsReview']);
        writeArray.push(['Tester2', 'SAML', '', 'English test', '', '3001', 'subfolder for tester', 'Luc Wagner' , 'School', 'DEF', 'NeedsReview']);
        writeArray.push(['Tester3', 'LDAP', '', 'German test', 'tags%20are%20optional', '', 'subfolder for tester\\secondsubfolder', '', 'Company', 'XYZ', 'Remote']);
        writeArray.push(['Tester1', 'direct', 'yk4565juia', 'French test', '', '4001\\4002', '', 'Anne Muller' , 'School', 'ABC', 'NeedsReview']);
    } else {
        writeArray.push(['testtaker', 'password', 'tag', 'test-id', 'subfolder', 'displayname', 'metakey1', 'metavalue1', 'metatag2']);
        writeArray.push(['Tester1', 'xyZh75f', 'Just%20a%20test%20tag', '3001\\3005\\3008', '', 'Anne Muller' , 'School', 'ABC', 'NeedsReview']);
        writeArray.push(['Tester2', '89hgZ75', '', '3001', 'subfolder for tester', 'Luc Wagner' , 'School', 'DEF', 'NeedsReview']);
        writeArray.push(['Tester3', 'HNBJsge7', 'tags%20are%20optional', '', 'subfolder for tester\\secondsubfolder', '', 'Company', 'XYZ', 'Remote']);
        writeArray.push(['Tester1', 'xXFf736', '', '4001\\4002', '', 'Anne Muller' , 'School', 'ABC', 'NeedsReview']);
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
    $('#box_assignedTests').toggleClass(
        'tmTemplateAssignedTests',
        fillMode === 'editTest' && serverData.testLevel && serverData.testLevel.template === 'template'
    );
    if (fillMode === 'editTest') {
        //loginSettings
        $('#loginSettingsPanel').empty();
        $('#loginSettings').empty();
        $('#loginSettingsPanel').css({
            'background-color': '#eaf2f7',
            'color': '#26394a'
        });

        //display name - valid for all types
        let dName;
        if (serverData.testLevel.displayName === null || serverData.testLevel.displayName === '') {
            dName = '<span class="notSet">' + UILANG.m("- No display name -") + '</span>';
        } else {
            dName = ttPreviewEscape(serverData.testLevel.displayName);
        }

        $('#loginSettings').append('<div class="inPutFrame"><div class="inPutText">' + dName + '</div><div id= "disName" class="inPutDesc">' + UILANG.m("Display name") + '</div></div>');
        $('#disName').on('click', editDisName);
        $('.inPutText').on('click', editDisName);

        let passwordDisplayItems = serverData.testLevel.passwords;

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
                $('#loginSettingsPanel').css({
                    'background-color': '#fff7c8',
                    'color': '#26394a'
                });
                buttons.changeLoginType.disable();
                renderTemplateCloneList();
                break;
            case 'cloned':
                $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Cloned from template") + '</div>');
                $('#loginSettingsPanel').css({
                    'background-color': '#f3f5f7',
                    'color': '#26394a'
                });
                $('#loginSettingsPanelText').css('font-style', 'italic');
                buttons.changeLoginType.disable();
                break;
            default:
                renderTemplateCloneList();
                buttons.changeLoginType.enable();
                switch (serverData.testLevel.loginType) {
                    case 'directPass':
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Student login (Password)") + '</div>');
                        $('#loginSettingsPanel').css({
                            'background-color': '#ddf2e2',
                            'color': '#26394a'
                        });
                        // Create password field
                        $('#loginSettings').append('<div class="inPutDivider"></div><div class="inPutFrame"><div class="inPutTextPwd">' + ttPreviewEscape(serverData.testLevel.password) + '</div><div id="editDirectPassword" class="inPutDesc">'+UILANG.m("Direct password")+'</div></div>');
                        $('#editDirectPassword').on('click', editDirectPass);
                        $('.inPutTextPwd').on('click', editDirectPass);
                        passwordDisplayItems = prepData(serverData.testLevel.passwords);
                        break;
                    case 'LDAP':
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Student login (LDAP)") + '</div>');
                        $('#loginSettingsPanel').css({
                            'background-color': '#dceff8',
                            'color': '#26394a'
                        });
                        passwordDisplayItems = prepData(serverData.testLevel.passwords);
                        break;
                    case 'SAML':
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Student login (SAML)") + '</div>');
                        $('#loginSettingsPanel').css({
                            'background-color': '#f2d4d8',
                            'color': '#26394a'
                        });
                        passwordDisplayItems = prepData(serverData.testLevel.passwords);
                        break;
                    default:
                        $('#loginSettingsPanel').html('<div id="loginSettingsPanelText">' + UILANG.m("Standard login") + '</div>');
                        $('#loginSettingsPanel').css({
                            'background-color': '#eaf2f7',
                            'color': '#26394a'
                        });
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
            return passwords.map(item => {
                const displayItem = $.extend(true, {}, item);
                let displayLabel = displayItem.label;
                if (displayLabel === null || displayLabel === '') {
                    displayLabel = UILANG.m("Label") + ' ' + counter;
                    counter++;
                }
                displayItem.name = displayLabel;
                displayItem.label = item.name;
                return displayItem;
            });
        }

        gui.passwords.setItems(ttPreparePasswordListItems(passwordDisplayItems));
        if (stuLog) {
            $('#pwTbCopy').hide();
        } else {
            $('#pwTbCopy').show();
            $('#itemSelector_button_setPassword').hide();
        }

        //metatags
        const mtags = serverData.testLevel.metatags;
        const sortedKeys = Object.keys(mtags).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
        gui.metaView.setItems(mtags, true);
        updateMetaTagCounter(metaTbText, sortedKeys.length);
    }
}

function setPasswordForLabel(sender, obj) {
    let setPass = false;
    const originalPassword = String(obj.label || '');
    let formCont = '<div class="tmDialogForm">' +
        '<div class="tmDialogSwitchRow" id="spContainer"></div>' +
        '<div class="tmDialogFormField" id="spPasswordField">' +
            '<label for="dialogField1">' + UILANG.m('Password') + '</label>' +
            '<span class="sublineDialog">' + UILANG.m('The user must enter this password to open a test.') + '</span>' +
            '<input type="text" id="dialogField1">' +
        '</div>' +
    '</div>';

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
                gui.wpasswords.setItems(ttPreparePasswordListItems(wizardData.pwds));
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

    ttBindAllowedCharacters('#dialogField1', false);

    const setPassSwitch = insertToggleswitch('#spContainer', 'tsPass', UILANG.m('Activate Password'), {
        dataId: 'activePass', changeCallback: activePass
    });

    //set initial state
    if (obj.hasOwnProperty('metadata') && obj.metadata !== null && typeof obj.metadata === 'object' && obj.metadata.pwReq === true) {
        setPassSwitch.reset(true);
        setPass = true;
    }
    updatePasswordFieldVisibility();

    function activePass(sender, state) {
        setPass = state;
        updatePasswordFieldVisibility();
    }

    function updatePasswordFieldVisibility() {
        const passwordField = $('#dialogField1');
        if (!setPass && String(passwordField.val() || '').trim() === '') {
            // An inactive password requirement still retains its password. Restore
            // the saved value so the mandatory-field state enables Save and an
            // empty password can never be submitted while the field is hidden.
            passwordField.val(originalPassword).trigger('input');
        }
        $('#spPasswordField').toggle(setPass);
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
        contents: '<div class="tmDialogForm">' +
            '<div class="tmActionConfirmMeta"><span>' + UILANG.m('Current login type') + '</span><strong>' + startString + '</strong></div>' +
            '<div class="tmDialogFormField"><label>' + UILANG.m('Change login type to') + '</label><div id="dialogField1"></div></div>' +
            '<div class="tmDialogFormField" id="pwBlock"><label for="dialogField2">' + UILANG.m('Password') + '</label><span class="sublineDialog">' + UILANG.m('Password will be auto-generated if the input field is left empty.') + '</span><input type="text" id="dialogField2" maxlength="200"></div>' +
        '</div>',
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

    ttBindAllowedCharacters('#dialogField2', false);

    if (startType !== 'directPass') $('#pwBlock').css('visibility', 'hidden');

    let changeType = {
        theme: 'backend',
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
        contents: '<div class="tmDialogForm">' +
            '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Display name') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
        '</div>',
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
        contents: '<div class="tmDialogForm">' +
            '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Direct password') + '</label><input type="text" id="dialogField1" maxlength="200"></div>' +
        '</div>',
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
    ttBindAllowedCharacters('#dialogField1', false);
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

function showResetResultsOutcomeDialog(options) {
    const deleted = options.deleted !== false;
    const details = Array.isArray(options.details) ? options.details.filter(Boolean) : [];
    const contents = '<div class="tmActionConfirm ' + (deleted ? 'tmActionConfirm-success' : 'tmActionConfirm-warning') + '">' +
        '<div class="tmActionConfirmHeading"><strong>' + (deleted ? UILANG.m('Reset complete') : UILANG.m('Nothing was deleted')) + '</strong></div>' +
        '<span>' + options.message + '</span>' +
        details.map((detail) => '<p class="tmActionConfirmNote">' + detail + '</p>').join('') +
    '</div>';
    new nxDialog('resetResultsOutcome', {
        title: deleted ? UILANG.m('Results reset') : UILANG.m('No matching results'),
        type: deleted ? 'success' : 'warning',
        width: 580,
        contents: contents,
        buttons: [{label: UILANG.m('OK'), value: 'ok', default: true, cancel: true}]
    });
}

function resetTestee() {
    let description;
    const selectedTemplate = selection.length === 1 && selection[0].type !== 'folder' &&
        serverData.testLevel && serverData.testLevel.template === 'template';
    const selectionHasFolder = selection.some(item => item.type === 'folder');
    const showTemplateHelp = selectedTemplate || selectionHasFolder || selection.some(item => item.type === 'template');
    const showRegularHelp = !selectedTemplate && (selectionHasFolder || selection.some(item => item.type !== 'template' && item.type !== 'folder'));
    if (selection.length === 1 && selection[0].type !== 'folder') {
        description = selectedTemplate
            ? sf(UILANG.m('Recorded datasets of the template "%@" will be deleted.'), escapeHtml(serverData.testLevel.name))
            : sf(UILANG.m('Results of the test taker "%@" will be reset.'), escapeHtml(serverData.testLevel.name));
    } else {
        description = UILANG.m('Results of the selected test takers will be reset.');
    }
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
    const filterControls =
        '<div class="tmResetFilter">' +
            '<label for="resetScope">' + UILANG.m('Delete') + '</label>' +
            '<select id="resetScope">' +
                '<option value="all">' + UILANG.m('Everything') + '</option>' +
                '<option value="before">' + UILANG.m('Before date and time') + '</option>' +
                '<option value="after">' + UILANG.m('On or after date and time') + '</option>' +
            '</select>' +
            '<div id="resetCutoffField" class="tmResetCutoff" hidden>' +
                '<label for="resetCutoffDate">' + UILANG.m('Date and time') + '</label>' +
                '<div class="tmResetDateTime">' +
                    '<input id="resetCutoffDate" type="text" inputmode="numeric" autocomplete="off" value="' + dateNow + '">' +
                    '<select id="resetCutoffHour" aria-label="' + UILANG.m('Hour') + '">' + hourOptions + '</select>' +
                    '<span aria-hidden="true">:</span>' +
                    '<select id="resetCutoffMinute" aria-label="' + UILANG.m('Minute') + '">' + minuteOptions + '</select>' +
                '</div>' +
            '</div>' +
        '</div>';
    const message = '<div class="tmActionConfirm tmActionConfirm-warning">' +
        '<div class="tmActionConfirmHeading"><strong>' + UILANG.m('Ready to reset') + '</strong><span id="resetDateHelp"></span></div>' +
        '<span>' + description + '</span>' +
        filterControls +
        '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
    '</div>';
    let resetSubmitted = false;
    const submitReset = function (values) {
        if (resetSubmitted) return true;
        const resetMode = values.resetScope || 'all';
        let resetCutoff = null;
        if (resetMode !== 'all') {
            let cutoff = null;
            try {
                cutoff = $.datepicker.parseDate('dd.mm.yy', values.resetCutoffDate);
                cutoff.setHours(Number(values.resetCutoffHour), Number(values.resetCutoffMinute), 0, 0);
            } catch (error) {
                cutoff = null;
            }
            if (!cutoff || Number.isNaN(cutoff.getTime())) {
                window.setTimeout(function () {
                    new nxDialog('resetDateRequired', {
                        buttons: [{label: UILANG.m('OK'), 'cancel': true, 'default': true, value: 'ok'}],
                        contents: UILANG.m('Please enter a valid date and time.'),
                        title: UILANG.m('Date and time required'),
                        type: 'warning'
                    });
                }, 0);
                return false;
            }
            resetCutoff = Math.floor(cutoff.getTime() / 1000);
        }
        resetSubmitted = true;
        startAjax('resetResultsTestee', {
            selection: selection,
            resetMode: resetMode,
            resetCutoff: resetCutoff
        });
        return true;
    };
    const resetData = {
        buttons: [{
            label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
        }, {
            label: UILANG.m('Reset'), value: 'ok'
        }],
        contents: message,
        datafields: ['resetScope', 'resetCutoffDate', 'resetCutoffHour', 'resetCutoffMinute'],
        dataFormat: 'object',
        callback: function (button, values) {
            if (button !== 'ok') return;
            submitReset(values);
        },
        width: 600,
        title: UILANG.m('Reset test taker results?'),
        type: 'warning'
    };
    const resetDialog = new nxDialog('resetDialog', resetData);
    $('#resetDialog_button_1').on('click.resetFallback', function (event) {
        if (!document.documentElement.contains(this)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const submitted = submitReset({
            resetScope: $('#resetScope').val(),
            resetCutoffDate: $('#resetCutoffDate').val(),
            resetCutoffHour: $('#resetCutoffHour').val(),
            resetCutoffMinute: $('#resetCutoffMinute').val()
        });
        if (submitted && window.nxDialogManager.instances.resetDialog) {
            resetDialog.dismiss();
        }
    });
    $('#resetScope').on('change', function () {
        $('#resetCutoffField').prop('hidden', this.value === 'all');
    });
    $('#resetCutoffDate').datepicker({
        dateFormat: 'dd.mm.yy',
        firstDay: 1,
        showOtherMonths: true,
        selectOtherMonths: true,
        beforeShow: function () {
            $('#ui-datepicker-div').addClass('tmResetDatePicker');
        },
        onClose: function () {
            $('#ui-datepicker-div').removeClass('tmResetDatePicker');
        },
        onSelect: function () {
            $(this).datepicker('hide').trigger('blur');
        }
    });
    const templateHelpText = UILANG.m('Datasets are filtered by when the dataset login was created. This includes datasets whose test was never started.');
    const regularHelpText = UILANG.m('Each complete test result and its scoring data are filtered by the last recorded activity. A test started before the selected date but continued on or after it is retained when deleting results from before that date.');
    let helpTitle;
    let helpContent;
    if (showTemplateHelp && showRegularHelp) {
        helpTitle = UILANG.m('Date filtering');
        helpContent = OasysHelp.layout({items: [{
            title: UILANG.m('Template datasets'), text: templateHelpText
        }, {
            title: UILANG.m('Regular and student logins'), text: regularHelpText
        }]});
    } else if (showTemplateHelp) {
        helpTitle = UILANG.m('Date filtering for template datasets');
        helpContent = OasysHelp.layout({lead: templateHelpText});
    } else {
        helpTitle = UILANG.m('Date filtering for regular and student logins');
        helpContent = OasysHelp.layout({lead: regularHelpText});
    }
    new OasysHelp('resetDateHelp', {
        size: '16px',
        maxWidth: '460px',
        linkDecoration: 'none',
        title: helpTitle,
        htmlContent: helpContent
    });
}

function resetPassword(sender, button) {
    if (!button) {
        let message;
        if (serverData.testLevel && serverData.testLevel.template === 'template') {
            message = sf(
                '<div class="tmActionConfirm tmActionConfirm-warning">' +
                    '<strong>' + UILANG.m('Ready to reset') + '</strong>' +
                    '<span>' + UILANG.m('Recorded template datasets for "%@" will be reset.') + '</span>' +
                    '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
                '</div>',
                escapeHtml(serverData.testLevel.activePass.name)
            );
        } else if(stuLog){
            message = sf(
                '<div class="tmActionConfirm tmActionConfirm-warning">' +
                    '<strong>' + UILANG.m('Ready to reset') + '</strong>' +
                    '<span>' + UILANG.m('All results of the label "%@" will be reset.') + '</span>' +
                    '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
                '</div>',
                escapeHtml(serverData.testLevel.activePass.label)
            );
        } else {
            message = sf(
                '<div class="tmActionConfirm tmActionConfirm-warning">' +
                    '<strong>' + UILANG.m('Ready to reset') + '</strong>' +
                    '<span>' + UILANG.m('All results of the password "%@" will be reset.') + '</span>' +
                    '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
                '</div>',
                escapeHtml(serverData.testLevel.activePass.name)
            );
        }
        const resetData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Reset'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: resetPassword,
            title: UILANG.m('Reset testee results?'),
            type: 'warning'
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
    afObject = afObject || {};
    if (!button) {
        const message = serverData.testLevel && serverData.testLevel.template === 'template'
            ? sf(
                '<div class="tmActionConfirm tmActionConfirm-warning">' +
                    '<strong>' + UILANG.m('Ready to reset') + '</strong>' +
                    '<span>' + UILANG.m('Recorded template datasets for the test "%@" will be reset.') + '</span>' +
                    '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
                '</div>',
                escapeHtml(afObject.testName)
            )
            : sf(
                '<div class="tmActionConfirm tmActionConfirm-warning">' +
                    '<strong>' + UILANG.m('Ready to reset') + '</strong>' +
                    '<span>' + UILANG.m('All results of the test "%@" for this user will be reset.') + '</span>' +
                    '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
                '</div>',
                escapeHtml(afObject.testName)
            );
        const resetData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, 'default': true, value: 'cancel'
            }, {
                label: UILANG.m('Reset'), value: 'ok'
            }],
            contents: message,
            width: 600,
            callback: proceedTestReset,
            title: UILANG.m('Reset test taker results?'),
            type: 'warning'
        };
        new nxDialog('resetDialog', resetData, arguments);
    }
    if (button === 'ok') {
        const passwordId = Number(afObject.passwordId || (serverData.testLevel.activePass && serverData.testLevel.activePass.id) || currPwId || 0);
        if (!passwordId) {
            gui.statusBar.setStatus(UILANG.m('Please select a password first!'), 3000, '#dd1a00');
            return;
        }
        const resetData = {
            testee: selection[0].dbId,
            password: passwordId,
            test: afObject.testId
        };
        startAjax('resetResultsTest', resetData);
    }

}

function newPassword(sender, button, name, tag) {
    if (!button) {
        let contentStr;
        let contentTitle;

        if (stuLog && sender === 'selectListBtnNewPw'|| selHasStudent && sender === 'selectListBtnNewWizardPw') {
            contentStr = '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Label') + '</label><input type="text" id="dialogField1"></div>' +
                '<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Tag') + ' (' + UILANG.m('optional') + ')</label><input type="text" id="dialogField2"></div>' +
            '</div>';
            contentTitle = UILANG.m('New label');
        } else {
            contentStr = '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Password') + '</label><input type="text" id="dialogField1"></div>' +
                '<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Tag') + ' (' + UILANG.m('optional') + ')</label><input type="text" id="dialogField2"></div>' +
            '</div>';
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

        // Passwords use the strict character set; labels may contain spaces.
        ttBindAllowedCharacters('#dialogField1', !(!stuLog && sender === 'selectListBtnNewPw' || !selHasStudent && sender === 'selectListBtnNewWizardPw'));
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
                gui.wpasswords.setItems(ttPreparePasswordListItems(wizardData.pwds));
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
                    value = Object.assign(
                        {testType: bulkTestType(value)},
                        value,
                        {ID: value.hiddenID, testType: bulkTestType(value)}
                    );
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
        const itemList = sf('<ul class="deleteList"><li>%@</li></ul>', sel.name);
        if (sel.dataPresent === true) {
            if (stuLog) {
                message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following label?') + '</p></div>' + itemList + '<p class="deleteConfirmWarning"><strong>' + UILANG.m('Warning:') + '</strong> ' + UILANG.m('For this label user data has already been collected!') + '</p></div>';
                title = UILANG.m('Delete label?');
            } else {
                message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following password?') + '</p></div>' + itemList + '<p class="deleteConfirmWarning"><strong>' + UILANG.m('Warning:') + '</strong> ' + UILANG.m('For this password user data has already been collected!') + '</p></div>';
                title = UILANG.m('Delete password?');
            }
        } else {
            if (stuLog || selHasStudent) {
                message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following label?') + '</p></div>' + itemList + '</div>';
                title = UILANG.m('Delete label?');
            } else {
                message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following password?') + '</p></div>' + itemList + '</div>';
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
            type: 'warning'
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
            gui.wpasswords.setItems(ttPreparePasswordListItems(wizardData.pwds));
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
        const nameLabel = (stuLog || selHasStudent) ? UILANG.m('Label') : UILANG.m('Password');
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + nameLabel + '</label><input type="text" id="dialogField1"></div>' +
                '<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Tag') + '</label><input type="text" id="dialogField2"></div>' +
            '</div>',
            title: UILANG.m('Rename'),
            width: 400,
            callback: editPassword
        };
        new nxDialog('renameDialog', dialogData, arguments);

        ttBindAllowedCharacters('#dialogField1', stuLog || selHasStudent);

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
                gui.wpasswords.setItems(ttPreparePasswordListItems(wizardData.pwds));
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Folder name') + '</label><input type="text" maxlength="200" id="dialogField1"></div>' +
            '</div>',
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
        let userTaskHd;
        let nameLabel;
        if (sender === 'bNewTesteeTemplate') {
            userTaskHd = UILANG.m('New template');
            nameLabel = UILANG.m('Template name');
        } else {
            userTaskHd = UILANG.m('New standard login');
            nameLabel = UILANG.m('Login name');
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + nameLabel + '<span id="loginHelp"></span></label><input type="text" id="dialogField1"></div>' +
            '</div>',
            title: userTaskHd,
            width: 400,
            callback: newTest
        };
        new nxDialog('newTestDialog', dialogData, arguments);
        ttBindAllowedCharacters('#dialogField1', true);

        //show online help
        let loginHelpHtml;
        let loginHelpTitle;

        if (sender === 'bNewTesteeTemplate') {
            loginHelpHtml = UILANG.m('<p>A test taker template in OASYS is a reusable login that can be connected to one or more passwords and linked to one or more tests. Each time a user logs in with a template, OASYS stores the recorded dataset as a hidden clone linked back to the template.</p><p>The datasets are listed on the template itself, so results can be tracked without filling the file manager with cloned test takers.</p>');
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
        contents: '<div class="tmDialogForm">' +
            '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Login name') + '<span id="studentHelp"></span></label><input type="text" id="dialogField1" maxlength="200"></div>' +
            '<div class="tmDialogFormField"><label>' + UILANG.m('Authentication type') + '<span id="authHelp"></span></label><div id="dialogField2"></div></div>' +
            '<div class="tmDialogFormField" id="pwBlock"><label for="dialogField3">' + UILANG.m('Password') + '</label><span class="sublineDialog">' + UILANG.m('Password will be auto-generated if the input field is left empty.') + '</span><input type="text" id="dialogField3" maxlength="200"></div>' +
        '</div>',
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
        maxHeight: '560px',
        maxWidth: '520px',
        title: UILANG.m('Student Login Authentication Methods')
    });


    ttBindAllowedCharacters('#dialogField1', true);
    ttBindAllowedCharacters('#dialogField3', false);


    let AuthTypeOpt = {
        theme: 'backend',
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
        } else if (obj.loginType === 'directPass') {
            type += ' typetestee-direct';
        } else if (obj.loginType === 'LDAP') {
            type += ' typetestee-ldap';
        } else if (obj.loginType === 'SAML') {
            type += ' typetestee-saml';
        } else {
            type += ' typetestee-standard';
        }
        if (obj.type === 'template') {
            type = 'typetemplate';
        }
        message += sf('<li class="%@">%@</li>', type, obj.label);
    }
    message += '</ul>';
    message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m('Are you sure you want to delete the following test takers(s)/folder(s)? This action is irreversible!') + '</p></div>' + message + '<p class="deleteConfirmWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('Recorded data for the chosen test takers will also be deleted.') + '</p>';
    if (foldersInSelection) {
        message += '<p class="deleteConfirmWarning">' + UILANG.m('Warning:') + ' ' + UILANG.m('If the selected folder(s) contain files or subfolders, they will be deleted as well.') + '</p>';
    }
    message += '</div>';
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
        type: 'warning'
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
    gui.library.filerSearch('', {metaSearch: true});
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
        let nameLabel = UILANG.m('Login name');
        if (selection[0]['type'] === 'folder') {
            nameLabel = UILANG.m('Folder name');
        } else if (selection[0]['type'] === 'template') {
            nameLabel = UILANG.m('Template name');
        }
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + nameLabel + '</label><input type="text" id="dialogField1"></div>' +
            '</div>',
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
        if (selection[0]['type'] === 'testee') ttBindAllowedCharacters('#dialogField1', true);
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
    startAjax('fetchMetaTagSuggestions', {})
        .then(function(res) {
            if (res && !res.error && gui.metaView) {
                gui.metaView.setSuggestions(res.suggestions || {});
            }
            gui.metaView.openNewDialog();
        });
}

function wAddMetaTag() {
    startAjax('fetchMetaTagSuggestions', {})
        .then(function(res) {
            if (res && !res.error && gui.wMetaView) {
                gui.wMetaView.setSuggestions(res.suggestions || {});
            }
            gui.wMetaView.openNewDialog();
        });
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
            contents: '<div class="tmDialogForm">' +
                '<div class="tmDialogFormField"><label for="dialogField1">' + UILANG.m('Meta-key') + '</label><input class="amt" type="text" id="dialogField1" maxlength="200" placeholder="Class"></div>' +
                '<div class="tmDialogFormField"><label for="dialogField2">' + UILANG.m('Meta-value') + '</label><input class="amt" type="text" id="dialogField2" maxlength="200" placeholder="9a"></div>' +
            '</div>',
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
                    contents: '<div class="tmActionConfirm tmActionConfirm-warning">' +
                        '<strong>' + UILANG.m('Meta tag already exists') + '</strong>' +
                        '<span>' + sf(UILANG.m('The key "%@" already has the value "%@".'), escapeHtml(mkey), escapeHtml(wizardData.metaTags[mkey])) + '</span>' +
                        '<div class="tmActionConfirmMeta"><span>' + UILANG.m('New value') + '</span><strong>' + escapeHtml(mvalue) + '</strong></div>' +
                    '</div>',
                    title: UILANG.m('Warning'),
                    width: 500,
                    type: 'warning',
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
                    contents: '<div class="tmActionConfirm tmActionConfirm-warning">' +
                        '<strong>' + UILANG.m('Meta tag already exists') + '</strong>' +
                        '<span>' + sf(UILANG.m('The key "%@" already has the value "%@".'), escapeHtml(mkey), escapeHtml(mtags[mkey])) + '</span>' +
                        '<div class="tmActionConfirmMeta"><span>' + UILANG.m('New value') + '</span><strong>' + escapeHtml(mvalue) + '</strong></div>' +
                    '</div>',
                    title: UILANG.m('Warning'),
                    width: 500,
                    type: 'warning',
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
        const sortedKeys = Object.keys(wizardData.metaTags).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
        gui.wMetaView.setItems(wizardData.metaTags, true);
        updateMetaTagCounter('#wMetaTbText', sortedKeys.length);
    }
}

/* adding tests to password */
function addTests() {
    let dialogData;
    if ((mode === 'wizard' && wizardData.currentPwId === 0)
        || (mode === 'add2selected' && wizardData.currentPwId === 0)
        || mode === 'modifyselected') {
        dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('Add to selected'), 'default': false, disabled: true, value: 'add2', keepOpen: true
            }, {
                label: UILANG.m('Add to selected & close'), 'default': true, disabled: true, value: 'add'
            }],
            contents: "<div class='tmTestAssignDialog' id='TCHOOSER'></div>",
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
            contents: "<div class='tmTestAssignDialog' id='TCHOOSER'></div>",
            title: UILANG.m('Assign test'),
            width: 950,
            callback: addTestToStructureList
        };
    }
    window.testsBrowser = new nxDialog('addItemsDialog', dialogData);

    gui.extra1 = createFlexSection('TCHOOSER', 'extra001', 905, 905, 0, 'tmTestAssignSection');
    gui.boxes.tests = createFlexBox(gui.extra1, 'testChooser', {
        minHeight: 500, flex: 1, noPadding: true
    });

    $('#testChooser').append(
        "<div class='tmTestAssignLayout'>" +
            "<div class='tmTestAssignFileColumn'><div id='testsBrowserContainer'></div></div>" +
            "<div class='tmTestAssignRightColumn'>" +
                "<div id='testsContainerToolBar'></div>" +
                "<div id='igPreviewZone'><div class='tmTestAssignEmptyState'>" + UILANG.m('Select a test to preview its structure.') + "</div></div>" +
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
    gui.library2 = new FileManager("#testsBrowserContainer", "_tests", [], testbreadcrumbs, testsOpPermissions, false, testsLibraryEvent);

    function clickSearch() {
        gui.library2.filerSearch('', {metaSearch: true});
    }

    function clearTestSelectionState() {
        testSelection = null;
        testPresent = false;
        testsBrowser.disableButton('add');
        testsBrowser.disableButton('add2all');
        testsBrowser.disableButton('add2');
        testsBrowser.disableButton('add2all2');
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
                    clearTestSelectionState();
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
            case 'onMetaSearchRequest':
                startAjax('testsSearch', {...data, searchMode: 'meta'});
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
                            testType: bulkTestType(testSelection[0]),
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
                        gui.library2.clearSelection();
                        clearTestSelectionState();
                    }
                    break;
                case 'wizard':
                case 'add2selected':
                case 'modifyselected':
                    if (testSelection) {
                        let objInsert = {
                            testType: bulkTestType(testSelection[0]),
                            name: testSelection[0].name,
                            ID: testSelection[0].dbId,
                            hiddenID: testSelection[0].dbId
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
                        clearTestSelectionState();
                    }
                    break;
            }
        }
    }
}

function editOverrides() {
    const orSetgs = serverData.testLevel.overrides;

    if (orSetgs['true']) delete orSetgs['true'];

    const dialogData = {
        buttons: [{
            label: UILANG.m('cancel'), cancel: true, value: 'cancel'
        }, {
            label: UILANG.m('Save'), default: true, disabled: true, value: 'add'
        }],
        contents: "<div style='height:230px;' id='overridesForm'></div>",
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
        dataId: 'additionalTime', range: '0..100', step: 1, height: 20, width: 33,
        onChange: function (sender, value) {
            orChanged(sender, value, null, 'additionalTime');
        }
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

    //login forwarding toggle
    overrides.loginForwarding = insertToggleswitch(
        orContainer,
        'tsLoginForwarding',
        UILANG.m('Forward login to other OASYS'),
        { dataId: 'loginForwarding', changeCallback: orChanged }
    );

    //forward URL input Test button (shown only when loginForwarding === true)
    const forwardUrlWrap = $(`
        <div id="tsForwardUrlWrap"
             style="
                display:none;
                margin-top:10px;
                padding:8px 10px;
                background:#f3f3f3;
                border:1px solid #ddd;
                border-radius:4px;
                font-size:12px;
             ">
            <div style="margin-bottom:4px; color:#555;">
                ${UILANG.m('Forward URL')}
            </div>
    
            <div style="display:flex; gap:6px; align-items:center;">
                <input id="tsForwardUrl"
                       type="text"
                       placeholder="https://example.org/oasys"
                       style="
                            flex:1;
                            height:24px;
                            font-size:12px;
                            box-sizing:border-box;
                       "
                />
                <button id="tsForwardUrlTest"
                        type="button"
                        class="nxButton"
                        style="height:24px; padding:0 10px;">
                    ${UILANG.m('Test')}
                </button>
            </div>
    
            <div id="tsForwardUrlStatus"
                 style="
                    margin-top:6px;
                    font-size:11px;
                    min-height:14px;
                 "></div>
        </div>
    `);


    orContainer.append(forwardUrlWrap);

    // Keep a deep copy for changes
    serverData.testLevel.overridesChanged = $.extend(true, {}, orSetgs);
    const saveOverridesChanged = serverData.testLevel.overridesChanged;

    // Initialize controls from stored settings
    $.each(orSetgs, function (key, value) {
        if (key === 'disableTimer') {
            if (value === true) overrides.additionalTime.hide(0);
            else overrides.additionalTime.show(0);
        }

        if (key === 'loginForwarding') {
            if (value === true) $('#tsForwardUrlWrap').show(0);
            else {
                $('#tsForwardUrlWrap').hide(0);
                setTestStatus('');
            }
        }

        if (key === 'forwardUrl') {
            $('#tsForwardUrl').val(value || '');
            return;
        }

        if (overrides[key] && typeof overrides[key].reset === 'function') {
            overrides[key].reset(value);
        }
    });

    // If loginForwarding is true but forwardUrl not present, still show input
    if (orSetgs.loginForwarding === true) {
        $('#tsForwardUrlWrap').show(0);
    }

    // URL input change handling -> save into overridesChanged
    $('#tsForwardUrl').on('input change', function () {
        overridesSaver.enableButton('add');
        saveOverridesChanged.forwardUrl = $(this).val();
        setTestStatus('');
    });

    // Test button -> server-side validation; result comes back via ajaxSuccess()
    $('#tsForwardUrlTest').on('click', function () {
        const url = normalizeBaseUrl($('#tsForwardUrl').val());

        if (!url) {
            setTestStatus(UILANG.m('Please enter a URL.'));
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            setTestStatus(UILANG.m('Please enter a full URL including http:// or https://'));
            return;
        }

        $('#tsForwardUrlTest').prop('disabled', true);
        setTestStatus(UILANG.m('Checking OASYS instance...'));

        // Call backend
        startAjax('checkForwardUrl', { url: url });
    });

    // Provide a hook for ajaxSuccess(res) to update THIS dialog instance.
    // In ajaxSuccess, call: if (window._forwardUrlTestCb) window._forwardUrlTestCb(res);
    window._forwardUrlTestCb = function (res) {
        try {
            if (!res || res.action !== 'checkForwardUrl') return;

            if (res.ok === true && res.version) {
                const msg = res.statusText || ('OASYS v=' + res.version + ' ' + UILANG.m('found'));
                const level = (res.supported === true) ? 'ok' : 'err';   // unsupported should be red
                setTestStatus(msg, level);
            } else {
                const msg = res.reason || UILANG.m('Reached URL, but no OASYS found');
                setTestStatus(msg, 'err');
            }
        } finally {
            $('#tsForwardUrlTest').prop('disabled', false);
        }
    };



    function saveOverrides(btnClicked) {
        if (btnClicked === 'add') {
            startAjax('saveOverrides', {
                overrides: saveOverridesChanged,
                id: serverData.testLevel.id
            });
        }
    }

    // Callbacks ToggleSwitches + Spinner
    function orChanged(sender, value, dummy, dataId) {
        if (sender === 'tsDisableTimer' && value === true) {
            overrides.additionalTime.hide(200);
        } else if (sender === 'tsDisableTimer') {
            overrides.additionalTime.show(200);
        }

        if (sender === 'tsLoginForwarding') {
            if (value === true) {
                $('#tsForwardUrlWrap').show(200);
                saveOverridesChanged.forwardUrl = $('#tsForwardUrl').val() || saveOverridesChanged.forwardUrl || '';
            } else {
                $('#tsForwardUrlWrap').hide(200);
                setTestStatus('');
            }
        }

        overridesSaver.enableButton('add');
        saveOverridesChanged[dataId] = value;
    }

    function normalizeBaseUrl(url) {
        if (!url) return '';
        return ('' + url).trim().replace(/\/+$/, '');
    }

    function setTestStatus(msg, level) {
        const $el = $('#tsForwardUrlStatus');
        $el.text(msg)
            .removeClass('oasysStatusOk oasysStatusErr')
            .addClass(level === 'ok' ? 'oasysStatusOk' : 'oasysStatusErr');
    }
}


//CallbackHandling Tests assigned to password (sortableTable)
function wtestsChanged(deleted, id, currValue) {
    wizardData.structure[wizardData.currentPwId] = currValue;
    if (mode === 'modifyselected') {
        $('#tmBulkModifyTestsSummary').text(
            currValue.length === 1
                ? '1 ' + UILANG.m('test selected')
                : currValue.length + ' ' + UILANG.m('tests selected')
        ).prop('disabled', currValue.length === 0);
    }
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
    const sortedKeys = Object.keys(wizardData.metaTags).sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
    updateMetaTagCounter('#wMetaTbText', sortedKeys.length);
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
        const message = sf(
            '<div class="tmActionConfirm tmActionConfirm-warning">' +
                '<strong>' + UILANG.m('Ready to remove test') + '</strong>' +
                '<span>' + UILANG.m('This test has recorded data. Removing test ID %@ will also delete the recorded data.') + '</span>' +
                '<p class="tmActionConfirmNote">' + UILANG.m('This action is irreversible.') + '</p>' +
            '</div>',
            escapeHtml(deleted)
        );
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
            type: 'warning'
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
        }], contents: formatActionErrorMessage(msg), width: 600, title: UILANG.m("Error"), type: 'error'
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

function showMsgNoSrchResults(msg, searchTerm, component, searchOptions) {
    function showMsgNoSrchResultsCB(button) {
        if (button === 'new') {
            component.filerSearch(searchTerm, searchOptions || {});
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
        type: 'warning'
    };
    new nxDialog('Message', dialogData);
}

/* server communication */
function startAjax(action, data) {
    waitDialog.show();
    const requestToken = data && data._requestToken;
    const payload = data ? Object.assign({}, data) : {};
    delete payload._requestToken;
    const params = {
        action: action, data: JSON.stringify(payload)
    };
    return $.ajax({
        data: params,
        success: function(res) {
            if (typeof requestToken !== 'undefined') res._requestToken = requestToken;
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
    const jsonError = jqXHR.responseJSON && jqXHR.responseJSON.fatalError;
    const responseText = typeof jqXHR.responseText === 'string' ? jqXHR.responseText.trim() : '';
    const errorMessage = jsonError
        ? jsonError
        : '<strong>' + UILANG.m('The server returned an invalid response.') + '</strong>' +
          (responseText ? '<br><code class="tinyCode">' + escapeHtml(responseText) + '</code>' : '');
    const dialogData = {
        buttons: [{
            label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
        }], contents: errorMessage, title: 'Error: ' + errorThrown, width: 500
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
            contents: formatActionErrorMessage('<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.fatalError),
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
            contents: formatActionErrorMessage('<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.error + '<br>' + errorDetails),
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
        case 'checkForwardUrl':
            if (window._forwardUrlTestCb) window._forwardUrlTestCb(res);
            if (window._wizardForwardUrlTestCb) window._wizardForwardUrlTestCb(res);
            break;
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
            window.permList = res.permList; // used for selective button enabling
            setLibPerms();
            if (res.data.select) {
                gui.library.setSelection([{
                    id: res.data.select
                }], {
                    preserveScroll: preserveLibraryScrollOnNextSelection
                });
                if (mode === 'browsing' &&
                    refreshPreviewAfterLibraryForTesteeId !== null &&
                    normalizeTestTakerSelectionId(res.data.select) === refreshPreviewAfterLibraryForTesteeId) {
                    const selectedItem = findLibraryItemBySelectionId(res.data.list, res.data.select);
                    refreshPreviewAfterLibraryForTesteeId = null;
                    if (selectedItem) {
                        librarySelection([selectedItem], true);
                    } else {
                        gui.library.getSelect();
                    }
                }
            }
            preserveLibraryScrollOnNextSelection = false;
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
                $('#testID').html('<div class="tmTestAssignPreviewType is-fluid"><span>' + UILANG.m('fluid test') + '</span><span>ID: ' + res.data.id + '</span></div>');
                $('.tmTestAssignPreviewTableHead thead').append("<tr><th>" + UILANG.m('Name fluid testblock') + "</th><th>" + UILANG.m('Pages') + "</th></tr>");
                $.each(res.data.structure.items, function (key, value) {
                    let html;
                    if (value.name === 'Invalid testblock!') {
                        html = sf("<tr class='is-invalid'><td>%@</td><td>%@</td></tr>", value.name, value.numberOfItems);
                    } else {
                        html = sf("<tr><td>%@</td><td>%@</td></tr>", value.name, value.numberOfItems);
                    }
                    $('#testStrucDisplayHTML tbody').append(html);
                })
            } else if (res.data.structure.type === 'mutation') {
                const mutationTestLabel = UILANG.m('mutation test') === 'mutation test' ? 'Mutation Test' : UILANG.m('mutation test');
                $('#testID').html('<div class="tmTestAssignPreviewType is-mutation"><span>' + mutationTestLabel + '</span><span>ID: ' + res.data.id + '</span></div>');
                $('.tmTestAssignPreviewTableHead thead').append("<tr><th>" + UILANG.m('Name linear test') + "</th><th>" + UILANG.m('Pages') + "</th></tr>");
                $.each(res.data.structure.items, function (key, value) {
                    let html;
                    if (value.name === 'Invalid test!') {
                        html = sf("<tr class='is-invalid'><td>%@</td><td>%@</td></tr>", value.name, value.structCount);
                    } else {
                        html = sf("<tr><td>%@</td><td>%@</td></tr>", value.name, value.structCount);
                    }
                    $('#testStrucDisplayHTML tbody').append(html);
                })
            } else {
                $('#testID').html('<div class="tmTestAssignPreviewType is-linear"><span>' + UILANG.m('linear test') + '</span><span>ID: ' + res.data.id + '</span></div>');
                $('.tmTestAssignPreviewTableHead thead').append("<tr><th>" + UILANG.m('Name test page') + "</th><th>" + UILANG.m('Code') + "</th></tr>");
                $.each(res.data.structure.items, function (key, value) {
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
        case 'fetchFolder':
            serverData.testLevel = res.data;
            fillDataFields('editFolder');
            if (editOnData) {
                editSelection('dblclick');
            }
            break;
        case 'fetchTest':
            {
                const responseTestId = res.data && (res.data.dbId || res.data.id);
                if (mode === 'browsing' && typeof res._requestToken !== 'undefined' &&
                    (res._requestToken !== pendingTestLevelToken ||
                        String(responseTestId) !== String(pendingTestLevelId) ||
                        selection.length !== 1 ||
                        !['testee', 'template', 'cloned'].includes(selection[0].type) ||
                        String(selection[0].dbId) !== String(responseTestId))) {
                    return;
                }
            }
            serverData.testLevel = res.data;
            serverData.testLevel.passwords = res.passwords;
            serverData.testLevel.activityData = res.activityData;
            serverData.testLevel.previewResultStats = res.previewResultStats || {};
            serverData.testLevel.templateCloneSummary = res.templateCloneSummary || null;
            updateResetResultsAvailability();
            switchMessage(res.passwords.length);
            correctData();
            if (mode === 'browsing' && !editOnData) {
                let suppressPreviewPlausibility = false;
                if (suppressPreviewPlausibilityForTesteeId !== null && suppressPreviewPlausibilityRemaining > 0) {
                    suppressPreviewPlausibility = String(suppressPreviewPlausibilityForTesteeId) === String(serverData.testLevel.id);
                    if (suppressPreviewPlausibility) {
                        suppressPreviewPlausibilityRemaining -= 1;
                    } else {
                        suppressPreviewPlausibilityRemaining = 0;
                    }
                    if (suppressPreviewPlausibilityRemaining <= 0) {
                        suppressPreviewPlausibilityForTesteeId = null;
                    }
                }
                previewPlausibilityResult = suppressPreviewPlausibility ? {skipped: true} : null;
                renderTesteePreview();
                if (!suppressPreviewPlausibility) {
                    startTesteePreviewPlausibilityCheck();
                }
                break;
            }
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
        case 'testsSearch':
            if (res.data.list.length > 0) {
                gui.library2.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library2, {metaSearch: true});
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
        case 'deleteTemplateClone':
            gui.statusBar.setStatus(UILANG.m('Dataset deleted!'), 3000, '#0A0');
            serverData.testLevel = res.data;
            serverData.testLevel.passwords = res.passwords;
            serverData.testLevel.activityData = res.activityData;
            serverData.testLevel.previewResultStats = res.previewResultStats || {};
            serverData.testLevel.templateCloneSummary = res.templateCloneSummary || null;
            correctData();
            fillDataFields('editTest');
            renderTemplateCloneList();
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
            if (Number(res.deletedRecords || 0) === 0) {
                showResetResultsOutcomeDialog({
                    deleted: false,
                    message: res.resetMode && res.resetMode !== 'all'
                        ? UILANG.m('No results matched the selected date criteria, so no result data was deleted.')
                        : UILANG.m('No result data was available to delete.')
                });
            } else {
                showResetResultsOutcomeDialog({
                    deleted: true,
                    message: res.resetMode && res.resetMode !== 'all'
                        ? UILANG.m('All result data matching the selected date criteria was deleted.')
                        : UILANG.m('All selected result data was deleted.')
                });
            }
            if (serverData.testLevel && serverData.testLevel.template === 'template') {
                startAjax('fetchTest', {
                    dbId: serverData.testLevel.id, location: loc.folder
                });
                break;
            }
            if (currPwId != null) {
                startAjax('fetchTestsAssigned', {
                    id: currPwId, testee: selection[0].dbId
                });
            }
            break;
        case 'resetResultsPassword':
            showResetResultsOutcomeDialog({
                deleted: true,
                message: UILANG.m('All result data associated with the selected password or label was deleted.')
            });
            startAjax('fetchTestsAssigned', {
                id: currPwId, testee: selection[0].dbId
            });
            break;
        case 'resetResultsTest':
            showResetResultsOutcomeDialog({
                deleted: true,
                message: UILANG.m('The result data for the selected test and user was deleted.')
            });
            if (serverData.testLevel && serverData.testLevel.template === 'template') {
                if (currPwId != null) {
                    startAjax('fetchTestsAssigned', {
                        id: currPwId, testee: selection[0].dbId
                    });
                } else {
                    startAjax('fetchTest', {
                        dbId: serverData.testLevel.id, location: loc.folder
                    });
                }
                break;
            }
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
            if (typeof res.hasAnyResults !== 'undefined' && serverData.testLevel.template !== 'template') {
                updateResetResultsAvailability(Boolean(res.hasAnyResults));
            }
            if (typeof res.templateCloneSummary !== 'undefined') {
                serverData.testLevel.templateCloneSummary = res.templateCloneSummary || null;
                serverData.testLevel.previewResultStats = res.previewResultStats || {};
                renderTemplateCloneList();
            }
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
                if (serverData.testLevel.template === 'testee' && res.dataFlag === true) {
                    structureTbButtons.resetPass.show();
                    structureTbButtons.resetPass.enable();
                } else {
                    structureTbButtons.resetPass.disable();
                    if (serverData.testLevel.template === 'template') {
                        structureTbButtons.resetPass.hide();
                    } else {
                        structureTbButtons.resetPass.show();
                    }
                }

            } else {
                $('#noAssignmentMsg').show();
                $('#testPanelList').hide();
                structureTbButtons.copyLink.disable();
                structureTbButtons.resetPass.disable();
                if (serverData.testLevel && serverData.testLevel.template === 'template') {
                    structureTbButtons.resetPass.hide();
                } else {
                    structureTbButtons.resetPass.show();
                }
            }
            if (structureItems && structureItems.length === 1) {
                $(structureTbText).html(structureItems.length + ' ' + UILANG.m('test assigned'));
            } else {
                $(structureTbText).html(structureItems.length + ' ' + UILANG.m('tests assigned'));
            }
            break;
        case 'plausibilityCheck':
            if (typeof res._requestToken !== 'undefined' && res._requestToken === pendingPreviewCheckToken) {
                if (mode === 'browsing') {
                    previewPlausibilityResult = res;
                    renderTesteePreview();
                }
                break;
            }
            // Show results of plausibility check
            if ($("#pCheckErrorDiv").length === 0) {
                $('body').append('<div id="pCheckErrorDiv" style="display:none;"></div>')
            }
            const pbCheckHtml = $('#pCheckErrorDiv');
            pbCheckHtml.empty();

            if(stuLog){
                // No errors found
                if (!res.noPws && !res.pwsWithoutTests && !res.pwsWithDeletedTests) {
                    pbCheckHtml.append(ttPCheckSuccessHtml(UILANG.m('No issues found for this test taker:'), [
                        UILANG.m('Labels have been created.'),
                        UILANG.m('All labels have one or more tests assigned.'),
                        UILANG.m('All assigned tests are still present in the database.')
                    ]));
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
                    pbCheckHtml.append(ttPCheckSuccessHtml(UILANG.m('No issues found for this test taker:'), [
                        UILANG.m('Passwords have been created.'),
                        UILANG.m('All passwords have one or more tests assigned.'),
                        UILANG.m('All assigned tests are still present in the database.')
                    ]));
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
                        label: ttEditTesteeLabel(serverData.testLevel, selection[0]), 'default': true, disabled: false, value: 'edit'
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
            const add2selChanges = res.changes || [];
            const add2selWarnings = res.warnings || [];
            const add2selChangeCount = $(add2selChanges).length;
            const add2selWarningCount = $(add2selWarnings).length;
            const add2selContent = $('<div/>', {'class': 'add2selDialog'}).appendTo(add2selDiv);
            const add2selInfoBox = $('<div/>', {
                id: 'add2selInfoBox',
                'class': 'add2selSummary'
            }).appendTo(add2selContent);

            $('<div/>', {'class': 'add2selSummaryTitle', text: UILANG.m('Operation completed!')}).appendTo(add2selInfoBox);

            const add2selTaskPanel = $('<div/>', {'class': 'add2selPanel'}).appendTo(add2selContent);
            $('<div/>', {
                'class': 'add2selPanelHeader',
                text: add2selChangeCount > 1 ? UILANG.m('Tasks:') : UILANG.m('Task:')
            }).appendTo(add2selTaskPanel);
            const add2selTaskList = $('<ul/>', {'class': 'add2selList add2selTaskList'}).appendTo(add2selTaskPanel);

            $.each(add2selChanges, function (k, v) {
                $('<li/>').html(v).appendTo(add2selTaskList);
            });

            if (add2selWarningCount > 0) {
                $('<div/>', {
                    'class': 'add2selNotice is-warning',
                    text: UILANG.m('Warning:') + ' ' + UILANG.m('The following issues have been detected:')
                }).appendTo(add2selContent);
                const add2selWarningPanel = $('<div/>', {'class': 'add2selPanel add2selWarningPanel'}).appendTo(add2selContent);
                $('<div/>', {'class': 'add2selPanelHeader', text: UILANG.m('Warning:')}).appendTo(add2selWarningPanel);
                const add2selWarningList = $('<ul/>', {'class': 'add2selList'}).appendTo(add2selWarningPanel);
                $.each(add2selWarnings, function (k, v) {
                    $('<li/>').html(v.message || v).appendTo(add2selWarningList);
                });
            } else {
                $('<div/>', {
                    'class': 'add2selNotice is-success',
                    text: UILANG.m('All tasks completed successfully. No issues found!')
                }).appendTo(add2selContent);
            }

            const add2selMsg = {
                buttons: [{
                    label: UILANG.m('Close'), 'default': true, disabled: false, value: 'close'
                }], contentId: 'add2selDiv', title: UILANG.m('Add to selected test takers'), width: 700
            };
            new nxDialog('add2selMsgBox', add2selMsg);

            break;
        case 'bulkModifyExisting':
            if (res.bulkResult) {
                const result = res.bulkResult;
                const modifiedEntryName = bulkModifyContext && bulkModifyContext.analysis.kind === 'student'
                    ? UILANG.m('label')
                    : UILANG.m('password');
                const modifiedEntriesLabel = bulkModifyContext && bulkModifyContext.analysis.kind === 'student'
                    ? UILANG.m('Labels updated')
                    : UILANG.m('Passwords updated');
                mode = 'browsing';
                bulkModifyContext = null;
                selHasStudent = false;
                gui.statusBar.setStatus(UILANG.m('Bulk modification completed successfully!'), 3000, '#0A0');
                startAjax('fetchLibrary', {
                    location: res.id || loc.folder,
                    showBlocked: showBlocked
                });
                let completionContents =
                    '<div class="tmActionConfirm">' +
                        '<strong>' + UILANG.m('Changes saved successfully') + '</strong>' +
                        '<div class="tmActionConfirmMeta"><span>' + modifiedEntriesLabel + '</span><strong>' + result.matched + '</strong></div>';
                if (result.missing) {
                    completionContents +=
                        '<div class="tmActionConfirmMeta"><span>' +
                            sf(UILANG.m('Selected test takers without this %@'), modifiedEntryName) +
                        '</span><strong>' + result.missing + '</strong></div>';
                }
                completionContents += '</div>';
                new nxDialog('bulkModifyExistingComplete', {
                    buttons: [{
                        label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'
                    }],
                    contents: completionContents,
                    title: UILANG.m('Bulk modification completed'),
                    width: 500
                });
            }
            break;
        case 'wizardCreate':
        case 'wizardCreateFromFile':
            abortEditing();
            if (res.importSummary && Number(res.importSummary.imported || 0) === 0) {
                gui.statusBar.setStatus(UILANG.m('No test takers were imported.'), 3000, '#A60');
            } else {
                gui.statusBar.setStatus(UILANG.m('Your test takers (logins) have been created successfully!'), 3000, '#0A0');
            }
            if (res.importSummary && Number(res.importSummary.skipped || 0) > 0) {
                let skipHtml = '<p>' + UILANG.m('Some test takers were skipped because one or more referenced test IDs do not exist or are not accessible for your account.') + '</p><ul>';
                $.each(res.importSummary.skippedDetails || [], function(k, v) {
                    let details = [];
                    if (v.missing && v.missing.length > 0) details.push(UILANG.m('missing test IDs') + ': ' + v.missing.join(', '));
                    if (v.denied && v.denied.length > 0) details.push(UILANG.m('inaccessible test IDs') + ': ' + v.denied.join(', '));
                    skipHtml += '<li><strong>' + escapeHtml(v.name || '') + '</strong> (' + UILANG.m('line') + ' ' + (v.lines || []).join(', ') + '): ' + escapeHtml(details.join('; ')) + '</li>';
                });
                skipHtml += '</ul>';
                new nxDialog('csvImportWarnings', {
                    buttons: [{label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}],
                    contents: '<div class="tmValidationMessage"><div class="tmValidationBody">' + skipHtml + '</div></div>',
                    title: UILANG.m('Import completed with warnings'),
                    type: 'warning',
                    width: 650
                });
            }
            break;
        case 'exportCSV':
            if(res.CSVArray.length<1){
                showMessage(UILANG.m('No list was generated because your selection contains no test takers, or the selected folders are empty.'));
                break;
            }
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
