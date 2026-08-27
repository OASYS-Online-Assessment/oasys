"use strict";

function core_init() {
	try {
		skin_init();
		window.state = {
			itemCount: test.structure.items.length,
			eventCounter: 0,	//used for serialization of logged events in case timestamp isn't linear due to NTP adjustments or tampering
			fieldBeingEdited: false,
			userAgent: navigator.userAgent,
			screenSize: window.screen.width + 'x' + window.screen.height,
			platform: core_checkForOS(),
			mobile: core_checkMobileDevice(),
			ready: false,
			fieldInstances: {},
			mediaProgress: fetchFromPath(test, 'activity', 'metaData', 'mediaProgress') ?? {},
			mediaPlaying: {}
		};
		core_updateOrientation();
		loader_registerEvent(window, 'orientationchange', core_updateOrientation, true);
		if (test.activity && test.activity.lastEventId) {
			state.eventCounter = test.activity.lastEventId;
		}
		window.answers = {};
		window.events = {};
		window.techLog = [];
		window.workers = {};
		window.dialogs = {};
		window.popups = {};
		window.hooks = {
			userEvent: {}
		};
		window.core.updateCallbacks = [];


		/* execute 3rd party init functions (mainly from plugins) */
		let func;
		do {
			func = loader_fetchInitFunction();
			if (typeof (func) === 'function') func.call(this);
		} while (func !== false);

		/* install hooks of plugins where necessary */

		for (let i in plugins) {
			if (typeof (plugins[i].installHooks) === 'function') plugins[i].installHooks();
		}

		core_addStylesheet('test');
		core_addStylesheet('stimulus');
		core_addStylesheet('question');
		core_initLanguage();
		core_prepareLabels();
		core_createItemButtons();
		core_copyDebugData();
		butler_init();
		core_prepareFieldList();
		timer.settings.tsLogin = core_getTimestamp();
		if (butler_checkOption('waitForMediaCache') === false) {
			core_startQueueWorker();
			core_startTimerWorker();
			if (test.activity && test.activity.currentItem) {
				core_gotoItem(test.activity.currentItem);
			} else {
				core_gotoItem(0);
			}
			core_markLogin();
			state.ready = true;
		} else {
			//show wait dialog until media files are loaded
			loader_showMediaProgress('core');
		}
		loader_registerEvent(window, 'beforeunload', core_onCloseWindow, true);
		loader_cacheMediaFiles(); //background task to cache media files up front
	} catch (e) {
		global_handleException(e);
	}
}

function core_copyDebugData() {
	if (typeof debug !== 'undefined') {
		//iterate through debug to copy any data over to real variables
		for (let mainKey in debug) {
			for (let key in debug[mainKey]) {
				window[mainKey][key] = debug[mainKey][key];
			}
		}
	}
}

//this gets called when all media files have been cached
function core_mediaFilesLoaded() {
	if (butler_checkOption('waitForMediaCache') === true) {
		core_startQueueWorker();
		core_startTimerWorker();
		if (test.activity && test.activity.currentItem) {
			core_gotoItem(test.activity.currentItem);
		} else {
			core_gotoItem(0);
		}
		core_markLogin();
		state.ready = true;
	}
}

function core_checkForOS() {
	let os;
	if (navigator?.userAgentData?.platform) {
		os = navigator.userAgentData.platform;
	} else {
		const userAgent = navigator.userAgent;
		if (userAgent.match(/Android/i)) {
			os = 'android';
		} else if (userAgent.match(/iPhone|iPad|iPod/i)) {
			os = 'iOS';
		} else if (userAgent.match(/Mac/i)) {
			os = 'macOS';
		} else if (userAgent.match(/Windows/i)) {
			os = 'windows';
		} else if (userAgent.match(/Linux/i)) {
			os = 'linux';
		} else {
			os = 'unknown';
		}
	}
	globalVariables.__os = os;
	return os;
}

function core_checkMobileDevice() {
	let mobile;
	if (navigator?.userAgentData?.mobile) {
		mobile = navigator.userAgentData.mobile;
	} else {
		mobile = navigator.maxTouchPoints > 1;
	}
	globalVariables.__mobile = mobile;
	return mobile;
}

function core_updateOrientation() {
	let orientation;
	if (typeof (window.screen.orientation) !== 'undefined') {
		orientation = window.screen.orientation.type;
	} else {
		orientation = 'unkown';
	}
	state.orientation = orientation;
	globalVariables.__orientation = orientation;

	//rerun visibility scripts of current item
	let script = fetchFromObjPath(test, ['items', state.currentItemId, 'scripts', 'visibility']);
	if (script !== null) {
		scripting_executeScript(script, "visibility", state.currentItemId);
	}
}

/*
	This function creates stylesheets on demand for different categories and saves the link to them for later use
 */

function core_addStylesheet(scope) {
	stylesheets[scope] = addStylesheet();
}

/*
	This clears all styles from a stylesheet, mostly used to remove item specific styles when navigating;
 */

function core_clearStylesheet(scope) {
	while (stylesheets[scope].cssRules.length > 0) {
		stylesheets[scope].deleteRule(stylesheets[scope].cssRules.length - 1);
	}
}

/*
	This adds css rules to a stylesheet, the rules must be in an array of objects that have the keys 'selector' and 'rules'
 */

function core_setStyles(scope, cssData) {
	addStylesheetRulesArray(stylesheets[scope], cssData, 'selector', 'rules');
}

/*
	This is called before unloading the script file. That is necessary for the web worker threads to be stopped.
 */

function core_cleanup() {
	const data = {
		type: 'destroy'
	};
	if (workers && workers.queue) workers.queue.postMessage(data);
	if (workers && workers.timer) workers.timer.postMessage(data);
	delete workers.queue;
	delete workers.timer;
}

function core_registerHook(scope, id, f) {
	if (typeof (hooks[scope]) === 'undefined') {
		//if scope is not supported return false
		return false;
	}
	if (typeof (hooks[scope][id]) !== 'undefined') {
		//if hook is already installed return false
		return false;
	}
	hooks[scope][id] = f;
	return true;
}

function core_registerUpdateCallback(f) {
	debug_log("core", `core_registerUpdateCallback(f)`);
	if (window.core.updateCallbacks.indexOf(f) > 1) {
		return false;
	}
	window.core.updateCallbacks.push(f);
}

function core_clearUpdateCallbacks() {
	debug_log("core", `core_clearUpdateCallbacks()`);
	window.core.updateCallbacks = [];
}

function core_itemPositionUpdated() {
	debug_log("core", `core_itemPositionUpdated()`);
	for (let i in window.core.updateCallbacks) {
		window.core.updateCallbacks[i].call(window);
	}
}

//this function tells the skin to update any positions of items due to the loading of an image which may have changed the layout
function core_imageLoadHandler(element) {
	core_itemPositionUpdated();
	$(element).off('load');
}

function core_executeHooks(scope) {
	for (let id in hooks[scope]) {
		if (typeof (hooks[scope][id]) === 'function') {
			hooks[scope][id].call(this);
		}
	}
}

function core_removeHook(scope, id) {
	if (typeof (hooks[scope]?.[id]) !== 'undefined') {
		delete hooks[scope][id];
	}
}


/*
	This replaces certain predefined keywords in the button labels and item titles, mostly for item/group counters
 */
