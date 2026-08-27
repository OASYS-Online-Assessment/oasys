"use strict";
$(onReady);
$(document).on("contextmenu", function (e) {
    e.preventDefault();
    return false;
});
//gui elements
let kbHandler;
let waitDialog;
//current context selection
let currSel;
let usedSrchstring;
const buttons = {};
let gui = {};
let langs = {};


function onReady() {
    //setup in the beginning (e.g. onload or onready)
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
        url: "l10nActions.php"
    });
    waitDialog = new jsModalWait('please wait');
    kbHandler = new jsKeyboardHandler();
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('BACKSPACE'); //prevent browser from going back in history
    initGUI();
    gui = {
        boxes: {},
        testLevel: {}
    };
    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">Localization</strong>'
    });

    //main buttons
    buttons.searchFiler = new jsButton2($('header'), 'bSearch', {
        label: 'Search',
        icon: '../images/toolbarIcons/ic_tb_search.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: clickSearch,
        disabled: false
    });

    gui.s1 = createFlexSection('UI', 'sect001', 140, 140); //context choice
    gui.s2 = createFlexSection('UI', 'sect002', 650, 650); //localization strings
    gui.s3 = createFlexSection('UI', 'sect003', 390, 390); //Oasys languages

    // section 1 (Context choice)
    gui.boxes.contextAreas = createFlexBox(gui.s1, 'contextAreas', {
        title: 'Context areas',
        minHeight: 480,
        panelHeight: 30,
        flex: 1,
        noPadding: false
    });

    //Toolbar context area
    gui.boxes.contextAreas.getPanel().append('<div><div id="locContextTbText"></div></div>');

    //section 2 (localization strings)
    gui.boxes.locStrings = createFlexBox(gui.s2, 'locStringsList', {
        title: 'Localization strings',
        minHeight: 480,
        panelHeight: 30,
        flex: 1
    });
    gui.boxes.locStrings.getPanel().append('<div><div id="locStringsTbText"></div></div>');
    gui.boxes.locStrings.getInnerBox().append('<div id="inactiveMsg"><h3 style="text-align:center;color:#AAA">Please select a context area!</h3></div><div id="stringsPanelList"></div>');

    //section 3 (OASYS languages)
    gui.boxes.languages = createFlexBox(gui.s3, 'langList', {
        title: 'Content languages',
        minHeight: 480,
        panelHeight: 30,
        flex: 1
    });
    gui.boxes.languages.getInnerBox().append('<div id="defLangs"><span id="defLangsHead">OASYS default content languages*:</span>Deutsch (DE)<br />English (EN)<br />Français (FR)<br />Lëtzebuergesch (LU)<br /><span id="defLangsNote">* Default languages cannot be removed!</span><br /></div>');

    //Context areas
    gui.contextAreas = new jsSelectList(gui.boxes.contextAreas.getInnerBox(), 'contextSelector', {
        labelKey: 'context',
        orderKey: 'context',
        idKey: 'context',
        hideButtonsKey: 'locked',
        selectionCallback: selectionChanged,
        cancelSingleClickOnDoubleClick: false
    });

    //languages list
    const langOptions = {
        onClick: languageClick,
        onChange: languageChange,
        elements: [],
        tdSizes: {
            langShort: '30px',
            langName: '200px',
            langFallback: '50px'
        },
        tableHead: {
            langShort: 'Code',
            langName: 'Name',
            langFallback: 'Fallback'
        },
        hideDeleteLinks: false,
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
        consecutiveNumbers: false,
        dataId: 'langTable',
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionField: false,
        fixedOrder: true
    };
    gui.languageView = new JsSortableTable('langList', 'languagesList_table', langOptions);

    gui.boxes.languages.getPanel().append('<div><div id="langsTbText"></div><div id="langsTbButton"></div></div>');
    window.langTbButtons = {};
    langTbButtons.addElements = new nxButton($('#langsTbButton'), 'labAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: addLanguage,
        tooltip: 'Add new language',
        disabled: false
    });
    $('#langsTbButton').hide();
    //get library contents
    resetView();
    loadLang();

    //structureView loc strings
    const locOptions = {
        onClick: propertiesClick,
        elements: [],
        tdSizes: {
            name: '180px',
            text: '410px'
        },
        tableHead: {
            name: 'Variable',
            text: 'English string (click to edit languages)'
        },
        hideDeleteLinks: true,
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
        dataId: 'locStringsTable',
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        actionField: false,
        fixedOrder: true
    };
    gui.locStringsView = new JsSortableTable('stringsPanelList', 'stringsPanelList_table', locOptions);
    $('#stringsPanelList').hide();
}

