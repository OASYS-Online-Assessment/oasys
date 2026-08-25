"use strict";
const viewManager = {};
const menuButtons = new Map();
let interfaceVersion = 1;
const loginProc = /(.*\/$|.*(index\.php.*))/.test(window.location.href); // avoid certain intensive tasks when we're just logging in
const urlParams = new URLSearchParams(window.location.search);
const initLogin = urlParams.get('initlogin') === "true";

if (initLogin === true) {
	// reset url address to remove initlogin param
	const newUrl = window.location.href.split('?')[0];
	window.history.replaceState(null, '', newUrl); // update the URL in the browser without reloading
}

//initializing GUI ==> creation of main menu & footer & interfaceFrame
function initGUI(skipMenu) {
	interfaceVersion = 2;
	$('body').append("<div id='flexFrame'></div>");
	const flexFrame = $('#flexFrame');
	if (!skipMenu) {
		flexFrame.append("<nav id='mainMenu' class='menu'></nav>");
		flexFrame.append("<div id='interfaceFrame'><header id='header'></header><div id='outerUI'><div id='UI'></div></div></div><div id='hiddenSpace'></div>");
		createMenuButtons();
	} else {
		flexFrame.append("<div id='interfaceFrame'><header id='header'></header><div id='outerUI'><div id='UI'></div></div></div><div id='hiddenSpace'></div>");
		$('#interfaceFrame').css('max-width', '100%');
	}
}


/*
	check if editor buttons are allowed
	single argument -> return boolean if button is to be show
	multiple arguments -> returns true if any of the buttons are allowed (used to defined if headlines are shown or not)
	if editorbuttons is not defined in system settings always return true -> no limitation takes place
 */
function bt(...buttons) {
	if (typeof (settings.editorButtons) !== "object") return false;
	for (let b of buttons) {
		if (settings.editorButtons.includes(b)) return true;
	}
	return false;
}

