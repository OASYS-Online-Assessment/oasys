"use strict";

//gui elements
let kbHandler;
let gui;
const profile = {};
let hierarchy = [];
let structure = [];
let pointerHandler;
let lPanel;
let properties;
let settingsGui;
let rPanel;
let details, controls;
let visibilitySettings = [];
let tracker;
let timeoutPointer = null;
let tfKey1;
let tfKey2;
let tfDate;
let dataCache = {};

let settingsElements = {};
let selectedEntry = {login: null, testId: null, password: null};

const STATUS_CLOSED = 0;
const STATUS_ACTIVE = 1;
const STATUS_TIMEOUT = 2;
const STATUS_ABORTED = 3;

const statusLabel = ['finished', 'active', 'lost connection', 'aborted'];

$(onDOMReady);

function onDOMReady() {
    $.ajaxSetup({
        type: "POST",
        cache: false,
        dataType: "json",
        timeout: 300000,
        success: ajaxSuccess,
        error: ajaxError,
        url: "activityTrackerActions.php"
    });

    //load hierarchy from last session
    let savedData = localStorage.getItem('activityTrackerHierarchy');
    if (typeof (savedData) === "string") {
        hierarchy = JSON.parse(savedData);
    }

    pointerHandler = jsPointerHandler.instance;

    //prohibit dropping files into the browser
    $('body').on('dragover', function (e) {
        e.preventDefault();
    });
    $('body').on('drop', function (e) {
        e.preventDefault();
    });

    kbHandler = new jsKeyboardHandler();

    initGUI();

    gui = {
        boxes: {},
        panels: {}
    };
    gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
        prepend: true,
        prefix: `<strong style="margin-right: 10px;">${UILANG.m('activity tracker')}</strong>`,
        message: ''
    });

    $('#UI').append("<div id='main'></div>");
    $('#UI').css('max-width', '100%');
    $('#header').css('display', 'block');
    gui.main = $('#main');
    gui.main.css({
        'background-color': 'white',
        width: '100%',
        height: '100%'
    });

    $('#main').html("<table id='tracker'></table>");
    tracker = $('table#tracker');
    changeVisibility();

    //left panel
    lPanel = new jsSidePanel($('#UI'), 'monitoring', {
        title: UILANG.m('Monitoring'),
        hideSectionTitles: true,
        sections: {
            order: ["monitoring"],
            labels: {
                monitoring: 'monitoring'
            }
        },
        dock: 'left',
        width: 300
    });
    properties = lPanel.getSection("monitoring");
    properties.html("<table id='settings'></table>");
    settingsGui = $('table#settings');

    //right panel
    rPanel = new jsSidePanel($('#UI'), 'details', {
        title: UILANG.m('Details'),
        hideSectionTitles: true,
        sections: {
            order: ["details"],
            labels: {
                details: 'details'
            }
        },
        dock: 'right',
        width: 500
    });
    rPanel.getSection("details").html("<table id='details'></table><div id='controls'></div>");
    details = rPanel.getSection("details").find("table");
    controls = rPanel.getSection("details").find("#controls");

    // Add buttons to controls
    controls.append('<button id="btnIncreaseTime">' + UILANG.m('add time') + '</button>');
    controls.append('<button id="btnReopenTest">' + UILANG.m('reopen test') + '</button>');
    controls.append('<button id="btnCloseTest">' + UILANG.m('close test') + '</button>');
    controls.append('<button id="btnResetActivity">' + UILANG.m('reset activity') + '</button>');

    pointerHandler.listen($('#btnIncreaseTime'), {
        callbacks: {click: increaseTimeLeft},
        hoverClass: "hovered"
    });
    pointerHandler.listen($('#btnReopenTest'), {
        callbacks: {click: reopenTest},
        hoverClass: "hovered"
    });
    pointerHandler.listen($('#btnCloseTest'), {
        callbacks: {click: closeTest},
        hoverClass: "hovered"
    });
    pointerHandler.listen($('#btnResetActivity'), {
        callbacks: {click: resetActivity},
        hoverClass: "hovered"
    });

    createProperties();
    startLiveMonitoring();
}