function selectionChanged(sel) {
    currSel = sel;
    $('#inactiveMsg').hide();
    $('#stringsPanelList').show();
    gui.contextAreas.removeItems(["*search matches*"]);
    startAjax('fetchLocStrings', {
        filter: sel.context
    });
}

function updateStructureData(data, context) {
    gui.locStringsView.clearElements(true);

    const langCodes = Object.keys(languages);

    $.each(data, function (k, v) {
        const hdIns = {context: context, variable: k, text: v};
        const objInsert = {
            name: k,
            text: {data: v.EN, id: k, hiddenData: hdIns},
            hiddenID: k
        };

        gui.locStringsView.addElement(objInsert, hdIns);

        const missing = [];
        $.each(langCodes, function (_, code) {
            const val = v[code];
            if (typeof val !== 'string' || val.trim() === '') {
                missing.push(code);
            }
        });

        if (missing.length) {
            gui.locStringsView.setWarningMessage(
                'Translation missing for: ' + missing.join(', '),
                'warning',
                k
            );
        }
    });
}


function propertiesClick(clickedId, parentId, fieldDesc, hiddenData) {
    editLocStrings(hiddenData);
}

function languageClick(clickedId) {
    let clickedName;
    let clickedFallback;
    $.each(langs, function (k, v) {
        if(v.code===clickedId){
            clickedName=v.name;
            clickedFallback=v.fallback;
        }
    });
    let chgLng=clickedFallback;
    let dialogData = {
        buttons: [
            {label: 'Cancel', 'cancel': true, value: 'cancel'},
            {label: 'Save', 'default': true, value: 'ok'}
        ],
        datafields: [
            'tfName',
            'ddFallback'
        ],
        mandatory: [
            'tfName'
        ],
        values: {
            tfName:clickedName,
            ddFallback: clickedFallback
        },
        focus: 'tfShortcut',
        dataFormat: 'object',
        contents: '<div class="tmDialogForm">' +
            '<div class="tmActionConfirmMeta"><span>Language shortcut</span><strong>' + clickedId + '</strong></div>' +
            '<div class="tmDialogFormField"><label for="tfName">Language name in the respective language (e.g. English, Deutsch, Français, Luxembourgish)</label><input type="text" id="tfName" maxlength="60"></div>' +
            '<div class="tmDialogFormField"><label>Fallback language</label><div id="ddFallback"></div></div>' +
        '</div>',
        title: 'Edit content language',
        returnPromise: true,
        width: 400
    };

    showDialog('editLang', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                    startAjax('editLang', {
                        langShort: clickedId,
                        langName: res.data.tfName,
                        langFallback: chgLng
                    });
            }
        }
    );

    $("#tfShortcut").inputFilter(function (value) {
        return /^[a-zA-Z]*$/g.test(value);
    });
    $("#tfName").inputFilter(function (value) {
        return /^[A-Za-zÀ-ž \u0370-\u03FF\u0400-\u04FF]*$/g.test(value);
    });

    let ddFallback = {
        onChange: fallbackChg,
        initialValue: chgLng,
        elements: [{
            value: 'EN',
            label: 'English'
        },{
            value: 'FR',
            label: 'Français'
        },{
            value: 'DE',
            label: 'Deutsch'
        },{
            value: 'LU',
            label: 'Lëtzebuergesch'
        }],
        dataId: 'ddF1',
        theme: 'backend',
        readOnly: false,
        width: '100%'
    };
    new jsDropList('ddFallback', 'ddFallbackLng', ddFallback);
    function fallbackChg(sender, lng) {
        chgLng = lng;
    }

}

function languageChange(clickedId) {
    let dialogData = {
        buttons: [
            {label: 'Cancel', 'default': true, 'cancel': true, value: 'cancel'},
            {label: 'Delete language', value: 'ok'}
        ],
        contents: '<div class="deleteConfirm"><div class="deleteConfirmText"><p>Are you sure you want to delete the content language "'+clickedId+'"? Existing content and front end translations might be deleted. This action is not reversible!</p></div></div>',
        title: 'Delete content language',
        returnPromise: true,
        icon: "../images/warning.png",
        iconWidth: 64,
        width: 400
    };
    showDialog('deleteLang', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
                    startAjax('deleteLang', {
                        langId: clickedId
                    })
            } else {
                loadLang();
            }
        }
    );
}

