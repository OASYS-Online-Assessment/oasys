"use strict";

/*
 *
 *  optional functions every skin may implement as needed
 *
 */

function skin_init() {
	debug_log("skin", `skin_init()`);

	skin.options = {};

	/* create buttons */
	skin.buttons = {
		languages: {},
		items: {}
	};

	skin.options.fontToggle = !!test.skin.skinOptions.dyslexicFont?.value;
	if (skin.options.fontToggle) {
		let buttonData = {
			theme: 'topButton',
			label: global_getText('test', 'dyslexic'),
			disabled: false,
			callback: skin_dysLexicFont,
		};
		skin.buttons.dysLexic = new nxButton($('#fontswitch'), 'dysLexicButton', buttonData);
		$('#dysLexicButton').addClass("dyslexic");
	}

	skin.timerVisible = false;
	skin.questionVisibleBorderHeight = 11 + 50; //11 is the height of the upper handle part, the rest is a safe zone

	skin.customCSS = {
		jsMC: 'oasys',	//theme name to be used by jsMultipleChoice widget
		jsDL: 'default'	//theme name to be used by jsDropList widget
	};

	let buttonData = {
		theme: 'navigation',
		label: global_getText('test', 'previous'),
		symbol: 'icon-arrow-left',
		iconHeight: 15,
		iconWidth: 15,
		disabled: true,
		callback: skin_previousItem
	};
	skin.buttons.left = new nxButton($('#navigationBack'), 'leftButton', buttonData);

	buttonData = {
		theme: 'navigation',
		label: global_getText('test', 'next'),
		symbol: 'icon-arrow-right',
		iconPosition: 'right',
		iconHeight: 15,
		iconWidth: 15,
		disabled: true,
		callback: skin_nextItem
	};
	skin.buttons.right = new nxButton($('#navigationNext'), 'rightButton', buttonData);

	skin.options.showItemBar = false;
	skin.options.showLabelBar = false;
	skin.options.showTimer = true;
	skin.contentWrapper = $('#contentWrapper');
	skin.itemBar = $('#itemBar');
	skin.itemButtonStrip = $('#itemButtonStrip');

	skin.vpHeight = $(window).height();
	skin.timerResyncing = false;

	$('#timerHoursLabel').html(global_getText('test', 'hours'));
	$('#timerMinutesLabel').html(global_getText('test', 'minutes'));
	$('#timerSecondsLabel').html(global_getText('test', 'seconds'));

	pointerHandler.listen($('#questionHandle'), {
		callbacks: {
			down: skin_handlePointerDown,
			move: skin_handlePointerMove,
			up: skin_handlePointerUp
		}
	});

	skin.questionDiv = $('<div id="innerQuestion"></div>');
	skin.mainDiv = $('#main');

	$(window).on('resize', skin_windowResize);

	if (core_privacyPolicyExists()) {
		$('#privacyPolicy').show();
		pointerHandler.listen($('#privacyPolicy'), {
			callbacks: {
				click: function () {
					core_showPrivacyPolicy();
				}
			}
		});
	}
}

function skin_createItemButtons(count) {
	debug_log("skin", `skin_createItemButtons(${count})`);
	for (let i = 0; i < count; i++) {
		skin_createItemButton(i, core_getItemLabel(i));
	}
}

function skin_createLanguageMenu(options, activeLang) {
	debug_log("skin", `skin_createLanguageMenu(options, '${activeLang}')`);
	const elements = [];
	for (let i in options) {
		const code = options[i];
		const entry = {value: code};
		entry.label = languages[code].name;
		elements.push(entry);
	}
	const dropListOptions = {
		elements: elements,
		order: 'label',
		theme: 'languageSelector',
		initialValue: activeLang,
		dataId: 'languageCode',
		readOnly: false,
		onChange: skin_switchLanguage,
		width: '180px'
	};

	skin.languageDropList = new jsDropList('languages', 'languageSelector', dropListOptions);

	/* droplist for mobile */
	const elementsM = [];
	for (let i in options) {
		const code = options[i];
		const entry = {value: code};
		entry.label = code;
		elementsM.push(entry);
	}
	const dropListOptionsM = {
		elements: elementsM,
		order: 'label',
		theme: 'languageSelector',
		initialValue: activeLang,
		dataId: 'languageCodeM',
		readOnly: false,
		onChange: skin_switchLanguage,
		width: '60px'
	};

	skin.languageDropListM = new jsDropList('languages', 'languageSelectorM', dropListOptionsM);

}

