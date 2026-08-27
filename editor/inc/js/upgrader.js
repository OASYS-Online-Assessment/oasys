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
let gui = {}; // 'gui' object used to set various vars which will be used by FlexBox module(s)
let mainContent;
let bInst = "";
let olFilename = "";
let activePkg = null;

let isAdmin;
let isAE;

function escapeHTML(value) {
    return $('<div>').text(value == null ? '' : String(value)).html();
}

function onReady() {

    // init some default actions to prevent
    $('body').on('dragover', function(e) {
        e.preventDefault();
    });
    $('body').on('drop', function(e) {
        e.preventDefault();
    });

    // configure AJAX handling options
    $.ajaxSetup({
        type: "POST",
        cache: false,
        dataType: "json",
        timeout: 1800000, // 30 mins
        success: ajaxSuccess,
        error: ajaxError,
        url: "upgraderActions.php"
    });

    waitDialog = new jsModalWait(UILANG.m('please wait'));
    kbHandler = new jsKeyboardHandler();
    kbHandler.registerShortcut('BACKSPACE'); //prevent browser from going back in history

    // main frame / button GUI init
    initGUI();

    gui = {
        boxes: {}
    };


    // top row status bar (not internal status bar)
    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">Upgrader</strong>'
    });

    // Main and only flexBox interface init
    gui.flexSection_01 = createFlexSection('UI', 'sect001', 900, 1250, 1, 'fullWidthFlex');

    const releaseChannel = settings.alphaChannel ? 'alpha' : 'standard';
    gui.boxes.mainFlexBox = createFlexBox(gui.flexSection_01, 'mainFlexWindow', {
        title: (releaseChannel === 'alpha') ? "RELEASE CHANNEL: <strong>ALPHA</strong> (UNSTABLE!)" : "RELEASE CHANNEL: <strong>STANDARD</strong>",
        minHeight: 480,
        panelHeight: 50,
        flex: 1,
        noPadding: false
    });

    $('#title_mainFlexWindow')
        .addClass('upgraderReleaseChannel')
        .addClass('upgraderReleaseChannel-' + releaseChannel);

    // create main text box and populate with status messages re: package availabliity, etc.

    mainContent = gui.boxes.mainFlexBox.getInnerBox();
    mainContent.append("<span>Checking server status...</span>");

    /*
    ############################################
    ########### Page load prechecks ############
    ############################################
    */

    // used for checking online status of upgrader server (URL now configured in settings) [auto-add ending slash if missing]


    if (!/^http(s)?:\/\/[^\s/$.?#].[^\s]*$/i.test(settings.upgraderURL)) {
        mainContent.html(`<span style='color: red; display: block; text-align: center; width: 100%;'><code style="font-weight: bold; font-size: larger;">"${settings.upgraderURL}"</code> is not a valid URL. Please update the <span style="color: darkblue; font-weight: bold;">System Settings → upgraderURL</span> value, or reset to default.</span>`);
        return;
    }


    const hostEnv = settings.upgraderURL + "online";

    // check if upgrader server page exists
    checkServerUp(hostEnv, function(avail) {
        if (!avail) {

            // disable all of our buttons if server shut off
            for (const key in buttons) {
                buttons[key].disable();
            }
            // display server not up message
            mainContent.html(/* html */`
                <span style="font-weight: bold;">Upgrade server is currently not accessible.</span>
                <br><br>
                <ul style="list-style-type: disc; padding-left: 2em; margin: 0;">
                    <li style="display: list-item; list-style-type: disc; margin-left: 0;">The system may be in maintenance mode.</li>
                    <li style="display: list-item; list-style-type: disc; margin-left: 0;">Your <code style="color:rgb(0, 23, 195); font-size: 16px; font-weight: bold;">upgraderURL</code> value in System Settings may be incorrect.</li>
                    <li style="display: list-item; list-style-type: disc; margin-left: 0;">3rd party browser add-ons such as ad-blockers and/or enhanced privacy settings may affect upgrade server access.</li>
                </ul>
                <span id="retryMsg">
                    <br>
                    <a href="#" onclick="location.reload();" style="
                        display: inline-block;
                        padding: 10px 24px;
                        background-color: #17632a;
                        color: #fff;
                        font-weight: bold;
                        border: none;
                        border-radius: 6px;
                        text-decoration: none;
                        cursor: pointer;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                        transition: background 0.2s;
                    " onmouseover="this.style.backgroundColor='#218838';" onmouseout="this.style.backgroundColor='#17632a';">
                        Refresh Page
                    </a>
                    <br>
                </span>
            `);

            offlinePkgCheck();
        } else {
            // check if user is still logged in
            startPageCheck();
        }
    });
}