//search
function clickSearch() {
    const searchDialogDataSrc = {
        buttons: [{
            label: 'Cancel',
            'cancel': true,
            value: 'cancel'
        }, {
            label: 'Search',
            'default': true,
            value: 'search'
        }],
        datafields: ['srchinput'],
        mandatory: ['srchinput'],
        focus: 'srchinput',
        contents: '<p>Search for:<br><input type="text" id="srchinput" style="width: 100%; margin-top: 10px;"></p>',
        title: 'Search',
        width: 400,
        callback: searchRequestClosed
    };
    new nxDialog('searchDialog', searchDialogDataSrc);

    function searchRequestClosed(button, searchstring) {
        if (button === 'search') {
            startAjax('search', {
                searchstring: searchstring
            });
        }
    }

}

/* editing loc strings */
function editLocStrings(data) {
    const srcVariable = data.variable;
    const srcContext = data.context;

    let editlocHTML = '<div class="localizationDialogContainer tmVariableDialog l10nEditStringsDialog">' +
        '<div class="tmVariableIntro"><span>Localization strings for variable:</span><strong>' + l10nEscapeHtml(srcVariable) + '</strong></div>' +
        '<div class="variablesEditContainer tmVariableFields l10nEditStringsFields"><div class="tmVariableFieldList">';
    const dataFields = [];
    $.each(languages, function (k, v) {
        const fieldId = k + '_textLoc';
        editlocHTML += '<label class="tmVariableField" for="' + l10nEscapeHtml(fieldId) + '">' +
            '<span>' + l10nEscapeHtml(v) + '</span>' +
            '<input type="text" class="lblClick" id="' + l10nEscapeHtml(fieldId) + '">' +
            '</label>';
        dataFields.push(fieldId);
    });
    editlocHTML += '</div></div></div>';

    const editLocDialogData = {
        buttons: [{
            label: 'Cancel',
            'cancel': true,
            value: 'cancel'
        }, {
            label: 'Reset to defaults',
            value: 'reset'
        }, {
            label: 'Save changes',
            'default': true,
            disabled: true,
            value: 'save'
        }],
        contents: editlocHTML,
        datafields: dataFields,
        dataFormat: 'object',
        title: 'Edit localization strings',
        width: 850,
        callback: saveChangedLoc
    };
    window.editLocDialog = new nxDialog('editLocDialog', editLocDialogData);

    //pre-populate input fields with available data
    $.each(data.text, function (k, v) {
        $('#' + k + '_textLoc').val(v);
        if ($('#' + k + '_textLoc').val().length < 1) {
            $('#' + k + '_textLoc').addClass('textField-alert');
        } else {
            $('#' + k + '_textLoc').removeClass('textField-alert');
        }
    });

    $('.lblClick').on('keyup', function () {
        if ($(this).val().length < 1) {
            $(this).addClass('textField-alert');
        } else {
            $(this).removeClass('textField-alert');
        }
    });

    function saveChangedLoc(button, dataObject) {
        if (button === 'save') {
            startAjax('saveLocChanges', {
                clickVariable: srcVariable,
                clickContext: srcContext,
                locData: dataObject
            });
        } else if(button === 'reset'){
            triggerReset(srcVariable,srcContext);
        }
    }
}

function l10nEscapeHtml(str) {
    if (str && isNaN(str)) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    return str;
}

function triggerReset(srcVariable,srcContext,button){
    if (!button) {
        const dialogData = {
            buttons: [{
                label: 'Cancel',
                'cancel': true,
                'default': true,
                value: 'cancel'
            }, {
                label: 'Reset to defaults',
                value: 'ok'
            }],
            contents: '<p>Do you really want to reset to defaults for variable "' + srcVariable + '"?</p>',
            title: 'Reset to defaults',
            width: 400,
            callback: triggerReset,
            icon: "../images/warning.png",
            iconWidth: 64
        };
        new nxDialog('resetDialog', dialogData, arguments);

    }
    if (button === 'ok') {
        startAjax('reset2Defaults', {
            clickVariable: srcVariable,
            clickContext: srcContext
        });
    }
}

