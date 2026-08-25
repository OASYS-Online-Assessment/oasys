"use strict";

//initialize everything that's globally applicable for all modes
function global_init() {

	//set global error handler
	$(window).on('error', function (e) {
		global_prepareJSErrorReport(e.originalEvent);
	});

	//define default language
	if (parameters?.language) {
		defaults.language = parameters.language;
	} else {
		defaults.language = settings.loginLanguage;
	}
	if (defaults.language === 'default') {
		defaults.language = navigator.language.slice(0, 2).toUpperCase(); //get browser language
	}
	if (defaults.language === 'LB') {
		defaults.language = 'LU'; //normalize Luxembourgish language code
	}

	document.title = settings.title;

	//check if selected language is supported by platform
	if (!languages[defaults.language]) {
		defaults.language = 'EN';
	}

	window.keyboardHandler = new jsKeyboardHandler();
	window.pointerHandler = jsPointerHandler.instance;
	keyboardHandler.permissionHandler(global_mayAcceptKeyStrokes);

	if (!navigator.cookieEnabled) {
		global_internalError(global_getText("global", "cookiesDisabled"), global_getText("global", "error"));
		global_goToErrorPage();
		return;
	}

	//add meta tags to disable certain browser features
	$('head').append('<meta name="msapplication-tap-highlight" content="no">'); //disable tap highlighting on MS Surface

	//if a mode is given as GET or POST parameter use that one, otherwise we'll default to showing the login page
	if (parameters?.mode) {
		loader_switchMode(parameters.mode);
	} else {
		loader_switchMode('login');
	}
}

function global_prepareJSErrorReport(event) {
	const error = event.error;
	const message = error.message;
	const stack = error.stack;
	const filename = event.filename;
	const lineno = event.lineno;
	const colno = event.colno;
	let realFilename;

	if (/^blob:/.test(filename)) {
		realFilename = Object.entries(loader.blobURLs ?? {}).find(([key, value]) => value === filename)[0];
	} else {
		realFilename = filename;
	}

	let errorReport = new Date().toLocaleString() + '\n';
	errorReport += 'Error: ' + message + '\n';
	errorReport += 'File: ' + realFilename + '\n';
	errorReport += 'Line: ' + lineno + '\n';
	errorReport += 'Column: ' + colno + '\n';
	errorReport += 'Stack: ' + stack + '\n';
	errorReport += '\n';

	global_sendErrorReport(errorReport);
}

function global_sendErrorReport(report) {
	// Use the 'fetch' API to send the data to the server
	if (!state.testPaused) {
		fetch(settings.rootURL + 'feClientErrorLogger.php', {
			method: 'POST',
			body: report
		});
	}
}

//get translation of a string
function global_getText(mode, id, preview = false) {
	let language = state.language || testee.language || defaults.language;
	const fallbackLanguage = languages[language].fallback;
	if (text[mode] && text[mode][id]) {
		if (text[mode][id][language]) {
			return text[mode][id][language];
		} else if (text[mode][id][fallbackLanguage]) {
			return text[mode][id][fallbackLanguage];
		} else {
			return text[mode][id]['EN'];
		}
	} else if (text['global'] && text['global'][id]) {
		if (text['global'][id][language]) {
			return text['global'][id][language];
		} else if (text['global'][id][fallbackLanguage]) {
			return text['global'][id][fallbackLanguage];
		} else {
			return text['global'][id]['EN'];
		}
	} else {
		if (settings.debugSystem === true) {
			// if the id contains spaces, it's already been translated, so we do not have to warn
			if (id.indexOf(' ') === -1) {
				console.warn(`<b>Error:</b> missing text (id='${id}', language='${language}', mode='${mode}')!`);
			}
		}
		return id;
	}
}

function global_handleException(e) {
	if (loader && loader.waitDialog && loader.waitDialog.busy()) loader.waitDialog.reset();
	let msg = "<p>An error of unknown origin has occurred. No information available on what went wrong. Bummer!</p>";
	if (e.message) {
		msg = "<p>" + e.message + "</p>";

		//Firefox & Opera will include fileName & lineNumber, so we will show that info if available
		if (e.fileName) {
			msg += "<p><b>File: </b><code>" + e.fileName + "</code></p>";
		}
		if (e.lineNumber) {
			msg += "<p><b>Line: </b><code>" + e.lineNumber + "</code></p>";
		}

		//Chrome omits fileName & lineNumber but has a stack dump instead; we'll log that one to console if available
		if (e.stack) {
			console.log(e.stack);
		}
	}
	global_errorDialog(msg, e.name || null, e.callback || null);
}