/*
    ##############################################
    ########### Operational functions ############
    ##############################################
*/

async function offlinePkgCheck() {
    let res = await startAjax("ofChk", {});

    if (res.isOffline) {
        activePkg = res;
        olFilename = res.filename;

        $('#retryMsg').remove();

        mainContent.append(/* html */ `<br><span>Offline package detected.</span>`);

        new nxDialog("oi_conf", {
            title: "Offline Update Confirmation",
            contents: `<div>Offline upgrade package detected: <strong>${olFilename}</strong>. <br><br>Press OK to continue upgrade.</div>`,
            width: 500,
            buttons: [
                {
                    value: "cancel",
                    label: "Cancel"
                }, {
                    value: true,
                    label: "Ok",
                    default: true
                }],
            callback: (cont) => {
                (cont === true) ? dlInit(res) : mainContent.append(/* html */ `<br><span>Offline upgrade cancelled.</span>`);
            }
        });
    } else {
        mainContent.append(/* html */ `<br><span style="color: #606060; font-style: italic;">No offline packages found</span>`);

    }
}

// init package info window and download button
function dlInit(instData) {

    startAjax('checkActiveStates', {}).then((ca_res) => {

        if (ca_res.becount > 0 || ca_res.fecount > 0) {

            // build contents var

            let content;

            if (ca_res.becount > 0 && ca_res.fecount > 0) content = `There are currently <strong style="text-decoration: underline;">${ca_res.becount} backend user(s)</strong> logged in, and <strong style="text-decoration: underline;">${ca_res.fecount} test taker(s)</strong> logged in.`;
            if (ca_res.becount > 0 && ca_res.fecount === 0) content = `There are currently <strong>${ca_res.becount}</strong> backend user(s) logged in.`;
            if (ca_res.becount === 0 && ca_res.fecount > 0) content = `There are currently <strong>${ca_res.fecount}</strong> test takers logged in.`;

            /* upgrade warning messages */
            if (ca_res.becount > 0 && ca_res.fecount === 0) content += /* html */ `<p>After the upgrade process begins, all backend logins will have their sessions terminated, and no backend or test taker logins will be allowed until the process finishes!</p>`;
            if (ca_res.fecount > 0) content += /* html */ `<p><span style="font-weight: bold; color: red;">Upgrades are not allowed when frontend test takers are active.</span> Please wait until all frontend sessions are inactive prior to attempting system upgrade.</p>`;

            if (ca_res.fecount === 0) content += /* html */ `<p style="font-weight: bold; color: red;">CONTINUE AT YOUR OWN RISK!</p>`;

            if (ca_res.becount > 0) {
                content += `<span style="font-weight: bold; text-decoration: underline; font-weight: bold;">Active Backend Logins</span><br>`;

                ca_res.beusers.forEach(e => {
                    content += e + "<br>";
                })
            }

            // active users detected - get confirmation on backup procedure
            new nxDialog('conf_cont', {
                returnPromise: true,
                width: 600,
                title: "Active Users Warning",
                contents: `${content}`,
                buttons: [{
                    value: "no",
                    label: "Cancel",
                    'cancel': true,
                    'default': true
                }, {
                    value: "yes",
                    label: "Continue",
                    disabled: (ca_res.fecount > 0)
                }]
            }).then((conf) => {
                (conf.button === "yes") ? kickOff() : mainContent.html("<span>Upgrade cancelled.</span>");
            })
        } else {
            // no active backend users - start normal upgrader routine
            kickOff();
        }

        function kickOff() {
            if (bInst !== "") bInst.disable();

            if ($("#instLogWindow").length === 0) mainContent.append(`<div id="instLogWindow"></div>`);

            $("#instLogWindow").empty();
            startAjax('getFileDlInstall', {
                fileDlName: instData.filename,
                isOffline: instData.isOffline ?? false
            });
            $("#installButtonDiv").append("<hr>");
            (olFilename === "") ? $("#instLogWindow").append("Downloading and extracting package... ") : $("#instLogWindow").append("Staging and extracting offline package... <img src='../images/ok.png' style='height: 1.3em; vertical-align: text-top'><br>");
            $("#instLogWindow").append("Removing backend sessions... <img src='../images/ok.png' style='height: 1.3em; vertical-align: text-top'><br>");
            $("#instLogWindow").append("Enabling full system maintenance mode... <img src='../images/ok.png' style='height: 1.3em; vertical-align: text-top'> \
                <p style='color: red;'><strong>IMPORTANT NOTE:</strong> The system will not restore the previous maintenance mode until the installation link has been clicked.</p>");
        }
    });
}

