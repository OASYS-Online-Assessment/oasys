"use strict";

import { withReadyContract } from "../readyContract.js";

export default class UserWidget {
    constructor(container, id, options = {}) {
        this.container = container;
        this.id        = id;
        this.endpoint  = options.endpoint || "dashboard/userwidget/userwidget.php";
        this.ns        = `.userwidget-${id}`;

        // boot/ready gate
        this._booting = true;
        withReadyContract(this, { timeoutMs: 5000, autoOnResolvedRefresh: false });
        this.markBusy?.();

        // Shell
        this.myContainer = createDashWidget(container, id, { title: "User overview" });

        // Help
        const helpHtml = `
  <p>
    The User Overview widget provides a real-time snapshot of all users registered in the 
    OASYS back end. It offers a quick impression of the administrative user base, showing 
    how many accounts are active, blocked, or organized into specific user groups 
    within your access scope.
  </p>
  <p>
    The overview also highlights potential issues such as users without a valid email address 
    or those with repeated failed login attempts, enabling administrators to resolve access 
    or communication problems early.
  </p>
  <p>
    In addition, it identifies back-end users with extended permissions, for example those 
    allowed to access root-level folders, providing clear visibility of elevated privileges 
    within the OASYS environment.
  </p>`;
        const $helpAnchor = $('#' + id + '_help');
        if ($helpAnchor.length) {
            new OasysHelp(id + '_help', { container:$helpAnchor, htmlContent:helpHtml, title:"User overview – Help" });
        }

        // Markup
        $("#" + id).html(`<div class="usrz-body"><div class="usrz-tiles" id="${id}_tiles"></div></div>`);

        // Tile action rows
        $(document)
            .off(`click${this.ns}`, `#${id} .usrz-actionRow[data-action]`)
            .on(`click${this.ns}`, `#${id} .usrz-actionRow[data-action]`, e => {
                e.preventDefault();
                const action = String($(e.currentTarget).data("action") || "");
                if (action) this.startAjax(action, {}, { silent: false });
            });

        // Delegated filter handler (works even when dialog content is injected later)
        $(document)
            .off(`input${this.ns}`, `#usrz-users-filter`)
            .on(`input${this.ns}`, `#usrz-users-filter`, () => {
                const q = String($("#usrz-users-filter").val() || "").toLowerCase();
                const $rows = $("#usrz-users-tbl tbody tr");
                $rows.each(function(){
                    const txt = $(this).text().toLowerCase();
                    $(this).toggle(txt.includes(q));
                });
            });

        $(document)
            .off(`mouseenter${this.ns} mousemove${this.ns} mouseleave${this.ns}`, `.usrz-membersCount`)
            .on(`mouseenter${this.ns}`, `.usrz-membersCount`, e => this.showMembersTooltip(e.currentTarget, e))
            .on(`mousemove${this.ns}`, `.usrz-membersCount`, e => this.moveMembersTooltip(e))
            .on(`mouseleave${this.ns}`, `.usrz-membersCount`, () => this.hideMembersTooltip());

        // Initial load (silent during boot)
        this.refresh({ silent: true });
    }

    destroy(){ $(document).off(this.ns); }

    /* ===== AJAX ===== */
    startAjax(action, data, opts = {}){
        const silent = !!opts.silent || this._booting;
        if (!silent) globalThis.dashboardWaitStart?.();

        $.ajax({
            url:this.endpoint, type:"POST", dataType:"json", cache:false, timeout:300000,
            data:{ action, data: JSON.stringify(data || {}) },
            success: r => this.onAjaxSuccess(r, { silent }),
            error: (jq,_t,err) => this.onAjaxError(jq,_t,err, { silent })
        });
    }
    onAjaxError(jqXHR,_t,err,{ silent } = {}){
        if (!silent) globalThis.dashboardWaitEnd?.();
        const contents = jqXHR.responseJSON !== undefined ? jqXHR.responseJSON.fatalError : "No server data returned";
        new nxDialog("ajaxError", {
            buttons:[{label:"OK",default:true,cancel:true,value:"ok"}],
            contents, title:"Error: " + err, width: 520
        });
    }

