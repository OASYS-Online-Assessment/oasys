"use strict";
/* global $, landingPage, landingPagePath, landingPageManifest */

$(loader_init);

function loader_init() {
    debug_log("loader", `loader_init()`);

    //check for AJAX support
    if (!window.XMLHttpRequest) {
        alert('Your browser does not support AJAX, which means you must be using a very old browser which is not suited for OASYS!');
        throw new Error("XMLHttpRequest not supported!");
    }

    //the global variable window.loader will keep track of everything that gets loaded

    //init queue
    loader.queue = [];
    loader.loading = false;
    loader.failedAttempts = 0;
    loader.maxAttempts = 5;
    loader.retry = false;
    loader.abort = false;
    loader.dependencyQueue = [];
    loader.insertionStack = [];
    loader.files = [];

    //initialize jsModalWait
    loader.waitDialog = new jsModalWait('loading...');

    //the status object keeps track of what has already been loaded previously
    loader.status = {};

    //flags that show which scripts are actually ready for use
    loader.flags = {};
    loader.requirements = {};

    //preloaded images
    loader.images = {};

    //preloaded JS and CSS files
    loader.blobs = {};
    loader.blobMetaData = {};
    loader.blobURLs = {};

    //list of resources that need to be unloaded on mode switch
    loader.unload = {};
    loader.unload.files = [];
    loader.unload.shortcuts = [];
    loader.unload.events = [];

    //keep a list of init functions to be executed when the core is ready (mainly for plugins)
    loader.initFunctions = [];

    //keep a list of callbacks for onReady and onUnload events
    loader.onUnloadCallbacks = {};
    loader.onReadyCallbacks = {};
    loader.scheduledFiles = {};

    //manage cached media files
    loader.mediaCache = {};
    loader.mediaURLs = {};
    loader.mediaMetaData = {};

    //this will hold a list of different AJAX handlers, so that not every script needs to include AJAX code
    loader.ajaxHandlers = {};
    loader_registerAjaxHandler('loader', "loader.php", true, false, loader_ajaxSuccess, loader_ajaxError, 'GET');

    $.ajaxSetup({
        cache: true,
        dataType: "json",
        timeout: 300000
    });

    //prohibit dropping files into the browser
    $('body').on('dragover', function (e) {
        e.preventDefault();
    });
    $('body').on('drop', function (e) {
        e.preventDefault();
    });

    //load globally needed files
    loader_switchMode('global');

}

function loader_registerShortcut(shortcut, onTrigger, unload, options) {
    debug_log("loader", `loader_registerShortcut('${shortcut}', '${onTrigger.name ?? 'onTrigger'}', ${unload}, options)`);
    if (!keyboardHandler) {
        console.warn('Error in \'loader_registerShortcut\', keyboardHandler not found!');
        return;
    }

    /* wrapping the call to the trigger function in a pointer function, which allows us to link
       the function already before the necessary script has been loaded and included into the DOM */
    const callback = (e) => {
        if (typeof (window[onTrigger]) === 'function') {
            window[onTrigger](e);
        } else {
            console.error(`shortcut error: function ${onTrigger} not found!`);
        }
    };
    keyboardHandler.registerShortcut(shortcut, callback, options);
    if (unload === true) {
        loader.unload.shortcuts.push(shortcut);
    }
}

function loader_registerEvent(target, event, onTrigger, unload, capture = false) {
    debug_log("loader", `loader_registerEvent(target, '${event}', '${onTrigger.name}', ${unload}, ${capture}`);
    if (typeof (capture) === 'undefined') {
        capture = false;
    }
    target.addEventListener(event, onTrigger, capture);
    if (unload === true) {
        loader.unload.events.push({target: target, onTrigger: onTrigger, event: event, capture: capture});
    }
}

function loader_registerInitFunction(func) {
    loader.initFunctions.push(func);
}

function loader_fetchInitFunction() {
    if (loader.initFunctions.length > 0) {
        let callName = loader.initFunctions.shift();
        //split callName into parts
        let parts = callName.split('.');
        let obj = window;
        while (parts.length > 1) {
            if (typeof (obj[parts[0]]) === 'undefined') {
                console.error("loader_fetchInitFunction error: object not found!");
                return false;
            }
            obj = obj[parts.shift()];
        }
        if (typeof (obj[parts[0]]) === 'undefined') {
            console.error("loader_fetchInitFunction error: function not found!");
            return false;
        }
        let func = parts.shift();
        if (typeof (obj[func]) === 'function') {
            obj[func]();
        } else {
            console.error("loader_fetchInitFunction error: not a function");
        }
    } else {
        return false;
    }
}

function loader_getImage(url) {
    debug_log("loader", `loader_getImage('${url}')`);
    if (loader.status[url]) {
        return loader.status[url].target;
    } else {
        console.error("loader_getImage error: '%s' is not loaded!", url);
    }
}

