"use strict";

/**
 * let the IDE know that these variables are created dynamically in PHP
 * @var {string} preSelect
 */

/**
 * @var {string} preType
 */


window.interactionClasses = {};
window.interactionConfigs = {};

$(function() { onReady() });

//prepare local storage variables if undefined
if (localStorage.getItem('jsonMode') === null || localStorage.getItem('jsonMode') === 'undefined') {
    localStorage.setItem("jsonMode", "json");
}

if (localStorage.getItem('expDetail') === null || localStorage.getItem('expDetail') === 'undefined') {
    localStorage.setItem("expDetail", "all");
}

if (localStorage.getItem('expFmt') === null || localStorage.getItem('expFmt') === 'undefined') {
    localStorage.setItem("expFmt", "csv");
}

if (localStorage.getItem('expDelim') === null || localStorage.getItem('expDelim') === 'undefined') {
    localStorage.setItem("expDelim", ",");
}

//GUI elements
let jsph;
let kbHandler;
let waitDialog;
const buttons = {};
let gui = {};
let animationPlaying = false;
let breadcrumbs;
//data loaded from server
const serverData = {
    testLevel: null
};
//details of the selection in the library
let selection = [];
//Starting point for the file manager
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

let statusBarDefault = "";

/* corrections vars */
let testView = []; // holder for standard test view buttons2
let reportView = []; // holder for report builder view buttons2
let msMainView = []; // holder for manual scoring main view buttons2
let msDetailView = []; // holder for manual scoring main view buttons2
let ms_lastTabView = null;
let ms_panels = {};
let scoring = new Scoring();
let pagePos = 0;
let ttl_pagePos = 0;
let tpl_pagePos = 0;
let pg_left = {};
let fluidOrMut = false;
let il_set = false; // if the item list window in scoring value is manually set/changed

/* plotting vars */
let report_config = []; // master object holding report configuration
let report_data = {}; // master object holding report data
let ca_w_set; // if chartArea window calc value has been set yet
let chartAreaWidth; // for calculated chart area width value which is determined dynamically
const dlimgBtns = []; // for plot image download button arrays
let savePlot = []; // saves plot config params
let fromLoad = false; // whether chart building is from saved entry
let layoutData = []; // live (and updated) plot data used for saving updated layout info.
let loadLD = []; // temp var used when loading chart layout data from saved entry
let lastLoaded = ""; // label name of the last loaded chart (for prepopulating the 'save' field)
let unsavedState = false;
let showInfoState = false;

/* external editor init and config */
let externalEditorSettings = {};
const cmResObj = {};
let cmQ = {};

/***** external editor support *****/

function closeEditor() {
    $("#ms_cmVeil").remove();

    let frame = $('#ms_external_cm_viewer');
    frame.addClass('hidden');
    frame.css('display', 'none');
    frame.removeAttr('src');
    externalEditorSettings = {};
}

function openExternalEditor(editorSettings, init = false) {
    externalEditorSettings = editorSettings;
    let frame = $('#ms_external_cm_viewer');
    frame.removeClass('hidden');
    frame.attr('src', editorSettings.url);
    frame.on('load', function(e) {
        if (e.target.src !== '') {
            frame.off('load');
            if (typeof (frame.get(0).contentWindow.OASYSCOM) !== 'undefined') {
                /* Firefox applies the back button to the contents of the iFrame, causing it to become empty while still
                *  overlaying the OASYS editor and swallowing all pointer events. Therefore we are listening here to
                *  the pagehide event (unload works too, but is deprecated) to enable OASYS to hide the iFrame if the
                *  user chooses to click "back" while the external editor is open. */
                $(frame.get(0).contentWindow).on('pagehide', function() {
                    setTimeout(closeExternalEditor, 250);
                });

                $("body").append("<div id='ms_cmVeil'></div>");
                frame.css('display', 'block');
            }
        }
    });
}

function getExternalQuestion() {
    return cmQ[scoring.pageId][scoring.str2hex(scoring.itemName)] ?? '';
}

function getExternalContext() {
    return 'manualCorrection';
}

function getExternalLanguage() {
    return settings.interfaceLanguage ?? "EN";
}

function getExternalData() {
    return externalEditorSettings.data ?? null;
}

function setExternalData(data) {
    if (typeof (externalEditorSettings.updateCallback) === "function") {
        externalEditorSettings.updateCallback.call(this, data);
    }
}

function closeExternalEditor() {
    $("#ms_cmVeil").remove();

    let frame = $('#ms_external_cm_viewer');
    $(frame.get(0).contentWindow).off('pagehide');
    frame.addClass('hidden');
    frame.css('display', 'none');
    frame.removeAttr('src');
    externalEditorSettings = {};
    setTimeout(() => {
        $('.nxButton').removeClass("nxButtonHovered");
    }, 0);
}

// global vars for blocked object handling
let curFFlist = null;
let showBlocked = false;

function onReady() {

    statusBarDefault = `<strong>${UILANG.m('test results')}</strong>: <span id="sb_submsg">browsing test results</span>`;

    hiddenForm('previewForm', 'post', '../index.php', '_blank', ['action', 'data']);

    $('body').on('dragover', function(e) {
        e.preventDefault();
    });
    $('body').on('drop', function(e) {
        e.preventDefault();
    });
    $(document).on("contextmenu", function(e) {
        e.preventDefault();
        return false;
    });

    $.ajaxSetup({
        type: "POST",
        cache: false,
        dataType: "json",
        timeout: 300000,
        success: ajaxSuccess,
        error: ajaxError,
        url: "resultsActions.php"
    });

    waitDialog = new jsModalWait(UILANG.m('please wait'));
    kbHandler = new jsKeyboardHandler();
    kbHandler.permissionHandler(mayAcceptKeyStrokes);
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('BACKSPACE');
    kbHandler.registerShortcut('CR', function() {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });

    initGUI();
    gui = {
        boxes: {},
        testLevel: {}
    };

    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        message: statusBarDefault
    });
    // close report builder button2
    buttons.closeRptBld = new jsButton2($('header'), 'bCloseRptBld', {
        label: UILANG.m('Close Report'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: closeRptBld,
        disabled: false
    });

    insertVerticalDivider('header', 'vd_reportView');

    // single plot add button
    buttons.addSinglePlot = new jsButton2($('header'), 'baddSinglePlot', {
        label: UILANG.m('Add Single Plot'),
        icon: '../images/toolbarIcons/ic_tb_addSingleplot.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: singlePlotStart,
        disabled: false
    });

    // subplot add button
    buttons.addMultiPlot = new jsButton2($('header'), 'baddMultiPlot', {
        label: UILANG.m('Add Multiplot'),
        icon: '../images/toolbarIcons/ic_tb_addMultiplot.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: multiPlotStart,
        disabled: false
    });

    // custom text add button
    buttons.addCustomText = new jsButton2($('header'), 'baddCtext', {
        label: UILANG.m('Add Custom Text'),
        icon: '../images/toolbarIcons/ic_tb_addText_1.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: freeTextStart,
        disabled: false
    });

    // page break add button
    buttons.pbAdd = new jsButton2($('header'), 'bAddPb', {
        label: UILANG.m('Add Page Break'),
        icon: '../images/toolbarIcons/ic_tb_pageBreak.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: pageBreakStart,
        disabled: false
    });

    insertVerticalDivider('header', 'vd_reportView');

    // plot save button
    buttons.savePlot = new jsButton2($('header'), 'bsavePlot', {
        label: UILANG.m('Save Report'),
        icon: '../images/toolbarIcons/ic_tb_saveButton.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: saveChart,
        disabled: true
    });

    // plot load button
    buttons.loadPlot = new jsButton2($('header'), 'bloadPlot', {
        label: UILANG.m('Load/Remove Report'),
        icon: '../images/toolbarIcons/ic_tb_openReport.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: loadChart
    });

    insertVerticalDivider('header', 'vd_reportView');

    // generate report button in report builder button2
    buttons.genRpt = new jsButton2($('header'), 'bGenRpt', {
        label: UILANG.m('Generate PDF Report'),
        icon: '../images/toolbarIcons/ic_tb_savePDF.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: pdfPlotGen,
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
    insertVerticalDivider('header', 'vd_testView');
    buttons.exportAnswers = new jsButton2($('header'), 'bExportAnswers', {
        label: UILANG.m('Download answers'),
        icon: '../images/toolbarIcons/ic_tb_results.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: () => exportAnswers(),
        disabled: true
    });

    buttons.exportScore = new jsButton2($('header'), 'bExportScore', {
        label: UILANG.m('Download score'),
        icon: '../images/toolbarIcons/ic_tb_downloadScore.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: () => exportScore(),
        disabled: true
    });

    buttons.exportTiming = new jsButton2($('header'), 'bExportTiming', {
        label: UILANG.m('Download time spent'),
        icon: '../images/toolbarIcons/ic_tb_getTimeSpent.svg',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: () => exportBehaviour_timing(),
        disabled: true
    });

    insertVerticalDivider('header', 'vd_test2');

    // report builder button2
    buttons.reportBuilder = new jsButton2($('header'), 'bReportBuilder', {
        label: UILANG.m('Report Builder'),
        icon: '../images/toolbarIcons/ic_tb_reportBuilder.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: reportBuilder,
        disabled: true
    });

    // close manual scoring list section
    buttons.closeMSmain = new jsButton2($('header'), 'bCloseMSmain', {
        label: UILANG.m('Close scoring'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: ms_closeManScoreList,
        disabled: false
    });

    insertVerticalDivider('header', 'vd_ms1');

    // close manual scoring detail section
    buttons.closeMSdetail = new jsButton2($('header'), 'bCloseMSdetail', {
        label: UILANG.m('Close Manual Scoring'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: ms_closeManScoreDetail,
        disabled: false
    });

    insertVerticalDivider('header', 'vd_ms2');

    // previous test taker switch

    buttons.prevTT = new jsButton2($('header'), 'bPrevTT', {
        labels: {
            t: UILANG.m('Previous Test Taker'),
            q: UILANG.m('Previous Test Page')
        },
        icons: {
            t: '../images/toolbarIcons/ic_tb_previousTT.png',
            q: '../images/toolbarIcons/ic_tb_previousQuestion.png'
        },
        mode: 't',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: function() {
            ms_scoreDetailScreen(prev_tt_entry, true);
        },
        disabled: false
    });

    // next test taker switch
    buttons.nextTT = new jsButton2($('header'), 'bNextTT', {
        labels: {
            t: UILANG.m('Next Test Taker'),
            q: UILANG.m('Next Test Page')
        },
        icons: {
            t: '../images/toolbarIcons/ic_tb_nextTT.png',
            q: '../images/toolbarIcons/ic_tb_nextQuestion.png'
        },
        mode: 't',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: function() {
            ms_scoreDetailScreen(next_tt_entry, true);
        },
        disabled: false
    });

    function kbPopup() {
        new nxDialog('kbHelperDiag', {
            contents: /* html */ `
                <h2 style="text-align: center;">${UILANG.m("Keyboard &amp; Mouse Shortcut Guide")}</h2>
                <hr>
                <table id="ms_kbhTable">
                    <tr><td colspan="2" class='ms_kbh_sect'>${UILANG.m("Test/Test Taker Navigation")}</td></tr>
                    <tr><td>Up Arrow</td><td>${UILANG.m("Move to next item in question/test taker list.")}</td></tr>
                    <tr><td>Down Arrow</td><td>${UILANG.m("Move to previous item in question/test taker list.")}</td></tr>
                    <tr><td>ALT+N</td><td>${UILANG.m("Move to next entry.")}</td></tr>
                    <tr><td>ALT+P</td><td>${UILANG.m("Move to previous entry.")}</td></tr>
                    <!-- <tr><td>Mouse Wheel Up/Down</td><td>${UILANG.m("Move up/down in question/test taker list when pointer is on<br>list or scoring area.")}</td></tr> -->
                    <tr><td colspan="2" class='ms_kbh_sect'>${UILANG.m("Comments")}</tr>
                    <tr><td>ALT+C</td><td>${UILANG.m("Focus on comment field.")}</td></tr>
                    <tr><td>ALT+S</td><td>${UILANG.m("Save comment (when comment field has text).")}</td></tr>
                    <tr><td colspan="2" class='ms_kbh_sect'>${UILANG.m("Scoring")}</td></tr>
                    <tr><td>1, 2, 3, etc.</td><td>${UILANG.m("Assign <em>n</em> points (decimals are allowed in increments of 0.5).")}</td></tr>
                    <tr><td>Right Arrow</td><td>${UILANG.m("Increment score value by 0.5")}</td></tr>
                    <tr><td>Left Arrow</td><td>${UILANG.m("Decrement score value by 0.5")}</td></tr>
                    <tr><td colspan="2" class='ms_kbh_sect'>${UILANG.m("Test Page Navigation")}</td></tr>
                    <tr><td>Shift + Left Arrow</td><td>${UILANG.m("Navigate leftward amongst items within a multi-question test page.")}</td></tr>
                    <tr><td>Shift + Right Arrow</td><td>${UILANG.m("Navigate rightward amongst items within a multi-question test page.")}</td></tr>
                </table>
            `,
            width: 650,
            title: UILANG.m("Keyboard Help"),
            buttons: [{
                value: 'ok',
                label: UILANG.m("OK"),
                'default': true
            }]
        });
    }

    testView = [buttons.searchFiler, buttons.exportAnswers, buttons.exportScore, buttons.exportTiming, buttons.reportBuilder];
    reportView = [buttons.closeRptBld, buttons.addSinglePlot, buttons.addMultiPlot, buttons.genRpt, buttons.savePlot, buttons.loadPlot, buttons.addCustomText, buttons.pbAdd];
    msMainView = [buttons.closeMSmain];
    msDetailView = [buttons.closeMSdetail, buttons.nextTT, buttons.prevTT];

    reportView.forEach(b => { b.hide(); });
    msMainView.forEach(b => { b.hide(); });
    msDetailView.forEach(b => { b.hide(); });

    $('[id^="vd_reportView"]').hide();
    $('[id^="vd_ms"]').hide();

    gui.s1 = createFlexSection('UI', 'sect001', 450, 450); // tests
    gui.s2 = createFlexSection('UI', 'sect002', 450, 450); // test details
    gui.s3 = createFlexSection('UI', 'sect003', 450, 400); // report builder
    gui.s4 = createFlexSection('UI', 'sect004', 450, 450, 1); // report plot preview
    gui.s5 = createFlexSection('UI', 'sect005', 450, 450, 1); // test score summary overview (main screen)
    gui.s6 = createFlexSection('UI', 'sect006', 450, 450, 1); // scoring selection screen

    ms_panels.left_section = createFlexSection('UI', 'ms_left_section', 450, 450, 0); // question detail left pane
    ms_panels.right_section = createFlexSection('UI', 'ms_right_section', 450, 450, 1); // question detail right pane


    gui.boxes.tests = createFlexBox(gui.s1, 'testList', {
        title: UILANG.m('Tests'),
        minHeight: 480,
        flex: 1,
        noPadding: true
    });

    /* eye icon toggle for blocked items */

    $('#title_testList').append( /* html */ `<img data-val=0 id="bv_toggle" src="../images/flexSectionToolBar/ic_flex_locked_shown.png" alt=""/>`);

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

        results_startAjax('fetchLibrary', {
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

    gui.boxes.overview = createFlexBox(gui.s2, 'overview', {
        title: UILANG.m('Overview'),
        minHeight: 480,
        flex: 1,
        panelHeight: 30
    });

    gui.boxes.report = createFlexBox(gui.s3, 'report', {
        title: UILANG.m('Report Builder'),
        minHeight: 480,
        panelHeight: 30
    });

    gui.boxes.plotPreview = createFlexBox(gui.s4, 'plotPreview', {
        title: UILANG.m('Plot Preview'),
        minHeight: 480,
        flex: 1,
        panelHeight: 30
    });

    gui.boxes.mscore_main = createFlexBox(gui.s6, 'mainManScore', {
        title: UILANG.m('Test Taker Score List')
    });

    /* define question detail left panel flexbox */
    ms_panels.left_section.box = createFlexBox(ms_panels.left_section, 'questionListBox', {
        title: UILANG.m('Question/Answer List'),
        minHeight: 480,
        flex: 1
    });

    /* define question detail right panel of question detail section */
    ms_panels.right_section.box = createFlexBox(ms_panels.right_section, 'ms_qDetailBox', {
        title: UILANG.m('Question/Answer Detail'),
        minHeight: 480,
        flex: 1
    });

    /* configure sectional inner elements */
    gui.boxes.overview.getInnerBox().append('<div id="resultsOverviewList"></div>');
    gui.boxes.overview.getPanel().append('<div id="resultsOverviewHeader"></div>');
    gui.s2.fadeOut(0);
    // rpt builder + plot preview section
    gui.boxes.report.getInnerBox().append('<div id="reportOverviewList"></div>');
    gui.boxes.report.getPanel().append('<div id="reportOverviewHeader"></div>');
    gui.s3.fadeOut(0);
    gui.s4.fadeOut(0);
    gui.s5.fadeOut(0);
    // manual scoring list section
    gui.boxes.mscore_main.getInnerBox().append('<div id="scoremainOverviewList"></div>');
    gui.boxes.mscore_main.getPanel().append('<div id="scoremainOverviewHeader"></div>');
    gui.s6.fadeOut(0);
    // manual scoring detail section
    /* define inner DIVs inside respective flexbox containers */
    ms_panels.right_section.box.getInnerBox().append("<div id='ms_page'></div>");

    ms_panels.left_section.fadeOut(0);
    ms_panels.right_section.fadeOut(0);


    //File Manager
    const fileOpPermissions = {
        copyFolders: false,
        copyItems: false,
        copyMultiple: false,
        cutFolders: false,
        cutItems: false,
        cutMultiple: false
    };
    breadcrumbs = [{
        id: 1,
        name: "Home"
    }];
    gui.library = new fileMgr("#testList", "_idSuffix", [], breadcrumbs, fileOpPermissions, false, libraryEvent, 'all', true);

    preSelect = Number(preSelect);
    preType = Number(preType);

    if (preSelect && preType && typeof preSelect === 'number' && typeof preType === 'number') {
        results_startAjax('fetchPreSelect', {
            id: preSelect,
            type: preType
        });
    } else {
        //get library contents
        results_startAjax('fetchLibrary', {
            location: loc.folder,
            showBlocked: showBlocked
        });
    }
    jsph = jsPointerHandler.instance;
}

function mayAcceptKeyStrokes() {
    return !waitDialog.busy() && !animationPlaying;
}

function libraryEvent(type, data) {
    switch (type) {
        case 'clear':
            if (curFFlist !== null) paintBlocked(curFFlist);
            break;
        case 'getSelect':
        case 'getSelectKeys':
            if (data.length > 0) {
                selection = data;
                if (data[0]['type'] !== 'folder') {
                    serverData.testname = data[0]['name'];
                    results_startAjax('fetchTestResultOverview', {
                        selectedTest: data[0]['dbId'],
                        location: loc.folder
                    });
                } else {
                    buttons.exportAnswers.disable();
                    buttons.exportTiming.disable();
                    buttons.exportScore.disable();
                    buttons.reportBuilder.disable();
                    gui.s2.fadeOut(0);
                    gui.s5.fadeOut(0);

                }
            }
            break;
        case 'onNavigate':
            buttons.exportAnswers.disable();
            buttons.exportTiming.disable();
            buttons.exportScore.disable();
            buttons.reportBuilder.disable();
            oldLoc = cloneObj(loc);
            loc.folder = data.dbId;

            results_startAjax('interactionCheck', {
                location: loc.folder,
                locInfo: loc,
                selInfo: data,
                libType: 'navigate'
            }).then((res) => {
                if (res.error) {
                    return;
                } else {
                    results_startAjax('fetchLibrary', {
                        location: loc.folder,
                        current: oldLoc,
                        showBlocked: showBlocked
                    });
                    gui.s2.fadeOut(0);
                }
            });

            break;
        case 'onBreadcrumbNavigate':
            buttons.exportAnswers.disable();
            buttons.exportTiming.disable();
            buttons.exportScore.disable();
            buttons.reportBuilder.disable();
            oldLoc = cloneObj(loc);
            loc.folder = data;
            results_startAjax('fetchLibrary', {
                location: loc.folder,
                current: oldLoc,
                showBlocked: showBlocked
            });
            gui.s2.fadeOut(0);
            gui.s5.fadeOut(0);
            break;
        case 'onSearchRequest':
            results_startAjax('search', {
                searchString: data
            });
            break;
        case 'onSearchItemClick':
            oldLoc = cloneObj(loc);
            loc.folder = data.pid.replace(/^\D*/i, '');
            results_startAjax('fetchLibrary', {
                location: loc.folder,
                select: data.id,
                showBlocked: showBlocked
            });
            break;
        case 'onWatchListToggle':
            results_startAjax('updateWatchList', {
                id: parseInt(data.id),
                status: data.status,
                type: data.type
            });
            break;
    }
}

function clickSearch() {
    gui.library.filerSearch();
}

function editSelection() {
    if (selection[0].type === "folder") {
        buttons.exportAnswers.disable();
        buttons.exportTiming.disable();
        buttons.exportScore.disable();
        buttons.reportBuilder.disable();
        oldLoc = cloneObj(loc);
        loc.folder = selection[0].dbId;
        results_startAjax('fetchLibrary', {
            location: loc.folder,
            current: oldLoc,
            showBlocked: showBlocked
        });
        gui.s2.fadeOut(0);
        gui.s5.fadeOut(0);
    }
}

function exportAnswers(expAnsOpts, button) {

    $('[id^="date_"]').datepicker("hide");

    let setExpOpts; // internal holder for options being set

    if (!button) {
        setExpOpts = {
            mode: localStorage.getItem('jsonMode'),
            fmt: '',
            delim: localStorage.getItem("expDelim"),
            sd: "",
            ed: ""
        };
        const dialogData = {
            buttons: [{
                label: UILANG.m('Cancel'),
                'cancel': true,
                value: 'cancel'
            },
            {
                label: UILANG.m('Download Report'),
                'default': true,
                value: 'dl'
            }
            ],
            title: UILANG.m('Download Results Report'),
            width: 600,
            contents: /* html */ `
			<div>

				<div style='display: block; padding-bottom: 10px; border-bottom: 1px solid #ccc'>
					<strong> ${UILANG.m('Export Options')}:</strong>
				</div>

				<div id="optItems" style="padding-top: 10px;"></div>

			</div>
			`,
            callback: exportAnswers
        };

        let ansDiag = new nxDialog('reportDlDialog', dialogData, [setExpOpts]);

        /* Date filtering section */

        // start date input init
        insertTextfield($('#optItems'), "date_start", UILANG.m("Set Start Date (optional)"));
        $('#date_start').prop("placeholder", UILANG.m("DD-MM-YYYY starting date"));

        $('#date_start').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.sd = dt;
            },
            onClose: function() {
                if (isValidDate($('#date_start').val()) === true) {
                    $('#date_end').datepicker("option", "minDate", this.value);
                } else {
                    $('#date_end').datepicker("option", "minDate", null);
                }
            }
        });

        // handler for manual entry
        $('#date_start').on("input", function() {

            if (isValidDate(this.value) === true) {
                let sdParts = this.value.split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = $("#date_end").val().split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison

                if (sDate > eDate || sDate > tDate) {
                    dateErrMsg(UILANG.m("Start Date must be older than End Date (when specified), and not beyond the current date."));
                    this.value = "";
                    $('#date_end').datepicker("option", "minDate", null);
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    ansDiag.disableButton("dl");
                } else { // this means date value field is blank
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                    $(this).css("color", "black");
                }
            }
            setExpOpts.sd = this.value;
        });

        // end date input init
        insertTextfield($('#optItems'), "date_end", UILANG.m("Set End Date (optional)"));

        $('#date_end').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.ed = dt;
            },
            onClose: function() {
                if (isValidDate(this.value) === true) {
                    $('#date_start').datepicker("option", "maxDate", this.value);
                } else {
                    $('#date_start').datepicker("option", "maxDate", 0);
                }
            }
        });

        // handler for manual entry
        $('#date_end').on("input", function() {
            if (isValidDate(this.value) === true) {

                let sdParts = $("#date_start").val().split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = this.value.split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison future time comparison

                if (eDate < sDate || eDate > tDate) {

                    dateErrMsg(UILANG.m("End Date must be newer than Start Date, and not beyond the current date."));
                    this.value = "";
                    $('#date_start').datepicker("option", "maxDate", 0);
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    ansDiag.disableButton("dl");
                } else { // this means date value field is blank
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                    $(this).css("color", "black");
                }
            }
            setExpOpts.ed = this.value;
        });

        $('#date_end').prop("placeholder", UILANG.m("DD-MM-YYYY ending date"));

        // add hr between date and rest of the options
        $('#date_end').parent().parent().parent().append('<hr>');

        // make font nicer
        $('[id^="date_"]').css('font-size', 'smaller');

        // blur handler for date fields
        $("#date_start, #date_end").on("blur", function() {
            if (isValidDate(this.value) === false) {
                this.value = "";
                $(this).css("background-color", "initial");
                $(this).css("color", "#000");
                ansDiag.enableButton("dl");
            }
        });

        /* Use JSON toggle switch section */
        const csvOpts = {};
        csvOpts.useJson = insertToggleswitch($('#optItems'), 'tsDisableJson', UILANG.m('Use JSON for data'), {
            dataId: 'useJson',
            changeCallback: jsonOptChanged,
            checked: setExpOpts.mode === 'json'
        });

        /* File type selection section */
        const dlFmt = insertDropdown($('#optItems'), 'dlType', UILANG.m('Download Format'), {
            elements: [{
                label: UILANG.m('Comma Separated (.csv)'),
                value: "csv"
            },
            {
                label: UILANG.m('MS-Excel (.xlsx)'),
                value: "excel"
            },
            {
                label: UILANG.m('Open/Libre office (.ods)'),
                value: "openoffice"
            }
            ],
            onChange: fmtOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            }
        });

        /* Delimiter value selection (for CSV only) */
        const delimSel = insertDropdown($('#optItems'), 'delim', UILANG.m('Delimiter Value (CSV)'), {
            elements: [{
                label: UILANG.m('Comma (,)'),
                value: ","
            },
            {
                label: UILANG.m('Semicolon (;)'),
                value: ";"
            },
            {
                label: UILANG.m('Tab (    )'),
                value: "%09"
            }
            ],
            onChange: delimOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            }
        });

        // synchronize dialog options with what's in localStorage
        dlFmt.reset(localStorage.getItem('expFmt'));
        fmtOptChanged(null, dlFmt.getPropertyField().getValue());
        delimSel.reset(localStorage.getItem('expDelim'));

        // right-align all of our option row property cells
        $('.jsInterfaceRowPropertyCell').css('text-align', 'right');
    }

    // Callbacks ToggleSwitches
    function jsonOptChanged(sender, value) {
        if (value === true) {
            setExpOpts.mode = 'json';
            localStorage.setItem("jsonMode", "json"); // save/remember option
        } else {
            setExpOpts.mode = 'nojson';
            localStorage.setItem("jsonMode", "nojson"); // save/remember option
        }
    }

    function fmtOptChanged(sender, value) {
        setExpOpts.fmt = value;

        // save/remember option
        localStorage.setItem("expFmt", value);

        // show/hide trigger for delimier selection option
        (value !== "csv") ? $('.jsInterfaceRow').last().hide() : $('.jsInterfaceRow').last().show(); // this assumes that the delimiter option will always be the last row
    }

    function delimOptChanged(sender, value) {
        setExpOpts.delim = value;

        // save/remember option
        localStorage.setItem("expDelim", value);
    }

    if (button === 'dl') {
        results_startAjax('fetchTestResults', {
            selectedTest: serverData['id'],
            mode: expAnsOpts.mode,
            format: expAnsOpts.fmt,
            delimiter: expAnsOpts.delim,
            startDate: expAnsOpts.sd,
            endDate: expAnsOpts.ed
        });
    }
}

