class Scoring {

    constructor() {
        this.qTable = null;
        this.listData = null;
        this.viewType = null;
        this.tooFast = false;
        this.pageSelectionData = {};
        this.pageId = null;
        this.itemName = null;
        this.answerSet = null;
        this.isMultiItem = null;
        this.origScore = null;
        this.newScore = null;
        this.pHtml = null;
        this.qXtraInfo = null;
        this.readOnly = false;
        this.msOnly = true;
        this.t1 = null;
        this.noSel = false;
        this.alreadyInRO = null;
        this.sc_type = null; // scoring type (auto|man) for the loaded question
        this.cmBase = {};
        this.langSels = [];
        this.testLang = null;
        this.blockFS = false;
    }

    async getPDD() {
        return await results_startAjax('fetchQADetail', {
            passwordId: this.pageSelectionData.passwordId,
            testId: this.pageSelectionData.testId,
            pageId: parseInt(this.pageSelectionData.pageId),
            pageName: this.pageSelectionData.pageName
        });
    }

    /**
     * Register or unregister up, down, j, and k keyboard handlers for navigation.
     */
    ms_kbreg(register = true, pdd) {
        if (register) {
            let s_self = this;
            $(document).off();
            $(document).on("keydown", function(e) {

                // handle question item navigation & misc shortcuts only if not in middle of scoring
                if (!window.stopNAV) {

                    // comment textarea focus
                    if (e.originalEvent.code === "KeyC" && e.originalEvent.altKey) {
                        $('#scoringCmt').trigger("focus");
                        e.preventDefault();
                        e.stopPropagation();
                    }

                    // no navigation while in comment box
                    if ($("#scoringCmt").is(":focus") === false) {

                        // navigate sections next/prev
                        if (e.originalEvent.code === "KeyP" && e.originalEvent.altKey && buttons.prevTT.isActive()) ms_scoreDetailScreen(prev_tt_entry, s_self.qTable.getSelection().id);
                        if (e.originalEvent.code === "KeyN" && e.originalEvent.altKey && buttons.nextTT.isActive()) ms_scoreDetailScreen(next_tt_entry, s_self.qTable.getSelection().id);

                        // navigate entries up/down
                        if (e.originalEvent.key === "ArrowUp") {
                            scoring.navDir = "up";
                            s_self.qTable.moveUp();
                        }
                        if (e.originalEvent.key === "ArrowDown") {
                            scoring.navDir = "down";
                            s_self.qTable.moveDown();
                        }

                        // navigate question items left/right
                        if (e.originalEvent.key === "ArrowRight" && e.originalEvent.shiftKey) {
                            e.preventDefault();
                            s_self.item_switch(pdd, 'right');
                        }
                        if (e.originalEvent.key === "ArrowLeft" && e.originalEvent.shiftKey) {
                            e.preventDefault();
                            s_self.item_switch(pdd, 'left');
                        }
                    }

                    if (e.target.id.startsWith("t_ms_score_slider")) {
                        if (/[\d,.]/u.test(e.originalEvent.key) === false) {
                            $(e).trigger("select");
                            return false;
                        }
                    }
                }
            });
        } else {
            $(document).off();
        }

        // always re-init native context menu disabling
        $(document).on("contextmenu", function(e) {
            e.preventDefault();
            return false;
        });
    }

    /**
     * Reset/initialize 'reset corrections' button and logic
     */
    reCorsInit(listData, i_data) {
        /* reset ALL correction reset requirements */
        $('#bRAC').off(); // ensure all handlers are cleared since we are initalizing this button on each test list (depth 3) call
        $('#bRAC').remove(); // remove previously initialized button2 for correction reset dialog
        $('#vd_ms3').remove(); // remove previously manually implemented divider

        // initialize all correction button2
        insertVerticalDivider('header', 'vd_ms3');

        buttons.resetAllCors = new jsButton2($('header'), 'bRAC', {
            label: UILANG.m("Reset Scoring"),
            icon: "../images/toolbarIcons/ic_tb_TT_reset.png",
            iconWidth: 48,
            width: 80,
            height: 100,
            callback: () => {

                let testId = scoring.pageSelectionData.testId;
                let pId = (scoring.viewType === "t") ? listData.userInfo.passwordId : scoring.pageSelectionData.passwordId;
                let lId = (scoring.viewType === "t") ? scoring.listData.userInfo.loginName : scoring.pageSelectionData.loginName;

                const rc_diag = new nxDialog('RC_confirm', {
                    title: UILANG.m("Reset Scoring"),
                    width: 550,
                    buttons: [{
                        value: 'ok',
                        label: UILANG.m("OK"),
                        disabled: true
                    }, {
                        value: "close",
                        label: UILANG.m("Cancel"),
                        'cancel': true,
                        'default': true
                    }],
                    dataFormat: "object",
                    datafields: ['testId', 'pId'],
                    values: { testId: testId, pId: pId, lId: lId },
                    contents: /* html */ `
                            <h4 class="ms_reset_headerTxt">${UILANG.m("RESET SCORES FOR TEST TAKER / PASSWORD")}:</h4>
                            <h4 class="ms_reset_headerTxt" style="color: rgb(33, 126, 170)">${lId} / ${pId} </h4>

                            <p>${UILANG.m("A scoring reset will revert all manually corrected items back to their original unscored state for this test taker and password.")}\
                                <br><br><span style='font-weight: bold; font-size: smaller; color: red;'>${UILANG.m("* Please note that this will also remove all comments from all items!")}</span></p>

                            <p>
                                <div><input type='checkbox' name='rc_type' id='rc_conf' value='rc_conf'><label for="rc_conf">&nbsp;${UILANG.m("I confirm")}</label></div>
                            </p>

                            <input type='hidden' id='testId' value=${testId}>
                            <input type='hidden' id='pId' value=${pId}>
                        `,
                    callback: (button, data) => {
                        if (button === 'ok') {

                            let testIdSend = scoring.pageSelectionData.testId;
                            let pIdSend = (scoring.viewType === 't') ? listData.userInfo.passwordId : scoring.pageSelectionData.passwordId;

                            data.testId = testIdSend;
                            data.pId = pIdSend;
                            data.conf = document.getElementById("rc_conf").checked;
                            results_startAjax('resetAllCorrections', data).then(
                                (res) => {
                                    scoring.viewType === 't' ? pg_left[this.pageSelectionData.passwordId] = res.msLeft : pg_left[this.pageSelectionData.pageId] = res.msLeft;
                                    ms_scoreDetailScreen(i_data, false, true);
                                });
                        }
                    }
                });

                $('[name="rc_type"]').off();
                $('[name="rc_type"]').on('click', function() {
                    (this.checked === true) ? rc_diag.enableButton('ok') : rc_diag.disableButton('ok');
                });

            }
        });

        if (!(buttons.resetAllCors in msDetailView)) msDetailView.push(buttons.resetAllCors);
    }

    static prvLaunch(pageId, lang) {
        const pForm = document.forms['previewForm'];
        pForm.action.value = 'preview';
        let data;
        data = {
            previewMode: 'item',
            itemId: pageId,
            language: lang
        };
        pForm.data.value = JSON.stringify(data);
        pForm.submit();
    }

    prevBtnInit() {
        $('#bPRE').off(); // ensure all handlers are cleared since we are initalizing this button on each test list (depth 3) call
        $('#bPRE').remove(); // remove previously initialized button2 for correction reset dialog

        buttons.prevBtnLaunch = new jsButton2($('header'), 'bPRE', {
            label: UILANG.m("Preview Test Page"),
            icon: "../images/toolbarIcons/ic_tb_preview.png",
            iconWidth: 48,
            width: 80,
            height: 100,
            callback: () => Scoring.prvLaunch(scoring.pageId, settings.interfaceLanguage)
        });

        if (!(buttons.prevBtnLaunch in msDetailView)) msDetailView.push(buttons.prevBtnLaunch);
    }

    kbShortsInit() {
        $('#bKbShortcuts').off(); // ensure all handlers are cleared since we are initalizing this button on each test list (depth 3) call
        $('#bKbShortcuts').remove(); // remove previously initialized button2 for correction reset dialog
        $('#bSwichTestLang').off(); // ensure all handlers are cleared since we are initalizing this button on each test list (depth 3) call
        $('#bSwichTestLang').remove(); // remove previously initialized button2 for correction reset dialog

        //Keyboard Shortcuts button
        buttons.keyboardShortcuts = new jsButton2($('header'), 'bKbShortcuts', {
            label: UILANG.m('Keyboard shortcuts'),
            icon: '../images/toolbarIcons/ic_tb_keyboardShortcuts.png',
            iconWidth: 48,
            width: 80,
            height: 100,
            callback: this.kbPopup,
            disabled: false
        });

        if (!(buttons.keyboardShortcuts in msDetailView)) msDetailView.push(buttons.keyboardShortcuts);
    }

