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
	html = score_replaceOasysRoot(html);

	const $contentWrapper = $('#contentWrapper');
	const $scoreScreenContent = $('<div>', {
		id: 'scoreScreenContent'
	});
	const $scoreScreenPage = $('<div>', {
		id: 'scoreScreenPage'
	}).html(html);
	$scoreScreenContent.append($scoreScreenPage);
	$contentWrapper.empty().append($scoreScreenContent);
	score_applyCustomCSS($contentWrapper);
	score_applyConditions($scoreScreenPage[0], data);

	//find span with class button-variable, read action and label, then add nxButton accordingly
	let buttonCounter = 0;
	$scoreScreenPage.find('.button-variable').each(function (idx, el) {
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

function score_replaceOasysRoot(value) {
	if (typeof (value) !== 'string') {
		return value;
	}

	return value.replace(/\[@\s*OASYSROOT\s*@](\/)?/g, function (match, pathSeparator) {
		if (pathSeparator && !settings.rootURL.endsWith('/')) {
			return settings.rootURL + '/';
		}

		return settings.rootURL;
	});
}

function score_applyCustomCSS($contentWrapper) {
	let customCSS = test?.metadata?.score_screen?.customCSS;
	if (typeof (customCSS) !== 'string' || customCSS.trim() === '') {
		return;
	}

	customCSS = score_replaceOasysRoot(customCSS);
	$('<style>', {
		id: 'scoreScreenCustomCSS',
		text: customCSS
	}).appendTo($contentWrapper);
}

function score_evaluateCondition(actual, operator, expected, maximum) {
	switch (operator) {
		case '<':
			return actual < expected;
		case '<=':
			return actual <= expected;
		case '>':
			return actual > expected;
		case '>=':
			return actual >= expected;
		case '=':
			return actual === expected;
		case 'between':
			return Number.isFinite(maximum) && actual > expected && actual < maximum;
		case 'betweenInclusive':
			return Number.isFinite(maximum) && actual >= expected && actual <= maximum;
		case 'betweenUpperInclusive':
			return Number.isFinite(maximum) && actual > expected && actual <= maximum;
		case 'betweenLowerInclusive':
			return Number.isFinite(maximum) && actual >= expected && actual < maximum;
		default:
			return false;
	}
}

function score_applyConditions(contentWrapper, data) {
	if (!contentWrapper) {
		return;
	}

	const metrics = {
		percentage: Number(data.percentage),
		points: Number(data.score)
	};

	contentWrapper.querySelectorAll('.score-conditional-block').forEach(function (block) {
		const metric = block.getAttribute('data-condition-metric');
		const operator = block.getAttribute('data-condition-operator');
		const rawExpected = block.getAttribute('data-condition-value');
		const expected = Number(rawExpected);
		const rawMaximum = block.getAttribute('data-condition-max-value');
		const maximum = rawMaximum === null || rawMaximum.trim() === '' ? NaN : Number(rawMaximum);
		const actual = metrics[metric];
		const isVisible = typeof (rawExpected) === 'string' &&
			rawExpected.trim() !== '' &&
			Number.isFinite(actual) &&
			Number.isFinite(expected) &&
			score_evaluateCondition(actual, operator, expected, maximum);

		block.classList.toggle('score-conditional-visible', isVisible);
	});
}

function score_returnToLogin() {
	global_finishTest();
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