function skin_createItemButton(itemNumber, data) {
	debug_log("skin", `skin_createItemButton(${itemNumber}, ${data})`);
	const buttonData = {
		theme: data.type + 'Button',
		label: data.label || "?",
		value: itemNumber,
		disabled: true,
		callback: skin_gotoItem
	};
	skin.buttons.items[itemNumber] = new nxButton($('#itemButtonStrip'), 'item_' + itemNumber, buttonData);
}

function skin_setItemButtonLabel(itemNumber, label) {
	debug_log("skin", `skin_setItemButtonLabel(${itemNumber}, '${label}')`);
	skin.buttons.items[itemNumber].setLabel(label);
}

function skin_selectItemButton(itemNumber) {
	debug_log("skin", `skin_selectItemButton(${itemNumber})`);
	skin.buttons.items[state.previousItem].buttonSelected(false);
	skin.buttons.items[itemNumber].buttonSelected(true);
	skin_scrollItemBar(itemNumber);
}

function skin_scrollItemBar(itemNumber) {
	debug_log("skin", `skin_scrollItemBar(${itemNumber})`);
	const availableSpace = skin.itemBar.outerWidth();
	const requiredSpace = skin.itemButtonStrip.outerWidth();
	if (availableSpace < requiredSpace) {
		const buttonLeft = Math.round(skin.buttons.items[itemNumber].element.offset().left);
		const buttonRight = buttonLeft + skin.buttons.items[itemNumber].element.outerWidth();
		const stripLeft = skin.itemButtonStrip.offset().left;
		const buttonAbsoluteLeft = buttonLeft - stripLeft;
		const leftLimit = 10;
		const rightLimit = availableSpace - requiredSpace - 10;
		let newX = availableSpace / 2 - (buttonRight - buttonLeft) / 2 - buttonAbsoluteLeft;
		if (newX < rightLimit) {
			newX = rightLimit;
		} else if (newX > leftLimit) {
			newX = leftLimit;
		}
		if (stripLeft !== newX) {
			skin.itemButtonStrip.stop(true, false).animate({"margin-left": newX + "px"}, 300, 'easeInOutBack');
		}
	}
}

function skin_switchItemButtons(enabled) {
	debug_log("skin", `skin_switchItemButtons(${enabled})`);
	for (let i in skin.buttons.items) {
		if (enabled) {
			skin.buttons.items[i].enable();
		} else {
			skin.buttons.items[i].disable();
		}
	}
}

function skin_switchButton(id, enabled) {
	debug_log("skin", `skin_switchButton('${id}', ${enabled})`);
	//id can be either 'left' or 'right'
	if (enabled) {
		skin.buttons[id].enable();
	} else {
		skin.buttons[id].disable();
	}
}

function skin_switchLanguage(senderId, value, dirty, dataId) {
	debug_log("skin", `skin_switchLanguage('${senderId}', '${value}', ${dirty}, '${dataId}')`);
	core_switchLanguage(value);
}

function skin_updateLanguage(language) {
	skin.languageDropList.reset(language);
	skin.languageDropListM.reset(language);
	skin_setLabels();
}

function skin_setLabels() {
	debug_log("skin", `skin_setLabels()`);
	$('#timerHoursLabel').html(global_getText('test', 'hours'));
	$('#timerMinutesLabel').html(global_getText('test', 'minutes'));
	$('#timerSecondsLabel').html(global_getText('test', 'seconds'));
	skin.buttons.left.setLabel(global_getText('test', 'previous'));
	skin.buttons.right.setLabel(global_getText('test', 'next'));
	if (skin.options.fontToggle) {
		if ($("body").hasClass("dyslexic")) {
			skin.buttons.dysLexic.setLabel(global_getText('test', 'dyslexic') + "&nbsp;✓");
		} else {
			skin.buttons.dysLexic.setLabel(global_getText('test', 'dyslexic'));
		}
	}
	if (core_privacyPolicyExists()) {
		$('#privacyPolicy').html(global_getText('test', 'privacyPolicy'));
	}
}

