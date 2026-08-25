"use strict";

import { withReadyContract } from "../readyContract.js";

export default class LogViewer {
    constructor(container, id, options = {}) {
        this.container = container;
        this.id = id;
        this.endpoint = options.endpoint || "dashboard/logviewer/logviewer.php";

        // state
        this.rows = [];
        this.sortKey = "mtime";      // default sort by last modified
        this.sortDir = "desc";
        this.filterTxt = "";
        this.readLimit = 200000;     // bytes to fetch from end of file (for preview)
        this.lastLoginTS = null;     // unix timestamp (seconds) or null

        // 1) Widget shell
        this.myContainer = createDashWidget(container, id, {
            title: "System logs"
        });

        // Help
        const logsHelpHtml = `
  <p>
    The System Logs widget provides a concise view of recorded application events in OASYS. 
    It helps administrators review recent activity and spot irregularities or errors that may need attention.
  </p>
  <p>
    Browse the log entries directly in the widget and download them when a deeper, offline analysis is required.
  </p>`;

        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', {
                container: $helpAnchor,
                htmlContent: logsHelpHtml,
                title: "System logs – Help"
            });
        }

        // 2) Markup
        const $c = $("#" + id);
        $c.html(`
            <div class="logv-body">
                <div class="logv-toolbar">
                    <input id="${id}_filter" class="logv-filter" type="text"
                           placeholder="Filter by name…" />
                    <button id="${id}_refresh" class="logv-btn">Refresh</button>
                </div>

                <div class="logv-tableWrap" id="${id}_wrap">
                    <table class="logv-table" id="${id}_table">
                        <thead>
                            <tr>
                                <th data-sort="name">Name</th>
                                <th data-sort="mtime">Last modified</th>
                                <th data-sort="size" class="logv-num">Size</th>
                            </tr>
                        </thead>
                        <tbody id="${id}_tbody">
                            <tr class="logv-empty"><td colspan="3">—</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `);
        $c.addClass("logviewer");

        // 3) Events (namespaced)
        this.ns = `.logviewer-${id}`;

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

        // Click: open preview dialog
        $(document)
            .off(`click${this.ns}`, `#${id} .logv-link`)
            .on(`click${this.ns}`, `#${id} .logv-link`, (e) => {
                e.preventDefault();
                const path = $(e.currentTarget).data("path");
                if (path) this.openFile(String(path));
            });

        // Click: per-row download (via POST -> Blob)
        $(document)
            .off(`click${this.ns}`, `#${id} .logv-dl`)
            .on(`click${this.ns}`, `#${id} .logv-dl`, (e) => {
                e.preventDefault();
                const $btn = $(e.currentTarget);
                const path = $btn.data("path");
                const name = $btn.data("name");
                if (!path) return;

                this.downloadFile(String(path), String(name || this.fileNameFromPath(path)));
            });

        // Click: per-row clear (truncate to 0 bytes)
        $(document)
            .off(`click${this.ns}`, `#${id} .logv-clear`)
            .on(`click${this.ns}`, `#${id} .logv-clear`, (e) => {
                e.preventDefault();
                const $btn = $(e.currentTarget);
                const path = String($btn.data("path") || "");
                const name = String($btn.data("name") || this.fileNameFromPath(path));
                if (!path) return;

                const confirmHtml = `
                    <p>Do you really want to clear this log file?</p>
                    <p><code>${this.escapeHtml(name)}</code></p>
                    <p><strong>This action cannot be undone.</strong></p>
                `;
                const doClear = () => this.startAjax('clearLogFile', { path });

                if (typeof nxDialog === "function") {
                    new nxDialog('confirmClearLog', {
                        title: 'Clear log',
                        contents: confirmHtml,
                        width: 520,
                        icon: "../images/warning.png",
                        iconWidth: 64,
                        buttons: [
                            { label: 'Cancel', cancel: true, value: 'cancel' },
                            { label: 'Clear', 'default': true, value: 'ok' }
                        ],
                        callback: (val) => { if (val === 'ok') doClear(); }
                    });
                } else {
                    if (window.confirm(`Clear log file? ${name}`)) doClear();
                }
            });

        // ---- Ready contract (resolve after first successful listing) ----
        withReadyContract(this, { timeoutMs: 2500, autoOnResolvedRefresh: false });

        // 4) Initial load
        this.refresh();
    }

    destroy() {
        $(document).off(this.ns);
    }

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
            error: (jqXHR, textStatus, errorThrown) => this.onAjaxError(jqXHR, textStatus, errorThrown)
        });
    }

    onAjaxError(jqXHR, _textStatus, errorThrown) {
        globalThis.dashboardWaitEnd?.();
        const retContents = (jqXHR.responseJSON !== undefined)
            ? jqXHR.responseJSON.fatalError
            : "No server data returned";

        new nxDialog('ajaxError', {
            buttons: [{ label: 'OK', 'default': true, cancel: true, value: 'ok' }],
            contents: retContents,
            title: 'Error' + ': ' + errorThrown,
            width: 500
        });
    }

    onAjaxSuccess(res) {
        $('#un_val').text(res.loggedInName || "");
        globalThis.dashboardWaitEnd?.();

        if (res.fatalError) {
            new nxDialog('fatalError', {
                buttons: [{ label: 'OK', 'default': true, cancel: true, value: 'ok' }],
                contents: formatActionErrorMessage(`<strong>action_not_completed</strong><br />${res.fatalError}`),
                title: "Error",
                icon: "../images/error.png",
                iconWidth: 64,
                width: 500
            });
            return;
        }

        if (res.error) {
            new nxDialog('error', {
                buttons: [{ label: 'OK', 'default': true, cancel: true, value: 'ok' }],
                contents: formatActionErrorMessage(`<strong>Sorry! The action cannot be completed.</strong><br><p>${res.error}</p>`),
                title: "Error",
                icon: "../images/error.png",
                iconWidth: 64,
                width: 700,
                callback: () => {
                    if (res.forceLoginRedirect) window.location = 'index.php';
                }
            });
            return;
        }

        switch (res.action) {
            case 'readLogs': {
                const arr = Array.isArray(res.data) ? res.data : [];
                this.rows = arr.map(x => ({
                    name: x.name || "",
                    path: x.fullPath || x.path || x.name || "",
                    mtime: Number(x.mtime || 0),
                    size: Number(x.size || 0)
                }));
                // capture user's lastLogin (seconds) if provided
                this.lastLoginTS = (typeof res.lastLoginTS === "number") ? res.lastLoginTS
                    : (res.lastLoginTS ? Number(res.lastLoginTS) : null);

                this.updateSortIndicators();
                this.render();

                // ---- Signal dashboard boot gate that first data is ready ----
                this.markReady?.();
                break;
            }

            case 'clearLogFile': {
                // Refresh list so size/mtime update and highlighting recalculates
                this.refresh();
                break;
            }

            case 'readLogFile': {
                // Preview dialog
                const d = res.data || {};
                const niceTitle = "Log file" + ": " + this.escapeHtml(d.fullPath || d.path || "");
                const info = d.truncated
                    ? `<div class="logv-dialogMeta">Showing last ${this.formatBytes(d.bytesReturned || 0)} of ${this.formatBytes(d.size || 0)} &mdash; Download the file to see the full content.</div>`
                    : `<div class="logv-dialogMeta">${this.formatBytes(d.size || 0)}</div>`;

                const html = `
                    <div class="logv-dialog">
                    <div class="logv-dialogPath">${this.escapeHtml(d.fullPath || d.path || "")}</div>
                    ${info}
                    <pre class="logv-pre" id="${this.id}_previewPre">${this.escapeForPre(d.content || "")}</pre>
                    </div>
                    `;

                new nxDialog('logPreview', {
                    title: niceTitle,
                    contents: html,
                    width: 960,
                    height: 640,
                    buttons: [{ label: 'Close', 'default': true, cancel: true, value: 'ok' }]
                });

                // scroll to bottom once the dialog content is in the DOM
                const scrollPreToBottom = () => {
                    const el = document.getElementById(`${this.id}_previewPre`);
                    if (el) el.scrollTop = el.scrollHeight;
                };
                setTimeout(scrollPreToBottom, 0);
                requestAnimationFrame(scrollPreToBottom);
                break;
            }
        }
    }

    /* =========================
       UI actions
    ========================== */
    refresh() {
        this.startAjax('readLogs', {});
    }

    openFile(path) {
        // Request a tail for preview
        this.startAjax('readLogFile', { path, limit: this.readLimit });
    }

    downloadFile(path) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = this.endpoint;
        form.style.display = 'none';
        const action = document.createElement('input');
        action.type = 'hidden';
        action.name = 'action';
        action.value = 'downloadLogFile';
        const data = document.createElement('input');
        data.type = 'hidden';
        data.name = 'data';
        data.value = JSON.stringify({ path });
        form.append(action, data);
        document.body.appendChild(form);
        form.submit();
        form.remove();
    }

    render() {
        const $tbody = $("#" + this.id + "_tbody");
        if (!this.rows || !this.rows.length) {
            $tbody.html(`<tr class="logv-empty"><td colspan="3">No data available.</td></tr>`);
            return;
        }

        // filter
        let rows = this.rows;
        if (this.filterTxt) {
            const f = this.filterTxt;
            rows = rows.filter(r => r.name.toLowerCase().includes(f));
        }

        // sort
        const key = this.sortKey;
        const dir = this.sortDir === "asc" ? 1 : -1;
        rows.sort((a, b) => {
            if (key === "name") return a.name.localeCompare(b.name) * dir;
            if (key === "size") return (a.size - b.size) * dir;
            // default: mtime
            return (a.mtime - b.mtime) * dir;
        });

        // rows
        const html = rows.map(r => {
            const isEmpty = (Number(r.size) === 0);
            const isNewerThanLogin = (this.lastLoginTS != null && r.mtime && r.mtime > this.lastLoginTS);
            const trCls = isNewerThanLogin ? ' class="logv-newSinceLogin"' : '';

            const nameHtml = isEmpty
                ? `<span class="logv-nameDisabled" title="Empty file">${this.escapeHtml(r.name)}</span>`
                : `<a href="#" class="logv-link" data-path="${this.escapeAttr(r.path)}">
                        ${this.escapeHtml(r.name)}
                   </a>`;

            const dlHtml = isEmpty
                ? ``
                : `<a href="#" class="logv-dl" title="Download"
                      data-path="${this.escapeAttr(r.path)}"
                      data-name="${this.escapeAttr(r.name)}"
                      aria-label="Download" tabindex="0">
                        <svg class="logv-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z"/>
                        </svg>
                   </a>`;

            const clearHtml = isEmpty
                ? ``
                : `<a href="#" class="logv-clear" title="Clear file"
                      data-path="${this.escapeAttr(r.path)}"
                      data-name="${this.escapeAttr(r.name)}"
                      aria-label="Clear file" tabindex="0">
                        <svg class="logv-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path d="M3 6h18v2H3V6zm3 3h12l-1 11.5A2 2 0 0 1 15 23H9a2 2 0 0 1-2-2.5L6 9zm3-6h6l1 2H8l1-2z"/>
                        </svg>
                   </a>`;

            return `
                <tr${trCls}>
                    <td class="logv-name">
                        <div class="logv-nameWrap">
                            ${nameHtml}
                            ${dlHtml}
                            ${clearHtml}
                        </div>
                    </td>
                    <td>${this.formatDate(r.mtime)}</td>
                    <td class="logv-num">${this.formatBytes(r.size)}</td>
                </tr>
            `;
        }).join("");

        $tbody.html(html);
    }

    updateSortIndicators() {
        const $ths = $(`#${this.id} thead th[data-sort]`);
        $ths.removeClass("logv-sort-asc logv-sort-desc");
        $ths.each((_, th) => {
            const $th = $(th);
            if ($th.data("sort") === this.sortKey) {
                $th.addClass(this.sortDir === "asc" ? "logv-sort-asc" : "logv-sort-desc");
            }
        });
    }

    /* =========================
       Helpers
    ========================== */
    fileNameFromPath(p) {
        if (!p) return "log.txt";
        const s = String(p);
        const parts = s.split(/[\\/]/);
        return parts[parts.length - 1] || "log.txt";
    }
    escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }
    escapeAttr(str) { return this.escapeHtml(str); }
    escapeForPre(str) { return this.escapeHtml(str); }
    formatDate(ts) {
        if (!ts) return "—";
        try {
            const d = new Date(ts * 1000);
            const pad = n => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        } catch { return "—"; }
    }
    formatBytes(bytes) {
        const b = Number(bytes) || 0;
        if (b < 1024) return `${b} B`;
        const units = ["KB","MB","GB","TB"];
        let i = -1, val = b;
        do { val /= 1024; i++; } while (val >= 1024 && i < units.length-1);
        return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
    }
}