function loader_switchMode(mode) {
    debug_log("loader", `loader_switchMode('${mode}')`);
    // wait until loader has finished loading before switching modes
    if (loader.loading === true) {
        console.log("loader_switchMode: loader is still loading, waiting for it to finish...");
        setTimeout(loader_switchMode, 100, mode);
        return;
    }
    if (window.mode === 'test') {
        //cleanup current item data
        for (let i in plugins) {
            if (typeof (plugins[i].cleanup) === 'function') plugins[i].cleanup();
        }
    }
    let i;
    for (i in loader.unload.shortcuts) {
        loader_unload(loader.unload.shortcuts[i], 'shortcut');
    }
    loader.unload.shortcuts = [];
    for (i in loader.unload.events) {
        loader_unload(loader.unload.events[i], 'event');
    }
    loader.unload.events = [];
    for (i in loader.unload.files) {
        loader_unload(loader.unload.files[i], 'file');
    }
    loader.unload.files = [];
    window.mode = mode;
    loader.queue = loader_getManifest(mode);
    loader.loading = true;
    loader_nextInQueue();
}


async function loader_nextInQueue() {
    debug_log("loader", `nextInQueue()`);
    let queueEntry, stackEntry;

    if (objectLength(loader.scheduledFiles) > 0) {
        let orderedFiles = [];
        while (loader.files.length > 0) {
            //we want to load CSS and HTML files last, so that urls to fonts and images can be properly resolved
            stackEntry = loader.files.pop();
            if (stackEntry.details.type === 'css' || stackEntry.details.type === 'html') {
                orderedFiles.unshift(stackEntry);
            } else {
                orderedFiles.push(stackEntry);
            }
        }
        while (orderedFiles.length > 0) {
            stackEntry = orderedFiles.pop();
            await loader_insertIntoDOM(stackEntry.details, stackEntry.data);
        }
        return;
    }

    //get next entry from the queue or stop queue if all is done
    if (loader_checkIfQueueEmpty() === false) {
        debug_log("loader", `queue length = ${loader.queue.length}`);
        queueEntry = loader.queue.shift();
        debug_log("loader", `queueEntry.type = '${queueEntry.type}'`);
        if (queueEntry.type === 'shortcut') {
            loader_registerShortcut(queueEntry.shortcut, queueEntry.onTrigger, queueEntry.unload, queueEntry.options);
            await loader_nextInQueue();
        } else if (queueEntry.type === 'switchMode') {
            loader_startAjax('loader', 'load', queueEntry);
        } else {
            console.error("Unknown loader type: " + queueEntry.type);
        }
    }
}

function loader_checkIfQueueEmpty() {
    debug_log("loader", `loader_checkIfQueueEmpty()`);
    if (loader.queue.length === 0) {
        //no more files to load
        debug_log("loader", `queue is empty`);
        loader.loading = false;
        return true;
    }
    return false;
}

function loader_registerAjaxHandler(handler, url, blockInterface = false, silentlyFail = false, successHandler = false, errorHandler = false, method = 'POST') {
    loader.ajaxHandlers[handler] = {};
    loader.ajaxHandlers[handler].url = url;
    loader.ajaxHandlers[handler].success = successHandler;
    loader.ajaxHandlers[handler].error = errorHandler;
    loader.ajaxHandlers[handler].blockInterface = blockInterface; //defines whether jsModalWait should be shown or not
    loader.ajaxHandlers[handler].silentlyFail = silentlyFail; //defines whether errors should be shown to user or not
    loader.ajaxHandlers[handler].method = method; //defines whether to use POST or GET
}

function loader_runOnReadyFunctions() {
    debug_log("loader", `runOnReadyFunctions()`);
    loader_checkIfQueueEmpty();
    for (let i in loader.onReadyCallbacks) {
        debug_log("loader", `runOnReadyFunctions: calling ${loader.onReadyCallbacks[i]}`);
        if (typeof (loader.onReadyCallbacks[i]) === 'string') {
            window[loader.onReadyCallbacks[i]]();
            delete loader.onReadyCallbacks[i];
        }
    }
    loader_nextInQueue();
}

//insert dynamically loaded content into the DOM
/**
 * @param {object} details - The details of the file to be inserted
 * @param {string|object} data - The text content of the file to be inserted
 */
