"use strict";
$(onReady);
$(document).on("contextmenu", function(e) {
    e.preventDefault();
    return false;
});
//gui elements
let kbHandler;
let waitDialog;
const buttons = {};
let gui = {};
const settingsObj = {};
let val;

// superadmin global
let isSuper = false;

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
        url: "systemSettingActions.php"
    });
    waitDialog = new jsModalWait('please wait');
    kbHandler = new jsKeyboardHandler();
    kbHandler.registerShortcut('BACKSPACE'); //prevent browser from going back in history
    initGUI();
    gui = {
        boxes: {},
        testLevel: {}
    };
    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">System Settings</strong>'
    });

    //main buttons
    buttons.refreshSettingList = new jsButton2($('header'), 'refreshSettingList', {
        label: 'Refresh List',
        icon: '../images/toolbarIcons/ic_tb_refresh.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: refreshList,
        disabled: false
    });

    insertVerticalDivider('header');

    buttons.syscheck = new jsButton2($('header'), 'syscheck', {
        label: 'System Check',
        icon: '../images/toolbarIcons/ic_tb_systemCheck.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: syscheck,
        disabled: false
    });

    buttons.showModules = new jsButton2($('header'), 'showModules', {
        label: 'Custom modules',
        icon: '../images/toolbarIcons/ic_tb_installedModules.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: showModules,
        disabled: false
    });

    insertVerticalDivider('header', 'mm_div');
    $('#mm_div').hide();

    buttons.filecheck = new jsButton2($('header'), 'filecheck', {
        label: 'File System Check',
        icon: '../images/toolbarIcons/ic_tb_fileSystemCheck.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: filecheck,
        disabled: false
    });


    insertVerticalDivider('header', 'mm_div');
    $('#mm_div').hide();

    buttons.maintMode = new jsButton2($('header'), 'maintMode', {
        label: 'Maintenance Mode',
        icon: '../images/toolbarIcons/ic_tb_maintenanceMode.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: maintMode,
        disabled: false,
        hidden: true
    });

    gui.s1 = createFlexSection('UI', 'sect001', 1000, 1000, 0, 'fullWidthFlex'); //settings variables

    // section 1 (Context choice)
    gui.boxes.varSettings = createFlexBox(gui.s1, 'varSettings', {
        title: 'Settings list',
        minHeight: 480,
        panelHeight: 30,
        flex: 1,
        noPadding: false
    });

    //Toolbar Settings
    gui.boxes.varSettings.getPanel().append('<div><div id="settTbText"></div></div>');


    //structureView settings
    const settingsOptions = {
        onChange: propertiesChanged,
        onClick: propertiesClick,
        elements: [],
        tdSizes: {
            option: '150px',
            value: '330px',
            comment: '440px'
        },
        tableHead: {
            option: 'Setting',
            value: 'Value',
            comment: 'Description'
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
        consecutiveNumbers: false,
        dataId: 'settingsTable',
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        hideDeleteLinks: true,
        fixedOrder: true,
        actionField: true,
        actionFieldSize: '65px',
        actionFieldColText: "status",
        actionFieldDefaultText: "default",
        actionFieldModifiedText: "modified",
        actionFieldInactiveText: "immutable",
        cssStylesAFdefault: {
            'text-align': 'left',
            'color': '#22AA41',
            'font-size': '12px'

        },
        cssStylesAFmodified: {
            'color': '#E36B20',
            'text-align': 'left',
            'font-size': '12px'
        },
        cssStylesAFinactive: {
            'color': '#bebebe',
            'text-align': 'left',
            'font-size': '12px'
        },
    };
    gui.settingsView = new jsSortableTable('varSettings', 'varSettings_table', settingsOptions);

    //get content
    startAjax('fetchSettings', {});
}