function core_prepareLabels() {
	let counter_total = 0;
	const counter_labelgroups = {};

	//replace counters
	for (let i in test.structure.items) {
		let item = test.structure.items[i];
		let id = item.labelID;
		item.title = cloneObj(test.labels[id].headline);
		item.label = cloneObj(test.labels[id].button);
		const firstLang = getKey(item.title, 0);
		if (item.title[firstLang].match(/\[@counter_total]/i) || item.label[firstLang].match(/\[@counter_total]/i)) {
			counter_total++;
			for (let lng in item.title) {
				item.title[lng] = item.title[lng].replace(/\[@counter_total]/ig, counter_total);
			}
			for (let lng in item.label) {
				item.label[lng] = item.label[lng].replace(/\[@counter_total]/ig, counter_total);
			}
		}
		if (item.title[firstLang].match(/\[@counter_labelgroup]/i) || item.label[firstLang].match(/\[@counter_labelgroup]/i)) {
			if (typeof (counter_labelgroups[id]) === 'undefined') {
				counter_labelgroups[id] = 0;
			}
			counter_labelgroups[id]++;
			for (let lng in item.title) {
				item.title[lng] = item.title[lng].replace(/\[@counter_labelgroup]/ig, counter_labelgroups[id]);
			}
			for (let lng in item.label) {
				item.label[lng] = item.label[lng].replace(/\[@counter_labelgroup]/ig, counter_labelgroups[id]);
			}
		}
	}

	//replace totals
	for (let i in test.structure.items) {
		let item = test.structure.items[i];
		let id = item.labelID;
		for (let lng in item.title) {
			item.title[lng] = item.title[lng].replace(/\[@total_total]/ig, counter_total);
		}
		for (let lng in item.label) {
			item.label[lng] = item.label[lng].replace(/\[@total_total]/ig, counter_total);
		}

		if (typeof (counter_labelgroups[id]) === 'undefined') continue;

		for (let lng in item.title) {
			item.title[lng] = item.title[lng].replace(/\[@total_labelgroup]/ig, counter_labelgroups[id]);
		}
		for (let lng in item.label) {
			item.label[lng] = item.label[lng].replace(/\[@total_labelgroup]/ig, counter_labelgroups[id]);
		}
	}
}

function core_initLanguage() {
	let languageCount = 0;
	//if testee was already logged into this test before, we set the same language as he used before
	if (test.activity && test.activity.language) {
		testee.language = test.activity.language;
		testee.fallbackLanguage = languages[testee.language].fallback;
	}
	for (let lng in window.languages) {
		if (test.options[lng] === true) {
			if (languageCount === 0 || lng === testee.language) state.language = lng;
			state.fallbackLanguage = languages[state.language].fallback;
			languageCount++;
		}
	}
	if (typeof (skin_setLabels) === 'function') {
		skin_setLabels();
	}
	if (languageCount === 0) {
		//if no language has been enabled in the test, throw an exception
		throw new global_fatalException("noLanguageEnabled", "TestDataError");
	} else {
		//only create language buttons if there is in fact a choice
		core_createLanguageButtons();
	}
}

function core_createLanguageButtons() {
	test.languageOptions = [];
	for (let lng in window.languages) {
		if (test.options[lng] === true) {
			test.languageOptions.push(lng);
		}
	}
	if (test.languageOptions.length > 1) {
		if (typeof (skin_createLanguageMenu) === 'function') {
			skin_createLanguageMenu(test.languageOptions, state.language);
		}
	}
}

function core_getLanguageOptions() {
	return test.languageOptions;
}

function core_switchLanguage(code) {
	if (!test.options[code] === true) {
		console.error('Invalid language selected. Cannot switch to "' + code + '"!');
		return;
	}
	//cleanup current item data
	for (let i in plugins) {
		if (typeof (plugins[i].cleanup) === 'function') plugins[i].cleanup();
	}
	const previousLanguage = state.language;
	state.language = code;
	state.fallbackLanguage = languages[state.language].fallback;
	core_setItemLabels();
	core_setItemContent();
	const event = {
		itemId: state.currentItemId,
		type: 'behaviour',
		language: state.language,
		timestamp: core_getTimestamp(),
		timeLeft: core_getTimeLeft(),
		subType: 'language',
		data: JSON.stringify({previousLanguage: previousLanguage})
	};
	core_userEvent(event);
	if (typeof (skin_updateLanguage) === 'function') {
		skin_updateLanguage(code);
	}
}

function core_createItemButtons() {
	if (test.structure.items.length === 0) {
		throw new global_fatalException("noTestContent", "launchingTest");
	}
	if (typeof (skin_createItemButtons) === 'function') {
		skin_createItemButtons(test.structure.items.length);
	}
}

function core_getItemLabel(n) {
	const buttonData = {};
	if (typeof (test.structure.items[n].label[state.language]) !== 'undefined') {
		// if required language exists use it
		buttonData.label = test.structure.items[n].label[state.language];
	} else {
		// if required language does not exist fallback to the first defined language
		const fallbackLang = getKey(test.structure.items[n].label, 0);
		buttonData.label = test.structure.items[n].label[fallbackLang];
	}

	//certain skins need more than just the label to show the button correctly,
	//therefore we'll also report back if it's a static screen (only stimulus) or a real item
	buttonData.type = 'item';
	const itemId = test.structure.items[n].hiddenID;
	const item = test.items[itemId];
	if (item.fields === null) {
		buttonData.type = 'static';
	} else {
		let staticFields = true;
		for (let i in item.fields) {
			if (item.fields[i].category === 'fields') {
				staticFields = false;
				break;
			}
		}
		if (staticFields === true) buttonData.type = 'static';
	}
	return buttonData;
}

function core_getItemTitle(n) {
	return test.structure.items[n].title[state.language];
}

function core_setItemLabels() {
	if (typeof (skin_setItemButtonLabel) !== 'function') {
		return;
	}
	for (let i = 0; i < test.structure.items.length; i++) {
		skin_setItemButtonLabel(i, core_getItemLabel(i).label);
	}
}

function core_getItemContents() {
	const id = test.structure.items[state.currentItem].hiddenID;
	const item = test.items[id];
	state.question = item;
	if (item.link) {
		state.stimulus = test.items[item.link];
	} else {
		state.stimulus = null;
	}
}

function core_setItemContent() {
	if (typeof (skin_setTitle) === 'function') {
		skin_setTitle(core_getItemTitle(state.currentItem));
	}

	//first clear out old contents to avoid problems when parsing new stimulus while old item contents are still there
	if (state.currentStimulus !== state.stimulus?.id || state.language !== state.stimulusLanguage) {
		core_clearStylesheet('stimulus');
		skin_clearStimulus();
	}
	skin_clearQuestion();
	state.fieldInstances = {};
	let validity = true;

	if (state.stimulus && (state.currentStimulus !== state.stimulus?.id || state.language !== state.stimulusLanguage)) {
		/* check if any block of current stimulus is not valid */
		for (let block of state.stimulus.blocks) {
			if (block.__valid === false) {
				validity = false;
			}
		}
		/* the following is needed to check if stimulus changes (in order to keep scroll position) */
		state.currentStimulus = state.stimulus?.id;
		if (typeof (state.stimulus.parsed[state.language]) !== 'undefined') {
			// if required language exists use it
			state.stimulusLanguage = state.language;
		} else {
			// if required language does not exist fallback to the first defined language
			state.stimulusLanguage = getKey(state.stimulus.parsed, 0);
		}
		skin_setStimulus(state.stimulus.parsed[state.stimulusLanguage]);

		//in the next step all elements in the stimulus controlled by plugins are set
		core_parseItem(state.stimulus.fields || false, 'stimulus');
		const stimulusCSS = fetchFromObjPath(state, ['stimulus', 'options', 'customCSS']);
		if (stimulusCSS) {
			core_setStyles('stimulus', stimulusCSS);
		}
	} else if (state.stimulus === null) {
		state.currentStimulus = null;
	}
	core_clearStylesheet('question');
	if (state.question) {
		/* check if any block of current item is not valid */
		for (let block of state.question.blocks) {
			if (block.__valid === false) {
				validity = false;
			}
		}
		if (state.question.languages.includes(state.language)) {
			// if required language exists use it
			state.questionLanguage = state.language;
		} else {
			// if required language does not exist fallback to the first defined language
			state.questionLanguage = getKey(state.question.parsed, 0);
		}
		skin_setQuestion(state.question.parsed[state.questionLanguage]);

		//in the next step all elements in the question controlled by plugins are set
		core_parseItem(state.question.fields || false, 'question');
		const questionCSS = fetchFromObjPath(state, ['question', 'options', 'customCSS']);
		if (questionCSS) {
			core_setStyles('question', questionCSS);
		}
	}
	if (typeof (MathJax) !== 'undefined' && typeof (MathJax.typeset) === 'function') {
		MathJax.typeset();
		jsDNDManager.update(); //required to recalculate positions on screen since Mathjax changes sizes of elements
	}

	/* make sure draggable elements are correctly positioned after images finish loading */
	let mainDiv;
	if (typeof (skin_getMainDiv) === 'function') {
		mainDiv = skin_getMainDiv();
	} else {
		mainDiv = $('#main');
	}
	mainDiv.find('img').on('load', (event) => core_imageLoadHandler(event.target));

	core_setImageErrorHandlers();
	core_launchItemTimer();
	if (validity === false) {
		global_errorDialog(global_getText('test', "invalidItem"), global_getText('global', "error"));
	}
}

