/*
 * TinyMCE Tab indentation support.
 *
 * Non-inline editors enable it automatically. Inline editors keep their own
 * Tab behaviour by default (for example, editorList moves to the next field),
 * but can opt in by adding "tabindent" to their plugins configuration.
 *
 * Multiline fields in a TinyMCE dialog opened by an enabled editor insert a
 * literal tab character. Other textareas can opt in with data-tabindent.
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

	function insertTabIntoTextarea(textarea) {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const scrollTop = textarea.scrollTop;

		textarea.style.tabSize = '4';
		textarea.setRangeText('\t', start, end, 'end');
		textarea.scrollTop = scrollTop;
		textarea.dispatchEvent(new Event('input', {bubbles: true}));
	}

	function enableDialogTabIndent() {
		if (document.__oasysTabIndentEnabled) return;
		document.__oasysTabIndentEnabled = true;

		document.addEventListener('keydown', function (event) {
			if (!isPlainTab(event)) return;

			const textarea = event.target;
			if (!(textarea instanceof HTMLTextAreaElement)) return;

			const optedInTinyMceDialog = textarea.closest('.tox-dialog') &&
				window.tinymce?.activeEditor?.__oasysTabIndentEnabled;
			if (!optedInTinyMceDialog && !textarea.matches('[data-tabindent]')) return;

			event.preventDefault();
			event.stopPropagation();
			insertTabIntoTextarea(textarea);
		}, true);
	}

	function enableEditorTabIndent(editor) {
		if (!editor || editor.__oasysTabIndentEnabled) return;
		editor.__oasysTabIndentEnabled = true;
		enableDialogTabIndent();

		editor.on('keydown', function (event) {
			if (!isPlainTab(event)) return;

			event.preventDefault();
			event.stopImmediatePropagation();
			editor.undoManager.transact(function () {
				editor.insertContent(richTextIndent);
			});
		});
	}

	window.tinymce.PluginManager.add('tabindent', function (editor) {
		enableEditorTabIndent(editor);
	});

	window.tinymce.on('AddEditor', function (event) {
		if (event.editor.options.get('inline') !== true) {
			enableEditorTabIndent(event.editor);
		}
	});
})();