function exportBehaviour_timing(expAnsOpts, button) {

    $('[id^="date_"]').datepicker("hide");

    let setExpOpts; // internal holder for options being set

    if (!button) {
        setExpOpts = {
            fmt: '',
            delim: localStorage.getItem("expDelim"),
            sd: "",
            ed: ""
        };
        const dialogData = {
            buttons: [{
                label: UILANG.m('Cancel'),
                'cancel': true,
                value: 'cancel'
            },
                {
                    label: UILANG.m('Download Report'),
                    'default': true,
                    value: 'dl'
                }
            ],
            title: UILANG.m('Download time spent'),
            width: 600,
            contents: /* html */ `
			<div>

				<div style='display: block; padding-bottom: 10px; border-bottom: 1px solid #ccc'>
					<strong> ${UILANG.m('Export Options')}:</strong>
				</div>

				<div id="optItems" style="padding-top: 10px;"></div>

			</div>
			`,
            callback: exportBehaviour_timing
        };

        let ansDiag = new nxDialog('reportDlDialog', dialogData, [setExpOpts]);

        /* Date filtering section */

        // start date input init
        insertTextfield($('#optItems'), "date_start", UILANG.m("Set Start Date (optional)"));
        $('#date_start').prop("placeholder", UILANG.m("DD-MM-YYYY starting date"));

        $('#date_start').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.sd = dt;
            },
            onClose: function() {
                if (isValidDate($('#date_start').val()) === true) {
                    $('#date_end').datepicker("option", "minDate", this.value);
                } else {
                    $('#date_end').datepicker("option", "minDate", null);
                }
            }
        });

        // handler for manual entry
        $('#date_start').on("input", function() {

            if (isValidDate(this.value) === true) {
                let sdParts = this.value.split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = $("#date_end").val().split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison

                if (sDate > eDate || sDate > tDate) {
                    dateErrMsg(UILANG.m("Start Date must be older than End Date (when specified), and not beyond the current date."));
                    this.value = "";
                    $('#date_end').datepicker("option", "minDate", null);
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    ansDiag.disableButton("dl");
                } else { // this means date value field is blank
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                    $(this).css("color", "black");
                }
            }
            setExpOpts.sd = this.value;
        });

        // end date input init
        insertTextfield($('#optItems'), "date_end", UILANG.m("Set End Date (optional)"));

        $('#date_end').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.ed = dt;
            },
            onClose: function() {
                if (isValidDate(this.value) === true) {
                    $('#date_start').datepicker("option", "maxDate", this.value);
                } else {
                    $('#date_start').datepicker("option", "maxDate", 0);
                }
            }
        });

        // handler for manual entry
        $('#date_end').on("input", function() {
            if (isValidDate(this.value) === true) {

                let sdParts = $("#date_start").val().split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = this.value.split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison future time comparison

                if (eDate < sDate || eDate > tDate) {

                    dateErrMsg(UILANG.m("End Date must be newer than Start Date, and not beyond the current date."));
                    this.value = "";
                    $('#date_start').datepicker("option", "maxDate", 0);
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    ansDiag.disableButton("dl");
                } else { // this means date value field is blank
                    ansDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                    $(this).css("color", "black");
                }
            }
            setExpOpts.ed = this.value;
        });

        $('#date_end').prop("placeholder", UILANG.m("DD-MM-YYYY ending date"));

        // add hr between date and rest of the options
        $('#date_end').parent().parent().parent().append('<hr>');

        // make font nicer
        $('[id^="date_"]').css('font-size', 'smaller');

        // blur handler for date fields
        $("#date_start, #date_end").on("blur", function() {
            if (isValidDate(this.value) === false) {
                this.value = "";
                $(this).css("background-color", "initial");
                $(this).css("color", "#000");
                ansDiag.enableButton("dl");
            }
        });

        /* File type selection section */
        const dlFmt = insertDropdown($('#optItems'), 'dlType', UILANG.m('Download Format'), {
            elements: [{
                label: UILANG.m('Comma Separated (.csv)'),
                value: "csv"
            },
                {
                    label: UILANG.m('MS-Excel (.xlsx)'),
                    value: "excel"
                },
                {
                    label: UILANG.m('Open/Libre office (.ods)'),
                    value: "openoffice"
                }
            ],
            onChange: fmtOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            }
        });

        /* Delimiter value selection (for CSV only) */
        const delimSel = insertDropdown($('#optItems'), 'delim', UILANG.m('Delimiter Value (CSV)'), {
            elements: [{
                label: UILANG.m('Comma (,)'),
                value: ","
            },
                {
                    label: UILANG.m('Semicolon (;)'),
                    value: ";"
                },
                {
                    label: UILANG.m('Tab (    )'),
                    value: "%09"
                }
            ],
            onChange: delimOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            }
        });

        // synchronize dialog options with what's in localStorage
        dlFmt.reset(localStorage.getItem('expFmt'));
        fmtOptChanged(null, dlFmt.getPropertyField().getValue());
        delimSel.reset(localStorage.getItem('expDelim'));

        // right-align all of our option row property cells
        $('.jsInterfaceRowPropertyCell').css('text-align', 'right');
    }

    // Callbacks ToggleSwitches
    function jsonOptChanged(sender, value) {
        if (value === true) {
            setExpOpts.mode = 'json';
            localStorage.setItem("jsonMode", "json"); // save/remember option
        } else {
            setExpOpts.mode = 'nojson';
            localStorage.setItem("jsonMode", "nojson"); // save/remember option
        }
    }

    function fmtOptChanged(sender, value) {
        setExpOpts.fmt = value;

        // save/remember option
        localStorage.setItem("expFmt", value);

        // show/hide trigger for delimier selection option
        (value !== "csv") ? $('.jsInterfaceRow').last().hide() : $('.jsInterfaceRow').last().show(); // this assumes that the delimiter option will always be the last row
    }

    function delimOptChanged(sender, value) {
        setExpOpts.delim = value;

        // save/remember option
        localStorage.setItem("expDelim", value);
    }

    if (button === 'dl') {
        results_startAjax('fetchBehaviourTiming', {
            selectedTest: serverData['id'],
            format: expAnsOpts.fmt,
            delimiter: expAnsOpts.delim,
            startDate: expAnsOpts.sd,
            endDate: expAnsOpts.ed
        });
    }
}

function reportBuilder() {
    results_startAjax('fetchReportData', {
        testId: serverData['id']
    });

    // disable up/down keys when in report builder mode
    kbHandler.registerShortcut('up', "");
    kbHandler.registerShortcut('down', "");

    // hide test view elements
    hideMenu();
    hideSection(gui.s1, [gui.s1]);
    hideSection(gui.s2, [gui.s2]);
    hideSection(gui.s5, [gui.s5]);
    showSection(gui.s3, [gui.s3]);
    showSection(gui.s4, [gui.s4]);

    // flip jsbutton2 config
    testView.forEach(e => { e.hide(); });
    reportView.forEach(e => { e.show() });

    // start off with save plot button disabled in case it's coming back from close/reopen of report builder
    buttons.savePlot.disable();

    // hide test view button dividers; show report builder dividers
    $('[id^="vd_test"]').hide();
    $('[id^="vd_reportView"]').show();

    // update flexbox title with specific test info
    $('#title_reportBox').html(UILANG.m("REPORT BUILDER FOR TEST ID:") + "  <strong>" + serverData.id + " (" + serverData.testname + ")" + "</strong>");



    // # ------------------------ #
    // # report builder dashboard #
    // # ------------------------ #

    /* Report block title */
    gui.boxes.report.rb_title = insertSubSection(gui.boxes.report.getInnerBox(), 'rb_title');
    gui.boxes.report.rb_title.append(`<div class='aoheader_linear'><em>${serverData.testname}</em> ${UILANG.m("Report Blocks")}</div>`);

    /* Report block data */
    gui.boxes.report.rb_data = insertSubSection(gui.boxes.report.getInnerBox(), 'rb_data', UILANG.m('Report Configuration and Layout'));

    window.rb_table = new jsSortableTable('rb_data', 'rb_table', {
        cssStylesCells: {
            height: "25px"
        },
        cssHeadCells: { "color": "white" },
        cssStylesTable: {
            width: "100%"
        },
        /*  */
        tableHeadDisplay: true,
        tableHead: {
            // id: "Order",
            plotType: UILANG.m("Plot Type"),
            plots: UILANG.m("Plot Data")
        },
        tdSizes: {
            consecutiveNumbers: '15px',
            plotType: "50%"
        },
        elements: [],
        consecutiveNumbers: true,
        hideDeleteLinks: true,
        actionButton: true,
        actionButtonSize: "30px",
        actionButtonImageActive: "../../../images/flexSectionToolBar/ic_flex_tb_delete.png",
        actionButtonImageInactive: "../../../images/flexSectionToolBar/ic_flex_tb_delete.png",
        onChange: function(deleted, _table_id, newOrder) {

            let delIDX = deleted - 1;

            /* handle remove report block if delete action detected */
            if (deleted) {

                // remove physical plot, and dl button area when present
                $(`.rptblock_${delIDX}`).remove();

                // remove entry from savePlot data and layoutData
                savePlot = savePlot.filter(function(sp_entry) {
                    return (sp_entry[4] !== delIDX);
                });

                // remove entry from savePlot data and layoutData
                layoutData = layoutData.filter(function(ld_entry) {
                    return (ld_entry['rptIdx'] !== delIDX);
                });
                delete (report_config[delIDX]);

                unsavedState = true; // since a modification has been made to the table

                // hide report block area when empty and completely reset config holding vars and remove unsavedState flag
                if ($('.data-rows_rb_table').length === 0) {
                    gui.boxes.report.rb_title.hide();
                    gui.boxes.report.rb_data.hide();

                    // disable PDF gen button
                    buttons.genRpt.disable();

                    // disable save chart layout button
                    buttons.savePlot.disable();

                    // remove unsaved state
                    unsavedState = false;

                    report_config = [];
                    layoutData = [];
                    savePlot = [];
                }
            }

            /* handle drag n' drop reordering of report block items */
            if (newOrder.length > 1) {

                // savePlot/layoutData reordering only when an actual reorder, and not from a loadChart()
                if (!fromLoad) {
                    let newSP = [];
                    let newLD = [];

                    newOrder.forEach((e) => {

                        savePlot.map(f => {
                            if (f[4] === e.hiddenID - 1) newSP.push(f);
                        });

                        layoutData.map(f => {
                            if (f.rptIdx === e.hiddenID - 1) newLD.push(f);
                        });
                    });

                    savePlot = newSP.filter(e => e.length !== 0);
                    layoutData = newLD.filter(e => e.length !== 0);
                    unsavedState = true;
                }

                // chart reordering in UI
                newOrder.forEach((e, i, arr) => {
                    let idx = e.hiddenID - 1;

                    if (((i + 1) in arr)) {
                        let chartID = arr[i + 1].hiddenID - 1;
                        let mCharts = $(`.rptblock_${idx}`);

                        $.each(mCharts, function(i, v) {
                            $('.' + v.classList[0]).after($(`.rptblock_${chartID}`));
                        });
                    }
                });
            }
        },
        onClick: function(tblIdx, _src, clkType, delInfo) {
            tblIdx = parseInt(tblIdx);
            if (clkType === "actionButton") {

                /* REPORT BLOCK DELETION ROUTINE */

                let delIDX = delInfo.id;
                let delDesc = delInfo.delLabel;

                // confirmation prompt prior to any action
                new nxDialog("delCBconf", {
                    title: UILANG.m("Confirm Report Block Deletion"),
                    icon: "../images/warning.png",
                    iconWidth: 64,
                    buttons: [{ label: UILANG.m("Cancel"), value: "cancel", 'cancel': true, 'default': true }, { label: UILANG.m("Yes"), value: "yes" }],
                    contents: /* html */ `<p>${UILANG.m("Are you sure you want to delete the following report block? This action is irreversible!")}</p>
                    <p style="font-weight: bold; font-style: italic">${delDesc}</p>`,
                    callback: function(btnVal) {
                        if (btnVal === "yes") {

                            // remove report block row from rb_table
                            rb_table.removeElement(delIDX + 1);

                            // remove physical plot, and dl button area when present
                            $(`.rptblock_${delIDX}`).remove();

                            // remove entry from savePlot data and layoutData
                            savePlot = savePlot.filter(function(sp_entry) {
                                return (sp_entry[4] !== delIDX);
                            });

                            // remove entry from savePlot data and layoutData
                            layoutData = layoutData.filter(function(ld_entry) {
                                return (ld_entry['rptIdx'] !== delIDX);
                            });
                            delete (report_config[delIDX]);

                            unsavedState = true; // since a modification has been made to the table

                            // hide report block area when empty and completely reset config holding vars and remove unsavedState flag
                            if ($('.data-rows_rb_table').length === 0) {
                                gui.boxes.report.rb_title.hide();
                                gui.boxes.report.rb_data.hide();

                                // disable PDF gen button
                                buttons.genRpt.disable();

                                // disable save chart layout button
                                buttons.savePlot.disable();

                                // remove unsaved state
                                unsavedState = false;

                                report_config = [];
                                layoutData = [];
                                savePlot = [];
                            }
                        }
                    }
                })
            } else {

                /* REPORT BLOCK CONFIGURATION OPENING ROUTINE */

                let pt_str = $(`.sTableClickable[data-tdid=${tblIdx}]`).siblings(`[data-fielddesc='plotType']`).html();
                let pd_str = $(`.sTableClickable[data-tdid=${tblIdx}]`).siblings(`[data-fielddesc='plotType']`).next().html();

                if (pt_str.startsWith("single")) {
                    let fName = {
                        fieldName: $(`.sTableClickable[data-tdid=${tblIdx}]`).html(),
                        desc: report_data.items[$(`.sTableClickable[data-tdid=${tblIdx}]`).html()],
                        fullTxt: report_data.items[$(`.sTableClickable[data-tdid=${tblIdx}]`).html()],
                        xcat: report_data.xcat[$(`.sTableClickable[data-tdid=${tblIdx}]`).html()]
                    };

                    if (pd_str.split("_")[0].startsWith("CTXT")) {

                        // let rptIdx = pd_str.split("_")[1];

                        freeTextStart(tblIdx);

                    } else if (pd_str.split("_")[0].startsWith("PBR")) {
                        alert(UILANG.m("Page breaks are not updatable."));
                    }
                    else {
                        singlePlotConf(fName, true, report_data, tblIdx, true);
                    }
                }

                if (pt_str.startsWith("multi")) {
                    multiPlotConf(report_data, tblIdx, true, null);
                }
            }
        }
    });

    // initial hide of RB elements
    gui.boxes.report.rb_title.hide();
    gui.boxes.report.rb_data.hide();

    gui.boxes.report.getInnerBox().prepend("<div id='dsvl_container' style='display: block; width: 100%; padding-bottom: 20px;'></div>");

    /* descriptive stats dialog init */
    new nxButton($("#dsvl_container"), "ds_view_launch", {
        label: UILANG.m("Descriptive Statistics"),
        value: "ok",
        callback: function() {
            new nxDialog("ds_view", {
                buttons: [{
                    label: UILANG.m("Download in CSV"),
                    value: "dl"
                }, {
                    label: UILANG.m("Close"),
                    value: "close",
                    'default': true,
                    'cancel': true
                }],
                title: UILANG.m("Descriptive Statistics"),
                width: 1152,
                contents: /* html */ `
                <div id="stats_table_container">
                    <table id='stats_table'>
                        <tr id='st_header'>
                            <td><span></span></td>
                        </tr>
                    </table>
                </div>
                `,
                callback: function(action) {
                    if (action === "dl") dlStats();
                }
            });

            build_an_table(); // call to table builder
        }
    });

    gui.boxes.plotPreview.pp = insertSubSection(gui.boxes.plotPreview.getInnerBox(), 'chartArea', `<span><strong>${serverData.testname}</strong> ${UILANG.m('PDF preview')}</span>`);
    statusBarDefault = `<strong>${UILANG.m('test results')}</strong>: <span id="sb_submsg">${serverData.testname}</span>`;

    function dlStats() {

        let data = [];
        let rows = document.querySelectorAll("#stats_table tr");

        for (let i = 0; i < rows.length; i++) {
            let row = [], cols = rows[i].querySelectorAll("td, th");

            for (let j = 0; j < cols.length; j++) {
                row.push('"' + cols[j].innerText + '"'); // this allows for commas inside CSV cell element
            }

            data.push(row.join(","));
        }

        let almostFinal = data.join("\n");

        let finalText = "\uFEFF" + almostFinal; // convert final text to Unicode UTF-8 standard since we're using extended chars in the table

        const a = window.document.createElement('a');
        a.href = window.URL.createObjectURL(new Blob([finalText], { type: 'text/csv;charset=utf-8' }));
        a.download = `desc_stats_.csv`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

async function checkUnsaved(onExit) {

    /* check if build chart is unsaved prior to closing */

    let cStr = onExit ? UILANG.m("Unsaved changes detected! If this page is left, all changes will be lost. Do you wish to exit?") : UILANG.m("Unsaved changes detected! If a new report is loaded, all changes will be lost. Do you wish to continue?");

    return new nxDialog('unsavedConf', {
        title: UILANG.m("Confirm Unsaved Changes"),
        contents: cStr,
        returnPromise: true,
        dataFormat: "object",
        buttons: [{
            value: true,
            label: UILANG.m("Yes")
        }, {
            value: false,
            label: UILANG.m("No"),
            'default': true
        }]
    });
}

async function closeRptBld() {

    if (unsavedState) {
        let confExit = await checkUnsaved(true);
        if (!confExit.button) return;
    }

    unsavedState = false;

    /* Reset all required elements to baseline for next report build request */
    report_config = [];
    savePlot = [];
    fromLoad = false;
    layoutData = [];
    loadLD = [];
    lastLoaded = "";

    $('#chartArea').remove();

    // re-enable up/down keys when in standard mode
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('BACKSPACE');
    kbHandler.registerShortcut('CR', function() {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });

    $('#rb_title').remove();
    $('#rb_data').remove();
    $('#an_data').remove();
    $('#an_title').remove();
    $('#dsvl_container').remove();

    // switch back to standard test results view
    showMenu();
    hideSection(gui.s3, [gui.s3]);
    hideSection(gui.s4, [gui.s4]);
    showSection(gui.s1, [gui.s1]);
    showSection(gui.s2, [gui.s2]);
    showSection(gui.s5, [gui.s5]);

    // flip back jsbutton2 config
    testView.forEach(element => { element.show(); });
    reportView.forEach(element => { element.hide() });

    // reset pdf generate to disabled mode
    buttons.genRpt.disable();

    // re-show test view button dividers; hide report view dividers
    $('[id^="vd_test"]').show();
    $('[id^="vd_reportView"]').hide();
}

async function exportScore(expScrOpts, button) {

    let mscheck = await results_startAjax("hasMSleft", { testId: serverData['id'] });
    let hasMsLeft = mscheck.hasMSleft;
    let setExpOpts; // internal holder for options being set

    /* when scoring items are still open */
    if (typeof button === 'undefined' && hasMsLeft) {
        let contOp;
        contOp = await new nxDialog('hasmsDiag', {
            title: UILANG.m("Scoring Items Remaining Warning"),
            returnPromise: true,
            contents: /* html */ `
            <p style="font-weight: bold">${UILANG.m("WARNING!")}</p>
            <p>${UILANG.m("This test contains question items which have not yet been scored. This report should not be used for any final determinations. You may continue or cancel this operation.")}</p>
            `,
            buttons: [{
                value: 'c',
                label: UILANG.m("Cancel"),
                'default': true,
                'cancel': true
            }, {
                value: 'ok',
                label: UILANG.m("Continue"),
                'cancel': true
            }]
        });

        if (contOp.button === 'c') return;
    }
    if (!button) {
        setExpOpts = {
            // scoringModel: '',
            fmt: '',
            detail: localStorage.getItem("expDetail"),
            delim: localStorage.getItem("expDelim"),
            sd: "",
            ed: ""
        };

        const dialogData = {
            buttons: [{
                label: UILANG.m('Cancel'),
                'cancel': true,
                value: 'cancel'
            },
            {
                label: UILANG.m('Download Scoring'),
                'default': true,
                value: 'dl',
            }
            ],
            title: UILANG.m('Download Scoring Results'),
            width: 600,
            contents: /* html */ `
				<div>
					<div style='display: block; padding-bottom: 10px; border-bottom: 1px solid #ccc'>
						<strong>${UILANG.m("Export Options:")}</strong>
					</div>

					<div id="optItems" style="padding-top: 10px;"></div>

				</div>
				`,
            callback: exportScore
        };

        const scrDiag = new nxDialog('scoringDlDialog', dialogData, [setExpOpts]);

        /* Date filtering section */

        // start date input init
        insertTextfield($('#optItems'), "s_date_start", UILANG.m("Set Start Date (optional)"));
        $('#s_date_start').prop("placeholder", UILANG.m("DD-MM-YYYY starting date"));

        $('#s_date_start').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.sd = dt;
            },
            onClose: function() {
                if (isValidDate($('#s_date_start').val()) === true) {
                    $('#s_date_end').datepicker("option", "minDate", this.value);
                } else {
                    $('#s_date_end').datepicker("option", "minDate", null);
                }
            }
        });

        // handler for manual entry
        $('#s_date_start').on("input", function() {
            if (isValidDate(this.value) === true) {
                let sdParts = this.value.split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = $("#s_date_end").val().split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison

                if (sDate > eDate || sDate > tDate) {
                    dateErrMsg(UILANG.m("Start Date must be older than End Date (when specified), and not beyond the current date."));
                    this.value = "";
                    $('#s_date_end').datepicker("option", "minDate", null);
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    scrDiag.disableButton("dl");
                } else { // this means date value field is blank
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            }
            setExpOpts.sd = this.value;
        });

        // end date input init
        insertTextfield($('#optItems'), "s_date_end", UILANG.m("Set End Date (optional)"));

        $('#s_date_end').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.ed = dt;
            },
            onClose: function() {
                if (isValidDate(this.value) === true) {
                    $('#s_date_start').datepicker("option", "maxDate", this.value);
                } else {
                    $('#s_date_start').datepicker("option", "maxDate", 0);
                }
            }
        });

        // handler for manual entry
        $('#s_date_end').on("input", function() {
            if (isValidDate(this.value) === true) {
                let sdParts = $("#s_date_start").val().split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = this.value.split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison

                if (eDate < sDate || eDate > tDate) {

                    dateErrMsg(UILANG.m("End Date must be newer than Start Date, and not beyond the current date."));
                    this.value = "";
                    $('#s_date_start').datepicker("option", "maxDate", 0);
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    scrDiag.disableButton("dl");
                } else { // this means date value field is blank
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            }

            setExpOpts.ed = this.value;
        });

        $('#s_date_end').prop("placeholder", UILANG.m("DD-MM-YYYY ending date"));

        // add hr between date and rest of the options
        $('#s_date_end').parent().parent().parent().append('<hr>');

        // make font nicer
        $('[id^="s_date_"]').css('font-size', 'smaller');

        // blur handler for date fields
        $("#s_date_start, #s_date_end").on("blur", function() {
            if (isValidDate(this.value) === false) {
                this.value = "";
                $(this).css("background-color", "initial");
                $(this).css("color", "#000");
                scrDiag.enableButton("dl");
            }
        });

        /* init file type dropdown option list */
        const dlDetails = insertDropdown($('#optItems'), 'dlDetails', UILANG.m('Level of detail'), {
            elements: [{
                label: UILANG.m('Score for each item'),
                value: "all"
            },
            {
                label: UILANG.m('Total score only'),
                value: "total"
            }
            ],
            onChange: detailOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            },
        });

        const dlFmt = insertDropdown($('#optItems'), 'dlType', UILANG.m('Download Format'), {
            elements: [{
                label: UILANG.m('Comma Separated (.csv)'),
                value: "csv"
            },
            {
                label: UILANG.m('MS-Excel (.xlsx)'),
                value: "excel"
            },
            {
                label: UILANG.m('Open/Libre office (.ods)'),
                value: "openoffice"
            }
            ],
            onChange: fmtOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            },
        });

        /* Delimiter value selection (for CSV only) */
        const delimSel = insertDropdown($('#optItems'), 'delim', UILANG.m('Delimiter Value (CSV)'), {
            elements: [{
                label: UILANG.m('Comma (,)'),
                value: ","
            },
            {
                label: UILANG.m('Semicolon (;)'),
                value: ";"
            },
            {
                label: UILANG.m('Tab (    )'),
                value: "%09"
            }
            ],
            onChange: delimOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            },
        });

        dlDetails.reset(localStorage.getItem('expDetail'));
        dlFmt.reset(localStorage.getItem('expFmt'));
        fmtOptChanged(null, localStorage.getItem('expFmt'));
        delimSel.reset(localStorage.getItem('expDelim'));

        // right-align all of our option row property cells
        $('.jsInterfaceRowPropertyCell').css('text-align', 'right');
    }

    function fmtOptChanged(sender, value) {
        setExpOpts.fmt = value;

        // save/remember option
        localStorage.setItem("expFmt", value);

        // show/hide logic for delimier selection option
        (value !== "csv") ? $('.jsInterfaceRow').last().hide() : $('.jsInterfaceRow').last().show(); // this assumes that the delimiter option will always be the last row
    }

    function delimOptChanged(sender, value) {
        setExpOpts.delim = value;

        // save/remember option
        localStorage.setItem("expDelim", value);
    }

    function detailOptChanged(sender, value) {
        setExpOpts.detail = value;

        // save/remember option
        localStorage.setItem("expDetail", value);
    }

    // Send request on dl button
    if (button === 'dl') {

        await results_startAjax('fetchDetailedTestScore', {
            selectedTest: serverData['id'],
            // scoringModel: scoringModel,
            detail: expScrOpts.detail,
            format: expScrOpts.fmt,
            delimiter: expScrOpts.delim,
            startDate: expScrOpts.sd,
            endDate: expScrOpts.ed
        });
    }
}

/* date picker helper functions */

// date validity checker function
function isValidDate(dval) {
    if (dval.length <= 9) return false;
    if (dval === "") return null;
    try {
        $.datepicker.parseDate("dd-mm-yy", dval);
    } catch (dateErr) {
        return false;
    }
    return true;
}

function dateErrMsg(msg) {
    $('#date_start, #date_end, #s_date_start, #s_date_end').datepicker("hide");
    new nxDialog("DEMDiag", {
        buttons: [{
            label: UILANG.m("OK"),
            value: "ok",
            'default': true
        }],
        title: UILANG.m("Date Input Error"),
        contents: msg
    });
}

//Filemanager Navigation
function cursorUp() {
    gui.library.filerKeyUp();
}

function cursorDown() {
    gui.library.filerKeyDown();
}

function updateLibrary(list, path) {
    if (path) breadcrumbs = path;
    gui.library.setItems(list, breadcrumbs);
}

function handleChars(value) {
    if (value) {
        if (typeof value === 'string' || value instanceof String) {
            value = encodeURIComponent(value);
        }
    }
    return value;
}