function core_setImageErrorHandlers() {
	//we need to set error handlers for images that are not yet loaded
	//this is necessary to avoid broken images if firewall blocks access to images
	$('img[src^="fetchMediaFile.php"]').off('error').on('error', function () {
		let retryCount = $(this).data('retryCount');
		if (typeof (retryCount) === 'undefined') retryCount = 0;
		console.warn('loading image failed ... retrying', this.src);
		if (retryCount < 2) {
			$(this).data('retryCount', retryCount + 1);
			$(this).attr('src', $(this).attr('src'));
		} else {
			//get the fileid from the src attribute
			const fileid = $(this).attr('src').match(/fileid=([0-9]+)/)[1];
			global_internalError(sf(global_getText('test', "imageLoadError"), fileid), global_getText('global', "error"), true);
		}
	});
}

function core_parseItem(fields, location) {
	/*
		If this is a stimulus without question, there are typically no fields, and this function returns immediately.
		However, a video or audio file in the stimulus is also registered as a field, as we want to track how many times
		it has already been played. In that case we have to proceed, and get certain properties from the stimulus instead
		of the item.
	 */
	if (!fields) return;
	for (let i in fields) {
		let target = $('.oasysTag[data-id=' + fields[i].code + ']');
		const targetWithoutLabels = target.filter(":not(.oasysLabel)");
		if (target.length === 0) {
			let msg = sf(global_getText('test', "missingFieldInstance"), i);
			global_errorDialog(msg);
			continue;
		}
		let type = fields[i].type;
		if (targetWithoutLabels.length > 1 && !plugins[type].multipleInstancesAllowed) {
			let msg = sf(global_getText('test', "duplicateFieldInstances"), i);
			global_errorDialog(msg);
			target = target.first();
		}
		const itemData = {
			id: state[location].id,
			code: state[location].itemCode
		};
		const currentValue = answers[state[location].id][fields[i].id];
		if (plugins[type]) {
			state.fieldInstances[i] = plugins[type].constructor(target, fields[i], itemData, currentValue, state[location + 'Language']);
		}
	}

	/*
		We need to complete the first loop through all fields before we can run postProcessing, hence this second loop.
		Here we initialize the 'answers' table for the more complex item formats (e.g. drag and drop) if there is no
		previous value.
		The point here is to verify itemRequirements after creation without sending the initial state as an answer given
		by the test taker. This is necessary for instance for "drag and drop" format where the draggables get created only
		after the dropzones. If a dropzone carries all draggables at the beginning and must be empty to complete the item,
		the item requirement would seem as met, as the dropzone was empty when it was created ... that false information
		is corrected at this point.
	 */
	for (let i in fields) {
		let type = fields[i].type;
		if (typeof (answers[state[location].id][fields[i].id]) === 'undefined' && plugins[type] && typeof (plugins[type].currentResponse) === 'function') {
			const tmpAnswer = plugins[type].currentResponse.call(this, i);
			if (typeof (tmpAnswer) === 'undefined') continue;
			answers[state[location].id][fields[i].id] = tmpAnswer;

			const requiredFields = test.requiredFields[state[location].id];
			if (typeof (requiredFields[i]) !== 'undefined') {
				//update field requirements state
				const validResponse = plugins[type].validResponse(tmpAnswer, fields[i]);
				requiredFields[i] = validResponse;
				state.requiredFields[i] = validResponse;
			}
		}
	}

	//update item button status
	core_updateItemRequirements(state.currentItemId);

	//update navigation after setting the new value for a required field
	butler_updateNavigation();
	butler_updateItemButtons(state.currentItemId);

	if (typeof (skin_questionFinishedParsing) === 'function') {
		skin_questionFinishedParsing();
	}

	/*	find the first element of class 'oasysTag' and check if it has the class 'oasysTextfield', 'oasysTextarea' or
		'oasysInlineText' and if it does, focus the input type text field or textarea field inside */
	let firstField = $('.oasysTag').first();
	if (firstField.length > 0 && (firstField.hasClass('oasysTextfield') || firstField.hasClass('oasysTextarea') || firstField.hasClass('oasysInlineText'))) {
		firstField.find('input, textarea').first().focus();
	}
	core_replaceVariablePlaceholders();
	core_launchItemTimer();
}

function core_replaceVariablePlaceholders() {
	const contentWrapper = document.getElementById('contentWrapper');
	if (!contentWrapper) return;

	const placeholderPattern = /{{(.*?)}}/g;
	const resolvePlaceholder = (match, variableName) => {
		const details = test.variables?.[variableName];
		if (details?.global === true) {
			const i = getKey(details?.text, 0);
			return details?.text[i] ?? '';
		}
		if (typeof (details?.text?.[state.language]) !== 'undefined') {
			return details.text[state.language];
		}
		return match;
	};

	/*
		Only replace the text nodes that contain placeholders. Reassigning an element's innerHTML recreates all of its
		descendants, which disconnects initialized plugins such as MediaElementPlayer from the DOM. A Range preserves
		the previous behaviour of allowing variable values to contain HTML without rebuilding surrounding elements.
	*/
	const textNodes = [];
	const walker = document.createTreeWalker(contentWrapper, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		if (walker.currentNode.nodeValue.includes('{{')) textNodes.push(walker.currentNode);
	}

	for (const textNode of textNodes) {
		const text = textNode.nodeValue;
		const fragment = document.createDocumentFragment();
		const range = document.createRange();
		range.selectNode(textNode);
		let lastIndex = 0;
		let changed = false;
		let placeholder;
		placeholderPattern.lastIndex = 0;

		while ((placeholder = placeholderPattern.exec(text)) !== null) {
			const replacement = String(resolvePlaceholder(placeholder[0], placeholder[1]));
			fragment.appendChild(document.createTextNode(text.substring(lastIndex, placeholder.index)));
			if (replacement === placeholder[0]) {
				fragment.appendChild(document.createTextNode(replacement));
			} else {
				fragment.appendChild(range.createContextualFragment(replacement));
				changed = true;
			}
			lastIndex = placeholderPattern.lastIndex;
		}

		if (changed) {
			fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
			textNode.parentNode.replaceChild(fragment, textNode);
		}
	}

	//Replace placeholders in attributes without recreating their elements.
	contentWrapper.querySelectorAll('*').forEach((element) => {
		Array.from(element.attributes).forEach((attribute) => {
			if (!attribute.value.includes('{{')) return;
			const replacement = attribute.value.replace(placeholderPattern, resolvePlaceholder);
			if (replacement !== attribute.value) element.setAttribute(attribute.name, replacement);
		});
	});
}

