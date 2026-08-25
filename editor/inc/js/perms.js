/* Permission and Authentication Functions */

// global vars for permission administration
let ihLocalState = null;
let ihServerState = null;
let epListObj = {};
let eTsListObj = {};
let eUgSelList = null;
let ownerIdVal = null;
let oMasterList = [];
let ugMasterList = [];
let m_opts = {};
let m_inheritOpts = null;
let m_recursOpts = null;
let m_owner_recursOpts = null;
let permFldParent = null;
let permMultiSel = false;
// list of users with access to itemgroup global variable
let usrlistDropdown = {};

// add user to itemgroup access list global object
let userListSelObj = null;

// boolean to check if permission changes were made without saving
let permChanged = false;
let editPermDialog;

// new owner, if selected 
let newOwner = null;
let oldOwner = null;

// Edit Permissions dialog box which shows access allowance, inherit properties, ownership options, etc.
function editPermDiag(sender, uid, multi = false, button) {

    // define our current folder and parent db id values based on source click
    let permFldSels, fldNames;

    if (sender === 'ctxMenu_curFld') {
        // permission request source = current folder (non-selection)
        permFldSels = parseInt(loc.folder);
        permFldParent = loc.path[loc.path.length - 2].id;
        fldNames = loc.path[loc.path.length - 1].name

    } else {
        // permission request source = selection (or multi-selection)
        permFldSels = (selection.length > 1) ? selection.map(function(val, i) { return parseInt(val.dbId) }) : parseInt(selection[0].dbId);
        permFldParent = parseInt(selection[0].pid.split('f')[1]);
        fldNames = (selection.length > 1) ? selection.map(function(val, i) { return val.name }) : selection[0].name;
    }

    /* START MAIN DIALOG BUILDER/REBUILDER/CANCEL VERIFICATION SEGMENT */

    if (!button || sender === 'addUserDiag' || button === 'cancel') {

        // reset our inheritance flag on a new folder permission load
        ihLocalState = null;
        ihServerState = null;

        // reset our change data variable upon reloading the nxDialog
        permChanged = false;

        let dialogData = {
            buttons: [{
                label: UILANG.m('Close'),
                'cancel': false,
                value: 'cancel'
            }, {
                label: UILANG.m('Save'),
                'default': true,
                value: 'save',
                disabled: true
            }],
            title: (multi) ? UILANG.m("Bulk Permissions Editor") : UILANG.m("Edit folder permissions"),
            width: 1100,
            callback: editPermDiag,
            contents: /* html */ `
            <div id='edit_permission_view'>
                <div id="perm_title">
                    <img class="dialogTitle_icon" src="../images/listFolder.png"></img>
                    <div id='fld_name'></div>
                </div>
                <div id="ownerBox">
                    <div style="width: 100%; display: block;" id="ownerHeaderBox">
                        <span id="ownerLabel" class="ownerTitle">${UILANG.m("Owner")}:</span>
                        <span id='owner_name'></span> 
                        <span id='new_owner'></span>
                        <span><a href="#" id="editOwnerButton">${UILANG.m("Edit Owner")}</a></span>
                    </div>
                    <div id="ownerList_container"></div>
                    <div id="ownerBox_controls"></div>
                </div>
                ${(multi) ? /* html */`<div id="perm_warn_msg">
                <button id="b_cl_warn"></button>
                <div id="multiPermsWarningContainer">
                <img src="../images/warning.png">
                <div id="multipermsWarnTexts">
                <h3>${UILANG.m("WARNING: YOU ARE IN THE BULK PERMISSIONS EDITOR MODE!!!")}</h3>
                <div>${UILANG.m("You must manually configure each usergroup permission values you wish to update. Any untouched usergroup configurations (marked with an &quot;M&quot;) will retain their original access settings.")}</div>
                <div>${UILANG.m("It is strongly recommended to perform a system backup prior to saving any changes.")}</div>
                </div>
                </div>
                </div>` : '<div id="perm_warn_msg"></div>'}
                <div id="permLabel">${UILANG.m("PERMISSIONS")}</div>
                <!-- usergroup filtering input field -->
                <div id="plContainer">
                    <div id="plbInner">
                        <div id="ug_label">${UILANG.m("User Groups")}</div>
                        <div id="far_label">${UILANG.m("Access Rights")}</div>
                        <div id="usr_label">${UILANG.m("Users in selected group")}</div>
                    </div>
                    <div id="pMasterBlock">
                        <div id="pLeftBlock">
                        <div id='g_btn_area'><input id='ugFilter' type = 'text' placeholder='${UILANG.m("filter_u")}' /></div>
                            <span id='group_targ_name'></span>
                        </div>
                        <div id="pRightBlock">
                            <div class='pData'>
                               
                                <div id='perm_detail'>
                                    <div id='p_btn_area'></div>
                                </div>
                                <div class="permsDialogWarningMessage" id="inh_warning">${UILANG.m("Disable inheritance to edit these permissions directly.")}</div>
                                <div id='perm_reucurs_check'></div>
                            </div>
                        </div>
                        <div id="pMiddleBlock">
                        <div id='u_btn_area'></div>
                        </div>
                        
                    </div>
                </div>
                <div id='up_actions_section'>
                    <div class="regRow">
                        <span id='perm_actions'></span>
                    </div>
                </div>
                
                 <!-- conditionally show the bulk editor warning message -->
               
            </div>
            `
        };

        editPermDialog = new nxDialog('EPD', dialogData, [sender, uid, multi]);
        $('#EPD').hide();

        // hide inheritance option when in the root folder
        if (permFldParent === 1) $('#up_actions_section').hide();

        /* special options for multiselect */

        // init default options for special multiselect condition
        m_opts = {
            m_opt_inh_enabled: false,
            m_opt_inh_disabled: false,
            m_opt_inh_recurs: false,
            m_opt_fld_recurs_do: false,
            m_opt_owner_recurs: false
        };

        if (multi || isSuper) {

            function updateMopts(stub, optData) {

                // first set all options to false
                for (const [key, _value] of Object.entries(m_opts)) {
                    if (key.startsWith(stub) && key !== "m_opt_inh_recurs") {
                        m_opts[key] = false;
                    }
                }

                // set clicked option to true
                m_opts[optData] = true;

                // update live ih state
                ihToggleActions();
            }

            $('#plContainer').after("<div id='multi_footer_opts'></div>");

            m_inheritOpts = new jsMultipleChoice('multi_inherit', {
                type: 'rb',
                onChange: (_a, data) => updateMopts("m_opt_inh", data),
                height: '15px',
                elPrefix: /* html */ `<div class="multiPermOptionBlock">`,
                lbPostfix: "</div>",
                elements: [{
                    elementParent: 'multi_footer_opts',
                    labelParent: 'multi_footer_opts',
                    value: 'm_opt_inh_enabled',
                    label: UILANG.m("Inheritance enabled"),
                }, {
                    elementParent: 'multi_footer_opts',
                    labelParent: 'multi_footer_opts',
                    value: 'm_opt_inh_disabled',
                    label: UILANG.m("Inheritance disabled"),
                }]
            });

            const m_inhRecursBox = new jsMultipleChoice('m_opt_inh_recurs', {
                type: 'cb',
                onChange: function(cbName, _b, value) {
                    m_opts[cbName] = value;
                    if (permFldParent === 1 || permMultiSel) {
                        m_inheritOpts.unlock();
                    } else {
                        permChanged = true;
                        editPermDialog.enableButton('save');
                        if (ihLocalState === true && m_opts['m_opt_inh_enabled'] === false && m_opts['m_opt_inh_disabled'] === false) {
                            updateMopts("m_opt_inh", "m_opt_inh_enabled");
                        } else if (ihLocalState === false && m_opts['m_opt_inh_enabled'] === false && m_opts['m_opt_inh_disabled'] === false) {
                            updateMopts("m_opt_inh", "m_opt_inh_disabled");
                        }
                    }

                    if (permFldParent === 1 && !permMultiSel && permChanged === false) editPermDialog.disableButton('save');
                },
                height: '15px',
                elPrefix: /* html */ `<div style='display: block; margin-bottom: 8px;'>`,
                lbPostfix: "</div>",
                // initialValue: "",
                elements: [{
                    elementParent: 'multi_footer_opts',
                    labelParent: 'multi_footer_opts',
                    value: 'm_opt_inh_recurs',
                    label: UILANG.m("Recursively update inheritance flag")
                }]
            });

            m_recursOpts = new jsMultipleChoice('m_opt_fld_recurs_do', {
                type: 'cb',
                onChange: function(cbName, _b, value) {
                    m_opts[cbName] = value;
                    permChanged = true;
                    editPermDialog.enableButton('save');
                },
                height: '15px',
                elPrefix: /* html */ `<div style='display: block; margin-bottom: 8px;'>`,
                lbPostfix: "</div>",
                readOnly: true,
                elements: [{
                    elementParent: 'perm_reucurs_check',
                    labelParent: 'perm_reucurs_check',
                    value: 'm_opt_fld_recurs_do',
                    label: UILANG.m("Recursively update permissions")
                }]
            });

            $('#multi_footer_opts').append( /* html */ `<div id='m_opts_sep'></div>`);

            m_owner_recursOpts = new jsMultipleChoice('m_opt_owner_recurs', {
                type: 'cb',
                onChange: function(cbName, _b, value) {
                    m_opts[cbName] = value;
                    editPermDialog.enableButton('save');
                },
                height: '15px',
                readOnly: true,
                elements: [{
                    elementParent: 'ownerBox_controls',
                    labelParent: 'ownerBox_controls',
                    value: 'm_opt_owner_recurs',
                    label: UILANG.m("Recursively update owners")
                }]
            });
        }

        /* action on input for usergroup filter box */
        $('#ugFilter').on('input', function() {

            // manually set some UI elements to 'deselect all' upon entry search
            $('#perm_detail').hide();
            $('.pData').hide();
            $('#eUgList ul li').css('border-bottom', '1px solid #E0E0E0');
            eUgSelList.setSelection([0]);
            $('.bubArrow').hide();

            // loop search routine to match input to usergroup names
            for (const i of ugMasterList) {
                if (!i.name.toLowerCase().includes($('#ugFilter').val().toLowerCase())) {
                    $(`#eUgList_${i.id}`).hide();
                } else {
                    $(`#eUgList_${i.id}`).show();
                }
            }

        });

        // # ------------------------------------------------ #
        // #  NXDIALOG OVERRIDES FOR ESC & ENTER KEYS IN DIAG #
        // # ------------------------------------------------ #

        // call and define keyboard override
        EPD_KB_mouse_init();

        function EPD_KB_mouse_init() {

            // remove all previous kb handlers to set new custom ones for edit perms dialog
            $(document).off("keydown");
            $(document).off("keyup");

            /* set up/down to move amongst group permission entries */
            kbHandler.registerShortcut('up', () => eUgSelList.moveUp());
            kbHandler.registerShortcut('down', () => eUgSelList.moveDown());

            /* used for exiting dialog with esc key (while performing 'safe to close' check) */
            kbHandler.registerShortcut('esc', () => checkSafeClose());

            /* used for saving on 'enter' */
            kbHandler.registerShortcut('cr', () => {
                if (!permChanged) return;
                editPermDiag(sender, undefined, multi, 'save');
                realExit(true);
            });

            /* redirect clicking on 'close' button via mouse */
            $('#EPD_button_0').off('pointerup');
            $('#EPD_button_0').on('pointerup', checkSafeClose);
        }

        // # ---------------------------- #
        // #  INHERITANCE SETUP AND LOGIC #
        // # ---------------------------- #

        // instantiate the inherit permissions button (if not multi)
        if (!multi && !isSuper) {
            window.iBtnObj = new nxButton($('#perm_actions'), 'ihButton', {
                value: "ihVal",
                disabled: false,
                callback: ihToggleActions

            });
        }

        // check for unsaved changes
        function checkSafeClose() {
            if (permChanged) {
                let confPermExit = new nxDialog('CPE', {
                    contents: UILANG.m("You have not saved your permisison changes! Do you wish to continue editing, or exit?"),
                    buttons: [{
                        label: UILANG.m("Close without Saving"),
                        'cancel': false,
                        value: "reallyClose"
                    }, {
                        label: UILANG.m("Continue editing"),
                        'default': true,
                        'cancel': false,
                        value: 'cont'
                    }],
                    title: UILANG.m("Exit without Saving"),
                    width: 500,
                    callback: function(button) {
                        if (button === 'cont') {
                            EPD_KB_mouse_init(); // reinit our nxDiag keyboard event binding
                            confPermExit.dismiss();
                        } else if (button === 'reallyClose') {
                            realExit();
                        }
                    }
                });
            } else {
                realExit();
            }
        }

        function ihToggleActions() {

            $('.pData').hide();

            // enable the save button since values are changing to inherited ones
            editPermDialog.enableButton('save');

            // toggle switch lock state to the opposite value
            ihLocalState = !ihLocalState;

            // we are making changes so make condition dirty
            permChanged = true;

            if (permFldParent === 1) return;

            perms_startAjax('fetchIgPerm', {
                i_id: permFldSels,
                parentId: permFldParent,
                loadGroup: parseInt(eUgSelList.getSelection().id),
                inherit: ihLocalState
            });
        }

        // # -------------------------------- #
        // # Real Exit Handler for our nxDiag #
        // # -------------------------------- #
        function realExit(forceClose = false) {
            sender = null;
            uid = null;
            button = null;
            usrlistDropdown = {};
            editPermDialog.dismiss();
            $('#fld_name #group_targ_name #perm_detail #perm_actions').html();

            if (forceClose) editPermDialog.dismiss(); // call coming from 'save' kb call

            /* re-init standard kb shortcuts for filez browinsg mode, hopefully */
            $(document).off("keydown");
            $(document).off("keyup");
            mode = 'browsing';

            kbHandler.registerShortcut('CR', function() {
                editSelection('shortcut');
            }, {
                preventDefault: false
            });
            kbHandler.registerShortcut('ESC', abortEditing, {
                executeOnChildren: true
            });
            kbHandler.registerShortcut('CTRL+A', ctrlA);
            kbHandler.registerShortcut('del', deleteKey);
            kbHandler.registerShortcut('up', cursorUp);
            kbHandler.registerShortcut('down', cursorDown);
            kbHandler.registerShortcut('SHIFT+UP', cursorShiftUp);
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
            kbHandler.registerShortcut('tab', null, {
                executeOnChildren: true
            }); //prevent tabbing to the URL input field of the browser

            return;
        }

        // # ------------------------------ #
        // #  Forced JQ actions on elements #
        // # ------------------------------ #

        $('.pData').hide(); // hide the initial permission detail info box

        // make button display as block
        $('#background_remBtn').css('display', 'block');


        // set the groupitem name - use condensed expression to return separator (minus trailing one) in case of an array in bulk editor mode

        if (typeof fldNames !== "string") {
            let fldVal = fldNames.map(function(v, i) {
                let ending = (i !== fldNames.length - 1) ? " | " : "";
                return v + ending;
            });

            $('#fld_name').html(fldVal);
        } else {
            $('#fld_name').html(fldNames);
        }

        // send data for selected object to get return properties
        perms_startAjax('fetchIgPerm', {
            i_id: permFldSels,
            loadGroup: uid
        });
    }

    // FYI: not being access currently
    // add new user to itemgroup permisison set action
    if (button === 'addUserPerm') {
        if (usrlistDropdown.curVal !== undefined) {
            addUserDiag('editPermDiag', usrlistDropdown.curVal.getValue(), button);
        } else {
            addUserDiag('editPermDiag', '', button);
        }
    }

    // load our permission group content
    if (button === 'save') {
        // reset permission changed beacon
        permChanged = false;

        // setup shell of permission update object
        let updPermObj = {};
        for (const key in eTsListObj) {
            updPermObj[eTsListObj[key].getDataId().userGroup] = {
                c_items: {}
            }
        }

        // iterate edit ts obj and populate update perm obj
        for (const key in eTsListObj) {
            if (eTsListObj.hasOwnProperty(key)) {
                const element = eTsListObj[key];
                if (element.getDataId().edited) updPermObj[element.getDataId().userGroup]['c_items'][element.getDataId().permKeyName] = element.getDataId().permVal;
            }
        }

        // reset the mode value to 'browsing'
        mode = 'browsing';

        // in the case where we do not have any usergroups defined, we must fill in the loadGroup, we will have the eUgSelList as null, which does not work
        let lgLoad = (eUgSelList.getSelection().id === undefined) ? 0 : eUgSelList.getSelection().id;

        // send permission update object to itemActions
        perms_startAjax('updatePerm', {
            updPermObj: updPermObj,
            upType: "ig",
            loadGroup: lgLoad,
            i_id: permFldSels,
            inherit: ihLocalState,
            newOwner: ownerIdVal,
            mOpts: m_opts
        });
    }
}

