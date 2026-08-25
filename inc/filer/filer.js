/*
 File Manager FILER.JS v2.1.1
 (c) 2014, 2015, 2020, 2021, 2023, 2025 by Willibrord Koch

 DESCRIPTION:

 --------------------------------------------------------------------------------------------------------------
 VERSIONS:
 --------------------------------------------------------------------------------------------------------------
 v1.0		Initial version
 v1.1		Added button "Open in folder" in the search results
 v1.2		Pasting after copy will keep the clipboard, after cut it will be emptied
 v1.3       Added support for testees and templates (testeemanager)
 v1.4       Changed sorting behaviour > 1. folders, 2. files (files can be mixed types of files,
            all sorted as one block)
 v1.41		introduced jsPointerHandler for mouse and touch events
 v1.42      Added "edit permission" entry and logic for user management [N. NAG]
 v1.43      Added HTML escaping
 v1.44      Callback "getSelect" added when contextmenu is invoked on selected element(s)
 v2.0       Code clean-up and new feature watchlist toggle added
 v2.0.1     updated jsPointerHandler to version 2.1.0
 v2.1       Filter is now case-insensitive and mechanism updated
 v2.1.1     enabled touch devices to scroll lists by dragging the background (not only the scrollbar)
 --------------------------------------------------------------------------------------------------------------

 fileMgr(filercontainer,idSuffix,itemData,breadcrumbData,fileOpPermissions,fullyFeatured,callback,mediaTypes,watchList);

 EXAMPLE:
 fileManager = new fileMgr("#filercontainer","_id001",itemData,breadcrumbData,fileOpPermissions,true,function(event,data){	...... });

 filercontainer => ID of the container the filer will be placed
 idSuffix => allows to open more instances at once
 fullyFeatured => true = all features available, false = limited filer, only navigating & single select

 METHODS:
 clearSelection() => deselects items
 setSelection(itemSelect) => selects items, expects array: itemSelect=[{type:"itemGroup",id:1}]
 getSelect() => returns all selected items in an array
 setItems(itemData) => loads a new list of items in the filer (new directory), expects array
 updateItem(updateItemData) => updates an item in the filer view, expects object
 refreshView() -> method to refresh the view of the filer
 searchShow(searchResultsData) => shows search results, expects object array
 filerSearch() => opens up dialog for entering the searchterm
 itemsToClipboard() => writes selected folders/items to clipboard
 filerPaste() => pastes folders/items from clipboard to current directory
 filerKeyUp() => keyboard navigation key-up
 filerKeyDown() => keyboard navigation key-down
 filerShiftKeyUp() = keyboard navigation shift-key-up for multiple selection
 filerShiftKeyDown() = keyboard navigation shift-key-down for multiple selection
 getCurrentFolderID() = to ask for the current folder ID (opened in the filer)
 deleteFiles() = to trigger the deletion of the files selected
 clearClipboard() = method to empty the clipboard (copy/cut);

 CALLBACKS:
 getSelect => returns selected items
 onNavigate => navigating to a new folder sends new location as object
 onBreadcrumbNavigate => navigating to a new folder via breadcrumb sends new location as object
 onRenameRequest => user is changing name, sends object
 onDeleteRequest => send array of to be deleted objects
 onPaste => sends array of objects to be pasted + target
 onCutPaste => sends array of objects to be cut-pasted + target
 onMove => sends array of objects to be moved + target
 onSearchRequest => sends search term from user as string
 onSearchItemClick => sends object which user has clicked in the search results
 onFolderRequest => triggers external "add Folder" functionality
 onWatchlistToggle => sends id and toggle status

 DATA OBJECTS:
 File Operation Permissions
 EXAMPLE:
 let fileOpPermissions = {
 copyFolders:false,
 copyItems:true,
 copyMultiple:false,
 cutFolders:false,
 cutItems:true,
 cutMultiple:false,
 }

 Inital item data, update item data and update item data:
 EXAMPLE:
 let updateItemData=[
 {
 id:3,
 pid:0,
 type:
 "itemGroup",
 label:
 "<strong>[XX600B]</strong> new name group 3",
 sortKey:
 "01_XX600B"
 }
 ];

 Breadcrumb data:
 EXAMPLE:
 let breadcrumbData=[
 {
 id:1,
 name:
 "Home"
 },
 {
 id:2,
 name:
 "Home2"
 },
 {
 id:3,
 name:
 "Home3"
 },
 {
 id:4,
 name:
 "Home, Home, so many you can think of. Isn't it great?"
 }
 ];

 Search Results Data:
 EXAMPLE:
 let testSearchData=[
 {
 id:6,
 pid:0,
 type:
 "itemGroup",
 label:
 "<strong>[XX120B]</strong> search_group 1",
 sortKey:
 "01_XX120B",
 path:
 "/testpfad1/testpfad2/"
 },
 {
 id:7,
 pid:0,
 type:
 "folder",
 label:
 "<strong>[XX234C]</strong> search_group 2",
 sortKey:
 "00_XX234B",
 path:
 "/testpfad2/testpfad3/"
 }
 ];


 */