function core_checkValidResponses(itemId = state.currentItemId) {
	//checks all fields of the item that produced the response to find out if the requirements are met
	let fields = test.items[itemId]?.fields;
	if (fields) {
		for (let f in fields) {
			const type = fields[f].type;
			if (plugins[type] && plugins[type].category === 'fields') {
				if (fields[f].required) {
					const validResponse = plugins[type].validResponse(answers[itemId][f], fields[f]);
					test.requiredFields[itemId][f] = validResponse;
					state.requiredFields[f] = validResponse;
					test.itemRequirements[itemId] = test.itemRequirements[itemId] && validResponse;
				}
			}
		}
	}
}

function core_prepareFieldList() {
	test.requiredFields = {};	//requirements per field
	test.itemRequirements = {};	//requirements per item (summary of fields)
	test.requiredFieldCount = 0;
	for (let i in test.items) {
		let itemIsRequired = false;
		test.requiredFields[i] = {};
		answers[i] = {};
		test.itemRequirements[i] = true;
		if (test.items[i].fields) {
			for (let f in test.items[i].fields) {
				/* filling of answers is only for real fields, not for category "static" */
				const type = test.items[i].fields[f].type;
				if (plugins[type] && typeof (plugins[type].preProcessing) === 'function') {
					plugins[type].preProcessing.call(this, test.items[i].fields[f]);
				}
				if (plugins[type] && plugins[type].category === 'fields') {
					answers[i][f] = fetchFromObjPath(testee, ['previousAnswers', i, f]) || test.items[i].fields[f].prefill;
					if (test.items[i].fields[f].required) {
						test.requiredFieldCount++;
						if (typeof (test.requiredFields[i][f]) === 'undefined') test.requiredFields[i][f] = plugins[type].validResponse(answers[i][f], test.items[i].fields[f]);
						test.itemRequirements[i] = test.itemRequirements[i] && plugins[type].validResponse(answers[i][f], test.items[i].fields[f]);
						itemIsRequired = true;
					}
				}
			}
		}
	}
	if (test.structure.type === 'linear' || test.structure.type === 'fluid' || test.structure.type === 'mutation') {
		//buttons with their requirements can only be shown in linear tests
		if (typeof (skin_setItemButtonStatus) === 'function') {
			for (let i in test.structure.items) {
				const id = test.structure.items[i].hiddenID;
				skin_setItemButtonStatus(i, !test.itemRequirements[id]);
			}
		}
	} else {
		global_internalError(`Test structure type '${test.structure.type}' not supported yet! This is still a beta version and it's not yet feature complete.`, 'Error: unimplemented feature', true);
	}
}

function core_updateItemRequirements(itemId) {
	test.itemRequirements[itemId] = true;
	let finishedFields = 0;
	for (let i in test.requiredFields) {
		if (test.items[i].fields) {
			for (let f in test.items[i].fields) {
				if (test.items[i].fields[f].required && test.items[i].fields[f].category === 'fields') {
					test.itemRequirements[i] = test.itemRequirements[i] && test.requiredFields[i][f];
					if (test.requiredFields[i][f] === true) {
						finishedFields++;
					}
				}
			}
		}
	}
	state.fieldsFilled = finishedFields;
	if (state.fieldsFilled >= test.requiredFieldCount) {
		state.testComplete = true;
	} else {
		state.testComplete = false;
	}
	return finishedFields;
}


/*
	The force parameter [boolean] indicates if navigation is forced even if other criteria
	are not met. This is used for instance in item timers that navigate to the next screen
	when the time is up, even if no answer has been given
 */
function core_gotoItem(n, force = false) {
	if (!butler_mayGoToItem(n) && force !== true) {
		return;
	}
	closeExternalEditor();

	//the direction of the navigation is important when using the scripting skip() command, so that we know where to go next
	if (state.currentItem > n) {
		state.navigationDirection = 'backward';
	} else {
		state.navigationDirection = 'forward';
	}

	//if a field has not yet sent its data hold off on any navigation until the data of that field has been secured
	if (state.fieldBeingEdited) {
		setTimeout(core_gotoItem, 100, n, force || false);
		return;
	}

	//POST scripts are being run, before navigating away from item
	if (!state.skipPostScripts) {
		let script = fetchFromObjPath(test, ['items', state.currentItemId, 'scripts', 'post']);
		if (script !== null) {
			state.skipPostScripts = true;
			if (scripting_executeScript(script, "post", state.currentItemId) === true) {
				//if script returns true, some new navigation has been initiated, so we break off the rest of this function
				return;
			} else {
				delete state.skipPostScripts;
			}
		}
	} else {
		delete state.skipPostScripts;
	}

	/* If navigation is forced past the end of the test, the endTest routine will be called.
	*
	*  This can be triggered by any of the following means:
	* 	- script navigation
	* 	- link
	* 	- item timer forces navigation to proceed
	* 	- auto navigation after media playing finishes
	* 	- auto navigation on choice answer
	*
	*  Theoretically, none of these triggers should ever send the test taker past the end of the test, but we need to be
	*  prepared for it, just as a safety measure
	*/
	if (force === true && n >= test.structure.items.length) {
		core_sendBehaviour('navigatedPastEnd');
		core_endTest();
		return;
	}

	//cleanup current item data
	for (let i in plugins) {
		if (typeof (plugins[i].cleanup) === 'function') plugins[i].cleanup();
	}
	state.previousItem = state.currentItem;
	state.currentItem = n;
	state.currentItemId = test.structure.items[n].hiddenID;
	state.requiredFields = test.requiredFields[state.currentItemId]; //reference to required fields list

	//if this function is called during login, we do not want to log a navigation behaviour
	if (state.ready) {
		//send navigation behaviour before script execution
		core_sendBehaviour('navigation', {previousItem: state.previousItem, currentItem: state.currentItem});
	}

	//PRE scripts and VISIBILITY scripts are run, before activating item
	let script = fetchFromObjPath(test, ['items', state.currentItemId, 'scripts', 'pre']);
	if (script !== null) {
		//in case the pre script executes a goto command on a condition, we need to ignore the post scripts of the current item
		state.skipPostScripts = true;
		scripting_executeScript(script, "pre", state.currentItemId);
		delete state.skipPostScripts;
	}
	if (typeof (skin_selectItemButton) === 'function') {
		skin_selectItemButton(n);
	}
	butler_updateItemOptions();
	core_getItemContents();
	if (state.stimulus) {
		Object.assign(state.requiredFields, test.requiredFields[state.stimulus.id]);
	}
	core_setItemContent();
	butler_updateNavigation();
	script = fetchFromObjPath(test, ['items', state.currentItemId, 'scripts', 'visibility']);
	if (script !== null) {
		scripting_executeScript(script, "visibility", state.currentItemId);
	}
}

function core_nextItem(force) {
	core_gotoItem(state.currentItem + 1, force);
}

function core_previousItem(force) {
	core_gotoItem(state.currentItem - 1, force);
}

