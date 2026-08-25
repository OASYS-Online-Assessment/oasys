"use strict";
$(onReady);
$(document).on("contextmenu", function(e) {
	e.preventDefault();
	return false;
});
//gui elements
let kbHandler;
let waitDialog;
let buttons = {};
let gui = {};

// various user mgr scoped vars
let selId; // Global selected user ID
let selName; // Global selected user name
let ugId; // Global user group selected ID
let ugName; // Global user group selected GROUP NAME
let admArr = {}; // Global obj for userid:isAdmin entries
let superArr = {}; // Global obj for username:isSuper entries
let val = ""; // Global file-scoped var for when we toggle a permission value
let lastSelBox = "group"; // Global variable which holds the last JsSelectList touched (usergroup or user section)
let isAdmin = null; // global var to indicate if the current operator is 'admin' level, and not superadmin
let isAE = null; // global var for elevated admin flag
let isSuper = null; // global var to indicate if the current operator is 'superadmin' level
let loadTop = true;
let usettingDataObject = {};
let noNav = false;
let myName;
let lastLmSel;

function onReady() {
	//setup in the beginning (e.g. onload or onready)
	$('body').on('dragover', function(e) {
		e.preventDefault();
	});
	$('body').on('drop', function(e) {
		e.preventDefault();
	});

	$.ajaxSetup({
		type: "POST",
		cache: false,
		dataType: "json",
		timeout: 300000,
		success: ajaxSuccess,
		error: ajaxError,
		url: "userActions.php"
	});
	waitDialog = new jsModalWait('please wait');
	kbHandler = new jsKeyboardHandler();
	kbHandler.registerShortcut('up', cursorUp);
	kbHandler.registerShortcut('down', cursorDown);
	kbHandler.registerShortcut('BACKSPACE'); //prevent browser from going back in history
	initGUI();
	gui = {
		boxes: {},
		testLevel: {}
	};
	gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
		prepend: true,
		prefix: '<strong style="margin-right: 10px;">User Management</strong>'
	});

	//main buttons
	buttons.addUser = new jsButton2($('header'), 'addUser', {
		label: 'Add User',
		icon: '../images/toolbarIcons/ic_tb_addUser.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: addUser,
		disabled: true
	});

	buttons.addGroup = new jsButton2($('header'), 'addGroup', {
		label: 'Add Group',
		icon: '../images/toolbarIcons/ic_tb_addUsergroup.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: addGroup,
		disabled: false
	});

	// only show permission sync button in debug mode
	if (settings.debugSystem === true) {

		insertVerticalDivider('header');

		buttons.consCheck = new jsButton2($('header'), 'consCheck', {
			label: 'Permission Sync',
			icon: "../images/toolbarIcons/ic_tb_dbConsitencyCheck.png",
			iconWidth: 48,
			width: 180,
			height: 100,
			callback: function() {
				startAjax("startConstCheck", {});
			},
			disabled: false,
		});
	}
	insertVerticalDivider('header');

	buttons.searchUser = new jsButton2($('header'), 'searchUserButton', {
		label: 'Find User',
		icon: "../images/toolbarIcons/ic_tb_searchUser.png",
		iconWidth: 48,
		width: 180,
		height: 100,
		callback: function() {
			searchUser();
		},
		disabled: false,
	});

	buttons.searchGroup = new jsButton2($('header'), 'searchGroupButton', {
		label: 'Find Group',
		icon: "../images/toolbarIcons/ic_tb_searchUsergroup.png",
		iconWidth: 48,
		width: 180,
		height: 100,
		callback: function() {
			searchGroup();
		},
		disabled: false,
	});

	insertVerticalDivider('header');

	buttons.logView = new jsButton2($('header'), 'logViewButton', {
		label: 'Log Analyzer',
		icon: "../images/toolbarIcons/ic_tb_logAnalyzer.png",
		iconWidth: 48,
		width: 180,
		height: 100,
		callback: function() {
			logView("");
		},
		disabled: false,
	});

	buttons.langStats = new jsButton2($('header'), 'langStatsButton', {
		label: 'Language Statistics',
		icon: "../images/toolbarIcons/ic_tb_languageStats.png",
		iconWidth: 48,
		width: 180,
		height: 100,
		callback: function() {
			langStats();
		},
		disabled: false,
	});

	gui.s1 = createFlexSection('UI', 'sect001', 200, 400); //user groups
	gui.s2 = createFlexSection('UI', 'sect002', 200, 400); //users
	// REVIEW: consider making this 'flex = 1' to fill out all space on right side of screen
	gui.s3 = createFlexSection('UI', 'sect003', 300, 600); //user permissions and settings

	// section 1 (user groups)
	gui.boxes.userGroups = createFlexBox(gui.s1, 'userGroups', {
		title: 'User Groups',
		minHeight: 480,
		panelHeight: 30,
		flex: 1,
		noPadding: false
	});

	// Toolbar context area
	gui.boxes.userGroups.getPanel().append('<div><div id="userGroupsTbText"></div><div id="userGroupsTbButton"></div></div>');


	//section 2 (users)
	gui.boxes.users = createFlexBox(gui.s2, 'userList', {
		title: 'Users',
		minHeight: 480,
		panelHeight: 30,
		flex: 1
	});

	gui.boxes.users.getInnerBox().append(`<div id="selGroupMsg">
                                            <h3 style="text-align:center;color:#AAA">Please select a group!</h3>
                                          </div>`);

	$('#selGroupMsg').show();

	//section 3 (user settings and permissions)
	gui.boxes.userPerms = createFlexBox(gui.s3, 'userPerms', {
		title: 'User Permissions and Administration',
		minHeight: 480,
		panelHeight: 30,
		flex: 1
	});

	gui.boxes.userPerms.getInnerBox().append(`<div id="selUserMsg">
                                                <h3 style="text-align:center;color:#AAA">Please select a user!</h3>
                                              </div>`);
	$('#selUserMsg').hide();

	// user list flexBox setup
	gui.boxes.users.getPanel().append('<div><div id="usersTbText"></div><div id="usersTbButton"></div></div>');
	gui.boxes.users.getInnerBox().append('<div id="selUserGroupMsg"></div><div id="userListBox"></div>');

	// user permissions list flexBox setup
	gui.boxes.userPerms.getPanel().append('<div><div id="userPermsTbText"></div></div>');
	gui.boxes.userPerms.getInnerBox().append(`
                                            <div id="permissionList"></div>
                                            <div id="acctPropList"></div>
                                            <div style="text-align: center; padding-top: 15px;" id="pwdResetBox"></div>
                                            `);
	window.userGroupsTbButtons = {};

	// Group overview button icon
	userGroupsTbButtons.oviewGroup = new nxButton($('#userGroupsTbButton'), 'ugTbOview', {
		icon: '../images/flexSectionToolBar/ic_flex_tb_folderLock.png',
		iconWidth: 22,
		callback: groupPermView,
		tooltip: 'Selected Group Folder Access Overview',
		disabled: true
	});

	// Edit Group button icon
	userGroupsTbButtons.editGroup = new nxButton($('#userGroupsTbButton'), 'ugTbEdit', {
		icon: '../images/flexSectionToolBar/ic_flex_tb_editUserGroups.png',
		iconWidth: 22,
		callback: editGroup,
		tooltip: 'Edit Selected Group',
		disabled: true
	});

	// Rename Group button icon
	userGroupsTbButtons.renameGroup = new nxButton($('#userGroupsTbButton'), 'ugTbRename', {
		icon: '../images/flexSectionToolBar/ic_flex_tb_rename.png',
		iconWidth: 22,
		callback: renameGroup,
		tooltip: 'Rename Selected Group',
		disabled: true
	});

	// Group "trashcan" button icon
	userGroupsTbButtons.deleteGroup = new nxButton($('#userGroupsTbButton'), 'ugTbRemove', {
		icon: '../images/flexSectionToolBar/ic_flex_tb_delete.png',
		iconWidth: 22,
		callback: deleteGroup,
		tooltip: 'Remove Selected Group',
		disabled: true
	});

	// New group "+" button icon
	userGroupsTbButtons.addGroup = new nxButton($('#userGroupsTbButton'), 'ugTbAdd', {
		icon: '../images/add48.png',
		iconWidth: 22,
		callback: addGroup,
		tooltip: 'Add New Group',
		disabled: false
	});

	window.usersTbButtons = {};

	usersTbButtons.deleteUser = new nxButton($('#usersTbButton'), 'usTbRemove', {
		icon: '../images/flexSectionToolBar/ic_flex_tb_delete.png',
		iconWidth: 22,
		callback: deleteUser,
		tooltip: 'Remove Selected User',
		disabled: true
	});

	usersTbButtons.addUser = new nxButton($('#usersTbButton'), 'usTbAdd', {
		icon: '../images/add48.png',
		iconWidth: 22,
		callback: addUser,
		tooltip: 'Add New User',
		disabled: true
	});

	// *USER GROUP* INIT START
	gui.userGroups = new jsSelectList(gui.boxes.userGroups.getInnerBox(), 'userGroupContextSel', {
		labelKey: 'name',
		orderKey: 'name',
		idKey: 'id',
		hideButtonsKey: 'locked',
		selectionCallback: groupSelChanged,
		cancelSingleClickOnDoubleClick: false
	});

	$('#userListBox').hide();
	$('#permissionList').hide();

	gui.users = new jsSelectList($('#userListBox'), 'stringsUserList_table', {
		labelKey: 'name',
		orderKey: 'name',
		idKey: 'id',
		hideButtonsKey: 'locked',
		selectionCallback: userSelChanged,
		cancelSingleClickOnDoubleClick: false
	});

	startAjax('fetchUsergroups', {});

	// *USER LIST* INIT END

	// *USER PERMISSIONS* INIT START

	let usPermOptions = {
		// onChange:
		onClick: procPermData,
		elements: [],
		tdSizes: {},
		tableHead: {
			property: 'Role',
			value: 'Access',
		},
		deleteLinkSize: '20px',
		cssStylesTable: {
			'width': '100%',
			'border': '0px',
			'border-spacing': '0px'
		},
		cssStylesCells: {
			'padding': '3px',
			'background-color': 'transparent',
			'border-bottom': '1px dotted #CCC',
			'height': '25px',
			'text-align': 'right'
		},
		cssHeadCells: {
			'padding': '0px',
			'background-color': '#e8e8e8',
			'height': '20px',
			'text-align': 'right'
		},
		consecutiveNumbersSize: '',
		consecutiveNumbersText: '',
		consecutiveNumbers: false,
		dataId: '',
		tableHeadDisplay: true,
		appPath: '../inc/jsSortableTable/',
		readOnly: false,
		actionField: false,
		actionButton: false,
		fixedOrder: true,
		hideDeleteLinks: true
	};
	gui.userPermView = new jsSortableTable('permissionList', 'permissionList_table', usPermOptions);
	// *USER PERMISSIONS* INIT END

	// *USER ADMINISTRATION* INIT START

	let usAdminOptions = {
		onClick: procActData,
		elements: [],
		tdSizes: {},
		tableHead: {
			property: 'Setting',
			value: 'Value',
		},
		cssStylesTable: {
			'width': '100%',
			'border': '0px',
			'border-spacing': '0px'
		},
		cssStylesCells: {
			'padding': '3px',
			'background-color': 'transparent',
			'border-bottom': '1px dotted #CCC',
			'height': '25px',
			'text-align': 'right'
		},
		cssHeadCells: {
			'padding': '0px',
			'background-color': '#e8e8e8',
			"text-align": "right"
		},
		consecutiveNumbersSize: '',
		consecutiveNumbersText: '',
		consecutiveNumbers: false,
		dataId: '',
		tableHeadDisplay: true,
		appPath: '../inc/jsSortableTable/',
		readOnly: false,
		actionField: false,
		actionButton: false,
		fixedOrder: true,
		hideDeleteLinks: true
	};
	gui.userAdminView = new jsSortableTable('acctPropList', 'acctPropList_table', usAdminOptions);
	$('#acctPropList').hide();
	// *USER ADMINISTRATION* INIT END
}