function skin_clearStimulus() {
	debug_log("skin", `skin_clearStimulus()`);
	$('#stimulus').html("");
}

function skin_clearQuestion() {
	debug_log("skin", `skin_clearQuestion()`);
	$('#innerQuestion').html("");
	$('#question').hide()
}

function skin_setStimulus(txt) {
	debug_log("skin", `skin_setStimulus(txt)`);
	$('#stimulus').html(txt);
	skin.mainDiv.get(0).scrollTop = 0;
}

function skin_setQuestion(txt) {
	debug_log("skin", `skin_setQuestion(txt)`);
	skin_clearQuestion();
	skin.questionDiv.html(txt);
	if (txt !== "" && skin.floatingQuestion) {
		$('#question').show();
	}
	if (!skin.floatingQuestion && $('#stimulus').html() === "") {
		skin.mainDiv.get(0).scrollTop = 0;
	}
}

function skin_questionFinishedParsing() {
	debug_log("skin", `skin_questionFinishedParsing()`);
	skin_adjustBottomMargin();
	skin_toggleQuestion(1, true);
	skin_checkQuestionHeight();
}

function skin_checkQuestionHeight() {
	debug_log("skin", `skin_checkQuestionHeight()`);
	if (skin.floatingQuestion === true && skin.questionDiv.html() !== '') {
		//if question becomes too tall to be used in floating mode -> switch to inline
		if (skin.mainDiv.innerHeight() < 200) {
			skin_disableFloatingQuestions();
		}
	} else if (skin.floatingQuestionIfPossible === true && skin.floatingQuestion === false && skin.questionDiv.html() !== '') {
		//if stimulus is tall enough to use the question in floating mode -> switch to floating
		if (skin.mainDiv.innerHeight() - $('#questionInline').outerHeight() >= 200) {
			skin_reenableFloatingQuestions();
		}
	} else {
	}
	core_itemPositionUpdated();
}

function skin_setTimer(timerStatus) {
	if (!skin.timerVisible) skin_showTimer();
	if (skin.timerResyncing === true) {
		$('#timer').css('opacity', 1);
		skin.timerResyncing = false;
	}
	$('#timerHours').html(timerStatus.stringElements.hours);
	$('#timerMinutes').html(timerStatus.stringElements.minutes);
	$('#timerSeconds').html(timerStatus.stringElements.seconds);
}

function skin_setTimerResyncNotification() {
	debug_log("skin", `skin_setTimerResyncNotification()`);
	$('#timer').css('opacity', 0.5);
	skin.timerResyncing = true;
}

function skin_setTitle(txt) {
	debug_log("skin", `skin_setTitle(txt)`);
	$('#navigationTitle').html(txt);
}

function skin_previousItem() {
	debug_log("skin", `skin_previousItem()`);
	core_previousItem();
}

function skin_nextItem() {
	debug_log("skin", `skin_nextItem()`);
	core_nextItem();
}

function skin_gotoItem(n) {
	debug_log("skin", `skin_gotoItem(${n})`);
	core_gotoItem(n);
}

function skin_setItemButtonStatus(n, unfinished) {
	debug_log("skin", `skin_setItemButtonStatus(${n}, ${unfinished})`);
	if (unfinished) {
		skin.buttons.items[n].setClass('unfilledItem');
	} else {
		skin.buttons.items[n].clearClass('unfilledItem');
	}
}

