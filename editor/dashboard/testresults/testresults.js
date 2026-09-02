"use strict";

import { withReadyContract } from "../readyContract.js";

export default class TestResults {
    constructor(container, id, options = {}) {
        this.container  = container;
        this.id         = id;
        this.endpoint   = options.endpoint || "dashboard/testresults/testresults.php";
        this.imagesPath = options.imagesPath || "dashboard/testresults/images";

        // state
        this.rows        = [];                 // [{id,name,total,new,updated_ts,type}]
        this.sortKey     = "updated_ts";       // default sort by backend update time
        this.sortDir     = "desc";
        this.filterTxt   = "";                 // filter by test name
        this.scope       = "all";              // "watchlist" | "all"
        this.lastLoginTS = null;               // unix seconds

        // boot/ready gate
        this._booting = true;
        withReadyContract(this, { timeoutMs: 5000, autoOnResolvedRefresh: false });
        this.markBusy?.();

        // 1) Widget shell
        this.myContainer = createDashWidget(container, id, {
            title: UILANG.m("Latest test results")
        });

        // Help popup
        const helpHtml = UILANG.m('<p>The Latest Results widget shows tests you can access and highlights where new results have arrived since your last login. Switch between your Watchlist and all available tests to focus on what matters most.</p><p>The “New” indicator shows how many results were added after your previous session. From here you can open the detailed results view for a test or preview a compact statistics overview.</p>');

        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', {
                container: $helpAnchor,
                htmlContent: helpHtml,
                title: UILANG.m("Latest test results – Help")
            });
        }

        // 2) Markup
        const $c = $("#" + id);
        $c.html(`
            <div class="tr-body">
                <div class="tr-toolbar">
                    <div class="tr-scope">
                      <div class="tr-segSwitch" role="tablist" aria-label="${UILANG.m('Scope')}">
                        <button type="button"
                                class="tr-segBtn is-active"
                                data-scope="all"
                                role="tab" aria-selected="true">
                          ${UILANG.m('All accessible')}
                        </button>
                        <button type="button"
                                class="tr-segBtn"
                                data-scope="watchlist"
                                role="tab" aria-selected="false">
                          ${UILANG.m('Watchlist')}
                        </button>
                      </div>
                    </div>

                    <input id="${id}_filter" class="tr-filter" type="text"
                           placeholder="${UILANG.m('Filter by test name…')}" />

                    <button id="${id}_refresh" class="tr-btn">${UILANG.m('Refresh')}</button>
                </div>

                <div class="tr-tableWrap" id="${id}_wrap">
                    <table class="tr-table" id="${id}_table">
                        <thead>
                          <tr>
                            <th data-sort="name" data-col="name">${UILANG.m('Test')}</th>
                            <th data-sort="new"  data-col="new"   class="tr-num">${UILANG.m('New')}</th>
                            <th data-sort="total" data-col="total" class="tr-num">${UILANG.m('Total')}</th>
                            <th data-sort="updated_ts" data-col="updated_ts">${UILANG.m('Last update')}</th>
                            <th data-col="actions">${UILANG.m('Statistics')}</th>
                          </tr>
                        </thead>
                        <tbody id="${id}_tbody">
                            <tr class="tr-empty"><td colspan="5">—</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `);

        $('#' + id).addClass('testresults');

        // 3) Events (namespaced)
        this.ns = `.testresults-${id}`;

        $(document)
            .off(`click${this.ns}`, `#${id}_refresh`)
            .on(`click${this.ns}`, `#${id}_refresh`, () => this.refresh());

        // segmented scope switch
        $(document)
            .off(`click${this.ns}`, `#${id} .tr-segBtn`)
            .on(`click${this.ns}`, `#${id} .tr-segBtn`, (e) => {
                const scope = String($(e.currentTarget).data("scope") || "watchlist");
                this.scope = (scope === "all") ? "all" : "watchlist";
                this.updateScopeSwitch();
                this.refresh();
            });

        $(document)
            .off(`input${this.ns}`, `#${id}_filter`)
            .on(`input${this.ns}`, `#${id}_filter`, (e) => {
                this.filterTxt = (e.target.value || "").trim().toLowerCase();
                this.render();
            });

        $(document)
            .off(`click${this.ns}`, `#${id} thead th[data-sort]`)
            .on(`click${this.ns}`, `#${id} thead th[data-sort]`, (e) => {
                const key = $(e.currentTarget).data("sort");
                if (this.sortKey === key) {
                    this.sortDir = (this.sortDir === "asc") ? "desc" : "asc";
                } else {
                    this.sortKey = key;
                    this.sortDir = (key === "name") ? "asc" : "desc";
                }
                this.render();
                this.updateSortIndicators();
            });

        // Click: open stats dialog via icon
        $(document)
            .off(`click${this.ns}`, `#${id} .tr-view`)
            .on(`click${this.ns}`, `#${id} .tr-view`, (e) => {
                e.preventDefault();
                const testId = Number($(e.currentTarget).data("id") || 0);
                if (!testId) return;
                this._statsTestId = testId;
                this.startAjax('fetchStats', { selectedTest: testId });
            });

        // 4) Initial load (silent during boot)
        this.refresh({ silent: true });
    }

    destroy(){ $(document).off(this.ns); }

    /* =========================
       AJAX
    ========================== */
    startAjax(action, data, opts = {}) {
        const silent = !!opts.silent || this._booting;
        const requestId = (this._requestSequence || 0) + 1;
        this._requestSequence = requestId;
		if (action === 'listResults') this._latestListRequest = requestId;
        if (!silent) globalThis.dashboardWaitStart?.();

        $.ajax({
            url: this.endpoint,
            type: "POST",
            dataType: "json",
            cache: false,
            timeout: 300000,
            data: { action, data: JSON.stringify(data || {}) },
            success: (res) => this.onAjaxSuccess(res, { silent, action, requestId }),
            error:   (jqXHR, _t, err) => this.onAjaxError(jqXHR, err, { silent, action, requestId })
        });
    }

    onAjaxError(jqXHR, errorThrown, { silent } = {}) {
        if (!silent) globalThis.dashboardWaitEnd?.();
        const retContents = (jqXHR.responseJSON !== undefined)
            ? jqXHR.responseJSON.fatalError
            : UILANG.m("No server data returned");

        new nxDialog('ajaxError', {
            buttons: [{ label: UILANG.m('OK'), default: true, cancel: true, value: 'ok' }],
            contents: retContents,
            title: UILANG.m('Error') + ': ' + errorThrown,
            width: 500
        });
    }

    onAjaxSuccess(res, { silent, action, requestId } = {}) {
        $('#un_val').text(res.loggedInName || "");
        if (!silent) globalThis.dashboardWaitEnd?.();
		if (action === 'listResults' && requestId !== this._latestListRequest) return;

        if (res.fatalError) {
            new nxDialog('fatalError', {
                buttons: [{ label: UILANG.m('OK'), default: true, cancel: true, value: 'ok' }],
                contents: formatActionErrorMessage(`<strong>${UILANG.m('action_not_completed')}</strong><br />${res.fatalError}`),
                title: UILANG.m("Error"),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500
            });
            return;
        }

        if (res.error) {
            new nxDialog('error', {
                buttons: [{ label: UILANG.m('OK'), default: true, cancel: true, value: 'ok' }],
                contents: formatActionErrorMessage(`<strong>${UILANG.m('Sorry! The action cannot be completed.')}</strong><br><p>${res.error}</p>`),
                title: UILANG.m("Error"),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 700,
                callback: () => { if (res.forceLoginRedirect) window.location = 'index.php'; }
            });
            return;
        }

        switch (res.action) {
            case 'listResults': {
                const arr = Array.isArray(res.data) ? res.data : [];
                this.rows = arr.map(x => ({
                    id: Number(x.id || 0),
                    name: String(x.name || ""),
                    total: Number(x.total_results || 0),
                    new: Number(x.new_since_last || 0),
                    updated_ts: Number(x.updated_ts || 0),
                    type: (x.type || "").toString().toLowerCase() || null  // linear | fluid | mutation | null
                }));
                this.lastLoginTS = (typeof res.lastLoginTS === "number")
                    ? res.lastLoginTS
                    : (res.lastLoginTS ? Number(res.lastLoginTS) : null);

                // reflect scope into the segmented switch
                const scope = res.scope === 'all' ? 'all' : 'watchlist';
                this.scope = scope;
                this.updateScopeSwitch();

                this.updateSortIndicators();
                this.render();

                if (this._booting) {
                    this._booting = false;
                    this.markReady?.();
                }
                break;
            }

            case 'fetchStats':
                this.renderStatsDialog(res);
                break;
        }
    }

    /* =========================
       UI actions
    ========================== */
    refresh(opts = {}){ this.startAjax('listResults', { scope: this.scope }, opts); }

    render() {
        const $tbody = $("#" + this.id + "_tbody");
        if (!this.rows || !this.rows.length) {
            $tbody.html(`<tr class="tr-empty"><td colspan="5">${UILANG.m('No data available.')}</td></tr>`);
            return;
        }

        // filter (by name)
        let rows = this.rows;
        if (this.filterTxt) {
            const f = this.filterTxt;
            rows = rows.filter(r => (r.name || "").toLowerCase().includes(f));
        }

        // sort
        const key = this.sortKey;
        const dir = this.sortDir === "asc" ? 1 : -1;
        rows.sort((a, b) => {
            if (key === "name")  return a.name.localeCompare(b.name) * dir;
            if (key === "id")    return (a.id - b.id) * dir;
            if (key === "total") return (a.total - b.total) * dir;
            if (key === "new")   return (a.new - b.new) * dir;
            const au = Number(a.updated_ts || 0), bu = Number(b.updated_ts || 0);
            return (au - bu) * dir; // default
        });

        // rows
        const html = rows.map(r => {
            const isNewer = (this.lastLoginTS != null && r.updated_ts && r.updated_ts > this.lastLoginTS);
            const trCls = (isNewer || r.new > 0) ? ' class="tr-newSinceLogin"' : '';

            const root = (window.settings?.JSrootURL || '/');
            const sep  = root.endsWith('/') ? '' : '/';
            const link = `${root}${sep}editor/results.php?id=${encodeURIComponent(r.id)}&ta=4`;

            const hasStats = Number(r.total) > 0;
            const statsCell = hasStats ? `
                <a href="#" class="tr-iconBtn tr-view"
                   data-id="${r.id}"
                   title="${UILANG.m('View statistics')}"
                   aria-label="${UILANG.m('View statistics')}">
                  <svg viewBox="0 0 24 24" width="16" height="16" class="tr-ico" aria-hidden="true">
                    <path d="M3 21h18v-2H3v2zm3-4h3V9H6v8zm6 0h3V5h-3v12zm6 0h3V12h-3v5z"></path>
                  </svg>
                </a>` : '';

            // type & icon
            const type = this.safeType(r); // 'linear' | 'fluid' | 'mutation' | 'unknown'
            const typeLabel = this.typeLabel(type);
            const iconFile =
                type === 'linear'   ? 'testLinear.png' :
                    type === 'fluid'    ? 'testFluid.png'  :
                        type === 'mutation' ? 'testMutation.png' : 'testLinear.png';

            const iconId = `${this.id}_ico_${r.id}`;

            return `
                <tr${trCls}>
                  <td class="tr-name">
                    <a class="tr-testLink" href="${link}" title="${UILANG.m('Open in results manager')}">
                      <span id="${iconId}"
                            class="tr-icon tr-icon-${type}"
                            data-type="${this.escapeHtml(typeLabel)}"
                            data-src="${this.imagesPath}/${iconFile}"></span>
                      <span class="tr-nameText">${this.escapeHtml(r.name)}</span>
                    </a>
                  </td>
                  <td class="tr-num">${r.new}</td>
                  <td class="tr-num">${r.total}</td>
                  <td class="tr-upd">${this.formatDateEU(r.updated_ts)}</td>
                  <td class="tr-statistics">${statsCell}</td>
                </tr>
            `;
        }).join("");

        $tbody.html(html);

        // init hover tooltips + set bg-images
        this.initIconHovers();

        // ensure sort arrows show correctly
        this.updateSortIndicators();
    }

    updateSortIndicators() {
        const $ths = $(`#${this.id} thead th[data-sort]`);
        $ths.removeClass("tr-sort-asc tr-sort-desc");
        $ths.each((_, th) => {
            const $th = $(th);
            if ($th.data("sort") === this.sortKey) {
                $th.addClass(this.sortDir === "asc" ? "tr-sort-asc" : "tr-sort-desc");
            }
        });
    }

    updateScopeSwitch() {
        const $wrap = $('#' + this.id);
        const isAll = this.scope === 'all';
        const $btnWatch = $wrap.find('.tr-segBtn[data-scope="watchlist"]');
        const $btnAll   = $wrap.find('.tr-segBtn[data-scope="all"]');
        $wrap.find('.tr-segBtn').removeClass('is-active').attr('aria-selected','false');
        (isAll ? $btnAll : $btnWatch).addClass('is-active').attr('aria-selected','true');
    }

    renderStatsDialog(res) {
        const d = res.data || {};
        const testId = Number(this._statsTestId ?? d.testId ?? 0);
        const tableAgg = this.rows.find(r => r.id === testId);
        const rows = Array.isArray(d.testActivity) ? d.testActivity : [];
        const pickFinite = (v, fb) => (Number.isFinite(v) ? v : fb);
        const totalForStats = pickFinite(tableAgg?.total,
            pickFinite(Number(d.total_results), rows.length));
        const newSinceLast  = pickFinite(tableAgg?.new,
            pickFinite(Number(d.new_since_last), 0));

        const initBuckets = { lt20:0, b21_40:0, b41_60:0, b61_80:0, b81_99:0, eq100:0 };
        let buckets = d.progressBuckets;
        if (!buckets) {
            buckets = rows.reduce((acc, r) => {
                const p = Number(r.progressField ?? 0);
                if (p >= 100) acc.eq100++;
                else if (p >= 81) acc.b81_99++;
                else if (p >= 61) acc.b61_80++;
                else if (p >= 41) acc.b41_60++;
                else if (p >= 21) acc.b21_40++;
                else acc.lt20++;
                return acc;
            }, { ...initBuckets });
        }

        const defs = [
            { key:'lt20',   label: UILANG.m('less than 20 %') },
            { key:'b21_40', label: '21-40 %' },
            { key:'b41_60', label: '41-60 %' },
            { key:'b61_80', label: '61-80 %' },
            { key:'b81_99', label: '81-99 %' },
            { key:'eq100',  label: UILANG.m('100 % (complete)') },
        ];

        const pct = (n) => totalForStats ? (n * 100 / totalForStats) : 0;

        const chartRows = defs.map(def => {
            const cnt = Number(buckets?.[def.key] || 0);
            const prc = pct(cnt);
            return `
              <div class="tr-barRow">
                <div class="tr-barLabel">${this.escapeHtml(def.label)}</div>
                <div class="tr-barTrack" aria-hidden="true">
                  <div class="tr-barFill" style="width:${prc}%;"></div>
                </div>
                <div class="tr-barPct">${prc.toFixed(2)} % - (${cnt})</div>
              </div>`;
        }).join('');

        const chart = `
        <div class="tr-statsChart">
          <div class="tr-statsChartHeader">${UILANG.m('Progress statistics')}</div>
          ${chartRows}
        </div>`;

        const progressBar = (pctVal) => {
            const val = Math.max(0, Math.min(100, Number(pctVal) || 0));
            return `
          <div class="tr-miniProgress" role="progressbar"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}"
               aria-label="${UILANG.m('Progress')}">
            <div class="tr-miniProgress__fill" style="width:${val}%"></div>
            <div class="tr-miniProgress__label">${val}%</div>
          </div>`;
        };

        const rowsSorted = [...rows].reverse();

        const listTable = rows.length ? `
        <div class="tr-statsListWrap">
          <div class="tr-statsListHeader">${UILANG.m('Recent activity')}</div>
          <div class="tr-statsList">
            <table class="tr-statsTable">
              <thead>
                <tr>
                  <th>${UILANG.m('Test taker')}</th>
                  <th>${UILANG.m('Password')}</th>
                  <th>${UILANG.m('Progress')} <span style="opacity:.6;">(${UILANG.m('latest first')})</span></th>
                </tr>
              </thead>
              <tbody>
                ${rowsSorted.map(r => `
                  <tr>
                    <td>${this.escapeHtml(r.testeename || '')}</td>
                    <td>${this.escapeHtml(r.testeepass || '')}</td>
                    <td class="tr-progress" style="min-width:140px;">
                      ${progressBar(r.progressField)}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : `
        <div class="tr-statsListWrap">
          <div class="tr-statsListHeader">${UILANG.m('Recent activity')}</div>
          <div class="tr-statsList"><div style="padding:8px;">${UILANG.m('No detailed activity available.')}</div></div>
        </div>`;

        const meta = `
        <div class="tr-statsMeta">
          <div>${UILANG.m('Total results')}: <strong>${totalForStats}</strong></div>
          <div>${UILANG.m('New since your last session')}: <strong>${newSinceLast}</strong></div>
        </div>`;

        const title = UILANG.m('Test stats') + ': ' + (this.escapeHtml(d.testName || '') || ('#' + (testId || '')));

        const content = `
          <div class="tr-statsWrap">
            ${chart}
            ${listTable}
          </div>`;

        new nxDialog('trStats', {
            title,
            contents: meta + content,
            width: 1000,
            height: 600,
            buttons: [{ label: UILANG.m('Close'), default: true, cancel: true, value: 'ok' }]
        });
    }

    /* =========================
       Helpers
    ========================== */
    initIconHovers() {
        const $wrap = $("#" + this.id);

        // set background-image from data-src
        $wrap.find(".tr-icon").each(function () {
            const $el = $(this);
            const src = $el.data("src");
            if (src) $el.css("background-image", `url("${src}")`);
        });

        // jQuery UI tooltip (reuse Watchlist style .wl-tooltip)
        $wrap.find(".tr-icon").tooltip({
            items: ".tr-icon",
            content: function () {
                const label = $(this).data("type") || "";
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

    escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    // EU date format: dd.mm.yy HH:MM
    formatDateEU(ts) {
        if (!ts) return "—";
        try {
            const d = new Date(Number(ts) * 1000);
            if (isNaN(d.getTime())) return "—";
            const pad = n => String(n).padStart(2, "0");
            const yy  = String(d.getFullYear() % 100).padStart(2, "0");
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch {
            return "—";
        }
    }

    safeType(r) {
        const t = (r?.type || '').toString().toLowerCase();
        if (t === 'linear' || t === 'fluid' || t === 'mutation') return t;
        return 'unknown';
    }

    typeLabel(t) {
        if (t === 'linear')   return UILANG.m('Linear');
        if (t === 'fluid')    return UILANG.m('Fluid');
        if (t === 'mutation') return UILANG.m('Mutation');
        return '—';
    }
}
