"use strict";

function login_init() {
	debug_log("login", `login_init()`);
	loader_registerEvent(window, 'beforeunload', global_cleanState, true);

	testee.language = defaults.language;
	testee.serialNumber = serialNumber;

	window.loginPage = {};
	loginPage.menuLanguages = {};
	if (!settings['menuLanguages']) {
		loginPage.menuLanguages = window.languages;
	} else {
		for (let i in settings['menuLanguages']) {
			const l = settings['menuLanguages'][i];
			if (typeof (window.languages[l]) !== 'undefined') {
				loginPage.menuLanguages[l] = window.languages[l].name;
			}
		}
	}
	if (login_hasCustomLandingPage()) {
		const customLanguages = {};
		for (const language in loginPage.menuLanguages) {
			if (typeof (customLandingPage.contents[language]) === 'string') {
				customLanguages[language] = window.languages[language].name;
			}
		}
		if (objectLength(customLanguages) === 0) {
			for (const language in customLandingPage.contents) {
				if (typeof (window.languages[language]) !== 'undefined') {
					customLanguages[language] = window.languages[language].name;
				}
			}
		}
		loginPage.menuLanguages = customLanguages;
	}

	if (typeof (loginPage.menuLanguages[testee.language]) === 'undefined') testee.language = getKey(loginPage.menuLanguages, 0);
	if (login_hasCustomLandingPage()) login_renderCustomLandingPage();

	if (typeof (testee.login) === 'undefined' && parameters.login) {
		testee.login = parameters.login;
		$('#tfLogin').val(testee.login);
	}

	if (typeof (testee.password) === 'undefined' && parameters.password) {
		testee.password = parameters.password;
		$('#tfPassword').val(testee.password);
	}
	if (window.restoreStudentState === true) {
		login_restoreStudentState();
		return;
	}
	//noinspection JSDeprecatedSymbols
	$('#tfLogin').focus();

	if ((testee.login && testee.password) || parameters.action === 'preview') {
		//if no login or password is provided, but the action is set to preview we will have to create a test structure from the groupId
		login_submit(true);
	} else {
		login_buildForm();
	}
}

function login_buildForm() {
	debug_log("login", `login_buildForm()`);

	if (loginPage.submitButton || loginPage.formBuilt) return;
	loginPage.formBuilt = true;

	/*
		If login and password are given as parameter, the login form will never be made visible
		as it would merely flash for a second only to disappear again.
		If login & password are not given *both*, however, we need the form so we have to make it
		visible here.
	 */
	$('#login_main').css('visibility', 'visible');

	if (!login_hasCustomLandingPage()) {
		const submitButtonData = {
			label: global_getText('login', 'start'),
			callback: login_submit,
			theme: 'orange',
			disabled: true,
			frameStyle: {
				float: 'right',
				'margin-top': '10px'
			}
		};
		loginPage.submitButton = new nxButton($('#formDiv'), 'submitButton', submitButtonData);
	}

	loginPage.languageButtons = {};

	if (!login_hasCustomLandingPage() && objectLength(loginPage.menuLanguages) > 1 && $('#languageButtons').length > 0) {
		for (let i in loginPage.menuLanguages) {
			const languageButtonData = {
				iconHeight: 64,
				iconWidth: 64,
				callback: login_languageSelected,
				label: i,
				value: i,
				selected: i === testee.language,
				theme: 'language'
			};
			loginPage.languageButtons[i] = new nxButton('languageButtons', i + '_button', languageButtonData);
		}
	}

	if (settings.passwordField === 1) {
		$('#tfPassword').attr('type', 'text');
	}

	if (!login_hasCustomLandingPage()) {
		login_onTfInput();
		$('#tfLogin, #tfPassword').on('input', login_onTfInput);
	}

	if (login_hasCustomLandingPage()) {
		testee.fallbackLanguage = languages[testee.language].fallback;
		for (let i in loginPage.languageButtons) {
			loginPage.languageButtons[i].buttonSelected(i === testee.language);
		}
	} else {
		login_languageSelected(testee.language);
	}
}

