"use strict";

window.interactionClasses = {};
window.interactionConfigs = {};

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
let metaSuggestions = {keys: [], values: {}, singleTags: []};
let metaSuggestionsLoaded = false;
let activityDates = new Set();
let requestSequence = 0;
let latestAppliedRequest = 0;
let activeRequest = null;
let actionInFlight = false;
let refreshIndicatorTimer = null;
let refreshIndicatorStartedAt = 0;
let activityJourney = {
    open: false,
    scope: null,
    loginId: null,
    passwordId: null,
    testId: null,
    runs: [],
    selectedKey: null,
    filter: '',
    wasLive: false
};
let activityJourneyBackButton;
let activityJourneyRefreshButton;
let activityTrackerRefreshButton;
let waitDialog;

let settingsElements = {};
let selectedEntry = {login: null, testId: null, passwordId: null};

const STATUS_CLOSED = 0;
const STATUS_ACTIVE = 1;
const STATUS_TIMEOUT = 2;
const STATUS_ABORTED = 3;
const STATUS_REOPENED = 4;

const statusLabel = ['finished', 'active', 'lost connection', 'aborted', 'Reopened - waiting for login'];

$(onDOMReady);

function onDOMReady() {
    waitDialog = new jsModalWait(UILANG.m('please wait'));
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
        try {
            const parsedHierarchy = JSON.parse(savedData);
            hierarchy = Array.isArray(parsedHierarchy) ? parsedHierarchy : [];
        } catch (error) {
            console.warn('Invalid saved Activity Tracker hierarchy was discarded.', error);
            hierarchy = [];
            localStorage.removeItem('activityTrackerHierarchy');
        }
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
    $('#statusBar').append('<span id="activityRefreshIndicator" class="activityRefreshIndicator" aria-live="polite"></span>');

    $('#UI').append("<div id='main'></div>");
    $('#UI').css('max-width', '100%');
    $('#header').css('display', 'block');
    activityTrackerRefreshButton = new jsButton2($('#header'), 'activityTrackerRefresh', {
        label: UILANG.m('Refresh'),
        icon: '../images/toolbarIcons/ic_tb_refresh.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: fetchNewData
    });
    activityJourneyBackButton = new jsButton2($('#header'), 'activityJourneyBack', {
        label: UILANG.m('Go back'),
        icon: '../images/toolbarIcons/ic_tb_back.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: closeActivityJourney,
        hidden: true
    });
    activityJourneyRefreshButton = new jsButton2($('#header'), 'activityJourneyRefresh', {
        label: UILANG.m('Refresh'),
        icon: '../images/toolbarIcons/ic_tb_refresh.png',
        iconWidth: 48,
        width: 80,
        height: 100,
        callback: refreshActivityJourney,
        hidden: true
    });
    gui.main = $('#main');
    gui.main.css({
        'background-color': 'white',
        width: '100%',
        height: '100%'
    });

    $('#main').html("<table id='tracker'></table>");
    $('#UI').append(/* html */`
        <div id="activityJourney" class="activityJourney">
            <section id="activityJourneyListPane">
                <div class="activityJourneyPaneTitle">
                    <strong id="activityJourneyListTitle">${UILANG.m('Test Journey')}</strong>
                    <span id="journeyListHeader"></span>
                </div>
				<div class="journeyListLayout">
					<div id="journeyListFilter"></div>
					<div id="journeyTakerList"></div>
				</div>
            </section>
            <section id="activityJourneyDetailPane">
                <div class="activityJourneyPaneTitle">
                    <strong>${UILANG.m('Journey Detail')}</strong>
                    <span id="journeyDetailHeader"></span>
                </div>
                <div id="journeyDetailView"></div>
            </section>
        </div>
    `);
    tracker = $('table#tracker');
    changeVisibility();

    //left panel
    lPanel = new jsSidePanel($('#UI'), 'monitoring', {
        hideSectionTitles: true,
        sections: {
            order: ["monitoring"],
            labels: {
                monitoring: 'monitoring'
            }
        },
        dock: 'left',
        width: 240
    });
    properties = lPanel.getSection("monitoring");
    properties.html("<table id='settings'></table>");
    settingsGui = $('table#settings');

    //right panel
    rPanel = new jsSidePanel($('#UI'), 'details', {
        hideSectionTitles: true,
        sections: {
            order: ["details"],
            labels: {
                details: 'details'
            }
        },
        dock: 'right',
        width: 390
    });
    rPanel.getSection("details").html("<table id='details'></table><div id='controls'></div>");
    details = rPanel.getSection("details").find("table");
    controls = rPanel.getSection("details").find("#controls");

    // Add buttons to controls
    controls.append('<button id="btnIncreaseTime">' + UILANG.m('add time') + '</button>');
    controls.append('<button id="btnReopenTest">' + UILANG.m('reopen test') + '</button>');
    controls.append('<button id="btnCloseTest">' + UILANG.m('close test') + '</button>');
    controls.append('<button id="btnResetActivity">' + UILANG.m('reset activity') + '</button>');
    controls.hide();

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
        contents: `
            <div class="activityTimeDialogForm">
                <p class="activityTimeDialogQuestion">${UILANG.m('How many minutes should be added to the time left?')}</p>
                <div class="activityTimeDialogField">
                    <label>${UILANG.m('Minutes')}</label>
                    <div class="activityTimeDialogNumber">[@field_minutes]<span>${UILANG.m('minutes')}</span></div>
                    <p class="activityTimeDialogHint">${UILANG.m('Use negative values to reduce the time left.')}</p>
                </div>
            </div>`,
        datafields: ['field_minutes'],
        fieldTypes: {
            field_minutes: 'numberInput'
        },
        fieldOptions: {
            field_minutes: {
                width: 84,
                height: 34,
                initialValue: 0,
                dataId: 'field_minutes',
                range: '-99..99',
                step: 1,
                readOnly: false
            }
        },
        mandatory: ['field_minutes'],
        blackList: {
            field_minutes: [0, '0']
        },
        title: UILANG.m('Add time left'),
        returnPromise: true,
        width: 460
    };
    showDialog('increaseTimeDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let minutes = parseInt(res.data[0]);
                if (isNaN(minutes) || minutes === 0) {
                    return;
                }
                let activity = getSelectedActivity();
                if (!activity) return;
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
        contents: '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m("Mark this test as finished, and deny any further activity on it?") + '</p></div></div>',
        icon: "../images/warning.png",
        iconWidth: 64,
        title: UILANG.m('Close test'),
        returnPromise: true,
        width: 400
    };
    showDialog('closeTestDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let activity = getSelectedActivity();
                if (!activity) return;
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
                let activity = getSelectedActivity();
                if (!activity) return;
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
        contents: '<div class="deleteConfirm"><div class="deleteConfirmText"><p>' + UILANG.m("Delete all activity including answers?") + '</p></div></div>',
        icon: "../images/warning.png",
        iconWidth: 64,
        title: UILANG.m('Reset activity'),
        returnPromise: true,
        width: 400
    };
    showDialog('resetActivityDialog', dialogData).then(
        (res) => {
            if (res.button === 'confirm') {
                let activity = getSelectedActivity();
                if (!activity) return;
                executeAction({passwordId: activity.passwordId, testId: selectedEntry.testId, action: 'resetActivity'});
            }
        }
    );}

