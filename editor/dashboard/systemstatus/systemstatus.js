"use strict";

import { withReadyContract } from "../readyContract.js";

export default class SystemStatus {
    constructor(container, id, options = {}) {
        this.container = container;
        this.id        = id;
        this.endpoint  = options.endpoint || "dashboard/systemstatus/systemstatus.php";
        this.ns        = `.systemstatus-${id}`;

        // boot/ready gate
        this._booting = true;
        withReadyContract(this, { timeoutMs: 5000, autoOnResolvedRefresh: false });
        this.markBusy?.();

        // cache for Settings
        this._settingsRows  = null;
        this._settingsDiffs = null;
        this._wantSettingsDialog = false;

        // Widget shell
        this.myContainer = createDashWidget(container, id, { title: "System status" });

        // Help bubble
        const helpHtml = `
  <p>
    The System Status widget provides a concise overview of the current OASYS environment. 
    It shows the installed software version, storage usage, and the number of users currently 
    active in the front end and back end.
  </p>
  <p>
    It also reports database status, confirms recent backups, runs a basic system check, and 
    highlights deviations from default system settings.
  </p>`;
        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', { container: $helpAnchor, htmlContent: helpHtml, title: "System status – Help" });
        }

        // Markup: fixed grid (no scrollbars, no wrapping)
        const $c = $("#" + id);
        $c.html(`<div class="sysz-body"><div class="sysz-grid sysz-grid--fixed" id="${id}_grid"></div></div>`);