/**
 * Launches user language selection stats table.
 *
 */
async function langStats() {

	let data = await startAjax("getLangStats", {});
	let sData = data.statData;
	let langTable = $("<table />");

	for (const tRow of sData) {
		if (tRow.sLang === null) tRow.sLang = "Not selected";
		langTable.append( /* html */ `<tr><td class="lang_td">${tRow.sLang}</td><td class="lang_td">${tRow.userCt}</td></tr>\n`);
	}

	/* table styling */
	$(langTable).css({
		'border': "1px solid #ccc",
		'border-spacing': "0px",
		'border-collapse': "collapse",
		'padding': "0px",
		'margin-left': "auto",
		'margin-right': "auto"
	});

	new nxDialog("langStatsId", {
		title: "User Language Selection Statistics",
		width: 400,
		buttons: [{
			label: "Ok",
			value: "ok",
			'default': true
		}],
		contents: /* html */ `
            <h2>Count of editor users by language</h2>
            ${langTable[0].outerHTML}
        `
	});
}

/**
 * Launch user log action viewer.
 *
 * @param {string} button
 * @returns {undefined}
 */
function logView(button) {

	if (button === 'close') return;

	startAjax("logView").then((res) => {
		window.logdiag = new nxDialog('logDiagId', {
			title: "Log Analyzer",
			width: 1600,
			buttons: [{
				label: "Close",
				'default': true,
				value: 'close'
			}, {
				label: "Refresh",
			}],
			contents: /* html */ `
            <h4 id="lTitle">User Action Logfile Analyzer</h4>
            <p id="logCount"></p>
            <p id="clFilterArea"></p>

            <div id="filter_container" style="margin-bottom: 5px; display: flex;">
                <input class="logFilters" id="date_filter" placeholder="filter Date" type="text" style="width: 145px;" />
                <select class="logFilters" id="userName_filter" placeholder="filter Name" style="min-width: 125px;"></select>
                <select class="logFilters" id="userId_filter" placeholder="filter ID" style="min-width: 123px;"></select>
                <select class="logFilters" id="location_filter" placeholder="filter Module" style="min-width: 127px;"></select>
                <select class="logFilters" id="action_filter" placeholder="filter Action" style="min-width: 200px;"></select>
                <input class="logFilters" id="text_filter" placeholder="filter Entry" type="text" style="width: 100%;"/>
            </div>
            <div id="logTable"></div>
            `,
			callback: logView
		});

		// show count
		$('#logCount').append(`${res.data.length} entries found.`);

		// build reset filter button
		let clFilter = new nxButton('clFilterArea', 'clFilterId', {
			label: "Clear All Filters",
			callback: function() {
				$('.logFilters').val('');
				runFilter();
			}
		});

		// remove old log entries button
		if (isSuper) {
			let logMaint = new nxButton('clFilterArea', 'lmId', {
				label: "Log Maintenance",
				callback: showLogMaint
			});
		}


		// build the structure of the row to be added to the table object
		window.logMasterObj = {};

		// insert default 'all' options for dropdowns
		$('#action_filter').append(new Option('<ALL ACTIONS>', ''));

		// Pre-populate the Action dropdown with specific disabled entries that should always remain disabled
		const disabledActions = [
			"Rename",
			"Permission Update",
			"Folder Owner Change",
			"Object(s) Deletion",
			"Item Deletion",
			"Object Move",
			"Test Taker Results Reset",
			"All Password Results Reset",
			"Test/Password Results Reset",
			"Test Results Reset"
		];
		// Store in a global set (on window) so later loops can check membership
		window.disabledActionSet = new Set(disabledActions);
		// Ensure these disabled options exist in the dropdown and are disabled
		disabledActions.forEach((act) => {
			let exists = false;
			for (const opt of document.getElementById('action_filter').options) {
				if (opt.value === act) {
					exists = true;
					opt.disabled = true;
					break;
				}
			}
			if (!exists) {
				let o = new Option(act, act);
				o.disabled = true;
				$('#action_filter').append(o);
			}
		});
		$('#location_filter').append(new Option('<ALL MODULES>', ''));
		$('#userName_filter').append(new Option('<ALL USERS>', ''));
		$('#userId_filter').append(new Option('<ALL USER IDS>', ''));

		let elementsToAddArr = [];
		for (let i = 0; i < res.data.length; i++ in res.data) {
			const element = res.data[i];
			element.hiddenID = i;
			element.body = {
				id: i,
				data: element.body.substring(0, 100) + " ...",
				hiddenData: { // only the hidden data content will be sent to click callback function
					text: element.body,
					userName: element.operatorName,
					userId: element.operatorId,
					date: element.date,
					action: element.action,
					location: element.location
				}
			};

			// add our refined element
			elementsToAddArr.push(element);
			logMasterObj[i] = element.body.hiddenData;

			// populate action dropdown selection list
			// New behavior: enable an existing option if found; only add if it doesn't exist
			let actionVal = element.body.hiddenData.action;
			let foundOpt = null;
			for (const j of document.getElementById('action_filter').options) {
				if (j.value === actionVal) {
					foundOpt = j;
					break;
				}
			}

			if (foundOpt) {
				foundOpt.disabled = false;
			} else {
				// Not present; add it (enabled by default unless in disabled list)
				let o = new Option(actionVal, actionVal);
				if (window.disabledActionSet && window.disabledActionSet.has(actionVal)) {
					o.disabled = true;
				}
				$('#action_filter').append(o);
			}

			// Ensure hasOpt is declared before reuse below (strict mode safety)
			let hasOpt;

			// populate module dropdown selection list
			hasOpt = false;
			for (const j of document.getElementById('location_filter')) {
				if (j.value === element.body.hiddenData.location) hasOpt = true;
			}

			if (!hasOpt) $('#location_filter').append(new Option(element.body.hiddenData.location, element.body.hiddenData.location));

			// populate username dropdown selection list
			hasOpt = false;
			for (const j of document.getElementById('userName_filter')) {
				if (j.value === element.body.hiddenData.userName) hasOpt = true;
			}

			if (!hasOpt) $('#userName_filter').append(new Option(element.body.hiddenData.userName, element.body.hiddenData.userName));

			// populate userId dropdown selection list
			hasOpt = false;
			for (const j of document.getElementById('userId_filter')) {
				if (j.value === element.body.hiddenData.userId) hasOpt = true;
			}

			if (!hasOpt) $('#userId_filter').append(new Option(element.body.hiddenData.userId, element.body.hiddenData.userId))
		}


		window.logViewObj = new jsSortableTable('logTable', 'logView', {
			onClick: showLogEntry,
			elements: elementsToAddArr,
			tableHead: {
				date: 'Date / Time',
				operatorName: 'Operator Name',
				operatorId: 'Operator ID',
				location: 'Module',
				action: 'Action',
				body: "Log Entry"
			},
			tdSizes: {
				date: '140px',
				operatorName: '120px',
				operatorId: '123px',
				location: "125px",
				action: "195px"
			},
			cssStylesTable: {
				'width': '100%',
				'border': '0px',
				'border-spacing': '0px'
			},
			cssStylesCells: {
				'padding': '3px',
				'background-color': 'transparent',
				'border-bottom': '1px dotted #CCC',
			},
			cssHeadCells: {
				'padding': '5px',
				'background-color': '#e8e8e8',
			},
			tableHeadDisplay: true,
			appPath: '../inc/jsSortableTable/',
			hideDeleteLinks: true,
			readOnly: false,
			fixedOrder: true
		});

		// date picker for log filtering
		$('#date_filter').datepicker({
			onClose: function() {
				runFilter();
				$('#date_filter').on("click", function() {
					$(this).blur();
				});
			},
			dateFormat: 'yy-mm-dd'
		});

		$('#date_filter').on("click", function() {
			$(this).blur();
		});

		// event handler for log field filtering
		$('.logFilters').on('input', runFilter);
	});

	function showLogMaint(lmData, button) {
		let lmDiag;
		if (!button) {
			lmData = {};

			lmDiag = new nxDialog('lmDiagId', {
				title: "Log Maintenance",
				contents: "<div id='lmMain'></div><div id='lmData'></div>",
				buttons: [{
					label: "Remove Entries",
					value: "ok",
					disabled: true
				}, {
					label: "Cancel",
					value: "cancel",
					'default': true
				}],
				callback: showLogMaint
			}, [lmData]);

			new jsDropList('lmMain', 'lmOptsId', {
				elements: [{
					value: 'a',
					label: "Remove all"
				}, {
					value: '1m',
					label: "Remove entries > 1 month"
				}, {
					value: '1w',
					label: "Remove entries > 1 week"
				}, {
					value: '1d',
					label: "Remove entries > 1 day"
				}, {
					value: 'c',
					label: "Remove older than custom date&nbsp;"
				}],
				listTitle: "Remove...",
				onChange: lmChanged
			});

			lastLmSel = null;
		}

		function lmChanged(a, lmType) {
			if (lastLmSel === lmType) return;
			if (lmType === 'c') {
				lmDiag.disableButton('ok');
				$('#lmMain').append( /* html */ `<div id='cust_lm_date' style='display: block; margin-top: 5px;'><input id='clm_input' type="text"/></div>`);

				// delayed focus & trigger to wait for jquery to finish building UI elements
				setTimeout(() => {
					$('#clm_input').datepicker("show");
					$('#clm_input').on('input', function() {
						(/^\d{4}-\d{2}-\d{2}$/.test($(this).val())) ? lmDiag.enableButton('ok') : lmDiag.disableButton('ok');
					});

					$('#clm_input').on('click', () => {
						($('#clm_input').datepicker("widget").is(":visible")) ? $('#clm_input').datepicker("hide") : $('#clm_input').datepicker("show");
					});
				}, 50);

				$('#clm_input').datepicker({
					dateFormat: 'yy-mm-dd',
					maxDate: 0,
					showOn: "none",
					onSelect: function() {
						lmDiag.enableButton('ok')
					},
					onClose: function() {
						lmData.lmCustDate = $('#clm_input').val();
					}
				});


			} else {
				lmDiag.enableButton('ok');
				$('#cust_lm_date').remove();
			}

			lmData.lmType = lmType;

			lastLmSel = lmType;
		}

		if (button === 'ok') {
			startAjax('logMaint', lmData);
		}
	}

	function runFilter() {

		// filtering table - first level iterate each row
		for (const key in logMasterObj) {
			const element = logMasterObj[key];

			let filterIds = $(".logFilters").map(function() {
				return this.id.split("_")[0];
			}).toArray();

			// filtering entries - second level iterate each field
			let showMe = true;
			filterIds.forEach(field => {
				if (!showMe) return;

				if (
					(field === 'userName' || field === 'userId') &&
					((element[field] !== $('#' + field + "_filter").val()) && $('#' + field + "_filter").val() !== "")
				) {
					showMe = false;
				} else {
					if (element[field].toUpperCase().includes($('#' + field + "_filter").val().toUpperCase()) === false) {
						showMe = false;
					}
				}

				if (showMe) {
					$('#logView_' + key).show();
				} else {
					$('#logView_' + key).hide();
				}
			});
		}

		// count remaining entries
		let fCount = 0;
		let tCount = 0;
		$('.data-rows_logView').each(function(i, v) {
			if ($(this).css('display') !== 'none') fCount++;
			tCount++;
		});

		$('#logCount').html(fCount + ((fCount === 1) ? " entry" : " entries") + ((fCount === tCount) ? " found." : " shown (filtered)."));
	}

	function showLogEntry(tableDataId, parentId, fieldDesc, logData) {
		let titleTxt = "LOG ENTRY CREATED: " + logData.date + " FOR USER: " + logData.userId + " (" + logData.userName + ")";
		let entryFmtd = logData.text;
		// formatted/parsed entry build variable
		// entryFmtd = entryFmtd.replace(/\n/g, "<br>");
		// entryFmtd = entryFmtd.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
		// entryFmtd = entryFmtd.replace(/ /g, "&nbsp;");

		entryFmtd = "<textarea id='leTxt' readonly='true' style='width: 100%; height: 400px;'>" + entryFmtd + "</textarea>"; // wrap log entry in a textarea

		(function leGo(button) {
			switch (button) {
				// copy text to clipboard routine
				case 'cpToClip':
					let origTxt = logData.text;
					$('#leTxt').text("LOG ENTRY CREATED: " + logData.date + " FOR USER: " + logData.userId + " (" + logData.userName + ")\n" + origTxt);
					document.getElementById('leTxt').select();
					// document.execCommand("copy"); // execCommand deprecated
					navigator.clipboard.writeText(document.getElementById('leTxt').textContent);

					$('#leTxt').text(origTxt);

					// nxDiag for copied ok msg
					new nxDialog('cOk', {
						title: "Log Entry Copied",
						contents: "<p>Copied log entry data to clipboard.</p>",
						callback: leGo // reload log entry dialog
					});

					break;

				// standard exit
				case 'ok':
					break;

				case 'next':
					let nextId = parseInt(tableDataId) + 1;
					// if (logMasterObj[nextId] === undefined) nextId = 0;
					(logMasterObj[nextId] === undefined) ? window.logEntryObj.disableButton('next') : window.logEntryObj.enableButton('next');
					showLogEntry(nextId, '', '', logMasterObj[nextId]);

					break;

				case 'prev':
					let prevId = parseInt(tableDataId) - 1;
					// if (logMasterObj[prevId] === undefined) prevId = Object.keys(logMasterObj).length - 1;
					(logMasterObj[prevId] === undefined) ? window.logEntryObj.disableButton('prev') : window.logEntryObj.enableButton('prev');
					showLogEntry(prevId, '', '', logMasterObj[prevId]);

					break;

				// standard log entry dialog instantiation routine
				default:
					window.logEntryObj = new nxDialog('leId', {
						buttons: [{
							label: "OK",
							'cancel': false,
							'default': true,
							value: "ok",
						}, {
							label: "Copy Text to Clipboard",
							'cancel': false,
							value: "cpToClip"
						}, {
							label: "&lt; Older",
							value: "next"
						}, {
							label: "Newer &gt;",
							value: "prev"
						}],
						contents: entryFmtd,
						title: titleTxt,
						width: 1200,
						callback: leGo
					});

					(logMasterObj[parseInt(tableDataId) + 1] === undefined) ? window.logEntryObj.disableButton('next') : window.logEntryObj.enableButton('next');
					(logMasterObj[parseInt(tableDataId) - 1] === undefined) ? window.logEntryObj.disableButton('prev') : window.logEntryObj.enableButton('prev');

					break;
			}
		})();
	}
}

