"use strict";
let waitDialog;
let langDropList = {};
let newUserVals = {};
let curSettingsObj = {};
let gui = {};
$(onDOMReady);

function onDOMReady() {
    initGUI();
    waitDialog = new jsModalWait(UILANG.m('please wait'));
    let acctPropsBox = /* html */`
        <div id="acctPropContainer">
            <div class="propertiesTitle">
                ${UILANG.m("Modify account details")}
                <span class="propertiesSubtitle">${UILANG.m("Manage your profile and personal editor preferences")}</span>
            </div>
            <div style="display: block; text-align: center;" id="bkBtn"></div>
            <table id="tableOfProperties">
                <tbody id="accountPropertiesTable">
                    <tr class='accPropRow'>
                    <td class="accPropTitleCol" >${UILANG.m("Email Address:")}</td><td class="accPropValueCol" id="emailVal"></td><td id="changeEmailButton" class=" accPropValueCol"></td>
                    </tr>
                    <tr class='accPropRow' id="pwdSection" style="display: none;" >
                    <td class="accPropTitleCol" >${UILANG.m("Password:")}</td><td class="accPropValueCol fakePassword">&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;</td><td id="changePasswordButton" class=" accPropValueCol"></td>
                    </tr>            
                    <tr class='accPropRow'>
                    <td class="accPropTitleCol">${UILANG.m("Language:")}</td><td id="lang" class="accPropValueCol"></td>  
                    </tr> 
                </tbody>
            </table>
        </div>
    `;

    $('#UI').append(acctPropsBox);

    new nxButton("bkBtn", "bbid", {
        label: UILANG.m("&#5130; Back to Dashboard"),
        callback: () => window.location.assign(settings.JSrootURL + "editor/dashboard.php")
    });

    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: '<strong style="margin-right: 10px;">' + UILANG.m('User profile') + '</strong>',
        message: ''
    });


    // init language dropdown list
    langDropList = new jsDropList('lang', 'usdd_langsId', {
        listTitle: UILANG.m('Choose language'),
        theme: 'backend',
        onChange: function(src, val) {
            startLangChange(val);
        }
    });

    // init email update button
    let emBtnObj = new nxButton('changeEmailButton', 'emButton', {
        tooltip: UILANG.m("Update Email"),
        value: "ChangeEmail",
        icon: '../images/flexSectionToolBar/ic_flex_tb_edit.png',
        iconWidth: "24",
        callback: startEmailChange,
        disabled: false
    });

    // init change password button
    let pwdBtnObj = new nxButton('changePasswordButton', 'pwdButton', {
        tooltip: UILANG.m("Update Password"),
        icon: '../images/flexSectionToolBar/ic_flex_tb_edit.png',
        iconWidth: "24",
        value: "ChangePwd",
        callback: startPwdChange,
        disabled: false
    });

    // initial authentication status check on page load - will check for account enabled status and rotate session ID and also fetch language selection list
    startAjax("check", {});
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
    url: "accountPropActions.php"
});

function startAjax(action, data) {
    waitDialog.show();
    $.ajax({
        data: {
            action: action,
            data: JSON.stringify(data)
        }
    });
}

/*
    ##################
    STANDARD FUNCTIONS
    ##################
*/

function startSettingChange() {

    startAjax("updateUserSettings", newUserVals);
}

