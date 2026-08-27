"use strict";

import { withReadyContract } from "../readyContract.js";

export default class Manuals {
    constructor(container, id, options = {}) {
        this.container = container;
        this.id = id;

        const root = (window.settings?.JSrootURL || "/").replace(/\/+$/, "");

        this.mainManual = options.mainManual || {
            label: UILANG.m("OASYS User Manual"),
            href:  `${root}/docs/oasys_manual_user.pdf`
        };

        // Same links as admin widget, but labels localized
        this.moreLinks = options.moreLinks || [
            { label: UILANG.m("Report builder guide"),     href: `${root}/docs/OASYS report builder guide.pdf` },
            { label: UILANG.m("Scripting"),                href: `${root}/docs/OASYS 3 scripting.pdf` },
            { label: UILANG.m("Advanced editor keywords"), href: `${root}/docs/OASYS 3 keywords.pdf` }
        ];

        // 1) shell 
        this.myContainer = createDashWidget(container, id, { title: UILANG.m("Manuals") });

        // 2) help
        const helpHtml = UILANG.m('<div class="manu-help"><p>The Manuals widget provides quick access to the main OASYS User Manual and other supporting guides. Use it to find reference material and practical instructions without leaving the dashboard.</p><p>The main manual is highlighted at the top for immediate access, while additional manuals and guides are listed below as direct links. All manuals open in a new browser tab, making it easy to consult them alongside your ongoing work.</p></div>');
        const $helpAnchor = $("#" + id + "_help");
        if ($helpAnchor.length) {
            new OasysHelp(id + "_help", {
                container: $helpAnchor,
                htmlContent: helpHtml,
                title: UILANG.m("Manuals – Help")
            });
        }

        // 3) markup
        const $c = $("#" + id);
        $c.addClass("manuals");
        $c.html(`
      <div class="manu-body">
        <a class="manu-main" href="${this.url(this.mainManual.href)}"
           target="_blank" rel="noopener"
           aria-label="${this.escape(this.mainManual.label)}">
          <span class="manu-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="56" height="56" role="img" aria-hidden="true">
              <path fill="currentColor"
                d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16.5a1.5 1.5 0 0 1-1.5 1.5H6.5A2.5 2.5 0 0 0 4 22V4.5zm2.5-.5A1.5 1.5 0 0 0 5 5.5V20a1.5 1.5 0 0 1 1.5-1.5H18.5V4H6.5zm3 3h7v2h-7V7zm0 4h7v2h-7v-2z"/>
            </svg>
          </span>
          <span class="manu-title">${this.escape(this.mainManual.label)}</span>
        </a>

        <ul class="manu-list">
          ${this.moreLinks.map(l => `
            <li>
              <a class="manu-link" href="${this.url(l.href)}" target="_blank" rel="noopener">
                ${this.escape(l.label)}
              </a>
            </li>`).join("")}
        </ul>
        <div class="manu-foot">
          ${UILANG.m("<strong>Note:</strong> All manuals are currently available in English only.")}
        </div>
      </div>
    `);

        // ---- Ready contract (static widget — ready after first render) ----
        withReadyContract(this, { timeoutMs: 2500, autoOnResolvedRefresh: false });
        // Defer a tick so DOM is present before we resolve
        Promise.resolve().then(() => this.markReady?.());
    }

    destroy() {}

    url(u){ try{ return encodeURI(String(u)); } catch { return String(u || ""); } }

    escape(s){
        return String(s ?? "")
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }
}