"use strict";
(function ($) {

    function fileMgr(filercontainer, idSuffix, itemData, breadcrumbData, fileOpPermissions, fullyFeatured, callback, mediaTypes, watchList) {

        let pt = 0;
        let copytees = 0;
        let cptask;
        let qmsg;
        let scrDistance;
        let selDir;
        let currentFolderID;
        let srcForm;
        const pointerHandler = jsPointerHandler.instance;

        if (!mediaTypes) {
            mediaTypes = 'all';
        }
        if (!watchList) {
            watchList = false;
        }
        if (fullyFeatured) {
            if (mediaTypes && mediaTypes !== 'all') {
                alert('ERROR: In full-feature-mode, mediaTypes has to be set to ALL!');
            }
            mediaTypes = 'all';
        }
        //Methods
        function clearSelection() {
            $("#filez" + idSuffix + ">li").removeClass('ui-selected');
        }

        function selectAll() {
            $("#filez" + idSuffix + ">li").addClass('ui-selected');
        }

        function setSelection(itemSelect, noCallback) {
            $.each(itemSelect, function (k, v) {
                $("#" + idSuffix + v.id).addClass('ui-selected');
                $("#" + idSuffix + v.id).addClass("lastSelected");
                //Setting marker for navigation
                $("#filez" + idSuffix + ">li").removeClass("pos-select" + idSuffix);
                $("#" + idSuffix + v.id).addClass("pos-select" + idSuffix);
                $("#filez" + idSuffix + ">li").removeClass("selStart" + idSuffix);
                $("#" + idSuffix + v.id).addClass("selStart" + idSuffix);
                selDir = 'all';
                //End Setting marker for navigation

            });
            pt = itemSelect[0].id;
            //Positioning & Preselect
            if (pt !== 0) {
                $("#filezcontainer" + idSuffix).animate({
                    scrollTop: 0
                }, 0);

                $("#filezcontainer" + idSuffix).animate({
                    scrollTop: $("#" + idSuffix + pt).offset().top - $("#filezcontainer" + idSuffix).offset().top
                }, 100);

                $("#" + idSuffix + pt).addClass("ui-selected");
                //callback($(".ui-selected"));
                if (noCallback) {
                    getSelect(true);
                } else {
                    getSelect();
                }
                pt = 0;
            }
            //End Positioning & Preselect after search
        }

        function getSelect(noCallBack) {
            const returnItems = [];
            $.each($("#filez" + idSuffix + "> .ui-selected"), function (k, v) {
                $.each(itemData, function (key, value) {
                    if (v.id === idSuffix + value.id) {
                        returnItems.push(value);
                    }
                });
            });
            if (!noCallBack) {
                callback('getSelect', returnItems);
            } else {
                return returnItems;
            }
        }

        function getSelectDblclick() {
            const returnItems = [];
            $.each($("#filez" + idSuffix + "> .ui-selected"), function (k, v) {
                $.each(itemData, function (key, value) {
                    if (v.id === idSuffix + value.id) {
                        returnItems.push(value);
                    }
                });
            });
            callback('getSelectDblclick', returnItems);
        }

        function getSelectKeys() {
            const returnItems = [];
            $.each($("#filez" + idSuffix + "> .ui-selected"), function (k, v) {
                $.each(itemData, function (key, value) {
                    if (v.id === idSuffix + value.id) {
                        returnItems.push(value);
                    }
                });
            });
            callback('getSelectKeys', returnItems);
        }

        function setItems(newItemData, newBreadcrumbData, preselect) {
            if (preselect) {
                pt = preselect[0].id
            }
            itemData = newItemData;
            breadcrumbData = newBreadcrumbData;
            filer();

        }

        function deleteFiles() {
            delItems('opt', $('.ui-selected'));
        }

        function updateItem(updateItemData) {
            $.each(updateItemData, function (k, v) {
                $.each(itemData, function (key, value) {
                    if (idSuffix + v.id === idSuffix + value.id) {
                        itemData[key] = updateItemData[k];
                    }
                });
            });
            filer();
        }

        function getCurrentFolderID() {
            return currentFolderID;
        }

        function refreshView() {
            filer();
        }

        function clearClipboard() {
            copytees = 0;
        }

        function searchShow(srchResultsArray, searchterm) {
            searchResults(srchResultsArray, searchterm);
        }

        function itemsToClipboard(task) {
            copytees = fillClipBoard();
            if (task === 'cp' || task === 'cut') {
                cptask = task;
            } else {
                cptask = 'cp'
            }
            copyItems();
        }

        function filerPaste() {
            if ($(copytees).length === 0) {
                qmsg = {
                    qMessage: UILANG.m('Nothing in the clipboard.'),
                    msgColor: '#F00'
                };
                callback('quickMessage', qmsg);
            } else {
                if (cptask === 'cut') {
                    cutPasteItems();
                } else {
                    pasteItems();
                }
            }
        }

        function filerKeyUp() {
            $("#filez" + idSuffix + ">li").removeClass('selStart' + idSuffix);
            if (!$(".pos-select" + idSuffix).is(':first-child')) {
                if ($(".pos-select" + idSuffix).prevAll(".selectable:first").length === 0 && ($(".pos-select" + idSuffix).length !== 0)) return;
                $("#filez" + idSuffix + ">li").removeClass('ui-selected');

                if ($("#filez" + idSuffix + ">li").hasClass("pos-select" + idSuffix)) {
                    $(".pos-select" + idSuffix).removeClass("pos-select" + idSuffix).prevAll(".selectable:first").addClass('ui-selected pos-select' + idSuffix);

                    if ($(".pos-select" + idSuffix).position().top < 45) {
                        $("#filezcontainer" + idSuffix).scrollTop($(".pos-select" + idSuffix)[0].offsetTop - 46)
                    }
                } else {
                    if ($("#filez" + idSuffix + ">li:last-child").hasClass("filerBlocked")) {
                        $("#filez" + idSuffix + ">li:last-child").prevAll(".selectable:first").addClass('ui-selected pos-select' + idSuffix);
                    } else {
                        $("#filez" + idSuffix + ">li:last-child").addClass('ui-selected pos-select' + idSuffix);
                    }
                }
                selDir = 'all';
                getSelectKeys();
            }
        }

        function filerKeyDown() {
            $("#filez" + idSuffix + ">li").removeClass('selStart' + idSuffix);
            if (!$(".pos-select" + idSuffix).is(':last-child')) {
                if ($(".pos-select" + idSuffix).nextAll(".selectable:first").length === 0 && ($(".pos-select" + idSuffix).length !== 0)) return;
                $("#filez" + idSuffix + ">li").removeClass('ui-selected');

                if ($("#filez" + idSuffix + ">li").hasClass("pos-select" + idSuffix)) {
                    $(".pos-select" + idSuffix).removeClass("pos-select" + idSuffix).nextAll(".selectable:first").addClass('ui-selected pos-select' + idSuffix);
                    scrDistance = (Math.round($(".pos-select" + idSuffix).height() / 20) * 23) - 23;
                    if ($(".pos-select" + idSuffix).position().top > ($("#filezcontainer" + idSuffix).height() + 20)) {
                        $("#filezcontainer" + idSuffix).scrollTop($(".pos-select" + idSuffix)[0].offsetTop - $("#filezcontainer" + idSuffix).height() - 22 + scrDistance)
                    }
                } else {
                    if ($("#filez" + idSuffix + ">li:first-child").hasClass("filerBlocked")) {
                        $("#filez" + idSuffix + ">li:first-child").nextAll(".selectable:first").addClass('ui-selected pos-select' + idSuffix);
                    } else {
                        $("#filez" + idSuffix + ">li:first-child").addClass('ui-selected pos-select' + idSuffix);
                    }

                }
                selDir = 'all';
                getSelectKeys();
            }
        }

        function filerShiftKeyUp() {
            if (!$(".pos-select" + idSuffix).is(':first-child')) {
                if ($("#filez" + idSuffix + ">li").hasClass("pos-select" + idSuffix)) {
                    if (selDir === 'down') {
                        $(".pos-select" + idSuffix).removeClass('ui-selected');
                    } else {
                        if ($(".pos-select" + idSuffix).prevAll(".selectable:first").length === 0 && ($(".pos-select" + idSuffix).length !== 0)) return;
                        $(".pos-select" + idSuffix).removeClass("pos-select" + idSuffix).prevAll(".selectable:first").toggleClass('ui-selected pos-select' + idSuffix);
                    }
                    if ($(".pos-select" + idSuffix).hasClass('selStart' + idSuffix)) {
                        $(".pos-select" + idSuffix).removeClass("pos-select" + idSuffix).addClass('ui-selected').prevAll(".selectable:first").toggleClass('ui-selected pos-select' + idSuffix);
                    }

                    if ($(".pos-select" + idSuffix).position().top < 45) {
                        $("#filezcontainer" + idSuffix).scrollTop($(".pos-select" + idSuffix)[0].offsetTop - 46)
                    }
                } else {
                    if ($("#filez" + idSuffix + ">li:last-child").hasClass("filerBlocked")) {
                        $("#filez" + idSuffix + ">li:last-child").prevAll(".selectable:first").addClass('pos-select' + idSuffix).toggleClass('ui-selected');
                    } else {
                        $("#filez" + idSuffix + ">li:last-child").addClass('ui-selected pos-select' + idSuffix + ' selStart' + idSuffix);
                        $("#filezcontainer" + idSuffix).scrollTop($(".pos-select" + idSuffix)[0].offsetTop - 46);
                    }
                }
                selDir = 'up';
                getSelectKeys();
            }
        }

        function filerShiftKeyDown() {
            if (!$(".pos-select" + idSuffix).is(':last-child')) {
                if ($("#filez" + idSuffix + ">li").hasClass("pos-select" + idSuffix)) {
                    if (selDir === 'up') {
                        $(".pos-select" + idSuffix).removeClass('ui-selected');
                    } else {
                        if ($(".pos-select" + idSuffix).nextAll(".selectable:first").length === 0 && ($(".pos-select" + idSuffix).length !== 0)) return;
                        $(".pos-select" + idSuffix).removeClass("pos-select" + idSuffix).nextAll(".selectable:first").toggleClass('ui-selected pos-select' + idSuffix);
                    }
                    if ($(".pos-select" + idSuffix).hasClass('selStart' + idSuffix)) {
                        $(".pos-select" + idSuffix).removeClass("pos-select" + idSuffix).addClass('ui-selected').nextAll(".selectable:first").toggleClass('ui-selected pos-select' + idSuffix);
                    }

                    scrDistance = (Math.round($(".pos-select" + idSuffix).height() / 20) * 23) - 23;
                    if ($(".pos-select" + idSuffix).position().top > ($("#filezcontainer" + idSuffix).height() + 20)) {
                        $("#filezcontainer" + idSuffix).scrollTop($(".pos-select" + idSuffix)[0].offsetTop - $("#filezcontainer" + idSuffix).height() - 22 + scrDistance)
                    }
                } else {
                    if ($("#filez" + idSuffix + ">li:first-child").hasClass("filerBlocked")) {
                        $("#filez" + idSuffix + ">li:first-child").nextAll(".selectable:first").addClass('pos-select' + idSuffix).toggleClass('ui-selected');
                    } else {
                        $("#filez" + idSuffix + ">li:first-child").addClass('pos-select' + idSuffix).toggleClass('ui-selected');
                        $("#filezcontainer" + idSuffix).scrollTop($(".pos-select" + idSuffix)[0].offsetTop - $("#filezcontainer" + idSuffix).height() - 22 + scrDistance);
                    }
                }
                selDir = 'down';
                getSelectKeys();
            }
        }

        function filerSearch(preFill) {
            if (!preFill) preFill = '';
            $(document).off('keydown.filer');

            function searchRequestClosed(button, srchterm) {
                if (button === 'search') {
                    callback('onSearchRequest', srchterm);
                }
            }

            const searchDialogDataSrc = {
                buttons: [{
                    label: UILANG.m('cancel'),
                    'cancel': true,
                    value: 'cancel'
                }, {
                    label: UILANG.m('search'),
                    'default': true,
                    value: 'search'
                }],
                datafields: ['srchinput'],
                mandatory: ['srchinput'],
                focus: 'srchinput',
                values: {
                    srchinput: preFill
                },
                contents: '<p>' + UILANG.m('Search for:') + '<br><input type="text" id="srchinput" style="width: 100%; margin-top: 10px;"></p>',
                title: UILANG.m('search'),
                width: 400,
                callback: searchRequestClosed
            };
            new nxDialog('searchDialog', searchDialogDataSrc);
        }

        filer();

        function filer() {
            callback('clear', 0);

            if ($("#filer_frame" + idSuffix).length === 0) {
                $(filercontainer).append('<div id="filer_frame' + idSuffix + '"><div id="bc_container' + idSuffix + '"><ul id="breadcrumbs' + idSuffix + '" ><</ul></div><div style="display:none;" id="filterarea' + idSuffix + '"></div><div id="topscroller' + idSuffix + '"></div><div class="context2" id="filezcontainer' + idSuffix + '"><ul id="filez' + idSuffix + '"></ul></div><div id="downscroller' + idSuffix + '"></div></div>');
            }

            if (!fullyFeatured) {
                $("#topscroller" + idSuffix).css('display', 'none');
                $("#downscroller" + idSuffix).css('display', 'none');
            }


            $("#breadcrumbs" + idSuffix).on("contextmenu", function (e) {
                e.preventDefault();
                return false;
            });
            $("#filterarea" + idSuffix).on("contextmenu", function (e) {
                e.preventDefault();
                return false;
            });
            $("#topscroller" + idSuffix).on("contextmenu", function (e) {
                e.preventDefault();
                return false;
            });
            $("#downscroller" + idSuffix).on("contextmenu", function (e) {
                e.preventDefault();
                return false;
            });
            if (!fullyFeatured) {
                $("#filezcontainer" + idSuffix).on("contextmenu", function (e) {
                    e.preventDefault();
                    return false;
                });
            }

            $("#filez" + idSuffix).empty();

            let fHeight1;
            let fHeight2;

            if (!fullyFeatured) {
                fHeight2 = 30;
            } else {
                fHeight1 = 104;
                fHeight2 = 60;
            }

            if ($("#filer_frame" + idSuffix).is(':visible')) {
                if ($("#filterarea" + idSuffix).is(':visible')) {
                    $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - fHeight1);
                } else {
                    $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - fHeight2);
                }
            }
            $(window).on('resize', function () {
                if ($("#filer_frame" + idSuffix).is(':visible')) {
                    if ($("#filterarea" + idSuffix).is(':visible')) {
                        $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - fHeight1);
                    } else {
                        $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - fHeight2);
                    }
                }
            });


            if (itemData === '' || itemData.empty) {
                currentFolderID = itemData.pid;
                $("#filez" + idSuffix).append('<p><span class="empty">' + UILANG.m('This folder is empty!') + '<br /></span></p>');
                if ($("#filterarea" + idSuffix).is(':visible')) {
                    $("#filterarea" + idSuffix).slideToggle('fast', function () {
                        if ($("#filterarea" + idSuffix).css('display') === 'none') {
                            $("#fltinput" + idSuffix).val('');
                            $("#fltinput" + idSuffix).removeClass("activefilter");
                            $("#fltinput" + idSuffix).trigger('keyup');
                            $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - fHeight2);
                        } else {
                            $("#fltinput" + idSuffix).trigger('focus');
                            $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - fHeight1);
                        }
                        breadcrumb();
                        $("#filez" + idSuffix).append('<p><span class="empty">' + UILANG.m('This folder is empty!') + '<br /></span></p>');
                        $("#filtericon" + idSuffix).css('display', 'none');
                    });
                } else {
                    breadcrumb();
                }
                $("#filtericon" + idSuffix).css('display', 'none');
            } else {
                breadcrumb();
                $.each(itemData, function (k, v) {
                    $("#filez" + idSuffix).append('<li class="selectable" id="' + idSuffix + v.id + '">' + escapeHtml(v.label) + '</li>');
                    $("#" + idSuffix + v.id).addClass('context');
                    if(watchList){
                        if(v.watchList && v.watchList===1){
                            $("#" + idSuffix + v.id).append('<div class="watchListToggle"><i class="star checked" id="wl_'+v.id+'" data-id="'+v.dbId+'"></i></div>');
                        } else {
                            $("#" + idSuffix + v.id).append('<div class="watchListToggle"><i class="star" id="wl_'+v.id+'" data-id="'+v.dbId+'"></i></div>');

                        }
                    }
                    if (v.type === 'folder') {
                        $("#" + idSuffix + v.id).addClass('folder');
                        $("#" + idSuffix + v.id).attr('data-sortcrit', 0);
                        $("#" + idSuffix + v.id).addClass('droppable');
                        if(watchList)$("#" + idSuffix + v.id + ">div>i").attr('data-type','folder');
                        currentFolderID = v.pid;

                        pointerHandler.listen($("#" + idSuffix + v.id), {
                            callbacks: {
                                dblclick: function () {
                                    $("#filez").animate({
                                        scrollTop: 0
                                    }, 0);
                                    $.each(itemData, function (key, value) {
                                        if (idSuffix + v.id === idSuffix + value.id) {
                                            callback('onNavigate', itemData[key]);
                                        }
                                    })
                                }
                            }
                        });
                    } else {

                        $("#" + idSuffix + v.id).addClass('zfile typefile');
                        $("#" + idSuffix + v.id).attr('data-sortcrit', 1);
                        if(watchList)$("#" + idSuffix + v.id + ">div>i").attr('data-type','file');
                        currentFolderID = v.pid;
                        switch (v.type) {
                            case 'video':
                            case 'mp4':
                            case 'm4v':
                            case 'mpg':
                            case 'webm':
                                $("#" + idSuffix + v.id).append('<span class="mediaIndicator">[' + v.type + ']</span>');
                                $("#" + idSuffix + v.id).removeClass('typefile').addClass('typevideo');
                                if (mediaTypes !== 'all' && mediaTypes !== 'video') {
                                    $("#" + idSuffix + v.id).css('display', 'none');
                                }
                                break;
                            case 'audio':
                            case 'mp3':
                            case 'm4a':
                            case 'weba':
                            case 'wav':
                            case 'aac':
                                $("#" + idSuffix + v.id).append('<span class="mediaIndicator">[' + v.type + ']</span>');
                                $("#" + idSuffix + v.id).removeClass('typefile').addClass('typeaudio');
                                if (mediaTypes !== 'all' && mediaTypes !== 'audio') {
                                    $("#" + idSuffix + v.id).css('display', 'none');
                                }
                                break;
                            case 'image':
                            case 'png':
                            case 'jpg':
                            case 'jpeg':
                            case 'gif':
                            case 'svg':
                            case 'webp':
                            case 'avif':
                                $("#" + idSuffix + v.id).append('<span class="mediaIndicator">[' + v.type + ']</span>');
                                $("#" + idSuffix + v.id).removeClass('typefile').addClass('typepicture');
                                if (mediaTypes !== 'all' && mediaTypes !== 'image') {
                                    $("#" + idSuffix + v.id).css('display', 'none');
                                }
                                break;
                            case 'testee':
                                switch (v.loginType) {
                                    case 'directPass':
                                        $("#" + idSuffix + v.id).removeClass('typefile').addClass('typetesteeDirect');
                                        $("#" + idSuffix + v.id).append('<span class="mediaIndicator">['+UILANG.m("direct")+']</span>');
                                        break;
                                    case 'LDAP':
                                        $("#" + idSuffix + v.id).removeClass('typefile').addClass('typetesteeLdap');
                                        $("#" + idSuffix + v.id).append('<span class="mediaIndicator">['+UILANG.m("LDAP")+']</span>');
                                        break;
                                    case 'SAML':
                                        $("#" + idSuffix + v.id).removeClass('typefile').addClass('typetesteeSaml');
                                        $("#" + idSuffix + v.id).append('<span class="mediaIndicator">['+UILANG.m("SAML")+']</span>');
                                        break;
                                    default:
                                        $("#" + idSuffix + v.id).removeClass('typefile').addClass('typetestee');
                                        $("#" + idSuffix + v.id).append('<span class="mediaIndicator">['+UILANG.m("standard")+']</span>');
                                        $("#" + idSuffix + v.id).removeClass('highlightBlue');
                                        break;
                                }
                                break;
                            case 'cloned':
                                $("#" + idSuffix + v.id).removeClass('typefile').addClass('typetestee');
                                $("#" + idSuffix + v.id).addClass('clonedTt');
                                $("#" + idSuffix + v.id).append('<span class="mediaIndicator">['+UILANG.m("cloned")+']</span>');
                                break;
                            case 'test':
                                let testType = 'typeTest' + v.testStructure.type.charAt(0).toUpperCase() + v.testStructure.type.slice(1);
                                $("#" + idSuffix + v.id).removeClass('typefile').addClass(testType);
                                $("#" + idSuffix + v.id).append('<span class="mediaIndicator">[' + v.testStructure.type + ']</span>');
                                break;
                            case 'template':
                                $("#" + idSuffix + v.id).removeClass('typefile').addClass('typetemplate');
                                $("#" + idSuffix + v.id).append('<span class="mediaIndicator">['+UILANG.m("template")+']</span>');
                                break;
                        }
                        pointerHandler.listen($("#" + idSuffix + v.id), {
                            callbacks: {
                                dblclick: getSelectDblclick
                            }
                        });
                    }
                    if(watchList){
                        pointerHandler.listen($("#wl_" + v.id), {
                            callbacks: {
                                click: function (clickedObj) {
                                    $(clickedObj.currentTarget).toggleClass('checked');
                                    let id=clickedObj.currentTarget.dataset.id;
                                    let type=clickedObj.currentTarget.dataset.type;
                                    if($(clickedObj.currentTarget).hasClass('checked')){
                                        callback('onWatchListToggle', {'id':id,'status':true,'type':type});
                                    } else {
                                        callback('onWatchListToggle', {'id':id,'status':false,'type':type});
                                    }
                                }
                            }
                        });
                    }
                });
            }

            $("#filez" + idSuffix + ">li").css('cursor', 'pointer');

            //Sorting
            //NOTE by Ricky: replaced the tinysort JQuery plugin with a sort function that will consider special characters
            let list = $("#filez" + idSuffix).get(0);
            sortListNodes(list, 'sortcrit');
            //End Sorting
            getSelect();

            // Select / Drag / Drop / Shortcuts
            if (fullyFeatured) {
                const selectedClass = 'ui-selected';
                let $lastSelected = [];
                const collection = $("#filez" + idSuffix + "> .selectable");
                let dragged = false;

                pointerHandler.listen($("#filez" + idSuffix + ">li"), {
                    allowScrolling: true,
                    callbacks: {
                        up: function (e) {

                            if (dragged === false) {
                                const that = $(this);
                                let $selected, direction;

                                if (e.shiftKey) {

                                    $lastSelected=($("#filez" + idSuffix + ">li.lastSelected"));

                                    if ($lastSelected.length > 0) {

                                        if (that[0] === $lastSelected[0]) {
                                            // The user has clicked on the same item, so do nothing.
                                            return;
                                        }
                                        direction = that.nextAll('.lastSelected').length > 0 ? 'forward' : 'back';

                                        if ('forward' === direction) {
                                            // Last selected is after the current selection
                                            $selected = that.nextUntil($lastSelected, '.selectable');

                                        } else {
                                            // Last selected is before the current selection
                                            $selected = $lastSelected.nextUntil(that, '.selectable');
                                        }

                                        collection.removeClass('ui-selected');
                                        $selected.addClass('ui-selected');
                                        $lastSelected.addClass('ui-selected');
                                        that.addClass('ui-selected');
                                    }

                                } else if (e.ctrlKey || e.metaKey) {
                                    that.toggleClass('ui-selected');

                                } else {

                                    //Not a shift select
                                    $lastSelected = that;
                                    collection.removeClass('lastSelected ui-selected');
                                    that.addClass('lastSelected ui-selected');
                                    //add selected class to group draggable objects
                                    //$(this).toggleClass(selectedClass);
                                    that.addClass('ui-selected');
                                }
                                $("#filez" + idSuffix + ">li").removeClass("pos-select" + idSuffix);
                                that.addClass("pos-select" + idSuffix);
                                $("#filez" + idSuffix + ">li").removeClass("selStart" + idSuffix);
                                that.addClass("selStart" + idSuffix);
                                selDir = 'all';
                                //callback
                                getSelect();
                            }

                        }
                    }
                });


                $("#filez" + idSuffix + ">li").on('contextmenu', function () {
                    if (!$(this).hasClass('ui-selected')) {
                        $("#filez" + idSuffix + ">li").removeClass('ui-selected');
                        $(this).addClass('ui-selected');
                        getSelect();
                    } else {
                        getSelect();
                    }
                }).draggable({
                    revertDuration: 10,
                    helper: function () {
                        let mvCount = $('.ui-selected').length;
                        if (mvCount === 0) {
                            mvCount = 1;
                        }
                        let helperMsg = '<span class="helpertext">' + mvCount + '</span>';
                        if (mvCount > 9) {
                            helperMsg = '<span class="helpertext2">' + mvCount + '</span>';
                        }
                        return $('<div  class="filerhelper">' + helperMsg + '</div>');
                    },
                    scroll: false,
                    cursorAt: {
                        right: 70,
                        top: -5
                    },
                    cursor: 'no-drop',
                    start: function (e, ui) {
                        ui.helper.addClass(selectedClass);
                        dragged = true;

                        $("#topscroller" + idSuffix).on({
                            mouseenter: function () {
                                $("#filezcontainer" + idSuffix).animate({
                                    scrollTop: 0
                                }, 800);
                            },
                            mouseleave: function () {
                                $("#filezcontainer" + idSuffix).stop();
                            }
                        });
                        $("#topscroller" + idSuffix).css({
                            'background-image': 'url("../inc/filer/images/ic_ui_topscroller.png")',
                            'background-size': '20px 10px'
                        });
                        $("#downscroller" + idSuffix).on({
                            mouseenter: function () {
                                $("#filezcontainer" + idSuffix).animate({
                                    scrollTop: $("#filez" + idSuffix).height()
                                }, 1200);
                            },
                            mouseleave: function () {
                                $("#filezcontainer" + idSuffix).stop();
                            }
                        });
                        $("#downscroller" + idSuffix).css({
                            'background-image': 'url("../inc/filer/images/ic_ui_downscroller.png")',
                            'background-size': '20px 10px'
                        });
                        //$("#bc"+bc+"").css('cursor','no-drop');
                        $(".activehome").css('cursor', 'move');
                        $(".prevfold").css('cursor', 'no-drop');
                        $(".droppable").css('cursor', 'move');
                        $(".droppable2").css('cursor', 'move');
                        $(".current").css('cursor', 'no-drop');
                        $(".zfile").css('cursor', 'no-drop');

                        if (!$(this).hasClass('ui-selected')) {
                            $lastSelected = $(this);
                            collection.removeClass('lastSelected ui-selected');
                            $(this).addClass('lastSelected ui-selected');
                            $(this).addClass('ui-selected');
                        }

                        $(".droppable.ui-selected").toggleClass("droppable drop");

                        $(".droppable").droppable({
                            tolerance: "pointer",
                            over: function (e) {
                                if ($("#prevs" + idSuffix).is(':hidden')) {
                                    $(e.target).css('color', '#679ee7');
                                }
                            },
                            out: function (e) {
                                $(e.target).css('color', '');
                            },
                            drop: function (e) {
                                $(e.target).css('color', '');
                                moveItems(e, $(".ui-selected"), 'mainpane');
                            }
                        });

                        $(".droppable2").droppable({
                            create: function (e, ui) {},
                            tolerance: "pointer",
                            over: function (e, ui) {},
                            out: function (e, ui) {},
                            drop: function (e) {
                                $(e.target).css('color', '');
                                //callback
                                moveItems(e, $(".ui-selected"), 'bc');
                            }
                        });

                    },
                    stop: function () {
                        clearSelection();
                        dragged = false;
                        $("#topscroller" + idSuffix).off('mouseenter mouseleave');
                        $("#downscroller" + idSuffix).off('mouseenter mouseleave');
                        $("#topscroller" + idSuffix).css('background-image', 'none');
                        $("#downscroller" + idSuffix).css('background-image', 'none');
                        $(".droppable").css('cursor', 'pointer');
                        $(".droppable2").css('cursor', 'pointer');
                        $(".activehome").css('cursor', 'pointer');
                        $(".zfile").css('cursor', 'pointer');
                        $(".drop").toggleClass("drop droppable");
                        $(".current").css('cursor', 'default');
                        // reset group positions
                        $(".droppable").css('cursor', 'pointer');
                        $('.ui-draggable').css({
                            top: 0,
                            left: 0,
                            opacity: 1.0
                        });
                    },
                    drag: function (e, ui) {
                        $(this).addClass(selectedClass);
                        $('.' + selectedClass).css({
                            top: ui.position.top,
                            left: ui.position.left,
                            opacity: 0.4
                        });
                    }
                });

                $(document).off('keydown.filer');
            } else {
                // Minimum featured filer

                pointerHandler.listen($("#filez" + idSuffix + ">li"), {
                    callbacks: {
                        up: function () {
                            $("#filez" + idSuffix + "> .selectable").removeClass('ui-selected');
                            $(this).addClass('ui-selected');
                            getSelect();
                            $("#filez" + idSuffix + ">li").removeClass("pos-select" + idSuffix);
                            $(this).addClass("pos-select" + idSuffix);
                            $("#filez" + idSuffix + ">li").removeClass("selStart" + idSuffix);
                            $(this).addClass("selStart" + idSuffix);
                            selDir = 'all';
                        }
                    }
                });

            }
            // End Select / Drag / Drop 

            //Context Menu Edit
            if (fullyFeatured) {
                $.contextMenu('destroy', '.context');
                $.contextMenu('destroy', '.context2');

                // menu item list for .context
                let ctxItemList = {
                    "newFolder": {
                        name: UILANG.m("New folder"),
                        icon: "newFolder",
                        callback: function () {
                            callback('onFolderRequest');
                        },
                        disabled: function () {
                            if ((window.permList !== undefined) && (!permList['basePerm'].newItemGroup)) return true;
                        }
                    },
                    "duplicate": {
                        name: UILANG.m("Duplicate"),
                        icon: "duplicate",
                        callback: function () {
                            callback('onDuplicateRequest');
                        },
                        disabled: function () {
                            if ((window.permList !== undefined) && (!permList[parseInt(selection[0].dbId)].duplicate)) return true;
                            return !!($('.ui-selected').hasClass('folder') || $('.ui-selected').length > 1);
                        },
                        visible: function () {
                            return filercontainer !== '#assetList';
                        }
                    },
                    "edit": {
                        name: UILANG.m("Rename"),
                        icon: "rename",
                        callback: function (key, opt) {
                            chgname(opt, $(this));
                        },
                        disabled: function () {
                            if ($('.ui-selected').length > 1) return true;
                            if ((window.permList !== undefined) && (!permList[parseInt(selection[0].dbId)].rename)) return true;
                        }
                    },
                    sep1: "---------",
                    "delete": {
                        name: UILANG.m("Delete"),
                        icon: "delete",
                        callback: function (key, opt) {
                            delItems(opt, $('.ui-selected'));
                        },
                        disabled: function() {
                            if (selection.length === 1) {
                                if ((window.permList !== undefined) && (!permList[parseInt(selection[0].dbId)].deleteSelection)) return true;
                            } else if (selection.length > 1) {
                                for (const x of selection) {
                                    if (window.permList[x.dbId].deleteSelection === false) return true;
                                }
                            }
                        }
                    },
                    sep2: "---------",
                    "cut": {
                        name: UILANG.m("Cut"),
                        icon: "cut",
                        callback: function () {
                            copytees = fillClipBoard();
                            cptask = 'cut';
                            copyItems();
                        },
                        disabled: function () {

                            if ((window.permList !== undefined) && (!permList[parseInt(selection[0].dbId)].deleteSelection)) return true;

                            if (fileOpPermissions.cutMultiple === false && $('.ui-selected').length > 1) {
                                return true;
                            }
                            if (fileOpPermissions.cutFolders === false && $('.ui-selected').hasClass('folder')) {
                                return true;
                            }
                            if (fileOpPermissions.cutItems === false && $('.ui-selected').hasClass('zfile')) {
                                return true;
                            }

                            if (selection.length > 1) {
                                for (const x of selection) {
                                    if (window.permList[x.dbId].deleteSelection === false) return true;
                                }
                            }
                        }
                    },
                    "copy": {
                        name: UILANG.m("Copy"),
                        icon: "copy",
                        callback: function () {
                            copytees = fillClipBoard();
                            cptask = 'cp';
                            copyItems();
                        },
                        disabled: function () {

                            if (fileOpPermissions.copyMultiple === false && $('.ui-selected').length > 1) {
                                return true;
                            }
                            if (fileOpPermissions.copyFolders === false && $('.ui-selected').hasClass('folder')) {
                                return true;
                            }
                            if (fileOpPermissions.copyItems === false && $('.ui-selected').hasClass('zfile')) {
                                return true;
                            }
                        }
                    },
                    "paste": {
                        name: UILANG.m("Paste"),
                        icon: "paste",
                        callback: function () {
                            if (cptask === 'cut') {
                                cutPasteItems();
                            } else {
                                pasteItems();
                            }
                        },
                        disabled: function () {
                            if ((window.permList !== undefined) && ((!permList[parseInt(selection[0].dbId)].newItemGroup) && !permList[parseInt(selection[0].dbId)].newTest)) return true;
                            return copytees === 0;
                        }
                    }
                };

                // if (RegExp(/testtakers\.php/, 'i').test(window.location) === false) { // FYI: leaving behind in case future exceptions based on source page are required
                /* this specific configuration is for a selection or selections being right-clicked */
                ctxItemList['sep3'] = "---------";
                ctxItemList["ePerms"] = {
                    name: UILANG.m("Edit Permissions"),
                    icon: "edit",
                    callback: function() {
                        callback('onPermEditRequest', {
                            src: 'selFld',
                            selLen: $('.ui-selected').length
                        });
                    },
                    disabled: function() {
                        if (!window.isSuper && $('.ui-selected').length > 1) return true;
                        if ((window.permList !== undefined) && (!permList[parseInt(selection[0].dbId)].fetchIgPerm)) return true;
                        if ($('.ui-selected').hasClass('zfile')) return true;
                        if (!$('.ui-selected').hasClass('folder')) return true;
                    }
                };

                // build final .context menu list
                $.contextMenu({
                    selector: ".context",
                    items: ctxItemList
                });

                // menu item list for .context2
                let ctxItemList2 = {
                    "newFolder": {
                        name: UILANG.m("New folder"),
                        icon: "newFolder",
                        callback: function () {
                            callback('onFolderRequest');
                        },
                        disabled: function () {
                            if ((window.permList !== undefined) && (!permList['basePerm'].newFolder)) return true;

                        }
                    },
                    "paste": {
                        name: UILANG.m("Paste"),
                        icon: "paste",
                        callback: function (key, opt) {
                            if (cptask === 'cut') {
                                cutPasteItems(opt);
                            } else {
                                pasteItems(opt);
                            }
                        },
                        disabled: function () {
                            // ((!permList['basePerm'].newItemGroup) || !permList['basePerm'].newTest); // this statement does nothing; leaving it in case I meant to do something with it originally -- NN 2024-10-04
                            if ((window.permList !== undefined) && ((!permList['basePerm'].newItemGroup) && !permList['basePerm'].newTest)) return true;
                            return copytees === 0;
                        }
                    }
                };

                // if (RegExp(/testtakers\.php/, 'i').test(window.location) === false) { // FYI: leaving behind in case future exceptions based on source page are required
                /* this specific configuration is for a blank area being right-clicked */
                ctxItemList2['sep1'] = "---------";
                ctxItemList2["ePerms"] = {
                    name: UILANG.m("Edit Permissions"),
                    icon: "edit",
                    callback: function() {
                        callback('onPermEditRequest', {
                            src: 'curFld'
                        });
                    },
                    disabled: function() {
                        if ((window.permList !== undefined) && (!permList['basePerm'].fetchIgPerm)) return true;
                        if (loc.folder === 1) return true;
                    }
                };

                // build final .context2 menu list
                $.contextMenu({
                    selector: ".context2",
                    items: ctxItemList2
                });

            }
            //End Context Menu Edit

            //Filter

            const form = $("<form>").attr({
                    "id": "filterform" + idSuffix,
                    "action": "#"
                }),
                input = $("<input>").attr({
                    "id": "fltinput" + idSuffix,
                    "class": "filterinput ui-corner-all",
                    "type": "text"
                });
            $("#filterarea" + idSuffix).empty();

            if ($("#filterform" + idSuffix).length === 0) {
                $(form).append(input).appendTo("#filterarea" + idSuffix);
            }

            $('#filterbtn' + idSuffix + '').prop('disabled', true).removeClass('backgr');
            $("#filterbtn" + idSuffix).css('cursor', 'default');

            $("#fltinput" + idSuffix).val('');
            $("#fltinput" + idSuffix).removeClass("activefilter");

            if ($('#breadcrumbs' + idSuffix + '>li.current').attr('title') === "" || !$('#breadcrumbs' + idSuffix + '>li.current').attr('title')) {
                $("#filterarea" + idSuffix).append("<span class='filtersearchtext'>" + UILANG.m('Filter') + " <strong>Home</strong></span>");
            } else {
                $("#filterarea" + idSuffix).append("<span class='filtersearchtext'>" + UILANG.m('Filter folder:') + " <strong>" + $('#breadcrumbs' + idSuffix + '>li.current').attr('title') + "</strong></span>");
            }
            $(input).on('change', function () {
                const filter = $(this).val();
                const $filezContainer = $("#filez" + idSuffix);

                if (filter) {
                    $filezContainer.find(".folder").each(function () {
                        const $this = $(this);
                        const itemText = $this.clone().children().remove().end().text().trim().toLowerCase(); // Get visible text only
                        if (itemText.includes(filter.toLowerCase())) {
                            $this.slideDown(100);
                        } else {
                            $this.slideUp(100);
                        }
                    });

                    $filezContainer.find(".zfile").each(function () {
                        const $this = $(this);
                        const itemText = $this.clone().children().remove().end().text().trim().toLowerCase(); // Get visible text only
                        if (itemText.includes(filter.toLowerCase())) {
                            $this.slideDown(100);
                        } else {
                            $this.slideUp(100);
                        }
                    });

                    $(this).addClass("activefilter");
                    $filezContainer.find('p').remove();

                    setTimeout(function () {
                        if ($filezContainer.children(':visible').length === 0) {
                            $filezContainer.append('<p><span class="empty2">' + UILANG.m('No matches for your current filter!') + '</span></p>');
                        }
                    }, 160);
                } else {
                    $filezContainer.find('p').remove();
                    $filezContainer.find(".folder").slideDown(100);
                    $filezContainer.find(".zfile").slideDown(100);
                    $(this).removeClass("activefilter");
                }


            }).on('keyup', function () {
                $(this).trigger('change');
            });

            //End Filter
        }


        function searchResults(srchResultsArray, searchterm) {
            let srchSelection;
            $(document).off('keydown.filer');
            if ($("#dialog-form" + idSuffix).length === 0) {
                $("body").append("<div id='dialog-form" + idSuffix + "' style='display:none;' title='Search results'><p id='searchhead" + idSuffix + "'></p><div id='scroll_area" + idSuffix + "'><ul id='srchres_folder" + idSuffix + "'></ul><ul id='srchres_files" + idSuffix + "'></ul></div></div>");
            }

            const searchHead = $("#searchhead" + idSuffix);
            searchHead.empty();

            $("#srchres_folder" + idSuffix).empty();
            $("#srchres_files" + idSuffix).empty();

            if (srchResultsArray.length < 1) {
                searchHead.append(UILANG.m('No results for your search:') + ' <strong>' + searchterm + '</strong>');
                return;
            } else {
                searchHead.append('' + srchResultsArray.length + ' ' + UILANG.m('result(s) for your search:') + ' <strong>' + searchterm + '</strong>');
                if (!fullyFeatured) {
                    searchHead.append('<br /><span style="font-size:0.8em;">' + UILANG.m('Double-click element to open it!') + '</span>');
                } else {
                    searchHead.append('<br /><span style="font-size:0.8em;">' + UILANG.m('Double-click element to open it or select elements to copy or move them!') + '</span>');
                }
            }

            $.each(srchResultsArray, function (k, v) {
                let newListEntry = true;
                v.label = v.label.replace(new RegExp(searchterm, 'gi'), '<span style="color:#4175b9;font-weight:700;">' + searchterm + '</span>');
                if (v.subresult != null) {
                    v.subresultvalue = v.subresultvalue.replace(new RegExp(searchterm, 'gi'), '<span style="color:#4175b9;font-weight:700;">' + searchterm + '</span>');
                }
                if (v.type) {
                    switch (v.type) {
                        //For ITEM, TEST & TESTEE Manager
                        case 'folder':
                            $("#srchres_folder" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left:5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                            $("#src" + v.id).addClass('folder');
                            //Set checkboxes in relation to the FileOpPermissions
                            if (fileOpPermissions.copyFolders === true || fileOpPermissions.cutFolders === true) {
                                $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                            }
                            break;
                        case 'itemGroup':
                            if (v.subresult != null) {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                                    $("#src" + v.id).addClass('typefile');
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                                $("#src" + v.id).append('<br /><span style="margin-left: 5px;color:#666;font-size:9pt;font-weight:300;"><strong>' + UILANG.m(v.subresult) + '</strong>' + v.subresultvalue + '</span>');
                            } else {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                                    $("#src" + v.id).addClass('typefile');
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                            }
                            break;
                        case 'test':
                            let testType = 'typeTest' + v.testType.charAt(0).toUpperCase() + v.testType.slice(1);
                            if (v.subresult != null) {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span><span class="mediaIndicator">[' + v.testType + ']</span></li>');
                                    $("#src" + v.id).addClass(testType);
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                                $("#src" + v.id).append('<br /><span style="margin-left: 5px;color:#666;font-size:9pt;font-weight:300;"><strong>' + UILANG.m(v.subresult) + '</strong>' + v.subresultvalue + '</span>');
                            } else {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span><span class="mediaIndicator">[' + v.testType + ']</span></li>');
                                    $("#src" + v.id).addClass(testType);
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                            }
                            break;
                        case 'testee':
                            if (v.subresult != null) {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                                    $("#src" + v.id).addClass('typetestee');
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                                $("#src" + v.id).append('<br /><span style="margin-left: 5px;color:#666;font-size:9pt;font-weight:300;"><strong>' + UILANG.m(v.subresult) + '</strong>' + v.subresultvalue + '</span>');
                            } else {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                                    $("#src" + v.id).addClass('typetestee');
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                            }
                            break;
                        case 'template':
                            if (v.subresult != null) {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                                    $("#src" + v.id).addClass('typetemplate');
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                                $("#src" + v.id).append('<br /><span style="margin-left: 5px;color:#666;font-size:9pt;font-weight:300;"><strong>' + UILANG.m(v.subresult) + '</strong>' + v.subresultvalue + '</span>');
                            } else {
                                if ($("#src" + v.id).length === 0) {
                                    $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<br /><span style="margin-left: 5px;color:#aaa;font-size:8pt;font-weight:300;">(Path: ' + v.path + ')</span></li>');
                                    $("#src" + v.id).addClass('typetemplate');
                                    if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                        $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                                    }
                                } else {
                                    newListEntry = false;
                                }
                            }
                            break;

                            //For Media Manager
                        case 'audio':
                        case 'mp3':
                        case 'wav':
                            $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<span class="mediaIndicator">[' + v.type + ']</span></li>');
                            $("#src" + v.id).addClass('typeaudio');
                            if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                            }
                            if (mediaTypes !== 'all' && mediaTypes !== 'audio') {
                                $("#src" + v.id).css('display', 'none');
                            }
                            break;
                        case 'video':
                        case 'mp4':
                        case 'm4v':
                        case 'mpg':
                            $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<span class="mediaIndicator">[' + v.type + ']</span></li>');
                            $("#src" + v.id).addClass('typevideo');
                            if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                            }
                            if (mediaTypes !== 'all' && mediaTypes !== 'video') {
                                $("#src" + v.id).css('display', 'none');
                            }
                            break;
                        case 'image':
                        case 'png':
                        case 'jpg':
                        case 'jpeg':
                        case 'gif':
                        case 'svg':
                            $("#srchres_files" + idSuffix).append('<li id="src' + v.id + '">' + v.label + '<span class="mediaIndicator">[' + v.type + ']</span></li>');
                            $("#src" + v.id).addClass('typepicture');
                            if (fileOpPermissions.copyItems === true || fileOpPermissions.cutItems === true) {
                                $("#src" + v.id).prepend('<img alt="" style="float:left;width:16px; height:16px;" src="../inc/filer/images/unchecked_checkbox.png" id="chk' + v.id + '" />&nbsp;&nbsp;');
                            }
                            if (mediaTypes !== 'all' && mediaTypes !== 'image') {
                                $("#src" + v.id).css('display', 'none');
                            }
                            break;
                    }
                }
                if (newListEntry) {
                    $("#src" + v.id).css('cursor', 'pointer');
                    $("#chk" + v.id).css('cursor', 'pointer');

                    pointerHandler.listen($("#src" + v.id), {
                        callbacks: {
                            dblclick: function () {

                                $.each(srchResultsArray, function (key, value) {

                                    if (v.id === value.id) {
                                        callback('onSearchItemClick', srchResultsArray[key]);
                                    }
                                });
                                srcForm.dismiss();
                            },
                            click: function () {
                                if ((v.type === 'folder' && fileOpPermissions.copyFolders === true) || (v.type !== 'folder' && fileOpPermissions.copyItems === true) || (v.type === 'folder' && fileOpPermissions.cutFolders === true) || (v.type === 'folder' && fileOpPermissions.cutItems === true)) {

                                    $("#src" + v.id).toggleClass('srcChecked');
                                    if ($("#src" + v.id).hasClass('srcChecked')) {
                                        $("#chk" + v.id).attr('src', '../inc/filer/images/checked_checkbox.png');
                                    } else {
                                        $("#chk" + v.id).attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    }
                                    if ($('.srcChecked').length === 0) {
                                        srcForm.disableButton('openInFolder');
                                        srcForm.disableButton('copyselection');
                                        srcForm.disableButton('cutselection');
                                    } else {
                                        srcForm.enableButton('openInFolder');
                                        srcForm.enableButton('copyselection');

                                        // integrate 'canWrite' permission check into button behavior
                                        let canWrite = true;
                                        $.each($('.srcChecked'), function (k0, v0) {
                                            for (const item of srchResultsArray) {
                                                if (v0.id.substring(3) === item.id) {
                                                    if (item.canWrite === true) continue;
                                                    canWrite = false;
                                                    break;
                                                }
                                            }
                                        });

                                        canWrite ? srcForm.enableButton('cutselection') : srcForm.disableButton('cutselection');

                                        if ($('.srcChecked').length > 1) {
                                            srcForm.disableButton('openInFolder');
                                        }
                                        if ($('.srcChecked').length > 1 && fileOpPermissions.copyMultiple === false) {
                                            srcForm.disableButton('copyselection');
                                        }
                                        if ($('.srcChecked').length > 1 && fileOpPermissions.cutMultiple === false) {
                                            srcForm.disableButton('cutselection');
                                        }
                                        if ($('.srcChecked').length > 0 && fileOpPermissions.copyFolders === false && $('.srcChecked').hasClass('folder')) {
                                            srcForm.disableButton('copyselection');
                                        }
                                        if ($('.srcChecked').length > 0 && fileOpPermissions.copyItems === false && $('.srcChecked').hasClass('typefile typeaudio typevideo typepicture')) {
                                            srcForm.disableButton('copyselection');
                                        }
                                        if ($('.srcChecked').length > 0 && fileOpPermissions.cutFolders === false && $('.srcChecked').hasClass('folder')) {
                                            srcForm.disableButton('cutselection');
                                        }
                                        if ($('.srcChecked').length > 0 && fileOpPermissions.cutItems === false && $('.srcChecked').hasClass('typefile typeaudio typevideo typepicture')) {
                                            srcForm.disableButton('cutselection');
                                        }

                                    }
                                    srchSelection = $('.srcChecked');
                                }

                            }
                        }
                    });

                }
            });

            if ($("#srchres_folder" + idSuffix + " li").length === 0) {
                $("#srchres_folder" + idSuffix).css('display', 'none');
            }

            if ($("#srchres_files" + idSuffix + " li").length === 0) {
                $("#srchres_files" + idSuffix).css('display', 'none');
            }

            function searchClosed(button) {
                if (fullyFeatured) {
                    if (button !== 'close') {
                        const returnItems = [];
                        $.each(srchSelection, function (k, v) {
                            const dblChkArr = [];
                            $.each(srchResultsArray, function (key, value) {
                                if (v.id === 'src' + value.id) {
                                    if ($.inArray(value.id, dblChkArr) === -1) {
                                        returnItems.push(value);
                                    }
                                    dblChkArr.push(value.id);
                                }
                            });
                        });
                        copytees = returnItems;

                        if (button === 'copyselection') {
                            cptask = 'cp';
                            copyItems();
                        } else if (button === 'cutselection') {
                            cptask = 'cut';
                            copyItems();
                        }
                    }
                    if (button === 'openInFolder') {

                        $.each(srchResultsArray, function (key, value) {

                            if (srchSelection[0].id === 'src' + value.id) {

                                callback('onSearchItemClick', srchResultsArray[key]);
                            }
                        });
                    }
                }
            }
            let dialogDataSrc;
            if (!fullyFeatured) {
                dialogDataSrc = {
                    buttons: [{
                        label: UILANG.m('Close'),
                        'cancel': true,
                        'default': true,
                        value: 'close'
                    }],
                    contentId: 'dialog-form' + idSuffix,
                    title: 'Search results',
                    width: 750,
                    callback: searchClosed
                };
            } else {
                dialogDataSrc = {
                    buttons: [{
                        label: UILANG.m('Open in folder'),
                        value: 'openInFolder',
                        disabled: true
                    }, {
                        label: UILANG.m('Copy selection'),
                        value: 'copyselection',
                        disabled: true
                    }, {
                        label: UILANG.m('Cut selection (Move)'),
                        value: 'cutselection',
                        disabled: true
                    }, {
                        label: UILANG.m('Close'),
                        'cancel': true,
                        'default': true,
                        value: 'close'
                    }],
                    contentId: 'dialog-form' + idSuffix,
                    title: 'Search results',
                    width: 750,
                    callback: searchClosed
                };
            }
            srcForm = new nxDialog('srcDialog', dialogDataSrc);

            sortListNodes($('ul#srchres_folder' + idSuffix).get(0));
            sortListNodes($('ul#srchres_files' + idSuffix).get(0));

        }


        function fillClipBoard() {
            const returnItems = [];
            $.each($('.ui-selected'), function (k, v) {

                $.each(itemData, function (key, value) {

                    if (v.id === idSuffix + value.id) {
                        returnItems.push(value);
                    }
                });
            });
            return returnItems;
        }

        function chgname(opt, desc) {

            $.each(itemData, function (key, value) {

                if (desc[0].id === idSuffix + value.id) {
                    callback('onRenameRequest', itemData[key]);
                }
            });
        }

        function delItems(opt, deletees) {

            const delItems = [];
            $.each(deletees, function (k, v) {

                $.each(itemData, function (key, value) {

                    if (v.id === idSuffix + value.id) {
                        delItems.push(value);
                    }
                });
            });
            callback('onDeleteRequest', delItems);

        }

        function copyItems() {

            const folderCount = $.grep($(copytees), function (clipb) {
                return (clipb.type === "folder");
            });

            const returnData = [{
                totalClipboard: $(copytees).length,
                cbFiles: $(copytees).length - folderCount.length,
                cbFolders: folderCount.length,
                task: cptask
            }];
            //if($(copytees).length>0){
            //	qmsg={qMessage:$(copytees).length+' item(s) added to the clipboard.',msgColor:'#0A0'}
            //} else {
            //	qmsg={qMessage:'No items selected!',msgColor:'#F00'}
            //}
            //callback('quickMessage',qmsg);
            callback('onClipboardSuccess', returnData);
        }


        function pasteItems() {

            const pasteTarget = breadcrumbData[breadcrumbData.length - 1].id;

            const returnData = [{
                target: pasteTarget,
                sources: copytees
            }];
            callback('onPaste', returnData);
            //callback('onClipboardSuccess', copytees);

        }

        function cutPasteItems() {

            const pasteTarget = breadcrumbData[breadcrumbData.length - 1].id;

            const returnData = [{
                target: pasteTarget,
                sources: copytees
            }];
            callback('onCutPaste', returnData);
            copytees = 0;
            //callback('onClipboardSuccess', copytees);

        }

        function moveItems(e, selected, dropPane) {
            let moveTarget;
            if (dropPane === 'bc') {
                moveTarget = e.target.id.slice(idSuffix.length + 2);
            } else {
                moveTarget = e.target.id.slice(idSuffix.length);
            }
            const moveItems = [];
            $.each(selected, function (k, v) {

                $.each(itemData, function (key, value) {

                    if (v.id === idSuffix + value.id) {
                        moveItems.push(value);
                    }
                });
            });

            const returnData = [{
                target: moveTarget,
                sources: moveItems
            }];

            callback('onMove', returnData);

        }

        function breadcrumb() {

            $("#breadcrumbs" + idSuffix).empty();
            $("#breadcrumbs" + idSuffix).append('<li id="bc' + idSuffix + breadcrumbData[0].id + '"><img alt="" style="height:23px; width:23px;" src="../inc/filer/images/ic_fl_home.png" />&nbsp;</li>');
            $("#bc" + idSuffix + breadcrumbData[0].id).css('cursor', 'default');

            //Filter icon
            $("#breadcrumbs" + idSuffix).append('<img alt="" id="filtericon' + idSuffix + '" src="../inc/filer/images/filter_icon.png" />');
            $("#filtericon" + idSuffix).on({
                mouseenter: function () {
                    $(this).attr('src', '../inc/filer/images/filter_icon_blue.png');
                },
                mouseleave: function () {
                    $(this).attr('src', '../inc/filer/images/filter_icon.png');
                }
            });

            pointerHandler.listen($("#filtericon" + idSuffix), {
                callbacks: {
                    click: function () {
                        $("#filterarea" + idSuffix).slideToggle('fast', function () {
                            if (!fullyFeatured) {
                                if ($("#filterarea" + idSuffix).css('display') === 'none') {
                                    $("#fltinput" + idSuffix).val('');
                                    $("#fltinput" + idSuffix).removeClass("activefilter");
                                    $("#fltinput" + idSuffix).trigger('keyup');
                                    $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - 30);
                                } else {
                                    $("#fltinput" + idSuffix).trigger('focus');
                                    $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - 74);
                                }
                            } else {
                                if ($("#filterarea" + idSuffix).css('display') === 'none') {
                                    $("#fltinput" + idSuffix).val('');
                                    $("#fltinput" + idSuffix).removeClass("activefilter");
                                    $("#fltinput" + idSuffix).trigger('keyup');
                                    $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - 60);
                                } else {
                                    $("#fltinput" + idSuffix).trigger('focus');
                                    $("#filezcontainer" + idSuffix).height($("#filer_frame" + idSuffix).height() - 104);
                                }
                            }
                        })
                    }
                }
            });
            //End Filter icon


            $("#breadcrumbs" + idSuffix).append('<li id="bcprevs' + idSuffix + '" class="prevfold">...<ul id="prevs' + idSuffix + '"></ul></li>');

            if (breadcrumbData.length > 1) {
                $("#bc" + idSuffix + breadcrumbData[0].id).on({
                    mouseenter: function () {
                        $("#bc" + idSuffix + breadcrumbData[0].id + " > img").attr('src', '../inc/filer/images/ic_fl_home-hover.png');
                    },
                    mouseleave: function () {
                        $("#bc" + idSuffix + breadcrumbData[0].id + " > img").attr('src', '../inc/filer/images/ic_fl_home.png');
                    }
                });
                $("#bc" + idSuffix + breadcrumbData[0].id).addClass('droppable2').addClass('activeHome');
                $("#bc" + idSuffix + breadcrumbData[0].id).css('cursor', 'pointer');
            }
            pointerHandler.listen($("#bc" + idSuffix + breadcrumbData[0].id), {
                callbacks: {
                    click: function () {
                        $("#filez").animate({
                            scrollTop: 0
                        }, 0);
                        callback('onBreadcrumbNavigate', breadcrumbData[0].id);
                    }
                }
            });

            let crumbwidth = $("#bc" + idSuffix + breadcrumbData[0].id).width();

            let counter = 0;
            let lilist = '[';
            //let curr = '[';
            // let hoverAdd = "onmousemove = \"this.style.color='#679ee7'\" onmouseout = \"this.style.color=''\"";

            $.each(breadcrumbData, function (k, v) {

                if (v.name === 'Home' || v.name === '') {

                } else if (counter === breadcrumbData.length - 2) {
                    if (v.name.length > 18) {
                        v.name = v.name.substring(18, 0) + '...';
                    }
                    $("#breadcrumbs" + idSuffix).append('<li id="bc' + idSuffix + v.id + '" title="' + escapeHtml(v.name) + '" class="current" liwidth="' + $('#bc' + idSuffix + v.id + '').width() + '"><strong>' + escapeHtml(v.name) + '</strong></li>');
                    crumbwidth = crumbwidth + $("#bc" + idSuffix + v.id).width();
                    $("#bc" + idSuffix + v.id).attr('liwidth', $("#bc" + idSuffix + v.id).width());
                    //curr += '{"id":"' + idSuffix + v.id + '","name":"' + escapeHtml(v.name) + '","liwidth":"' + ($("#bc" + idSuffix + v.id).width() + 2) + 'px"}';
                    $(".current").css('cursor', 'default');

                } else {
                    if (v.name.length > 18) {
                        v.name = v.name.substring(18, 0) + '...';
                    }
                    $("#breadcrumbs" + idSuffix).append('<li id="bc' + idSuffix + v.id + '" title="' + escapeHtml(v.name) + '" class="droppable2" liwidth="' + $("#bc" + idSuffix + v.id).width() + '">' + escapeHtml(v.name) + '</li>');
                    pointerHandler.listen($('#bc' + idSuffix + v.id), {
                        callbacks: {
                            over: function (e) {
                                e.target.style.color = '#217eaa';
                            },
                            leave: function (e) {
                                e.target.style.color = '';
                            }
                        }
                    });
                    crumbwidth = crumbwidth + $("#bc" + idSuffix + v.id).width() + 10;
                    $("#bc" + idSuffix + v.id).attr('liwidth', $("#bc" + idSuffix + v.id).width());
                    if (counter > 0) {
                        lilist += ',';
                    }
                    lilist += '{"id":"' + idSuffix + v.id + '","name":"' + escapeHtml(v.name) + '","liwidth":"' + ($("#bc" + idSuffix + v.id).width() + 2) + 'px"}';
                    counter++;

                    pointerHandler.listen($("#bc" + idSuffix + v.id), {
                        callbacks: {
                            click: function () {
                                $("#filez").animate({
                                    scrollTop: 0
                                }, 0);
                                callback('onBreadcrumbNavigate', v.id);
                            }
                        }
                    });

                    $("li").css('cursor', 'pointer');
                }

            });
            lilist += ']';
            //curr += ']';
            if (crumbwidth > 240 && lilist !== '{}') {

                const obj = JSON.parse(lilist);
                let zaehler = 0;
                const laenge = obj.length;

                $.each(obj, function (k, v) {
                    if (zaehler > laenge - 2) {
                        if (zaehler === laenge - 1) {
                            //
                        }
                    } else {
                        //lis löschen
                        $("#bc" + v.id).prependTo("#prevs" + idSuffix);

                    }
                    zaehler++;
                });

                $('#bcprevs' + idSuffix + '').css('display', 'block');

                $('#bcprevs' + idSuffix + '').hoverIntent(function () {
                    $(this).find('>ul').slideDown('fast');

                }, function () {
                    $(this).find('ul').slideUp('fast');
                });
            }
        }

        function escapeHtml(str) {
            if(str && isNaN(str)) {
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

        this.clearSelection = clearSelection;
        this.setSelection = setSelection;
        this.selectAll = selectAll;
        this.getSelect = getSelect;
        this.getSelectDblclick = getSelectDblclick;
        this.setItems = setItems;
        this.updateItem = updateItem;
        this.refreshView = refreshView;
        this.searchShow = searchShow;
        this.filerSearch = filerSearch;
        this.itemsToClipboard = itemsToClipboard;
        this.filerPaste = filerPaste;
        this.filerKeyUp = filerKeyUp;
        this.filerKeyDown = filerKeyDown;
        this.filerShiftKeyUp = filerShiftKeyUp;
        this.filerShiftKeyDown = filerShiftKeyDown;
        this.getCurrentFolderID = getCurrentFolderID;
        this.deleteFiles = deleteFiles;
        this.clearClipboard = clearClipboard;
    }

    window.fileMgr = fileMgr;

})(jQuery);