    chLangBtnInit(i_data) {
        buttons.switchTestLang = new jsButton2($('header'), 'bSwichTestLang', {
            label: UILANG.m('Change test language'),
            icon: '../images/toolbarIcons/ic_tb_switchTestLang.png',
            iconWidth: 48,
            width: 80,
            height: 100,
            callback: function() { scoring.initLangBox(i_data) },
            disabled: false
        });
        if (!(buttons.switchTestLang in msDetailView)) msDetailView.push(buttons.switchTestLang);

    }


    /**
     * Disable/enable scoring radio buttons.
     */
    scoringButtonsDisable(val) {

        $("[id^='t_ms_score_slider_']").attr("disabled", ((val) ? "disabled" : null));
        if ($("[id^='ms_score_slider_']").length > 0) $("[id^='ms_score_slider_']").slider((val ? "disable" : "enable"));
    }

    /**
     * Make a percentage value look nice.
     * @returns string
     */
    static nicePercent(val, precision = 2) {
        if (typeof val !== "number") val = parseFloat(val);
        return (val * 100).toFixed(precision) + "%";
    }

    kbp_attach() {
        $('#ms_kbh_label').on('click', () => this.kbPopup()); // attach handler to keyboard icon for kb help popup}
    }

    /**
     * Pops up scoring view keyboard helper page.
     */
    kbPopup() {
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

    /**
     * Build scoring assignment block UI.
     */
    buildScoringOptsUI(pdd) {

        for (const item of pdd.items) {
            const hexedItem = this.str2hex(item);
            const ms_slId = `ms_score_slider_${hexedItem}`;

            $('#text_input_scoreContainer').append( /* html */ `<input data-sllink="t_${hexedItem}" id="t_${ms_slId}" type="text" tabindex=1>`);
            $(`#t_${ms_slId}`).after( /* html */ `<div data-sllink="m_${hexedItem}" id="m_${ms_slId}">MAX: ${pdd.assignmentStruct[item].posPts}</div>`);
            $('#scoreKeyInner').append( /* html */ `<div data-sllink="${hexedItem}" id="${ms_slId}"></div>`);

            let theMax = pdd.assignmentStruct[item].posPts;
            if (pdd.scoredByInfo[item].scoreValue > pdd.assignmentStruct[item].posPts) {
                theMax = pdd.scoredByInfo[item].scoreValue;
            }

            // init and define slider & custom labels
            $(`#${ms_slId}`).slider({
                step: 0.5,
                min: 0,
                max: theMax,
                value: pdd.scoredByInfo[item].scoreValue,
                animate: (settings.disableAnimations) ? null : "fast",
            }).each(function() {
                let opt = $(this).data().uiSlider.options;
                let rangeVal = opt.max - opt.min;
                let incrVal = ((rangeVal % 1) === 0.5) ? 0.5 : 1;

                for (let i = 0; i <= rangeVal; i = i + incrVal) {
                    let el = $('<label class="ui-slider-label">' + (i) + '</label>').css('left', (i / rangeVal * 100) + '%');
                    $(`#${ms_slId}`).append(el);
                }
            });

            // UI updates for beyond max condition
            if (pdd.scoredByInfo[item].scoreValue > pdd.assignmentStruct[item].posPts) {
                const hexItemName = this.str2hex(item);
                $(`#m_ms_score_slider_${hexItemName}`).html("MAX: " + pdd.assignmentStruct[item].posPts + " <em>" + UILANG.m("max score overridden!") + "</em>");
                $(`#t_ms_score_slider_${hexItemName}`).css({ 'background-color': '#aa2121', 'color': '#ffffff' });
                $(`#ms_score_slider_${hexItemName}`).css('background-color', 'rgba(170, 33, 33, 0.5) !important');
                $(`#ms_score_slider_${hexItemName} > .ui-slider-handle`).css('background-color', 'rgb(170, 33, 33)');
            }

            $(`#${ms_slId}, .ui-slider-handle`).off("keydown keyup");

            // set initial textfield value
            $(`#t_${ms_slId}`).val($(`#${ms_slId}`).slider("option", "value"));

            let s_self = this; // for accessing scoring class used inside event handler

            $(`#t_${ms_slId}`).off("keydown keyup");

            $(`#t_${ms_slId}`).on("keyup", function(e) {

                // convert commas to decimal points for German/French/etc. scorers who prefer this separator
                this.value = this.value.replaceAll(",", ".");

                /* prevent double navigation when focus was from the outside */
                if (document.fullscreenElement && (document.fullscreenElement.id === "ms_questionArea" || document.fullscreenElement.id === "ms_answerArea")) {
                    $(this).trigger("select");
                    return;
                }

                const isGoodInp = (!(e.originalEvent.code.endsWith("Enter"))) && ((e.originalEvent.code.startsWith("Digit")) || (e.originalEvent.key === ".") || (e.originalEvent.key === ",") || (e.originalEvent.code.startsWith("Numpad")));
                const isLeft = e.originalEvent.key === "ArrowLeft";
                const isRight = e.originalEvent.key === "ArrowRight";
                const isRemove = ["Backspace", "Delete"].includes(e.originalEvent.key);
                const isShift = e.originalEvent.shiftKey || e.originalEvent.key === "Shift";
                const isCtrl = e.originalEvent.ctrlKey || e.originalEvent.key === "Ctrl" || e.originalEvent.key === "Control";
                const isAlt = e.originalEvent.altKey || e.originalEvent.key === "Alt";
                const isOS = e.originalEvent.getModifierState("OS") || e.originalEvent.key === "OS" || e.originalEvent.code === "OSLeft" || e.originalEvent.code === "OSRight" || e.originalEvent.metaKey;
                const isEnter = (e.originalEvent.code === "NumpadEnter" || e.originalEvent.code === "Enter");
                const startEmpty = (this.value === "");

                // # -------------------------------------- #

                if (window.stopNAV && !isEnter) return;

                e.preventDefault();
                e.stopPropagation();

                const origPtVal = $(`#${ms_slId}`).slider("option", "value");

                /* 
                    FYI: Because of a FF bug, the Windows key is not capturable in combination with another key, so WIN+RIGHT/WIN+LEFT increments/decrements the score, and WIN+# to shortcut navigate into the FF app.
                    Works fine in Chrome, not tested in Safari/etc.
                    
                    https://bugzilla.mozilla.org/show_bug.cgi?id=1232918
                 */

                // validation routine to ensure value is within bounds
                function ptValCheck(t2) {
                    if (isNaN(t2.value) && t2.value !== '') {
                        t2.value = origPtVal;
                        $(t2).trigger("select");
                        return false;
                    }

                    if (parseFloat(t2.value) > 50) {
                        t2.value = 50;
                        $(t2).trigger("select");
                        if (isRight) return false;
                    }

                    if (parseFloat(t2.value) < 0) {
                        t2.value = 0;
                        $(t2).trigger("select");
                        if (isLeft) return false;
                    }

                    return true;
                }

                // handle point change request whether by direct digit assignment or left/right keys

                if (isRight && !isShift) {
                    this.value = (this.value === "") ? "0.5" : parseFloat(this.value) + 0.5;
                }

                if (isLeft && !isShift) {
                    this.value = (this.value === "") ? 0 : parseFloat(this.value) - 0.5;
                }

                // check for valid numerical scorable value
                if (ptValCheck(this) === false) return;

                if (!isGoodInp && !isLeft && !isRight && !isEnter && !isRemove || (isShift || isCtrl || isAlt || isOS)) {
                    if (isOS && /windows/.test(window.navigator.userAgent.toLowerCase())) {
                        window.stopNAV = true;
                        setTimeout(() => {
                            window.stopNAV = false;
                        }, 1100);
                    }
                    return;
                }

                if (isRemove || isGoodInp || isEnter || isLeft || isRight) clearTimeout(s_self.t1);

                // revert score to a valid slider value if outside bounds of acceptable values
                if (!isGoodInp && !isLeft && !isRight && !isRemove && !isEnter && !startEmpty) this.value = origPtVal;

                // assign the updated point value to var
                let pointVal = this.value;

                /* if a valid scoring value, then stop kb nav, and put in timeout to check for proceeding keys, otherwise score immediately */
                if (isRemove || isGoodInp || (isLeft) || isRight) window.stopNAV = true;

                if (isRemove || isGoodInp) {
                    /* waiting for preceeding keys */
                    s_self.t1 = setTimeout(() => {
                        // check for valid numerical scorable value
                        if (ptValCheck(this) === false) return;
                        this.value = this.value.replaceAll(",", "."); // have to separately run comma converted on wait delay
                        this.value = pointVal = (Math.round(this.value * 2) / 2);
                        $(`#${ms_slId}`).slider("value", pointVal);
                        $(this).trigger("select");
                        window.stopNAV = false;
                    }, 1000);
                } else {
                    /* immediate action */
                    this.value = pointVal = (Math.round(this.value * 2) / 2);
                    $(`#${ms_slId}`).slider("value", pointVal);
                    $(this).trigger("select");
                }
            });

            // set the slider handle title value
            $(`#${ms_slId} > span`).html(`<span class="ms_sliderBar">${pdd.scoredByInfo[item].scoreValue}</span>`);

            // set the title metainfo on the text input field
            s_self.setItemTitle(item, pdd.scoredByInfo[item]);

            $('#inav_left').remove();
            $('#inav_right').remove();


            $('#isub_arrows').prepend(`<span class="ms_inav_btn" id="inav_left">&#9664;</span>`);
            $('#isub_arrows').append(`<span class="ms_inav_btn" id="inav_right">&#9654;</span>`);

            /* KB NAVIGATION REGISTRATION LOGIC FOR MULTI/SINGLE QUESTION PAGES */
            if (this.isMultiItem && (pdd.items.indexOf(item) > 0)) {
                $(`#${ms_slId}`).hide(); // hide sliders
                $(`#m_${ms_slId}`).hide(); // hide max val box
                $(`#t_${ms_slId}`).hide(); // hide bound text inputs

                $('#inav_left').on('click', () => this.item_switch(pdd, 'left'));
                $('#inav_right').on('click', () => this.item_switch(pdd, 'right'));
            } else {
                // deregister possibly previously set left/right kb handlers when single mode
                kbHandler.registerShortcut("shift+right", () => "");
                kbHandler.registerShortcut("shift+left", () => "");
            }

        }

    }

    /**
     * All relevant tasks for switching question items within test page.
     * @returns {void}
     */
    item_switch(pdd, direction, directAssign = false, item = "") {

        // extra info box state (now sticky)
        if (showInfoState === true) {
            $('#qSummaryStats').show();
        } else {
            $('#qSummaryStats').hide();
        }

        this.pageSelectionData = pdd;

        // special UI redraw when animations are enabled and there's a race condition to get proper width of question area container, and other timing-based requirements
        function doRedraw(thisObj, rc) {
            if (rc === 100) alert(UILANG.m("Too many recursions in redraw routine. Please contact Oasys development team."));
            $('.ms_q_item').remove();
            thisObj.pHtml = "";
            setTimeout(() => {
                $(".ms_corKey, .ms_corKeyBlock").empty();
                thisObj.htmlPreview(pdd);
                $('#ms_questionArea').append(thisObj.pHtml);
            }, 100);

            setTimeout(() => {
                thisObj.hideItemBlock();
                thisObj.showItemBlock();
                rc++;
                if (!settings.disableAnimations && $('#ms_page').offset().top === 0) doRedraw(thisObj, rc);
            }, 100);
        }

        if (!settings.disableAnimations && $('#ms_page').offset().top === 0) doRedraw(this, 0);

        // switch kb scoring target to the sent in item value

        let items = pdd.items;
        if (items.length === 0 && scoring.viewType === "t") scoring.qTable.removeItems([scoring.pageId]);
        if (items.length === 0 && scoring.viewType === "q") this.noPagesMsg();

        if (window.stopNAV) return;

        if (directAssign) {
            $(`[data-group="optset_${item}"]`).each(function(i, e) {
                kbHandler.registerShortcut(String(i), function() {
                    $(`#${e.firstElementChild.id}`).trigger('click');
                });
            });

            return;
        }

        let s_self = this; // since we're looping using jq, have to set original Scoring 'this' externally
        $("[id^='t_ms_score_slider_']").each(function(_i, sliderItem) {

            if ($(sliderItem).css('display') !== 'none') {

                // never allow direct non-selected condition on text score input
                $(this).on('mouseup mousedown click', () => $("#" + sliderItem.id).trigger('select'));

                $("[id^='ms_score_slider_'], [id^='t_ms_score_slider_'], [id^='m_ms_score_slider_']").hide();

                /* determine next index value to load */
                let nextIdx = null;
                switch (direction) {
                    case "left":
                        // the next index value is reset if at end of list, otherwise, the next decremented value
                        nextIdx = items.indexOf(s_self.hex2str(sliderItem.dataset.sllink.substring(2)));
                        nextIdx = (nextIdx === 0) ? items.length - 1 : nextIdx - 1;

                        break;

                    case "right":
                        // the next index value is reset if at end of list, otherwise, the next incremented value
                        nextIdx = items.indexOf(s_self.hex2str(sliderItem.dataset.sllink.substring(2)));
                        nextIdx = (nextIdx > items.length - 2) ? 0 : nextIdx + 1;

                        break;

                    case "clicked":

                        nextIdx = (item === "") ? 0 : items.indexOf(item);
                        break;

                    default:
                        break;
                }

                /* advanced interaction UI handling */

                s_self.blockFS = false;
                let itTimeout;
                switch (pdd.htmlPreview[nextIdx].type) {

                    case "inline_gaps":
                    case "inline_textfields":

                        // inline textfield entry highlight

                        function doItDraw() {

                            /* recurse if elements not fully drawn due to animation delay */
                            let inlineTagTypeStr = pdd.htmlPreview[nextIdx].type === "inline_textfields" ? "inlineText" : "inlineGap";

                            if (typeof $(".previewTag_" + inlineTagTypeStr + ":visible").html() === "undefined") {
                                itTimeout = setTimeout(() => {
                                    clearTimeout(itTimeout);
                                    doItDraw();
                                }, 50);
                            } else {

                                /* add/remove highlighting logic, deliniated by either inline textfield or inline gap */

                                item = items[nextIdx];
                                let subIdx = item.match(/\d*$/g)[0];
                                if (pdd.htmlPreview[nextIdx].type === "inline_textfields") {
                                    $(".previewTag_inlineText").removeClass("ms_itxt_active").addClass("ms_itxt_inactive");
                                    $(Object.values($("#" + "q_item_" + scoring.str2hex(item) + " span[class^='previewTag_']"))[subIdx - 1]).parent().addClass("ms_itxt_active").removeClass("ms_itxt_inactive");
                                } else if (pdd.htmlPreview[nextIdx].type === "inline_gaps") {
                                    $(".previewTag_inlineGap").removeClass("ms_igap_active").addClass("ms_igap_inactive");
                                    $(Object.values($("#" + "q_item_" + scoring.str2hex(item) + " span[class^='previewTag_']"))[subIdx - 1]).addClass("ms_igap_active").removeClass("ms_igap_inactive");

                                }
                            }
                        }

                        doItDraw();

                        break;

                    case "choicematrix":

                        // choice matrix entry highlight

                        (function doCmDraw() {

                            // recurse if elements not fully drawn due to animation delay

                            if ($(`[data-group="${pdd.htmlPreview[nextIdx].cmtx_row}"]`).parent().length === 0) {
                                setTimeout(() => {
                                    doCmDraw();
                                }, 50);
                            }

                            $('.matrixRow').removeClass('ms_cmtrx_active').addClass("ms_cmtrx_inactive");
                            $(`[data-group="${pdd.htmlPreview[nextIdx].cmtx_row}"]`).parent().removeClass("ms_cmtrx_inactive").addClass("ms_cmtrx_active");
                        })();


                        break;

                    case "advanced":

                        (function doAdvDraw() {

                            // advanced editor color entry highlight
                            let targEl = items[nextIdx];
                            let adTarg = `#q_item_${s_self.str2hex(targEl)}`;

                            // recurse if elements not fully drawn due to animation delay
                            if ($(adTarg).length === 0) { setTimeout(() => { doAdvDraw() }, 50); }

                            let qItemTarg = $(`[data-id="${pdd.htmlPreview[nextIdx].id_code}"]`).parent();

                            $('.ms_cmtrx_active').removeClass('ms_cmtrx_active'); // remove all instances of highlighted block everywhere
                            qItemTarg.addClass("ms_cmtrx_active"); // add highlight class to required block

                            setTimeout(function() {

                                if (typeof $(qItemTarg)[1] === "undefined") return; // ignore scroll call when there isn't at least a secondary item in the question block (index item [1])

                                let animSpeed = (settings.disableAnimations) ? 0 : 200;
                                $('#ms_questionArea').animate({
                                    scrollTop: $(".ms_cmtrx_active:visible")[0].offsetTop - 60
                                }, animSpeed);
                            }, 50);
                        })();

                        break;

                    case 'conceptmap':

                        s_self.blockFS = true;
                        cmResObj.data = pdd.scoringInfo[items[nextIdx]].givenAnswers;

                        let cmb_sfx_hex = s_self.str2hex(items[nextIdx]);

                        $(`#q_item_cmb_${cmb_sfx_hex}`).empty();

                        new nxButton($(`#q_item_cmb_${cmb_sfx_hex}`), `lcmorigBtn_${s_self.pageId}_${cmb_sfx_hex}`, {
                            disabled: false,
                            label: UILANG.m("Open Original Concept Map"),
                            callback: () => {
                                let cmHexId = s_self.str2hex(items[nextIdx]);
                                let url = "../apps/conceptmaps/";
                                openExternalEditor({
                                    url: url,
                                    data: JSON.stringify(s_self.cmBase[s_self.pageId][cmHexId])
                                });
                            },
                            value: "ok"
                        });

                        function do_cm_btn_redraw() {
                            $(`[id^="q_item_cmb_"]`).not(document.getElementById(`q_item_cmb_${cmb_sfx_hex}`)).hide();
                            $(`#q_item_cmb_${cmb_sfx_hex}`).show();
                        }

                        let cmdrawrpt = setInterval(function() {

                            if ($(`#q_item_cmb_${cmb_sfx_hex}`).offset().top === 0) {
                                do_cm_btn_redraw();
                            } else {
                                clearInterval(cmdrawrpt);
                            }
                        }, 50);

                        break;

                }

                let itemHex = s_self.str2hex(items[nextIdx]);

                // show the scoring option block for active item; retain full item name (with spaces) since exact data link may be necessary for data post-backs.
                $(`[data-sllink="${itemHex}"], [data-sllink="t_${itemHex}"], [data-sllink="m_${itemHex}"]`).show();

                // force value of text input to actual slider value on question change
                $(`[data-sllink="t_${itemHex}"]`).val($(`[data-sllink="${itemHex}"]`).slider("option", "value"));

                // focus + select on the text input (only when not in read only mode, otherwise force focus on body to allow key event tracking)
                if (!scoring.alreadyInRO) {
                    $(`[data-sllink="t_${itemHex}"]`).trigger("focus").trigger("select");
                } else {
                    $('body').attr("tabindex", "0");
                    $('body').trigger("focus");
                    $('body').attr("tabindex", "-1");
                }

                s_self.itemName = items[nextIdx];

                /* Update scoring block labels */
                $('#s_fullName').html(s_self.itemName);

                // update scoring type label
                s_self.sc_type = pdd.scoringInfo[s_self.itemName].itemScoreType;
                $('#s_scType').html((s_self.sc_type === "manual") ? UILANG.m("manual scoring") : UILANG.m("auto-scored"));

                // show/hide max depending on scoring type
                if (s_self.sc_type === "manual") $(`#m_ms_score_slider_${itemHex}`).css('visibility', '');
                if (s_self.sc_type === "auto") $(`#m_ms_score_slider_${itemHex}`).css('visibility', 'hidden');

                // update point value structure
                if (typeof pdd.scoringInfo[s_self.itemName].pointData !== "undefined") {
                    $("#pointData").empty();
                    $("#pointData").css("visibility", "visible");
                    const ptInfo = pdd.scoringInfo[s_self.itemName].pointData;
                    for (const ptName of Object.keys(ptInfo)) {
                        $("#pointData").append(`<span>${ptName}</span>: <span style="font-weight: bold;">${ptInfo[ptName]}</span>&nbsp;|&nbsp;`);
                    }
                } else {
                    $("#pointData").css("visibility", "hidden");
                }

                // update UI for item navigation section
                $(`[id^="ms_isel_"]`).removeClass('ms_i_selected').addClass('ms_i_not_selected');
                $(`#ms_isel_${itemHex}`).removeClass('ms_i_not_selected').addClass('ms_i_selected');

                // update question title label
                $('#qItemLabel').html(s_self.itemName);
                $('#rItemLabel').html(s_self.itemName);

                // update sumbox values
                $('#ms_sumBox_qName').html(s_self.itemName);

                $('#ms_scoreby').html(pdd.scoredByInfo[s_self.itemName].scoreBy);
                $('#ms_scorebyid').html(pdd.scoredByInfo[s_self.itemName].scoreById);
                $('#ms_scoretime').html(pdd.scoredByInfo[s_self.itemName].scoreTime);
                $('#ms_scoregiven').html(pdd.scoredByInfo[s_self.itemName].scoreValue);

                // determine read only status based on scoring type or test taker completion status, and lock down necessary elements
                s_self.readOnly = s_self.sc_type === "auto" || s_self.alreadyInRO;

                // disable scoring ability
                s_self.scoringButtonsDisable(s_self.readOnly);

                // disable/hide comment box section
                $('#scoringCmt').attr('disabled', s_self.readOnly);

                if (s_self.readOnly) {
                    $('#scoringCmt').attr('disabled', true);
                    $(`#scoringCmt, #seBtn, #ceBtn, #t_ms_score_slider_${itemHex}`).css('cursor', 'not-allowed');
                    $('#ms_commentContainer').css("visibility", "hidden");
                } else {
                    $('#scoringCmt').attr('disabled', false);
                    $(`#scoringCmt, #seBtn, #ceBtn, #t_ms_score_slider_${itemHex}`).css('cursor', 'auto');
                    $('#ms_commentContainer').css("visibility", "visible");
                }

                // update summary box with partial updates on item switch
                s_self.updateSbPartials(false);

                // hide/unhide applicable item set
                s_self.hideItemBlock();
                s_self.showItemBlock();

                (pdd.comments[scoring.itemName]) ? s_self.cmt_remEntry.enable() : s_self.cmt_remEntry.disable();

                // fill comment box with comment when applicable
                if (pdd.comments[scoring.itemName]) {
                    $('#scoringCmt').val(pdd.comments[scoring.itemName].commentString);
                } else {
                    $('#scoringCmt').val('');
                }

                // hide slider scorer for auto scored items
                if (s_self.sc_type === "auto") {
                    $(`#ms_score_slider_${itemHex}`).hide();
                }

                // when in read only mode, skip the entire scoring box selection operation
                if (s_self.alreadyInRO) return false;

                // empty out input box for unscored manual correction items -- interval re-tries for animation delay conditions -- select input box in all instances
                if (document.activeElement.id !== "" && !document.activeElement.id.startsWith("t_ms_score")) {
                    let selIV = setInterval(() => {
                        if (document.activeElement.id.startsWith("t_ms_score")) clearInterval(selIV);
                        if (s_self.pageSelectionData.scoringInfo[s_self.itemName].touched === 0 && s_self.sc_type === "manual") $(`#t_ms_score_slider_${itemHex}`).val('');
                        $(`#t_ms_score_slider_${itemHex}`).trigger("focus").trigger("select");
                    }, 50);
                } else {
                    if (s_self.pageSelectionData.scoringInfo[s_self.itemName].touched === 0 && s_self.sc_type === "manual") $(`#t_ms_score_slider_${itemHex}`).val('');
                    $(`#t_ms_score_slider_${itemHex}`).trigger("focus").trigger("select");
                }

                // default disable on save comment until activated by comment box selection
                scoring.cmt_saveEntry.disable();

                // remove selection on readonly items
                if (s_self.readOnly) $(`#t_ms_score_slider_${itemHex}`)[0].setSelectionRange(0, 0);

                return false; // required for navigation requests -- don't know why
            }
        });
        MathJax.typeset();
    }

    updateSbPartials(fromScoring, touched) {

        if (fromScoring) {
            if (touched === 0 && this.viewType === 't') pg_left[this.pageSelectionData.passwordId]--; // decrement number of items left to score
            if (touched === 0 && this.viewType === 'q') pg_left[this.pageSelectionData.pageId]--; // decrement number of items left to score [question list view]
            touched = 1;
        } else {
            touched = this.pageSelectionData.scoringInfo[this.itemName].touched;
        }

        if (this.sc_type === "auto") {
            $('#ms_sumBox_qtype').html(UILANG.m("Automatic"));
            $('#ms_sumBox_status').html(UILANG.m("AUTOSCORED")).removeClass("notscored").addClass("scored");
        } else {
            $('#ms_sumBox_qtype').html(UILANG.m("Manual"));
            if (touched === 0) {
                $('#ms_sumBox_status').html(UILANG.m("REQUIRES MANUAL SCORING")).removeClass("scored").addClass("notscored");
            } else {
                if (fromScoring) this.pageSelectionData.scoringInfo[this.itemName].touched = 1;
                $('#ms_sumBox_status').html(UILANG.m("MANUALLY SCORED")).removeClass("notscored").addClass("scored");
                $(`#ms_isel_${this.str2hex(this.itemName)}`).removeClass('ms_i_unscored').addClass('ms_i_scored');

            }
        }


        // set the remaining count indicator
        this.viewType === "t" ? $('#ms_remItems').html(pg_left[this.pageSelectionData.passwordId]) : $('#ms_remItems').html(pg_left[this.pageSelectionData.pageId]);

        // set style on remaining count indicator
        parseInt($('#ms_remItems').html()) > 0 ? $('#ms_remItems').addClass("notscored").removeClass("scored") : $('#ms_remItems').removeClass("notscored").addClass("scored");

    }

    /**
     * Update the table score and panel titles
     */
    async updateScoreAndPanelLabels(data, isUpdate = false, isMulti = false) {

        const tableRowId = (isUpdate) ? this.pageId : data.pageId;

        let score;

        if (isUpdate && isMulti) {
            score = data.updatedScore.updatedSumScore;
        } else if (isUpdate && !isMulti) {
            score = data.updatedScore.scoreValue;
        } else {
            score = data.score;
        }

        const pageName = data.pageName;

        if (this.viewType === 't') {

            let tData = data.scoringInfo ?? this.pageSelectionData.scoringInfo;

            if (isUpdate) tData[data.updatedScore.itemName].touched = 1;

            /* look for an unscored item and set qt_total label as 'incomplete', or the actual page score */
            Object.values(tData).every((e) => {
                if (e.touched === 0) {
                    $('#testListItem_' + parseInt(tableRowId) + ' > span > span.qt_total').html(`<span class='list_incomplete_scoring'>${UILANG.m("Incomplete")}</span>`); // show incomplete scoring status for page
                    return false;
                } else {
                    $('#testListItem_' + parseInt(tableRowId) + ' > span > span.qt_total').html(`<span class='list_complete_scoring'>${score}</span>`); // update qTable selected row 'score' label;
                    return true;
                }
            });

            if (!isUpdate) ms_panels.right_section.box.setTitle( /* html */ `<span class='ms_title_emph'>${pageName}</span>`);
        }

        if (this.viewType === 'q') {
            $('#testListItem_' + parseInt(data.passwordId) + ' > span > span.qt_total').html(`${score} pts.`); // update qTable selected row 'score' label
            if (!isUpdate) ms_panels.right_section.box.setTitle( /* html */ `${UILANG.m('Test Taker:')} <span class='ms_title_emph'>${data.loginName}</span> [${data.loginId}] | ${UILANG.m("Password Id:")} <span class='ms_title_emph'>${data.passwordId}</span>`);
        }
    }

    /**
     * Set the summary box label "final score" updated value.
     */
    updateSumBox(score, points, touched, upScInfo) {
        $('#mssb_fScore').html(Scoring.nicePercent(score));
        $('#mssb_tPoints').html(points);
        $('#ms_scoreby').html(upScInfo.scoreBy);
        $('#ms_scorebyid').html(upScInfo.scoreById);
        $('#ms_scoretime').html(upScInfo.scoreTime);
        $('#ms_scoregiven').html(upScInfo.scoreValue);

        this.updateSbPartials(true, touched);
    }

    /**
     * Build the summary box showing final score, test taker, test stats, etc.
     */
    buildSummaryBox(pdd) {
        $('#qSummaryStats').empty();

        const fScore = Scoring.nicePercent(pdd.liveScore.finalScore);
        const fProg = Scoring.nicePercent(pdd.liveScore.progress, 0);

        if (!this.pageSelectionData) {
            this.pageSelectionData = {};
            this.pageSelectionData.qType = this.viewType;
            this.pageSelectionData.name = this.pageSelectionData.pageName = this.pageSelectionData.passwordId = this.pageSelectionData.passwordTag = "&lt;not selected&gt;";
        }

        /* set/update live score and page info labels */
        $('#qSummaryStats').append( /* html */ `
        <div class="sumbox_header">${UILANG.m("Test Taker Information")}</div>
            <table class="ms_sumBoxTable">
                <tr><td class="ms_sumBox">${UILANG.m("Test Taker")}</td><td class="ms_sumBox_val">${pdd.liveScore.loginName}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Password Id")}</td><td class="ms_sumBox_val">${this.pageSelectionData.passwordId}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Password Tag")}</td><td class="ms_sumBox_val">${this.pageSelectionData.passwordTag}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Last Connected")}</td><td class="ms_sumBox_val">${pdd.liveScore.lConn}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Test Progress")}</td><td class="ms_sumBox_val">${fProg}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Total Score")}</td><td class="ms_sumBox_val_score" id="mssb_fScore">${fScore}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Total Points")}</td><td class="ms_sumBox_val_score" id="mssb_tPoints">${pdd.liveScore.points}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Remaining Items")}</td><td class="ms_sumBox_val"><span id="ms_remItems"></span></td></tr>
            </table>

            <hr> 

            <div class="sumbox_header">${UILANG.m("Question Scoring Information")}</div>
            <table class="ms_sumBoxTable">
                <tr><td class="ms_sumBox">${UILANG.m("Scorer")}</td><td class="ms_sumBox_val"><span id="ms_scoreby"></span></td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Scorer ID")}</td><td class="ms_sumBox_val"><span id="ms_scorebyid"></span></td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Scoring Time")}</td><td class="ms_sumBox_val"><span id="ms_scoretime"></span></td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Score Given")}</td><td class="ms_sumBox_val"><span id="ms_scoregiven"></span></td></tr>
            </table>

            <div class="sumbox_header">${UILANG.m("Test Page Information")}</div>
            <table class="ms_sumBoxTable">
                <tr><td class="ms_sumBox">${UILANG.m("Test Name")}</td><td class="ms_sumBox_val">${pdd.testName}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Page Name")}</td><td class="ms_sumBox_val">${(this.pageSelectionData.qType === 't') ? this.pageSelectionData.name : this.pageSelectionData.pageName}</td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Question Name")}</td><td class="ms_sumBox_val"><span id="ms_sumBox_qName"></span></td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Question Type")}</td><td class="ms_sumBox_val"><span id="ms_sumBox_qtype"></span></td></tr>
                <tr><td class="ms_sumBox">${UILANG.m("Scoring Status")}</td><td class="ms_sumBox_val"><span id="ms_sumBox_status"></span></td></tr>
            </table>

        `);
    }

    /**
     * Reconstruct HTML preview for the question item.
     */
    htmlPreview(pdd) {

        // instantiate editorFactory for building HTML previews of questions (in pageLoader())
        const ef = new EditorFactory();

        for (let i = 0; i < pdd.items.length; i++) {

            const itemName = this.str2hex(pdd.items[i]);
            // const hDataBlock = fetchObjectFromArray(pdd.htmlPreview, {'id': itemName}, true);
            const hDataBlock = pdd.htmlPreview[i];

            /* question preview block(s) */
            const theEditor = ef.getEditorClass(hDataBlock.type);

            /* setup test language selection */
            if (typeof (hDataBlock.question) !== "undefined") {
                this.langSelConfig(Object.keys(hDataBlock.question));
            } else if (typeof (hDataBlock.source) !== "undefined") {
                this.langSelConfig(Object.keys(hDataBlock.source));
            } else {
                continue;
            }
            // on initial page load, no lang is selected, so select the first one available
            if (this.testLang === null) this.testLang = pdd.languages[0];

            // let's separate the page lang so we can retain our "session" lang found in this.testLang
            let q_lang = this.testLang;

            // the page being loaded may have different lang options thant the previous one, so we implement a failback to whatever this question contains (if not the previous lang value)

            // conditional for the rare case when an auto scored advanced editor is mixed in with a manual question (adv editors do not have the 'question' key)
            if (typeof hDataBlock.question === "undefined") {
                q_lang = Object.keys(hDataBlock.source)[0];
            } else {
                if (Object.keys(hDataBlock.question).includes(q_lang) === false) q_lang = Object.keys(hDataBlock.question)[0];
            }

            /* correction key block(s) */

            // skip loop condition (when no valid correction key available)
            if (!(pdd.corKey === null || (!(this.hex2str(itemName) in pdd.corKey)) || (pdd.corKey[scoring.hex2str(itemName)].length === 1 && pdd.corKey[scoring.hex2str(itemName)][0] === ""))) {

                $(`#ms_corKey_container_${itemName}`).remove(); // for when animation redraw call leads to multiple executions on same itemName value

                this.pHtml += /* html */ `<div id="ms_corKey_container_${itemName}"><span class="ms_corKey" id="ckLabel_item_${itemName}">${UILANG.m("Correction key")}</span>`;

                for (let [corKey, corVal] of Object.entries(pdd.corKey[scoring.hex2str(itemName)])) {

                    // correction block header
                    this.pHtml += /* html */ `<span id='ckli_item_${itemName}' class='ms_corKeyBlock' style="display: block;">`; // display must be force set here to prevent jquery from setting to 'inline' style on show()

                    // correction block data (conditional)
                    if (corVal !== "") {
                        const corKeyStr = (pdd.corKey[scoring.hex2str(itemName)] instanceof Array) ? "" : corKey + ": ";
                        if (typeof corVal.name !== "undefined") corVal = corVal.name;
                        this.pHtml += /* html */ `<li class="ms_itemBullet">${corKeyStr}${corVal}</li>`;
                    }

                    // correction block footer
                    this.pHtml += "</span>";
                }
                this.pHtml += /* html */`</div>`;

            }

            /* concept map interaction special handler */
            if (hDataBlock.type === "conceptmap") {

                if (!(this.pageId in this.cmBase)) this.cmBase = {
                    [this.pageId]: {}
                };

                this.cmBase[this.pageId][itemName] = hDataBlock.conceptmap;

                if (!(this.pageId in cmQ)) cmQ = {
                    [this.pageId]: {}
                };

                cmQ[this.pageId][itemName] = hDataBlock.question[q_lang].replace(/fetchMediaFile\.php/g, settings.JSrootURL + "fetchMediaFile.php");

                if ($('#q_item_cmb_' + itemName).length === 0) {
                    this.pHtml += /* html */ `<div id="q_item_cmb_${itemName}"></div>`;
                }
                this.pHtml += /* html */ `<div class="ms_q_item" id="q_item_${itemName}">${cmQ[this.pageId][itemName]}</div>`;
            } else {
                /* standard interaction html preview generator */
                let forceWidth = 1024;
                if (pdd.itemType[i] === 'oasysSlider') forceWidth = (Math.floor($('#ms_questionArea').width()) - 22); // special forced width for sliders/slikerts
                if (pdd.itemType[i] === 'oasysSlikert') forceWidth = (Math.floor($('#ms_questionArea').width())); // special forced width for sliders/slikerts
                let prevGen = theEditor.generatePreview(hDataBlock, q_lang, { maxWidth: forceWidth, skipShuffling: true });
                this.pHtml += /* html */ `<div class="ms_q_item" id="q_item_${itemName}">${prevGen}</div>`;
            }
        }

        MathJax.typeset();
        return true;
    }

    /**
     * Build out UI shell for scoring section
     */
    buildScoringBlock(pdd) {
        if (typeof pdd.scoringInfo[this.itemName] === "undefined") return;
        this.sc_type = pdd.scoringInfo[this.itemName].itemScoreType;

        $('#ms_scoringArea').append( /* html */ `

            <!-- LEFT SUB-PANEL -->
            <div id="scoreAssignmentContainer">

                <!-- scoring label -->
                <div id="ms_itemHeadline">

                    <div id="ms_scoreBoxInfo">
                    <span id="s_scType"></span> | <span id="s_fullName"></span> 
                    </div>
                    <div id="scoringItemsContainer">
                    <div id="isub_nav_holder"></div>
                    <div id="isub_arrows"><div id="text_input_scoreContainer"></div></div>
                    <div id="pointData">WHERE POINT DATA GOES</div>
                    </div>


                </div>

                

                <!-- scoring selection section -->
                <div id='scoreKeyInner'></div> <!-- dynamically populated based on scoring model value -->

                <!-- Comment section -->
                <div id="ms_commentContainer">

                    <!-- comment label -->
                    <h3 id='add_c_label' class="ms_cmtLabel">${UILANG.m('Comment')}</h3>

                    <!-- comment input textarea -->
                    <textarea class="ms_cmtInput" id="scoringCmt"></textarea>

                    <!-- comment action buttons -->
                    <div class="ms_cmtBtnBlock">
                        <div class="ms_cmtNavBtns" id="cmtSaveBtn"></div>
                        <div class="ms_cmtNavBtns" id="cmtRemBtn"></div>
                        <!-- <div class="ms_cmtNavBtns" id="cmtRptBtn"></div> --> 
                    </div>

                </div>

            </div>

            <!-- RIGHT SUB-PANEL -->

        `);

        // comment setup and handler inits
        this.commentInit(pdd);

        // initialize first question since this method is called at the start of page load
        this.buildScoringOptsUI(pdd);
        this.item_switch(pdd, "clicked");
    }

    /**
     * Revert the score value when in a bad ajax sync condition or whenever needed
     */
    revertScoreSelection() {
        let hexItemName = this.str2hex(this.itemName);
        $(`ms_score_slider_${hexItemName}`).slider("value", this.origScore);
    }

    /**
     * Check if string is valid JSON (used for loading 'answers' values)
     */
    ms_isJSON(str) {
        const liStr = "<li class='ms_itemBullet'>";
        let jString;
        try {
            jString = JSON.parse(str);
        } catch (e) {
            // return original non-JSON string
            return liStr + str + "</li>";
        }

        // process JSON into list items HTML if JSON
        let retArrStr = "";
        try {
            for (const aVal of jString) {
                retArrStr += liStr + aVal + "</li>";
            }
        } catch (e) {
            // if the JSON is not iterable, return the originally sent in value
            return liStr + str + "</li>";
        }

        // return processed array in HTML string format
        return retArrStr;
    }

    async removeComment(pdd) {

        let cmtRemObj = {
            pageId: parseInt(this.pageId),
            itemName: this.itemName,
            passwordId: pdd.passwordId,
            testId: pdd.testId
        };

        await results_startAjax('scoringRemComment', cmtRemObj).then(() => {
            pdd.comments[this.itemName] = false;
            $('#scoringCmt').val('');
            gui.statusBar.setStatus(UILANG.m("Comment sucessfully removed!"), 1000, "green");
            this.cmt_remEntry.disable();
            this.cmt_saveEntry.disable();
        });
    }

    /**
     * Save comment data entered in text area.
     */
    async saveComment(pdd) {
        let cmtSaveObj = {
            comment: $('#scoringCmt').val(),
            pageId: parseInt(this.pageId),
            itemName: this.itemName,
            passwordId: pdd.passwordId,
            testId: pdd.testId
        };

        await results_startAjax('scoringAddComment', cmtSaveObj).then((res) => {
            let hexItemName = this.str2hex(this.itemName);
            gui.statusBar.setStatus(UILANG.m("Comment sucessfully added!"), 1000, "green");
            pdd.comments[this.itemName] = res.commentData;
            $('#scoringCmt').val(res.commentData.commentString);
            $('#scoringCmt').trigger('blur');
            this.cmt_saveEntry.disable();
            this.cmt_remEntry.enable();
            $(`#t_ms_score_slider_${hexItemName}`).trigger("select");
        });
    }

    /**
     * Initiate event handlers for various commenting operations
     */
    setupCommentHandlers(pdd) {
        // enable comment field on click
        $('#scoringCmt').on('focus', function() { $('#scoringCmt').addClass('ms_inputEdited') });
        $('#scoringCmt').on('blur', function() { $('#scoringCmt').removeClass('ms_inputEdited') });

        // comment field handler for save button control on/off on text input
        $('#scoringCmt').on('input', function() {
            if ($(this).val().length === 0) {
                scoring.cmt_saveEntry.disable();
            } else {
                scoring.cmt_saveEntry.enable();
            }
        });

        // comment field handler for keyboard shortcut (alt+s) to save comment
        $('#scoringCmt').on('keydown', async (e) => {
            if (e.originalEvent.altKey && (e.originalEvent.code === "KeyS" || e.originalEvent.key.toLowerCase() === "s") && $('#scoringCmt').val().length > 0) {
                e.preventDefault();
                e.stopPropagation();
                scoring.cmt_saveEntry.buttonSelected(true);
                setTimeout(() => scoring.cmt_saveEntry.buttonSelected(false), 100); // visually simulate button press
                await this.saveComment(pdd);
            }
        });
    }

    /**
     * Setup/reset various UI elements.
     */
    stageUI() {
        $('#ms_page').empty();

        $('#ms_page').append("<div id='ms_qacontainer'></div>");
        $('#ms_qacontainer').append("<div id='ms_questionArea'></div>");
        $('#ms_qacontainer').append("<div id='ms_answerArea'></div>");
        $('#ms_page').append("<div id='ms_scoringArea'></div>");


        this.pHtml = "";
    }

    /**
     * Toggle full screen mode in browser.
     */
    toggleFullScr(targ) {
        if (targ === undefined) targ = document.body;
        if (this.blockFS) return;

        if (document.webkitFullscreenElement || document.fullscreenElement) {
            if (typeof document.exitFullscreen !== "undefined") {
                document.exitFullscreen();
            } else {
                document.webkitExitFullscreen();
            }
        } else {
            if (typeof targ.requestFullscreen !== "undefined") {
                targ.requestFullscreen();
            } else {
                targ.webkitRequestFullscreen();
            }
        }
    }

    async setScore(pdd, itemName) {
        if (this.readOnly) {
            this.revertScoreSelection();
            return false;
        }

        // ajax call to set score
        return results_startAjax('setScore', {
            testId: pdd.testId,
            passwordId: pdd.passwordId,
            pageId: parseInt(this.pageId),
            itemName: itemName,
            score: this.newScore
        }).then((res) => {

            window.stopNAV = false;

            // post scoring attempt routines
            if (res.error) return false;

            // titlebar message
            gui.statusBar.setStatus(UILANG.m("Score sucessfully recorded!"), 1000, "green");

            // re-enable scoring radio buttons
            this.scoringButtonsDisable(false);

            // special handling for multiItem pages

            this.updateScoreAndPanelLabels(res, true, this.isMultiItem);

            // if (this.isMultiItem) {
            //     this.updateScoreAndPanelLabels(res, true, true);
            // } else {
            //     this.updateScoreAndPanelLabels(res, true);
            // }

            // clear and re-set tooltip title prop for target radio button
            this.setItemTitle(res.updatedScore.itemName, res.updatedScore);

            // set updated final score & points value in summary box
            this.updateSumBox(res.finalScore, res.points, res.touched, res.updatedScore);

            return res.updatedScore;

        });
    }

    async scoringSync() {
        const tableData = this.qTable.getSelection();
        if (parseInt(this.pageId) !== parseInt(tableData.pageId) || ajx.readyState !== 4) {
            ajx.abort();
            let res = await new nxDialog('syncMM', {
                title: "Synchronization Error",
                contents: "A synchronization error occurred on this scoring attempt. This page will now be reloaded.",
                returnPromise: true,
                buttons: [{
                    value: "close",
                    label: UILANG.m("Close"),
                    'default': true
                }]
            });
            return res;

        } else {
            return true;
        }
    }

    setTestListStyles(itemList) {
        for (const pageId of itemList) {
            this.setTLstyle(pageId);
        }
    }

    setTLstyle(rowId) {
        rowId = String(rowId);
        const itemData = this.qTable.getItem(rowId);
        if (itemData === null) return;
        const targRow = $(`#testListItem_${rowId}`);
        const targRow_postFix = targRow.children(".jsSelectList-Postfix");

        if (itemData.hasMan === "manscore") {
            // superscript indicator if page contains manual correction item
            targRow.prop('title', UILANG.m("This page contains one or more manual scoring items."));
            targRow_postFix.html(targRow_postFix.html().replace("M", "") + /* html */ `<span style='position: relative; left: -7px; font-size: smaller; font-weight: bold;'><sup>M</sup></span>`);
        }
    }

    showItemBlock() {
        if (typeof this.itemName === "undefined") return;
        let itemId = this.str2hex(this.itemName);

        $(`#r_item_${itemId}, #q_item_${itemId}, #q_item_cmb_${itemId}, #ckLabel_item_${itemId}, #ckli_item_${itemId}, #ms_xtra_${itemId}`).show();
    }

    hideItemBlock() {
        $(`[id^="r_item_"], [id^="q_item_"], [id^="ckLabel_item_"], [id^="ckli_item_"], [id^="ms_xtra_"]`).hide();
    }
    setItemTitle(hexItemName, tInfo) {
        hexItemName = this.str2hex(hexItemName);
        $(`#t_ms_score_slider_${hexItemName}`).prop('title', `Score assigned by ${tInfo.scoreBy} [${tInfo.scoreById}] at ${tInfo.scoreTime}`);
    }

    /**
     * Internal object modification when ms filtering on
     */
    msObjMod(pdd) {
        for (const [key, val] of Object.entries(pdd.scoringInfo)) {
            if (val.itemScoreType !== "manual") {
                delete pdd.assignmentStruct[key];
                delete pdd.corKey[key];
                if (pdd.items.indexOf(key) >= 0) {
                    pdd.itemType.splice(pdd.items.indexOf(key), 1);
                    pdd.items.splice(pdd.items.indexOf(key), 1);
                }
            }
        }

        // separate filtering method for htmlPreview subkey since it does not have the names as the property value
        pdd.htmlPreview = pdd.htmlPreview.filter(function(v) {
            if (v.processing === "manual") return v;
        });
    }

    /**
     * Handle condition where the test taker has not submitted their test.
     */
    async testActivityHandling(pdd) {
        if (typeof pdd.tl_msg === "undefined") return;

        // test activity status handling
        let tl_color = Object.keys(pdd.tl_msg)[0];
        let tl_message = Object.values(pdd.tl_msg)[0];

        // set statusBar message/color
        function activityStatusBarUpdate(message, color) {
            gui.statusBar.setStatus("<strong>" + message + "</strong>", false, color);
        }

        if (tl_color !== "#00008b") activityStatusBarUpdate(tl_message, tl_color);
        this.readOnly = (tl_color === 'red');

        /* routine to determine and handle tests which are not in 'submitted' status */
        if ((tl_color === 'red' && this.alreadyInRO === false) || (tl_color === 'red' && this.viewType === 'q')) {
            this.readOnly = true;

            await new nxDialog('submitConfirm', {
                title: UILANG.m("Non-submitted test confirmation"),
                contents: /* html */ `
                            <p style="font-weight: bold;">${tl_message}</p><p>${UILANG.m("Select how you would like to proceed")}:</p>
        
                            <script>
                            /*
                                FYI: JS embedded in HTML embedded in JS embedded in PHP embedded in HTML (ツ)
                                This is the only way to override nxdialog UI elements in while it is in
                                "returnPromise" mode (that I could find -- NN)
                             */
                            $('.nxDialogButtons').css('text-align', 'left');
                            $('.nxDialogButtons').find('div').css('text-align', 'left');
                            // FYI: must set timeout to let jquery 'catch up' and draw the UI elements
                            setTimeout(() => $('#submitConfirm_button_0').css('border-color', 'red'), 50);
                            setTimeout(() => $('#submitConfirm_button_0').hover(function() {
                                $(this).css('background-color', 'rgba(193, 66, 66, 0.1)')
                            }, function() {
                                $(this).css('background-color', 'transparent')
                            }) , 50);
                            setTimeout(() => $('#submitConfirm_button_0 > span:nth-child(1)').css('color', 'red'), 50);
        
                            </script>
                        `,
                width: 418,
                returnPromise: true,
                buttons: [{
                    label: UILANG.m("SCORING MODE (LOCKS OUT TEST TAKER!)"),
                    value: "lockoutTest",
                    color: "red"
                }, {
                    label: UILANG.m("READ-ONLY REVIEW MODE"),
                    value: "read",
                    'default': true,
                    'cancel': true
                }]
            }).then(async (res) => {
                if (res.button === 'lockoutTest') {
                    await results_startAjax('closeOutTest', {
                        testId: pdd.testId,
                        passwordId: pdd.passwordId
                    }).then((res2) => {
                        activityStatusBarUpdate(Object.values(res2.tl_msg)[0], Object.keys(res2.tl_msg)[0]);
                        if (Object.keys(res2.tl_msg[0] === "blue")) {
                            this.alreadyInRO = false;
                            this.readOnly = false
                        }
                    });
                } else {
                    if (this.viewType === 't') this.alreadyInRO = true;
                }
            });
        }

    }
    answerProc(pdd) {
        for (const [_i, item] of pdd.items.entries()) {
            let sItem = this.str2hex(item);

            /* special conceptmap processing logic */
            if (pdd.scoringInfo[item].itemType === "ConceptMap") {
                $('#ms_answerArea').append(/* html */ `<div id='r_item_${sItem}'></div>`);

                if (pdd.scoringInfo[item].givenAnswers.length === 0) { // no answer processing
                    cmResObj.data = this.cmBase[this.pageId][item];
                    $(`#r_item_${sItem}`).append(/* html */ `<li class='ms_itemBullet'><span class="ms_badOrNoAns">${pdd.loginName} left this item blank</span></li>`);
                } else { // given answer processing
                    new nxButton($(`#r_item_${sItem}`), `lcmBtn_id_${sItem}`, {
                        disabled: false,
                        label: UILANG.m("Open Given Concept Map Response"),
                        callback: () => {
                            openExternalEditor({
                                url: "../apps/conceptmaps/",
                                data: cmResObj.data
                            });
                        },
                        value: "ok"
                    });
                }
            } else {
                /* standard answer processing logic */
                const theAnswer = () => {
                    let theAns = scoring.answerSet[item];
                    if (typeof theAns === "undefined") return /* html */ `<span class="ms_badOrNoAns">${pdd.loginName} did not answer this item</span>`;
                    if (theAns === "[]") return /* html */ `<span class="ms_badOrNoAns">${pdd.loginName} left this item blank</span>`;
                    if (typeof theAns === "object" && theAns.length === 0) return /* html */ `<span class="ms_badOrNoAns">${pdd.loginName} left this item blank</span>`;
                    return theAns.replaceAll("\n", "<br>");
                };

                // get post-processed string friendly version of answer
                const answers = /* html */ `<div id='r_item_${sItem}'>${scoring.ms_isJSON(theAnswer())}<br></div>`;

                // add processed answer to UI
                $('#ms_answerArea').append( /* html */ `${answers}`);
            }
        }
    }

    commentInit(pdd) {
        // clicking comment label focuses on comment box
        $('#add_c_label').on('click', (() => $('#scoringCmt').trigger('focus')));

        // save entry button
        scoring.cmt_saveEntry = new nxButton($('#cmtSaveBtn'), 'seBtn', {
            label: UILANG.m('Save Comment'),
            callback: () => this.saveComment(pdd),
            value: null,
            disabled: true
        });

        // remove/clear entry button
        scoring.cmt_remEntry = new nxButton($('#cmtRemBtn'), 'ceBtn', {
            label: UILANG.m("Remove Comment"),
            callback: () => this.removeComment(pdd),
            value: null
        });

        // comment kb handler setup
        this.setupCommentHandlers(pdd);
    }

    /**
     * Iterate question items on the test page.
     */
    itemIter(pdd) {
        /* build item selection list elements */

        $('#isub_nav_holder').html( /* html */ `<div id="ms_itemSelList"></div>`);

        /*
            sp_id = item id with spaces preserved
            nosp_id = item id with spaces removed
         */
        for (const sp_id of pdd.items) {
            const item = this.str2hex(sp_id);

            $('#ms_itemSelList').append( /* html */ `<span class="ms_itemSel ms_i_not_selected" id="ms_isel_${item}">${sp_id}</span>`);

            if (item === this.str2hex(scoring.itemName)) {
                $(`#ms_isel_${item}`).removeClass('ms_i_not_selected').addClass('ms_i_selected');
            }

            // individual item color coding based on scoring status
            if (pdd.scoringInfo[sp_id].touched === 0 && pdd.scoringInfo[sp_id].itemScoreType === "manual") {
                $(`#ms_isel_${item}`).addClass("ms_i_unscored").removeClass("ms_i_scored");
            } else {
                $(`#ms_isel_${item}`).addClass("ms_i_scored").removeClass("ms_i_unscored");
            }

            // set click handler for direct item activation
            $(`#ms_isel_${item}`).off();
            $(`#ms_isel_${item}`).on("click", () => scoring.item_switch(pdd, "clicked", false, sp_id));
        }

        // set initial question item label
        $('#qItemLabel').html(scoring.itemName);
        $('#rItemLabel').html(scoring.itemName);

    }

    noPagesMsg() {
        const nopagemsg = (this.viewType === 't') ?
            "<p>" + UILANG.m("This test does not have any manual scoring pages. You may toggle the \"manual score only\" filter to view all pages and questions.") + "</p>" :
            "<p>" + UILANG.m("This test page does not have any manual scoring questions. You may navigate to other pages to determine if there are manual scoring entries, and/or toggle the \"manual score only\" filter to view all pages and questions.") + "</p>";

        new nxDialog('nomsgbox', {
            title: UILANG.m("No Available Data"),
            contents: nopagemsg,
            buttons: [{
                value: 'ok',
                label: UILANG.m("OK"),
                'default': true
            }]
        });

        $('#ms_questionArea').empty();
        $('#ms_answerArea').empty();
        $('#ms_scoringArea').empty();
        $('#ms_navholder').empty();
    }

    qaSetup(pdd) {
        scoring.answerSet = {};
        for (const [a, b] of Object.entries(pdd.scoringInfo)) {
            scoring.answerSet[a] = b.givenAnswers;
        }

        // conditional section labels
        const qLabelStr = /* html */ `<div>${UILANG.m("QUESTION")} </div><div id="qItemLabel"></div>`;
        const ansLabelStr = /* html */ `<div>${UILANG.m("RESPONSE")} </div><div id="rItemLabel"></div>`;

        // keyboard shortcut help section + question section + answer header
        $('#ms_questionArea').append( /* html */ `<div class="ms_qa_header" >${qLabelStr}</div>${this.pHtml}`);
        $('#ms_answerArea').append( /* html */ `<div class="ms_qa_header">${ansLabelStr}</div>`);

        // set double click handler to max out question box
        let this_2 = this;
        $('#ms_questionArea, #ms_answerArea').on("dblclick", function() {
            this_2.toggleFullScr(this);
        });
    }

    /**
     * Display message in answer area when integrity violation detected between question structure and recorded answers
     */
    iFailMsg() {
        $('#ms_answerArea').remove("#ms_ifm");
        $('#ms_answerArea').prepend( /* html */ `
        <div id="ms_ifm">
            <p>
            ${UILANG.m("Please note that an inconsistency has been detected between the answers given by this test taker and the current question structure.")}
            <br><br>
            <strong>${UILANG.m("This test page may have been modified after test taker responses were recorded.")}</strong>
            </p>
        </div>
        `);
    }

    langSelConfig(langs) {
        this.langSels = langs;
    }

    initLangBox(i_data) {
        let langOpts = "";

        for (const lang of scoring.langSels) {
            langOpts += /* html */ `<div><input type='radio' name='lang_vals' id='lang_${lang}' value='${lang}'><label for='lang_${lang}'>${lang}</label></div>`;
        }

        new nxDialog("langselbox", {
            title: UILANG.m("Page Language Display"),
            buttons: [{
                label: UILANG.m("OK"),
                value: 'ok',
                'default': true
            }, {
                label: UILANG.m("Cancel"),
                value: "cancel"
            }],
            contents: /* html */ `
                <div style="padding-bottom: 15px; font-weight: bold;">${UILANG.m("Select language for page display:")}</div>
                <div>${langOpts}</div>
            `,
            callback: (button) => {
                if (button === 'ok') {
                    $("[name='lang_vals']").each(function(_i, rbObj) {
                        if ($(rbObj).prop('checked')) {
                            scoring.testLang = rbObj.value;
                            return;
                        }
                    });
                    ms_scoreDetailScreen(i_data, true, true);
                }
            }
        });

        $(`#lang_${scoring.testLang}`).prop("checked", true);
    }

    str2hex(str) {
        let hex, i;
        let result = "";
        for (i = 0; i < str.length; i++) {
            hex = str.charCodeAt(i).toString(16);
            result += ("000" + hex).slice(-4);
        }

        return result;
    }

    hex2str(str) {
        let j;
        let hexes = str.match(/.{1,4}/g) || [];
        let result = "";
        for (j = 0; j < hexes.length; j++) {
            result += String.fromCharCode(parseInt(hexes[j], 16));
        }

        return result;
    }

}