// on page load, check if server is available (looks for file called 'storage')
function checkServerUp(url, callback) {
    waitDialog.show();
    $.ajax({
        type: 'HEAD',
        url: url,
        timeout: 300000, // 300,000 ms = 300 seconds = 5 minutes
        dataType: "text",
        success: function() {
            callback(true);
        },
        error: function() {
            callback(false);
        }
    }).always(() => {
        waitDialog.hide();
    });
}

// get file list
function fetchPkgStatus(fList, curVer) {

    // condition when there's no updates or the server didn't return any files for updates
    if (fList === undefined) return;

    if (fList.length === 0) {
        // sync upgrader notification state in case update was executed by another user
        sessionStorage.setItem('upgAvail', "false");
        $('#upgExclaim').hide();
        $('#menuButton_upgrader > span').css('color', '#fff');

        mainContent.html("<div id='upgraderMessage'>No upgrades or patches available at this time. Your system is up-to-date!</div>");
        return;
    }

    // condition when an update package is detected

    // replace linefeeds with <br> tokens
    let longdescFixed = escapeHTML(fList[0].longdesc).replace(/\r\n|\r|\n/g, '<br>').trim();
    const description = escapeHTML(fList[0].description);
    const filename = escapeHTML(fList[0].filename);
    const version = escapeHTML(fList[0].version);

    let upgType = "Oasys";
    if (typeof fList[0].module === "string") {
        upgType = escapeHTML(fList[0].module.toUpperCase());
        curVer = fList[0].moduleCurVer;
    }

    const displayedCurrentVersion = escapeHTML(curVer);

    mainContent.empty();
    mainContent.append(/* html */`\
    <span class='upMsg01 infoMessageSuccess'>You have an update available!</span>
    <hr>
    
    <div class='upgraderTable' style='display: table;'>
        
        <div class='upgraderTbleRow'>
            <div  class="upgraderTitleColumn"><div>
                PACKAGE:</div></div><div class= 'upgraderInfoColumn' > ${description}
            </div>
        </div>
        
        <div class='upgraderTbleRow'>
            <div class="upgraderTitleColumn"><div>
                FILENAME:</div></div><div class= 'upgraderInfoColumn'>${filename}
            </div>
        </div>
        
        <div class='upgraderTbleRow'>
            <div class="upgraderTitleColumn"><div>
                VERSION:</div></div><div class='upgraderInfoColumn' id='upgVerMsg'>This package will upgrade ${upgType} from <span class='upgrVersion'>${displayedCurrentVersion}</span> to <span class='upgrVersion upgrNewVersion' >${version}</span>
            </div>
        </div>
        
        <div class='upgraderTbleRow'>
            <div class="upgraderTitleColumn"><div>
                DETAIL:</div></div><div class= 'upgraderInfoColumn'> ${longdescFixed}
            </div>
        </div>
        
        <div class='upgraderTbleRow'>
            <div class="upgraderTitleColumn"><div>
                RELEASE CHANNEL:</div></div><div class= 'upgraderInfoColumn'> ${fList[0].alpha ? "<span style='font-weight: bold; color: red;'>ALPHA/UNSTABLE!</span>" : "Standard"}
            </div>
        </div>

        
    </div>
    <hr>
    
    <div id="installButtonDiv"></div>
    
    <div id="instLogWindow"></div>
    `);

    bInst = new nxButton($('#installButtonDiv'), 'instButton', {
        label: 'install',
        value: fList[0],
        callback: dlInit
    });

}

