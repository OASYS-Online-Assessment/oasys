"use strict";

import { withReadyContract } from "../readyContract.js";

export default class ActiveNow {
    constructor(container, id, options = {}) {
        this.container  = container;
        this.id         = id;
        this.endpoint   = options.endpoint  || "dashboard/activenow/activenow.php";
        this.imagesPath = options.imagesPath|| "dashboard/activenow/images";

        this.rows      = [];
        this.filterTxt = "";
        this.scope     = "all"; // "watchlist" | "all"

        // Auto-refresh state
        this.autoMs    = (typeof options.autoMs === "number") ? options.autoMs : this._computeAutoMsFromSettings();
        this.live      = false;       // Manual by default
        this._inFlight = false;
        this._timer    = null;
        this._visible  = (document.visibilityState === "visible");
        this._inView   = true;
        this._silent   = false;

        // 1) Shell
        this.myContainer = createDashWidget(container, id, {
            title: UILANG.m("Active logins front end")
        });

        const $helpAnchor = $("#" + id + "_help");
        if ($helpAnchor.length) {
            new OasysHelp(id + "_help", {
                container: $helpAnchor,
                maxHeight: '560px',
                htmlContent: UILANG.m('<p>The <b>Active Front-End Logins</b> widget shows tests with participants online when you can read at least one associated test taker. A test may therefore appear even if you cannot access the test itself. Switch to your Watchlist to narrow the selection.</p><p><b>Update mode:</b> <b>Manual refresh</b> updates only when clicked, while <b>Live auto-refresh</b> updates automatically at short intervals when the widget is visible.</p><ul><li><b>Active</b> – Number of participants currently online.</li><li><b>Avg&nbsp;%</b> – Average progress of all active participants (0–100%).</li><li><b>p50&nbsp;%</b> – Median progress (50th percentile).</li><li><b>p90&nbsp;%</b> – 90th percentile progress (top 10% above this value).</li><li><b>Min–Max&nbsp;%</b> – Lowest and highest progress among active participants.</li><li><b>Last contact</b> – Most recent heartbeat or activity time.</li></ul><p><i>Note:</i> Percentages are based only on currently active sessions.</p>'),
                title: UILANG.m("Active logins front end - Help")
            });
        }

        // 2) Markup (segmented controls)
        $("#" + id).html(`
      <div class="an-body">
        <div class="an-toolbar">

          <!-- Scope segmented switch -->
          <div class="an-scope" role="group" aria-label="${UILANG.m("Scope")}">
            <div class="an-segSwitch an-segSwitch--scope" id="${id}_scopeSeg">
              <button type="button"
                      id="${id}_scope_all"
                      class="an-segBtn is-active"
                      data-key="all"
                      aria-pressed="true">
                ${UILANG.m("All accessible")}
              </button>
              <button type="button"
                      id="${id}_scope_watchlist"
                      class="an-segBtn"
                      data-key="watchlist"
                      aria-pressed="false">
                ${UILANG.m("Watchlist")}
              </button>
            </div>
          </div>

          <input id="${id}_filter" class="an-filter" type="text"
                 placeholder="${UILANG.m('Filter by test name...')}" />

          <!-- Mode segmented switch -->
          <div class="an-mode" role="group" aria-label="${UILANG.m("Update mode")}">
            <div class="an-segSwitch an-segSwitch--mode" id="${id}_modeSeg">
              <button type="button"
                      id="${id}_mode_manual"
                      class="an-segBtn is-active"
                      data-mode="manual"
                      aria-pressed="true">
                ${UILANG.m("Manual refresh")}
              </button>
              <button type="button"
                      id="${id}_mode_live"
                      class="an-segBtn"
                      data-mode="live"
                      aria-pressed="false">
                ${UILANG.m("Live auto-refresh")}
              </button>
            </div>
          </div>

          <button id="${id}_refresh" class="an-btn" type="button">
            ${UILANG.m('Refresh')}
          </button>
        </div>

        <div class="an-tableWrap" id="${id}_wrap">
          <table class="an-table" id="${id}_table">
            <thead>
              <tr>
                <th data-col="name" style="text-align:left;">${UILANG.m('Test')}</th>
                <th data-col="active" class="an-num">${UILANG.m('Active')}</th>
                <th data-col="avg"    class="an-num">${UILANG.m('Avg %')}</th>
                <th data-col="p50"    class="an-num">${UILANG.m('p50 %')}</th>
                <th data-col="p90"    class="an-num">${UILANG.m('p90 %')}</th>
                <th data-col="range"  class="an-num">${UILANG.m('Min-Max %')}</th>
                <th data-col="last">${UILANG.m('Last contact')}</th>
                <th data-col="actions" class="an-actions">${UILANG.m('Details')}</th>
              </tr>
            </thead>
            <tbody id="${id}_tbody">
              <tr class="an-empty"><td colspan="8">&mdash;</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `);

        $("#" + id).addClass("activenow");

        // 3) Events
        this.ns = `.activenow-${id}`;

        $(document)
            .off(`click${this.ns}`, `#${id}_refresh`)
            .on(`click${this.ns}`, `#${id}_refresh`, () => this.refresh());

        $(document)
            .off(`input${this.ns}`, `#${id}_filter`)
            .on(`input${this.ns}`, `#${id}_filter`, (e) => {
                this.filterTxt = (e.target.value || "").trim().toLowerCase();
                this.render();
            });

        // Scope segmented: Watchlist / All
        $(document)
            .off(`click${this.ns}`, `#${id}_scopeSeg .an-segBtn`)
            .on(`click${this.ns}`, `#${id}_scopeSeg .an-segBtn`, (e) => {
                const key = $(e.currentTarget).data("key") === "all" ? "all" : "watchlist";
                if (this.scope !== key) {
                    this.scope = key;
                    this._activateSegment(`#${id}_scopeSeg`, `[data-key="${key}"]`);
                    this.refresh();
                }
            });

        // Mode segmented: Manual / Live
        $(document)
            .off(`click${this.ns}`, `#${id}_modeSeg .an-segBtn`)
            .on(`click${this.ns}`, `#${id}_modeSeg .an-segBtn`, (e) => {
                const mode = $(e.currentTarget).data("mode") === "live" ? "live" : "manual";
                const goLive = (mode === "live");
                if (this.live !== goLive) {
                    this.live = goLive;
                    this._activateSegment(`#${id}_modeSeg`, `[data-mode="${mode}"]`);
                    // Disable Refresh when live
                    $("#" + this.id + "_refresh").prop("disabled", this.live);
                    if (this.live) {
                        this._kickAutoNow();
                    } else {
                        this._clearTimer();
                    }
                }
            });

        // Details click (event delegation)
        $(document)
            .off(`click${this.ns}`, `#${id}_tbody .an-view`)
            .on(`click${this.ns}`, `#${id}_tbody .an-view`, (e) => {
                e.preventDefault();
                const testId = Number($(e.currentTarget).data("id"));
                if (testId > 0) this._openDetails(testId);
            });

        // Init button state (manual)
        $("#" + id + "_refresh").prop("disabled", false);

        // Page Visibility
        this._visHandler = () => {
            this._visible = (document.visibilityState === "visible");
            this._updateAutoTimer();
        };
        document.addEventListener("visibilitychange", this._visHandler, false);

        // IntersectionObserver for in-viewport
        const rootEl = document.getElementById(id);
        if (rootEl && "IntersectionObserver" in window) {
            this._io = new IntersectionObserver((entries) => {
                const e = entries[0];
                this._inView = !!(e && e.isIntersecting);
                this._updateAutoTimer();
            }, { root: null, threshold: 0 });
            this._io.observe(rootEl);
        }

        // ---- Ready contract (resolves after first successful load) ----
        withReadyContract(this, { timeoutMs: 2500, autoOnResolvedRefresh: false });

        // initial load
        this.refresh();
		// refresh() is intentionally manual/no-op at startup; do not hold the
		// dashboard readiness contract until its timeout.
		this.markReady?.();
    }

