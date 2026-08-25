/*
 
 jsMultipleChoice v1.50
 (c) 2014-2022 by Willibrord Koch & Eric J. Francois

 DEPENDENCIES:
 jQuery
 jsPointerHandler

 DESCRIPTION:
 jsMultipleChoice is a replacement for browser built-in checkboxes and radio buttons and uses its
 own graphics. The reason for this is to have the exact same look on every platform, to be able to
 size the checkboxes and radio buttons with the text and to have a better handling for the values.!
 --------------------------------------------------------------------------------------------------------------
 VERSIONS:
 --------------------------------------------------------------------------------------------------------------
 v1.0		Initial version
 v1.1		Bugfix addElement() - check if element is already present -> error message
 v1.2		Rewritten to work with CSS rather than images (except checkmark), some bugfixes
 v1.3		Added boolean type (single checkbox), further bugfixes
 v1.31		fixed undo handler
 v1.33		added theme option
 v1.34		added jsPointerHandler support and hoverclass when hovering label
 v1.35		fixed bug introduced in a previous version that made it impossible to add elements and labels into a table
 v1.4		added option to define a maximum of clickable checkboxes and optional callback
 v1.41		replaced the function cloneArr by the much more concise deepCopy
 v1.42		when label includes text field, do not uncheck checkbox if user clicks in input field
 v1.43		added option of clickable parent (for table of choices)
 v1.44		corrected problem with single checkbox in a group
 v1.48		replaces sf() with template literals, because sf() was breaking '$$' in strings which caused MathJax trouble
 v1.49		updated to use jsPointerHandler v2.1.0
 v1.50		escaped values as hex strings to avoid problems with special characters
 			removed undo and redo handlers from the class, because they are now handled by the MVC framework
 --------------------------------------------------------------------------------------------------------------
 USAGE:
 include the CSS and the JS file in your HTML document
 instantiate with:
 new jsMultipleChoice(id, options);

 PARAMETERS:
 id - id for the new element
 options - an object with the following options:
 type:					‘cb’ for checkboxes and ‘rb’ for radiobuttons [mandatory]
 onChange:			callback function when value changes
 (p1:id,p2:current value,p3:dirty flag,p4:dataId)
 undoCallback:				callback when undo has been triggered
 (p1:id,p2:length undo list)
 redoCallback:				callback when redo has been triggered
 (p1:id,p2:length redo list)
 redoClearCallback: 		callback when all redoLists should be cleared, because new changes occurred
 (p1:id)
 elements:			an array of objects describing the elements to be created every element must have the following data:
 	elementParent:	    parent id where element is to be created
 	value:				the value of this element (unique inside the group)
	labelParent:		parent id where the label is created
 	label:              html string of the label (may include image tag)
 elPrefix:				a string to be added before the element on creation (e.g.: ‘<p>’) default is an empty string
 elPostfix:			a string to be added in after the element on creation (e.g.: ‘&nbsp;’) default is an empty string
 lbPrefix:				a string to be added before the label on creation (e.g.: ‘&nbsp;’) default is an empty string
 lbPostfix:			a string to be added after the label on creation (e.g.: ‘</p>’) default is an empty string
 order:				the creation order for the elements: either ‘elementFirst’ (default) or ‘labelFirst’
 height:	css string or integer for the height of the element (integer to be interpreted as pixels)
 default is ‘20px’
 initialValue:			the value the group should have after creation (preselection) radio groups just get a string matching the value of one button
 checkbox groups get an array of values each of which matches a checkbox default is empty string resp. empty array
 dataId:				a string identifying what the data represents (e.g. name of database field)
 this will be sent back in the onChange event and helps identify the data being sent default is empty string
 readOnly:			boolean that defines if the elements can be modified
 theme:				name of the theme to use (class jsMCTheme_<themename> will be added to every button); "default" will be used if omitted


 METHODS:
 addElement(elementParent, value, labelParent, label)
 if elements are not defined at creation time, this function allows to add them one by one. The parameters are the same as when created at creation time with the elements option.

 getValue()
 manual trigger of the onChange handler.

 reset(v)
 sets a new value for the group. The parameter is the same as when set at creation with the
 initialValue option.

 lock()
 sets group to read only mode.

 unlock()
 removes read only mode.

 setHeight()
 modifies the height of all checkboxes or radio buttons in the group. The parameter is the same as when set at creation with the height option.

 updateLabel(v, newLabel)
 updates the label of the element with value v with the HTML string newLabel.

 setDataId(dataId)
 sets a new dataId for this group

 getDataId()
 fetches the dataId for this group

 */

