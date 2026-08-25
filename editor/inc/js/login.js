"use strict";
let waitDialog;

// immediately set handler to try and prevent accidental navigation away from reset page (when in rview)
window.history.replaceState(null, null, window.location.href); // prevent re-posting of data
if (rview === 2 || rview === 3) {
    window.addEventListener("beforeunload", bufx);
}

function bufx(event) {
    event.returnValue = "Leave page?";
}

function stopRefreshRepost() {
    window.history.replaceState(null, '', window.location.pathname);
    history.pushState(null, document.title, location.href);
    window.addEventListener('popstate', function(_e) {
        history.pushState(null, document.title, location.href);
    });
}

$(onDOMReady);

function onDOMReady() {
    initGUI();
    $('#UI').hide();
    $('#interfaceFrame').css('maxWidth', '100%');
    $('header').hide();
    $('.menu').hide();
    $('#profile').hide();

    waitDialog = new jsModalWait(UILANG.m('please wait') + '...');

    let inputLoginBox = /* html */`
        <div id="loginContainer" >

            <div class="loginTitle">${UILANG.m("oasys administration panel login")}</div>
            <img class="logincontainerLogo" src="` + settings.JSrootURL + settings.logoBackendLoginView + `"/>
            <div id="returnMsg"></div>

            <form action="index.php" method="get">
                <div class='loginRow' style="text-align: center;">
                    <input class="loginLangButton" name="forceLang" type="submit" value="EN">
                    <input class="loginLangButton" name="forceLang" type="submit" value="FR">
                    <input class="loginLangButton" name="forceLang" type="submit" value="DE">
                </div>
            </form>

            <form>
                <div class='loginRow'><div class="uSettingFieldLabel">${UILANG.m("username")}</div><input class='loginTextField' type='text' id='login_username'> </div>
                <div class='loginRow'><div class="uSettingFieldLabel">${UILANG.m("password")}</div> <input class='loginTextField' type='password' id='login_password'></div>
                <button class='loginRow' type="submit" id="loginButton" value="Login" disabled>${UILANG.m("login")}</button>

                <div style="width: 100%; text-align: center;">
                    <span id="SSOloginButtonHolder"><button class='loginRow' type="submit" id="SSOloginButton" value="SSOLogin">${UILANG.m("SSO Login Page")}</button></span>
                    <div style="display: none;" id="pwdResetLink">${UILANG.m("I forgot my username or password")}</div>
                </div>
            </form>

        </div>
    `;

    let inputResetBox = /* html */ `
        <div id="loginContainer">

            <div class="loginTitle">${UILANG.m("oasys administration panel account reset")}</div>
            <div style="padding: 20px;" class="uSettingFieldSpecial">${UILANG.m("Please check your given email address to obtain your reset code.")}<br>
            ${UILANG.m("The code will be valid for <u>10 minutes</u>.")}<br><br>

            <div id="csmsg" style="text-align: center; color: red; border: 1px solid red; padding: 15px; margin-bottom: 10px; display: none;"></div>
            <span style="color: orange;">${UILANG.m("Please do not CLOSE, go BACK, or RELOAD this page!")}</span></div>
            
            <form action="index.php" method="post" id="emr_resend_form">
                <div style="text-align: center;"><input style="cursor: pointer;" type="submit" value="${UILANG.m("Resend code")}" name="emr_resend_submit" id="emr_resend_submit"></div>
                <input name="emr_resend" type="hidden" value=1>
                <input name="emr_active" type="hidden" value=1>
                <input name="lang" type="hidden" value="${settings.interfaceLanguage}">
            </form>

            <form action="index.php" method="post" id="codesub_form">
                <img class="logincontainerLogo" src="` + settings.JSrootURL + settings.logoBackendLoginView + `"/>
                <div class='loginRow'>
                    <div class="uSettingFieldSpecial">${UILANG.m("Enter Your Account Reset Code:")}</div>
                    <input name="subcode" class='loginTextField' type='text' autocomplete="off" id='login_resetCode'>
                    <input name="lang" type="hidden" value="${settings.interfaceLanguage}">
                </div>
                <input name="emr_active" type="hidden" value=2>
                <button style="cursor: pointer;" class='loginRow' type="submit" id="codeSubmitButton" value="Submit Code" disabled>${UILANG.m("Submit Login Code")}</button>
            </form>
        </div>
    `;

    let inputNewpassBox = /* html */ `
        <div id="loginContainer">

            <div class="loginTitle">${UILANG.m("oasys administration panel set new password")}</div>
            <div style="padding: 20px;" class="uSettingFieldSpecial">${UILANG.m("Choose a new password for your account login.")}<br>

            <span style="color: orange;">${UILANG.m("Please do not CLOSE, go BACK, or RELOAD this page!")}</span></div>
            
            <form action="index.php" method="post" id="pwdsub_form">
                <img class="logincontainerLogo" src="` + settings.JSrootURL + settings.logoBackendLoginView + `"/>
                <div id="newpwdMsg" style="display: none;"></div>
                <div class='loginRow'>
                    <div class="uSettingFieldSpecial">${UILANG.m("Enter a New Password:")}</div>
                    <input name="pwd1" class='loginTextField' type='password' id='pass1_input'>
                    <div class="uSettingFieldSpecial">${UILANG.m("Confirm the New Password:")}</div>
                    <input name="pwd2" class='loginTextField' type='password' id='pass2_input'>
                </div>
                <input name="lang" type="hidden" value="${settings.interfaceLanguage}">
                <input name="emr_active" type="hidden" value=3>
                <button class='loginRow' disabled type="submit" id="newpwdSubmitButton" value="Update Password">${UILANG.m("Set Password")}</button>
            </form>
        </div>
    `;

    let msgret = /* html */ `
        <div id="loginContainer">

            <div class="loginTitle">${UILANG.m("oasys administration panel account reset")}</div>

            <div id="resetretmsg"></div>

            <form action="index.php" method="post" id="codesub_form">
                <img class="logincontainerLogo" src="` + settings.JSrootURL + settings.logoBackendLoginView + `"/>
                <button style="cursor: pointer;" class='loginRow' type="submit" id="ret2loginButton" value="">${UILANG.m("Return to Login Page")}</button>
            </form>
        </div>
        `;

    /* event handlers */

    // append the appropriate login UI elements
    if (rview === 1) $('#UI').append(`<div id="" style="margin: auto auto;">${inputLoginBox}</div>`);
    if (rview === 2) $('#UI').append(`<div id="" style="margin: auto auto;">${inputResetBox}</div>`);
    if (rview === 3) $('#UI').append(`<div id="" style="margin: auto auto;">${inputNewpassBox}</div>`);
    if (rview === "m") $('#UI').append(`<div id="" style="margin: auto auto;">${msgret}</div>`);

    $('#UI').addClass(`backendLoginUI`);

    if (settings.SSOSysActive === true) {
        $('#SSOloginButtonHolder').show();
    } else {
        $('#SSOloginButtonHolder').hide();
    }

    // initially collapse return message blocks
    $('#returnMsg').hide();
    $('#resetMsg').hide();

    // new pwd field handlers
    $('#pass1_input').on("input", p_match_check);
    $('#pass2_input').on("input", p_match_check);

    // std login page simple input check
    $('#login_username, #login_password').on("input", function() {
        if ($('#login_username').val().length === 0 || $('#login_password').val().length === 0) {
            $('#loginButton').prop("disabled", true);
        } else {
            $('#loginButton').prop("disabled", false);
        }

        // sso button handling
        if ($('#login_username').val().length > 0 || $('#login_password').val().length > 0) {
            $('#SSOloginButton').prop("disabled", true);
        } else {
            $('#SSOloginButton').prop("disabled", false);
        }
    });

    // new pwd validation/confirmation
    function p_match_check() {
        if (($('#pass1_input').val() !== $('#pass2_input').val()) || ($('#pass1_input').val().length <= 3)) {
            $('#newpwdSubmitButton').prop("disabled", true);
            $('#newpwdMsg').html(UILANG.m("New password and confirmation values must match, and must be more than 3 characters in length.")).slideDown("fast");
            window.addEventListener("beforeunload", bufx);
        } else {
            $('#newpwdSubmitButton').prop("disabled", false);
            $('#newpwdMsg').slideUp("fast").fadeOut("fast", function() { $(this).html("") });
            window.removeEventListener("beforeunload", bufx);
        }
    }

    // disable submit buttons after submission action
    $('#codesub_form, #pwdsub_form').on("submit", function(_e) {
        $('#newpwdSubmitButton').prop("disabled", true);
        $('#codeSubmitButton').prop("disabled", true);
    });

    // code submit field validator
    $('#login_resetCode').on("input", function() {
        const re = RegExp(/^[0-9]{6}$/);
        (re.test(this.value) === true) ? $('#codeSubmitButton').prop("disabled", false) : $('#codeSubmitButton').prop("disabled", true);

    });

    // code submit button event handler
    $('#login_resetCode').on("submit", function(e) {
        e.preventDefault();
        return false;
    });

    // code submit form handler
    $('#codesub_form').on("submit", function(e) {
        e.preventDefault();
        startCodeSubmit();
    });

    // resend code button event handler
    $('#emr_resend_submit').click(function(e) {
        this.disabled = true;
        e.preventDefault();
        window.removeEventListener("beforeunload", bufx);
        $('#emr_resend_form').submit();
    });

    // login button event handler
    $('#loginButton').click(function(e) {
        e.preventDefault();
        startLogin();
        return false;
    });

    // SSO login button event handler
    $('#SSOloginButton').click(function(e) {
        e.preventDefault();
        window.location.replace('sso.php?a=login&s=editor');
    });

    $('#emr_resend_submit').val(`${UILANG.m("Send new code")} (${window.rs_count} ${UILANG.m("remaining")})`);

    // check if over resend limit and disasble resend button if so
    if (typeof rs_over !== "undefined") {
        $('#emr_resend_submit').prop("disabled", true);
    }

    // initial authentication status check on page load
    startAjax('check', {});
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
    url: "userMgmtActions.php"
});