    onAjaxSuccess(res,{ silent } = {}){
        $("#un_val").text(res.loggedInName || "");
        if (!silent) globalThis.dashboardWaitEnd?.();

        if (res.fatalError) {
            new nxDialog("fatalError", {
                buttons:[{label:"OK",default:true,cancel:true,value:"ok"}],
                contents:formatActionErrorMessage(`<strong>Sorry! The action cannot be completed.</strong><br />${res.fatalError}`),
                title:"Error", icon:"../images/error.png", iconWidth:64, width:520
            }); return;
        }
        if (res.error) {
            new nxDialog("error", {
                buttons:[{label:"OK",default:true,cancel:true,value:"ok"}],
                contents:formatActionErrorMessage(`<strong>Sorry! The action cannot be completed.</strong><br><p>${res.error}</p>`),
                title:"Error", icon:"../images/error.png", iconWidth:64, width:720,
                callback:()=>{ if(res.forceLoginRedirect) window.location="index.php"; }
            }); return;
        }

        switch(res.action){
            case "readOverview":
                this.renderOverview(res.data || {});
                if (this._booting) { this._booting = false; this.markReady?.(); }
                break;

            /* ===== Detail dialogs ===== */
            case "listUsers": {
                const rows = (res.data && res.data.users) || [];
                const html = `
          <div class="usrz-filterRow">
            <input id="usrz-users-filter" type="text" class="usrz-filterInput"
              placeholder="Filter… (name, email, groups, language, account, status)">
          </div>
          <div class="usrz-tableWrap">
            <table id="usrz-users-tbl" class="usrz-dialogTbl usrz-dialogTbl--sysz">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Groups</th>
                  <th>Language</th>
                  <th>Account</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${this.escape(r.name)}</td>
                    <td>${this.escape(r.email || "—")}</td>
                    <td>${(r.groups || []).map(this.escape).join(", ") || "—"}</td>
                    <td>${this.escape(r.defLang || "")}</td>
                    <td>${this.escape(r.acct_type || "")}</td>
                    <td>${r.blocked ? "blocked" : ""}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;
                this.showTableDialog("All users", html, 1050, 640);
                break;
            }

            case "listGroups": {
                const rows = (res.data && res.data.groups) || [];
                const body = rows.map(r => {
                    const names = Array.isArray(r.membersList) ? r.membersList : [];
                    const tip   = names.length ? names.join(', ') : 'No members';
                    return `
    <tr>
      <td>${this.escape(r.name)}</td>
      <td class="usrz-membersCell">
        <span class="usrz-membersCount"
              data-tooltip="${this.escape(tip)}"
              aria-label="${this.escape(tip)}"
              tabindex="0">
          ${Number(r.members||0)}
        </span>
      </td>
    </tr>`;
                }).join("");

                const html = `
          <div class="usrz-tableWrap">
            <table class="usrz-dialogTbl usrz-dialogTbl--sysz usrz-dialogTbl--groups">
              <thead>
                <tr>
                  <th>Name</th>
                  <th class="usrz-numHdr">Members</th>
                </tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>`;
                this.showTableDialog("User groups", html, 760, 520);
                break;
            }

            case "listBlocked": {
                const rows = (res.data && res.data.blocked) || [];
                const body = rows.map(r => `<tr><td>${this.escape(r.name)}</td><td>${this.escape(r.email || "—")}</td><td>${this.escape(r.defLang || "")}</td></tr>`).join("");
                this.showTableDialog("Blocked / locked users", `
          <div class="usrz-tableWrap">
            <table class="usrz-dialogTbl usrz-dialogTbl--sysz">
              <thead><tr><th>Name</th><th>Email</th><th>Language</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>`, 820, 520);
                break;
            }

            case "listBadLogins": {
                const rows = (res.data && res.data.bad) || [];
                const body = rows.map(r => `
          <tr>
            <td>${this.escape(r.name)}</td>
            <td>${this.escape(r.email || "—")}</td>
            <td class="usrz-num">${Number(r.bad_logins||0)}</td>
            <td>${this.formatTs(r.last_bad_pass)}</td>
          </tr>`).join("");
                this.showTableDialog("Bad logins", `
          <div class="usrz-tableWrap">
            <table class="usrz-dialogTbl usrz-dialogTbl--sysz">
              <thead><tr><th>Name</th><th>Email</th><th class="usrz-numHdr">Count</th><th>Last attempt</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>`, 980, 560);
                break;
            }

            case "listHomeAccess": {
                const rows = (res.data && res.data.home) || [];
                const body = rows.map(r => `<tr><td>${this.escape(r.name)}</td><td>${this.escape(r.email || "—")}</td></tr>`).join("");
                this.showTableDialog("Users with root folder access (non-admins)", `
          <div class="usrz-tableWrap">
            <table class="usrz-dialogTbl usrz-dialogTbl--sysz">
              <thead><tr><th>Name</th><th>Email</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>`, 780, 520);
                break;
            }

            case "listNoEmail": {
                const rows = (res.data && res.data.noemail) || [];
                const body = rows.map(r => `<tr><td>${this.escape(r.name)}</td><td>${this.escape(r.defLang || "")}</td></tr>`).join("");
                this.showTableDialog("Users without an email", `
          <div class="usrz-tableWrap">
            <table class="usrz-dialogTbl usrz-dialogTbl--sysz">
              <thead><tr><th>Name</th><th>Language</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>`, 700, 480);
                break;
            }
        }
    }

    /* ===== UI ===== */
    refresh(opts = {}){ this.startAjax("readOverview", {}, opts); }

    renderOverview(d){
        const s = d.summary || {};

        const tiles = [
            { key:'users',   icon:'👤', title:'Users',       count:Number(s.users||0),     action:'listUsers' },
            { key:'groups',  icon:'👥', title:'User groups',          count:Number(s.groups||0),    action:'listGroups' },
            { key:'blocked', icon:'🔒', title:'Locked',     count:Number(s.blocked||0),   action:'listBlocked', style:(Number(s.blocked||0)>0?'danger':'ok') },
            { key:'bad',     icon:'⚠️', title:'Bad logins',   count:Number(s.badUsers||0),  action:'listBadLogins', sub:`Total attempts: ${Number(s.badTotal||0)}`, style:(Number(s.badUsers||0)>0?'warn':'ok') },
            { key:'root',    icon:'🏠', title:'Root access',   count:Number(s.homeAccess||0),action:'listHomeAccess', sub:'(non-admins)' },
            { key:'email',   icon:'✉️', title:'Email',         count:Number(s.noEmail||0),   action:'listNoEmail', sub:'No email set', style:(Number(s.noEmail||0)>0?'warn':'ok') },
        ];

        const html = tiles.map(t => `
  <div class="usrz-tile">
    <div class="usrz-tTitle">
      <span class="usrz-ic" aria-hidden>${t.icon}</span>${t.title}
    </div>
    <a href="#" class="usrz-actionRow ${t.style || ''}" data-action="${t.action}">
      <span>${this.escape(t.title)}</span><strong>${Number(t.count || 0)}</strong>
    </a>
    <div class="usrz-sub">${this.escape(t.sub || "\u00A0")}</div>
  </div>
`).join("");

        $(`#${this.id}_tiles`).html(html);
    }

    /* ===== Helpers ===== */
    showTableDialog(title, innerHtml, width=900, height=640){
        new nxDialog("usrzDialog", {
            title, contents:`<div class="usrz-dialogWrap">${innerHtml}</div>`,
            width, height, buttons:[{label:"Close", default:true, cancel:true, value:"ok"}]
        });
    }

    showMembersTooltip(el, e){
        const text = String($(el).data("tooltip") || "");
        if (!text) return;
        const names = text.split(/\s*,\s*/).filter(Boolean);
        const html = `
          <div class="usrz-tipTitle">Members</div>
          <div class="usrz-tipList">${names.map(n => `<div>${this.escape(n)}</div>`).join("")}</div>
        `;
        let $tip = $("#usrzTooltip");
        if (!$tip.length) $tip = $('<div id="usrzTooltip" role="tooltip"></div>').appendTo(document.body);
        $tip.html(html).addClass("is-visible");
        this.moveMembersTooltip(e);
    }

    moveMembersTooltip(e){
        const $tip = $("#usrzTooltip");
        if (!$tip.length) return;
        $tip.css({ left: `${e.clientX}px`, top: `${e.clientY + 18}px` });
    }

    hideMembersTooltip(){
        $("#usrzTooltip").removeClass("is-visible");
    }

    formatTs(ts){
        if (!ts) return "—";
        const norm = String(ts).replace(" ", "T").replace(/\.\d+$/, "");
        const d = new Date(norm);
        if (isNaN(d.getTime())) return this.escape(String(ts));
        const p = n => String(n).padStart(2,"0");
        return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    escape(str){
        if (str===null || str===undefined) return "";
        return String(str)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }
}
