"use strict";

function login_init() {
	debug_log("login", `login_init()`);
	//noinspection JSDeprecatedSymbols
	$('#ed_login').focus();
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

	if (typeof (loginPage.menuLanguages[testee.language]) === 'undefined') testee.language = getKey(loginPage.menuLanguages, 0);

	if (typeof (testee.login) === 'undefined' && parameters.login) {
		testee.login = parameters.login;
		$('#tfLogin').val(testee.login);
	}

	if (typeof (testee.password) === 'undefined' && parameters.password) {
		testee.password = parameters.password;
		$('#tfPassword').val(testee.password);
	} else if (settings.defaultPassword !== '') {
		testee.password = settings.defaultPassword;
		$('#tfPassword').val(testee.password).attr('type', 'hidden');
		$('#lbl_password').hide();
	}

	// prevent odd behaviour on touch devices when virtual keyboard is hidden on attempt to press "Start" button
	$('#tfLogin, #tfPassword').on('pointerup', null, function (e) {
		e.preventDefault();
		e.stopImmediatePropagation();
	});

	if ((testee.login && testee.password) || parameters.action === 'preview') {
		//if no login or password is provided, but the action is set to preview we will have to create a test structure from the groupId
		login_submit(true);
	} else {
		login_buildForm();
	}
}

function login_buildForm() {
	debug_log("login", `login_buildForm()`);

	if (loginPage.submitButton) return;

	/*
		If login and password are given as parameter, the login form will never be made visible
		as it would merely flash for a second only to disappear again.
		If login & password are not given *both*, however, we need the form so we have to make it
		visible here.
	 */
	$('#login_main').css('visibility', 'visible');

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

	loginPage.languageButtons = {};

	if (objectLength(loginPage.menuLanguages) > 1) {
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

	login_onTfInput();
	$('#tfLogin, #tfPassword').on('input', login_onTfInput);

	login_languageSelected(testee.language);
}

function login_onTfInput(e) {
	debug_log("login", `login_onTfInput(e)`);
	if ($('#tfLogin').val() !== "" && $('#tfPassword').val() !== "") {
		loginPage.submitButton.enable();
	} else {
		loginPage.submitButton.disable();
	}
}

function login_returnPressed(e) {
	debug_log("login", `login_returnPressed(e)`);
	if (e.target.id === 'tfLogin') {
		if (settings.defaultPassword !== '') {
			if ($('#tfLogin').val() !== "" && $('#tfPassword').val() !== "") {
				login_submit();
			}
		} else {
			//noinspection JSDeprecatedSymbols
			$('#tfPassword').focus();
		}
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
	$('.localisation').each(function (idx, element) {
		element = $(element);
		element.html(global_getText('login', element.attr('data-localisationid')));
	});
	loginPage.submitButton.setLabel(global_getText('login', 'start'));
}

function login_submit(automatedLogin) {
	debug_log("login", `login_submit(${automatedLogin})`);
	loader_registerAjaxHandler('login', "login.php", true, false, login_ajaxSuccess);
	if (!automatedLogin) {
		testee.login = $('#tfLogin').val();
		testee.password = $('#tfPassword').val();
	}
	testee.login = $.trim(testee.login);
	testee.password = $.trim(testee.password);
	testee.parentSerialNumber = window.parent.testee.serialNumber !== testee.serialNumber ? window.parent.testee.serialNumber : null;
	const loginDetails = {
		login: testee.login,
		password: testee.password,
		serialNumber: testee.serialNumber,
		parentSerialNumber: testee.parentSerialNumber,
		tsClient: new Date().getTime() / 1000,
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
		case 'preview':
		case 'login':
			const data = res.data;
			if (data.loginError) {
				$('#login_main').css('visibility', 'visible');
				let callback = () => login_buildForm();
				if (typeof (parameters.framed) !== "undefined" || parameters.framed === 1) {
					callback = () => global_returnToParent();
				}
				const msg = global_getText('login', data.loginError);
				global_errorDialog(msg, null, callback);
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
				loader_switchMode('dashboard');
			}
			break;

		default:
			throw new Error("AJAX returned unkown action: " + res.action);
	}
}