function addLanguage(){
    let chgLng='EN';
    let dialogData = {
        buttons: [
            {label: 'Cancel', 'cancel': true, value: 'cancel'},
            {label: 'Save', 'default': true, value: 'ok'}
        ],
        datafields: [
            'tfShortcut',
            'tfName',
            'ddFallback'
        ],
        mandatory: [
            'tfShortcut',
            'tfName'
        ],
        focus: 'tfShortcut',
        dataFormat: 'object',
        contents: '<div class="tmDialogForm">' +
            '<div class="tmDialogFormField"><label for="tfShortcut">Language shortcut (e.g. EN, DE, FR, LU)</label><input type="text" id="tfShortcut" maxlength="3" style="text-transform:uppercase;" pattern="[A-Za-z]"></div>' +
            '<div class="tmDialogFormField"><label for="tfName">Language name in the respective language (e.g. English, Deutsch, Français, Luxembourgish)</label><input type="text" id="tfName" maxlength="60"></div>' +
            '<div class="tmDialogFormField"><label>Fallback language</label><div id="ddFallback"></div></div>' +
        '</div>',
        title: 'Add content language',
        returnPromise: true,
        width: 400
    };

    showDialog('addLang', dialogData).then(
        (res) => {
            if (res.button === 'ok') {
               if (res.data.tfShortcut.toUpperCase() in languages){
                   showMessage('The language with the shortcut <strong>'+res.data.tfShortcut.toUpperCase()+' ('+languages[res.data.tfShortcut.toUpperCase()]+')</strong> does already exist!');
               } else {
                   startAjax('saveNewLang', {
                       langShort: res.data.tfShortcut.toUpperCase(),
                       langName: res.data.tfName,
                       langFallback: chgLng
                   });
               }
            }
        }
    );
    $("#tfShortcut").inputFilter(function (value) {
        return /^[a-zA-Z]*$/g.test(value);
    });
    let ddFallback = {
        onChange: fallbackChg,
        initialValue: "EN",
        elements: [{
            value: 'EN',
            label: 'English'
        },{
            value: 'FR',
            label: 'Français'
        },{
            value: 'DE',
            label: 'Deutsch'
        },{
            value: 'LU',
            label: 'Lëtzebuergesch'
        }],
        dataId: 'ddF1',
        theme: 'backend',
        readOnly: false,
        width: '100%'
    };
    new jsDropList('ddFallback', 'ddFallbackLng', ddFallback);
    function fallbackChg(sender, lng) {
        chgLng = lng;
    }

}


/* navigation */
function cursorUp() {
    gui.contextAreas.moveUp();
}

function cursorDown() {
    gui.contextAreas.moveDown();
}

function resetView() {
    $('#locStringsTbText').html('');
    $('#inactiveMsg').show();
    $('#stringsPanelList').hide();
    startAjax('fetchContextAreas', {});
}

function loadLang(){
    startAjax('loadLanguages', {});
}

