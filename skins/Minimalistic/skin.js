"use strict";

/*
 *
 *  optional functions every skin may implement as needed
 *
 */

function skin_init() {
	debug_log("skin", `skin_init()`);

	skin.options = {};

	skin.customCSS = {
		jsMC: 'oasys',	//theme name to be used by jsMultipleChoice widget
		jsDL: 'default'	//theme name to be used by jsDropList widget
	};

	skin.questionDiv = $('#question');
	skin.mainDiv = $('#main');
}

function skin_clearStimulus() {
	debug_log("skin", `skin_clearStimulus()`);
	$('#stimulus').html("");
}

function skin_clearQuestion() {
	debug_log("skin", `skin_clearQuestion()`);
	skin.questionDiv.html("");
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
	if ($('#stimulus').html() === "") {
		skin.mainDiv.get(0).scrollTop = 0;
	}
}

function skin_questionFinishedParsing() {
	debug_log("skin", `skin_questionFinishedParsing()`);
	core_itemPositionUpdated();
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

function skin_getMainDiv() {
	return skin.mainDiv;
}