async function loader_insertIntoDOM(details, data) {
    debug_log("loader", `loader_insertIntoDOM(${details.url})`);
    let target;
    switch (details.type) {
        case 'html':
            target = $('#' + details.target);
            let processedHTML = loader_processHTML(data, details.path);
            data = processedHTML;

            target.html(data);
            target.find('span.localisation').each(loader_setLocalisation);
            loader.status[details.url] = {
                mode: window.mode,
                target: target,
                type: details.type
            };
            // replace images embedded in HTML with local copy in blobs, if it exists
            target.find('img').each(function () {
                const img = $(this);
                const url = img.attr('data-src');
                if (url) {
                    img.attr('src', loader.blobURLs[url]);
                }
            });
            if (details.unload) {
                loader.unload.files.push({url: details.url});
            }
            loader_markAsReady(details);
            break;

        case 'css':
            debug_log("loader", `creating a blob for '${details.url}'`);
            if (settings.developmentMode !== true) {
                if (typeof (loader.blobURLs[details.url]) === 'undefined') {
                    //create a blob URL for the stylesheet with the loaded CSS code as content
                    let processedCSS = loader_processCSS(data, details.path);
                    data = processedCSS;
                    loader.blobs[details.url] = new Blob([data], {type: 'text/css'});
                    loader.blobMetaData[details.url] = deepCopy(details);
                    loader.blobURLs[details.url] = URL.createObjectURL(loader.blobs[details.url]);
                }
            } else {
                //in development mode we can just use the URL directly
                loader.blobURLs[details.url] = details.url;
                loader.blobMetaData[details.url] = deepCopy(details);
            }
            target = $(document.createElement('link'));
            $('head').append(target);
            target.attr('rel', 'stylesheet');
            target.attr('data-url', details.url);
            target.attr('href', loader.blobURLs[details.url]);

			const loaded = new Promise((resolve, reject) => {
				target.on('load', resolve);
				target.on('error', reject);
			});

			$('head').append(target);
			await loaded;

			loader.status[details.url] = {
                mode: window.mode,
                target: target,
                type: details.type
            };
            if (details.unload) {
                loader.unload.files.push({url: details.url});
            }
            loader_markAsReady(details);
            break;

        case 'font':
            debug_log("loader", `creating a blob for '${details.url}'`);
            //set type of font by file extension
            let type = loader_establishMimeType(details.url);
            if (typeof (loader.blobURLs[details.url]) === 'undefined') {
                //create a blob URL for the font with the loaded binary code as content
                loader.blobs[details.url] = new Blob([data], {type: type});
                loader.blobMetaData[details.url] = deepCopy(details);
                loader.blobURLs[details.url] = URL.createObjectURL(loader.blobs[details.url]);
            }
            loader.status[details.url] = {
                mode: window.mode,
                target: null,
                type: details.type
            };
            loader_markAsReady(details);
            break;

        case 'js':
            debug_log("loader", `creating a blob for '${details.url}'`);
            //unsure if this is still necessary with the new loader … let's keep it commented out for now
            /*
                        if (typeof (details.pathCorrections) !== 'undefined') {
                            for (let i in details.pathCorrections) {
                                data = data.replace(details.pathCorrections[i].from, details.pathCorrections[i].to);
                            }
                        }
            */
            if (settings.developmentMode !== true || typeof (details.pathCorrections) !== 'undefined') {
                if (typeof (loader.blobURLs[details.url]) === 'undefined') {
                    //create a blob URL for the script with the loaded JavaScript code as content
                    loader.blobs[details.url] = new Blob([data], {type: 'application/javascript'});
                    loader.blobMetaData[details.url] = deepCopy(details);
                    loader.blobURLs[details.url] = URL.createObjectURL(loader.blobs[details.url]);
                }
            } else {
                //in development mode we can just use the URL directly
                loader.blobURLs[details.url] = details.url;
                loader.blobMetaData[details.url] = deepCopy(details);
            }
            target = $(document.createElement('script'));
            $('head').append(target);
            target.on('load', function () {
                target.off('load'); //prevent browser from erroneously triggering the onload handler twice: no known case for script tags, but better safe than sorry
                debug_log("loader", `onload handler for '${details.url}'`);
                loader_markAsReady(details);
            });
            target.attr('src', loader.blobURLs[details.url]);
            loader.status[details.url] = {
                mode: window.mode,
                target: target,
                type: details.type
            };
            if (details.unload) {
                loader.unload.files.push({url: details.url, flag: details.flag, cleanup: details.onUnload});
            }
            break;

        case 'worker':
            debug_log("loader", `creating a blob for worker '${details.url}'`);
            if (typeof (loader.blobURLs[details.url]) === 'undefined') {
                //create a blob URL for the worker script with the loaded JavaScript code as content
                loader.blobs[details.url] = new Blob([data], {type: 'application/javascript'});
                loader.blobMetaData[details.url] = deepCopy(details);
                loader.blobURLs[details.url] = URL.createObjectURL(loader.blobs[details.url]);
            }
            loader.status[details.url] = {
                mode: window.mode,
                type: details.type
            };
            loader_markAsReady(details);
            break;

        case 'image':
            debug_log("loader", `creating a blob for '${details.url}'`);
            if (typeof (loader.blobURLs[details.url]) === 'undefined') {
                //get mime type of image by file extension
                let type = loader_establishMimeType(details.url);
                //create a blob URL for the image with the loaded content
                loader.blobs[details.url] = new Blob([data], {type: type});
                loader.blobMetaData[details.url] = deepCopy(details);
                loader.blobURLs[details.url] = URL.createObjectURL(loader.blobs[details.url]);
            }
            target = new Image();
            target.src = loader.blobURLs[details.url];
            loader.status[details.url] = {
                mode: window.mode,
                target: target,
                type: details.type
            };
            if (details.unload) {
                loader.unload.files.push({url: details.url});
            }
            loader_markAsReady(details);
            break;
    }
}

