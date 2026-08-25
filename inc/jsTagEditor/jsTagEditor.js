/*
 jsTagEditor v1.1
 Copyright 2026 University of Luxembourg
 Author: Willibrord Koch

 Lightweight key/value tag editor for OASYS.

 Version history:
 v1.1   Matched row deletion to jsSortableTable's hover delete action.
 v1.0   Initial reusable tag editor class with compact styling, edit/delete
        dialogs, empty state, lock state, and OASYS meta tag row export.
*/

class JsTagEditor {
    constructor(containerId, options) {
        this.containerId = containerId;
        this.$container = $('#' + containerId);
        this.options = $.extend({
            onChange: null,
            keyName: 'metakey',
            valueName: 'metavalue',
            hiddenIdName: 'hiddenID',
            emptyText: UILANG.m('No meta tags defined.'),
            keyLabel: UILANG.m('Meta-key (e.g. "Class"):'),
            valueLabel: UILANG.m('Meta-value (e.g. "9a"):'),
            title: UILANG.m('Edit meta tag'),
            inputClass: '',
            dialogId: 'editTagDialog',
            width: 620,
            allowSingleTags: true,
            suggestions: {keys: [], values: {}, singleTags: []}
        }, options || {});
        this.items = {};
        this.locked = false;
        this.render();
    }