    destroy() {
        $(document).off(this.ns);
        this._clearTimer();
        if (this._io) { try { this._io.disconnect(); } catch {} this._io = null; }
        if (this._visHandler) { document.removeEventListener("visibilitychange", this._visHandler); this._visHandler = null; }
    }

    /* =========================
       AJAX
    ========================== */
    startAjax(action, data, opts = {}) {
        const silent = !!opts.silent;
		if (this._inFlight) {
			// Keep the latest user request instead of silently dropping it. Automatic
			// refreshes never replace an already queued interactive request.
			if (!opts.silent || !this._pendingRequest) this._pendingRequest = { action, data, opts };
			return;
		}
        this._inFlight = true;
        this._silent = silent;

        if (!silent) globalThis.dashboardWaitStart?.();
        const params = { action, data: JSON.stringify(data || {}) };

        $.ajax({
            url: this.endpoint,
            type: "POST",
            dataType: "json",
            cache: false,
            timeout: 300000,
            data: params,
            success: (res) => this.onAjaxSuccess(res),
            error: (jqXHR, _textStatus, errorThrown) => this.onAjaxError(jqXHR, errorThrown),
            complete: () => {
                if (!silent) globalThis.dashboardWaitEnd?.();
                this._inFlight = false;
                this._silent = false;
				const pending = this._pendingRequest;
				this._pendingRequest = null;
				if (pending) this.startAjax(pending.action, pending.data, pending.opts);
            }
        });
    }