function increaseTimeLeft() {
    let dialogData = {
        buttons: [
            {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
            {label: UILANG.m('Confirm'), 'default': true, value: 'confirm'}
        ],
        contents: UILANG.m("<p>How many minutes should be added to the time left?<br>(use negative values to reduce the time left)</p>") + "<div><input type='number' id='field_minutes' name='field_minutes' max='99' min='-99'></div>",
        datafields: ['field_minutes'],
        mandatory: ['field_minutes'], //disable OK button if field is empty or contains only whitespace
        blackList: {
            field_minutes: ['0']
        }, //disable OK button if 0
        focus: 'field_minutes',
        values: {
            field_minutes: 0
        },
        title: UILANG.m('Add time left'),
        returnPromise: true,
        width: 400
    };
    showDialog('increaseTimeDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let minutes = parseInt(res.data[0]);
                if (isNaN(minutes) || minutes === 0) {
                    return;
                }
                let activity = fetchObjectFromArray(dataCache[selectedEntry.login].activity, {
                    testId: selectedEntry.testId,
                    passwordId: selectedEntry.passwordId
                }, true);
                executeAction({
                    passwordId: activity.passwordId,
                    testId: selectedEntry.testId,
                    action: 'addTime',
                    minutes: minutes
                });
            }
        }
    );
}

function closeTest() {
    let dialogData = {
        buttons: [
            {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
            {label: UILANG.m('Confirm'), 'default': true, value: 'confirm'}
        ],
        contents: UILANG.m("Mark this test as finished, and deny any further activity on it?"),
        title: UILANG.m('Close test'),
        returnPromise: true,
        width: 400
    };
    showDialog('closeTestDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let activity = fetchObjectFromArray(dataCache[selectedEntry.login].activity, {
                    testId: selectedEntry.testId,
                    passwordId: selectedEntry.passwordId
                }, true);
                executeAction({passwordId: activity.passwordId, testId: selectedEntry.testId, action: 'closeTest'});
            }
        }
    );
}

function reopenTest() {
    let dialogData = {
        buttons: [
            {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
            {label: UILANG.m('Confirm'), 'default': true, value: 'confirm'}
        ],
        contents: UILANG.m("Reopen this test for further activity?"),
        title: UILANG.m('Reopen test'),
        returnPromise: true,
        width: 400
    };
    showDialog('reopenTestDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let activity = fetchObjectFromArray(dataCache[selectedEntry.login].activity, {
                    testId: selectedEntry.testId,
                    passwordId: selectedEntry.passwordId
                }, true);
                executeAction({passwordId: activity.passwordId, testId: selectedEntry.testId, action: 'reopenTest'});
            }
        }
    );
}

function resetActivity() {
    let dialogData = {
        buttons: [
            {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
            {label: UILANG.m('Confirm'), 'default': true, value: 'confirm'}
        ],
        contents: UILANG.m("Delete all activity including answers?"),
        title: UILANG.m('Reset activity'),
        returnPromise: true,
        width: 400
    };
    showDialog('resetActivityDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let activity = fetchObjectFromArray(dataCache[selectedEntry.login].activity, {
                    testId: selectedEntry.testId,
                    passwordId: selectedEntry.passwordId
                }, true);
                executeAction({passwordId: activity.passwordId, testId: selectedEntry.testId, action: 'resetActivity'});
            }
        }
    );}

