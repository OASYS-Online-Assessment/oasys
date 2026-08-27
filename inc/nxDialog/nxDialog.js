/*
 nxDialog, v1.7

 dependencies: jQuery, jQueryUI, nxButton

 Example of usage:

 ----------------------------
$().ready(onDomReady);

function onDomReady() {
    let buttonData = {
        label: 'Click Me!',
        callback: function (e) {
            buttonClicked('param1', 'param2');
        }
    }
    new nxButton($('#buttonHolder'), 'clickMeButton', buttonData);
}

function buttonClicked(p1, p2, button, name) {
    if (!button) {
        let dialogData = {
            buttons: [
                {label: 'Cancel', 'cancel': true, value: 'cancel'},
                {label: 'OK', 'default': true, value: 'ok'}
            ],
            datafields: [
                'tfName'
            ],
            mandatory: [
                'tfName'
            ],
            focus: 'tfName',
            values: {
                tfName: 'Enter your name here'
            },
            contents: '<p>Who do you want to greet?<br><input type="text" id="tfName" style="width: 100%; margin-top: 10px;"></p>',
			title: 'Greet someone',
            width: 400,
            callback: buttonClicked
        };
        new nxDialog('hwDialog', dialogData, arguments);
    }
    if (button === 'ok') {
        //in this example we use the nxDialog only as alert, and don't specify any other options than the contents
        new nxDialog('alertDialog', {contents: 'Hello ' + name + '!'});
        //the original parameters p1 and p2 are still available here!
    }
}
------------------------------

Example of a simple error message:

let dialogData = {
    buttons: [
        {label: 'OK', 'default': true, cancel: true, value: 'ok'}
    ],
    contents: errorText,
    title: errorTitle,
    width: 600,
    'z-index': 50
};
new nxDialog('error', dialogData);

 ------------------------------

 Example of an async version of nxDialog which resolves a promise when done:

async function greetPerson() {
	let dialogData = {
		buttons: [
			{label: 'Cancel', 'cancel': true, value: 'cancel'},
			{label: 'OK', 'default': true, value: 'ok'}
		],
		datafields: [
			'tfName'
		],
		mandatory: [
			'tfName'
		],
		focus: 'tfName',
		values: {
			tfName: 'Enter your name here'
		},
		dataFormat: 'object',
		contents: '<p>Who do you want to greet?<br><input type="text" id="tfName" style="width: 100%; margin-top: 10px;"></p>',
		title: 'Greet someone',
		returnPromise: true,
		width: 400
	};

	let res = await showDialog(dialogData);
	if (res.button === 'ok') {
		alert(`Hello, ${res.data.tfName}!`);
	} else {
		alert("I see, got no friends, eh?");
	}
}

async function showDialog(dialogData) {
	let res = await new nxDialog('hwDialog', dialogData);
	return res;
}


 ------------------------------

 NOTE: if you want to use an existing HTML element as contents, rather than an HTML string, you can specify the id of said elements as such:

 let dialogData = {
    [...]
    contentId: 'dialogContentDiv'
 }

 if the attribute 'contentId' is specified, the attribute 'contents' will be ignored

*/

"use strict";