function core_startQueueWorker() {
	if (!window.Worker) {
		throw new global_fatalException("featureNotSupported", "BrowserSupportError", "web workers not supported");
	}
	workers.queue = new Worker(loader.blobURLs["inc/js/queue.js"]);
	workers.queue.onmessage = core_onQueueMessage;
	if (test.activity) {
		state.payloadId = test.activity.lastPayloadId;
	} else {
		state.payloadId = 0;
	}
	const testData = {
		type: 'init',
		test: cloneObj(test),
		settings: cloneObj(settings),
		butler: cloneObj(butler),
		serialNumber: serialNumber,
		userAgent: state.userAgent,
		screenSize: state.screenSize,
		path: window.location.origin + settings.rootURL
	};
	workers.queue.postMessage(testData);
}

function core_startTimerWorker() {
	if (!window.Worker) {
		throw new global_fatalException("featureNotSupported", "BrowserSupportError", "web workers not supported");
	}
	workers.timer = new Worker(loader.blobURLs['inc/js/timer.js']);
	workers.timer.onmessage = core_onTimerMessage;
	timer.settings.useTimer = butler.useTimer;
	timer.settings.timeLimit = butler.timeLimit;
	if (timer.settings.useTimer) {
		if (test.activity) {
			timer.settings.timeLeftAtLogin = test.activity.timeLeft;
		} else {
			timer.settings.timeLeftAtLogin = timer.settings.timeLimit * 60;
		}
		if (timer.settings.timeLeftAtLogin < 0) timer.settings.timeLeftAtLogin = timer.settings.timeLimit * 60;
		timer.status.secondsLeft = timer.settings.timeLeftAtLogin;
	} else {
		timer.settings.timeLeftAtLogin = -1;
		timer.status.secondsLeft = -1;
	}

	/* debugging timeout -> set timer to 5 seconds */
	// timer.settings.timeLeftAtLogin = 5;
	/***********************************************/

	const timerData = cloneObj(timer);
	timerData.type = 'init';
	workers.timer.postMessage(timerData);
}

function core_onQueueMessage(e) {
	const res = e.data;
	//console.log("core_onQueueMessage '%s': %O", res.action, res);
	if (res.error) {
		workers.queue.terminate();
		if (dialogs.pauseDialog) {
			dialogs.pauseDialog.dismiss();
			delete dialogs.pauseDialog;
		}
		$('body').removeClass("testPaused");
		if (res.reportError === true) {
			global_sendErrorReport(res.errorMsg);
		}
		global_internalError(res.errorMsg, "Error sending data to the server", true);
		return;
	}
	switch (res.action) {
		case 'clearEvents':
			for (let i in res.eventIds) {
				delete events[res.eventIds[i]];
			}
			state.payloadId = res.payloadId;
			break;

		case 'pauseTest':
			core_pauseTest();
			break;

		case 'resumeTest':
			core_resumeTest();
			break;

		case 'instructions':
			for (let i in res.instructions) {
				let instruction = res.instructions[i];
				core_executeInstruction(instruction);
			}
			break;

		case 'resync':
			timer.settings.tsPrecision = res.precision;
			timer.settings.tsDelta = res.delta;
			core_resyncTimer();
			break;

		case 'testClosed':
			/*
				We mark that the queue has been flushed and if the user has already clicked away the dialog we now have
				a callback information of which function to call in order to proceed
			 */
			state.queueFlushed = true;
			workers.queue.terminate();
			if (state.onQueueFlushed) {
				loader.waitDialog.hide('core');
				state.onQueueFlushed.call(this);
				state.onQueueFlushed = null;
			}
			break;

		case 'forceLogoff':
			/*
				If test has been deactivated either manually or by schedule, we must log off the test taker. Since this
				was triggered by the server, we must no longer save any unsent data, so we set the queueFlushed flag and
				terminate the queue worker
			 */
			debugger
			state.queueFlushed = true;
			workers.queue.terminate();
			core_forceLogoff(res.reason, res.restrictionType);
			break;

		case 'timeLeftAtLogin':
			if (timer.settings.timeLeftAtLogin !== res.timeLeftAtLogin) {
				timer.settings.timeLeftAtLogin = res.timeLeftAtLogin;
				const timerData = cloneObj(timer);
				timerData.type = 'init';
				workers.timer.postMessage(timerData);
			}
			break;

		default:
			console.log('unkown action sent from queue', res);
	}
}

function core_executeInstruction(instruction) {
	//extract the command and the parameters from the instruction
	let command = instruction.command;
	switch (command) {
		case 'timeUp':
			if (state.timeUpTriggered === true) return;
			let reason = instruction.reason;
			//if the timeUp event is triggered by the server, we can no longer save any data, so we set the queueFlushed flag
			state.queueFlushed = true;
			workers.queue.terminate();
			core_timeUp(reason);
			break;
		case 'resyncTimer':
			workers.timer.postMessage({type: 'resync'});
			break;
		case 'maintenance':
			//stop both workers and show a dialog to the user
			workers.queue.terminate();
			workers.timer.terminate();
			/*	no behaviour or beacon is sent in this case:
				this happens only when superadmin decided to roll back the database to a previous backup
				hence no data that we would write into the database would persist anyway */
			global_errorDialog('maintenanceStarted', null, global_returnToLogin);
			break;
		case 'inquisition':
			alert("Oh, I didn't expect the Spanish Inquisition!");
			break;
		default:
			console.error('unknown command in instruction:', instruction);
	}
}

function core_userEvent(event) {
	// console.log(event);
	/*
		event will contain the payload of the event
		e.g.:
		event = {
			editInProgress: false			//optional, default => false
	 		itemId: item.id,
	 		type: 'answer',
			fieldType: 'oasysTextfield',	//only for type 'answer'
			fieldId: 'lastName',			//only for type 'answer'
			value: 'Neumann',				//only for type 'answer'
			language: state.language,
			timestamp: core_getTimestamp(),
			timeLeft: core_getTimeLeft(),
			subType: 'navigation'			//only for type 'behaviour'
			data: ''						//optional and only for type 'behaviour'
	 }
	 */
	if (event.type === 'answer') {

		answers[event.itemId][event.fieldId] = event.value;

		if (typeof (test.requiredFields[event.itemId]?.[event.fieldId]) !== 'undefined') {
			//update field requirements state of all fields belonging to the item that produced the response
			core_checkValidResponses(event.itemId);

			//update item button status
			event.fieldsFilled = core_updateItemRequirements(event.itemId);

			//update navigation after setting the new value for a required field
			butler_updateNavigation();
			butler_updateItemButtons(event.itemId);
		}

		if (state.question && state.question.fields && state.question.fields[event.fieldId] && state.question.fields[event.fieldId].export) {
			let exportName = state.question.fields[event.fieldId].export;
			globalVariables[exportName] = event.value;
		} else if (state.stimulus && state.stimulus.fields && state.stimulus.fields[event.fieldId] && state.stimulus.fields[event.fieldId].export) {
			let exportName = state.stimulus.fields[event.fieldId].export;
			globalVariables[exportName] = event.value;
		}

		if (settings.optimiseDataTransfer === true) {
			//optimise data sent to server by removing redundant data
			for (let id in events) {
				let ev = events[id];
				if (ev.itemId === event.itemId && ev.fieldId === event.fieldId) {
					delete events[ev.eventId];
					let message = {
						type: 'deleteEvent',
						eventId: ev.eventId
					};
					workers.queue.postMessage(message);
				}
			}
		}

		//if edit is still in progress event is treated locally, but not sent to queue
		if (!event.editInProgress) {
			event.eventId = ++state.eventCounter;
			events[event.eventId] = event;
			workers.queue.postMessage(event);
		}

	} else {

		event.eventId = ++state.eventCounter;
		events[event.eventId] = event;
		workers.queue.postMessage(event);

	}

	if (event.subType !== 'scripting') {
		let script = fetchFromObjPath(test, ['items', state.currentItemId, 'scripts', 'onActivity']);
		if (script !== null) {
			scripting_executeScript(script, "onActivity", state.currentItemId);
		}
		script = fetchFromObjPath(test, ['items', state.currentItemId, 'scripts', 'visibility']);
		if (script !== null) {
			scripting_executeScript(script, "visibility", state.currentItemId);
		}
	}

	core_executeHooks('userEvent');
}

