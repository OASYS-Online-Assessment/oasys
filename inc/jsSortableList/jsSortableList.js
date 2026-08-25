/*

 jsSortableList v1.1
 (c) 2018 / 2023 by Willibrord Koch
 -------------------------------------------------------------------------------------------------------------------

 DESCRIPTION:
 This class helps you to create a sortable area with custom HTML content and data tracking.
 -------------------------------------------------------------------------------------------------------------------
 VERSIONS:
 -------------------------------------------------------------------------------------------------------------------
 v1.0					Initial version for frontend EpStan Dashboard
 v1.1                   Code cleanup
 --------------------------------------------------------------------------------------------------------------------
 USAGE:
 instantiate with:
 new jsSortableList(parent, id, options)

 PARAMETERS:
 parent - parent element for the new sortable list
 id - id for the new list
 options - an object with the following options:
 onChange:			        callback function when value changes
 handle:                    html class for handle (drag) objects

 METHODS:
 addElement(dataObject, html)
 to add a new element to the list

 removeElement(id)
 to remove an element, send the li ID

 clearElements()
 to delete all elements

 triggerCallback()
 trigger a callback to ask for the current data object

 changeElement(is, dataObject, html)
 to change the data & content of an element

 getNextId()
 returns the ID of the block which will be added next

 getBlockCount()
 returns the number of blocks in the list

 */

"use strict";

(function ($) {

    function jsSortableList(parent, id, options) {

        /* optional settings */
        if (!options) options = {};
        const changeCallback = options.onChange || null;
        let hiddenData = {};
        const handle = options.handle || '';

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

        function ObjectLength( object ) {
            let length = 0;
            for(let key in object ) {
                if( object.hasOwnProperty(key) ) {
                    ++length;
                }
            }
            return length;
        }

        //build List
        const sList = 'sortableList_' + id;
        $('#' + parent).append('<ul style= "list-style: none;padding-left:0;" id="' + sList + '"></ul>');

        //make it sortable
        if(handle!==''){
            $('#' + sList).sortable({
                helper: correctHelper,
                cursor: "move",
                axis: "y",
                handle: '.'+handle,
                cancel: '',
                forcePlaceholderSize: true,
                start: function (e, ui) {
                    ui.placeholder.height(ui.item.height());
                    ui.helper.find( ".dr-chart-container" ).toggleClass('dr-slist-moving');
                },
                stop: function (e, ui) {
                    ui.helper.find( ".dr-chart-container" ).toggleClass('dr-slist-moving');
                }
            }).disableSelection();
        } else {
            $('#' + sList).sortable({
                helper: correctHelper,
                cursor: "move",
                axis: "y",
                forcePlaceholderSize: true,
                start: function (e, ui) {
                    ui.placeholder.height(ui.item.height());
                    ui.helper.find( ".dr-chart-container" ).toggleClass('dr-slist-moving');
                },
                stop: function (e, ui) {
                    ui.helper.find( ".dr-chart-container" ).toggleClass('dr-slist-moving');
                }
            }).disableSelection();
        }

        /* private functions */
        function createChangeCallback() {

            const callbackData = [];
            const listItems = $('#' + sList + " li");
            listItems.each(function(idx, li) {
                callbackData.push(hiddenData[li.id]);
            });
            changeCallback.call(this, callbackData, id);
        }

        /* public methods */
        function addElement(dataObject, customHTML) {
            const objLength = ObjectLength(hiddenData);
            hiddenData[id+'_'+(objLength+1)]=dataObject;
            $('#' + sList).append('<li id="'+id+'_'+(objLength+1)+'">' + customHTML + '</li>');
        }

        function removeElement(toRemove) {
            $('#' + toRemove).remove();
            hiddenData[toRemove]={};

        }

        function changeElement(toChange, dataObject, content){
            $('#' + toChange).html(content);
            hiddenData[toChange]=dataObject;
        }

        function clearElements() {
            $('#' + sList).empty();
            hiddenData={};
        }

        function triggerCallback() {
            createChangeCallback();
        }

        function getNextId() {
            const objLength = ObjectLength(hiddenData);
            return id+'_'+(objLength+1);
        }

        function getBlockCount(){
            return ($('#' + sList+" li").length);

        }

        /* export methods */
        this.addElement = addElement;
        this.removeElement = removeElement;
        this.clearElements = clearElements;
        this.changeElement = changeElement;
        this.triggerCallback = triggerCallback;
        this.getNextId = getNextId;
        this.getBlockCount = getBlockCount;

    }

    /* export class */
    window.jsSortableList = jsSortableList;

})(jQuery);