function skin_setOption(option, value) {
	debug_log("skin", `skin_setOption('${option}', '${value}')`);
	if (option === 'floatingQuestions') {
		if (value === true) {
			skin.floatingQuestion = true;
			skin.floatingQuestionIfPossible = true;
			skin.questionDiv.appendTo($('#questionText'));
			$('#questionInline').hide();
			$('#question').show();
			skin_adjustBottomMargin();
			skin_toggleQuestion(1);
			core_itemPositionUpdated();
		} else {
			skin.floatingQuestion = false;
			skin.floatingQuestionIfPossible = false;
			skin.questionDiv.appendTo($('#questionInline'));
			$('#question').hide();
			$('#questionInline').show();
			skin_adjustBottomMargin();
			skin.mainDiv.stop(true, false).css({'bottom': 0});
			core_itemPositionUpdated();
		}
	}
	if (option === 'showPageName') {
		if (value === true) {
			skin.options.showPageLabels = true;
			skin.contentWrapper.addClass("showPageLabels");
		} else {
			skin.options.showPageLabels = false;
			skin.contentWrapper.removeClass("showPageLabels");
		}
	}
	if (option === 'showDetailedNavigation') {
		if (value === true) {
			skin.options.showItemBar = true;
			skin.contentWrapper.addClass("showItemBar");
		} else {
			skin.options.showItemBar = false;
			skin.contentWrapper.removeClass("showItemBar");
		}
	}
	if (option === 'showSimpleNavigation') {
		if (value === true) {
			skin.options.showSimpleNavigation = true;
			skin.contentWrapper.addClass("showSimpleNavigation");
		} else {
			skin.options.showSimpleNavigation = false;
			skin.contentWrapper.removeClass("showSimpleNavigation");
		}
	}
	if (option === 'showTimer') {
		if (value === true) {
			skin.options.showTimer = true;
		} else {
			skin.options.showTimer = false;
		}
	}
}

/*  if floating questions are enabled, even if only one page uses this option as override
	we'll set the class, so that the question gets the same look throughout the whole test */
function skin_enableFloatingQuestions() {
	$('#skinWrapper').addClass('floatingQuestions');
}

function skin_disableFloatingQuestions() {
	debug_log("skin", `skin_disableFloatingQuestions()`);
	if (skin.floatingQuestion !== true) {
		return;
	}
	skin.floatingQuestion = false;
	skin.questionDiv.appendTo($('#questionInline'));
	$('#question').hide();
	$('#questionInline').show();
	skin_adjustBottomMargin();
	skin.mainDiv.stop(true, false).css({'bottom': 0});
	core_itemPositionUpdated();

}

function skin_reenableFloatingQuestions() {
	debug_log("skin", `skin_reenableFloatingQuestions()`);
	if (skin.floatingQuestionIfPossible === false) {
		return;
	}
	skin.floatingQuestion = true;
	skin.questionDiv.appendTo($('#questionText'));
	$('#questionInline').hide();
	$('#question').show();
	skin_adjustBottomMargin();
	skin_toggleQuestion(1);
	core_itemPositionUpdated();
}

function skin_hideTimer() {
	debug_log("skin", `skin_hideTimer()`);
	$('#timer').hide();
	skin.timerVisible = false;
}

//temporarily disable vertical scrolling in order to allow dragging on touch devices
function skin_disableScrolling() {
	debug_log("skin", `skin_disableScrolling()`);
	skin.mainDiv.css("overflow-y", "hidden");
}

function skin_enableScrolling() {
	debug_log("skin", `skin_enableScrolling()`);
	skin.mainDiv.css("overflow-y", "auto");
}

/** private methods **/

function skin_showTimer() {
	debug_log("skin", `skin_showTimer()`);
	if (skin.options.showTimer === false) {
		return; //timer must stay invisible
	}
	$('#timer').show();
	skin.timerVisible = true;
}