async function maintMode(button, stopMsg = "") {

    let mm_res = await startAjax("m_status");
    if (mm_res.error) return;
    let belist = "";

    if (mm_res.fecount > 0 && stopMsg === "") {
        stopMsg = `One or more test takers are active. You may not activate frontend maintenance mode until all test takers are logged out.`;
    }

    if (mm_res.becount > 0) {
        if (mm_res.fecount > 0) stopMsg += "<br><br>";

        stopMsg += `
            One or more backend logins are currently active. Activating backend maintenance mode will terminate all logged in editor sessions (excluding yourself).
            <br><br>
            <u>Proceed at your own risk!</u>`;

        belist = `<span style="font-weight: bold; text-decoration: underline;">Active Backend Logins</span><br>`;
        mm_res.beusers.forEach(e => {
            belist += e + "<br>";
        })
    }

    const mmdObj = new nxDialog("mmodeDiag", {
        width: 450,
        title: "Maintenance Mode Control",
        buttons: [{
            label: "Close",
            value: "ok",
            'default': true
        }],
        contents: /* html */ `
            <p style="color: red; font-weight: bold;">${stopMsg}</p>
            <div style="font-weight: bold; text-decoration: underline;">Current maintenance mode statuses:</div>
            <div id="mm_tsholder"></div>
            <div id="beblock" style=" margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc; display: none;">${belist}</div>
        `
    });

    if (mm_res.becount > 0) $('#beblock').show();

    // populate table with all possible maint mode sections and settings
    for (const mEntry of Object.values(mm_res.m_status)) {

        insertToggleswitch($('#mm_tsholder'), mEntry.sys_section, mEntry.sys_section, {
            checked: (mEntry.status !== 0),
            readOnly: (mm_res.fecount > 0 && mEntry.sys_section === "frontend"),
            callback: function(section, value) {
                startAjax("change_m_status", {
                    section: section,
                    state: (value === true) ? 1 : 0
                }).then((res) => {
                    if (res.error) return;
                    if (res.stop) {
                        mmdObj.dismiss();
                        maintMode(null, "Sorry, one or more test takers are currently active! Please try again later.");
                    }
                });
            }
        });

    }

}

async function filecheck() {
    let ret = await startAjax("filesyscheck", {});

    if (ret.error) {
        return;
    }

    // replace standard line breaks with HTML line breaks
    ret.output = ret.output.replace(/\n/g, '<br>');

    // Remove first 3 lines of output for cleaner view in UI
    ret.output = ret.output.split('<br>').slice(3).join('<br>');

    const firstLine = ret.output.split('<br>')[0];
    if (firstLine === "-----------------------------------------------------") {
        ret.output = "<span style=\"text-weight: bold; color: green;\">All files match.</span>";
    }

    let fc_diag = new nxDialog("fc_diag_id", {
        buttons: [{
            label: "Ok",
            value: "ok",
            'default': true
        }, {
            label: "Copy to Clipboard",
            value: "cp2clip"
        }, {
            label: "Clean up Files",
            value: "cleanup",
            disabled: true
        }],
        width: "800",
        title: "File System Check",
        contents: /* html */ `<div id="fcTxt" style="font-family: 'monospace'; font-size: 14px">${ret.output}</div>`,
        callback: function(button) {
            if (button === "cp2clip") {
                // replace fcTxt div element html linebreaks with normal linebreaks
                const fcTxtLB = $('#fcTxt').html().replace(/<br>/g, '\n');
                $('#fcTxt').html(fcTxtLB);
                if (navigator.clipboard) {
                    navigator.clipboard.writeText($('#fcTxt').text()).then(() => {
                        alert('Copied to clipboard');
                    }).catch(err => {
                        alert('Failed to copy text: ' + err);
                    });
                } else {
                    // backup function when in development / not in HTTPS mode
                    const textArea = document.createElement("textarea");
                    textArea.value = $('#fcTxt').text();
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        // noinspection JSDeprecatedSymbols
						document.execCommand('copy');
                        alert('Copied to clipboard');
                    } catch (err) {
                        alert('Failed to copy text: ' + err);
                    }
                    document.body.removeChild(textArea);
                }
            } else {
                if (button === "cleanup") {
                    startAjax("file_cleanup", {}).then((res) => {
                        new nxDialog("remResult", {
                            button: [{
                                label: "Ok",
                                value: "ok",
                                "default": true
                            }],
                            width: 1200,
                            title: "File Cleanup Result",
                            contents: /* html */ `${res.res}`
                        });
                    });
                }
            }
        }
    });
    if (ret.output.includes("EXTRA:") || ret.output.includes("EMPTY:")) {
        fc_diag.enableButton("cleanup");
    }
}