        // Events
        $(document)
            .off(`click${this.ns}`, `#${id} .sysz-pill[data-action], #${id} .sysz-chip[data-action]`)
            .on(`click${this.ns}`, `#${id} .sysz-pill[data-action], #${id} .sysz-chip[data-action]`, (e) => {
                e.preventDefault();
                const $el    = $(e.currentTarget);
                const action = String($el.data("action") || "");
                if (!action) return;

                // Settings details are client-managed (but may lazy-load data)
                if (action === "showSettingsDetails") {
                    this.openSettingsDialog();
                    return;
                }

                let payload = $el.data("payload") || {};
                if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = {}; } }
                this.startAjax(action, payload, { silent: false });
            });

        // Initial load (silent while booting)
        this.refresh({ silent: true });
    }

    destroy(){ $(document).off(this.ns); }

    /* ===== AJAX ===== */
    startAjax(action, data, opts = {}) {
        const silent = !!opts.silent || this._booting;
        if (!silent) globalThis.dashboardWaitStart?.();

        $.ajax({
            url: this.endpoint, type: "POST", dataType: "json", cache: false, timeout: 300000,
            data: { action, data: JSON.stringify(data || {}) },
            success: (res) => this.onAjaxSuccess(res, { silent }),
            error:   (jqXHR, _t, err) => this.onAjaxError(jqXHR, _t, err, { silent })
        });
    }

    onAjaxError(jqXHR, _textStatus, errorThrown, { silent } = {}) {
        if (!silent) globalThis.dashboardWaitEnd?.();
        const retContents = jqXHR.responseJSON !== undefined ? jqXHR.responseJSON.fatalError : "No server data returned";
        new nxDialog("ajaxError", {
            buttons: [{ label: "OK", default: true, cancel: true, value: "ok" }],
            contents: retContents, title: "Error" + ": " + errorThrown, width: 500
        });
    }

    onAjaxSuccess(res, { silent } = {}) {
        $("#un_val").text(res.loggedInName || "");
        if (!silent) globalThis.dashboardWaitEnd?.();

        if (res.fatalError) {
            new nxDialog("fatalError", {
                buttons:[{label:"OK",default:true,cancel:true,value:"ok"}],
                contents:formatActionErrorMessage(`<strong>Sorry! The action cannot be completed.</strong><br />${res.fatalError}`),
                title:"Error", icon:"../images/error.png", iconWidth:64, width:500
            });
            return;
        }
        if (res.error) {
            new nxDialog("error", {
                buttons:[{label:"OK",default:true,cancel:true,value:"ok"}],
                contents:formatActionErrorMessage(`<strong>Sorry! The action cannot be completed.</strong><br><p>${res.error}</p>`),
                title:"Error", icon:"../images/error.png", iconWidth:64, width:700,
                callback:()=>{ if(res.forceLoginRedirect) window.location="index.php"; }
            });
            return;
        }

        switch(res.action){
            case "readOverview": {
                this.renderOverview(res.data || {});
                // lazy-load settings (for count + dialog, not blocking readiness)
                this.loadSettings(false);

                // boot finished: the widget is visually ready
                if (this._booting) {
                    this._booting = false;
                    this.markReady?.();
                }
                break;
            }

            case "listFrontEndOnline": {
                const rows = (res.data && res.data.rows) || [];
                const body = rows.map(r => `
          <tr>
            <td>${this.escape(r.name || "")}</td>
            <td>${this.formatNice(r.activeTs)}</td>
          </tr>`).join("");
                this.dialog(
                    `Front-end users online`,
                    `<table class="sysz-dialogTbl">
            <thead><tr><th>Name</th><th>Last activity</th></tr></thead>
            <tbody>${body || `<tr><td colspan="2">No active test takers.</td></tr>`}</tbody>
          </table>`,
                    700
                );
                break;
            }

            case "listBackEndOnline": {
                if (res.data && res.data.notAvailable) {
                    this.dialog("Back-end users online", `<p class="sysz-muted">Back-end session table not available on this system.</p>`, 560);
                    break;
                }
                const rows = (res.data && res.data.rows) || [];
                const body = rows.map(r => `
          <tr><td>${this.escape(r.username || "—")}</td><td>${this.formatNice(r.lastSeen)}</td></tr>
        `).join("");
                this.dialog("Back-end users online",
                    `<table class="sysz-dialogTbl">
            <thead><tr><th>Username</th><th>Last seen</th></tr></thead>
            <tbody>${body || `<tr><td colspan="2">No active editors.</td></tr>`}</tbody>
          </table>`, 700);
                break;
            }

            case "showVersionDetails": {
                const d = res.data || {};
                this.dialog("OASYS version",
                    `<div class="oasysInfoCont sysz-vbox">
            <div class="oasysInfoSummary">
              <div class="oasysInfoMetric"><span>Complete version number</span><strong>${this.escape(d.v || "")}</strong></div>
              <div class="oasysInfoMetric"><span>Short version</span><strong>${this.escape(d.vshort || "")}</strong></div>
            </div>
            ${d.infoHtml ? `<div class="oasysInfoNotes sysz-info">${d.infoHtml}</div>` : ``}
          </div>`, 780);
                break;
            }

            case "showStorageDetails": {
                const d = res.data || {};
                this.dialog("Storage usage",
                    `<table class="sysz-dialogTbl">
            <tbody>
              <tr><td>Total</td><td class="sysz-num">${this.bytes(d.total||0)}</td></tr>
              <tr><td>Used</td><td class="sysz-num">${this.bytes(d.used||0)}${(d.usedPct!=null?` (${d.usedPct}% )`:"")}</td></tr>
              <tr><td>Free</td><td class="sysz-num">${this.bytes(d.free||0)}</td></tr>
            </tbody>
          </table>`, 560);
                break;
            }

            case "showBackupDetails": {
                const d = res.data || {};
                const items = d.items || [];
                const body = items.map(x => `
          <tr>
            <td>${this.escape(x.name || this.fileName(x.path))}</td>
            <td class="sysz-num">${this.bytes(x.size || 0)}</td>
            <td>${this.formatNice(x.mtime)}</td>
            <td>${this.escape(x.type || '')}</td>
          </tr>`).join("");
                this.dialog("Backups found",
                    `<table class="sysz-dialogTbl">
            <thead><tr><th>File</th><th>Size</th><th>Date</th><th>Type</th></tr></thead>
            <tbody>${body || `<tr><td colspan="4">No backups found.</td></tr>`}</tbody>
          </table>`, 980);
                break;
            }

            case "syscheckDetails": {
                const data = res.data || {};

                this.dialog("System check details", `
          ${this.renderSystemCheckColumns(data)}
        `, 1205);
                break;
            }

            case "showDbDetails": {
                const d = res.data || {};
                const head = `
          <div class="sysz-vbox">
            <div><b>Version:</b> ${this.escape(d.version || "—")}</div>
            <div><b>Status:</b> ${this.escape((d.status || "unknown").toUpperCase())}
              ${d.ok!=null ? ` • OK: ${d.ok}` : ""}${d.warnings!=null ? ` • Warnings: ${d.warnings}` : ""}${d.errors!=null ? ` • Errors: ${d.errors}` : ""}</div>
          </div>`;

                const body = (d.tables || []).map(t => `
          <tr class="${t.state === 'OK' ? '' : (t.msg && /warning/i.test(t.msg) ? 'is-warn' : 'is-fail')}">
            <td>${this.escape(t.name)}</td>
            <td>${this.escape(t.engine || '')}</td>
            <td class="sysz-num">${t.rows != null ? this.escape(String(t.rows)) : '—'}</td>
            <td>${this.escape(t.state || '')}</td>
            <td>${this.escape(t.msg || '')}</td>
          </tr>`).join("");

                this.dialog("Database details",
                    `${head}
           <table class="sysz-dialogTbl">
             <thead><tr><th>Table</th><th>Engine</th><th>Rows</th><th>State</th><th>Message</th></tr></thead>
             <tbody>${body || `<tr><td colspan="5">No table info available.</td></tr>`}</tbody>
           </table>`,
                    1000
                );
                break;
            }

            case "readSettings": {
                const rows = (res.data && res.data.rows) || [];
                this._settingsRows = rows;

                const { diffs, count } = this.computeSettingsDiff(rows);
                this._settingsDiffs = diffs;

                // update count in the tile
                const countEl = document.getElementById(`${this.id}_settingsCount`);
                if (countEl) countEl.textContent = String(count);

                // open dialog if this call was initiated by clicking the tile
                if (this._wantSettingsDialog) {
                    this._wantSettingsDialog = false;
                    this.showSettingsDialog(diffs);
                }
                break;
            }
        }
    }

    /* ===== UI ===== */
    refresh(opts = {}) { this.startAjax("readOverview", { includeSelf: true }, opts); }

    renderOverview(d){
        const ver = d.version   || {};
        const fs  = d.storage   || {};
        const fe  = d.frontEnd  || {};
        const be  = d.backEnd   || {};
        const bk  = d.backups   || {};
        const sc  = d.sysCheck  || { status:"ok", warnCount:0, failCount:0 };
        const db  = d.database  || {};

        // Upgrade availability + role gate
        const upgAvail  = String(sessionStorage.getItem("upgAvail") || "").toLowerCase() === "true";
        const userRole  = String(window.userRole || "").toLowerCase();
        const canUpgrade = upgAvail && userRole === "superadmin";

        // Compute OASYS root (prefix before "/editor/")
        const rootPrefix = (() => {
            const p = location.pathname;
            const i = p.indexOf("/editor/");
            return i >= 0 ? p.slice(0, i) : "";
        })();
        const upgraderHref = `${rootPrefix}/editor/upgrader.php`;

        const icon = (n)=>({
            info:`<span class="sysz-ic" aria-hidden>ⓘ</span>`,
            hdd:`<span class="sysz-ic" aria-hidden>💽</span>`,
            fe:`<span class="sysz-ic" aria-hidden>🧑‍🎓</span>`,
            be:`<span class="sysz-ic" aria-hidden>🛠️</span>`,
            bk:`<span class="sysz-ic" aria-hidden>🗂️</span>`,
            hc:`<span class="sysz-ic" aria-hidden>🩺</span>`,
            db:`<span class="sysz-ic" aria-hidden>🛢️</span>`
        }[n]||'');

        const dbStatus = db.status ? db.status.toUpperCase() : "UNKNOWN";
        const dbSub = (db.ok!=null || db.warnings!=null || db.errors!=null)
            ? `Integrity: ${dbStatus} • Warn ${db.warnings||0}, Err ${db.errors||0}`
            : "";

        const feCount = Number(fe.count || 0);
        const beCount = be.notAvailable ? 'n/a' : Number(be.count || 0);

        // --- Tiles with fixed area classes ---
        const tileVersion = `
  <div class="sysz-card sysz-area-ver ${canUpgrade ? 'sysz-card--upg' : ''}">
    <div class="sysz-title">${icon('info')}OASYS version</div>
    <a href="#" class="sysz-pill" data-action="showVersionDetails">
      ${this.escape(String(ver.vshort || '—'))}
    </a>
    ${canUpgrade
            ? `<div class="sysz-sub"><a class="sysz-upgLink" href="${upgraderHref}">New version available</a></div>`
            : (ver.v ? `<div class="sysz-sub">${this.escape(String(ver.v))}</div>` : ``)
        }
  </div>`;

        const tileDb = `
      <div class="sysz-card sysz-area-db">
        <div class="sysz-title">${icon('db')}Database</div>
        <a href="#" class="sysz-pill ${db.status==='fail'?'danger':(db.status==='warn'?'warn':'')}" data-action="showDbDetails">
          ${this.escape(String(db.version || '—'))}
        </a>
        ${dbSub ? `<div class="sysz-sub">${this.escape(dbSub)}</div>` : ``}
      </div>`;

        const loggedInTile = `
      <div class="sysz-card sysz-area-log">
        <div class="sysz-title">👥 Logged in</div>
        <div class="sysz-loginsRow">
          <a href="#" class="sysz-pill ${feCount>0?'ok':''}" data-action="listFrontEndOnline">
            Front-end: ${this.escape(String(feCount))}
          </a>
          <a href="#" class="sysz-pill ${(!be.notAvailable && Number(beCount)>0)?'ok':''}" data-action="listBackEndOnline">
            Back-end: ${this.escape(String(beCount))}
          </a>
        </div>
        ${be.notAvailable ? `<div class="sysz-sub">Back-end not available</div>` : ``}
      </div>`;

        const tileSc = `
      <div class="sysz-card sysz-area-sc">
        <div class="sysz-title">${icon('hc')}System check</div>
        <a href="#" class="sysz-pill ${sc.status==='fail'?'danger':(sc.status==='warn'?'warn':'ok')}" data-action="syscheckDetails">
          ${this.escape(String(sc.status==='ok'?'OK':(sc.status==='warn'?'Warnings':'Failures')))}
        </a>
        <div class="sysz-sub">${this.escape(`${sc.warnCount} warnings, ${sc.failCount} failures`)}</div>
      </div>`;

        const total = Number(fs.total||0);
        const free  = Number(fs.free ||0);
        const usedO = Number(fs.used ||0);
        const usedOther = total>0 ? Math.max(0, total - free - usedO) : 0;
        const pct = (n)=> total>0 ? Math.max(0, Math.min(100, Math.round((n/total)*100))) : 0;
        const wUsed  = pct(usedO);
        const wOther = pct(usedOther);
        const wFree  = Math.max(0, 100 - wUsed - wOther);

        const storageWideTile = `
  <div class="sysz-card sysz-card--tight sysz-area-sto">
    <div class="sysz-title">💽 Storage (${this.bytes(total)})</div>

    <div class="sysz-bar sysz-bar--stack" role="img"
         aria-label="Storage usage: OASYS ${this.bytes(usedO)}; Other ${this.bytes(usedOther)}; Free ${this.bytes(free)}; Total ${this.bytes(total)}">
      <div class="sysz-seg is-used"  style="width:${wUsed}%"></div>
      ${usedOther>0 ? `<div class="sysz-seg is-other" style="width:${wOther}%"></div>` : ``}
      <div class="sysz-seg is-free"  style="width:${wFree}%"></div>
    </div>

    <div class="sysz-legend">
      <div class="sysz-legend-group">
        <span class="sysz-legend-item"><i class="sysz-swatch sw-used"></i> OASYS • ${this.bytes(usedO)} (${wUsed}%)</span>
        ${usedOther>0 ? `<span class="sysz-legend-item"><i class="sysz-swatch sw-other"></i> Other • ${this.bytes(usedOther)} (${wOther}%)</span>` : ``}
        <span class="sysz-legend-item"><i class="sysz-swatch sw-free"></i> Available • ${this.bytes(free)} (${wFree}%)</span>
      </div>
    </div>

    ${fs.ok===false ? `<div class="sysz-sub">unavailable</div>` : ``}
  </div>`;

        const latest = bk.latest
            ? `Latest • ${this.bytes(bk.latest.size||0)}<br>${this.formatNice(bk.latest.mtime)}`
            : 'No backups found';
        const backupsTile = `
      <div class="sysz-card sysz-area-bak">
        <div class="sysz-title">🗂️ Backups</div>
        <div class="sysz-chipRow">
          <a href="#" class="sysz-chip" data-action="showBackupDetails">Show details</a>
        </div>
        <div class="sysz-sub">${latest}</div>
      </div>`;

        const settingsCount = this._settingsDiffs ? String(this._settingsDiffs.length) : "—";

        const tileSettings = `
      <div class="sysz-card sysz-area-set">
        <div class="sysz-title">⚙️ Settings</div>
        <a href="#" class="sysz-pill" data-action="showSettingsDetails">
          <span id="${this.id}_settingsCount">${this.escape(settingsCount)}</span>
        </a>
        <div class="sysz-sub">modified</div>
      </div>`;

        // Fixed order doesn't matter thanks to grid areas; keep semantic order:
        $(`#${this.id}_grid`).html(
            tileVersion + tileDb + loggedInTile + tileSc + storageWideTile + backupsTile + tileSettings
        );
    }

    /* ===== Settings helpers ===== */

    renderSystemCheckColumns(data) {
        const groups = {};
        Object.keys(data)
            .filter(k => !["req","found","failMsgs","warn","categories","details"].includes(k))
            .forEach(k => {
                const category = data.categories?.[k] || "General";
                if (!groups[category]) groups[category] = [];
                groups[category].push(k);
            });

        const leftCategories = ["PHP runtime", "PHP extensions", "PHP configuration"];
        const categories = Object.keys(groups);
        const left = leftCategories.filter(c => groups[c]);
        const right = categories.filter(c => !leftCategories.includes(c));

        const renderColumn = categoryList => categoryList.map(category => `
            <section class="sysz-scGroup">
              <h3 class="sysz-scGroupTitle">${this.escape(category)}</h3>
              <table class="sysz-scTbl">
                <thead><tr><th class="sysz-icoCell">Status</th><th class="sysz-cellKey">Parameter</th><th class="sysz-cellReq">Required</th><th>Result</th></tr></thead>
                <tbody>${groups[category].map(k => {
                const v = data[k];
                let cls = "", icon = "OK";
                if (v === false) { cls = "is-fail"; icon = "FAIL"; }
                else if (v === "warn") { cls = "is-warn"; icon = "WARN"; }

                return `
              <tr class="${cls}">
                <td class="sysz-icoCell"><span class="sysz-statusIcon">${icon}</span></td>
                <td class="sysz-cellKey">${this.escape(k)}${data.details?.[k] ? `<div class="sysz-cellKeyMeta">${this.escape(data.details[k])}</div>` : ""}</td>
                <td class="sysz-cellReq">${data.req?.[k] ?? ""}</td>
                <td class="sysz-cellFound">
                  ${v===false
                    ? `<div class="sysz-foundBlock">${data.found?.[k] ?? ""}<div class="sysz-failMsg">${data.failMsgs?.[k] ?? ""}</div></div>`
                    : (v==="warn"
                        ? `<div class="sysz-foundBlock">${data.warn?.[k] ?? data.found?.[k] ?? ""}</div>`
                        : `<div class="sysz-foundBlock">${data.found?.[k] ?? ""}</div>`)}
                </td>
              </tr>`;
            }).join("")}</tbody>
              </table>
            </section>`).join("");

        return `
            <div class="sysz-scColumns">
              <div class="sysz-scColumn">${renderColumn(left)}</div>
              <div class="sysz-scColumn">${renderColumn(right)}</div>
            </div>`;
    }

    loadSettings(openDialog) {
        if (this._settingsRows && !openDialog) return;
        if (openDialog) this._wantSettingsDialog = true;
        this.startAjax("readSettings", {}, { silent: true }); // silent; doesn't block widget
    }

    computeSettingsDiff(rows){
        const defaults = (window.settingsDefaults && typeof window.settingsDefaults === "object")
            ? window.settingsDefaults : {};
        const diffs = [];
        for (const r of rows) {
            const key = String(r.option || "");
            const enc = Number(r.encryption) === 1 ? 1 : 0;
            const cur = String(r.value ?? "");
            const rawDef = defaults[key];
            const def = (rawDef && typeof rawDef === "object" && "value" in rawDef)
                ? String(rawDef.value ?? "")
                : String(rawDef ?? "");
            if (!key) continue;
            if (enc || cur !== def) {
                diffs.push({ option: key, current: enc ? "" : cur, def: def, enc });
            }
        }
        return { diffs, count: diffs.length };
    }

    openSettingsDialog(){
        if (!this._settingsRows) { this.loadSettings(true); return; }
        this.showSettingsDialog(this._settingsDiffs || []);
    }

    showSettingsDialog(diffs){
        const rowsHtml = (diffs.length ? diffs : []).map(d => `
            <tr>
              <td>${this.escape(d.option)}</td>
              <td>${d.enc ? this.encryptedBadgeHtml() : this.escape(d.current)}</td>
              <td>${this.escape(d.def)}</td>
            </tr>
        `).join("");

        const html = `
          <table class="sysz-dialogTbl">
            <thead><tr><th>Option</th><th>Current</th><th>Default</th></tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="3">All settings are at their defaults.</td></tr>`}</tbody>
          </table>
        `;

        this.dialog(`System settings — ${diffs.length} changed`, html, 960);
    }

    encryptedBadgeHtml(title = "Stored encrypted") {
        return `<span class="enc-badge" title="${this.escape(title)}">${this.lockOpenSvg(11)} Encryption</span>`;
    }

    lockOpenSvg(size = 14) {
        return `
            <svg class="enc-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 17a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm6-6h-8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M9 7a4 4 0 1 1 8 0v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
    }

    /* ===== Misc helpers ===== */
    dialog(title, html, width=900, height=640){
        new nxDialog("syszDialog", {
            title, contents:`<div class="sysz-dialogWrap">${html}</div>`,
            width, height, buttons:[{label:"Close", default:true, cancel:true, value:"ok"}]
        });
    }
    formatTs(ts){ if(!ts) return "—"; const d=this._parseDate(ts); if(!d) return this.escape(String(ts)); const p=n=>String(n).padStart(2,"0"); return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
    formatNice(ts){ if (ts==null) return "—"; const d=this._parseDate(ts); if(!d) return this.escape(String(ts)); const p=n=>String(n).padStart(2,"0"); const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`; }
    _parseDate(ts){ if (ts instanceof Date) return isNaN(ts.getTime())?null:ts; if (typeof ts==="number"||(/^\d+$/.test(String(ts)))){ let n=Number(ts); if (String(Math.trunc(n)).length<=12) n=n*1000; const d=new Date(n); return isNaN(d.getTime())?null:d; } const norm=String(ts).replace(" ","T").replace(/\.\d+$/,""); const d=new Date(norm); return isNaN(d.getTime())?null:d; }
    bytes(n){ const b=Number(n)||0; if (b<1024) return `${b} B`; const u=["KB","MB","GB","TB","PB"]; let i=-1, v=b; do { v/=1024; i++; } while(v>=1024 && i<u.length-1); return `${v.toFixed(v<10?1:0)} ${u[i]}`; }
    fileName(p){ const s=String(p||""); const a=s.split(/[\\/]/); return a[a.length-1]||s; }
    escape(str){ if (str===null || str===undefined) return ""; return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
}
