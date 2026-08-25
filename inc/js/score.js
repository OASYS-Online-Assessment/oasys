"use strict";

function score_init() {
	loader_registerEvent(window, 'beforeunload', global_cleanState, true);
	loader_registerAjaxHandler('score', "score.php", true, false, score_ajaxSuccess);
	const data = {
		serialNumber: window.serialNumber,
		saveResults: butler.saveResults
	};
	if (!butler.saveResults) {
		data.answers = answers;
	}
	loader_startAjax('score', 'fetchScore', data);
}

function buildScreen(data) {
	const fallbackHTML = `<h1 style="text-align: center;"><strong>@@score@@</strong></h1><h1 style="text-align: center;"><strong><span class="non-editable-variable" contenteditable="false">[@ SCORED @]</span> / <span class="non-editable-variable" contenteditable="false">[@ TOTAL @]</span> <br></strong></h1><p style="text-align: center;"><strong><span class="non-editable-variable button-variable" contenteditable="false" data-action="close" data-label="@@closeTest@@"></span></strong></p>`;
	let html;
	if (typeof(test?.metadata?.score_screen?.[state.language]) !== 'undefined') {
		html = test?.metadata?.score_screen?.[state.language];
	} else if (typeof(test?.metadata?.score_screen?.[state.fallbackLanguage]) !== 'undefined') {
		html = test?.metadata?.score_screen?.[state.fallbackLanguage];
	} else {
		html = fallbackHTML;
	}
	html = html.replace(/@@percentage@@/g, capitalizeFirstLetter(global_getText('score', 'percentage')));
	html = html.replace(/@@score@@/g, capitalizeFirstLetter(global_getText('score', 'score')));
	html = html.replace(/\[@ PERCENTAGE @]/g, data.percentage + '%');
	html = html.replace(/\[@ SCORED @]/g, data.score);
	html = html.replace(/\[@ TOTAL @]/g, data.maxScore);
	html = html.replace(/@@closeTest@@/g, global_getText('score', 'closeTest'));
	$('#contentWrapper').html(html);

	//find span with class button-variable, read action and label, then add nxButton accordingly
	let buttonCounter = 0;
	$('.button-variable').each(function (idx, el) {
		$(el).html("");
		const action = $(this).data('action');
		const label = $(this).data('label');
		let buttonData = {
			label: label
		};
		if (action === 'close') {
			if (test.lastTestForLogin) {
				buttonData.callback = score_returnToLogin;
			} else {
				buttonData.callback = score_proceed;
			}
		} else if (action === 'open_url') {
			const url = $(this).data('url');
			buttonData.callback = function () {
				window.location = url;
			}
		}
		new nxButton($(el), 'button_' + (buttonCounter++), buttonData);
	});
}

function score_returnToLogin() {
	global_returnToLogin();
}

function score_proceed() {
	loader_switchMode('login');
}

function capitalizeFirstLetter(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function score_ajaxSuccess(res) {
	switch (res.action) {
		case 'fetchScore':
			buildScreen(res.data);
			break;
		case 'forFutureUse':
			//this may or may not be used further down the line
			break;
		default:
			throw new Error("AJAX returned unkown action: " + res.action);
	}
}