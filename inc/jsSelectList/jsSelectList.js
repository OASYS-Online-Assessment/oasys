/*

 jsSelectList v2.01
 (c) 2014-2025 by Eric J. Francois

 DEPENDENCIES:
	rixTools, nxButton 3.04+, jsPointerHandler V2.1.0+, he library (https://github.com/mathiasbynens/he)


 USAGE:
	include the CSS and the JS file in your HTML document
	instantiate the list with:
	new jsSelectList(parent, id, options);


 PARAMETERS:
	parent:		name of parent HTML element or jQuery object
	id:			id for the new list
	options:		an object with the following options
		labelKey						string		name of the key to use for the label, defaults to 'name'
		idKey							string		name of the key to use as unique id, defaults to 'id'
		orderKey						string		name of the key to use for sorting the list, defaults to 'id'
		secondaryOrderKey				string		name of the key to use for sorting when the values of the orderKey are identical
		prefixKey						string		name of the key to use for the prefix of the label, defaults to null (no prefix)
		postfixKey						string		name of the key to use for the postfix of the label, defaults to null (no postfix)
		prefixFormat					string		format of the prefix (may contain HTML tags like <b>, <i>, etc.)
													the format string must contain the placeholder %@ which will then be replaced by the value of the prefix (see prefixKey)
													the default format string is "%@"
		postfixFormat					string		same as prefixFormat, just applied to the postfix
		classConditions					object		object with class names as keys and objects as conditions
													each object must have the keys 'path' and 'value'
													'path' is an array of strings representing the path to the value in the item object
													'value' is the value to compare with which will decide whether the class should be added
		preSelectionCallback			function	if cancelSingleClickOnDoubleClick is true, this function will be called on single click immediately in preparation for a possible double click or a delayed selection; ignored if cancelSingleClickOnDoubleClick is false
		selectionCallback				function	callback function to trigger on changing the selection
		activationCallback				function	callback function to trigger on doubleclicking an item
		sections						object		list of sections (the key defines the value an element must have to belong to this section, the value is the label)
		sectionPath						array		array of strings representing the path to the section value in the item object that defines the section of the item; maybe be given as a string for a top-level key
		defaultSection					string		if the property described by sectionPath does not exist, this section will be used as default for all items that do not have a section value
		sectionGetter					function	callback function to get the section value of an item, useful when the logic to determine the section is more complex than just a path
		sectionButtons					object		a list of buttons to add to the footer of each section
													the keys must match the keys of the sections object
													the content must be another object with the keys label, name, callback and params
													label = label of the button, name = partial id for the button (no special characters allowed),
													callback = function to execute, params = array with paramaters to send on callback
		hideButtonsList					object		keys of object are the sections, value is an object that has keys of button names with a boolean value whether to hide that button for this section
		hideButtonsKey					string		if item has a truthy value for this key, the buttons will not be shown for this item (example: the item has a property 'locked': true, then the buttons will not be shown)
		buttons							array		list of objects for buttons to show when hovering an item (see nxButton for the supported options)
		headerButton					object		nxButton options for a button to show in the header of the list above all sections
		footerButton					object		nxButton options for a button to show in the footer of the list beneath all sections
		sectionTitleButton				object		nxButton options for a button to show in the section title floating on the right side
		cancelSingleClickOnDoubleClick	boolean		if true, the single click callback will not be sent if a second click is detected within 500ms


 METHODS:
	setItems(items)					sets the items of the list
			items:					array of objects (the objects may have any number of values, the keys of which are defined in the options)
	addItems(items)					adds the new items to the already existing ones
			items:					same as in setItems method
	removeItems(items)				removes the indicated items from the list
			items:					array of ids of the items to remove
	updateItem(item, [id])			updates data of a single item, or replaces item with id 'id' with item 'item'
			item:					new data for the item to update
	getItem(id)						fetch item data based on its id
	clearList()						clears the entire list
	enable()						reenables a list that has previously been disabled
	disable()						disabled the list, so that nothing can be selected
	getSelection()					returns the currently selected item (with complete data) or false if nothing is selected
	setSelection(newSelection)		programmatically set the selection
			newSelection:			an array of ids that should be selected (currently it should contain only exactly one item, until multiple selection is implemented)
	hideSection()					hide a section with its items
	showSection()					show a previously hidden section
	clearVisibility()				show all previously hidden sections
	getJQueryListItems()			returns a jQuery object containing all LI elements of the list
	getJQueryVisibleListItems()		returns a jQuery object containing all VISIBLE LI elements of the list
	getJQerySelectedListItems()		returns a jQuery object containing all SELECTED LI elements of the list


 EXAMPLE:
	let testItems = [
		{id: 'A', name: 'Item A'},
		{id: 'B', name: 'Item B'},
		{id: 'C', name: 'Item C'},
		{id: 'X', name: 'Item X'}
	];
	let itemList = new jsSelectList(gui.items, 'itemSelector', {labelKey: 'name', orderKey: 'id', idKey: 'id', prefixKey: 'id', prefixFormat: '<b>[%@]</b>', selectionCallback: itemSelected});
	itemList.setItems(testItems);
	itemList.addItems([{id: 'D', name: 'Item D'}]);
	itemList.setSelection(['D']);
	itemList.removeItems(['B']);
	alert(JSON.stringify(gui.itemList.getSelection()));

 */