function core_markLogin() {
	const data = {
		type: 'behaviour',
		subType: 'login',
		timestamp: timer.settings.tsLogin,
		language: state.language,
		itemId: state.currentItemId,
		item: state.currentItem,
		timeLeft: core_getTimeLeft()
	};
	//cache the test data for non linear tests
	if (test.structure.type !== 'linear') {
		data.testCache = {
			id: test.id,
			structure: test.structure,
			labels: test.labels,
			options: test.options,
			variables: test.variables,
			skin: test.skin
		}
	}
	core_userEvent(data);
}

function core_getTimestamp() {
	return Date.now();
}

function core_getTimeLeft() {
	if (butler.useTimer) {
		return fetchFromObjPath(timer, ['status', 'secondsLeft']);
	} else {
		return -1;
	}
}

function core_resyncTimer() {
	const timerData = cloneObj(timer.settings);
	timerData.type = 'resync';
	workers.timer.postMessage(timerData);
}

function core_onTimerMessage(e) {
	const res = e.data;
	if (res.error) {
		workers.timer.terminate();
		global_sendErrorReport(res.report);
		global_internalError(res.report, "Error in timer script", true);
		return;
	}

	switch (res.action) {
		case 'resync':
			if (typeof (skin_setTimerResyncNotification) === 'function') {
				skin_setTimerResyncNotification();
			}
			workers.queue.postMessage({type: 'requestResync'});
			break;
		case 'updateTimeLeft':
			timer.status = e.data.timerStatus;
			if (typeof (skin_setTimer) === 'function') {
				skin_setTimer(timer.status);
			}
			break;
		case 'timeUp':
			core_timeUp();
			break;
		case 'itemTimeUp':
			core_itemTimeUp();
			break;
		case 'timerPaused':
			if (typeof (skin_setTimerResyncNotification) === 'function') {
				skin_setTimerResyncNotification();
			}
			workers.queue.postMessage({type: 'checkConnection', timeLeft: e.data.secondsLeft});
			break;
		case 'timerInitializing':
			timer.initialized = true;
			break;
		default:
			console.log('unkown action sent from timer', res);
	}
}

function core_pauseTest() {
	closeExternalEditor();

	/* if media player is running pause it and make controls visible */
	if (typeof (state.mediaPlaying.instance) !== 'undefined') {
		state.mediaPlaying.instance.pause();
		state.mediaPlaying.player.css('display', 'inline-block');
		state.mediaPlaying = {};
	}

	/* show dialog and block user acces to GUI */
	if (!dialogs.pauseDialog) {
		workers.timer.postMessage({type: 'pauseTimer'});
		const dialogData = {
			buttons: [],
			contents: global_getText('test', 'connectionLost'),
			title: global_getText('test', 'connectionLostTitle'),
			icon: loader.blobURLs["images/connectionLost.svg"] ?? null,
			iconWidth: 100,
			width: 500
		};
		dialogs.pauseDialog = new nxDialog('pauseTest', dialogData);
	}
	state.testPaused = true;
	state.testPausedSince = core_getTimestamp();
	$('body').addClass("testPaused");
}

function core_resumeTest() {
	if (dialogs.pauseDialog) {
		dialogs.pauseDialog.dismiss();
		delete dialogs.pauseDialog;
	}
	timer.settings.tsLogin = core_getTimestamp();
	const timerData = {
		type: 'restartTimer',
		tsLogin: timer.settings.tsLogin
	};
	workers.timer.postMessage(timerData);
	//calculate how long the test has been paused in seconds
	const pauseDuration = Math.round((core_getTimestamp() - state.testPausedSince) / 1000);
	core_sendBehaviour("resumeTest", {
		tsConnectionReestablished: timer.settings.tsLogin,
		tsConnectionLoss: state.testPausedSince,
		pauseDuration: pauseDuration
	});
	delete state.testPaused;
	delete state.testPausedSince;
	$('body').removeClass("testPaused");
}

function core_onCloseWindow() {
	$('input').trigger("blur");
	if (!butler.saveResults || state.queueFlushed) {
		global_cleanState();
		return;
	}
	core_sendBeacon('closeWindow');
}

function core_sendBeacon(reason = '', data = {}) {
	if ("sendBeacon" in navigator) {
		if (reason !== '') {
			//if a reason is sent, we add a behaviour event, otherwise we skip this
			const event = {
				itemId: state.currentItemId,
				type: 'behaviour',
				language: state.language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft(),
				subType: reason,
				data: JSON.stringify(data)
			};
			event.eventId = ++state.eventCounter;
			events[event.eventId] = event;
		}
		const beaconData = {
			payloadId: ++state.payloadId,
			metadata: {mediaProgress: state.mediaProgress},
			challenge: 0,
			action: 'closeApplication',
			test: {
				timeLeft: timer.status.secondsLeft,
				serialNumber: testee.serialNumber,
				timeLimit: butler.timeLimit,
				fieldsFilled: state.fieldsFilled,
				requiredFieldCount: test.requiredFieldCount,
				saveResults: true
			},
			payload: events
		};
		navigator.sendBeacon("saveData.php", UTF8ToBase64(JSON.stringify(beaconData)));
	}
}

function core_timeUp(message = null) {
	state.timeUpTriggered = true;
	workers.timer.terminate();
	core_sendBehaviour('timeUp');
	closeExternalEditor();
	if (!butler.saveResults) {
		state.skipTest = test.id;
	}
	//delay the rest of the timeUp function to give external editors time send data before queue is flushed
	setTimeout(core_timeUp_phase2, 1000, message);
}

function core_timeUp_phase2(message = null) {
	if (state.queueFlushed !== true) {
		//if the server asked to forcefully logout the test taker, we must not send any data to the server
		workers.queue.postMessage({type: 'flushQueue', options: {leaveAccessible: false}});
	}
	if (!dialogs.timeUp) {
		if (test.lastTestForLogin) {
			if (test.options.hideTimeoutMsg === true) {
				core_finishTest();
			} else {
				let dialogData = {
					buttons: [
						{label: global_getText('test', 'returnButton'), 'default': true, value: 'ok'}
					],
					contents: message !== null ? global_getText('test', message) : global_getText('test', 'timeOverReturn'),
					title: global_getText('test', 'timeOverTitle'),
					callback: core_finishTest,
					icon: 'images/img_timeUp.png',
					iconWidth: 100,
					iconHeight: 100,
					width: 500
				};
				dialogs.timeUp = new nxDialog('timeUp', dialogData);
			}
		} else {
			if (test.options.hideTimeoutMsg === true) {
				core_nextTest();
			} else {
				let dialogData = {
					buttons: [
						{label: global_getText('test', 'proceedButton'), 'default': true, value: 'ok'}
					],
					contents: global_getText('test', 'timeOverProceed'),
					title: global_getText('test', 'timeOverTitle'),
					callback: core_nextTest,
					icon: 'images/img_timeUp.png',
					iconWidth: 100,
					iconHeight: 100,
					width: 500
				};
				dialogs.timeUp = new nxDialog('timeUp', dialogData);
			}
		}
	}
}