function global_fatalException(lbl, name, geekMsg = null) {
	if (loader && loader.waitDialog && loader.waitDialog.busy()) loader.waitDialog.reset();
	this.message = global_getText('test', lbl);
	if (geekMsg) {
		this.message += "<br><br><span style='font-size: 0.8em'>[technical details: " + geekMsg + "]</span>";
	}
	this.name = name || null;
	this.callback = global_goToErrorPage;
}

function global_internalError(msg, title, stopTest = false) {
	if (loader && loader.waitDialog && loader.waitDialog.busy()) loader.waitDialog.reset();
	let callback;
	if (stopTest) {
		callback = global_goToErrorPage;
		core_cleanup();
	}
	global_errorDialog(msg, title, callback);
}

function global_goToErrorPage() {
	if (typeof (core_sendBeacon) === "function") {
		core_sendBeacon('fatalError');
	}
	loader_switchMode('error');
}

//generic error dialog
function global_errorDialog(s, name = null, callback = null) {
	const dialogData = {
		buttons: [{
			label: 'OK',
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: global_getText('global', s, parameters?.action === 'preview') ?? s,
		title: name || global_getText('global', 'error', parameters?.action === 'preview'),
		icon: "images/error.png",
		iconWidth: 64,
		width: 500
	};
	if (callback) dialogData.callback = callback;
	new nxDialog('fatalError', dialogData);
}

function global_showMessage(s, name = null, width = null) {
	const dialogData = {
		buttons: [{
			label: 'OK',
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: s,
		title: name || global_getText('global', 'error'),
		width: width || 500
	};
	console.log(s);
	new nxDialog('popupMessage', dialogData);
}

function global_logWarning() {
	const msg = stringf.apply(this, arguments);
	const now = Date.now();
	techLog.push({timestamp: now, msg: msg});
	if (console) {
		console.warn(msg);
	}
}

//tells the keyboard handler whether keyboard activity is allowed
function global_mayAcceptKeyStrokes() {
	return !window.loader.waitDialog.busy();
}

let globalFinishScreenRequestPending = false;

function global_finishTest() {
	if (globalFinishScreenRequestPending) return;
	globalFinishScreenRequestPending = true;
	loader_registerAjaxHandler('finishScreen', 'finish.php', true, false, global_finishScreenLoaded);
	loader_startAjax('finishScreen', 'fetchFinishScreen', {
		serialNumber: window.serialNumber
	});
}

function global_finishScreenLoaded(res) {
	globalFinishScreenRequestPending = false;
	const finishScreenData = res.data || {mode: 'default'};
	if (finishScreenData.mode === 'url' && typeof (finishScreenData.url) === 'string' && finishScreenData.url !== '') {
		global_cleanState();
		window.location = finishScreenData.url;
	} else if (finishScreenData.mode === 'custom' &&
		typeof (finishScreenData.contents) === 'object' &&
		objectLength(finishScreenData.contents) > 0) {
		window.finishScreen = finishScreenData;
		global_cleanState();
		loader_switchMode('finish');
	} else {
		global_returnToLogin();
	}
}

function global_rememberStudentState() {
	if (window.top !== window) return;
	try {
		sessionStorage.setItem(window.studentStateStorageKey, window.serialNumber);
	} catch (e) {
		// Reload persistence is optional when sessionStorage is unavailable.
	}
}

function global_forgetStudentState() {
	if (window.top !== window) return;
	try {
		sessionStorage.removeItem(window.studentStateStorageKey);
	} catch (e) {
		// Nothing else is needed when sessionStorage is unavailable.
	}
}

function global_hasCurrentStudentState() {
	if (window.top !== window) return false;
	try {
		return sessionStorage.getItem(window.studentStateStorageKey) === window.serialNumber;
	} catch (e) {
		return false;
	}
}

function global_returnToLogin() {
	global_cleanState();
	if (parameters?.framed === 1) {
		global_returnToParent();
	} else if (settings.customLoginURL !== '') {
		window.location = settings.customLoginURL;
	} else if (typeof (customLandingPage) === 'object' && customLandingPage !== null && customLandingPage.id) {
		window.location = settings.rootURL + '?landingPageId=' + encodeURIComponent(customLandingPage.id);
	} else if (landingPage !== '') {
		window.location = settings.rootURL + '?landingPage=' + landingPage;
	} else {
		window.location = settings.rootURL;
	}
}

function global_returnToParent() {
	debug_log("login", `login_returnToParent()`);
	window.location = 'about:blank';
	window.parent.dashboard_hideLoginFrame();
}


/* when window closes contact server to remove serial number from session */
function global_cleanState() {
	if (global_hasCurrentStudentState()) return;
	if ("sendBeacon" in navigator) {
		const fd = new FormData();
		fd.append('serialNumber', window.serialNumber);
		navigator.sendBeacon("stateCleaner.php", fd);
	}
}