"use strict";

(function ($) {

	function jsMultipleChoice(id, options) {

		/* optional settings */
		if (!options)
			options = {};
		let type = options.type ?? 'cb'; //cb (checkbox group), rb (radio button group), boolean (single checkbox with true/false value)
		const changeCallback = options.onChange ?? null;
		const maxReachedCallback = options.maxReachedCallback ?? null;
		let elements = options.elements ?? [];
		if (options.element && !options.elements) {
			type = 'boolean';
			elements = [options.element];
			elements[0].value = 'boolean';
		} else if (options.elements) {
			//iterate through elements and hexencode the value property of each row
			for (let i in elements) {
				elements[i].value = encodeToHex(elements[i].value);
			}
		}
		const elPrefix = options.elPrefix ?? '';
		const elPostfix = options.elPostfix ?? '';
		const lbPrefix = options.lbPrefix ?? '';
		const lbPostfix = options.lbPostfix ?? '';
		const order = options.order ?? 'elementFirst';
		const height = parseInt(options.height) || '20';
		const theme = options.theme ?? 'default';
		const maxClickableCB = options.maxClickableCB ?? null;
		const clickableParent = options.clickableParent ?? null;
		let initialValue;
		let currentValue;
		if (type === 'cb') {
			initialValue = deepCopy(options.initialValue) ?? [];
			//encode values to hex strings
			for (let i in initialValue) {
				initialValue[i] = encodeToHex(initialValue[i]);
			}
			currentValue = deepCopy(initialValue);
		} else if (type === 'rb') {
			initialValue = encodeToHex(options.initialValue) ?? '';
			currentValue = initialValue;
		} else if (type === 'boolean') {
			initialValue = options.initialValue ?? false;
			currentValue = initialValue;
		} else {
			console.error(`Unkown type for jsMultipleChoice field with id "${id}"`);
		}
		let dataId = options.dataId ?? '';
		let readOnly = options.readOnly ?? false;
		let status;
		const undoList = [];
		const redoList = [];
		const elementList = {};
		const self = this;
		let pointerHandler = false;


		/* creation */
		if (typeof(jsPointerHandler) !== 'undefined') {
			pointerHandler = jsPointerHandler.instance;
		}


		$.each(elements, createElement);
		if (readOnly === true) {
			lock();
		}

		/* private functions */
		function deepCopy(d) {
			if (Array.isArray(d)) {
				let a = [];
				for (let i in d) {
					a[i] = deepCopy(d[i]);
				}
				return a;
			} else if (d === null) {
				/*	this is necessary because in javascript typeof(null) === 'object' which would convert any null value to
					{} in the next if clause */
				return null;
			} else if (typeof (d) === 'object') {
				let a = {};
				for (let i in d) {
					a[i] = deepCopy(d[i]);
				}
				return a;
			} else {
				return d;
			}
		}

		function removeValue(v, a) {
			if (!a) a = currentValue;
			const idx = a.indexOf(v);
			if (idx > -1) {
				a.splice(idx, 1);
			}
		}

		//check if the group has changes since creation or reset
		function getDirty() {
			if (type === 'cb') {
				return $(currentValue).not(initialValue).length !== 0 || $(initialValue).not(currentValue).length !== 0;
			} else {
				return currentValue !== initialValue;
			}
		}

		function createElement(k, v) {
			if (type==='rb') {
				if (v.value === initialValue) {
					status = 'checked';
				} else {
					status = 'clear';
				}
			} else if (type==='cb') {
				if ($.inArray(v.value, initialValue) !== -1) {
					status = 'checked';
				} else {
					status = 'clear';
				}
			} else if (type==='boolean') {
				if (initialValue) {
					status = 'checked';
				} else {
					status = 'clear';
				}
			}

			if (typeof(v.elementParent) === 'string') v.elementParent = $('#' + v.elementParent);
			if (typeof(v.labelParent) === 'string') v.labelParent = $('#' + v.labelParent);

			let elementHTML = '';
			let labelHTML = '';

			if (type === 'rb' || type === 'cb') {
				elementHTML = `${elPrefix}<div class="jsMultipleChoice_button jsMCTheme_${theme}" data-group="${id}" data-type="${type}" data-id="${v.value}" data-status="${status}" style="width: ${height+'px'}; height: ${height+'px'}"><div class="jsmcCheckmark"></div></div>${elPostfix}`;
				if (v.labelParent) labelHTML = `${lbPrefix}<div class="jsMultipleChoice_label" data-group="${id}" data-id="${v.value}" data-status="${status}">${v.label}</div>${lbPostfix}`;
				if (order === 'elementFirst') {
					if (v.elementParent.is(v.labelParent)) {
						v.elementParent.append(elementHTML + labelHTML);
					} else {
						v.elementParent.append(elementHTML);
						if (v.labelParent) v.labelParent.append(labelHTML);
					}
				} else {
					if (v.elementParent.is(v.labelParent)) {
						v.elementParent.append(labelHTML + elementHTML);
					} else {
						if (v.labelParent) v.labelParent.append(labelHTML);
						v.elementParent.append(elementHTML);
					}
				}
				elementList[v.value] = {};
				elementList[v.value].button = v.elementParent.find('.jsMultipleChoice_button').last();
				if (v.labelParent) elementList[v.value].label = v.labelParent.find('.jsMultipleChoice_label').last();

				if (pointerHandler) {
					pointerHandler.listen(elementList[v.value].button, {
						callbacks: {
							click: () => chgStatus(v.value)
						},
						hoverClass: 'jsMCHovered'
					});
					if (clickableParent) {
						pointerHandler.listen(elementList[v.value].button.parents(clickableParent), {
							callbacks: {
								click: () => chgStatus(v.value),
								over: () => hoverLabelStart(v.value),
								leave: () => hoverLabelEnd(v.value)
							}
						});
					}
					if (elementList[v.value].label) {
						pointerHandler.listen(elementList[v.value].label, {
							callbacks: {
								click: (e) => labelClicked(e, v.value),
								over: () => hoverLabelStart(v.value),
								leave: () => hoverLabelEnd(v.value)
							}
						});
					}
				} else {
					elementList[v.value].button.on('click', function () {
						chgStatus(v.value);
					});
					if (elementList[v.value].label) elementList[v.value].label.on('click', function () {
						chgStatus(v.value);
					});
				}
			} else if (type === 'boolean') {
				if (order === 'elementFirst') {
					v.elementParent.append(`${elPrefix}<div class="jsMultipleChoice_button jsMCTheme_${theme}" data-group="${id}" data-type="boolean" data-status="${status}" style="width: ${height+'px'}; height: ${height+'px'}"><div class="jsmcCheckmark"></div></div>${elPostfix}`);
					if (v.labelParent) v.labelParent.append(`${lbPrefix}<div class="jsMultipleChoice_label" data-group="${id}" data-status="${status}">${v.label}</div>${lbPostfix}`);
				} else {
					if (v.labelParent) v.labelParent.append(`${lbPrefix}<div class="jsMultipleChoice_label" data-group="${id}" data-status="${status}">${v.label}</div>${lbPostfix}`);
					v.elementParent.append(`${elPrefix}<div class="jsMultipleChoice_button jsMCTheme_${theme}" data-group="${id}" data-type="boolean" data-status="${status}" style="width: ${height+'px'}; height: ${height+'px'}"><div class="jsmcCheckmark"></div></div>${elPostfix}`);
				}

				elementList[v.value] = {};
				elementList[v.value].button = v.elementParent.find('.jsMultipleChoice_button').last();
				if (v.labelParent) elementList[v.value].label = v.labelParent.find('.jsMultipleChoice_label').last();

				if (pointerHandler) {
					pointerHandler.listen(elementList[v.value].button, {
						callbacks: {
							click: () => toggleStatus()
						},
						hoverClass: 'jsMCHovered'
					});
					if (clickableParent) {
						pointerHandler.listen(elementList[v.value].button.parents(clickableParent), {
							callbacks: {
								click: () => toggleStatus()
							}
						});
					}
					if (elementList[v.value].label) {
						pointerHandler.listen(elementList[v.value].label, {
							callbacks: {
								click: () => toggleStatus(),
								over: () => hoverLabelStart(v.value),
								leave: () => hoverLabelEnd(v.value)
							}
						});
					}
				} else {
					elementList[v.value].button.on('click', () => toggleStatus());
					if (elementList[v.value].label) elementList[v.value].label.on('click', () => toggleStatus());
				}
			}
		}

		function labelClicked(e, eValue) {
			/*	if label contains an input field (e.g. textfield) do not uncheck button if user clicks into textfield
				in order to type into it */
			let keepChecked = false;
			if ($(e.target).is('input')) {
				keepChecked = true;
			}
			chgStatus(eValue, keepChecked);
		}

		function chgStatus(eValue, keepChecked = false) {
			if (readOnly) return;
			//if an already selected radio button is clicked, abort. Otherwise a useless undo step would be created.
			if (eValue === currentValue) return;

			//check if maximum of clickable checkboxes has been reached already and abort if so
			if (type === 'cb' && maxClickableCB !== null && elementList[eValue].button.attr('data-status') === 'clear') {
				if(currentValue.length+1 > maxClickableCB){
					if (maxReachedCallback)	maxReachedCallback.call(self, id, eValue);
					return;
				}
			}

			//perform change
			if (type === 'rb' && currentValue!=='') {
				$(`.jsMultipleChoice_button[data-group='${id}'][data-id='${currentValue}'], .jsMultipleChoice_label[data-group='${id}'][data-id='${currentValue}']`).attr('data-status', 'clear');
				currentValue='';
			}
			if (elementList[eValue].button.attr('data-status') === 'checked') {
				/* if keepChecked is set, do not uncheck */
				if (keepChecked === false) {
					elementList[eValue].button.attr('data-status', 'clear');
					elementList[eValue].label?.attr('data-status', 'clear');
					removeValue(eValue);
				}
			} else {
				elementList[eValue].button.attr('data-status', 'checked');
				elementList[eValue].label?.attr('data-status', 'checked');
				if (type === 'rb') {
					currentValue = eValue;
				} else {
					currentValue.push(eValue);
				}
			}

			//call onChange handler
			getValue();
		}

		function toggleStatus() {
			if (readOnly) return;

			if (currentValue === true) {
				currentValue = false;
				elementList['boolean'].button.attr('data-status', 'clear');
				elementList['boolean'].label?.attr('data-status', 'clear');
			} else {
				currentValue = true;
				elementList['boolean'].button.attr('data-status', 'checked');
				elementList['boolean'].label?.attr('data-status', 'checked');
			}

			getValue();
		}


		/* public methods */
		function lock() {
			//enables read-only modus
			$.each(elementList, function (k, element) {
				//grey out images and text, deactivate clicks and change mouse pointer
				element.button.addClass('readonly');
				element.label.addClass('readonly');
			});
			readOnly = true;
		}

		function unlock() {
			//disables read-only modus
			$.each(elementList, function (k, element) {
				//recover images and text, activate clicks and change mouse pointer
				element.button.removeClass('readonly');
				element.label.removeClass('readonly');
			});
			readOnly = false;
		}

		function setHeight(h) {
			//changes height(size) of the checkboxes or radiobuttons
			const newHeight = parseInt(h);
			$.each(elementList, function (k, element) {
				element.button.css({
					height: newHeight + 'px',
					width: newHeight + 'px'
				});
			});
		}

		function updateLabel(v, newLabel) {
			//updates the label of one checkbox or radiobutton
			elementList[v].label.html(newLabel);
		}

		function hoverLabelStart(value) {
			elementList[value].button.addClass('jsMCLabelHovered');
		}

		function hoverLabelEnd(value) {
			elementList[value].button.removeClass('jsMCLabelHovered');
		}

		function setDataId(newDataId) {
			//updates the dataId of the group
			dataId = newDataId;
		}

		function getDataId() {
			//returns the dataId of the group
			return dataId;
		}

		function addElement(newElementParent, newValue, newLabelParent, newLabel) {
			if (type === 'boolean') return;
			//adds an additional element
			newValue = encodeToHex(newValue);
			if (!elementList[newValue]) {
				const newElement = {
					elementParent: newElementParent,
					value: newValue,
					labelParent: newLabelParent,
					label: newLabel
				};
				createElement(0, newElement);

				//Pushing new element to jquery object
				elements.push(newElement);
			} else {
				console.error('Element with that value already present. Cannot create duplicate!');
			}
		}

		function getValue() {
			//manual trigger of the onChange handler
			// p1 -> id of the group
			// p2 -> current value of the group
			// p3 -> dirty flag
			// p4 -> dataId
			if (changeCallback)	{
				if (type === 'rb') {
					changeCallback.call(self, id, decodeHex(currentValue), getDirty(), dataId);
				} else if (type === 'cb') {
					let values = [];
					$.each(currentValue, function (k, v) {
						values.push(decodeHex(v));
					});
					changeCallback.call(self, id, values, getDirty(), dataId);
				} else {
					changeCallback.call(self, id, currentValue, getDirty(), dataId);
				}
			}
		}

		function reset(newValue) {
			//sets new values for the group
			//delete old checkmarks
			newValue = encodeToHex(newValue);
			$.each(elementList, function (k, element) {
				element.button.attr('data-status', 'clear');
				element.label?.attr('data-status', 'clear');
			});
			if (type === 'rb') {
				elementList[newValue].button.attr('data-status', 'checked');
				elementList[newValue].label?.attr('data-status', 'checked');
				if (elementList[newValue].button.length === 0) {
					console.error('ERROR: No Element found with the value: ' + decodeHex(newValue));
					newValue = '';
				}
				currentValue = newValue;
			} else if (type === 'cb') {
				$.each(newValue, function (k, v) {
					if (!elementList[v]) {
						console.error('ERROR: No Element found with the value: ' + decodeHex(v));
						removeValue(v, newValue);
					} else {
						elementList[v].button.attr('data-status', 'checked');
						elementList[v].label?.attr('data-status', 'checked');
					}
				});
				currentValue = deepCopy(newValue);
			} else if (type === 'boolean') {
				newValue = !!newValue; //this converts value to real boolean
				if (newValue) {
					elementList['boolean'].button.attr('data-status', 'checked');
					elementList['boolean'].label?.attr('data-status', 'checked');
				}
				currentValue = newValue;
			}
		}

		/* export methods */
		this.lock = lock;
		this.unlock = unlock;
		this.setHeight = setHeight;
		this.updateLabel = updateLabel;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.addElement = addElement;
		this.getValue = getValue;
		this.reset = reset;
	}

	/* export class */
	window.jsMultipleChoice = jsMultipleChoice;

})(jQuery);
