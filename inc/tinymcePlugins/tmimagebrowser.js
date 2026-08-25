tinymce.PluginManager.add('tmimagebrowser', function (editor, url) {

    function getOasysRootURL() {
        // Example: /will/oasys/editor/tests.php
        const editorPath = window.location.pathname;
        const idx = editorPath.indexOf('/editor/');
        if (idx === -1) {
            console.warn('tmimagebrowser: Cannot determine OASYS root folder from URL.');
            return window.location.origin;
        }
        // Result: https://dev.lucet.lu/will/oasys
        return window.location.origin + editorPath.substring(0, idx);
    }

    function getTestId() {
        // 1) from TinyMCE init
        let tid = editor.getParam('testId');
        if (tid) {
            return tid;
        }

        // 2) fallback: try some global windows
        const candidates = [window, window.parent || null, window.top || null];
        for (const w of candidates) {
            try {
                if (w && w.serverData && w.serverData.testLevel && w.serverData.testLevel.id) {
                    return w.serverData.testLevel.id;
                }
            } catch (e) {
                // cross-origin safety
            }
        }
        return null;
    }

    function openTmImageBrowser() {
        const testId = getTestId();

        if (!testId) {
            alert('Test ID is missing – cannot upload images.');
            return;
        }

        new jsMediaPlugin('tmImageBrowser', {
            mediaTypes: 'image',
            mode: 'testmanager',
            testId: testId,
            onClose: function (sender, mediaObj) {
                insertImageElement(editor, mediaObj, testId);
            }
        });
    }

    function insertImageElement(ed, mediaObj, testId) {
        const oasysRootURL = getOasysRootURL();

        // jsMediaPlugin returns mediaFileName; fallback to fileName for safety
        const fileName = mediaObj.mediaFileName || mediaObj.fileName;
        const width = mediaObj.width;
        const height = mediaObj.height;
        const valign = mediaObj.imgVerticalAlign || 'default';

        // In the editor we always insert the *expanded* URL
        const src = oasysRootURL + '/customContent/' + testId + '/' + fileName;

        let style = '';
        if (valign !== 'default') {
            style = 'vertical-align:' + valign + ';';
        }

        // TinyMCE 5/6/8-safe escaping
        const safeSrc = tinymce.DOM.encode(src);

        const html =
            '<img src="' + safeSrc + '"' +
            (width ? ' width="' + width + '"' : '') +
            (height ? ' height="' + height + '"' : '') +
            (style ? ' style="' + style + '"' : '') +
            ' />';

        ed.insertContent(html);
    }

    editor.ui.registry.addButton('tmimagebrowser', {
        tooltip: 'Insert image',
        icon: 'image',
        onAction: openTmImageBrowser
    });

    editor.ui.registry.addMenuItem('tmimagebrowser', {
        text: 'Insert image',
        icon: 'image',
        onAction: openTmImageBrowser
    });
});
