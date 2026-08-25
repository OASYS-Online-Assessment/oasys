/*
 jsDropList v1.77
 (c) 2014-2024 by Willibrord Koch & Eric J. François

 DESCRIPTION:
 jsDropList is a replacement for browser built-in droplists and uses its
 own graphics. The reason for this is to have the exact same look on every platform.
 --------------------------------------------------------------------------------------------------------------
 VERSIONS:
 --------------------------------------------------------------------------------------------------------------
 v1.0	Initial version
 v1.1	several tweaks, fixes and enhancements
 v1.2	droplist will now expand to the top if there is not enough space to the browser bottom
 v1.3	replaced bitmap pictures with svg
 v1.32	fixed a bug that would not allow the initial value to be 0
 v1.33	fix: noChoiceTitle not shown if no elements on creation time
 		fix: blank string as title replaced by default
 v1.4	added scroll bars if there is an overflow
 		replaced sf() by template literals
 		modified click listeners to use jsPointerHandler
 v1.5	Allowing all CSS units for width now
 v1.6	Moved veil to top of DOM in order to be able to calculate needed width
 v1.61	Updates position of flyout when window size changes or devices rotates
 v1.62	reinstated functionality from v1.2 that list opens up to the top if space is missing below
 v1.63	flyout adopts font-size of box element, unless font-size is defined in cssExpanded manually
 v1.64	corrected a buggy calculation for the width needed
 		removed undo and redo functionality that was deprecated
 		recalculate required width on changing elements
 v1.65	fixed a bug inadvertantly introduced in v1.64
 v1.70	fixed problem with options.width in %
 		added a cleanup function to remove left overs of previous instances
 		handled max width and text overflow
 		corrected touch screen scrolling when adding elements
 v1.71	no longer copy container width to element width -> problems with some CSS units (e.g. percent)
 v1.72	another try to fix percentage widths
 v1.73	only CSS changes for locked state
 v1.74  handle empty values in addElement
 v1.75	update to jsPointerHandler v2.1.0
 v1.76  hexencoded values in data-sid to prevent problems with special characters
 v1.77  sanitize id parameter
 --------------------------------------------------------------------------------------------------------------
 USAGE:
 include the CSS and the JS file in your HTML document
 instantiate with:
 new jsDropList(parent, id, options)

 PARAMETERS:
 parent - parent element for the new droplist
 id - id for the new element
 options - an object with the following options:
 onChange:			callback function when value changes
 					(p1:id,p2:current value,p3:dirty flag,p4:dataId)
 elements:			an array of objects describing the elements to be created, every element must have the following data:
 value:unique value inside this list, label:html-string of the label, may include img-tag
 order:				the order for the choices: either ‘label’ or ‘value’ which defines the key by which will be sorted. If not indicated, no ordering will take place
 cssCollapsed:		an object of key/value pairs that is applied as CSS rules to the element in its collapsed state
 cssExpanded:		an object of key/value pairs that is applied as CSS rules to the element in its expanded state
 listTitle:			Title of the list when there is no selection, default is "Bitte wähle:"
 noChoiceTitle:		Title of the list when no select items are available, default is "Keine Auswahl vorhanden!"
 initialValue:		the value the list should have after creation (preselection)
 dataId:			a string identifying what the data represents (e.g. name of database field)
 					this will be sent back in the onChange event and helps identify the data being sent, default is empty string
 readOnly:			boolean that defines if the elements can be modified


 METHODS:
 addElement(choices)
 when additional choices need to be added at runtime, this method will merge the new choices with those already present in the list. The parameter is an array of objects just like the choices option defined at creation time. After merging, the choices must be ordered if if an order was defined at creation

 removeElements(values)
 removes the indicated choices from the list (values is an array of values to remove)

 getValue()
 manual trigger of the onChange handler.

 reset(v)
 sets a new value for the list. The parameter is the same as when set at creation with the
 initialValue option.

 lock()
 sets list to read only mode.

 unlock()
 removes read only mode.

 setDataId(dataId)
 sets a new dataId for this group

 getDataId()
 fetches the dataId for this group

 */

"use strict";