// parse and display permissions the selected item (folder / itemgroup)
function displayPerms(loadGroup, acArray, ownerInfo, ugStructInfo, multi = false, p_struct) {

    // # ------------------- #
    // # Owner info handling #
    // # ------------------- #

    // message notification dialog when no valid owner(s) are found on folder(s)
    const ownerMsg = (msgTxt) => {
        new nxDialog('noOwner', {
            buttons: [{
                label: UILANG.m('Close'),
                'cancel': true,
                value: 'cancel',
                'default': true
            }],
            width: 500,
            contents: msgTxt,
            title: (multi) ? UILANG.m("No Folder Owner(s) Found") : UILANG.m("No Folder Owner Found"),
            icon: "../images/warning.png"
        });
    };

    ownerIdVal = ownerInfo.oId; // set the current owner value

    let noOwner = false;
    if (ownerIdVal === null || ownerIdVal.length === 0) {
        noOwner = true;
    }

    // no-owner check on multi selection
    if (multi && Object.values(ownerInfo.oId).includes(null)) {
        ownerMsg(UILANG.m("One or more selected folders do not have an owner set. You may set ownership value in bulk now, or individually review each folder's permissions."));
    }

    // reset owner dropList on every permission refresh
    $('#owner_name').html('');

    // make copy of master owner list for live filtering later
    oMasterList = [];
    for (const i of ownerInfo.oList) {
        i.id = i.id.toString();
        oMasterList.push(i);
    }

    // get the name of the owner based on the sent in owner ID, or message N/A for multiselection mode
    if (permMultiSel) {
        $('#owner_name').html("<em>Unmodified</em>");
    } else {
        if (noOwner === true) {
            $('#owner_name').html("<em>Not Found!</em>");
            new nxDialog("no_diag", {
                title: UILANG.m("Missing Owner Notification"),
                contents: UILANG.m("Missing owner! Please select an owner and save this folder's permissions.")
            });
        } else {
            $('#owner_name').html(ownerInfo.oList.find((e) => e.id === ownerInfo.oId.toString()).username);
            oldOwner = ownerInfo.oList.find((e) => e.id === ownerInfo.oId.toString()).username;
        }
    }

    // show full list of potential owners
    $('#ownerList_container').empty();
    let ownerTable = new jsSelectList($("#ownerList_container"), "oList_id", {
        labelKey: "username",
        idKey: "id",
        orderKey: "id",
        selectionCallback: function(idSelObj) {
            newOwner = idSelObj.username; //set new  owner username
            editPermDialog.enableButton('save');
            if (isSuper) m_owner_recursOpts.unlock();
            permChanged = true;
            ownerIdVal = parseInt(idSelObj.id); // update the current owner value to new value for sendback post

            if (oldOwner !== newOwner) { //if ownwer was changed cross out the old shoice
                $('#new_owner').html(newOwner);
                $('#owner_name').addClass('ownerCrossedOut');
            } else {
                $('#new_owner').html("");
                if (!permMultiSel) { //do not remove cross out in the multi select mode
                    $('#owner_name').removeClass('ownerCrossedOut');
                }
            }
        }
    });

    //add controls div to oList_id
    $("#oList_id").append("<div id='oList_controls'></div>");

    // initial hide of owner list box
    $('#oList_id').hide();
    $('#ownerBox_controls').hide();


    // add elements to select list
    ownerTable.setItems(oMasterList);

    let onFilter = `<div id ="onHolder"><span id="ownLabel">${UILANG.m("List of users")}</span> <input id='oFilter' placeholder='${UILANG.m("Filter users")}'/></div>`;
    $("#oList_id").prepend(onFilter);

    // owner name filter handler
    $('#oFilter').on("input", function() {
        let searchFor = this.value;

        $('#oList_id ul li').each(function(_i, row) {
            if (row.innerText.toLowerCase().includes(searchFor.toLowerCase())) {
                $(row).show();
            } else {
                $(row).hide();
            }
        });
    });

    // show/hide handler for edit owner link
    $('#editOwnerButton').off();
    $('#editOwnerButton').on("click", function() {
        if ($("#oList_id").css("display") === "none") {
            $("#oList_id").slideDown("slow");
            $("#ownerBox_controls").show();
        } else {
            $("#oList_id").slideUp("slow");
            $("#ownerBox_controls").hide();

        }
    });

    // array for permission entries
    let permInitObj = [];

    // MULTISEL CASE: EXTRACT OUT FIRST ENTRY TO USE FOR USERGROUP BUILD OBJECT

    if (multi) {
        const firstEntry = Object.keys(acArray)[0];
        acArray = acArray[firstEntry];
    }

    // create array of objects for users with permission jsSelectList
    for (const ugKey of ugStructInfo) {

        // extract the usergroup object values from master array of ug objects
        let theItem = acArray.filter(val => (val.name === ugKey));
        theItem = theItem[0];

        if (theItem.i_id === 0 && !multi) {
            $('#perm_warn_msg').show();
            $('#perm_warn_msg').append(`<li>No permission data was found for <strong>${theItem.name}</strong>, so one has been created. Please set desired values and save this entry.</li>`);
        } else if (!multi) {
            $('#perm_warn_msg').hide();
        }

        // BUILD LIST OF POSSIBLE USERGROUPS
        eUgSelList = new jsSelectList('#group_targ_name', 'eUgList', {
            labelKey: "name",
            orderKey: "name",
            idKey: "id",
            postfixKey: "acVal",
            postfixFormat: "<span class='eug_postfix'>%@</span>",
            selectionCallback: onUgPermChange
        });

        $('#eUgList').on('click', function() {
            $('#perm_detail').show();
        });

        /* Access button bubble builder */
        let acdDisp = /* html */ `
            <span style="display: none;" class="unmodClass" id="unmodMsg_${theItem.id}">Unmodified</span>
            <span id='qkPerm_${theItem.id}'>
                <span class='rAccess bubBtn'></span><div class='bubble_spacer'></div><span class='wAccess bubBtn'></span><div class='bubble_spacer'></div><span class='aAccess bubBtn'></span>
            </span>
            `;

        // save data to permission object
        permInitObj.push({
            id: theItem.id,
            name: theItem.name,
            acVal: acdDisp,
            multi: multi
        });
    }

    // append close button if the warning box is visible
    if ($('#perm_warn_msg').is(':visible') && !multi) $('#perm_warn_msg').prepend('<button id="b_cl_warn"></button><br>');

    // pick a group to load by default
    if (loadGroup === 'undefined' || typeof acArray[0] === 'undefined') return;

    ugMasterList = [];
    for (const i of permInitObj) {
        ugMasterList.push(i);
    }

    // populate the usergoup list
    eUgSelList.setItems(permInitObj);

    // set the UI title property for hover view of expanded permission description on usergroup row
    /**
     * 
     * @param {boolean|string} mode Can either be false or "multi"
     * @param {string|number} ugId Usergroup id value
     * @returns void
     */
    const ugTitleSet = function(mode = false, ugId) {

        // special blanket routine for multiselection (and short-circuit return)
        if (mode === 'multi') {
            $('li[id^="eUgList_"]').prop('title', UILANG.m("* This group will retain its original permissions until new values are explicltly configured."));
            return;
        }

        // define target row element ID
        let eugRow = document.getElementById(`eUgList_${ugId}`);

        // reset title to blank as init state
        eugRow.title = "";

        // tooltip title set logic
        let bubTarg = $(`#qkPerm_${ugId}`);

        if (bubTarg.children('.rAccess').hasClass("bubDisabled") !== true) eugRow.title = UILANG.m("* Group members may read from folder");
        if (bubTarg.children('.wAccess').hasClass("bubDisabled") !== true) eugRow.title += "\n" + UILANG.m("* Group members may write to folder");
        if (bubTarg.children('.aAccess').hasClass("bubDisabled") !== true) eugRow.title += "\n" + UILANG.m("* Group members may modify folder permissions");

        if (bubTarg.children('.rAccess').hasClass("bubDisabled") &&
            bubTarg.children('.wAccess').hasClass("bubDisabled") &&
            bubTarg.children('.aAccess').hasClass("bubDisabled"))
            eugRow.title = UILANG.m("* Group members have no access or visibility to folder");

        eugRow.title = eugRow.title.trim();
    };

    /*  bubble button display logic control + row title build */

    // initial perm bubble state - hide all, then incrementally 'show' when access found
    $('.bubBtn').hide();

    if (multi) {
        $('.unmodClass').show();
        $('.bubble_spacer').hide();
        ugTitleSet('multi', 0)
    } else {
        for (const ugKey of ugStructInfo) {
            let theItem = acArray.filter(val => (val.name === ugKey));
            theItem = theItem[0];

            let bubTarg = $(`#qkPerm_${theItem.id}`);
            let acdData = JSON.parse(theItem.accessDef);

            // read access handling
            bubTarg.children('.rAccess').show();

            if (!acdData['Read']) {
                bubTarg.children('.rAccess').addClass("bubDisabled");
            }


            // write access handling
            (bubTarg.children('.wAccess').show());

            if (!acdData['Write']) {
                bubTarg.children('.wAccess').addClass("bubDisabled");
            }

            // edit perm access handling
            (bubTarg.children('.aAccess').show());

            if (!acdData['Edit Permissions']) {
                bubTarg.children('.aAccess').addClass("bubDisabled");
            }

            ugTitleSet(false, theItem.id);
        }
    }

    // set a custom CSS style on the usergroup element items
    $('#eUgList ul li').css('border-bottom', '1px solid #E0E0E0');

    // BUILD A JSSELECTGROUP PER USERGROUP WITH INDIVIDUAL JSTOGGLESWITCH ITEMS
    epListObj = {};
    eTsListObj = {};
    let lCounter = 0;
    let NA_diag;

    for (const ugKey in acArray) {
        if (acArray.hasOwnProperty(ugKey)) {
            const ugElement = acArray[ugKey];
            let ado = jsonDecode(ugElement.accessDef);

            // if accessDef is empty, fill with perm. structure and set values to false by default
            if (Object.keys(ado).length === 0) {
                ado = {};
                for (x of p_struct) {
                    ado[x] = false;
                }

                if (typeof NA_diag === "undefined") {
                    NA_diag = new nxDialog("noAccessDiag", {
                        title: UILANG.m("Empty Permissions Notice"),
                        contents: /* html */ `
                        <p>${UILANG.m("One or more user groups did not have access permissions defined. These entries have been replaced with disabled access entries.")}</p>
                        <p>${UILANG.m("Please review and save.")}</p>
                        `,
                        buttons: [{
                            value: 'ok',
                            label: 'Close'
                        }]
                    });
                    editPermDialog.enableButton('save');
                    permChanged = true;
                }

            }

            epListObj[ugElement.id] = new jsSelectList($('#perm_detail'), 'ePermList_' + ugElement.id, {
                idKey: "id",
                labelKey: "id",
                orderKey: "name"
            });

            $('[id^="ePermList"].jsSelectListFooter').hide();

            for (const adKey in ado) {
                if (ado.hasOwnProperty(adKey)) {
                    const adItem = ado[adKey];
                    let pType;
                    switch (adKey) {
                        case "Read":
                            pType = "rAccess";
                            break;

                        case "Write":
                            pType = "wAccess";
                            break;

                        case "Edit Permissions":
                            pType = "aAccess";
                            break;

                        default:
                            pType = null;
                            break;
                    }

                    let adLabel = "<span class='bubBtn " + pType + "'></span>&nbsp;" + adKey;
                    eTsListObj[lCounter] = insertToggleswitch(`#ePermList_${ugElement.id}`, `eTsPerm_${lCounter}`, adLabel, {
                        dataId: {
                            label: adKey,
                            userGroup: ugElement.id,
                            permVal: adItem,
                            permKeyName: adKey
                        },
                        checked: (multi) ? false : adItem,
                        callback: function(sender, val) { // ACTION ON CLICKING A TS TO EDIT VALUE

                            /* LINK PERMISSION STATES TOGETHER */
                            // FYI: these values will require positional modification if permission schema changes!

                            let iCode = parseInt(sender.split("_")[1]);

                            /*
                            ICODE CONVERSION TABLE:
    
                            iCode = 0 [3, 6, 9, ...] --> read access ts entries
                            iCode = 1 [4, 7, 11, ...] --> write access ts entries
                            iCode = 2 [5, 8, 12, ...] --> edit perms/owner access ts entries
    
                            */

                            const updTsVal = ((val, iCode) => {
                                eTsListObj[iCode].setDataId({
                                    userGroup: eTsListObj[iCode].getDataId().userGroup,
                                    permVal: val,
                                    permKeyName: eTsListObj[iCode].getDataId().permKeyName,
                                    edited: true
                                });
                            });

                            // immediately make the actual requested update before linked updated
                            updTsVal(val, iCode);
                            // acdDisp = "";

                            const numPermsDivisor = 3; // number of permission entries should equal this divisor value

                            let isReadEntry = (iCode + 3) % numPermsDivisor === 0;
                            let isWriteEntry = (iCode + 2) % numPermsDivisor === 0;
                            let isFullEntry = (iCode + 1) % numPermsDivisor === 0;

                            let entType;
                            if (isFullEntry) {
                                entType = "full";
                            } else if (isReadEntry) {
                                entType = "read";
                            } else if (isWriteEntry) {
                                entType = "write";
                            } else {
                                entType = false;
                            }

                            /* read access control linking */

                            // When read button disabled, disable write
                            if (isReadEntry && val === false) {
                                eTsListObj[iCode + 1].reset(false);
                                updTsVal(false, iCode + 1);

                                // When read button disabled, disable full
                                eTsListObj[iCode + 2].reset(false);
                                updTsVal(false, iCode + 2);
                            }

                            /* write access control linking */

                            // When write button enabled, enable read
                            if (isWriteEntry && val === true) {
                                eTsListObj[iCode - 1].reset(true);
                                updTsVal(true, iCode - 1);
                            }

                            // When write button disabled, disable full
                            if (isWriteEntry && val === false) {
                                eTsListObj[iCode + 1].reset(false);
                                updTsVal(false, iCode + 1);
                            }

                            /* permissions/owner editing control linking */

                            // When full button enabled, enable read
                            if (isFullEntry && val === true) {
                                eTsListObj[iCode - 2].reset(true);
                                updTsVal(true, iCode - 2);

                                // When full button enabled, enable write
                                eTsListObj[iCode - 1].reset(true);
                                updTsVal(true, iCode - 1);
                            }

                            // trigger option changed conditions
                            if (isSuper) m_recursOpts.unlock();
                            editPermDialog.enableButton('save');
                            permChanged = true;

                            // update quick perm view block
                            updQkPerms(iCode, entType);
                        }
                    });
                }

                lCounter++;
            }

            $(`#ePermList_${ugElement.id}`).hide();
        }
    }

    function updQkPerms(iCode, entType, forceVal = null) {
        // # --------------------------- #
        // # Set quick-permission values #
        // # --------------------------- #

        let fadeSpeed = (settings.disableAnimations) ? 0 : 250;
        let ugId = eTsListObj[iCode].getDataId().userGroup;
        let bubTarg = $('#qkPerm_' + ugId);

        if (multi && $(`#unmodMsg_${ugId}`).css("display") !== "none") {
            $(`#unmodMsg_${ugId}`).hide();
            bubTarg.children().show();
            bubTarg.children('.rAccess').addClass("bubDisabled");
            bubTarg.children('.wAccess').addClass("bubDisabled");
            bubTarg.children('.aAccess').addClass("bubDisabled");
        }

        // used with 'enable all' and 'disable all' buttons
        if (forceVal !== null) {
            if (forceVal) {
                // enable all
                bubTarg.children('.rAccess').removeClass("bubDisabled");
                bubTarg.children('.wAccess').removeClass("bubDisabled");
                bubTarg.children('.aAccess').removeClass("bubDisabled");


                // });
            } else {
                // disable all
                bubTarg.children('.rAccess').addClass("bubDisabled");
                bubTarg.children('.wAccess').addClass("bubDisabled");
                bubTarg.children('.aAccess').addClass("bubDisabled");

            }

            // wait for animations to finish before setting new row titles
            setTimeout(() => {
                ugTitleSet(false, ugId);
            }, (fadeSpeed * 2));

            return;
        }

        if (entType === 'read') {

            if (!bubTarg.children('.rAccess').hasClass("bubDisabled")) {
                bubTarg.children('.rAccess').addClass("bubDisabled");
                bubTarg.children('.wAccess').addClass("bubDisabled");
                bubTarg.children('.aAccess').addClass("bubDisabled");
            } else {
                bubTarg.children('.rAccess').removeClass("bubDisabled");
            }
        }

        if (entType === 'write') {
            if (!bubTarg.children('.wAccess').hasClass("bubDisabled")) {
                bubTarg.children('.wAccess').addClass("bubDisabled");
                bubTarg.children('.aAccess').addClass("bubDisabled");
            } else {
                bubTarg.children('.wAccess').removeClass("bubDisabled");
                bubTarg.children('.rAccess').removeClass("bubDisabled");
            }
        }

        if (entType === 'full') {
            if (!bubTarg.children('.aAccess').hasClass("bubDisabled")) {
                bubTarg.children('.aAccess').addClass("bubDisabled");
            } else {
                bubTarg.children('.aAccess').removeClass("bubDisabled");
                bubTarg.children('.wAccess').removeClass("bubDisabled");
                bubTarg.children('.rAccess').removeClass("bubDisabled");
            }
        }

        // wait for animations to finish before setting new row titles
        setTimeout(() => {
            ugTitleSet(false, ugId);
        }, (fadeSpeed * 2));
    }

    // handler for when a permission usergroup is selected

    function onUgPermChange(gData) {

        // inheritance warning message toggle
        (!ihLocalState) ? $('#inh_warning').hide() : $('#inh_warning').show();
        (!ihLocalState) ? $('#perm_reucurs_check').show() : $('#perm_reucurs_check').hide();

        if (permMultiSel) $('#inh_warning').hide();

        // set browser object to usergroup permission list box
        mode = 'eUgSelList';

        // unhide permission data detail box
        $('.pData').show();

        // hide all permission list boxes then selectively show the one that was selected
        $('[id^=ePermList_][class=jsSelectList]').hide();
        $('#ePermList_' + gData.id).show();

        // permission bubble & selection arrow handling

        $('.bubArrow').remove();
        $(`#qkPerm_${gData.id}`).append(`<span class="bubBtn bubArrow">&#9654;</span>`);

        let gid = gData.id;

        perms_startAjax("glFetchUsers", { location: loc.folder, groupId: gid }).then((res) => {

            // select list init and population
            $('#ulHolder, #mFilter').remove();
            $('#pMiddleBlock').append("<div id='ulHolder' ></div>");

            const ugList_sel = new jsSelectList("#ulHolder", "ulb_id", {});
            ugList_sel.disable();

            for (const [idx, val] of res.ugUserList.entries()) {
                ugList_sel.addItems([{ id: String(idx), name: val }]);
            }

            // quick filter init
            // $('#ulHolder').before(/* html */`<input id='mFilter'  placeholder='${UILANG.m("Filter users")}' />`)

            $('#usr_label').html(/* html */`${UILANG.m("Users in selected group")}`);
            $('#u_btn_area').html(/* html */`   <input id='mFilter'  placeholder='${UILANG.m("Filter users")}' />`);

            $('#mFilter').off('input');
            $('#mFilter').on('input', function() {
                let usl = $("#ulb_id li");

                usl.each(function(_i, v) {

                    let haystack = v.innerText;
                    let needle = $('#mFilter').val();

                    (haystack.includes(needle)) ? $(this).show() : $(this).hide();
                });
            });
        });
        // });
    }

    $('#p_btn_area').html('');
    let enAllObj = new nxButton($('#p_btn_area'), 'enAllBtn', {
        // label: UILANG.m("Enable All"),
        value: true,
        icon: '../images/ic_acceptAllSwitches.png',
        iconWidth: 23,
        style: {
            'margin-top': '25px'
        },
        callback: function() {
            allGrpPermToggle(true);
        }
    });

    let disAllObj = new nxButton($('#p_btn_area'), 'disAllBtn', {
        // label: UILANG.m("Disable All"),
        // tooltip: "Disable all Permissions for Group",
        value: true,
        style: {},
        icon: '../images/ic_rejectAllSwitches.png',
        iconWidth: 23,
        callback: function() {
            allGrpPermToggle(false);
        }
    });

    function allGrpPermToggle(val) {
        let lastKey;
        for (const key in eTsListObj) {
            if (eTsListObj.hasOwnProperty(key)) {
                const element = eTsListObj[key];
                // if our usergroup id matches the selected id, switch all toggle buttons
                if (element.getDataId().userGroup === eUgSelList.getSelection().id) {
                    element.getPropertyField().setSwitch(val);
                    element.setDataId({
                        edited: true,
                        permKeyName: element.getDataId().permKeyName,
                        permVal: val,
                        userGroup: element.getDataId().userGroup
                    });
                    lastKey = key; // this links to the 'full' access type, which is essentially what we're switching on
                } // end if
            }
        } // end for loop
        // enable our save button, and make edit state dirty
        if (isSuper) m_recursOpts.unlock();
        editPermDialog.enableButton('save');
        permChanged = true;

        updQkPerms(lastKey, 'full', val); // update the quick perm access view
    } // end perm toggle function

    // control enable/disable all perm btns based on condition inheritance
    if (multi) return;
    if (ihLocalState) {
        enAllObj.disable();
        disAllObj.disable();

        for (const key in eTsListObj) { //start loop
            const element = eTsListObj[key];
            element.lock();
        }
    } else {
        enAllObj.enable();
        disAllObj.enable();

        for (const key in eTsListObj) { //start loop
            const element = eTsListObj[key];
            element.unlock();
        }
    }
}