function core_endTest() {
	closeExternalEditor();
	if (!butler.saveResults) {
		state.skipTest = test.id;
	}
	workers.queue.postMessage({type: 'flushQueue', options: {leaveAccessible: false}});
	if (!dialogs.endTest) {
		if (test.lastTestForLogin) {
			if (test.options.hideTimeoutMsg === true) {
				core_finishTest();
			} else {
				let dialogData = {
					buttons: [
						{label: global_getText('test', 'returnButton'), 'default': true, value: 'ok'}
					],
					contents: global_getText('test', 'endReturn'),
					callback: core_finishTest,
					icon: 'images/finishFlag.svg',
					iconWidth: 100,
					iconHeight: 150,
					width: 500
				};
				dialogs.endTest = new nxDialog('endTest', dialogData);
			}
		} else {
			if (test.options.hideTimeoutMsg === true) {
				core_nextTest();
			} else {
				let dialogData = {
					buttons: [
						{label: global_getText('test', 'proceedButton'), 'default': true, value: 'ok'}
					],
					contents: global_getText('test', 'endProceed'),
					callback: core_nextTest,
					icon: 'images/finishFlag.svg',
					iconWidth: 100,
					iconHeight: 150,
					width: 500
				};
				dialogs.endTest = new nxDialog('endTest', dialogData);
			}
		}
	}
}

function core_forceLogoff(reason, restrictionType) {
	//can no longer send "forceLogoff" behaviour to server, as we already terminated the queue worker
	closeExternalEditor();
	if (!dialogs.forceLogoff) {
		let dialogData = {
			buttons: [
				{label: global_getText('test', 'returnButton'), 'default': true, value: 'ok'}
			],
			contents: global_getText('test', 'forceLogoffReturn'),
			title: global_getText('test', 'forceLogoffTitle'),
			callback: core_closeTest,
			iconWidth: 100,
			iconHeight: 150,
			width: 500
		};
		dialogs.forceLogoff = new nxDialog('forceLogoff', dialogData);
	}
	core_sendBeacon('forceLogoff', {reason: reason, restrictionType: restrictionType});
}

function core_finishTest() {
	core_leaveTest(true);
}

function core_closeTest() {
	core_leaveTest(false);
}

function core_leaveTest(finished) {
	/*
		if the queue has already been flushed successfully at this point we can proceed to the loginScreen, if not we
		just keep the callback to this function in the state.onQueueFlushed field and wait for it to be called as soon
		as the queue has been transmitted
	 */
	closeExternalEditor();
	if (state.queueFlushed) {
		if (butler.showScore === true) {
			loader_switchMode('score');
		} else if (finished) {
			global_finishTest();
		} else {
			global_returnToLogin();
		}
	} else {
		state.onQueueFlushed = function () {
			core_leaveTest(finished);
		};
		loader.waitDialog.show('core');
	}
}

function core_nextTest() {
	/*
	 if the queue has already been flushed successfully at this point we can proceed to the next test, if not we
	 just keep the callback to this function in the state.onQueueFlushed field and wait for it to be called as soon
	 as the queue has been transmitted
	 */
	closeExternalEditor();
	if (state.queueFlushed) {
		if (butler.showScore === true) {
			loader_switchMode('score');
		} else {
			loader_switchMode('login');
		}
	} else {
		state.onQueueFlushed = core_nextTest;
		loader.waitDialog.show('core');
	}
}

function core_buttonAction(action, data = {}) {
	let cmd;
	const matches = action.match(/(\w+)(?:\((.*)\))?;?/);
	cmd = matches[1];
	switch (cmd) {
		case 'endTest':
			core_sendBehaviour("endTest");
			workers.queue.postMessage({type: 'flushQueue', options: {leaveAccessible: false}});
			if (test.lastTestForLogin) {
				core_finishTest();
			} else {
				if (!butler.saveResults) {
					state.skipTest = test.id;
				}
				core_nextTest();
			}
			break;
		case 'gotoLogin':
			core_sendBehaviour("leaveTest", {destination: 'login'});
			workers.queue.postMessage({type: 'flushQueue', options: {leaveAccessible: true}});
			core_closeTest();
			break;
		case 'nextPage':
			core_nextItem(data.force ?? false);
			break;
		case 'previousPage':
			core_previousItem(data.force ?? false);
			break;
		case 'openConceptMap':
			openExternalEditor({
				url: "apps/conceptmaps/",
				updateCallback: (documentData) => data.updateCallback(documentData),
				getData: data.document,
				question: core_prepareContentForExternalEditor(data.question)
			});
			break;
		case 'switchLanguage':
			core_switchLanguage(data.language);
			break;
		case 'showLegalText':
			core_showPrivacyPolicy();
			break;
		default:
			console.warn("Unkown button action: " + action);
	}
}

function core_launchItemTimer() {
	//if the test already has a global timer, we skip this. 2 timers may not run in parallel.
	if (butler.useTimer) {
		return;
	}
	const itemTimeOut = fetchFromObjPath(test, ['items', state.currentItemId, 'options', 'timer', 0, 'timeOut']);
	let itemTimerId = fetchFromObjPath(test, ['items', state.currentItemId, 'options', 'timer', 0, 'id']);
	if (!itemTimerId) itemTimerId = 'default';

	/*
		if there is already a timer running
		and that it is either of a different id than the current one
		or if current id=='default'
		then we stop the running timer before creating the new one
	 */
	if (itemTimer.active === true && (itemTimerId !== itemTimer.settings.id || itemTimerId === 'default')) {
		workers.timer.postMessage({type: 'interruptTimer'});
		if (typeof (skin_hideTimer) === 'function') {
			skin_hideTimer();
		}
		window.itemTimer = {
			settings: {}
		};
		itemTimer.active = false;
	}

	//if current item has no timer we can stop here
	if (!itemTimeOut) {
		return;
	}

	//if there is no running timer at this point we can start the new one
	if (itemTimer.active !== true) {
		itemTimer.settings = {
			timeLimit: itemTimeOut,
			onTimeUp: 'next',
			id: itemTimerId
		};
		if (itemTimerId !== 'default') {
			const targetItem = core_getStartOfNextBlock('timer', itemTimerId);
			if (targetItem === false) {
				itemTimer.settings.onTimeUp = 'endTest';
			} else {
				itemTimer.settings.onTimeUp = 'gotoItem';
				itemTimer.settings.onTimeUpTarget = targetItem;
			}
		}
		itemTimer.active = true;
		const timerData = cloneObj(itemTimer.settings);
		timerData.type = 'initItemTimer';
		workers.timer.postMessage(timerData);
	}
}

function core_itemTimeUp() {
	// console.log('core_itemTimeup');
	switch (itemTimer.settings.onTimeUp) {
		case 'next':
			core_nextItem(true);
			break;
		case 'endTest':
			core_timeUp();
			break;
		case 'gotoItem':
			core_gotoItem(itemTimer.settings.onTimeUpTarget, true);
	}
	if (typeof (skin_hideTimer) === 'function') {
		skin_hideTimer();
	}
}

function core_getStartOfNextBlock(definer, id) {
	if (definer === 'timer') {
		/*
			this iterates through all items to find one with a new itemTimer id or no item timer at all
		 */
		let n = state.currentItem + 1;
		let itemId = core_getItemId(n);
		while (itemId !== false) {
			const timerId = fetchFromObjPath(test, ['items', itemId, 'options', 'timer', 0, 'id']);
			if (timerId !== id) return n;
			itemId = core_getItemId(++n);
		}
		return false;
	}
}

//sends back the id of an item, given its place in the structure
function core_getItemId(n) {
	if (!n && n !== 0) {
		n = state.currentItem;
	}
	if (typeof (test.structure.items[n]) === 'undefined') return false;
	return (test.structure.items[n].hiddenID || false);
}

