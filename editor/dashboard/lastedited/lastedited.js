"use strict";

import { withReadyContract } from "../readyContract.js";

export default class LastEdited {
    constructor(container, id, options = {}) {
        this.container  = container;
        this.id         = id;
        this.endpoint   = options.endpoint   || "dashboard/lastedited/lastedited.php";
        this.imagesPath = options.imagesPath || "dashboard/lastedited/images";

        this.rows      = [];
        this.filterTxt = "";

        // Shell
        this.myContainer = createDashWidget(container, id, {
            title: UILANG.m("Last edited")
        });

        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', {
                container: $helpAnchor,
                htmlContent: UILANG.m('<p>The Last Edited widget shows your recent work history in OASYS — up to your last ten edited items (tests and page groups). It’s a quick way to pick up where you left off and to see if anything has changed since your last edit.</p><p>Visual cues help you assess the state of each entry at a glance: a red badge indicates that someone else has edited the item after you; a blocked icon means your access has been revoked.</p>'),
                title: UILANG.m("Last edited – Help")
            });
        }

        // Markup
        $("#" + id).html(`
      <div class="le-body">
        <div class="le-toolbar">
          <input id="${id}_filter" class="le-filter" type="text"
                 placeholder="${UILANG.m('Filter by name…')}" />
          <button id="${id}_refresh" class="le-btn" type="button">
            ${UILANG.m('Refresh')}
          </button>
        </div>

        <div class="le-tableWrap" id="${id}_wrap">
          <table class="le-table" id="${id}_table">
            <thead>
              <tr>
                <th data-col="item">${UILANG.m('Name')}</th>
                <th data-col="kind">${UILANG.m('Type')}</th>
                <th data-col="you"    class="le-num">${UILANG.m('You edited')}</th>
                <th data-col="others" class="le-num">${UILANG.m('Edited by others')}</th>
                <th data-col="access" class="le-num">${UILANG.m('Access')}</th>
              </tr>
            </thead>
            <tbody id="${id}_tbody">
              <tr class="le-empty"><td colspan="5">—</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `);

        $('#' + id).addClass('lastedited');

        // Events
        this.ns = `.lastedited-${id}`;

        $(document)
            .off(`click${this.ns}`, `#${id}_refresh`)
            .on(`click${this.ns}`, `#${id}_refresh`, () => this.refresh());

        $(document)
            .off(`input${this.ns}`, `#${id}_filter`)
            .on(`input${this.ns}`, `#${id}_filter`, (e) => {
                this.filterTxt = (e.target.value || "").trim().toLowerCase();
                this.render();
            });

        $(document)
            .off(`click${this.ns}`, `#${id} .le-othersBtn`)
            .on(`click${this.ns}`, `#${id} .le-othersBtn`, (e) => {
                e.preventDefault();
                const idx = Number($(e.currentTarget).data('idx'));
                if (!Number.isFinite(idx)) return;
                const row = this.rows[idx];
                if (!row) return;
                this._showOthersDialog(row);
            });

        // ---- Ready contract (wait for first successful data load) ----
        withReadyContract(this, { timeoutMs: 2500, autoOnResolvedRefresh: false });

        // Initial load
        this.refresh();
    }

    destroy() { $(document).off(this.ns); }

    /* =========================
       AJAX
    ========================== */
    startAjax(action, data) {
        globalThis.dashboardWaitStart?.();
        const params = { action, data: JSON.stringify(data || {}) };

        $.ajax({
            url: this.endpoint,
            type: "POST",
            dataType: "json",
            cache: false,
            timeout: 300000,
            data: params,
            success: (res) => this.onAjaxSuccess(res),
            error: (jqXHR, _ts, errorThrown) => this.onAjaxError(jqXHR, errorThrown)
        });
    }

    onAjaxError(jqXHR, errorThrown) {
        globalThis.dashboardWaitEnd?.();
        const retContents = (jqXHR.responseJSON !== undefined)
            ? jqXHR.responseJSON.fatalError
            : UILANG.m("No server data returned");

        new nxDialog('ajaxError', {
            buttons: [{ label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok' }],
            contents: retContents,
            title: UILANG.m('Error') + ': ' + errorThrown,
            width: 500
        });
    }

    onAjaxSuccess(res) {
        $('#un_val').text(res.loggedInName || "");
        globalThis.dashboardWaitEnd?.();

        if (res.fatalError) {
            new nxDialog('fatalError', {
                buttons: [{ label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok' }],
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
                buttons: [{ label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok' }],
                contents: formatActionErrorMessage(`<strong>${UILANG.m('Sorry! The action cannot be completed.')}</strong><br><p>${res.error}</p>`),
                title: UILANG.m("Error"),
                icon: "../images/error.png",
                iconWidth: 64,
                width: 700,
                callback: () => { if (res.forceLoginRedirect) window.location = 'index.php'; }
            });
            return;
        }

        if (res.action === 'listEdited') {
            const arr = Array.isArray(res.data) ? res.data : [];
            this.rows = arr.map(d => ({
                id: Number(d.id||0),
                kind: String(d.kind||''), // 'test' | 'pagegroup'
                name: String(d.name||''),
                you_ts: String(d.you_edited_ts||''),
                edited_by_others: !!d.edited_by_others,
                latest_ts_other: d.latest_ts_other || null,
                latest_editors: Array.isArray(d.latest_editors) ? d.latest_editors : [],
                others_later: Array.isArray(d.others_later) ? d.others_later : [],
                others_count: Number(d.others_count||0),
                access: !!d.access,
                test_type: (d.test_type||null)
            }));

            this.render();

            // ---- Signal dashboard boot gate that first data is ready ----
            this.markReady?.();
        }
    }

    /* =========================
       UI
    ========================== */
    refresh() { this.startAjax('listEdited', {}); }

    render() {
        const $tbody = $("#" + this.id + "_tbody");

        if (!Array.isArray(this.rows) || this.rows.length === 0) {
            $tbody.html(
                `<tr class="le-empty"><td colspan="5">${UILANG.m('No data available.')}</td></tr>`
            );
            return;
        }

        // 1) filter by name
        let rows = this.rows;
        if (this.filterTxt) {
            const f = this.filterTxt.toLowerCase();
            rows = rows.filter(r => (r.name || "").toLowerCase().includes(f));
        }

        // 2) newest first (your own edit timestamp)
        rows = [...rows].sort((a, b) => String(b.you_ts || '').localeCompare(String(a.you_ts || '')));

        // 3) helpers
        const typeLabel = (r) => r.kind === 'test' ? UILANG.m('Test') : UILANG.m('Page group');

        const iconFor = (r) => {
            if (r.kind === 'test') {
                const t = (r.test_type || '').toString().toLowerCase();
                const blocked = !r.access;
                if (t === 'linear')   return blocked ? 'testLinearBlocked.png'   : 'testLinear.png';
                if (t === 'fluid')    return blocked ? 'testFluidBlocked.png'    : 'testFluid.png';
                if (t === 'mutation') return blocked ? 'testMutationBlocked.png' : 'testMutation.png';
                return blocked ? 'testLinearBlocked.png' : 'testLinear.png'; // fallback
            }
            return r.access ? 'listDocuments.png' : 'listDocumentsBlocked.png';
        };

        const displayName = (o) =>
            (o && o.deleted)
                ? UILANG.m('User has been deleted')
                : String(o?.name || UILANG.m('someone'));

        // Warn (has newer edits)
        const badgeWarnBtn = (idx, count, editorsList) => `
      <button type="button"
              class="le-badge le-badge-warn le-othersBtn"
              data-idx="${idx}"
              aria-label="${this.escapeHtml(UILANG.m('Edited later by'))}: ${this.escapeHtml(editorsList)}"
              title="${this.escapeHtml(UILANG.m('Edited later by'))}: ${this.escapeHtml(editorsList)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 11a3.25 3.25 0 1 0-3.25-3.25A3.25 3.25 0 0 0 9 11Zm6.25.25a2.75 2.75 0 1 0-2.75-2.75 2.75 2.75 0 0 0 2.75 2.75ZM3.5 18.5v-1.25C3.5 14.9 5.94 13 9 13s5.5 1.9 5.5 4.25v1.25Zm11.75-5.25c2.92 0 5.25 1.67 5.25 3.75v1.5h-4.25v-1.25a5 5 0 0 0-1.83-3.74 6.77 6.77 0 0 1 .83-.26Z"
                fill="currentColor"/>
        </svg>
        <span class="le-badge-count">${count}</span>
      </button>`;

        const badgeWarnDisabled = (count, editorsList) => `
      <span class="le-badge le-badge-warn le-badge-disabled"
            title="${this.escapeHtml(UILANG.m('No access'))}: ${this.escapeHtml(editorsList)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 11a3.25 3.25 0 1 0-3.25-3.25A3.25 3.25 0 0 0 9 11Zm6.25.25a2.75 2.75 0 1 0-2.75-2.75 2.75 2.75 0 0 0 2.75 2.75ZM3.5 18.5v-1.25C3.5 14.9 5.94 13 9 13s5.5 1.9 5.5 4.25v1.25Zm11.75-5.25c2.92 0 5.25 1.67 5.25 3.75v1.5h-4.25v-1.25a5 5 0 0 0-1.83-3.74 6.77 6.77 0 0 1 .83-.26Z"
                fill="currentColor"/>
        </svg>
        <span class="le-badge-count">${count}</span>
      </span>`;

        // 4) rows
        const html = rows.map((r) => {
            // stable index for click handlers
            const idxInState = Math.max(
                0,
                this.rows.findIndex(x => x.id === r.id && x.kind === r.kind && String(x.you_ts) === String(r.you_ts))
            );

            const iconTag = `<img class="le-icon" src="${this.imagesPath}/${iconFor(r)}" alt="" aria-hidden="true" />`;

            const root = (window.settings?.JSrootURL || '/');
            const sep  = root.endsWith('/') ? '' : '/';
            const link = r.kind === 'test'
                ? `${root}${sep}editor/tests.php?id=${encodeURIComponent(r.id)}&ta=4`
                : `${root}${sep}editor/items.php?id=${encodeURIComponent(r.id)}&ta=2`;

            // deleted item (then we don't link)
            const isDeletedItem = (!r.access) && (!!r.id && (r.name === `#${r.id}` || !r.name));
            const deletedLabel = r.kind === 'test'
                ? UILANG.m('Deleted test')
                : UILANG.m('Deleted page group');

            const rawName = isDeletedItem
                ? `<span style="color:#9aa0a6;font-style:italic;">&lt;${this.escapeHtml(deletedLabel)}&gt;</span>`
                : this.escapeHtml(r.name || ('#' + r.id));

            // Wrap icon + text in a grid so the icon is vertically centered even when the name wraps.
            const nameContent =
                `<span class="le-nameWrap">
                    ${iconTag}
                    <span class="le-nameText"${(!r.access || isDeletedItem) ? "" : ` title="${this.escapeHtml(UILANG.m('Open'))}"`}>${rawName}</span>
                 </span>`;

            const nameCell = (!r.access || isDeletedItem)
                ? `<span class="le-name le-disabled">${nameContent}</span>`
                : `<a class="le-link" href="${link}">${nameContent}</a>`;

            const youTs = this.formatDateEU(r.you_ts);

            const editorsList = (Array.isArray(r.others_later) && r.others_later.length)
                ? r.others_later.map(o => (o && o.deleted) ? UILANG.m('User has been deleted') : String(o?.name || UILANG.m('someone'))).join(', ')
                : UILANG.m('No newer edits by others');

            const othersBadgeClickable = r.edited_by_others
                ? badgeWarnBtn(idxInState, r.others_count || 1, editorsList)
                : '';

            const othersBadgeDisabled = r.edited_by_others
                ? badgeWarnDisabled(r.others_count || 1, editorsList)
                : '';

            const othersCell = (!r.access || isDeletedItem) ? '' : (r.access ? othersBadgeClickable : othersBadgeDisabled);

            const accessHtml = r.access
                ? `<span class="le-accessState le-access-ok" title="${UILANG.m('Access available')}">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12.5l4.2 4.2L19 6.8" />
                    </svg>
                  </span>`
                : `<span class="le-accessState le-access-bad" title="${UILANG.m('No access')}">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7l10 10M17 7L7 17" />
                    </svg>
                  </span>`;

            return `
        <tr>
          <td class="le-item">${nameCell}</td>
          <td class="le-type">${this.escapeHtml(typeLabel(r))}</td>
          <td class="le-you">${youTs}</td>
          <td class="le-others">${othersCell}</td>
          <td class="le-access">${accessHtml}</td>
        </tr>`;
        }).join("");

        $tbody.html(html);
    }

    _showOthersDialog(row) {
        if (!row || !Array.isArray(row.others_later) || row.others_later.length === 0) {
            new nxDialog('leNoOthers', {
                title: UILANG.m('No newer edits by others'),
                contents: `<div style="padding:10px;">${UILANG.m('No one edited this item after your last edit.')}</div>`,
                buttons: [{label: UILANG.m('Close'), 'default': true, cancel: true, value: 'ok'}],
                width: 420, height: 180
            });
            return;
        }

        const kindTxt = row.kind === 'test' ? UILANG.m('Test') : UILANG.m('Page group');

        const rowsHtml = row.others_later.map(o => {
            const isDeleted = !!o.deleted;
            const nameHtml = isDeleted
                ? `<span style="color:#9aa0a6;font-style:italic;">&lt;${this.escapeHtml(UILANG.m('User has been deleted'))}&gt;</span>`
                : this.escapeHtml(o.name || '');
            return `
        <tr>
          <td>${nameHtml}</td>
          <td class="le-ctr">${this.formatDateEU(o.ts)}</td>
        </tr>`;
        }).join('');

        const table = `
      <h4 class="le-dialogTitle">${this.escapeHtml(kindTxt)} — ${this.escapeHtml(row.name || ('#'+row.id))}</h4>
      <div class="le-dialogWrap">
        <table class="le-dialogTable">
          <thead>
            <tr>
              <th class="le-head">${UILANG.m('User')}</th>
              <th class="le-head le-ctr">${UILANG.m('Edited')}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

        new nxDialog('leOthers', {
            title: UILANG.m('Edited later by others'),
            contents: table,
            width: 460,
            height: 380,
            buttons: [{label: UILANG.m('Close'), 'default': true, cancel: true, value: 'ok'}]
        });
    }

    /* =========================
       Helpers
    ========================== */
    escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    // EU date format dd.mm.yy HH:MM (accepts "YYYY-MM-DD HH:MM" or falsy)
    formatDateEU(ts) {
        if (!ts) return "";
        try {
            const s = String(ts).trim().replace(' ', 'T');
            const d = new Date(s);
            if (isNaN(d.getTime())) return "";
            const pad = n => String(n).padStart(2, "0");
            const yy  = String(d.getFullYear() % 100).padStart(2, "0");
            return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch { return ""; }
    }
}
