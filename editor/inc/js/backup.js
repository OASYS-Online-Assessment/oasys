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

let idFilenameLink = {}; // will be used to link hiddenID value to physical file name for archive delete method
let idDbverLink = {}; // will be used to link hiddenID value to snapshot restore versions

let isAdmin;
let isAE;
let isAdmAllowed;

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
        timeout: 1800000, // 30 minute timeout max for archiving routine (matches max exec. time in export.class.php)
        success: ajaxSuccess,
        error: ajaxError,
        url: "backupActions.php"
    });

    waitDialog = new jsModalWait(UILANG.m('please wait'));
    kbHandler = new jsKeyboardHandler();
    kbHandler.registerShortcut('BACKSPACE'); //prevent browser from going back in history
    initGUI();

    gui = {
        boxes: {}
    };

    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">Backup</strong>'
    });

    //main buttons
    buttons.createBackup = new jsButton2($('header'), 'createBackup', {
        label: 'Create Backup',
        icon: '../images/toolbarIcons/ic_tb_createBackup.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: createBackup,
        disabled: false
    });

    buttons.fetchBackups = new jsButton2($('header'), 'fetchBackups', {
        label: 'Refresh List',
        icon: '../images/toolbarIcons/ic_tb_refresh.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: fetchBackups,
        disabled: false
    });

    gui.s1 = createFlexSection('UI', 'sect001', 900, 1250, 1, 'fullWidthFlex'); //settings variables

    // section 1 (Context choice)
    gui.boxes.backups = createFlexBox(gui.s1, 'backupList', {
        title: 'Snapshots and Backups',
        minHeight: 480,
        panelHeight: 30,
        flex: 1,
        noPadding: false
    });

    //Toolbar Settings
    gui.boxes.backups.getPanel().append('<div><div id="backupsTbText"></div><div id="backupsTbButton"></div></div>');

    window.varBackupTbButtons = {};
    varBackupTbButtons.addElements = new nxButton($('#backupsTbButton'), 'backupbAdd', {
        icon: '../images/add48.png',
        iconWidth: 22,
        callback: createBackup,
        tooltip: 'Create backup',
        disabled: false
    });

    //structureView settings
    let backupOptions = {
        onClick: function(a, b, action, fid) { // Download / Restore action function
            switch (action) {
                case 'download':
                    dlZip(fid);
                    break;

                case 'restore':
                    snRestore(fid, idDbverLink[fid]);
                    break;

                default:
                    break;
            }
        },
        onChange: deleteZip, // Delete action function
        elements: [],
        tableHead: {
            filename: 'File Name',
            created: 'Date',
            size: 'Size',
            version: 'System Version',
            dbVersion: 'DB Version',
            type: 'Archive Type',
            comment: 'Comment',
        },
        tdSizes: {
            filename: '250px',
            created: '150px',
            size: '75px',
            version: '85px',
            dbVersion: '75px',
            type: '100px',
            comment: '275px',
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
            'height': '33px'
        },
        consecutiveNumbers: false,
        dataId: 'backupListTable',
        tableHeadDisplay: true,
        appPath: '../inc/jsSortableTable/',
        readOnly: false,
        fixedOrder: true,
        actionButton: false,
        actionButtons: true,
        actionButtonsColText: /* html */ `<div style="display: none;" id="actBtnHeader"><span style="padding-right: 50px;">Download</span>Restore</div>`,
        actionButtonsSize: '30px',
        hideDeleteLinks: false
    };
    gui.backupsView = new JsSortableTable('backupList', 'backupList_table', backupOptions);

    //populate view with active backup ZIPs
    fetchBackups();
}

function fetchBackups() {
    $(".bfm").remove();
    startAjax('fetchBackups', {}).then((res) => {

        if (res.bkprereqfail.length > 0) {

            buttons.createBackup.disable();
            
            let bkpfailmsg = $('<div class="bfm">')
                .html(`<div><p style='font-weight: bold; color: red;'>Backup functionality is not available due to the following:</p> ${res.bkprereqfail.map(reason => '• ' + reason).join('<br><br>')}</div>`)
                .css({
                    display: 'flex',
                    'color': "#505050",
                    'font-size': '15px',
                    'justify-content': 'center',
                    'align-items': 'center',
                    'width': '700px',
                    'border': '1px solid black',
                    'margin-top': '90px',
                    'margin-left': 'auto',
                    'margin-right': 'auto',
                    'padding-top': '20px',
                    'padding-left': "20px",
                    'padding-right': "20px",
                    'padding-bottom': '30px',
                    'background-color': '#edededff'
                });

            $('#sortableTable_backupList_table').after(bkpfailmsg);
        }
    });
}

