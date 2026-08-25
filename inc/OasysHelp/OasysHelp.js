/*
 OasysHelp Class v1.6
 (c) 2024 / 2025 /2026 by Willibrord Koch
 -------------------------------------------------------------------------------------------------------------------
 DESCRIPTION:
 This class creates an inline help icon (a circle with a question mark) that can be embedded within text (span
 with id). When the icon is clicked, a popup window appears near the mouse position, displaying HTML content.
 The popup is closable by clicking anywhere on the screen, and it blocks interaction with underlying content
 using a semi-transparent overlay.
 -------------------------------------------------------------------------------------------------------------------
 VERSIONS:
 -------------------------------------------------------------------------------------------------------------------
 v1.0    Initial version
 v1.1    Added support for tables in the HTML content
 v1.2    Modified the popup to use a <dialog> element instead of a <div> element.
 v1.3    Added class to the dialog element to allow for custom styling of the dialog element.
 v1.4    If the container already has text, transform it into a clickable link, with the icon behind it.
 v1.5    Added options for link styling (color, hover color, decoration, hover decoration, font weight, class, margins).
 v1.6    Added shared pleasant help layout styling and OasysHelp.layout() for consistent translated help panels.
 -------------------------------------------------------------------------------------------------------------------

 Options:
 - size: (string) The size of the help icon (default: '17px').
 - color: (string) The color of the help icon (default: '#4f94b4').
 - popupBgColor: (string) The background color of the popup window (default: '#ffffff').
 - maxHeight: (string) The maximum height of the popup window. Content becomes scrollable if it exceeds this height (default: '400px').
 - maxWidth: (string) The maximum width of the popup window. Content will be constrained within this width (default: '700px').
 - htmlContent: (string) The HTML content to display inside the popup window (default: '<p>No help text specified...</p>').
 - title: (string) An optional title displayed at the top of the popup window.
 - titleFontColor: (string) The font color of the title (default: '#4f94b4').
 - titleBgColor: (string) The background color of the title (default: '#dddddd').

 Usage Example:

 <span id="help-icon-container">Need Help?</span>

 const help = new OasysHelp('help-icon-container', {
     iconSize: '16px',
     iconColor: '#007bff',
     popupBgColor: '#f8f9fa',
     htmlContent: '<h3>Help</h3><p>This explains a feature.</p>',
     maxHeight: '300px',
     maxWidth: '300px',
     title: 'Help Section',
     titleFontColor: '#007bff',
     titleBgColor: '#f0f0f0'
 });
 */
