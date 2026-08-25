let testItemInstances = [];

function dashboard_init() {
	hiddenForm('loginForm', 'post', 'index.php', 'studentLoginFrame', ['login', 'password', 'language', 'framed']);

	//setup in the beginning (e.g. onload or onready)
	$.ajaxSetup({
		type: "POST",
		cache: false,
		dataType: "json",
		timeout: 300000,
		url: "ttDashboardActions.php"
	});

	window.timeoutHandle = setTimeout(dashboard_fetchStudentLoginTests, settings.sendFrequency * 1000);

	//Setup page, with name in the header and create the lists
	const stName = window.student.displayName ? window.student.displayName : window.student.login.name;
	const stTests = window.student.tests;
	const headerButtons = $('#headerButtons');
	$('#headerText').html(global_getText('dashboard', 'loggedInAs') + `:  <b>${stName}</b>`);
	let buttonData = {
		label: global_getText('dashboard', 'logoutButton'),
		callback: () => dashboard_logout()
	};
	new nxButton(headerButtons, 'logoutButton', buttonData);

	$('#welcomeText').text(global_getText('dashboard', 'welcomeMessage'));
	$('#currentTestslistTitle').text(global_getText('dashboard', 'currentTestsTitle'));
	$('#pastTestslistTitle').text(global_getText('dashboard', 'pastTestsTitle'));
	$('.testItemTitleRight').text(global_getText('dashboard', 'filled'));
	$('.noTestAvailablePlaceholder').text(global_getText('dashboard', 'noTestsAvailable'));

	for (let test of stTests) {
		testItemInstances[test.uniqueId] = new DashboardTestItem(test, dashboard_click);
	}

}

function dashboard_click(testData) {
	if(testData.available === false) {
		global_showMessage(global_getText('dashboard', 'testNotAvailable'));
		return;
	}
	const pForm = document.forms['loginForm'];
	pForm.login.value = testee.login;
	pForm.password.value = testData.password;
	pForm.language.value = testee.language || defaults.language;
	pForm.framed.value = 1;
	pForm.submit();
	$('#studentLoginFrame').removeClass('hidden');
	clearTimeout(window.timeoutHandle); //no need to keep refreshing the list while iFrame is open
}

function dashboard_hideLoginFrame() {
	const frame = document.getElementById('studentLoginFrame');
	if (frame) {
		frame.classList.add('hidden');
	}
	clearTimeout(window.timeoutHandle);
	dashboard_fetchStudentLoginTests();
}

function dashboard_logout() {
	global_forgetStudentState();
	global_returnToLogin();
}

function dashboard_fetchStudentLoginTests() {
	rixToolsDebug(1, `dashboard_fetchStudentLoginTests()`);
	startAjax('fetchStudentLoginTests', {});
}

/***** server communication *****/

function startAjax(action, data) {
	rixToolsDebug(1, `startAjax("${action}", data)`);
	const params = {
		action: action,
		data: JSON.stringify(data),
		serialNumber: serialNumber
	};
	$.ajax({
		data: params
	}).done(res => ajaxSuccess(res)).fail((jqXHR, textStatus, errorThrown) => ajaxError(jqXHR, textStatus, errorThrown));
}

function ajaxError(jqXHR, textStatus, errorThrown) {
	rixToolsDebug(1, `ajaxError(jqXHR, textStatus, errorThrown)`);
	let dialogData = {
		buttons: [{
			label: 'OK',
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: jqXHR?.responseJSON?.fatalError ?? 'no error details given',
		title: 'Error: ' + errorThrown,
		width: 500
	};
	new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
	rixToolsDebug(1, `ajaxSuccess(res)`);
	//if there was a fatal PHP error that prevented the script from finishing show that error
	//this data is created in PHP via the register_shutdown_function
	let dialogData;
	if (res.fatalError) {
		dialogData = {
			buttons: [{
				label: 'Ok',
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: '<strong>action not completed</strong><br />' + res.fatalError,
			title: "Error",
			icon: "images/error.png",
			iconWidth: 64,
			width: 500
		};
		new nxDialog('fatalError', dialogData);
		return;
	}
	//if a normal error occured in PHP that did not prevent the script from finishing, show it
	if (res.error !== false) {
		dialogData = {
			buttons: [{
				label: 'Ok',
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: '<strong>action not completed</strong><br />' + res.error,
			title: "Error",
			icon: "images/error.png",
			iconWidth: 64,
			width: 700
		};
		new nxDialog('error', dialogData);
		return;
	}
	if (res.warnings) {
		for (let i in res.warnings) {
			showMessage(res.warnings[i]);
		}
	}

	switch (res.action) {
		case 'fetchStudentLoginTests':
			window.timeoutHandle = setTimeout(dashboard_fetchStudentLoginTests, settings.sendFrequency * 1000);
			//iterate testItemInstances and clear those that are not in the response
			for (let uniqueId in testItemInstances) {
				let testData = fetchObjectFromArray(res.data.tests, {'uniqueId': uniqueId}, false);
				if (testData === false) {
					//test is not in the response, remove it from the list
					testItemInstances[uniqueId].remove();
					delete testItemInstances[uniqueId];
				}
			}
			//iterate response and create new test items if they are not already there and update existing ones
			for (let testData of res.data.tests) {
				if (testItemInstances[testData.uniqueId]) {
					//test item already exists, update it
					testItemInstances[testData.uniqueId].update(testData);
				} else {
					//test item does not exist, create it
					testItemInstances[testData.uniqueId] = new DashboardTestItem(testData, dashboard_click);
				}
			}
			break;

		default:
			break;
	}
}