function createMenuButtons() {
	if (loginProc) return;

	const menu = $('#mainMenu');
	menu.append('<div id="viewsPanel"></div>');

	// dashboard button always shown
	registerView("dashboard", window.localUName, settings.JSrootURL + "editor/dashboard.php", "dashboard");
	$('#viewsPanel').append('<p class="menuSeparator"></p>');
	if (bt('content')) registerView('content', UILANG.m('content'), settings.JSrootURL + 'editor/items.php', 'content');
	if (bt('tests')) registerView('tests', UILANG.m('tests'), settings.JSrootURL + 'editor/tests.php', 'tests');
	if (bt('testtakers')) registerView('testtakers', UILANG.m('test takers'), settings.JSrootURL + 'editor/testTakers.php', 'testtakers');
	if (bt('activityTracker')) {
		$('#viewsPanel').append('<p class="menuSeparator"></p>');
	}
	if (bt('activityTracker')) registerView('activityTracker', UILANG.m('activity tracker'), settings.JSrootURL + 'editor/activityTracker.php', 'activityTracker');
	if (bt('testresults')) {
		$('#viewsPanel').append('<p class="menuSeparator"></p>');
	}
	if (bt('testresults')) registerView('testresults', UILANG.m('test results'), settings.JSrootURL + 'editor/results.php', 'testresults');

	// # ---------------------------- #
	// # DYNAMIC MODULE BUTTONS START #
	// # ---------------------------- #

	settings.modVars.forEach(modProps => {
		let modCount = 0;
		for (const ebName in modProps.editor_sections) {
			const pgProps = modProps.editor_sections[ebName];
			if (bt(ebName)) {
				if (modCount === 0) $('#viewsPanel').append('<p class="menuSeparator"></p>'); // auto-append a menu separator for each module array element
				modCount++;
				registerView(ebName, pgProps.name, settings.JSrootURL + pgProps.rootURL, ebName);
			}
		}
	});

	// # --------------------------- #
	// # DYANMIC MODULES BUTTONS END #
	// # --------------------------- #

	// # -------------------------- #
	// # ADMIN EDITOR BUTTONS START #
	// # -------------------------- #

	if (bt('l10n', 'systemsettings', 'users', 'backup', 'upgrader')) {
		$('#viewsPanel').append('<p class="menuSeparator"></p>');
	}
	if (bt('l10n')) registerView('l10n', 'localization', settings.JSrootURL + 'editor/l10n.php', 'l10n');
	if (bt('systemsettings')) registerView('systemsettings', 'system settings', settings.JSrootURL + 'editor/systemSettings.php', 'systemsettings');
	if (bt('users')) registerView('users', 'users', settings.JSrootURL + 'editor/users.php', 'users');
	if (bt('backup')) registerView('backup', 'backup', settings.JSrootURL + 'editor/backup.php', 'backup');
	if (bt('upgrader')) registerView('upgrader', 'upgrader', settings.JSrootURL + 'editor/upgrader.php', 'upgrader');

	// # ------------------------ #
	// # ADMIN EDITOR BUTTONS END #
	// # ------------------------ #

	//Placing Oasys Logo
	let if_localName = "";
	if (typeof localUName !== 'undefined') {
		if_localName = localUName;
	}

	$('#viewsPanel').prepend('<div id="mainLogo""><img height="119px;" src="' + settings.JSrootURL + settings.logoAdminPanel + '" /></div><div id="logoSeparator"></div>');
	$('#logoSeparator').append(/* html */ `
		<div id="profile" class="loginStatusContainer" style="display: none;">
			<div id="username"><svg class="userAvatar"><use href="#ic_mm_avatar"></svg><span id="un_val">${if_localName}</span></div>
			<div id="innerProf" class="loginMenu lm-collapsed">
				<div class="lm-menuItem"  id="acctProp"><div id="acctPropButton">` + UILANG.m('Edit Profile') + `</div></div>
				<div class="lm-menuItem"  id="logout"><div id="logoutButton">` + UILANG.m('Logout') + `</div></div>
			</div>
		</div>	
	`);
	//Flagging Version
	$('#viewsPanel').append('<br /><div style="text-align:center;"><div  id="versionInfo" style="color:#999;">' + UILANG.m('Version') + '&nbsp;<a id="displayinfo" style="cursor: pointer">' + String(settings.vshort) + '</a></div></div>');
	//End Flagging DEV Version

	// logoff button always shown
	$('#viewsPanel').append('<p class="menuSeparator"></p>');
	registerView("logout", UILANG.m("Logout"), settings.JSrootURL + "", "logout");




	$('#displayinfo').on('click', displayDetails);

	// show/hide account options handler, hide menu when clicked outside
	$("#username").on('click', function() {

		if ($('#innerProf').hasClass("lm-collapsed")) {
			$('#innerProf').removeClass("lm-collapsed");
			$(document).on("click", function(event) {
				if ($(event.target).closest("#profile").length === 0) {
					$('#innerProf').addClass("lm-collapsed");
					//remove onclick
					$(document).prop("onclick", null).off("click");
				}
			});
		} else {
			$('#innerProf').addClass("lm-collapsed");
			$(document).prop("onclick", null).off("click");
		}
	});

	let upg_span = $('#menuButton_upgrader > span');

	function setUpgStyle() {
		upg_span.css('color', '#FFA500');
		upg_span.append('<span id="upgExclaim"></span>');

		$('#menuButton_upgrader').prop('title', 'You have new update(s) available!');
		$('#menuButton_upgrader').tooltip({
			track: true,
			classes: {
				"ui-tooltip-content": "uitt-upgrader"
			},
			show: {
				effect: "fadeIn",
				duration: 250
			},
			hide: {
				effect: "fadeOut",
				duration: 250
			}
		});

	}

	/*
		conditionally check if there are upgrade packages available for the user to install, 
		only on non-login or non-upgrade checked conditions, and with upgrader access, and
		do not run on the upgrader page itself
	*/

	let curPage = window.location.pathname;
	if (settings.editorButtons.includes('upgrader') && initLogin === true) {

		// catch nested module locations and adjust for it
		const modPrepend = /(.*\/$|.*(\/modules\/\.*))/.test(window.location.href) ? "../../../editor/" : "";

		$.ajax({
			type: "POST",
			cache: false,
			dataType: "json",
			timeout: 300000,
			success: function() { },
			url: modPrepend + "upgraderActions.php",
			data: {
				action: "requestPackageList",
			},
		}).done((res) => {
			if (res.fileList.length > 0) {
				sessionStorage.setItem('upgAvail', "true");

				let si0 = setInterval(() => {
					if (upg_span.length !== 0) { // wait until the menu element is active in the UI prior to trying to change any of its properties
						setUpgStyle();

						upg_span.delay(500).fadeOut(500, "easeInOutCirc").delay(0).fadeIn(500, "easeInOutCirc");
						upg_span.delay(0).fadeOut(500, "easeInOutCirc").delay(0).fadeIn(500, "easeInOutCirc");
						upg_span.delay(0).fadeOut(500, "easeInOutCirc").delay(0).fadeIn(500, "easeInOutCirc", function() {
							upg_span.append("<span class='bubBtn bubExclaim'></span>");
						});


						clearInterval(si0);
					}
				}, 1);
			} else {
				sessionStorage.setItem('upgAvail', "false");
			}
		});
	} else if (sessionStorage.getItem('upgAvail') === "true" && !loginProc) {

		let si1 = setInterval(() => {
			if (upg_span.length !== 0) {
				setUpgStyle();

				$('#upgExclaim').hide();
				$('#upgExclaim').fadeIn(500);
				clearInterval(si1);
			}
		}, 10);
	}
}


