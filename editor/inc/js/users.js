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
let onPageBlock = 0;
let pageSize = 10;
let logFullData = [];
let logRes = [];
let eHiddenData = [];

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
	buttons.search = new jsButton2($('header'), 'searchButton', {
		label: 'Search',
		icon: '../images/toolbarIcons/ic_tb_search.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: openUserManagerSearch,
		disabled: false
	});

	insertVerticalDivider('header');

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

	buttons.importUsers = new jsButton2($('header'), 'importUsers', {
		label: 'Import users',
		icon: '../images/toolbarIcons/ic_tb_csvUpload.png',
		iconWidth: 48,
		width: 80,
		height: 100,
		callback: openImportUsersDialog,
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
		classConditions: {
			'umGroupSystemAll': {
				path: ['id'],
				value: -1
			},
			'umGroupSystemNo': {
				path: ['id'],
				value: 0
			},
			'umGroupAdmin': {
				path: ['name'],
				value: 'admin'
			},
			'umGroupSuperadmin': {
				path: ['name'],
				value: 'superadmin'
			}
		},
		selectionCallback: groupSelChanged,
		cancelSingleClickOnDoubleClick: false
	});

	$('#userListBox').hide();
	$('#permissionList').hide();

	gui.users = new jsSelectList($('#userListBox'), 'stringsUserList_table', {
		labelKey: 'name',
		orderKey: 'name',
		idKey: 'id',
		prefixKey: 'listBadges',
		postfixKey: 'roleBadge',
		hideButtonsKey: 'locked',
		classConditions: {
			'umUserAdmin': {
				path: ['role'],
				value: 'admin'
			},
			'umUserElevated': {
				path: ['role'],
				value: 'elevated'
			},
			'umUserSuperadmin': {
				path: ['role'],
				value: 'superadmin'
			}
		},
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
	gui.userPermView = new JsSortableTable('permissionList', 'permissionList_table', usPermOptions);
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
	gui.userAdminView = new JsSortableTable('acctPropList', 'acctPropList_table', usAdminOptions);
	$('#acctPropList').hide();
	// *USER ADMINISTRATION* INIT END
}

/**
 * Launches user language selection stats table.
 *
 */
async function langStats() {

	let data = await startAjax("getLangStats", {});
	let sData = data.statData || [];
	let totalUsers = sData.reduce((sum, row) => sum + parseInt(row.userCt, 10), 0);
	let colors = ['#78c69a', '#86bdd8', '#edbd68', '#e58f9d', '#aca0df', '#83bdbc', '#d3a0b8'];
	let start = 0;

	function langMeta(lang) {
		let code = (lang || '').toString().toUpperCase();
		let meta = {
			DE: { label: 'German', flag: '🇩🇪' },
			EN: { label: 'English', flag: '🇬🇧' },
			FR: { label: 'French', flag: '🇫🇷' },
			LU: { label: 'Luxembourgish', flag: '🇱🇺' }
		};
		if (!code) return { code: '', label: 'No language set', flag: '—' };
		return {
			code: code,
			label: meta[code] ? meta[code].label : code,
			flag: meta[code] ? meta[code].flag : '🌐'
		};
	}

	let rows = sData
		.map((row, idx) => {
			let count = parseInt(row.userCt, 10);
			let percent = totalUsers > 0 ? (count / totalUsers * 100) : 0;
			let meta = langMeta(row.sLang);
			return {
				...meta,
				count: count,
				percent: percent,
				color: colors[idx % colors.length]
			};
		})
		.sort((a, b) => b.count - a.count);

	let pieStops = rows.map((row) => {
		let end = start + row.percent;
		let stop = `${row.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
		start = end;
		return stop;
	}).join(', ');

	let rowHtml = rows.map((row) => /* html */ `
		<tr>
			<td>
				<div class="umLangStatLanguage">
					<span class="umLangStatFlag">${userMgrEscapeHtml(row.flag)}</span>
					<div>
						<div class="umLangStatName">${userMgrEscapeHtml(row.label)}</div>
						<div class="umLangStatCode">${userMgrEscapeHtml(row.code)}</div>
					</div>
				</div>
			</td>
			<td class="umLangStatNumber">${row.count}</td>
			<td>
				<div class="umLangStatPercent">
					<span>${row.percent.toFixed(1)}%</span>
					<div class="umLangStatBar"><span style="width:${row.percent.toFixed(2)}%; background:${row.color};"></span></div>
				</div>
			</td>
		</tr>
	`).join('');

	let legendHtml = rows.map((row) => /* html */ `
		<div class="umLangStatLegendItem">
			<span class="umLangStatDot" style="background:${row.color};"></span>
			<span class="umLangStatLegendFlag">${userMgrEscapeHtml(row.flag)}</span>
			<span>${userMgrEscapeHtml(row.label)}</span>
		</div>
	`).join('');

	new nxDialog("langStatsId", {
		title: "User Language Selection Statistics",
		width: 720,
		buttons: [{
			label: "Ok",
			value: "ok",
			'default': true
		}],
		contents: /* html */ `
			<div class="umLangStatsDialog">
				<div class="umDialogHero">
					<div class="umDialogKicker">Language statistics</div>
					<div class="umDialogTitle">Editor language selection</div>
					<div class="umDialogMeta">${totalUsers} editor user${totalUsers === 1 ? '' : 's'} counted by selected language.</div>
				</div>
				<div class="umLangStatsGrid">
					<div class="umLangStatsChartCard">
						<div class="umLangStatsPie" style="background: conic-gradient(${pieStops || '#dce6ef 0 100%'});">
							<div class="umLangStatsPieCenter">
								<strong>${totalUsers}</strong>
								<span>Total users</span>
							</div>
						</div>
						<div class="umLangStatsLegend">${legendHtml}</div>
					</div>
					<div class="umLangStatsTableWrap">
						<table class="umLangStatsTable">
							<thead>
								<tr>
									<th>Language</th>
									<th>Users</th>
									<th>Share</th>
								</tr>
							</thead>
							<tbody>${rowHtml || '<tr><td colspan="3" class="umLangStatsEmpty">No language data available.</td></tr>'}</tbody>
						</table>
					</div>
				</div>
			</div>
        `
	});
}

/**
 * Launch user log action viewer.
 */
async function logView(button, filterData = {}) {
	let curFilterSel = "";

	if (button === 'close') return;

	if (button === "" || button === "refresh") {
		onPageBlock = 0;
		pageSize = 10;
		const res = await startAjax("logView", {});
		logRes = JSON.parse(JSON.stringify(res.data || []));
		logFullData = JSON.parse(JSON.stringify(res.data || []));
	}

	window.logdiag = new nxDialog('logDiagId', {
		title: "Log Analyzer",
		width: 1600,
		buttons: [{
			label: "Refresh",
			value: "refresh"
		}, {
			label: "Close",
			'default': true,
			value: 'close'
		}],
		contents: /* html */ `
			<h4 id="lTitle">User Action Logfile Analyzer</h4>
			<p id="logCount"></p>
			<p id="clFilterArea"></p>

			<div id="filter_container" style="margin-bottom: 5px; display: flex;">
				<input class="logFilters" id="date_filter" placeholder="filter Date" type="text" style="width: 145px;" />
				<button class="logClearInput" id="dateClearBtn" title="Reset date filter">❌</button> <!-- conditional 'clear date filter' button when date filter is active -->
				<select class="logFilters" id="userName_filter" placeholder="filter Name" style="min-width: 125px;"></select>
				<select class="logFilters" id="userId_filter" placeholder="filter ID" style="min-width: 123px;"></select>
				<select class="logFilters" id="location_filter" placeholder="filter Module" style="min-width: 127px;"></select>
				<select class="logFilters" id="action_filter" placeholder="filter Action" style="min-width: 200px;"></select>
				<input class="logFilters" id="text_filter" placeholder="filter Entry" type="text" style="width: 100%;"/>
				<button class="logClearInput" id="txtClearBtn" title="Reset text search filter">❌</button> <!-- conditional 'clear text filter' button when text filter is active -->
			</div>
			<div id="logTable"></div>
			`,
		callback: logView
	});

	// handler for date clear button
	$("#dateClearBtn").on("click", function() {
		$("#date_filter").datepicker("setDate", "");
		runFilter();
	});

	// handler for text clear button
	$("#txtClearBtn").on("click", function() {
		$("#text_filter").val("");
		runFilter();
	});

	// create three equal columns inside the button area and center the middle column
	let $btnArea = $(".nxDialogButtons");
	$btnArea.css({
		display: "flex",
		gap: "0"
	});

	let $leftCol = $("<div/>").css({ flex: "1", textAlign: "left" });
	let $midCol = $("<div/>").css({ flex: "1", textAlign: "center" });
	let $rightCol = $("<div/>").css({ flex: "1", textAlign: "right" });

	$btnArea.append($leftCol, $midCol, $rightCol);

	// middle column page navigation buttons
	$midCol.css("textAlign", "center");

	let fpObj = new nxButton($midCol, "firstPage", {
		label: "<<",
		value: "firstPage",
		callback: function() {
			$("#logTable").html("<div id='logTable'></div>");
			onPageBlock = 0;
			loadLogTable();
		}
	});

	let ppObj = new nxButton($midCol, "prevPage", {
		label: "<",
		value: "prevPage",
		callback: function() {
			$("#logTable").html("<div id='logTable'></div>");
			onPageBlock -= pageSize;
			if (onPageBlock < 0) onPageBlock = 0;
			loadLogTable();
		}
	});

	let npObj = new nxButton($midCol, "nextPage", {
		label: ">",
		value: "nextPage",
		callback: function() {
			$("#logTable").html("<div id='logTable'></div>");
			onPageBlock += pageSize;
			if (onPageBlock + pageSize > logRes.length) onPageBlock = logRes.length - pageSize;
			if (onPageBlock < 0) onPageBlock = 0;
			loadLogTable();
		}
	});

	let lpObj = new nxButton($midCol, "lastPage", {
		label: ">>",
		value: "lastPage",
		callback: function() {
			$("#logTable").html("<div id='logTable'></div>");
			onPageBlock = (logRes.length - pageSize);
			if (onPageBlock < 0) onPageBlock = 0;
			loadLogTable();
		}
	});

	// moving the standard refresh/close buttons into the right column
	$rightCol.append(
		$('#background_logDiagId_button_0'),
		$('#background_logDiagId_button_1')
	);

	// page size control in the left column
	let pageControlSel = /* html */`<span style="position: relative; top: -8px;">Page Size:&nbsp;</span><span id='pageDD'></span>`;
	$leftCol.append(pageControlSel);

	let pdjssel = new jsDropList($("#pageDD"), 'pageddselobj', {
		theme: 'backend',
		elements: [{ value: 5, label: "5" }, { value: 10, label: "10" }, { value: 20, label: "20" }, { value: 50, label: "50" }],
		initialValue: 10,
		onChange: function(_id, psVal) {
			pageSize = psVal;
			runFilter();
		}
	});


	// build reset filter button
	let clFilter = new nxButton('clFilterArea', 'clFilterId', {
		label: "Clear All Filters",
		callback: function() {
			logdiag.dismiss('close');
			logView("refresh");
		}
	});

	// remove old log entries button
	if (isSuper) {
		let logMaint = new nxButton('clFilterArea', 'lmId', {
			label: "Log Maintenance",
			callback: showLogMaint
		});
	}

	// insert default 'all' options for dropdowns
	$('#action_filter').append(new Option('<ALL ACTIONS>', ''));

	// Pre-populate the Action dropdown with specific entires which start as disabled until they are shown to be present in log list data
	const fullActionList = [
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

	// Ensure these disabled options exist in the dropdown and are disabled, but use original source data, not filtered
	fullActionList.forEach((act) => {
		let opt = new Option(act, act);
		opt.disabled = true;
		$('#action_filter').append(opt);
	});

	// build unique list of actions present in current log results and enable/add them to the action dropdown
	const actualActions = logRes.reduce((acc, r) => {
		const a = r && r.action;
		if (a && acc.indexOf(a) === -1) acc.push(a);
		return acc;
	}, []);

	// selective enabling of 'actions' list based on presence in the log data
	$('#action_filter option').map(function() {
		if (actualActions.includes(this.value) || this.text === "<ALL ACTIONS>") {
			this.disabled = false;
		} else {
			this.disabled = true;
		}
	});

	$('#location_filter').append(new Option('<ALL MODULES>', ''));
	$('#userName_filter').append(new Option('<ALL USERS>', ''));
	$('#userId_filter').append(new Option('<ALL USER IDS>', ''));

	// perform entry row array

	loadLogTable();

	function loadLogTable() {

		// control navigation button states
		let lastEntryVal = (onPageBlock + pageSize > logRes.length) ? logRes.length : onPageBlock + pageSize;

		if ((logRes.length - pageSize) < 0 || lastEntryVal === logRes.length) {
			lpObj.disable();
			npObj.disable()
		} else {
			lpObj.enable();
			npObj.enable();
		}

		if (onPageBlock === 0) {
			fpObj.disable();
			ppObj.disable();
		} else {
			fpObj.enable();
			ppObj.enable();
		}

		let elementsToAddArr = [];
		let iLimit = pageSize > logRes.length ? logRes.length : onPageBlock + pageSize;

		let filterObjs = $(".logFilters").map(function() { return this.id.split("_")[0]; }).toArray();
		for (const fItem of filterObjs) {
			if (curFilterSel !== fItem) {
				let $filterObj = $('#' + fItem + '_filter');
				if ($filterObj.length) {
					if ($filterObj.is('select')) {
						// remove all options except the first (keep "<ALL ...>" entry) and reset value
						if (fItem === "action" && $filterObj[0].value === "") {
							$filterObj.find('option').not(':first').prop('disabled', true);
						} else if ($filterObj[0].value === "") {
							$filterObj.find('option').not(':first').remove();
						}
					}
				}
			}
		}

		const sets = {};
		logRes.forEach(row =>
			Object.entries(row).forEach(([k, v]) => {
				if (v == null) return;
				if (typeof v === 'object') v = ('data' in v && typeof v.data === 'string') ? v.data : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
				(sets[k] || (sets[k] = new Set())).add(String(v));
			})
		);
		let uniqueDD = Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, [...s]]));

		if (Object.keys(uniqueDD).length !== 0) {

			// add each unique location (module) dropdowns based on submitted log data list
			uniqueDD.location.forEach((locEntry) => {
				if (!$('#location_filter option[value="' + locEntry + '"]').length) {
					$('#location_filter').append(new Option(locEntry, locEntry));
				}
			});

			// enable each unique action (module) dropdowns based on submitted log data list
			uniqueDD.action.forEach((actEntry) => {
				for (const j of document.getElementById('action_filter')) {
					if (j.value === actEntry) j.disabled = false;
				}
			});

			// add each unique userName (module) dropdowns based on submitted log data list
			uniqueDD.operatorName.forEach((unameEntry) => {
				if (!$('#userName_filter option[value="' + unameEntry + '"]').length) {
					$('#userName_filter').append(new Option(unameEntry, unameEntry));
				}
			});

			// add each unique userId (module) dropdowns based on submitted log data list
			uniqueDD.operatorId.forEach((uidEntry) => {
				if (!$('#userId_filter option[value="' + uidEntry + '"]').length) {
					$('#userId_filter').append(new Option(uidEntry, uidEntry));
				}
			});
		}

		for (let i = onPageBlock; i < iLimit; i++ in logRes) {
			let element = { ...logRes[i] };

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
			eHiddenData[i] = element.body.hiddenData;

			// Ensure hasOpt is declared before reuse below (strict mode safety)
			let hasOpt;

			// populate filter lists
			// hasOpt = false;
			// for (const j of document.getElementById('location_filter')) {
			// 	if (j.value === element.body.hiddenData.location) {
			// 		hasOpt = true;
			// 	}
			// }
			// if (!hasOpt) {
			// 	$('#location_filter').append(new Option(element.body.hiddenData.location, element.body.hiddenData.location));
			// }

			// populate username dropdown selection list
			// hasOpt = false;
			// for (const j of document.getElementById('userName_filter')) {
			// 	if (j.value === element.body.hiddenData.userName) {
			// 		hasOpt = true;
			// 	}
			// }
			// if (!hasOpt) {
			// 	$('#userName_filter').append(new Option(element.body.hiddenData.userName, element.body.hiddenData.userName));
			// }

			// // populate userId dropdown selection list
			// hasOpt = false;
			// for (const j of document.getElementById('userId_filter')) {
			// 	if (j.value === element.body.hiddenData.userId) {
			// 		hasOpt = true;
			// 	}
			// }
			// if (!hasOpt) {
			// 	$('#userId_filter').append(new Option(element.body.hiddenData.userId, element.body.hiddenData.userId));
			// }

			// // populate action dropdown selection list
			// for (const j of document.getElementById('action_filter')) {
			// 	if (j.value === element.body.hiddenData.action) {
			// 		j.disabled = false;
			// 	}
			// }
		}

		new JsSortableTable('logTable', 'logView', {
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

		// show number of entries found
		$('#logCount').html((`${logRes.length} entries found. Showing entries ${onPageBlock + 1} - ${lastEntryVal}.`));
		if (logRes.length + 1 < pageSize) $('#logCount').html(`Showing all ${logRes.length} entries found.`);
		if (logRes.length === 1) $('#logCount').html(`Showing the 1 entry found.`);
		if (logRes.length === 0) $('#logCount').html(`<span style='color: red; font-weight: bold;'>No entries found!</span>`);
	};

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
				theme: 'backend',
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
		// ensure logRes is a copy of logFullData, then work on a copy for filtering
		logRes = logFullData.slice();
		let logFiltered = logRes.slice();

		let filterIds = $(".logFilters").map(function() {
			return this.id.split("_")[0];
		}).toArray();

		// iterate backwards so splice() does not corrupt upcoming indices
		for (let lfCount = logFiltered.length - 1; lfCount >= 0; lfCount--) {

			// check each row against active filters; if any filter fails, remove the row
			const row = logFiltered[lfCount];
			let remove = false;

			for (const filterField of filterIds) {
				const fVal = $('#' + filterField + "_filter").val();
				if (!fVal || fVal === "") continue; // skip empty filters
				curFilterSel = filterField;

				if (filterField === "userName") {
					if (fVal !== row.operatorName) {
						remove = true;
						break;
					}
				} else if (filterField === "userId") {
					if (fVal !== row.operatorId) {
						remove = true;
						break;
					}
				} else if (filterField === "action") {
					if (fVal !== row.action) {
						remove = true;
						break;
					}
				} else if (filterField === "location") {
					if (fVal !== row.location) {
						remove = true;
						break;
					}
				} else if (filterField === "date") {
					if (!row.date || row.date.indexOf(fVal) === -1) {
						remove = true;
						break;
					}
				} else if (filterField === "text") {
					// row.body may be string or object; handle both
					let hay = "";
					if (typeof row.body === "string") hay = row.body;
					else if (row.body && typeof row.body === "object") hay = row.body.data || JSON.stringify(row.body);
					if (hay.toUpperCase().indexOf(fVal.toUpperCase()) === -1) {
						remove = true;
						break;
					}
				}
			}

			if (remove) {
				logFiltered.splice(lfCount, 1);
			}
		}

		/* date and text filter view control */
		$("#date_filter").datepicker("getDate") === null ? $("#dateClearBtn").hide() : $("#dateClearBtn").show(); // show date input clear button when required
		$("#text_filter").val() === "" ? $("#txtClearBtn").hide() : $("#txtClearBtn").show(); // show text input clear button when required

		logRes = logFiltered;

		$("#logTable").html("<div id='logTable'></div>");
		onPageBlock = 0;

		loadLogTable();
	}

	function showLogEntry(tableDataId, parentId, fieldDesc, logData) {
		let titleTxt = "LOG ENTRY CREATED: " + logData.date + " FOR USER: " + logData.userId + " (" + logData.userName + ")";
		let entryFmtd = logData.text;

		entryFmtd = "<textarea id='leTxt' readonly='true' style='width: 100%; height: 400px;'>" + entryFmtd + "</textarea>"; // wrap log entry in a textarea

		(function leGo(button) {
			switch (button) {
				// copy text to clipboard routine
				case 'cpToClip':
					(async () => {
						const textToCopy = "LOG ENTRY CREATED: " + logData.date + " FOR USER: " + logData.userId + " (" + logData.userName + ")\n" + (logData.text || "");

						try {
							// Preferred modern API
							if (navigator.clipboard && navigator.clipboard.writeText) {
								await navigator.clipboard.writeText(textToCopy);
							} else {
								// Fallback for older browsers / insecure contexts: use a temporary textarea + execCommand
								const ta = document.createElement('textarea');
								ta.value = textToCopy;
								// Prevent scrolling to bottom
								ta.style.position = 'fixed';
								ta.style.left = '-9999px';
								document.body.appendChild(ta);
								ta.focus();
								ta.select();

								const successful = document.execCommand && document.execCommand('copy');
								document.body.removeChild(ta);

								if (!successful) throw new Error('Fallback copy failed');
							}

							// Success dialog
							new nxDialog('cOk', {
								title: "Log Entry Copied",
								contents: "<p>Copied log entry data to clipboard.</p>",
								callback: leGo // reload log entry dialog
							});
						} catch (err) {
							// Failure dialog with manual copy hint
							new nxDialog('cFail', {
								title: "Copy Failed",
								contents: "<p>Could not copy to clipboard automatically. Please select the text and press Ctrl/Cmd+C to copy.</p>",
								callback: leGo
							});
						}
					})();
					break;

				// standard exit
				case 'ok':
					break;

				case 'next':
					let nextId = parseInt(tableDataId) + 1;
					(eHiddenData[nextId] === undefined) ? window.logEntryObj.disableButton('next') : window.logEntryObj.enableButton('next');
					showLogEntry(nextId, '', '', eHiddenData[nextId]);

					break;

				case 'prev':
					let prevId = parseInt(tableDataId) - 1;
					(eHiddenData[prevId] === undefined) ? window.logEntryObj.disableButton('prev') : window.logEntryObj.enableButton('prev');
					showLogEntry(prevId, '', '', eHiddenData[prevId]);

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

					// Selective older/newer button disabling when browsing through log entry interface
					let entryIdx = parseInt(tableDataId);
					let min = onPageBlock;
					let max = onPageBlock + pageSize > logRes.length ? logRes.length : onPageBlock + pageSize;

					(entryIdx + 1 >= max) ? window.logEntryObj.disableButton('next') : window.logEntryObj.enableButton('next'); // 'older' button
					(entryIdx - 1 < min) ? window.logEntryObj.disableButton('prev') : window.logEntryObj.enableButton('prev'); // 'newer' button

					break;
			}
		})();
	}
}

function userManagerHighlight(value, searchTerm) {
	const text = value === null || value === undefined ? '' : String(value);
	const escapedText = userMgrEscapeHtml(text);
	const escapedTerm = String(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return escapedTerm ? escapedText.replace(new RegExp(`(${escapedTerm})`, 'gi'), '<mark>$1</mark>') : escapedText;
}

function userManagerResultChips(items, searchTerm, emptyLabel) {
	if (!items.length) return `<span class="umSearchEmptyMeta">${emptyLabel}</span>`;
	return items.map((item) => `<span class="umSearchChip">${userManagerHighlight(item.name, searchTerm)}</span>`).join('');
}

async function openUserManagerSearch() {
	const searchDialog = new nxDialog('userManagerSearch', {
		buttons: [
			{label: 'Cancel', cancel: true, value: 'cancel'},
			{label: 'Search', default: true, value: 'search'}
		],
		contents: /* html */ `
			<div class="umSearchPrompt">
				<label for="userManagerSearchTerm">Search users and groups</label>
				<input type="text" id="userManagerSearchTerm" autocomplete="off" placeholder="Name, email address, or group">
				<p>Results include user email addresses, group memberships, and group members.</p>
			</div>`,
		datafields: ['userManagerSearchTerm'],
		mandatory: ['userManagerSearchTerm'],
		focus: 'userManagerSearchTerm',
		dataFormat: 'object',
		title: 'Search',
		returnPromise: true,
		width: 520
	});

	const response = await searchDialog;
	if (response.button !== 'search') return;
	const searchTerm = response.data.userManagerSearchTerm.trim();
	if (!searchTerm) return;
	const res = await startAjax('searchManager', {searchTerm: searchTerm});
	showUserManagerSearchResults(res.data, searchTerm);
}

function showUserManagerSearchResults(results, searchTerm) {
	const userCards = results.users.map((user) => /* html */ `
		<button type="button" class="umSearchCard umSearchUserResult" data-user-id="${user.id}">
			<span class="umSearchCardHead">
				<strong>${userManagerHighlight(user.name, searchTerm)}</strong>
				<span class="umSearchResultType">User</span>
			</span>
			<span class="umSearchEmail">${userManagerHighlight(user.email || 'No email address', searchTerm)}</span>
			<span class="umSearchMetaLabel">Groups</span>
			<span class="umSearchChips">${userManagerResultChips(user.groups, searchTerm, 'No groups')}</span>
		</button>`).join('');

	const groupCards = results.groups.map((group) => /* html */ `
		<button type="button" class="umSearchCard umSearchGroupResult" data-group-id="${group.id}" data-group-name="${userMgrEscapeHtml(group.name)}">
			<span class="umSearchCardHead">
				<strong>${userManagerHighlight(group.name, searchTerm)}</strong>
				<span class="umSearchResultType">Group</span>
			</span>
			<span class="umSearchMetaLabel">Users</span>
			<span class="umSearchChips">${userManagerResultChips(group.users, searchTerm, 'No users')}</span>
		</button>`).join('');

	const contents = /* html */ `
		<div class="umSearchResults">
			<div class="umSearchSummary">Results for <strong>${userMgrEscapeHtml(searchTerm)}</strong></div>
			<div class="umSearchColumns">
				<section class="umSearchSection">
					<div class="umSearchSectionHeader"><span>Users</span><strong>${results.users.length}</strong></div>
					<div class="umSearchList">${userCards || '<div class="umSearchNoResults">No matching users</div>'}</div>
				</section>
				<section class="umSearchSection">
					<div class="umSearchSectionHeader"><span>Groups</span><strong>${results.groups.length}</strong></div>
					<div class="umSearchList">${groupCards || '<div class="umSearchNoResults">No matching groups</div>'}</div>
				</section>
			</div>
		</div>`;

	const resultsDialog = new nxDialog('userManagerSearchResults', {
		buttons: [
			{label: 'New search', value: 'new'},
			{label: 'Close', cancel: true, default: true, value: 'close'}
		],
		contents: contents,
		title: 'Search results',
		width: 900,
		callback: function(button) {
			if (button === 'new') openUserManagerSearch();
		}
	});

	$('.umSearchUserResult').on('click', async function() {
		const userId = String($(this).data('user-id'));
		resultsDialog.dismiss();
		await groupSelChanged({id: -1, name: '<ALL USERS>'}, false);
		userSelChanged({id: userId});
	});

	$('.umSearchGroupResult').on('click', function() {
		const groupId = Number($(this).data('group-id'));
		const groupName = $(this).attr('data-group-name');
		resultsDialog.dismiss();
		groupSelChanged({id: groupId, name: groupName});
	});
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
	return startAjax('fetchUsers', {
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

function userMgrEscapeHtml(value) {
	return $('<div>').text(value === null || value === undefined ? '' : value).html();
}

function userMgrFormatValue(value) {
	return value === null || value === undefined || value === "" ? "&lt;no value&gt;" : userMgrEscapeHtml(value);
}

function userMgrAccountTypeLabel(type) {
	if (type === "LOCAL") return "Local account";
	if (type === "LDAP") return "LDAP account";
	if (type === "SAML") return "SAML account";
	return userMgrFormatValue(type);
}

function userMgrNormalizeAccountType(type) {
	const normalized = (type || '').toString().toUpperCase();
	return normalized === 'SAML' ? 'SSO' : normalized;
}

function userMgrUserListBadges(type) {
	const normalized = userMgrNormalizeAccountType(type);
	if (normalized === 'LDAP') {
		return '<span class="umUserAuthIcon" title="LDAP">L</span>';
	}
	if (normalized === 'SSO') {
		return '<span class="umUserAuthIcon" title="SSO">S</span>';
	}
	return '';
}

function userMgrAccountTypeFromListItem(item) {
	if (!item) return '';
	return item.acct_type || item.acctType || '';
}

function userMgrRoleFromListItem(item) {
	if (item.isSuper) return 'superadmin';
	if (item.isElevated) return 'elevated';
	if (item.isAdminOnly) return 'admin';
	return 'standard';
}

function userMgrRoleBadge(role) {
	const badges = {
		superadmin: {short: 'S', title: 'Superadmin'},
		admin: {short: 'A', title: 'Admin'},
		elevated: {short: 'EA', title: 'Elevated Admin'}
	};
	const badge = badges[role];
	return badge ? `<span class="umUserRoleBadge umUserRoleBadge-${role}" title="${badge.title}">${badge.short}</span>` : '';
}

function userMgrUserIcon() {
	return /* html */ `
		<svg class="umUserSymbol" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 12c2.58 0 4.67-2.09 4.67-4.67S14.58 2.66 12 2.66 7.33 4.75 7.33 7.33 9.42 12 12 12Z"></path>
			<path d="M4.5 21.34c.45-4.01 3.66-6.84 7.5-6.84s7.05 2.83 7.5 6.84"></path>
		</svg>
	`;
}

function userMgrGetRole(data) {
	if (superArr[data.name]) {
		return {
			key: "superadmin",
			label: "Superadmin"
		};
	}

	if (admArr[data.id]) {
		let accessDef = {};
		try {
			accessDef = typeof data.accessDef === "string" ? jsonDecode(data.accessDef) : (data.accessDef || {});
		} catch (e) {
			accessDef = {};
		}

		let elevated = !!(
			accessDef &&
			(
				(accessDef.c_items && accessDef.c_items["Elevated Administrator"]) ||
				(accessDef.items && accessDef.items.adminElevated)
			)
		);

		return {
			key: elevated ? "elevated" : "admin",
			label: elevated ? "Elevated Admin" : "Admin"
		};
	}

	return {
		key: "standard",
		label: "Standard"
	};
}

function userMgrGetElevatedSettingData(data) {
	if (superArr[data.name] || !admArr[data.id]) return null;

	let accessDef = {};
	try {
		accessDef = typeof data.accessDef === "string" ? jsonDecode(data.accessDef) : (data.accessDef || {});
	} catch (e) {
		accessDef = {};
	}

	if (!accessDef.c_items || accessDef.c_items["Elevated Administrator"] === undefined) return null;

	return {
		uid: data.id,
		name: data.name,
		id: "Elevated Administrator",
		fName: "Elevated Administrator",
		edit_type: "accessDef",
		updateType: "permission",
		value: accessDef.c_items["Elevated Administrator"],
		section: "c_items",
		perm: "Elevated Administrator"
	};
}

function userMgrUpdateLanguageFlag(lang) {
	let cleanLang = (lang || "").toString().toUpperCase();
	let flagMap = {
		DE: "🇩🇪",
		EN: "🇬🇧",
		FR: "🇫🇷"
	};
	let labelMap = {
		DE: "German",
		EN: "English",
		FR: "French"
	};
	let label = labelMap[cleanLang] || "";

	$('#umLangFlag')
		.toggleClass('is-empty', !cleanLang)
		.text(flagMap[cleanLang] || "")
		.attr('title', label)
		.attr('aria-label', label);
}

function userMgrSaveSetting(data, newVal, refresh = true) {
	let oldVal = data.value === undefined ? null : data.value;

	if (data.edit_type === "boolean") {
		oldVal = (data.value === "Enabled") ? 1 : 0;
		newVal = (newVal === true || newVal === "Enabled" || parseInt(newVal, 10) === 1) ? 1 : 0;
	}

	if (data.id === 'bad_logins') newVal = 0;
	if (data.id === 'last_bad_pass') newVal = "";

	let acctUpdateObj = {
		userId: data.uid,
		origUgId: ugId,
		fieldName: data.id,
		oldVal: oldVal,
		newVal: newVal,
		updateType: data.updateType,
		section: data.section || "",
		perm: data.perm || ""
	};

	return startAjax('updatePerms', acctUpdateObj).then((res) => {
		gui.statusBar.setStatus("User successfully updated.", 2500, '#0A0');
		startAjax('fetchUsergroups', {});

		if (res.loadUg !== ugId && res.loadUg !== undefined) groupSelChanged({
			id: res.loadUg,
			name: res.ugName
		}, true);

		if (refresh && ('data' in res)) {
			startAjax('fetchPerms', {
				id: res.data.userId,
				selectedUg: res.loadUg
			});
		}

		return res;
	});
}

function userMgrBuildSettingData(acctPropModel, data, key, value) {
	return {
		uid: data.id,
		name: data.name,
		id: key,
		userGroups: data.userGroups,
		fName: acctPropModel[key]['fName'],
		edit_type: acctPropModel[key]['type'],
		updateType: "account",
		optList: acctPropModel[key]['optList'] || "",
		value: value
	};
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
	let userRole = userMgrGetRole(data);
	let elevatedSetting = userMgrGetElevatedSettingData(data);
	let lockOwnAdminStatus = selName === myName && (admArr[data.id] || superArr[data.name]);

	gui.userAdminView.clearElements();
	$('#acctPropList').show().html( /* html */ `
		<div class="umAccountCard">
			<div class="umAccountInfo umRole-${userRole.key}">
				<div class="umAccountAvatar">${userMgrUserIcon()}</div>
				<div class="umAccountInfoMain">
					<div class="umAccountName">${userMgrEscapeHtml(data.name)}</div>
					<div class="umAccountMeta">
						<span>ID ${userMgrEscapeHtml(data.id)}</span>
						<span>${userMgrEscapeHtml(userRole.label)}</span>
						<span>${userMgrAccountTypeLabel(data.acct_type)}</span>
						<span class="umStatusPill ${data.status === "Enabled" ? "is-enabled" : "is-disabled"}">${data.status === "Enabled" ? "Enabled" : "Disabled"}</span>
					</div>
				</div>
			</div>
			<div class="umSettingsList" id="umSettingsList"></div>
		</div>
	`);

	let lockedForAdminPeer = selName !== myName && isAdmin && !isAE && (admArr[selId]);
	let rowData = {};
	$.each(data, function(key, value) {
		if (!acctPropModel[key] || ['accessDef', 'id', 'acct_type'].includes(key)) return;
		if (key === 'homeaccess' && (superArr[data.name] || admArr[data.id])) return;
		rowData[key] = userMgrBuildSettingData(acctPropModel, data, key, value);
	});

	function addSettingRow(key, controlHtml, helpHtml = "") {
		if (!rowData[key]) return;
		$('#umSettingsList').append( /* html */ `
			<div class="umSettingRow" data-setting="${key}">
				<div class="umSettingLabel">${userMgrEscapeHtml(rowData[key].fName)}${key === 'homeaccess' ? ' <span id="umHomeAccessHelp"></span>' : ''}</div>
				<div class="umSettingValue">${controlHtml}</div>
				${helpHtml}
			</div>
		`);
	}

	function addCustomSettingRow(key, label, controlHtml, helpHtml = "") {
		$('#umSettingsList').append( /* html */ `
			<div class="umSettingRow" data-setting="${key}">
				<div class="umSettingLabel">${userMgrEscapeHtml(label)}</div>
				<div class="umSettingValue">${controlHtml}</div>
				${helpHtml}
			</div>
		`);
	}

	addSettingRow('name', `<button type="button" class="umValueButton" data-edit-setting="name">${userMgrFormatValue(data.name)}</button>`);
	addSettingRow('email', `<button type="button" class="umValueButton" data-edit-setting="email">${userMgrFormatValue(data.email)}</button>`);
	addSettingRow('status', `<div id="umStatusSwitch" class="umInlineSwitch"></div>`);
	if (elevatedSetting) {
		addCustomSettingRow('elevatedAdmin', 'Elevated Administrator', `<div id="umElevatedSwitch" class="umInlineSwitch"></div>`, /* html */ `
			<div class="umSettingHelp umElevatedHelpIntro">
				<span class="umElevatedHelpBadge">Role permission</span>
				<span class="umElevatedHelpText">Allows trusted admins to manage other administrator accounts.</span>
				<span id="umElevatedHelp"></span>
			</div>
		`);
	}
	addSettingRow('homeaccess', `<div id="umHomeSwitch" class="umInlineSwitch"></div>`);
	addSettingRow('bad_logins', /* html */ `
		<span class="umReadonlyValue umReadonlyValueSmall">${userMgrFormatValue(data.bad_logins)}</span>
		<button type="button" class="umIconButton" id="umResetBadLogins" title="Reset bad login counter to zero">&#8634;</button>
	`);
	addSettingRow('last_bad_pass', `<span class="umReadonlyValue umReadonlyValueSmall">${userMgrFormatValue(data.last_bad_pass)}</span>`);
	addSettingRow('defLang', `<div class="umLangControl"><span id="umLangFlag" class="umLangFlag is-empty" aria-hidden="true"></span><select class="umInlineSelect" id="umLangSelect"></select></div>`);
	addSettingRow('userGroups', `<button type="button" class="umValueButton" data-edit-setting="userGroups">View and edit</button>`);

	// reset the innerHTML content of our target button DIV or else the centering will be off after multiple calls to this case
	$('#pwdResetBox').html('').hide();

	// pwd reset button will be disabled if the account is not type LOCAL; and conditionally for certain admin conditions
	let disablePwdReset = data.acct_type !== "LOCAL";
	if (!isAE && isAdmin && admArr[data.id]) disablePwdReset = true;
	if (myName === data.name && data.acct_type === "LOCAL") disablePwdReset = false;

	if (data.acct_type === "LOCAL") {
		addCustomSettingRow('password', 'Password', `<button type="button" class="umValueButton" id="umPwdResetButton"${disablePwdReset ? ' disabled' : ''}>Reset password</button>`);
		$('#umPwdResetButton').on('click', function() {
			if (disablePwdReset) return;
			passReset(data.id, data.name);
		});
	}

	if (lockedForAdminPeer) {
		$('#umSettingsList').addClass('umSettingsLocked');
		$('#umSettingsList button, #umSettingsList select').prop('disabled', true);
		$('#umSettingsList').find('.jstsContainer').addClass('locked');
	}

	$('[data-edit-setting]').on('click', function() {
		if (lockedForAdminPeer) return;
		edit_acct_setting(rowData[$(this).data('edit-setting')]);
	});

	if (document.getElementById('umHomeAccessHelp')) {
		new OasysHelp('umHomeAccessHelp', {
			htmlContent: '<p>When this option is active, the user can create root-level folders in the Content, Test and Test Taker managers. When it is inactive, the user can only work inside folders they are allowed to access.</p>',
			title: 'Home folder create'
		});
	}

	if (document.getElementById('umElevatedHelp')) {
		new OasysHelp('umElevatedHelp', {
			htmlContent: OasysHelp.layout({
				lead: 'Elevated administrator is a stronger admin role for trusted operators who may act on other administrator accounts.',
				items: [{
					title: 'User administration:',
					text: 'Add users to, or remove users from, the admin user group.'
				}, {
					title: 'Admin accounts:',
					text: 'Modify, disable, or delete other administrator accounts.'
				}, {
					title: 'New admins:',
					text: 'Create administrator accounts directly in the admin user group.'
				}, {
					title: 'System and backup:',
					text: 'Access additional system settings and manage backup archive files.'
				}],
				caution: 'Enable this only for administrators who should be allowed to perform sensitive account and backup actions.'
			}),
			title: 'Elevated Administrator'
		});
	}

	if (rowData.status) {
		new jsToggleswitch($('#umStatusSwitch'), 'um_status_ts', {
			dataId: 'ActSetVal',
			height: 20,
			width: 60,
			background: 'images/ic_ui_toggleswitch.png',
			readOnly: lockedForAdminPeer || lockOwnAdminStatus,
			changeCallback: function(_sender, checked) {
				if (checked === false && selName === myName) {
					$('#umStatusWarning').remove();
					$('[data-setting="status"]').append( /* html */ `
						<div class="umSettingWarning" id="umStatusWarning">Disabling your own account will lock you out immediately after the change is saved.</div>
					`);
				} else {
					$('#umStatusWarning').remove();
				}
				userMgrSaveSetting(rowData.status, checked);
			}
		}, data.status === "Enabled");
	}

	if (rowData.homeaccess) {
		new jsToggleswitch($('#umHomeSwitch'), 'um_home_ts', {
			dataId: 'ActSetVal',
			height: 20,
			width: 60,
			background: 'images/ic_ui_toggleswitch.png',
			readOnly: lockedForAdminPeer,
			changeCallback: function(_sender, checked) {
				userMgrSaveSetting(rowData.homeaccess, checked);
			}
		}, data.homeaccess === "Enabled");
	}

	if (elevatedSetting) {
		new jsToggleswitch($('#umElevatedSwitch'), 'um_elevated_ts', {
			dataId: 'permSetVal',
			height: 20,
			width: 60,
			background: 'images/ic_ui_toggleswitch.png',
			readOnly: lockedForAdminPeer || !isSuper,
			changeCallback: function(_sender, checked) {
				userMgrSaveSetting(elevatedSetting, checked);
			}
		}, elevatedSetting.value === true);
	}

	if (rowData.defLang) {
		let langs = dataOpts.langs || {};
		$('#umLangSelect').append(`<option value="">&lt;No language set&gt;</option>`);
		for (const key in langs) {
			$('#umLangSelect').append(`<option value="${userMgrEscapeHtml(key)}">${userMgrEscapeHtml(langs[key])}</option>`);
		}
		$('#umLangSelect').val(data.defLang || "");
		userMgrUpdateLanguageFlag(data.defLang || "");
		$('#umLangSelect').on('change', function() {
			userMgrUpdateLanguageFlag($(this).val());
			userMgrSaveSetting(rowData.defLang, $(this).val());
		});
	}

	$('#umResetBadLogins').on('click', function() {
		userMgrSaveSetting(rowData.bad_logins, 0);
	});
}

// parse JSON accessDef and add to users jsSortableTable view
function parseAccessDef(data) {
	// # ------------------------ #
	// # HANDLE 'PERMISSION' DATA #
	// # ------------------------ #
	$('#userPermsTbText').html('');

	// loop perm object
	let addedPermRows = 0;
	$.each(data, function(_key, objValue) {
		for (let section in objValue) {
			if (section.substring(0, 2) !== "c_") continue; // skip any entry that isn't a concept permisison entry
			for (let entry in objValue[section]) {
				if (entry === "Elevated Administrator") continue;
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
				addedPermRows++;
			}
		}
	});

	if (addedPermRows === 0) {
		$('#permissionList').hide();
		return;
	}

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
			`<div class="userSettingsDialog umEditDialog">
				<div class="umDialogHero">
					<div class="umDialogKicker">${data.id === "userGroups" ? "User group membership" : "Account setting"}</div>
					<div class="umDialogTitle">${data.id === "userGroups" ? userMgrEscapeHtml(data.name.toString()) : userMgrEscapeHtml(data.fName)}</div>
					<div class="umDialogMeta">${data.id === "userGroups" ? "View and edit the groups assigned to this user." : userMgrEscapeHtml(data.name.toString())}</div>
				</div>
				<div class="umDialogField" id="settingsView">
					<label>Value</label>
					<div id="setting" class="umDialogSetting"></div>
				</div>
				<div style='display: none;' id='xtraPropInfo' class="umSettingWarning"></div>
			</div>
			`;

		let acctEditDialogData = {
			buttons: btnArr,
			contents: editAcctHTML,
			title: data.id === "userGroups" ? `User Group Membership` : `Edit ${data.fName}`,
			width: data.id === "userGroups" ? 620 : 480,
			callback: edit_acct_setting
		};
		window.editSetDialog = new nxDialog('editSetDialog', acctEditDialogData, arguments);

		let jqSetObj = $('#setting');

		// Different types of display and input based on if it is editable and what type of data type the variable is
		switch (data.edit_type) {
			case 'string':
				if (data.value === null) data.value = ""; // email addresses sometimes come back as null and we don't want to display the string 'null' in the edit value dialog box

				jqSetObj.html(`<input id='strInput' type='text' value='${userMgrEscapeHtml(data.value)}'>`);
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

				$('#settingsView').prepend( /* html */ `
					<div class="umGroupFilterRow">
						<label for="ugFilter">Filter user groups</label>
						<input id='ugFilter' type='text' placeholder='Search groups'>
					</div>
				`);

				$('#ugFilter').on('input', function() {
					let filterVal = $(this).val();

					$("div#setting label").each(function(i, v) {
						if ($(v).html().toLowerCase().includes(filterVal.toLowerCase())) {
							$(v).closest('.umGroupChoice').show();
						} else {
							$(v).closest('.umGroupChoice').hide();
						}
						if (filterVal === "") {
							$(v).closest('.umGroupChoice').show();
						}
					});

				});

				for (const key in data.optList.ugList) {
					if (data.optList.ugList.hasOwnProperty(key)) {
						const ugroup = data.optList.ugList[key];
						const roleGroupClass = ugroup.label === "superadmin" ? " umGroupChoiceSuperadmin" : (ugroup.label === "admin" ? " umGroupChoiceAdmin" : "");
						jqSetObj.append(`<div class="umGroupChoice${roleGroupClass}" id='div_${ugroup.value}'><input type='checkbox' class="ugcb_array" data-dbId=${ugroup.value} id=ugcb_${ugroup.value} /><label for='ugcb_${ugroup.value}'>${userMgrEscapeHtml(ugroup.label)}</label></div>`);

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
						theme: 'backend',
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
			userMgrSaveSetting(data, val);
		}
	}
}

function passReset(userId, userName, button, newPass) {
	// FYI: DATAFIELDS LINKS TO THE ID OF THE INPUT ELEMENT
	if (!button) {
		let pwdDialogData = {
			buttons: [{
				label: "Cancel",
				value: 'cancel',
				'cancel': true
			},
			{
				label: "Update password",
				value: "ok",
				disabled: true
			}
			],
			contents: /* html */ `
				<div class="umPasswordDialog">
					<div class="umDialogHero">
						<div class="umDialogKicker">Password reset</div>
						<div class="umDialogTitle">${userMgrEscapeHtml(userName)}</div>
						<div class="umDialogMeta">Local account password</div>
					</div>
					<label class="umPasswordLabel" for="newPwdInput">New password</label>
					<input type='text' id='newPwdInput' autocomplete="new-password">
					<div class="umPasswordHint">Use at least 8 characters with upper, lower and numeric values, or 12+ characters of any type.</div>
					<div id='pwdResetWarning'></div>
				</div>
			`,
			title: "Reset Account Password",
			datafields: ["newPwdInput"],
			mandatory: ["newPwdInput"],
			focus: "newPwdInput",
			width: 520,
			callback: passReset
		};

		let pwdDiag = new nxDialog('pwdDiagObj', pwdDialogData, arguments);

		// password handler input validation and warning
		$('#newPwdInput').on("input", function() {

			// no zero-len pwds
			if ($(this).val().length === 0) {
				$('#pwdResetWarning').html('');
				pwdDiag.disableButton('ok');
			} else {
				// regex checks for: mix of upper/lower/num + 8 chars in len+, OR 12 chars in len+
				if (/(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z]).{8,}|.{12,}/.test($(this).val()) === false) {
					$('#pwdResetWarning').html("WARNING: This is an insecure password. It is recommended to use a mix of capital, lower, and numeric values with at least 8 characters, or a minimum of any 12 characters.");
				} else {
					$('#pwdResetWarning').html('');
				}

				if (userName === $(this).val()) {
					$('#pwdResetWarning').html($('#pwdResetWarning').html() + ($('#pwdResetWarning').html() === "" ? "" : "<br><br>") + "WARNING: It is not recommended to use the same value for both username and password.");
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
				<div id="group_editor_view" style="display: block; width: 100%; border-collapse: collapse; margin: 0 auto;">
					<div style="display: table;">
						<div class="tRow">
							<span class="eg_row_title">MODULE ACCESS FOR:</span>
							<span id="fld_name" class="tData">${ugName}</span>
						</div>
					</div>
					<div class="regData tCellEdit" id="grpSetDropdown"></div>
				</div>
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
				theme: 'backend',
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

				// settingDD.addElement(usetting, usetting);

				// setup outer jsSelect List to populate with toggle switches
				edtSelListObj[usetting] = new jsSelectList($('#grpSetDropdown'), 'TSentryID_' + usetting, {});

				// iterate and show editor permissions for group; show info msg if no modules found
				if (settingEntry.length === 0) {
					$("#grpSetDropdown").html("<div style='display: block; text-align: center; color: #505050;'>No Oasys modules found.</div>");
					editGroupDialog.disableButton("save");
					return;
				}

				for (const entryName in settingEntry) {

					const valObj = settingEntry[entryName];
					let labelName = (usetting === "editorButtons") ? valObj.name : entryName;
					const trueVal = (usetting === "editorButtons") ? valObj.value : valObj;

					let ro = valObj.ro ?? false;

					labelName += ((ro) ? ` [&nbsp;<span style='color: red; font-style: italic;'>blocked by access level</span>&nbsp;]` : "");

					TSobj[entryName] = insertToggleswitch($('#TSentryID_' + usetting), 'edtTs_' + entryName, labelName, {
						dataId: {
							label: entryName + ((ro) ? `*` : ""),
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
            <div class="tmDialogForm">
                <div class="tmDialogFormField">
                    <label for="groupNewName">Group name</label>
                    <input type="text" id="groupNewName" value="${ugName}">
                    <input type="hidden" id="groupId" value=${ugId}>
                </div>
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
		let message = "<div class='deleteConfirm'>\
        <div class='deleteConfirmText'><p>Are you sure you want to remove this group completely?</p></div>\
        <p class='deleteConfirmWarning'>NOTE! Continuing will remove all existing permission associations for this group in items, tests, and test taker modules.</p>\
        <p id='naWarning' class='deleteConfirmWarning' style='display: none;'>Additionally, the following user(s) will not have any Oasys functionality after group deletion until they are added to another group:</p>\
        <div id='naList' class='deleteConfirmText' style='display: none; font-style: italic; font-weight: bolder'></div>\
        </div>";

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
				$('#naList').html(naList).show();
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

		let message = "<div class='deleteConfirm'><div class='deleteConfirmText'><p>Are you sure you want to delete this user?</p></div></div>";

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
							theme: 'backend',
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
						let nofObj = new JsSortableTable(`o_fList${fCount}`, `oflId${fCount}`, {
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
								theme: 'backend',
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
	let createGroupHTML = /* html */ `
	<div class="users_addDialog users_addUserDialog users_addGroupDialog">
		<div class="umDialogFormTile">
			<label for="groupName">Group name</label>
			<input type="text" id="groupName" autocomplete="off">
		</div>
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
		width: 460,
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
				if (!res || res.error) return;
				let loadGroup = res.loadUg;
				// refresh our group list
				startAjax('fetchUsergroups', {}).then((res2) => {
					if (!res2 || res2.error) return;

					// set global ugName to new group
					const newGroup = res2.data.find(obj => parseInt(obj.id, 10) === parseInt(loadGroup, 10));
					if (!newGroup) return;
					ugName = newGroup.name;

					// change to new group
					groupSelChanged({
						id: loadGroup,
						name: ugName
					});

					// highlight the newly added userGroup
					gui.statusBar.setStatus("New group successfully added.", 2500, '#0A0');
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
	let addUserTitle = 'Add New User to ' + userMgrEscapeHtml(ugDisp);

	let createUserHTML = /* html */ `
	<div class="users_addDialog users_addUserDialog">
		<input type="hidden" id="userGroupId" value='${userMgrEscapeHtml(ugId)}'>
		<div class="umDialogFormTile">
			<label for="nu_edt_uname">Username</label>
			<input type="text" id="nu_edt_uname" autocomplete="off">
		</div>
		<div class="umDialogFormTile" id="pwdRow">
			<label for="nu_edt_pwd">Password</label>
			<input type="text" id="nu_edt_pwd" autocomplete="new-password">
			<div id="pwdWarning"></div>
		</div>
		<div class="umDialogFormTile" id="emailRow">
			<label for="nu_edt_eml">Email address</label>
			<input type="text" id="nu_edt_eml" autocomplete="off">
		</div>
		<div class="umDialogFormTile">
			<label>Account type</label>
			<div id="acctType"></div>
			<input type="hidden" id="acctTypeVal" value=''>
		</div>
	</div>
	`;

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
		title: addUserTitle,
		width: 460,
		callback: saveNewUser
	};
	let createUserDialog = new nxDialog('createUserDialog', createUserDialogData);

	let acTypeDD = new jsDropList($('#acctType'), 'acType', {
		theme: 'backend',
		width: '100%',
		onChange: function(_vType, val) {
			if (val !== 'LOCAL') {
				$('#pwdRow').hide();
				$('#nu_edt_pwd').val('');
				$('#nu_edt_pwd').attr('disabled', 'disabled');
				$('#pwdWarning').hide().html('');
				$('#nu_edt_uname').trigger('focus');
			} else {
				$('#pwdRow').show();
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

function openImportUsersDialog() {
	let importState = {
		rows: [],
		validRows: [],
		groups: [],
		selectedGroupId: 0
	};
	let importFlowBusy = false;

	const dlg = new nxDialog("import_users_dialog", {
		width: 1150,
		title: "Import users",
		contents: `
			<div id="iuShell" class="imp-shell">
				<div id="iuStepDrop" style="flex:1;display:flex;">
					<div id="iuDrop" class="imp-drop" tabindex="0" role="button" aria-label="Drop CSV file here or choose one">
						<div class="imp-drop-inner">
							<div class="imp-icon" aria-hidden="true">⬆️</div>
							<div class="imp-title">Drop CSV here</div>
							<div class="imp-or">or</div>
							<label class="imp-choose" id="iuChooseLbl" for="iuFileInput">Select import file…</label>
							<input id="iuFileInput" type="file" accept=".csv,text/csv" hidden />
							<div class="imp-hint">
								CSV with columns <code>username</code>, <code>email</code>, <code>login_type</code>, <code>password</code>
								<br><a href="#" id="iuExampleLink">Download example CSV</a>
							</div>
						</div>
					</div>
				</div>

				<div id="iuTilesWrap" style="display:none;">
					<div class="imp-tiles">
						<div class="imp-tile imp-ok" id="iuTileValid">
							<div class="imp-tile-num" id="iuValidNum">0</div>
							<div class="imp-tile-label">Valid users</div>
						</div>
						<div class="imp-tile" id="iuTileInvalid">
							<div class="imp-tile-num" id="iuInvalidNum">0</div>
							<div class="imp-tile-label">Invalid rows</div>
						</div>
						<div class="imp-tile" id="iuTileTotal">
							<div class="imp-tile-num" id="iuTotalNum">0</div>
							<div class="imp-tile-label">Parsed rows</div>
						</div>
					</div>
				</div>

				<div id="iuOptions" style="display:none; border:1px solid #e7e7e7; border-radius:10px; padding:10px 12px; background:#fafafa;">
					<table style="width:100%;">
						<tr>
							<td style="width:230px;">Assign imported users to group: <span style="color:#b00020;font-weight:bold;" title="Required">*</span></td>
							<td>
								<select id="iuGroupSelect" style="min-width:260px;"></select>
								<span id="iuGroupRequired" style="display:none;margin-left:10px;color:#b00020;font-size:12px;">Required</span>
							</td>
						</tr>
						<tr>
							<td>Create home folders:</td>
							<td><label><input type="checkbox" id="iuCreateHome"> Create root-level folders in Content, Test and Test Taker managers</label></td>
						</tr>
						<tr>
							<td>Folder group access:</td>
							<td><label><input type="checkbox" id="iuGrantRead" disabled> Grant read access to the selected group for each home folder</label></td>
						</tr>
					</table>
				</div>

				<div id="iuDetails" style="display:none; flex:1; overflow:auto; border:1px solid #e7e7e7; border-radius:10px;">
					<div class="export-table-wrap">
						<table class="tbl">
							<thead class="tbl-head">
								<tr>
									<th style="width:20%;">Username</th>
									<th style="width:23%;">Email</th>
									<th style="width:12%;">Login type</th>
									<th style="width:12%;">Password</th>
									<th style="width:33%;">Status / Reason</th>
								</tr>
							</thead>
							<tbody id="iuPreviewBody"></tbody>
						</table>
					</div>
				</div>
			</div>
		`,
		buttons: [
			{ label: "Close", value: "cancel", cancel: true },
			{ label: "Import users", value: "import", 'default': true, disabled: true, keepOpen: true }
		],
		callback: async function(button) {
			if (button !== "import") return;
			runImportUsersFlow();
		}
	});

	async function runImportUsersFlow(retryGroupCommit = false) {
		if (importFlowBusy) return;
		importFlowBusy = true;
		try {
			validateImportReady();
			const groupId = importState.selectedGroupId;
			if (!groupId) {
				if (retryGroupCommit) {
					importFlowBusy = false;
					setTimeout(() => runImportUsersFlow(false), 80);
					return;
				}
				showMessage("Import users", "Please select a regular user group.");
				return;
			}

			const payload = {
				users: importState.validRows.map(row => ({
					username: row.username,
					email: row.email,
					login_type: row.login_type,
					password: row.password
				})),
				options: {
					userGroupId: groupId,
					createHomeFolder: $('#iuCreateHome').is(':checked'),
					grantGroupRead: $('#iuGrantRead').is(':checked')
				}
			};

			const preflightPayload = JSON.parse(JSON.stringify(payload));
			preflightPayload.options.dryRun = true;
			const preflight = await startAjax('importUsers', preflightPayload);
			if (!preflight || preflight.error) return;

			new nxDialog("import_users_confirm", {
				width: 560,
				title: "Confirm user import",
				icon: "../images/warning.png",
				iconWidth: 64,
				contents: `<p><strong>${importUsersEscapeHtml(importState.validRows.length)} backend users will be created.</strong></p>
					<p>This import is all-or-nothing. If a username or home folder conflict is found, no users or folders will be created.</p>`,
				buttons: [
					{ label: "Cancel", value: "cancel", cancel: true, 'default': true },
					{ label: "Create users", value: "ok" }
				],
				callback: async function(confirmButton) {
					if (confirmButton !== "ok") return;
					const res = await startAjax('importUsers', payload);
					if (!res || res.error) return;

					const refreshGroupId = (typeof ugId !== "undefined" && ugId !== null) ? ugId : payload.options.userGroupId;
					const refreshGroup = importState.groups.find(group => parseInt(group.id, 10) === parseInt(refreshGroupId, 10));

					dlg.dismiss();
					startAjax('fetchUsergroups', {}).then(() => {
						groupSelChanged({
							id: refreshGroupId,
							name: refreshGroup?.name
						});
					});
				}
			});
		} finally {
			importFlowBusy = false;
		}
	}

	startAjax('fetchImportUserGroups', {}).then((res) => {
		if (!res || res.error) return;
		importState.groups = res.groups || [];
		const $sel = $('#iuGroupSelect').empty();
		$sel.append(`<option value="">Select user group...</option>`);
		importState.groups.forEach(group => {
			$sel.append(`<option value="${importUsersEscapeHtml(group.id)}">${importUsersEscapeHtml(group.name)}</option>`);
		});
		validateImportReady();
	});

	const drop = document.getElementById('iuDrop');
	const fileIn = document.getElementById('iuFileInput');
	const label = document.getElementById('iuChooseLbl');

	$('#iuExampleLink').on('click', function(e) {
		e.preventDefault();
		downloadImportUsersExampleCsv();
	});

	$('#iuCreateHome').on('change', function() {
		const checked = $(this).is(':checked');
		$('#iuGrantRead').prop('disabled', !checked);
		if (!checked) $('#iuGrantRead').prop('checked', false);
		validateImportReady();
	});
	$('#iuGrantRead').on('change', validateImportReady);
	$('#iuGroupSelect').on('change input click keyup blur', validateImportReady);
	validateImportReady();

	['background_import_users_dialog_button_1', 'import_users_dialog_button_1'].forEach(buttonId => {
		const buttonEl = document.getElementById(buttonId);
		if (!buttonEl) return;
		['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
			buttonEl.addEventListener(ev, function(e) {
				e.preventDefault();
				e.stopImmediatePropagation();
				runImportUsersFlow(true);
			}, true);
		});
	});

	const resetInput = () => { fileIn.value = ''; };
	const setBusy = (on) => drop.classList.toggle('is-busy', !!on);

	drop.addEventListener('click', (e) => {
		if (!e.target.closest('#iuChooseLbl') && !e.target.closest('#iuExampleLink')) {
			resetInput();
			fileIn.click();
		}
	});
	label.addEventListener('click', (e) => { e.stopPropagation(); resetInput(); });
	drop.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			resetInput();
			fileIn.click();
		}
	});

	['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
		e.preventDefault();
		e.stopPropagation();
		drop.classList.add('is-drag');
	}));
	['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
		e.preventDefault();
		e.stopPropagation();
		drop.classList.remove('is-drag');
	}));
	drop.addEventListener('drop', (e) => handleImportUsersFiles(e.dataTransfer.files));
	fileIn.addEventListener('change', (e) => handleImportUsersFiles(e.target.files));

	async function handleImportUsersFiles(files) {
		if (!files || !files.length) return;
		setBusy(true);
		try {
			const text = await importUsersReadFileAsText(files[0]);
			const parsed = parseImportUsersCsv(text);

			if (parsed.errors.length) {
				new nxDialog("import_users_bad_csv", {
					width: 560,
					title: "Invalid CSV",
					contents: `<div class="imp-error">${parsed.errors.map(importUsersEscapeHtml).join('<br>')}</div>`,
					buttons: [{ label: "OK", value: "ok", 'default': true }]
				});
				return;
			}

			const prepared = prepareImportUsersRows(parsed.rows);
			importState.rows = prepared.rows;
			importState.validRows = prepared.rows.filter(row => row.valid);

			renderImportUsersPreview(importState.rows);
			$('#iuValidNum').text(String(importState.validRows.length));
			$('#iuInvalidNum').text(String(importState.rows.length - importState.validRows.length));
			$('#iuTotalNum').text(String(importState.rows.length));

			$('#iuTileValid').toggleClass('imp-ok', importState.validRows.length > 0);
			$('#iuTileInvalid').toggleClass('imp-bad', importState.rows.length !== importState.validRows.length);
			$('#iuTileInvalid').toggleClass('imp-ok', importState.rows.length === importState.validRows.length);
			$('#iuTileTotal').addClass('imp-ok');

			$('#iuStepDrop').hide();
			$('#iuTilesWrap').show();
			$('#iuOptions').show();
			$('#iuDetails').show();
			validateImportReady();
		} finally {
			setBusy(false);
		}
	}

	function validateImportReady() {
		importState.selectedGroupId = parseInt($('#iuGroupSelect').val(), 10) || 0;
		const hasGroup = importState.selectedGroupId > 0;
		$('#iuGroupRequired').toggle(!hasGroup);
		$('#iuGroupSelect').css('border', hasGroup ? '' : '2px solid #b00020');

		const hasValidCsv = importState.rows.length > 0
			&& importState.rows.length === importState.validRows.length
			&& importState.validRows.length > 0;

		if (hasValidCsv) {
			dlg.enableButton('import');
		} else {
			dlg.disableButton('import');
		}
		setImportUsersButtonVisualState(hasValidCsv && hasGroup);
	}
}

function setImportUsersButtonVisualState(enabled) {
	const $buttonBg = $('#background_import_users_dialog_button_1');
	if (!$buttonBg.length) return;
	$buttonBg.css({
		opacity: enabled ? '' : '0.45',
		filter: enabled ? '' : 'grayscale(1)',
		cursor: enabled ? '' : 'not-allowed'
	});
	$buttonBg.attr('title', enabled ? '' : 'Select a user group before importing users.');
}

function parseImportUsersCsv(text) {
	const rows = [];
	const errors = [];
	let i = 0;
	let field = '';
	let inQ = false;
	let row = [];

	const flushField = () => { row.push(field); field = ''; };
	const flushRow = () => {
		if (row.length === 1 && row[0].trim() === '') {
			row = [];
			return;
		}
		rows.push(row);
		row = [];
	};

	while (i < text.length) {
		const c = text[i++];
		if (inQ) {
			if (c === '"') {
				if (text[i] === '"') {
					field += '"';
					i++;
				} else {
					inQ = false;
				}
			} else {
				field += c;
			}
		} else {
			if (c === '"') inQ = true;
			else if (c === ',') flushField();
			else if (c === '\n') { flushField(); flushRow(); }
			else if (c === '\r') { /* ignore */ }
			else field += c;
		}
	}
	flushField();
	flushRow();

	if (inQ) errors.push("CSV contains an unterminated quoted field.");
	if (!rows.length) errors.push("No rows found in CSV file.");

	const header = rows.shift() || [];
	const normalizedHeader = header.map((v, idx) => {
		let headerValue = String(v || '').trim().toLowerCase();
		if (idx === 0) headerValue = headerValue.replace(/^\uFEFF/, '');
		return headerValue;
	});
	const expected = ['username', 'email', 'login_type', 'password'];
	if (normalizedHeader.length !== expected.length || expected.some((name, idx) => normalizedHeader[idx] !== name)) {
		errors.push("CSV header must be exactly: username,email,login_type,password");
	}

	const dataRows = rows.map((cols, idx) => {
		if (cols.length !== expected.length) {
			errors.push(`Row ${idx + 2} must contain exactly ${expected.length} columns.`);
		}
		return {
			line: idx + 2,
			username: (cols[0] || '').trim(),
			email: (cols[1] || '').trim(),
			login_type: (cols[2] || '').trim().toUpperCase(),
			password: cols[3] || ''
		};
	});

	return { rows: dataRows, errors };
}

function prepareImportUsersRows(rows) {
	const usernameSeen = {};
	const emailSeen = {};
	const allowedLoginTypes = ['LOCAL', 'LDAP', 'SSO'];
	const emailRe = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

	rows.forEach(row => {
		const errors = [];

		if (!row.username) errors.push("Missing username");
		if (/[^.A-Za-z0-9@+_-]/.test(row.username)) errors.push("Username contains invalid characters");
		if (row.username.length > 64) errors.push("Username exceeds 64 characters");

		if (!row.email) errors.push("Missing email");
		if (row.email && !emailRe.test(row.email)) errors.push("Invalid email address");

		if (!allowedLoginTypes.includes(row.login_type)) errors.push("Login type must be LOCAL, LDAP or SSO");

		if (row.login_type === "LOCAL" && row.password.length < 1) errors.push("LOCAL users require a password");
		if (row.login_type !== "LOCAL" && row.password.length > 0) errors.push("Password must be blank for LDAP and SSO users");
		if (row.password.length > 50) errors.push("Password exceeds 50 characters");

		const userKey = row.username.toLowerCase();
		if (userKey && usernameSeen[userKey]) errors.push(`Duplicate username in CSV, first seen on row ${usernameSeen[userKey]}`);
		if (userKey && !usernameSeen[userKey]) usernameSeen[userKey] = row.line;

		const emailKey = row.email.toLowerCase();
		if (emailKey && emailSeen[emailKey]) errors.push(`Duplicate email in CSV, first seen on row ${emailSeen[emailKey]}`);
		if (emailKey && !emailSeen[emailKey]) emailSeen[emailKey] = row.line;

		row.errors = errors;
		row.valid = errors.length === 0;
	});

	return { rows };
}

function renderImportUsersPreview(rows) {
	const $body = $('#iuPreviewBody').empty();
	rows.forEach(row => {
		const status = row.valid
			? `<span class="status status-ok">valid</span>`
			: `<span class="status status-warn">${importUsersEscapeHtml(row.errors.join('; '))}</span>`;
		$body.append(`
			<tr class="${row.valid ? '' : 'row-warn'}">
				<td class="tbl-cell"><code>${importUsersEscapeHtml(row.username)}</code></td>
				<td class="tbl-cell">${importUsersEscapeHtml(row.email)}</td>
				<td class="tbl-cell">${importUsersEscapeHtml(row.login_type)}</td>
				<td class="tbl-cell">${row.password ? 'Provided' : 'Blank'}</td>
				<td class="tbl-cell">${status}</td>
			</tr>
		`);
	});
}

function downloadImportUsersExampleCsv() {
	const rows = [
		['username', 'email', 'login_type', 'password'],
		['jane.doe', 'jane.doe@example.org', 'LOCAL', 'ChangeMe123'],
		['ldap.user', 'ldap.user@example.org', 'LDAP', ''],
		['sso.user', 'sso.user@example.org', 'SSO', '']
	];
	const csv = rows.map(r => r.map(importUsersCsvEscape).join(',')).join('\r\n');
	const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.href = url;
	link.download = 'oasys_users_import_example.csv';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function importUsersReadFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error || new Error('File read error'));
		reader.readAsText(file, 'utf-8');
	});
}

