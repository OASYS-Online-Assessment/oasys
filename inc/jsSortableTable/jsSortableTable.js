/*

 jsSortableTable v5.4
 (c) 2014 - 2026 by Willibrord Koch | Adam Druzd | Tomas Kamarauskas
 -------------------------------------------------------------------------------------------------------------------
 DESCRIPTION:
 This class provides an html-table where elements can be added (method), removed(method,UI)
 and sorted via drag&drop. Each table row can have interactive elements like clickable text, action-fields,
 action-buttons and more.
 -------------------------------------------------------------------------------------------------------------------
 VERSIONS:
 -------------------------------------------------------------------------------------------------------------------
 v1.0	Initial version
 v1.1	Adding optional consecutive numbers and tableheads
 v1.2	clearElements() leaves table head untouched if present
 v1.3	same element can be added multiple times now
 v1.4	method added to show warning messages (icon before name)
 v1.5   changes implemented to make it more versatile for different needs
 v1.6   add possibility to make a value of the list clickable -> generate callback
        sending an object e.g. {data:'Item Number 1', id:'100'} will activate clickable elements
 v1.7   added optional hidden data for clickable options & sortable on/off option
 v1.8   method 'changetdid' added to change table data ids of clickable elements
 v1.9   added possibility to exclude certain values on clickable elements:
        parameter linkExclusives -> {fieldname:value}
 v2.0	actionfield-functionality added
 v2.1   actionButton-functionality added
 v2.2   actionfield showtextonly option added, fixedpos-button added (for fluid tests)
 v2.3   added progressbar-field functionality
 v2.4   added properties for actionButton: actionButtonImageActive, actionButtonImageInactive
 v2.5   added functionality for multi buttons: it is compatible with older version: new usage Array of Objects
                      actionButtonS: [
                                    {
                                        hiddenData: v['id'],
                                        name: 'Delete',
                                        classes: 'glyphicon glyphicon-remove error-color-text'
                                    },

                                    {
                                        hiddenData: v['id'],
                                        name: 'Edit',
                                        classes: 'glyphicon glyphicon-edit'
                                    }
                                    ]
        example: http://10.240.4.25/coma/maskcoder/tests.php
        added properties :actionButtonSClassActive, actionButtonsClassInActive default classes for button (def in css file)
 v2.6   bug fixed - displaying progressbar under Chrome
 v2.7   added new column type activeButtos - fixed issue with compatibility
 v2.8   small style modifications for oasys v3
 v2.9   HTML chars escaping added
 v3.0   Modified detection of "deleted" elements
 v3.1   Added methods to hide/show the module
 v4.0   Code cleanup, removed undo/redo, added status indicators.
 v4.0.1 updated for jsPointerHandler v2.1.0
 v4.1   Hiding fixedposButton on deleted rows
 v4.2   Modified UI for warnings and errors
 v5.0   Converted constructor function to JsSortableTable class and updated OASYS instantiations.
 v5.1   Modernized warning and error indicators.
 v5.2   Added a dedicated table frame for the modern outline treatment.
 v5.3   Added optional text filtering and support for an additional row filter.
 v5.4   Added an optional reusable icon column.
 --------------------------------------------------------------------------------------------------------------------
 USAGE:
 include the CSS and the JS file in your HTML document
 instantiate with:
 new JsSortableTable(parent, id, options)

 PARAMETERS:
 parent - parent element for the new droplist
 id - id for the new element
 options - an object with the following options:
 onChange:			         callback function when value changes
 onClick:                    callback function when action field or button has been clicked
 elements:			         an array of objects describing the elements to be created, Every element exists of table cell data (title & value) and one special value:
                             "hiddenID" -> will not be shown, internal ID of each element (database)
 tdSizes:				     needs same structure as elements, defining the cell width for each column
 tableHead:				     needs same structure as elements, defining the cell title (th) for each column
 cssStylesTable:	         CSS styles for the table
 cssStylesCells:		     CSS styles for the table cells
 cssHeadCells:		         CSS styles for the table cells
 dataId:				     a string identifying what the data represents (e.g. name of database field)
                             this will be sent back in the onChange event and helps identify the data being sent, default is empty string
 readOnly:			         boolean that defines if the elements can be modified
 appPath:			         Path to the jsSortableTable.js files, for example 'inc/jsSortableTable/'
 consecutiveNumbers:	     true/false for extra column with consecutive numbers, needs width in tdSizes "consecutiveNumbers: '20px'"
 tableHeadDisplay:	         true/false for showing/hiding the table headers defined in tableHead
 linkExclusives:             object with values which should not show up as a link {fieldname:value}
 actionField:                true/false actionField functionality
 actionFieldSize:            size of ActionField (column), default is '50px'
 actionFieldColText:         column headline actionField optional
 actionFieldDefaultText:     default state text actionfield
 actionFieldModifiedText:    modified state text actionfield
 actionFieldInactiveText:    inactive state text actionfield
 cssStylesAFdefault:         default state CSS actionfield
 cssStylesAFmodified:        modified state CSS actionfield
 cssStylesAFinactive:        inactive state CSS actionfield
 actionButton:               true/false actionButton functionality
 actionButtonSize:           size of actionbutton column, default is '20px'
 actionButtonColText:        column headline actionButton optional
 actionButtonImageActive     image used for css background-image when button is active // AD
 actionButtonImageInactive   image used for css background-image when button is inactive // AD
 actionButtons:              true/false actionButtons functionality
 actionButtonsSize:          size of actionbuttons column, default is '20px'
 actionButtonsColText:       column headline actionButton optional
 actionButtonsClassActive    class used as default for action button if not passed will be 'actionbuttonicon actionbuttonicon-s';
 actionButtonsClassInActive  class used as default for action button (nonactive) if not passed will be  'actionbuttonicon actionbuttonicon-s greish';
 progressField:              true/false progressField functionality
 progressFieldSize:          size of progressField column, default is '50px'
 progressFieldColText:       column headline progressField optional
 filter:                     true or {startText, initialValue} to add a client-side text filter
 iconColumn:                 optional {field, title, width, size, path, icons, labels} icon column


 METHODS:
 lock()
 sets list to read only mode.

 unlock()
 removes read only mode.

 setDataId(dataId)
 sets a new dataId for this group

 getDataId()
 fetches the dataId for this group

 addElement()
 to add an new element to the table (table row) use the same structure as the elements on instantiation

 removeElement(id)
 to remove an element (table row), send the internal ID (hiddenID)

 clearElements()
 to delete all elements

 setWarningMessage()
 Set warning message for table row (shows icon with flyout)

 clearWarnings()
 clear all warnings

 triggerCallback()
 trigger a change callback

 changetdid()
 change label (current, all, allsame, alldifferent)

 updateHiddenData()
 possibility to update the hiddenData from outside

 killActionFields()
 deactivate the actionfield(s)

 resetActionFields()
 set all action fields to default (also delete corresponding hidden data)

 setFilter(), getFilter(), clearFilter()
 control the optional client-side text filter

 setRowFilter()
 set an additional row predicate that is combined with the text filter
 */

