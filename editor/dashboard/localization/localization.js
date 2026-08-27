"use strict";

import { withReadyContract } from "../readyContract.js";

export default class Localization {
    constructor(container, id, options = {}) {
        this.container  = container;
        this.id         = id;
        this.endpoint   = options.endpoint || "dashboard/localization/localization.php";

        // state
        this.defaults     = [];
        this.additionals  = [];

        // 1) Widget shell
        this.myContainer = createDashWidget(container, id, { title: "Localization" });

        // Help
        const helpHtml = `
  <p>
    The Localization widget manages interface texts across multiple languages in OASYS. 
    By default, four languages are available (EN, DE, FR, LU). Each language can define its own 
    fallback, and any default text can be overridden to match project-specific terminology.
  </p>
  <p>
    The tiles summarize the current setup: you’ll see which fallback is in use and how many texts 
    have been customized per language. Additional languages are supported as well, but they need a 
    value for every key to be considered complete. Missing entries are highlighted so gaps can be 
    closed quickly.
  </p>`;

        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', {
                container: $helpAnchor,
                htmlContent: helpHtml,
                title: "Localization – Help"
            });
        }

        // 2) Markup
        const $c = $("#" + id);
        $c.html(`
            <div class="locz-body">
                <!-- Default language tiles -->
                <div class="locz-sectionHead">Default languages</div>
                <div class="locz-tiles" id="${id}_tiles">
                    <!-- injected -->
                </div>

                <!-- Additionals header -->
                <div class="locz-sectionHead">Additional languages</div>

                <!-- Additionals table (center all except first col) -->
                <div class="locz-tableWrap" id="${id}_wrap">
                    <table class="locz-table" id="${id}_table">
                        <thead>
                            <tr>
                                <th data-sort="name">Name</th>
                                <th data-sort="code">Code</th>
                                <th data-sort="fallback">Fallback</th>
                                <th data-sort="missingCount">Missing</th>
                                <th data-sort="totalVars">Total</th>
                            </tr>
                        </thead>
                        <tbody id="${id}_tbody">
                            <tr class="locz-empty"><td colspan="5">—</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `);

        // Events for pills
        this.ns = `.localization-${id}`;

        // Modified pill on default tiles
        $(document)
            .off(`click${this.ns}`, `#${id} .locz-modBtn`)
            .on(`click${this.ns}`, `#${id} .locz-modBtn`, (e) => {
                e.preventDefault();
                const code = String($(e.currentTarget).data("code") || "");
                if (code) this.inspectModified(code);
            });

        // Missing pill (additionals)
        $(document)
            .off(`click${this.ns}`, `#${id} .locz-missBtn`)
            .on(`click${this.ns}`, `#${id} .locz-missBtn`, (e) => {
                e.preventDefault();
                const code = String($(e.currentTarget).data("code") || "");
                if (code) this.inspectLanguage(code);
            });

        // ---- Ready contract (resolve after first successful overview load) ----
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
                callback: () => { if (res.forceLoginRedirect) window.location = 'index.php'; }
            });
            return;
        }

        switch (res.action) {
            case 'readOverview': {
                const d = res.data || {};
                this.defaults    = Array.isArray(d.defaults)    ? d.defaults    : [];
                this.additionals = Array.isArray(d.additionals) ? d.additionals : [];
                this.renderTiles();
                this.renderAdditionals();

                // ---- Signal dashboard boot gate that first data is ready ----
                this.markReady?.();
                break;
            }

            case 'inspectLanguage': {
                const d = res.data || {};
                const code = d.code || "";
                const missing = Array.isArray(d.missing) ? d.missing : [];

                const title = `Missing strings for ${this.escapeHtml(code)}`;
                const hint = (missing.length === 0)
                    ? `<div class="locz-dialogMeta">No missing strings 🎉</div>`
                    : `<div class="locz-dialogMeta">Found ${missing.length} missing string${missing.length>1?'s':''}.</div>`;

                const rowsHtml = (missing.length === 0) ? ``
                    : missing.map(m => `
                        <tr>
                            <td>${this.escapeHtml(m.context)}</td>
                            <td>${this.escapeHtml(m.variable)}</td>
                            <td>${this.escapeHtml(m.exampleEN || "")}</td>
                        </tr>
                      `).join("");

                const tableHtml = (missing.length === 0) ? ``
                    : `
                        <div class="locz-dialogTblWrap">
                          <table class="locz-dialogTbl">
                            <thead><tr><th>Context</th><th>Variable</th><th>EN example</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                          </table>
                        </div>
                      `;

                new nxDialog('inspectLang', {
                    title,
                    contents: `<div class="locz-dialog">${hint}${tableHtml}</div>`,
                    width: 920,
                    height: 600,
                    buttons: [{ label: 'Close', 'default': true, cancel: true, value: 'ok' }]
                });
                break;
            }

            case 'inspectModified': {
                const d = res.data || {};
                const code = d.code || "";
                const rows = Array.isArray(d.modified) ? d.modified : [];

                const title = `Modified strings for ${this.escapeHtml(code)}`;
                const hint = (rows.length === 0)
                    ? `<div class="locz-dialogMeta">No overrides – all strings use defaults 🎉</div>`
                    : `<div class="locz-dialogMeta">Found ${rows.length} overridden string${rows.length>1?'s':''}.</div>`;

                const rowsHtml = (rows.length === 0) ? ``
                    : rows.map(m => `
                        <tr>
                            <td>${this.escapeHtml(m.context)}</td>
                            <td>${this.escapeHtml(m.variable)}</td>
                            <td>${this.escapeHtml(m.defaultValue || "")}</td>
                            <td>${this.escapeHtml(m.modifiedValue || "")}</td>
                        </tr>
                      `).join("");

                const tableHtml = (rows.length === 0) ? ``
                    : `
                        <div class="locz-dialogTblWrap">
                          <table class="locz-dialogTbl">
                            <thead><tr><th>Context</th><th>Variable</th><th>Default</th><th>Modified</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                          </table>
                        </div>
                      `;

                new nxDialog('inspectMod', {
                    title,
                    contents: `<div class="locz-dialog">${hint}${tableHtml}</div>`,
                    width: 1000,
                    height: 640,
                    buttons: [{ label: 'Close', 'default': true, cancel: true, value: 'ok' }]
                });
                break;
            }
        }
    }

    /* =========================
       UI actions
    ========================== */
    refresh() { this.startAjax('readOverview', {}); }
    inspectLanguage(code) { this.startAjax('inspectLanguage', { code }); }
    inspectModified(code) { this.startAjax('inspectModified', { code }); }

    renderTiles() {
        const $tiles = $(`#${this.id}_tiles`);
        if (!this.defaults || this.defaults.length === 0) {
            $tiles.html('');
            return;
        }
        // Keep order EN, DE, FR, LU using simple weight
        const order = { EN:1, DE:2, FR:3, LU:4 };
        const arr = [...this.defaults].sort((a,b)=>(order[a.code]||9)-(order[b.code]||9));

        const html = arr.map(r => {
            const pill = (Number(r.modifiedCount || 0) > 0)
                ? `<a href="#" class="locz-pill danger locz-modBtn" data-code="${this.escapeAttr(r.code)}" title="Show modified strings">${r.modifiedCount}</a>`
                : `<span class="locz-pill ok" title="No overrides">0</span>`;

            return `
    <div class="locz-tile">
      <div class="locz-nameTop">${this.escapeHtml(r.name)}</div>

      <div class="locz-flagRow">
        <span class="locz-flag">${this.escapeHtml(r.flag || '')}</span>
        <span class="locz-langCode"><code>${this.escapeHtml(r.code)}</code></span>
      </div>

      <div class="locz-modRow">
        <span class="locz-k">Modified</span>
        ${pill}
      </div>

      <div class="locz-tileFoot">
        <span class="locz-totalHint">Total keys: ${Number(r.totalVars||0)}</span>
      </div>
    </div>
  `;
        }).join("");


        $tiles.html(html);
    }

    renderAdditionals() {
        const $tbody = $("#" + this.id + "_tbody");
        const $noAdd = $("#" + this.id + "_noAdd");

        if (!this.additionals || this.additionals.length === 0) {
            $tbody.html(`<tr class="locz-empty"><td colspan="5">—</td></tr>`);
            $noAdd.show();
            return;
        }
        $noAdd.hide();

        // Sort by name
        const rows = [...this.additionals].sort((a,b) => a.name.localeCompare(b.name));

        const html = rows.map(r => {
            const missingCell = (Number(r.missingCount || 0) > 0)
                ? `<a href="#" class="locz-pill danger locz-missBtn" data-code="${this.escapeAttr(r.code)}" title="Show missing strings">${r.missingCount}</a>`
                : `<span class="locz-pill ok" title="Complete">0</span>`;

            return `
                <tr>
                    <td class="locz-nameCol">${this.escapeHtml(r.name || "")}</td>
                    <td><code>${this.escapeHtml(r.code)}</code></td>
                    <td>${this.escapeHtml(r.fallback || "—")}</td>
                    <td>${missingCell}</td>
                    <td>${Number(r.totalVars||0)}</td>
                </tr>
            `;
        }).join("");

        $tbody.html(html);
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
    escapeAttr(str) { return this.escapeHtml(str); }
}