function importUsersCsvEscape(field) {
	const s = String(field).replace(/"/g, '""');
	return `"${s}"`;
}

function importUsersEscapeHtml(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
		let ugfObj = new JsSortableTable('gf_data', 'gfd_id', {
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

	let udObj = new JsSortableTable("user_data", "ud_id", {
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
		if (emObj.val() === "" && settings.emailSysActive === false) {
			emObj.css('border', '1px solid #ccc');
			return true;
		} else {
			// if the instance has the email subsystem activated, a valid email account is required!
			emObj.css('border', '2px solid red');
			return false;
		}
	} else {
		emObj.css('border', '1px solid #ccc');
		return true;
	}
}

function unameValidator(nameObj) {

	// input validation
	const badChars = /[^.A-Za-z0-9@+_-]/;
	const re = RegExp(badChars);
	if (re.test(nameObj.val()) || (nameObj.val().length > 64)) {
		if (re.test(nameObj.val())) {
			alert("Only alphanumeric, '-', '.', '@', '+', and '_' characters allowed in username.");
			nameObj.val(nameObj.val().substring(0, nameObj.val().length - 1)); // remove the last offending character from input field
		}
		if (nameObj.val().length > 64) {
			alert("Maximum username length is 64 characters.");
			nameObj.val(nameObj.val().substring(0, 64));
		}
		return false;
	}

	// field formatting
	if (nameObj.val().length < 1) {
		return false;
	}

	return true;
}

function passValidator(pwdObj) {

	const pwdWarning = $('#pwdWarning');
	const messages = [];
	pwdWarning.removeAttr("title");

	// regex checks for: mix of upper/lower/num + 8 chars in len+, OR 12 chars in len+
	if (/(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z]).{8,}|.{12,}/.test(pwdObj.val()) === false && pwdObj.val().length !== 0 /* && pwdObj.is(":focus") */) {
		messages.push("This is an insecure password. Use a mix of uppercase, lowercase and numeric values with at least 8 characters, or use any 12 characters.");
		pwdObj.css('border', '2px solid orange');
	} else {
		pwdObj.css('border', '1px solid #ccc');
	}

	if ($('#nu_edt_uname').val().toLowerCase() === pwdObj.val().toLowerCase() && pwdObj.val().length !== 0) {
		messages.push("It is not recommended to use the same value for both username and password.");
	}

	if (messages.length > 0) {
		pwdWarning
			.html('<strong>Warning</strong><span>' + messages.join('</span><span>') + '</span>')
			.show();
	} else {
		pwdWarning.html('').hide();
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
			contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br />' + res.fatalError),
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
			contents: formatActionErrorMessage('<strong>' + 'Sorry! The action cannot be completed.' + '</strong><br />' + res.error),
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
			contents: formatActionErrorMessage('<strong>' + 'Sorry! The action cannot be completed.' + '</strong><br />' + res.error),
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
				const accountType = userMgrAccountTypeFromListItem(objValue);
				const role = userMgrRoleFromListItem(objValue);
				gui.users.addItems([{
					name: objValue.name.data,
					id: objValue.name.id.toString(),
					role: role,
					roleBadge: userMgrRoleBadge(role),
					acct_type: accountType,
					listBadges: userMgrUserListBadges(accountType)
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
				const accountType = userMgrAccountTypeFromListItem(objValue);
				const role = userMgrRoleFromListItem(objValue);
				gui.users.addItems([{
					name: objValue.name.data,
					id: objValue.name.id.toString(),
					role: role,
					roleBadge: userMgrRoleBadge(role),
					acct_type: accountType,
					listBadges: userMgrUserListBadges(accountType)
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
