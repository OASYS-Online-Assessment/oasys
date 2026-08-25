"use strict";

function finish_init() {
	const language = state.language || testee.language || defaults.language;
	const fallbackLanguage = window.languages[language]?.fallback;
	let html = finishScreen.contents[language];
	if (typeof (html) !== 'string' && fallbackLanguage) {
		html = finishScreen.contents[fallbackLanguage];
	}
	if (typeof (html) !== 'string') {
		html = finishScreen.contents[getKey(finishScreen.contents, 0)] || '';
	}

	html = finish_replaceOasysRoot(html);
	const $contentWrapper = $('#contentWrapper').empty().html(html);

	if (typeof (finishScreen.customCSS) === 'string' && finishScreen.customCSS.trim() !== '') {
		$('<style>', {
			id: 'finishScreenCustomCSS',
			text: finish_replaceOasysRoot(finishScreen.customCSS)
		}).appendTo($contentWrapper);
	}

	let buttonCounter = 0;
	$contentWrapper.find('.button-variable[data-action]').each(function () {
		const $buttonContainer = $(this).empty();
		const action = $buttonContainer.attr('data-action');
		const url = $buttonContainer.attr('data-url');
		const buttonData = {
			label: $buttonContainer.attr('data-label') || ''
		};
		if (action === 'returnToLogin') {
			buttonData.callback = global_returnToLogin;
		} else if (action === 'open_url' && typeof (url) === 'string' && url !== '') {
			buttonData.callback = function () {
				window.location = url;
			};
		}
		new nxButton($buttonContainer, 'finish_button_' + (buttonCounter++), buttonData);
	});
}

function finish_replaceOasysRoot(value) {
	if (typeof (value) !== 'string') return value;

	return value.replace(/\[@\s*OASYSROOT\s*@](\/)?/g, function (match, pathSeparator) {
		if (pathSeparator && !settings.rootURL.endsWith('/')) return settings.rootURL + '/';
		return settings.rootURL;
	});
}

function finish_cleanup() {
	$('#contentWrapper').empty();
	window.finishScreen = null;
}