// search group list
function searchGroup(button, searchObject) {
	if (!button) {
		let searchGroupHTML =
			`
            <div style="width:100%;max-height:250px;overflow: auto;">
                <table style="width:100%;">
                    <tr>
                        <td style="width:40%;">
                            Search for group:
                        </td>
                        <td>
                            <input type="text" id="searchGroupTerm">
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2"><em>Wildcards "*" or "%" should be used, otherwise only an exact term will be returned.</td>
                    </tr>
                </table>
            </div>
        `;

		let searchGroupDialogData = {
			buttons: [{
				label: 'Cancel',
				'cancel': true,
				value: 'cancel'
			}, {
				label: 'Search',
				'default': true,
				disabled: false,
				value: 'save'
			}],
			contents: searchGroupHTML,
			datafields: ['searchGroupTerm'],
			mandatory: ['searchGroupTerm'],
			focus: 'searchGroupTerm',
			dataFormat: 'string',
			title: 'Group Search',
			width: 400,
			callback: searchGroup
		};

		new nxDialog('searchGroup', searchGroupDialogData);
	} else if (button === 'save') {

		startAjax('searchGroup', {
			sTerm: searchObject
		}).then((res) => {
			let sResHTML =
				`
                <div id="rgCount"></div>
                <div id="gResults"></div>
                `;

			let sresDialogData = {
				buttons: [{
					label: 'Close',
					'cancel': true,
					value: 'cancel',
					'default': true
				}],
				contents: sResHTML,
				dataFormat: 'string',
				title: 'Group Search Results',
				width: 400
			};

			let gResDialog = new nxDialog('groupResults', sresDialogData);

			// display # groups found
			let rgCount = res.data.length;
			if (rgCount === 1) {
				$('#rgCount').html(`Found ${rgCount} group.`);
			} else if (rgCount > 1) {
				$('#rgCount').html(`Found ${rgCount} groups.`);
			} else {
				$('#rgCount').html(`No groups found.`);
				$('#gResults').hide();
			}

			// iterate & display found search results
			for (const key in res.data) {
				const element = res.data[key];
				$('#gResults').append(`<div class="gResult" id="${element.id}">${element.name}</div>`);
			}

			// set handler for found group click
			$('.gResult').on("click", function() {
				let newGrId = parseInt($(this).attr('id'));
				ugId = newGrId;

				startAjax('fetchUsergroups', {});
				gResDialog.dismiss();

				groupSelChanged({
					id: newGrId
				});
			})

		});

	}
}

// search userbase
function searchUser(button, searchObject) {
	if (!button) {

		let searchUserHTML =
			`
            <div style="width:100%;max-height:250px;overflow: auto;">
                <table style="width:100%;">
                    <tr>
                        <td style="width:40%;">
                            Search for user:
                        </td>
                        <td>
                            <input type="text" id="searchUserTerm">
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2"><em>Wildcards "*" or "%" should be used, otherwise only an exact term will be returned.</td>
                    </tr>

                </table>
            </div>
        `;

		let searchUserDialogData = {
			buttons: [{
				label: 'Cancel',
				'cancel': true,
				value: 'cancel'
			}, {
				label: 'Search',
				'default': true,
				disabled: false,
				value: 'save'
			}],
			contents: searchUserHTML,
			datafields: ['searchUserTerm'],
			mandatory: ['searchUserTerm'],
			focus: 'searchUserTerm',
			dataFormat: 'string',
			title: 'User Search',
			width: 400,
			callback: searchUser
		};

		new nxDialog('searchUser', searchUserDialogData);

	} else if (button === 'save') {
		startAjax('searchUser', {
			sTerm: searchObject
		}).then((res) => {
			let sResHTML =
				`
                <div id="rCount"></div>
                <div id="uResults"></div>
                `;

			let sresDialogData = {
				buttons: [{
					label: 'Close',
					'cancel': true,
					value: 'cancel',
					'default': true
				}],
				contents: sResHTML,
				dataFormat: 'string',
				title: 'User Search Results',
				width: 400
			};

			let uResDialog = new nxDialog('userResults', sresDialogData);

			// display # users found
			let rCount = res.data.length;
			if (rCount === 1) {
				$('#rCount').html(`Found ${rCount} user.`);
			} else if (rCount > 1) {
				$('#rCount').html(`Found ${rCount} users.`);
			} else {
				$('#rCount').html(`No users found.`);
				$('#uResults').hide();
			}

			// iterate & display found search results
			for (const key in res.data) {
				const element = res.data[key];
				$('#uResults').append(`<div class="uResult" id="${element.id}">${element.name}</div>`);
			}

			// set handler for found user click
			$('.uResult').on("click", function() {
				startAjax('fetchUsergroups', {});

				uResDialog.dismiss();
				ugId = -1;
				groupSelChanged(-1);

				userSelChanged({
					id: $(this).attr('id')
				});
			});
		});

	}
}

/**
 * User selection change event handler.
 *
 * Various UI elements are toggled and specific user
 * information is retrived to populate user detail pane.
 * @param {Object} userId user id object containing properties 'id' and 'name'
 */
function userSelChanged(userId) {

	// set global user ID value
	selId = parseInt(userId.id);
	selName = userId.name;

	/**
	 * Because the boolean logic is getting too gnarly, we will use a step
	 * by step check to see if the particular selected user to delete is
	 * in fact deletable.
	 * @returns {boolean} If the condition allows for the delete button to be highlighted
	 */
	const checkDelRights = function() {

		// no one can delete self
		if (myName === selName) return false;

		/* condition for superadmins */
		if (isSuper) return true;

		/* condition for elevated admins */
		// can remove all other admins
		if (isAE) {
			// cannot remove superadmins
			if (superArr[selId]) return false;

			// can remove everyone else outside of superadmins
			return true;
		}

		/* conditions for standard admins */
		if (!isAE && isAdmin) {

			// cannot remove superadmins
			if (superArr[selId]) return false;

			// cannot delete any other peer admins or higher
			if (admArr[selId]) return false;

			// outside of the above condition, admins can delete standard users
			return true;
		}

		// if somehow none of the conditions above met (shouldn't be possible), return false
		return false;
	};

	// check if delete button should be enabled
	checkDelRights() ? usersTbButtons.deleteUser.enable() : usersTbButtons.deleteUser.disable();

	// get user level permissions
	startAjax('fetchPerms', {
		id: userId.id,
		selectedUg: ugId
	});
}

// function for when the usergroup selector changes
function groupSelChanged(groupObj, ltOverride = true) {
	buttons.addUser.enable();
	usersTbButtons.addUser.enable();
	usersTbButtons.deleteUser.enable();
	userGroupsTbButtons.oviewGroup.enable();
	userGroupsTbButtons.editGroup.enable();
	userGroupsTbButtons.renameGroup.enable();
	userGroupsTbButtons.deleteGroup.enable();

	$('#selUserGroupMsg').hide();
	$('#userListBox').show();
	$('#pwdResetBox').show();

	if (groupObj === undefined) return;
	if (typeof groupObj.name !== 'undefined') ugName = groupObj.name;
	ugId = -1;
	if (typeof groupObj.id !== 'undefined') {
		ugId = groupObj.id;
	} else {
		ugId = groupObj;
	}

	gui.userGroups.setSelection([ugId]);

	// globally disable group operations on hard coded groups admin groups (superadmin/admin)
	if (['superadmin', 'admin', '<NO GROUP>', '<ALL USERS>'].includes(ugName)) {
		userGroupsTbButtons.deleteGroup.disable();
		userGroupsTbButtons.renameGroup.disable();
		userGroupsTbButtons.oviewGroup.disable();
		usersTbButtons.addUser.disable();
		buttons.addUser.disable();
	}

	// only superadmins can edit the editor group access settings for admin group
	if (ugName === 'admin' && isAdmin || ['<NO GROUP>', '<ALL USERS>'].includes(ugName)) {
		userGroupsTbButtons.editGroup.disable();
	} else if (ugName === 'admin' && (isSuper)) {
		userGroupsTbButtons.editGroup.enable();
	}

	// selective 'new user' permission, depending on type of admin group and level of operator
	if (ugName === "superadmin" && isSuper) {
		usersTbButtons.addUser.enable();
		buttons.addUser.enable();
	}

	// only elev. admins and superadmins can add user admin level users
	if (ugName === "admin" && (isAE || isSuper)) {
		usersTbButtons.addUser.enable();
		buttons.addUser.enable();
	}

	loadTop = ltOverride;

	// User list load call
	startAjax('fetchUsers', {
		userGroupId: ugId,
	});
}

// enable save button on value change
function valChanged(sender, valSend, a, source) {
	editSetDialog.enableButton('save');
	val = valSend;

	if (source === 'ActSetVal' && val === false && selName === myName) {
		let admString = isAdmin ? "or elevated administrator " : "";

		$('#xtraPropInfo').html( /* html */
			`<strong style='text-decoration: underline; color: red;'>WARNING!!!</strong>
            <p>If you continue and disable your own account, only another
                super administrator ${admString} will be able
                to re-enable your access.</p>
            <p style='font-weight: bold; font-style: italic'>You will immediately be locked out of your account if you press "Save changes".</p>`
		).show();
	} else {
		$('#xtraPropInfo').html("").hide();
	}

}