// show Oassys technical support contact info on screen
function techSupport(optMsg = "") {
    let cMsg = `<strong>${optMsg}</strong><br><br><em>Please contact Oasys technical support to troubleshoot this issue.</em><br><br>`;
    genericMsg(cMsg, "Technical Support Contact Information", "error.png");
}

// on page load, send req for package list
function startPageCheck() {
    startAjax('requestPackageList', {});
}

function genericMsg(msg, titleVal = 'Message', imgVal = null, cbArg = null) {

    let dialogData = {
        icon: `../images/${imgVal}`,
        iconWidth: 44,
        buttons: [{
            label: 'Ok',
            'cancel': false,
            'default': true,
            value: 'ok'
        }],
        focus: 'Ok',
        contents: '<p>' + msg + '</p>',
        width: 600,
        title: titleVal,
        callback: cbArg
    };

    if (imgVal === null) dialogData.icon = null;

    new nxDialog('messageDialog', dialogData);
}

function showMessage(msg) {
    let dialogData = {
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

/* on AJAX error return */

function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();

    let retContents = (jqXHR.responseJSON !== undefined) ? jqXHR.responseJSON.fatalError : "No server data returned";

    gui.boxes.mainFlexBox.setTitle("<strong>SYSTEM ERROR!</strong>");
    let dialogData = {
        buttons: [{
            label: 'OK',
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: retContents,
        title: 'Error: ' + errorThrown,
        width: 500,
    };
    new nxDialog('ajaxError', dialogData);
}

/* on AJAX successful return */

function ajaxSuccess(res) {
    $('#un_val').html(res.loggedInName);
    waitDialog.hide();

    // set admin levels on every call
    isAdmin = res.isAdmin;
    isAE = res.isAE;

    if (res.action === "checkActiveStates") return; // short circuit when coming back from check status call

    // middle vertical align text in flexBox panel
    gui.boxes.mainFlexBox.getPanel().css({
        "line-height": function() {
            return gui.boxes.mainFlexBox.getPanel().css("height");
        },
    });

    // publish Oasys version num from our AJAX call returns
    gui.boxes.mainFlexBox.getPanel().html(`<span style='padding-left: 15px; display: block;'>Current Oasys Version: <strong>${res.longVer}</strong></span>`);

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
            contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br><p>' + res.fatalError + '</p>'),
            title: "Fatal Error",
            icon: "../images/error.png",
            iconWidth: 64,

            width: 500,
        };

        new nxDialog('fatalError', dialogData);

        return;
    }

    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error) {

        let dialogData = {
            buttons: [{
                label: 'OK',
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br><p>' + res.error + '</p>'),
            title: "Error",
            icon: "../images/error.png",
            iconWidth: 64,
            width: 800,
            callback: function() {
                if (res.forceLoginRedirect) {
                    window.location = 'index.php';
                    return;
                }
            }
        };
        new nxDialog('error', dialogData);

        gui.boxes.mainFlexBox.setTitle("<strong>ERROR: </strong>" + res.error.split("<br>")[0]);
        $('#title_filelist').attr('title', res.error.replace(/<br>/g, '\n').replace(/<\/*strong>/g, ''));

        if (res.action === 'getFileDlInstall') $("#instLogWindow").append(/* html */ `${res.error} <img src='../images/deleteHover.png' style='height: 1.3em; vertical-align: text-top'><br>`);


        return;
    }

    /* actions to perform after ajax SUCCESS, switch on original action */

    switch (res.action) {
        case 'requestPackageList':
            fetchPkgStatus(res.fileList, res.longVer);
            activePkg = Array.isArray(res.fileList) && res.fileList.length > 0 ? res.fileList[0] : null;
            isAdmin = res.isAdmin;
            isAE = res.isAE;

            break;

        // return from primary download sequence
        case 'getFileDlInstall':
            if (res.instLink) {
                new nxDialog("bkpConf", {
                    title: "Backup Confirmation",
                    contents: "<div>Do you wish to make a backup prior to upgrade? This step is highly recommended!</div>",
                    buttons: [{
                        value: "yes",
                        label: "Yes",
                        'default': true
                    }, {
                        value: "no",
                        label: "No"
                    }],
                    callback: function(cRes) {
                        startAjax('preInstallBackup', {
                            openAfter: res.instLink,
                            isOffline: res.isOffline ?? false,
                            bkp: cRes
                        });

                        let msg = (cRes === "yes") ? "Backing up file and database systems..." : "Skipping backup process...";
                        $("#instLogWindow").append(/* html */ `Preliminary staging status... <img src='../images/ok.png' style='height: 1.3em; vertical-align: text-top'><br>${msg} `);
                    }
                });

            } else {
                $("#instLogWindow").append(/* html */ `Could not obtain installation link. Check logs for further details. <img src='../images/deleteHover.png' style='height: 1.3em; vertical-align: text-top'><br>`);
            }
            break;

        // return from first step of install process - full backup
        case 'preInstallBackup':

            window.name = "OaParent";

            $("#instLogWindow").append( /* html */ `
                <img src='../images/ok.png' style='height: 1.3em; vertical-align: text-top'><br>
                <span id='finalInstMsg'><a id='startInstLink' target="OAInstallerScript" rel="noopener">
                <span style="font-weight: bold; color: blue; text-decoration: underline; cursor: pointer;">Start final package install script by clicking here</span></a>.</span>
            `);

            $('#startInstLink').attr('href', res.instAddr);

            // set one time handler for getting window focus back
            $('#startInstLink').on("click", function() {
                $(window).one("focus", function() {
                    startAjax("checkInstStatus", {
                        pkgName: (olFilename !== "") ? olFilename : activePkg.filename,
                        isOffline: (olFilename !== "")
                    });
                });
            });

            break;

        case 'checkInstStatus':
            $('#finalInstMsg').html(`<em>Final package installation routine...`);

            let modMode = (typeof res.modName !== "undefined");
            let verVal = modMode ? res.modVer : res.longVer;
            let upgType = modMode ? res.modName.toUpperCase() + " module" : "Oasys";

            if (res.instStatus === 0) { // if package successful
                // write to master upgrader.log
                startAjax('writeLogWrapper', {
                    entry: `Installation successful for: ${res.pkgName}`
                });

                sessionStorage.removeItem('upgAvail');


                $("#instLogWindow").append(`<hr>This update was <u>successful</u>. Your ${upgType} version has been upgraded to <strong>${verVal}</strong>.`);
                genericMsg(`Update to ${upgType} version <strong>${verVal}</strong> successful! ${(olFilename === "") ? "Click OK to check for more available updates." : ""}`,
                    "Installation Status",
                    "ok.png",
                    function() {
                        location.reload(true); // the true argument value is only relevant for Firefox, and is not standard for this function
                    }
                );
                $("#finalInstMsg").append(`<img src='../images/ok.png' style='height: 1.3em; vertical-align: text-top'>`);
            } else { // if package unsuccessful
                // write to master upgrader.log
                startAjax('writeLogWrapper', {
                    entry: `Installation failed for: ${res.pkgName}`
                });

                $("#finalInstMsg").append(`<img src='../images/deleteHover.png' style='height: 1.3em; vertical-align: text-top'>`);
                techSupport("Installation FAILED!");
                $("#instLogWindow").append(`<hr>This update was <u>not successful</u>. Your ${upgType} version remains at <strong>${verVal}</strong><br><br>`);

                $("#instLogWindow").append(``);
            }

            break;

    }
}