function createProperties() {
    setTitle(settingsGui, UILANG.m('What to monitor'));
    let opt = {
        type: 'cb',
        onChange: changeLiveMonitoring,
        elements: [{
            elementParent: 'settings',
            value: 'live',
            labelParent: 'settings',
            label: UILANG.m('live monitoring')
        }],
        elPrefix: '<tr><td>',
        elPostFix: '</td>',
        lbPrefix: '<td>',
        lbPostfix: '</td></tr>',
        order: 'elementFirst',
        height: '16px',
        initialValue: ['live']
    };
    settingsElements.cbLive = new jsMultipleChoice('cbLive', opt);
    settingsGui.append(`<tr id="settings_date_property" class="hidden"><td colspan='2'><label for='tf_date'>${UILANG.m('date')}: </label><br><input type='date' id='tf_date'></td></tr>`);

    setDivider(settingsGui);

    setTitle(settingsGui, UILANG.m('What to show'));
    opt = {
        type: 'cb',
        onChange: changeVisibility,
        elements: [{
            elementParent: 'settings',
            value: 'hideClosed',
            labelParent: 'settings',
            label: UILANG.m('hide completed tests')
        }, {
            elementParent: 'settings',
            value: 'hideTimeOut',
            labelParent: 'settings',
            label: UILANG.m('hide lost connections')
        }],
        elPrefix: '<tr><td>',
        elPostFix: '</td>',
        lbPrefix: '<td>',
        lbPostfix: '</td></tr>',
        order: 'elementFirst',
        height: '16px',
        initialValue: visibilitySettings
    };
    settingsElements.cbHideClosed = new jsMultipleChoice('cbHideClosed', opt);

    opt = {
        label: UILANG.m("expand all"),
        callback: toggleOpenCloseAll,
        value: "expand",
        frameStyle: {
            width: '100%',
            margin: 0
        }
    };
    newRow(settingsGui, 'spacer');
    settingsElements.expandAll = new nxButton(newRow(settingsGui, 'center'), 'bExpand', opt);

    opt = {
        label: UILANG.m("collapse all"),
        callback: toggleOpenCloseAll,
        value: "collapse",
        frameStyle: {
            width: '100%',
            margin: 0
        }
    };
    settingsElements.expandAll = new nxButton(newRow(settingsGui, 'center'), 'bCollapse', opt);
    setDivider(settingsGui);

    setTitle(settingsGui, UILANG.m('How to group data'));
    settingsGui.append(`<tr><td colspan='2'><label for='tf_key1'>${UILANG.m('top level')}: </label><br><input type='text' id='tf_key1'></td></tr>`);
    newRow(settingsGui, 'spacer');
    settingsGui.append(`<tr><td colspan='2'><label for='tf_key2'>${UILANG.m('detail')}: </label><br><input type='text' id='tf_key2'></td></tr>`);

    tfDate = $('#tf_date');
    tfDate.on('change', changeDate);
    tfKey1 = $('#tf_key1');
    tfKey1.on({blur: updateKeys, keydown: tfKeyDown});
    tfKey2 = $('#tf_key2');
    tfKey2.on({blur: updateKeys, keydown: tfKeyDown});

    if (hierarchy[0]) {
        tfKey1.val(hierarchy[0]);
    }
    if (hierarchy[1]) {
        tfKey2.val(hierarchy[1]);
    }
}

function updateKeys() {
    let k1 = tfKey1.val();
    let k2 = tfKey2.val();
    if (k1) {
        hierarchy[0] = k1;
        if (k2) {
            hierarchy[1] = k2;
        } else {
            delete hierarchy[1];
        }
    } else {
        hierarchy = [];
    }
    renderList();
    localStorage.setItem('activityTrackerHierarchy', JSON.stringify(hierarchy));
    if (!profile.live) {
        fetchNewData();
    }
}

function tfKeyDown(e) {
    if (e.key === "Enter") {
        if ($(e.delegateTarget).attr('id') === "tf_key1") {
            tfKey2.focus();
        } else {
            tfKey2.blur();
        }
    }
}

function setTitle(target, title) {
    target.append(`<tr><td class="panelTitle" colspan='2'>${title}</td></tr>`);
}

function setDivider(target) {
    target.append("<tr><td class='panelDivider' colspan='2'></td></tr><tr><td colspan='2'></td></tr>");
}

function newRow(target, tdClass) {
    target.append(`<tr><td colspan='2' class="${tdClass}"></td></tr>`);
    let tr = target.find('tr').last();
    return tr.find('td').first();
}

function startLiveMonitoring() {
    changeLiveMonitoring(null, ['live']);
}