function startAjax(action, data) {
    waitDialog.show();
    const params = {
        action: action,
        data: JSON.stringify(data),
        src: "mlgpage"
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

function emr_inits() {
    $('#pwdResetLink').show();

    $('#pwdResetLink').on("click", function() {
        let acctResetDiag = new nxDialog("pr_diag", {
            title: UILANG.m("Forgot Credentials"),
            width: '600',
            buttons: [{
                label: UILANG.m("Cancel"),
                value: "Cancel",
                'cancel': true
            }, {
                label: UILANG.m("SUBMIT"),
                value: "submit",
                'default': true,
                disabled: true
            }],
            contents: /* html */`
            <form id="emr_form" action="index.php" method="post">
                <div id='forgottenPasswordMsg'>
                    ${UILANG.m("Please enter your email address associated with OASYS and select the options that apply.")}
                </div>
                <div id="pswResetInputs">
                
                <div id="emr_msgbox" >${UILANG.m("Please enter a valid email address.")}</div>
                <input id="emr_addr_id" name="emr_addr" type="text" value="">

                <div id="forgotCredentialsTypeBox">
                <div class="frgCheckboxContainer"> <input class="emr_cb" type="checkbox" id="f_username" name="f_username" value=true>
                <label for="f_username">${UILANG.m("I forgot my username")}</label></div>
                <div class="frgCheckboxContainer"> <input class="emr_cb" type="checkbox" id="f_password" name="f_password" value=true>
                <label for="f_password">${UILANG.m("I forgot my password")}</label></div>
                </div>

                <input name="emr_active" type="hidden" value=0 />
                <input name="lang" type="hidden" value="${settings.interfaceLanguage}">
                </div>
            </form>

            
        `,
            callback: function(btn) {
                if (btn === "submit") $('#emr_form').submit();
            }
        });

        $('#login_username').focus();

        let ok4submit = false;

        // do not allow form submit on ENTER if the submit nxButton isn't enabled
        $("#emr_form").on("keydown", function(e) {
            if (!ok4submit) {
                e.preventDefault();
                return false;
            }
        });

        // form validation
        $('.emr_cb, #emr_addr_id').on("change, input", function() {

            const goodEmailFmt = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
            const re = RegExp(goodEmailFmt);
            let emailOK;
            // not passed
            if (!re.test($("#emr_addr_id").val())) {
                emailOK = false;
                $('#emr_msgbox').css("visibility", "visible");
            } else {
                // passed
                emailOK = true;
                $('#emr_msgbox').css("visibility", "hidden");
            }

            if (($('#f_password').prop("checked") || $('#f_username').prop("checked")) && emailOK) {
                acctResetDiag.enableButton("submit");
                ok4submit = true;
            } else {
                acctResetDiag.disableButton("submit");
                ok4submit = false;
            }
        });

    });
}


function startCodeSubmit() {
    $('#codesub_form').off("submit");
    window.removeEventListener("beforeunload", bufx);
    $('#codesub_form').submit();
}

function startLogin() {
    startAjax("login", {
        username: $('#login_username').val(),
        password: $('#login_password').val()
    });
}

/*
    #########################
    AJAX ERROR RETURN HANDLER
    #########################
*/
function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();

    let retContents = (jqXHR.responseJSON !== undefined) ? jqXHR.responseJSON.fatalError : "No server data returned";

    const dialogData = {
        buttons: [{
            label: UILANG.m('OK'),
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: retContents,
        title: UILANG.m('Error') + ': ' + errorThrown,
        width: 500
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

    // init url param grabber for specific err messages
    let sparam = new URLSearchParams(window.location.search);

    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error) {

        $('#returnMsg').show();
        $('#returnMsg').html(UILANG.m(res.error));

        // set initial focus on username field
        $('#login_username').select();
        $('#login_password').val('');
        $('#loginButton').prop("disabled", true);

        return;
    } else {
        // blank out return message box when all is normal
        $('#returnMsg').html("");
        $('#returnMsg').hide();
    }

    // no editors either means initial login or user has no editors
    if (!res.editors) {
        if (res.error === false) {
            let reloadLang = sessionStorage.getItem('forceLang');
            window.location.replace('index.php?forceLang=' + reloadLang);
            return;
        }
    } else if (res.username && res.authStatus === true) {
        // remove early setting of upgrader availability status
        sessionStorage.removeItem('upgAvail');

        if (res.editors.length === 0) {
            window.location.replace('accountProp.php');
            return;
        }

        // do page redirect -- FORCING ALL INITIAL LOADING TO DASHBOARD NOW
        let loadEditor = "dashboard";

        // redirect to account settings page if no editor language defined
        if (!res.defLang) {

            let lData = {
                action: "langChange",
                data: JSON.stringify({
                    newLang: sessionStorage.getItem('forceLang') || settings.interfaceLanguage
                })
            };

            waitDialog.show();
            let updLangTest = $.ajax({
                type: "POST",
                cache: false,
                dataType: "json",
                timeout: 300000,
                url: "accountPropActions.php",
                data: lData,
            }).done(() => {
                window.location.replace(loadEditor + '.php?initlogin=true');
            });

            return false;
        }

        window.location.replace(loadEditor + '.php?initlogin=true');
        return;
    } else {
        $('.menu').hide();
        $('.loginRow').show();
    }

    $('#UI').show();

    // if email subsystem active, show 'forgot' link
    if (settings.emailSysActive) emr_inits();

    // always clear out our input form
    $('#login_username').val('');
    $('#password').val('');

    // bad code message
    if (typeof bcta !== "undefined" && bcta === true) {
        $('#csmsg').show();
        $('#csmsg').html(UILANG.m("Invalid code. Please try again."));
    }

    if (rview === "m") {
        if (typeof errmsg !== "undefined") $('#resetretmsg').html(errmsg).addClass("errmsg");
        if (typeof goodmsg !== "undefined") $('#resetretmsg').html(goodmsg).addClass("goodmsg");
    }

    // set initial focus on username field or code field depending on view
    if (rview === 1) $('#login_username').focus();
    if (rview === 2) $('#login_resetCode').focus();
    if (rview === 3) $('#pass1_input').focus();

    if (sparam.has('ecode')) {
        let ecodeStruct = {
            oaNUF: UILANG.m("This account is not linked to Oasys."),
            oaD: UILANG.m("Account has been disabled."),
            oaTO: UILANG.m("Unable to login through provider. Please try again."),
            oaGM: UILANG.m("Unable to login. Please try again.")
        };

        $('#returnMsg').show();
        $('#returnMsg').html(ecodeStruct[sparam.get('ecode')]);
        stopRefreshRepost();
    }

    if (sparam.has('lcode')) {
        let lcodeStruct = {
            ssolo: UILANG.m("You have been logged out of Oasys and your SSO session."),
        };

        $('#returnMsg').show();
        $('#returnMsg').html(lcodeStruct[sparam.get('lcode')]);
        stopRefreshRepost()


    }
}