function loader_treatDownloadedData(details, data) {
    debug_log("loader", `loader_treatDownloadedData(details, data)`);
    debug_variable("loader", details);

    if (typeof (details.onReady) === 'string') {
        loader.onReadyCallbacks[details.url] = details.onReady;
    }
    if (typeof (details.onUnload) === 'string') {
        loader.onUnloadCallbacks[details.url] = details.onUnload;
    }
    if (typeof details.initFunction === 'string') {
        loader_registerInitFunction(details.initFunction);
    }

    let target;
    switch (details.type) {
        case 'text':
            debug_log("loader", `set text for mode=${mode}`);
            debug_variable(data);
            text[details.mode] = data;
            break;

        case 'data':
            debug_log("loader", `set data`);
            debug_variable(data);
            for (let i in data) {
                window[i] = data[i];
            }
            break;

        case 'html':
        case 'css':
        case 'js':
        case 'worker':
        case 'image':
        case 'font':
            debug_log("loader", `set file on hold`);
            //base64 decode the data
            if (details.type === 'font' || details.type === 'image') {
                data = base64ToBytes(data); //binary decoding
            } else {
                data = base64ToUTF8(data); //text decoding
            }
            loader.scheduledFiles[details.url] = true;
            loader.files.push({'details': details, 'data': data});
            break;

        default:
            console.error("Unknown loader type: " + details.type);
    }
}


function loader_markAsReady(details) {
    debug_log("loader", `loader_markAsReady(${details.url})`);
    delete loader.scheduledFiles[details.url];
    if (objectLength(loader.scheduledFiles) === 0) {
        loader_runOnReadyFunctions();
    }
}

function loader_unload(details, type) {
    debug_log("loader", `loader_unload(details, '${type}')`);
    if (type === 'file') {
        const name = details.url;
        const flag = details.flag ?? true;
        if (loader.status[name]) {
            const filetype = loader.status[name].type;
            const target = loader.status[name].target;
            if (typeof (loader.onUnloadCallbacks[details.url]) === 'string') {
                window[loader.onUnloadCallbacks[details.url]]();
            }
            if (filetype === 'html') {
                target.html('');
            } else if (filetype === 'image') {
                delete loader.images[name];
            } else {
                if (typeof (target) !== 'undefined') target.remove();
            }
            /*	workers and fonts do not appear in this list: unloading them is not supported,
                so even if unload is set in manifest, it will be ignored */
            delete loader.status[name];
        }
    } else if (type === 'shortcut') {
        keyboardHandler.removeShortcut(details);
    } else if (type === 'event') {
        details.target.removeEventListener(details.event, details.onTrigger, details.capture);
    }
}