function startPwdChange(ref, button, ...data) {

    if (!button) {
        const pwdDiagData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                value: 'cancel'
            }, {
                label: UILANG.m('OK'),
                'default': true,
                value: 'ok'
            }],
            title: "CHANGE ACCOUNT PASSWORD",
            datafields: ['oldpass', 'newpass', 'newpass2'],
            focus: ['oldpass'],
            mandatory: ['oldpass', 'newpass', 'newpass2'],
            values: {},
            contents: `
            <table>
                <tr>
                    <td>` + UILANG.m('Current Password:') + `</td><td><input class='pwdField' type='password' id='oldpass'></td>
                </tr>

                <tr>
                    <td>` + UILANG.m('New Password:') + `</td><td><input class='pwdField' type='password' id='newpass'></td>
                </tr>

                </tr>
                    <td>` + UILANG.m('Confirm New Password:') + `</td><td><input class='pwdField' type='password' id='newpass2'></td>
                </tr>

            </table>
            <div id="confWarning"></div>
            <div id="pwdWarning"></div>
                `,
            callback: startPwdChange
        };

        let pwdDiag = new nxDialog("pwdDiagId", pwdDiagData, [data]);

        // password complexity warning
        $('#newpass').on("input", function() {
            if ($('#newpass').val().length === 0) {
                $('#pwdWarning').html('');
            } else if (/(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z]).{8,}|.{12,}/.test($(this).val()) === false) {
                $('#pwdWarning').html(UILANG.m("WARNING: This is an insecure password. It is recommended to use a mix of capital, lower, and numeric values with at least 8 characters, or a minimum of any 12 characters."));
            } else {
                $('#pwdWarning').html('');
            }

            if (lin === $(this).val()) {
                $('#pwdWarning').html($('#pwdWarning').html() + ($('#pwdWarning').html() === "" ? "" : "<br><br>") + "WARNING: It is not recommended to use the same value for both username and password.");
            }

        });

        // pwd inputs validation (for button enabling, not complexity reqs)
        $('.pwdField').on('input', function() {
            $('.pwdField').each(function(i, e) {
                if ($('#newpass').val() !== $('#newpass2').val()) {
                    $('#confWarning').html(UILANG.m("WARNING: New password confirmation value does not match new password value."));
                    pwdDiag.disableButton('ok');
                    return false;
                } else {
                    $('#confWarning').html('');
                }
            });
        });

        $('#oldpass').select();

    } else if (button === 'ok') {
        let oldpass = data[0];
        let newpass = data[1];
        let newpass2 = data[2];

        if (newpass !== newpass2) {
            alert(UILANG.m("The new password and new password confirmation values do not match."));
            $('#newpass2').focus();
            $('#newpass2').select();
            return false;
        }

        if (newpass.length > 50) {
            alert(UILANG.m("New password may not exceed 50 characters in length."));
            $('#newpass').focus();
            $('#newpass').select();
            return false;
        }

        startAjax("pwdChange", {
            oldpass: oldpass,
            newpass: newpass,
            newpass2: newpass2
        });
    }
}

function startEmailChange(ref, button, data) {

    if (!button) {

        const emDiagData = {
            buttons: [{
                label: UILANG.m('cancel'),
                'cancel': true,
                value: 'cancel'
            }, {
                label: UILANG.m('OK'),
                'default': true,
                value: 'ok'
            }],
            title: UILANG.m("Edit email address"),
            datafields: ['email'],
            focus: ['email'],
            values: {
                email: glob_data.email
            },
            contents: `<div>` + UILANG.m('Email Address:') + `</div><input type='text' id='email'>`,
            callback: startEmailChange
        };

        let emDiag = new nxDialog("emDiagId", emDiagData, [data]);

        // email input validation
        $('#email').on('input', function() {
            // https://stackoverflow.com/a/46181 - email validation accepts unicode input; however not a perfect regex for negative email format testing
            const goodEmailFmt = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
            const reEmail = RegExp(goodEmailFmt);

            if (!reEmail.test($(this).val())) {
                $(this).css('border', '1px solid #DD1A00');
                emDiag.disableButton('ok');
            } else {
                $(this).css('border', '1px solid #ccc');
                emDiag.enableButton('ok');

            }
        });


    } else if (button === 'ok') {
        startAjax("emailChange", {
            newemail: data
        });
    }
}

function startLangChange(val) {
    startAjax("langChange", {
        newLang: val
    });
}