// parse user account data and add to users jsSortableTable view
function parseAcctData(data, dataOpts) {

	// fName = Friendly Name
	// type: data type [readonly | string | dropdown | boolean | multiselect]

	// # -------------------------------- #
	// # HANDLE 'ACCOUNT PROPERTIES' DATA #
	// # -------------------------------- #

	let acctPropModel = {
		id: {
			fName: "User ID",
			type: "readonly"
		},
		name: {
			fName: "User Name",
			type: "string"
		},
		status: {
			fName: "Account Status",
			type: "boolean",
		},
		homeaccess: {
			fName: "Home Folder Create",
			type: "boolean"
		},
		bad_logins: {
			fName: "Bad Login Count",
			type: "readonly"
		},
		last_bad_pass: {
			fName: "Last Bad Password Timestamp",
			type: "readonly"
		},
		userGroups: {
			fName: "User Group Membership",
			type: "multiselect",
			optList: dataOpts
		},
		email: {
			fName: "Email Address",
			type: "string"
		},
		defLang: {
			fName: "Editor Language",
			type: "dropdown",
			optList: dataOpts
		},
		acct_type: {
			fName: "Account Type",
			type: "readonly"
		}
	};

	gui.userAdminView.clearElements();
	$('#acctPropList').show();

	// define value display var for showing formatted value but retaining original data
	let valDisp = "";
	$.each(data, function(key, value) {

		valDisp = value;

		if (['accessDef', 'id'].includes(key)) return; // don't show these keys in account properties list
		if (value === null) valDisp = "<no value>"; // replace nulls with friendly value
		if (key === 'userGroups') valDisp = '[Click to View]';

		// skip homeaccess display if an admin/superadmin since any admin level can create home folders
		if (!(key === 'homeaccess' && (superArr[data.name] || admArr[data.id]))) {

			// main element adding loop
			gui.userAdminView.addElement({
				property: {
					data: acctPropModel[key]['fName'],
					id: key,
					hiddenData: {
						uid: data.id,
						name: data.name,
						id: key,
						userGroups: data.userGroups,
						fName: acctPropModel[key]['fName'],
						edit_type: acctPropModel[key]['type'],
						updateType: "account",
						optList: acctPropModel[key]['optList'] || "",
						value: value
					}
				},
				value: valDisp
			});
		}
	});

	// admin/elevated admin rules for admin group
	if (selName === myName) {
		if (isAdmin) gui.userAdminView.unlock();
	} else {
		if (isAdmin && !isAE && (admArr[selId])) gui.userAdminView.lock();
		$('.data-rows_acctPropList_table td[data-fielddesc="property"]').css('text-align', 'left'); // refresh left-alignment after lock
	}

	// reset the innerHTML content of our target button DIV or else the centering will be off after multiple calls to this case
	$('#pwdResetBox').html('');

	// pwd reset button will be disabled if the account is not type LOCAL; and conditionally for certain admin conditions
	let disablePwdReset = data.acct_type !== "LOCAL";
	if (!isAE && isAdmin && admArr[data.id]) disablePwdReset = true;
	if (myName === data.name && data.acct_type === "LOCAL") disablePwdReset = false;

	// account reset password button init and function call
	let pwdResetBtn = new nxButton($('#pwdResetBox'), 'pwdReset', {
		label: "Reset Account Password",
		disabled: disablePwdReset,
		callback: function() {
			passReset(data.id, data.name);
		}
	});
}

// parse JSON accessDef and add to users jsSortableTable view
function parseAccessDef(data) {
	// # ------------------------ #
	// # HANDLE 'PERMISSION' DATA #
	// # ------------------------ #
	$('#userPermsTbText').html('');

	// loop perm object
	$.each(data, function(_key, objValue) {
		for (let section in objValue) {
			if (section.substring(0, 2) !== "c_") continue; // skip any entry that isn't a concept permisison entry
			for (let entry in objValue[section]) {
				gui.userPermView.addElement({
					property: {
						data: (entry).toString(),
						id: entry,
						hiddenData: {
							uid: data.id,
							name: data.name,
							fName: entry,
							perm: entry,
							edit_type: "accessDef",
							value: objValue[section][entry],
							updateType: "permission",
							section: section
						}
					},
					value: objValue[section][entry]
				});
			}
		}
	});

	$('[data-tdid="Elevated Administrator"]').html("Elevated Administrator <span id='aeInfo' class='qmark_extra_info'>?</span>");

	// do not show infoBox for elevated admin if not at least elevated admin
	if (isAdmin && !isAE) {
		$('#aeInfo').hide();
	}

	// handler for infobox so it doesn't trigger the actual option setting
	$('#aeInfo').hover(() => {
		gui.userPermView.lock();
	}, () => {
		if (isSuper) gui.userPermView.unlock();
	});

	// AE infoBox handler for clicking the question mark
	$('#aeInfo').on("click", () => {
		let aei = new nxDialog('aeiId', {
			width: 700,
			title: "Elevated Administrator Information",
			contents: `
            <p>When this option is selected, the following <em>additional</em> privileges are granted to this Admin user:</p>

            <p>
                <ul id="aeListProp">
                    <li>Access to Additional System Settings</li>
                <br>
                    <li>(Users): Remove or add other users to Admin usergroup</li>
                    <li>(Users): Delete/disable other Administrators</li>
                    <li>(Users): Create Administrators in the Admin usergroup</li>
                    <li>(Users): Modify another Admin level user's account properties</li>
                <br>
                    <li>(Backup): Download any backup archive file</li>
                    <li>(Backup): Delete any backup archive file</li>
                    <li>(Backup): Restore previous snapshot file</li>
                </ul>
            </p>
            <p>This option should be enabled with caution.</p>
            `
		});

		// forcibly override style for LI entries
		$('#aeListProp > li').css({
			'font-weight': 'bold',
			'list-style-type': "unset"
		});
	});

	// Only superadmins can change the 'roles' values
	if (isAdmin) gui.userPermView.lock();
	$('.data-rows_permissionList_table td[data-fielddesc="property"]').css('text-align', 'left'); // refresh left-alignment after lock
}

function edit_acct_setting(data, button) {
	if (!button) {

		let btnArr = [];
		btnArr.push({
			label: 'Cancel',
			'cancel': true,
			value: 'cancel'
		});

		// readonly types will have 'reset' button instead of 'save'
		if (data.edit_type !== 'readonly') {
			btnArr.push({
				label: 'Save changes',
				'default': true,
				disabled: true,
				value: 'save'
			});
			// values that are semi-readonly - can be reset back to only their initial values
		} else if (['bad_logins', 'last_bad_pass'].includes(data.id)) {
			btnArr.push({
				label: 'Reset',
				'cancel': false,
				value: 'resetCount'
			});
		}

		// change all readonly cancel button to 'close'
		if (data.edit_type === 'readonly') {
			btnArr[0].default = true;
			btnArr[0].label = "Close";
		}

		let editAcctHTML = /* html */
			`<div class="userSettingsDialog">
                <table style="width:100%;" id="settingsView">
                    <tr><td text-align: right;">User ID:</td><td style="font-weight: bolder;">${data.name.toString()}</td></tr>
                    <tr><td text-align: right;">Setting:</td><td style="font-weight: bolder;">${data.fName}</td></tr>
                    <tr><td text-align: right;">Value:</td><td><div id="setting" style="max-height: 147px; overflow-y: auto;"></div></td></tr>
                </table>
                <div style='display: none; margin: 10px; padding: 5px; border: 1px solid #ccc;' id='xtraPropInfo'></div>
            </div>
            `;

		let acctEditDialogData = {
			buttons: btnArr,
			contents: editAcctHTML,
			title: `EDIT SETTING: ${data.fName}`,
			width: 450,
			callback: edit_acct_setting
		};
		window.editSetDialog = new nxDialog('editSetDialog', acctEditDialogData, arguments);

		let jqSetObj = $('#setting');

		// Different types of display and input based on if it is editable and what type of data type the variable is
		switch (data.edit_type) {
			case 'string':
				if (data.value === null) data.value = ""; // email addresses sometimes come back as null and we don't want to display the string 'null' in the edit value dialog box

				jqSetObj.html(`<input id='strInput' type='text' value='${data.value}'>`);
				$('#strInput').focus().select();

				// # ------------------------------------- #
				// # EDIT USERNAME DIALOG INPUT VALIDATION #
				// # ------------------------------------- #
				if (data.id === "name") {

					$('#strInput').on('input', function() {
						// input validation
						const badChars = /[^.A-Za-z0-9@+_-]/;
						const re = RegExp(badChars);
						if (re.test($(this).val()) || ($(this).val().length > 64)) {
							$(this).val($(this).val().substring(0, $(this).val().length - 1));
							alert("Only alphanumeric, '-', '.', '@', '+', and '_' characters allowed in username. Maximum group name length is 64 characters.");
						}

						// field formatting
						if ($(this).val().length < 1) {
							$(this).css('border', '2 px solid red');
							editSetDialog.disableButton('save');
						} else {
							// $(this).css('background-color', '#ffffff');
							$(this).removeClass('textInputError');
							valChanged(null, $('#strInput').val());
						}
					});
				}

				// # ---------------------------------- #
				// # EDIT EMAIL DIALOG INPUT VALIDATION #
				// # ---------------------------------- #
				if (data.id === "email") {
					let origEm = $('#strInput').val();
					$('#strInput').on("input", function() {
						if (emailValidator($("#strInput")) && $("#strInput").val() !== origEm) {
							editSetDialog.enableButton('save');
							valChanged(null, $('#strInput').val());
						} else {
							editSetDialog.disableButton('save');
						}
					});
				}

				break;

			// # ------------------- #
			// # EDIT ACCOUNT STATUS #
			// # ------------------- #
			case 'boolean':

				let boolSV = {};
				boolSV.curVal = new jsToggleswitch(jqSetObj, 'ts_val', {
					dataId: 'ActSetVal',
					height: 20,
					width: 60,
					background: 'images/ic_ui_toggleswitch.png',
					changeCallback: valChanged
				}, data.value === "Enabled"); // set initial state of toggle switch

				break;

			case 'readonly':

				jqSetObj.html(data.value);

				break;

			case 'multiselect':
				// define the object to send in case of update to usergroup membership
				let newVals = {};
				let updateNewVals = function() {
					$.each($('.ugcb_array'), function() {
						newVals[$(this).attr('data-dbId')] = $(this).prop("checked");
					});
				};

				$('#settingsView').find('tr:last').prev().after( /* html */ `<tr><td>Filter Usergroups:</td><td><input id='ugFilter' type='text' placeholder='search' style='margin-bottom: 5px;'></td></tr>`);

				$('#ugFilter').on('input', function() {
					let filterVal = $(this).val();

					$("div#setting label").each(function(i, v) {
						if ($(v).html().toLowerCase().includes(filterVal.toLowerCase())) {
							$(v).show();
							$(v).prev().show();
						} else {
							$(v).hide();
							$(v).prev().hide();
						}
						if (filterVal === "") {
							$(v).show();
							$(v).prev().show();
						}
					});

				});

				for (const key in data.optList.ugList) {
					if (data.optList.ugList.hasOwnProperty(key)) {
						const ugroup = data.optList.ugList[key];
						jqSetObj.append(`<div id='div_${ugroup.value}'><input type='checkbox' class="ugcb_array" data-dbId=${ugroup.value} id=ugcb_${ugroup.value} /><label for='ugcb_${ugroup.value}'>${ugroup.label}</label></div>`);

						// enable save button and udpate new usergroup membership object to send on save request
						$('#ugcb_' + ugroup.value).on("change", function(e) {

							// update object
							updateNewVals();

							// enable save button
							valChanged(null, newVals);
						});
					}
				}

				// update the array of checkboxes by checking the usergroups to which the user belongs
				for (const ugVal of data.value) {
					$('#ugcb_' + ugVal).prop('checked', true);
				}

				// custom checkbox event handling for superadmin/admin blocking
				if (data.id === "userGroups") {

					let saCb = $(".ugcb_array").filter(function() {
						return $(this).siblings('label').text() === "superadmin";
					});

					let admCb = $(".ugcb_array").filter(function() {
						return $(this).siblings('label').text() === "admin";
					});

					if (saCb.is(':checked') === true) {
						admCb.prop("disabled", true);
						admCb.siblings('label').css('color', '#aaa');
					} else {
						admCb.prop("disabled", false);
						admCb.siblings('label').css('color', '#000');
					}

					saCb.on("change", function() {
						if ($(this).is(':checked') === true) {
							admCb.prop('checked', false);
							admCb.prop('disabled', true);
							admCb.siblings('label').css('color', '#aaa');
						} else {
							admCb.prop('disabled', false);
							admCb.siblings('label').css('color', '#000');
						}

						// update object
						updateNewVals();

					});
				}

				break;

			case 'dropdown':

				// # ------------- #
				// # EDIT LANGUAGE #
				// # ------------- #
				if (data.id === "defLang") {
					let langs = {};
					for (const key in data.optList.langs) {
						let element = data.optList.langs[key];
						langs[key] = {
							value: key,
							label: element
						}
					}

					let langSV = {};
					langSV.curVal = new jsDropList(jqSetObj, 'lang_opts', {
						elements: langs,
						onChange: valChanged
					});
					if (data.value !== null) langSV.curVal.reset(data.value);
				}


				break;

			case "accessDef": // accessDef type -- boolean permisison object handling
				let boolPermItem = {};
				boolPermItem.curVal = new jsToggleswitch(jqSetObj, 'ts_val', {
					dataId: 'permSetVal',
					height: 20,
					width: 60,
					background: 'images/ic_ui_toggleswitch.png',
					changeCallback: valChanged
				}, data.value); // set initial state of toggle switch

				break;

			default:
				break;
		}
	} else {
		if (button === 'save' || button === 'resetCount') {

			// convert boolean data type from bool true/false to 1/0
			if (data.edit_type === "boolean") {
				data.value = (data.value === "Enabled") ? 1 : 0;
				val = (val === true) ? 1 : 0;
			}

			if (data.id === 'bad_logins') val = 0;
			if (data.id === 'last_bad_pass') val = "";


			let acctUpdateObj = {
				userId: data.uid,
				origUgId: ugId,
				fieldName: data.id,
				oldVal: data.value || null,
				newVal: val,
				updateType: data.updateType,
				section: data.section || "",
				perm: data.perm || ""
			};

			// do permission update
			startAjax('updatePerms', acctUpdateObj).then((res) => {
				gui.statusBar.setStatus("User successfully updated.", 2500, '#0A0');
				startAjax('fetchUsergroups', {});

				// do not do group change function if still in same group, or returned loadgroup value undefined
				if (res.loadUg !== ugId && res.loadUg !== undefined) groupSelChanged({
					id: res.loadUg,
					name: res.ugName
				}, true);

				// on an error do not do refresh b/c res.data.userId is not returned to us
				if (('data' in res)) {
					// refresh permissions
					startAjax('fetchPerms', {
						id: res.data.userId,
						selectedUg: res.loadUg
					});
				}
			});
		}
	}
}