function displayDetails() {
	const content = '<div class="oasysInfoCont"><table class="oasysInfoTable">' +
		'<tr><td>Complete version number:</td><td>' + settings.v + '</td></tr>' +
		'<tr><td>Database version number:</td><td>' + settings.database_version + '</td></tr>' +
		'<tr><td>System in debug mode:</td><td>' + settings.debugSystem + '</td></tr>' +
		'<tr><td>Write Logfiles:</td><td>' + settings.writeLog + '</td></tr>' +
		'<tr><td colspan="2">' + settings.info + '</td></tr>' +
		'</table></div>';
	const dialogData = {
		buttons: [{
			label: "AGPL v3 License",
			value: "license"
		}, {
			label: 'Ok',
			'default': true,
			'cancel': true,
			value: 'cancel',
		}],
		title: settings.title + ' ' + settings.vshort + ' details',
		width: 600,
		contents: content,
		callback: function(button) {
			if (button === "license") {
				const newWin = window.open('../license.txt', '_blank');
				if (newWin) {
					newWin.opener = null;
					try { newWin.focus(); } catch (e) { /* ignore */ }
				} else {
					// popup block fallback
					window.location.href = '../../license.txt';
				}
			}
		}
	};
	new nxDialog('displayDetailsDialog', dialogData);
}

function createFlexSection(parent, id, minWidth, preferredWidth, flex = 0, additionalClass = null) {
	if (typeof (parent) === 'string') {
		parent = $('#' + parent);
	}
	const html = `<div id='${id}' class='flexSection${' ' + additionalClass}' style='min-width: ${minWidth}px; width: ${preferredWidth}px'></div>`;
	parent.append(html);
	const section = $('#' + id);
	if (flex) {
		section.css({
			flex: flex,
			"-webkit-flex": flex
		});
	}
	return section;
}

function createFlexLayer(parent, id, background) {
	if (typeof (parent) === 'string') {
		parent = $('#' + parent);
	}
	const html = `<div id='${id}' class='flexLayer'></div>`;
	parent.append(html);
	const layer = $('#' + id);
	if (background) layer.css('background-color', background);
	return layer;
}

function createFlexBox(parent, id, options) {
	return new jsFlexBox(parent, id, options);
}

function createDashWidget(parent, id, options) {
	return new jsDashWidget(parent, id, options);
}

function createPanel(parent, id, h) {
	const html = `<div id='${id}' class='panel' style='height: ${h}px'></div>`;
	$(parent).append(html);
	return $('#' + id);
}

function insertStaticText(parent, id, label, options = {}, rowOptions = {}) {
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const lab = new jsLabel(propertyCell, id, options);
	row.setPropertyField(lab);
	row.lock(); //since this row cannot be interacted with, it will be locked in order to ignore hover events
	return row;
}