function createProperties() {
    setTitle(settingsGui, UILANG.m('What to monitor'), 'activityMonitorHelp');
    let opt = {
        type: 'cb',
        onChange: changeLiveMonitoring,
        elements: [{
            elementParent: 'settings',
            value: 'live',
            labelParent: 'settings',
            label: UILANG.m('live monitoring')
        }],
        elPrefix: '<tr class="activityVisibilityOption"><td>',
        elPostFix: '</td>',
        lbPrefix: '<td>',
        lbPostfix: '</td></tr>',
        order: 'elementFirst',
        height: '16px',
        initialValue: ['live']
    };
    settingsElements.cbLive = new jsMultipleChoice('cbLive', opt);
    settingsGui.append(`<tr id="settings_date_property"><td colspan='2'><label for='tf_date'>${UILANG.m('date')}: </label><br><input type='text' id='tf_date' autocomplete='off'></td></tr>`);

    setDivider(settingsGui);

    setTitle(settingsGui, UILANG.m('Refresh'), 'activityRefreshHelp');
    settingsGui.append(/* html */`
        <tr class="activityRefreshSettings"><td colspan="2">
            <div id="activityRefreshMode" class="activityRefreshMode" role="group" aria-label="${UILANG.m('Refresh mode')}">
                <button type="button" data-mode="manual" aria-pressed="false">${UILANG.m('Manual')}</button>
                <button type="button" class="is-active" data-mode="live" aria-pressed="true">${UILANG.m('Live')}</button>
            </div>
        </td></tr>
    `);
    $('#activityRefreshMode button').on('click', function() {
        setActivityRefreshMode($(this).data('mode') === 'live');
    });

    setDivider(settingsGui);

    setTitle(settingsGui, UILANG.m('What to show'), 'activityVisibilityHelp');
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
        elPrefix: '<tr class="activityVisibilityOption"><td>',
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
        callback: () => toggleOpenCloseAll('expand'),
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
        callback: () => toggleOpenCloseAll('collapse'),
        value: "collapse",
        frameStyle: {
            width: '100%',
            margin: 0
        }
    };
    settingsElements.collapseAll = new nxButton(newRow(settingsGui, 'center'), 'bCollapse', opt);
    setDivider(settingsGui);

    setTitle(settingsGui, UILANG.m('How to group data'), 'activityGroupingHelp');
    settingsGui.append(`<tr><td colspan='2'><label for='tf_key1'>${UILANG.m('top label (meta key)')}: </label><br><div class="activityMetaSuggestWrap"><input type='text' id='tf_key1' autocomplete="off"><span id="tf_key1_single_hint" class="activitySingleTagHint">${UILANG.m('Single tag')}</span><div id="tf_key1_suggest" class="activityMetaSuggest"></div></div></td></tr>`);
    newRow(settingsGui, 'spacer');
    settingsGui.append(`<tr><td colspan='2'><label for='tf_key2'>${UILANG.m('detail (meta key)')}: </label><br><div class="activityMetaSuggestWrap"><input type='text' id='tf_key2' autocomplete="off"><div id="tf_key2_suggest" class="activityMetaSuggest"></div></div></td></tr>`);

    tfDate = $('#tf_date');
    tfDate.datepicker({
        dateFormat: 'dd.mm.yy',
        firstDay: 1,
        showOtherMonths: true,
        selectOtherMonths: true,
        beforeShowDay: activityDatePickerDay
    });
    tfDate.val(activityDisplayDate());
    tfDate.on('change', changeDate);
    tfKey1 = $('#tf_key1');
    tfKey1.on({blur: updateKeys, keydown: tfKeyDown, input: refreshActivityDetailState});
    setupActivityMetaAutocomplete(tfKey1, $('#tf_key1_suggest'), 'key');
    tfKey2 = $('#tf_key2');
    tfKey2.on({blur: updateKeys, keydown: tfKeyDown});
    setupActivityMetaAutocomplete(tfKey2, $('#tf_key2_suggest'), 'key');

    if (hierarchy[0]) {
        tfKey1.val(hierarchy[0]);
    }
    if (hierarchy[1]) {
        tfKey2.val(hierarchy[1]);
    }
    refreshActivityDetailState();
    createActivityTrackerHelp();
}

function updateMetaKeySuggestions(suggestions) {
    if (Array.isArray(suggestions)) {
        metaSuggestions = {keys: suggestions, values: {}, singleTags: []};
    } else {
        metaSuggestions = $.extend({keys: [], values: {}, singleTags: []}, suggestions || {});
    }
    metaSuggestions.keys = (Array.isArray(metaSuggestions.keys) ? metaSuggestions.keys : []).filter(value => value !== null && typeof value !== 'undefined' && String(value) !== '');
    metaSuggestions.singleTags = Array.isArray(metaSuggestions.singleTags) ? metaSuggestions.singleTags : [];
    metaSuggestions.values = metaSuggestions.values && typeof metaSuggestions.values === 'object' ? metaSuggestions.values : {};
    refreshActivityDetailState(true);
}