class OasysHelp {
    static escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value === null || value === undefined ? '' : String(value);
        return div.innerHTML;
    }

    static layout(options = {}) {
        const lead = options.lead ? `<p class="oasysHelpLead">${OasysHelp.escapeHtml(options.lead)}</p>` : '';
        const items = Array.isArray(options.items) ? options.items : [];
        const itemHtml = items.length ? `
            <div class="oasysHelpGrid">
                ${items.map((item) => `
                    <div class="oasysHelpItem">
                        <strong>${OasysHelp.escapeHtml(item.title || '')}</strong>
                        <span>${OasysHelp.escapeHtml(item.text || '')}</span>
                    </div>
                `).join('')}
            </div>
        ` : '';
        const note = options.note ? `<p class="oasysHelpNote">${OasysHelp.escapeHtml(options.note)}</p>` : '';
        const caution = options.caution ? `<p class="oasysHelpCaution">${OasysHelp.escapeHtml(options.caution)}</p>` : '';

        return `
            <div class="oasysHelpPanel">
                ${lead}
                ${itemHtml}
                ${note}
                ${caution}
            </div>
        `;
    }

    static normalizeContent(htmlContent) {
        const content = htmlContent || '<p>No help text specified...</p>';
        if (content.indexOf('oasysHelpPanel') !== -1) return content;
        return `<div class="oasysHelpPanel oasysHelpLegacy">${content}</div>`;
    }

    constructor(containerId, options = {}) {
        // Get the container element by ID
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with ID "${containerId}" not found.`);
            return;
        }

        // Options
        this.iconSize       = options.size           || '16px';
        this.iconColor      = options.color          || '#4f94b4';
        this.linkColor           = options.linkColor           || 'inherit';
        this.linkHoverColor      = options.linkHoverColor      || null;
        this.linkDecoration      = options.linkDecoration      || 'underline';
        this.linkHoverDecoration = options.linkHoverDecoration || this.linkDecoration;
        this.linkFontWeight      = options.linkFontWeight      || 'inherit';
        this.linkClass           = options.linkClass           || '';
        this.linkMarginLeft      = options.linkMarginLeft      || '0';
        this.linkMarginRight     = options.linkMarginRight     || '4px';
        this.popupBgColor   = options.popupBgColor   || '#ffffff';
        this.htmlContent    = options.rawHtmlContent ? (options.htmlContent || '<p>No help text specified...</p>') : OasysHelp.normalizeContent(options.htmlContent);
        this.maxHeight      = options.maxHeight      || '400px';
        this.maxWidth       = options.maxWidth       || '700px';
        this.title          = options.title          || '';
        this.titleFontColor = options.titleFontColor || '#43586d';
        this.titleBgColor   = options.titleBgColor   || '#eaf2f7';

        // Internal elements
        this.link         = null;
        this.icon         = null;
        this.popupElement = null;
        this.overlayElement = null;

        this.createIcon();
        this.addWindowResizeListener();
    }

    createIcon() {
        const existingText = this.container.textContent.trim();
        this.container.textContent = '';

        const iconContainer = document.createElement('span');
        iconContainer.style.display        = 'inline-flex';
        iconContainer.style.alignItems     = 'center';
        iconContainer.style.justifyContent = 'center';
        iconContainer.style.marginLeft     = '5px';
        iconContainer.style.marginBottom   = '2px';
        iconContainer.style.lineHeight     = 'normal';
        iconContainer.style.verticalAlign  = 'middle';
        iconContainer.style.height         = '1em';
        iconContainer.style.fontSize       = '1em';

        if (existingText) {
            this.link = document.createElement('a');
            this.link.href = '#';
            this.link.style.cursor = 'pointer';
            this.link.style.color = this.linkColor;
            this.link.style.textDecoration = this.linkDecoration;
            this.link.style.fontWeight = this.linkFontWeight;
            this.link.style.marginLeft = this.linkMarginLeft;
            this.link.style.marginRight = this.linkMarginRight;
            if (this.linkClass) this.link.className = this.linkClass;

            this.link.addEventListener('mouseenter', () => {
                if (this.linkHoverColor) this.link.style.color = this.linkHoverColor;
                this.link.style.textDecoration = this.linkHoverDecoration;
            });
            this.link.addEventListener('mouseleave', () => {
                this.link.style.color = this.linkColor;
                this.link.style.textDecoration = this.linkDecoration;
            });

            this.link.textContent = existingText;
            iconContainer.appendChild(this.link);
        }
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const icon = document.createElementNS(svgNamespace, 'svg');
        icon.setAttribute('width', this.iconSize);
        icon.setAttribute('height', this.iconSize);
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.style.cursor = 'pointer';
        icon.style.display = 'inline-block';
        icon.style.verticalAlign = 'middle';
        icon.style.overflow = 'visible';

        const circle = document.createElementNS(svgNamespace, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '12');
        circle.setAttribute('fill', this.iconColor);

        const questionMark = document.createElementNS(svgNamespace, 'text');
        questionMark.setAttribute('x', '50%');
        questionMark.setAttribute('y', '50%');
        questionMark.setAttribute('dy', '.35em');
        questionMark.setAttribute('text-anchor', 'middle');
        questionMark.setAttribute('fill', 'white');
        questionMark.setAttribute('font-family', 'Arial, sans-serif');
        questionMark.setAttribute('font-size', '16');
        questionMark.textContent = '?';

        icon.appendChild(circle);
        icon.appendChild(questionMark);
        iconContainer.appendChild(icon);

        this.container.appendChild(iconContainer);
        this.icon = icon;

        this.addIconEventListeners();
    }

    addIconEventListeners() {
        if (this.link) {
            this.link.addEventListener('click', (event) => {
                event.preventDefault(); // prevent scrolling if href="#"
                this.showPopup(event);
            });
        }

        if (this.icon) {
            this.icon.addEventListener('click', (event) => this.showPopup(event));
        }
    }

    addWindowResizeListener() {
        window.addEventListener('resize', () => {
            if (this.popupElement) {
                this.positionPopup();
            }
        });
    }

    showPopup(event) {
        // If popup already exists, remove it (toggle behavior)
        if (this.popupElement) {
            this.removePopup();
            return;
        }

        // Insert custom styles for the dialog
        const styleTag = document.createElement('style');
        styleTag.textContent = `
          .oasys-help-dialog::backdrop {
            background-color: rgba(0, 0, 0, 0.85) !important;
          }
          .oasys-help-dialog {
            position: fixed;
            margin: 0;
            padding: 0;
            border: none;
            max-width: ${this.maxWidth};
            max-height: ${this.maxHeight};
            color: #33485d;
          }
        `;
        document.head.appendChild(styleTag);

        // Create the dialog
        this.popupElement = document.createElement('dialog');
        this.popupElement.classList.add('oasys-help-dialog');
        this.popupElement.style.backgroundColor = this.popupBgColor;
        this.popupElement.style.boxShadow       = '0 12px 32px rgba(15, 35, 54, 0.25)';
        this.popupElement.style.borderRadius    = '8px';
        this.popupElement.style.overflowY       = 'auto';

        // Title (optional)
        if (this.title) {
            const titleElement = document.createElement('div');
            titleElement.style.backgroundColor = this.titleBgColor;
            titleElement.style.color          = this.titleFontColor;
            titleElement.style.fontWeight     = 'bold';
            titleElement.style.fontSize       = '15px';
            titleElement.style.padding        = '9px 12px';
            titleElement.style.borderBottom   = '1px solid #d3e0ea';
            titleElement.style.borderRadius   = '8px 8px 0 0';
            titleElement.style.fontFamily     = getComputedStyle(document.body).fontFamily;
            titleElement.textContent          = this.title;
            this.popupElement.appendChild(titleElement);
        }

        // Content
        const contentElement = document.createElement('div');
        contentElement.className = 'oasysHelpContent';
        contentElement.style.fontFamily = getComputedStyle(document.body).fontFamily;
        contentElement.style.fontSize   = '14px';
        contentElement.style.padding    = '10px';
        contentElement.innerHTML        = this.htmlContent;
        this.styleHtmlContent(contentElement);

        this.popupElement.appendChild(contentElement);

        // Append and display the dialog
        document.body.appendChild(this.popupElement);
        this.popupElement.showModal();

        // Temporarily place the dialog at (0,0) so we can measure it
        this.popupElement.style.left = '0px';
        this.popupElement.style.top  = '0px';

        const rect = this.popupElement.getBoundingClientRect();
        let desiredLeft = event.clientX;
        let desiredTop  = event.clientY;

        const dialogWidth  = rect.width;
        const dialogHeight = rect.height;
        const viewportWidth  = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust position if dialog goes off-screen
        if (desiredLeft + dialogWidth > viewportWidth) {
            desiredLeft = viewportWidth - dialogWidth - 10;
        }
        if (desiredTop + dialogHeight > viewportHeight) {
            desiredTop = viewportHeight - dialogHeight - 10;
        }

        if (desiredLeft < 0) desiredLeft = 0;
        if (desiredTop < 0)  desiredTop  = 0;

        this.popupElement.style.left = `${desiredLeft}px`;
        this.popupElement.style.top  = `${desiredTop}px`;

        setTimeout(() => {
            // Close the popup by clicking inside or pressing Esc
            this.popupElement.addEventListener('click', this.removePopup.bind(this));
            this.popupElement.addEventListener('cancel', this.removePopup.bind(this));

            // On touch devices, listen for a touch outside
            document.addEventListener('touchend', this.handleOutsideClick);
        }, 0);
    }

    styleHtmlContent(contentElement) {
        // Optionally style any tables you may have
        const style = document.createElement('style');
        style.textContent = `
            .oasysHelpContent {
                color: #33485d;
            }
            .oasysHelpPanel {
                max-width: 560px;
            }
            .oasysHelpPanel p {
                margin: 0 0 10px;
                line-height: 1.45;
            }
            .oasysHelpPanel p:last-child {
                margin-bottom: 0;
            }
            .oasysHelpLead {
                padding: 9px 10px;
                border-left: 4px solid #175978;
                border-radius: 5px;
                background: #eaf2f7;
                color: #43586d;
                font-weight: bold;
            }
            .oasysHelpLegacy > p:first-child,
            .oasysHelpLegacy > div > p:first-child {
                padding: 9px 10px;
                border-left: 4px solid #175978;
                border-radius: 5px;
                background: #eaf2f7;
                color: #43586d;
                font-weight: bold;
            }
            .oasysHelpGrid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
                margin: 10px 0;
            }
            .oasysHelpItem {
                padding: 9px;
                border: 1px solid #dfe8f1;
                border-radius: 6px;
                background: #f8fbfd;
            }
            .oasysHelpItem strong,
            .oasysHelpItem span {
                display: block;
            }
            .oasysHelpItem strong {
                margin-bottom: 4px;
                color: #43586d;
                font-size: 12px;
            }
            .oasysHelpItem span {
                color: #52677a;
                font-size: 12px;
                line-height: 1.35;
            }
            .oasysHelpNote,
            .oasysHelpCaution {
                padding: 8px 10px;
                border-radius: 5px;
                font-size: 12px;
                line-height: 1.35;
            }
            .oasysHelpNote {
                border: 1px solid #d3e0ea;
                background: #f5f9fc;
                color: #40576c;
            }
            .oasysHelpCaution {
                border: 1px solid #f0c9a6;
                background: #fff5eb;
                color: #7b3f00;
            }
            .oasysHelpLegacy ul {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 7px;
                margin: 10px 0;
                padding: 0;
            }
            .oasysHelpLegacy li {
                list-style: none;
                padding: 8px 9px;
                border: 1px solid #dfe8f1;
                border-radius: 6px;
                background: #f8fbfd;
                color: #52677a;
                font-size: 12px;
                line-height: 1.35;
            }
            .oasysHelpLegacy strong,
            .oasysHelpLegacy b {
                color: #43586d;
            }
            .oasysHelpContent table {
                border: none;
                border-collapse: collapse;
                width: 100%;
            }
            .oasysHelpContent table th {
                font-size: 14px;
                background-color: #175978 !important;
                color: white;
                font-weight: normal;
                padding: 3px !important;
                text-align: left;
            }
            .oasysHelpContent table th strong,
            .oasysHelpContent table th b {
                color: white;
            }
            .oasysHelpContent table td {
                font-size: 14px;
                padding: 3px;
                text-align: left;
                vertical-align: top;
            }
            @media (max-width: 520px) {
                .oasysHelpGrid,
                .oasysHelpLegacy ul {
                    grid-template-columns: 1fr;
                }
            }
        `;
        contentElement.appendChild(style);
    }

    positionPopup() {
        if (!this.popupElement) return;

        const iconRect = this.icon.getBoundingClientRect();
        const popupRect = this.popupElement.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let top = iconRect.bottom;
        let left = iconRect.left;

        if (left + popupRect.width > screenWidth) {
            left = screenWidth - popupRect.width - 10;
        }
        if (top + popupRect.height > screenHeight) {
            top = iconRect.top - popupRect.height;
        }

        this.popupElement.style.left = `${left}px`;
        this.popupElement.style.top = `${top}px`;
    }

    handleOutsideClick = (event) => {
        // If the user taps outside, remove the popup
        if (this.overlayElement && this.overlayElement.contains(event.target)) {
            this.removePopup();
        }
        else if (this.popupElement && this.popupElement.contains(event.target)) {
            this.removePopup();
        }
    };

    removePopup() {
        if (this.popupElement) {
            document.body.removeChild(this.popupElement);
            this.popupElement = null;
        }
        if (this.overlayElement) {
            document.body.removeChild(this.overlayElement);
            this.overlayElement = null;
        }
        // Remove event listeners
        document.removeEventListener('click', this.handleOutsideClick);
        document.removeEventListener('touchend', this.handleOutsideClick);
    }
}