(function ($) {

	//constructor
	function nxDialog(id, data, originalParameters = []) {
		if (typeof (nxButton) === 'undefined') {
			alert('Dependency missing: nxButton');
			return;
		}
		if (typeof(window.nxDialogManager) === 'undefined') {
			window.nxDialogManager = {instances: {}};
		}
		let i;
		const original_id = id;
		let idCounter = 1;
		while ($('#' + id).length > 0) {
			id = original_id + "_" + idCounter++;
		}
		const buttons = data.buttons || [{label: 'OK', 'default': true, value: 1}];
		let contentId = '';
		let contents;
		if (data.contentId) {
			contentId = data.contentId;
		} else {
			contents = data.contents || '';
		}
		const allowMultipleInstances = data.allowMultipleInstances ?? true; //if set to false, no dialogue with the same id can be opened while another one is still open
		if (allowMultipleInstances === false && window.nxDialogManager.instances[original_id]) {
			return;
		}
		const replaceExisting = data.replaceExisting ?? false; //if string is provided, a dialog with that id will be dismissed before opening this one
		if (typeof (replaceExisting) === 'string') {
			//if a string is provided, we will dismiss the dialog with that id
			if (window.nxDialogManager.instances[replaceExisting]) {
				window.nxDialogManager.instances[replaceExisting].dismiss();
			}
		}
		const title = data.title || '';
		const callback = data.callback || null;
		const returnPromise = data.returnPromise || false;
		const datafields = data.datafields || [];
		const mandatory = data.mandatory || [];
		const blackList = data.blackList || {};
		let blackListLogic = data.blackListLogic || "and"; //default is "and" => all fields that have a blacklist need to fulfill requirements for OK button to light up
		blackListLogic = blackListLogic.toLowerCase();
		if (blackListLogic !== "or" && blackListLogic !== "and") blackListLogic = "and";
		let values = data.values || {};
		let dataFormat = data.dataFormat;
		if (dataFormat !== 'object') dataFormat = 'parameters'; //defines if the values of inputfields are added as parameters during callback or as a single object containing the data
		const fieldTypes = data.fieldTypes || {};
		const fieldOptions = data.fieldOptions || {};
		const fieldInputCallback = data.fieldInputCallback || null; // possibility for a callback on an external fundtion when fieldInput is triggered (in order to update dialog content)
		const fieldInstances = {};
		const type = normalizeDialogType(data.type || data.variant || data.messageType || '');
		const icon = data.icon || false;
		let iconWidth = data.iconWidth || null;
		let iconHeight = data.iconHeight || null;
		const doNotStripHTML = data.doNotStripHTML || false;
		const zIndex = data['z-index'] || 100;
		if (typeof (iconWidth) === 'number') iconWidth += 'px';
		if (typeof (iconHeight) === 'number') iconHeight += 'px';
		$('body').append(`<div id="veil_${id}" class="nxDialogVeil"><div id="${id}" class="nxDialog"><div class="nxDialogTitle">${title}</div><div class="nxDialogIconWrapper"></div><div class="nxDialogBody"></div><div class="nxDialogButtons"></div></div></div>`);
		const veil = $('#veil_' + id);
		veil.css("z-index", zIndex);
		const box = $('#' + id);
		const dialogType = type || inferDialogType(title, icon, id);
		if (dialogType) box.addClass(`nxDialog-${dialogType}`);
		let dialogBody = box.find('.nxDialogBody');
		let dialogIconWrapper = box.find('.nxDialogIconWrapper');
		if (contentId !== '') {
			dialogBody.append($('#' + contentId));
			box.find('.nxDialogBody > *').show();
		} else {

			//replace extended input field keywords with container elements
			for (i in fieldTypes) {
				const rxString = escapeForRegex(`\[\@${i}\]`);
				const rx = new RegExp(rxString, 'i');
				contents = contents.replace(rx, `<span id="${id}_${i}"></span>`);
			}

			//insert content
			dialogBody.append(contents);

			//insert icon
			if (icon) {
				if (typeof (icon) === 'string') {
					dialogIconWrapper.html(`<img src="${icon}" class="nxDialogIcon">`);
					if (iconWidth) box.find('.nxDialogIcon').css('width', iconWidth);
					if (iconHeight) box.find('.nxDialogIcon').css('height', iconHeight);
				} else if (icon instanceof HTMLImageElement) {
					$(icon).addClass('nxDialogIcon');
					dialogIconWrapper.html(icon);
					if (iconWidth) box.find('.nxDialogIcon').css('width', iconWidth);
					if (iconHeight) box.find('.nxDialogIcon').css('height', iconHeight);
				}
			}
			if (dialogType && dialogIconWrapper.is(':empty')) {
				dialogIconWrapper.html(`<span class="nxDialogSemanticIcon" aria-hidden="true"></span>`);
			}

			//insert extended fields into container elements
			for (i in fieldTypes) {
				const container = box.find(`#${id}_${i}`);
				switch (fieldTypes[i]) {
					case 'dropList':
						fieldOptions[i].onChange = function () {
							fieldInput(null, false);
						};
						fieldInstances[i] = new jsDropList(container, `${id}_${i}_dropList`, fieldOptions[i]);
						break;
					case 'numberInput':
						fieldOptions[i].onChange = function () {
							fieldInput(null, false);
						};
						fieldInstances[i] = new jsNumberInput(container, `${id}_${i}_numberInput`, fieldOptions[i]);
						break;
				}
			}

		}
		for (i in values) {
			$('#' + i).val(values[i]);
		}

		let width = data.width || 400;
		if (screen.availWidth < width) {
			width = screen.availWidth - 20;
		}
		box.css({
			width: width + 'px',
			overflow: 'auto'
		});
		const height = box.outerHeight();
		box.on('click', stopBubble);
		const buttonStrip = $('#' + id + ' .nxDialogButtons');
		const keyEvents = {};
		const buttonInstances = {};
		const buttonOptions = {};
		buttons.forEach(function (button, i) {
			buttonOptions[button.value] = {};
			const buttonData = {
				label: button.label,
				disabled: button.disabled || false,
				value: button.value
			};
			if (!returnPromise) {
				buttonData['callback'] = dismiss;
			} else {
				buttonData['eventType'] = 'NxDialogDismiss_' + id;
			}
			if (button['default']) {
				keyEvents['default'] = button.value;
				buttonData['default'] = true;
			}
			if (button['cancel']) {
				keyEvents['cancel'] = button.value;
			}
			if (button['keepOpen']) {
				buttonOptions[button.value].keepOpen = true;
			}
			buttonInstances[button.value] = new nxButton(buttonStrip, id + '_button_' + i, buttonData);
		});

		//make sure the dialog is centered on the screen
		box.draggable(
			{
				handle: ".nxDialogTitle",
				start: function () {
					//get absolute position on screen and set left and top margin accordingly,
					//then remove the transform property to prevent flickering
					const box = $('#' + id);
					const offset = box.offset();
					box.css('left', offset.left + 'px');
					box.css('top', offset.top + 'px');
					box.css('transform', 'none');
				}
			}
		);
		if (data.focus) {
			$('#' + data.focus).trigger("focus");
		}
		const previousDialog = window.nxDialogTopMost || null;	//necessary to remember which was top most dialog before opening this one
		window.nxDialogTopMost = id;
		$(document).on('keydown.' + id, keydown);
		$(document).on('keyup.' + id, keyup);
		box.find("input, textarea").on({
			'keydown.nxDialogFields': fieldsKeyboard,
			'keyup.nxDialogFields': fieldsKeyboard,
			'input.nxDialogFields': fieldInput
		});
		box.find("select").on({
			'change.nxDialogFields': fieldInput
		});
		fieldInput(null, true);

		//on resize execute setOverflowClass
		$(window).on('resize', setOverflowClass);
		setTimeout(setOverflowClass, 100); //set overflow class after a short timeout to ensure the dialog is fully rendered
		const config = { attributes: false, childList: true, subtree: true };
		const observer = new MutationObserver(setOverflowClass);
		observer.observe(dialogBody.get(0), config);

		let showEvent = new CustomEvent('nxDialog', {
			detail: {
				id: id, action: 'show'
			},
			bubbles: true,
			cancelable: false
		});

		window.dispatchEvent(showEvent);

		function refreshInputEvents() {
			box.find("input, textarea").off('keydown.nxDialogFields');
			box.find("input, textarea").off('keyup.nxDialogFields');
			box.find("input, textarea").off('input.nxDialogFields');
			box.find("select").off('change.nxDialogFields');
			box.find("input, textarea").on({
				'keydown.nxDialogFields': fieldsKeyboard,
				'keyup.nxDialogFields': fieldsKeyboard,
				'input.nxDialogFields': fieldInput
			});
			box.find("select").on({
				'change.nxDialogFields': fieldInput
			});
			fieldInput(null, true);
		}

		function fieldInput(e, init) {
			if (!keyEvents['default']) return;
			const emptyCheck = mandatory.every(function (field) {
				let v;
				if (!fieldTypes[field]) {
					v = $('#' + field).val();
				} else {
					switch (fieldTypes[field]) {
						case 'dropList':
						case 'numberInput':
							v = fieldInstances[field].getValue();
							break;
					}
				}
				if (v === null || typeof v === 'undefined' || v === '' || (typeof v === 'number' && Number.isNaN(v))) return false;
				return (!String(v).match(/^\s*$/));
			});
			let contentCheck;
			if (blackListLogic === "and") {
				contentCheck = true;
				for (let i in blackList) {
					let row = blackList[i];
					let v = fieldTypes[i] ? fieldInstances[i].getValue() : $('#' + i).val();
					if (row.indexOf(v) !== -1) {
						contentCheck = false;
					}
				}
			} else if (blackListLogic === "or") {
				contentCheck = false;
				for (let i in blackList) {
					let row = blackList[i];
					let v = fieldTypes[i] ? fieldInstances[i].getValue() : $('#' + i).val();
					if (row.indexOf(v) === -1) {
						contentCheck = true;
					}
				}
			}
			if (emptyCheck && contentCheck) {
				//if all mandatory fields are filled and no blacklisted content is present …
				if (!init) {
					//… enable all buttons except the cancel button (which is always enabled)
					for (let i in buttonInstances) {
						if (i !== keyEvents['cancel']) {
							buttonInstances[i].enable();
						}
					}
				}
			} else {
				//if not all mandatory fields are filled or blacklisted content is present, disable the default button
				for (let i in buttonInstances) {
					if (i === keyEvents['default']) {
						buttonInstances[i].disable();
					}
				}
			}
			if (fieldInputCallback) {
				const valuesObj = {};
				let value;
				datafields.forEach(function (field, i) {
					if (!fieldTypes[field]) {
						value = $('#' + field).val();
						valuesObj[field] = value;
					} else {
						switch (fieldTypes[field]) {
							case 'dropList':
							case 'numberInput':
								value = fieldInstances[field].getValue();
								valuesObj[field] = value;
								break;
						}
					}
				});
				fieldInputCallback.call(this, valuesObj);
			}
		}

		function fieldsKeyboard(e) {
			//if an input field inside the dialog gets a keyboard event, stop propagation if it's not the RETURN or ESCAPE key (which are needed for the buttons)
			if (e.which !== 0x1B && e.which !== 0x0D) {
				e.stopPropagation();
				//specifically allow copy, paste and select all in this case, prevent default for any others
				if ((e.metaKey || e.ctrlKey) && !(e.which === 86 || e.which === 67 || e.which === 65)) {
					e.preventDefault();
				}
			} else if (e.which === 0x0D) {
				//for text areas that need the return key, that event needs to be blocked from propagation as well
				if (e.currentTarget.tagName === 'TEXTAREA' && !e.metaKey && !e.ctrlKey) {
					e.stopPropagation();
				}
			}
		}

		function keydown(e) {
			if (id !== window.nxDialogTopMost) return;
			window.nxDialogKeyDown = id;
			/* forward return and escape events to the default and cancel buttons, but only if CMD key is not pressed as
				well, as CMD key shortcuts do not get a keyup event (swallowed by MacOS). Thus the button would be visually
				stuck at pressed status. */
			if (e.which === 0x0D && keyEvents['default']) {
				if (!e.metaKey) {
					buttonInstances[keyEvents['default']].keydown(e);
				} else {
					/* if CMD+Return was pressed we already trigger the keyup method of the button on keydown, otherwise
						otherwise we will lose the keyboard event entirely */
					buttonInstances[keyEvents['default']].keyup(e);
				}
			}
			if (e.which === 0x1B && keyEvents['cancel'] && !e.metaKey) {
				buttonInstances[keyEvents['cancel']].keydown(e);
			}
			e.stopImmediatePropagation();
			const target = $('*:focus');
			if (e.metaKey && e.which === 82) {
				return;	//ignore CMD+R (reload) key
			}
			if (target.length === 0) {
				e.preventDefault();	//if no element has focus (no text field or text area needs input), prevent default keyboard action
			} else if (veil.find(target).length === 0 && !(target.get(0).closest('.tox-tinymce-aux'))) {
				e.preventDefault();	//if an element does have focus, but it's outside of the scope of our dialog, also prevent default keyboard action => you should not be able to type in a field behind the dialog
			} else if (e.which === 0x0D && target.is('input[type="text"], input[type="password"], textarea')) {
				e.preventDefault(); //forms without action tend to reload the page on return key, which we don't want
			}
		}

		function keyup(e) {
			if (id !== window.nxDialogTopMost) return;
			if (id !== window.nxDialogKeyDown) {
				//if the dialog popped up only after keydown event, ignore the keyup event
				delete window.nxDialogKeyDown;
				return;
			}
			if (e.which === 0x0D && keyEvents['default']) {
				buttonInstances[keyEvents['default']].keyup(e);
			}
			if (e.which === 0x1B && keyEvents['cancel']) {
				buttonInstances[keyEvents['cancel']].keyup(e);
			}
			delete window.nxDialogKeyDown;
			e.stopImmediatePropagation();
			e.preventDefault();
		}

		function dismiss(sender = 'dummy') {
			let hideEvent = new CustomEvent('nxDialog', {
				detail: {
					id: id, action: 'hide'
				},
				bubbles: true,
				cancelable: false
			});

			window.dispatchEvent(hideEvent);

			const values = [];
			const valuesObj = {};
			if (callback || returnPromise) {
				let value;
				datafields.forEach(function (field, i) {
					if (!fieldTypes[field]) {
						value = $('#' + field).val();
					} else {
						switch (fieldTypes[field]) {
							case 'dropList':
							case 'numberInput':
								value = fieldInstances[field].getValue();
								break;
						}
					}
					if (doNotStripHTML) {
						values.push(value);
						valuesObj[field] = value;
					} else {
						values.push(stripHTMLTags(value));
						valuesObj[field] = stripHTMLTags(value);
					}
				});
				if (callback) {
					const parameters = [];
					for (i in originalParameters) {
						parameters.push(originalParameters[i]);
					}
					parameters.push(sender);
					if (dataFormat === 'object') {
						parameters.push(valuesObj);
					} else {
						for (let i in values) {
							parameters.push(values[i]);
						}
					}
					callback.apply(this, parameters);
				}
			}
			if (sender === 'dummy' || buttonOptions[sender]?.keepOpen !== true) {
				window.nxDialogTopMost = previousDialog;
				$(document).off('keydown.' + id);
				$(document).off('keyup.' + id);
				box.find("input, textarea").off('keydown.nxDialogFields');
				box.find("input, textarea").off('keyup.nxDialogFields');
				box.find("input, textarea").off('input.nxDialogFields');
				box.find("select").off('change.nxDialogFields');
				veil.remove();
			}
			if (returnPromise) {
				if (dataFormat === 'object') {
					return valuesObj;
				} else {
					return values;
				}
			}
			delete window.nxDialogManager.instances[id]; //remove dialog instance from manager
		}

		function setOverflowClass() {
			if (dialogBody.prop('scrollHeight') > Math.ceil(dialogBody.innerHeight())) {
				dialogBody.addClass('nxDialogOverflow');
			} else {
				dialogBody.removeClass('nxDialogOverflow');
			}
		}

		function disableButton(v) {
			if (v in buttonInstances) buttonInstances[v].disable();
		}

		function enableButton(v) {
			if (v in buttonInstances) buttonInstances[v].enable();
		}

		function stopBubble(e) {
			e.stopImmediatePropagation();
		}

        function normalizeInitialPosition() {
            const rect = box[0].getBoundingClientRect();
            box.css({
                left: rect.left + 'px',
                top: rect.top + 'px',
                transform: 'none'
            });
        }

		this.dismiss = dismiss;
		this.disableButton = disableButton;
		this.enableButton = enableButton;
		this.refreshInputEvents = refreshInputEvents;
        this.normalizeInitialPosition = normalizeInitialPosition;


        window.nxDialogManager.instances[id] = this; //register dialog instance

		if (returnPromise === true) {
			return new Promise(function (resolve) {
				window.addEventListener('NxDialogDismiss_' + id, function buttonClick(e) {
					window.removeEventListener('NxDialogDismiss_' + id, buttonClick);
					let data = dismiss();
					resolve({button: e.detail, data: data});
				});
			});
		} else {
			return this;
		}
	}

	function normalizeDialogType(type) {
		type = String(type || '').toLowerCase();
		const validTypes = ['error', 'warning', 'success', 'info', 'confirm', 'form'];
		return validTypes.includes(type) ? type : '';
	}

	function inferDialogType(title, icon, id) {
		const haystack = `${title || ''} ${id || ''} ${icon || ''}`.toLowerCase();
		if (haystack.includes('error')) return 'error';
		if (haystack.includes('warning') || haystack.includes('warn')) return 'warning';
		if (haystack.includes('success')) return 'success';
		if (haystack.includes('info')) return 'info';
		return '';
	}

	window.nxDialog = nxDialog;

})(jQuery);