function passReset(userId, userName, button, newPass) {
	// FYI: DATAFIELDS LINKS TO THE ID OF THE INPUT ELEMENT
	if (!button) {
		let pwdDialogData = {
			buttons: [{
				label: "cancel",
				value: 'cancel',
				'cancel': true
			},
			{
				label: "Update Password",
				value: "ok",
				disabled: true
			}
			],
			contents: "New Password:<input type='text' id='newPwdInput'><br><div id='pwdWarning'></div>",
			title: "Password Reset for " + userName.toUpperCase(),
			datafields: ["newPwdInput"],
			mandatory: ["newPwdInput"],
			focus: "newPwdInput",
			callback: passReset
		};

		let pwdDiag = new nxDialog('pwdDiagObj', pwdDialogData, arguments);

		// password handler input validation and warning
		$('#newPwdInput').on("input", function() {

			// no zero-len pwds
			if ($(this).val().length === 0) {
				$('#pwdWarning').html('');
				pwdDiag.disableButton('ok');
			} else {
				// regex checks for: mix of upper/lower/num + 8 chars in len+, OR 12 chars in len+
				if (/(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z]).{8,}|.{12,}/.test($(this).val()) === false) {
					$('#pwdWarning').html("WARNING: This is an insecure password. It is recommended to use a mix of capital, lower, and numeric values with at least 8 characters, or a minimum of any 12 characters.");
				} else {
					$('#pwdWarning').html('');
				}

				if (userName === $(this).val()) {
					$('#pwdWarning').html($('#pwdWarning').html() + ($('#pwdWarning').html() === "" ? "" : "<br><br>") + "WARNING: It is not recommended to use the same value for both username and password.");
				}

				pwdDiag.enableButton('ok');
			}
		});
	} else if (button === 'ok') {
		startAjax('passReset', {
			userId: userId,
			newPass: newPass
		}).then((res) => {
			gui.statusBar.setStatus("Password successfully reset.", 2500, '#0A0');
		});
	}
}