function insertTextfield(parent, id, label, options = {}, rowOptions = {}) {
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const box = new jsTextField(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertLink(parent, id, label, options = {}, rowOptions = {}) {
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const box = new jsLink(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertDropdown(parent, id, label, options = {}, rowOptions = {}) {
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const box = new jsDropList(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertSpinner(parent, id, label, options = {}, rowOptions = {}) {
	if (typeof (rowOptions.alignmentProperty) === 'undefined') {
		rowOptions.alignmentProperty = 'right';
	}
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const box = new jsNumberInput(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertCheckbox(parent, id, label, options = {}, rowOptions = {}) {
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const box = new jsCheckbox(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertProgressBar(parent, id, label, options = {}, rowOptions = {}) {
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const box = new nxProgress(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertToggleswitch(parent, id, label, options) {
	options.width = 60;
	options.height = 20;
	options.background = '../editor/images/ic_ui_toggleswitch.png';
	const row = new jsInterfaceRow(parent, label, options);
	const propertyCell = row.getPropertyCell();
	const alignment = options.alignment ?? 'right';
	propertyCell.css('text-align', alignment);
	const box = new jsToggleswitch(propertyCell, id, options);
	row.setPropertyField(box);
	return row;
}

function insertButtons(parent, id, label, options = {}, rowOptions = {}) {
	if (typeof (rowOptions.alignmentProperty) === 'undefined') {
		rowOptions.alignmentProperty = 'center';
	}
	const row = new jsInterfaceRow(parent, label, rowOptions);
	const propertyCell = row.getPropertyCell();
	const buttons = {};
	for (let i in options) {
		buttons[i] = new nxButton(propertyCell, `${id}_${i}`, options[i]);
	}
	row.setPropertyField(buttons);
	row.lock(); //the row itself should not react to hover events
	return row;
}


function insertSubSection(parent, id, label) {
	if (typeof (parent) === 'string') {
		parent = $('#' + parent);
	}
	parent.append(`<div id="${id}" class="guiSubSection">`);
	const element = $('#' + id);
	if (label) {
		element.append(`<div class="guiSubSectionLabelBox"><span class="guiSubSectionLabel">${label}</span></div>`);
	}
	return element;
}

function insertVerticalDivider(parent, id) {
	if (typeof (parent) === 'string') {
		parent = $('#' + parent);
	}
	if (id) {
		parent.append('<span id="' + id + '" class="verticalDivider"></span>');
	} else {
		parent.append('<span class="verticalDivider"></span>');
	}
}

function insertSpacer(parent) {
	if (typeof (parent) === 'string') {
		parent = $('#' + parent);
	}
	parent.append('<div class="jsInterfaceSpacer"></div>');
}


/* the id needs to match the 'data-managerid' attribute of the body tag so that the appropriate button can be highlighted */

function registerView(target, name, url, id) {

	let icon;
	//set the icons for main menu items.
	switch (target) {
		case "content":
			icon = "ic_mm_items";
			break;
		case "tests":
			icon = "ic_mm_tests";
			break;
		case "testtakers":
			icon = "ic_mm_testTakers";
			break;
		case "activityTracker":
			icon = "ic_mm_activityTracker";
			break;
		case "testresults":
			icon = "ic_mm_testResults";
			break;
		case "l10n":
			icon = "ic_mm_localization";
			break;
		case "systemsettings":
			icon = "ic_mm_settings";
			break;
		case "users":
			icon = "ic_mm_users";
			break;
		case "backup":
			icon = "ic_mm_backup";
			break;
		case "upgrader":
			icon = "ic_mm_upgrader";
			break;
		case "logout":
			icon = "ic_mm_logout";
			break;
		default:
			icon = "ic_mm_default";
	}

	/* dynamic module icon loading */
	settings.modVars.forEach(modProps => {
		for (const ebName in modProps.editor_sections) {
			const pgProps = modProps.editor_sections[ebName];
			if (target === ebName) icon = pgProps.icon;
		}
	});

	/* special condition for logout button since it does not redirect to a page */

	const buttonData = {
		label: name,
		callback: gotoPage,
		touchDevice: false,
		value: target,
		symbol: icon,
		iconPosition: 'left',
		iconWidth: '24px',
		iconHeight: '24px',
		style: {}
	};
	menuButtons.set(name, new nxButton('viewsPanel', 'menuButton_' + target, buttonData));
	let currentManagerId = $('body').data('managerid');
	if (currentManagerId === id) menuButtons.get(name).buttonSelected(true);
	viewManager[target] = url;

	/* handle overflow of long username */
	if (target === "dashboard" && $("#menuButton_dashboard.nxButton span").width() > 138) {
		let newStr = $("#menuButton_dashboard.nxButton span").html().slice(0, -10) + "...";
		$("#menuButton_dashboard.nxButton span").html(newStr);
	}

}

function gotoPage(destination) {

	if (destination === "logout") {
		$.ajax({
			type: "POST",
			cache: false,
			dataType: "json",
			timeout: 300000,
			success: function(res) {
				if (res.SSOlogout) {
					window.location.replace(settings.JSrootURL + "editor/sso.php?a=logout&s=editor");
				} else {
					window.location.replace(settings.JSrootURL + "editor/");
				}
			},
			error: function() {
				alert("Sorry! Unable to correctly logout of Oasys. Please contact the System Administrator.");
				window.location.replace(settings.JSrootURL + "editor/");
			},
			url: settings.JSrootURL + "editor/userMgmtActions.php",
			data: {
				action: 'logout',
				data: {},
				src: "mlgpage"
			}
		});
	} else {
		window.location = viewManager[destination];
	}

}