//parse a single JSON string with fallback on empty object if null and exception handling
//if an unparsable string is found, it will be replaced with an empty object, and the erroneous will be logged in the key parserError
function jsonDecode(s, type, id, key, template) {
    if (typeof (template) === 'undefined') {
        //the template defines what an empty variable should be initialized with, default is a new object
        template = {};
    }
    if (s) {
        try {
            s = JSON.parse(s);
        } catch (e) {
            // showMessage('Error parsing JSON string! Please inform your administrator!');
            const d = new Date();
            parseErrors.push(`[${d.toString()}] parse error in ${type} ${id} ${key}: ${s} (${e})`);
            s = deepCopy(template);
        }
    } else {
        s = deepCopy(template);
    }
    return s;
}

/**
 * Return call for permission fetch
 *
 * @param {object} res
 * @param {string} _srcName Not currently being used, but could potentially later
 */
function igp_return(res, _srcName) {

    // if user access definition(s) exist, call the permission builder routine
    if (res.data.ig_targets.length !== 0) {

        // unhide our edit perm dialog box now that we're fetching pages
        $('#EPD').show();

        // bulk editing warning message handling
        $('#b_cl_warn, #perm_warn_msg').on('click', () => {
            if (settings.disableAnimations) {
                $('#perm_warn_msg').fadeOut(0);
            } else {
                $('#perm_warn_msg').animate({
                    height: '0px',
                    margin: '0px',
                    padding: '0px',
                    opacity: '0'
                }, 250, null, function() { $(this).hide() });
            }
        });

        // check and set inheritance activation value
        permMultiSel = res.data.isMulti;
        ihServerState = res.data.ihActive;
        if (ihLocalState === null) ihLocalState = ihServerState;

        // do not force inheritance flag when multisel (it stays dormant until selection is actively made)

        if (!permMultiSel) {
            if (ihLocalState) {
                m_opts['m_opt_inh_enabled'] = true;
                m_opts['m_opt_inh_disabled'] = false;
            } else {
                m_opts['m_opt_inh_enabled'] = false;
                m_opts['m_opt_inh_disabled'] = true;
            }
        }

        switch (isSuper) {
            case true:

                if (permFldParent === 1) {
                    $('#multi_footer_opts').prepend(/* html */ `
                        <div class='permsDialogWarningMessage'>${UILANG.m("Subfolders directly under Home folder do not have any permissions to inherit.")}<br>
                        ${UILANG.m("Selecting an inheritance option here will only apply to subfolders after the \"recursive\" checkbox is enabled, and an inheritance option is selected.")}<br></div>
                    `);

                    m_inheritOpts.lock();

                    $('#permLabel').html(`${UILANG.m("PERMISSIONS")} (${UILANG.m("INHERITANCE NOT APPLICABLE")})`);

                } else {
                    if (permMultiSel) {
                        $('#permLabel').html(`${UILANG.m("PERMISSIONS")} (${UILANG.m("INHERITANCE NOT APPLICABLE")})`);
                    } else {
                        do_ih_labeling(true);
                    }
                }

                break;

            case false:
                let edsnip = (ihLocalState) ? UILANG.m("DISABLE") : UILANG.m("ENABLE");
                iBtnObj.setLabel(`<strong>${edsnip}</strong> ` + UILANG.m('Inheritance of Parent Permissions'));
                do_ih_labeling();

                break;
        }

        function do_ih_labeling(supermode = false) {
            if (supermode) ihLocalState ? m_inheritOpts.reset('m_opt_inh_enabled') : m_inheritOpts.reset('m_opt_inh_disabled');
            let inVal = (ihLocalState) ? UILANG.m("INHERITANCE ENABLED") : UILANG.m("INHERITANCE DISABLED");
            $('#permLabel').html(`${UILANG.m("PERMISSIONS")} (${inVal})`);
        }

        // direct function based on multiedit or not
        displayPerms(res.data.loadGroup, res.data.ig_targets, { oId: res.data.ownerId, oList: res.data.ownerList }, res.data.ugList, res.data.isMulti, res.data.permStruct);
    }
    // otherwise, show label indicating there are no user entries for this ig
    else {
        editPermDialog.dismiss();
        new nxDialog('noPerms', {
            title: "No permissions",
            contents: "<p>" + UILANG.m("No permission entries were found for this folder.") + "<br><br><strong>" + UILANG.m("This is perfectly normal if there are no user groups defined in the Oasys instance! As an admin or superadmin, you have full rights to this folder.") + "</strong></p>",
            buttons: [{
                value: "ok",
                label: "OK",
                'default': true
            }]
        });
    }
}

function up_return(_res, _srcName) {
    gui.statusBar.setStatus(UILANG.m("Permission data successfully updated!"), 3000, '#0A0');

    perms_startAjax('fetchLibrary', {
        location: loc.folder,
        showBlocked: showBlocked
    });

}

async function perms_startAjax(action, data) {
    waitDialog.show();
    const params = {
        action: action,
        data: JSON.stringify(data)
    };
    return $.ajax({
        data: params
    })
}