function createBackup(task, button) {

    if (!button) {
        let message = ( /* html */ `
        <div class="backupTypeDialog">
            <h4>Which type of backup would you like to create?</h4>
            <div class="backupTypeOptions">
                <section class="backupTypeCard">
                    <div class="backupTypeCardHeader">
                        <strong>Snapshot</strong>
                        <span>Recommended for routine saves</span>
                    </div>
                    <p>Backs up the <em>database</em>, all current OASYS data, and uploaded <em>media</em> at this point in time.</p>
                </section>
                <section class="backupTypeCard">
                    <div class="backupTypeCardHeader">
                        <strong>Full Backup</strong>
                        <span>Complete archive</span>
                    <p>Creates a full backup of your OASYS data and file system. System logs and extraneous operational directories are excluded.</p>
                </section>
            </div>
        </div>`);
        new nxDialog('backupDialog', {
            buttons: [{
                label: 'Create Snapshot',
                value: 'snapshot'
            }, {
                label: 'Full Backup',
                value: 'fullBackup'
            }, {
                label: 'Cancel',
                'cancel': true,
                'default': true,
                value: 'cancel'
            }],
            contents: message,
            width: 650,
            callback: createBackup,
            title: 'Choose type of backup'
        }, arguments);
    } else {
        if (button !== 'cancel') actUsrCheck(button, "backupBegin");
    }
}

function actUsrCheck(dataParam, action) {

    startAjax('checkActive', {}).then((ca_res) => {

        if (ca_res.becount > 0 || ca_res.fecount > 0) {

            // build contents var

            let content;

            if (ca_res.becount > 0 && ca_res.fecount > 0) content = `There are currently <strong style="text-decoration: underline;">${ca_res.becount} backend user(s)</strong> logged in, and <strong style="text-decoration: underline;">${ca_res.fecount} test taker(s)</strong> logged in.`;
            if (ca_res.becount > 0 && ca_res.fecount === 0) content = `There are currently <strong>${ca_res.becount}</strong> backend user(s) logged in.`;
            if (ca_res.becount === 0 && ca_res.fecount > 0) content = `There are currently <strong>${ca_res.fecount}</strong> test takers logged in.`;

            if (action === "backupBegin") {
                /* backup messages */
                if (ca_res.becount > 0) content += /* html */ `<p>After the backup process begins, any changes made by backend users will not be recorded in your archive file.</p>`;
                if (ca_res.fecount > 0) content += /* html */ `<p>After the backup process begins, any results collected by test takers will not be recorded in your archive file.</p>`;
            } else if (action === "restoreSnapshot") {
                /* restore messages */
                content += /* html */ `<p>After the restore process begins, all backend logins and frontend test takers will have their sessions terminated, and any in-process actions will be irrevocably lost forever!</p>`;
            }

            content += /* html */ `<p style="font-weight: bold; color: red;">CONTINUE AT YOUR OWN RISK!</p>`;

            if (ca_res.becount > 0) {
                content += `<span style="text-decoration: underline; font-weight: bold;">Active Backend Logins</span><br>`;

                ca_res.beusers.forEach(e => {
                    content += escapeHtml(e) + "<br>";
                })
            }

            // active users detected - get confirmation on backup procedure
            new nxDialog('conf_cont', {
                returnPromise: true,
                width: 600,
                title: "User Login Warning",
                contents: `${content}`,
                buttons: [{
                    value: "yes",
                    label: "Continue"
                }, {
                    value: "no",
                    label: "Cancel",
                    'cancel': true,
                    'default': true
                }]
            }).then((conf) => {
                if (conf.button === "yes" && action === "backupBegin") startAjax(action, { type: dataParam });
                if (conf.button === "yes" && action === "restoreSnapshot") startAjax(action, { 'restoreFileName': dataParam });
            })
        } else {
            // no active backend users - start normal action routine
            if (action === "backupBegin") startAjax(action, { type: dataParam });
            if (action === "restoreSnapshot") startAjax(action, { 'restoreFileName': dataParam });
        }
    })
}

