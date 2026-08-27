"use strict";

import { withReadyContract } from "../readyContract.js";

export default class AdminManuals {
    constructor(container, id) {
        this.container = container;
        this.id = id;

        const root = (window.settings?.JSrootURL || "/").replace(/\/+$/, "");

        // Big buttons
        const ADMIN_MANUAL = {
            label: "OASYS Admin Manual",
            href:  `${root}/docs/oasys_manual_admin.pdf`
        };
        const USER_MANUAL = {
            label: "OASYS User Manual",
            href:  `${root}/docs/oasys_manual_user.pdf`
        };

        // Small links (no UILANG in admin widgets)
        const MORE_LINKS = [
            { label: "Report builder guide",        href: `${root}/docs/OASYS report builder guide.pdf` },
            { label: "Scripting",                   href: `${root}/docs/OASYS 3 scripting.pdf` },
            { label: "Advanced editor keywords",    href: `${root}/docs/OASYS 3 keywords.pdf` },
            { label: "Configuration",               href: `${root}/docs/OASYS 3 config.pdf` },
            { label: "API Reference",               href: `${root}/docs/OASYS API documentation.pdf` }
        ];

        // Shell
        this.myContainer = createDashWidget(container, id, { title: "Admin Manuals" });

        // Help
        const $helpAnchor = $("#" + id + "_help");
        if ($helpAnchor.length) {
            new OasysHelp(id + "_help", {
                container: $helpAnchor,
                title: "Admin Manuals – Help",
                htmlContent: `
                  <div class="manuadm-help">
                    <p>
                      The Admin Manuals widget provides direct access to the OASYS documentation. 
                      The main buttons open the Admin and User Manuals for quick reference, 
                      while additional manuals are available in the section below.
                    </p>
                    <p>
                      All manuals open in a separate browser tab and are permanently linked to the 
                      admin dashboard, ensuring that the most relevant and up-to-date documentation 
                      is always just one click away.
                    </p>
                  </div>`
            });
        }

        // Markup
        const $c = $("#" + id);
        $c.addClass("manualsadm");
        $c.html(`
          <div class="manuadm-body">
            <div class="manuadm-buttons">
              ${this.bigButton(ADMIN_MANUAL, "admin")}
              ${this.bigButton(USER_MANUAL, "user")}
            </div>
        
            <ul class="manuadm-list">
              ${MORE_LINKS.map(l => `
                <li>
                  <a class="manuadm-link" href="${this.url(l.href)}" target="_blank" rel="noopener noreferrer">
                    ${this.escape(l.label)}
                  </a>
                </li>`).join("")}
            </ul>
          </div>
        `);

        // Ready contract: static widget; resolve after render
        withReadyContract(this, { timeoutMs: 2500, autoOnResolvedRefresh: false });
        Promise.resolve().then(() => this.markReady?.());
    }

    destroy() {}

    // use a gear for admin, book for user
    bigButton(manual, kind = "user") {
        const extraCls = kind === "admin" ? " is-admin" : "";
        const iconSvg  = kind === "admin" ? this.iconGearOutline2() : this.iconBook();
        return `
    <a class="manuadm-main${extraCls}" href="${this.url(manual.href)}"
       target="_blank" rel="noopener noreferrer"
       aria-label="${this.escape(manual.label)}">
      <span class="manuadm-ico" aria-hidden="true">
        ${iconSvg}
      </span>
      <span class="manuadm-title">${this.escape(manual.label)}</span>
    </a>`;
    }

    // clean book icon (kept for the user manual)
    iconBook() {
        return `
    <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true">
      <path fill="currentColor"
        d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16.5a1.5 1.5 0 0 1-1.5 1.5H6.5A2.5 2.5 0 0 0 4 22V4.5zm2.5-.5A1.5 1.5 0 0 0 5 5.5V20a1.5 1.5 0 0 1 1.5-1.5H18.5V4H6.5zm3 3h7v2h-7V7zm0 4h7v2h-7v-2z"/>
    </svg>`;
    }

    /* outline gear with hollow center */
    iconGearOutline2() {
        return `
    <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8" />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8" />
      <g transform="translate(12 12)" fill="currentColor">
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(30)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(60)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(90)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(120)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(150)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(180)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(210)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(240)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(270)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(300)" />
        <rect x="-0.9" y="-11" width="1.8" height="3.6" rx="0.9" transform="rotate(330)" />
      </g>
    </svg>`;
    }

    url(u) {
        try { return encodeURI(String(u)); } catch { return String(u || ""); }
    }

    escape(s) {
        return String(s ?? "")
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }
}