function changeLiveMonitoring(sender, value) {
    if (value.includes("live")) {
        profile.live = true;
        profile.selection = 'date';
        delete profile.date;
        $('tr#settings_date_property').addClass('hidden');
        fetchNewData();
    } else {
        //reset to current date when date field is shown
        $('#tf_date').val(new Date().toISOString().split('T')[0]);
        $('tr#settings_date_property').removeClass('hidden');
        profile.live = false;
        if (timeoutPointer !== null) {
            clearTimeout(timeoutPointer);
            timeoutPointer = null;
        }
    }
}

function changeDate() {
    profile.date = $('#tf_date').val();
    fetchNewData();
}

function executeAction(action) {
    if (profile.live === true) {
        clearTimeout(timeoutPointer);
        timeoutPointer = null;
    }
    startAjax(profile, action);
}

function fetchNewData() {
    startAjax(profile);
}

function changeVisibility(sender, value) {
    if (sender) visibilitySettings = value;
    renderList();
}

/* general helper functions */

function showMessage() {
    let callback = null;
    let argv = [];
    let argc = arguments.length;
    let params = [];
    for (let i = 0; i < argc; i++) {
        if (callback !== null) {
            params.push(arguments[i]);
        } else if (typeof (arguments[i]) === 'function') {
            callback = arguments[i];
        } else {
            argv.push(arguments[i]);
        }
    }
    let msg = sf.apply(this, argv);
    let dialogData = {
        buttons: [
            {label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}
        ],
        contents: msg,
        width: 500,
        callback: callback,
        title: UILANG.m("Error"),
        icon: "../images/error.png",
        iconWidth: 64
    };
    new nxDialog('Message', dialogData, params);
}

async function showDialog(id, dialogData) {
    return new nxDialog(id, dialogData);
}

function updateList(data) {
    dataCache = data;
    let newStructure = {};
    let loginCount = 0;

    if (hierarchy.length > 0) {
        //if a hierarchy is set we need to build the data up accordingly
        for (let login in data) {
            let loginData = data[login];
            let label = "";
            let key = "";
            for (let category of hierarchy) {
                if (loginData.info && loginData.info[category]) {
                    label += `<span class="categoryLevel">${loginData.info[category]}</span>`;
                    key += `[[${loginData.info[category]}]]`;
                }
            }
            if (!newStructure[key]) {
                newStructure[key] = {logins: {}, label: label};
                if (structure[key]) {
                    newStructure[key].open = structure[key].open;
                } else {
                    newStructure[key].open = true;
                }
            }
            newStructure[key].logins[login] = loginData;
            loginCount++;
        }
    } else {
        //if hierarchy is empty, we build a flat list
        for (let login in data) {
            let loginData = data[login];
            let label = "";
            let key = "";
            label += `<span class="categoryLevel">${UILANG.m('No category')}</span>`;
            key += '[[No category]]';
            if (!newStructure[key]) {
                newStructure[key] = {logins: {}, label: label};
                if (structure[key]) {
                    newStructure[key].open = structure[key].open;
                } else {
                    newStructure[key].open = true;
                }
            }
            newStructure[key].logins[login] = loginData;
            loginCount++;
        }
    }

    gui.statusBar.setStatus(`${loginCount} ${UILANG.m('logins')}`);

    structure = newStructure;
    renderList();
    showDetails(selectedEntry.login, selectedEntry.testId, selectedEntry.passwordId);
}

