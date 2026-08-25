/*
 OasysHelp Class v1.4
 (c) 2024 / 2025 by Willibrord Koch
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
        this.popupBgColor   = options.popupBgColor   || '#ffffff';
        this.htmlContent    = options.htmlContent    || '<p>No help text specified...</p>';
        this.maxHeight      = options.maxHeight      || '400px';
        this.maxWidth       = options.maxWidth       || '700px';
        this.title          = options.title          || '';
        this.titleFontColor = options.titleFontColor || '#4f94b4';
        this.titleBgColor   = options.titleBgColor   || '#dddddd';

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
            this.link.style.textDecoration = 'underline';
            this.link.style.marginRight = '4px'; // space between text and icon
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
          }
        `;
        document.head.appendChild(styleTag);

        // Create the dialog
        this.popupElement = document.createElement('dialog');
        this.popupElement.classList.add('oasys-help-dialog');
        this.popupElement.style.backgroundColor = this.popupBgColor;
        this.popupElement.style.boxShadow       = '0 4px 8px rgba(0, 0, 0, 0.1)';
        this.popupElement.style.borderRadius    = '4px';
        this.popupElement.style.overflowY       = 'auto';

        // Title (optional)
        if (this.title) {
            const titleElement = document.createElement('div');
            titleElement.style.backgroundColor = this.titleBgColor;
            titleElement.style.color          = this.titleFontColor;
            titleElement.style.fontWeight     = 'bold';
            titleElement.style.fontSize       = 'calc(2px + 1em)';
            titleElement.style.padding        = '5px';
            titleElement.style.borderRadius   = '4px 4px 0 0';
            titleElement.style.fontFamily     = getComputedStyle(document.body).fontFamily;
            titleElement.textContent          = this.title;
            this.popupElement.appendChild(titleElement);
        }

        // Content
        const contentElement = document.createElement('div');
        contentElement.style.fontFamily = getComputedStyle(document.body).fontFamily;
        contentElement.style.fontSize   = '14px';
        contentElement.style.padding    = '8px';  // Some room for text
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
            div {
                font-size: 14px;
            }
            table {
                border: none;
                border-collapse: collapse;
                width: 100%;
            }
            table th {
                font-size: 14px;
                background-color: #175978 !important;
                color: white;
                font-weight: normal;
                padding: 3px !important;
                text-align: left;
            }
            table td {
                font-size: 14px;
                padding: 3px;
                text-align: left;
                vertical-align: top;
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