function deleteZip(delId, a, b, c, d, e, button) {

    if (delId) {
        if (!button) {
            let message = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>Are you sure you want to remove this backup file:</p></div><ul class="deleteList"><li class="typefile">' + escapeHtml(idFilenameLink[delId]) + '</li></ul></div>';
            new nxDialog('deleteDialog', {
                buttons: [{
                    label: 'Cancel',
                    'cancel': true,
                    'default': true,
                    value: 'cancel'
                }, {
                    label: 'Delete',
                    value: 'ok'
                }],
                contents: message,
                width: 450,
                callback: deleteZip,
                title: 'Confirm Permanent Archive Deletion',
                icon: "../images/warning.png",
                iconWidth: 50
            }, arguments);
        } else {
            if (button === 'ok') {
                startAjax('deleteBackup', {
                    delFileName: idFilenameLink[delId]
                });
            } else {
                fetchBackups();
            }
        }
    }
}

/* rollback to a previous database state by loading in snapshot file specified by user */

/* rs */
function snRestore(hId, fileDbVer, button) {
    if (hId) {
        if (!button) {

            if (fileDbVer !== settings.database_version) {

                let eDialogData = {
                    title: "Database Version Mismatch Error",
                    icon: "../images/error.png",
                    contents: "The database version of the snapshot you are trying to restore does not match the database version of your OASYS application. Please contact the OASYS team if you need to recover data from older snapshot files.",
                    buttons: [{
                        label: 'Ok',
                        value: 'ok',
                        'default': true
                    }]
                };

                new nxDialog('badVerDialog', eDialogData);
                return false;
            }

            let message = "<p><h2><strong style='color: red;'>WARNING!!!</strong></h2></p>\
            <p>Restoring this snapshot will <u>permanently</u> revert your database state, and all current settings and items will be lost!</p>\
            \
            <p>Only continue if you are 100% sure you want to restore your database from<strong>  " + escapeHtml(idFilenameLink[hId]) + ".</strong></p>";

            new nxDialog('deleteDialog', {
                buttons: [{
                    label: 'Cancel',
                    'cancel': true,
                    'default': true,
                    value: 'cancel'
                }, {
                    label: 'Restore Snapshot',
                    value: 'ok'
                }],
                contents: message,
                width: 450,
                callback: snRestore,
                title: 'Confirm Permanent Snapshot Rollback',
                icon: "../images/warning.png",
                iconWidth: 60
            }, arguments);
        } else {
            if (button === 'ok') {
                // startAjax('restoreSnapshot', {
                //     restoreFileName: idFilenameLink[hId]
                // });
                actUsrCheck(idFilenameLink[hId], "restoreSnapshot");
            }
        }
    }

}

/* download zip file based on table icon click which sends in hiddenId which links to zip filename */
function dlZip(hId) {
    let zipTarget = idFilenameLink[hId];

    let dlReq = {
        fname: zipTarget,
        type: "bkpRes"
    };

    window.open("dlActions.php?fn=" + dlReq.fname + "&t=" + dlReq.type, "_self");

    // VARIOUS ALT METHODS TO DOWNLOAD IN CASE POPUP BLOCKER STOPS REQUEST
    // window.location.assign("dlActions.php?fn=" + dlReq.fname + "&t=" + dlReq.type);
    // location.href = "dlActions.php?fn=" + dlReq.fname + "&t=" + dlReq.type;
    // startAjax('getFile', dlReq);

}