function skin_toggleQuestion(state, skipAnimation) {
	debug_log("skin", `skin_toggleQuestion(${state})`);
	if (skin.floatingQuestion === false) {
		return;
	}
	if (typeof (state) === 'undefined') {
		if (skin_getVisiblePercentage() < 0.5) {
			state = 0; //hide question
		} else {
			state = 1; //show question
		}
	}
	let d, y;
	if (state === 1) {
		d = 0;
	} else {
		d = -skin.qHeight + skin.questionVisibleBorderHeight;
	}
	y = skin.qHeight + d;
	if (skipAnimation) {
		skin.mainDiv.stop(true, false).css({'bottom': y + 'px'});
		$('#question').stop(true, false).css({'bottom': d + 'px'});
	} else {
		skin.mainDiv.stop(true, false).animate({'bottom': y + 'px'}, {
			start: function () {
				debug_log('skin', "***** start #main bottom animation (%@) *****", y)
			},
			complete: function () {
				debug_log('skin', `***** completed #main bottom animation*****`);
				core_itemPositionUpdated();
			},
			duration: 300,
			easing: 'easeInOutBack'
		});
		$('#question').stop(true, false).animate({'bottom': d + 'px'}, {
			start: function () {
				debug_log('skin', "***** start #question bottom animation (%@) *****", d)
			},
			complete: function () {
				debug_log('skin', `***** completed #question bottom animation*****`);
				core_itemPositionUpdated();
			},
			duration: 300,
			easing: 'easeInOutBack',
			progress: core_itemPositionUpdated
		});
	}
}

function skin_adjustBottomMargin() {
	debug_log("skin", `skin_adjustBottomMargin()`);
	if (skin.floatingQuestion) {
		skin.qHeight = $('#question').outerHeight();
	} else {
		skin.qHeight = 0;
	}
	debug_log("skin", `skin.qHeight == ${skin.qHeight}`);
}

function skin_windowResize() {
	debug_log("skin", `skin_windowResize()`);
	skin.vpHeight = $(window).height();
	skin_checkQuestionHeight();
	//TODO: send behaviour with size, but only after window size has not changed any more for a few seconds
	/*
	let size = {
		height: skin.vpHeight,
		width: $(window).width()
	}
	*/
}

function skin_getVisiblePercentage() {
	debug_log("skin", `skin_getVisiblePercentage()`);
	const y = parseInt($('#question').css('bottom'));
	return Math.abs(y / skin.qHeight);
}

function skin_handlePointerDown(e) {
	debug_log("skin", `skin_handlePointerDown(e)`);
	skin.handleClicked = true;
	skin.dragging = {
		x0: jsPointerHandler.x,
		y0: jsPointerHandler.y,
		b0: parseInt($('#question').css('bottom'))
	};
	e.stopImmediatePropagation();
	e.preventDefault();
}

function skin_handlePointerMove(e) {
	debug_log("skin", "skin_handlePointerMove(e)");
	//if handle has been dragged more than 3 pixels we will recognize it as dragging and not active the toggle feature
	if (skin.handleClicked && Math.abs(skin.dragging.y0 - e.y) > 3) skin.handleClicked = false;
	let d, y;
	d = skin.dragging.b0 + skin.dragging.y0 - e.y;
	if (-d > skin.qHeight - skin.questionVisibleBorderHeight) d = -skin.qHeight + skin.questionVisibleBorderHeight; //handle must not be moved farther down than lowest limit of handle (possible when clicking in the center and moving all the way to the lower end of the screen)
	if (d > 0) d = 0; //if mouse is moved too fast upwards (not triggering intermittent values) the handle must still be moved to maximum height
	y = skin.qHeight + d;
	skin.mainDiv.css({'bottom': y + 'px'});
	$('#question').css({'bottom': d + 'px'});
	core_itemPositionUpdated()
}

function skin_handlePointerUp(e) {
	debug_log("skin", "skin_handlePointerUp(e)");
	delete skin.dragging;
	if (skin.handleClicked === true) {
		skin_toggleQuestion();
	}
	delete skin.handleClicked;
	core_itemPositionUpdated()
}

function skin_dysLexicFont() {
	if ($("body").hasClass("dyslexic")) {
		$("body").removeClass("dyslexic");
		skin.buttons.dysLexic.setLabel(global_getText('test', 'dyslexic'));
	} else {
		$("body").addClass("dyslexic");
		skin.buttons.dysLexic.setLabel(global_getText('test', 'dyslexic') + "&nbsp;✓");
	}
}

function skin_getMainDiv() {
	return skin.mainDiv;
}

/* hook for updating position of question elements */