function showMsgNoSrchResults(msg, searchTerm, component, button) {
    if (!button) {
        const dialogData = {
            buttons: [{
                label: UILANG.m('New search'),
                value: 'new'
            },
            {
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }
            ],
            contents: msg,
            width: 500,
            callback: showMsgNoSrchResults,
            title: UILANG.m('No search results'),
            icon: '../images/warning.png',
            iconWidth: 64
        };
        new nxDialog('nsrMessage', dialogData, arguments);

    } else {
        if (button === 'new') component.filerSearch(searchTerm);

    }
}

function dataPrep(d) {
    let retData = {};
    retData.c0 = 0;
    retData.c1 = 0;
    retData.c2 = 0;
    retData.c3 = 0;
    retData.c4 = 0;
    retData.c5 = 0;
    retData.cx = 0;

    $.each(d, function(k, v) {
        retData.cx += 1;
        switch (true) {
            case (v.progressField < 21):
                retData.c0 += 1;
                break;
            case (v.progressField > 20 && v.progressField < 41):
                retData.c1 += 1;
                break;
            case (v.progressField > 40 && v.progressField < 61):
                retData.c2 += 1;
                break;
            case (v.progressField > 60 && v.progressField < 81):
                retData.c3 += 1;
                break;
            case (v.progressField > 80 && v.progressField < 100):
                retData.c4 += 1;
                break;
            case (v.progressField === 100):
                retData.c5 += 1;
                break;
        }
    });
    return (retData);
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

/** Returns array buffer from input
 */
function s2ab(s) {
    let buf = new ArrayBuffer(s.length);
    let view = new Uint8Array(buf);
    for (let i = 0; i !== s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
}

/* Plotting and Charting Functions */

/**
 *  Converts a base64 encoded SVG URI image to a maximum quality JPEG (or PNG) at high DPI (300).
 *  This function is required to export image data to PDF on the server side, or as a high
 *  quality PNG for download, without high pixelation. This function returns a promise once
 *  all image processing and conversion routines are fully completed.
 * @return {Promise<String>} resolves to JPEG data url of the image
 */
function b64svgtob64img(svgb64, width, height, fmt = "jpeg") {
    return new Promise(resolve => {
        let img = document.createElement('img');
        img.onload = function() {
            const myImg = document.body.appendChild(img);
            myImg.style.display = "none";
            let canvas = document.createElement("canvas");
            let scaleFactor = 3.125;

            document.body.removeChild(img);
            canvas.width = Math.floor(width * scaleFactor);
            canvas.height = Math.floor(height * scaleFactor);

            canvas.style.width = canvas.style.width || canvas.width + 'px';
            canvas.style.height = canvas.style.height || canvas.height + 'px';

            let ctx = canvas.getContext("2d");
            ctx.scale(scaleFactor, scaleFactor);
            ctx.drawImage(img, 0, 0);
            try {
                let data = canvas.toDataURL(`image/${fmt}`, (fmt === 'jpeg' ? 1 : null));
                resolve(data);
            } catch (e) {
                resolve(null);
            }
        };
        img.src = svgb64;
    });
}

/** Accept binary data and prompt browser to download file.
 */
function dl_prompt(binaryData, mimeSTR, fileName) {
    let a = document.createElement('a');
    // decode BASE64 then convert to arrayBuffer binary (arraybuffer conversion req'd since jquery does not support binary response type)
    let blobObj = new Blob([s2ab(atob(binaryData))], {
        type: mimeSTR
    });

    a.style.display = 'none';
    a.href = URL.createObjectURL(blobObj);
    a.download = fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Revert dashes on spaces with keys (labeling fix)
 */

/**
 * helper fx - deep copy JS object.
 *
 * **WARNING** Only for use for simple objects (can be nested).
 *
 * **ANOTHER WARNING** Not tested with arrays, and will probably fail.
 *
 Dates, functions, undefined, Infinity, [NaN], RegExps, Maps, Sets, Blobs, FileLists, ImageDatas, sparse Arrays, and Typed Arrays will fail.
 * @return {object} Returns full deep-copy of source object (sans functions, etc).
 */
function dc(obj) {
    if (typeof obj !== "object") return obj;
    return JSON.parse(JSON.stringify(obj));
}

function freetextBuilder(button, dataObj, pbIns = false) {
    if (button === "ok") {
        if ((typeof dataObj.pbIns !== "undefined") && dataObj.pbIns) pbIns = true;
        let ct = dataObj.freetext ?? "";
        let t_ct = dataObj.ft_title ?? "";
        let updateMode = (pbIns) ? false : dataObj.updateMode === true; // this is not a mistake -- var comes over as string "false" from nxDialog handling of an intended boolean
        let e_rptIdx = parseInt(dataObj.e_rptIdx);
        let kval = dataObj.kval;
        let fromLoad = dataObj.fromLoad ?? false;
        let fInfo;
        let rptIdx = null;

        if (fromLoad) {
            rptIdx = parseInt(dataObj.rptIdx);
        } else if (updateMode) {
            rptIdx = savePlot.filter(e => e[4] === e_rptIdx)[0][4];
        } else {
            rptIdx = report_config.length;
        }

        /* enable 'save chart' option */
        buttons.savePlot.enable();
        chartAreaInitCheck(rptIdx);

        let pdStub = (pbIns) ? "PBR_" : "CTXT_";

        fInfo = fromLoad ? savePlot.filter(e => e[4] === rptIdx)[0][1] : { desc: t_ct, fieldName: `${pdStub}${rptIdx}` };

        chartAreaWidth = ca_w_set ? chartAreaWidth : parseInt($('div#chartArea.guiSubSection').width()) * 0.95;
        ca_w_set = true;
        $('#chartArea > .guiSubSectionLabelBox').width(chartAreaWidth); // match gui box title width to resized chart area width

        if (updateMode) {
            let spIdx = savePlot.findIndex(e => e[4] === rptIdx);
            let ldIdx = layoutData.findIndex(e => e.rptIdx === rptIdx);

            let newTxtVal = ct;
            let newTitleVal = t_ct;

            report_config[rptIdx][kval].rawText = newTxtVal;
            report_config[rptIdx][kval].ft_title = newTitleVal;

            savePlot[spIdx][0].ft_title = newTitleVal;
            savePlot[spIdx][0].rawText = newTxtVal;
            savePlot[spIdx][1].desc = newTitleVal;
            savePlot[spIdx][5][pdStub + rptIdx].ft_title = newTitleVal;
            savePlot[spIdx][5][pdStub + rptIdx].rawText = newTxtVal;

            layoutData[ldIdx].width = chartAreaWidth;

            let ot_container = $( /* html */ `#otc_${e_rptIdx}`);
            ot_container.empty();
            ot_container.append( /* html */ `<h2 class="ot_header">${fInfo.desc}</h2>`);
            $(`#otc_${e_rptIdx}`).append(/* html */ `<div class="ot_content">${newTxtVal}</div>`);

            ot_container.width(chartAreaWidth);

        } else {
            report_config[rptIdx] = ({
                [fInfo.fieldName]: {
                    [pbIns ? "pb_opt" : "ct_opt"]: true,
                    ft_title: t_ct,
                    rawText: ct,
                    pbIns: pbIns
                }
            });

            layoutData.push({
                width: chartAreaWidth,
                rptIdx: parseInt(rptIdx)
            });

            if (!fromLoad) savePlot.push([{ ft_title: t_ct, rawText: ct }, fInfo, true, "single", rptIdx, report_config[rptIdx], null]);

            $(`#OA_chart_${rptIdx}`).append( /* html */ `<div class="ot_container" id="otc_${rptIdx}"></div>`);
            let ot_container = $( /* html */ `#otc_${rptIdx}`);

            if (!pbIns) ot_container.append( /* html */ `<h2 class="ot_header">${fInfo.desc}</h2>`);
            (pbIns) ? $(`#otc_${rptIdx}`).append(/* html */ `<div data-id="##OARPT_PAGE_BREAK##" class="chart_pb">--${UILANG.m("PAGE BREAK")}--</div>`) : $(`#otc_${rptIdx}`).append(/* html */ `<div class="ot_content">${ct}</div>`);

            ot_container.width(chartAreaWidth);

            // activate RB elements on first/any chart build request
            gui.boxes.report.rb_title.show();
            gui.boxes.report.rb_data.show();
            updateRB(rptIdx, "single", fInfo, null);

        }
    }
}

/* load chart layout */
async function loadChart() {

    let scloaddiag = new nxDialog('scloaddiag_id', {
        title: UILANG.m("Load Report Configuration"),
        dataFormat: "object",
        width: 600,
        datafields: ['cListSel'],
        contents: /* html */ `
            <p>
                <div>${UILANG.m("Select report to load")}</div>
                <div><select size="5" id="cListSel"></div>
            </p>
        `,
        buttons: [{
            value: 'delete',
            label: UILANG.m("Delete"),
            disabled: true
        }, {
            value: 'cancel',
            label: UILANG.m("Cancel"),
            'cancel': true
        }, {
            value: 'ok',
            label: UILANG.m("Ok"),
            'default': true,
            disabled: true
        }],
        callback: function(button) {

            let theId = null;
            let theName = null;

            for (const optData of $('#cListSel')[0].options) {
                if (optData.selected) {
                    theId = optData.id;
                    theName = optData.label;
                }
            }
            dochartLoad(button, theId, theName);
        }

    });

    async function dochartLoad(button, theId, theName) {
        switch (button) {
            case "cancel":
                return;

            case "delete":

                results_startAjax('delChart', { id: theId }).then((res) => {
                    if (!res.error) loadChart();
                });

                break;

            case "ok":

                if (unsavedState) {
                    let confExit = await checkUnsaved(false);
                    if (!confExit.button) return;
                }

                unsavedState = false;

                waitDialog.updateMessage(UILANG.m("Rendering report"));
                waitDialog.show();
                report_config = [];
                $('#chartArea').empty();
                rb_table.clearElements();

                results_startAjax('loadChart', { id: theId }).then(async (res) => {

                    layoutData = [];
                    savePlot = res.data;

                    let im = 0; // counter for mixed single/multi layout loading

                    for (let i = 0; i < savePlot.length; i++) {
                        fromLoad = true;
                        const plotElem = savePlot[i];
                        let isFT = "rawText" in plotElem[0];

                        /* redirect to custom text builder and skip the rest */
                        if (isFT) {
                            freetextBuilder("ok", {
                                freetext: plotElem[0].rawText,
                                ft_title: plotElem[0].ft_title,
                                updateMode: false,
                                e_rptIdx: i,
                                kval: "",
                                fromLoad: true,
                                rptIdx: plotElem[4],
                                pbIns: (plotElem[1].fieldName.startsWith("PBR"))
                            });
                            plotElem[2] = false;
                        }

                        // special multichart config handler
                        if (plotElem[3] === "multi") {
                            plotElem[5].cfg = plotElem[6];
                            plotElem[0].cfg = plotElem[6];
                        }

                        report_config[plotElem[4]] = plotElem[5];

                        // reload saved customizations which would have gone into the 'layout' object key while accounting for single/multi, and layout object counter tracking
                        if (plotElem[3] === "multi" && plotElem[6].m_type !== "pl") {
                            let layoutMulti = [];

                            for (let j = 0; j < plotElem[5].length; j++) {
                                layoutMulti.push(res.layoutData[im + j]);
                            }

                            im += plotElem[5].length;
                            loadLD = layoutMulti;
                        } else {
                            loadLD = res.layoutData.filter(e => (e.rptIdx === plotElem[4]));
                            loadLD = loadLD[0];

                            im++;
                        }

                        await buildChart(plotElem[0], plotElem[1], plotElem[2], plotElem[3], plotElem[4]);
                    }

                    waitDialog.hide();
                    waitDialog.updateMessage(UILANG.m("please wait"));
                    fromLoad = false;

                    lastLoaded = theName;
                });

                loadLD = [];

                break;
        }
    }

    let res = await results_startAjax('getChartList', {
        testId: serverData.id
    });
    let cList = res.chartList;

    for (const i of cList) {
        $('#cListSel').append($('<option>', { 'id': i.id }).text(i.title));
    }

    $('#cListSel').on("input", function() {
        scloaddiag.enableButton("delete");
    });

    // doubleClick loads selected chart
    $('#cListSel').on("dblclick", () => {
        if ($('#cListSel')[0].selectedOptions.length === 0) return;

        let theId = null;
        let theName = null;

        for (const optData of $('#cListSel')[0].options) {
            if (optData.selected) {
                theId = optData.id;
                theName = optData.label;
            }
        }
        dochartLoad("ok", theId, theName);

        scloaddiag.dismiss();
    });
}

/* save chart layout */
function saveChart() {

    let scsavediag = new nxDialog('scsavediag_id', {
        title: UILANG.m("Save Report Configuration"),
        datafields: ["sc_name", "chartVis"],
        dataFormat: "object",
        focus: "sc_name",
        contents: /* html */ `
            <p>
                <div>${UILANG.m("Enter report name:")} <input type="text" id="sc_name" value="${lastLoaded}" onfocus="this.select();"></div>
            </p>
            <p>
                <div><input id="chartVis" type="checkbox"><label for="chartVis">${UILANG.m("Report visible to others with test access")}</label></div>
            </p>
        `,
        buttons: [{
            value: 'cancel',
            label: UILANG.m("Cancel"),
            'cancel': true
        }, {
            value: 'save',
            label: UILANG.m("Save"),
            disabled: true,
            'default': true
        }],
        callback: function(button, data) {
            if (button === "save") {
                results_startAjax("chartStorePrecheck", {
                    title: data.sc_name,
                    testId: serverData.id
                }).then((res) => {
                    if (res.checkRes === 1) {
                        new nxDialog("confOR", {
                            title: UILANG.m("Confirm Overwrite"),
                            contents: /* html */ `
                                <div>${UILANG.m("This name already exists! Are you sure you wish to overwrite the existing entry?")}</div>
                            `,
                            buttons: [{
                                value: "yes",
                                label: UILANG.m("Yes")
                            }, {
                                value: "no",
                                label: UILANG.m("No"),
                                'cancel': true,
                                'default': true
                            }],
                            callback: function(confRes) {
                                if (confRes === "yes") {
                                    lastLoaded = data.sc_name;
                                    results_startAjax("chartStore", {
                                        title: data.sc_name,
                                        testId: serverData.id,
                                        vis: data.chartVis === "on" ? 1 : 0,
                                        chartData: savePlot,
                                        layoutData: layoutData,
                                        owrite: true
                                    });
                                    unsavedState = false;

                                } else {
                                    return false;
                                }
                            }
                        });
                    } else if (res.checkRes === 0) {
                        lastLoaded = data.sc_name;
                        results_startAjax("chartStore", {
                            title: data.sc_name,
                            testId: serverData.id,
                            vis: data.chartVis === "on" ? 1 : 0,
                            chartData: savePlot,
                            layoutData: layoutData,
                            owrite: false
                        });
                        unsavedState = false;
                    } else {
                        return false;
                    }
                });
            }
        }
    });

    if (lastLoaded.length > 0) scsavediag.enableButton("save");

    /* conditional save button enabling */
    $('#sc_name').on("input", function(v) {
        if (v.currentTarget.value.length > 0 && v.currentTarget.value.length < 30) {
            scsavediag.enableButton("save");
        } else {
            scsavediag.disableButton("save");
        }

        if (v.currentTarget.value.length > 30) {
            $(v.currentTarget).trigger("blur");
            new nxDialog('scoverlimit', {
                buttons: [{
                    value: 'ok',
                    label: UILANG.m("Ok"),
                    default: true
                }],
                contents: /* html */ `<div>${UILANG.m("Maximum chart layout title must be under 30 characters in length!")}</div>`,
                returnPromise: true
            }).then(() => {
                $(v.currentTarget).trigger("focus");
            });
        }
    });
}

/**
 * Send all current plots' PNG URI data to server for PDF generation.
 */
function pdfPlotGen() {

    // get full list of 'OA_chart' IDs
    let allCharts = $('div[id^="OA_chart_"]');

    let c_groups = [];
    $.each(allCharts, (i, v) => {
        let c_entry = v.id.split('_', 3)[2];
        c_groups.push(c_entry);
    });

    /* start self-executing asynchronous routine to build entire data URI array to send to server */
    (async () => {
        const allImgData = await procAllCharts(allCharts);
        let finalImgData = {};

        for (const [idx, val] of allImgData.entries()) {
            finalImgData[idx] = { "group": c_groups[idx], "value": val };
        }

        results_startAjax('report_export', {
            htmlData: finalImgData
        }).then((res) => {
            dl_prompt(res.pdfData, "application/pdf", "oasys_plot.pdf");
        });
    })();

    /* asynchronous function to build URI array set */
    async function procAllCharts(charts) {
        return Promise.all(charts.map(async (_cid, cval) => {

            /* return core open text html if not image plot */
            if (cval.className.includes("plotly") === false) {
                if (cval.children[0].id.startsWith("dlbox_")) { // when an open text type field
                    return cval.children[1].innerHTML;
                } else {
                    return cval.children[0].innerHTML; // all other plot types
                }
            }

            /* return converted svg -> jpeg data if image plot */
            /* FYI: // must choose values that when multiplied by scaleFactor, produces an integer, otherwise PDF generation will have line between plots */
            const targWidth = 1600;
            const targHeight = 448;

            return Plotly.toImage(cval.id, { format: 'svg', width: targWidth, height: targHeight }).then((b64) => {
                return b64svgtob64img(b64, targWidth, targHeight);
            });
        }));
    }
}

function pageBreakStart() {
    freetextBuilder("ok", {}, true);
    unsavedState = true;
}

function freeTextStart(e_rptIdx) {
    let updateMode = (typeof e_rptIdx === "number");
    let kval = (updateMode) ? Object.keys(report_config[e_rptIdx])[0] : "";

    new nxDialog("tmce_space", {
        title: UILANG.m("Custom Text Block Editor"),
        width: 800,
        contents: /* html */ `<div id="rb_textEditorContainer"><textarea id='stuff' style='width: 100%; height: 100%;'></div>`,
        buttons: [{
            value: "cancel",
            label: UILANG.m("Cancel"),
            'cancel': true
        }, {
            value: "ok",
            label: UILANG.m("Ok"),
            'default': true
        }],
        callback: function(button) {
            let send = {};
            send.updateMode = updateMode;
            send.ft_title = "";
            send.e_rptIdx = e_rptIdx;
            send.kval = kval;
            send.freetext = tinymce.activeEditor.getContent();
            freetextBuilder(button, send, false);
            tinymce.activeEditor.remove();
        }
    });

    let conf = {
        selector: '#stuff',
        promotion: false,
        resize: false,
        branding: false,
        height: '100%',
        schema: 'html5',
        paste_as_text: true,
        content_css: "editor/inc/css/editor.css?" + new Date().getTime(),
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
            "advlist"
        ],
        toolbar: "bold italic underline subscript superscript forecolor backcolor | bullist numlist table | alignleft aligncenter alignright alignjustify styleselect fontsizeselect outdent indent",
        toolbar_mode: 'sliding',
        menu: {
            edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
            insert: { title: 'Insert', items: 'charmap hr template' },
            view: { title: 'View', items: 'visualchars visualblocks visualaid | preview' },
            format: {
                title: 'Format',
                items: 'bold italic underline strikethrough superscript subscript | formats | removeformat'
            },
            table: { title: 'Table', items: 'inserttable tableprops deletetable cell row column' },
            tools: { title: 'Tools', items: 'code' }
        },
        contextmenu: "inserttable | cell row column deletetable",
        hidden_input: false,
        paste_data_images: true,
        init_instance_callback: (ed) => {
            // callback for when editor initializes
            if (updateMode) tinymce.activeEditor.setContent(report_config[e_rptIdx][kval].rawText);
        },
        relative_urls: true,
        document_base_url: settings.JSrootURL,
        table_class_list: [
            { title: 'None', value: '' },
            { title: 'Striped', value: 'striped' }
        ]
    };

    switch (settings.interfaceLanguage) {
        case "DE":
            conf.language = "de";
            break;
        case "FR":
            conf.language = "fr_FR";
            break;
    }
    tinymce.init(conf);

    unsavedState = true;

}

function multiPlotStart() {
    multiPlotConf(report_data, report_config.length, false, null);
}

/** Start multiplot configuration process prior to sending to chart builder routine
 */
function multiPlotConf(data, curIdx = report_config.length, fromClick, button) {
    if (!button) {

        /* NAMED FUNCTIONS AREA */

        /* set the plot type (from dropdown) in multiplot report config data */
        let setDD = function(_src, val) {
            mp_data.cfg.m_type = val;
        };

        /* TS click handler & refresh sorter */
        let mp_opt_handle = (key, value) => {
            key = key.substring(2).replaceAll("-", " ");
            let jqKey = key.replace(/([:.\[\],=@])/g, "\\$1");

            /* if option enabled */
            if (value) {
                /* X-axis enabling for non-ordinals */
                if (!m_ord) {
                    $('#xinv_' + jqKey).attr('disabled', false); // enable x-axis reverse checkbox
                    $(`#xinv_lbl_${jqKey}`).css('color', "#000"); // set color for xinv label
                }

                mp_data[key] = { core: {} };
                mp_data[key]["item"] = data.items[key];
                mp_data[key]["xcat"] = data.xcat[key];

                for (const oKey of Object.keys(data.core)) {
                    mp_data[key]["core"][oKey] = data.core[oKey][key]; // traverse and flip around object structure for multiplots
                }

                // add item in order for sorting as long as it doesn't already exist
                // !iOrder.includes(key) ? iOrder.push(key) : null;
                iOrder.push(key);
                /* if option disabled */
            } else {
                $('#xinv_' + jqKey).attr('disabled', true);
                $(`#xinv_lbl_${jqKey}`).css('color', "#ccc");

                // remove subitem from local report data
                delete mp_data[key];

                // uncheck x-axis reversal
                $(`#xinv_${jqKey}`).prop('checked', false);

                // remove item from sort order object
                iOrder = iOrder.filter(v => v !== key);
            }

            // update item sort order label box
            $("#iorder").html(iOrder.filter((x) => x !== "cfg").toString().replaceAll(",", ", ").trim());

            // enable dialog continuation if at least 2 items are selected
            (Object.keys(mp_data).length > 2) ? mp_diag.enableButton('ok') : mp_diag.disableButton('ok');
        };

        const mp_data = { cfg: {} };
        let iOrder = [];
        const m_ord = ("K" in data.core);

        const mp_diag = new nxDialog('mp_diag_id', {
            title: UILANG.m('Multi-plot Configuration'),
            width: 600,
            contents: /* html */ `
                <div id='multiItemSelBox'></div>
                <div style="margin-top: 5px;"><strong>${UILANG.m('Item Ordering')}:</strong>&nbsp;<span id='iorder'></span></div>
            `,
            buttons: [{
                label: UILANG.m('Cancel'),
                'default': false,
                'cancel': true,
                value: "cancel"
            }, {
                label: UILANG.m('OK'),
                'default': true,
                value: "ok",
                disabled: true
            }],
            callback: multiPlotConf
        }, [mp_data, curIdx, fromClick]);

        /* define droplist showing chart type options */
        const m_type = insertDropdown($('#multiItemSelBox'), 'mp_dd_id', UILANG.m('Multiplot Type'), {
            initialValue: (curIdx in report_config) ? report_config[curIdx].cfg.m_type : "sq",
            elements: [{
                value: "sq",
                label: UILANG.m('Histogram with SD Line'),
            }, {
                value: "pl",
                label: UILANG.m('Profile Line'),
            }, {
                value: "hb",
                label: UILANG.m('Horizontal Bar'),
            }],
            onChange: setDD,
            alignmentProperty: "right"
        });

        // force overflow of 'visible' on mp_diag_id for color picker to show
        $('#mp_diag_id').css("overflow", "visible");

        // force right alignment for dropdown since we can't define it with the insertDropdown method
        $('#dlContainer_mp_dd_id').parent().css({ "text-align": "right" });

        // set next container down in the level as left aligned
        $('#dlContainer_mp_dd_id').css({ "text-align": "left" });

        /* nominal data selection operations */
        insertToggleswitch($('#multiItemSelBox'), 'm_nom', UILANG.m('Series is Nominal Data'), {
            checked: ((curIdx in report_config) && (report_config[curIdx].cfg.m_nom)),
            callback: function(_src, val) {
                mp_data.cfg.m_nom = val;
                if (val) {
                    m_type.getPropertyField().removeElements(['pl', 'sq']);
                    m_type.getPropertyField().reset('hb');
                    setDD(null, 'hb');
                } else {
                    m_type.getPropertyField().addElement('sq', UILANG.m("Histogram with SD Line"));
                    m_type.getPropertyField().addElement('pl', UILANG.m("Profile Line"));
                    m_type.getPropertyField().removeElements(['hb']);
                    m_type.getPropertyField().addElement('hb', UILANG.m("Horizontal Bar"));
                    m_type.reset('sq');
                    setDD(null, 'sq');
                }
            }
        });

        /* start histogram bar color selector */

        let startCol = "31, 119, 180";

        // check if color previously set
        if (curIdx in report_config) startCol = report_config[curIdx].cfg.clr;

        // set init color val
        setC(null, startCol);

        const m_histCol = new jsInterfaceRow($('#multiItemSelBox'), UILANG.m("Color"), {
            alignmentProperty: "right"
        });

        let pcell_clrBtn = m_histCol.getPropertyCell();

        pcell_clrBtn.html("<div id='m_clrbtn_id'></div>");
        let clrbtnObj = $('#m_clrbtn_id');

        sp_colpic(clrbtnObj, startCol, mp_diag, setC, () => { (Object.keys(mp_data).length > 2) ? mp_diag.enableButton('ok') : mp_diag.disableButton('ok') });

        // force right alignment for color picker button element, and fix width
        $('#m_clrbtn_id').css("float", "right");
        $('#m_clrbtn_id').width("59px");

        // since this is a bit of a custom job, set a handler for the entire jsInterfaceRow to toggle the color picker
        m_histCol.getPropertyCell().parent().children().on("click", function() {
            $('#m_clrbtn_id').spectrum("toggle");
            return false;
        });

        function setC(_dummy, val) {
            mp_data.cfg.clr = val;
        }

        /* if reloading an existing nominal set, remove extraneous dropdowns and reinit nom cfg value */
        if ((curIdx in report_config) && report_config[curIdx].cfg.m_nom) {
            mp_data.cfg.m_nom = true;
            m_type.getPropertyField().removeElements(['pl', 'sq']);
            m_type.getPropertyField().reset('hb');
        } else {
            mp_data.cfg.m_nom = false;
        }

        // horizontal line divider
        $('#multiItemSelBox').append('<hr style="padding: 0; margin-top: 10px; margin-bottom: 10px;">');

        // set initial DD value to the default selection
        mp_data.cfg.m_type = m_type.getPropertyField().getValue();

        /* define TS for each item */
        let fType;
        for (let key of Object.keys(data.items)) {

            let ns_key = key.replaceAll(" ", "-");

            let tsObj = insertToggleswitch($('#multiItemSelBox'), "m_" + ns_key, key, {
                checked: ((curIdx in report_config) && (report_config[curIdx].includes(key))),
                callback: mp_opt_handle
            });

            // block open text items
            fType = report_data.fTypes[key];
            if (fType === "oasysTextarea" || fType === "oasysConceptMap") tsObj.getPropertyField().lock();

            // Reverse X-Axis checkbox option
            $( /* html */ `<label for="xinv_${ns_key}" id=xinv_lbl_${ns_key} style="color: #ccc; padding-left: 15px; display: inline;">${UILANG.m('Invert X-Axis')}</label>
			<input data-keyid=${ns_key} disabled type='checkbox' class="xinv" id='xinv_${ns_key}'/>`).insertAfter('#m_' + ns_key);

            // prevent clicking on xinv elements to toggle main toggle switch value
            $(`[data-keyid='${ns_key}'], #xinv_lbl_${ns_key}`).on('click', function(e) {
                e.stopPropagation();
            });
        }

        /* on a refresh, re-run option handler on all enabled items (in order); preserve sorting */
        if (curIdx in report_config) {
            for (const k of report_config[curIdx]) {
                if ((report_config[curIdx].cfg.revdKeys.includes(k))) $(`#xinv_${k}`).prop('checked', true);
                mp_opt_handle('m_' + k, true);
            }
        }

        /* check the checkbox if found to be checked from report_config settings */

        // misc CSS cleanup
        $('#multiItemSelBox > .jsInterfaceRow').css('white-space', 'nowrap');
    }

    /* parse and send plotting data to plot builder function */

    if (button === 'ok') {
        const revdKeys = [];
        /* x-axis reversal option */
        for (const key of Object.keys(data)) {
            if (key === 'cfg') continue;
            if ($('#xinv_' + key.replace(/([:.\[\],=@])/g, "\\$1")).is(':checked')) {
                data[key].xcat.reverse();
                revdKeys.push(key);
            }
        }

        /* physically remove report block plot when removed from report config block; sync master report config to new/updated report block config */

        // if editing existing report block, remove any disabled report subblocks
        if (curIdx in report_config) {

            // remove all subplot elements when updating existing plot entry since they will be added back in order in the next step
            let cfgHolder = {};

            // clean out report_config element for proper re-adding of order of subplots later
            cfgHolder = report_config[curIdx].cfg;
            report_config[curIdx] = [];
            report_config[curIdx].cfg = cfgHolder;

        }

        // add/sync new subblocks as needed
        for (const mp_value of Object.keys(data)) {
            if (mp_value === 'cfg') continue;
            if (!(curIdx in report_config)) {
                report_config.push([mp_value]);
            } else {
                report_config[curIdx].push(mp_value);
            }
        }

        report_config[curIdx].cfg = (data['cfg']);
        report_config[curIdx].cfg.revdKeys = revdKeys;

        /* deep copy final config object & send to chart builder */
        let finalSend = dc(data);
        let spData = dc(data);

        // save plot data for saving layout
        let rcObj = Object.assign({}, report_config[curIdx]['cfg']);

        if (!fromClick) {
            savePlot.push([spData, null, null, "multi", curIdx, report_config[curIdx], rcObj]);
            // layoutData built in buildChart() function call
        } else {
            layoutData = layoutData.filter(e => e.rptIdx !== curIdx); // selectively remove layoutData entries so they can be rebuilt in buildChart()
            savePlot[savePlot.findIndex(e => e[4] === curIdx)] = ([spData, null, null, "multi", curIdx, report_config[curIdx], rcObj]); // update savePlot entry
        }

        unsavedState = true;
        buildChart(finalSend, null, null, "multi", curIdx);

        /* revert our xcats to original values for next time dialog is called */
        revdKeys.forEach(key => {
            data[key].xcat.reverse();
        });
    }
}

function singlePlotStart() {
    window.nsp_diag = new nxDialog('nsp_diag_id', {
        buttons: [{
            label: UILANG.m('Cancel'),
            value: "cancel",
            'cancel': true,
            'default': true
        }, {
            label: UILANG.m('Add'),
            value: "add",
            disabled: true
        }],
        title: UILANG.m('Select Item to Plot'),
        contents: /* html */ `<div id='singleItemSelBox'></div>`,
        callback: function(button) {
            if (button === 'add') sendToSplotConf(plotItemSL.getSelection());
        }
    });

    let plotItemSL = new jsSelectList($('#singleItemSelBox'), 'qVal', {
        labelKey: 'name',
        orderKey: 'name',
        idKey: 'id',
        hideButtonsKey: 'locked',
        selectionCallback: function() { nsp_diag.enableButton('add'); }, // callback on single-click
        activationCallback: function() { sendToSplotConf(plotItemSL.getSelection()) }, // callback on double-click
        cancelSingleClickOnDoubleClick: false
    });

    for (const [qId, qField] of Object.entries(report_data.items)) {
        plotItemSL.addItems([{ id: qId, name: `${qId}` }]);
    }

    // need to re-do the loop and not the one above b/c fun with race conditions...
    for (const qVal in report_data.items) {
        let jqQvalKey = qVal.replace(/([:.\[\],=@])/g, "\\$1");
        $(`#qVal_${jqQvalKey}`).css('cursor', 'pointer');
    }

    // a footer is placed by jsSelectList, but we don't want it!
    $('#qVal_footer').remove();

    function sendToSplotConf(SLvar) {
        let qId = SLvar.id;

        singlePlotConf({
            fieldName: qId,
            fullTxt: report_data.items[qId],
            desc: report_data.items[qId],
            xcat: report_data.xcat[qId]
        }, true, report_data, report_config.length);
    }
}

/** Start single plot configuration process prior to sending to chart builder routine
 */
function singlePlotConf(fn, cState = false, data, curIdx = report_config.length, fromClick = false) {
    const fromEntry = fromClick.valueOf();
    let bkpRC; // backup start state of report config entry in case of a 'cancel' operation wherein we must restore the original values
    if (fromEntry) {
        bkpRC = dc(report_config[curIdx]);
    }

    let s_ord = ("K" in data.core);

    if (typeof nsp_diag !== "undefined") nsp_diag.dismiss();

    // if chart exists and x-axis is reversed, then re-reverse it here
    if ((curIdx in report_config) && ("revOpt" in report_config[curIdx][fn.fieldName]) && (report_config[curIdx][fn.fieldName][revOpt])) {
        fn.xcat.reverse();
    }

    // remove single plot if called to do so
    if (!cState) {
        $(`#${fn.fieldName}_chart`).remove();
        return;
    }

    let fType = report_data.fTypes[fn.fieldName];

    let sp_diag = new nxDialog('fcfg_dialog', {
        title: /* html */ `${UILANG.m('Configure Report Variables for: ')} <em>${fn.fieldName}</em>`,
        width: "500",
        contents: /* html */`<div class="rb-dialogLabel">${UILANG.m("Question")}</div><div class="rb-dialog-questionBox">${fn.fullTxt}</div><div id='cb_opts'></div>`,
        buttons: [{
            label: UILANG.m('Cancel'),
            'default': false,
            'cancel': true,
            value: "cancel"
        }, {
            label: UILANG.m('OK'),
            'default': true,
            value: "ok",
            disabled: true
        }],
        callback: function(button) {
            if (button === 'ok') {

                // push plot data and build chart
                if (!fromEntry) savePlot.push([data, fn, cState, "single", curIdx, report_config[curIdx], null]);
                unsavedState = true;
                buildChart(data, fn, cState, "single", curIdx);
            }

            // remove temp report_config entry on cancel
            if (button === 'cancel') {
                !fromEntry ? report_config.splice(curIdx, 1) : report_config[curIdx] = bkpRC;
            }
        }
    });

    /* minor styling adjustments */
    $('#cb_opts').css("margin-top", "5px");

    function checkChecked(fOpt) {
        if ((curIdx in report_config) && fn.fieldName in report_config[curIdx]) {
            return report_config[curIdx][fn.fieldName][fOpt];
        } else {
            report_config[curIdx][fn.fieldName] = false;
            return false;
        }
    }

    /* start color selection */

    let startCol = "31, 119, 180";

    const cb_colSel = new jsInterfaceRow($('#cb_opts'), UILANG.m("Color"), {
        alignmentProperty: "right"
    });

    const pcell_clrBtn = cb_colSel.getPropertyCell();

    // set default value if no color is chosen
    if (typeof report_config[curIdx] !== "undefined") {
        if ("hcol_opt" in report_config[curIdx][fn.fieldName]) startCol = report_config[curIdx][fn.fieldName]["hcol_opt"];
    }
    // send in color value to options object
    ts_cb("hcol_opt", startCol);

    // set the actual color selected (or default) to show in dialog
    pcell_clrBtn.html("<div id='s_clrbtn_id'></div>");
    let clrbtnObj = $('#s_clrbtn_id');

    // set pos and width of color picker button
    $('#s_clrbtn_id').css("float", "right");
    $('#s_clrbtn_id').width("59px");

    // main call to spectrum color picker init
    sp_colpic(clrbtnObj, startCol, sp_diag, ts_cb, checkContStatus);

    // since this is a bit of a custom job, set a handler for the entire jsInterfaceRow to toggle the color picker
    cb_colSel.getPropertyCell().parent().children().on("click", function() {
        $('#s_clrbtn_id').spectrum("toggle");
        return false;
    });

    /* end color selection */

    $('#cb_opts').append("<hr style='display: block;' />");

    /* tooltip init f(x) */

    let tt_init = (optID, imgName) => {
        $(optID).parent().siblings().tooltip({
            show: { delay: 500 },
            classes: { "ui-tooltip": "uitt-image", "ui-tooltip-content": "uitt-image-inner" },
            content: /* html */`<div style="background-color: white; position: relative; left: -440px; top: -80px;"><img style="display: block; border: 1px solid black;" src="images/chartSamples/${imgName}" /></div>`
        });
    };

    /* start of chart options */

    const cb_nom = insertToggleswitch($('#cb_opts'), 'nom_opt', UILANG.m('Nominal Data'), {
        checked: checkChecked('nom_opt'),
        dataId: "nom_opt",
        callback: ts_cb
    });

    $('#cb_opts').append("<hr class='hist_sep' style='display: none;' />");

    const cb_histo = insertToggleswitch($('#cb_opts'), 'hist_opt', UILANG.m('Histogram'), {
        checked: checkChecked('hist_opt'),
        dataId: "hist_opt",
        callback: ts_cb
    });

    tt_init("#hist_opt", "histo.png"); // init image tooltip

    const cb_h_labels = insertToggleswitch($('#cb_opts'), 'h_label_opt', UILANG.m('Histogram Point Labels'), {
        checked: checkChecked('h_label_opt'),
        dataId: "h_label_opt",
        callback: ts_cb
    });
    cb_h_labels.hide();

    const cb_hx0_labels = insertToggleswitch($('#cb_opts'), 'h_x0_opt', UILANG.m('Show 0 on X-Axis'), {
        checked: checkChecked('h_x0_opt'),
        dataId: "h_x0_opt",
        callback: ts_cb
    });
    cb_hx0_labels.hide();

    const cb_xbin = insertTextfield($('#cb_opts'), 'xbin_val', UILANG.m('Override auto bin size'), {
        width: 60,
        dataId: "xbin_val",
        onInput: ts_cb
    });
    cb_xbin.hide();

    $('#cb_opts').append("<hr class='hist_sep' style='display: none;' />");

    $('#xbin_val').parent().css('textAlign', 'right');
    if (typeof report_config[curIdx] !== "undefined" && typeof report_config[curIdx][fn.fieldName].xbin_val !== "undefined") {
        cb_xbin.getPropertyField().reset(report_config[curIdx][fn.fieldName].xbin_val);
    }

    const cb_dev = insertToggleswitch($('#cb_opts'), 'sd_opt', UILANG.m('SD Line'), {
        checked: checkChecked('sd_opt'),
        dataId: "sd_opt",
        callback: ts_cb
    });

    tt_init("#sd_opt", "sd.png"); // init image tooltip

    $('#cb_opts').append("<hr class='pie_sep' style='display: none;' />");

    const cb_pie = insertToggleswitch($('#cb_opts'), 'pie_opt', UILANG.m('Pie Chart'), {
        checked: checkChecked('pie_opt'),
        dataId: "pie_opt",
        callback: ts_cb
    });

    tt_init("#pie_opt", "pie.png");

    const cb_pie_lpos = insertDropdown($('#cb_opts'), 'pie_l_opt', UILANG.m('Label Layout'), {
        elements: [{
            label: UILANG.m("Inside"),
            value: "inside"
        }, {
            label: UILANG.m("Outside"),
            value: "outside"
        }, {
            label: UILANG.m("Auto"),
            value: "auto"
        }, {
            label: UILANG.m("Percent with Legend"),
            value: "pwl"
        }],
        dataId: "pie_l_opt",
        onChange: function(optName, value) {
            ts_cb(optName, value);
        }
    });
    cb_pie_lpos.hide();

    if (typeof report_config[curIdx] !== "undefined" && typeof report_config[curIdx][fn.fieldName].pie_l_opt !== "undefined") {
        cb_pie_lpos.getPropertyField().reset(report_config[curIdx][fn.fieldName].pie_l_opt);
    } else {
        cb_pie_lpos.getPropertyField().reset("auto");
    }

    // manual align the dropdown pos, but reset text alignment pos
    cb_pie_lpos.getPropertyCell().css("text-align", "right");
    $('#dlList_pie_l_opt').css("text-align", "initial");

    $('#cb_opts').append("<hr class='pie_sep' style='display: none;' />");

    $('#cb_opts').append("<hr class='box_sep' style='display: none;' />");

    const cb_box = insertToggleswitch($('#cb_opts'), 'box_opt', UILANG.m('Box and Whisker'), {
        checked: checkChecked('box_opt'),
        dataId: "box_opt",
        callback: ts_cb
    });

    tt_init("#box_opt", "b_and_w.png"); // init image tooltip

    const cb_b_labels = insertToggleswitch($('#cb_opts'), 'b_hdOut_opt', UILANG.m('Hide Outliers'), {
        checked: checkChecked('b_hdOut_opt'),
        dataId: "b_hdOut_opt",
        callback: ts_cb
    });
    cb_b_labels.hide();

    $('#cb_opts').append("<hr class='box_sep' style='display: none;' />");

    const cb_vio = insertToggleswitch($('#cb_opts'), 'vio_opt', UILANG.m('Violin'), {
        checked: checkChecked('vio_opt'),
        dataId: "vio_opt",
        callback: ts_cb
    });

    tt_init("#vio_opt", "vio.png");

    const cb_rev = insertToggleswitch($('#cb_opts'), 'rev_opt', UILANG.m('Invert X-Axis'), {
        checked: checkChecked('rev_opt'),
        dataId: "rev_opt",
        callback: (a, val) => {
            fn.xcat.reverse(); // the action of reversing x-axis array values
            ts_cb(a, val); // standard call to set option in report_config
        }
    });

    const cb_ot = insertToggleswitch($('#cb_opts'), 'ot_opt', UILANG.m('Open Question'), {
        checked: checkChecked('ot_opt'),
        dataId: "ot_opt",
        callback: ts_cb
    });

    // set empty title so tooltip function can work
    $("#hist_opt, #sd_opt, #pie_opt, #box_opt, #vio_opt").each(function() {
        $(this).parent().siblings()[0].title = "";
    });

    /* determine whether to show or hide suboptions based on master option state */
    /* master map of options in relation to how theytoggle linked options */
    const optsMap = {
        sd_mmap: {
            name: "sd_opt",
            disableTargs: [cb_ot, cb_nom, cb_pie],
            enableTargs: [],
            enLock: [],
            sepLinks: [],
            intFields: [],
            disableResetFX: function() {
                if (checkChecked("hist_opt") || checkChecked("box_opt") || checkChecked("vio_opt")) {
                    cb_ot.lock();
                    cb_ot.reset(false);
                    cb_pie.lock();
                    cb_pie.reset(false);
                }
            }
        },
        hist_mmap: {
            name: "hist_opt",
            disableTargs: [cb_pie, cb_ot, cb_pie],
            enableTargs: [cb_h_labels, cb_hx0_labels, cb_xbin],
            enLock: [],
            sepLinks: ["hist_sep"],
            intFields: [{ "xbin_val": cb_xbin }],
            disableResetFX: function() {
                cb_xbin.getPropertyField().reset(0);
                ts_cb("xbin_val", false, null, true);
                if (checkChecked("sd_opt") || checkChecked("box_opt") || checkChecked("vio_opt")) {
                    cb_ot.lock();
                    cb_ot.reset(false);
                    cb_pie.lock();
                    cb_pie.reset(false);
                }
            }
        },
        box_mmap: {
            name: "box_opt",
            disableTargs: [cb_pie, cb_ot, cb_nom],
            enableTargs: [cb_b_labels],
            enLock: [],
            sepLinks: ["box_sep"],
            intFields: [],
            disableResetFX: function() {
                if (checkChecked("hist_opt") || checkChecked("sd_opt") || checkChecked("vio_opt")) {
                    cb_ot.lock();
                    cb_ot.reset(false);
                    cb_pie.lock();
                    cb_pie.reset(false);
                }
            }
        },
        nom_mmap: {
            name: "nom_opt",
            disableTargs: [cb_dev, cb_box, cb_vio],
            enableTargs: [],
            enLock: [],
            sepLinks: [],
            intFields: []
        },
        ot_mmap: {
            name: "ot_opt",
            disableTargs: [cb_histo, cb_h_labels, cb_b_labels, cb_dev, cb_box, cb_vio, cb_pie, cb_rev, cb_colSel],
            enableTargs: [],
            enLock: [cb_nom],
            sepLinks: [],
            intFields: []
        },
        pie_mmap: {
            name: "pie_opt",
            disableTargs: [cb_histo, cb_dev, cb_box, cb_vio, cb_rev, cb_ot, cb_colSel],
            enableTargs: [cb_pie_lpos],
            enLock: [cb_nom],
            sepLinks: ["pie_sep"],
            intFields: [],
            disableResetFX: function() {
                cb_pie_lpos.getPropertyField().reset("auto");
                ts_cb("pie_l_opt", "auto", true);
            }
        },
        vio_mmap: {
            name: "vio_opt",
            disableTargs: [cb_nom, cb_ot, cb_pie],
            enableTargs: [],
            enLock: [],
            sepLinks: [],
            intFields: [],
            disableResetFX: function() {
                if (checkChecked("hist_opt") || checkChecked("sd_opt") || checkChecked("box_opt")) {
                    cb_ot.lock();
                    cb_ot.reset(false);
                    cb_pie.lock();
                    cb_pie.reset(false);
                }
            }
        }
    };

    if (fType === "oasysTextarea") {
        cb_ot.getPropertyField().reset(true);
        ts_cb(cb_ot.getDataId(), true);
        optActv(optsMap.sd_mmap);
        optActv(optsMap.hist_mmap);
        optActv(optsMap.box_mmap);
        optActv(optsMap.nom_mmap);
        optActv(optsMap.pie_mmap);
        optActv(optsMap.vio_mmap);
        optActv(optsMap.ot_mmap);
        cb_ot.getPropertyField().lock();
        return;
    }

    if (fType === "oasysConceptMap") cm_mode();

    if (checkChecked('nom_opt')) optActv(optsMap.nom_mmap);
    if (checkChecked('hist_opt')) optActv(optsMap.hist_mmap);
    if (checkChecked('sd_opt')) optActv(optsMap.sd_mmap);
    if (checkChecked('pie_opt')) optActv(optsMap.pie_mmap);
    if (checkChecked('box_opt')) optActv(optsMap.box_mmap);
    if (checkChecked('vio_opt')) optActv(optsMap.vio_mmap);
    if (checkChecked('ot_opt')) optActv(optsMap.ot_mmap);
    fromClick = false;

    checkContStatus();

    /** Logic controller for option switching in single plot mode */
    function optActv(optObj) {

        if (!checkChecked(optObj.name)) {

            /* WHEN MAIN OPTION IS DISABLED OR BEING DISABLED */

            // active targets are unlocked, or shown if non-standard oasys widget (e.g., color picker)
            optObj.disableTargs.forEach(e => {
                if (!fromClick) {
                    e.unlock();
                    if (e.getDataId() === false) e.show();
                }
            });

            // linked "enable on" targets are hidden
            optObj.enableTargs.forEach(e => {
                if (!fromClick) {
                    e.hide();
                    e.reset(false);
                    ts_cb(e.getDataId(), false, null, true);
                }
            });

            // reset "enable and lock" targets
            optObj.enLock.forEach(e => {
                if (!fromClick) {
                    e.unlock();
                    e.reset();
                    ts_cb(e.getDataId(), false, null, true);
                }
            });

            // hide linked separator elements
            if (optObj.sepLinks.length > 0) optObj.sepLinks.forEach(e => {
                $("." + e).hide();
            });

            // Custom callback executor
            if ("disableResetFX" in optObj && !fromClick) optObj.disableResetFX();

        } else {

            /* WHEN MAIN OPTION IS ENABLED OR BEING ENABLED */

            // active targets are locked and reset
            optObj.disableTargs.forEach(e => {
                e.lock();
                e.reset();
                ts_cb(e.getDataId(), false, null, true);
                if (e.getDataId() === false) e.hide();
            });

            // linked "enable on" targets are shown
            optObj.enableTargs.forEach(e => {
                e.show();
            });

            // "enable and lock" targets
            optObj.enLock.forEach(e => {
                e.lock();
                e.reset(true);
                ts_cb(e.getDataId(), true, null, true);
            });


            // show linked separator elements
            if (optObj.sepLinks.length > 0) optObj.sepLinks.forEach(e => {
                $("." + e).show();
            });

            // Custom callback executor
            if ("enableFX" in optObj && !fromClick) optObj.enableFX();

        }

        /* Option modifications based on type of data ordinality */
        if (!s_ord) {
            /* 0 axis option modifications */
            $('#h_x0_opt').parent().parent().children(':first-child').css('color', '#707070'); // text label color change on disabled
            cb_hx0_labels.lock(); // lock label on disabled

            /* Manual bin size option modifications */
            $('#xbin_val').parent().parent().children(':first-child').css('color', '#707070'); // text label color change on disabled

            let xbv = cb_xbin.getPropertyField().element;
            xbv.prop('disabled', true); // manually disable box (but still show - do not use 'lock')
            xbv.css('background-color', '#ccc'); // change background to show as solid block
            xbv.css('cursor', 'default'); // change cursor to standard arrow
        } else {
            /* Reverse x-axis disabling */
            cb_rev.lock();
        }

    }
    /* concept map disabling of all options */
    function cm_mode() {
        $('#cb_opts').after(/* html */ `<div style="padding-top: 10px; text-align: center; color: red; font-size: smaller;">${UILANG.m("Concept map question types are not able to be plotted.")}</div>`);

        // disable histo
        cb_histo.lock();
        cb_histo.reset();
        ts_cb("hist_opt", false);

        // disable SD line
        cb_dev.lock();
        cb_dev.reset();

        // disable box/whisker
        cb_box.lock();
        cb_box.reset();
        ts_cb('box_opt', false);

        // disable violin
        cb_vio.lock();
        cb_vio.reset();

        // disable pie
        cb_pie.lock();
        cb_pie.reset();
        cb_pie_lpos.hide();

        // disable rev x
        cb_rev.lock();
        cb_rev.reset();

        // disable open text
        cb_ot.lock();
        cb_ot.reset();

        // disable nominal
        cb_nom.lock();
        cb_nom.reset();
    }

    /* click handler for various chart options */
    function ts_cb(optName, optVal, tVal = null, stopShort = false) {

        // tVal required for a different callback signature from the one used for jsToggleSwitch
        if (tVal === false) optVal = false;

        if (optName === 'xbin_val') {
            if (optVal && RegExp('^[0-9]{0,3}$').test(optVal) === false) $('#xbin_val').val(optVal.substring(0, optVal.length - 1));
        }

        if (typeof optVal === 'string' && optName !== "hcol_opt" && optName !== "pie_l_opt") optVal = parseInt(optVal);

        setChartOpts({
            field: fn.fieldName,
            chart: optName,
            value: optVal
        });

        if (stopShort) return;

        // activate sub-views for certain top-level options
        if (optName === 'hist_opt') optActv(optsMap.hist_mmap);
        if (optName === 'box_opt') optActv(optsMap.box_mmap);
        if (optName === 'pie_opt') optActv(optsMap.pie_mmap);
        if (optName === 'vio_opt') optActv(optsMap.vio_mmap);
        if (optName === 'ot_opt') optActv(optsMap.ot_mmap);
        if (optName === 'nom_opt') optActv(optsMap.nom_mmap);
        if (optName === 'sd_opt') optActv(optsMap.sd_mmap);

    }

    /* set the params for the object we will be sending to report builder */
    function setChartOpts(opts) {
        if (curIdx in report_config) {
            report_config[curIdx][opts.field][opts.chart] = opts.value;
        } else {
            curIdx = report_config.push({
                [opts.field]: {
                    [opts.chart]: opts.value
                }
            });
            curIdx--;
        }

        if (opts.chart !== "hcol_opt") checkContStatus();
    }

    function checkContStatus() {
        // enable dialog continuation if at least one of the main plot options are checked
        let okCheck = report_config[curIdx][fn.fieldName];
        for (const i in okCheck) {
            if (['hist_opt', 'sd_opt', 'box_opt', 'vio_opt', 'pie_opt', 'ot_opt'].includes(i) && okCheck[i]) {
                sp_diag.enableButton('ok');
                break;
            } else {
                sp_diag.disableButton('ok');
            }
        }
    }
}

/** objId = Jquery object which triggers color picker
 * startCol = default color to start the color picker on
 * parNxBtns = the id of the nxdialog so we can disable its ok/cancel buttons while color picking
 * cb1/cb2 = callback functions as required
 */
function sp_colpic(objId, startCol, parNxBtns, cb1, cb2) {

    // default starting color value
    objId.css("background", `rgb(${startCol})`);

    let newCol = null;

    objId.spectrum({
        showPalette: true,
        // palette: ["black", "white", "blue", "yellow", "red", "green", "purple", "gray", "brown"],
        palette: [
            ["#000", "#444", "#666", "#999", "#ccc", "#eee", "#f3f3f3", "#fff"],
            ["#f00", "#f90", "#ff0", "#0f0", "#0ff", "#00f", "#90f", "#f0f"],
            ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc"],
            ["#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
            ["#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6fa8dc", "#8e7cc3", "#c27ba0"],
            ["#c00", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3d85c6", "#674ea7", "#a64d79"],
            ["#900", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#0b5394", "#351c75", "#741b47"],
            ["#600", "#783f04", "#7f6000", "#274e13", "#0c343d", "#073763", "#20124d", "#4c1130"]
        ],
        appendTo: "#" + objId.closest(".nxDialog")[0].id,
        chooseText: UILANG.m("OK"),
        cancelText: UILANG.m("Cancel"),
        preferredFormat: "rgb",
        color: `rgb(${startCol})`,
        move: function(color) {
            newCol = `${color._r}, ${color._g}, ${color._b}`;
            // ts_cb("hcol_opt", newCol);
            $(this).css("background", `rgb(${newCol})`);
        },
        show: function() {
            $(this).spectrum("container").css("left", $(this).spectrum("container").position().left - 342);
            $(this).spectrum("container").css("top", $(this).spectrum("container").position().top + 2);

            // disable nxdiag buttons underneath
            parNxBtns.disableButton("cancel");
            parNxBtns.disableButton("ok");

            // replace spectrum buttons with nxButtons
            $('.sp-cancel').remove();
            $('.sp-choose').remove();

            // ok button init
            $(".sp-button-container")[0].id = "spBtnAreaId";
            const nx_ok = new nxButton("spBtnAreaId", "nxok_btn", {
                label: UILANG.m("OK"),
                default: true,
                callback: function() {
                    cb1("hcol_opt", newCol);
                    startCol = newCol;
                    objId.css("background", `rgb(${newCol})`);
                    objId.spectrum("set", `rgb(${newCol})`);
                    objId.spectrum("hide");
                }
            });

            // cancel button init
            $(".sp-button-container")[0].id = "spBtnAreaId";
            const nx_canc = new nxButton("spBtnAreaId", "nxcanc_btn", {
                label: UILANG.m("Cancel"),
                callback: function() {
                    objId.spectrum("set", `rgb(${startCol})`);
                    objId.spectrum("hide");
                    objId.css("background", `rgb(${startCol})`);
                }
            });

            $('#nxcanc_btn, #nxok_btn').css("font-size", "smaller");

            // stop accepting input on all other options until the color is selected or color picker hidden (pseudo-semi-modal mode)
            $('.jsInterfaceRow').css("pointer-events", "none");
            $('.jsInterfaceRowLabelCell:contains("Histogram Bar Color")').parent().css("pointer-events", "all"); // re-enable bar color interface toggle

        },
        hide: function() {
            // retore nxdiag buttons underneath
            parNxBtns.enableButton("cancel");
            cb2();
            $('.jsInterfaceRow').css("pointer-events", "all"); // restore inputs on chart options
        }
    });
}

/** Build and populate the descriptive analysis table */
function build_an_table() {

    /* iterate list of properties as table header */
    for (const statProp in report_data.core) {
        if (statProp === 'raw') continue;

        $('#st_header').append(`<td id='statCol_${statProp}' style='white-space: nowrap; padding: 5px;'><strong>${statProp}</strong></td>`);
        $('#stats_table').show();

        /* iterate each of the fields (questions) being reported on */
        for (let [fieldId, fieldText] of Object.entries(report_data.items).reverse()) {

            let fieldText = report_data.items[fieldId];
            if ($(`[id='cat_${fieldId}']`).length === 0) $('#st_header').after(/* html  */
                `<tr id="cat_${fieldId}">
				    <td class="ds_row_question" title="${fieldText}" style='white-space: nowrap; padding: 5px;'><strong>${fieldId}</strong></td>
			    </tr>`);

            let dataVal = report_data.core[statProp][fieldId] || "N/A"; // convert 'undefined' to "N/A"
            $(`[id='cat_${fieldId}'] td:last`).after(`<td id=data_${fieldId} class='statItem it_${fieldId}' style='padding: 5px;'>${dataVal}</td>`);
        }

        // setup mouse tracking effect on cells
        let trg;
        $("td[class*='it_']").on('hover', function() {
            trg = $(this).attr('class');
            $("td[class*='" + trg + "']").css('backgroundColor', 'rgba(255, 255, 0, 0.2)');
            $(this).css('backgroundColor', 'rgb(255, 255, 0)');
        }, function() {
            $("td[class*='" + trg + "']").css('backgroundColor', '#fff');
        });
    }

    // tooltips for table headers
    let ds_head_anim_dur = (settings.disableAnimations) ? 0 : 250;
    $("td#statCol_K").prop("title", UILANG.m("Kurtosis"));
    $("td#statCol_σ").prop("title", UILANG.m("Population Standard Deviation"));
    $("td#statCol_range").prop("title", UILANG.m("Range between Minimum and Maximum"));
    $("td#statCol_min").prop("title", UILANG.m("Minimum Value in Data Set"));
    $("td#statCol_max").prop("title", UILANG.m("Maximum Value in Data Set"));
    $("td#statCol_Mo").prop("title", UILANG.m("Population Mode"));
    $("td#statCol_x̃").prop("title", UILANG.m("Population Median"));
    $("td#statCol_μ").prop("title", UILANG.m("Population Mean"));
    $("td#statCol_N").prop("title", UILANG.m("Population Count"));

    // tooltip config for column headers
    $("[id^=statCol_]").tooltip({
        track: false,
        classes: {
            "ui-tooltip-content": "uitt-upgrader"
        },
        show: {
            effect: "fadeIn",
            duration: ds_head_anim_dur
        },
        hide: {
            effect: "fadeOut",
            duration: ds_head_anim_dur
        }
    });

    // tooltip config for table rows
    $(".ds_row_question").tooltip({
        track: false,
        classes: {
            "ui-tooltip-content": "uitt-upgrader"
        },
        show: {
            effect: "fadeIn",
            duration: ds_head_anim_dur
        },
        hide: {
            effect: "fadeOut",
            duration: ds_head_anim_dur
        }
    });


}

/** Main chart builder routine which will create Plotly graphs. */
async function buildChart(data, fInfo, cState, ctype, rptIdx) {
    rptIdx = parseInt(rptIdx);

    // activate RB elements on first/any chart build request
    gui.boxes.report.rb_title.show();
    gui.boxes.report.rb_data.show();

    // calc plot and chart area label widths to set (must do manually since scrollbar affects size)
    chartAreaWidth = ca_w_set ? chartAreaWidth : parseInt($('div#chartArea.guiSubSection').width()) * 0.95;

    ca_w_set = true;
    $('#chartArea > .guiSubSectionLabelBox').width(chartAreaWidth); // match gui box title width to resized chart area width

    /**
     * Function to build stats for non-ordinal datasets through a calc graph
     */
    let nonord_var_builder = async function(item) {
        const rnd = Math.ceil(Math.random() * 100);
        $('#chartArea').append( /* html */ `<div style="display: none;" class="oa_calc" id="OA_calc_${rptIdx}_${rnd}"></div>`);

        let calcData = {
            type: 'box',
            boxmean: "sd",
            x: data[item].core.raw,
            visible: true
        };

        let calcLayout = {
            xaxis: {
                rangemode: "normal",
                autorange: false,
                range: [-1, data[item].xcat.length],
                type: "category",
                tickmode: "array",
                categoryorder: "array",
                categoryarray: data[item].xcat
            }
        };

        return Plotly.newPlot(`OA_calc_${rptIdx}_${rnd}`, [calcData], calcLayout).then((plot) => {
            let allVars = [plot.calcdata[0][0].mean, plot.calcdata[0][0].med, plot.calcdata[0][0].sd, plot.calcdata[0][0].pts.length];
            return allVars;
        });
    };

    switch (ctype) {

        /* REVIEW: [CHARTING] consider adding a multiple stacked histogram (multi-trace) showing a bar for each item, and each bar split by percentile of answers */

        case "multi":
            let p_type = data.cfg.m_type;
            let nom = data.cfg.m_nom || false;
            let color = data.cfg.clr;

            // remove cfg key as it will interfere with iterations on data object from here on out
            delete data.cfg;

            let c = 0; // internal counter for multiplot

            $(`.subrptblock_${rptIdx}`).remove();

            let plTitle = [];
            dlimgBtns[rptIdx] = [];

            for (let itemKey of Object.keys(data)) {
                c++;

                if ($(`.rptblock_${rptIdx}`).length === 0) {
                    /* when no report block exists */
                    $('#chartArea').append(`<div style="position: relative; margin: auto;" class=rptblock_${rptIdx}></div>`);
                }

                // append sub-reportblock which will be appended in order b/c of using Object.keys(data)
                $(`.rptblock_${rptIdx}`).append(`<div style="position: relative; margin: auto;" class=subrptblock_${rptIdx} id="OA_chart_${rptIdx}_${c}" name=${itemKey}></div>`);

                // applicable to non-ordinals and profile line plots

                let meanPts = [];
                let medPts = [];
                let sdPts = [];
                let nSizes = [];
                let allVars;
                let m_isOrdinal;
                let arrData;
                let meanPt;
                let medPt;
                let sdPt;
                let nSize;

                allVars = await Promise.all(Object.keys(data).map(async (item) => await nonord_var_builder(item)));

                if (p_type === "pl") {
                    let z = 0;
                    for (const ikEntry of Object.keys(data)) {
                        [m_isOrdinal, arrData, meanPt, medPt, sdPt, nSize] = buildInitVars(data, ikEntry, "multi", rptIdx);

                        if (!m_isOrdinal) {
                            meanPts.unshift(allVars[z][0] + 1);
                            medPts.unshift(allVars[z][1] + 1);
                            sdPts.unshift(allVars[z][2] + 1);
                            nSizes.unshift(allVars[z][3]);
                        } else {
                            meanPts.unshift(data[ikEntry].core.μ);
                            medPts.unshift(data[ikEntry].core.x̃);
                            sdPts.unshift(data[ikEntry].core.σ);
                            nSizes.unshift(data[ikEntry].core.N);
                        }

                        z++;
                        m_isOrdinal = true; // forcing it so a mixed pl graph shows the correct numbericals 
                    }
                } else {
                    // build standard item vars ord/non-ord
                    [m_isOrdinal, arrData, meanPt, medPt, sdPt, nSize] = buildInitVars(data, itemKey, "multi", rptIdx);

                    if (!m_isOrdinal) {
                        allVars.reverse();
                        meanPts = allVars.map(function(val) { return val[0] });
                        medPts = allVars.map(function(val) { return val[1] });
                        sdPts = allVars.map(function(val) { return val[2] });
                        nSizes = allVars.map(function(val) { return val[3] });
                    } else {
                        meanPts = Object.entries(data).map((item) => item[1].core.μ).reverse();
                        medPts = Object.entries(data).map((item) => item[1].core.x̃).reverse();
                        sdPts = Object.entries(data).map((item) => item[1].core.σ).reverse();
                        nSizes = Object.entries(data).map((item) => item[1].core.N).reverse();
                    }
                }

                let allData = [];
                let m_layout = {};

                /* build title and split long strings with linebreak(s) based on plot type */
                let titleStr = function(pt) {
                    switch (pt) {
                        // title gen for profile line
                        case "pl":
                            Object.keys(data).forEach((item, idx) => {
                                plTitle += item + ((idx + 1 !== Object.keys(data).length) ? ", " : "");
                            });
                            return plTitle + UILANG.m(' Mean Profile');

                        case "hb":
                        case "sq":
                            // title gen for horiz. bar and SD+Histo
                            let spanStr = data[itemKey].item === "" ? "<span>" : "<span style='color: #707070;'>";

                            let it_str = data[itemKey].item;
                            let it_final = "";
                            return `${itemKey}<br>${spanStr}${t_recurs([it_str])}</span>`;

                            /* Recursive routine to split long lines into max length of l_max and return as string with linebreaks */
                            function t_recurs(title) {
                                title.forEach(e => {
                                    let l_max = pt === 'sq' ? 37 : 32;
                                    if (e.length > l_max) {
                                        let tArr = e.split(' ');
                                        let breakpoint = 0;

                                        // loop through string and count # of spaces until max length is reached
                                        for (let i = 0; i < e.length; i++) {
                                            if (i < l_max && e[i] === " ") breakpoint++;
                                        }

                                        // split long array into pieces
                                        let firstArr = tArr.slice(0, breakpoint).join(' ');
                                        let lastArr = tArr.slice(breakpoint, tArr.length).join(' ');


                                        t_recurs([firstArr, lastArr]);

                                    } else {
                                        it_final += e + "<br>";
                                    }
                                });

                                return it_final;
                            }

                    }
                };

                /* Main multiplot type switcher */
                switch (p_type) {

                    case "hb":
                        /* case handler for combined horizontal bar chart */

                        allData = [{
                            type: 'histogram',
                            hoverinfo: 'none',
                            y: arrData,
                            orientation: 'h',
                            name: "Histo" + c,
                            opacity: (p_type === 'pl') ? 0 : 1,
                            histnorm: 'probability',
                            marker: { color: color }
                        }];

                        m_layout = {
                            annotations: [],
                            xaxis: {
                                type: "linear",
                                tick0: 0,
                                dtick: 0.1,
                                tickformat: "%",
                                autorange: false,
                                range: [0, 1.05]
                            },

                        };

                        if (!m_isOrdinal) {
                            m_layout.yaxis = {
                                rangemode: "normal",
                                range: [-1, data[itemKey].xcat.length],
                                tickmode: "array",
                                "categoryorder": "array",
                                autorange: false,
                                categoryarray: data[itemKey].xcat,
                                tickformat: ".0%"
                            }
                        }

                        /* statbox build */
                        if (!nom && m_isOrdinal) m_layout.annotations.push(buildStatboxShape(nSize, meanPt, medPt, sdPt, "multi", undefined, undefined, m_isOrdinal));
                        if (!m_isOrdinal) m_layout.annotations.push(buildStatboxShape(nSizes[c - 1], meanPts[c - 1], medPts[c - 1], sdPts[c - 1], "multi", undefined, undefined, m_isOrdinal));

                    // 'case' fall through to next case to define layout for 'hb' plot type

                    case "sq":
                        /* case handler for histogram/sd bar chart */
                        m_layout = {
                            width: chartAreaWidth,
                            paper_bgcolor: "#eee",
                            annotations: [],
                            shapes: [],
                            bargroupgap: 0.2,
                            yaxis: {
                                visible: true,
                                type: "linear",
                                tick0: 0,
                                dtick: 0.1,
                                autorange: true,
                                showgrid: true,
                                gridcolor: '#0000ff20',
                                gridwidth: 1,
                                tickformat: ".0%"
                            },
                            xaxis: {
                                rangemode: "normal",
                                autorange: !!m_isOrdinal,
                                range: m_isOrdinal ? null : [-1, data[itemKey].xcat.length],
                                type: m_isOrdinal ? "auto" : "category",
                                tickmode: m_isOrdinal ? "auto" : "array",
                                categoryorder: m_isOrdinal ? "linear" : "array",
                                categoryarray: m_isOrdinal ? null : data[itemKey].xcat
                            },
                            title: {
                                text: titleStr(p_type),
                                font: { size: 12 },
                                xref: "container",
                                x: 0.025,
                                yref: "container",
                                y: 0.96
                            },
                            margin: {
                                l: 300,
                                r: 100,
                                t: 0,
                                // b: 25
                            }
                        };

                        /* flip the axes when 'horizontal bar' for proper box plot calculations */
                        if (p_type === 'hb') {
                            let m_x = dc(m_layout.xaxis);
                            let m_y = dc(m_layout.yaxis);

                            m_layout.xaxis = m_y;
                            m_layout.yaxis = m_x;
                        }

                        break;


                    case "pl":
                        /* case handler for profile line chart */

                        /* function constant to build profile line shapes for 'pl' plots */
                        let pl_shape = async function() {

                            let shapeArr = await shapeReturn(dc(meanPts));
                            return shapeArr;

                            async function shapeReturn(plc) {
                                let shape_arr = [];
                                plc.forEach((xc, yc) => {
                                    // ordinal profile line draw
                                    if ((yc + 1) in plc) {
                                        shape_arr.push({
                                            type: "line",
                                            x0: xc,
                                            y0: yc,
                                            x1: plc[yc + 1],
                                            y1: yc + 1,
                                            line: {
                                                color: `rgb(${color})`,
                                                width: 2,
                                                dash: "dash"
                                            }
                                        });
                                    }
                                    // mean point dot draw
                                    shape_arr.push({
                                        type: "circle",
                                        xref: "x",
                                        xsizemode: "pixel",
                                        xanchor: xc,
                                        yanchor: yc,
                                        ysizemode: "pixel",
                                        yref: "y",
                                        x0: -4,
                                        y0: -4,
                                        x1: 4,
                                        y1: 4,
                                        fillcolor: "red",
                                        line: {
                                            width: 0
                                        }
                                    });
                                });
                                return shape_arr;
                            }
                        };

                        m_layout = {
                            annotations: [],
                            width: chartAreaWidth,
                            paper_bgcolor: "#eee",
                            showlegend: false,
                            title: titleStr(p_type, m_isOrdinal),
                            xaxis: {
                                autorange: !m_isOrdinal,
                                type: "auto",
                                tickmode: "auto",
                                categoryorder: m_isOrdinal ? "linear" : "array",
                                categoryarray: m_isOrdinal ? null : data[itemKey].xcat
                            },
                            yaxis: {
                                type: "category",
                                range: [-1, Object.keys(data).length],
                                showline: false,
                                zeroline: false,
                                tickmode: "array",
                                tickformat: ".0%",
                                ticks: "inside",
                                tickvals: ((len) => {
                                    let t = [];
                                    for (let i = 0; i < len; i++) {
                                        t.push(i);
                                    }
                                    t.unshift(-1);
                                    return t;
                                })(Object.keys(data).length),
                                ticktext: (() => {
                                    let tt = Object.keys(data).reverse();
                                    tt.unshift("");
                                    return tt;
                                })(),
                            },
                            shapes: await pl_shape()
                        };

                        /* build annotations */
                        Object.keys(data).map((_val, idx) => {
                            m_layout.annotations.push(buildStatboxShape(nSizes[idx], meanPts[idx], medPts[idx], sdPts[idx], "multi", "pl", idx + 1, m_isOrdinal));
                        });

                        /* no 'real' plotly data used for profile line generation */
                        allData = [{
                            x: [],
                            y: []
                        }];

                        break;

                    default:
                        break;
                }

                /* vars to send globally amongst plot types */
                m_layout.oVars = [m_isOrdinal, arrData, meanPt, medPt, sdPt, nSize];
                m_layout.pc = c; // have to send counter value into var for correct replot mapping; pc = 'plot counter'

                // always plot hist_data to obtain desc stats for non-ordinal datasets
                allData.unshift({
                    /* Boxplot trace data - used for non-ordinal calcs */
                    boxmean: "sd",
                    type: 'box',
                    name: 'Box 1',
                    hoverinfo: "none",
                    visible: true
                }, {
                    /* Histogram trace data - always available for calcs */
                    x: arrData,
                    type: 'histogram',
                    name: "Histo" + c,
                    opacity: (p_type === 'pl') ? 0 : 1,
                    histnorm: 'probability',
                    hoverinfo: 'none',
                    visible: true
                });

                (p_type === "hb") ? allData[0].y = arrData : allData[0].x = arrData;

                let m_options = {
                    editable: true,
                    edits: {
                        shapePosition: false
                    },
                    showTips: false,
                    displayModeBar: true,
                    displaylogo: false,
                    modeBarButtonsToRemove: [
                        "zoom2d",
                        "pan2d",
                        "select2d",
                        "lasso2d",
                        "zoomIn2d",
                        "zoomOut2d",
                        "autoScale2d",
                        "resetScale2d",
                        "hoverClosestGl2d",
                        "hoverClosestPie",
                        "toggleHover",
                        "resetViews",
                        "hoverClosestCartesian",
                        "hoverCompareCartesian",
                        "zoomInGeo",
                        "zoomOutGeo",
                        "resetGeo",
                        "hoverClosestGeo",
                        "sendDataToCloud",
                        "toggleSpikelines",
                        "resetViewMapbox"
                    ]
                };

                /* cleanup 'calc' charts */
                $('.oa_calc').remove();

                if (fromLoad) {
                    if (p_type === "pl") {
                        loadLD.width = chartAreaWidth;
                        m_layout = loadLD;
                    } else {
                        loadLD[c - 1].width = chartAreaWidth;
                        m_layout = loadLD[c - 1];
                    }
                }

                Plotly.newPlot(`OA_chart_${rptIdx}_${c}`, allData, m_layout, m_options).then((plot) => {
                    let i_count = plot.layout.pc;
                    let [histData, histMax] = replotVarDef(plot);

                    plot.layout.rptIdx = rptIdx;

                    layoutData.push(plot.layout);

                    /* enable 'save chart' option */
                    buttons.savePlot.enable();

                    /* set stat values for non-ordinal vars on a 1-index scale */
                    // if (!m_isOrdinal && !nom) {
                    if (!m_isOrdinal) {
                        meanPt = (p_type !== "pl") ? histData.box[0].mean + 1 : histData.box[0].mean;
                        medPt = histData.box[0].med + 1;
                        sdPt = histData.box[0].sd;
                        nSize = histData.box[0].pts.length;
                    } else {
                        [m_isOrdinal, arrData, meanPt, medPt, sdPt, nSize] = plot.layout.oVars;
                    }

                    /* nticks config */
                    m_layout.xaxis.nticks = histData['histogram'].length + 1;

                    /* add non-ordinal x-axis point value annotations */
                    if (!m_isOrdinal && !nom && !fromLoad) {
                        data[itemKey].xcat.forEach((v, i) => {
                            m_layout.annotations.push(addNonOrdX(i, p_type));
                        });
                    }

                    // special x-axis range setting for "open" quesiton answers which did not come preloaded with xcat values
                    if (m_layout.xaxis.range !== undefined && m_layout.xaxis.range[1] === 0) {
                        m_layout.xaxis.range = [-1, histData.box[0].pts.length - 1];
                    }

                    switch (p_type) {
                        case "hb":
                            /* MULTI HORIZONTAL BAR REPLOT CLEANUP */

                            /* add data point labels */
                            for (const e of histData['histogram']) {
                                if (!fromLoad) m_layout.annotations.push(addDPL(e, true));
                            }

                            // remove other plot types
                            allData.splice(0, 2);
                            delete allData[0].x;

                            // set color
                            allData[0].marker = { color: `rgb(${color})` };

                            // special y-axis range setting for "open" quesiton answers which did not come preloaded with xcat values
                            if (m_layout.yaxis.range[1] === 0) {
                                let uVals = allData[0].y.filter((x, i, arr) => arr.indexOf(x) === i);
                                m_layout.yaxis.categoryarray = uVals;
                                m_layout.yaxis.range = [-1, histData.box[0].pts.length - 1];
                            }

                            m_layout.yaxis.automargin = true;
                            m_layout.yaxis.title = {
                                standoff: 35
                            };

                            break;

                        case "sq":
                            /* MULTI HISTOGRAM+SD BAR REPLOT CLEANUP */

                            // remove box plot type
                            allData.splice(0, 1);

                            // set color
                            allData[0].marker = { color: `rgb(${color})` };

                            /* add data point labels */
                            for (const i of histData['histogram']) {
                                if (!fromLoad) m_layout.annotations.push(addDPL(i));
                            }

                            m_layout.yaxis.automargin = true;
                            m_layout.yaxis.title = {
                                standoff: 30
                            };

                            /* add SD bars */
                            m_layout.shapes = buildSDshape(meanPt, medPt, sdPt, m_isOrdinal, histMax);

                            /* statbox build */
                            if (!fromLoad) m_layout.annotations.push(buildStatboxShape(nSize, meanPt, medPt, sdPt, "multi", undefined, undefined, m_isOrdinal));

                            break;

                        case "pl":
                            /* MULTI PROFILE LINE REPLOT CLEANUP */

                            // remove all other plot types
                            allData.splice(0, 2);

                            // set x-axis specifics
                            m_layout.xaxis.nticks = [0, histData['histogram'].length + 1];
                            m_layout.xaxis.range = [0, histData['histogram'].length + 1];
                            m_layout.xaxis.showgrid = true;

                            break;
                    }

                    /* second (final) multiplot redraw */
                    Plotly.react(`OA_chart_${rptIdx}_${i_count}`, allData, m_layout).then(() => {
                        addDlBtn(rptIdx, i_count, 'multi');

                        const m_lblStart = (function launchLblInits() {
                            labelHandler("xtitle", "xaxis.title", rptIdx + "_" + i_count);
                            labelHandler("gtitle", "title.text", rptIdx + "_" + i_count);
                            labelHandler("gtitle-subtitle", "title.subtitle.text", rptIdx + "_" + i_count);
                            labelHandler("ytitle", "yaxis.title", rptIdx + "_" + i_count);
                            return launchLblInits;
                        })();


                        $(`#OA_chart_${rptIdx}_${i_count}`).on("plotly_afterplot", resetPlotHandlers);
                        $(`#OA_chart_${rptIdx}_${i_count}`).on("plotly_relayout", m_lblStart);
                        resetPlotHandlers();

                    });
                }, (r_fail) => { alert(r_fail) });
                if (p_type === 'pl') break; // do not loop if not standard multi-histo type plot (currently, only 'profile line' type)

            } // end of main multiplot 'for' loop

            /* update report block with new report values */
            if (rptIdx !== 'cfg') updateRB(rptIdx, "multi", fInfo, data);

            break; // end of multiplot logic

        case "single":
            if (!cState) return;

            // destructure operation for starting vars
            let [s_isOrdinal, arrData, meanPt, medPt, sdPt, nSize, rcfg] = buildInitVars(data, report_config, "single", rptIdx);

            const histTrace = {
                x: arrData,
                type: 'histogram',
                name: "Histo 1",
                opacity: 1,
                histnorm: 'probability',
                hoverinfo: 'none',
                marker: { color: `rgb(${rcfg.hcol_opt})` }
            };

            const boxTrace = {
                x: arrData,
                boxmean: "sd",
                marker: { opacity: rcfg.b_hdOut_opt ? 0 : null, color: `rgb(${rcfg.hcol_opt})` }, // hide outlier handling selected as option
                type: 'box',
                name: 'Box 1',
                hoverinfo: "none"
            };

            if (rcfg.xbin_val && s_isOrdinal) histTrace.xbins = { size: rcfg.xbin_val };

            const vioTrace = {
                x: arrData,
                orientation: 'h',
                boxmean: "sd",
                type: 'violin',
                name: 'Violin 1',
                meanline: { visible: true, color: 'red' },
                hoverinfo: 'none',
                points: false,
                marker: {
                    color: `rgb(${rcfg.hcol_opt})`
                }
                // side: 'positive'
            };

            let r_data = [];
            r_data.push(histTrace); // always calculate to get range and chart option steting vars
            r_data.push(boxTrace); // always calculate to get non-ordinal calc values (med, mean, sd, etc.)
            if (rcfg.vio_opt) r_data.push(vioTrace);

            /* options to enable only on non-categorical data */

            // If the incoming values are already ordinal, use said incoming values
            if (s_isOrdinal) {
                boxTrace.median = medPt;
                boxTrace.mean = meanPt;
                boxTrace.sd = sdPt;
            }

            // re-init the chart width when coming from loaded entry in case different machine w/ different screen size
            if (fromLoad) loadLD.width = chartAreaWidth;

            let s_layout = {
                yaxis: {
                    visible: rcfg.hist_opt || false,
                    type: "linear",
                    tick0: 0,
                    dtick: 0.1,
                    autorange: false,
                    range: [0, 1],
                    showgrid: true,
                    gridcolor: '#0000ff20',
                    gridwidth: 1,
                    tickformat: ".0%"
                },
                xaxis: {
                    rangemode: rcfg.h_x0_opt ? "tozero" : "normal",
                    autorange: !!s_isOrdinal,
                    range: s_isOrdinal ? null : [-1, fInfo.xcat.length],
                    type: s_isOrdinal ? "auto" : "category",
                    tickmode: s_isOrdinal ? "auto" : "array",
                    categoryorder: s_isOrdinal ? "linear" : "array",
                    categoryarray: s_isOrdinal ? null : fInfo.xcat
                },
                bargap: 0.02,
                paper_bgcolor: "#eee",
                width: chartAreaWidth,
                // bargroupgap: 0.2,
                showlegend: false,
                title: fInfo.fieldName + ": " + fInfo.desc,
                margin: {
                    r: 200
                },

                /* annotations */
                annotations: [],

                /* shapes */
                shapes: [],

                /* grid for legend */
                grid: {
                    columns: 4
                }
            };

            /* single chart plot options */
            let s_options = {
                editable: true,
                edits: {
                    shapePosition: false
                },
                displayModeBar: true,
                displaylogo: false,
                showTips: false,
                modeBarButtonsToRemove: [
                    "zoom2d",
                    "pan2d",
                    "select2d",
                    "lasso2d",
                    "zoomIn2d",
                    "zoomOut2d",
                    "autoScale2d",
                    "resetScale2d",
                    "hoverClosestGl2d",
                    "hoverClosestPie",
                    "toggleHover",
                    "resetViews",
                    "hoverClosestCartesian",
                    "hoverCompareCartesian",
                    "zoomInGeo",
                    "zoomOutGeo",
                    "resetGeo",
                    "hoverClosestGeo",
                    "sendDataToCloud",
                    "toggleSpikelines",
                    "resetViewMapbox"
                ]
            };

            chartAreaInitCheck(rptIdx);

            // Pie chart config
            if (rcfg.pie_opt) {
                // This routine gives us an object with the sum count of each property's value which is later used for the pie chart build
                let pdata = r_data[0].x.reduce(
                    // iterates each property; if count is 0, initialize to 1, otherwise, increment by 1, then feed object back into itself
                    (freqMap, curVal) => {
                        freqMap[curVal] = (freqMap[curVal] || 0) + 1;
                        return freqMap;
                    }, {}
                );

                r_data = [{
                    values: Object.values(pdata),
                    labels: Object.keys(pdata),
                    type: "pie",
                    textinfo: rcfg.pie_l_opt === "pwl" ? "percent" : "label+percent",
                    textposition: rcfg.pie_l_opt === "pwl" ? "inside" : rcfg.pie_l_opt,
                    hoverinfo: 'none',
                    domain: {
                        x: [0.09, 1]
                    }
                }];

                if (rcfg.pie_l_opt === "pwl") {
                    s_layout.showlegend = true;
                    s_layout.legend = {
                        x: 0,
                        y: 0,
                        orientation: "h"
                    }
                }
            }

            /* enable 'save chart' option */
            buttons.savePlot.enable();

            /* open text special operation */
            if (rcfg.ot_opt) {
                if (!fromLoad) $(`.rptblock_${rptIdx}`).empty();

                let ot_data = arrData.filter(v => v.length > 1).map((v) => { return /* html */ `<li style="list-style-type: disclosure-closed; padding-bottom: 10px;">${v}</li>` });
                $(`#OA_chart_${rptIdx}`).append( /* html */ `<div class="ot_container" id="otc_${rptIdx}"></div>`);
                let ot_container = $( /* html */ `#otc_${rptIdx}`);

                ot_container.append( /* html */ `<h2 style="text-align: center; padding: 10px 10px 20px 10px; margin: 0;">${fInfo.desc}</h2>`);

                ot_container.append("<ul style='margin: 0 15px 0 15px'>");
                ot_data.forEach(e => $(`#otc_${rptIdx} > ul`).append(e));
                ot_container.append("</ul>");

                ot_container.width(chartAreaWidth);

                updateRB(rptIdx, "single", fInfo, data);

                layoutData.push({
                    width: chartAreaWidth,
                    rptIdx: rptIdx
                });

                /* Create/update event handler for download open text data  */
                addDlBtn(rptIdx, null, 'single');

                return;
            }

            /* first single plot */

            if (fromLoad) s_layout = loadLD;

            Plotly.newPlot(`OA_chart_${rptIdx}`, r_data, s_layout, s_options).then((plot) => {

                plot.layout.rptIdx = parseInt(rptIdx);
                layoutData.push(plot.layout);

                /* pie chart special operation */
                if (rcfg.pie_opt) {
                    // update report block table
                    // updateRB(rptIdx, "single", fInfo, data);

                    /* Create/update event handler for download image attached to each single plot image  */
                    // addDlBtn(rptIdx, null, 'single');

                } else {
                    let [histData, histMax] = replotVarDef(plot);

                    /* non-ordinal routines */
                    if (!s_isOrdinal) {
                        /* obtain calculated desc stats from first plot iteration data */
                        meanPt = histData.box[0].mean + 1;
                        medPt = histData.box[0].med + 1;
                        sdPt = (histData.box[0].sd);

                        /* apply auto-assigned point values derived for non-ordinal + nominal data (1 index scale) */
                        fInfo.xcat.forEach((v, i) => {
                            if (!rcfg.nom_opt && !fromLoad) s_layout.annotations.push(addNonOrdX(i));
                        });
                    } else {
                        /* ordinal routines */

                        // set number of xaxis ticks based on x data groupings
                        s_layout.xaxis.nticks = histData['histogram'].length + 1;
                    }

                    // whether to show hist and/or box plots (the calcs have already run regardless)
                    if (!rcfg.hist_opt) histTrace.visible = false;
                    if (!rcfg.box_opt) boxTrace.visible = false;

                    /* sd bar inclusion */
                    if (rcfg.sd_opt) s_layout.shapes = buildSDshape(meanPt, medPt, sdPt, s_isOrdinal, histMax);

                    /* statbox build */
                    if (!rcfg.nom_opt && !fromLoad) s_layout.annotations.push(buildStatboxShape(nSize, meanPt, medPt, sdPt, "single"));

                    // histo annotation labels when enabled
                    if (rcfg.h_label_opt) {
                        for (const i of histData['histogram']) {

                            /* Data point labels */
                            if (!fromLoad) s_layout.annotations.push(addDPL(i));
                        }
                    } else {
                        if (!fromLoad) s_layout.annotations.push([{ // <-- quirk: must add a blank annotation array element in order to display xaxis lables for nominal data sets
                            visible: false
                        }]);
                    }

                    // special range setting for "open" question answers which did not come preloaded with xcat values
                    if (s_layout.xaxis.range[1] === 0) {
                        s_layout.xaxis.range = [-1, histData.box[0].pts.length - 1];
                    }

                    /* histogram with either box or violin plots */
                    if (rcfg.hist_opt && (rcfg.box_opt || rcfg.vio_opt)) {
                        boxTrace.width = histMax / 5;

                        /* violin only & histo */
                        if (rcfg.vio_opt && !rcfg.box_opt) {
                            vioTrace.y0 = 0.75;
                        }

                        /* box only & histo */
                        if (!rcfg.vio_opt && rcfg.box_opt) {
                            boxTrace.y0 = 0.75;
                            boxTrace.width = 0.25;
                        }

                        /* box and violin & histo */
                        if (rcfg.vio_opt && rcfg.box_opt) {
                            boxTrace.y0 = 0.9;
                            vioTrace.y0 = 0.5;
                            boxTrace.width = 0.15;
                        }
                    }

                    /* no histogram and either box or violin plots */
                    if ((rcfg.box_opt || rcfg.vio_opt) && !rcfg.hist_opt) {
                        boxTrace.y0 = 0.5;
                        vioTrace.y0 = 0.5;
                        boxTrace.width = 0.5;

                        /* no histo, but BOTH box and violin */
                        if (rcfg.vio_opt && rcfg.box_opt) {
                            vioTrace.y0 = 0.25;
                            vioTrace.width = 0.25;

                            boxTrace.y0 = 0.75;
                            boxTrace.width = 0.25;
                        }
                    }

                    /* show x-axis lines with sd, boxplot, violin, and no histogram */
                    if (!rcfg.hist_opt && (rcfg.box_opt === true || rcfg.vio_opt === true || rcfg.sd_opt === true)) s_layout.xaxis.showgrid = true;
                }

                // final single plot
                Plotly.react(`OA_chart_${rptIdx}`, r_data, s_layout).then(() => {
                    /* Create/update event handler for download image attached to each single plot image  */
                    addDlBtn(rptIdx, null, 'single');

                    const s_lblStart = (function launchLblInits() {
                        labelHandler("xtitle", "xaxis.title", rptIdx);
                        labelHandler("gtitle", "title.text", rptIdx);
                        labelHandler("gtitle-subtitle", "title.subtitle.text", rptIdx);
                        labelHandler("ytitle", "yaxis.title", rptIdx);
                        return launchLblInits;
                    })();

                    $(`#OA_chart_${rptIdx}`).on("plotly_afterplot", resetPlotHandlers);
                    $(`#OA_chart_${rptIdx}`).on("plotly_relayout", s_lblStart);

                    resetPlotHandlers();
                });

            });

            // update report block table
            updateRB(rptIdx, "single", fInfo, data);

            break;

    }

    /* Init the click handlers for all clickable/updateable chart elements (axes, title, etc.) */
    function labelHandler(DOMclassName, plotlyVal, rIdxVal) {

        let LTtxt = null;
        let LTtitle = null;

        // replace/translate default plotly title text values
        $("text.xtitle.js-placeholder").text(UILANG.m("Click to enter X-Axis Title"));
        $("text.ytitle.js-placeholder").text(UILANG.m("Click to enter Y-Axis Title"));
        $("text.gtitle.js-placeholder").text(UILANG.m("Click to enter Chart Title"));
        $("text.gtitle-subtitle.js-placeholder").text(UILANG.m("Click to enter Plot Subtitle"));

        // label values for axis/title nxdialogs
        if (DOMclassName === "xtitle") LTtxt = UILANG.m("Enter new X-Axis label");
        if (DOMclassName === "ytitle") LTtxt = UILANG.m("Enter new Y-Axis label");
        if (DOMclassName === "gtitle") LTtxt = UILANG.m("Enter new Chart Title label");
        if (DOMclassName === "gtitle-subtitle") LTtxt = UILANG.m("Enter new Chart Subtitle label");

        if (DOMclassName === "xtitle") LTtitle = UILANG.m("Update X-Axis");
        if (DOMclassName === "ytitle") LTtitle = UILANG.m("Update Y-Axis");
        if (DOMclassName === "gtitle") LTtitle = UILANG.m("Update Chart Title");
        if (DOMclassName === "gtitle-subtitle") LTtitle = UILANG.m("Update Chart Subtitle");

        let theLabel = $(`#OA_chart_${rIdxVal} .${DOMclassName}`)[0];

        if (typeof theLabel === "undefined" || theLabel.length === 0) return;

        theLabel.parentNode.replaceChild(theLabel.cloneNode(true), theLabel); // copy to remove anon fx event(s)
        theLabel = $(`#OA_chart_${rIdxVal} .${DOMclassName}`)[0]; // re-init the var for the new cloned object

        // translate default placeholder text
        if ($(theLabel).hasClass("js-placeholder")) theLabel.textContent = UILANG.m(theLabel.textContent);

        theLabel.removeEventListener("click", function() { });
        theLabel.addEventListener("click", function() {

            new nxDialog("upd_labels", {
                title: LTtitle,
                width: 600,
                datafields: ['newLabel'],
                contents: /* html */`<div>${LTtxt}:&nbsp;<input maxlength="180" style="width: 100%;" id="newLabel" type="text"></div>`,
                buttons: [{
                    label: UILANG.m("Cancel"),
                    value: "cancel",
                    'cancel': true
                }, {
                    label: UILANG.m("Ok"),
                    value: "ok",
                    'default': true
                }],
                callback: function(button, newString) {

                    let splitNewString = "";
                    newString = (theLabel.className.baseVal.startsWith("gtitle") && theLabel.style.fontSize === "12px") ? lineBreakOp([newString]) : newString;

                    function lineBreakOp(title, bypass = false) {
                        title.forEach(e => {
                            let breakLength = 32;
                            if (e.length > breakLength && bypass === false) {
                                let tArr = e.split(' ');
                                let breakpoint = 0;

                                // loop through string and count # of spaces until max length is reached
                                for (let i = 0; i < e.length; i++) {
                                    if (i < breakLength && e[i] === " ") breakpoint++;
                                }

                                let bpVal = false;
                                if (breakpoint === 0) bpVal = true;

                                // split long array into pieces
                                let firstArr = tArr.slice(0, breakpoint).join(' ');
                                let lastArr = tArr.slice(breakpoint, tArr.length).join(' ');

                                lineBreakOp([firstArr, lastArr], bpVal);

                            } else {
                                if (e !== "") splitNewString += e + "<br>";
                            }
                        });

                        return splitNewString;
                    }

                    if (button === "ok") Plotly.relayout(`OA_chart_${rIdxVal}`, { [`${plotlyVal}`]: newString });
                    if (newString === "") {
                        $(theLabel).addClass("js-placeholder");
                        $(`#OA_chart_${rIdxVal} .${DOMclassName}`).css("opacity", 0.2);
                    }
                }
            });

            $("#newLabel").trigger("focus");

            // populate text field input with text of existing value
            if (!$(theLabel).hasClass("js-placeholder")) $("#newLabel").val(theLabel.textContent);
        });
    }

    // remove events on plot elements we want to exclude from editability
    function resetPlotHandlers() {
        $('.cursor-pointer, .annotation-arrow').each((i, e) => {
            $(e).css("pointer-events", "none");
            $(e).children().css("cursor", "default");
        });
    }


    /* add non-ordinal X-axis index (1-based) */
    function addNonOrdX(catIdx, p_type) {
        let nox = {
            xref: "ax domain",
            axref: "ax domain",
            x: catIdx,
            xanchor: "auto",
            y: p_type === "sq" ? -0.095 : -0.13,
            yref: "paper",
            showarrow: false,
            align: "center",
            text: `<span style="font-size: smaller;">${catIdx + 1}`
        };

        /* flip axes if horizontal plot */
        if (p_type === 'hb') {
            nox.yref = "ay domain";
            nox.ayref = "ay domain";
            nox.xref = "paper";
            nox.x = -0.03;
            nox.y = catIdx - 0.2;
        }

        return nox;
    }

    /* Return Data Point Label Annotation Object */
    function addDPL(i, flipped = false) {
        let dp_obj = {
            // x: ((i.ph0 === i.ph1) ? i.ph0 : i.p) - 0.05,
            x: ((i.ph0 === i.ph1) ? i.ph0 : i.p),
            xref: "x",
            xanchor: "auto",
            ax: 0,
            ayref: "y",
            yref: "y",
            yanchor: "top",
            y: i.s,
            ay: 1.04,
            arrowcolor: "#00006675",
            arrowwidth: 0.5,
            arrowsize: 3,
            align: "center",
            text: `${i.ph0 !== i.ph1 ? '[' + i.ph0 + ', ' + i.ph1 + ']<br>' : ''}<span style='font-weight: bold; color: blue'>${(i.s * 100).toFixed(2) + "%"}<br>[${i.pts.length}]</span>`
        };

        // flip x,y coordinates for horizontal bar type
        if (flipped) {
            dp_obj.x = i.s;
            dp_obj.axref = "x";
            dp_obj.xanchor = "left";
            dp_obj.ax = 1.0;
            dp_obj.yanchor = "auto";
            dp_obj.y = ((i.ph0 === i.ph1) ? i.ph0 : i.p);
            dp_obj.ay = ((i.ph0 === i.ph1) ? i.ph0 : i.p);
        }

        return dp_obj;
    }

    /* Create vars needed prior to replot */
    function replotVarDef(p) {
        const c_types = p.calcdata.map((val) => val[0].trace.type);
        let histData = [];

        for (let i = 0; i < c_types.length; i++) {
            if (typeof p.calcdata[i][0].x === "undefined") continue; // eliminate the empty histo data when parsing horizontal bar request
            histData[c_types[i]] = p.calcdata[i];
        }

        let bc = histData['histogram'].map((x) => { return x.s });
        let hMax = Math.max(...bc);

        return [histData, hMax];

    }
    /* Returns SD Bar 'shapes' object */
    function buildSDshape(meanPt, medPt, sdPt, ord, hMax) {

        /* We are going to make the length of the bar the size of 1 std. dev. */
        let sd_start = meanPt - (sdPt / 2);
        let sd_stop = meanPt + (sdPt / 2);

        /* shift left 1 unit if non-ordinal to correctly place on plot */
        if (!ord) {
            medPt--;
            meanPt--;
            sd_start--;
            sd_stop--;
        }

        /* by default, the SD bar will be slightly higher than the max value amongst all items in the graph (with a ceiling of 0.9) */
        let yaVar = ((1 - hMax) / 2) + hMax;

        /* special SD bar height condition for single plot type with violing OR box, but not both, and no histo */
        /* no histogram and either violin or box plot but not both */
        if (typeof rcfg !== "undefined" && !rcfg.hist_opt && (rcfg.vio_opt || rcfg.box_opt) && (!(rcfg.vio_opt && rcfg.box_opt))) yaVar = 0.8;

        /* SD BAR MANUAL DRAW */
        return [{
            // horizontal sd line draw
            type: "line",
            xref: "x",
            yref: "y",
            ysizemode: "pixel",
            yanchor: yaVar,
            x0: sd_start,
            y0: 0,
            x1: sd_stop,
            y1: 0,
            line: {
                color: "#000",
                width: 2
            }
        }, {
            // left end sd line whisker
            type: "line",
            xref: "x",
            yref: "y",
            ysizemode: "pixel",
            yanchor: yaVar,
            x0: sd_start,
            y0: -5,
            x1: sd_start,
            y1: 5,
            line: {
                color: "#000",
                width: 2
            }
        }, {
            // right end sd line whisker
            type: "line",
            xref: "x",
            yref: "y",
            ysizemode: "pixel",
            yanchor: yaVar,
            x0: sd_stop,
            y0: -5,
            x1: sd_stop,
            y1: 5,
            line: {
                color: "#000",
                width: 2
            }
        }, {
            // mean data point
            type: "circle",
            xref: "x",
            xsizemode: "pixel",
            xanchor: meanPt,
            yanchor: yaVar,
            ysizemode: "pixel",
            yref: "y",
            x0: -4,
            y0: -4,
            x1: 4,
            y1: 4,
            fillcolor: "red",
            line: {
                width: 0
            }
        }, {
            // median data point
            type: "circle",
            xref: "x",
            xsizemode: "pixel",
            xanchor: medPt,
            yanchor: yaVar,
            ysizemode: "pixel",
            yref: "y",
            x0: -4,
            y0: -4,
            x1: 4,
            y1: 4,
            fillcolor: "blue",
            line: {
                width: 0
            }
        }];
    }

    /* Return Statbox Annotation Object  */
    function buildStatboxShape(nSize, meanPt, medPt, sdPt, pt, sub_pt = "", yCord, m_isOrdinal) {

        switch (sub_pt) {
            /* subplot special annotation build */
            case "pl":
                return {
                    x: meanPt + 0.1,
                    y: yCord - 1,
                    /* the below has to stay as ONE LINE! */
                    text: /* html */ `<span style='color: black;'>pop: ${nSize}</span>, <span style='color: red;'>mean: ${m_isOrdinal ? meanPt.toFixed(2) : (meanPt + 1).toFixed(2)}</span>, <span style='color: blue;'>median: ${medPt}</span>, <span style='color: black;'>sd: ${sdPt.toFixed(2)}</span>`,
                    align: "left",
                    showarrow: false,
                    xanchor: "left",
                    xref: "x",
                    yref: "y"
                };

            default:
                /* standard side annotation build */
                return {
                    x: 1,
                    y: 0.5,
                    text: /* html */ `   <span style='color: black;'>pop: ${nSize}</span>
										<br>   <span style='color: red;'>mean: ${meanPt.toFixed(2)}</span>
										<br>   <span style='color: blue;'>median: ${medPt}</span>
										<br>   <span style='color: black;'>sd: ${sdPt.toFixed(2)}</span>`,
                    font: {
                        family: "Consolas, 'Courier New'",
                        size: (pt === "multi" ? 11 : 14),
                    },
                    align: "left",
                    showarrow: false,
                    // axref: "x2 domain",
                    xanchor: "left",
                    xref: "paper",
                    yref: "paper",
                }
        }
    }

    /* build starting basic vars */
    function buildInitVars(data, optVar, pType, ci) {
        switch (pType) {
            case "single":
                let ord;
                ord = (("x̃" in data.core) && (fInfo.fieldName in data.core.x̃));
                return [
                    ord, // ordinality
                    data.core.raw[fInfo.fieldName], //plot array data (arrData)
                    ord ? data.core.μ[fInfo.fieldName] ?? 0 : 0, //mean point (meanPt)
                    ord ? data.core.x̃[fInfo.fieldName] ?? 0 : 0, // median point (medPt)
                    ord ? data.core.σ[fInfo.fieldName] ?? 0 : 0, // standard deviation (sdPt)
                    data.core['N'][fInfo.fieldName], // population size (N)
                    optVar[ci][fInfo.fieldName] // report config vars
                ];

            case "multi":
                return [
                    ("x̃" in data[optVar].core),
                    data[optVar].core.raw,
                    data[optVar].core.μ,
                    data[optVar].core.x̃,
                    data[optVar].core.σ,
                    data[optVar].core.N
                ]
        }
    }

    // anchor to link to end of chart
    $("#gotoend").remove();
    $('#chartArea').append("<div id='gotoend'></div>");
}

function chartAreaInitCheck(rptIdx) {
    if ($(`#OA_chart_${rptIdx}`).length === 0) $('#chartArea').append(`<div style="position: relative; margin: auto;" class=rptblock_${rptIdx} id="OA_chart_${rptIdx}"></div>`);

    if ($(`#OA_chart_${rptIdx}`).children()[1] !== undefined && $(`#OA_chart_${rptIdx}`).children()[1].id.startsWith("otc_")) {
        $(`.rptblock_${rptIdx}`).empty();
    }

}

/**
 * Modify Plotly image download button to be custom for Oasys.
 */
function addDlBtn(rptIdx, i_count, p_type) {
    let oaImgBtn;
    let chartTarg;
    if (p_type === 'single') {
        oaImgBtn = dlimgBtns[rptIdx];
        chartTarg = `OA_chart_${rptIdx}`;

    } else if (p_type === 'multi') {
        oaImgBtn = dlimgBtns[rptIdx][i_count - 1];
        chartTarg = `OA_chart_${rptIdx}_${i_count}`;
    }

    /* redirect dl image creation routine based on report block type */

    let dtstr = UILANG.m("Download Text");
    if ($("#" + chartTarg + " > div")[0].className === "ot_container") {
        $(`.rptblock_${rptIdx}`).prepend(/* html */ `
            <div id="dlbox_${rptIdx}" style="text-align: right; width: ${chartAreaWidth}px; background-color: #fafafa; display: block; padding: 10px 0 10px 0;">
                <input id="dlOpenText_${rptIdx}" data-id=${rptIdx} type="button" value="&#9660; ${dtstr}" style="right: 15px; position: relative;">
            </div>
        `);

        $(`#dlOpenText_${rptIdx}`).on("click", function() {

            let rptIdx = parseInt($(this).data('id'));
            let txtHeader = document.querySelector(`#otc_${rptIdx} h2`).innerHTML;
            let txtBody = document.querySelector(`#otc_${rptIdx} ul`).innerHTML.replaceAll("</li>", "\n\n").replace(/<[^>]*>?/gm, '');
            let finalText = txtHeader + "\n\n\n\n" + txtBody;

            const a = window.document.createElement('a');
            a.href = window.URL.createObjectURL(new Blob([finalText], { type: 'text/plain' }));
            a.download = `oa_text_${rptIdx}.txt`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a)
        });


    } else {
        /* duplicate original plotly download element */
        oaImgBtn = $('a.modebar-btn')[0].cloneNode(true);

        /* customize our plot download element attribute and properties */
        oaImgBtn.classList.remove('modebar-btn'); // to not interfere with additional multiplots
        $('.modebar-container').css({
            position: "relative",
            top: "20px",
            right: "13px"
        });

        /* use better dl icon SVG [attribution: https://primer.style/octicons/desktop-download-24] */
        oaImgBtn.innerHTML = /* html */ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style="width: 90%;"><path style="fill: red;" d="M11.25 9.331V.75a.75.75 0 011.5 0v8.58l1.949-2.11A.75.75 0 1115.8 8.237l-3.25 3.52a.75.75 0 01-1.102 0l-3.25-3.52A.75.75 0 119.3 7.22l1.949 2.111z"></path><path fill-rule="evenodd" d="M2.5 3.75a.25.25 0 01.25-.25h5.5a.75.75 0 100-1.5h-5.5A1.75 1.75 0 001 3.75v11.5c0 .966.784 1.75 1.75 1.75h6.204c-.171 1.375-.805 2.652-1.77 3.757A.75.75 0 007.75 22h8.5a.75.75 0 00.565-1.243c-.964-1.105-1.598-2.382-1.769-3.757h6.204A1.75 1.75 0 0023 15.25V3.75A1.75 1.75 0 0021.25 2h-5.5a.75.75 0 000 1.5h5.5a.25.25 0 01.25.25v11.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25V3.75zM10.463 17c-.126 1.266-.564 2.445-1.223 3.5h5.52c-.66-1.055-1.098-2.234-1.223-3.5h-3.074z" style="fill: #175978;"></path></svg>`;

        /* replace old download button with our customized one (duplicate element to remove anon fx eventListener) */
        $('a.modebar-btn')[0].parentNode.replaceChild(oaImgBtn, $('a.modebar-btn')[0]);

        // add our custom listener to cloned download element button
        oaImgBtn.addEventListener('click', function() {
            let targEl = document.getElementById(chartTarg);

            /* image dimension constants */
            const targWidth = 1600;
            const targHeight = 450;

            /* wait for b64 svg->png (HQ) conversion to finish */
            (async () => {
                let imgDlData = await Plotly.toImage(targEl, { format: 'svg', width: targWidth, height: targHeight }).then((b64) => {
                    return b64svgtob64img(b64, targWidth, targHeight, 'png');
                });

                /* prompt PNG output for download */
                let tmpDlLink = document.createElement("a");
                tmpDlLink.href = imgDlData;
                tmpDlLink.setAttribute("download", targEl.id);
                tmpDlLink.click();
                tmpDlLink.remove();
            })();
        });

        // replace dl button text with lang translatable code
        $(oaImgBtn).attr("data-title", UILANG.m("Download plot as a png"));
    }
}


/* Update report block table */
function updateRB(rb_idx, p_type, fInfo, data) {
    rb_idx = parseInt(rb_idx); // problems with refs otherwise

    /* define the plot data string of the particular report */
    let plotsVar = (p_type === 'single') ? fInfo.fieldName : Object.keys(data).toString();
    plotsVar = plotsVar.replace(/\[.*\]/, '').replace(/,/g, ', ').replace(/, $/, '');

    let rb_exists = rb_table.checkForId(rb_idx + 1) && !fromLoad;

    if (rb_exists) {
        /* if updating an existing report row */
        $(`.sTableClickable[data-tdid=${rb_idx}]`).html(plotsVar);
        $(`#rb_table_${rb_idx + 1} > [data-fielddesc='plotType']`).html(p_type + pt_subinfo());
    } else {
        /* new report item to build */

        let cData;
        if (fInfo !== null && fInfo.fieldName.startsWith("PBR")) {
            cData = "-";
        } else {
            cData = { id: rb_idx, data: plotsVar };
        }

        rb_table.addElement({
            hiddenID: rb_idx + 1, // cannot use int 0 as a value for hiddenID
            plotType: p_type + pt_subinfo(),
            click: cData,
            actionButton: {
                hiddenData: {
                    id: rb_idx,
                    delLabel: p_type + pt_subinfo() + ": " + (p_type === "single" ? fInfo.fieldName : plotsVar)
                }
            }
        });

        // jump to new corresponding chart (always at end of the chart area box)
        setTimeout(() => {
            location.href = "#gotoend";
            history.replaceState(null, "", location.pathname);
        }, 100);
    }

    // always set css for trash can image
    $('td[data-abid^="actionButton_"]').css("background-size", "70%");

    function pt_subinfo() {

        // get extended plot type info to display in table
        let e_info = "";
        if (p_type === "single") {

            // friendly-name string mapping
            let optNames = {
                "h_label_opt": "",
                "b_hdOut_opt": "",
                "rev_opt": "",
                "h_x0_opt": "",
                "hist_opt": UILANG.m("Histo"),
                "vio_opt": UILANG.m("Violin"),
                "box_opt": UILANG.m("Box"),
                "sd_opt": UILANG.m("SD Line"),
                "nom_opt": UILANG.m("Nominal"),
                "pie_opt": UILANG.m("Pie"),
                "ot_opt": UILANG.m("Open Text"),
                "ct_opt": UILANG.m("Custom Text"),
                "pb_opt": UILANG.m("Page Break")
            };

            // loop and build string showing all main options
            for (const key in report_config[rb_idx]) {
                for (const k2 in report_config[rb_idx][key]) {
                    let opt = k2;
                    let val = report_config[rb_idx][key][k2];

                    if (typeof val === "boolean" && val && (optNames[opt] !== "" && typeof optNames[opt] !== "undefined")) e_info += optNames[opt] + ", ";
                }
            }
            e_info = e_info.substring(0, e_info.length - 2);
            return " (" + e_info + ")";
        } else if (p_type === "multi") {
            let optNames = {
                "sq": UILANG.m("Histo+SD"),
                "pl": UILANG.m("Profile Line"),
                "hb": UILANG.m("Horiz. Bar")
            };
            return " (" + optNames[report_config[rb_idx].cfg.m_type] + ")";
        }
    }

    /* control PDF gen button enabling */
    if ($('.data-rows_rb_table').length > 0) buttons.genRpt.enable();
}

/* END OF CHARTING SECTION */

/* START OF MANUAL SCORING SECTION */

/**
 * Build out 'submission summary' UI frame upon
 * initial selection of a test from the main screen.
 *
 * (Depth 1 of scoring process flow)
 */
async function ms_build_subSumPanel() {

    const testSumData = await results_startAjax('fetchTestSubmissionSummary', {
        testId: serverData['id'],
    });

    /* build manual scoring button and launch scoring operations */

    fluidOrMut = testSumData.fluidOrMut;

    if (fluidOrMut) {
        buttons.reportBuilder.disable();
    }

    $('#mscore_embHolder').empty();

    if (window.permList[selection[0].dbId].editSelection) {
        new nxButton($('#mscore_embHolder'), 'eManBtn', {
            label: UILANG.m('Open Manual Scoring'),
            value: {
                action: "goESM",
                testId: testSumData.testId,
            },
            callback: ms_build_scoreTypeScreen,
        });
    }

    /* set manscoring button and style based on completeness, or hide if not a scorable test */
    if (testSumData.scorable === 1) {

        /* scoring status routines */

        $('#mscore_embHolder').css('backgroundColor', '#e6e6e6');

        if (testSumData.containsMS === 1) {
            $('#eManBtn').show();
            $('#background_eManBtn').prepend(/* html */`<span id='ms_scTime'>${UILANG.m("Scoring Last Updated")}: <strong>${testSumData.updateTime}</strong></span>`);
        } else if (testSumData.containsMS === 0) {
            $('#eManBtn').hide();
            $('#background_eManBtn').prepend(/* html */`<span style="margin-bottom: 0px;" id='ms_scTime'>${UILANG.m("This test is fully autoscored.")}</span>`);
        } else if (testSumData.containsMS === -1) {
            $('#eManBtn').hide();
            $('#background_eManBtn').prepend(/* html */`<span style="margin-bottom: 0px;" id='ms_scTime'>${UILANG.m("Scoring information not found.")}</span>`);
        }

        buttons.exportScore.enable();

    } else {

        /* not scorable test routine */

        $('#mscore_embHolder').css({ 'margin-bottom: 0px; backgroundColor': '#e6e6e6', 'fontSize': 'smaller' }).html(UILANG.m('This test does not contain any scorable items.'));
        buttons.exportScore.disable();
    }

}

/**
 * Build the selection screen wherein the operator
 * selects the scoring mode (by question or test taker).
 *
 * (Depth 2 of scoring process flow)
 *
 */
async function ms_build_scoreTypeScreen(data) {

    // re-init native context menu disabling
    $(document).on("contextmenu", function(e) {
        e.preventDefault();
        return false;
    });

    const ftsData = await results_startAjax('fetchTestSummaryData', {
        testId: data.testId,
        startPos: ttl_pagePos,
        q_startPos: tpl_pagePos
    });

    if (ftsData.error) return;

    // disable up/down start section key definitions when in manual scoring mode (they are redefined when 'ms_scoreDetailScreen()' is callled)
    kbHandler.registerShortcut('up', "");
    kbHandler.registerShortcut('down', "");

    // hide all other test result panels and show manual scoring panel
    hideMenu();

    // all hiding routines for buttons2 and dividers
    testView.forEach(e => { e.hide() });
    msDetailView.forEach(e => { e.hide() });
    $('[id^="vd_test"]').hide();
    $('[id^="vd_ms"]').hide();

    hideSection(gui.s1, [gui.s1]);
    hideSection(gui.s2, [gui.s2]);
    hideSection(gui.s3, [gui.s3]);
    hideSection(gui.s4, [gui.s4]);
    hideSection(gui.s5, [gui.s5]);
    showSection(gui.s6, [gui.s6], function() {
        // all show routines for buttons2 and dividers and statusbar text
        $('#sb_submsg').html(`${UILANG.m("browsing scoring selection for test")} "${ftsData.testName}"`);
        msMainView.forEach(e => { e.show() });
        $('[id="vd_ms1"]').show();
    });

    const testId = ftsData.testId;
    const testName = ftsData.testName;
    gui.boxes.mscore_main.setTitle(`${UILANG.m('TEST TAKERS WITH RESULTS LIST FOR ')} <span class='ms_title_emph'>${testName}</span> (${testId})`);

    /* ----------------- */
    const tViewData = ftsData.t_scoringSummary;
    const qViewData = ftsData.q_scoringSummary;

    /* remove any test taker who has not touched the test yet from scoring */
    for (const [i, v] of tViewData.entries()) {
        if (v.testId === null) tViewData.splice(i, 1);
    }

    /* build by test taker view data element */
    const q_view_data = [];
    const t_view_data = [];

    window.allTviewData = dc(tViewData);
    window.allQviewData = dc(qViewData);

    pg_left = {};

    Object.values(tViewData).forEach((val) => {
        pg_left[val.passwordId] = val.msLeft;

        // populate test taker list table data elements
        t_view_data.push({
            tt_info: {
                id: val.passwordId,
                data: (val.msLeft === 0) ? UILANG.m("ALL SCORED") : val.msLeft + " " + UILANG.m("unscored"),
                hiddenData: {
                    passwordId: val.passwordId,
                    passwordTag: val.passwordTag,
                    loginId: val.loginId,
                    loginName: val.loginName,
                    testId: testId
                },
            },
            loginId: val.loginName + " [" + val.loginId + "]",
            displayName: val.displayName,
            passwordId: val.passwordId,
            passwordTag: val.passwordTag,
            score: Scoring.nicePercent(val.finalScore), // convert to percentage friendly format
            progress: Scoring.nicePercent(val.progress, 0), // convert to percentage friendly format
            lconnected: val.lConn
        });
    });

    // populate question list table data elements

    const msList = [];
    Object.values(qViewData).forEach((val) => {
        pg_left[val.id] = val.msLeftPage;

        if (val.scoringTypes.includes("manual")) msList.push(val.id);
        q_view_data.push({
            q_info: {
                id: val.id,
                // data: `${val.itemName} (${val.id}) [${UILANG.m("left to score:")} ${val.msLeftPage}]`,
                data: (val.msLeftPage === 0) ? UILANG.m("ALL SCORED") : val.msLeftPage + " " + UILANG.m("unscored"),
                hiddenData: {
                    pageId: val.id,
                    pageName: val.itemName,
                    testId: testId,
                }
            },
            pageName: val.itemName,
            pageId: val.id,
            languages: val.languages.toString(),
            preview: val.id
        });
    });

    $('#mainManScore').empty(); // wipe UI for new page load

    /* initalize jsTabs */
    let msMainTabs = new jsTabs($('#mainManScore'), 'msTabs');

    let scoringTabList = fluidOrMut ? { btt: UILANG.m('Test Taker List') } : { btt: UILANG.m('Test Taker List'), bp: UILANG.m('Test Page List') };

    msMainTabs.setTabs(scoringTabList);

    /* build by test taker view table */
    new jsSortableTable('mainManScore', 'ms_t_listId', {
        /* TABLE CSS */
        cssStylesCells: {},
        cssHeadCells: { "color": "white" },
        cssStylesTable: {},
        /*  */
        dataId: "ttList",
        readOnly: false,
        fixedOrder: true,
        hideDeleteLinks: true,
        tableHeadDisplay: true,
        tableHead: {
            status: UILANG.m("Status"),
            loginId: UILANG.m("Test Taker Value/ID"),
            displayName: UILANG.m("Test Taker Name"),
            passwordId: UILANG.m('Password ID'),
            passwordTag: UILANG.m('Password Tag'),
            score: UILANG.m('Score'),
            progress: UILANG.m('Progress'),
            lconnected: UILANG.m('Last Connected')
        },
        elements: t_view_data,
        onClick: function(a, b, c, tt_data) {
            tt_data.qType = 't';
            ms_scoreDetailScreen(tt_data);
        }
    });


    $('#sortableTable_ms_t_listId').prepend( /* html */ `
    <div id="ttl_ms_navholder">
    <input id='ttl_ms_t_prevPage' type='button' value=${UILANG.m("Previous page")} />
            <input id='ttl_ms_t_nextPage' type='button' value=${UILANG.m("Next page")} />
            <span>${UILANG.m("Page:")}&nbsp;</span><span id="ttl_curPgNo"></span><span>&nbsp;${UILANG.m("of")}&nbsp;</span><span id='ttl_lastPgNo'></span>
        </div>
    `);

    /* next page handler */
    $('#ttl_ms_t_nextPage').on("click", function() {

        ttl_pagePos = ttl_pagePos + 100;
        ttl_pagePos > ftsData.ttl_count ? ttl_pagePos = ftsData.ttl_count - (ftsData.ttl_count % 100) : ms_build_scoreTypeScreen({ testId: data.testId });
    });

    /* prev page handler */
    $('#ttl_ms_t_prevPage').on("click", function() {
        ttl_pagePos = ttl_pagePos - 100;
        ttl_pagePos < 0 ? ttl_pagePos = 0 : ms_build_scoreTypeScreen({ testId: data.testId });
    });

    // calc and set page number info for navigation
    $('#ttl_curPgNo').html(Math.floor((ttl_pagePos / 100) + 1));
    $('#ttl_lastPgNo').html(Math.floor((ftsData.ttl_count / 100) + 1));

    // selectively disable next/prev page buttons based on page position and total item counts
    (ttl_pagePos + 100) > ftsData.ttl_count ? $('#ttl_ms_t_nextPage').prop('disabled', true) : $('#ttl_ms_t_nextPage').prop('disabled', false);
    ttl_pagePos <= 0 ? $('#ttl_ms_t_prevPage').prop('disabled', true) : $('#ttl_ms_t_prevPage').prop('disabled', false);

    if ($('#ttl_ms_t_prevPage').prop('disabled') && $('#ttl_ms_t_nextPage').prop('disabled')) $('#ttl_ms_navholder').hide();

    /* build by question view table */
    new jsSortableTable('mainManScore', 'ms_q_listId', {
        /* TABLE CSS */
        cssStylesCells: {},
        cssHeadCells: { "color": "white" },
        cssStylesTable: {},
        /*  */
        readOnly: false,
        fixedOrder: true,
        hideDeleteLinks: true,
        tableHeadDisplay: true,
        tableHead: {
            status: UILANG.m('Status'),
            pageName: UILANG.m('Page Name'),
            pageId: UILANG.m('Page ID'),
            languages: UILANG.m('Languages'),
            preview: UILANG.m('Preview')
        },
        elements: q_view_data,
        onClick: function(a, b, c, q_data) {
            q_data.qType = 'q';
            ms_scoreDetailScreen(q_data);
        }
    });

    $('#sortableTable_ms_q_listId').prepend( /* html */ `
        <div id="tpl_ms_navholder">
        <input id='tpl_ms_t_prevPage' type='button' value=${UILANG.m("Previous page")} />
                <input id='tpl_ms_t_nextPage' type='button' value=${UILANG.m("Next page")} />
                <span>${UILANG.m("Page:")}&nbsp;</span><span id="tpl_curPgNo"></span><span>&nbsp;${UILANG.m("of")}&nbsp;</span><span id='tpl_lastPgNo'></span>
            </div>
        `);

    /* next page handler */
    $('#tpl_ms_t_nextPage').on("click", function() {
        ms_lastTabView = 'bp';
        tpl_pagePos = tpl_pagePos + 100;
        tpl_pagePos > ftsData.tpl_count ? tpl_pagePos = ftsData.tpl_count - (ftsData.tpl_count % 100) : ms_build_scoreTypeScreen({ testId: data.testId });
    });

    /* prev page handler */
    $('#tpl_ms_t_prevPage').on("click", function() {
        ms_lastTabView = 'bp';
        tpl_pagePos = tpl_pagePos - 100;
        tpl_pagePos < 0 ? tpl_pagePos = 0 : ms_build_scoreTypeScreen({ testId: data.testId });
    });

    // calc and set page number info for navigation
    $('#tpl_curPgNo').html(Math.floor((tpl_pagePos / 100) + 1));
    $('#tpl_lastPgNo').html(Math.floor((ftsData.tpl_count / 100) + 1));

    // selectively disable next/prev page buttons based on page position and total item counts
    (tpl_pagePos + 100) > ftsData.tpl_count ? $('#tpl_ms_t_nextPage').prop('disabled', true) : $('#tpl_ms_t_nextPage').prop('disabled', false);
    tpl_pagePos <= 0 ? $('#tpl_ms_t_prevPage').prop('disabled', true) : $('#tpl_ms_t_prevPage').prop('disabled', false);

    if ($('#tpl_ms_t_prevPage').prop('disabled') && $('#tpl_ms_t_nextPage').prop('disabled')) $('#tpl_ms_navholder').hide();

    /* color code both test takers and pages with man. corr. items left */
    $(`[data-fielddesc="tt_info"], [data-fielddesc="q_info"]`).each(function() {
        if ($(this).html() === "ALL SCORED") {
            $(this).css('color', 'green');
            $(this).html("<img style='height: 13px; padding-right: 5px;' src='../images/ok.png'>" + $(this).html());
        } else {
            let us_val = /^\d+/.exec($(this).html());
            if (us_val !== null) {
                us_val = us_val[0];
                $(this).html(`<span class='msLeftBubble';>${us_val}</span> unscored`);
            }
        }
    });

    // special marker for pages containing manual scoring item(s)
    for (const i of msList) {
        let targObj = $(`.sTableClickable[data-tdid='${i}']`);
        let html2Rep = targObj.html();
        targObj.html(html2Rep + `&nbsp;<span class='m_note' title="${UILANG.m("Contains manual scoring items")}" style='font-size: smaller; font-weight: bold;'><sup>M</sup></span>`);
    }

    // preview launch button builder for test page list view
    $(`[data-fielddesc="preview"]`).each(function() {
        let pageId = $(this).text();
        let lang = $(this).prev().text();
        $(this).html("<img src='../images/preview.png' style='width: 30px; padding: 0px; margin-top: -15px; padding-left: 20px; position: absolute;' />");
        $(this).on("click", () => Scoring.prvLaunch(pageId, lang));
    });

    // init jsTabs click handler
    let tSel = msMainTabs.getEventType('select');
    $(window).off(tSel);
    $(window).on(tSel, function(ret) {
        switchScSelTab(ret.originalEvent.detail);
    });
    // set active tab to question list when returning from that view
    if (ms_lastTabView === 'bp') {
        ms_lastTabView = "reset";
        msMainTabs.select('bp');
        switchScSelTab('bp');
    } else {
        // otherwise, default test taker view
        msMainTabs.select('btt');
        switchScSelTab('btt');
    }

    // reset page position to zero always when entering this function
    pagePos = 0;

    /**
     * Function to switch scoring view tab prior to scoring
     */
    function switchScSelTab(tabType) {
        switch (tabType) {
            case 'btt':
                $('#sortableTable_ms_t_listId').show();
                $('#sortableTable_ms_q_listId').hide();
                gui.boxes.mscore_main.setTitle(`${UILANG.m('TEST TAKERS WITH RESULTS FOR ')} <span class='ms_title_emph'>${testName}</span> (${testId})`);

                break;

            case 'bp':
                $('#sortableTable_ms_t_listId').hide();
                $('#sortableTable_ms_q_listId').show();
                gui.boxes.mscore_main.setTitle(`${UILANG.m('TEST PAGE LIST FOR ')} <span class='ms_title_emph'>${testName}</span> (${testId})`);
                break;

            default:
                break;
        }
    }
}

/**
 * Build the detailed scoring screen (both test taker
 * and question views). Embedded inside this function
 * is the `pageLoader()` function which handles the
 * loading of the right panel which shows the question
 * page in detail, and contains the scoring element
 * logic.
 *
 * (Depth 3 of scoring process flow)
 *
 * used to process the rest of the screen.
 *
 */

async function ms_scoreDetailScreen(i_data, forcePageSel = false, forceFS = false) {

    // get the detailed question/answer data
    i_data.msOnly = (typeof scoring === "undefined") ? true : scoring.msOnly;
    i_data.pagePosStart = pagePos;
    const listData = await results_startAjax('fetchQAListDetail', i_data);

    scoring.listData = listData;
    scoring.viewType = listData.qType;

    // set view var for when returning to screen 2
    if (listData.qType === 'q') ms_lastTabView = 'bp';

    // reset mouse wheel handler on each test load/reload
    $('#questionListBox, #scoreKeyOuter').off('wheel');

    if (listData.error !== false) return;

    // configure panels
    $('#questionListBox').empty();

    msMainView.forEach(e => { e.hide() });
    $('[id^="vd_ms"]').hide();

    if (forceFS) listData.fastSwitch = true;

    hideSection(gui.s6, [gui.s6], null, listData.fastSwitch);
    showSection(ms_panels.left_section, [ms_panels.left_section], null, listData.fastSwitch);
    showSection(ms_panels.right_section, [ms_panels.right_section], function() {
        msDetailView.forEach(e => { e.show() });
        $('#vd_ms2').show();
        // init reset corrections button and logic
        scoring.reCorsInit(listData, i_data);
        scoring.prevBtnInit();
        //show keyboard help
        scoring.kbShortsInit();
        scoring.chLangBtnInit(i_data);
    }, listData.fastSwitch);

    /* View Type Header Title */
    let listTypeText = (scoring.viewType === "t") ? UILANG.m("TEST PAGE LIST") : UILANG.m("TEST TAKERS LIST");
    let listTypeImg = (scoring.viewType === "t") ? "../images/listDocuments.png" : "../images/testee.png";
    ms_panels.left_section.box.setTitle(/* html */`<span><img style="position: absolute; width: 24px; margin-left: -27px;" src="${listTypeImg}" /></span><span>${listTypeText}</span>`);

    /* Sub-header test taker/page info */

    let dspname = listData.userInfo.displayName ?? "&lt;<em>not given</em>&gt;";

    let subHeadBox;

    if (scoring.viewType === "t") {
        subHeadBox = /* html */`
        <div style="width: 100%; display: block;"><span>${UILANG.m("Test Taker ID")}</span><span style="float: right;">${listData.userInfo.loginName}</span></div>
        <div style="width: 100%; display: block;"><span>${UILANG.m("Test Taker Name")}</span><span style="float: right; font-weight: bold; color: #3a7da8;">${dspname}</span></div>
        `
    } else {
        subHeadBox = /* html */`
        <div style="width: 100%; display: block;"><span>${UILANG.m("Page")}</span><span style="float: right;">${listData.testInfo.pageName} [${listData.testInfo.pageId}]</span></div>
        `
    }

    $('#questionListBox').append(/* html */`<div class="listbox_titleContainer">${subHeadBox}</div>`);

    $('#questionListBox').append(/* html */`<div id="questionListBoxControls"></div>`);

    /* Toggle selection to filter out auto-corrected questions */
    insertToggleswitch($('#questionListBoxControls'), 'onlyManualTog', UILANG.m('Manual Scoring Only'), {
        checked: scoring.msOnly,
        changeCallback: function(_a, toggleState) {
            pagePos = 0;
            scoring.msOnly = toggleState;
            forcePageSel = false;
            ms_scoreDetailScreen(i_data, false, true);
        }
    });

    /* Toggle show hide qSummaryStats box */
    insertToggleswitch($('#questionListBoxControls'), 'infoShowTog', UILANG.m('Show info'), {
        checked: showInfoState,
        changeCallback: function(_0, si_command) {
            if (si_command === true) {
                $('#qSummaryStats').show();
                showInfoState = true;
            } else {
                $('#qSummaryStats').hide();
                showInfoState = false;
            }
        }
    });

    /* append question list table container */
    ms_panels.left_section.box.getInnerBox().append("<div id='qHolder'></div>");

    /* Build list of questions to select for scoring */
    const lastPageSel = (scoring.qTable === null) ? null : String(scoring.qTable.getSelection().id);

    $('#qHolder').prepend( /* html */ `<input id="ms_filter_page" class="ms_fltrBox" type='search' placeholder="${UILANG.m("Filter test page name")}" />`);
    $('#qHolder').prepend( /* html */ `
        <div id="ms_navholder">
            <input id='ms_t_prevPage' type='button' value=${UILANG.m("Previous page")} />
            <input id='ms_t_nextPage' type='button' value=${UILANG.m("Next page")} />
            <span>${UILANG.m("Page:")}&nbsp;</span><span id="curPgNo"></span><span>&nbsp;${UILANG.m("of")}&nbsp;</span><span id='lastPgNo'></span>
        </div>
    `);

    // calc and set page number info for navigation
    $('#curPgNo').html(Math.floor((pagePos / 100) + 1));
    $('#lastPgNo').html(Math.floor((scoring.viewType === 't' ? listData.testPageCount / 100 : listData.testUserCount / 100) + 1));

    // page navigation button handling
    pagePos <= 0 ? $('#ms_t_prevPage').prop('disabled', true) : $('#ms_t_prevPage').prop('disabled', false);

    if (scoring.viewType === 't') (pagePos + 100) > listData.testPageCount ? $('#ms_t_nextPage').prop('disabled', true) : $('#ms_t_nextPage').prop('disabled', false);
    if (scoring.viewType === 'q') (pagePos + 100) > listData.testUserCount ? $('#ms_t_nextPage').prop('disabled', true) : $('#ms_t_nextPage').prop('disabled', false);

    /* next page handler */
    $('#ms_t_nextPage').on("click", function() {
        if (scoring.viewType === 't') {
            pagePos = pagePos + 100;
            pagePos > listData.testPageCount ? pagePos = listData.testPageCount - (listData.testPageCount % 100) : ms_scoreDetailScreen(i_data, false, true);
        }

        if (scoring.viewType === 'q') {
            pagePos = pagePos + 100;
            pagePos > listData.testUserCount ? pagePos = listData.testUserCount - (listData.testUserCount % 100) : ms_scoreDetailScreen(i_data, false, true);
        }
    });

    $('#ms_t_prevPage').on("click", function() {
        pagePos = pagePos - 100;
        pagePos < 0 ? pagePos = 0 : ms_scoreDetailScreen(i_data);
    });

    scoring.qTable = new jsSelectList($('#qHolder'), 'testListItem', {
        orderKey: listData.qType === 't' ? "sortOrder" : "id",
        postfixKey: "qScore",
        postfixFormat: "<span class='qt_total'>%@</span>",
        selectionCallback: () => pageLoader()
    });

    if ($('#ms_t_nextPage').prop('disabled') && $('#ms_t_prevPage').prop('disabled')) $('#ms_navholder').hide();
    switch (listData.qType) {
        case "q":
            /* Question view routine */

            // set the 'next' and 'previous' buttons for question view
            buttons.nextTT.switchMode('q');
            buttons.prevTT.switchMode('q');

            window.nextUp = allQviewData.findIndex(x => x.id === listData.testInfo.pageId) + 1;
            window.prevUp = nextUp - 2;

            if (window.prevUp < 0) {
                buttons.prevTT.disable();
                window.prevUp = allQviewData.length - 1;
            } else {
                buttons.prevTT.enable();
            }
            if (window.nextUp > allQviewData.length - 1) {
                buttons.nextTT.disable();
                window.nextUp = 0;
            } else {
                buttons.nextTT.enable();
            }

            window.next_tt_entry = {
                pageId: allQviewData[nextUp].id,
                pageName: allQviewData[nextUp].itemName,
                loginId: listData.userInfo.loginId,
                loginName: listData.userInfo.loginName,
                passwordId: listData.userInfo.passwordId,
                testId: listData.userInfo.testId,
                fSwitch: true,
                qType: 'q'
            };

            window.prev_tt_entry = {
                pageId: allQviewData[prevUp].id,
                pageName: allQviewData[prevUp].itemName,
                loginId: listData.userInfo.loginId,
                loginName: listData.userInfo.loginName,
                passwordId: listData.userInfo.passwordId,
                testId: listData.userInfo.testId,
                fSwitch: true,
                qType: 'q'
            };

            /* build scrollable list by question (iterate 1st level pages) */
            for (const [loginId, userVals] of Object.entries(listData.userList)) {

                /* calculate individual answer score */
                let earned = null;
                let hasMan = "autoscore";
                let touched;

                for (const [item, itemVals] of Object.entries(userVals.scoringData[listData.testInfo.pageId])) {
                    if (item === 'pageName') continue;

                    /* determine if item has been marked at any point */
                    touched = itemVals.touched;

                    /* sum calculate individual item score */
                    earned += listData.markedScores[userVals.passwordId][listData.testInfo.pageId][item];

                    /* type of scoring for item */
                    if (itemVals.itemScoreType === "manual") hasMan = "manscore";
                }

                scoring.qTable.addItems([{
                    id: userVals.passwordId.toString(),
                    loginId: loginId,
                    name: `${userVals.loginName} ${(userVals.passwordTag !== "") ? '[tag: ' + userVals.passwordTag + ']' : ""}`,
                    pageId: listData.testInfo.pageId,
                    pageName: listData.testInfo.pageName,
                    qScore: `${earned} pts.`,
                    itemName: Object.keys(userVals.scoringData[listData.testInfo.pageId])[0],
                    passwordId: userVals.passwordId,
                    passwordTag: userVals.passwordTag,
                    testId: listData.testInfo.testId,
                    touched: touched,
                    hasMan: hasMan,
                    qType: 'q'
                }]);
            }

            /* force select first entry on scoring detail page load */
            scoring.qTable.setSelection([Object.values(listData.userList)[0].passwordId.toString()]);

            // special table styling for manual/corrected items
            const pwdIdList = listData.passwordList;
            scoring.setTestListStyles(pwdIdList);

            break;


        case "t":
            /* Test view routine */

            // set the 'next' and 'previous' buttons for test taker view
            buttons.nextTT.switchMode('t');
            buttons.prevTT.switchMode('t');

            window.nextUp = allTviewData.findIndex(x => x.passwordId === listData.userInfo.passwordId) + 1;
            window.prevUp = nextUp - 2;

            if (prevUp < 0) {
                buttons.prevTT.disable();
                window.prevUp = allTviewData.length - 1;
            } else {
                buttons.prevTT.enable();
            }
            if (nextUp > allTviewData.length - 1) {
                buttons.nextTT.disable();
                window.nextUp = 0;
            } else {
                buttons.nextTT.enable();
            }


            window.next_tt_entry = {
                loginId: allTviewData[nextUp].loginId,
                loginName: allTviewData[nextUp].loginName,
                passwordId: allTviewData[nextUp].passwordId,
                testId: listData.userInfo.testId,
                fSwitch: true,
                qType: 't'
            };

            window.prev_tt_entry = {
                loginId: allTviewData[prevUp].loginId,
                loginName: allTviewData[prevUp].loginName,
                passwordId: allTviewData[prevUp].passwordId,
                testId: listData.userInfo.testId,
                fSwitch: true,
                qType: 't'
            };

            if (typeof listData.scoringAnswerList === "undefined") {
                scoring.noPagesMsg();
                return;
            }
            let t_list = Object.entries(listData.scoringAnswerList);

            t_list.sort(function(a, b) {
                return a[1].sortOrder - b[1].sortOrder;
            });

            /* iterate first level pages */
            for (const [pageId, pageObject] of t_list) {

                if (typeof pageObject !== 'object' || pageObject === null) continue;
                // mutation tests will have extraneous entries in page list which need to be ignored
                if (typeof pageObject.pageName === "undefined") continue;

                let hasMan = "autoscore";
                let earned = 0;
                let touched;
                let hasTouched = 1;

                /* iterate and add up page level score */
                for (const itemPtVal of Object.values(listData.markedScores[listData.userInfo.passwordId][pageId])) {
                    earned += itemPtVal;
                }

                /* iterate second level items */
                for (const [i_name, itemVals] of Object.entries(pageObject)) {
                    if (i_name === 'pageName' || i_name === 'sortOrder') continue;
                    if (itemVals.itemScoreType === "manual") hasMan = "manscore";
                    touched = itemVals.touched;
                    if (touched === 0) hasTouched = 0;
                }

                /* add element to question list table */
                scoring.qTable.addItems([{
                    id: pageId,

                    sortOrder: pageObject.sortOrder.toString(),
                    name: `${pageObject.pageName}`,
                    qScore: (hasTouched === 0) ? `<span class="list_incomplete_scoring"'>${UILANG.m("Incomplete")}</span>` : `<span class='list_complete_scoring'>${earned}</span>`,
                    pageId: pageId,
                    pageName: pageObject.pageName,
                    passwordId: listData.userInfo.passwordId,
                    passwordTag: listData.userInfo.passwordTag,
                    testId: listData.userInfo.testId,
                    hasMan: hasMan,
                    touched: touched,
                    qType: 't'
                }]);
            }

            /* force select first entry on scoring detail page load */
            let topSel = scoring.qTable.getIdForPosition(0);
            (forcePageSel) ? scoring.qTable.setSelection([lastPageSel]) : scoring.qTable.setSelection([topSel]);

            // special table styling for manual/corrected items
            scoring.setTestListStyles(Object.keys(listData.scoringAnswerList));

            break;


        default:
            return;
    }

    // attempt to size the item nav list to exact height of elements
    let calcdHeight = (23.666 * listData.testPageCount) + 10;
    $('#testListItem.jsSelectList').height(calcdHeight);


    /* frame for live score summary data */
    $('#questionListBox').append( /* html */ `<div id='qSummaryStats' class="ms_sumStatBox"></div>`);


    scoring.alreadyInRO = false; // reset 'already read mode' value on each new ttaker/test load
	await pageLoader();

    /**
     * The primary page loading mechanism which will load individual
     * test pages given the intersection of test taker password and
     * page ID values (irrespective of 'test taker' or 'question list'
     * view mode).
     *
     * (Depth 3 of scoring process flow)
     *
     */
    async function pageLoader(badSync = false) {
        /* custom jsSelectList navigation handling in search/filter mode */

        let selItemVal = scoring.viewType === 't' ? scoring.qTable.getSelection().pageId : scoring.qTable.getSelection().passwordId;
		const tl = scoring.qTable.getJQueryListItems();
        const visList = scoring.qTable.getJQueryVisibleListItems();

        scoring.cmBase = {};
        cmQ = {};

        if ($(`#testListItem_${selItemVal}`).css('display') === 'none') {
            let curIdx = null;

            if (visList.length === 0) return;

            if (visList.length === 1) {
                let targItem = visList.get(0).id.split("testListItem_")[1];
                scoring.qTable.setSelection([targItem]);
            }

            tl.each(function(i, e) {
                if (e.id === "testListItem_" + selItemVal) curIdx = i;
            });

            if (curIdx === 0 && scoring.navDir === "up") {
                let targItem = visList.get(visList.length - 1).id.split("testListItem_")[1];
                scoring.qTable.setSelection([targItem]);
            }

            if (curIdx === (visList.length - 1) && scoring.navDir === "down") {
                let targItem = visList.get(0).id.split("testListItem_")[1];
                scoring.qTable.setSelection([targItem]);
            }

            // determine which should be next/prev index value in table list to select
            if (scoring.navDir === "up") {
                for (let c = curIdx - 1; c >= 0; c--) {
                    if ($(tl.get(c)).is(":visible")) {
                        scoring.qTable.setSelection([tl.get(c).id.split("testListItem_")[1].toString()]);
                        break;
                    }
                }
            }

            // determine which should be next/prev index value in table list to select
            if (scoring.navDir === "down") {
                for (let c = curIdx; c < tl.length; c++) {
                    if ($(tl.get(c)).is(":visible")) {
                        scoring.qTable.setSelection([tl.get(c).id.split("testListItem_")[1].toString()]);
                        break;
                    }
                    scoring.qTable.setSelection([visList.get(0).id.split("testListItem_")[1].toString()]);
                }
            }
        }

        /* when nothing is selected, force select the top entry */
        if (!scoring.qTable.getSelection()) {
            let resetItemId = visList.get(0).id.split("testListItem_")[1];
            scoring.qTable.setSelection([resetItemId]);
        }

        scoring.tooFast = false; // reset the tooFast condition on fresh call
        window.stopNAV = false; // reset stop navigation flag

        const pre_pageSelData = dc(scoring.qTable.getSelection());

        // set scoring buttons temporarily to disabled until data loaded
        scoring.scoringButtonsDisable(true);

        scoring.pageSelectionData = (!scoring.qTable.getSelection()) ? pre_pageSelData : scoring.qTable.getSelection();
        const pageDetailData = await scoring.getPDD();

        // set scoring keyboard mappings
        scoring.ms_kbreg(true, pageDetailData);

        if (pageDetailData.error !== false) return;

        /* Summary stats build [inside '#questionListBox', sibling of '#qHolder'] */
        scoring.buildSummaryBox(pageDetailData);

        // update table score and set section titles
        await scoring.updateScoreAndPanelLabels(pageDetailData);

        if (!scoring.pageSelectionData) return;

        // empty out and stage various UI elements
        scoring.stageUI();

        scoring.itemName = pageDetailData.items[0]; // set/select first item as default, change later on switch

        // question item filtering
        if (scoring.msOnly) scoring.msObjMod(pageDetailData);

        // test activity status conditional handling
        await scoring.testActivityHandling(pageDetailData);

        scoring.pageId = pageDetailData.pageId.toString();

        /* leverage editor classes to build human friendly preview of html code for question section */
        scoring.htmlPreview(pageDetailData);

        // makes for easier iteration, and we don't need this value anymore
        delete pageDetailData.scoringInfo.pageName;

        scoring.isMultiItem = pageDetailData.itemType.length > 1;

        // init question and answer UI divs
        scoring.qaSetup(pageDetailData);

        // iterate page->items to build out response values
        scoring.answerProc(pageDetailData);

        // build scoring area
        scoring.buildScoringBlock(pageDetailData);

        // attach the keyboard icon to help popup
        scoring.kbp_attach();

        /* set mouse scroll wheel handler on scoring selection area for quick scoring and navigation */
        // $('#scoreAssignmentContainer').on('wheel', (e) => setNavWheel(e)); //REVIEW: [MANSCORE] re-enable after making option selectable

        // error note when unable to register score b/c of bad condition
        if (scoring.tooFast || badSync) gui.statusBar.setStatus(UILANG.m("Scoring attempt did not register. Please wait until page is fully loaded prior to scoring. You may try again now."), 3500, "red");

        // re-enable scoring radio buttons
        scoring.scoringButtonsDisable(scoring.readOnly);

        // iterate and render question items
        scoring.itemIter(pageDetailData);

        /* SCORE MARKING OPERATIONS AND HANDLERS */

        /* loop each slider and enable handlers for sliding and slide stop actions */
        pageDetailData.items.forEach(element => {

            const hexItemName = scoring.str2hex(element);
            const targSlider = '#ms_score_slider_' + hexItemName;

            $(targSlider).on("slide", (e, ui) => {
                if (document.fullscreenElement && (document.fullscreenElement.id === "ms_questionArea" || document.fullscreenElement.id === "ms_answerArea")) return;

                $(`#ms_score_slider_${hexItemName} > span`).html( /* html */ `<span class="ms_sliderBar">${ui.value}</span>`);
                $(`#t_ms_score_slider_${hexItemName}`).val(ui.value);

            });

            // set stop sliding handler for each slider element
            $(targSlider).on("slidechange slidestop", (_e, ui) => {
                let tSlidCur = $(`#t_ms_score_slider_${hexItemName}`).val();
                if (isNaN(parseFloat(tSlidCur)) || (tSlidCur === '')) return;
                if (document.fullscreenElement && (document.fullscreenElement.id === "ms_questionArea" || document.fullscreenElement.id === "ms_answerArea")) return;

                const origMax = parseFloat(pageDetailData.assignmentStruct[element].posPts);
                const scoreTarg = scoring.hex2str(ui.handle.parentElement.dataset.sllink);

                /* going beyond max val */
                if (parseFloat($(`#t_ms_score_slider_${hexItemName}`).val()) > origMax) {
                    $(targSlider).css('background-color', 'rgba(170, 33, 33, 0.5) !important');
                    $(`#t_ms_score_slider_${hexItemName}`).css({ 'background-color': '#aa2121', 'color': '#ffffff' });
                    $(`${targSlider} > .ui-slider-handle`).css('background-color', 'rgb(170, 33, 33)');
                    $(`#m_ms_score_slider_${hexItemName}`).html("MAX: " + origMax + " max score overridden!");
                } else {
                    $(targSlider).css('background-color', 'rgba(33, 126, 170, 0.5) !important');
                    $(`#t_ms_score_slider_${hexItemName}`).css({ 'background-color': '#ffffff', 'color': 'black' });
                    $(`${targSlider} > .ui-slider-handle`).css('background-color', '#217eaa');
                    $(`#m_ms_score_slider_${hexItemName}`).html("MAX: " + origMax);
                }

                /* when overriding default max value */
                if (parseFloat($(`#t_ms_score_slider_${hexItemName}`).val()) > origMax) {

                    ui.value = parseFloat($(`#t_ms_score_slider_${hexItemName}`).val());

                    // reset and redraw the slider number bar
                    $(`${targSlider} > .ui-slider-label`).remove();
                    if (!(ui.value > 25)) {
                        $(targSlider).slider().each(function() {
                            const opt = $(this).data().uiSlider.options;
                            const rangeVal = ui.value - opt.min;
                            let incrVal = ((rangeVal % 1) === 0.5) ? 0.5 : 1;

                            for (let i = 0; i <= rangeVal; i = i + incrVal) {
                                const el = $('<label class="ui-slider-label">' + (i) + '</label>').css('left', (i / rangeVal * 100) + '%');
                                $(`${targSlider}`).append(el);
                            }
                        });
                    }

                    if (ui.value !== $(targSlider).slider("option", "value")) $(targSlider).slider("option", "value", parseFloat($(`#t_ms_score_slider_${hexItemName}`).val()));

                } else {
                    /* standard val selection */
                    $(`${targSlider} > .ui-slider-label`).remove();
                    $(targSlider).slider("option", "max", origMax);

                    $(targSlider).slider().each(function() {
                        const opt = $(this).data().uiSlider.options;
                        const rangeVal = origMax - opt.min;
                        let incrVal = ((rangeVal % 1) === 0.5) ? 0.5 : 1;

                        for (let i = 0; i <= rangeVal; i = i + incrVal) {
                            const el = $('<label class="ui-slider-label">' + (i) + '</label>').css('left', (i / rangeVal * 100) + '%');
                            $(`${targSlider}`).append(el);
                        }
                    });
                }

                /* conditional reset of slider max val when exceeding given max val */
                if (parseFloat($(`#t_ms_score_slider_${hexItemName}`).val()) > origMax) $(targSlider).slider("option", "max", ui.value);

                // update slider handle text (ALWAYS); bail if slider disabled (ajax operation)
                $(`#ms_score_slider_${hexItemName} > span`).html( /* html */ `<span class="ms_sliderBar">${ui.value}</span>`);
                $(`#t_ms_score_slider_${hexItemName}`).val(ui.value);
                $(`#t_ms_score_slider_${hexItemName}`).trigger("select");
                if ($(targSlider).slider("option", "disabled")) return;

                const newScore = ui.value;

                scoring.origScore = parseFloat(pageDetailData.scoredByInfo[element].scoreValue);
                scoring.newScore = newScore; // html attribute is string even when not setting value with quotes, apparently

                $(`#ms_score_slider_${hexItemName}`).slider("disable");

                /* attempt to score while ajax operation in progress */
                if (ajx.status !== 200) {

                    // selected radio button reversion routine on failure
                    scoring.revertScoreSelection();

                    // on failure, reload page without sending setScore request
                    pageLoader(true);
                    return;
                }

                scoring.scoringSync().then(async (res) => {
                    window.stopNAV = true;
                    if (res.button === "close") {
                        // set the selection based on view list type
                        scoring.qTable.setSelection((scoring.viewType === 't') ? [String(scoring.qTable.getSelection().pageId)] : [String(scoring.qTable.getSelection().passwordId)]);
                        await pageLoader();
                        return;
                    } else {
                        // ajax call to send in new score value
                        await scoring.setScore(pageDetailData, scoreTarg).then((scoringReturn) => {
                            if (!scoringReturn) {
                                pageLoader(true);
                            }
                            pageDetailData.scoredByInfo[scoreTarg] = scoringReturn;
                            window.stopNAV = false;
                        });
                    }
                });
            });
        });

        // catch question/answer structure integrity failure
        if (pageDetailData.integFail) scoring.iFailMsg();
    }
}

/**
 * Upon an AJAX error, this function will
 * restore the UI condition back to the
 * main test selection view.
 *
 * (Depth (*) -> 1 in scoring process flow)
 */
function ms_revertToMainView() {
    // re-enable up/down keys when in standard mode
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('BACKSPACE');
    kbHandler.registerShortcut('CR', function() {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });

    showMenu();

    msDetailView.forEach(e => { e.hide() });
    msMainView.forEach(element => { element.hide() });
    $('[id^="vd_ms"]').hide(); // hide extraneous dividers

    showSection(gui.s1, [gui.s1]);
    showSection(gui.s2, [gui.s2]);
    showSection(gui.s5, [gui.s5]);
    hideSection(gui.s6, [gui.s6]);
    hideSection(ms_panels.left_section, [ms_panels.left_section]);
    hideSection(ms_panels.right_section, [ms_panels.right_section]);
}

/**
 * Handles the UI logic required to revert
 * view back to inital test selection screen.
 *
 * (Depth 2 -> 1 in scoring process flow)
 */
function ms_closeManScoreList() {

    // reset some critical Scoring class vars
    scoring.listData = null;
    scoring.viewType = null;
    scoring.pageSelectionData = {};

    // reset list page page position values
    ttl_pagePos = 0;
    tpl_pagePos = 0;

    // re-enable up/down keys when in standard mode
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('BACKSPACE');
    kbHandler.registerShortcut('CR', function() {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });

    // switch back to standard test summary view
    showMenu();

    msMainView.forEach(element => { element.hide() });
    $('[id^="vd_ms"]').hide();

    hideSection(gui.s6, [gui.s6], function() {
        showSection(gui.s1, [gui.s1]);
        showSection(gui.s2, [gui.s2]);
        showSection(gui.s5, [gui.s5]);
        testView.forEach(element => { element.show(); });
        $('[id^="vd_test"]').show();
        // $('[id="vd_ms1"]').show();
    });

    // reset status bar msg
    gui.statusBar.setStatus(statusBarDefault);

    ms_build_subSumPanel();
}

/**
 * Handles the UI logic required to revert
 * view back to the scoring type selection
 * screen (Screen 2).
 *
 * (Depth 3 -> 2 in scoring process flow)
 */
function ms_closeManScoreDetail() {

    // reset navigational page position
    pagePos = 0;

    // reset status bar
    gui.statusBar.setStatus(statusBarDefault, false, "black");

    // close full screen (when applicible)
    if (document.fullscreenElement) document.exitFullscreen();

    // switch back to test list view
    msDetailView.forEach(e => { e.hide() });
    $('[id^="vd_ms"]').hide();

    // disable detail scoring kb handling
    scoring.ms_kbreg(false);

    hideSection(ms_panels.left_section, [ms_panels.left_section]);
    hideSection(ms_panels.right_section, [ms_panels.right_section]);

    showSection(gui.s6, [gui.s6], function() {
        msMainView.forEach(e => { e.show() });
        $('[id="vd_ms1"]').show();
    });

    ms_build_scoreTypeScreen({ testId: serverData.id });

}

/* END OF MANUAL SCORING SECTION */

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


/* Ajax communication */
async function results_startAjax(action, data) {
    waitDialog.show();
    const params = {
        action: action,
        data: JSON.stringify(data)
    };
    return window.ajx = $.ajax({
        data: params
    })

}

function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();

    if (textStatus === 'abort') return;

    const dialogData = {
        buttons: [{
            label: UILANG.m('OK'),
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: jqXHR.responseJSON.fatalError,
        title: UILANG.m('Error: ') + errorThrown,
        width: 500
    };
    new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
    if ("isSuper" in res) window.isSuper = res.isSuper; // check for superadmin level status
    if ("isAdmin" in res) window.isAdmin = res.isAdmin; // check for admin level status
    $('#un_val').html(res.loggedInName);

    let dialogData;
    waitDialog.hide();

    if (res.fatalError) {
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.fatalError,
            title: UILANG.m('Error'),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('fatalError', dialogData);
        return;
    }

    if (res.error !== false) {

        //FYI: required for permission compatibility BEGIN

        // dismiss the edit permission dialog prior to launching the error msg to show
        if (res.action === "fetchIgPerm") {
            // close the edit perm user dialog
            editPermDialog.dismiss();

            // remove key capture handler initiated by editPermDialog
            $(document).off("keydown");
            $(document).off("keyup");
        }

        if (res.action === 'fetchTestSummaryData') {
            oldLoc.folder = loc.folder;
        }
        //FYI: required for permission compatibility END

        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.error,
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
                        results_startAjax('fetchLibrary', {
                            location: res.openNewLocationId,
                            rebuild: true,
                            showBlocked: showBlocked
                        });
                    } else if (res.goToParent) {
                        loc.folder = oldLoc.folder;
                        results_startAjax('fetchLibrary', {
                            location: oldLoc.folder,
                            rebuild: true,
                            showBlocked: showBlocked
                        });
                    } else {
                        results_startAjax('fetchLibrary', {
                            location: oldLoc.folder,
                            rebuild: true,
                            showBlocked: showBlocked
                        }).then(() => {
                            if (res.action === 'fetchTestSummaryData') gui.library.setSelection([{ id: selection[0].id }]); // reselect previous item on edit scores permission failure
                        });
                    }
                }

                if (res.action === 'fetchQAListDetail' || res.action === 'fetchQADetail') {
                    ms_revertToMainView();
                }
            }
        };
        new nxDialog('error', dialogData);
        return;
    }

    switch (res.action) {

        case 'fetchLibrary':
            loc.folder = res.data.loc;
            loc.path = res.data.path;
            updateLibrary(res.data.list, res.data.path);
            if (res.data.select) {
                gui.library.setSelection([{
                    id: res.data.select
                }]);
            }
            window.permList = res.permList; // used for selective button enabling
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
            break;
        case 'fetchPreSelect':
            let selected = res.preFix + res.data.id;
            results_startAjax('fetchLibrary', {
                location: res.data.parent,
                select: selected
            });
            break;
        case 'search':
            if (res.data.list.length > 0) {
                gui.library.searchShow(res.data.list, res.data.searchString);
            } else {
                showMsgNoSrchResults(UILANG.m('no_search_results'), res.data.searchString, gui.library);
            }
            break;
        case 'fetchTestResultOverview':
            serverData['id'] = res.testId;
            serverData['testType'] = selection[0].testStructure.type;
            gui.s2.fadeIn(0);
            gui.s5.fadeIn(0);
            const rovl = $("#resultsOverviewList");
            rovl.hide();
            rovl.empty();
            $("#resultsOverviewHeader").empty();
            const noLoginCount = res.noLogins;
            const userRecs = res.activityData.length;
            if (userRecs > 0) {
                buttons.exportAnswers.enable();
                buttons.exportTiming.enable();
                // buttons.exportScore.enable();
                buttons.reportBuilder.enable();
                $("#resultsOverviewHeader").append(UILANG.m('Recorded data found!'));
                rovl.show();
                let r = dataPrep(res.testActivity);
                rovl.append('<table width="100%" id="resTaInf"></table>');
                const rti = $("#resTaInf");
                rti.append('<tr><th colspan="2">' + UILANG.m('Test information') + '</th></tr>');
                rti.append('<tr><td>' + UILANG.m('Test-ID:') + '</td><td class="rightalign">' + serverData['id'] + '</tdclass></tr>');
                rti.append('<tr><td>' + UILANG.m('Test-name:') + '</td><td class="rightalign">' + serverData.testname + '</td></tr>');
                rti.append('<tr><td>' + UILANG.m('Test-type:') + '</td><td class="rightalign">' + serverData.testType + '</td></tr>');
                rti.append('<tr><td>' + UILANG.m('Test-takers with results:') + '</td><td class="rightalign">' + userRecs + '</td></tr>');
                rti.append('<tr><td>' + UILANG.m('Passwords not logged in:') + '</td><td class="rightalign">' + noLoginCount + '</td></tr>');
                rovl.append('<table width="100%" id="resTaView"></table>');
                const rtv = $("#resTaView");
                rtv.append('<tr><th colspan="2">' + UILANG.m('Progress statistics') + '</th></tr>');

                let cProz = {};

                for (let i = 0; i < 6; i++) {
                    if (Number.isInteger(r['c' + i] / r.cx * 100)) {
                        cProz['p' + i] = r['c' + i] / r.cx * 100;
                    } else {
                        cProz['p' + i] = (r['c' + i] / r.cx * 100).toFixed(2);
                    }
                }

                rtv.append('<tr><td width="50%">' + UILANG.m('less than 20 %') + '</td><td class="resultTd" style="background-size: ' + cProz['p0'] + '% 100%;">' + cProz['p0'] + ' % - (' + r.c0 + ')</td></tr>');
                rtv.append('<tr><td>' + UILANG.m('21-40 %') + '</td><td class="resultTd" style="background-size: ' + cProz['p1'] + '% 100%;">' + cProz['p1'] + ' % - (' + r.c1 + ')</td></tr>');
                rtv.append('<tr><td>' + UILANG.m('41-60 %') + '</td><td class="resultTd" style="background-size: ' + cProz['p2'] + '% 100%;">' + cProz['p2'] + ' % - (' + r.c2 + ')</td></tr>');
                rtv.append('<tr><td>' + UILANG.m('61-80 %') + '</td><td class="resultTd" style="background-size: ' + cProz['p3'] + '% 100%;">' + cProz['p3'] + ' % - (' + r.c3 + ')</td></tr>');
                rtv.append('<tr><td>' + UILANG.m('81-99 %') + '</td><td class="resultTd" style="background-size: ' + cProz['p4'] + '% 100%;">' + cProz['p4'] + ' % - (' + r.c4 + ')</td></tr>');
                rtv.append('<tr><td>' + UILANG.m('100 % (fully completed)') + '</td><td class="resultTd" style="background-size: ' + cProz['p5'] + '% 100%;">' + cProz['p5'] + ' % - (' + r.c5 + ')</td></tr>');

                // score editor button link
                rovl.append( /* html */ `<div id='mscore_embHolder'></div>`);

                // continue to scoring UI section if operator has rights on test selection
                ms_build_subSumPanel();

            } else {
                // reset panels
                $('#scoressumOverviewList').empty();
                $('#scoresumOverviewHeader').empty();

                buttons.exportAnswers.disable();
                buttons.exportTiming.disable();
                buttons.exportScore.disable();
                buttons.reportBuilder.disable();
                $("#resultsOverviewHeader").append(UILANG.m('No data recorded yet!'));
            }
            break;



        case 'fetchTestResults':
        case 'fetchDetailedTestScore':
        case 'fetchBehaviourTiming':
            const universalBOM = "\uFEFF";

            let MIMEstr;
            let extStr;

            // set the MIME and extension values based on the format which was chosen
            switch (res.format) {
                case 'excel':
                    MIMEstr = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                    extStr = ".xlsx";
                    break;

                case 'openoffice':
                    MIMEstr = "data:application/vnd.oasis.opendocument.spreadsheet";
                    extStr = ".ods";

                    break;

                default:
                    extStr = ".csv";
            }

            // assemble the data and link based on the format which was chosen (excel + oo have same logic)

            switch (res.format) {
                case 'openoffice':
                case 'excel':
                    if (res.action === 'fetchTestResults') {
                        dl_prompt(res.reportBinary, MIMEstr, 'testresults_id_' + res.testData.id + '_' + res.testData.name + extStr);
                    } else if (res.action === 'fetchDetailedTestScore') {
                        dl_prompt(res.reportBinary, MIMEstr, 'testscore_id_' + res.testData.id + '_' + res.testData.name + extStr);
                    } else if (res.action === 'fetchBehaviourTiming') {
                        dl_prompt(res.reportBinary, MIMEstr, 'behaviourTiming_id_' + res.testData.id + '_' + res.testData.name + extStr);
                    }

                    break;

                default:  // for csv
                    let writeArray = [];
                    $.each(res.csvHeaders, function(k, v) {
                        $.each(v, function(key) {
                            v[key] = handleChars(v[key]);
                        });
                        writeArray.push(v);
                    });
                    $.each(res.csvRows, function(k, v) {
                        $.each(v, function(key) {
                            v[key] = handleChars(v[key]);
                        });
                        writeArray.push(v);
                    });

                    let csvString = "";
                    writeArray.forEach(val => csvString += val.join(localStorage.getItem("expDelim")) + "%0A");

                    const element = document.createElement('a');
                    let fileName = "";
                    if (res.action === "fetchTestResults") {
                        fileName = 'testresults_id_' + res.testData.id + '_' + res.testData.name + extStr;
                    } else if (res.action === "fetchDetailedTestScore") {
                        fileName = 'testscore_id_' + res.testData.id + '_' + res.testData.name + extStr;
                    } else if (res.action === "fetchBehaviourTiming") {
                        fileName = 'behaviourTiming_id_' + res.testData.id + '_' + res.testData.name + extStr;
                    }
                    element.setAttribute('href', 'data:attachment/csv,' + universalBOM + csvString);
                    element.setAttribute('download', fileName);
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);

                    break;

            }

            break;


        case 'fetchReportData':

            // assign return data as global
            report_data = res.data;

            // selectively disable multiplot option if not enough data series
            (Object.values(report_data.items).length < 2) ? buttons.addMultiPlot.disable() : buttons.addMultiPlot.enable();

            break;


        default:

            break;

    }

}