/* server communication */

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
    new nxDialog('ajaxError', {
        buttons: [{
            label: 'OK',
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: escapeHtml(jqXHR.responseJSON?.fatalError || textStatus || 'Request failed.'),
        title: 'Error: ' + errorThrown,
        width: 500
    });
}

/**
 * 
 * @param {*} res 
 */
function ajaxSuccess(res) {
    $('#un_val').html(res.loggedInName);

    waitDialog.hide();

    // set the callback definition action type in case we need to stop infinite loop execution for 'fetchBackups' action
    let cbType = () => {
        //FYI: required for permission compatibility BEGIN
        if (res.forceLoginRedirect) {
            window.location = 'index.php';
        }
        //FYI: required for permission compatibility END

        return (res.action === 'fetchBackups' ? '' : startAjax('fetchBackups', {}))
    };

    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    if (res.fatalError) {


        new nxDialog('fatalError', {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br>' + escapeHtml(res.fatalError)),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 50,

            width: 500,
            callback: cbType
        });
        return;
    }

    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error) {

        new nxDialog('error', {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br>' + escapeHtml(res.error)),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 50,
            width: 500,
            callback: cbType
        });
        return;
    }

    /* actions to perform after ajax success, based on original action */
    switch (res.action) {

        case 'restoreSnapshot':
            new nxDialog('success', {
                buttons: [{
                    label: 'OK',
                    'default': true,
                    cancel: false,
                    value: 'ok'
                }],
                contents: `<p>Contents of snapshot file <strong>${escapeHtml(res.restoreResult)}</strong> successfully RESTORED!</p>`,
                // contents: 'Archive <strong>' + res.deleteResult + '</strong> successfully DELETED!<br>',
                title: "Restore Success",
                icon: "../images/ok.png",
                iconWidth: 50,
                width: 500,
                callback: function() { startAjax('fetchBackups', {}) }
            });

            break;

        case 'fetchBackups':
            isAdmin = res.isAdmin;
            isAE = res.isAE;
            isAdmAllowed = (isAdmin && isAE) || (!isAdmin);

            gui.backupsView.clearElements();
            idFilenameLink = {}; // reset id / filename link obj prior to any backup / restore operation to be safe


            $.each(res['data'], function(key, value) {
				const rawFilename = value.filename;
				value.filename = escapeHtml(value.filename);
				value.comment = escapeHtml(value.comment ?? '');
				value.version = escapeHtml(value.version ?? '');
				value.db_ver = escapeHtml(value.db_ver ?? '');

                // selectively remove restore buttons if not type snapshot
                if (value.actionButtons[1]['hiddenData'] === false) {
                    delete value.actionButtons[1];
                } else {
                    idDbverLink[value.hiddenID] = value.actionButtons[1].hiddenData;
                }

                gui.backupsView.addElement(value, true);

                /* work around for missing hiddenID -> fileName link with this global object which holds the keyval for deleteBackup action use. */
                idFilenameLink[value.hiddenID] = rawFilename;
            });

            // hide various elements from non-elevated adm or superadm
            if (!isAdmAllowed) {
                $('.actionButtonsSpan').hide(); // hide all action buttons
                $("[data-class='deleteLink_backupList_table']").hide(); // hide delete icon
            } else {
                $('#actBtnHeader').show();
            }

            // let instStr = "Packages";
            let snapStr = "Snapshots";
            /** @type {boolean|string} */
            let fullStr = "Full Backups";

            snapStr = res.snapCount === 1 ? "Snapshot" : "Snapshots";
            fullStr = res.fullCount === 1 ? "Full Backup" : "Full Backups";
            res.snapCount = res.snapCount === 0 ? "No" : res.snapCount;
            res.fullCount = res.fullCount === 0 ? "No" : res.fullCount;

            // print count of backups found
            if (!(res.snapCount === 0 && res.fullCount === 0)) {
                $('#backupsTbText').html(`${res.snapCount} ${snapStr} and ${res.fullCount} ${fullStr} Found.`);
            } else {
                $('#backupsTbText').html("No Snapshots or Full Backups Found!");
            }

            //setting pre on comment fields
            $('[data-fielddesc="comment"]').css('white-space', 'pre-line');
            break;

        case 'backupBegin':

            // conditional block to show any files which could not be added to the archive.
            // considered more of a 'soft error' or 'warning' to user instead of full error.
            if (res.fileErrList.length > 0) {
                let errFileAdd = "<p>The following files could not be added to the archive: <br><br>";
                res.fileErrList.forEach(efName => {
                    errFileAdd += "<code>" + escapeHtml(efName) + "</code><br>";
                });
                errFileAdd += "</p>"
            }

            const ctPrefix = '<p>Archive <code style="font-weight: bold;">' + escapeHtml(res.createResult) + '</code> successfully CREATED!</p>';

            new nxDialog('success', {
                buttons: [{
                    label: 'OK',
                    'default': true,
                    cancel: false,
                    value: 'ok'
                }],
                contents: ctPrefix + (typeof errFileAdd !== 'undefined' ? errFileAdd : ''), // conditional to show if any files could not be added to ZIP
                title: "Backup Success",
                iconWidth: 50,
                width: 500,
                callback: function() { startAjax('fetchBackups', {}) }
            });
            break;

        case 'deleteBackup':
            new nxDialog('success', {
                buttons: [{
                    label: 'OK',
                    'default': true,
                    cancel: false,
                    value: 'ok'
                }],
                contents: 'Archive <strong>' + escapeHtml(res.deleteResult) + '</strong> successfully DELETED!<br>',
                title: "Delete Success",
                iconWidth: 50,
                width: 500,
                callback: function() { startAjax('fetchBackups', {}) }
            });
            break;
    }

}