function renderList() {
    pointerHandler.clear($('.categoryLabel'));
    pointerHandler.clear($('.login'));

    let html = "";
    let categoryList = Object.keys(structure);
    categoryList.sort();
    for (let k of categoryList) {
        let loginCount = Object.keys(structure[k].logins).length;
        let closedCount = 0;
        let timeOutCount = 0;
        let totalCount = 0;
        for (let login in structure[k].logins) {
            let loginData = structure[k].logins[login];
            for (let i in loginData.activity) {
                let activity = loginData.activity[i];
                totalCount++;
                if (activity.status === STATUS_CLOSED || activity.status === STATUS_ABORTED) {
                    closedCount++;
                } else if (activity.status === STATUS_TIMEOUT) {
                    timeOutCount++;
                }
            }
        }
        html += `<tbody data-category="${k}" class='category ${structure[k].open ? '' : 'closed'}'><tr class='categoryLabel'><td colspan="6">${structure[k].label} <span class="categoryLevel">[${loginCount} logins]</span><span class="categoryLevel">${categoryProgress(totalCount, closedCount, timeOutCount)}</span></td></tr>`;
        for (let login in structure[k].logins) {
            let loginData = structure[k].logins[login];
            let firstRow = true;
            for (let i in loginData.activity) {
                let activity = loginData.activity[i];
                if ((activity.status === STATUS_CLOSED || activity.status === STATUS_ABORTED) && visibilitySettings.includes('hideClosed')) continue;
                if (activity.status === STATUS_TIMEOUT && visibilitySettings.includes('hideTimeOut')) continue;
                html += `<tr class='login status_${activity.status}' data-login="${login}" data-test="${activity.testId}" data-password="${activity.passwordId}"><td class='leftSpace'></td><td>${firstRow ? login : ''}</td><td>${activity.passwordTag || activity.password}</td><td>${activity.test}</td><td>${trackerProgress(activity.progress)}</td><td>${activity.timeLeft}</td><td><div class="status"></div></td></tr>`;
                firstRow = false;
            }
        }
        html += "</tbody>";
    }
    tracker.html(html);

    pointerHandler.listen($('.categoryLabel'), {
        callbacks: {
            click: toggleOpenClose
        },
        hoverClass: "hovered"
    });

    pointerHandler.listen($('.login'), {
        callbacks: {
            click: entryClicked,
        },
        hoverClass: "hovered"
    });

}

function toggleOpenClose(e) {
    let node = $(e.delegateTarget).parent();
    let k = node.attr('data-category');
    if (node.hasClass('closed')) {
        node.removeClass('closed');
        structure[k].open = true;
    } else {
        node.addClass('closed');
        structure[k].open = false;
    }
}

function toggleOpenCloseAll(mode) {
    if (mode === 'expand') {
        $('tbody.category').removeClass('closed');
        for (let k in structure) {
            structure[k].open = true;
        }
    } else {
        $('tbody.category').addClass('closed');
        for (let k in structure) {
            structure[k].open = false;
        }
    }
}

function rowHover(e) {
    let node = $(e.delegateTarget);
    node.addClass('hover');
}

function rowLeave(e) {
    let node = $(e.delegateTarget);
    node.removeClass('hover');
}

function trackerProgress(p) {
    return `<div class='outerPB'><div class="innerPB" style="width: ${p}%"></div><div class="labelPB">${p}%</div></div>`;
}

function categoryProgress(total, closed, timeout) {
    closed = Math.round(closed / total * 100);
    timeout = Math.round(timeout / total * 100);
    let active = 100 - closed - timeout;

    /* prevent that both closed and timeout are rounded up if they end on .5 and thus add up to 101% */
    if (active < 0) {
        closed = 100 - timeout;
        active = 0;
    }

    return `<div class='outerCPB'><div class="innerCPB_closed" style="width: ${closed}%"></div><div class="innerCPB_timeout" style="width: ${timeout}%"></div><div class="innerCPB_active" style="width: ${active}%"></div></div>`;
}

function entryClicked(e) {
    let node = $(e.delegateTarget);
    let login = node.data('login');
    let testId = node.data('test');
    let passwordId = node.data('password');
    showDetails(login, testId, passwordId);
}