function setupActivityMetaAutocomplete($input, $menu, type) {
    const render = () => {
        if ($input.prop('disabled')) {
            $menu.hide().empty();
            return;
        }
        const term = $.trim($input.val() || '').toLowerCase();
        if (term === '') {
            $menu.hide().empty();
            return;
        }
        const matches = activitySuggestionValues(type)
            .filter(row => row.value.toLowerCase().startsWith(term))
            .slice(0, 8);
        if (matches.length === 0) {
            $menu.hide().empty();
            return;
        }
        $menu.html(matches.map(row => `<button type="button" data-value="${escapeAttribute(row.value)}">${escapeAttribute(row.label)}</button>`).join('')).show();
    };
    $input.on('input focus', render);
    $input.on('blur', () => window.setTimeout(() => $menu.hide(), 120));
    $menu.on('mousedown', 'button', event => {
        event.preventDefault();
        $input.val($(event.currentTarget).data('value')).trigger('input').trigger('change');
        $menu.hide();
        refreshActivityDetailState();
        updateKeys();
        updateList(dataCache);
        if (profile.monitorLive) fetchNewData();
    });
}

function activitySuggestionValues(type) {
    if (type === 'key') {
        return metaSuggestions.keys.map(key => {
            const keyText = String(key);
            return {
                value: keyText,
                label: activityIsSingleTagKey(keyText) ? keyText + ' (' + UILANG.m('Single tag') + ')' : keyText
            };
        });
    }
    const topKey = $.trim(tfKey1 ? tfKey1.val() || '' : '');
    let values = [];
    if (topKey && Array.isArray(metaSuggestions.values[topKey])) {
        values = metaSuggestions.values[topKey];
    } else {
        const valueSet = {};
        Object.keys(metaSuggestions.values).forEach(key => {
            const keyValues = Array.isArray(metaSuggestions.values[key]) ? metaSuggestions.values[key] : [];
            keyValues.forEach(value => {
                if (value !== '' && value !== null && typeof value !== 'undefined') valueSet[value] = true;
            });
        });
        values = Object.keys(valueSet).sort();
    }
    return values.map(value => ({value: String(value), label: String(value)}));
}

function activityIsSingleTagKey(key) {
    const values = Array.isArray(metaSuggestions.values[key]) ? metaSuggestions.values[key] : [];
    return metaSuggestions.singleTags.includes(key) && values.length === 0;
}

function refreshActivityDetailState(saveState) {
    if (!tfKey1 || !tfKey2) return;
    const topKey = $.trim(tfKey1.val() || '');
    const singleTag = topKey !== '' && activityIsSingleTagKey(topKey);
    $('#tf_key1_single_hint').toggle(singleTag);
}

function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getSelectedActivity() {
    const loginData = dataCache?.[selectedEntry.login];
    if (!loginData || !Array.isArray(loginData.activity)) return null;
    return fetchObjectFromArray(loginData.activity, {
        testId: selectedEntry.testId,
        passwordId: selectedEntry.passwordId
    }, true) || null;
}

function activityLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function activityDisplayDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}.${month}.${year}`;
}

function activityDatePickerDay(date) {
    const dateKey = activityLocalDate(date);
    const hasActivity = activityDates.has(dateKey);
    return [
        true,
        hasActivity ? 'activityHasResultsDate' : '',
        hasActivity ? UILANG.m('Activity data available') : ''
    ];
}

function saveActivityHierarchy() {
    try {
        localStorage.setItem('activityTrackerHierarchy', JSON.stringify(hierarchy));
    } catch (error) {
        console.warn('Activity Tracker grouping could not be saved.', error);
    }
}

function updateKeys() {
    const previousHierarchy = hierarchy.slice();
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
    if (previousHierarchy.length === hierarchy.length
        && previousHierarchy.every((value, index) => value === hierarchy[index])) return;
    updateList(dataCache);
    saveActivityHierarchy();
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

function setTitle(target, title, helpId) {
    const help = helpId ? `<span id="${helpId}" class="activitySectionHelp"></span>` : '';
    const rowId = helpId ? ` id="${helpId}_row"` : '';
    target.append(`<tr${rowId}><td class="panelTitle" colspan='2'><span class="panelTitleInner"><span>${title}</span>${help}</span></td></tr>`);
}

function createActivityTrackerHelp() {
    const common = {
        size: '15px',
        maxWidth: '390px',
        linkDecoration: 'none'
    };
    new OasysHelp('activityMonitorHelp', {
        ...common,
        title: UILANG.m('What to monitor'),
        htmlContent: OasysHelp.layout({
            lead: UILANG.m('Live monitoring shows current activity. Turn it off to select and inspect an older date.')
        })
    });
    new OasysHelp('activityRefreshHelp', {
        ...common,
        title: UILANG.m('Refresh'),
        htmlContent: OasysHelp.layout({
            lead: UILANG.m('For live monitoring, Manual refreshes only when you use the toolbar button. Live refreshes automatically at short intervals.')
        })
    });
    new OasysHelp('activityVisibilityHelp', {
        ...common,
        title: UILANG.m('What to show'),
        htmlContent: OasysHelp.layout({
            lead: UILANG.m('Hide completed tests or interrupted connections to focus the list. Expand and collapse control all grouping sections.')
        })
    });
    new OasysHelp('activityGroupingHelp', {
        ...common,
        title: UILANG.m('How to group data'),
        htmlContent: OasysHelp.layout({
            lead: UILANG.m('Enter meta tag keys to group test takers into one or two levels. Suggestions appear while you type.')
        })
    });
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

function setActivityRefreshMode(live) {
    $('#activityRefreshMode button')
        .removeClass('is-active')
        .attr('aria-pressed', 'false')
        .filter(`[data-mode="${live ? 'live' : 'manual'}"]`)
        .addClass('is-active')
        .attr('aria-pressed', 'true');
    profile.live = Boolean(live && profile.monitorLive);
    if (!profile.live && timeoutPointer !== null) {
        clearTimeout(timeoutPointer);
        timeoutPointer = null;
    }
    fetchNewData();
}

function changeLiveMonitoring(sender, value) {
    const monitorLive = value.includes('live');
    profile.monitorLive = monitorLive;
    profile.selection = 'date';
    $('.activityRefreshSettings, #activityRefreshHelp_row').toggleClass('hidden', !monitorLive);
    if (monitorLive) {
        activityTrackerRefreshButton.enable();
        delete profile.date;
        tfDate.datepicker('setDate', new Date());
        $('#settings_date_property').addClass('is-disabled');
        tfDate.datepicker('option', 'disabled', true).attr('aria-disabled', 'true').addClass('is-disabled');
        const autoRefresh = $('#activityRefreshMode button.is-active').data('mode') === 'live';
        profile.live = autoRefresh;
    } else {
        activityTrackerRefreshButton.disable();
        const currentDate = new Date();
        tfDate.datepicker('setDate', currentDate);
        $('#settings_date_property').removeClass('is-disabled');
        tfDate.datepicker('option', 'disabled', false).attr('aria-disabled', 'false').removeClass('is-disabled');
        profile.date = activityLocalDate(currentDate);
        profile.live = false;
        if (timeoutPointer !== null) {
            clearTimeout(timeoutPointer);
            timeoutPointer = null;
        }
    }
    fetchNewData();
}

function changeDate() {
    if (profile.monitorLive) return;
    const selectedDate = tfDate.datepicker('getDate');
    if (!selectedDate) return;
    profile.date = activityLocalDate(selectedDate);
    fetchNewData();
}

function executeAction(action) {
    if (actionInFlight) return;
    if (profile.live === true) {
        clearTimeout(timeoutPointer);
        timeoutPointer = null;
    }
    actionInFlight = true;
    controls.find('button').prop('disabled', true);
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

    if (hierarchy.length > 0) {
        //if a hierarchy is set we need to build the data up accordingly
        for (let login in data) {
            let loginData = data[login];
            let label = "";
            let key = "";
            const topKey = hierarchy[0];
            const detailKey = hierarchy[1];
            let categoryValue;
            if (loginData.info && Object.prototype.hasOwnProperty.call(loginData.info, topKey)) {
                const topValue = loginData.info[topKey] === '' ? '' : String(loginData.info[topKey]);
                categoryValue = topValue === '' ? topKey + ' (' + UILANG.m('Single tag') + ')' : topValue;
            } else {
                categoryValue = UILANG.m('No category');
            }
            label += `<span class="categoryLevel">${escapeAttribute(categoryValue)}</span>`;
            key += `[[${categoryValue}]]`;
            if (detailKey) {
                if (loginData.info && Object.prototype.hasOwnProperty.call(loginData.info, detailKey)) {
                    const detailValue = loginData.info[detailKey] === '' ? '' : String(loginData.info[detailKey]);
                    categoryValue = detailValue === '' ? detailKey + ' (' + UILANG.m('Single tag') + ')' : detailValue;
                } else {
                    categoryValue = UILANG.m('No category');
                }
                label += `<span class="categoryLevel">${escapeAttribute(categoryValue)}</span>`;
                key += `[[${categoryValue}]]`;
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
        }
    }

    gui.statusBar.setStatus(activityTrackerAccountSummary(data));

    structure = newStructure;
    renderList();
    showDetails(selectedEntry.login, selectedEntry.testId, selectedEntry.passwordId);
}

function renderList() {
    pointerHandler.clear($('.categoryLabel'));
    pointerHandler.clear($('.login'));

    let html = /* html */ `<thead><tr>
        <th class="trackerIndent"></th>
        <th>${UILANG.m('Test taker')}</th>
        <th>${UILANG.m('Password / tag')}</th>
        <th>${UILANG.m('Test')}</th>
        <th>${UILANG.m('Progress')}</th>
        <th>${UILANG.m('Time left')}</th>
        <th class="trackerStatusHeader">${UILANG.m('Status')}</th>
    </tr></thead>`;
    let categoryList = Object.keys(structure);
    categoryList.sort(compareActivityCategories);
    for (let k of categoryList) {
        const accountSummary = activityTrackerAccountSummary(structure[k].logins);
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
        html += `<tbody data-category="${escapeAttribute(k)}" class='category ${structure[k].open ? '' : 'closed'}'><tr class='categoryLabel'><td colspan="7"><div class="categoryLabelContent"><div class="categoryLabelNames">${structure[k].label}</div><div class="categoryLabelSummary"><span class="categoryLoginCount">[${escapeAttribute(accountSummary)}]</span>${categoryProgress(totalCount, closedCount, timeOutCount)}</div></div></td></tr>`;
		if (structure[k].open) for (let login in structure[k].logins) {
            let loginData = structure[k].logins[login];
            for (let i in loginData.activity) {
                let activity = loginData.activity[i];
                if ((activity.status === STATUS_CLOSED || activity.status === STATUS_ABORTED) && visibilitySettings.includes('hideClosed')) continue;
                if (activity.status === STATUS_TIMEOUT && visibilitySettings.includes('hideTimeOut')) continue;
                const activityStatus = Number(activity.status);
                const activityStatusLabel = UILANG.m(activity.statusLabel || statusLabel[activityStatus] || 'unknown');
                const selected = selectedEntry.login === login
                    && Number(selectedEntry.testId) === Number(activity.testId)
                    && Number(selectedEntry.passwordId) === Number(activity.passwordId);
                html += `<tr class='login status_${activityStatus}${selected ? ' selected' : ''}' data-login="${escapeAttribute(login)}" data-test="${Number(activity.testId)}" data-password="${Number(activity.passwordId)}"><td class='leftSpace'></td><td>${activityTrackerIdentityHtml(loginData)}</td><td>${escapeAttribute(activityPasswordLabel(loginData, activity))}</td><td>${escapeAttribute(activity.test || '')}</td><td>${trackerProgress(activity.progress)}</td><td>${escapeAttribute(activity.timeLeft || '')}</td><td><div class="status" title="${escapeAttribute(activityStatusLabel)}" aria-label="${escapeAttribute(activityStatusLabel)}"></div></td></tr>`;
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

    updateExpandCollapseButtons();
}

function compareActivityCategories(left, right) {
    const noCategory = UILANG.m('No category');
    const segments = key => [...String(key).matchAll(/\[\[(.*?)\]\]/g)].map(match => match[1]);
    const leftParts = segments(left);
    const rightParts = segments(right);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index++) {
        const leftPart = leftParts[index] || '';
        const rightPart = rightParts[index] || '';
        if (leftPart === rightPart) continue;
        if (leftPart === noCategory) return -1;
        if (rightPart === noCategory) return 1;
        return leftPart.localeCompare(rightPart, undefined, {sensitivity: 'base', numeric: true});
    }
    return 0;
}

function activityTrackerIdentityHtml(loginData) {
    const type = journeyRunTypeInfo(loginData);
    const loginName = String(loginData?.loginName || loginData?.login || '');
    const parentName = String(loginData?.parentTemplateName || '');
    const primary = loginData?.loginTemplate === 'cloned' && parentName
        ? `${parentName} (${loginName})`
        : loginName;
    return /* html */`
        <span class="trackerIdentity">
            <img src="${escapeAttribute(type.icon)}" alt="">
            <span>
                <strong>${escapeAttribute(primary)}</strong>
                <small>${escapeAttribute(type.label)}</small>
            </span>
        </span>
    `;
}

function activityPasswordLabel(loginData, activity) {
    if (journeyIsStudentLogin(loginData)) {
        return activity.passwordLabel || activity.passwordTag || '';
    }
    return activity.passwordTag || activity.password || '';
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
    renderList();
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
    renderList();
    updateExpandCollapseButtons();
}

function updateExpandCollapseButtons() {
    if (!settingsElements.expandAll || !settingsElements.collapseAll) return;
    const categories = Object.keys(structure);
    if (categories.length === 0) {
        settingsElements.expandAll.disable();
        settingsElements.collapseAll.disable();
        return;
    }
    const allExpanded = categories.every(key => structure[key].open !== false);
    const allCollapsed = categories.every(key => structure[key].open === false);
    if (allExpanded) settingsElements.expandAll.disable();
    else settingsElements.expandAll.enable();
    if (allCollapsed) settingsElements.collapseAll.disable();
    else settingsElements.collapseAll.enable();
}

function rowHover(e) {
    let node = $(e.delegateTarget);
    node.addClass('hover');
}

function rowLeave(e) {
    let node = $(e.delegateTarget);
    node.removeClass('hover');
}

function activityTrackerAccountSummary(logins) {
    let loginCount = 0;
    let datasetCount = 0;
    const templateIds = new Set();

    for (const loginData of Object.values(logins || {})) {
        if (loginData?.loginTemplate === 'cloned') {
            datasetCount++;
            const templateId = Number(loginData.parentTemplateId);
            const templateName = String(loginData.parentTemplateName || '').trim();
            if (templateId > 0) {
                templateIds.add(`id:${templateId}`);
            } else if (templateName) {
                templateIds.add(`name:${templateName}`);
            }
        } else {
            loginCount++;
        }
    }

    const parts = [
        `${loginCount} ${UILANG.m(loginCount === 1 ? 'login' : 'logins')}`
    ];
    if (datasetCount > 0) {
        const templateCount = templateIds.size;
        parts.push(
            `${datasetCount} ${UILANG.m(datasetCount === 1 ? 'dataset' : 'datasets')} `
            + `${UILANG.m('from')} ${templateCount} ${UILANG.m(templateCount === 1 ? 'template' : 'templates')}`
        );
    }
    return parts.join(' · ');
}

function trackerProgress(p) {
    const progress = Math.max(0, Math.min(100, Number(p) || 0));
    return `<div class='outerPB'><div class="innerPB" style="width: ${progress}%"></div><div class="labelPB">${progress}%</div></div>`;
}

function categoryProgress(total, closed, timeout) {
    if (total <= 0) return `<div class='outerCPB'></div>`;
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
    tracker.find('tr.login').removeClass('selected');
    node.addClass('selected');
    showDetails(login, testId, passwordId);
}

function showDetails(login, testId, passwordId) {
    if (login === null || testId === null || passwordId === null || !dataCache?.[login]) {
        details.html("");
        controls.hide();
        selectedEntry = {login: null, testId: null, passwordId: null};
        return;
    }
    selectedEntry.login = login;
    selectedEntry.testId = testId;
    selectedEntry.passwordId = passwordId;
    let activity = fetchObjectFromArray(dataCache[login].activity, {testId: testId, passwordId: passwordId}, true);
    if (!activity) {
        controls.hide();
        details.empty();
        return;
    }
    const loginId = Number(dataCache[login].loginId);
    const activityTestId = Number(activity.testId);
    const activityPasswordId = Number(activity.passwordId);
    const loginData = dataCache[login];
    const type = journeyRunTypeInfo(loginData);
    const loginName = String(loginData.loginName || loginData.login || login);
    const parentName = String(loginData.parentTemplateName || '');
    const detailTitle = loginData.loginTemplate === 'cloned' && parentName
        ? `${parentName} (${loginName})`
        : loginName;
    const studentLogin = journeyIsStudentLogin(loginData);
    let html = `<tr><td colspan="2"><div class="activityDetailIdentity"><img src="${escapeAttribute(type.icon)}" alt=""><span><h2>${escapeAttribute(detailTitle)}</h2><small>${escapeAttribute(type.label)}</small></span></div></td></tr>`;
    html += `<tr><td>${UILANG.m('login id')}:</td><td><a href="#" class="activityJourneyLink" data-scope="login" data-login="${loginId}">${loginId}</a></td></tr>`;
    html += `<tr><td>${UILANG.m('test id')}:</td><td>${activityTestId}</td></tr>`;
    html += `<tr><td>${UILANG.m('test name')}:</td><td>${escapeAttribute(activity.test || '')}</td></tr>`;
    html += `<tr><td>${UILANG.m(studentLogin ? 'label id' : 'password id')}:</td><td><a href="#" class="activityJourneyLink" data-scope="password" data-login="${loginId}" data-password="${activityPasswordId}">${activityPasswordId}</a></td></tr>`;
    if (studentLogin) {
        const label = activity.passwordLabel || activity.passwordTag || '';
        html += `<tr><td>${UILANG.m('label')}:</td><td>${escapeAttribute(label)}</td></tr>`;
        if (activity.password) html += `<tr><td>${UILANG.m('label password')}:</td><td>${escapeAttribute(activity.password)}</td></tr>`;
    } else {
        html += `<tr><td>${UILANG.m('password')}:</td><td>${escapeAttribute(activity.password || '')}</td></tr>`;
        if (activity.passwordTag) html += `<tr><td>${UILANG.m('password tag')}:</td><td>${escapeAttribute(activity.passwordTag)}</td></tr>`;
    }
    html += `<tr><td>${UILANG.m('login date')}:</td><td>${escapeAttribute(activity.loginDate || '')}</td></tr>`;
    html += `<tr><td>${UILANG.m('login time')}:</td><td>${escapeAttribute(activity.loginTime || '')}</td></tr>`;
    html += `<tr><td>${UILANG.m('last contact date')}:</td><td>${escapeAttribute(activity.contactDate || '')}</td></tr>`;
    html += `<tr><td>${UILANG.m('last contact time')}:</td><td>${escapeAttribute(activity.contactTime || '')}</td></tr>`;
    html += `<tr><td>${UILANG.m('progress')}:</td><td>${Number(activity.progress) || 0}%</td></tr>`;
    const timeLimit = Number(activity.timeLimit) || 0;
    html += `<tr><td>${UILANG.m('time limit')}:</td><td>${timeLimit > 0 ? `${timeLimit} ${UILANG.m('minutes')}` : UILANG.m('No time limit')}</td></tr>`;
    html += `<tr><td>${UILANG.m('time left')}:</td><td>${escapeAttribute(activity.timeLeft || '')}</td></tr>`;
    html += `<tr><td>${UILANG.m('status')}:</td><td>${UILANG.m(activity.statusLabel || statusLabel[Number(activity.status)] || 'unknown')}</td></tr>`;
    html += `<tr><td>${UILANG.m('behaviour')}:</td><td><a href="#" class="activityJourneyLink" data-scope="run" data-login="${loginId}" data-password="${activityPasswordId}" data-test="${activityTestId}">${UILANG.m('see complete log')}</a></td></tr>`;
    details.html(html);
    details.find('.activityJourneyLink').off('click').on('click', function(event) {
        event.preventDefault();
        openActivityJourney(
            String($(this).data('scope')),
            Number($(this).data('login')) || null,
            Number($(this).data('password')) || null,
            Number($(this).data('test')) || null
        );
    });
    controls.toggle(activity.canWrite === true || Number(activity.canWrite) === 1);
    if (!controls.is(':visible')) return;
    //if status is closed, disable the "close test" button
    if (activity.status === STATUS_CLOSED) {
        $('#btnCloseTest').hide();
        if (Number(activity.timeLimit) === 0) {
            $('#btnIncreaseTime').hide();
            $('#btnReopenTest').show();
        } else {
            $('#btnIncreaseTime').show();
            $('#btnReopenTest').hide();
        }
    } else {
        $('#btnCloseTest').show();
        $('#btnReopenTest').hide();
        if (Number(activity.timeLimit) === 0) {
            $('#btnIncreaseTime').hide();
        } else {
            $('#btnIncreaseTime').show();
        }
    }

}

async function activityJourneyRequest(action) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: 'activityTrackerActions.php',
            type: 'POST',
            cache: false,
            dataType: 'json',
            timeout: 300000,
            data: {
                data: JSON.stringify({requestKind: 'journey'}),
                action: JSON.stringify(action)
            },
            success: resolve,
            error: (_xhr, status, error) => reject(new Error(error || status))
        });
    });
}

async function openActivityJourney(scope, loginId, passwordId, testId) {
    activityJourney.wasLive = profile.live === true;
    if (timeoutPointer !== null) {
        clearTimeout(timeoutPointer);
        timeoutPointer = null;
    }
    $('#journeyDetailView').html(`<div class="journeyLoading">${UILANG.m('please wait')}</div>`);
    try {
        const response = await activityJourneyRequest({
            action: 'fetchJourneySelection',
            scope,
            loginId,
            passwordId,
            testId
        });
        if (response.error) {
            showMessage(response.error);
            return;
        }
        activityJourney = {
            ...activityJourney,
            open: true,
            scope,
            loginId,
            passwordId,
            testId,
            runs: response.data?.runs || [],
            selectedKey: null,
            filter: ''
        };
        lPanel.hide();
        rPanel.hide();
        gui.main.hide();
        $('#activityJourney').show().toggleClass('is-single-run', scope === 'run');
        activityJourneyBackButton.show();
        activityJourneyRefreshButton.show();
        activityTrackerRefreshButton.hide();
        kbHandler.registerShortcut('up', () => navigateActivityJourney(-1));
        kbHandler.registerShortcut('down', () => navigateActivityJourney(1));
        gui.statusBar.setStatus(activityJourneyContextLabel());
        $('#statusBar > strong').css('margin-right', 0);
        renderActivityJourneyList();
        const first = activityJourney.runs[0];
        if (first) await selectActivityJourneyRun(first.passwordId, first.testId);
        else $('#journeyDetailView').html(`<div class="journeyEmpty">${UILANG.m('No activity data is available.')}</div>`);
    } catch (error) {
        console.error(error);
        showMessage(UILANG.m('Unable to load data.'));
    }
}

async function refreshActivityJourney() {
    if (!activityJourney.open) return;
    const selectedKey = activityJourney.selectedKey;
    const filter = activityJourney.filter;
    const response = await activityJourneyRequest({
        action: 'fetchJourneySelection',
        scope: activityJourney.scope,
        loginId: activityJourney.loginId,
        passwordId: activityJourney.passwordId,
        testId: activityJourney.testId
    });
    if (response.error) {
        showMessage(response.error);
        return;
    }
    activityJourney.runs = response.data?.runs || [];
    activityJourney.filter = filter;
    renderActivityJourneyList();
    const selected = activityJourney.runs.find((run) => activityJourneyRunKey(run) === selectedKey)
        || activityJourney.runs[0];
    if (selected) await selectActivityJourneyRun(selected.passwordId, selected.testId);
    else $('#journeyDetailView').html(`<div class="journeyEmpty">${UILANG.m('No activity data is available.')}</div>`);
}

function closeActivityJourney() {
    activityJourney.open = false;
    activityJourney.selectedKey = null;
    $('#activityJourney').hide().removeClass('is-single-run');
    $('#journeyTakerList, #journeyListFilter, #journeyDetailView, #journeyListHeader, #journeyDetailHeader').empty();
    activityJourneyBackButton.hide();
    activityJourneyRefreshButton.hide();
    activityTrackerRefreshButton.show();
    gui.main.show();
    lPanel.show();
    rPanel.show();
    gui.statusBar.setStatus('');
    $('#statusBar > strong').css('margin-right', '10px');
    kbHandler.registerShortcut('up', '');
    kbHandler.registerShortcut('down', '');
    if (activityJourney.wasLive) {
        profile.live = true;
        fetchNewData();
    }
}

function activityJourneyRunKey(run) {
    return `${Number(run.passwordId)}:${Number(run.testId)}`;
}

function activityJourneyContextLabel() {
    const run = activityJourney.runs[0] || {};
    if (activityJourney.scope === 'run') return UILANG.m('Current test journey');
    if (activityJourney.scope === 'login') {
        return `${UILANG.m('Test journeys for login')} ${journeyEsc(run.loginName || activityJourney.loginId || '')}`;
    }
    const loginName = run.loginName || activityJourney.loginId || '';
    const credential = journeyRunPasswordLabel(run) || activityJourney.passwordId || '';
    const credentialType = journeyIsStudentLogin(run) ? UILANG.m('label') : UILANG.m('password');
    return `${UILANG.m('Test journeys for')} ${credentialType} ${journeyEsc(credential)} ${UILANG.m('from login')} ${journeyEsc(loginName)}`;
}

function navigateActivityJourney(direction) {
    if (!activityJourney.open || activityJourney.scope === 'run') return;
    const runs = activityJourneyFilteredRuns();
    if (runs.length === 0) return;
    const current = runs.findIndex((run) => activityJourneyRunKey(run) === activityJourney.selectedKey);
    const nextIndex = current < 0
        ? (direction < 0 ? runs.length - 1 : 0)
        : Math.max(0, Math.min(runs.length - 1, current + direction));
    const next = runs[nextIndex];
    if (next && activityJourneyRunKey(next) !== activityJourney.selectedKey) {
        selectActivityJourneyRun(next.passwordId, next.testId);
    }
}

function activityJourneyFilteredRuns() {
    const filter = String(activityJourney.filter || '').trim().toLowerCase();
    if (!filter) return activityJourney.runs;
    return activityJourney.runs.filter((run) => [
        run.testName,
        run.testId,
        run.passwordName,
        run.passwordTag,
        run.passwordLabel,
        run.loginName,
        run.parentTemplateName,
        run.parentTemplateDisplayName,
        journeyLocalizedStatus(run.status)
    ].join(' ').toLowerCase().includes(filter));
}

function renderActivityJourneyList() {
    if (activityJourney.scope === 'run') {
		$('#journeyTakerList, #journeyListFilter, #journeyListHeader').empty();
        return;
    }
    const accountUsesLabels = journeyIsStudentLogin(activityJourney.runs[0] || {});
    const filterPlaceholder = accountUsesLabels
        ? UILANG.m('Filter tests, labels')
        : UILANG.m('Filter tests, passwords');
    const list = $('#journeyTakerList');
	$('#journeyListFilter').html(/* html */`
        <div class="journeyFilterWrap">
            <input id="journeyFilter" type="search" value="${journeyEsc(activityJourney.filter)}"
                placeholder="${journeyEsc(filterPlaceholder)}" />
        </div>
    `);
	list.html('<div class="journeyTakerStack"></div>');
    $('#journeyFilter').off('input').on('input', function() {
        activityJourney.filter = this.value;
        renderActivityJourneyRows();
    });
    $('#activityJourneyListTitle').text(
        activityJourney.scope === 'login' ? UILANG.m('Tests for test taker') : UILANG.m('Tests for password')
    );
    renderActivityJourneyRows();
}

function renderActivityJourneyRows() {
    const runs = activityJourneyFilteredRuns();
    const rows = runs.map((run) => {
        const selected = activityJourneyRunKey(run) === activityJourney.selectedKey ? ' is-selected' : '';
        const loginIdentity = run.loginTemplate === 'cloned'
            ? `<span class="journeyTakerRun">${journeyEsc(`${UILANG.m('Dataset')} ${run.loginName}`)}</span>`
            : '';
        return /* html */`
            <button type="button" class="journeyTaker${selected}"
                data-password="${Number(run.passwordId)}" data-test="${Number(run.testId)}"
                data-has-activity="${run.hasActivity ? '1' : '0'}">
                <span class="journeyTakerMain">
                    <span class="journeyTakerTitle">
                        <strong>${journeyEsc(run.testName || run.testId)}</strong>
                    </span>
                    <em>
                        ${loginIdentity}
                        <span class="journeyTakerRun${loginIdentity ? ' hasLoginIdentity' : ''}">${journeyEsc(journeyRunPasswordLabel(run) || run.passwordId)}</span>
                    </em>
                </span>
                <span class="journeyTakerStats">
                    <span class="journeyStatusBadge ${journeyStatusClass(run.status)}">${journeyEsc(journeyLocalizedStatus(run.status))}</span>
                    <span>${journeyEsc(journeyPercent(run.progress))}</span>
                    <span>${Number(run.eventCount || 0)} ${UILANG.m('events')}</span>
                </span>
            </button>
        `;
    }).join('');
    $('#journeyListHeader').text(`${runs.length} ${UILANG.m('visible')} / ${activityJourney.runs.length}`);
    $('#journeyTakerList .journeyTakerStack').html(rows || `<div class="journeyEmpty">${UILANG.m('No matching tests found.')}</div>`);
    $('#journeyTakerList .journeyTaker').off('click').on('click', function() {
        selectActivityJourneyRun(Number($(this).data('password')), Number($(this).data('test')));
    });
}

async function selectActivityJourneyRun(passwordId, testId) {
    activityJourney.selectedKey = `${Number(passwordId)}:${Number(testId)}`;
    renderActivityJourneyRows();
    const selectedRun = activityJourney.runs.find((run) => activityJourneyRunKey(run) === activityJourney.selectedKey);
    if (selectedRun && selectedRun.hasActivity === false) {
        $('#journeyDetailHeader').html(`<span>${journeyEsc(selectedRun.testName || selectedRun.testId)}</span>`);
        $('#journeyDetailView').html(/* html */`
            <div class="journeyEmpty activityJourneyNoResults">
                <strong>${journeyEsc(UILANG.m('Test not opened'))}</strong>
                <span>${journeyEsc(UILANG.m('This test is assigned, but the test taker has not opened it yet or no results are available.'))}</span>
            </div>
        `);
        return;
    }
    $('#journeyDetailView').html(`<div class="journeyLoading">${UILANG.m('please wait')}</div>`);
    const response = await activityJourneyRequest({
        action: 'fetchJourneyDetail',
        passwordId: Number(passwordId),
        testId: Number(testId)
    });
    if (!activityJourney.open || activityJourney.selectedKey !== `${Number(passwordId)}:${Number(testId)}`) return;
    if (response.error) {
        $('#journeyDetailView').html(`<div class="journeyEmpty">${journeyEsc(response.error)}</div>`);
        return;
    }
    renderJourneyDetail(response.data);
    const summary = response.data?.summary || {};
    $('#journeyDetailHeader').html(
        `<span>${journeyEsc(summary.testName || summary.testId)} · ${journeyEsc([journeyPrimaryLoginName(summary), journeyRunPasswordLabel(summary) || summary.passwordId].filter(value => String(value || '').trim() !== '').join(' / '))}</span>`
    );
}

/* server communication */

function startAjax(data, action = {}) {
    const requestId = ++requestSequence;
    const isAction = Boolean(action && action.action);
    const requestData = Object.assign({}, data, {
        requestId: requestId,
        requestKind: isAction ? 'action' : 'poll',
        includeMeta: !metaSuggestionsLoaded
    });
    if (activeRequest && activeRequest.readyState !== 4) activeRequest.abort();
    if (profile.live !== true && typeof waitDialog !== 'undefined') waitDialog.show();
    setActivityRefreshIndicator('loading');
    let params = {
        data: JSON.stringify(requestData),
        action: JSON.stringify(action)
    };
    activeRequest = $.ajax({
        data: params
    });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    if (textStatus === 'abort') return;
    if (typeof waitDialog !== 'undefined') waitDialog.hide();
    setActivityRefreshIndicator('error');
    actionInFlight = false;
    controls.find('button').prop('disabled', false);
    console.error('Error: ' + errorThrown);
    if (jqXHR?.responseJSON) {
        console.error(jqXHR.responseJSON.fatalError ?? 'no error details given');
    }
    if (profile.live === true) {
        scheduleActivityRefresh();
    }
}

function ajaxSuccess(res) {
    if (typeof waitDialog !== 'undefined') waitDialog.hide();
    const responseId = Number(res.requestId) || 0;
    if (responseId < latestAppliedRequest) return;
    latestAppliedRequest = responseId;
    if (res.requestKind === 'action') {
        actionInFlight = false;
        controls.find('button').prop('disabled', false);
    }
    $('#un_val').text(res.loggedInName || '');
    //if there was a fatal PHP error that prevented the script from finishing show that error
    //this data is created in PHP via the register_shutdown_function
    let dialogData;
    if (res.fatalError) {
        setActivityRefreshIndicator('error');
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage(`<strong>${UILANG.m('Sorry! The action cannot be completed.')}</strong><br /> ${res.fatalError}`),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        };
        new nxDialog('fatalError', dialogData);
        if (profile.live === true) scheduleActivityRefresh();
        return;
    }
    //if a normal error occured in PHP that did not prevent the script from finishing, show it
    if (res.error !== false) {
        setActivityRefreshIndicator('error');
        dialogData = {
            buttons: [{
                label: UILANG.m('OK'),
                'default': true,
                cancel: true,
                value: 'ok'
            }],
            contents: formatActionErrorMessage('<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.error),
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
        if (profile.live === true) scheduleActivityRefresh();
        return;
    }
    if (res.warnings) {
        for (let i in res.warnings) {
            showMessage(res.warnings[i]);
        }
    }
    if (res.metaSuggestions || res.metaKeys) {
        updateMetaKeySuggestions(res.metaSuggestions || res.metaKeys || []);
        metaSuggestionsLoaded = true;
    }
    if (Array.isArray(res.activityDates)) {
        activityDates = new Set(res.activityDates);
        if (tfDate) tfDate.datepicker('refresh');
    }
    updateList(res.data || {});
    setActivityRefreshIndicator('updated');
    if (profile.live === true) {
        scheduleActivityRefresh();
    }
}

function setActivityRefreshIndicator(state) {
    if (!$('#activityRefreshIndicator').length) {
        $('#statusBar').append('<span id="activityRefreshIndicator" class="activityRefreshIndicator" aria-live="polite"></span>');
    }
    const indicator = $('#activityRefreshIndicator');
    if (refreshIndicatorTimer !== null) {
        clearTimeout(refreshIndicatorTimer);
        refreshIndicatorTimer = null;
    }
    indicator.removeClass('is-loading is-updated is-error');
    if (state === 'loading') {
        refreshIndicatorStartedAt = Date.now();
        indicator.addClass('is-loading').html(`<span class="activityRefreshSpinner"></span>${UILANG.m('Refreshing…')}`);
        return;
    }
    if (state === 'error') {
        indicator.addClass('is-error').text(UILANG.m('Refresh failed'));
    } else {
        const remaining = Math.max(0, 500 - (Date.now() - refreshIndicatorStartedAt));
        if (remaining > 0) {
            indicator.addClass('is-loading').html(`<span class="activityRefreshSpinner"></span>${UILANG.m('Refreshing…')}`);
        }
        refreshIndicatorTimer = setTimeout(() => {
            indicator.removeClass('is-loading is-updated is-error').empty();
            refreshIndicatorTimer = null;
        }, remaining);
        return;
    }
    refreshIndicatorTimer = setTimeout(() => {
        indicator.removeClass('is-loading is-updated is-error').empty();
        refreshIndicatorTimer = null;
    }, 3000);
}

function scheduleActivityRefresh() {
    if (timeoutPointer !== null) clearTimeout(timeoutPointer);
    timeoutPointer = setTimeout(fetchNewData, 5000);
}