(function($) {

	/* clean up remaining elements in DOM when container disappears */
	function jsDropList(parent, id, options) {

		/*  check if id is a string that is safe to use in an HTML id attribute and return with a console error if not */
		const unsafePattern = /[<>"']/g; // Looks for unsafe characters
		if (typeof (id) !== 'string' || id === '' || unsafePattern.test(id)) {
			console.error('jsDropList: id must be a non-empty string without the characters <, >, " or \'.');
			return;
		}

		/* set up manager */
		if (!window.jsdlManager) {
			window.jsdlManager = {
				list: {},
				counter: 0,
				onDomChange: () => {
					for (let i in window.jsdlManager.list) {
						let jsdl = window.jsdlManager.list[i];
						if (!document.body.contains(jsdl.container.get(0))) {
							jsdl.instance.destroy();
						}
					}
				}
			};
			window.jsdlManager.observer = new MutationObserver(window.jsdlManager.onDomChange);
			const config = {
				childList: true,
				subtree: true
			};
			window.jsdlManager.observer.observe($('body').get(0), config);
		}

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $('#' + parent);
		}
		const suffix = '_' + id;

		/* optional settings */
		if (!options) {
			options = {};
		}
		const changeCallback = options.onChange ?? null;
		let elements = options.elements ?? [];
		const theme = options.theme ?? 'default';
		let width = options.width ?? false;
		if (typeof (width) === 'number') {
			width = width + "px";
		}
		const css = options.css ?? {};
		const cssCollapsed = options.cssCollapsed ?? {};
		const cssExpanded = options.cssExpanded ?? {};
		if (width !== false) {
			if (typeof (css.width) === 'undefined') {
				css.width = width;
			}
		}
		let cssExDef = false;
		if (cssExpanded.width) {
			cssExDef = true;
		}
		let cssCollDef = false;
		if (cssCollapsed.width) {
			cssCollDef = true;
		}
		const order = options.order ?? '';
		if (options.listTitle === '') {
			options.listTitle = '&nbsp;';
		}
		let listTitle = options.listTitle ?? 'Please choose:';
		if (options.noChoiceTitle === '') {
			options.noChoiceTitle = '&nbsp;';
		}
		let noChoiceTitle = options.noChoiceTitle ?? 'No choices available';
		let initialValue;
		if (typeof(options.initialValue) === 'undefined') {
			initialValue = "";
		} else {
			initialValue = options.initialValue;
		}
		let value = initialValue;
		let dataId = options.dataId ?? '';
		const readOnly = options.readOnly ?? false;
		let locked = false;
		let dirtyflag = false;

		let jsph = jsPointerHandler.instance;

		/* creation */
		const arrowDownIcon = '<svg id="dlDownArrowIcon" viewBox="0 0 62 31"><path d="M61.127,0l-61.127,0l30.564,30.564l30.563,-30.564Z"/></svg>';
		parent.append(`<div id="dlContainer${suffix}" class="jsDropListContainer jsDLTheme_${theme}"><p id="dlTitle${suffix}" class="active collapsed"><span class="dlTitleSpan">${elements.length === 0 ? noChoiceTitle : listTitle}</span>${arrowDownIcon}</p></div>`);
		$('body').append(`<div id="dlVeil${suffix}" class="jsDropListVeil collapsed jsDLTheme_${theme}"><ul id="dlList${suffix}" class="active"></ul><div id="dlListScrollBar${suffix}"><div id="dlListScrollHandle${suffix}"></div></div></div>`);
		const container = $('#dlContainer' + suffix);
		const boxElement = $('#dlTitle' + suffix);
		const boxSpan = $('#dlTitle' + suffix + ' > .dlTitleSpan');
		const listElement = $('#dlList' + suffix);
		const veilElement = $('#dlVeil' + suffix);
		const scrollBar = $('#dlListScrollBar' + suffix);
		const scrollHandle = $('#dlListScrollHandle' + suffix);
		$.each(elements, function(k, v) {
			if (!v.label) {
				v.label = '&nbsp;';
			}
			listElement.append(`<li data-sid="${encodeToHex(v.value) + suffix}">${v.label}</li>`);
			jsph.listen($(`[data-sid='${encodeToHex(v.value) + suffix}']`), {
				callbacks: {
					up: (e) => {
						e.stopPropagation();
						chgStatus(v.value);
					}
				},
				allowScrolling: true,
				hoverClass: 'jsdl_hovered'
			});
		});
		jsph.listen(boxElement, {
			callbacks: {
				click: () => showhideChoices()
			}
		});
		jsph.listen(veilElement, {
			callbacks: {
				click: (e) => {
					e.stopPropagation();
					showhideChoices();
				}
			}
		});
		jsph.listen(scrollBar, {
			callbacks: {
				click: (e) => scrollBarClick(e)
			}
		});
		jsph.listen(scrollHandle, {
			callbacks: {
				down: (e) => scrollHandleButtonDown(e),
				move: (e) => scrollHandleMove(e),
				up: (e) => scrollHandleButtonUp(e)
			}
		});
		listElement.on('scroll', () => onScrollList());
		let handleTop = 0;
		let handleTop0 = 0;
		let handleMouseOffset = 0;
		let handleDragging = false;
		let y0 = 0;
		let dy = 0;
		let handleRange = 0;

		if (initialValue !== '') {
			reset(initialValue);
		}
		const self = this;

		//setup CSS
		container.css(css);
		if (!cssExDef) {
			if (!width === false) {
				cssExpanded.width = '100%';
			} else {
				cssExpanded.width = `calc(${listElement.innerWidth()}px + 2.5em)`;
			}
		}
		if (!cssCollDef) {
			cssCollapsed.width = cssExpanded.width;
		}
		boxElement.css(cssCollapsed);
		if (!cssExpanded['font-size']) {
			cssExpanded['font-size'] = boxElement.css('font-size');
		}
		listElement.css(cssExpanded);

		//Order list items if necessary
		if (order !== '') {
			sortList();
		}

		//Switch to read-only mode
		if (readOnly === true) {
			lock();
		}

		//observe window size changes and device rotations
		//no need to listen for screen.orientation.onchange as it triggers before DOM has adopted new orientation
		//also ScreenOrientation is not supported by Safari
		$(window).on('resize', () => adjustPosition());

		const listId = window.jsdlManager.counter++;
		window.jsdlManager.list[listId] = {'container': container, 'veil': veilElement, 'instance': this};

		function onScrollList() {
			let scrollFraction = listElement[0].scrollTop / (listElement[0].scrollHeight - 150);
			handleTop = (scrollBar.innerHeight() - scrollHandle.outerHeight() - 2) * scrollFraction;
			scrollHandle.css('top', handleTop + 'px');
		}

		function scrollBarClick(e) {
			let y = e.offsetY;
			handleTop = scrollHandle.offset().top - scrollBar.offset().top;
			handleRange = scrollBar.innerHeight() - scrollHandle.outerHeight();
			if (handleTop < y) {
				handleTop += scrollHandle.outerHeight();
				if (handleTop > handleRange) {
					handleTop = handleRange;
				}
			} else {
				handleTop -= scrollHandle.outerHeight();
				if (handleTop < 0) {
					handleTop = 0;
				}
			}
			scrollHandle.css('top', handleTop + 'px');
			scrollListToHandlePosition();
		}

		function scrollHandleButtonDown(e) {
			handleDragging = true;
			y0 = e.clientY;
			handleTop0 = handleTop = scrollHandle.offset().top - scrollBar.offset().top;
			handleMouseOffset = y0 - scrollHandle.offset().top;
			handleRange = scrollBar.innerHeight() - scrollHandle.outerHeight();
		}

		function scrollHandleMove(e) {
			if (!handleDragging) {
				return;
			}
			dy = e.clientY - y0;
			handleTop = handleTop0 + dy;
			if (handleTop > handleRange) {
				handleTop = handleRange;
			} else if (handleTop < 0) {
				handleTop = 0;
			}
			scrollHandle.css('top', handleTop + 'px');
			scrollListToHandlePosition();
		}

		function scrollHandleButtonUp() {
			handleDragging = false;
		}

		function scrollListToHandlePosition() {
			let handleTop = scrollHandle.offset().top - scrollBar.offset().top;
			let scrollFraction = handleTop / (scrollBar.innerHeight() - scrollHandle.outerHeight() - 2);
			let listTop = scrollFraction * (listElement[0].scrollHeight - 150);
			listElement[0].scrollTo(0, listTop);
		}

		function showhideChoices() {
			if (boxElement.hasClass('expanded')) {
				boxElement.removeClass('expanded').addClass('collapsed');
				veilElement.removeClass('expanded').addClass('collapsed');
			} else {
				if(!cssExDef){
					cssExpanded.width = container[0].offsetWidth+'px';
					listElement.css(cssExpanded);
				}
				boxElement.addClass('expanded').removeClass('collapsed'); //the veil is now going to expand over the whole browser window, so the listElement must be positioned correctly
				veilElement.addClass('expanded').removeClass('collapsed'); //the veil is now going to expand over the whole browser window, so the listElement must be positioned correctly
				adjustPosition();
			}
		}

		function adjustPosition() {
			if (boxElement.hasClass('collapsed')) {
				//no need to reposition anything if DL is collapsed
				return;
			}
			const pos = boxElement.offset();
			pos.top += boxElement.outerHeight() - 1;
			if (pos.top + listElement.outerHeight() > window.innerHeight) {
				pos.top -= boxElement.outerHeight() + listElement.outerHeight() - 2;
			}
			listElement.offset(pos);

			let h = listElement[0].scrollHeight;
			if (h > 150) {
				let hp = 150 / h;
				scrollHandle.css('height', (hp * 100) + "%");
				listElement.addClass('jsDL_showScrollBar');
			} else {
				listElement.removeClass('jsDL_showScrollBar');
			}
			pos.top += 1;
			pos.left += listElement.outerWidth() - 15;
			scrollBar.offset(pos);
			scrollBar.css('height', listElement.outerHeight() - 2 + 'px');
		}

		function sortList() {
			if (order === 'value') {
				listElement.html(listElement.children('li').sort(function(a, b) {
					return decodeHex($(a).attr('data-sid')).toUpperCase().localeCompare(decodeHex($(b).attr('data-sid')).toUpperCase());
				}));
			} else {
				listElement.html(listElement.children('li').sort(function(a, b) {
					return $(a).text().toUpperCase().localeCompare($(b).text().toUpperCase());
				}));
			}
			$.each(elements, function(k, v) {
				//recover clicks
				jsph.listen($(`[data-sid='${encodeToHex(v.value) + suffix}']`), {
					callbacks: {
						up: (e) => {
							e.stopPropagation();
							chgStatus(v.value);
						}
					},
					allowScrolling: true,
					hoverClass: 'jsdl_hovered'
				});
			});
		}

		function chgStatus(eValue) {
			//if there are no elements to choose from, no choice can be made
			if (elements.length === 0) return;

			let obj = fetchObjectFromArray(elements, {value: eValue});
			if (obj === false) {
				//if no element with the required value is present select the first one in the list as fallback
				obj = elements[0];
			}
			value = obj.value;
			listElement.children().removeClass('selected');
			listElement.find(`li[data-sid="${encodeToHex(value) + suffix}"]`).addClass('selected');

			//perform change
			boxSpan.html(obj.label);
			showhideChoices();

			//call onChange handler
			dirtyflag = (value !== initialValue);
			triggerChange();
		}

		function triggerChange() {
			if (changeCallback) {
				changeCallback.call(self, id, value, dirtyflag, dataId);
			}
		}

		//fetch an object from an array based on one or more properties of the object
		function fetchObjectFromArray(a, params) {
			for (let i in a) {
				let match = true;
				for (let k in params) {
					if (typeof(a[i][k]) === 'undefined' || a[i][k] !== params[k]) {
						match = false;
					}
				}
				if (match) return cloneObj(a[i]);
			}
			return false;
		}

		//create a new copy of an object with no references to the old
		function cloneObj(o) {
			return $.extend(true, {}, o);
		}

		/* public methods */
		function clearElements() {
			//clears all choices from list
			elements = [];
			listElement.html('');
			boxSpan.html(noChoiceTitle);
			listElement.children().removeClass('selected');
			if (listElement.is(":visible")) {
				showhideChoices();
			}
			initialValue = value = '';
			dirtyflag = false;
		}

		function setElements(newElements, newValue) {
			//import a set of new elements and optionally preselect the one with value = newValue
			clearElements();
			$.each(newElements, function(k, v) {
				addElement(v.value, v.label);
			});
			if (typeof (newValue) !== 'undefined') {
				reset(newValue);
			}
		}

		function lock() {
			if (locked) return;
			//enables read-only modus
			listElement.addClass('readonly').removeClass('expanded').removeClass('active');
			boxElement.addClass('readonly').removeClass('expanded').removeClass('active');
			jsph.clear(boxElement);
			locked = true;
		}

		function unlock() {
			if (!locked) return;
			//disables read-only modus
			listElement.removeClass('readonly').addClass('active');
			boxElement.removeClass('readonly').addClass('active');
			jsph.listen(boxElement, {
				callbacks: {
					click: () => showhideChoices()
				}
			});
			locked = false;
		}

		function setDataId(newDataId) {
			//updates the dataId of the group
			dataId = newDataId;
		}

		function getDataId() {
			//returns the dataId of the group
			return dataId;
		}

		function addElement(newValue, newLabel) {
			if (newValue === undefined) {
				console.trace('Value must be defined! Skipping element creation.');
				return;
			}
			if (!newLabel)
				newLabel = '&nbsp;';
			//check if list was empty to display the default list title
			if (elements.length === 0) {
				boxSpan.html(listTitle);
				if (listElement.is(":visible")) {
					showhideChoices();
				}
			}
			//adds an additional element
			listElement.css('width', 'auto');
			if ($(`li[data-sid="${encodeToHex(newValue) + suffix}"]`).length === 0) {
				listElement.append(`<li data-sid="${encodeToHex(newValue) + suffix}">${newLabel}</li>`);
				jsph.listen($(`[data-sid='${encodeToHex(newValue) + suffix}']`), {
					callbacks: {
						up: (e) => {
							e.stopPropagation();
							chgStatus(newValue);
						}
					},
					allowScrolling: true,
					hoverClass: 'jsdl_hovered'
				});
				//Pushing new element to jquery object
				elements.push({
					value: newValue,
					label: newLabel
				});
				if (order !== '') {
					sortList();
				}
			} else {
				console.log('An element with that value is already present. Cannot create duplicate!');
			}
			if (!cssExDef) {
				if (!width === false) {
					cssExpanded.width = '100%';
				} else {
					cssExpanded.width = `calc(${listElement.innerWidth()}px + 2.5em)`;
				}
			}
			if (!cssCollDef) {
				cssCollapsed.width = cssExpanded.width;
			}
			boxElement.css('width', cssCollapsed.width);
			listElement.css('width', cssExpanded.width);
		}

		function getValue() {
			return value;
		}

		function reset(newValue, keepLists) {
			//if there are no elements to choose from, no choice can be made
			if (elements.length === 0) return;

			let obj = fetchObjectFromArray(elements, {value: newValue});
			if (obj === false) {
				//if no element with the required value is present select the first one in the list as fallback
				obj = elements[0];
			}
			value = obj.value;
			listElement.children().removeClass('selected');
			listElement.find(`li[data-sid="${encodeToHex(value) + suffix}"]`).addClass('selected');
			initialValue = value;
			dirtyflag = false;

			//perform change
			boxSpan.html(obj.label);
		}

		function removeElements(toRemove) {
			$.each(toRemove, function(k, v) {
				const el = $(`[data-sid='${encodeToHex(v) + suffix}']`);
				if (v === value) {
					boxSpan.html(listTitle);
				}
				jsph.clear(el);
				el.remove();
				for (let i = 0; i < elements.length; i++) {
					if (elements[i]['value'] === v) {
						elements.splice(i, 1);
						break;
					}
				}
			});
			if (elements.length === 0) {
				boxSpan.html(noChoiceTitle);
				if (listElement.is(":visible")) {
					showhideChoices();
				}
				lock();
			}
		}

		function destroy() {
			container.remove();
			veilElement.remove();
			delete window.jsdlManager.list[listId];
		}

		/* export methods */
		this.lock = lock;
		this.unlock = unlock;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.addElement = addElement;
		this.removeElements = removeElements;
		this.getValue = getValue;
		this.reset = reset;
		this.setElements = setElements;
		this.clearElements = clearElements;
		this.adjustPosition = adjustPosition;
		this.destroy = destroy;
	}

	/* export class */
	window.jsDropList = jsDropList;

})(jQuery);
