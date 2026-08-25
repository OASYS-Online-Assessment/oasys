"use strict";

/**
 * let the IDE know that these variables are created dynamically in PHP
 * @var {number} pageId
 */


$(onReady);

rixToolsSetPrefs('debugLevel', 1);
rixToolsSetPrefs('debugMethod', 'trace');

window.interactionClasses = {};
window.interactionConfigs = {};

let blockManifest = null;
let editorFactory = null;
let waitDialog;
let blocks = [];
let languagesInUse = [];

function onReady() {
    rixToolsDebug(1, `onReady()`);
    getManifest();
}

async function getManifest() {
    rixToolsDebug(1, `async getManifest()`);
    let response = await fetch('interactions/manifest.json?seed=' + Math.random());
    blockManifest = await response.json();
    initialize();
}

function initialize() {
    rixToolsDebug(1, `initialize()`);

    editorFactory = new EditorFactory();

    //we use pageActions.php to get page data, since it already has all it needs to load the page
    $.ajaxSetup({
        type: "POST",
        cache: false,
        dataType: "json",
        timeout: 300000,
        url: "pagesActions.php"
    });

    //prohibit dropping files into the browser
    $('body').on('dragover', function (e) {
        e.preventDefault();
    });
    $('body').on('drop', function (e) {
        e.preventDefault();
    });

    waitDialog = new jsModalWait(UILANG.m('please wait'));

    // After #controls div has been created
    const controls = $('#controls');
    // Add slider for preview width
    controls.append($('<h1>' + UILANG.m('Translation Review Interface') + '</h1>'));
    controls.append($('<p><label for="previewWidthSlider">' + UILANG.m('Preview width') + ': </label></p>').css({marginRight: '8px'}));
    controls.append($('<p><input type="range" id="previewWidthSlider" min="300" max="1200" value="800"></p>'));
    let slider = $('#previewWidthSlider');
    slider.on('input', function() {
        const width = $(this).val() + 'px';
        $('.language-preview').css('width', width);
        // If total width exceeds viewport, allow scrolling
        $('#languagePreviews').css('width', (languagesInUse.length * (parseInt($(this).val(), 10) + 34)  + ((languagesInUse.length-1) * 24)) + 'px');
        $('body').css('overflow-x', 'auto');
		displayPage();
    });

    //get page contents
    startAjax('fetchPageBlocks', {
        id: pageId
    });
}

function displayPage() {
    rixToolsDebug(1, `displayPage()`);
    let $container = $('<div id="languagePreviews"></div>');
    for (let language of languagesInUse) {
        let $langDiv = $(`<div class="language-preview" data-lang="${language}"><div class="languageTitle">${language}</div></div>`);
        $container.append($langDiv);
    }
    $('#mainContent').empty().append($container);
    // Set initial width from slider if present
    const $slider = $('#previewWidthSlider');
    if ($slider.length) {
        const width = $slider.val() + 'px';
        $('.language-preview').css('width', width);
        $('#languagePreviews').css('width', (languagesInUse.length * (parseInt($slider.val(), 10) + 34) + ((languagesInUse.length-1) * 24)) + 'px');
        $('body').css('overflow-x', 'auto');
    }
    // Create a preview for each block
    for (let block of blocks) {
        let type = block.type;
        let editorClass = editorFactory.getEditorClass(type);        for (let language of languagesInUse) {
            let blockDiv = $(`<div class="block" data-block-id="${block.id}" data-block-language="${language}"></div>`);
			$(`#languagePreviews .language-preview[data-lang="${language}"]`).append(blockDiv);
            blockDiv.append(editorClass.generatePreview(block, language, {maxWidth: blockDiv.innerWidth()}));
        }
    }
}

function decodeData(data) {
    rixToolsDebug(1, `decodeData(data)`);
    if (typeof (data) === 'undefined') return;
    data.blocks = jsonDecode(data.blocks, data.id, 'blocks', []);
    data.languages = jsonDecode(data.languages, data.id, 'languages', []);
}

//parse a single JSON string with fallback on empty object if null and exception handling
//if an unparsable string is found, it will be replaced with an empty object
function jsonDecode(s, id, key, template) {
    rixToolsDebug(1, `jsonDecode(s, id, key, template)`);
    if (typeof (template) === 'undefined') {
        //the template defines what an empty variable should be initialized with, default is a new object
        template = {};
    }
    if (s) {
        try {
            s = JSON.parse(s);
        } catch (e) {
            const d = new Date();
            console.error(`[${d.toString()}] parse error in ${id} ${key} ${s}: ${e}`);
            s = deepCopy(template);
        }
    } else {
        s = deepCopy(template);
    }
    return s;
}

function startAjax(action, data) {
    rixToolsDebug(1, `startAjax("${action}", data)`);
    waitDialog.show();
    const params = {
        action: action,
		data: UTF8ToBase64(JSON.stringify(data))
    };
    $.ajax({
        data: params
    }).done(res => ajaxSuccess(res)).fail((jqXHR, textStatus, errorThrown) => ajaxError(jqXHR, textStatus, errorThrown));
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    rixToolsDebug(1, `ajaxError(jqXHR, textStatus, errorThrown)`);
    waitDialog.hide();
    let dialogData = {
        buttons: [{
            label: UILANG.m('OK'),
            'default': true,
            cancel: true,
            value: 'ok'
        }],
        contents: jqXHR?.responseJSON?.fatalError ?? 'no error details given',
        title: 'Error: ' + errorThrown,
        width: 500
    };
    new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
    rixToolsDebug(1, `ajaxSuccess(res)`);
    $('#un_val').html(res.loggedInName);
    if (waitDialog.busy()) {
        waitDialog.hide();
    }
    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    let dialogData;
    if (res.fatalError) {
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('fatalError', dialogData);
        return;
    }
    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error !== false) {
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.error,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 700
        };
        new nxDialog('error', dialogData);
        return;
    }
    if (res.warnings) {
        for (let i in res.warnings) {
            showMessage(res.warnings[i]);
        }
    }

    switch (res.action) {
        case 'fetchPageBlocks':
            decodeData(res.data);
			blocks = res.data.blocks;
			languagesInUse = res.data.languages;
            displayPage();
            break;

        default:
            break;
    }
}