    static escape(value) {
        if (value === null || typeof value === 'undefined') return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    static escapeAttribute(value) {
        return JsTagEditor.escape(value).replace(/`/g, '&#096;');
    }

    setItems(items, silent) {
        this.items = $.extend({}, items || {});
        this.render();
        if (!silent) this.notify();
    }

    setSuggestions(suggestions) {
        this.options.suggestions = $.extend({keys: [], values: {}, singleTags: []}, suggestions || {});
    }

    clearElements(silent) {
        this.items = {};
        this.render();
        if (!silent) this.notify();
    }

    addElement(item, silent) {
        if (item && item[this.options.keyName]) {
            this.items[item[this.options.keyName]] = item[this.options.valueName];
        }
        this.render();
        if (!silent) this.notify();
    }

    getRows() {
        return Object.keys(this.items).sort(JsTagEditor.sortKeys).map(key => {
            const row = {};
            row[this.options.keyName] = key;
            row[this.options.valueName] = this.items[key];
            row[this.options.hiddenIdName] = key;
            return row;
        });
    }

    lock() {
        this.locked = true;
        this.render();
    }

    unlock() {
        this.locked = false;
        this.render();
    }

    notify() {
        if (typeof this.options.onChange === 'function') {
            this.options.onChange(false, null, this.getRows());
        }
    }

    render() {
        const keys = Object.keys(this.items).sort(JsTagEditor.sortKeys);
        this.$container.empty().addClass('jsTagEditor');

        if (keys.length === 0) {
            this.$container.append('<div class="jsTagEditorEmpty">' + JsTagEditor.escape(this.options.emptyText) + '</div>');
        } else {
            const $list = $('<div class="jsTagEditorList"></div>');
            keys.forEach(key => {
                const $row = $('<div class="jsTagEditorRow"></div>');
                const value = this.items[key];
                const isSingleTag = value === '' || value === null || typeof value === 'undefined';
                $('<div class="jsTagEditorPair"></div>')
                    .append('<span>' + JsTagEditor.escape(key) + '</span>')
                    .append(isSingleTag ? '<strong class="jsTagEditorSingle">' + UILANG.m('single tag') + '</strong>' : '<strong>' + JsTagEditor.escape(value) + '</strong>')
                    .appendTo($row);

                const disabled = this.locked ? ' disabled' : '';
                $('<div class="jsTagEditorActions"></div>')
                    .append('<button type="button" class="jsTagEditorEdit"' + disabled + '>' + UILANG.m('Edit') + '</button>')
                    .append('<button type="button" class="jsTagEditorDelete"' + disabled + ' title="' + UILANG.m('Delete') + '" aria-label="' + UILANG.m('Delete') + '"></button>')
                    .appendTo($row);

                $row.find('.jsTagEditorEdit').on('click', () => this.openDialog(key));
                $row.find('.jsTagEditorDelete').on('click', () => {
                    delete this.items[key];
                    this.render();
                    this.notify();
                });
                $list.append($row);
            });
            this.$container.append($list);
        }

        this.$container.toggleClass('is-locked', this.locked);
    }

    static sortKeys(a, b) {
        return String(a).localeCompare(String(b), undefined, {sensitivity: 'base'});
    }

    openDialog(key, defaultMode) {
        if (this.locked) return;

        const currentValue = this.items[key] || '';
        const currentMode = defaultMode || (currentValue === '' && key !== '' && this.options.allowSingleTags ? 'single' : 'pair');
        const inputClass = this.options.inputClass ? ' class="' + JsTagEditor.escape(this.options.inputClass) + '"' : '';
        const dialogKey = String(Math.floor(Math.random() * 1000000));
        const modeName = 'jsTagEditorMode_' + dialogKey;
        const singleSentinel = '__jsTagEditorSingle__';
        const dialogData = {
            buttons: [{
                label: UILANG.m('cancel'), 'cancel': true, value: 'cancel'
            }, {
                label: UILANG.m('OK'), 'default': true, value: 'ok'
            }],
            datafields: ['dialogField1', 'dialogField2'],
            mandatory: ['dialogField1', 'dialogField2'],
            focus: 'dialogField1',
            contents: '<div class="jsTagEditorDialog">' +
                (this.options.allowSingleTags ? '<div class="jsTagEditorModeSwitch"><label><input type="radio" name="' + modeName + '" value="pair"' + (currentMode === 'pair' ? ' checked' : '') + '> ' + UILANG.m('Key/value tag') + '</label>' +
                    '<label><input type="radio" name="' + modeName + '" value="single"' + (currentMode === 'single' ? ' checked' : '') + '> ' + UILANG.m('Single tag') + '</label></div>' : '') +
                '<div class="jsTagEditorFields">' +
                '<div class="jsTagEditorField"><label class="jsTagEditorFieldLabel" for="dialogField1">' + JsTagEditor.escape(this.options.keyLabel) + '</label>' +
                '<div class="jsTagEditorAutocompleteWrap"><input' + inputClass + ' type="text" maxlength="200" id="dialogField1" autocomplete="off" value="' + JsTagEditor.escape(key) + '"><div id="jsTagEditorKeySuggestions_' + dialogKey + '" class="jsTagEditorAutocomplete"></div></div></div>' +
                '<div id="jsTagEditorValueLabel_' + dialogKey + '" class="jsTagEditorField jsTagEditorValueBlock">' +
                '<label class="jsTagEditorFieldLabel" for="dialogField2">' + JsTagEditor.escape(this.options.valueLabel) + '</label>' +
                '<div class="jsTagEditorAutocompleteWrap"><input' + inputClass + ' type="text" id="dialogField2" maxlength="200" autocomplete="off" value="' + JsTagEditor.escape(currentMode === 'single' ? singleSentinel : currentValue) + '"><div id="jsTagEditorValueSuggestions_' + dialogKey + '" class="jsTagEditorAutocomplete"></div></div></div></div>' +
                '</div>',
            title: this.options.title,
            width: this.options.width,
            callback: (button, newKey, newValue) => {
                if (button !== 'ok') return;
                const mode = $('input[name="' + modeName + '"]:checked').val() || 'pair';
                newKey = $.trim(newKey || '');
                newValue = mode === 'single' ? '' : $.trim(newValue || '');
                if (newKey === '') return;
                if (mode === 'pair' && newValue === '') return;
                const applyTagChange = () => {
                    if (newKey !== key) delete this.items[key];
                    this.items[newKey] = newValue;
                    this.render();
                    this.notify();
                };
                if (newKey !== key && Object.prototype.hasOwnProperty.call(this.items, newKey)) {
                    window.setTimeout(() => {
                        new nxDialog('overwriteTagDialog', {
                            buttons: [{
                                label: UILANG.m('No'),
                                cancel: true,
                                value: 'no'
                            }, {
                                label: UILANG.m('Yes'),
                                default: true,
                                value: 'yes'
                            }],
                            contents: '<p>' + UILANG.m('A meta tag with this key already exists.') + '<br>' +
                                UILANG.m('Do you want to overwrite it?') + '</p>',
                            title: UILANG.m('Meta tag exists'),
                            width: 400,
                            callback: confirmButton => {
                                if (confirmButton === 'yes') applyTagChange();
                            }
                        });
                    }, 0);
                    return;
                }
                applyTagChange();
            }
        };
        new nxDialog(this.options.dialogId, dialogData);
        $('#' + this.options.dialogId + ' .nxDialogBody').addClass('jsTagEditorDialogBody');
        const $dialog = $('#' + this.options.dialogId + ' .jsTagEditorDialog');
        const $keyField = $('#dialogField1');
        const $valueField = $('#dialogField2');
        const refreshMode = () => {
            const mode = $('input[name="' + modeName + '"]:checked').val() || 'pair';
            $('#jsTagEditorValueLabel_' + dialogKey).toggle(mode !== 'single');
            $dialog.toggleClass('is-single-mode', mode === 'single');
            if (mode === 'single') {
                if ($valueField.val() === '') $valueField.val(singleSentinel).trigger('input');
            } else if ($valueField.val() === singleSentinel) {
                $valueField.val('').trigger('input');
            }
        };
        $('input[name="' + modeName + '"]').on('change', refreshMode);
        this.attachAutocomplete($keyField, $('#jsTagEditorKeySuggestions_' + dialogKey), () => {
            const mode = $('input[name="' + modeName + '"]:checked').val() || 'pair';
            return mode === 'single' ? 'single' : 'key';
        }, refreshMode);
        this.attachAutocomplete($valueField, $('#jsTagEditorValueSuggestions_' + dialogKey), () => 'value', refreshMode);
        refreshMode();
    }

    openNewDialog() {
        this.openDialog('', 'pair');
    }

    getSuggestionValues(type) {
        const suggestions = this.options.suggestions || {};
        if (type === 'single') {
            return Array.isArray(suggestions.singleTags) ? suggestions.singleTags : [];
        }
        if (type === 'key') {
            const singleTags = {};
            if (Array.isArray(suggestions.singleTags)) {
                suggestions.singleTags.forEach(value => {
                    singleTags[value] = true;
                });
            }
            return (Array.isArray(suggestions.keys) ? suggestions.keys : []).filter(key => {
                const keyValues = suggestions.values && Array.isArray(suggestions.values[key]) ? suggestions.values[key] : [];
                return !singleTags[key] || keyValues.some(value => value !== '' && value !== null && typeof value !== 'undefined');
            });
        }
        const valueSet = {};
        if (suggestions.values && typeof suggestions.values === 'object') {
            Object.keys(suggestions.values).forEach(key => {
                const keyValues = Array.isArray(suggestions.values[key]) ? suggestions.values[key] : [];
                keyValues.forEach(value => {
                    if (value !== '' && value !== null && typeof value !== 'undefined') valueSet[value] = true;
                });
            });
        }
        return Object.keys(valueSet).sort();
    }

    attachAutocomplete($input, $menu, typeResolver, afterSelect) {
        const $wrap = $menu.closest('.jsTagEditorAutocompleteWrap');
        const hideMenu = () => {
            $menu.hide().empty();
            $wrap.removeClass('is-autocomplete-open is-above');
        };
        const placeMenu = () => {
            $wrap.removeClass('is-above');
            const inputNode = $input[0];
            const dialogNode = $input.closest('.nxDialog')[0];
            if (!inputNode || !dialogNode) return;

            const inputRect = inputNode.getBoundingClientRect();
            const dialogRect = dialogNode.getBoundingClientRect();
            const buttonNode = $input.closest('.nxDialog').find('.nxDialogButtons')[0];
            const lowerLimit = buttonNode ? buttonNode.getBoundingClientRect().top - 12 : dialogRect.bottom - 12;
            const upperLimit = dialogRect.top + 70;
            const menuHeight = Math.min($menu.prop('scrollHeight') || 0, 150);
            const belowSpace = lowerLimit - inputRect.bottom - 8;
            const aboveSpace = inputRect.top - upperLimit - 8;

            if (belowSpace < menuHeight && aboveSpace > belowSpace) {
                $wrap.addClass('is-above');
            }
        };
        const render = () => {
            const term = $.trim($input.val() || '').toLowerCase();
            if (term === '') {
                hideMenu();
                return;
            }
            const values = this.getSuggestionValues(typeResolver())
                .filter(value => String(value).toLowerCase().startsWith(term))
                .slice(0, 30);
            if (values.length === 0) {
                hideMenu();
                return;
            }
            $menu.html(values.map(value => '<button type="button" data-value="' + JsTagEditor.escapeAttribute(value) + '">' + JsTagEditor.escape(value) + '</button>').join('')).show();
            $wrap.addClass('is-autocomplete-open');
            placeMenu();
        };
        $input.on('input focus', render);
        $input.on('blur', () => window.setTimeout(hideMenu, 120));
        $menu.on('mousedown', 'button', event => {
            event.preventDefault();
            $input.val($(event.currentTarget).data('value')).trigger('input').trigger('keyup').trigger('change');
            hideMenu();
            if (typeof afterSelect === 'function') afterSelect();
        });
    }
}

window.JsTagEditor = JsTagEditor;
