"use strict";
let waitDialog;
let gui = {};
$(onDOMReady);

function onDOMReady() {
    initGUI();
    waitDialog = new jsModalWait(UILANG.m('please wait'));

    let userName = window.localUName;

    gui.main = createFlexSection('UI', 'dashboardContainer', 900, 1250, 1, 'fullWidthFlex');
    gui.mainUserActions = createFlexBox(gui.main, 'dashboardHeader', {

    });

    let headerDiv = '<div class="dashNameSection"><div id="dashUserName">' + userName + '</div><div id="dashWelcomeMsg">' + UILANG.m("Welcome to OASYS Dashboard") + '</div></div><div id="headerButtonsContainer"/>';
    $("#dashboardHeader").append(headerDiv);
    startAjax("check", {});

    new nxButton("headerButtonsContainer", "btnAcSettings", {
        iconHeight: 20,
        tooltip: UILANG.m('Settings'),
        icon: svgIcons.settings,
        callback: function() {
            window.location.replace(settings.JSrootURL + 'editor/accountProp.php');
        }
    });

    new nxButton("headerButtonsContainer", "btnLogoff", {
        iconHeight: 20,
        tooltip: UILANG.m('Logout'),
        icon: svgIcons.logout,
        callback: function() {
            sessionStorage.clear();

            $.ajax({
                type: "POST",
                cache: false,
                dataType: "json",
                timeout: 300000,
                success: function(res) {
                    if (res.SSOlogout) {
                        window.location.replace(settings.JSrootURL + "editor/sso.php?a=logout&s=editor");
                    } else {
                        window.location.replace(settings.JSrootURL + "editor/");
                    }
                },
                error: function() {
                    alert("Sorry! Unable to correctly logout of Oasys. Please contact the System Administrator.");
                    window.location.replace(settings.JSrootURL + "editor/");
                },
                url: settings.JSrootURL + "editor/userMgmtActions.php",
                data: {
                    action: 'logout',
                    data: {},
                    src: "mlgpage"
                }
            });
        }
    });

    /* --------------  widgets  ------------------ */
    widgetList.forEach(item => {
        let WidgetClass = window[item];
        if (typeof WidgetClass === 'function') {
            let w = new WidgetClass(gui.main, item);
        } else {
            console.error(`Class ${item} is not defined.`);
        }
    });
}

/*
    ########################
    AJAX CONFIG AND FUNCTION
    ########################
*/

$.ajaxSetup({
    type: "POST",
    cache: false,
    dataType: "json",
    timeout: 300000,
    success: ajaxSuccess,
    error: ajaxError,
    url: "dashboardActions.php"
});

function startAjax(action, data) {
    waitDialog.show();
    let params = {
        action: action,
        data: JSON.stringify(data)
    };
    $.ajax({
        data: params
    });
}

/*
    ##################
    STANDARD FUNCTIONS
    ##################
*/

/*
    #########################
    AJAX ERROR RETURN HANDLER
    #########################
*/
function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();

    let retContents = (jqXHR.responseJSON !== undefined) ? jqXHR.responseJSON.fatalError : UILANG.m("No server data returned");

    let dialogData = {
        buttons: [{
            label: UILANG.m('OK'),
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: retContents,
        title: UILANG.m('Error') + ': ' + errorThrown,
        width: 500,
    };
    new nxDialog('ajaxError', dialogData);
}

/*
    ###########################
    AJAX SUCCESS RETURN HANDLER
    ###########################
*/
function ajaxSuccess(res) {

    $('#un_val').html(res.loggedInName);
    waitDialog.hide();

    let dialogData;
    if (res.fatalError) {
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('fatalError', dialogData);
        return;
    }

    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error) {
        gui.statusBar.setStatus(res.error, 3000, '#DD1A00');

        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br><p>' + res.error + '</p>',
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 800,
        };
        new nxDialog('error', dialogData);
    }

    switch (res.action) {

        case "check":

            if (typeof res.pageUpdateStatus !== "undefined") {
                // TODO: determine if we want display any extra info on page/item updates, or be silent
            }

            break;

        default:

            break;
    }

}