function login_onTfInput(e) {
	debug_log("login", `login_onTfInput(e)`);
	if (!loginPage.submitButton) return;
	if ($('#tfLogin').val() !== "" && $('#tfPassword').val() !== "") {
		loginPage.submitButton.enable();
	} else {
		loginPage.submitButton.disable();
	}
}

function login_returnPressed(e) {
	debug_log("login", `login_returnPressed(e)`);
	if (e.target.id === 'tfLogin') {
		//noinspection JSDeprecatedSymbols
		$('#tfPassword').focus();
	} else if (e.target.id === 'tfPassword') {
		if ($('#tfLogin').val() !== "" && $('#tfPassword').val() !== "") {
			login_submit();
		}
	}
}

function login_languageSelected(newLanguage) {
	debug_log("login", `login_languageSelected('${newLanguage}')`);
	testee.language = newLanguage;
	testee.fallbackLanguage = languages[testee.language].fallback;
	for (let i in loginPage.languageButtons) {
		loginPage.languageButtons[i].buttonSelected(i === testee.language);
	}
	if (login_hasCustomLandingPage()) {
		loginPage.formBuilt = false;
		login_renderCustomLandingPage();
		login_buildForm();
	} else {
		$('.localisation').each(function (idx, element) {
			element = $(element);
			element.html(global_getText('login', element.attr('data-localisationid')));
		});
		loginPage.submitButton.setLabel(global_getText('login', 'start'));
	}
}

function login_hasCustomLandingPage() {
	return customLandingPage !== null &&
		typeof (customLandingPage) === 'object' &&
		typeof (customLandingPage.contents) === 'object' &&
		objectLength(customLandingPage.contents) > 0;
}

function login_customLandingContent(language) {
	if (typeof (customLandingPage.contents[language]) === 'string') {
		return customLandingPage.contents[language];
	}
	const fallbackLanguage = window.languages[language]?.fallback;
	if (fallbackLanguage && typeof (customLandingPage.contents[fallbackLanguage]) === 'string') {
		return customLandingPage.contents[fallbackLanguage];
	}
	return customLandingPage.contents[getKey(customLandingPage.contents, 0)] || '';
}

function login_replaceCustomKeyword(content, keyword, replacement) {
	const expression = new RegExp('\\[@\\s*' + keyword + '\\s*@\\]', 'gi');
	return content.replace(expression, replacement);
}

function login_unwrapCustomControl(selector) {
	const $control = $(selector);
	const $wrapper = $control.closest('.non-editable-variable');
	if ($wrapper.length > 0) $wrapper.replaceWith($control);
}