async function syscheck() {

    let ret = await startAjax("syscheck", {});

    let sysHtml = "<table class='sc_table'>";
    sysHtml += "<th>Parameter</th><th>Required</th><th>Found</th>";
    for (let [sc_key, sc_val] of Object.entries(ret.data)) {
        if (sc_key === "failMsgs" || sc_key === "req" || sc_key === "found" || sc_key === "warn") continue;

        let failed_sc = "";
        let warn_sc = "";
        if (sc_val === false) {
            failed_sc = "style='color: red;'";
            ret.data["found"][sc_key] = "<img alt='' id='sc_errImg' style='height: 15px; padding-right: 5px; position: relative; top: 2px' src='../images/false.png'>" + ret.data["found"][sc_key] + "<br><br>" + ret.data["failMsgs"][sc_key];
            setTimeout(() => {
                if (sc_key === "User Grant Privileges") {
                    $('#sc_errImg').remove();
                    $('#missingText').prepend("<img alt='' id='sc_errImg' style='height: 15px; padding-right: 5px; position: relative; top: 2px' src='../images/false.png'>");
                }
            }, 50);
        } else if (sc_val === "warn") {
            warn_sc = "style='color: darkorange;'";
            ret.data["found"][sc_key] = /* html */ `<img alt="" style="height: 15px; padding-right: 5px; position: relative; top: 2px" src='../images/warning.png'>` + ret.data["warn"][sc_key];
        }
        else {
            ret.data["found"][sc_key] = /* html */ `<img alt="" style="height: 15px; padding-right: 5px; position: relative; top: 2px" src='../images/ok.png'>` + ret.data["found"][sc_key];
        }

        sysHtml += /* html */ `
        <tr>
            <td class="sc_cell">${sc_key}</td>
            <td class="sc_cell">${ret.data["req"][sc_key]}</td>
            <td ${failed_sc} ${warn_sc} class="sc_cell">${ret.data["found"][sc_key]}</td>
        </tr>`;

    }

    sysHtml += "</table>";

    new nxDialog("sc_diag_id", {
        buttons: [{
            label: "Ok",
            value: "ok",
            'default': true
        }],
        title: "System Check",
        contents: /* html */ `
        ${sysHtml}
        `,
        width: 1000
    });
}