function launchNoResultsSearchMessage(res) {
    const dialogData = {
        buttons: [{
            label: 'New search',
            value: 'new'
        }, {
            label: 'OK',
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: 'No search results for: "' + res.searchstring + '"',
        width: 500,
        callback: newSearchClicked,
        title: "No search results",
        icon: "../images/warning.png",
        iconWidth: 64
    };
    new nxDialog('Message', dialogData);

    function newSearchClicked(button) {
        if (button === 'new') clickSearch();
    }
}

async function showDialog(id, dialogData) {
    let res = await new nxDialog(id, dialogData);
    return res;
}

/* general helper functions */
function showMessage(msg) {
    const dialogData = {
        buttons: [{
            label: 'OK',
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: msg,
        title: "Message",
        icon: "../images/warning.png",
        iconWidth: 64,
        width: 500
    };
    new nxDialog('Message', dialogData);
}

/* server communication */
function startAjax(action, data) {
    waitDialog.show();
    const params = {
        action: action,
        data: JSON.stringify(data)
    };
    $.ajax({
        data: params
    });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();
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

function ajaxSuccess(res) {
    if ("isSuper" in res) window.isSuper = res.isSuper; // check for superadmin level status
    if ("isAE" in res) window.isAE = res.isAE; // check for admin level status
    $('#un_val').html(res.loggedInName);
    waitDialog.hide();
    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    let dialogData;
    if (res.fatalError) {
        dialogData = {
            buttons: [{
                label: 'OK',
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br />' + res.fatalError),
            title: "Error",
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('fatalError', dialogData);
        return;
    }
    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error !== false) {
        dialogData = {
            buttons: [{
                label: 'OK',
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br />' + res.error),
            title: "Error",
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('error', dialogData);
        return;
    }


    switch (res.action) {
        case 'fetchContextAreas':
            if (res.data.length === 1) {
                $('#locContextTbText').html(Object.keys(res.data).length + ' context');
            } else {
                $('#locContextTbText').html(Object.keys(res.data).length + ' contexts');
            }
            gui.contextAreas.setItems(res.data);
            break;
        case 'loadLanguages':
            langs=res.dbLang;
            gui.languageView.clearElements(true);
            $.each(langs, function (k, v) {
                let nameFill;
                if (isSuper || isAE) {
                    nameFill={id: v.code, data: v.name, hiddenData: v.code};
                } else {
                    nameFill=v.name;
                }
                const objInsert = {
                    langShort: v.code,
                    langName: nameFill,
                    langFallback: v.fallback,
                    hiddenID: v.code,
                };
                gui.languageView.addElement(objInsert, true);
            });
            if(Object.keys(langs).length===1){
                $('#langsTbText').html('4 default & '+ Object.keys(langs).length + ' additional language');
            } else {
                $('#langsTbText').html('4 default & '+ Object.keys(langs).length + ' additional languages');
                if(Object.keys(langs).length===0){
                    gui.languageView.hide();
                }
            }
            if (isSuper || isAE){
                $('#langsTbButton').show();
            }
            if (!isSuper || isAE){
                gui.languageView.removeDeleteButtons();
            }
            break;
        case 'saveNewLang':
        case 'deleteLang':
        case 'editLang':
            location.reload();
            break;
        case 'fetchLocStrings':
            // Ignore a response for a context that the user has since left.
            // AJAX responses can arrive in a different order than the requests.
            if (!currSel || currSel.context !== res.context) {
                break;
            }
            if (res.data.length === 1) {
                $('#locStringsTbText').html(Object.keys(res.data).length + ' variable found for ' + currSel.context);
            } else {
                $('#locStringsTbText').html(Object.keys(res.data).length + ' variables found for ' + currSel.context);
            }
            updateStructureData(res.data, res.context);
            break;

        case 'saveLocChanges':
        case 'reset2Defaults':
            gui.statusBar.setStatus('Changes saved!', 3000, '#0A0');
            //Reload strings or reload Search
            if (currSel.context === '*search matches*') {
                startAjax('search', {
                    searchstring: usedSrchstring
                });
            } else {
                startAjax('fetchLocStrings', {
                    filter: currSel.context
                });
            }
            break;
        case 'search':
            const srcMatches = Object.keys(res.data).length;
            if (srcMatches > 0) {
                let showSrchStr;
                if (res.searchstring.length > 25) {
                    showSrchStr = res.searchstring.substring(25, 0) + '...';
                } else {
                    showSrchStr = res.searchstring;
                }
                if (srcMatches === 1) {
                    $('#locStringsTbText').html(srcMatches + ' match for your search: ' + showSrchStr);
                } else {
                    $('#locStringsTbText').html(srcMatches + ' matches for your search: ' + showSrchStr);
                }

                usedSrchstring = res.searchstring;

                res.contextAreas.unshift({
                    context: '*search matches*',
                    locked: true
                });
                gui.contextAreas.setItems(res.contextAreas);
                gui.contextAreas.setSelection(["*search matches*"]);
                currSel = gui.contextAreas.getSelection();
                $('#inactiveMsg').hide();
                $('#stringsPanelList').show();

                gui.locStringsView.clearWarnings();
                gui.locStringsView.clearElements(true);

                const langCodes = Object.keys(languages);

                $.each(res.data, function (key, value) {
                    const hdIns = {context: value.context, variable: key, text: value.content};
                    const objInsert = {
                        name: key,
                        text: {data: value.content.EN, id: key, hiddenData: hdIns},
                        hiddenID: key
                    };
                    gui.locStringsView.addElement(objInsert, hdIns);

                    const missing = [];
                    $.each(langCodes, function (_, code) {
                        const val = value.content[code];
                        if (typeof val !== 'string' || val.trim() === '') {
                            missing.push(code);
                        }
                    });

                    if (missing.length) {
                        gui.locStringsView.setWarningMessage(
                            'Translation missing for: ' + missing.join(', '),
                            'warning',
                            key
                        );
                    }
                });
            } else {
                if (currSel && currSel.context === '*search matches*') resetView();
                launchNoResultsSearchMessage(res);
            }
            break;

    }
}