function showDetails(login, testId, passwordId) {
    if (login === null || testId === null || passwordId === null || !dataCache?.[login]) {
        details.html("");
        selectedEntry = {login: null, testId: null, passwordId: null};
        return;
    }
    selectedEntry.login = login;
    selectedEntry.testId = testId;
    selectedEntry.passwordId = passwordId;
    let activity = fetchObjectFromArray(dataCache[login].activity, {testId: testId, passwordId: passwordId}, true);
    let html = `<tr><td colspan="2"><h2>${login}</h2></td></tr>`;
    html += `<tr><td>${UILANG.m('login id')}:</td><td><a target="_blank" href="resultsPreviewActions.php?loginId=${dataCache[login].loginId}">${dataCache[login].loginId}</a><td></tr>`;
    html += `<tr><td>${UILANG.m('test id')}:</td><td>${activity.testId}<td></tr>`;
    html += `<tr><td>${UILANG.m('test name')}:</td><td>${activity.test}<td></tr>`;
    html += `<tr><td>${UILANG.m('password id')}:</td><td><a target="_blank" href="resultsPreviewActions.php?passwordId=${activity.passwordId}">${activity.passwordId}</a><td></tr>`;
    html += `<tr><td>${UILANG.m('password')}:</td><td>${activity.password}<td></tr>`;
    html += `<tr><td>${UILANG.m('password tag')}:</td><td>${activity.passwordTag}<td></tr>`;
    html += `<tr><td>${UILANG.m('login date')}:</td><td>${activity.loginDate}<td></tr>`;
    html += `<tr><td>${UILANG.m('login time')}:</td><td>${activity.loginTime}<td></tr>`;
    html += `<tr><td>${UILANG.m('last contact date')}:</td><td>${activity.contactDate}<td></tr>`;
    html += `<tr><td>${UILANG.m('last contact time')}:</td><td>${activity.contactTime}<td></tr>`;
    html += `<tr><td>${UILANG.m('progress')}:</td><td>${activity.progress}%<td></tr>`;
    html += `<tr><td>${UILANG.m('time limit')}:</td><td>${activity.timeLimit}<td></tr>`;
    html += `<tr><td>${UILANG.m('time left')}:</td><td>${activity.timeLeft}<td></tr>`;
    html += `<tr><td>${UILANG.m('status')}:</td><td>${UILANG.m(statusLabel[activity.status])}<td></tr>`;
    html += `<tr><td>${UILANG.m('behaviour')}:</td><td><a target="_blank" href="resultsPreviewActions.php?passwordId=${activity.passwordId}&testId=${activity.testId}">${UILANG.m('see complete log')}</a><td></tr>`;
    details.html(html);
    //if status is closed, disable the "close test" button
    if (activity.status === STATUS_CLOSED) {
        $('#btnCloseTest').hide();
        if (activity.timeLimit === '0') {
            $('#btnIncreaseTime').hide();
            $('#btnReopenTest').show();
        } else {
            $('#btnIncreaseTime').show();
            $('#btnReopenTest').hide();
        }
    } else {
        $('#btnCloseTest').show();
        $('#btnReopenTest').hide();
        if (activity.timeLimit === '0') {
            $('#btnIncreaseTime').hide();
        } else {
            $('#btnIncreaseTime').show();
        }
    }

}

/* server communication */

function startAjax(data, action = {}) {
    let params = {
        data: JSON.stringify(data),
        action: JSON.stringify(action)
    };
    let p = $.ajax({
        data: params
    });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    console.error('Error: ' + errorThrown);
    if (jqXHR?.responseJSON) {
        console.error(jqXHR.responseJSON.fatalError ?? 'no error details given');
    }
    if (profile.live === true) {
        timeoutPointer = setTimeout(fetchNewData, 5000);
    }
}

function ajaxSuccess(res) {
    $('#un_val').html(res.loggedInName);
    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    let dialogData;
    if (res.fatalError) {
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: `<strong>${UILANG.m('Sorry! The action cannot be completed.')}</strong><br /> ${res.fatalError}`,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
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
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.error,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 700,
            callback: function () {
                if (res.forceLoginRedirect) {
                    window.location = 'index.php';
                }
            }
        };
        new nxDialog('error', dialogData);
        return;
    }
    if (res.warnings) {
        for (let i in res.warnings) {
            showMessage(res.warnings[i]);
        }
    }
    updateList(res.data);
    if (profile.live === true) {
        timeoutPointer = setTimeout(fetchNewData, 5000);
    }
}