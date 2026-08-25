"use strict";
/*
 * jsModalWait 1.40
 * show a modal dialog while the script is working with a spinning image
 * the constructor takes one parameter: the text to be shown below the spinning image
 *
 * there is a counter to see how many times the show command has been executed, and the dialog will only hide after the same amount of hide commands
 *
 * usage:
 * let waitDialog = new jsModalWait('please wait ...');
 * waitDialog.show(sender);
 * waitDialog.hide(sender);
 * waitDialog.busy(); will return true if spinner is visible
 * waitDialog.debug(true); switches on debug mode where every show and hide command is written to the console
 *
 * The sender variable is a string that defines which part of the code ordered the waitdialog to become active.
 * The same sender must be used for .show() and for .hide() respectively. Or it can be omitted and will then be replaced by the string 'self'.
 *
 * If the sender on hide is '*', all senders will be reset and the dialog will be hidden. Convenient to hide the dialog when an error occurs.
 *
 * The options parameter can include:
 * 		ignoreList: an array of sender strings that should be ignored when the dialog is shown or hidden. They are still counted, but the dialog will not be shown or hidden for them.
 */

(function ($) {

	function jsModalWait(msg, db = false, options = {}) {
		this.msg = msg;
		this.defaultMsg = msg;
		$('body').prepend('<div id="jsmw_cloak"><div id="jsmw_dialog"><div><img id="jsmw_spinner" alt="*" src="data:image/png;base64,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"></div><div id="jsmw_message"></div></div></div>');
		$('#jsmw_cloak').hide();
		$('#jsmw_message').html(msg);
		$('#jsmw_cloak').css('position', 'fixed');
		$('#jsmw_cloak').css('left', '0px');
		$('#jsmw_cloak').css('right', '0px');
		$('#jsmw_cloak').css('top', '0px');
		$('#jsmw_cloak').css('bottom', '0px');
		$('#jsmw_cloak').css('z-index', options['z-index'] || 200);
		$('#jsmw_cloak').css('background-color', 'rgba(255, 255, 255, 0.0)');
		$('#jsmw_dialog').css('position', 'relative');
		$('#jsmw_dialog').css('box-sizing', 'content-box');
		$('#jsmw_dialog').css('margin', '300px auto 0px auto');
		$('#jsmw_dialog').css('width', 'fit-content');
		$('#jsmw_dialog').css('min-width', '300px');
		$('#jsmw_dialog').css('background-color', 'rgba(0, 0, 0, 0.75)');
		$('#jsmw_dialog').css('border-radius', '25px');
		$('#jsmw_dialog').css('color', 'white');
		$('#jsmw_dialog').css('text-align', 'center');
		$('#jsmw_dialog').css('padding', '30px');
		$('#jsmw_dialog').css('font', 'bold 20px "Lucida Grande", Lucida, Verdana, sans-serif');
		$('#jsmw_message').css('margin-top', '10px');
		let timer = null;
		let angle = 0;
		let counter = 0;
		let senderList = {self: 0};
		let jsmwDebug = !!db || false;
		let ignoreList = [];
		const self = this;
		if (options.ignoreList && Array.isArray(options.ignoreList)) {
			ignoreList = options.ignoreList;
		}

		function updateMessage(newMsg, values = {}) {
			self.msg = newMsg;
			if (Object.keys(values).length > 0) {
				updateValues(values);
			} else {
				$('#jsmw_message').html(self.msg);
			}
		}

		function updateValues(values = {}) {
			//replace placeholders in the message with values from the values object
			let updatedMsg = self.msg;
			for (const key in values) {
				const placeholder = '{' + key + '}';
				updatedMsg = updatedMsg.replace(new RegExp(placeholder, 'g'), values[key]);
			}
			$('#jsmw_message').html(updatedMsg);
		}

		function show(sender) {
			if (!sender || sender === '*') {
				sender = 'self';
			}
			if (!senderList[sender]) {
				senderList[sender] = 0;
			}
			senderList[sender]++;
			counter++;
			if (ignoreList.includes(sender)) {
				if (jsmwDebug) console.trace("jsModalWait show ignored by: " + sender + " (count: " + counter + ")");
				return;
			}
			$('#jsmw_cloak').show();
			if (timer === null) {
				timer = setInterval(rotateSpinner, 50);
			}
			if (jsmwDebug) console.trace("jsModalWait shown by: " + sender + " (count: " + counter + ")");
		}

		function rotateSpinner() {
			const spin = $('#jsmw_spinner');
			angle = (angle + 10) % 360;
			const rotationString = 'rotate(' + angle + 'deg)';
			spin.css('transform', rotationString);
		}

		function hide(sender) {
			if (!sender) {
				sender = 'self';
			}
			if (sender === '*') {
				senderList = {};
				counter = 0;
				hideAndStopAnimation();
			} else {
				if (typeof (senderList[sender]) === 'undefined') {
					return;
				}
				if (--senderList[sender] < 0) {
					senderList[sender] = 0;
					counter++; //fix main counter for this error
				}
				if (--counter === 0) {
					if (sender in ignoreList) {
						// If the sender is in the ignore list, we do not hide the dialog
						if (jsmwDebug) console.trace("jsModalWait hide ignored by: " + sender + " (count: " + counter + ")");
						return;
					}
					// If the counter reaches zero, we hide the dialog}
					hideAndStopAnimation();
				}
			}
			if (jsmwDebug) console.trace("jsModalWait hidden by: " + sender + " (count: " + counter + ")");
		}

		function hideAndStopAnimation() {
			$('#jsmw_cloak').hide();
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
			resetMessage();
		}

		function reset() {
			senderList = {};
			counter = 0;
			$('#jsmw_cloak').hide();
			clearInterval(timer);
			timer = null;
			resetMessage();
		}

		function resetMessage() {
			self.msg = self.defaultMsg;
			$('#jsmw_message').html(self.msg);
		}

		function busy() {
			return counter > 0;
		}

		function debug(db) {
			jsmwDebug = db;
		}

		this.updateMessage = updateMessage;
		this.updateValues = updateValues;
		this.show = show;
		this.hide = hide;
		this.reset = reset;
		this.resetMessage = resetMessage;
		this.busy = busy;
		this.debug = debug;

	}

	window.jsModalWait = jsModalWait;

})(jQuery);