    onAjaxError(jqXHR, errorThrown) {
        const retContents = (jqXHR.responseJSON !== undefined)
            ? jqXHR.responseJSON.fatalError
            : UILANG.m("No server data returned");

        if (!this._silent) {
            new nxDialog("ajaxError", {
                buttons: [{ label: UILANG.m("OK"), "default": true, cancel: true, value: "ok" } ],
                contents: retContents,
                title: UILANG.m("Error") + ": " + errorThrown,
                width: 500
            });
        }

        // Back off if live
        if (this.live) {
            this.autoMs = Math.min(60000, Math.round(this.autoMs * 1.5));
            this._updateAutoTimer();
        }
    }

    onAjaxSuccess(res) {
        $("#un_val").text(res.loggedInName || "");

        if (res.fatalError) {
            if (!this._silent) {
                new nxDialog("fatalError", {
                    buttons: [{ label: UILANG.m("OK"), "default": true, cancel: true, value: "ok" }],
                    contents: `<strong>${UILANG.m("action_not_completed")}</strong><br />${res.fatalError}`,
                    title: UILANG.m("Error"),
                    icon: "../images/error.png",
                    iconWidth: 64,
                    width: 500
                });
            }
            return;
        }
        if (res.error) {
            if (!this._silent) {
                new nxDialog("error", {
                    buttons: [{ label: UILANG.m("OK"), "default": true, cancel: true, value: "ok" }],
                    contents: `<strong>${UILANG.m("Sorry! The action cannot be completed.")}</strong><br><p>${res.error}</p>`,
                    title: UILANG.m("Error"),
                    icon: "../images/error.png",
                    iconWidth: 64,
                    width: 700,
                    callback: () => { if (res.forceLoginRedirect) window.location = "index.php"; }
                });
            }
            return;
        }

        switch (res.action) {
            case "listActive": {
                const arr = Array.isArray(res.data) ? res.data : [];
                this.rows = arr.map(d => ({
                    id: Number(d.id || 0),
                    name: String(d.name || ""),
                    type: (d.type || "").toString().toLowerCase() || null,
                    active: Number(d.active || 0),
                    timeout: Number(d.timeout || 0),
                    aborted: Number(d.aborted || 0),
                    closed: Number(d.closed || 0),
                    avg: (d.avgProgress ?? null),
                    p50: (d.p50Progress ?? null),
                    p90: (d.p90Progress ?? null),
                    min: (d.maxProgress != null || d.minProgress != null) ? (d.minProgress ?? null) : null,
                    max: (d.maxProgress != null || d.minProgress != null) ? (d.maxProgress ?? null) : null,
                    last: d.lastActiveTS || null
                }));

                // Reflect scope segmented switch
                const scope = res.scope === "all" ? "all" : "watchlist";
                if (this.scope !== scope) this.scope = scope;
                this._activateSegment(`#${this.id}_scopeSeg`, `[data-key="${this.scope}"]`);

                // After a successful tick, restore cadence to settings
                if (this.live) this.autoMs = this._computeAutoMsFromSettings();

                this.render();
                this._updateAutoTimer();

                // ---- Signal dashboard boot gate that first data is ready ----
                this.markReady?.();

                break;
            }

            case "fetchUsers": {
                this._showUsersDialog(res.data);
                break;
            }
        }
    }

    /* =========================
       UI actions
    ========================== */
    refresh(opts = {}) {
        // this.startAjax("listActive", { scope: this.scope, _auto: !!opts.silent }, { silent: !!opts.silent });
    }