"use strict";

(function ($) {
    class JsSortableTable {
        constructor(parent, id, options) {
        let tableHtml = '';
        const pointerHandler = jsPointerHandler.instance;
        /* optional settings */
        if (!options) options = {};
        const changeCallback = options.onChange || null;
        const clickCallback = options.onClick || null;
        const elements = options.elements || {};
        const tdSizes = options.tdSizes || {};
        const tableHead = options.tableHead || {};
        const cssStylesTable = options.cssStylesTable || '';
        const cssStylesCells = options.cssStylesCells || '';
        const cssHeadCells = options.cssHeadCells || '';
        let dataId = options.dataId || '';
        const readOnly = options.readOnly || false;
        const deleteLinkSize = options.deleteLinkSize || '20px';
        const hideDeleteLinks = options.hideDeleteLinks || false;
        const deleteConfirmation = typeof options.deleteConfirmation === 'function' ? options.deleteConfirmation : null;
        const consecutiveNumbersSize = options.consecutiveNumbersSize || '20px';
        const consecutiveNumbersText = options.consecutiveNumbersText || '#';
        let hiddenData = {};
        const appPath = options.appPath || '../inc/jsSortableTable/';
        const consecutiveNumbers = options.consecutiveNumbers || false;
        const tableHeadDisplay = options.tableHeadDisplay || false;
        const fixedOrder = options.fixedOrder || false;
        const linkExclusives = options.linkExclusives || {};
        const iconColumn = options.iconColumn && typeof options.iconColumn === 'object' ? options.iconColumn : null;
        const iconColumnField = iconColumn && iconColumn.field ? iconColumn.field : null;
        const iconColumnTitle = iconColumn && iconColumn.title ? iconColumn.title : '';
        const iconColumnWidth = iconColumn && iconColumn.width ? iconColumn.width : '24px';
        const iconColumnSize = iconColumn && iconColumn.size ? iconColumn.size : '20px';
        const iconColumnPath = iconColumn && iconColumn.path ? iconColumn.path : '';
        const iconColumnIcons = iconColumn && iconColumn.icons ? iconColumn.icons : {};
        const iconColumnLabels = iconColumn && iconColumn.labels ? iconColumn.labels : {};
        //action fields
        const actionField = options.actionField || false;
        const actionFieldSize = options.actionFieldSize || '50px';
        const actionFieldColText = options.actionFieldColText || 'Overrides';
        const actionFieldDefaultText = options.actionFieldDefaultText || 'original';
        const actionFieldModifiedText = options.actionFieldModifiedText || 'modified';
        const actionFieldInactiveText = options.actionFieldInactiveText || 'n / a';
        const showTextOnly = options.showTextOnly || '';
        const cssStylesAFdefault = options.cssStylesAFdefault || '';
        const cssStylesAFmodified = options.cssStylesAFmodified || '';
        const cssStylesAFinactive = options.cssStylesAFinactive || '';
        //status indicator column
        const statusIndicator = options.statusIndicator || false;
        const statusIndicatorColText = options.statusIndicatorColText || false;
        const statusIndicatorFieldSize = options.statusIndicatorFieldSize || '80px';
        //action buttons
        const actionButton = options.actionButton || false;
        const actionButtonSize = options.actionButtonSize || '20px';
        const actionButtonColText = options.actionButtonColText || '';
        const actionButtonImageActive = options.actionButtonImageActive || 'ic_miniSB_script.svg';
        const actionButtonImageInactive = options.actionButtonImageInactive || 'ic_miniSB_script-inactive.svg';
        const actionButtons = options.actionButtons || false;
        const actionButtonsSize = options.actionButtonsSize || '20px';
        const actionButtonsColText = options.actionButtonsColText || '';
        const actionButtonsClassActive = options.actionButtonsClassActive || 'actionbuttonsicon actionbuttonsicon-s';
        //const actionButtonsClassInActive = options.actionButtonsClassInActive || 'actionbuttonsicon actionbuttonsicon-s greish';
        //fixed position attribute (fluid tests)
        const fixedPosButton = options.fixedPosButton || false;
        const fixedPosButtonSize = options.fixedPosButtonSize || '20px';
        const fixedPosButtonColText = options.fixedPosButtonColText || '';
        //progress field
        const progressField = options.progressField || false;
        const progressFieldSize = options.progressFieldSize || '50px';
        const progressFieldColText = options.progressFieldColText || '';
        //optional client-side filtering
        const filterOption = options.filter || false;
        const filterEnabled = filterOption === true || (filterOption && typeof filterOption === 'object');
        const filterStartText = (filterOption && typeof filterOption === 'object')
            ? (filterOption.startText || filterOption.placeholder || '')
            : (options.filterStartText || options.filterPlaceholder || '');
        const filterInitialValue = (filterOption && typeof filterOption === 'object')
            ? (filterOption.initialValue || '')
            : '';
        let rowFilter = typeof options.rowFilter === 'function' ? options.rowFilter : null;

        /* creation */
        //fix the helper dimensions
        const correctHelper = function (e, v) {
            const $original = v.children();
            const $helper = v.clone();
            $helper.children().each(function (index) {
                $(this).width($original.eq(index).width());
            });
            return $helper;
        };

        //build table
        const sTable = 'sortableTable_' + id;
        const sTableFrame = sTable + '_frame';
        const sTableFilter = sTable + '_filter';
        const sTableFilterBar = sTable + '_filterBar';

        if (filterEnabled) {
            const $filterInput = $('<input>').attr({
                id: sTableFilter,
                'class': 'jsSortableTableFilter',
                type: 'search',
                placeholder: filterStartText,
                'aria-label': filterStartText || 'Filter table',
                autocomplete: 'off',
                spellcheck: 'false'
            }).val(filterInitialValue);
            $('#' + parent).append(
                $('<div>', {
                    id: sTableFilterBar,
                    class: 'jsSortableTableFilterBar'
                }).append($filterInput)
            );
            $filterInput.on('input', applyFilter).on('keydown', function (event) {
                if (event.key === 'Escape' && this.value !== '') {
                    this.value = '';
                    applyFilter();
                }
            });
        }
        $('#' + parent).append('<div id="' + sTableFrame + '" class="jsSortableTableFrame"><table id="' + sTable + '"><tbody></tbody></table></div>');
        //Build head
        if (tableHeadDisplay) {
            $('#' + sTable).append('<tr class="ui-state-disabled" id= "' + id + '_head"></tr>');
            if (consecutiveNumbers) {
                $('#' + id + '_head').append('<th style="text-align:right;width:' + consecutiveNumbersSize + ';">' + consecutiveNumbersText + '</th>');
            }
            if (iconColumnField) {
                $('<th>', {
                    text: iconColumnTitle,
                    'data-id': iconColumnField,
                    'class': 'jsSortableTableIconHead'
                }).css({
                    'text-align': 'left',
                    width: iconColumnWidth,
                    'max-width': iconColumnWidth,
                    padding: 0
                }).appendTo('#' + id + '_head');
            }
            $.each(tableHead, function (k, v) {
                $('#' + id + '_head').append('<th data-id="' + k + '" style="text-align:left;width:' + tdSizes[k] + ';">' + v + '</th>');
            });
            if (actionField) {
                $('#' + id + '_head').append('<th data-fielddesc="actionField" style="text-align:left;width:' + actionFieldSize + ';">' + actionFieldColText + '</th>');
            }
            if (statusIndicator) {
                $('#' + id + '_head').append('<th style="text-align:left;width:' + statusIndicatorFieldSize + ';">' + statusIndicatorColText + '</th>');
            }
            if (actionButton) {
                $('#' + id + '_head').append('<th style="text-align:left;">' + actionButtonColText + '</th>');
            }
            if (actionButtons) {
                $('#' + id + '_head').append('<th style="text-align:left;">' + actionButtonsColText + '</th>');
            }
            if (fixedPosButton) {
                $('#' + id + '_head').append('<th style="text-align:left;width:' + fixedPosButtonSize + ';">' + fixedPosButtonColText + '</th>');
            }
            if (progressField) {
                $('#' + id + '_head').append('<th style="text-align:center;width:' + progressFieldSize + ';">' + progressFieldColText + '</th>');
            }
            if (!hideDeleteLinks) {
                $('#' + id + '_head').append('<th style="width:' + deleteLinkSize + ';">&nbsp;</th>');
            }
        }

        //Build data rows
        $.each(elements, function (k, v) {
            addElement(v, true);
        });

        //add CSS
        if (tableHeadDisplay) {
            $('#' + id + '_head >th').css(cssHeadCells);
            if (iconColumnField) {
                $('#' + id + '_head >th').filter(function () {
                    return this.dataset.id === iconColumnField;
                }).css({
                    width: iconColumnWidth,
                    'max-width': iconColumnWidth,
                    padding: 0
                });
            }
        }
        $('#' + sTable).css(cssStylesTable);
        $('#' + sTable + ' td').css(cssStylesCells);
        if (iconColumnField) {
            $('#' + sTable + ' td.jsSortableTableIconCell').css({
                width: iconColumnWidth,
                'max-width': iconColumnWidth,
                'min-width': iconColumnWidth,
                padding: 0,
                'text-align': 'right'
            });
        }
        $('#' + sTable + ' td').addClass('stGrab');
        //save current table content while sorting
        tableHtml = $('#' + sTable + ' tbody').html();
        //make it sortable
        if (!fixedOrder) {
            $('#' + sTable + ' tbody').sortable({
                items: "tr:not(.ui-state-disabled):visible",
                helper: correctHelper,
                cursor: "move",
                placeholder: "ui-state-highlight",
                opacity: 0.7,
                axis: "y",
                forcePlaceholderSize: true,
                start: function (e, ui) {
                    ui.placeholder.height(ui.item.height());
                }
            }).disableSelection();
        }
        //add table content before the change to the undo list, when successfully sorted
        $('#' + sTable + ' tbody').on("sortupdate", function () {
            createChangeCallback();
            if (consecutiveNumbers) {
                reNumber();
            }
            //save current table content while sorting
            tableHtml = $('#' + sTable + ' tbody').html();
        });

        if (consecutiveNumbers) {
            reNumber();
        }

        //Switch to read-only mode
        if (readOnly === true) {
            lock();
        } else {
            unlock();
        }


        /* private functions */
        function createDeleteButtons() {
            removeDeleteButtons();
            $.each($('td[data-class="deleteLink_' + id + '"]'), function (k, v) {
                const targetCell = '#deleteLink_' + id + '_' + $(v).data('item');
                $('#' + id + '_' + $(v).data('item')).on('mouseenter', function () {
                    $(targetCell).css('background-image', 'url(' + appPath + 'images/closeXRed@4x.png)');
                    $(targetCell).css('cursor', 'pointer');
                    $(targetCell).on('click', function () {
                        requestRemoveElement($(v).data('item'));
                    });
                }).on('mouseleave', function () {
                    $(targetCell).css('background-image', 'none');
                    $(targetCell).css('cursor', 'default');
                    $(targetCell).off('click');
                });
            })
        }

        function activateClickableValues() {
            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.tdid) {
                    if (!$(v).hasClass("sTableClickable")) {
                        $(v).addClass("sTableClickable");
                        $(v).on('click', function () {
                            createClickCallback(v.dataset.tdid, $(v).parent().attr('id'), v.dataset.fielddesc, $(v).parent().data('name'));
                        });
                    }
                }
            })
        }

        function deactivateClickableValues() {

            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.tdid) {
                    $(v).removeClass("sTableClickable");
                    $(v).off('click');
                }
            });
        }

        function activateActionField() {

            checkActionFieldCSS();

            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.afid) {
                    if (v.dataset.aftype !== showTextOnly) {
                        if (!$(v).hasClass("sTableClickable")) {
                            $(v).addClass("sTableClickable");
                            $(v).on('click', function () {
                                createClickCallbackFromAF(v.dataset.afid, $(v).parent().attr('id'), v.dataset.fielddesc, hiddenData[v.dataset.afid], $(v).parent().data('name'));
                            });
                        }
                    }
                }
            });
        }

        function deactivateActionField() {
            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.afid) {
                    $(v).removeClass("sTableClickable");
                    $(v).off('click');
                }
            });
        }

        function activateActionButton() {
            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.abid) {
                    if (!$(v).hasClass("sTableClickable")) {
                        $(v).addClass("sTableClickable");
                        $(v).on('click', function () {
                            //console.log(v.dataset.abid, $(v).parent().attr('id'), v.dataset.fielddesc, hiddenData[v.dataset.abid], $(v).parent().data('name'));
                            createClickCallbackFromAB(v.dataset.abid, $(v).parent().attr('id'), v.dataset.fielddesc, hiddenData[v.dataset.abid], $(v).parent().data('name'));
                        })
                    }
                }
                if (v.dataset.abtype === 'active') {
                    $(v).css('background-image', 'url(' + appPath + 'images/' + actionButtonImageActive + ')');
                    $(v).css('cursor', 'pointer');
                } else if (v.dataset.abtype === 'nonactive') {
                    $(v).css('background-image', 'url(' + appPath + 'images/' + actionButtonImageInactive + ')');
                    $(v).css('cursor', 'pointer');
                }
            });
        }

        function deactivateActionButton() {
            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.abid) {
                    $(v).removeClass("sTableClickable");
                    $(v).off('click');
                }
            });
        }

        function activateActionButtons() {
            $.each($('#' + sTable + ' td span.actionButtonsSpan'), function (k, v) {
                if (v.dataset.abid) {
                    if (!$(v).hasClass("sTableClickable")) {
                        $(v).addClass("sTableClickable");
                        $(v).on('click', function () {
                            createClickCallbackFromAB(v.dataset.abid, $(v).parent().parent().attr('id'), v.dataset.fielddesc, hiddenData[v.dataset.abid], $(v).parent().parent().data('name'));
                        })
                    }
                }
                if (v.dataset.abtype === 'active') {
                    $(v).css('cursor', 'pointer');
                    $(v).addClass("sTableClickable");
                    $(v).removeClass("greish");
                } else if (v.dataset.abtype === 'nonactive') {
                    $(v).removeClass("sTableClickable");
                    $(v).addClass("greish");
                    $(v).css("cursor", '');
                    $(v).off('click');
                }
            });
        }

        function deactivateActionButtons() {
            $.each($('#' + sTable + ' td span.actionButtonsSpan'), function (k, v) {
                if (v.dataset.abid) {
                    $(v).removeClass("sTableClickable");
                    $(v).addClass("greish");
                    $(v).css("cursor", '');
                    $(v).off('click');
                }
            });
        }

        function activateFixedPosButton() {
            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.fpid) {
                    if (!$(v).hasClass("sTableClickable")) {
                        $(v).addClass("sTableClickable");
                        $(v).on('click', function () {
                            createClickCallbackFromFP(v.dataset.fpid, $(v).parent().attr('id'), v.dataset.fielddesc, hiddenData[v.dataset.fpid], $(v).parent().data('name'));
                        })
                    }
                }
                if (v.dataset.fptype === 'active') {
                    $(v).css('background-image', 'url(' + appPath + 'images/fixedposbuttonactive.png)');
                    $(v).css('cursor', 'pointer');
                } else if (v.dataset.fptype === 'nonactive') {
                    $(v).css('background-image', 'url(' + appPath + 'images/fixedposbutton.png)');
                    $(v).css('cursor', 'pointer');
                }
            });
        }

        function deactivateFixedPosButton() {
            $.each($('#' + sTable + ' td'), function (k, v) {
                if (v.dataset.fpid) {
                    $(v).removeClass("sTableClickable");
                    $(v).off('click');
                }
            });
        }

        function killActionFields(callback) {
            $.each($('#' + sTable + ' td'), function (k, v) {

                if (v.dataset.afid) {
                    v.dataset.aftype = "inactive";
                    v.innerHTML = actionFieldInactiveText;
                }
            });
            checkActionFieldCSS();
            deactivateActionField();
            clearActionFieldHiddenData();
            if (callback) createChangeCallback();
        }

        function resetActionFields(callback) {
            $.each($('#' + sTable + ' td'), function (k, v) {

                if (v.dataset.afid) {
                    v.dataset.aftype = "default";
                    v.innerHTML = actionFieldDefaultText;
                }
            });
            checkActionFieldCSS();
            clearActionFieldHiddenData();
            if (callback) createChangeCallback();
        }

        function clearActionFieldHiddenData() {
            for (let k in hiddenData) {
                if (~k.indexOf('actionField_')) {
                    delete hiddenData[k];
                }
            }
        }


        function checkActionFieldCSS() {

            $.each($('#' + sTable + ' td'), function (k, v) {

                if (v.dataset.afid) {
                    switch (v.dataset.aftype) {
                        case 'default':
                            $(v).css(cssStylesAFdefault);
                            break;
                        case 'modified':
                            $(v).css(cssStylesAFmodified);
                            break;
                        case 'inactive':
                            $(v).css(cssStylesAFinactive);
                            break;
                    }
                }
            })
        }

        function updateHiddenData(id, newContent, forceCallback) {
            hiddenData[id] = newContent;
            if (forceCallback) triggerCallback();
        }

        function removeDeleteButtons() {
            $.each($('td[data-class="deleteLink_' + id + '"]'), function (k, v) {
                $('#' + id + '_' + $(v).data('item')).off("mouseenter mouseleave");
                $(v).css('cursor', 'default');
            })
        }

        function reNumber() {
            let newCounter = 1;
            $.each($('td[data-class="consno_' + id + '"]'), function () {
                $(this).html(newCounter);
                newCounter++;
            })
        }

        function createChangeCallback(deleted, deletedHiddenData) {
            const currValue = [];
            const tmpArray = [];
            $.each($('.data-rows_' + id), function (k, v) {
                tmpArray[k] = {};
                tmpArray[k]['hiddenID'] = parseInt(v.dataset.id);
                if (iconColumnField) {
                    tmpArray[k][iconColumnField] = v.dataset.iconValue || '';
                }
                $.each(v.children, function (key, value) {
                    if (value.dataset.fielddesc) {
                        tmpArray[k][value.dataset.fielddesc] = $(value).html();
                    }
                    if (value.dataset.tdid) {
                        tmpArray[k]['tdid'] = value.dataset.tdid;
                    }
                    if (value.dataset.aftype) {
                        if (hiddenData[value.dataset.afid]) {
                            tmpArray[k]['actionField'] = hiddenData[value.dataset.afid];
                        } else {
                            tmpArray[k]['actionField'] = {};
                        }
                    }
                    if (value.dataset.abtype) {
                        if (hiddenData[value.dataset.abid]) {
                            tmpArray[k]['actionButton'] = hiddenData[value.dataset.abid];
                        } else {
                            tmpArray[k]['actionButton'] = {};
                        }
                    }
                    if (value.dataset.fptype) {
                        if (hiddenData[value.dataset.fpid]) {
                            tmpArray[k]['fixedPosition'] = hiddenData[value.dataset.fpid];
                        } else {
                            tmpArray[k]['fixedPosition'] = false;
                        }
                    }
                    if (value.dataset.pftype) {
                        if (hiddenData[value.dataset.pfid]) {
                            tmpArray[k]['progressField'] = hiddenData[value.dataset.pfid];
                        } else {
                            tmpArray[k]['progressField'] = '';
                        }
                    }
                });
                currValue.push(tmpArray[k]);
            });

            if (!deleted) deleted = false;
            if (changeCallback) changeCallback.call(this, deleted, id, currValue, parent, dataId, deletedHiddenData);
        }

        function createClickCallback(clickedId, parentId, fieldDesc, rowName) {
            if (clickCallback) clickCallback.call(this, clickedId, parentId, fieldDesc, hiddenData[fieldDesc + '__' + clickedId], dataId, rowName);
        }

        function createClickCallbackFromAF(clickedId, parentId, fieldDesc, hiddenDataValue, rowName) {
            if (clickCallback) clickCallback.call(this, clickedId, parentId, fieldDesc, hiddenDataValue, dataId, rowName);
        }

        function createClickCallbackFromAB(clickedId, parentId, fieldDesc, hiddenDataValue, rowName) {
            if (clickCallback) clickCallback.call(this, clickedId, parentId, fieldDesc, hiddenDataValue, dataId, rowName);
        }

        function createClickCallbackFromFP(clickedId, parentId, fieldDesc, hiddenDataValue, rowName) {
            if (clickCallback) clickCallback.call(this, clickedId, parentId, fieldDesc, hiddenDataValue, dataId, rowName);
        }


        /* public methods */

        function lock(o) {
            //enables read-only modus
            if (!hideDeleteLinks) {
                removeDeleteButtons();
            }
            deactivateClickableValues();
            if (actionField) deactivateActionField();
            if (actionButton) deactivateActionButton();
            if (actionButtons) deactivateActionButtons();
            if (fixedPosButton) deactivateFixedPosButton();
            if (!fixedOrder) $('#' + sTable + ' tbody').sortable("option", "disabled", true);
            if (o === 'greyout') {
                $('#' + sTable).addClass('sTableReadonly');
            }
            if (!fixedOrder) {
                $('#' + sTable + ' td').removeClass('stGrab');
            } else {
                $('#' + sTable + ' td').removeClass('stGrab2');
            }
            $('#' + sTable + ' tr').removeClass('stHover');
        }

        function unlock() {
            //disables read-only modus
            if (!fixedOrder) $('#' + sTable + ' tbody').sortable("option", "disabled", false);
            $('#' + sTable).removeClass('sTableReadonly');
            if (!fixedOrder) {
                $('#' + sTable + ' td').addClass('stGrab');
            } else {
                $('#' + sTable + ' td').addClass('stGrab2');
            }
            $('#' + sTable + ' tr').addClass('stHover');
            if (!hideDeleteLinks) {
                createDeleteButtons();
            }
            activateClickableValues();
            if (actionField) activateActionField();
            if (actionButton) activateActionButton();
            if (actionButtons) activateActionButtons();
            if (fixedPosButton) activateFixedPosButton();
        }

        function setDataId(newDataId) {
            //updates the dataId of the group
            dataId = newDataId;
        }

        function getDataId() {
            //returns the dataId of the group
            return dataId;
        }

        function applyFilter() {
            if (!filterEnabled && rowFilter === null) return;
            const query = filterEnabled
                ? String($('#' + sTableFilter).val() || '').trim().toLocaleLowerCase()
                : '';

            $('.data-rows_' + id).each(function () {
                const textMatches = query === '' || $(this).children('td').text().toLocaleLowerCase().includes(query);
                const rowMatches = rowFilter === null || rowFilter(this) !== false;
                $(this).toggle(textMatches && rowMatches);
            });
        }

        function setFilter(value) {
            if (!filterEnabled) return;
            $('#' + sTableFilter).val(value == null ? '' : String(value));
            applyFilter();
        }

        function getFilter() {
            return filterEnabled ? String($('#' + sTableFilter).val() || '') : '';
        }

        function clearFilter() {
            setFilter('');
        }

        function setRowFilter(filterCallback) {
            rowFilter = typeof filterCallback === 'function' ? filterCallback : null;
            applyFilter();
        }

        function checkForElement(e, callback) {
            const origin = e;
            let i = 1;
            while ($('#' + id + '_' + e).length) {
                e = origin + '__' + i;
                i++;
            }
            callback(e);
        }

        function addElement(newValue, noCallBack) {
            //clearWarnings();
            checkForElement(newValue.hiddenID, function (e) {
                const instanceID = e;
                $('#' + sTable).append('<tr id= "' + id + '_' + instanceID + '" data-id="' + newValue.hiddenID + '" class="stHover data-rows_' + id + '"></tr>');
                if (iconColumnField) {
                    let rowIconValue = newValue[iconColumnField];
                    if (rowIconValue && typeof rowIconValue === 'object') {
                        rowIconValue = rowIconValue.id || rowIconValue.type || rowIconValue.data;
                    }
                    $('#' + id + '_' + instanceID).attr('data-icon-value', rowIconValue == null ? '' : String(rowIconValue));
                }

                if (consecutiveNumbers) {
                    $('#' + id + '_' + instanceID).append('<td class="consno" data-class="consno_' + id + '" style="width:' + tdSizes['consecutiveNumbers'] + ';">x</td>');
                }
                if (iconColumnField) {
                    let iconValue = newValue[iconColumnField];
                    if (iconValue && typeof iconValue === 'object') {
                        iconValue = iconValue.id || iconValue.type || iconValue.data;
                    }
                    iconValue = iconValue == null ? '' : String(iconValue);
                    const $iconCell = $('<td>', {
                        'class': 'jsSortableTableIconCell'
                    }).css({
                        width: iconColumnWidth,
                        'max-width': iconColumnWidth,
                        'min-width': iconColumnWidth,
                        padding: 0,
                        'text-align': 'right'
                    });
                    if (Object.prototype.hasOwnProperty.call(iconColumnIcons, iconValue)) {
                        $('<img>', {
                            src: iconColumnPath + iconColumnIcons[iconValue],
                            alt: '',
                            title: iconColumnLabels[iconValue] || ''
                        }).css({
                            display: 'block',
                            width: iconColumnSize,
                            height: iconColumnSize,
                            'margin-left': 'auto',
                            'object-fit': 'contain'
                        }).appendTo($iconCell);
                    }
                    $('#' + id + '_' + instanceID).append($iconCell);
                }
                $.each(newValue, function (key, value) {
                    if (value === null) value = '';
                    if (key !== iconColumnField && key !== 'removed' && key !== 'hiddenID' && key !== 'deleteLink' && key !== 'actionField' && key !== 'statusIndicator' && key !== 'actionButton' && key !== 'actionButtons' && key !== 'fixedPosition' && key !== 'progressField') {
                        if (typeof value === 'object') {
                            if (linkExclusives[key] && value.data === linkExclusives[key]) {
                                $('#' + id + '_' + instanceID).append('<td data-fielddesc="' + key + '" style="width:' + tdSizes[key] + ';">' + escapeHtml(value.data) + '</td>');
                            } else {
                                $('#' + id + '_' + instanceID).append('<td data-fielddesc="' + key + '" data-tdid="' + value.id + '" style="width:' + tdSizes[key] + ';">' + escapeHtml(value.data) + '</td>');
                            }
                            if (value.hiddenData) {
                                hiddenData[key + '__' + value.id] = value.hiddenData;
                            }
                        } else {
                            if (key === 'name' && newValue.removed === true) {
                                $('#' + id + '_' + instanceID).append('<td style=" font-weight:600; color:#dd1a00" data-fielddesc="' + key + '" style="width:' + tdSizes[key] + ';">' + escapeHtml(value) + '</td>');
                                $('#' + id + '_' + instanceID).data('name', value);
                            } else {
                                $('#' + id + '_' + instanceID).append('<td data-fielddesc="' + key + '" style="width:' + tdSizes[key] + ';">' + escapeHtml(value) + '</td>');
                                if (key === 'name') {
                                    $('#' + id + '_' + instanceID).data('name', value);
                                }
                            }
                        }
                    }
                });

                if (actionField && newValue.actionField && typeof newValue.actionField === 'object') {
                    if ($.isEmptyObject(newValue.actionField) || newValue.actionField === '-') {
                        $('#' + id + '_' + instanceID).append('<td data-fielddesc="actionField" data-aftype="default" data-afid="actionField_' + id + '_' + instanceID + '" data-class="actionField_' + id + '" style="width:' + actionFieldSize + ';">' + actionFieldDefaultText + '</td>');
                    } else {
                        $('#' + id + '_' + instanceID).append('<td data-fielddesc="actionField" data-aftype="modified" data-afid="actionField_' + id + '_' + instanceID + '" data-class="actionField_' + id + '" style="width:' + actionFieldSize + ';">' + actionFieldModifiedText + '</td>');
                    }

                    if (checkNested(newValue, 'actionField', 'hiddenData')) {
                        hiddenData['actionField_' + id + '_' + instanceID] = newValue.actionField.hiddenData;
                    }
                } else if (actionField && newValue.actionField && typeof newValue.actionField != 'object') {
                    $('#' + id + '_' + instanceID).append('<td  data-fielddesc="actionField" style="width:' + actionFieldSize + ';">-</td>');
                }

                if(statusIndicator){
                    if (newValue.statusIndicator) {
                        let n=newValue.statusIndicator.toString();
                        let collectHTML='';
                        for (let i = 0; i < n.length; i++) {
                            if(n[i]==='1' || n[i]==='2'){
                                collectHTML+='<span class="dot'+n[i]+'"></span>';
                            } else {
                                collectHTML+='<span class="dot0"></span>';
                            }
                        }
                        $('#' + id + '_' + instanceID).append('<td    data-fielddesc="statusIndicator" style="width:' + statusIndicatorFieldSize + ';">'+collectHTML+'</td>');
                    } else {
                        $('#' + id + '_' + instanceID).append('<td    data-fielddesc="statusIndicator" style="width:' + statusIndicatorFieldSize + ';">-</td>');
                    }
                }

                if (actionButton) {
                    if (newValue.actionButton && typeof newValue.actionButton === 'object') {
                        if ($.isEmptyObject(newValue.actionButton)) {
                            $('#' + id + '_' + instanceID).append('<td  data-fielddesc="actionButton" data-abtype="nonactive" data-abid="actionButton_' + id + '_' + instanceID + '" data-class="actionButton_' + id + '" style="width:' + actionButtonSize + ';"></td>');
                        } else {
                            $('#' + id + '_' + instanceID).append('<td  data-fielddesc="actionButton" data-abtype="active" data-abid="actionButton_' + id + '_' + instanceID + '" data-class="actionButton_' + id + '" style="width:' + actionButtonSize + ';"></td>');
                        }
                    } else {
                        $('#' + id + '_' + instanceID).append('<td    data-fielddesc="actionButton" style="width:' + actionButtonSize + ';">-</td>');
                    }
                    if (checkNested(newValue, 'actionButton', 'hiddenData')) {
                        hiddenData['actionButton_' + id + '_' + instanceID] = newValue.actionButton.hiddenData;
                    }
                }

                if (actionButtons) {
                    let _hIt;
                    if (newValue.actionButtons && typeof newValue.actionButtons === 'object') {
                        // active as parameter ??
                        if ($.isEmptyObject(newValue.actionButtons)) {
                            $('#' + id + '_' + instanceID).append('<td  data-fielddesc="actionButtons" class="actionButtonsTD"  ><span data-fielddesc="' + (newValue.actionButtons.name || 'actionButtons') + '"   data-abtype="nonactive"    data-abid="actionButtons_' + id + '_' + instanceID + '" data-class="actionButtons_' + id + '" class="actionButtonsSpan ' + actionButtonsClassActive + '" style="height: ' + actionButtonsSize + '; width:' + actionButtonsSize + ';"></span></td>');
                        } else {
                            let abtype = 'active';
                            if (newValue.actionButtons instanceof Array) {
                                let buttons = '';
                                for (let i in newValue.actionButtons) {
                                    abtype = newValue.actionButtons[i].active || 'active';
                                    _hIt = newValue.actionButtons[i].hiddeData || instanceID;
                                    buttons += '<span data-fielddesc="' + (newValue.actionButtons[i].name || 'actionButtons') + '" data-abtype="' + abtype + '" data-abid="actionButtons_' + id + '_' + instanceID + '" data-class="actionButtons_' + id + '"  class="actionButtonsSpan ' + (newValue.actionButtons[i].classes || actionButtonsClassActive) + '" style="height: ' + actionButtonsSize + '; width:' + actionButtonsSize + ';"></span>';
                                }
                                $('#' + id + '_' + instanceID).append('<td  data-fielddesc="actionButtons" class="actionButtonsTD" >' + buttons + '</td>');
                            } else {
                                abtype = newValue.actionButtons.active || 'active';
                                _hIt = newValue.actionButtons.hiddenData || instanceID;
                                $('#' + id + '_' + instanceID).append('<td  data-fielddesc="actionButtons" class="actionButtonsTD" ><span data-fielddesc="' + (newValue.actionButtons.name || 'actionButtons') + '"  data-abtype="' + abtype + '" data-abid="actionButtons_' + id + '_' + instanceID + '" data-class="actionButtons_' + id + '"  class="actionButtonsSpan ' + (newValue.actionButtons.classes || actionButtonsClassActive) + '" style="height: ' + actionButtonsSize + '; width:' + actionButtonsSize + ';"></span></td>');
                            }
                        }
                    } else {
                        $('#' + id + '_' + instanceID).append('<td    data-fielddesc="actionButtons" style="width:' + actionButtonsSize + ';">-</td>');
                    }
                    hiddenData['actionButtons_' + id + '_' + instanceID] = _hIt;
                }

                if (fixedPosButton) {
                    if (newValue.fixedPosition === '-') {
                        $('#' + id + '_' + instanceID).append('<td    data-fielddesc="fixedPosition" style="width:' + fixedPosButtonSize + ';">-</td>');
                    } else {
                        if (newValue.fixedPosition === true) {
                            $('#' + id + '_' + instanceID).append('<td  data-fielddesc="fixedPosition" data-fptype="active" data-fpid="fixedPosition_' + id + '_' + instanceID + '" data-class="fixedPosition_' + id + '" style="width:' + fixedPosButtonSize + ';"></td>');
                        } else {
                            $('#' + id + '_' + instanceID).append('<td  data-fielddesc="fixedPosition" data-fptype="nonactive" data-fpid="fixedPosition_' + id + '_' + instanceID + '" data-class="fixedPosition_' + id + '" style="width:' + fixedPosButtonSize + ';"></td>');
                        }
                        if (checkNested(newValue, 'fixedPosition')) {
                            hiddenData['fixedPosition_' + id + '_' + instanceID] = newValue.fixedPosition;
                        }
                    }
                }

                if (progressField) {
                    $('#' + id + '_' + instanceID).append('<td  data-fielddesc="progressField" data-pftype="nonactive" data-pfid="progressField_' + id + '_' + instanceID + '" data-class="progressField' + id + '" style="background-size: ' + newValue.progressField + '% 100%;">' + newValue.progressField + '%</td>');

                    if (checkNested(newValue, 'progressField')) {
                        hiddenData['progressField_' + id + '_' + instanceID] = newValue.progressField;
                    }
                }

                if (!hideDeleteLinks) {
                    $('#' + id + '_' + instanceID).append('<td id="deleteLink_' + id + '_' + instanceID + '" data-item="' + instanceID + '" data-class="deleteLink_' + id + '" style="width:' + deleteLinkSize + ';">&nbsp;</td>');
                }
                $('#' + sTable + ' td').css(cssStylesCells);
                if (!fixedOrder) {
                    $('#' + sTable + ' td').addClass('stGrab');
                } else {
                    $('#' + sTable + ' td').addClass('stGrab2');
                }
                if (!hideDeleteLinks) {
                    createDeleteButtons();
                }
                activateClickableValues();
                if (actionField) activateActionField();
                if (actionButton) activateActionButton();
                if (actionButtons) activateActionButtons();
                if (fixedPosButton) activateFixedPosButton();
                if (consecutiveNumbers) {
                    reNumber();
                }
                if (!noCallBack) {
                    createChangeCallback();
                }
                //save current table content while sorting
                tableHtml = $('#' + sTable + ' tbody').html();
                if (readOnly === true) {
                    lock();
                }
                applyFilter();
            });
        }

        function removeElement(toRemove) {
            $('#' + id + '_' + toRemove).remove();
            const hiddenDataRemoved = hiddenData['actionField_' + id + '_' + toRemove];
            delete hiddenData['actionField_' + id + '_' + toRemove];
            if (consecutiveNumbers) {
                reNumber();
            }
            //save current table content while sorting
            tableHtml = $('#' + sTable + ' tbody').html();
            createChangeCallback(toRemove, hiddenDataRemoved);
        }

        function requestRemoveElement(toRemove) {
            if (!deleteConfirmation) {
                removeElement(toRemove);
                return;
            }
            const result = deleteConfirmation(toRemove);
            if (result && typeof result.then === 'function') {
                result.then((confirmed) => {
                    if (confirmed) removeElement(toRemove);
                });
                return;
            }
            if (result !== false) removeElement(toRemove);
        }

        function clearElements(noCallBack) {
            clearWarnings();
            $(".data-rows_" + id).remove();
            hiddenData = {};
            //save current table content while sorting
            tableHtml = $('#' + sTable + ' tbody').html();
            if (!noCallBack) {
                createChangeCallback();
            }
        }


        function setWarningMessage(message, type, rowId) {
            const msgTarget = $('tr[data-id="' + rowId + '"] > td[data-fielddesc="name"]');
            if (!msgTarget.length) {
                return;
            }

            msgTarget.find('.sTableWarningImg').remove();
            $('#tt_' + rowId).remove();

            const isWarning = type === 'warning';
            const iconHtml =
                '<span class="sTableWarningImg ' +
                (isWarning ? 'sTableWarningImg--warning' : 'sTableWarningImg--error') +
                '" data-id="' + rowId + '" aria-hidden="true">!</span>';

            msgTarget.prepend(iconHtml);

            $('body').append(
                '<div id="tt_' + rowId + '" class="pcWarnings sTableWarningTip ' +
                (isWarning ? 'sTableWarningTip--warning' : 'sTableWarningTip--error') +
                '" role="tooltip"><div class="sTableWarningTip__icon" aria-hidden="true">!</div>' +
                '<div class="sTableWarningTip__message">' + message + '</div></div>'
            );
            const $tip = $('#tt_' + rowId);

            const $triggers = $('.sTableWarningImg[data-id="' + rowId + '"]');

            $triggers.off('mouseenter mousemove mouseleave').on('mouseenter mousemove', function (e) {
                const tipWidth = $tip.outerWidth();
                const left = Math.min(e.pageX + 18, $(window).scrollLeft() + $(window).width() - tipWidth - 16);
                const top = e.pageY + 12;

                $tip.css({ top: top, left: Math.max(16, left), display: 'flex' });
            }).on('mouseleave', function () {
                $tip.hide();
            });
        }



        function changetdid(parentId, newtdid, saveOption) {
            let origin;
            switch (saveOption) {
                case 'current':
                    $.each($('#' + parentId + ' td'), function (k, v) {
                        if (v.dataset.tdid) {
                            v.dataset.tdid = newtdid;
                        }
                    });
                    break;
                case 'all':
                    $.each($('#' + sTable + ' tr'), function (key, value) {
                        $.each($('#' + value.id + ' td'), function (k, v) {
                            if (v.dataset.tdid) {
                                v.dataset.tdid = newtdid;
                            }
                        });
                    });
                    break;
                case 'allsame':
                    $.each($('#' + parentId + ' td'), function (k, v) {
                        if (v.dataset.tdid) {
                            origin = v.dataset.tdid;
                        }
                    });
                    $.each($('#' + sTable + ' tr'), function (key, value) {
                        $.each($('#' + value.id + ' td'), function (k, v) {
                            if (v.dataset.tdid === origin) {
                                v.dataset.tdid = newtdid;
                            }
                        });
                    });
                    break;
                case 'alldifferent':
                    $.each($('#' + parentId + ' td'), function (k, v) {
                        if (v.dataset.tdid) {
                            origin = v.dataset.tdid;
                        }
                    });
                    $.each($('#' + sTable + ' tr'), function (key, value) {
                        $.each($('#' + value.id + ' td'), function (k, v) {
                            if (v.dataset.tdid !== origin) {
                                v.dataset.tdid = newtdid;
                            }
                        });
                    });
                    break;
            }
        }

        function clearWarnings() {
            $('.pcWarnings').remove();
            $('.sTableWarningImg').remove();
        }

        function triggerCallback() {
            createChangeCallback();
        }

        function checkForId(searchId) {
            let result = false;
            $.each($('#' + sTable + ' tr'), function (key, value) {
                if (searchId === parseInt(value.dataset.id)) result = true;
            });
            return result;
        }

        function hide(){
            if (filterEnabled) $('#' + sTableFilterBar).css('display','none');
            $('#' + sTableFrame).css('display','none');
        }

        function show(){
            if (filterEnabled) $('#' + sTableFilterBar).css('display','flex');
            $('#' + sTableFrame).css('display','block');
        }


        /* helper functions */
        function checkNested(obj) {
            //console.log(obj);
            const args = Array.prototype.slice.call(arguments, 1);
            //console.log(args);
            for (let i = 0; i < args.length; i++) {
                if (!obj || !obj.hasOwnProperty(args[i])) {
                    return false;
                }
                obj = obj[args[i]];
            }
            return true;
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

        /* export methods */
        this.lock = lock;
        this.unlock = unlock;
        this.setDataId = setDataId;
        this.getDataId = getDataId;
        this.addElement = addElement;
        this.removeElement = removeElement;
        this.clearElements = clearElements;
        this.setWarningMessage = setWarningMessage;
        this.clearWarnings = clearWarnings;
        this.triggerCallback = triggerCallback;
        this.changetdid = changetdid;
        this.updateHiddenData = updateHiddenData;
        this.killActionFields = killActionFields;
        this.resetActionFields = resetActionFields;
        this.removeDeleteButtons = removeDeleteButtons;
        this.checkForId = checkForId;
        this.hide = hide;
        this.show = show;
        this.setFilter = setFilter;
        this.getFilter = getFilter;
        this.clearFilter = clearFilter;
        this.setRowFilter = setRowFilter;
        }
    }

    /* export class */
    window.JsSortableTable = JsSortableTable;

})(jQuery);
