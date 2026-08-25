/*

jsNumberInput v2.0.1
(c) 2014 - 2024 by Willibrord Koch & Eric J. Francois

DESCRIPTION:
jsNumberInput modifies and enhances the original HTML input field. The user is only able to use 
numbers with this input field and there is a up/down navigation. 
--------------------------------------------------------------------------------------------------------------
VERSIONS:
--------------------------------------------------------------------------------------------------------------
v1.0		Initial version
v1.1		replaced graphics by svg, fixed undo
v1.12		graphic updates, send back value as integer instead of string
v1.13		added parameter to reset function to change initialValue (e.g. after loading data from database)
v1.14		added activate method
v1.15		added range and step parameter as well as decimal support
v1.16		changed behaviour of getValue to actually return the value
v1.17       keyboard input check added (check for valid chars & if input is in allowed range)
v1.18		added mouse hold-down for the up and down buttons
v1.19		methods valueUp & valueDown added for keyboard navigation (keyup/keydown)
v1.20		modified keyboard input check behaviour
v1.21		option added to disable interval
v2.0        stripped down features to allow proper manual input, removed min/max error messages (range), undo/redo etc.
--------------------------------------------------------------------------------------------------------------
USAGE:
include the CSS and the JS file in your HTML document
instantiate with:
new jsNumberInput(id, options)

PARAMETERS:
id - id for the new element
options - an object with the following options:
onChange:			callback function when value changes
					(p1:array of current values,p2:dataId)
height:				height in pixels of the main input field (without navigation)
width:				height in pixels of the main input field (without navigation)
initialValue:		number which will be shown before the users makes any change
dataId:				id of the main input field
			        also first part of nav-Ids
max-length:		    maximum number of digits
readOnly:			boolean that defines if the elements can be modified

METHODS:
getValue()
returns the current value

reset(newVal)
resets the initialValue to newVal, or if no parameter is given, simply resets to whatever initialValue is

lock()
sets list to read only mode

unlock()
removes read only mode

getDataId()
fetches the dataId for this group

reset()
resets input field to the inital state

setValue()
sets a new value to the input field

getCurrentValue()
returns the current value

*/

"use strict";