function procPermData(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {
	edit_acct_setting(hiddenData);
}

function procActData(clickedId, parentId, fieldDesc, hiddenData, dataId, rowName) {
	edit_acct_setting(hiddenData);
}

function editGroup(button, dataObject) {

	if (!button) {
		let createGroupHTML = /* html */ `
            <div class="group_editDialog">
                <div id='group_editor_view' display: block; width: 100%; border-collapse: collapse; margin: 0 auto;'>

                <div style='display: table;'>

                    <div class='tRow'>
                        <span class='tTitle'>GROUP NAME:</span>
                        <span id='fld_name' class='tData'>${ugName}</span>
                    </div>

                    <div class='tRow'>
                        <span class='tTitle lastTitle'>SETTING:</span>
                        <span id='settingListId' class='tData'"></span>
                    </div>
                </div>

                <hr>

                <div class="regData tCellEdit" id="grpSetDropdown"></div>

            </div>
            `;

		// manually populate the ID value of the group to be renamed
		let edtDialogData = {
			buttons: [{
				label: 'Cancel',
				'cancel': true,
				value: 'cancel'
			}, {
				label: 'Update Editor Access',
				'default': true,
				disabled: false,
				value: 'save'
			}],
			contents: createGroupHTML,
			dataFormat: 'object',
			title: 'Edit Group Properties',
			width: 600,
			callback: editGroup
		};

		let editGroupDialog = new nxDialog('editGroupDialog', edtDialogData);

		// populate editor list
		startAjax('fetchGroupSettings', {
			groupId: ugId
		}).then((res) => {

			if (res.error) {
				editGroupDialog.dismiss();
				return;
			}

			usettingDataObject = res.userSettings;

			let TSobj = {};
			let edtSelListObj = {};

			// Dropdown list of settings options
			let settingDD = new jsDropList($('#settingListId'), 'settingListDD', {
				width: 260,
				onChange: function(src, settingName) {
					$("[id^='TSentryID_']").hide();
					$('#TSentryID_' + settingName).show();
				}
			});

			//
			for (const usetting in usettingDataObject) {
				if (!usettingDataObject.hasOwnProperty(usetting)) continue;
				const settingEntry = usettingDataObject[usetting];

				settingDD.addElement(usetting, usetting);

				// setup outer jsSelect List to populate with toggle switches
				edtSelListObj[usetting] = new jsSelectList($('#grpSetDropdown'), 'TSentryID_' + usetting, {});

				// iterate and show editor permissions for group
				for (const entryName in settingEntry) {

					let valObj = settingEntry[entryName];
					const labelName = (usetting === "editorButtons") ? valObj.name : entryName;
					const trueVal = (usetting === "editorButtons") ? valObj.value : valObj;

					let ro = entryName === 'users' && ugName === 'superadmin'; // do not allow disabling of users menu for superadmins

					// admin group will not have access to upgrader (always disabled in backend)
					if (entryName === "upgrader" && ugName === "admin") {
						ro = true;
					}

					TSobj[entryName] = insertToggleswitch($('#TSentryID_' + usetting), 'edtTs_' + entryName, labelName, {
						dataId: {
							label: entryName,
							value: trueVal
						},
						checked: trueVal,
						readOnly: ro,
						callback: function(src, val) {
							let eName = src.split('edtTs_')[1];
							(typeof settingEntry[eName]['value'] !== "undefined") ? settingEntry[eName]['value'] = val : settingEntry[eName] = val;
						}
					});
				}
			}

			// hide all settings sections until an entry is selected
			$("[id^='TSentryID_']").hide();

			// select and show the first option in dropdown list - editorButtons
			settingDD.reset('editorButtons');
			$("#TSentryID_editorButtons").show();
		});
	}

	if (button === 'save') {
		startAjax('updateGroupSettings', {
			editData: usettingDataObject,
			userGroup: ugId
		}).then((res) => {
			gui.statusBar.setStatus("Group settings successfully updated.", 2500, '#0A0');
			// if we are editing our own group, we force a reload to see the changes live
			if (res.forceReload) location.reload();
		});
	}
}

function renameGroup(button, dataObject) {

	if (!button) {
		let dataFields = ['groupNewName', 'groupId'];
		let createGroupHTML = `
            <div class="users_addDialog">
            <table style="width:100%;">
                <tr>
                    <td style="width:40%;">
                        Rename Group to:
                    </td>
                    <td>
                        <input type="text" id="groupNewName" value="${ugName}" style="width: 100%;">
                        <input type="hidden" id="groupId" value=${ugId}>
                    </td>
                </tr>
            </table>
            </div>
            `;

		// manually populate the ID value of the group to be renamed
		let rgDialogData = {
			buttons: [{
				label: 'Cancel',
				'cancel': true,
				value: 'cancel'
			}, {
				label: 'Rename Group',
				'default': true,
				disabled: true,
				value: 'save'
			}],
			contents: createGroupHTML,
			datafields: dataFields,
			mandatory: ['groupNewName'],
			focus: 'groupNewName',
			dataFormat: 'object',
			title: 'Rename Group',
			width: 400,
			callback: renameGroup
		};

		let renGrpDialog = new nxDialog('renameGroupDialog', rgDialogData);

		$('#groupNewName').focus();
		$('#groupNewName').select();

		// # ------------------------------ #
		// #  RENAME GROUP INPUT VALIDATION #
		// # ------------------------------ #
		$('#groupNewName').on('input', function() {

			// regex setup
			const badChars = /[^.\sA-Za-z0-9_-]/;
			const re = RegExp(badChars);

			// regex input validation
			if (re.test($(this).val()) || ($(this).val().length > 32)) {
				$(this).val($(this).val().substring(0, $(this).val().length - 1));
				alert("Only alphanumeric, '-', '.', '_', and space characters allowed in group name. Maximum length is 32 characters.");
			}

			// field formatting
			if ($(this).val().length < 1) {
				$(this).css('border', '2 px solid red');
				renGrpDialog.disableButton("save");
			} else {
				// $(this).css('background-color', '#ffffff');
				$(this).removeClass('textInputError');
				renGrpDialog.enableButton("save");
			}
		});
	}

	if (button === 'save') {
		dataObject.groupId = Number(dataObject.groupId);

		let firstRes = {};
		startAjax('renameGroup', {
			groupData: dataObject
		}).then((res) => {
			firstRes = res;
			loadTop = true;

			gui.statusBar.setStatus("Group successfully renamed.", 2500, '#0A0');
			startAjax('fetchUsergroups', {}).then(() => {
				// update global selected group name value
				ugName = dataObject.groupNewName;

				// select renamed group
				groupSelChanged(firstRes.loadUg);

			});
		});
	}
}

function deleteGroup(button) {

	if (!button) {
		let message = "<p>Are you sure you want to remove this group completely?</p>\
        <p></p>\
        <p style='font-weight: bold; color: red;'>NOTE! Continuing will remove all existing permission associations for this group in items, tests, and test taker modules.</p>\
        <p id='naWarning' style='display: none; font-weight: bold; color: red;'>Additionally, the following user(s) will not have any Oasys functionality after group deletion until they are added to another group:</p>\
        <p id='naList' style='font-style: italic; font-weight: bolder'></p>\
        ";

		let dialogData = {
			buttons: [{
				label: 'cancel',
				'cancel': true,
				'default': true,
				value: 'cancel'
			}, {
				label: 'Delete',
				value: 'ok'
			}],
			contents: message,
			icon: "../images/warning.png",
			width: 450,
			callback: deleteGroup,
			title: 'Delete selection'
		};
		new nxDialog('deleteDialog', dialogData);

		// get list of potential users w/out functionality after group deletion
		startAjax('getGroupOnlyList', {
			groupId: ugId
		}).then((res) => {
			let naList = '';

			// build list of users ONLY in this group and that have no other group membership
			res.naData.forEach(element => {
				naList += element + '<br>';
			});

			if (res.naData.length !== 0) {
				$('#naWarning').show();
				$('#naList').html(naList);
			}

		});


	}

	if (button === 'ok') {
		startAjax('deleteGroup', {
			groupId: ugId
		}).then((res) => {
			startAjax('fetchUsergroups');
			resetView();

			gui.statusBar.setStatus("Group successfully removed.", 2500, '#0A0');

			// ugly method to remove tooltip from a disabled Tb Button, but it works
			setTimeout(() => {
				$('#tooltip_ugTbRemove').hide();
			}, 250);

		});
	}
}

function deleteUser(v1, button) {
	if (!button) {

		let message = "<p>Are you sure you want to delete this user?</p>";

		// if user trying to delete self by enabling delete button, do not respond
		if (myName === selName) {
			return false;
		}

		let dialogData = {
			buttons: [{
				label: 'Cancel',
				'cancel': true,
				'default': true,
				value: 'cancel'
			}, {
				label: 'Delete',
				value: 'ok'
			}],
			contents: message,
			width: 600,
			callback: deleteUser,
			title: 'Delete user?',
			icon: "../images/warning.png",
			iconWidth: 64
		};
		new nxDialog('deleteDialog', dialogData, [button]);
	} else {
		if (button === 'ok') {
			startAjax('deleteUser', {
				user2delete: selUser,
				loadUg: ugId
			}).then((res) => {
				$('#userPermsTbText').html('');
				$('#acctPropList').hide();
				$('#permissionList').hide();

				if (!res.error) gui.statusBar.setStatus("User successfully removed.", 2500, '#0A0');

				startAjax('fetchUsergroups', {});
				startAjax('fetchUsers', {
					userGroupId: res.loadUg || ugId,
				});

				usersTbButtons.deleteUser.disable();

				/* Folder ownership assignment routine (post user deletion) */

				let fLabels = ["Content", "Test Takers", "Tests"];
				doOrphSet(0);

				function doOrphSet(fCount) {
					let noJsoArr = [];
					let fldDataObj;
					let oFldName;

					if (typeof res.orphs !== "undefined") {
						oFldName = Object.keys(res.orphs)[fCount];
						fldDataObj = res.orphs[oFldName];
					}

					if (fldDataObj != null) {

						let ncoObj = [];
						ncoObj[fCount] = new nxDialog("newContOwner", {
							buttons: [{
								label: 'OK',
								'default': true,
								'disabled': true,
								'cancel': true,
								value: 'ok'
							}],
							width: 800,
							title: `Set new owners for ${fLabels[fCount]}`,
							contents: /* html */`
                            <div id="allOwnersChangeMsg"> The user you have deleted was the owner of some folders in <span>${fLabels[fCount]}</span>. Please new ownership for affected folders. You can select one owner for all folders set an owner for each folder  individually. </div>
                            <div style="" id="allOwnerChange${fCount}" ></div>    
                            <div id="o_fList${fCount}"></div>`,
							callback: function() {
								doOrphSet(fCount + 1);
							}
						});

						$(`#allOwnerChange${fCount}`).html(/* html */`
                        <div id="allOwnerChangeContainer">
                            <div id="allOwnersMsg">Set the new owner for all folders: </div>
                            <div id="allOwnerDD${fCount}"></div>
                        </div>`);

						/* owner list iterative build */
						let oa_arr = [];
						for (const o of res.ownerList) {
							oa_arr.push({ value: o.id, label: `${o.name} (${o.id})` });
						}

						/* all owner change droplist build */
						let aoddObj = new jsDropList(`allOwnerDD${fCount}`, `aodDDid${fCount}`, {
							listTitle: "Select New Owner",
							elements: oa_arr,
							width: '100%',
							onChange: function(_jsdVal, ownerTarg) {
								for (let x in noJsoArr) {
									noJsoArr[x].reset(ownerTarg);
								}

								let fldBatchList = Object.keys(noJsoArr);
								updateNO(fldBatchList, ownerTarg);

								// for (let orphFldItem of fldDataObj) {
								// 	updateNO(orphFldItem.id, ownerTarg);
								// }
							}
						});

						/* iterative folder list owner change row build */
						let nofObj = new jsSortableTable(`o_fList${fCount}`, `oflId${fCount}`, {
							elements: [],
							tableHeadDisplay: true,
							tableHead: {
								id: "ID",
								name: "Name",
								newOwner: "New Owner"
							}, cssStylesTable: {
								'border': '0px',
								'border-spacing': '0px'
							}, cssHeadCells: {
								'padding': '0px',
								'background-color': '#e8e8e8',
								'height': '20px',
								'text-align': 'left'
							},
							cssStylesCells: {
								'padding': '5px',
								'padding-bottom': '2px',
								'background-color': 'transparent',
								'text-align': 'left'
							},
							hideDeleteLinks: true,
							fixedOrder: true,
						});

						// populate each folder and new owner selection list
						for (const f of fldDataObj) {
							nofObj.addElement({
								hiddenID: f.id,
								id: f.id,
								name: f.name,
								newOwner: {
									data: "",
									id: f.id + "_no"
								}
							});

							// since we can only use an element 'id' to attach the jsDropList to, we set that value to that of the data-tdid attribute
							$(`[data-tdid='${f.id + "_no"}']`).attr("id", f.id + "_no");

							let o_arr = [];
							for (const o of res.ownerList) {
								o_arr.push({ value: o.id, label: `${o.name} (${o.id})` });
							}

							noJsoArr[f.id] = new jsDropList(f.id + "_no", "no_jsd_" + f.id, {
								width: 310,
								listTitle: "Select New Owner",
								cssCollapsed: { 'padding-top': '3px' },
								elements: o_arr,
								onChange: updateNO
							});
						}

						function updateNO(fldId, newOwnerId) {
							if (typeof fldId === "string") fldId = parseInt(fldId.split("no_jsd_")[1]);

							startAjax("updateOwnerPostDel", {
								fldId: fldId,
								newOwnerId: newOwnerId,
								tblTarg: oFldName
							}).then((res) => {
								if ("toDisable" in res) {
									res.toDisable.forEach(disId => {
										nofObj.removeElement(disId);
									});
								}
								if (res.error) {
									if ("failedUser" in res) {
										// error image handling
										res.failedUser.forEach(fuId => {
											$(`#dlTitle_no_jsd_${fuId}`).parent().parent().children("img").remove();
											$(`#dlTitle_no_jsd_${fuId}`).parent().after("<img class='ownerMissing' />");
										});
									}
									ncoObj[fCount].disableButton("ok");
									return false;
								} else {
									// checkmark image handling
									res.updated.forEach(fItem => {
										$(`#dlTitle_no_jsd_${fItem.fldId}`).parent().parent().children("img").remove();
										$(`#dlTitle_no_jsd_${fItem.fldId}`).parent().after("<img class='valid' />");
									});
								}

								ncoObj[fCount].enableButton("ok");
								if ($(".ownerMissing").length > 0) ncoObj[fCount].disableButton("ok");
							});
						}
					}
				}
			});
		} else {
			startAjax('fetchPerms', {
				id: selUser,
				selectedUg: ugId
			});
		}
	}
}

function addGroup() {
	let dataFields = ['groupName'];
	let createGroupHTML = `
    <div  class="users_addDialog">

    <table style="width:100%;">
        <tr>
            <td style="width:40%;">New Group Name:</td>
            <td>
                <input type="text" id="groupName">
            </td>
        </tr>
    </table>

    </div>
    `;

	let cgDialogData = {
		buttons: [{
			label: 'Cancel',
			'cancel': true,
			value: 'cancel'
		}, {
			label: 'Add New Group',
			'default': true,
			disabled: true,
			value: 'save'
		}],
		contents: createGroupHTML,
		datafields: dataFields,
		mandatory: ['groupName'],
		focus: 'groupName',
		dataFormat: 'object',
		title: 'Add New Group',
		width: 400,
		callback: saveNewGroup
	};

	let ngDialog = new nxDialog('newGroupDialog', cgDialogData);

	// # -------------------------------- #
	// #  NEW GROUP NAME INPUT VALIDATION #
	// # -------------------------------- #
	$('#groupName').on('input', function() {

		// regex setup
		const badChars = /[^.\sA-Za-z0-9_-]/;
		const re = RegExp(badChars);

		// regex input validation
		if (re.test($(this).val()) || ($(this).val().length > 32)) {
			$(this).val($(this).val().substring(0, $(this).val().length - 1));
			alert("Only alphanumeric, '-', '.', '_', and space characters allowed in group name. Maximum length is 32 characters.");
		}

		// field formatting
		if ($(this).val().length < 1) {
			$(this).css('border', '2 px solid red');
			ngDialog.disableButton("save");
		} else {
			// $(this).css('background-color', '#ffffff');
			$(this).removeClass('textInputError');
			ngDialog.enableButton("save");
		}

	});

	// Save new group main call
	function saveNewGroup(button, dataObject) {
		if (button === 'save') {

			startAjax('addGroup', {
				"groupData": dataObject,
			}).then((res) => {
				let loadGroup = res.loadUg;
				// refresh our group list
				startAjax('fetchUsergroups', {}).then((res2) => {

					// set global ugName to new group
					ugName = res2.data.filter(obj => {
						return obj.id === loadGroup
					})[0].name;

					// change to new group
					groupSelChanged({
						id: loadGroup
					});

					// highlight the newly added userGroup
					gui.statusBar.setStatus("New group successfully added.", 2500, '#0A0');
					editGroup();
				});
			});
		}
	}
}

function addUser(preFill) {
	let dataFields = [];
	dataFields.push('nu_edt_uname', 'nu_edt_pwd', 'nu_edt_eml', 'userGroupId', 'acctTypeVal');

	// friendly name for <all users> usergroup selection
	let ugDisp = ([undefined, '<ALL USERS>', '<NONE>', '<NO GROUP>'].includes(ugName)) ? "<NONE>" : ugName;

	let createUserHTML = /* html */ `
    <div style="width:100%;overflow: auto;">
        <table style="width:100%;">
            <tr>
                <td style="width:40%;">
                    New Username:
                </td>
                <td>
                    <input type="text" id="nu_edt_uname" autocomplete="off">
                </td>
            </tr>
            <tr id ="pwdRow">
                <td>
                    New User Password:
                </td>
                <td>
                    <input type="text" id="nu_edt_pwd" autocomplete="new-password">
                </td>
            </tr>
            <tr id ="emailRow">
                <td>
                    New User Email:
                </td>
                <td>
                    <input type="text" id="nu_edt_eml" autocomplete="off">
                </td>
            </tr>
            <tr>
                <td colspan="2">
                    <div id="pwdWarning"></div>
                </td>
            </tr>
            <tr>
                <td>
                    User Group:
                </td>
                <td>
                    <input type="text" id="userGroupName" readonly style="width: 100%;" value='${ugDisp}'>
                    <input type="hidden" id="userGroupId" value='${ugId}'>
                </td>
            </tr>
            <tr>
                <td>
                    Account Type:
                </td>
                <td>
                    <div id="acctType"></div>
                    <input type="hidden" id="acctTypeVal" value=''>
                </td>
            </tr>
        </table>
    </div>`;

	let mandFields = ['nu_edt_uname', 'nu_edt_pwd'];
	if (settings.emailSysActive) mandFields.push('nu_edt_eml');

	let createUserDialogData = {
		buttons: [{
			label: 'Cancel',
			'cancel': true,
			value: 'cancel'
		}, {
			label: 'Add New User',
			'default': true,
			disabled: true,
			value: 'save'
		}],
		contents: createUserHTML,
		datafields: dataFields,
		mandatory: mandFields,
		focus: 'nu_edt_uname',
		dataFormat: 'object',
		title: 'Add New User',
		width: 400,
		callback: saveNewUser
	};
	let createUserDialog = new nxDialog('createUserDialog', createUserDialogData);

	let acTypeDD = new jsDropList($('#acctType'), 'acType', {
		width: 186,
		onChange: function(_vType, val) {
			if (val !== 'LOCAL') {
				$('#pwdRow').css('display', 'none');
				$('#nu_edt_pwd').val('');
				$('#nu_edt_pwd').attr('disabled', 'disabled');
				$('#pwdWarning').html('');
				$('#nu_edt_uname').trigger('focus');
			} else {
				$('#pwdRow').css('display', 'table-row');
				$('#nu_edt_pwd').removeAttr('disabled');
				$('#nu_edt_uname').trigger('focus');
			}

			// always do re-validation on dropdown change
			nu_validator_launch();

			$('#acctTypeVal').val(val);
		}
	});

	for (const actypeLabel in settings.authMethods) {
		const actypeValue = settings.authMethods[actypeLabel];
		acTypeDD.addElement(actypeValue, actypeLabel);
	}

	acTypeDD.reset("LOCAL");

	$('#acctTypeVal').val(acTypeDD.getValue());

	//Pre-Fill
	if (preFill && preFill !== 'addUser') {
		//pre-populate input fields with available data after duplicate warning
		$.each(preFill, function(k, v) {
			$('#' + k).val(v);
			if ($('#' + k).val().length < 1) {
				$('#' + k).css('border', '2 px solid red');
			} else {
				$('#' + k).removeClass('textInputError');
			}
		});
	}

	// FYI: using bitwise operators (single ampersand &) for validation calls so that they are all launched, and not short-circuited!

	// # ----------------------- #
	// #  FIELD INPUT VALIDATION #
	// # ----------------------- #
	$('#nu_edt_uname, #nu_edt_pwd, #nu_edt_eml').on('input', nu_validator_launch);

	function nu_validator_launch() {

		if ($("#dlTitle_acType .dlTitleSpan").html() !== "LOCAL") {

			// exclude password field checking for non-local account types
			if ((unameValidator($("#nu_edt_uname")) & emailValidator($("#nu_edt_eml"))) === 1) {
				createUserDialog.enableButton("save");
			} else {
				createUserDialog.disableButton("save");
			}
		} else {

			// full check of all fields
			if ((unameValidator($("#nu_edt_uname")) & emailValidator($("#nu_edt_eml")) & passValidator($("#nu_edt_pwd"))) === 1) {
				createUserDialog.enableButton("save");
			} else {
				createUserDialog.disableButton("save");
			}
		}
	}

	// Save the new user call
	function saveNewUser(button, dataObject) {
		if (button === 'save') {

			let auObj = {};

			startAjax('addUser', {
				"userData": dataObject,
			})
				.then((res) => {
					loadTop = false;

					let loadId;
					loadId = (res.error) ? selId : res.data.userId;

					auObj = {
						id: loadId,
						selectedUg: ugId
					};

					if (res.error) return;

					if (ugId === undefined) {
						auObj.selectedUg = -1;
						auObj.loadUg = -1;
					}

					usersTbButtons.deleteUser.enable();
					userSelChanged({ id: res.data.userId, name: res.data.nu_edt_uname });
					gui.statusBar.setStatus("New user successfully added.", 2500, '#0A0');
				})
				.then(() => {
					startAjax('fetchUsergroups', {});
					startAjax('fetchUsers', {
						userGroupId: ugId,
					});
					if (typeof auObj.id !== "undefined") startAjax('fetchPerms', auObj);
				})
		}
	}
}

/* navigation */

function cursorUp() {
	if (lastSelBox === 'group') gui.userGroups.moveUp();
	if (lastSelBox === 'user') gui.users.moveUp();
}

function cursorDown() {
	if (lastSelBox === 'group') gui.userGroups.moveDown();
	if (lastSelBox === 'user') gui.users.moveDown();

}

function resetView() {
	$('#userPermsTbText').html('');
	$('#acctPropList').hide();
	$('#permissionList').hide();
	$('#userListBox').hide();
	$('#pwdResetBox').hide();

	usersTbButtons.addUser.disable();
	usersTbButtons.deleteUser.disable();
	userGroupsTbButtons.oviewGroup.disable();
	userGroupsTbButtons.editGroup.disable();
	userGroupsTbButtons.renameGroup.disable();
	userGroupsTbButtons.deleteGroup.disable();

	$('#selGroupMsg').show();
	$('#selUserMsg').hide();
}

async function groupPermView() {

	noNav = true;

	let gpv_res = await startAjax("groupPermView", { ugId: ugId });
	let uList_res = await startAjax("fetchUsers", { userGroupId: ugId });

	let uList = [];
	let userTable = [];

	for (const i of uList_res.data) {
		uList.push(i.hiddenID);
	}

	for (const x of uList) {
		let fp_res = await startAjax("fetchPerms", { id: x, selectedUg: ugId });
		fp_res.data.accessDef = JSON.parse(fp_res.data.accessDef);
		userTable.push(fp_res.data);
	}

	noNav = false;

	let data = gpv_res.fPermSet;

	// dialog box content
	let ov_body_content = /* html */ `
    <div id="ov_main"></div>
    <div id="titleLabel"></div>
    <div id='tabHolder'></div>
    <div id="gf_data" style="/* max-height: 500px; overflow: auto; */"></div>
    <div id="user_data"></div>
    `;

	let nxWidth = window.innerWidth * 0.8;

	let ugfxNx = new nxDialog("el_oview", {
		title: `Usergroup Folder Permissions Overview: <strong>${ugName}</strong>`,
		width: nxWidth,
		buttons: [{
			label: "OK",
			'default': true,
			'cancel': true,
			value: "ok"
		}],
		contents: ov_body_content
	});

	// set max width for nxDiag
	$('#el_oview').css("max-width", "1600px");

	// path filter init
	let pf_content = /* html */ `
    <div id="pfHolder">
        <input id="df_filter_field" placeholder="Filter Folders" type="text">
        <span id="df_filter_clear">clear</span>
    </div>
    `;

	// set label for in-body title
	$('#titleLabel').html(/* html */`<h3>Folder Permissions for Usergroup: <strong>${ugName}</strong></h3>`);

	// tab event handling control
	let tabsObj = new jsTabs($('#tabHolder'), "tid");
	tabsObj.setTabs({ c: "Content", t: "Tests", tt: "Test Takers" });

	let tabSel = tabsObj.getEventType('select');

	$(window).off(tabSel);
	$(window).on(tabSel, function(ret) {
		build_oview(ret.originalEvent.detail);
	});

	let build_oview = function(sel) {

		let ugfData = [];
		let fullPath;

		let dSubName;
		if (sel === "c") dSubName = "itemFolders";
		if (sel === "t") dSubName = "testFolders";
		if (sel === "tt") dSubName = "loginsFolders";

		// build usergroup / folder view table data
		for (const entry of Object.values(data[dSubName])) {
			fullPath = "";
			entry.parents.forEach(element => fullPath += Object.values(element)[0] + " / ");
			fullPath = `${fullPath.slice(0, -3)} / ${entry.name}`;
			ugfData.push({
				hiddenID: entry.folderId,
				path: fullPath,
				owner: entry.owner,
				read: entry.acPerms.Read,
				write: entry.acPerms.Write,
				accessControl: entry.acPerms["Edit Permissions"]
			});
		}

		// reset group/folder data table on tab change
		$('#sortableTable_gfd_id').remove();

		// group/folder data table init
		let ugfObj = new jsSortableTable('gf_data', 'gfd_id', {
			elements: ugfData,
			tableHead: {
				path: 'Path',
				owner: 'Owner',
				read: 'Read',
				write: "Write",
				accessControl: "Access Control"
			},
			tdSizes: {
				owner: "300px",
				read: "42px",
				write: "42px",
				accessControl: "42px"
			},
			cssStylesTable: {
				"width": "100%",
				"border": "0px",
				"border-spacing": "0px"
			},
			cssStylesCells: {
				"padding": "2px",
				"background-color": "transparent",
				"border-bottom": "1px solid #e6e6e6"
			},
			cssHeadCells: {
				"color": "white",
			},
			tableHeadDisplay: true,
			hideDeleteLinks: true,
			fixedOrder: true
		});

		let dPageName;
		if (sel === "c") dPageName = ["items.php", 1];
		if (sel === "t") dPageName = ["tests.php", 3];
		if (sel === "tt") dPageName = ["testTakers.php", 5];

		// nice little folder icon we have to insert through JQ/JS since sortable table does not process html code
		$('td[data-fielddesc="path"]').each(function(_i, row) {
			let targId = $(row).parent()[0].id.split("gfd_id_")[1];
			let homelessPath = $(row).html().replace("Home / ", ""); //Remove Home / from path to be consistent with dashboard

			$(row).html("<img src='../images/listFolder.png' style='max-height: 20px; vertical-align: inherit; margin-right: 10px;' />" + `<a class ='userFoldersPath'  href='${dPageName[0]}?id=${targId}&ta=${dPageName[1]}'>` + homelessPath + "</a>");
		});

		// CSS bubble button replacement on r/w/x data values
		let rTarg = $('td[data-fielddesc="read"]');
		rTarg.each(function(_i, row) {
			$(row).html() === "true" ? $(row).html('<span class="bubBtn rAccess"></span>') : $(row).html('<span style="background-color: #eee" class="bubBtn rAccess"></span>');
		});

		let wTarg = $('td[data-fielddesc="write"]');
		wTarg.each(function(_i, row) {
			$(row).html() === "true" ? $(row).html('<span class="bubBtn wAccess"></span>') : $(row).html('<span style="background-color: #eee" class="bubBtn wAccess"></span>');
		});

		let aTarg = $('td[data-fielddesc="accessControl"]');
		aTarg.each(function(_i, row) {
			$(row).html() === "true" ? $(row).html('<span class="bubBtn aAccess"></span>') : $(row).html('<span style="background-color: #eee" class="bubBtn aAccess"></span>');
		});

		// move the entire path filtering block into the header itself
		$('th[data-id="path"]').append(pf_content);

		// force focus on input field
		$('#df_filter_field').trigger("focus");

		// setup filtering event handling
		$('#df_filter_field').off();
		$('#df_filter_field').on("input", function() {
			let searchFor = this.value;

			$('#sortableTable_gfd_id tr td[data-fielddesc="path"]').each(function(_i, row) {
				if (row.innerText.toLowerCase().includes(searchFor.toLowerCase())) {
					$(row).parent().show();
				} else {
					$(row).parent().hide();
				}
			});
		});

		// clear filter box event handler
		$('#df_filter_clear').on("click", () => {

			// clear out filter field
			$("#df_filter_field").val("");

			// show all rows
			$('#sortableTable_gfd_id tr td[data-fielddesc="path"]').each(function(_i, row) {
				$(row).parent().show();
			});
		});
	};

	// select initial view on dialog loading as 'c'ontent
	build_oview("c");

	let uf_content = /* html */ `
    <div id="ufHolder">
        <input id="uf_filter_field" placeholder="Filter Users" type="text">
        <span id="uf_filter_clear">clear</span>
    </div>
    `;


	// build user list table data
	let uData = [];

	for (const entry of userTable) {
		uData.push({
			hiddenID: entry.id,
			name: entry.name,
			acctType: entry.acct_type,
			email: entry.email,
			status: entry.status,
			language: entry.defLang
		});
	}


	$('#user_data').append(/* html */ `<div id="userListTitle"><h3 style="display: inline-block;">Users in this Group</h3></div>`);

	let buttonData = {
		iconHeight: 24,
		callback: function() {
			if ($('#sortableTable_ud_id').css("display") === "table") {
				$('#sortableTable_ud_id').hide();
				uhbObj.setLabel("+");
			} else {
				$('#sortableTable_ud_id').show();
				uhbObj.setLabel("-");
			}
		},
		states: [{
			icon: svgIcons.eyeDown,
			value: true
		}, {
			icon: svgIcons.eyeUp,
			value: false
		}],
		state: 1,
		toggle: true
	};
	let uhbObj = new nxButton($(`#userListTitle`), `uhb_id`, buttonData);

	let udObj = new jsSortableTable("user_data", "ud_id", {
		elements: uData,
		tableHead: {
			name: 'Name',
			acctType: 'Account Type',
			email: 'Email',
			status: "Account Status",
			language: "Default Language",
		},
		tdSizes: {
			// name: "300px",
			acctType: "100px",
			email: "200px",
			status: "150px",
			language: "150px"
		},
		cssStylesTable: {
			"width": "100%",
			"border": "0px",
			"border-spacing": "0px"
		},
		cssStylesCells: {
			"padding": "2px",
			"background-color": "transparent",
			"border-bottom": "1px solid #e6e6e6"
		},
		cssHeadCells: {
			"color": "white",
			"font-weight": "bold"
		},
		tableHeadDisplay: true,
		hideDeleteLinks: true,
		fixedOrder: true
	});


	$('th[data-id="name"]').append(uf_content);

	// setup filtering event handling
	$('#uf_filter_field').off();
	$('#uf_filter_field').on("input", function() {
		let searchFor = this.value;

		$('#sortableTable_ud_id tr td[data-fielddesc="name"]').each(function(_i, row) {
			if (row.innerText.toLowerCase().includes(searchFor.toLowerCase())) {
				$(row).parent().show();
			} else {
				$(row).parent().hide();
			}
		});
	});

	// clear filter box event handler
	$('#uf_filter_clear').on("click", () => {

		// clear out filter field
		$("#uf_filter_field").val("");

		// show all rows
		$('#sortableTable_ud_id tr td[data-fielddesc="name"]').each(function(_i, row) {
			$(row).parent().show();
		});
	});


}

/* general helper functions */
function showMessage(msg, title) {
	let dialogData = {
		buttons: [{
			label: 'OK',
			'default': true,
			cancel: true,
			value: 'ok',
		}],
		title: title,
		contents: `<strong>${msg}</strong>`,
		width: 500
	};
	new nxDialog('Message', dialogData);
}

function emailValidator(emObj) {

	// https://stackoverflow.com/a/46181 - email validation accepts unicode input
	const goodEmailFmt = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
	const re = RegExp(goodEmailFmt);

	if (!re.test(emObj.val())) {
		emObj.css('border', '2 px solid red');
		if (emObj.val() === "" && settings.emailSysActive === false) return true;
		return false;
	} else {
		return true;
	}
}

function unameValidator(nameObj) {

	// input validation
	const badChars = /[^.A-Za-z0-9@+_-]/;
	const re = RegExp(badChars);
	if (re.test(nameObj.val()) || (nameObj.val().length > 64)) {
		nameObj.val(nameObj.val().substring(0, nameObj.val().length - 1));
		alert("Only alphanumeric, '-', '.', '@', '+', and '_' characters allowed in username. Maximum group name length is 64 characters.");
		return false;
	}

	// field formatting
	if (nameObj.val().length < 1) {
		nameObj.css('border', '2 px solid red');
		return false;
	}

	return true;
}

function passValidator(pwdObj) {

	// regex checks for: mix of upper/lower/num + 8 chars in len+, OR 12 chars in len+
	if (/(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z]).{8,}|.{12,}/.test(pwdObj.val()) === false && pwdObj.val().length !== 0 /* && pwdObj.is(":focus") */) {
		$('#pwdWarning').html("WARNING: This is an insecure password. It is recommended to use a mix of capital, lower, and numeric values with at least 8 characters, or a minimum of any 12 characters.");
		pwdObj.css('border', '2px solid red');
	} else {
		$('#pwdWarning').html('');
		pwdObj.css('border', '1px solid #ccc')
	}

	if ($('#nu_edt_uname').val().toLowerCase() === pwdObj.val().toLowerCase()) {
		$('#pwdWarning').html($('#pwdWarning').html() + ($('#pwdWarning').html() === "" ? "" : "<br><br>") + "WARNING: It is not recommended to use the same value for both username and password.");
	} else {
		$('#pwdWarning').html($('#pwdWarning').html().replace("WARNING: It is not recommended to use the same value for both username and password.", ""));
	}

	if (pwdObj.val().length > 50) {
		alert("Password must not exceed 50 characters in length.");
		pwdObj.val(pwdObj.val().substring(0, pwdObj.val().length - 1));
		return false;
	}

	if (pwdObj.val().length < 1) {
		return false;
	}

	return true;
}