"use strict";

	class jsSelectList {
		constructor(parent, id, options) {
			// rixToolsSetPrefs('debugLevel', 1);
			let data;
			let i;
			if (typeof(parent) === 'string') {
				parent = $(parent);
			}
			this.hoverId = false;
			this.delay = options.cancelSingleClickOnDoubleClick ?? false;
			this.preSelectionCallback = this.delay ? (options.preSelectionCallback ?? null) : null;
			this.selectionCallback = options.selectionCallback ?? null;
			this.activationCallback = options.activationCallback ?? null;
			this.labelKey = options.labelKey ?? 'name';
			this.orderKey = options.orderKey ?? 'id';
			this.secondaryOrderKey = options.secondaryOrderKey ?? null;
			this.idKey = options.idKey ?? 'id';
			this.prefixKey = options.prefixKey ?? null;
			this.postfixKey = options.postfixKey ?? null;
			this.hideButtonsKey = options.hideButtonsKey ?? null;
			this.prefixFormat = options.prefixFormat ?? "%@";
			this.postfixFormat = options.postfixFormat ?? "%@";
			this.classConditions = options.classConditions ?? null;
			this.buttonData = options.buttons ?? [];
			this.buttons = {};
			this.footerButtonData = options.footerButton ?? null;
			this.footerButton = {};
			this.headerButtonData = options.headerButton ?? null;
			this.headerButton = {};
			this.hideButtonsList = options.hideButtonsList ?? {};
			this.sections = options.sections ?? null;
			this.sectionPath = options.sectionPath ?? null;
			if (this.sectionPath && typeof(this.sectionPath) === 'string') {
				this.sectionPath = [this.sectionPath]; //convert to array
			}
			this.defaultSection = options.defaultSection ?? null;
			this.sectionGetter = options.sectionGetter ?? null;
			if (this.sectionGetter && typeof(this.sectionGetter) !== 'function') {
				this.sectionGetter = null; //if the sectionGetter is not a function, we ignore it
			} else if (this.sectionGetter && typeof(this.sectionGetter) === 'function') {
				//if the sectionGetter is a function, we will use it to get the section value of an item
				this.sectionPath = null; //we ignore the sectionPath if a sectionGetter is given
				this.defaultSection = null; //we ignore the defaultSection if a sectionGetter is given
			}
			this.sectionButtonData = options.sectionButtons ?? null;
			this.sectionTitleButtonData = options.sectionTitleButton ?? null;
			this.sectionButtons = {};
			this.sectionTitleButtons = {};
			this.hiddenSections = [];
			this.completeItemList = []; //this array will contain all LI elements in order
			this.timer = -1;
			this.pointerHandler = jsPointerHandler.instance;

			this.disabled = false;

			let html = `<div id='${id}_header' class='jsSelectListHeader'></div><div id='${id}' class='jsSelectList'></div><div id='${id}_footer' class='jsSelectListFooter'></div><div id='${id}_storage' class='jsSelectListStorage'></div>`;
			parent.append(html);
			this.element = $('#' + id);
			this.storage = $(`#${id}_storage`);
			this.header = $(`#${id}_header`);
			this.footer = $(`#${id}_footer`);
			this.items = [];
			this.selection = [];
			this.listMode = 'single'; //multiple select is not implemented yet

			this.pointerHandler.listen(this.element, {
				callbacks: {
					click: this.onChange.bind(this),
					dblclick: this.onActivate.bind(this)
				}
			});

			this.createButtons();

			for (i in this.sectionButtonData) {
				data = this.sectionButtonData[i];
				const buttonOptions = {
					label: data.label,
					callback: data.callback,
					params: data.params,
					value: i,
					style: {'margin-bottom': '10px'}
				};
				this.sectionButtons[i] = {};
				this.sectionButtons[i].instance = new nxButton(this.storage, id + '_button_' + data.name, buttonOptions);
				this.sectionButtons[i].element = this.sectionButtons[i].instance.element;
			}

			if (this.sectionTitleButtonData && this.sections) {
				for (i in this.sections) {
					data = cloneObj(this.sectionTitleButtonData);
					if (!data.value && !data.parameters) {
						data.value = i;
					}
					this.sectionTitleButtons[i] = {};
					this.sectionTitleButtons[i].instance = new nxButton(this.storage, id + '_titleButton_' + i, data);
					this.sectionTitleButtons[i].element = this.sectionTitleButtons[i].instance.element;
				}
			}

			if (this.headerButtonData) {
				const buttonOptions = {
					label: this.headerButtonData.label,
					callback: this.headerButtonData.callback,
					params: this.headerButtonData.params
				};
				this.headerButton.instance = new nxButton(this.header, id + '_button_' + this.headerButtonData.name, buttonOptions);
				this.headerButton.element = this.headerButton.instance.element;
			}

			if (this.footerButtonData) {
				const buttonOptions = {
					label: this.footerButtonData.label,
					callback: this.footerButtonData.callback,
					params: this.footerButtonData.params
				};
				this.footerButton.instance = new nxButton(this.footer, id + '_button_' + this.footerButtonData.name, buttonOptions);
				this.footerButton.element = this.footerButton.instance.element;
			}

			this.updateList();
		}

		setItems(newItems) {
			rixToolsDebug(1, 'jsSelectList.setItems', newItems);
			this.clearList(true);
			this.addItems(newItems);
		}

		addItems(newItems) {
			rixToolsDebug(1, 'jsSelectList.addItems', newItems);
			for (let k in newItems) {
				this.items.push(newItems[k]);
			}
			this.updateList();
		}

		removeItems(killList) {
			rixToolsDebug(1, 'jsSelectList.removeItems', killList);
			for (let i in killList) {
				const k = this.getItemPosition(killList[i]);
				if (k !== false) this.items.splice(k, 1);
			}
			this.updateList();
		}

		updateItem(updatedItem, id) {
			rixToolsDebug(1, 'jsSelectList.updateItem', updatedItem, id);
			let pos;
			if (id) {
				pos = this.getItemPosition(id);
			} else {
				pos = this.getItemPosition(updatedItem[this.idKey]);
			}
			if (pos === false) return false;
			this.items[pos] = updatedItem;
			this.updateList();
		}

		clearList(skipUpdate) {
			rixToolsDebug(1, 'jsSelectList.clearList');
			this.items = [];
			if (!skipUpdate) this.updateList();
		}

		hideSection(section) {
			rixToolsDebug(1, 'jsSelectList.hideSection', section);
			if (this.hiddenSections.indexOf(section) > -1) return;
			this.hiddenSections.push(section);
			this.updateVisibility();
		}

		showSection(section) {
			rixToolsDebug(1, 'jsSelectList.showSection', section);
			removeFromArray(this.hiddenSections, section);
			this.updateVisibility();
		}

		clearVisibility() {
			rixToolsDebug(1, 'jsSelectList.clearVisibility');
			this.hiddenSections = [];
			this.updateVisibility();
		}

		getSelection() {
			rixToolsDebug(1, 'jsSelectList.getSelection');
			let returnValues;
			if (this.selection.length === 0) {
				returnValues = false;
			} else if (this.listMode === 'single') {
				returnValues = this.getItem(this.selection[0]);
			} else {
				returnValues = [];
				for (let i in this.selection) {
					returnValues.push(this.getItem(this.selection[i]));
				}
			}
			return cloneObj(returnValues);
		}

		clearSelection() {
			rixToolsDebug(1, 'jsSelectList.clearSelection');
			this.selection = [];
			this.element.find('li').removeClass('selected');
		}

		setSelection(newSelection) {
			rixToolsDebug(1, 'jsSelectList.setSelection', newSelection);
			if (!Array.isArray(newSelection)) {
				newSelection = [newSelection];
			}
			this.selection = newSelection;
			this.refreshSelection();
		}

		enable() {
			rixToolsDebug(1, 'jsSelectList.enable');
			let i;
			this.disabled = false;
			this.element.removeClass('disabled');
			for (i in this.sectionButtons) {
				this.sectionButtons[i].instance.show();
			}
			for (i in this.sectionTitleButtons) {
				this.sectionTitleButtons[i].instance.show();
			}
		}

		disable() {
			rixToolsDebug(1, 'jsSelectList.disable');
			let i;
			this.disabled = true;
			this.clearSelection();
			this.element.addClass('disabled');
			for (i in this.sectionButtons) {
				this.sectionButtons[i].instance.hide();
			}
			for (i in this.sectionTitleButtons) {
				this.sectionTitleButtons[i].instance.hide();
			}
		}

		getItem(itemId) {
			rixToolsDebug(1, 'jsSelectList.getItem', itemId);
			for (let i in this.items) {
				if (this.items[i][this.idKey] === itemId) {
					return this.items[i];
				}
			}
			return null;
		}

		getId(li) {
			rixToolsDebug(1, 'jsSelectList.getId', li);
			return this.items[li.data('id')][this.idKey];
		}

		moveUp() {
			rixToolsDebug(1, 'jsSelectList.moveUp');
			let li;
			if (this.disabled) return;
			if (this.selection.length === 0) {
				li = this.element.find('li').last();
			} else {
				let idx = this.completeItemList.index(this.element.find('li.selected').first());
				idx--;
				if (idx < 0) idx = this.completeItemList.length - 1;
				li = $(this.completeItemList[idx]);
			}
			if (li.length === 0) return;
			this.setSelection([this.getId(li)]);
			this.triggerSelectionCallback();
		}

		moveDown() {
			rixToolsDebug(1, 'jsSelectList.moveDown');
			let li;
			if (this.disabled) return;
			if (this.selection.length === 0) {
				li = this.element.find('li').first();
			} else {
				let idx = this.completeItemList.index(this.element.find('li.selected').last());
				idx++;
				if (this.completeItemList.length <= idx) idx = 0;
				li = $(this.completeItemList[idx]);
			}
			if (li.length === 0) return;
			this.setSelection([this.getId(li)]);
			this.triggerSelectionCallback();
		}

		delayed() {
			rixToolsDebug(1, 'jsSelectList.delayed');
			return this.timer > -1;
		}

		updateList() {
			rixToolsDebug(1, 'jsSelectList.updateList');
			let i;
			this.destroyButtons();
			for (i in this.sectionButtons) {
				this.sectionButtons[i].element.appendTo(this.storage);
			}
			for (i in this.sectionTitleButtons) {
				this.sectionTitleButtons[i].element.appendTo(this.storage);
			}

			let html = '';
			const sectionsHTML = {};
			const sectionsTitles = {};
			const sectionsLists = {};
			const sectionsFooters = {};
			this.items.sort((a, b) => {
				const nameA = a[this.orderKey].toLowerCase(), nameB = b[this.orderKey].toLowerCase();
				if (nameA < nameB) return -1;
				if (nameA > nameB) return 1;
				if (this.secondaryOrderKey) {
					const nameA2 = a[this.secondaryOrderKey].toLowerCase(), nameB2 = b[this.secondaryOrderKey].toLowerCase();
					if (nameA2 < nameB2) return -1;
					if (nameA2 > nameB2) return 1;
				}
				return 0;
			});
			let prefix = '';
			let postfix = '';
			let el, list;
			if (this.sections) {
				for (i in this.sections) {
					el = document.createElement("div");
					el = $(el);
					el.addClass('jsSelectListSectionTitle');
					el.attr('id', this.element.attr('id') + '_sectionTitle_' + i);
					el.html(`<b>${this.sections[i]}</b><div id='${this.element.attr('id')}_sectionTitleButtonWrapper_${i}' class='jsslSectionTitleButtonWrapper'></div>`);
					sectionsTitles[i] = el;

					el = document.createElement("ul");
					el = $(el);
					el.addClass('jsSelectListSectionUl');
					el.attr('id', this.element.attr('id') + '_ul_' + i);
					sectionsLists[i] = el;
				}
			} else {
				el = document.createElement("ul");
				list = $(el);
			}
			for (i in this.items) {
				if (this.prefixKey) {
					prefix = sf(this.prefixFormat, this.items[i][this.prefixKey]);
				}
				if (this.postfixKey) {
					postfix = sf(this.postfixFormat, this.items[i][this.postfixKey]);
				}
				el = document.createElement('li');
				el = $(el);
				el.attr('id', `${this.element.attr('id')}_${this.items[i][this.idKey]}`);
				el.attr('data-id', i);
				el.html(`<span class='jsSelectList-Prefix'>${prefix}</span>${he.encode(this.items[i][this.labelKey])}<span class='jsSelectList-Postfix'>${postfix}</span>`);
				if (this.classConditions) {
					for (let className in this.classConditions) {
						if (fetchFromObjPath(this.items[i], this.classConditions[className].path) === this.classConditions[className].value) {
							el.addClass(className);
						}
					}
				}
				let sectionValue = this.getSectionForItem(this.items[i]);
				if (sectionValue) {
					sectionsLists[sectionValue].append(el);
				} else {
					list.append(el);
				}
			}
			if (this.sections) {
				for (i in this.sections) {
					sectionsHTML[i] += `</ul><div id='${this.element.attr('id')}_sectionFooter_${i}' class='jsSelectListSectionFooter'></div>`;
					html += sectionsHTML[i];

					el = document.createElement("div");
					el = $(el);
					el.addClass('jsSelectListSectionFooter');
					el.attr('id', this.element.attr('id') + '_sectionFooter_' + i);
					sectionsFooters[i] = el;
				}
			}
			this.pointerHandler.clear(this.element.find('li'));
			this.element.html("");
			if (this.sections) {
				for (i in this.sections) {
					this.element.append(sectionsTitles[i]);
					this.element.append(sectionsLists[i]);
					this.element.append(sectionsFooters[i]);
				}
			} else {
				this.element.append(list);
			}
			this.pointerHandler.listen(this.element.find('li'), {
				callbacks: {
					over: this.mouseEnter.bind(this),
					leave: this.mouseLeave.bind(this)
				}
			});
			this.createButtons();
			for (i in this.sectionButtons) {
				this.sectionButtons[i].element.appendTo($('#' + this.element.attr('id') + '_sectionFooter_' + i));
			}
			for (i in this.sectionTitleButtons) {
				this.sectionTitleButtons[i].element.appendTo($('#' + this.element.attr('id') + '_sectionTitleButtonWrapper_' + i));
			}
			this.refreshSelection();
			this.completeItemList = this.element.find('li');
			this.updateVisibility();
		}

		getSectionForItem(itemData) {
			rixToolsDebug(1, 'jsSelectList.getSectionForItem', itemData);
			if (this.sectionGetter) {
				return this.sectionGetter(itemData);
			} else if (this.sectionPath) {
				return fetchFromPath(itemData, ...this.sectionPath);
			} else {
				return this.defaultSection; //will return null if no default section is set which is fine
			}
		}

		updateVisibility() {
			rixToolsDebug(1, 'jsSelectList.updateVisibility');
			$('.jsSelectListSectionTitle').show();
			$('.jsSelectListSectionUl').show();
			$('.jsSelectListSectionFooter').show();
			for (let i in this.hiddenSections) {
				$('#' + this.element.attr('id') + '_sectionTitle_' + this.hiddenSections[i]).hide();
				$('#' + this.element.attr('id') + '_ul_' + this.hiddenSections[i]).hide();
				$('#' + this.element.attr('id') + '_sectionFooter_' + this.hiddenSections[i]).hide();
			}
		}

		refreshSelection() {
			rixToolsDebug(1, 'jsSelectList.refreshSelection');
			let newTop;
			this.verifySelection();
			this.element.find('li').removeClass('selected');
			for (let i in this.selection) {
				const li = this.element.find('li[data-id=' + this.getItemPosition(this.selection[i]) + ']');
				li.addClass('selected');
				const top = li.position().top;
				const bottom = top + li.outerHeight();
				const scrollTop = li.parents('.jsFlexBoxInner').scrollTop();
				const scrollBottom = scrollTop + li.parents('.jsFlexBoxInner').innerHeight();
				if (top < 10) {
					newTop = top - 10;
					if (newTop < 0) newTop = 0;
					li.parents('.jsFlexBoxInner').scrollTop(newTop);
				}
				if (bottom + 10 > scrollBottom) {
					newTop = bottom + 10 - li.parents('.jsFlexBoxInner').innerHeight();
					li.parents('.jsFlexBoxInner').scrollTop(newTop);
				}
			}
		}

		verifySelection() {
			rixToolsDebug(1, 'jsSelectList.verifySelection');
			for (let i = 0; i < this.selection.length; i++) {
				let itemFound = false;
				for (let j in this.items) {
					if (this.items[j][this.idKey] === this.selection[i]) itemFound = true;
				}
				if (!itemFound) {
					this.selection.splice(i, 1);
					i--;
				}
			}
		}

		getItemPosition(itemId) {
			rixToolsDebug(1, 'jsSelectList.getItemPosition', itemId);
			for (let i in this.items) {
				if (this.items[i][this.idKey] === itemId) {
					return parseInt(i);
				}
			}
			return false;
		}

		getIdForPosition(pos) {
			rixToolsDebug(1, 'jsSelectList.getIdForPosition', pos);
			if (pos < 0 || pos >= this.items.length) return false;
			return this.items[pos][this.idKey];
		}

		getJQueryListItems() {
			rixToolsDebug(1, 'jsSelectList.getJQueryListItems');
			return this.element.find('li');
		}

		getJQueryVisibleListItems() {
			rixToolsDebug(1, 'jsSelectList.getJQueryVisibleListItems');
			return this.element.find('li:visible');
		}

		getJQerySelectedListItems() {
			rixToolsDebug(1, 'jsSelectList.getJQerySelectedListItems');
			return this.element.find('li.selected');
		}

		createButtons() {
			rixToolsDebug(1, 'jsSelectList.createButtons');
			for (let i in this.buttonData) {
				const data = this.buttonData[i];
				if (!data.name || data.name in this.buttons) continue;
				this.buttons[data.name] = {
					callback: data.callback || null,
					parameters: data.parameters || []
				};
				const offset = i * (data.width + 5) + 5;
				const buttonOptions = {
					icon: data.icon,
					callback: this.buttonClicked.bind(this),
					overlay: {
						top: data.top || 0,
						right: offset
					},
					value: data.name,
					tooltip: data.tooltip || ''
				};
				if (data.height) buttonOptions.iconHeight = data.height;
				if (data.width) buttonOptions.iconWidth = data.width;
				this.buttons[data.name].instance = new nxButton(this.storage, this.element.attr('id') + '_button_' + data.name, buttonOptions);
				this.buttons[data.name].element = this.buttons[data.name].instance.element;
				this.buttons[data.name].top = data.top || 0;
			}
		}

		destroyButtons() {
			rixToolsDebug(1, 'jsSelectList.destroyButtons');
			for (let i in this.buttonData) {
				const data = this.buttonData[i];
				this.buttons[data.name].instance.destroy();
				delete this.buttons[data.name];
			}
		}

		onChange(e) {
			rixToolsDebug(1, 'jsSelectList.onChange');
			if (this.disabled) return;

			const item = $(e.target);
			if (e.target.nodeName !== 'LI') return;
			if (!this.toggleSelection(item)) {
				if (this.delay) {
					this.timer = setTimeout(this.triggerSelectionCallback.bind(this), 500);
					this.triggerPreSelectionCallback();
				} else {
					this.triggerSelectionCallback();
				}
			}
		}

		toggleSelection(item) {
			rixToolsDebug(1, 'jsSelectList.toggleSelection');
			const clickId = this.getId(item);
			if (clickId === this.selection[0]) {
				return true;
			} else {
				this.selection = [];
				this.selection.push(clickId);
			}
			this.refreshSelection();
		}

		triggerPreSelectionCallback() {
			rixToolsDebug(1, 'jsSelectList.triggerPreSelectionCallback');
			if (this.preSelectionCallback) {
				this.preSelectionCallback.call(this);
			}
		}

		triggerSelectionCallback() {
			rixToolsDebug(1, 'jsSelectList.triggerSelectionCallback');
			this.stopTimer();
			if (this.selectionCallback) {
				const returnValues = this.getSelection();
				this.selectionCallback.call(this, returnValues);
			}
		}

		onActivate(e) {
			rixToolsDebug(1, 'jsSelectList.onActivate');
			if (this.disabled) return;
			if (!$(e.target).hasClass('selected')) return;
			if (this.delay) {
				this.stopTimer();
			}
			if (this.activationCallback) {
				const returnValues = this.getSelection();
				this.activationCallback.call(this, returnValues);
			}
		}

		buttonClicked(sender) {
			rixToolsDebug(1, 'jsSelectList.buttonClicked');
			this.stopTimer();
			const callback = this.buttons[sender].callback || null;
			if (!callback) return;
			for (let i in this.buttons) {
				this.buttons[i].element.appendTo(this.storage);
			}
			const parameters = deepCopy(this.buttons[sender].parameters || []);
			parameters.push(this.getItem(this.hoverId));
			this.hoverId = false;
			callback.apply(this, parameters);
		}

		mouseEnter(e) {
			rixToolsDebug(1, 'jsSelectList.mouseEnter');
			if (this.disabled) return;
			const listItem = $(e.currentTarget);
			this.hoverId = this.getId(listItem);
			let hideButtons = false;
			const itemData = this.getItem(this.hoverId);
			const section = this.getSectionForItem(itemData);
			if (this.hideButtonsKey) {
				if (itemData[this.hideButtonsKey]) {
					hideButtons = true;
				}
			}
			if (!hideButtons) {
				for (let i in this.buttons) {
					this.buttons[i].element.appendTo(listItem);
					const h = listItem.outerHeight();
					const ih = this.buttons[i].element.outerHeight();
					const vOffset = Math.round((h - ih) / 2) + this.buttons[i].top;
					this.buttons[i].instance.setPosition({top: vOffset});
					if (this.hideButtonsList[section] && this.hideButtonsList[section][i]) {
						this.buttons[i].instance.hide();
					} else {
						this.buttons[i].instance.show();
					}
				}
			}
		}

		mouseLeave() {
			rixToolsDebug(1, 'jsSelectList.mouseLeave');
			for (let i in this.buttons) {
				this.buttons[i].instance.buttonLeave();
				this.buttons[i].element.appendTo(this.storage);
			}
			this.hoverId = false;
		}

		stopTimer() {
			rixToolsDebug(1, 'jsSelectList.stopTimer');
			clearTimeout(this.timer);
			this.timer = -1;
		}
	}

	/* version history as of v2.0:
	v2.0
		- reformated to use ES6 classes
		- swapped sectionKey string property to sectionPath array property
		- added defaultSection property to use when no sectionPath is given
		- added sectionGetter function to use when the logic to determine the section is more complex than just a path
		- added headerButton in addition to the footerButton
		- added preSelectionCallback to prepare for a possible double click or delayed selection

	v2.01
		- added methods getJQueryListItems, getJQueryVisibleListItems, getJQerySelectedListItems
	 */