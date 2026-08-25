"use strict";

import { withReadyContract } from "../readyContract.js";

export default class WatchList {
    /**
     * @param {string|HTMLElement|jQuery} container  Dashboard container (id or element)
     * @param {string} id                            Unique widget id (used for DOM + events)
     * @param {object} [options]
     * @param {string} [options.endpoint="dashboard/watchlist/watchlist.php"]
     */
    constructor(container, id, options = {}) {
        this.container = container;
        this.id = id;
        this.endpoint = options.endpoint || "dashboard/watchlist/watchlist.php";
        this.ns = `.watchlist-${id}`;

        // boot/ready gate (silent initial load)
        this._booting = true;
        withReadyContract(this, { timeoutMs: 5000, autoOnResolvedRefresh: false });
        this.markBusy?.();

        // Defensive guard for global settings
        const editorButtons = Array.isArray(globalThis.settings?.editorButtons)
            ? globalThis.settings.editorButtons
            : [];

        // Render only if user has any of these permissions
        const checkValues = ["content", "tests", "testtakers", "testresults"];
        if (checkValues.every(v => !editorButtons.includes(v))) {
            this.disabled = true;
            // Nothing to render; still flip ready to not block dashboards
            this.markReady?.();
            return;
        }

        // 1) Widget shell
        this.myContainer = createDashWidget(container, id, {
            title: UILANG.m("Watchlist")
        });

        const watchlistHelpHtml = UILANG.m('<p>The Watchlist is your personal quick-access area in the OASYS back end. Add the items you use most – tests, page groups and test takers – so you can return to them instantly without searching.</p><p>The Watchlist also performs quick checks on saved items and highlights potential issues, helping you spot problems early. You can open entries from here or remove them at any time; removing an entry only clears it from your Watchlist and does not affect the underlying content.</p>');
        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', {
                container: $helpAnchor,
                htmlContent: watchlistHelpHtml,
                title: UILANG.m("Watchlist - Help")
            });
        }

        this.$root = $(`#${id}`);

        // 2) Tabs
        this.myTabs = new jsTabs(this.$root, `tabs-${id}`);

        // 3) Build tab list + containers
        this.tabList = {};
        this.containers = [];
        this.startAction = undefined;

        const addTab = (key, label, containerId, startActionName) => {
            this.tabList[key] = label;
            this.containers.push(containerId);
            this.$root.append(`<div id="${containerId}" class="watchlist"></div>`);
            if (!this.startAction) this.startAction = startActionName;
        };

            addTab("content", UILANG.m("Content"), "contentcontainer", "getContent");

            addTab("tests", UILANG.m("Tests"), "testscontainer", "getTests");

            addTab("testtakers", UILANG.m("Test takers"), "testtakerscontainer", "getTesttakers");
        

        // 4) set tabs
        this.myTabs.setTabs(this.tabList);
        for (const c of this.containers) this.$root.find(`#${c}`).hide();

        if (this.startAction) {
            const firstKey = this.startAction.replace(/^get/, "").toLowerCase(); // getTests -> tests
            this.$root.find(`#${firstKey}container`).show();
        }

        // 5) Tab change handler
        const tSel = this.myTabs.getEventType("select");
        $(window).off(`${tSel}${this.ns}`);
        $(window).on(`${tSel}${this.ns}`, (ret) => {
            for (const c of this.containers) this.$root.find(`#${c}`).hide();
            const tabKey = ret?.originalEvent?.detail;
            if (!tabKey) return;
            this.$root.find(`#${tabKey}container`).show();

            switch (tabKey) {
                case "tests": this.startAjax("getTests", {}, { silent:false }); break;
                case "content": this.startAjax("getContent", {}, { silent:false }); break;
                case "test takers":
                case "testtakers": this.startAjax("getTesttakers", {}, { silent:false }); break;
            }
        });

        // 6) Initial load (silent during boot)
        if (this.startAction) this.startAjax(this.startAction, {}, { silent:true });
    }

    /* ========================
       AJAX CONFIG AND FUNCTION
       ======================== */
    startAjax(action, data, opts = {}) {
        const silent = !!opts.silent || this._booting;
        if (!silent) globalThis.dashboardWaitStart?.();

        $.ajax({
            url: this.endpoint,
            type: "POST",
            dataType: "json",
            cache: false,
            timeout: 300000,
            data: { action, data: JSON.stringify(data || {}) },
            success: (res) => this.onAjaxSuccess(res, { silent }),
            error: (jqXHR, _textStatus, errorThrown) => this.onAjaxError(jqXHR, _textStatus, errorThrown, { silent }),
        });
    }

    /* ==========================
       AJAX ERROR RETURN HANDLER
       ========================== */
    onAjaxError(jqXHR, _textStatus, errorThrown, { silent } = {}) {
        if (!silent) globalThis.dashboardWaitEnd?.();

        const retContents =
            jqXHR.responseJSON !== undefined
                ? jqXHR.responseJSON.fatalError
                : UILANG.m("No server data returned");

        new nxDialog("ajaxError", {
            buttons: [{ label: UILANG.m("OK"), default: true, cancel: true, value: "ok" }],
            contents: retContents,
            title: UILANG.m("Error") + ": " + errorThrown,
            width: 500,
        });
    }

    /* ============================
       AJAX SUCCESS RETURN HANDLER
       ============================ */
    onAjaxSuccess(res, { silent } = {}) {
        $("#un_val").text(res.loggedInName || "");
        if (!silent) globalThis.dashboardWaitEnd?.();

        if (res.fatalError) {
            new nxDialog("fatalError", {
                buttons: [{ label: UILANG.m("OK"), default: true, cancel: true, value: "ok" }],
                contents: formatActionErrorMessage(`<strong>${UILANG.m("action_not_completed")}</strong><br />${res.fatalError}`),
                title: UILANG.m("Error"),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500,
            });
            return;
        }

        if (res.error) {
            new nxDialog("error", {
                buttons: [{ label: UILANG.m("OK"), default: true, cancel: true, value: "ok" }],
                contents: formatActionErrorMessage(`<strong>${UILANG.m("Sorry! The action cannot be completed.")}</strong><br><p>${res.error}</p>`),
                title: UILANG.m("Error"),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 700,
                callback: () => { if (res.forceLoginRedirect) window.location = "index.php"; },
            });
            return;
        }

        switch (res.action) {
            case "getTests":       this.populateTests(res.data); break;
            case "getContent":     this.populateContent(res.data); break;
            case "getTesttakers":  this.populateTesttakers(res.data); break;

            case "unWatch": {
                const t = res.data?.[0]?.type;
                if (t === "tests") this.startAjax("getTests", {}, { silent:false });
                else if (t === "content") this.startAjax("getContent", {}, { silent:false });
                else if (t === "testtakers") this.startAjax("getTesttakers", {}, { silent:false });
                break;
            }
            default: break;
        }

        if (this._booting) { this._booting = false; this.markReady?.(); }
    }

    /* =========
       POPULATORS
       ========= */

    // ---------- TESTS ----------
    populateTests(data) {
        const $ctr = this.$root.find("#testscontainer");
        $ctr.empty();

        if (!Array.isArray(data) || data.length === 0) {
            $ctr.append(`<div class="noFavMsg">${UILANG.m("No favorites in tests added yet!")}</div>`);
            return;
        }

        // Header WITHOUT "Type"
        let t = `
      <table class="wl-table">
        <thead class="wl-tHeader">
          <tr>
            <th class="wl-HName">${UILANG.m("Name")}</th>
            <th></th> <!-- issues/messages -->
            <th>${UILANG.m("Languages")}</th>
            <th>${UILANG.m("State")}</th>
            <th></th> <!-- star -->
          </tr>
        </thead>
        <tbody>
    `;

        const tooltips = {};

        for (const d of data) {
            // locked rows
            if (d.access === false) {
                const name = this.escapeHtml(d.name || ("#" + d.id));

                // pick correct base icon class + label by d.type
                let typeClass, iconLabel;
                if (d.type === "folder") {
                    typeClass  = "folder";
                    iconLabel  = UILANG.m("Folder");
                } else {
                    typeClass  = "testLinear"; // generic test icon for locked
                    iconLabel  = UILANG.m("Test");
                }

                const iconId = `${d.id}_iconTip`;
                tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

                t += `
    <tr class="wl-row-locked">
      <td>
        <div class="wl-itemName ${typeClass} blocked">
          <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
          ${name} &mdash; <span class="wl-locked-msg">${UILANG.m("You no longer have access")}</span>
        </div>
      </td>
      <td></td><td></td><td></td>
      <td class="wl-starCol">
        <div class="watchListToggle">
          <i class="star checked" data-tab="tests" data-watchid="${d.watchid}" data-name="${name}"></i>
        </div>
      </td>
    </tr>`;
                continue;
            }

            // normal rows
            t += "<tr>";

            // Name + icon tooltip
            const tooltipId = `${d.id}_testName`;
            const iconId    = `${d.id}_iconTip`;
            const pathString = `<div class="wl-tooltip-path">${this.escapeHtml(d.path)}</div>`;
            tooltips[tooltipId] = { selector: "a", content: pathString };

            const accessLockedIcon = d.access === false ? "blocked" : "";
            let toolTipString = "";

            if (d.type === "folder") {
                const iconLabel = UILANG.m("Folder");
                tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

                t += `
          <td>
            <div class="wl-itemName folder ${accessLockedIcon}">
              <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
              <a id="${tooltipId}" href="tests.php?id=${d.id}&ta=3">${this.escapeHtml(d.name)}</a>
            </div>
          </td>`;
            } else if (d.type === "test") {
                const ttypeClass = "test" + d.ttype?.charAt(0).toUpperCase() + d.ttype?.slice(1);
                const iconLabelMap = {
                    linear: UILANG.m("Linear"),
                    fluid: UILANG.m("Fluid"),
                    mutation: UILANG.m("Mutation")
                };
                const iconLabel = iconLabelMap[d.ttype] || UILANG.m("Test");
                tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

                t += `
          <td>
            <div class="wl-itemName ${ttypeClass} ${accessLockedIcon}">
              <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
              <a id="${tooltipId}" href="tests.php?id=${d.id}&ta=4">${this.escapeHtml(d.name)}</a>
            </div>
          </td>`;

                // Restrictions tooltip (bound to state cell)
                const restr = JSON.parse(d.restrictions.restrictionsobject);
                if (!restr || (restr.dateRange === false && restr.timeRestriction === false && restr.testDays === false)) {
                    toolTipString = `<div class="wl-tooltip-message">${UILANG.m("No restrictions set")}</div>`;
                } else {
                    if (restr.dateRange !== false) {
                        const [scheduleDateFrom, scheduleTimeFrom] = this.formatDateRange(restr.dateRange.start);
                        let scheduleDateTo, scheduleTimeTo;
                        if (restr.dateRange.end === false) {
                            scheduleDateTo = UILANG.m("infinite");
                            scheduleTimeTo = "";
                        } else {
                            [scheduleDateTo, scheduleTimeTo] = this.formatDateRange(restr.dateRange.end);
                        }
                        const scheduleTitle = UILANG.m("The test is scheduled between");
                        toolTipString += `
              <div class="wl-sheduleTooltipBox">
                <div class="wl-dateblockTitle">${scheduleTitle}</div>
                <div class="wl-datesblock">
                  <div class="wl-dateblock"><div class="wl-date">${scheduleDateFrom}</div><div class="wl-time">${scheduleTimeFrom}</div></div>
                  <div class="wl-dateblock"><div class="wl-date">${scheduleDateTo}</div><div class="wl-time">${scheduleTimeTo}</div></div>
                </div>
              </div>`;
                    }
                    if (restr.timeRestriction !== false) {
                        const scheduleTitle = UILANG.m("The time is restricted between");
                        toolTipString += `
              <div class="wl-sheduleTooltipBox">
                <div class="wl-dateblockTitle">${scheduleTitle}</div>
                <div class="wl-datesblock">
                  <div class="wl-dateblock"><div class="wl-date">${restr.timeRestriction.start}</div></div>
                  <div class="wl-dateblock"><div class="wl-date">${restr.timeRestriction.end}</div></div>
                </div>
              </div>`;
                    }
                    if (restr.testDays !== false) {
                        const scheduleTitle = UILANG.m("The test is active on");
                        toolTipString += `
              <div class="wl-sheduleTooltipBox">
                <div class="wl-dateblockTitle">${scheduleTitle}</div>
                <div class="wl-datesblock">
                  <div class="wl-dateblock"><div class="wl-date">${this.translateWeekdays(restr.testDays.days)}</div></div>
                </div>
              </div>`;
                    }
                    if (d.forceLogoff !== false) {
                        toolTipString += `
              <div class="wl-sheduleTooltipBox">
                <div class="wl-dateblockTitle">${UILANG.m("Force logoff on inactive test")}: <span>${UILANG.m("yes")}</span></div>
              </div>`;
                    }
                }
            }

            // State & Issues
            const actClass = d.active === "active" ? "active" : "inactive";
            const activeText = d.active === "inactive" ? "deactivated" : d.active;

            const activityId = `${d.id}_activity`;
            tooltips[activityId] = { selector: "span", content: toolTipString };

            // Languages
            let langText = "";
            let langblockClass = "";
            if (d.ttype === "mutation") {
                langText = "";
            } else if (!d.lang) {
                langText = UILANG.m("none");
                langblockClass = "wl-lang-missing";
            } else {
                langText = d.lang;
            }

            // Issues tooltip
            let hasError = "";
            let message = "";
            let issueTooltipString = "";
            let issueId = "";

            if (d.type !== "folder" && d.ttype !== "mutation") {
                hasError = d.issues.issueCount > 0 ? "wl-itemError" : "";
                if (d.issues.issueCount === 1) message = `1 ${UILANG.m("issue")}`;
                else if (d.issues.issueCount > 1) message = `${d.issues.issueCount} ${UILANG.m("issues")}`;

                if (d.issues.issueCount > 0) {
                    if (d.issues.noItems === true) {
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${
                            d.ttype === "linear" ? UILANG.m("No test pages in the test!") : UILANG.m("No test blocks are assigned to the test!")
                        }</div>`;
                    }
                    if (d.issues.timerIssue === true)
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-error">${UILANG.m("Timer is active, but set to 0 mins!")}</div>`;

                    if (d.issues.noContentErrorFlag === true) {
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${
                            d.ttype === "linear"
                                ? UILANG.m("There are test pages in the test which have no content: ")
                                : UILANG.m("Test pages without content detected in the following test pool(s): ")
                        }</div><ul>`;
                        let count = 0;
                        const max = 3;
                        const shownNoContent = Object.create(null);
                        for (let key in d.issues.noContentError) {
                            const itemName = d.issues.noContentError[key]["itemName"] || "";
                            if (shownNoContent[itemName]) continue;
                            shownNoContent[itemName] = true;
                            count++;
                            if (count > max) { issueTooltipString += "<li>...</li>"; break; }
                            issueTooltipString += `<li>${this.escapeHtml(itemName)}</li>`;
                        }
                        issueTooltipString += "</ul>";
                    }
                    if (d.issues.noActiveLanguage === true)
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-error">${UILANG.m("Test has no language enabled!")}</div>`;

                    if (d.issues.langErrorFlag === true) {
                        if (d.ttype === "linear") {
                            issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("There are test pages in the test which do not have content for all activated languages!")}</div><ul>`;
                            let count = 0; const max = 3;
                            const shownLangErrors = Object.create(null);
                            for (let key in d.issues.langError) {
                                const issue = d.issues.langError[key];
                                const languageArr = Object.values(issue.languages || {});
                                const issueKey = (issue.itemName || "") + "|" + languageArr.join(",");
                                if (shownLangErrors[issueKey]) continue;
                                shownLangErrors[issueKey] = true;
                                count++;
                                if (count > max) { issueTooltipString += "<li>...</li>"; break; }
                                issueTooltipString += `<li>${this.escapeHtml(issue.itemName || "")} ${this.escapeHtml(languageArr.join(","))}</li>`;
                            }
                            issueTooltipString += "</ul>";
                        } else {
                            issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("There are test pages in your test pool(s) which do not have content for all activated languages!")}</div>`;
                        }
                    }

                    if (d.issues.missingItems.length > 0) {
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-error">${
                            d.ttype === "linear"
                                ? UILANG.m("There are test pages in the test which have been deleted!")
                                : UILANG.m("There are test pages in your test pool(s) which have been deleted!")
                        }</div>`;
                    }

                    if (d.issues.pnNoContent === true)
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-error">${UILANG.m("The privacy note is enabled for this test, but no content has been provided or content for the active language(s) is missing!")}</div>`;

                    if (d.ttype === "fluid") {
                        if (d.issues.itemsAmountErrorFlag === true)
                            issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("There are test blocks having less pages than they are set to!")}</div>`;
                        if (d.issues.deletedPoolFlag === true)
                            issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-error">${UILANG.m("There are test blocks in the test, which have been deleted!")}</div>`;
                    }

                    if (d.issues.duplicates === true) {
                        issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${
                            d.ttype === "linear"
                                ? UILANG.m("This test contains duplicate test pages!")
                                : UILANG.m("This test contains test blocks with duplicate test pages!")
                        }</div>`;
                    }
                }

                issueId = `${d.id}_issue`;
                tooltips[issueId] = { selector: "td", content: issueTooltipString };
            }

            // Row WITHOUT "Type" column
            t += `
        <td class="wl-notification wl-notificationWithIcon ${hasError}" id="${issueId}"><span>${message}</span></td>
        <td class="wl-testLangs ${langblockClass}">${langText}</td>
        <td class="wl-testState ${actClass}"><span id="${activityId}">${activeText}</span></td>
        <td class="wl-starCol">
          <div class="watchListToggle">
            <i class="star checked" data-tab="tests" data-watchid="${d.watchid}" data-path="${this.escapeHtml(d.path)}"></i>
          </div>
        </td>
      `;
            t += "</tr>";
        }

        t += "</tbody></table>";
        $ctr.append(t);
        this.starFleet();
        this.addTooltips(tooltips);
    }

    // ---------- CONTENT ----------
    populateContent(data) {
        const $ctr = this.$root.find("#contentcontainer");
        $ctr.empty();

        if (!Array.isArray(data) || data.length === 0) {
            $ctr.append(`<div class="noFavMsg">${UILANG.m("No favorites in content added yet!")}</div>`);
            return;
        }

        // Header WITH Pages column
        let t = `
      <table class="wl-table">
        <thead class="wl-tHeader">
          <tr>
            <th class="wl-HName">${UILANG.m("Name")}</th>
            <th class="wl-pagesHead">${UILANG.m("Pages")}</th>
            <th></th> <!-- notification -->
            <th></th> <!-- star -->
          </tr>
        </thead>
        <tbody>
    `;

        const tooltips = {};

        for (const d of data) {

            if (d.access === false) {
                const name = this.escapeHtml(d.name || ("#" + d.id));
                const typeClass = (d.type === "folder") ? "folder" : "itemsGroup";
                const iconId = `${d.id}_iconTip`;
                const iconLabel = d.type === "folder" ? UILANG.m("Folder") : UILANG.m("Page group");
                tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

                t += `
    <tr class="wl-row-locked">
      <td>
        <div class="wl-itemName ${typeClass} blocked">
          <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
          ${name} &mdash; <span class="wl-locked-msg">${UILANG.m("You no longer have access")}</span>
        </div>
      </td>
      <td class="wl-pagesCol"></td>
      <td></td>
      <td class="wl-starCol">
        <div class="watchListToggle">
          <i class="star checked" data-tab="content" data-watchid="${d.watchid}" data-name="${name}"></i>
        </div>
      </td>
    </tr>`;
                continue;
            }

            const tooltipId = `${d.id}_contentName`;
            const iconId    = `${d.id}_iconTip`;
            const contentString = `<div class="wl-tooltip-path">${this.escapeHtml(d.path)}</div>`;
            tooltips[tooltipId] = { selector: "a", content: contentString };

            const accessLockedIcon = d.access === false ? "blocked" : "";
            const iconLabel = d.type === "folder" ? UILANG.m("Folder") : UILANG.m("Page group");
            tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

            t += "<tr>";

            // Name cell
            if (d.type === "folder") {
                t += `
          <td>
            <div class="wl-itemName folder ${accessLockedIcon}">
              <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
              <a id="${tooltipId}" href="items.php?id=${d.id}&ta=1">${this.escapeHtml(d.name)}</a>
            </div>
          </td>`;
            } else if (d.type === "group") {
                t += `
          <td>
            <div class="wl-itemName itemsGroup ${accessLockedIcon}">
              <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
              <a id="${tooltipId}" href="items.php?id=${d.id}&ta=2">${this.escapeHtml(d.name)}</a>
            </div>
          </td>`;
            }

            // Pages column
            if (d.type === "group") {
                const pCount = Number(d.pagesCount || 0);
                const btnClass = pCount > 0 ? "wl-pagesBtn nonzero" : "wl-pagesBtn zero";
                const pagesPayload = encodeURIComponent(JSON.stringify(d.pages || []));
                t += `
          <td class="wl-pagesCol">
            <button type="button"
                    class="${btnClass}"
                    data-pgname="${this.escapeHtml(d.name)}"
                    data-pages='${pagesPayload}'>${pCount}</button>
          </td>`;
            } else {
                t += `<td class="wl-pagesCol"></td>`;
            }

            // Notification + star
            t += `
        <td class="wl-notification"></td>
        <td class="wl-starCol">
          <div class="watchListToggle">
            <i class="star checked" data-tab="content" data-watchid="${d.watchid}" data-path="${this.escapeHtml(d.path)}"></i>
          </div>
        </td>
      `;
            t += "</tr>";
        }

        t += "</tbody></table>";
        $ctr.append(t);
        this.starFleet();
        this.addTooltips(tooltips);
        this.bindPagesButtons();
    }

    // ---------- TEST TAKERS ----------
    populateTesttakers(data) {
        const $ctr = this.$root.find("#testtakerscontainer");
        $ctr.empty();

        if (!Array.isArray(data) || data.length === 0) {
            $ctr.append(`<div class="noFavMsg">${UILANG.m("No favorites in test takers added yet!")}</div>`);
            return;
        }

        // Header WITHOUT "Type"
        let t = `
      <table class="wl-table">
        <thead class="wl-tHeader">
          <tr>
            <th class="wl-HName">${UILANG.m("Name")}</th>
            <th></th> <!-- issues -->
            <th></th> <!-- star -->
          </tr>
        </thead>
        <tbody>
    `;

        const tooltips = {};

        for (const d of data) {

           
            // locked rows (test takers tab)
if (d.access === false) {
  const name = this.escapeHtml(d.name || ("#" + d.id));

  // correct icon + hover by type
  let typeClass, iconLabel;
  if (d.type === "folder") {
    typeClass = "folder";
    iconLabel = UILANG.m("Folder");
  } else {
    typeClass = "tTaker";
    iconLabel = UILANG.m("Standard login");
  }

  const iconId = `${d.id}_iconTip`;
  // collect tooltip; bind after DOM append
  tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

  t += `
    <tr class="wl-row-locked">
      <td>
        <div class="wl-itemName ${typeClass} blocked">
          <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
          ${name} &mdash; <span class="wl-locked-msg">${UILANG.m("You no longer have access")}</span>
        </div>
      </td>
      <td></td>
      <td class="wl-starCol">
        <div class="watchListToggle">
          <i class="star checked" data-tab="testtakers" data-watchid="${d.watchid}" data-name="${name}"></i>
        </div>
      </td>
    </tr>`;
  continue;
}


            const tooltipId = `${d.id}_testTakerName`;
            const iconId    = `${d.id}_iconTip`;
            const contentString = `<div class="wl-tooltip-path">${this.escapeHtml(d.path)}</div>`;
            tooltips[tooltipId] = { selector: "a", content: contentString };

            // Determine name/icon class and hover label
            let nameClass;
            let iconLabel = UILANG.m("Standard login");
            switch (d.loginType) {
                case "directPass": iconLabel = UILANG.m("Student login (Direct)"); nameClass = "tTakerDP"; break;
                case "LDAP":       iconLabel = UILANG.m("Student login (LDAP)");   nameClass = "tTakerLDAP"; break;
                case "SAML":       iconLabel = UILANG.m("Student login (SAML)");   nameClass = "tTakerSAML"; break;
                default:
                    switch (d.type) {
                        case "template": nameClass = "tTakerTemplate"; iconLabel = UILANG.m("Login template"); break;
                        case "cloned":   nameClass = "tTakerCloned";   iconLabel = UILANG.m("Cloned from template"); break;
                        case "folder":   nameClass = "folder";         iconLabel = UILANG.m("Folder"); break;
                        default:         nameClass = "tTaker";         iconLabel = UILANG.m("Standard login");
                    }
            }
            tooltips[iconId] = { selector: ".wl-iconHit", content: `<div class="wl-tooltip-message">${iconLabel}</div>` };

            t += "<tr>";
            if (d.type === "folder") {
                t += `
          <td>
            <div class="wl-itemName folder">
              <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
              <a id="${tooltipId}" href="testTakers.php?id=${d.id}&ta=5">${this.escapeHtml(d.name)}</a>
            </div>
          </td>`;
            } else {
                t += `
          <td>
            <div class="wl-itemName ${nameClass}">
              <span id="${iconId}" class="wl-iconHit" aria-hidden="true"></span>
              <a id="${tooltipId}" href="testTakers.php?id=${d.id}&ta=6">${this.escapeHtml(d.name)}</a>
            </div>
          </td>`;
            }

            // Issues tooltip
            let hasError = "";
            let message = "";
            let issueTooltipString = "";
            let issueId = "";

            if (d.type !== "folder") {
                hasError = d.issues.issueCount > 0 ? "wl-itemError" : "";
                if (d.issues.issueCount > 0) {
                    switch (d.loginType) {
                        case "directPass":
                        case "LDAP":
                        case "SAML":
                            if (d.issues.noPws === true) issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("Test taker has no labels!")}</div>`;
                            if (d.issues.pwsWithoutTests === true) issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("Test taker has labels without a test assigned!")}</div>`;
                            if (d.issues.pwsWithDeletedTests === true) issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("There are labels for deleted tests!")}</div>`;
                            break;
                        default:
                            if (d.issues.noPws === true) issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("Test taker has no passwords!")}</div>`;
                            if (d.issues.pwsWithoutTests === true) issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("Test taker has passwords without a test assigned!")}</div>`;
                            if (d.issues.pwsWithDeletedTests === true) issueTooltipString += `<div class="wl-tooltip-message wl-tooltip-warning">${UILANG.m("There are passwords for deleted tests!")}</div>`;
                    }
                }
                if (d.issues.issueCount === 1) message = `1 ${UILANG.m("issue")}`;
                else if (d.issues.issueCount > 1) message = `${d.issues.issueCount} ${UILANG.m("issues")}`;
            }

            issueId = `${d.id}_issue`;
            tooltips[issueId] = { selector: "td", content: issueTooltipString };

            // Row WITHOUT "Type" column
            t += `
        <td class="wl-notification wl-notificationWithIcon ${hasError}" id="${issueId}"><span>${message}</span></td>
        <td class="wl-starCol">
          <div class="watchListToggle">
            <i class="star checked" data-tab="testtakers" data-watchid="${d.watchid}" data-path="${this.escapeHtml(d.path)}"></i>
          </div>
        </td>
      `;
            t += "</tr>";
        }

        t += "</tbody></table>";
        $ctr.append(t);
        this.starFleet();
        this.addTooltips(tooltips);
    }

    /* =======
       HELPERS
       ======= */
    unWatch = (e) => {
        const watchid   = e.currentTarget.dataset.watchid;
        const currentTab= e.currentTarget.dataset.tab;
        const label     = e.currentTarget.dataset.path
            || e.currentTarget.dataset.name
            || UILANG.m("(no details)");

        const html = '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' +
            UILANG.m("You are about to remove the following entry from your watchlist. Please confirm!") +
            '</p></div><ul class="deleteList"><li>' + this.escapeHtml(label) + '</li></ul></div>';

        const dialogData = {
            buttons: [
                { label: UILANG.m("Cancel"), cancel: true, default: true, value: "cancel" },
                { label: UILANG.m("Delete"), value: "delete" },
            ],
            contents: html,
            title: UILANG.m("Confirm deletion"),
            returnPromise: true,
            width: 650,
            icon: "../images/warning.png",
            iconWidth: 64,
        };

        this.showDialog("drDialog", dialogData).then((res) => {
            if (res.button === "delete") {
                this.startAjax("unWatch", { id: watchid, tab: currentTab }, { silent:false });
            }
        });
    };

    async showDialog(id, dialogData) {
        const res = await new nxDialog(id, dialogData);
        return res;
    }

    formatDateRange(dateString) {
        const dateArr = String(dateString || "").split("T");
        const datePart = (dateArr.shift() || "").split("-").reverse().join("-");
        dateArr.unshift(datePart);
        return dateArr; // [date, time]
    }

    translateWeekdays(weekdaysString) {
        const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const arr = String(weekdaysString || "").split(",").filter(Boolean);
        return arr.map(i => UILANG.m(daysOfWeek[i])).join(", ");
    }

    starFleet() {
        this.$root.find(".star").off(`click${this.ns}`).on(`click${this.ns}`, this.unWatch);
    }

    addTooltips(tooltipsMap, classes) {
        let tooltipStyleClass = "wl-tooltip";
        if (classes && typeof classes === "string") tooltipStyleClass += " " + classes;

        for (const tooltipId in tooltipsMap) {
            const selectorType   = tooltipsMap[tooltipId].selector;
            const tooltipContent = tooltipsMap[tooltipId].content;

            this.$root.find(`#${tooltipId}`).tooltip({
                items: selectorType,
                content: tooltipContent,
                tooltipClass: tooltipStyleClass,
                track: true,
                position: {
                    my: "left top+20",
                    at: "left top",
                    collision: "flipfit",
                    using: function (position) { $(this).css(position); },
                },
            });
        }
    }

    bindPagesButtons() {
        this.$root.find(".wl-pagesBtn").off(`click${this.ns}`).on(`click${this.ns}`, (e) => {
            const $btn = $(e.currentTarget);
            const pgName = $btn.data("pgname") || UILANG.m("(Page group)");
            let pages = [];
            try { pages = JSON.parse(decodeURIComponent($btn.data("pages"))); } catch (_) {}

            const rowsHtml = pages.length
                ? pages.map(p => `
                    <tr>
                      <td>${this.escapeHtml(p.name || "")}</td>
                      <td>${this.escapeHtml(p.itemCode || "")}</td>
                      <td>${this.escapeHtml(p.langs || "")}</td>
                    </tr>`).join("")
                : `<tr><td colspan="3" class="wl-emptyList">${UILANG.m("No pages in this group.")}</td></tr>`;

            const html = `
              <div class="wl-pagesDialog">
                <div class="wl-pagesTitle">${UILANG.m("Pages in")} '${this.escapeHtml(pgName)}'</div>
                <table class="wl-pagesTable">
                  <thead>
                    <tr>
                      <th>${UILANG.m("Name")}</th>
                      <th>${UILANG.m("Code")}</th>
                      <th>${UILANG.m("Languages")}</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>`;

            new nxDialog("wlPages", {
                buttons: [{ label: UILANG.m("Close"), default: true, cancel: true, value: "close" }],
                contents: html,
                title: UILANG.m("Pages"),
                width: 700,
            });
        });
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return "";
        if (typeof str === "number") return String(str);
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    destroy() {
        const tSel = this.myTabs?.getEventType?.("select");
        if (tSel) $(window).off(`${tSel}${this.ns}`);
        this.$root.find(".star").off(`click${this.ns}`);
        this.$root.find(".wl-pagesBtn").off(`click${this.ns}`);
    }
}