function login_renderCustomLandingPage() {
	let content = login_customLandingContent(testee.language);
	content = login_replaceCustomKeyword(content, 'OASYSROOT', settings.rootURL);
	content = login_replaceCustomKeyword(content, 'LOGIN',
		'<input tabindex="1" id="tfLogin" type="text" name="login" autocomplete="off" autocapitalize="none" spellcheck="false">');
	content = login_replaceCustomKeyword(content, 'PASSWORD',
		'<input tabindex="2" id="tfPassword" type="password" name="password" autocomplete="off" autocapitalize="none" spellcheck="false">');
	content = login_replaceCustomKeyword(content, 'LANGUAGE-CHOOSER', '<select id="languageChooser" aria-label="Language"></select>');

	const loginValue = $('#tfLogin').length > 0 ? $('#tfLogin').val() : testee.login;
	const passwordValue = $('#tfPassword').length > 0 ? $('#tfPassword').val() : testee.password;
	const $loginMain = $('#login_main').empty().html(content);
	login_unwrapCustomControl('#tfLogin');
	login_unwrapCustomControl('#tfPassword');
	login_unwrapCustomControl('#languageChooser');
	if (typeof (loginValue) !== 'undefined') $('#tfLogin').val(loginValue);
	if (typeof (passwordValue) !== 'undefined') $('#tfPassword').val(passwordValue);

	const $languageChooser = $('#languageChooser');
	for (const language in loginPage.menuLanguages) {
		$('<option>', {
			value: language,
			text: loginPage.menuLanguages[language],
			selected: language === testee.language
		}).appendTo($languageChooser);
	}
	$languageChooser.on('change', function () {
		login_languageSelected($(this).val());
	});

	$loginMain.find('[data-label][data-login], [data-label][data-password]').each(function () {
		const $source = $(this);
		const $button = $('<button>', {
			type: 'button',
			'class': $source.attr('class'),
			text: $source.attr('data-label')
		});
		$button.addClass('customLandingStartButton');
		for (const attribute of ['data-label', 'data-login', 'data-password', 'style']) {
			if (typeof ($source.attr(attribute)) !== 'undefined') $button.attr(attribute, $source.attr(attribute));
		}
		$button.on('click', function () {
			const reusableLogin = $button.attr('data-login');
			const reusablePassword = $button.attr('data-password');
			testee.login = typeof (reusableLogin) !== 'undefined' && reusableLogin !== ''
				? reusableLogin
				: ($('#tfLogin').val() ?? '');
			testee.password = typeof (reusablePassword) !== 'undefined' && reusablePassword !== ''
				? reusablePassword
				: ($('#tfPassword').val() ?? '');
			login_submit(true);
		});
		$source.replaceWith($button);
	});

	$('#customLandingPageCSS').remove();
	if (typeof (customLandingPage.customCSS) === 'string' && customLandingPage.customCSS.trim() !== '') {
		const customCSS = login_replaceCustomKeyword(customLandingPage.customCSS, 'OASYSROOT', settings.rootURL);
		$('<style>', {id: 'customLandingPageCSS', text: customCSS}).appendTo('head');
	}
}

function login_cleanup() {
	$('#customLandingPageCSS').remove();
}

function login_submit(automatedLogin) {
	debug_log("login", `login_submit(${automatedLogin})`);
	loader_registerAjaxHandler('login', "login.php", true, false, login_ajaxSuccess);
	if (!automatedLogin) {
		testee.login = $('#tfLogin').val();
		testee.password = $('#tfPassword').val();
	}
	testee.login = $.trim(testee.login ?? '');
	testee.password = $.trim(testee.password ?? '');
	testee.parentSerialNumber = window.parent.testee.serialNumber !== testee.serialNumber ? window.parent.testee.serialNumber : null;
	const loginDetails = {
		login: testee.login,
		password: testee.password,
		serialNumber: testee.serialNumber,
		parentSerialNumber: testee.parentSerialNumber,
		tsClient: new Date().getTime() / 1000,
		language: testee.language,
		variables: parameters.variables || {}
	};
	if (typeof (parameters.data) !== "undefined") {
		for (let i in parameters.data) {
			loginDetails[i] = parameters.data[i];
		}
	}
	if (typeof (parameters.variables) !== "undefined") {
		loginDetails.variables = parameters.variables;
	}
	if (typeof (state.skipTest) !== "undefined") {
		loginDetails.previousTestId = state.skipTest;
	}
	loader_startAjax('login', parameters.action ?? 'login', loginDetails);
}

function login_restoreStudentState() {
	debug_log("login", 'login_restoreStudentState()');
	loader_registerAjaxHandler('login', "login.php", true, false, login_ajaxSuccess);
	loader_startAjax('login', 'restoreStudentLogin', {
		serialNumber: testee.serialNumber,
		tsClient: new Date().getTime() / 1000
	});
}

function login_openEditor() {
	debug_log("login", `login_openEditor()`);
	const editorUrl = settings.rootURL + 'editor';
	window.open(editorUrl, '_blank');
}