//looks for an item with a specific itemCode and send back its database id
function core_lookupItemCode(code) {
	for (let id in test.items) {
		if (test.items[id].itemCode.toLowerCase() === code.toLowerCase()) return parseInt(id);
	}
	return false;
}

//looks up an item database id in the structure and sends back the position of the first occurence in the structure
function core_getItemNumber(id) {
	for (let i in test.structure.items) {
		if (test.structure.items[i].hiddenID === id) return parseInt(i);
	}
	return false;
}

//looks up an item database id in the structure and sends back the position of the first occurence in the structure
function core_getItemNumberForLink(id) {
	for (let i in test.structure.items) {
		if (test.items[test.structure.items[i].hiddenID].link === id) return parseInt(i);
	}
	return false;
}

function core_toggleItemCodes() {
	let itemCode, stimulusCode;
	itemCode = fetchFromObjPath(state, ['question', 'itemCode']);
	stimulusCode = fetchFromObjPath(state, ['stimulus', 'itemCode']);
	const message = `<div style="user-select: text; -moz-user-select: text; -webkit-user-select: text; -ms-user-select: text;"><b>item code:</b> ${itemCode}<br><b>stimulus code:</b> ${stimulusCode}</div>`;
	global_showMessage(message, 'Item information');
}

function core_sendBehaviour(subType, data = null) {
	if (typeof (subType) !== 'string') return;
	const event = {
		itemId: state.currentItemId,
		type: 'behaviour',
		language: state.language,
		timestamp: core_getTimestamp(),
		timeLeft: core_getTimeLeft(),
		subType: subType
	};
	if (data) {
		event.data = JSON.stringify(data);
	}
	core_userEvent(event);
}

function core_resetItem(itemId, fields) {
	core_sendBehaviour('resetItem', {targetItemId: itemId});
	if (fields === false) {
		fields = Object.keys(answers[itemId]);
	}
	for (let i in fields) {
		const field = fields[i];
		delete answers[itemId][field];
	}
	if (typeof (skin_setItemButtonStatus) === 'function') {
		skin_setItemButtonStatus(core_getItemNumber(itemId), !test.itemRequirements[itemId]);
	}
}

function core_popupMessage(id, message, title = null) {
	if (popups[id] === true) {
		return;
	}
	let dialogData = {
		buttons: [
			{label: global_getText('test', 'returnButton'), 'default': true, cancel: true, value: 'ok'}
		],
		returnPromise: true,
		contents: message,
		title: title,
		width: 1000
	};

	popups[id] = true;
	core_showDialog('popup', dialogData).then(
		() => {
			delete popups[id]
		}
	);
}

function core_checkMetaData(key) {
	return (typeof (test.metadata[key]) !== 'undefined');
}

function core_getMetaData(key, localized = false) {
	if (core_checkMetaData(key)) {
		if (localized === true) {
			return test.metadata[key]?.[state.language] ?? test.metadata[key]?.[state.fallbackLanguage] ?? null;
		} else {
			return test.metadata[key] ?? null;
		}
	} else {
		return null;
	}
}

function core_privacyPolicyExists() {
	return test.skin.skinOptions?.privacyPolicy === true;
}

function core_showPrivacyPolicy() {
	let message = core_getMetaData('privacy_policy', true);
	if (message === null || message === '') {
		message = global_getText('test', 'noPrivacyPolicy');
	}
	message = message.replace(/\[@\s*OASYSROOT\s*@\]/g, settings.rootURL);
	let customCSS = core_getMetaData('privacy_policy')?.customCSS;
	if (typeof (customCSS) === 'string' && customCSS.trim() !== '') {
		customCSS = customCSS.replace(/\bbody\b/g, '#privacyPolicyContent');
		message = `<style>${customCSS}</style><div id="privacyPolicyContent">${message}</div>`;
	}
	core_popupMessage('privacyPolicy', message, global_getText('test', 'privacyPolicyTitle'));
}

function core_updateMediaProgress(id, progress) {
	if (typeof (progress.code) !== 'string' || typeof (progress.time) !== 'number' || typeof (id) !== 'number') {
		console.error('core_updateMediaProgress: invalid progress object');
		return;
	}
	if (typeof (state.mediaProgress?.[id]?.[progress.code]) === 'undefined') {
		initObj(state, ['mediaProgress', id, progress.code], progress.time);
	} else {
		state.mediaProgress[id][progress.code] = progress.time;
	}
	if (typeof (workers.queue) !== 'undefined') {
		workers.queue.postMessage({type: 'updateMediaProgress', mediaProgress: state.mediaProgress});
	} else {
		console.error('core_updateMediaProgress: queue worker not available');
	}
}

function core_getMediaProgress(id, code) {
	if (typeof (id) !== 'number' || typeof (code) !== 'string') {
		console.error('core_getMediaProgress: invalid parameters');
		return 0;
	}
	if (typeof (state.mediaProgress?.[id]?.[code]) === 'undefined') {
		return 0;
	} else {
		return state.mediaProgress[id][code];
	}
}

function core_clearMediaProgress(id, code) {
	if (typeof (state.mediaProgress?.[id]?.[code]) !== 'undefined') {
		delete state.mediaProgress[id][code];
		if (objectLength(state.mediaProgress[id]) === 0) {
			delete state.mediaProgress[id];
		}
		if (objectLength(state.mediaProgress) === 0) {
			delete state.mediaProgress;
		}
	}
}

async function core_showDialog(id, dialogData) {
	return new nxDialog(id, dialogData);
}

/***** external editor support *****/

function core_prepareContentForExternalEditor(html) {
	return html.replace(/fetchMediaFile\.php/g, settings.rootURL + "fetchMediaFile.php");
}

function openExternalEditor(editorSettings) {
	globalVariables.externalEditorSettings = editorSettings;
	let frame = $('#externalEditor');
	frame.on('load', function (e) {
		if (e.target.src !== '') {
			frame.off('load');
			if (typeof (frame.get(0).contentWindow.OASYSCOM) !== 'undefined') {
				frame.removeClass('hidden');
				/* Firefox applies the back button to the contents of the iFrame, causing it to become empty while still
				*  overlaying the OASYS editor and swallowing all pointer events. Therefore we are listening here to
				*  the pagehide event (unload works too, but is deprecated) to enable OASYS to hide the iFrame if the
				*  user chooses to click "back" while the external editor is open. */
				$(frame.get(0).contentWindow).on('pagehide', function () {
					setTimeout(closeExternalEditor, 250);
				});

			} else {
				//if the loaded page does not contain the OASYSCOM object, it is not compatible with OASYS
				frame.removeAttr('src');
				global_showMessage(global_getText('test', 'editorNotFound'));
			}
		}
	});
	frame.attr('src', editorSettings.url);
}


function getExternalData() {
	return globalVariables.externalEditorSettings.getData.call(this) ?? null;
}

function getExternalQuestion() {
	return globalVariables.externalEditorSettings.question ?? '';
}

function getExternalContext() {
	return 'assessment';
}

function getExternalLanguage() {
	return state.fallbackLanguage ?? "EN";
}

function setExternalData(data) {
	if (typeof (globalVariables.externalEditorSettings.updateCallback) === "function") {
		globalVariables.externalEditorSettings.updateCallback.call(this, data);
	}
}

function closeExternalEditor() {
	let frame = $('#externalEditor');
	let win = frame.get(0).contentWindow;
	$(win).off('pagehide');
	win.postMessage('forceClose', window.location.origin);
	frame.addClass('hidden');

	// Delayed removal of src attribute
	setTimeout(function () {
		frame.removeAttr('src');
		globalVariables.externalEditorSettings = {};
	}, 500);
}