//parse a single JSON string with fallback on empty object if null and exception handling
//if an unparsable string is found, it will be replaced with an empty object, and the erroneous will be logged in the key parserError
function jsonDecode(s, type, id, key, template) {
	if (typeof (template) === 'undefined') {
		//the template defines what an empty variable should be initialized with, default is a new object
		template = {};
	}
	if (s) {
		try {
			s = JSON.parse(s);
		} catch (e) {
			// showMessage('Error parsing JSON string! Please inform your administrator!');
			const d = new Date();
			parseErrors.push(`[${d.toString()}] parse error in ${type} ${id} ${key}: ${s} (${e})`);
			s = deepCopy(template);
		}
	} else {
		s = deepCopy(template);
	}
	return s;

}

/* server communication */
async function startAjax(action, data) {
	waitDialog.show();
	let params = {
		action: action,
		data: JSON.stringify(data)
	};
	return $.ajax({
		data: params
	});

}

function ajaxError(jqXHR, textStatus, errorThrown) {
	waitDialog.hide();
	let dialogData = {
		buttons: [{
			label: 'OK',
			'default': true,
			cancel: true,
			value: 'ok'
		}],
		contents: jqXHR.responseJSON.fatalError,
		title: 'Error: ' + errorThrown,
		width: 500
	};
	new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
	$('#un_val').html(res.loggedInName);
	myName = res.loggedInName;
	isAdmin = res.isAdmin;
	isAE = res.isAE;
	isSuper = res.isSuper;

	waitDialog.hide();
	//if there was a fatal PHP error that prevented the script from finishing show that error
	//this data is created in PHP via the register_shutdown_function
	if (res.fatalError) {
		new nxDialog('fatalError', {
			buttons: [{
				label: 'OK',
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: '<strong>Sorry! The action cannot be completed.</strong><br />' + res.fatalError,
			title: "Error",
			icon: "../images/error.png",
			iconWidth: 64,
			width: 500
		});

		return;
	}
	//if a normal error occured in PHP that did not prevent the script from finishing, show it
	if (res.error !== false) {
		let dialogData = res.userData ? {
			buttons: [{
				label: 'OK',
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: '<strong>' + 'Sorry! The action cannot be completed.' + '</strong><br />' + res.error,
			title: "Error",
			icon: "../images/error.png",
			iconWidth: 64,
			width: 500,
			callback: reOpenCreateForm
		} : {
			buttons: [{
				label: 'OK',
				'default': true,
				cancel: true,
				value: 'ok'
			}],
			contents: '<strong>' + 'Sorry! The action cannot be completed.' + '</strong><br />' + res.error,
			title: "Error",
			icon: "../images/error.png",
			iconWidth: 64,
			width: 500,
			callback: function() {
				if (res.forceLoginRedirect) {
					window.location = 'index.php';
				}

				if (res.forceReload) location.reload();
			},
		};

		new nxDialog('error', dialogData);
		if (res.reload) {
			startAjax('fetchPerms', {
				id: res.data.userId,
				selectedUg: ugId
			});
		}
		return;
	}

	function reOpenCreateForm(button) {
		if (button === 'ok') {
			addUser(res.userData);
		}
	}

	// # ------------------------------ #
	// # Begin action result processing #
	// # ------------------------------ #

	if (res.logMsg) showMessage(res.logMsg, "Notification");

	switch (res.action) {
		case 'fetchUsergroups':
			let ugLen = res.data.length - 1; // take out one group from count for 'all users' (id = -1)
			for (const key in res.data) {
				if (res.data[key]['id'] === 0) ugLen -= 1; // take out one group from count if 'no group' found (id = 0)
			}

			if (ugLen === 1) {
				$('#userGroupsTbText').html(ugLen + ' user group found');
			} else {
				$('#userGroupsTbText').html(ugLen + ' user groups found');
			}
			gui.userGroups.setItems(res.data);
			$('#userPermsTbText').html('');

			break;

		case 'fetchUsers':
			if (noNav) return;

			gui.users.clearList();
			gui.users.clearSelection();
			$('#permissionList').hide();
			$('#acctPropList').hide();
			$('#pwdResetBox').html('');

			// reset the admin and superadmin arrays on each load
			admArr = {};
			superArr = {};

			// add each user from return data to user jsSelectList
			$.each(res['data'], function(key, objValue) {
				gui.users.addItems([{
					name: objValue.name.data,
					id: objValue.name.id.toString(),
				}]);

				admArr[objValue.name.id] = objValue.isAdminOnly;
				superArr[objValue.name.data] = objValue.isSuper;
			});

			// set our selection to the top physical element post sort -- if there's users in this group
			if (res.data.length > 0) {
				window.topName = $('#stringsUserList_table ul li:first').text();
				window.topUid = $('#stringsUserList_table ul li:first').attr('id').split('_')[2];

				if (loadTop) {
					userSelChanged({
						name: topName,
						id: topUid
					});
				}
			} else {
				// what to do when usergroup is empty
				window.selUser = -999;
				usersTbButtons.deleteUser.disable();
				$('#userPermsTbText').html("No user permission data found.");
			}

			// show user count and set UI visibility
			let uCount = (res.data.length === 1) ? 'user' : 'users';
			$('#usersTbText').html(res.data.length + ` ${uCount} found`);
			$('#selGroupMsg').hide();

			break;

		case 'fetchPerms':
			if (noNav) return;

			// if we find a forced usergroup change that's been sent in, then do the usergroup change
			if (res.loadUg !== undefined) {
				gui.userGroups.setSelection([res.loadUg]);
			}

			gui.users.clearList();

			$.each(res['uData'], function(key, objValue) {
				// gui.users.addElement(objValue, true);
				gui.users.addItems([{
					name: objValue.name.data,
					id: objValue.name.id.toString()
				}]);
			});

			let data = res.data;
			let dataOpts = res.dataOpts;

			// first, get section permission list
			gui.userPermView.clearElements();
			$('#selUserMsg').hide();
			$('#acctPropList').show();

			let acDefObj = jsonDecode(res.data.accessDef);

			// # -------------------------------- #
			// #  ACCESS DEFINITIONS - PARSE DATA #
			// # -------------------------------- #
			selId = res.data.id;
			if (admArr[selId]) { // show roles only if type 'admin'
				$('#permissionList').show();
				let permData = [acDefObj];
				permData.name = res.data.name;
				permData.id = res.data.id;

				// call JSON parsing routine
				parseAccessDef(permData);
			} else {
				$('#permissionList').hide();
			}

			// parse account properties and account operations
			parseAcctData(data, dataOpts);

			// Update top table string with username being viewed
			$('#userPermsTbText').html(`<div id="um_etidedUserTitle">Account Settings for user: <span class='editingValue'>${data.name.toString()}</span></div>`);

			// Force tableHead formatting via JQ
			$('.sTableClickable, th[data-id="property"]').css('text-align', 'left');

			// init 'top' values when user clicks 'add user' without selecting a group first
			if (window.topUid === undefined) {
				groupSelChanged(-1, false);
				window.topUid = $('#stringsUserList_table ul li:first').attr('id').split('_')[2];
				startAjax('fetchPerms', {
					id: res.data.id,
					selectedUg: -1
				});
			}

			// determine which user to set selection on based on loadTop value
			// FYI: setSelection() function will only take a STRING argument as the ID to load
			window.selUser = (loadTop) ? String(topUid) : String(res.data.id);
			gui.users.setSelection([selUser]);

			// set click handler for keyboard selection and up/down operation
			$('#userGroupContextSel ul li').one('mousedown', function() {
				lastSelBox = 'group';
			});

			$('#stringsUserList_table ul li').one('mousedown', function() {
				lastSelBox = 'user';
			});

			loadTop = false;

			break;

		case 'logMaint':
			logdiag.dismiss('close');
			logView("");
			break;
	}
}