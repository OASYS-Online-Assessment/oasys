/*
 jsLink v1.0
 (c) 2016 by Willibrord Koch

 DESCRIPTION:
 Class to create customizable links (callback)

 --------------------------------------------------------------------------------------------------------------
 VERSIONS:
 --------------------------------------------------------------------------------------------------------------
 v1.0				Initial version, just basic functionality
 --------------------------------------------------------------------------------------------------------------
 USAGE:
 instantiate with:
 new jsLink(id, options);

 PARAMETERS:
 reset -> change link (description)

 */


"use strict";

(function ($) {

    function jsLink(parent, id, options) {

        let html;
        /* mandatory settings */
        if (typeof(parent) == 'string') {
            parent = $(parent);
        }
        let element;
        let self;
        let cpicker;
        /* optional settings */

        if (!options) options = {};
        let dataId = options.dataId || '';
        const cssStyles = options.cssStyles || null;
        const type = options.type || null;
        const color = options.color || null;
        const appendPickerTo = options.appendPickerTo || 'body';
        const dirty = false;

        let value = options.linkText || '';
        const clickCallback = options.onClick || null;


        /* creation */

        if (color) {
            html = `<div class='jsLinkDefStyles'><span id='${id}_jsLink' class='${id}_jsLinkColorInput'></span><input type='text' id='${id}_jsLinkColor' class='${id}_jsLinkColorInput' /></div>`;
            parent.append(html);
            $('#' + id + '_jsLinkColor').spectrum('destroy');
            $('.' + id + '_jsLinkColorContainer').remove();
           cpicker = $('#' + id + '_jsLinkColor').spectrum({
                color: "#FFF",
                showInput: true,
                showInitial: true,
                showPalette: false,
                showSelectionPalette: true,
                preferredFormat: "hex",
                containerClassName: id + '_jsLinkColorContainer',
                appendTo: appendPickerTo,
                hide: function (color) {
                    clickCallback.call(self, id, color.toHexString(), dirty, dataId, type);
                },
            });
            let element = $('#' + id + '_jsLink');
            element.html(value);
            if (cssStyles)element.css(cssStyles);
            element.on({
                click: function () {
                    cpicker.spectrum("show");
                }
            });
            self = this;


        } else {
            html = `<div id='${id}_jsLink' class='jsLinkDefStyles'></div>`;
            parent.append(html);
            element = $('#' + id + '_jsLink');
            element.html(value);
            if (cssStyles)element.css(cssStyles);
            element.on({click: onClick});
            self = this;
        }

        /* event handler */

        function onClick() {
            if (clickCallback) {
                clickCallback.call(self, id, value, dirty, dataId, type);
            }
        }
        /* public methods */

        function reset(v) {
            if (color) {
                element.html(v);
                cpicker.spectrum("set", v);
            } else {
                element.html(v);
            }
            value = v;
        }

        //export methods
        this.reset = reset;
    }

    //export class
    window.jsLink = jsLink;

})(jQuery);