/* Release notes:
	1.61 (2025-01-09)
		- added custom events on show and hide of dialog
		- switched to <dialog> element for dialog instead of <div>
		- removed veil from dialog and added modal option (defaults to true)
	1.62 (2025-01-10)
		- fixed a bug where the dialog would no longer show, if set to return a promise
	1.63 (2025-01-10)
		- fixed a bug that closed dialogs would stay in the DOM
	1.64 (2025-01-13)
		- rolling back to <div> element for dialog, as <dialog> element causes proplems with included widgets like
		  dropList, datePicker, colourPicker etc.
	1.65 (2025-02-11)
		- fixed a problem where other buttons than the default button would be deactivated when the text field remained
		  unchanged. This caused "reset buttons to default value" to be disabled where they should not be.
 	1.66 (2025-07-15)
 		- fixed a problem where the dialogs using promises would not expose their methods
 		- added nxDialogManager to keep track of all open dialogs
		- added option to prevent multiple instances of the same dialog
		- added option to dismiss an existing dialog with a specific id before opening a new one
	1.67 (2025-08-05)
		- fixed a problem where a dialog with a text field would recharge the web page rather than submitting the form
	1.68 (2025-08-21)
		- added a brief delay to initially set the overflow class, to ensure the dialog is fully rendered
	1.69 (2026-01-12)
		- added normalizeInitialPosition as method for correct initial positioning (when TinyMCE is used in the dialog)
 */
