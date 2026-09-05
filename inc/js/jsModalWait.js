"use strict";
/*
 * jsModalWait 1.50
 * show a modal dialog while the script is working with a CSS spinner
 * the constructor takes one parameter: the text to be shown below the spinner
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
		$('body').prepend(
			'<div id="jsmw_cloak">' +
				'<div id="jsmw_dialog" role="status" aria-live="polite">' +
					'<div id="jsmw_spinner" aria-hidden="true"></div>' +
					'<div id="jsmw_message"></div>' +
				'</div>' +
			'</div>'
		);
		$('#jsmw_cloak').hide();
		$('#jsmw_message').html(msg);
		$('#jsmw_cloak').css('position', 'fixed');
		$('#jsmw_cloak').css('left', '0px');
		$('#jsmw_cloak').css('right', '0px');
		$('#jsmw_cloak').css('top', '0px');
		$('#jsmw_cloak').css('bottom', '0px');
		$('#jsmw_cloak').css('z-index', options['z-index'] || 200);
		$('#jsmw_cloak').css({
			'background-color': 'rgba(24, 47, 59, 0.18)'
		});
		$('#jsmw_dialog').css({
			'position': 'relative',
			'box-sizing': 'border-box',
			'margin': '300px auto 0',
			'width': 'fit-content',
			'min-width': '280px',
			'background': 'linear-gradient(145deg, rgba(248, 252, 255, 0.98), rgba(229, 242, 249, 0.98))',
			'border': '1px solid rgba(34, 125, 170, 0.28)',
			'border-radius': '16px',
			'box-shadow': '0 18px 48px rgba(24, 47, 59, 0.24)',
			'color': '#175978',
			'text-align': 'center',
			'padding': '28px 36px',
			'font': '600 18px "Open Sans", "Lucida Grande", Lucida, Verdana, sans-serif'
		});
		$('#jsmw_spinner').css({
			'box-sizing': 'border-box',
			'width': '38px',
			'height': '38px',
			'margin': '0 auto',
			'border': '5px solid rgba(23, 89, 120, 0.22)',
			'border-top-color': '#175978',
			'border-right-color': '#227DAA',
			'border-radius': '50%',
			'animation': 'jsmw-spin 0.75s linear infinite'
		});
		$('#jsmw_message').css('margin-top', '14px');
		if (!document.getElementById('jsmw_styles')) {
			$('<style id="jsmw_styles">' +
				'@keyframes jsmw-spin { to { transform: rotate(360deg); } }' +
				'@media (prefers-reduced-motion: reduce) { #jsmw_spinner { animation-duration: 1.8s !important; } }' +
			'</style>').appendTo('head');
		}
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
			if (jsmwDebug) console.trace("jsModalWait shown by: " + sender + " (count: " + counter + ")");
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
			resetMessage();
		}

		function reset() {
			senderList = {};
			counter = 0;
			$('#jsmw_cloak').hide();
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