(function ($) {

    function jsNumberInput(parent, id, options) {

        /* mandatory settings */
        if (typeof (parent) === 'string') {
            parent = $('#' + parent);
        }

        /* optional settings */
        if (!options) options = {};
        const changeCallback = options.onChange || null;
        let width = 50;
        if (typeof (options.width) === 'string') {
            width = parseInt(options.width);
        } else if (typeof (options.width) === 'number') {
            width = options.width;
        }
        let fontSize = 'default';
        if (typeof (options.fontSize) === 'string') {
            fontSize = options.fontSize;
        } else if (typeof (options.fontSize) === 'number') {
            fontSize = options.fontSize + 'px';
        }
        let height = 0;
        if (typeof (options.width) === 'string') {
            height = parseInt(options.height);
        } else if (typeof (options.height) === 'number') {
            height = options.height;
        }
        let initialValue = 0;
        if (typeof (options.initialValue) === 'string') {
            initialValue = parseFloat(options.initialValue);
        } else if (typeof (options.initialValue) === 'number') {
            initialValue = options.initialValue;
        }
        let readOnly = options.readOnly || false;
        const dataId = options.dataId;
        const range = options.range || null;
        const disableInterval = options.disableInterval || false;
        let min = null;
        let max = null;
        if (range) {
            const matches = range.match(/^([-+]?\d*)\.{2}([-+]?\d*)/);
            if (matches[1]) min = parseFloat(matches[1]);
            if (matches[2]) max = parseFloat(matches[2]);
        }
        let step = 1;
        if (typeof (options.step) === 'string') {
            step = parseInt(options.step);
        } else if (typeof (options.step) === 'number') {
            step = options.step;
        }
        const self = this;

        /* creation */
        parent.append(`<div class="jsNumberInputWrapper" id="${id}_wrapper"><input class="jsNumberInput" type="text" id="${id}" style="font-size: ${fontSize}"><div class="jsNumberInputControls"><div class="jsNumberInputNavUp" id="${id}_up"></div><div class="jsNumberInputNavDown" id="${id}_down"></div></div></div>`);
        const element = $('#' + id + '_wrapper');
        const numberInput = $('#' + id);
        const navUp = $('#' + id + '_up');
        const navDown = $('#' + id + '_down');
        numberInput.width(width);
        let h;
        if (height > 0) {
            h = height;
            numberInput.css('height', height + 'px');
        } else {
            h = numberInput.outerHeight();
        }
        let navUpH = Math.floor(h / 2);
        const navDownH = Math.floor(h / 2);
        const navW = 2 * navUpH;
        if (navUpH + navDownH < h) {
            navUpH++;
        }
        navUp.css({
            width: navW + 'px',
            height: navUpH + 'px'
        });
        navDown.css({
            width: navW + 'px',
            height: navDownH + 'px'
        });
        navUp.html('<svg class="jsNumberInputUpArrow" width="24" height="12" viewBox="0 0 24 12" xmlns="http://www.w3.org/2000/svg"><path id="svg_1" fill="#ffffff" d="m11.992,0.111467l-11.992,11.992001l23.983999,0l-11.992,-11.992001z"/></svg>');
        navDown.html('<svg class="jsNumberInputDownArrow" width="24" height="12" viewBox="0 0 24 12" xmlns="http://www.w3.org/2000/svg"><path transform="rotate(180 11.991999626159668,5.897274017333984) " stroke="null" id="svg_1" fill="#ffffff" d="m11.992,-0.098725l-11.992,11.992l23.983999,0l-11.992,-11.992z"/></svg>');
        ///check for invalid chars & allowed range
        numberInput.on('keyup', function (event) {
            event.stopPropagation();
            if (event.key === 'Enter') {
                numberInput.trigger("blur");
                event.preventDefault();
            }
            let enteredValue = numberInput.val();
            enteredValue = enteredValue.replace(/[^\d-]/ig, function (str) {
                    if (!$('#veil_Message').length) showMessage('You typed: ' + str + ' \n\n<br />Please use only numbers 0-9!');
                    return '';
                });
            enteredValue = enteredValue.replace(/(?!^)-/g, '');
            if (!range || min === null || min >= 0) {
                enteredValue = enteredValue.replace('-', '');
            }
            numberInput.val(enteredValue);
            if (enteredValue === '-' && range && min < 0) {
                sendValue();
                return;
            }
            if (range) {
                numberInput.removeClass('nInRed');
                if (numberInput.val() === '') {
                    numberInput.val(min);
                }
                if (max) if (numberInput.val() > max) {
                    numberInput.addClass('nInRed');
                }
                if (numberInput.val() < min) {
                    numberInput.addClass('nInRed');
                }
            } else {
                if (numberInput.val() === '') {
                    numberInput.val(1);
                }
            }
            sendValue();
        });

        let upInterval;

        navUp.on('mousedown', function (e) {
            chgStatus('up');
            if (!disableInterval) {
                clearInterval(upInterval);
                upInterval = false;
                upInterval = setInterval(function () {
                    chgStatus('up');
                }, 500);
            }
        });
        navUp.on('mouseup', function (e) {
            if (!disableInterval) {
                clearInterval(upInterval);
                upInterval = false;
            }
        });

        let downInterval;
        navDown.on('mousedown', function (e) {
            chgStatus('down');
            if (!disableInterval) {
                clearInterval(downInterval);
                downInterval = false;
                downInterval = setInterval(function () {
                    chgStatus('down');
                }, 500);
            }
        });
        navDown.on('mouseup', function (e) {
            if (!disableInterval) {
                clearInterval(downInterval);
                downInterval = false;
            }
        });

        numberInput.val(initialValue);

        if (readOnly === true) {
            lock();
        }


        /* private functions */
        function chgStatus(direction) {
            $('#' + id).removeClass('nInRed');
            if (readOnly) return;
            if (direction === 'up') {
                if (numberInput.val() === '') {
                    numberInput.val(0);
                } else if (range && parseFloat(numberInput.val()) + step > max) {
                    numberInput.val(max);
                } else {
                    numberInput.val(parseFloat(numberInput.val()) + step);
                }
                if(range){
                    if(parseFloat(numberInput.val()) > max || parseFloat(numberInput.val()) < min )$('#' + id).addClass('nInRed');
                }
            } else {
                let currentValue = parseFloat(numberInput.val());
                if (Number.isNaN(currentValue)) currentValue = 0;
                let nextValue = currentValue - step;
                if (range && min !== null) {
                    nextValue = Math.max(min, nextValue);
                } else {
                    nextValue = Math.max(0, nextValue);
                }
                numberInput.val(nextValue);
                if(range){
                    if(parseFloat(numberInput.val()) < min || parseFloat(numberInput.val()) > max)$('#' + id).addClass('nInRed');
                }
            }
            //onChange Handler aufrufen
            sendValue();
        }

        /* public methods */
        function lock() {
            //enables read-only modus
            readOnly = true;
            element.addClass('readOnly');
            numberInput.attr('disabled', 'disabled');
        }

        function unlock() {
            //disables read-only modus
            //recover images and text, activate clicks and change mouse pointer
            readOnly = false;
            element.removeClass('readOnly');
            numberInput.removeAttr('disabled');
        }

        function getDataId() {
            //returns the dataId of the group
            return dataId;
        }

        function sendValue() {
            if (changeCallback) changeCallback.call(self, id, parseFloat(numberInput.val()), dataId);
        }

        function getValue() {
            return parseFloat(numberInput.val());
        }

        function reset(newVal) {
            if (typeof (newVal) !== 'undefined' && newVal !== null) {
                initialValue = newVal;
            }
            numberInput.val(parseFloat(initialValue));
            $('#' + id).removeClass('nInRed');
            sendValue();
        }

        function getCurrentValue() {
            return parseFloat(numberInput.val());
        }

        function setValue(newValue) {
            numberInput.val(parseFloat(newValue));
        }

        function activate() {
            numberInput.trigger("focus");
        }

        function valueUp() {
            chgStatus('up');
        }

        function valueDown() {
            chgStatus('down');
        }

        /* export methods */
        this.lock = lock;
        this.unlock = unlock;
        this.getDataId = getDataId;
        this.getValue = getValue;
        this.setValue = setValue;
        this.getCurrentValue = getCurrentValue;
        this.reset = reset;
        this.activate = activate;
        this.valueUp = valueUp;
        this.valueDown = valueDown;

    }

    /* export class */
    window.jsNumberInput = jsNumberInput;

})(jQuery);