/*
    #########################
    AJAX ERROR RETURN HANDLER
    #########################
*/
function ajaxError(jqXHR, textStatus, errorThrown) {
    waitDialog.hide();

    let retContents = (jqXHR.responseJSON !== undefined) ? jqXHR.responseJSON.fatalError : UILANG.m("No server data returned");

    new nxDialog('ajaxError', {
        buttons: [{
            label: UILANG.m('OK'),
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: retContents,
        title: UILANG.m('Error') + ': ' + errorThrown,
        width: 500,
    });
}

/*
    ###########################
    AJAX SUCCESS RETURN HANDLER
    ###########################
*/
function ajaxSuccess(res) {

    // display notification warning if user is not assigned to at least one group
    if (typeof res.ugroups !== 'undefined' && res.ugroups.length === 0) {
        let ngDiagData;
        ngDiagData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: UILANG.m("Your account is not a assigned to any user groups. Please contact the administrator if you need to work within OASYS."),
            title: UILANG.m("Warning"),
            icon: "../images/warning.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('noGroupMsg', ngDiagData);

    }

    window.lin = res.loggedInName;

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
            contents: formatActionErrorMessage('<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('fatalError', dialogData);
        return;
    }

    // always clear out our input form
    $('#email').val('');
    $('#oldpass').val('');
    $('#newpass').val('');
    $('#newpass2').val('');

    // populate the email field for editing if need be
    $('#email').val(res.email);

    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error) {

        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br><p>' + res.error + '</p>'),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 800,
        };
        new nxDialog('error', dialogData);
    }

    // remove password section if account type not LOCAL
    if (res.accountType === "LOCAL") {
        $('#pwdSection').show();
    }

    // populate language selection dropdown and check for unselected language condition
    if (res.langs) {

        if (res.action !== "langChange") {
            for (const lang in res.langs) {
                let langString = res.langs[lang];
                langDropList.addElement(lang, UILANG.m(langString));
            }
        }

        if (!res.defLang) {
            let fLang = sessionStorage.getItem('forceLang') || settings.interfaceLanguage;
            startLangChange(fLang);
        } else {
            if (res.action !== "langChange") langDropList.reset(res.defLang);
        }
    }

    // if there's an extra msg, show it in status bar, else, blank out area, also fade out message
    if (res.error) {
        gui.statusBar.setStatus(res.error, 3000, '#DD1A00');

    }
    if (res.authMessage) {
        gui.statusBar.setStatus(res.authMessage, 3000, '#22AA41');
    }


    switch (res.action) {

        // # --------------------------------------------------- #
        // # Handle 'user settings' scoped entries from settings #
        // # --------------------------------------------------- #

        case "check":
            window.glob_data = res;

            // display email address
            $('#emailVal').html(res.email);

            for (const setting in res.uSettings) {
                const setVal = res.uSettings[setting];

                if (setVal.format !== undefined) {
                    let rowId = "accPropTableRow_" + setting;

                    $('#accountPropertiesTable').append("<tr class='accPropRow' id='" + rowId + "'></tr>");
                    $('#' + rowId).append("<td class='accPropTitleCol'>" + UILANG.m(setVal.comment) + "</td>");
                    $('#' + rowId).append(`<td class="accPropValueCol" id='setVal${setting}'></td>`);
                }

                // FYI: 'usdd_' is pre-pended to the various containers to allow for patterned CSS selection
                switch (setVal.format) {
                    case 0: // BOOLEAN
                        curSettingsObj[setting] = new jsToggleswitch($('#setVal' + setting), 'usdd_' + setting, {
                            height: 20,
                            width: 60,
                            background: 'images/ic_ui_toggleswitch.png',
                            callback: function(setName, val) {
                                // usetBtnObj.enable();
                                newUserVals[setName.replace('usdd_', '')] = val;
                                startSettingChange();
                            }
                        }, setVal.value);

                        break;

                    case 3: // STRING
                        // unescape quotes from JSON string value when required
                        let strTimeout;

                        let setValString = setVal['value'];
                        $('#setVal' + setting).html(`<input class = "loginTextField" id = "${setting}" type = "text">`);
                        $('#' + setting).val(setValString);

                        $('#' + setting).on("input", function() {
                            clearTimeout(strTimeout);
                            newUserVals[setting] = $('#' + setting).val();

                            strTimeout = setTimeout(() => {
                                startSettingChange();
                            }, 400);
                        });

                        break;

                    case 4: // SINGLE CHOICE INTEGER
                    case 5: // SINGLE CHOICE STRING
                        curSettingsObj[setting] = new jsDropList('setVal' + setting, 'usdd_' + setting, {
                            theme: 'backend',
                            onChange: function(setName, val) {
                                // usetBtnObj.enable();
                                newUserVals[setName.replace('usdd_', '')] = val;
                                startSettingChange();
                            }
                        });
                        for (let choice in setVal.choices) {
                            let ch_entry = setVal.choices[choice];
                            if (typeof ch_entry === 'object') ch_entry = ch_entry.id;

                            // special formatting for single choice editor type
                            if (setVal.format === 4) {
                                choice = parseInt(choice);
                                ch_entry = `${choice} - ${ch_entry}`;
                            }

                            curSettingsObj[setting].addElement(choice, UILANG.e(ch_entry));
                        }

                        curSettingsObj[setting].reset(setVal.value);

                        break;

                    case 6: // MULTIPLE CHOICE - not implemented/required yet
                        break;

                    default:
                        break;
                }

            }

            $('#acctPropContainer').append("<div class='settingsRow'><div id='changeUsButton' class='accountPropertiesButton'></div></div>");

            break;

        case "emailChange":
            $('#emailVal').html(res.email);
            glob_data.email = res.email;
            break;
        // fall-throughs to reload page on settings changes
        case "updateUserSettings":
            break;

        case "langChange":

            // force page reload on any account property or user settings update
            location.reload();
    }
}