function login_ajaxSuccess(res) {
	debug_log("login", `login_ajaxSuccess(res)`);
	if (res.handledExceptions) {
		for (let i in res.handledExceptions) {
			console.error(res.handledExceptions[i].msg);
			for (let j in res.handledExceptions[i].stackTrace)
				console.log(res.handledExceptions[i].stackTrace[j]);
		}
	}
	switch (res.action) {
		case 'restoreStudentLogin':
			if (res.data?.restored !== true) {
				window.restoreStudentState = false;
				global_forgetStudentState();
				login_buildForm();
				break;
			}
			testee.login = res.data.login.name;
			window.student = res.data.student;
			window.student.login = res.data.login;
			if (res.data.language) {
				testee.language = res.data.language;
			}
			res.data.tsClientResponse = new Date().getTime() / 1000;
			timer = {
				settings: {
					tsDelta: Math.round((res.data.tsClientResponse + res.data.tsClient) / 2 - res.data.tsServer),
					tsPrecision: (res.data.tsClientResponse - res.data.tsClient) / 2
				},
				status: {}
			};
			global_rememberStudentState();
			loader_switchMode('dashboard');
			break;

		case 'preview':
		case 'login':
			const data = res.data;
			if (data.loginError) {
				if (data.loginError === 'loginForwarding') {
					hiddenForm('loginForwarding', 'POST', data.forwardUrl, '_self', ['login', 'password']);
					const forwardForm = document.forms['loginForwarding'];
					forwardForm.elements['login'].value = testee.login;
					forwardForm.elements['password'].value = testee.password;
					forwardForm.submit();
				} else {
					$('#login_main').css('visibility', 'visible');
					let callback = () => login_buildForm();
					if (typeof (parameters.framed) !== "undefined" || parameters.framed === 1) {
						callback = () => global_returnToParent();
					}
					let msg = global_getText('login', data.loginError);
					if (data.loginError === 'loginTemporarilyLocked') {
						//replace {lockMinutes} in msg with data.lockMinutes
						msg = msg.replace('{lockMinutes}', data.lockMinutes);
					}
					global_errorDialog(msg, null, callback);
				}
				break;
			}
			data.tsClientResponse = new Date().getTime() / 1000;
			if (res.debug) console.log(res.debug);
			if (res.data.login.studentLogin !== true) {
				/* not a student login, we log straight into the test */
				window.test = data.test;
				test.previewMode = res.data.previewMode || false;
				test.lastTestForLogin = data.lastTest;
				test.login = data.login;
				test.password = data.password;
				testee.login = data.login.name;
				testee.password = data.password.name;
				if (res.data.language) {
					testee.language = res.data.language;
				}
				if (typeof (data?.activity?.metaData) === 'string') {
					data.activity.metaData = JSON.parse(data.activity.metaData);
				}
				test.activity = data.activity || false;
				testee.previousAnswers = data.answers;
				timer = {
					settings: {
						tsDelta: Math.round((data.tsClientResponse + data.tsClient) / 2 - data.tsServer),
						tsPrecision: (data.tsClientResponse - data.tsClient) / 2
					},
					status: {}
				};
				window.skin = {
					path: addTrailingSlash(data.skin)
				};
				debug_log("login", "skin.path: " + skin.path);
				loader_switchMode('test');
			} else {
				/* student login, we need to show the test selection */
				window.student = data.student;
				window.student.login = data.login;
				if (res.data.language) {
					testee.language = res.data.language;
				}
				timer = {
					settings: {
						tsDelta: Math.round((data.tsClientResponse + data.tsClient) / 2 - data.tsServer),
						tsPrecision: (data.tsClientResponse - data.tsClient) / 2
					},
					status: {}
				};
				global_rememberStudentState();
				loader_switchMode('dashboard');
			}
			break;

		default:
			throw new Error("AJAX returned unkown action: " + res.action);
	}
}
