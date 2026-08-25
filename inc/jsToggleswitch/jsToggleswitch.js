/*

jsToggleSwitch v2.02

Usage:

	let tsOptions = {
		width: 220,
		height: 54,
		background:'images/togglebackgr.png',
		callback: function (sender, val) {
			alert(sender + ': ' + val);
		}

	let toggler = new toggleswitch('toggleDiv', 'switch1', tsOptions, true);

Options:
	width	 		=> 		width of the toggle switch container
	height			=>		height of the toggle switch container
	parent			=>		id of the parent or parent as jQuery object for the toggle switch
	id				=>		id for the switch
	checked			=>		true or false: toggle the switch to checked position on startup?
	background		=>		background image for the switch, the width of the background image needs switch width * 1.5 (for example 330px when with is set to 220)
	callback		=>		callback

Dependencies:

	jQueryUI

*/

"use strict";
(function($) {

	function jsToggleswitch(parent, id, options, checked) {
		if (typeof (parent) == 'string') {
			parent = $('#' + parent);
		}
		const w = options.width;
		const h = options.height;
		const background = options.background;
		const callback = options.callback || null;
		const changeCallback = options.changeCallback || null;
		checked = checked || options.checked || false;
		const undoCallback = options.undoCallback || null;
		const redoCallback = options.redoCallback || null;
		const redoClearCallback = options.redoClearCallback || null;
		let dataId = options.dataId || '';
		let readOnly = options.readOnly || false;

		parent.append(`<div id="${id}" class="jstsContainer" style="width: ${w + 'px'}; height: ${h + 'px'};"></div>`);
		// const element = $('#' + id); // updating definition to handle special CSS chars which jquery requires to be escaped
		const element = $('#' + id.replace(/([:.\[\],=@])/g, "\\$1"));
		element.append(`<div class="jstsBackground" style="background-image:url(${background})"></div>`);
		const backgroundDiv = element.find('.jstsBackground');
		element.append('<div class="jstsHandle"></div>');
		const handle = element.find('.jstsHandle');

		let skipUndo = false;
		let undoList = [];
		let redoList = [];
		let oldValue = checked;
		let originalValue = checked;
		let dirty = false;
		const self = this;

		element.on('click', clicked);

		handle.draggable({
			containment: "parent",
			drag: function(event, ui) {
				ui.helper.parent().find(".jstsBackground").css({ marginLeft: ui.position.left });
			},
			stop: function(event, ui) {
				if (ui.position.left > w / 4) {
					animateSwitch(true);
				} else {
					animateSwitch(false);
				}
			}
		});

		if (checked) {
			setSwitch(true);
		}

		if (readOnly) {
			lock();
		}

		/* private methods */

		function registerUndo() {
			undoList.push(oldValue);
			if (undoCallback) {
				undoCallback.call(self, id, undoList.length);
			}
		}

		function registerRedo(v) {
			redoList.push(v);
			if (redoCallback) {
				redoCallback.call(self, id, redoList.length);
			}
		}

		function clicked(e) {
			e.stopImmediatePropagation();
			if (readOnly) return;
			if (element.hasClass("selected")) {
				animateSwitch(false);
			} else {
				animateSwitch(true);
			}
		}

		/* public methods */

		function undo() {
			if (undoList.length === 0) return false;
			registerRedo(checked);
			oldValue = checked = undoList.pop();
			skipUndo = true;
			animateSwitch(checked);
			skipUndo = false;
			return true;
		}

		function redo() {
			if (redoList.length === 0) return false;
			registerUndo();
			oldValue = checked = redoList.pop();
			skipUndo = true;
			animateSwitch(checked);
			skipUndo = false;
			return true;
		}

		function clearUndoList() {
			undoList = [];
		}

		function clearRedoList() {
			redoList = [];
		}

		function reset(c) {
			//resets field and optionally set it to the state c
			undoList = [];
			redoList = [];
			oldValue = checked = originalValue = c || false;
			setSwitch(checked);
			dirty = false;
		}

		function setDataId(newDataId) {
			dataId = newDataId;
		}

		function getDataId() {
			return dataId;
		}

		function lock() {
			readOnly = true;
			element.addClass('locked');
			handle.draggable('disable');
		}

		function unlock() {
			readOnly = false;
			element.removeClass('locked');
			handle.draggable('enable');
		}

		function activate() {
			element.trigger('click');
		}

		function setSwitch(val) {
			if (val) {
				handle.css('left', '50%');
				backgroundDiv.css('marginLeft', '50%');
				element.addClass("selected");
			} else {
				handle.css('left', '0%');
				backgroundDiv.css('marginLeft', '0%');
				element.removeClass("selected");
			}
		}

		function animateSwitch(val, ignoreCallback) {
			let updated = false;
			if (val) {
				handle.animate({
					left: '50%'
				}, 200);
				backgroundDiv.animate({
					marginLeft: '50%'
				}, 200);
				if (element.hasClass("selected")) {
					return;
				}
				element.addClass("selected");
				updated = true;
				if (callback && !ignoreCallback) callback.call(this, id, val);
			} else {
				handle.animate({
					left: '0%'
				}, 200);

				backgroundDiv.animate({
					marginLeft: '0%'
				}, 200);
				if (element.hasClass("selected")) {
					element.removeClass("selected");
					updated = true;
					if (callback && !ignoreCallback) callback.call(this, id, val);
				}
			}
			if (updated) {
				checked = val;
				if (checked === originalValue) {
					dirty = false;
				} else {
					dirty = true;
				}
				if (!skipUndo) {
					if (redoClearCallback) {
						//let the redo dispatcher know that all registered elements must be told to clear their redo list, as a new change has been done
						redoClearCallback(self, id);
					}
					if (undoList.length === 0 || undoList[undoList.length - 1] !== oldValue) {
						registerUndo();
					}
				}
				oldValue = checked;
				if (changeCallback && !ignoreCallback) {
					changeCallback.call(self, id, checked, dirty, dataId);
				}
			}

		}

		function triggerCallBack() {
			changeCallback.call(self, id, checked, dirty, dataId);
		}

		/*exporting methods */
		this.setSwitch = setSwitch;
		this.animateSwitch = animateSwitch;
		this.activate = activate;
		this.lock = lock;
		this.unlock = unlock;
		this.undo = undo;
		this.redo = redo;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.clearUndoList = clearUndoList;
		this.clearRedoList = clearRedoList;
		this.triggerCallBack = triggerCallBack;
		this.reset = reset;

	}

	window.jsToggleswitch = jsToggleswitch;

})(jQuery);