function loader_processHTML(data, path) {
    debug_log("loader", `loader_processHTML(data)`);
    // regular expression to match images in HTML source
    const urlRegex = /<img\s[^>]*src=(["'])(.*?)\1/g;

    // extract all URLs from the CSS source
    const urlsInHTML = [];
    let match;
    while ((match = urlRegex.exec(data)) !== null) {
        urlsInHTML.push(match[2]);
    }

    // iterate through the extracted URLs and replace if found in loader.blobURLs
    urlsInHTML.forEach((url) => {
        if (loader.blobURLs.hasOwnProperty(url)) {
            data = data.replace(new RegExp('(<img\\s[^>]*)src=(["\'])' + url + '\\2', 'g'), '$1src=\'' + loader.blobURLs[url] + '\'');
        }
    });
    data = data.replace(/@@(.*?)@@/g, '<span class="localisation" data-localisationId="$1"></span>');
    return data;
}

function loader_processCSS(data, path) {
    debug_log("loader", `loader_processCSS(data)`);
    // regular expression to match URLs in CSS source
    const urlRegex = /url\(["']?(.*?)["']?\)/g;

    // extract all URLs from the CSS source
    const urlsInCSS = [];
    let match;
    while ((match = urlRegex.exec(data)) !== null) {
        urlsInCSS.push(match[1]);
    }

    /*
        iterate through the extracted URLs and replace if found in loader.blobURLs;
        if no blob is found we do not replace the URL, it might be a data URL or external to our server
     */
    urlsInCSS.forEach((url) => {
        if (loader.blobURLs.hasOwnProperty(url)) {
            data = data.replace(new RegExp('url\\(["\']?' + url + '["\']?\\)', 'g'), 'url(' + loader.blobURLs[url] + ')');
        }
    });
    return data;
}

function loader_establishMimeType(url) {
    let ext = url.split('.').pop();
    ext = ext.toLowerCase();
    let type;
    switch (ext) {
        // Image formats
        case 'png':
            type = 'image/png';
            break;
        case 'jpg':
        case 'jpeg':
            type = 'image/jpeg';
            break;
        case 'gif':
            type = 'image/gif';
            break;
        case 'svg':
            type = 'image/svg+xml';
            break;
        case 'webp':
            type = 'image/webp';
            break;
        case 'avif':
            type = 'image/avif';
            break;
        case 'apng':
            type = 'image/apng';
            break;
        // Font formats
        case 'ttf':
            type = 'font/ttf';
            break;
        case 'otf':
            type = 'font/otf';
            break;
        case 'woff':
            type = 'font/woff';
            break;
        case 'woff2':
            type = 'font/woff2';
            break;
        // Script formats
        case 'js':
            type = 'application/javascript';
            break;
        case 'css':
            type = 'text/css';
            break;
        case 'snippet':
        case 'html':
            type = 'text/html';
            break;
        // Video formats
        case 'mp4':
            type = 'video/mp4';
            break;
        case 'webm':
            type = 'video/webm';
            break;
        case 'ogv':
            type = 'video/ogg';
            break;
        case 'm4v':
            type = 'video/x-m4v';
            break;
        // Audio formats
        case 'mp3':
            type = 'audio/mpeg';
            break;
        case 'ogg':
            type = 'audio/ogg';
            break;
        case 'm4a':
            type = 'audio/mp4';
            break;
        case 'aac':
            type = 'audio/aac';
            break;
        case 'wav':
            type = 'audio/wav';
            break;
        default:
            console.error("Unknown type: " + ext);
            return;
    }
    return type;
}

function loader_setLocalisation(idx, element) {
    debug_log("loader", `loader_setLocalisation('${idx}', <element>)`);
    element = $(element);
    element.html(global_getText(window.mode, element.attr('data-localisationId')));
}

function loader_startAjax(handler, action, data) {
    debug_log("loader", `loader_startAjax('${handler}', '${loader.ajaxHandlers[handler].url}', '${action}', ${JSON.stringify(data)})`);
    const params = {
        action: action,
        data: JSON.stringify(data)
    };
    if (loader.ajaxHandlers[handler].blockInterface) {
        loader.waitDialog.show(handler);
    }
    $.ajax({
        data: params,
        url: loader.ajaxHandlers[handler].url,
        type: loader.ajaxHandlers[handler].method,
    }).done(function (res, textStatus, jqXHR) {
        debug_log("loader", `loader_ajax.done(res, textStatus, jqXHR)`);
        if (loader.ajaxHandlers[handler].blockInterface) {
            loader.waitDialog.hide(handler);
        }

        /*	Check if answer comes from our script.
            Although we should assume that a successful AJAX request will always return the correct answer,
            and if we do get a JSON construct back we can almost be sure that it is from our script,
            yet we should not rely on that, because it is possible that a firewall or other software
            interferes with the AJAX request and returns a JSON answer as well, even though it is not
            very likely. */
        if (res.sender !== 'OASYS') {
            //if not, we need to retry
            if (loader.failedAttempts < loader.maxAttempts - 1) {
                //if we need to retry, we need to put the current entry back into the queue at the first spot
                debug_log("loader", `… retry loading file`);
                loader.queue.unshift(data);
                loader.failedAttempts++;
                loader.retry = false;
            } else {
                loader.abort = true;
                let dialogData = {
                    buttons: [{
                        label: 'OK',
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: "Unexpected answer from server, aborting. Check console for details.",
                    width: 500
                };
                new nxDialog('fatalError', dialogData);
                console.error("Unexpected answer received on action '%s', handled by '%s' with data %o.", action, handler, data);
                console.error("Received answer: %o", res);
                return;
            }

            /*	even though the AJAX request succeeded, the answer was not from the loader.php script,
                so we need to treat it as a failure -> run error handler */
            if (loader.ajaxHandlers[handler].error && !loader.abort) {
                loader.ajaxHandlers[handler].error.call(this, action, data);
            }
            return;
        }
        loader.failedAttempts = 0;
        //if there was a fatal PHP error that prevented the script from finishing show that error
        //this data is created in PHP via the register_shutdown_function
        let dialogData;
        if (res.fatalError) {
            dialogData = {
                buttons: [{
                    label: 'OK',
                    'default': true,
                    cancel: true,
                    value: 'ok'
                }],
                contents: global_getText(window.mode, res.fatalError),
                width: 500
            };
            new nxDialog('fatalError', dialogData);
            console.error("Fatal error occurred on action '%s', handled by '%s' with data %o.", action, handler, data);
			loader_switchMode('error');
            return;
        }
        //if a normal error occured in PHP that did not prevent the script from finishing, show it
        if (res.error !== false) {
            if (!loader.ajaxHandlers[handler].silentlyFail) {
                dialogData = {
                    buttons: [{
                        label: 'OK',
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: global_getText('global', res.error),
                    width: 500
                };
                new nxDialog('error', dialogData);
            }
			loader_switchMode('error');
            return;
        }
        if (res.warnings && !loader.ajaxHandlers[handler].silentlyFail) {
            for (let i in res.warnings) {
                showMessage(res.warnings[i]);
            }
        }
        if (loader.ajaxHandlers[handler].success) {
            loader.ajaxHandlers[handler].success.call(this, res);
        }
    }).fail(function (jqXHR, textStatus, errorThrown) {
        debug_log("loader", `loader_ajax.fail(jqXHR, textStatus, errorThrown)`);
        if (loader.ajaxHandlers[handler].blockInterface) {
            loader.waitDialog.hide(handler);
        }
        let res;
        loader.retry = false;
        if (jqXHR.responseJSON) {
            /* if the response is JSON, it is a fatal error reported by the PHP script,
            no need to retry loading it, just show the error message and stop queue */
            res = jqXHR.responseJSON;
            loader.abort = true;
        } else if (jqXHR.responseText) {
            /* a pure text answer was sent back, so it did not come from the loader.php script,
            this is the typical behaviour when a firewall interferes -> try again */
            res = {fatalError: jqXHR.responseText};
            if (loader.failedAttempts < loader.maxAttempts - 1) {
                loader.retry = true;
            }
        } else {
            /* no response at all, this is the typical behaviour when the server did not respond
             in time -> try again */
            res = {fatalError: errorThrown ?? 'Unknown error'};
            if (loader.failedAttempts < loader.maxAttempts - 1) {
                loader.retry = true;
            }
        }
        if (loader.retry === false && !loader.ajaxHandlers[handler].silentlyFail) {
            let dialogData;
            if (res.fatalError) {
                dialogData = {
                    buttons: [{
                        label: 'OK',
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: res.fatalError,
                    width: 500
                };
                new nxDialog('fatalError', dialogData);
                console.error("Fatal error occurred on action '%s', handled by '%s' with data %o.", action, handler, data);
                return;
            }
            //if a normal error occured in PHP that did not prevent the script from finishing, show it
            if (res.error !== false) {
                if (!loader.ajaxHandlers[handler].silentlyFail) {
                    dialogData = {
                        buttons: [{
                            label: 'OK',
                            'default': true,
                            cancel: true,
                            value: 'ok'
                        }],
                        contents: res.error,
                        width: 500
                    };
                    new nxDialog('error', dialogData);
                }
                return;
            }

            if (!res.fatalError && !res.error) {
                const matches = jqXHR.responseText.match(/<title>(.*?)<\/title>[\s\S]*<body>((.|[\s\S])*?)<\/body>/) ?? [];
                dialogData = {
                    buttons: [{
                        label: 'OK',
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: matches[2] ?? errorThrown,
                    title: matches[1] ?? textStatus,
                    width: 500
                };
                new nxDialog('ajaxError', dialogData);
            }
            console.error("Ajax error of type '%s' occurred on action '%s', handled by '%s' with data %o.", textStatus, action, handler, data);
            debug_log("loader", `loader_ajaxFail with errorThrown = '${errorThrown}'`);
        }

        if (loader.retry === true) {
            //if we need to retry, we need to put the current entry back into the queue at the first spot
            debug_log("loader", `… retry loading file`);
            loader.queue.unshift(data);
            loader.failedAttempts++;
            loader.retry = false;
        }

        if (loader.ajaxHandlers[handler].error && !loader.abort) {
            loader.ajaxHandlers[handler].error.call(this, action, data);
        }
    });
}

/* this is merely a helper function to find the right script to debug */
function loader_getBlob(partialName) {
    for (let i in loader.blobURLs) {
        if (i.includes(partialName)) {
            return loader.blobURLs[i];
        }
    }
    return false;
}

function loader_ajaxError() {
    debug_log("loader", `loader_ajaxError()`);
    loader_nextInQueue();
}

function loader_ajaxSuccess(res) {
    debug_log("loader", `loader_ajaxSuccess(res)`);
    switch (res.action) {
        case 'load':
            if (typeof (res.skinProperties) !== 'undefined') {
                if (typeof (window.skin) !== 'undefined') {
                    window.skin.properties = res.skinProperties;
                }
            }
            for (let i in res.data) {
                let entry = res.data[i];
                loader_treatDownloadedData(entry.details, entry.contents);
            }
            break;
        case 'forFutureUse':
            //regulate the flux capacitor
            break;
        default:
            throw new Error("AJAX returned unkown action: " + res.action);
    }
    loader_nextInQueue();
}

function loader_cacheMediaFiles() {
    /* iterate through global variable test.items and in every item iterate through metadata.paths
       to copy all relevant data into loader.mediaMetaData, then start loading the files */
    debug_log("loader", `loader_cacheMediaFiles()`);
    for (let i in test.items) {
        let item = test.items[i];
        if (typeof (item.metadata) === 'undefined' || typeof (item.metadata.paths) === 'undefined') continue;
        for (let j in item.metadata.paths) {
            let mediaData = item.metadata.paths[j];
            let entry = {
                id: parseInt(mediaData.mediaId),
                checksum: mediaData.checksum
            };
            if (typeof (loader.mediaMetaData[mediaData.mediaId]) === 'undefined') {
                //if we do not have this media file in the list yet, add it
                loader.mediaMetaData[mediaData.mediaId] = entry;
            }
        }
    }
    /* now we have a complete list of all media files for the entire test, so we can start loading them */
    loader_fetchMediaFiles();
}

function loader_fetchMediaFiles() {
    debug_log("loader", `loader_fetchMediaFiles(mediaManifest)`);
	if (objectLength(loader.mediaMetaData) === 0) {
		return;
	}
    const params = {
        action: 'loadMediaFiles',
        data: JSON.stringify({mediaFiles: loader.mediaMetaData})
    };
	loader_enableMediaProgressListener();
	$.ajax({
        data: params,
        url: 'loader.php',
        type: 'GET',
        timeout: 300000, // 5 minutes timeout for loading media files

		xhr: function () {
			let lastProgressEventTime = null;
			const xhr = new window.XMLHttpRequest();
			xhr.addEventListener('progress', (e) => {
				const now = Date.now();
				// send custom event at most every 500ms
				if (!lastProgressEventTime || now - lastProgressEventTime >= 500) {
					const progressEvent = new CustomEvent('mediaCacheProgress', {
						detail: {
							loaded: e.loaded,
							total: e.total
						}
					});
					window.dispatchEvent(progressEvent);
					lastProgressEventTime = now;
				}
			});
			return xhr;
		},

    }).done(function (res, textStatus, jqXHR) {
        debug_variable("loader", res);
		console.log(res);
        if (res.sender !== 'OASYS' || res.fatalError || res.error) {
            /*	The caching of media files happens in the background to enhance performance of front end,
                however it is not mandatory. So if any error happens we'll silently fail and media files
                are then loaded on the fly instead of from the cache. */
            return;
        }
        loader_storeMediaFiles(res.data);
    }).fail(function (jqXHR, textStatus, errorThrown) {
        // handle timeout or other AJAX failures — silently fail (media caching is optional)
        debug_log("loader", `loader_fetchMediaFiles.fail(jqXHR, textStatus, errorThrown)`);
		loader_hideWaitDialog('core');
		if (butler_checkOption('waitForMediaCache') === true) {
			if (textStatus === 'timeout') {
				global_errorDialog("mediaCacheTimeout", null, core_mediaFilesLoaded);
			} else {
				global_errorDialog("mediaCacheLoadError", null, core_mediaFilesLoaded);
			}
		} else {
			console.warn("loader_fetchMediaFiles: ajax error — skipping cache.", textStatus, errorThrown, jqXHR && (jqXHR.responseText || jqXHR.responseJSON));
			core_mediaFilesLoaded();
		}
        // no retry or UI dialog here — let media load on demand instead
    });
}

function loader_storeMediaFiles(files) {
    debug_log("loader", `loader_storeMediaFiles(files)`);
    for (let id in files) {
        let mimeType = files[id].mimeType;
        let data = files[id].data;
        if (typeof (loader.mediaCache[id]) === 'undefined') {
            //create a blob URL for the image with the loaded content
            loader.mediaCache[id] = new Blob([base64ToBytes(data)], {type: mimeType});
            loader.mediaURLs[id] = URL.createObjectURL(loader.mediaCache[id]);
        }
    }
    loader_replaceMediaURLs();
	loader_hideWaitDialog('core');
    core_mediaFilesLoaded();
}

function loader_replaceMediaURLs() {
    //iterate trough all test.items
    debug_log("loader", `loader_replaceMediaURLs()`);
    for (let i in test.items) {
        let item = test.items[i];
        if (typeof (item.metadata) === 'undefined' || typeof (item.metadata.paths) === 'undefined') continue;
        for (let j in item.metadata.paths) {
            let mediaData = item.metadata.paths[j];
            let id = parseInt(mediaData.mediaId);
            if (typeof (loader.mediaURLs[id]) !== 'undefined') {
                //if we have a cached URL for this media file, replace the URL
                let context = mediaData.context ?? null;
                let needle = mediaData.string;
                let path = mediaData.path;
                if (path === null) {
                    /* if the path is null, the media file was found in an advanced editor field
                       so we need to iterate through all fields and find one with a matching 'file'
                       property and we need to check the parsed HTML to find other occurrences */

                    for (let fieldName in item.fields) {
                        let field = item.fields[fieldName];
                        if (typeof (field.file) === 'object') {
                            //if the file property exists, we need to iterate through different languages
                            for (let lang in field.file) {
                                if (he.decode(field.file[lang]) === he.decode(needle)) {
                                    //if the file ID matches, replace the URL
                                    field.file[lang] = loader.mediaURLs[id];
                                }
                            }
                        }
                    }
                    for (let lang in item.parsed) {
                        replaceNestedSubstring(item.parsed, [lang], needle, loader.mediaURLs[id]);
                    }
                } else {
                    if (context === 'parsed') {
                        /* in the string found in the parsed property of the item, find the subproperty
						   indicated by the path, then replace the URL */
                        replaceNestedSubstring(item.parsed, path, needle, loader.mediaURLs[id]);
                    } else if (context === 'fields') {
                        /* in the string found in the fields property of the item, find the subproperty
						   indicated by the path, then replace the URL */
                        replaceNestedSubstring(item.fields, path, needle, loader.mediaURLs[id]);
                    }
                }
            }
        }
    }
}

function loader_getManifest(mode) {
    debug_log("loader", `loader_getManifest('${mode}')`);
    const manifest = [];
    switch (mode) {
        case 'global':
            manifest.push({type: 'switchMode', mode: mode});
            break;
        case 'login':
            if (landingPagePath === '') {
                manifest.push({type: 'switchMode', mode: mode});
                manifest.push({
                    type: 'shortcut', shortcut: 'CR', onTrigger: 'login_returnPressed', unload: true, options: {
                        preventDefault: false,
                        executeOnChildren: true,
                        sendOriginalEvent: true,
                        stopPropagation: true
                    }
                });
                manifest.push({
                    type: 'shortcut', shortcut: 'CTRL+SHIFT+E', onTrigger: 'login_openEditor', unload: true, options: {
                        preventDefault: false,
                        executeOnChildren: true,
                        sendOriginalEvent: true,
                        stopPropagation: true
                    }
                });
            } else {
                manifest.push({type: 'switchMode', mode: mode, landingPagePath: landingPagePath});
                for (let i in landingPageManifest) {
                    let mfItem = deepCopy(landingPageManifest[i]);
                    // only treat entries without a URL as manifest items, rest is treated in PHP script
                    if (typeof (mfItem.url) === 'undefined') {
                        manifest.push(mfItem);
                    }
                }
            }
            break;
        case 'dashboard':
            manifest.push({type: 'switchMode', mode: mode});
            break;
        case 'test':
            manifest.push({type: 'switchMode', mode: mode, skinPath: skin.path});
            manifest.push({
                type: 'shortcut', shortcut: 'right', onTrigger: 'core_nextItem', unload: true, options: {
                    preventDefault: false,
                    executeOnChildren: false,
                    sendOriginalEvent: true,
                    stopPropagation: true
                }
            });
            manifest.push({
                type: 'shortcut', shortcut: 'left', onTrigger: 'core_previousItem', unload: true, options: {
                    preventDefault: false,
                    executeOnChildren: false,
                    sendOriginalEvent: true,
                    stopPropagation: true
                }
            });
            manifest.push({
                type: 'shortcut', shortcut: 'CTRL+I', onTrigger: 'core_toggleItemCodes', unload: true, options: {
                    preventDefault: false,
                    executeOnChildren: false,
                    sendOriginalEvent: true,
                    stopPropagation: true
                }
            });
            manifest.push({
                type: 'shortcut', shortcut: 'CTRL+ALT+SHIFT+T', onTrigger: 'core_timeUp', unload: true, options: {
                    preventDefault: false,
                    executeOnChildren: false,
                    sendOriginalEvent: true,
                    stopPropagation: true
                }
            });
            break;
        case 'score':
            manifest.push({type: 'switchMode', mode: mode});
            break;
        case 'error':
            manifest.push({type: 'switchMode', mode: mode});
            break;
    }
    return manifest;
}

function loader_showWaitDialog(handler) {
    debug_log("loader", `loader_showWaitDialog('${handler}')`);
	if ( typeof(global_getText) === 'undefined' ) {
		loader.waitDialog.updateMessage(global_getText("global", "loading"));
	}
    loader.waitDialog.show(handler);
}

function loader_hideWaitDialog(handler) {
    debug_log("loader", `loader_hideWaitDialog('${handler}')`);
    loader.waitDialog.hide(handler);
}

function  loader_showMediaProgress(handler) {
	debug_log("loader", `loader_showMediaProgress('${handler}')`);
	loader.waitDialog.updateMessage(global_getText("global", "mediaProgress"), {loaded: '0', total: '???'});
	loader.waitDialog.show(handler);
}

function loader_updateMediaProgress(e) {
	let loaded = Math.round(e.detail.loaded / 1024);
	let total = Math.round(e.detail.total / 1024);
	debug_log("loader", `loader_updateMediaProgress(${loaded}, ${total})`);
	loader.waitDialog.updateValues({loaded: loaded, total: total});
}

function loader_enableMediaProgressListener() {
	debug_log("loader", `loader_enableMediaProgressListener()`);
	window.addEventListener('mediaCacheProgress', (e) => loader_updateMediaProgress(e));
}