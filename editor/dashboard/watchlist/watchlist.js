"use strict";
(function ($) {
    function WatchList(container, id) {
        const checkValues = ['content', 'tests', 'testtakers', 'testresults'];
        if (checkValues.every(value => !settings.editorButtons.includes(value))) {
            return;
        }

        const myContainer = createDashWidget(container, id, {
            title: UILANG.m("Watchlist"),
            iconPath: "../images/dashboard/dash_ico_watchlist.svg"
        });

        $.ajaxSetup({
            url: "dashboard/watchlist/watchlist.php",
            success: ajaxSuccessWatchlist
        });

        let watchid, currentTab; // current watchlist record id, tab
        const myTabs = new jsTabs($('#WatchList'), 'myTabs');
        const tabList = {};
        const containers = [];
        let startAction;
        if (settings.editorButtons.includes('content')) {
            tabList['content'] = UILANG.m('Content');
            containers.push('contentcontainer');
            $('#WatchList').append('<div id="contentcontainer"></div>');
            if (!startAction) startAction = 'getContent';
        }
        if (settings.editorButtons.includes('tests')) {
            tabList['tests'] = UILANG.m('Tests');
            containers.push('testscontainer');
            $('#WatchList').append('<div id="testscontainer" class="watchlist"></div>');
            if (!startAction) startAction = 'getTests';

        } else if (settings.editorButtons.includes('testresults')) {
            tabList['tests'] = UILANG.m('Tests');
            containers.push('testscontainer');
            $('#WatchList').append('<div id="testscontainer"></div>');
            if (!startAction) startAction = 'getTests';
        }
        if (settings.editorButtons.includes('testtakers')) {
            tabList['testtakers'] = UILANG.m('Test takers');
            containers.push('testtakerscontainer');
            $('#WatchList').append('<div id="testtakerscontainer"></div>');
            if (!startAction) startAction = 'getTesttakers';
        }

        myTabs.setTabs(tabList);

        // init jsTabs click handler
        let tSel = myTabs.getEventType('select');
        $(window).off(tSel);
        $(window).on(tSel, function (ret) {
            for (let c in containers) {
                $('#' + containers[c]).hide();
            }
            $('#' + ret.originalEvent.detail + 'container').show();

            switch (ret.originalEvent.detail) {
                case 'tests':
                    startAjax('getTests', {});
                    break;
                case 'content':
                    startAjax('getContent', {});
                    break;
                case 'testtakers':
                    startAjax('getTesttakers', {});
                    break;
            }
        });

        if (startAction) startAjax(startAction, {});

        function populateTests(data) {
            $('#testscontainer').empty();
            let tString = '<table class="wl-table">\n' +
                '  <thead class="wl-tHeader">\n' +
                '    <tr>\n' +
                '      <th class="wl-HName">' + UILANG.m('Name') + '</th>\n' +
                '      <th>' + UILANG.m('Owner') + '</th>\n' +
                '      <th ></th>\n' +
                '      <th >' + UILANG.m('Type') + '</th>\n' +
                '      <th>' + UILANG.m('Languages') + '</th>\n' +
                '      <th>' + UILANG.m('State') + '</th>\n' +
                '      <th>' + UILANG.m('Test taker data') + '</th>\n' +
                '      <th></th>\n' +
                '    </tr>\n' +
                '  </thead>\n' +
                '  <tbody>\n';
            if (data.length === 0) {
                $('#testscontainer').append('<div class="noFavMsg">' + UILANG.m('No favorites in tests added yet!') + '</div>');
                return;
            }
            let tooltipsArray = {}; //array to add tooltips. format:  selector_id:{selector:(thetype of element, e.g. "div" content:"content html or string")}
            for (let d in data) {
                tString += '<tr>\n';
                const tooltipId = data[d].id + "_testName";
                const pathString = '<div class= "wl-tooltip-path"> ' + escapeHtml(data[d].path) + ' </div>'; //set the string for the path here
                const tooltipContent = {selector: "a", content: pathString};
                tooltipsArray[tooltipId] = tooltipContent;
                let toolTipString = '';
                const accessLockedIcon = data[d].access === false ? 'blocked' : ''; // class name for lock icon
                if (data[d].type === 'folder') {
                    tString += '<td> <div class="wl-itemName folder ' + accessLockedIcon + '" ><a id="' + tooltipId + '"  href="tests.php?id=' + data[d].id + '&ta=' + 3 + '">' + escapeHtml(data[d].name) + '</a></div></td>\n';

                } else if (data[d].type === 'test') {

                    // Capitalize the first character of data[d].ttype
                    let ttypeClass = 'test' + data[d].ttype.charAt(0).toUpperCase() + data[d].ttype.slice(1);

                    tString += '<td><div class="wl-itemName ' + ttypeClass + ' ' + accessLockedIcon + '">'
                        + '<a id="' + tooltipId + '" href="tests.php?id=' + data[d].id + '&ta=' + 4 + '">'
                        + escapeHtml(data[d].name) + '</a></div></td>\n';





                    //tString += '<td> <div class="wl-itemName test ' + accessLockedIcon + '" ><a id="' + tooltipId + '" href="tests.php?id=' + data[d].id + '&ta=' + 4 + '">' + escapeHtml(data[d].name) + '</a></div></td>\n';

                    //tooltip restrictions
                    let restr = JSON.parse(data[d].restrictions.restrictionsobject);

                    if (restr === null) { // nothing set
                        toolTipString = UILANG.m('No restrictions set');
                    } else if (restr.dateRange === false && restr.timeRestriction === false && restr.testDays === false) { // set but false
                        toolTipString = UILANG.m('No restrictions set');
                    } else {
                        if (restr.dateRange !== false) { // dateRange?
                            const scheduleFrom = formatDateRange(restr.dateRange.start);
                            const scheduleDateFrom = scheduleFrom[0];
                            const scheduleTimeFrom = scheduleFrom[1];
                            let scheduleDateTo, scheduleTimeTo;
                            if (restr.dateRange.end === false) { // end set to infinite
                                scheduleDateTo = UILANG.m('infinite');
                                scheduleTimeTo = '';
                            } else {
                                const scheduleTo = formatDateRange(restr.dateRange.end);
                                scheduleDateTo = scheduleTo[0];
                                scheduleTimeTo = scheduleTo[1];
                            }

                            const scheduleTitle = UILANG.m('The test is scheduled between');

                            toolTipString += '<div class="wl-sheduleTooltipBox">' +
                                '<div class="wl-dateblockTitle">' + scheduleTitle + '</div>' +
                                '<div class="wl-datesblock">' +
                                '<div class="wl-dateblock">' +
                                '<div class="wl-date">' + scheduleDateFrom + '</div>' +
                                '<div class="wl-time">' + scheduleTimeFrom + '</div>' +
                                '' +
                                '</div>' +
                                '<div class="wl-dateblock">' +
                                '<div class="wl-date">' + scheduleDateTo + '</div>' +
                                '<div class="wl-time">' + scheduleTimeTo + '</div>' +
                                '</div>' +
                                '</div>' +
                                '</div>';
                        }

                        if (restr.timeRestriction !== false) { // timeRestriction?
                            const scheduleTitle = UILANG.m('The time is restricted between');
                            toolTipString += '<div class="wl-sheduleTooltipBox">' +
                                '<div class="wl-dateblockTitle">' + scheduleTitle + '</div>' +
                                '<div class="wl-datesblock">' +
                                '<div class="wl-dateblock">' +
                                '<div class="wl-date">' + restr.timeRestriction.start + '</div>' +
                                '' +
                                '</div>' +
                                '<div class="wl-dateblock">' +
                                '<div class="wl-date">' + restr.timeRestriction.end + '</div>' +
                                '</div>' +
                                '</div>' +
                                '</div>';
                        }

                        if (restr.testDays !== false) { // restricted to specific days?
                            const scheduleTitle = UILANG.m('The test is active on');
                            toolTipString += '<div class="wl-sheduleTooltipBox">' +
                                '<div class="wl-dateblockTitle">' + scheduleTitle + '</div>' +
                                '<div class="wl-datesblock">' +
                                '<div class="wl-dateblock">' +
                                '<div class="wl-date">' + translateWeekdays(restr.testDays.days) + '</div>' +
                                '' +
                                '</div>' +
                                '</div>' +
                                '</div>';
                        }

                        if (data[d].forceLogoff !== false) {
                            toolTipString += '<div class="wl-sheduleTooltipBox">' +
                                '<div class="wl-dateblockTitle">' + UILANG.m('Force logoff on inactive test') + ':  <span>' + UILANG.m('yes') + '</span></div>' +
                                '</div>';
                        }
                    }

                }
                let act = data[d].active === 'active' ? 'active' : 'inactive';
                // translate db value to displayed string
                data[d].active = data[d].active === 'inactive' ? 'deactivated' : data[d].active;
                //add tooltips for activity
                let activity;
                let adtivityId = data[d].id + "_activity";
                let activityTooltipContent = {selector: "span", content: toolTipString};
                tooltipsArray[adtivityId] = activityTooltipContent;

                if (data[d].activity === null || data[d].activity === '-') {
                    activity = 'zero';
                } else {
                    activity = 'nonzero';
                }
                let langText = "";
                let langblockClass = "";
                if (data[d].ttype === 'mutation') { // mutants don't have a languge
                    langText = '';
                } else if (!data[d].lang || data[d].lang === null) {
                    langText = UILANG.m('no language set');
                    langblockClass = "wl-lang-missing"
                } else {
                    langText = data[d].lang;
                }
                if (data[d].activity === null) {
                    data[d].activity = UILANG.m('no data recorded');
                }

                let hasError = '';
                let message = '';
                let issueTooltipString = '';
                let issueId;
                if (data[d].type !== 'folder' && data[d].ttype !== 'mutation') { // folders and mutation tests don't have issues
                    hasError = data[d].issues.issueCount > 0 ? 'wl-itemError' : ''; // @Tom use empty string for ok-class

                    if (data[d].issues.issueCount === 1) {
                        message = '1 ' + UILANG.m('issue found');
                    } else if (data[d].issues.issueCount > 1) {
                        message = data[d].issues.issueCount + ' ' + UILANG.m('issues found');
                    }

                    if (data[d].issues.issueCount > 0) { // add to tooltip
                        if (data[d].issues.noItems === true) {
                            if (data[d].ttype === 'linear') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('No test pages in the test!') + '</div>';
                            } else if (data[d].ttype === 'fluid') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('No test blocks are assigned to the test!') + '</div>';
                            }
                        }
                        if (data[d].issues.timerIssue === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Timer is active, but set to 0 mins!') + '</div>';
                        if (data[d].issues.noContentErrorFlag === true) {
                            if (data[d].ttype === 'linear') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test pages in the test which have no content: ') + '</div>';
                            } else if (data[d].ttype === 'fluid') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Test pages without content detected in the following test pool(s): ') + '</div>';
                            }

                            issueTooltipString += '<ul>';
                            let numberOfEntries = 0;
                            const maxEntries = 3; // max number of entries for a reasonable display
                            const maxEntriesMsg = '...';
                            for (let key in data[d].issues.noContentError) {
                                numberOfEntries++;
                                if (numberOfEntries > maxEntries) {
                                    issueTooltipString += '<li>' + maxEntriesMsg + '</li>';
                                    break;
                                }
                                issueTooltipString += '<li>' + data[d].issues.noContentError[key]['itemName'] + '</li>';
                            }
                            issueTooltipString += '</ul>';
                        }
                        if (data[d].issues.noActiveLanguage === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Test has no language enabled!') + '</div>';
                        if (data[d].issues.langErrorFlag === true) {
                            if (data[d].ttype === 'linear') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test pages in the test which do not have content for all activated languages!') + '</div>';
                                issueTooltipString += '<ul>';
                                let numberOfEntries = 0;
                                const maxEntries = 3; // max number of entries for a reasonable display
                                const maxEntriesMsg = '...';
                                for (let key in data[d].issues.langError) {
                                    numberOfEntries++;
                                    if (numberOfEntries > maxEntries) {
                                        issueTooltipString += '<li>' + maxEntriesMsg + '</li>';
                                        break;
                                    }
                                    const languageArr = Object.values(data[d].issues.langError[key].languages);
                                    const languageString = languageArr.join(',');
                                    issueTooltipString += '<li>' + data[d].issues.langError[key].itemName + ' ' + languageString + '</li>';
                                }
                                issueTooltipString += '</ul>';
                            } else if (data[d].ttype === 'fluid') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test pages in your test pool(s) which do not have content for all activated languages!') + '</div>';
                            }
                        }

                        if (data[d].issues.missingItems.length > 0) {
                            if (data[d].ttype === 'linear') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test pages in the test which have been deleted!') + '</div>';
                            } else if (data[d].ttype === 'fluid') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test pages in your test pool(s) which have been deleted!') + '</div>';
                            }
                        }

                        if (data[d].issues.pnNoContent === true) {
                            issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('The privacy note is enabled for this test, but no content has been provided or content for the active language(s) is missing!') + '</div>';
                        }


                        if (data[d].ttype === 'fluid') {
                            if (data[d].issues.itemsAmountErrorFlag === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test blocks having less pages than they are set to!') + '</div>';
                            if (data[d].issues.deletedPoolFlag === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are test blocks in the test, which have been deleted!') + '</div>';
                        }

                        if (data[d].issues.duplicates === true) {
                            if (data[d].ttype === 'linear') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('This test contains duplicate test pages!') + '</div>';
                            } else if (data[d].ttype === 'fluid') {
                                issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('This test contains test blocks with duplicate test pages!') + '</div>';
                            }
                        }
                    }

                    //add tooltips for issues
                    issueId = data[d].id + "_issue";
                    let issueTooltipContent = {selector: "td", content: issueTooltipString};
                    tooltipsArray[issueId] = issueTooltipContent;
                }

                tString += '<td class="wl-ownerName">' + data[d].owner + '</td>\n' +
                    '<td class="wl-notification  wl-notificationWithIcon ' + hasError + '" id="' + issueId + '"> <span>' + message + '</span> </td>\n' +
                    '<td class="wl-testType">' + data[d].ttype + '</td>\n' +
                    '<td class="wl-testLangs ' + langblockClass + '">' + langText + '</td>\n' +
                    '<td class="wl-testState ' + act + '" > <span id="' + adtivityId + '">' + data[d].active + ' </span></td>\n' +
                    '<td class="wl-testData ' + activity + '"> ' + data[d].activity + ' </td>\n' +
                    '<td class="wl-starCol"><div class="watchListToggle"><i class="star checked" data-tab="tests" data-watchid="' + data[d].watchid + '" data-path="' + escapeHtml(data[d].path) + '"/></div> </td>\n';
                tString += '</tr>\n';
            }
            tString += '</tbody>\n' +
                '</table>\n';
            $('#testscontainer').append(tString);
            starFleet();
            addTooltips(tooltipsArray);
        }

        function populateContent(data) {
            $('#contentcontainer').empty();

            let tString = '<table class="wl-table">\n' +
                '  <thead class="wl-tHeader">\n' +
                '    <tr>\n' +
                '      <th class="wl-HName">' + UILANG.m('Name') + '</th>\n' +
                '      <th>' + UILANG.m('Owner') + '</th>\n' +
                '      <th ></th>\n' +
                '      <th></th>\n' +
                '    </tr>\n' +
                '  </thead>\n' +
                '  <tbody>\n';

            if (data.length === 0) {
                $('#contentcontainer').append('<div class="noFavMsg">' + UILANG.m('No favorites in content added yet!') + '</div>');
                return;
            }
            let tooltipsArray = {};
            for (let d in data) {
                const tooltipId = data[d].id + "_contentName";
                const contentString = '<div class= "wl-tooltip-path"> ' + escapeHtml(data[d].path) + ' </div>';
                const tooltipContent = {selector: "a", content: contentString};
                tooltipsArray[tooltipId] = tooltipContent;
                const accessLockedIcon = data[d].access === false ? 'blocked' : ''; // class name for lock icon
                tString += '<tr>\n';
                if (data[d].type === 'folder') {
                    tString += '<td> <div class="wl-itemName folder ' + accessLockedIcon + '"><a id="' + tooltipId + '" href="items.php?id=' + data[d].id + '&ta=' + 1 + '">' + escapeHtml(data[d].name) + '</a></div></td>\n';
                } else if (data[d].type === 'group') {
                    tString += '<td> <div class="wl-itemName itemsGroup ' + accessLockedIcon + '"><a id="' + tooltipId + '" href="items.php?id=' + data[d].id + '&ta=' + 2 + '">' + escapeHtml(data[d].name) + '</a></div></td>\n';
                }
                tString += '<td class="wl-ownerName">' + data[d].owner + '</td>\n' +
                    '<td class="wl-notification"></td>\n' +
                    '<td class="wl-starCol"><div class="watchListToggle"><i class="star checked" data-tab="content" data-watchid="' + data[d].watchid + '" data-path="' + escapeHtml(data[d].path) + '"/></div> </td>\n';
                tString += '</tr>\n';
            }
            tString += '</tbody>\n' +
                '</table>\n';
            $('#contentcontainer').append(tString);
            starFleet();
            addTooltips(tooltipsArray);
        }

        function populateTesttakers(data) {
            $('#testtakerscontainer').empty();
            let tString = '<table class="wl-table">\n' +
                '  <thead class="wl-tHeader">\n' +
                '    <tr>\n' +
                '      <th class="wl-HName">' + UILANG.m('Name') + '</th>\n' +
                '      <th>' + UILANG.m('Owner') + '</th>\n' +
                '      <th>' + UILANG.m('Type') + '</th>\n' +
                '      <th ></th>\n' +
                '      <th></th>\n' +
                '    </tr>\n' +
                '  </thead>\n' +
                '  <tbody>\n';
            if (data.length === 0) {
                $('#testtakerscontainer').append('<div class="noFavMsg">' + UILANG.m('No favorites in test takers added yet!') + '</div>');
                return;
            }
            let tooltipsArray = {};

            for (let d in data) {
                const tooltipId = data[d].id + "_testTakerName";
                const contentString = '<div class= "wl-tooltip-path"> ' + escapeHtml(data[d].path) + '</div>';
                const tooltipContent = {selector: "a", content: contentString};

                tooltipsArray[tooltipId] = tooltipContent;

                let hasError = '';
                let message = '';
                let issueTooltipString = '';

                const accessLockedIcon = data[d].access === false ? 'blocked' : ''; // class name for lock icon

                if (data[d].type !== 'folder') { // folders don't have issues
                    hasError = data[d].issues.issueCount > 0 ? 'wl-itemError' : ''; // @Tom use empty string for ok-class
                    if (data[d].issues.issueCount > 0) { // add to tooltip

                        switch (data[d].loginType) {
                            case 'directPass':
                            case 'LDAP':
                            case 'SAML':
                                if (data[d].issues.noPws === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Test taker has no labels!') + '</div>';
                                if (data[d].issues.pwsWithoutTests === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Test taker has labels without a test assigned!') + '</div>';
                                if (data[d].issues.pwsWithDeletedTests === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are labels for deleted tests!') + '</div>';
                                break;
                            default:
                                if (data[d].issues.noPws === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Test taker has no passwords!') + '</div>';
                                if (data[d].issues.pwsWithoutTests === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('Test taker has passwords without a test assigned!') + '</div>';
                                if (data[d].issues.pwsWithDeletedTests === true) issueTooltipString += '<div class="wl-tooltip-message">' + UILANG.m('There are passwords for deleted tests!') + '</div>';
                        }
                    }
                    if (data[d].issues.issueCount === 1) {
                        message = '1 ' + UILANG.m('issue found');
                    } else if (data[d].issues.issueCount > 1) {
                        message = data[d].issues.issueCount + ' ' + UILANG.m('issues found');
                    }

                }

                //Creating login type value and control class for name display
                let loginType;
                let nameClass;
                switch (data[d].loginType) {
                    case 'directPass':
                        loginType = UILANG.m('Student login (Password)');
                        nameClass = 'tTakerDP';
                        break;
                    case 'LDAP':
                        loginType = UILANG.m('Student login (LDAP)');
                        nameClass = 'tTakerLDAP';
                        break;
                    case 'SAML':
                        loginType = UILANG.m('Student login (SAML)');
                        nameClass = 'tTakerSAML';
                        break;
                    case ' ':
                        loginType = '';
                        break;
                    default:
                        switch (data[d].type) {
                            case 'template':
                                loginType = UILANG.m('Login template');
                                nameClass = 'tTakerTemplate';
                                break;
                            case 'cloned':
                                loginType = UILANG.m('Cloned from template');
                                nameClass = 'tTakerCloned';
                                break;
                            default:
                                loginType = UILANG.m('Standard login');
                                nameClass = 'tTaker';
                        }
                }

                //add tooltips for issues
                let issueId = data[d].id + "_issue";
                let issueTooltipContent = {selector: "td", content: issueTooltipString};
                tooltipsArray[issueId] = issueTooltipContent;

                tString += '<tr>\n';
                if (data[d].type === 'folder') {
                    tString += '<td> <div class="wl-itemName folder ' + accessLockedIcon + '"><a id="' + tooltipId + '" href="testTakers.php?id=' + data[d].id + '&ta=' + 5 + '">' + escapeHtml(data[d].name) + '</a></div></td>\n';
                } else {
                    tString += '<td> <div class="wl-itemName ' + nameClass + ' ' + accessLockedIcon + '"><a id="' + tooltipId + '" href="testTakers.php?id=' + data[d].id + '&ta=' + 6 + '">' + escapeHtml(data[d].name) + '</a></div></td>\n';
                }
                tString += '<td class="wl-ownerName">' + data[d].owner + '</td>\n' + '<td class="wl-loginType">' + loginType + '</td>\n' +
                    '<td class="wl-notification  wl-notificationWithIcon ' + hasError + '"  id="' + issueId + '"> <span>' + message + '</span> </td>\n' +
                    '<td class="wl-starCol"><div class="watchListToggle"><i class="star checked" data-tab="testtakers" data-watchid="' + data[d].watchid + '" data-path="' + escapeHtml(data[d].path) + '"/></div> </td>\n';
                tString += '</tr>\n';
            }
            tString += '</tbody>\n' +
                '</table>\n';
            $('#testtakerscontainer').append(tString);
            starFleet();
            addTooltips(tooltipsArray);
        }

        function unWatch(e) {
            const watchid = e.currentTarget.dataset.watchid;
            const path = e.currentTarget.dataset.path;
            const currentTab = e.currentTarget.dataset.tab;

            $.ajaxSetup({
                url: "dashboard/watchlist/watchlist.php",
                success: ajaxSuccessWatchlist
            });
            let html = UILANG.m('You are about to remove the following entry from your watchlist. Please confirm!');
            html += '<br><strong>' + path + '</strong>';

            let dialogData = {
                buttons: [
                    {label: UILANG.m('Cancel'), 'cancel': true, 'default': true, value: 'cancel'},
                    {label: UILANG.m('Delete'), value: 'delete'}
                ],
                contents: html,
                title: UILANG.m('Confirm deletion'),
                returnPromise: true,
                width: 650,
                icon: "../images/warning.png",
                iconWidth: 64,
                values: {
                    'klaus': 'horst'
                }
            };
            showDialog('drDialog', dialogData, ['e', 'sel']).then(
                (res) => {
                    if (res.button === 'delete') {
                        startAjax('unWatch', {
                            id: watchid,
                            tab: currentTab
                        });
                    }
                }
            );
        }

        async function showDialog(id, dialogData) {
            let res = await new nxDialog(id, dialogData);
            return res;
        }

        /*
            ########################
            HELPERS
            ########################
        */
        function formatDateRange(dateString) {
            let dateArr = dateString.split('T');
            let datePart = dateArr.shift().split('-').reverse().join('-');
            dateArr.unshift(datePart);
            return dateArr;
        }

        function translateWeekdays(weekdaysString) {
            const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const weekdaysArray = weekdaysString.split(',');
            let weekdaysArrayReturn = [];
            weekdaysArray.forEach(function (item) {
                weekdaysArrayReturn.push(UILANG.m(daysOfWeek[item]));
            });
            return weekdaysArrayReturn.join(', ');
        }

        function starFleet() {
            $('.star').off();
            $('.star').on("click", unWatch);
        }

        function addTooltips(tooltipsArray, classes) {
            /*
            items is a string with dom element to add the tooltiop to, e.g "div"
            tooltipsArray is assoc array consisting of ids and a content for each Id ({divID:{selector:'div' , content:'string'})
            type is not curremntly used - it will be used for setting different types of tooltips to select the most suitable design
            */

            let tooltipStyleClass = "wl-tooltip";
            if (classes && typeof classes === "string") {
                tooltipStyleClass += " " + classes;
            }
            for (const tooltipId in tooltipsArray) {
                let selectorType = tooltipsArray[tooltipId].selector;
                let tooltipContent = tooltipsArray[tooltipId].content;

                $("#" + tooltipId).tooltip({
                    items: selectorType,
                    content: tooltipContent,
                    tooltipClass: tooltipStyleClass,
                    track: true,
                    position: {
                        my: "left top+20",
                        at: "left top",
                        collision: "flipfit",
                        using: function (position, feedback) {
                            $(this).css(position);
                        }
                    }
                });
            }
        }

        //helpers
        function escapeHtml(str) {
            if (str && isNaN(str)) {
                return str
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            } else {
                return str;
            }
        }


        /*
            ########################
            AJAX CONFIG AND FUNCTION
            ########################
        */

        $.ajaxSetup({
            type: "POST",
            cache: false,
            dataType: "json",
            timeout: 300000,
            success: ajaxSuccessWatchlist,
            error: ajaxError,
            url: "dashboard/watchlist/watchlist.php"
        });


        function startAjax(action, data) {
            waitDialog.show();
            let params = {
                action: action,
                data: JSON.stringify(data)
            };
            $.ajax({
                data: params
            });
        }

        /*
            #########################
            AJAX ERROR RETURN HANDLER
            #########################
        */
        function ajaxError(jqXHR, textStatus, errorThrown) {
            waitDialog.hide();

            let retContents = (jqXHR.responseJSON !== undefined) ? jqXHR.responseJSON.fatalError : UILANG.m("No server data returned");

            let dialogData = {
                buttons: [{
                    label: UILANG.m('OK'),
                    'default': true,
                    cancel: true,
                    value: 'ok'
                }],
                contents: retContents,
                title: UILANG.m('Error') + ': ' + errorThrown,
                width: 500,
            };
            new nxDialog('ajaxError', dialogData);
        }

        /*
            ###########################
            AJAX SUCCESS RETURN HANDLER
            ###########################
        */
        function ajaxSuccessWatchlist(res) {
            $('#un_val').html(res.loggedInName);
            waitDialog.hide();

            let dialogData;
            if (res.fatalError) {
                dialogData = {
                    buttons: [{
                        label: UILANG.m('OK'),
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: '<strong>' + UILANG.m('action_not_completed') + '</strong><br />' + res.fatalError,
                    title: UILANG.m("Error"),
                    icon: "../images/error.png",
                    iconWidth: 64,
                    width: 500
                };
                new nxDialog('fatalError', dialogData);
                return;
            }

            //if a normal error occured in PHP that did not prevent the script from finishing, show it
            if (res.error) {
                /* TODO: @Uli - there is no status bar initalized, so when there is an error, a JS error occurs here and the proper message
                         is not displayed on the UI. I am commenting this out for the time being until the status bar is initialized,
                         or perhaps a status bar is not needed at all for the dashboard. I leave that up to you.

                         I've also had to integrate the extra callback logic in the dialogData object which handles the redirection to the login
                         page when there is a redirect error present from losing a session.

                         */
                // gui.statusBar.setStatus(res.error, 3000, '#DD1A00');

                dialogData = {
                    buttons: [{
                        label: UILANG.m('OK'),
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br><p>' + res.error + '</p>',
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
            }

            switch (res.action) {

                case "getTests":
                    populateTests(res.data);
                    break;
                case "getContent":
                    populateContent(res.data);
                    break;
                case "getTesttakers":
                    populateTesttakers(res.data);
                    break;
                case "unWatch":
                    switch (res.data[0].type) {
                        case 'tests':
                            startAjax('getTests', {});
                            break;
                        case 'content':
                            startAjax('getContent', {});
                            break;
                        case 'testtakers':
                            startAjax('getTesttakers', {});
                            break;
                    }
                    break;
                default:

                    break;
            }

        }

    }


    //export class
    window.WatchList = WatchList;
})(jQuery);
