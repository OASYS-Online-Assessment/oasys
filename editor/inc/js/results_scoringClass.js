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
        this.readOnlyByPermission = false;
        this.msOnly = true;
        this.t1 = null;
        this.noSel = false;
        this.alreadyInRO = null;
        this.sc_type = null; // scoring type (auto|man) for the loaded question
        this.cmBase = {};
        this.langSels = [];
        this.testLang = null;
        this.blockFS = false;
        this.qlDD;
        this.i_data;
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
            $(document).off('.manualScoring');
            $(document).on("keydown.manualScoring", function(e) {

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
            $(document).off('.manualScoring');
        }

        // always re-init native context menu disabling
        $(document).off('contextmenu.manualScoring').on("contextmenu.manualScoring", function(e) {
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
                if (scoring.pageSelectionData && scoring.pageSelectionData.canWriteScores !== true) {
                    gui.statusBar.setStatus(UILANG.m("You do not have write access to this test taker."), 3500, "red");
                    return;
                }

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
                        <div class="msResetDialog">
                            <div class="msDialogMessage msDialogMessage-warning">
                                <div class="msDialogBadge">!</div>
                                <div class="msDialogCopy">
                                    <strong>${UILANG.m("Reset scoring")}</strong>
                                    <p>${UILANG.m("A scoring reset will revert all manually corrected items back to their original unscored state for this test taker and password.")}</p>
                                    <p>${UILANG.m("Please note that this will also remove all comments from all items!")}</p>
                                </div>
                            </div>
                            <div class="msResetTarget">
                                <span>${UILANG.m("Test taker / password")}</span>
                                <strong>${lId} / ${pId}</strong>
                            </div>
                            <label class="msConfirmCheck" for="rc_conf">
                                <input type='checkbox' name='rc_type' id='rc_conf' value='rc_conf'>
                                <span>${UILANG.m("I confirm")}</span>
                            </label>

                            <input type='hidden' id='testId' value=${testId}>
                            <input type='hidden' id='pId' value=${pId}>
                        </div>
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
                <div class="msShortcutDialog">
                    <div class="msShortcutGroup">
                        <h3>${UILANG.m("Test/Test Taker Navigation")}</h3>
                        <div class="msShortcutRow"><kbd>Up Arrow</kbd><span>${UILANG.m("Move to next item in question/test taker list.")}</span></div>
                        <div class="msShortcutRow"><kbd>Down Arrow</kbd><span>${UILANG.m("Move to previous item in question/test taker list.")}</span></div>
                        <div class="msShortcutRow"><kbd>ALT+N</kbd><span>${UILANG.m("Move to next entry.")}</span></div>
                        <div class="msShortcutRow"><kbd>ALT+P</kbd><span>${UILANG.m("Move to previous entry.")}</span></div>
                    </div>
                    <div class="msShortcutGroup">
                        <h3>${UILANG.m("Comments")}</h3>
                        <div class="msShortcutRow"><kbd>ALT+C</kbd><span>${UILANG.m("Focus on comment field.")}</span></div>
                        <div class="msShortcutRow"><kbd>ALT+S</kbd><span>${UILANG.m("Save comment (when comment field has text).")}</span></div>
                    </div>
                    <div class="msShortcutGroup">
                        <h3>${UILANG.m("Scoring")}</h3>
                        <div class="msShortcutRow"><kbd>1, 2, 3</kbd><span>${UILANG.m("Assign <em>n</em> points (decimals are allowed in increments of 0.5).")}</span></div>
                        <div class="msShortcutRow"><kbd>Right Arrow</kbd><span>${UILANG.m("Increment score value by 0.5")}</span></div>
                        <div class="msShortcutRow"><kbd>Left Arrow</kbd><span>${UILANG.m("Decrement score value by 0.5")}</span></div>
                    </div>
                    <div class="msShortcutGroup">
                        <h3>${UILANG.m("Test Page Navigation")}</h3>
                        <div class="msShortcutRow"><kbd>Shift + Left Arrow</kbd><span>${UILANG.m("Navigate leftward amongst items within a multi-question test page.")}</span></div>
                        <div class="msShortcutRow"><kbd>Shift + Right Arrow</kbd><span>${UILANG.m("Navigate rightward amongst items within a multi-question test page.")}</span></div>
                    </div>
                </div>
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


            $('#isub_arrows').prepend(`<span class="ms_inav_btn ms_inav_disabled" id="inav_left">&#9664;</span>`);
            $('#isub_arrows').append(`<span class="ms_inav_btn ms_inav_disabled" id="inav_right">&#9654;</span>`);

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
                thisObj.htmlPreview(pdd);
                thisObj.questionPaneBody().append(thisObj.pHtml);
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

                const currentIdx = items.indexOf(s_self.hex2str(sliderItem.dataset.sllink.substring(2)));
                if ((direction === "left" && currentIdx <= 0) || (direction === "right" && currentIdx >= items.length - 1)) return;

                $("[id^='ms_score_slider_'], [id^='t_ms_score_slider_'], [id^='m_ms_score_slider_']").hide();

                /* determine next index value to load */
                let nextIdx = null;
                switch (direction) {
                    case "left":
                        nextIdx = currentIdx - 1;

                        break;

                    case "right":
                        nextIdx = currentIdx + 1;

                        break;

                    case "clicked":

                        nextIdx = (item === "") ? 0 : items.indexOf(item);
                        break;

                    default:
                        break;
                }

                if (nextIdx < 0) nextIdx = 0;

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
                                const $itemBlock = $("#" + "q_item_" + scoring.str2hex(item));
                                if (pdd.htmlPreview[nextIdx].type === "inline_textfields") {
                                    const $inlineTexts = $itemBlock.find(".previewTag_inlineText");
                                    $inlineTexts.removeClass("ms_itxt_active").addClass("ms_itxt_inactive");
                                    $inlineTexts.eq(subIdx - 1).parent().addClass("ms_itxt_active").removeClass("ms_itxt_inactive");
                                } else if (pdd.htmlPreview[nextIdx].type === "inline_gaps") {
                                    const $inlineGaps = $itemBlock.find(".previewTag_inlineGap");
                                    $inlineGaps.removeClass("ms_igap_active").addClass("ms_igap_inactive");
                                    $inlineGaps.eq(subIdx - 1).addClass("ms_igap_active").removeClass("ms_igap_inactive");

                                }
                            }
                        }

                        doItDraw();

                        break;

                    case "choicematrix":

                        // choice matrix entry highlight

                        (function doCmDraw() {
                            const hDataBlock = pdd.htmlPreview[nextIdx];
                            const itemLang = s_self.previewLangForItem(hDataBlock, pdd, items[nextIdx]);
                            const rowMatchData = s_self.choiceMatrixRowMatchData(hDataBlock, items[nextIdx], itemLang);
                            const $rowCells = s_self.choiceMatrixRowCells($('#ms_questionArea'), hDataBlock, items[nextIdx], itemLang, rowMatchData);

                            // recurse if elements not fully drawn due to animation delay

                            if ($rowCells.parent().length === 0) {
                                setTimeout(() => {
                                    doCmDraw();
                                }, 50);
                            }

                            $('#ms_questionArea .matrixRow, #ms_questionArea .matrixChoicesRow')
                                .removeClass('ms_cmtrx_active ms_cmtrx_currentRow')
                                .addClass("ms_cmtrx_inactive")
                                .children()
                                .removeClass('ms_cmtrx_currentCell');
                            $rowCells.closest('.matrixRow, .matrixChoicesRow')
                                .removeClass("ms_cmtrx_inactive")
                                .addClass("ms_cmtrx_active ms_cmtrx_currentRow")
                                .children()
                                .addClass('ms_cmtrx_currentCell');
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
                                $('#ms_questionScrollBody').animate({
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
                const scoreModeLabel = (s_self.sc_type === "manual") ? UILANG.m("Manual Scoring") : UILANG.m("Auto-Scored");
                $('#s_scType').html(scoreModeLabel);
                $('#scoreAssignmentContainer')
                    .removeClass('msScoreModeManual msScoreModeAuto')
                    .addClass(s_self.sc_type === "manual" ? 'msScoreModeManual' : 'msScoreModeAuto')
                    .attr('data-mode-label', scoreModeLabel);

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
                $('#inav_left').toggleClass('ms_inav_disabled', nextIdx <= 0);
                $('#inav_right').toggleClass('ms_inav_disabled', nextIdx >= items.length - 1);

                // update question title label
                $('#qItemLabel').html(s_self.itemName);
                $('#rItemLabel').html(s_self.itemName);
                s_self.updateResponseLanguageLabel(pdd, s_self.itemName, pdd.htmlPreview[nextIdx]);

                // update sumbox values
                $('#ms_sumBox_qName').html(s_self.itemName);

                $('#ms_scoreby').html(pdd.scoredByInfo[s_self.itemName].scoreBy);
                $('#ms_scorebyid').html(pdd.scoredByInfo[s_self.itemName].scoreById);
                $('#ms_scoretime').html(pdd.scoredByInfo[s_self.itemName].scoreTime);
                $('#ms_scoregiven').html(pdd.scoredByInfo[s_self.itemName].scoreValue);

                // determine read only status based on scoring type or test taker completion status, and lock down necessary elements
                s_self.readOnly = s_self.sc_type === "auto" || s_self.alreadyInRO || s_self.readOnlyByPermission;

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

                (pdd.comments[scoring.itemName] && !s_self.readOnly) ? s_self.cmt_remEntry.enable() : s_self.cmt_remEntry.disable();

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

        // remove legacy manual language chooser; previews follow the stored answer language.
        $('#dlVeil_qLangSel').remove();
        $('#ms_qLangSlot').empty();
        this.qlDD = null;

        // load mathjax related symbols
        MathJax.typeset();
    }

    updateSbPartials(fromScoring, touched) {

        if (fromScoring) {
            if (touched === 0 && this.viewType === 't') pg_left[this.pageSelectionData.passwordId]--; // decrement number of items left to score
            if (touched === 0 && this.viewType === 'q') pg_left[this.pageSelectionData.pageId]--; // decrement number of items left to score [question list view]
            touched = 1;
            if (this.sc_type === "manual" && this.pageSelectionData.scoringInfo?.[this.itemName]) {
                this.pageSelectionData.scoringInfo[this.itemName].touched = 1;
                $(`#ms_isel_${this.str2hex(this.itemName)}`).removeClass('ms_i_unscored').addClass('ms_i_scored');
            }
        } else {
            touched = this.pageSelectionData.scoringInfo[this.itemName].touched;
        }

        if (this.sc_type === "auto") {
            $('#ms_sumBox_qtype').html(UILANG.m("Automatic"));
            $('#ms_sumBox_status').html(UILANG.m("AUTOSCORED")).removeClass("notscored").addClass("scored");
        } else {
            $('#ms_sumBox_qtype').html(UILANG.m("Manual"));
            if (this.allManualItemsScored(this.pageSelectionData.scoringInfo)) {
                $('#ms_sumBox_status').html(UILANG.m("MANUALLY SCORED")).removeClass("notscored").addClass("scored");
            } else {
                $('#ms_sumBox_status').html(UILANG.m("REQUIRES MANUAL SCORING")).removeClass("scored").addClass("notscored");
            }
        }


        // set the remaining count indicator
        this.viewType === "t" ? $('#ms_remItems').html(pg_left[this.pageSelectionData.passwordId]) : $('#ms_remItems').html(pg_left[this.pageSelectionData.pageId]);

        // set style on remaining count indicator
        parseInt($('#ms_remItems').html()) > 0 ? $('#ms_remItems').addClass("notscored").removeClass("scored") : $('#ms_remItems').removeClass("notscored").addClass("scored");

    }

    allManualItemsScored(scoringInfo) {
        let hasManual = false;
        for (const [itemName, itemInfo] of Object.entries(scoringInfo ?? {})) {
            if (itemName === "pageName" || itemName === "sortOrder" || typeof itemInfo !== "object" || itemInfo === null) continue;
            if (itemInfo.itemScoreType !== "manual") continue;
            hasManual = true;
            if (parseInt(itemInfo.touched) === 0) return false;
        }
        return hasManual;
    }

    /**
     * Update the table score and panel titles
     */
    formatScoreNumber(value) {
        const numericValue = parseFloat(value) || 0;
        return Number.isInteger(numericValue) ? String(numericValue) : String(Math.round(numericValue * 100) / 100);
    }

    scoreParts(scoringInfo, scoreValues = {}, updatedScore = null) {
        const parts = {
            manual: 0,
            auto: 0,
            hasManual: false,
            hasAuto: false,
            hasTouchedManual: false,
            isComplete: true
        };

        for (const [itemName, itemInfo] of Object.entries(scoringInfo ?? {})) {
            if (itemName === "pageName" || itemName === "sortOrder" || typeof itemInfo !== "object" || itemInfo === null) continue;

            const isUpdatedItem = updatedScore !== null && itemName === updatedScore.itemName;
            const rawValue = isUpdatedItem ? updatedScore.scoreValue : scoreValues?.[itemName];
            const scoreValue = typeof rawValue === "object" ? rawValue?.scoreValue : rawValue;
            const numericScore = parseFloat(scoreValue ?? itemInfo.earned ?? 0) || 0;

            if (itemInfo.itemScoreType === "manual") {
                parts.hasManual = true;
                parts.manual += numericScore;
                if (isUpdatedItem || parseInt(itemInfo.touched) !== 0) parts.hasTouchedManual = true;
                if (!isUpdatedItem && parseInt(itemInfo.touched) === 0) parts.isComplete = false;
            } else if (itemInfo.itemScoreType === "auto") {
                parts.hasAuto = true;
                parts.auto += numericScore;
                if (parseInt(itemInfo.touched) === 0) parts.isComplete = false;
            }
        }

        return parts;
    }

    buildScoreLabel(scoringInfo, scoreValues = {}, updatedScore = null) {
        const parts = this.scoreParts(scoringInfo, scoreValues, updatedScore);

        if (!parts.isComplete) {
            return `<span class="list_incomplete_scoring">${UILANG.m("Incomplete")}</span>`;
        }

        let displayScore = 0;
        let hasScoreValues = false;

        for (const [itemName, rawValue] of Object.entries(scoreValues ?? {})) {
            const scoreValue = updatedScore !== null && itemName === updatedScore.itemName
                ? updatedScore.scoreValue
                : (typeof rawValue === "object" ? rawValue?.scoreValue : rawValue);
            if (typeof scoreValue === "undefined") continue;
            displayScore += parseFloat(scoreValue) || 0;
            hasScoreValues = true;
        }

        if (updatedScore !== null && typeof scoreValues?.[updatedScore.itemName] === "undefined") {
            displayScore += parseFloat(updatedScore.scoreValue) || 0;
            hasScoreValues = true;
        }

        if (!hasScoreValues) displayScore = parts.manual + parts.auto;

        return `<span class="list_complete_scoring">${this.formatScoreNumber(displayScore)}</span>`;
    }

    async updateScoreAndPanelLabels(data, isUpdate = false, isMulti = false) {

        const tableRowId = (isUpdate) ? this.pageId : data.pageId;

        const pageName = data.pageName;

        if (this.viewType === 't') {

            let tData = data.scoringInfo ?? (this.pageSelectionData.unfilteredScoringInfo ?? this.pageSelectionData.scoringInfo);
            const scoreValues = data.scoredByInfo ?? (this.pageSelectionData.unfilteredScoredByInfo ?? this.pageSelectionData.scoredByInfo);

            if (isUpdate && typeof tData[data.updatedScore.itemName] !== "undefined") tData[data.updatedScore.itemName].touched = 1;

            $('#testListItem_' + parseInt(tableRowId) + ' > span > span.qt_total').html(this.buildScoreLabel(tData, scoreValues, isUpdate ? data.updatedScore : null));

            if (!isUpdate) ms_panels.right_section.box.setTitle( /* html */ `<span class='ms_title_emph'>${pageName}</span>`);
        }

        if (this.viewType === 'q') {
            const qData = data.scoringInfo ?? (this.pageSelectionData.unfilteredScoringInfo ?? this.pageSelectionData.scoringInfo);
            const scoreValues = data.scoredByInfo ?? (this.pageSelectionData.unfilteredScoredByInfo ?? this.pageSelectionData.scoredByInfo);
            $('#testListItem_' + parseInt(data.passwordId) + ' > span > span.qt_total').html(this.buildScoreLabel(qData, scoreValues, isUpdate ? data.updatedScore : null));
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
            <section class="msInfoCard">
                <h3>${UILANG.m("Test Taker Information")}</h3>
                <div class="msInfoRows">
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Test Taker")}</span><strong class="ms_sumBox_val">${pdd.liveScore.loginName}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Password Id")}</span><strong class="ms_sumBox_val">${this.pageSelectionData.passwordId}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Password Tag")}</span><strong class="ms_sumBox_val">${this.pageSelectionData.passwordTag}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Last Connected")}</span><strong class="ms_sumBox_val">${pdd.liveScore.lConn}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Test Progress")}</span><strong class="ms_sumBox_val">${fProg}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Total Score")}</span><strong class="ms_sumBox_val_score" id="mssb_fScore">${fScore}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Total Points")}</span><strong class="ms_sumBox_val_score" id="mssb_tPoints">${pdd.liveScore.points}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Remaining Items")}</span><strong class="ms_sumBox_val"><span id="ms_remItems"></span></strong></div>
                </div>
            </section>

            <section class="msInfoCard">
                <h3>${UILANG.m("Question Scoring Information")}</h3>
                <div class="msInfoRows">
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Scorer")}</span><strong class="ms_sumBox_val"><span id="ms_scoreby"></span></strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Scorer ID")}</span><strong class="ms_sumBox_val"><span id="ms_scorebyid"></span></strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Scoring Time")}</span><strong class="ms_sumBox_val"><span id="ms_scoretime"></span></strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Score Given")}</span><strong class="ms_sumBox_val"><span id="ms_scoregiven"></span></strong></div>
                </div>
            </section>

            <section class="msInfoCard">
                <h3>${UILANG.m("Test Page Information")}</h3>
                <div class="msInfoRows">
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Test Name")}</span><strong class="ms_sumBox_val">${pdd.testName}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Page Name")}</span><strong class="ms_sumBox_val">${(this.pageSelectionData.qType === 't') ? this.pageSelectionData.name : this.pageSelectionData.pageName}</strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Question Name")}</span><strong class="ms_sumBox_val"><span id="ms_sumBox_qName"></span></strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Question Type")}</span><strong class="ms_sumBox_val"><span id="ms_sumBox_qtype"></span></strong></div>
                    <div class="msInfoRow"><span class="ms_sumBox">${UILANG.m("Scoring Status")}</span><strong class="ms_sumBox_val"><span id="ms_sumBox_status"></span></strong></div>
                </div>
            </section>
        `);
    }

    /**
     * Reconstruct HTML preview for the question item.
     */
    htmlPreview(pdd) {

        // instantiate editorFactory for building HTML previews of questions (in pageLoader())
        const ef = new EditorFactory();

        for (let i = 0; i < pdd.items.length; i++) {

            const rawItemName = pdd.items[i];
            const itemName = this.str2hex(pdd.items[i]);
            // const hDataBlock = fetchObjectFromArray(pdd.htmlPreview, {'id': itemName}, true);
            const hDataBlock = pdd.htmlPreview[i];
            const itemScoreType = pdd.scoringInfo?.[rawItemName]?.itemScoreType;
            const isAutoScoredItem = itemScoreType === 'auto';
            const itemCorrectionKey = pdd.corKey?.[rawItemName];

            /* question preview block(s) */
            const theEditor = ef.getEditorClass(hDataBlock.type);

            /* setup test language selection */
            if (typeof (hDataBlock.question) !== "undefined") {
                // this.langSelConfig(Object.keys(hDataBlock.question));
                this.langSels = Object.keys(hDataBlock.question);
            } else if (typeof (hDataBlock.source) !== "undefined") {
                // this.langSelConfig(Object.keys(hDataBlock.source));
                this.langSels = Object.keys(hDataBlock.source);
            } else {
                continue;
            }
            const q_lang = this.previewLangForItem(hDataBlock, pdd, rawItemName);

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
                prevGen = this.decorateQuestionReferencePreview(hDataBlock, q_lang, prevGen);
                if (isAutoScoredItem) {
                    prevGen = this.decorateCorrectAnswerQuestionPreview(prevGen, itemCorrectionKey, hDataBlock, rawItemName, i, q_lang);
                }
                this.pHtml += /* html */ `<div class="ms_q_item" id="q_item_${itemName}">${prevGen}</div>`;
            }
        }

        MathJax.typeset();
        return true;
    }

    correctionKeyHasValues(correctionKey) {
        if (correctionKey === null || typeof correctionKey === 'undefined') return false;
        if (Array.isArray(correctionKey)) return correctionKey.some(value => value !== '');
        if (typeof correctionKey === 'object') return Object.values(correctionKey).some(value => value !== '');
        return correctionKey !== '';
    }

    correctionAnswerValues(correctionKey) {
        if (!this.correctionKeyHasValues(correctionKey)) return [];

        if (Array.isArray(correctionKey)) {
            return [...new Set(correctionKey.flatMap(value => this.correctionAnswerValues(value)))];
        }

        if (typeof correctionKey === 'object') {
            const values = [];
            for (const [key, value] of Object.entries(correctionKey)) {
                const keyIsNamedValue = key !== '' && Number.isNaN(parseInt(key, 10));
                if (value === true || value === 'true') {
                    if (key !== '') values.push(key);
                    continue;
                }
                if (value === false || value === 'false' || value === '') continue;
                if (keyIsNamedValue) values.push(key);
                if (typeof value?.name !== 'undefined') {
                    values.push(value.name);
                } else {
                    values.push(...this.responseAnswerValues(value));
                }
            }
            return [...new Set(values.filter(value => value !== ''))];
        }

        return [correctionKey];
    }

    correctAnswerDisplayValue(values, hDataBlock, lang) {
        const displayValues = values.map(value => this.responseAnswerLabel(hDataBlock, value, lang));
        return [...new Set(displayValues)].join(' / ');
    }

    decorateCorrectAnswerQuestionPreview(previewHtml, correctionKey, hDataBlock, item, itemIndex, lang) {
        const values = this.correctionAnswerValues(correctionKey);
        if (values.length === 0) return previewHtml;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = previewHtml;
        wrapper.classList.add('msQuestionCorrectPreview');

        let decorated = false;
        if (['slider', 'slikert'].includes(hDataBlock.type)) {
            decorated = this.decorateCorrectRangePreview($(wrapper), correctionKey, values, hDataBlock);
        } else {
            const correctAnswer = ['textfield', 'textarea', 'inline_textfields', 'inline_gaps'].includes(hDataBlock.type) ?
                this.correctAnswerDisplayValue(values, hDataBlock, lang) :
                values;
            decorated = this.decorateResponsePreview($(wrapper), correctAnswer, hDataBlock, item, itemIndex, lang);
        }
        return decorated ? wrapper.outerHTML : previewHtml;
    }

    numericCorrectionRange(correctionKey) {
        if (correctionKey === null || typeof correctionKey === 'undefined' || correctionKey === '') return null;

        if (typeof correctionKey !== 'object') {
            const value = parseFloat(correctionKey);
            return Number.isNaN(value) ? null : { from: value, to: value };
        }

        if (Array.isArray(correctionKey)) {
            const numericValues = correctionKey
                .flatMap(value => value && typeof value === 'object' ? Object.values(value) : value)
                .map(value => parseFloat(typeof value?.name !== 'undefined' ? value.name : value))
                .filter(value => !Number.isNaN(value));
            if (numericValues.length === 0) return null;
            if (numericValues.length === 1) return { from: numericValues[0], to: numericValues[0] };
            return { from: Math.min(numericValues[0], numericValues[1]), to: Math.max(numericValues[0], numericValues[1]) };
        }

        const rangeKeyPairs = [
            ['from', 'to'],
            ['min', 'max'],
            ['minimum', 'maximum'],
            ['lower', 'upper'],
            ['start', 'end'],
            ['fromValue', 'toValue'],
            ['rangeFrom', 'rangeTo']
        ];
        for (const [fromKey, toKey] of rangeKeyPairs) {
            if (typeof correctionKey[fromKey] === 'undefined' || typeof correctionKey[toKey] === 'undefined') continue;
            const from = parseFloat(correctionKey[fromKey]);
            const to = parseFloat(correctionKey[toKey]);
            if (!Number.isNaN(from) && !Number.isNaN(to)) return { from: Math.min(from, to), to: Math.max(from, to) };
        }

        const nestedValues = Object.values(correctionKey).filter(value => value && typeof value === 'object');
        if (nestedValues.length === 1) {
            const nestedRange = this.numericCorrectionRange(nestedValues[0]);
            if (nestedRange !== null) return nestedRange;
        }

        const numericValues = Object.entries(correctionKey)
            .flatMap(([key, value]) => (value === true || value === 'true') ? key : value)
            .map(value => parseFloat(typeof value?.name !== 'undefined' ? value.name : value))
            .filter(value => !Number.isNaN(value));
        if (numericValues.length === 0) return null;
        if (numericValues.length === 1) return { from: numericValues[0], to: numericValues[0] };
        return { from: Math.min(numericValues[0], numericValues[1]), to: Math.max(numericValues[0], numericValues[1]) };
    }

    decorateCorrectRangePreview($target, correctionKey, values, hDataBlock) {
        const range = this.numericCorrectionRange(correctionKey);
        if (range === null) return this.decorateResponsePreview($target, values[0], hDataBlock, hDataBlock.id ?? '', 0, '');
        if (range.from === range.to) return this.decorateResponsePreview($target, range.from, hDataBlock, hDataBlock.id ?? '', 0, '');

        return hDataBlock.type === 'slikert' ?
            this.decorateResponseSlikertRange($target, range, hDataBlock) :
            this.decorateResponseSliderRange($target, range, hDataBlock);
    }

    decorateQuestionReferencePreview(hDataBlock, lang, previewHtml) {
        previewHtml = this.decorateInlineQuestionReferencePreview(hDataBlock, lang, previewHtml);
        previewHtml = this.decorateChoiceDropdownQuestionReferencePreview(hDataBlock, lang, previewHtml);
        return previewHtml;
    }

    inlineReferenceFields(hDataBlock, lang) {
        const fieldsByLang = hDataBlock?.fields?.[lang] ?? hDataBlock?.fields?.[Object.keys(hDataBlock?.fields ?? {})[0]];
        return this.choiceCollectionEntries(fieldsByLang).sort((a, b) => {
            const numA = parseInt(a?.number, 10);
            const numB = parseInt(b?.number, 10);
            if (Number.isNaN(numA) || Number.isNaN(numB)) return 0;
            return numA - numB;
        });
    }

    inlineReferenceText(field) {
        const label = (field?.label && typeof field.label === 'object') ? Object.values(field.label)[0] : field?.label;
        return this.stripHtml(field?.name ?? label ?? field?.value ?? '');
    }

    normalizeInlineReferenceText(value) {
        return this.stripHtml(value).trim().toLowerCase();
    }

    inlineAnswerLabel(answer, lang) {
        const label = (answer?.label && typeof answer.label === 'object') ? (answer.label?.[lang] ?? Object.values(answer.label)[0]) : answer?.label;
        return this.stripHtml(label ?? answer?.name ?? answer?.value ?? '');
    }

    decorateInlineQuestionReferencePreview(hDataBlock, lang, previewHtml) {
        if (!['inline_textfields', 'inline_gaps'].includes(hDataBlock?.type)) return previewHtml;

        const fields = this.inlineReferenceFields(hDataBlock, lang);
        if (fields.length === 0 && hDataBlock.type !== 'inline_gaps') return previewHtml;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = previewHtml;
        const selector = hDataBlock.type === 'inline_textfields' ? '.previewTag_inlineText' : '.previewTag_inlineGap';
        const targets = [...wrapper.querySelectorAll(selector)];

        fields.forEach((field, fallbackIdx) => {
            const fieldText = this.inlineReferenceText(field);
            if (fieldText === '') return;

            const fieldIdx = parseInt(field?.number, 10) - 1;
            const target = targets[Number.isNaN(fieldIdx) ? fallbackIdx : fieldIdx];
            if (!target) return;

            target.textContent = fieldText;
            target.classList.add('msQuestionReferenceField');
            target.setAttribute('title', `${UILANG.m("Initial answer")}: ${fieldText}`);
            target.style.width = 'auto';
        });

        if (hDataBlock.type === 'inline_gaps') {
            this.decorateInlineGapDistractors(wrapper, hDataBlock, lang, fields);
        }

        return wrapper.innerHTML;
    }

    decorateInlineGapDistractors(wrapper, hDataBlock, lang, fields) {
        const stock = wrapper.querySelector('.previewTag_inlineDraggableStock');
        if (!stock) return;

        const correctValues = new Set(fields.flatMap(field => [
            this.inlineReferenceText(field),
            field?.value,
            field?.number
        ].map(value => this.normalizeInlineReferenceText(value))).filter(Boolean));
        const distractors = this.choiceCollectionEntries(hDataBlock.answers)
            .map(answer => {
                return {
                    label: this.inlineAnswerLabel(answer, lang),
                    value: this.stripHtml(answer?.value ?? '')
                };
            })
            .filter(answer => {
                if (answer.label === '') return false;
                return !correctValues.has(this.normalizeInlineReferenceText(answer.label))
                    && !correctValues.has(this.normalizeInlineReferenceText(answer.value));
            });

        if (distractors.length === 0) {
            stock.remove();
            return;
        }

        stock.innerHTML = '';
        stock.classList.add('msQuestionDistractorStock');

        const label = document.createElement('span');
        label.className = 'msQuestionDistractorLabel';
        label.textContent = UILANG.m("Distractors");
        stock.appendChild(label);

        distractors.forEach(answer => {
            const chip = document.createElement('span');
            chip.className = 'msQuestionDistractorChip';
            chip.textContent = answer.label;
            if (answer.value !== '') chip.setAttribute('title', answer.value);
            stock.appendChild(chip);
        });
    }

    choiceDropdownReferenceEntries(hDataBlock, lang) {
        const choices = this.choiceCollectionEntries(hDataBlock?.choices).map(choice => {
            const label = (choice?.label && typeof choice.label === 'object') ? (choice.label?.[lang] ?? Object.values(choice.label)[0]) : choice?.label;
            return {
                label: this.stripHtml(label ?? choice?.name ?? choice?.value ?? ''),
                value: this.stripHtml(choice?.value ?? '')
            };
        }).filter(choice => choice.label !== '');

        if (hDataBlock?.order === 'alphabet') {
            choices.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
        }

        return choices;
    }

    decorateChoiceDropdownQuestionReferencePreview(hDataBlock, lang, previewHtml) {
        if (hDataBlock?.type !== 'choice' || hDataBlock?.choiceType !== 'dropdown') return previewHtml;

        const choices = this.choiceDropdownReferenceEntries(hDataBlock, lang);
        if (choices.length === 0) return previewHtml;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = previewHtml;
        const dropdown = wrapper.querySelector('.previewTag_DD');
        if (!dropdown) return previewHtml;

        dropdown.classList.add('msQuestionChoiceDropdownReference');
        dropdown.innerHTML = `<span>${UILANG.m("Choices")}</span><span>&#9660;</span>`;

        const list = document.createElement('div');
        list.className = 'msQuestionChoiceDropdownList';

        choices.forEach(choice => {
            const row = document.createElement('span');
            row.className = 'msQuestionChoiceDropdownItem';
            row.textContent = choice.label;
            if (choice.value !== '') row.setAttribute('title', choice.value);
            list.appendChild(row);
        });

        dropdown.insertAdjacentElement('afterend', list);
        return wrapper.innerHTML;
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
        this.item_switch(pdd, "clicked", false, this.itemName);
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

    escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, function(char) {
            return ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            })[char];
        });
    }

    stripHtml(str) {
        const el = document.createElement('div');
        el.innerHTML = String(str ?? '');
        return el.textContent || el.innerText || '';
    }

    responseHasAnswer(answer) {
        if (typeof answer === 'undefined' || answer === null) return false;
        if (answer === '' || answer === '[]') return false;
        if (Array.isArray(answer) && answer.length === 0) return false;
        if (typeof answer === 'object' && Object.keys(answer).length === 0) return false;
        return true;
    }

    responseAnswerValues(answer) {
        if (!this.responseHasAnswer(answer)) return [];
        if (Array.isArray(answer)) return answer.flatMap(v => this.responseAnswerValues(v));
        if (typeof answer === 'object') {
            return Object.entries(answer).flatMap(([key, value]) => {
                if (value === true || value === 'true' || value === 1) return [String(key)];
                if (value === false || value === 'false' || value === 0) return [];
                return this.responseAnswerValues(value);
            });
        }
        if (typeof answer !== 'string') return [String(answer)];

        try {
            const parsed = JSON.parse(answer);
            if (Array.isArray(parsed) || (parsed !== null && typeof parsed === 'object')) return this.responseAnswerValues(parsed);
            if (parsed !== null) return [String(parsed)];
        } catch (_e) {
            // Plain scalar answer, keep as-is.
        }
        return [answer];
    }

    responseValueCandidates(value) {
        const valueStr = String(value);
        const candidates = new Set([valueStr]);

        candidates.add(this.str2hex(valueStr));
        if (/^[0-9a-f]+$/i.test(valueStr) && valueStr.length % 2 === 0) {
            candidates.add(this.hex2str(valueStr));
        }

        return candidates;
    }

    addChoiceEntryCandidates(candidates, entry, lang) {
        if (!entry || typeof entry !== 'object') return candidates;

        if (typeof entry.value !== 'undefined') {
            this.responseValueCandidates(entry.value).forEach(candidate => candidates.add(candidate));
        }

        const label = (typeof entry.label === 'object') ? (entry.label?.[lang] ?? Object.values(entry.label)[0]) : entry.label;
        if (typeof label !== 'undefined') {
            this.responseValueCandidates(label).forEach(candidate => candidates.add(candidate));
        }

        if (typeof entry.name !== 'undefined') {
            this.responseValueCandidates(entry.name).forEach(candidate => candidates.add(candidate));
        }

        return candidates;
    }

    choiceCollectionEntries(collection) {
        if (Array.isArray(collection)) return collection;
        if (collection && typeof collection === 'object') return Object.values(collection);
        return [];
    }

    responseExpandedCandidates(value, collection = [], lang) {
        const candidates = this.responseValueCandidates(value);

        for (const entry of this.choiceCollectionEntries(collection)) {
            const entryCandidates = this.addChoiceEntryCandidates(new Set(), entry, lang);
            if ([...entryCandidates].some(candidate => candidates.has(candidate))) {
                entryCandidates.forEach(candidate => candidates.add(candidate));
            }
        }

        return candidates;
    }

    candidateSetsOverlap(a, b) {
        return [...a].some(candidate => b.has(candidate));
    }

    choiceMatrixRowMatchData(hDataBlock, item, lang) {
        const rowSeedValues = [
            hDataBlock.cmtx_row,
            (typeof hDataBlock.id !== 'undefined') ? String(item).replace(`${hDataBlock.id}_`, '') : null
        ].filter(value => value !== null && typeof value !== 'undefined' && value !== '');
        const rowCandidates = new Set(rowSeedValues.flatMap(value => [...this.responseExpandedCandidates(value, hDataBlock.rows, lang)]));
        const rowIndexes = new Set();
        const rowNumberMatch = String(item).match(/_row_(\d+)$/);
        if (rowNumberMatch) {
            const rowIndex = parseInt(rowNumberMatch[1], 10) - 1;
            if (!Number.isNaN(rowIndex) && rowIndex >= 0) rowIndexes.add(rowIndex);
        }

        this.choiceCollectionEntries(hDataBlock.rows).forEach((row, idx) => {
            const rowEntryCandidates = this.addChoiceEntryCandidates(new Set(), row, lang);
            const rowValue = String(row.value ?? '');
            const itemStr = String(item);

            if (
                this.candidateSetsOverlap(rowCandidates, rowEntryCandidates) ||
                (rowValue !== '' && itemStr.endsWith(`_${rowValue}`)) ||
                (rowValue !== '' && itemStr.endsWith(`_${this.str2hex(rowValue)}`))
            ) {
                rowIndexes.add(idx);
                rowEntryCandidates.forEach(candidate => rowCandidates.add(candidate));
            }
        });

        return { rowCandidates, rowIndexes };
    }

    choiceMatrixCellMatchesRow($cell, hDataBlock, lang, rowMatchData) {
        const group = $cell.attr('data-group');
        if (typeof group !== 'undefined') {
            const cellRowCandidates = this.responseExpandedCandidates(group, hDataBlock.rows, lang);
            if (this.candidateSetsOverlap(rowMatchData.rowCandidates, cellRowCandidates)) return true;
        }

        const rowIndex = parseInt($cell.attr('data-row'), 10);
        return !Number.isNaN(rowIndex) && rowMatchData.rowIndexes.has(rowIndex);
    }

    choiceMatrixCellValueCandidates($cell, hDataBlock, lang) {
        const candidates = new Set();
        const cellValue = $cell.attr('data-value');

        if (typeof cellValue !== 'undefined') {
            this.responseExpandedCandidates(cellValue, hDataBlock.labels, lang).forEach(candidate => candidates.add(candidate));
        }

        const innerValue = $cell.find('[data-value]').first().attr('data-value');
        if (typeof innerValue !== 'undefined') {
            this.responseExpandedCandidates(innerValue, hDataBlock.labels, lang).forEach(candidate => candidates.add(candidate));
        }

        const colIndex = parseInt($cell.attr('data-col'), 10);
        if (!Number.isNaN(colIndex) && hDataBlock.labels?.[colIndex]) {
            this.addChoiceEntryCandidates(candidates, hDataBlock.labels[colIndex], lang);
        }

        return candidates;
    }

    choiceMatrixRowIndexFromItem(item) {
        const rowNumberMatch = String(item).match(/_row_(\d+)$/);
        if (!rowNumberMatch) return null;

        const rowIndex = parseInt(rowNumberMatch[1], 10) - 1;
        return (!Number.isNaN(rowIndex) && rowIndex >= 0) ? rowIndex : null;
    }

    choiceMatrixRowCells($root, hDataBlock, item, lang, rowMatchData) {
        const itemId = this.str2hex(item);
        const $itemRoot = $root.filter(`#q_item_${itemId}, #r_item_${itemId}`)
            .add($root.find(`#q_item_${itemId}, #r_item_${itemId}`))
            .first();
        const $searchRoot = ($itemRoot.length > 0) ? $itemRoot : $root;

        let $rowCells = $searchRoot.find('.matrixChoiceCell').filter((_, cell) => {
            return this.choiceMatrixCellMatchesRow($(cell), hDataBlock, lang, rowMatchData);
        });

        if ($rowCells.length === 0) {
            const rowIndex = this.choiceMatrixRowIndexFromItem(item);
            if (rowIndex !== null) {
                $rowCells = $searchRoot.find('.matrixRow, .matrixChoicesRow').eq(rowIndex).find('.matrixChoiceCell');
            }
        }

        return $rowCells;
    }

    choiceMatrixCellColumnIndex($cell) {
        const colIndex = parseInt($cell.attr('data-col'), 10);
        if (!Number.isNaN(colIndex)) return colIndex;

        const $choiceRow = $cell.closest('.matrixHeader');
        if ($choiceRow.length > 0) {
            const positionalIndex = $choiceRow.find('.matrixChoiceCell').index($cell);
            if (positionalIndex >= 0) return positionalIndex;
        }

        const $matrixRow = $cell.closest('.matrixRow, .matrixChoicesRow');
        if ($matrixRow.length > 0) {
            const positionalIndex = $matrixRow.find('.matrixChoiceCell').index($cell);
            if (positionalIndex >= 0) return positionalIndex;
        }

        return null;
    }

    choiceMatrixCellTitle($cell, hDataBlock, lang) {
        const rowIndex = parseInt($cell.attr('data-row'), 10);
        const colIndex = this.choiceMatrixCellColumnIndex($cell);
        const rows = this.choiceCollectionEntries(hDataBlock.rows);
        const labels = this.choiceCollectionEntries(hDataBlock.labels);
        const row = !Number.isNaN(rowIndex) ? rows[rowIndex] : null;
        const label = colIndex !== null ? labels[colIndex] : null;
        const rowLabel = row ? this.responseAnswerLabel({ rows: [row] }, row.value, lang) : ($cell.attr('data-group') ?? '');
        const valueLabel = label ? this.responseAnswerLabel({ labels: [label] }, label.value, lang) : ($cell.attr('data-value') ?? $cell.find('[data-value]').first().attr('data-value') ?? '');

        return `${rowLabel}${rowLabel && valueLabel ? ': ' : ''}${valueLabel}`;
    }

    choiceMatrixSelectedLabelIndexes(values, labels, lang) {
        const selected = new Set(values.flatMap(value => [...this.responseExpandedCandidates(value, labels, lang)]));
        const selectedIndexes = new Set();

        this.choiceCollectionEntries(labels).forEach((label, idx) => {
            const labelCandidates = this.addChoiceEntryCandidates(new Set(), label, lang);
            if (this.candidateSetsOverlap(selected, labelCandidates)) selectedIndexes.add(idx);
        });

        return selectedIndexes;
    }

    responseAnswerLabel(hDataBlock, value, lang) {
        const valueStr = this.stripHtml(value);
        const choiceCollections = [
            hDataBlock?.choices,
            hDataBlock?.labels,
            hDataBlock?.answers,
            hDataBlock?.rows
        ];

        for (const collection of choiceCollections) {
            const match = this.choiceCollectionEntries(collection).find(entry => String(entry.value) === valueStr || this.str2hex(String(entry.value)) === valueStr);
            if (match) {
                const label = (typeof match.label === 'object') ? match.label?.[lang] : match.label;
                return this.stripHtml(label ?? match.name ?? match.value ?? valueStr);
            }
        }

        return valueStr;
    }

    responseCorrectnessClass(pdd, item) {
        if (pdd.scoringInfo?.[item]?.itemScoreType !== "auto") return '';

        const earned = parseFloat(pdd.scoringInfo[item].earned);
        const max = parseFloat(pdd.assignmentStruct?.[item]?.posPts);
        if (Number.isNaN(earned) || Number.isNaN(max)) return '';

        return earned >= max ? 'msResponseCorrect' : 'msResponseWrong';
    }

    responseRawHtml(answer, hDataBlock, lang) {
        const values = this.responseAnswerValues(answer);
        if (values.length === 0) return '';

        return /* html */ `
            <div class="msResponseRaw">
                <span>${UILANG.m("Recorded value")}</span>
                ${values.map(value => {
                    const label = this.responseAnswerLabel(hDataBlock, value, lang);
                    return `<strong title="${this.escapeHtml(value)}">${this.escapeHtml(label)}</strong>`;
                }).join('')}
            </div>
        `;
    }

    responseNoAnswerHtml(loginName, missing = false) {
        const msg = missing ? UILANG.m("did not answer this item") : UILANG.m("left this item blank");
        return /* html */ `
            <div class="msResponseEmpty">
                <div class="msResponseEmptyIcon">!</div>
                <div class="msResponseEmptyText">
                    <strong>${this.escapeHtml(loginName)}</strong>
                    <span>${msg}</span>
                </div>
            </div>
        `;
    }

    responseLang(hDataBlock, pdd, item = '') {
        return this.previewLangForItem(hDataBlock, pdd, item);
    }

    previewLangForItem(hDataBlock, pdd, item = '') {
        const languages = this.previewLanguagesForBlock(hDataBlock);
        if (languages.length === 0) return '';
        const answerLang = pdd?.scoringInfo?.[item]?.givenAnswerLanguage ?? '';
        return this.matchPreviewLanguage(languages, answerLang)
            || this.matchPreviewLanguage(languages, this.testLang)
            || this.matchPreviewLanguage(languages, pdd?.languages?.[0])
            || languages[0];
    }

    previewLanguagesForBlock(hDataBlock) {
        if (hDataBlock?.question && typeof hDataBlock.question === 'object') return Object.keys(hDataBlock.question);
        if (hDataBlock?.source && typeof hDataBlock.source === 'object') return Object.keys(hDataBlock.source);
        return [];
    }

    matchPreviewLanguage(languages, preferred) {
        if (!preferred) return '';
        if (languages.includes(preferred)) return preferred;
        const normalizedPreferred = this.normalizeLanguageKey(preferred);
        return languages.find(lang => this.normalizeLanguageKey(lang) === normalizedPreferred) || '';
    }

    normalizeLanguageKey(lang) {
        return String(lang || '').trim().replace('-', '_').toLowerCase();
    }

    answerLanguageLabel(pdd, item, hDataBlock) {
        return pdd?.scoringInfo?.[item]?.givenAnswerLanguage || '';
    }

    updateResponseLanguageLabel(pdd, item, hDataBlock) {
        const lang = this.answerLanguageLabel(pdd, item, hDataBlock);
        $('#rItemLang').html(lang ? `<span>${UILANG.m('Answer language')}: ${this.escapeHtml(lang)}</span>` : '');
    }

    responsePreviewHtml(pdd, hDataBlock, lang, item, sItem) {
        if (!hDataBlock) return '';
        if (hDataBlock.type === "conceptmap") return '';
        if (typeof lang === 'undefined') return '';

        const ef = new EditorFactory();
        const theEditor = ef.getEditorClass(hDataBlock.type);
        if (!theEditor || typeof theEditor.generatePreview !== 'function') return '';
        let forceWidth = 1024;
        const itemIndex = pdd.items.indexOf(item);
        if (pdd.itemType[itemIndex] === 'oasysSlider') forceWidth = Math.max(260, Math.floor($('#ms_answerArea').width()) - 22);
        if (pdd.itemType[itemIndex] === 'oasysSlikert') forceWidth = Math.max(260, Math.floor($('#ms_answerArea').width()));

        let html = theEditor.generatePreview(hDataBlock, lang, { maxWidth: forceWidth, skipShuffling: true });
        html = html.replaceAll('_preview', `_response_${sItem}`);
        return html;
    }

    renderResponsePreview(pdd, item, hDataBlock, i) {
        const sItem = this.str2hex(item);
        const answer = scoring.answerSet[item];
        const correctnessClass = this.responseCorrectnessClass(pdd, item);
        const $answerBody = this.answerPaneBody();

        if (typeof answer === "undefined") {
            $answerBody.append(/* html */ `<div id='r_item_${sItem}' class="${correctnessClass}">${this.responseNoAnswerHtml(pdd.loginName, true)}</div>`);
            return;
        }

        if (!this.responseHasAnswer(answer)) {
            $answerBody.append(/* html */ `<div id='r_item_${sItem}' class="${correctnessClass}">${this.responseNoAnswerHtml(pdd.loginName)}</div>`);
            return;
        }

        const lang = this.responseLang(hDataBlock, pdd, item);
        const previewHtml = this.responsePreviewHtml(pdd, hDataBlock, lang, item, sItem);
        if (previewHtml === '') {
            $answerBody.append(/* html */ `<div id='r_item_${sItem}' class="${correctnessClass}">${this.responseRawHtml(answer, hDataBlock, lang)}</div>`);
            return;
        }

        $answerBody.append(/* html */ `
            <div id='r_item_${sItem}' class="msResponsePreviewWrap ${correctnessClass}">
                <div class="msResponsePreview">${previewHtml}</div>
            </div>
        `);

        const decorated = this.decorateResponsePreview($(`#r_item_${sItem}`), answer, hDataBlock, item, i, lang);
        if (!decorated) {
            $(`#r_item_${sItem}`).append(this.responseRawHtml(answer, hDataBlock, lang));
        }
    }

    decorateResponsePreview($target, answer, hDataBlock, item, i, lang) {
        const values = this.responseAnswerValues(answer);
        if (values.length === 0) return false;

        switch (hDataBlock.type) {
            case 'textfield':
                return this.decorateResponseText($target.find('.previewTag_TF').first(), values[0], item);
            case 'textarea':
                return this.decorateResponseTextarea($target, values[0], item);
            case 'inline_textfields':
                return this.decorateResponseInlineText($target, values[0], item);
            case 'inline_gaps':
                return this.decorateResponseInlineGap($target, values[0], hDataBlock, item, lang);
            case 'choice':
                return this.decorateResponseChoice($target, values, hDataBlock, lang);
            case 'choicematrix':
                return this.decorateResponseChoiceMatrix($target, values, hDataBlock, item, lang);
            case 'slider':
                return this.decorateResponseSlider($target, values[0], hDataBlock);
            case 'slikert':
                return this.decorateResponseSlikert($target, values[0], hDataBlock);
            default:
                return false;
        }
    }

    decorateResponseText($field, value, item) {
        if ($field.length === 0) return false;
        const displayValue = String(value);
        const fieldWidth = Math.max(8, Math.min(90, displayValue.length + 2));
        $field
            .addClass('msResponseFilledField')
            .attr('title', `${item}: ${value}`);
        if ($field.is('input, textarea')) {
            $field
                .val(displayValue)
                .css({
                    width: `min(${fieldWidth}ch, 100%)`,
                    maxWidth: '100%'
                });
        } else {
            $field.text(displayValue);
        }
        return true;
    }

    decorateResponseTextarea($target, value, item) {
        const $textarea = $target.find('textarea').first();
        if ($textarea.length === 0) return false;
        $textarea
            .addClass('msResponseTextarea')
            .attr('title', `${item}: ${value}`)
            .val(value);
        return true;
    }

    decorateResponseInlineText($target, value, item) {
        const subIdx = parseInt(String(item).match(/\d+$/)?.[0] ?? '1', 10) - 1;
        return this.decorateResponseText($target.find('.previewTag_inlineText').eq(subIdx), value, item);
    }

    decorateResponseInlineGap($target, value, hDataBlock, item, lang) {
        const subIdx = parseInt(String(item).match(/\d+$/)?.[0] ?? '1', 10) - 1;
        const label = this.responseAnswerLabel(hDataBlock, value, lang);
        const $gap = $target.find('.previewTag_inlineGap').eq(subIdx);
        if ($gap.length === 0) return false;
        $gap
            .addClass('msResponseFilledField')
            .attr('title', `${item}: ${value}`)
            .text(label);
        if (!$target.hasClass('msQuestionCorrectPreview') && $target.closest('.msQuestionCorrectPreview').length === 0) {
            $target.find('.previewTag_inlineDraggableStock').remove();
        }
        return true;
    }

    decorateResponseChoice($target, values, hDataBlock, lang) {
        if (hDataBlock.choiceType === 'dropdown') {
            const label = this.responseAnswerLabel(hDataBlock, values[0], lang);
            const $dropdown = $target.find('.previewTag_DD').first();
            if ($dropdown.length === 0) return false;
            $dropdown
                .addClass('msResponseDropdown')
                .attr('title', values[0])
                .html(`${this.escapeHtml(label)} <span>&#9660;</span>`);
            return true;
        }

        const selected = new Set(values.flatMap(value => [...this.responseValueCandidates(value)]));
        let choices = deepCopy(hDataBlock.choices ?? []);
        if (hDataBlock.order === 'alphabet') {
            orderArrayByProperty(choices, 'label', lang);
        }

        let didDecorate = false;
        const $cells = $target.find('.choiceCell, .choiceCellInline');
        choices.forEach((choice, idx) => {
            const value = String(choice.value);
            if (!selected.has(value) && !selected.has(this.str2hex(value))) return;
            const $cell = $cells.eq(idx);
            if ($cell.length === 0) return;
            $cell.addClass('msResponseSelectedChoice').attr('title', `${value}`);
            $cell.find('.previewTag_RB, .previewTag_CB').first().addClass('msResponseChecked');
            didDecorate = true;
        });
        return didDecorate;
    }

    decorateResponseChoiceMatrix($target, values, hDataBlock, item, lang) {
        const selected = new Set(values.flatMap(value => [...this.responseExpandedCandidates(value, hDataBlock.labels, lang)]));
        const selectedLabelIndexes = this.choiceMatrixSelectedLabelIndexes(values, hDataBlock.labels, lang);
        const rowMatchData = this.choiceMatrixRowMatchData(hDataBlock, item, lang);

        let didDecorate = false;

        this.choiceMatrixRowCells($target, hDataBlock, item, lang, rowMatchData).each((_, cell) => {
            const $cell = $(cell);
            const cellValueCandidates = this.choiceMatrixCellValueCandidates($cell, hDataBlock, lang);
            const colIndex = this.choiceMatrixCellColumnIndex($cell);
            const valueMatches = this.candidateSetsOverlap(selected, cellValueCandidates) || (colIndex !== null && selectedLabelIndexes.has(colIndex));
            if (!valueMatches) return;
            $cell
                .addClass('msResponseSelectedChoice')
                .attr('title', this.choiceMatrixCellTitle($cell, hDataBlock, lang));
            $cell.find('.previewTag_RB, .previewTag_CB').first().addClass('msResponseChecked');
            $cell.find('.oasysRadioButton, .oasysCheckBox').first().addClass('msResponseChecked');
            $cell.closest('.matrixRow, .matrixChoicesRow').removeClass('ms_cmtrx_inactive').addClass('ms_cmtrx_active');
            didDecorate = true;
        });

        return didDecorate;
    }

    decorateResponseSlider($target, value, hDataBlock) {
        const numericValue = parseFloat(value);
        if (Number.isNaN(numericValue)) return this.decorateResponseNoReply($target, value);
        const displayValue = this.formatScoreNumber(numericValue);

        const min = parseFloat(hDataBlock.min);
        const max = parseFloat(hDataBlock.max);
        const $frame = $target.find('.sliderFrame').first();
        const $handle = $target.find('[id^="sliderHandle_"]').first();
        if ($frame.length === 0 || $handle.length === 0 || Number.isNaN(min) || Number.isNaN(max) || max <= min) return false;

        const trackLength = $frame.width() || parseFloat($frame.css('width')) || 300;
        const r0 = 24;
        const x = Math.round((numericValue - min) * ((trackLength - 2 * r0) / (max - min)) + r0);
        $handle.attr('transform', `translate(${x})`).addClass('msResponseSliderHandle');
        $target.find('.sliderTooltip').text(displayValue);
        $target.find('.sliderTooltipFrame').css('margin-left', `${Math.max(0, x - 24)}px`);
        this.appendResponseValueBadge($frame, displayValue, value);
        return true;
    }

    decorateResponseSliderRange($target, range, hDataBlock) {
        const min = parseFloat(hDataBlock.min);
        const max = parseFloat(hDataBlock.max);
        const $frame = $target.find('.sliderFrame').first();
        if ($frame.length === 0 || Number.isNaN(min) || Number.isNaN(max) || max <= min) return false;

        const trackLength = $frame.width() || parseFloat($frame.css('width')) || 300;
        const r0 = 24;
        const clampedFrom = Math.max(min, Math.min(max, range.from));
        const clampedTo = Math.max(min, Math.min(max, range.to));
        const xFrom = Math.round((clampedFrom - min) * ((trackLength - 2 * r0) / (max - min)) + r0);
        const xTo = Math.round((clampedTo - min) * ((trackLength - 2 * r0) / (max - min)) + r0);
        this.appendResponseRangeMarker($frame, xFrom, xTo, range);
        return true;
    }

    decorateResponseSlikert($target, value, hDataBlock) {
        const numericValue = parseFloat(value);
        if (Number.isNaN(numericValue)) return this.decorateResponseNoReply($target, value);

        const min = parseFloat(hDataBlock.min);
        const max = parseFloat(hDataBlock.max);
        const step = parseFloat(hDataBlock.step);
        const $frame = $target.find('.slikertFrame').first();
        const $handle = $target.find('[id^="slikertHandle_"]').first();
        const $track = $target.find('.slikertTrackBack').first();
        if ($frame.length === 0 || $handle.length === 0 || $track.length === 0 || Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(step) || step <= 0) return false;

        const valueCount = Math.floor((max - min) / step + 1);
        const valueIndex = Math.max(0, Math.min(valueCount - 1, Math.round((numericValue - min) / step)));
        const r0 = 24;
        const trackWidth = $track.width() || parseFloat($track.css('width')) || parseFloat($track.attr('width')) || 300;
        const x = valueCount > 1 ? Math.round(r0 + valueIndex * ((trackWidth - 2 * r0) / (valueCount - 1))) : r0;
        const labelOffset = hDataBlock.labelPosition === 'outside' ? parseFloat(hDataBlock.labelWidth || 0) + 10 : 0;
        $handle.attr('transform', `translate(${x})`).addClass('msResponseSliderHandle');
        $target.find('.slikertTooltip').text(numericValue);
        $target.find('.slikertTooltipFrame').css('margin-left', `${Math.max(0, labelOffset + x - 24)}px`);
        this.appendResponseValueBadge($frame, numericValue, value);
        return true;
    }

    decorateResponseSlikertRange($target, range, hDataBlock) {
        const min = parseFloat(hDataBlock.min);
        const max = parseFloat(hDataBlock.max);
        const step = parseFloat(hDataBlock.step);
        const $frame = $target.find('.slikertFrame').first();
        const $track = $target.find('.slikertTrackBack').first();
        if ($frame.length === 0 || $track.length === 0 || Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(step) || step <= 0) return false;

        const valueCount = Math.floor((max - min) / step + 1);
        const trackWidth = $track.width() || parseFloat($track.css('width')) || parseFloat($track.attr('width')) || 300;
        const r0 = 24;
        const labelOffset = hDataBlock.labelPosition === 'outside' ? parseFloat(hDataBlock.labelWidth || 0) + 10 : 0;
        const valueToX = (value) => {
            const clampedValue = Math.max(min, Math.min(max, value));
            const valueIndex = Math.max(0, Math.min(valueCount - 1, Math.round((clampedValue - min) / step)));
            return valueCount > 1 ? Math.round(labelOffset + r0 + valueIndex * ((trackWidth - 2 * r0) / (valueCount - 1))) : labelOffset + r0;
        };
        this.appendResponseRangeMarker($frame, valueToX(range.from), valueToX(range.to), range);
        return true;
    }

    decorateResponseNoReply($target, value) {
        const $noReply = $target.find('.sliderNoReplyFrame, .slikertNoReplyFrame').first();
        if ($noReply.length === 0) return false;
        $noReply.addClass('msResponseSelectedChoice').attr('title', value);
        $noReply.find('.previewTag_CB').first().addClass('msResponseChecked');
        return true;
    }

    appendResponseValueBadge($frame, label, rawValue) {
        $frame.append(/* html */ `<div class="msResponseValueBadge" title="${this.escapeHtml(rawValue)}">${this.escapeHtml(label)}</div>`);
    }

    appendResponseRangeMarker($frame, xFrom, xTo, range) {
        const left = Math.max(0, Math.min(xFrom, xTo));
        const width = Math.max(8, Math.abs(xTo - xFrom));
        const label = `${range.from} - ${range.to}`;
        $frame
            .addClass('msResponseRangeFrame')
            .append(/* html */ `<div class="msResponseRangeMarker" style="left:${left}px;width:${width}px;" title="${this.escapeHtml(label)}"><span>${this.escapeHtml(label)}</span></div>`);
    }

    activateManualScoringTooltips(root = '#ms_questionArea, #ms_answerArea, #scoreAssignmentContainer') {
        if (typeof $.fn.tooltip !== 'function') return;
        const $targets = $(root).find('[title]').filter(function() {
            return $(this).attr('title') !== '';
        });

        if ($targets.length === 0) return;

        try {
            $targets.tooltip('destroy');
        } catch (_e) {
            // Some nodes may not have an initialized tooltip yet.
        }

        $targets.tooltip({
            track: true,
            position: {
                my: "left+18 top+18",
                at: "right bottom",
                collision: "flipfit"
            },
            classes: {
                "ui-tooltip-content": "uitt-upgrader"
            }
        });
    }

    async removeComment(pdd) {

        let cmtRemObj = {
            pageId: parseInt(this.pageId),
            itemName: this.itemName,
            passwordId: pdd.passwordId,
            testId: pdd.testId,
            expectedCommentVersion: pdd.comments?.[this.itemName]?.version ?? null,
            expectedCommentTime: pdd.comments?.[this.itemName]?.commentTime ?? null,
            expectedCommentString: pdd.comments?.[this.itemName]?.commentString ?? null,
            expectedCommentById: pdd.comments?.[this.itemName]?.commentById ?? null
        };

        await results_startAjax('scoringRemComment', cmtRemObj).then((res) => {
            if (res.error) {
                if (res.reloadScoringDetail) pageLoader(true);
                return;
            }
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
            testId: pdd.testId,
            expectedCommentVersion: pdd.comments?.[this.itemName]?.version ?? null,
            expectedCommentTime: pdd.comments?.[this.itemName]?.commentTime ?? null,
            expectedCommentString: pdd.comments?.[this.itemName]?.commentString ?? null,
            expectedCommentById: pdd.comments?.[this.itemName]?.commentById ?? null
        };

        await results_startAjax('scoringAddComment', cmtSaveObj).then((res) => {
            if (res.error) {
                if (res.reloadScoringDetail) pageLoader(true);
                return;
            }
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
            if (scoring.readOnly || $(this).val().length === 0) {
                scoring.cmt_saveEntry.disable();
            } else {
                scoring.cmt_saveEntry.enable();
            }
        });

        // comment field handler for keyboard shortcut (alt+s) to save comment
        $('#scoringCmt').on('keydown', async (e) => {
            if (!scoring.readOnly && e.originalEvent.altKey && (e.originalEvent.code === "KeyS" || e.originalEvent.key.toLowerCase() === "s") && $('#scoringCmt').val().length > 0) {
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

    questionPaneBody() {
        const $body = $('#ms_questionScrollBody');
        return $body.length > 0 ? $body : $('#ms_questionArea');
    }

    answerPaneBody() {
        const $body = $('#ms_answerScrollBody');
        return $body.length > 0 ? $body : $('#ms_answerArea');
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
            score: this.newScore,
            expectedScoreVersion: pdd.scoredByInfo?.[itemName]?.version ?? null,
            expectedScoreTime: pdd.scoredByInfo?.[itemName]?.scoreTime ?? null,
            expectedScoreValue: pdd.scoredByInfo?.[itemName]?.scoreValue ?? null,
            expectedScoreById: pdd.scoredByInfo?.[itemName]?.scoreById ?? null
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
        pdd.unfilteredScoredByInfo = deepCopy(pdd.scoredByInfo ?? {});
        pdd.unfilteredScoringInfo = deepCopy(pdd.scoringInfo ?? {});

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
        const submittedStatusColor = 'success';
        const normalizeStatusColor = color => ['#00008b', '#2d8db6'].includes(String(color).toLowerCase()) ? submittedStatusColor : color;
        let tl_color = Object.keys(pdd.tl_msg)[0];
        let tl_message = Object.values(pdd.tl_msg)[0];
        const statusBarColor = normalizeStatusColor(tl_color);

        // set statusBar message/color
        function activityStatusBarUpdate(message, color) {
            gui.statusBar.setStatus("<strong>" + message + "</strong>", false, color);
        }

        activityStatusBarUpdate(tl_message, statusBarColor);
        this.readOnly = (tl_color === 'red') || this.readOnlyByPermission;

        if (tl_color === 'red' && this.readOnlyByPermission) {
            if (this.viewType === 't') this.alreadyInRO = true;
            return;
        }

        /* routine to determine and handle tests which are not in 'submitted' status */
        if ((tl_color === 'red' && this.alreadyInRO === false) || (tl_color === 'red' && this.viewType === 'q')) {
            this.readOnly = true;

            await new nxDialog('submitConfirm', {
                title: UILANG.m("Non-submitted test confirmation"),
                contents: /* html */ `
                            <div class="msSubmitDialog">
                                <div class="msDialogMessage msDialogMessage-warning">
                                    <div class="msDialogBadge">!</div>
                                    <div class="msDialogCopy">
                                        <strong>${tl_message}</strong>
                                        <p>${UILANG.m("Select how you would like to proceed")}:</p>
                                    </div>
                                </div>
                            </div>
                        `,
                width: 520,
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
                        const resColor = Object.keys(res2.tl_msg)[0];
                        const resStatusBarColor = normalizeStatusColor(resColor);
                        activityStatusBarUpdate(Object.values(res2.tl_msg)[0], resStatusBarColor);
                        if (Object.keys(res2.tl_msg[0] === "blue")) {
                            this.alreadyInRO = false;
                            this.readOnly = this.readOnlyByPermission;
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
                this.answerPaneBody().append(/* html */ `<div id='r_item_${sItem}'></div>`);

                if (pdd.scoringInfo[item].givenAnswers.length === 0) { // no answer processing
                    cmResObj.data = this.cmBase[this.pageId][item];
                    $(`#r_item_${sItem}`).append(this.responseNoAnswerHtml(pdd.loginName));
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
                this.renderResponsePreview(pdd, item, pdd.htmlPreview[_i], _i);
            }
        }

        this.activateManualScoringTooltips();
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
        const initialIdx = pdd.items.indexOf(scoring.itemName);
        this.updateResponseLanguageLabel(pdd, scoring.itemName, pdd.htmlPreview[initialIdx]);

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
        const qLabelStr = /* html */ `<div class="ms_qa_title"><div>${UILANG.m("QUESTION")} </div><div id="qItemLabel"></div></div>`;
        const ansLabelStr = /* html */ `<div class="ms_qa_title"><div>${UILANG.m("RESPONSE")} </div><div id="rItemLabel"></div><div id="rItemLang"></div></div>`;

        // question + answer headers
        $('#ms_questionArea').append( /* html */ `<div class="ms_qa_header">${qLabelStr}</div><div id="ms_questionScrollBody" class="msPaneScrollBody">${this.pHtml}</div>`);
        $('#ms_answerArea').append( /* html */ `<div class="ms_qa_header">${ansLabelStr}</div><div id="ms_answerScrollBody" class="msPaneScrollBody"></div>`);

        // set double click handler to max out question box
        let this_2 = this;
        $('#ms_questionArea, #ms_answerArea').on("dblclick", function() {
            this_2.toggleFullScr(this);
        });

        this.setupPaneScrollSync();
    }

    setupPaneScrollSync() {
        const $panes = $('#ms_questionScrollBody, #ms_answerScrollBody');
        let syncing = false;

        $panes.off('scroll.msPaneSync').on('scroll.msPaneSync', function() {
            if (syncing) return;

            const source = this;
            const target = source.id === 'ms_questionScrollBody' ? document.getElementById('ms_answerScrollBody') : document.getElementById('ms_questionScrollBody');
            if (!target) return;

            const sourceScrollable = source.scrollHeight - source.clientHeight;
            const targetScrollable = target.scrollHeight - target.clientHeight;
            if (sourceScrollable <= 0 || targetScrollable <= 0) return;

            syncing = true;
            target.scrollTop = (source.scrollTop / sourceScrollable) * targetScrollable;
            window.requestAnimationFrame(() => {
                syncing = false;
            });
        });
    }

    /**
     * Display message in answer area when integrity violation detected between question structure and recorded answers
     */
    iFailMsg() {
        $('#ms_ifm').remove();
        this.answerPaneBody().prepend( /* html */ `
        <div id="ms_ifm" class="msIntegrityWarning">
            <div class="msIntegrityWarningIcon">!</div>
            <div class="msIntegrityWarningText">
                <strong>${UILANG.m("Question structure mismatch")}</strong>
                <span>${UILANG.m("Please note that an inconsistency has been detected between the answers given by this test taker and the current question structure.")}</span>
                <em>${UILANG.m("This test page may have been modified after test taker responses were recorded.")}</em>
            </div>
        </div>
        `);
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