    render() {
        const $tbody = $("#" + this.id + "_tbody");
        if (!this.rows || !this.rows.length) {
            $tbody.html(`<tr class="an-empty"><td colspan="8">${UILANG.m("No active tests at the moment.")}</td></tr>`);
            return;
        }

        // filter by name
        let rows = this.rows;
        if (this.filterTxt) {
            const f = this.filterTxt;
            rows = rows.filter(r => (r.name || "").toLowerCase().includes(f));
        }

        // sort: more active first, then newest last-contact first
        rows = [...rows].sort((a, b) => {
            if (a.active !== b.active) return b.active - a.active;
            return String(b.last || "").localeCompare(String(a.last || ""));
        });

        const html = rows.map(r => {
            const rng = (r.min ?? "&ndash;") + "&ndash;" + (r.max ?? "&ndash;");
            const activeCls = (Number(r.active) > 0) ? " an-activeNum" : "";

            const type = this._safeType(r.type);
            const typeLabel = this._typeLabel(type);
            const iconName =
                type === "linear"   ? "testLinear.png" :
                type === "fluid"    ? "testFluid.png"  :
                type === "mutation" ? "testMutation.png" : null;

            const icon = `
        <span class="an-icon"
              role="img"
              aria-label="${this.escapeHtml(typeLabel)}"
              title="${this.escapeHtml(typeLabel)}"
              style="${iconName ? `background-image:url('${this.imagesPath}/${iconName}')` : ""}"></span>`;

            const stateId = `${this.id}_st_${r.id}`;

            return `
        <tr>
          <td class="an-name">
            <span class="an-nameWrap">
              ${icon}
              <span class="an-nameText">${this.escapeHtml(r.name)}</span>
            </span>
          </td>

          <td class="an-num${activeCls}">
            <span id="${stateId}" class="an-stateHover" aria-label="${UILANG.m("State breakdown")}">${r.active}</span>
          </td>

          <td class="an-num">${r.avg ?? "&mdash;"}</td>
          <td class="an-num">${r.p50 ?? "&mdash;"}</td>
          <td class="an-num">${r.p90 ?? "&mdash;"}</td>
          <td class="an-num">${rng}</td>
          <td>${this.formatDateEU(r.last)}</td>
          <td class="an-actions">
            <a href="#" class="an-iconBtn an-view" data-id="${r.id}" title="${UILANG.m("Show active logins")}">
              <svg viewBox="0 0 24 24" width="16" height="16" class="an-ico" aria-hidden="true">
                <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z"></path>
              </svg>
            </a>
          </td>
        </tr>`;
        }).join("");

        $tbody.html(html);

        // State breakdown tooltip (jQuery UI), reusing Watchlist look
        const tts = {};
        rows.forEach(r => {
            const stateId = `${this.id}_st_${r.id}`;
            tts[stateId] = {
                selector: "span",
                content: `
          <div class="an-statesTT">
            <div><span class="an-dot an-dot-active"></span> ${UILANG.m("Active")}: <strong>${r.active}</strong></div>
            <div><span class="an-dot an-dot-timeout"></span> ${UILANG.m("Timeout")}: <strong>${r.timeout}</strong></div>
            <div><span class="an-dot an-dot-aborted"></span> ${UILANG.m("Aborted")}: <strong>${r.aborted}</strong></div>
            <div><span class="an-dot an-dot-closed"></span> ${UILANG.m("Closed")}: <strong>${r.closed}</strong></div>
          </div>`
            };
        });
        this._attachTooltips(tts, "an-tooltip");

        // Icon tooltips (�Linear / Fluid / Mutation�)
        this._initIconHovers();
    }

    _openDetails(testId) { this.startAjax("fetchUsers", { testId }); }

