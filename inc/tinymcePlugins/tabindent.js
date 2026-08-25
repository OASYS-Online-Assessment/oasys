/*
 * TinyMCE Tab indentation support
 *
 * - In editor bodies, Tab inserts four non-breaking spaces so indentation is
 *   retained in HTML content.
 * - In multiline dialog fields, Tab inserts a literal tab character.
 * - Shift+Tab is intentionally left untouched for existing OASYS shortcuts
 *   such as jsPopupEditor's language cycling.
 */

"use strict";

(function () {
    const richTextIndent = '&nbsp;&nbsp;&nbsp;&nbsp;';

    function isPlainTab(event) {
        return event.key === 'Tab' &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey;
    }

    function enableEditorTabIndent(editor) {
        if (!editor || editor.__oasysTabIndentEnabled) return;
        editor.__oasysTabIndentEnabled = true;

        editor.on('keydown', function (event) {
            if (!isPlainTab(event)) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            editor.undoManager.transact(function () {
                editor.insertContent(richTextIndent);
            });
        });
    }

    function insertTabIntoTextarea(textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const scrollTop = textarea.scrollTop;

        textarea.style.tabSize = '4';
        textarea.setRangeText('\t', start, end, 'end');
        textarea.scrollTop = scrollTop;
        textarea.dispatchEvent(new Event('input', {bubbles: true}));
    }

    document.addEventListener('keydown', function (event) {
        if (!isPlainTab(event)) return;

        const textarea = event.target;
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        if (!textarea.closest('.tox-dialog, .nxDialog')) return;

        event.preventDefault();
        event.stopPropagation();
        insertTabIntoTextarea(textarea);
    }, true);

    if (typeof window.tinymce !== 'undefined') {
        window.tinymce.on('AddEditor', function (event) {
            enableEditorTabIndent(event.editor);
        });

        window.tinymce.get().forEach(enableEditorTabIndent);
    }
})();