function showModules() {
    let content;
    if (!settings || !settings.modules || Object.keys(settings.modules).length === 0) {
        content = "<p>No custom modules installed.</p>";
    } else {
        content = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ccc;">Module</th>
                        <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ccc;">Description</th>
                        <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Min OASYS</th>
                        <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Max OASYS</th>
                        <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Version</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.keys(settings.modules).forEach(moduleName => {
            let mod = settings.modules[moduleName];
            content += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>${mod.module}</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${mod.info}</td>
                    <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${mod.oamin}</td>
                    <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${mod.oamax}</td>
                    <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;"><strong>${mod.version}</strong></td>
                </tr>
            `;
        });

        content += `
                </tbody>
            </table>
        `;
    }

    new nxDialog("sc_moduleCheck_id", {
        buttons: [{
            label: "Ok",
            value: "ok",
            'default': true
        }],
        title: "Custom Modules Installed",
        contents: content,
        width: 800
    });
}

function refreshList() {
    startAjax('fetchSettings', {});
}

function propertiesClick(clickedId, parentId, fieldDesc) {
    let clickedKey;
    fieldDesc === 'actionField' ? clickedKey = clickedId.substring('actionField_varSettings_table_'.length) : clickedKey = clickedId;

    switch (settingsDefaults[clickedKey].format) {
        case 0:
            edit_bool(clickedKey);
            break;
        case 1:
            edit_int(clickedKey);
            break;
        //case '2' (double) not used at the moment. If needed jsNumberInput needs to be updated to support floats/doubles
        case 3:
            edit_string(clickedKey);
            break;
        case 4:
            edit_single_choice_int(clickedKey);
            break;
        case 5:
            edit_single_choice_string(clickedKey);
            break;
        case 6:
            edit_multiple_choice(clickedKey);
            break;
        case 7:
            edit_password(clickedKey);
    }
}

function propertiesChanged(deleted, id, currValue, dirty, dataId, rowName, button) {
    //console.log(arguments);
    //Not used here
}

function edit_bool(clickedKey, button) {
    if (!button) {
        const editSetHTML = '<div class="settingsDialogContainer" style="width:100%;max-height:450px;"><table class="settingsTable"><tr><td style="width:60%;">Current:</td><td><div id="setting"></div></tr><tr><td>Default:</td><td>' + settingsDefaults[clickedKey].value + '</td></tr></table></div>';
        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            title: 'Edit system setting: ' + clickedKey,
            width: 450,
            callback: edit_bool
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        const cvs = $('#setting');
        const settingVal = {};
        settingVal.currVal = new jsToggleswitch(cvs, 'tsCurrVal', {
            dataId: 'settVal',
            height: 20,
            width: 60,
            background: 'images/ic_ui_toggleswitch.png',
            changeCallback: valChanged
        });
        settingVal.currVal.reset(settingsObj[clickedKey]);
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            if (settingsDefaults[clickedKey].value === val) {
                resetSetting(clickedKey);
            } else {
                saveSetting(clickedKey, val, false);
            }
        }
    }

    function valChanged(sender, valSend) {
        editSetDialog.enableButton('save');
        val = valSend;
    }
}

function edit_int(clickedKey, button) {
    if (!button) {
        const editSetHTML = '<div class="settingsDialogContainer"><table class="settingsTable"><tr><td style="width:60%;">Current:</td><td><div id="setting"></div></tr><tr><td>Default:</td><td>' + settingsDefaults[clickedKey].value + '</td></tr><tr><td>Min / Max:</td><td>' + settingsDefaults[clickedKey].min + ' / ' + settingsDefaults[clickedKey].max + ' </td></tr></table></div>';
        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            title: 'Edit system setting: ' + clickedKey,
            width: 450,
            callback: edit_int
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        const cvs = $('#setting');
        const settingVal = {};
        settingVal.currVal = new jsNumberInput(cvs, 'tsCurrVal', {
            dataId: 'settVal',
            range: settingsDefaults[clickedKey].min + '..' + settingsDefaults[clickedKey].max,
            step: settingsDefaults[clickedKey].step,
            height: 20,
            width: 100,
            initialValue: settingsObj[clickedKey],
            onChange: valChanged
        });
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            if (settingsDefaults[clickedKey].value === val) {
                resetSetting(clickedKey);
            } else {
                if (val < settingsDefaults[clickedKey].min) {
                    showMessage('Your entered value ( ' + val + ' ) is below the minimum of ' + settingsDefaults[clickedKey].min + '. Minimum value has been saved!');
                    val = settingsDefaults[clickedKey].min;
                }
                if (val > settingsDefaults[clickedKey].max) {
                    showMessage('Your entered value ( ' + val + ' ) is above the maximum of ' + settingsDefaults[clickedKey].max + '. Maximum value has been saved!');
                    val = settingsDefaults[clickedKey].max;
                }
                saveSetting(clickedKey, val, false);
            }
        }
    }

    function valChanged(sender, valSend) {
        editSetDialog.enableButton('save');
        val = valSend;
    }
}

function edit_string(clickedKey, button, dataObj) {
    if (!button) {
        const dataFields = [];
        dataFields.push('setting');
        const editSetHTML = '<div class="settingsDialogContainer"><table class="settingsTable"><tr><td style="width:30%;">Current:</td><td><input type="text" class="setClick" id="setting" style="width: 100%;"></td></tr><tr><td>Default:</td><td>' + settingsDefaults[clickedKey].value + '</td></tr></table></div>';

        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            datafields: dataFields,
            mandatory: ['setting'],
            focus: 'setting',
            dataFormat: 'object',
            title: 'Edit system setting: ' + clickedKey,
            width: 500,
            callback: edit_string
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        //Pre-Fill
        $('#setting').val(settingsObj[clickedKey]);
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            if (settingsDefaults[clickedKey].value === dataObj.setting) {
                resetSetting(clickedKey);
            } else {
                saveSetting(clickedKey, dataObj.setting, false);
            }
        }
    }
}

function edit_password(clickedKey, button, dataObj) {
    if (!button) {
        const dataFields = [];
        let defVal;
        (settingsDefaults[clickedKey].value === '') ? defVal = '< no value set >' : defVal = settingsDefaults[clickedKey].value;
        dataFields.push('setting');
        const editSetHTML = '<div class="settingsDialogContainer"><table class="settingsTable"><tr><td style="width:30%;">Current:</td><td><input type="password" class="setClick" id="setting" style="width: 100%;"></td></tr><tr><td>Default:</td><td>' + defVal + '</td></tr></table></div>';

        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            datafields: dataFields,
            mandatory: ['setting'],
            focus: 'setting',
            dataFormat: 'object',
            title: 'Edit system setting: ' + clickedKey,
            width: 500,
            callback: edit_password
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        //Pre-Fill
        //$('#setting').val(settingsObj[clickedKey]);
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            if (settingsDefaults[clickedKey].value === dataObj.setting) {
                resetSetting(clickedKey);
            } else {
                saveSetting(clickedKey, dataObj.setting, true);
            }
        }
    }
}

function edit_single_choice_int(clickedKey, button) {
    if (!button) {
        const editSetHTML = '<div  class="settingsDialogContainer" ><table class="settingsTable"><tr><td style="width:30%;">Current:</td><td><div id="setting"></div></tr><tr><td>Default:</td><td>' + settingsDefaults[clickedKey].value + '</td></tr></table></div>';
        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            title: 'Edit system setting: ' + clickedKey,
            width: 450,
            callback: edit_single_choice_int
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        const cvs = $('#setting');
        const settingVal = {};
        const contentDropList = [];
        for (let i in settingsDefaults[clickedKey].choices) {
            contentDropList.push({ label: i + ' ' + settingsDefaults[clickedKey].choices[i], value: i });
        }
        settingVal.currVal = new jsDropList(cvs, 'tsCurrVal', {
            dataId: 'settVal',
            elements: contentDropList,
            initialValue: settingsObj[clickedKey].toString(),
            onChange: valChanged
        });
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            if (settingsDefaults[clickedKey].value === val) {
                resetSetting(clickedKey);
            } else {
                val = parseInt(val);
                saveSetting(clickedKey, val, false);
            }
        }
    }

    function valChanged(sender, valSend) {
        editSetDialog.enableButton('save');
        val = valSend;
    }
}

function edit_single_choice_string(clickedKey, button) {
    if (!button) {
        const editSetHTML = '<div class="settingsDialogContainer"><table class="settingsTable"><tr><td style="width:30%;">Current:</td><td><div id="setting"></div></td></tr><tr><td>Default:</td><td>' + settingsDefaults[clickedKey].value + '</td></tr></table></div>';
        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            title: 'Edit system setting: ' + clickedKey,
            width: 450,
            callback: edit_single_choice_string
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        const cvs = $('#setting');
        const settingVal = {};
        const contentDropList = [];
        for (let i in settingsDefaults[clickedKey].choices) {
            contentDropList.push({ label: settingsDefaults[clickedKey].choices[i], value: i });
        }
        settingVal.currVal = new jsDropList(cvs, 'tsCurrVal', {
            dataId: 'settVal',
            elements: contentDropList,
            initialValue: settingsObj[clickedKey].toString(),
            width: '100%',
            onChange: valChanged
        });
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            if (settingsDefaults[clickedKey].value === val) {
                resetSetting(clickedKey);
            } else {
                val = val.toString();
                saveSetting(clickedKey, val, false);
            }
        }
    }

    function valChanged(sender, valSend) {
        editSetDialog.enableButton('save');
        val = valSend;
    }
}

function edit_multiple_choice(clickedKey, button) {
    if (!button) {
        const editSetHTML = '<div class="settingsDialogContainer"><table class="settingsTable zebraTable" style="width:100%;"><tr><td style="width:50%;"></td><td>Current:</td><td>Default:</td></tr><tr><td><div id="settingDesc"></div></td><td><div id="setting"></div></td><td><div id="settingDef"></div></td></tr></table></div>';
        const editSetDialogData = {
            buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, {
                label: 'Reset to default',
                value: 'reset'
            }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
            contents: editSetHTML,
            title: 'Edit system setting: ' + clickedKey,
            width: 650,
            callback: edit_multiple_choice
        };
        window.editSetDialog = new nxDialog('editSetDialog', editSetDialogData, arguments);
        const cvsDesc = $('#settingDesc');
        const cvs = $('#setting');
        const cvsd = $('#settingDef');

        for (let i in settingsDefaults[clickedKey].choices) {
            cvsDesc.append(settingsDefaults[clickedKey].choices[i] + '<br />');
            //Show current values
            if (settingsObj[clickedKey].indexOf(i) > -1) {
                cvs.append('<div id="div_' + i + '" class ="settingsItem settingChecked"><img alt="" src="../inc/filer/images/checked_checkbox.png" id="img_' + i + '" />&nbsp;' + i + '</div>');
            } else {
                cvs.append('<div id="div_' + i + '" class ="settingsItem"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_' + i + '" />&nbsp;' + i + '</div>');
            }

            //Show default values
            if (settingsDefaults[clickedKey].value.indexOf(i) > -1) {
                cvsd.append('<div class ="settingsItem"><img alt="" src="../images/true.png" height="16px" />&nbsp;' + i + '</div>');
            } else {
                cvsd.append('<div class ="settingsItem"><img alt="" src="../images/false.png" height="16px" />&nbsp;' + i + '</div>');
            }

            $("#div_" + i).on("click", function() {
                $(this).toggleClass('settingChecked');
                if ($(this).hasClass('settingChecked')) {
                    $('img', this).attr('src', '../inc/filer/images/checked_checkbox.png');
                    editSetDialog.enableButton('save');
                } else {
                    $('img', this).attr('src', '../inc/filer/images/unchecked_checkbox.png');
                    editSetDialog.enableButton('save');

                }
            });

        }
    } else {
        if (button === 'reset') resetSetting(clickedKey);
        if (button === 'save') {
            const writeArr = [];
            $('#setting div').each(function() {

                //if has class settingChecked write to array and compare with defaults

                if ($(this).hasClass('settingChecked')) {

                    const s = this.id.slice(4);
                    writeArr.push(s);
                }
            });
            const cArr = compareArrays(writeArr, settingsDefaults[clickedKey].value);
            if (cArr === true) {
                resetSetting(clickedKey);
            } else {
                const saveSett = arrayToString(writeArr);
                saveSetting(clickedKey, saveSett, false);
            }
        }
    }
}

function resetSetting(clickedKey) {
    startAjax('resetSetting', {
        clickedKey: clickedKey
    });
}

function saveSetting(clickedKey, value, encryption) {
    if (settingsDefaults[clickedKey]['value'] === value) {
        resetSetting(clickedKey)
    } else {
        startAjax('saveSetting', {
            clickedKey: clickedKey,
            value: value,
            encryption: encryption
        });
    }
}

/* general helper functions */
function arrayToString(arr) {
    let str = '["';
    arr.forEach(function(i, index) {
        str += i;
        if (index !== (arr.length - 1)) {
            str += '","';
        }
    });
    str += '"]';
    return str;
}

function compareArrays(arr1, arr2) {
    let flag = true;
    $(arr1).each(function(k, v) {
        if (arr2.indexOf(v) === -1) {
            flag = false;
        }
    });
    if (arr1.length !== arr2.length) flag = false;
    return flag;
}

function showMessage(msg) {
    const dialogData = {
        buttons: [
            { label: 'OK', 'default': true, cancel: true, value: 'ok' }
        ],
        contents: msg,
        title: "Message",
        icon: "../images/warning.png",
        iconWidth: 64,
        width: 500
    };
    new nxDialog('Message', dialogData);
}

/* server communication */
async function startAjax(action, data) {
    waitDialog.show();
    const params = {
        action: action,
        data: JSON.stringify(data)
    };
    return $.ajax({
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
    // set logged in username
    $('#un_val').html(res.loggedInName);

    // superadmin level check
    isSuper = res.isSuper;
    if (isSuper) {
        buttons.maintMode.show();
        $("#mm_div").show();
    } else {
        buttons.maintMode.hide();
        $("#mm_div").hide();
    }

    waitDialog.hide();
    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    if (res.fatalError) {
        let dialogData = {
            buttons: [{
                label: 'OK',
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>Sorry! The action cannot be completed.</strong><br />' + res.fatalError,
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
        let dialogData;
        if (res.setData) {
            dialogData = {
                buttons: [{
                    label: 'OK',
                    'default': true,
                    cancel: true,
                    value: 'ok'
                }],
                contents: '<strong>Sorry! The action cannot be completed.</strong><br />' + res.error,
                title: "Error",
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500,
                callback: reOpenCreateForm
            };
        } else {
            dialogData = {
                buttons: [{
                    label: 'OK',
                    'default': true,
                    cancel: true,
                    value: 'ok'
                }],
                contents: '<strong>Sorry! The action cannot be completed.</strong><br />' + res.error,
                title: "Error",
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500
            };
        }
        new nxDialog('error', dialogData);
        if (res.reload) startAjax('fetchSettings', {});
        return;
    }

    function reOpenCreateForm(button) {
        if (button === 'ok') {
            addSetting(res.setData);
        }
    }
    switch (res.action) {
        case 'fetchSettings':
            if (!res.data) res.data = {};
            const listArray = [];
            let listValue;
            let listOverride;
            let listComment;
            //Create array for list
            for (const key of Object.keys(settingsDefaults)) {
                //check for overrides
                if (settingsDefaults[key]['scope'] !== 0) continue;
                res.data[key] ? listValue = res.data[key] : listValue = settingsDefaults[key]['value'];
                res.data[key] ? listOverride = { hiddendata: true } : listOverride = {};
                settingsObj[key] = listValue;
                if (typeof listValue === 'object') {
                    listValue = JSON.stringify(listValue);
                }
                if (listValue.length > 44) {
                    listValue = listValue.substring(44, 0) + ' ...';
                }
                const listItem = {};
                if (typeof settingsDefaults[key]['comment'] !== 'undefined') { listComment = settingsDefaults[key]['comment']; } else { listComment = ''; }

                if (typeof settingsDefaults[key]['options'] !== 'undefined') {
                    listItem.option = key;
                    listItem.actionField = '-';
                } else {
                    listItem.option = { id: key, data: key, hiddenData: {} };
                    listItem.actionField = listOverride;
                }
                listItem.hiddenID = key;
                listItem.value = listValue;
                listItem.comment = listComment;
                listArray.push(listItem);
            }
            gui.settingsView.clearElements();

            $.each(listArray, function(key, value) {
                gui.settingsView.addElement(value, true);
            });
            $('#settTbText').html(listArray.length + ' system settings found');
            //setting pre on comment fields
            $('[data-fielddesc="comment"]').css('white-space', 'pre-line');
            break;
        case 'saveSetting':
        case 'resetSetting':
            refreshList();
            break;
    }
}