    _showUsersDialog(payload) {
        const users = Array.isArray(payload?.users) ? payload.users : [];
        const title = `${UILANG.m("Active logins")}  ${this.escapeHtml(payload?.testName || ("#" + (payload?.testId || "")))}`;

        const statusTxt = (s) => (s===1 ? UILANG.m("Active") : s===2 ? UILANG.m("Timeout") : UILANG.m("Aborted"));

        const progressBar = (pctVal) => {
            const val = Math.max(0, Math.min(100, Number(pctVal) || 0));
            return `
        <div class="an-miniProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}">
          <div class="an-miniProgress__fill" style="width:${val}%"></div>
          <div class="an-miniProgress__label">${val}%</div>
        </div>`;
        };

        const rows = users.map(u => `
      <tr>
        <td class="an-cell-login">${this.escapeHtml(u.loginName || "")}</td>
        <td class="an-ctr an-cell-lang">${this.escapeHtml(u.language || "")}</td>
        <td class="an-ctr an-cell-progress">${progressBar(u.progressPct)}</td>
        <td class="an-ctr an-cell-status">${statusTxt(u.status)}</td>
        <td class="an-ctr an-cell-last">${this.formatDateEU(u.lastContact)}</td>
      </tr>`).join("");

        const table = `
      <div class="an-usersWrap">
        <table class="an-usersTable">
          <thead>
            <tr>
              <th class="an-th-login">${UILANG.m("Login")}</th>
              <th class="an-ctr an-th-lang">${UILANG.m("Lang")}</th>
              <th class="an-ctr an-th-progress">${UILANG.m("Progress")}</th>
              <th class="an-ctr an-th-status">${UILANG.m("Status")}</th>
              <th class="an-ctr an-th-last">${UILANG.m("Last contact")}</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="5" class="an-emptyRow">${UILANG.m("No active logins.")}</td></tr>`}
          </tbody>
        </table>
      </div>`;

        new nxDialog("anUsers", {
            title,
            contents: table,
            width: 840,
            height: 500,
            buttons: [{ label: UILANG.m("Close"), "default": true, cancel: true, value: "ok" }]
        });
    }

    /* =========================
       Icon/tooltip helpers
    ========================== */
    _initIconHovers() {
        const $wrap = $("#" + this.id);
        $wrap.find(".an-icon").tooltip({
            items: ".an-icon",
            content: function () {
                const $el = $(this);
                const label = $el.attr("title") || $el.attr("aria-label") || $el.data("type") || "";
                return `<div class="wl-tooltip-message">${label}</div>`;
            },
            tooltipClass: "wl-tooltip",
            track: true,
            position: {
                my: "left top+20",
                at: "left top",
                collision: "flipfit",
                using: function (pos) { $(this).css(pos); }
            }
        });
    }

    _attachTooltips(map, extraClass = "") {
        let tooltipStyleClass = "wl-tooltip";
        if (extraClass) tooltipStyleClass += " " + extraClass;

        for (const elId in map) {
            const { selector, content } = map[elId];
            $("#" + elId).tooltip({
                items: selector,
                content: content,
                tooltipClass: tooltipStyleClass,
                track: true,
                position: {
                    my: "left top+20",
                    at: "left top",
                    collision: "flipfit",
                    using: function (pos) { $(this).css(pos); }
                }
            });
        }
    }

    /* =========================
       Auto timer helpers
    ========================== */
    _kickAutoNow() {
        this.refresh({ silent: true });
        this._clearTimer();
        this._updateAutoTimer();
    }

    _clearTimer() {
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }

    _updateAutoTimer() {
        const shouldRun = this.live && this._visible && this._inView;
        if (!shouldRun) { this._clearTimer(); return; }
        if (this._timer) return;

        const schedule = () => {
            const jitter = this.autoMs * (0.9 + Math.random() * 0.2);
            this._timer = setTimeout(() => {
                this.refresh({ silent: true });
                this._timer = null;
                this._updateAutoTimer();
            }, jitter);
        };
        schedule();
    }

    _computeAutoMsFromSettings() {
        const sf = Number(window.settings?.sendFrequency); // seconds
        if (Number.isFinite(sf) && sf > 0) {
            const derived = sf * 1000; // follow FE heartbeat; setTimeout expects milliseconds
            return Math.max(5000, Math.min(30000, derived));
        }
        return 15000;
    }

    /* =========================
       Segmented helpers
    ========================== */
    _activateSegment(groupSel, btnSel) {
        const $group = $(groupSel);
        const $btns  = $group.find(".an-segBtn");
        const $btn   = $group.find(btnSel);

        $btns.removeClass("is-active").attr("aria-pressed", "false");
        $btn.addClass("is-active").attr("aria-pressed", "true");
    }

    /* =========================
       Misc helpers
    ========================== */
    _safeType(t) {
        const s = (t || "").toString().toLowerCase();
        return (s === "linear" || s === "fluid" || s === "mutation") ? s : "unknown";
    }
    _typeLabel(t) {
        if (t === "linear")   return UILANG.m("Linear");
        if (t === "fluid")    return UILANG.m("Fluid");
        if (t === "mutation") return UILANG.m("Mutation");
        return "�";
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    formatDateEU(ts) {
        if (!ts) return "&mdash;";
        try {
            let d;
            if (typeof ts === "number") {
                d = new Date(ts * 1000);
            } else {
                const s = String(ts).trim().replace(" ", "T");
                d = new Date(s);
                if (isNaN(d.getTime())) return "&mdash;";
            }
            const pad = n => String(n).padStart(2, "0");
            const yy  = String(d.getFullYear() % 100).padStart(2, "0");
            return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch { return "&mdash;"; }
    }
}
