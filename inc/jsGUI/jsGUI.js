/*

	jsFlexBox v1.15
		(c) 2022-2024 by Eric J. Francois

	DESCRIPTION:
		this creates a flexbox with a title, that exports methods for showing and hiding, and a property for the inner container

	USAGE:

	include the CSS and the JS file in your HTML document
	instantiate the list with:
		new jsFlexBox(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			title:			string			title for the box
			minHeight:		integer			minimum height in pixels, the box should have when window is too small (forces parent to get scrollbars)
			flex:			integer			flex value of the box; defaults to 1
			panelHeight:	integer			height in pixels for the panel; defaults to 0 (no panel)
			hidden:			boolean			defines whether the box should be hidden at creation time
			noPadding:		boolean			if true, the innerbox will have no padding
			selectable:		boolean			indicates if text in the box is selectable, defaults to false

	METHODS:
		setTitle(s)			updates the title of the box to string s, or if s is null, deletes the title bar entirely
		getInnerBox()		returns the jQuery object of the inner box to be used to add content
		getPanel()			returns the jQuery object of the panel (e.g. for adding buttons)
		hide(t, f)			hides the box, t specifies the duration of the fade out effect (optional: immediate if omitted), f is the callback function when fade finishes (optional)
		show(t, f)			show a hidden box, t specifies the duration of the fade in effect (optional: immediate if omitted), f is the callback function when fade finishes (optional)
		isHidden()			returns boolean that indicates if box is hidden or not
		setFlex(i)			changes the flex value to i
		addTabs(list)		list is an array of tabs to add
		removeTabs(list)	list is an array of tabs to remove
		activateTab(v)		v is the value of the tabe to activate

	EXAMPLE:

*/

"use strict";

(function ($) {

	function jsFlexBox(parent, id, options) {

		if (!options) options = {};
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}
		let title = options.title || null;
		let minh = options.minHeight || 0;
		let flex = options.flex;
		if (!flex && flex !== 0) flex = 1;
		const panelHeight = options.panelHeight || 0;
		minh -= panelHeight;
		let hidden = options.hidden || false;
		const noPadding = options.noPadding || false;
		const tabs = options.tabs || false;
		const tabList = [];
		let activeTab;
		const callback = options.callback || null;
		const selectable = options.selectable || false;
		let locked = options.locked || false;
		const lockedClick = options.lockedClick || null;
		const lockedText = options.lockedText || '';
		const useVeil = options.useVeil || false;


		const spaceRequired = minh + 50 + panelHeight;
		const html = `<div id='box_${id}' class='jsFlexBox' style='min-height: ${minh}px; flex: ${flex}; -webkit-flex: ${flex};'><div id='${id}_veil' class='jsFlexBoxVeil'>${lockedText}</div><div id='${id}' class='jsFlexBoxInner'></div></div>`;
		parent.append(html);
		const element = $('#box_' + id);
		if (useVeil) {
			element.addClass('useVeil');
		}
		element.data('height', spaceRequired);
		const box = $('#' + id);
		//set top margin if panel is active
		if (panelHeight > 0) {
			box.css('margin-top', panelHeight + 'px');
		}

		const veil = $('#' + id + '_veil');
		if (selectable) box.addClass('jsGuiSelectable');
		if (noPadding) {
			box.addClass('noPadding');
		}
		if (title) {
			element.prepend(`<div id='title_${id}' class='jsFlexBoxTitle'><span>${title}</span></div>`);
		}
		if (tabs) {
			element.append(`<div id='${id}TabFrame' class='jsFlexBoxTabs'></div>`);
		}
		if (panelHeight > 0) {
			createFlexBoxPanel();
		}
		const panel = $(`#${id}Panel`);
		const tabFrame = $(`#${id}TabFrame`);
		const section = element.parent();
		let contentHeight = 0;
		section.children('.jsFlexBox').each(function (i) {
			contentHeight += parseInt($(this).data('height'));
		});
		section.css('min-height', contentHeight + 'px');
		if (hidden) hide();
		if (lockedClick) {
			veil.on('click', veilClicked);
		}
		if (locked) {
			lock();
		}


		/* public methods */

		function setTitle(newTitle) {
			if (!newTitle) {
				if (!title) {
					//there was no title before, and there is no new title => nothing to do
					return;
				} else {
					//there was a title before, but there no longer is one => remove title div
					$('#title_' + id).remove();
				}
			} else {
				if (!title) {
					//there was no title before, but there is one now => add title div					
					element.prepend(`<div id='title_${id}' class='jsFlexBoxTitle'><span>${newTitle}</span></div>`);
				} else {
					//there was a title before and there is a new one now => update text
					$('#title_' + id).html(`<span>${newTitle}</span>`);
				}
			}
			title = newTitle;
		}

		function getInnerBox() {
			return box;
		}

		function getPanel() {
			return panel;
		}

		function hide(t, f) {
			if (typeof (t) !== 'number') {
				element.hide();
			} else {
				if (typeof (f) !== 'function') f = null;
				element.fadeOut(t, f);
			}
			hidden = true;
		}

		function show(t, f) {
			if (typeof (t) !== 'number') {
				element.show();
			} else {
				if (typeof (f) !== 'function') f = null;
				element.fadeIn(t, f);
			}
			hidden = false;
		}

		function isHidden() {
			return hidden;
		}

		function setFlex(newFlex) {
			flex = newFlex;
			element.css({
				flex: flex,
				'-webkit-flex': flex
			});
		}

		function addTabs(list) {
			for (let i in list) {
				const value = list[i];
				if (tabList.indexOf(value) > -1) continue;
				tabList.push(value);
			}
			refreshTabs();
		}

		function removeTabs(list) {
			for (let i in list) {
				const value = list[i];
				if (tabList.indexOf(value) === -1) continue;
				tabList.splice(tabList.indexOf(value), 1);
			}
			refreshTabs();
		}

		function activateTab(v) {
			if (v !== activeTab) {
				activeTab = v;
				tabFrame.children().removeClass('.active');
				tabFrame.find(`[data-value=${activeTab}]`).addClass('active');
			}
			if (callback) callback.call(this, activeTab);
		}

		function lock() {
			locked = true;
			element.addClass('locked');
		}

		function unlock() {
			locked = false;
			element.removeClass('locked');
		}

		/* private functions */

		function veilClicked() {
			if (!locked) return;
			lockedClick.call(this, id);
		}

		function refreshTabs() {
			tabList.sort(function (a, b) {
				if (a.toLowerCase() < b.toLowerCase()) //sort string ascending
					return -1;
				if (a.toLowerCase() > b.toLowerCase())
					return 1;
				return 0; //default return value (no sorting)
			});
			tabFrame.html('');
			if (tabList.length === 0) {
				activeTab = null;
			}
			for (let i in tabList) {
				tabFrame.append(`<div class='jsFlexBoxTab' data-value='${tabList[i]}'>${tabList[i]}</div>`);
			}
			tabFrame.children().on('click', tabClicked);
			if (activeTab) {
				if (tabList.indexOf(activeTab) === -1) {
					activeTab = tabList[0];
					activateTab(activeTab);
				}
				tabFrame.find(`[data-value=${activeTab}]`).addClass('active');
			}
			let w = tabFrame.outerWidth();
			if (w > 0) w += 10;
			element.css('margin-left', w + 'px');
		}

		function tabClicked(e) {
			const tab = $(e.delegateTarget);
			const value = tab.data('value');
			tabFrame.children().removeClass('active');
			tab.addClass('active');
			activeTab = value;
			activateTab(activeTab);
		}

		function createFlexBoxPanel() {
			const html = `<div id='${id}Panel' class='jsFlexBoxPanel' style='height: ${panelHeight}px'></div>`;
			element.append(html);
		}

		//export methods
		this.setTitle = setTitle;
		this.getInnerBox = getInnerBox;
		this.getPanel = getPanel;
		this.hide = hide;
		this.show = show;
		this.isHidden = isHidden;
		this.addTabs = addTabs;
		this.removeTabs = removeTabs;
		this.activateTab = activateTab;
		this.lock = lock;
		this.unlock = unlock;
		this.setFlex = setFlex;

	}

	//export class
	window.jsFlexBox = jsFlexBox;

})(jQuery);

/*

	jsInterfaceRow v1.12
		(c) 2014 by Eric J. Francois

	DESCRIPTION:
		this does nothing whatsoever

	USAGE:

		include the CSS and the JS file in your HTML document
		instantiate the list with:
			new jsInterfaceRow(parent, label, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		label:		text to put into the label cell
		options:	dictionary with options

	OPTIONS:
		alignmentLabel:			string		CSS value for 'text-align' of label cell (default: left)
		alignmentProperty:		string		CSS value for 'text-align' of property cell (default: left)

	METHODS:
		show()
		hide()
		setLabel(s)
		getPropertyCell()			returns jQuery object of property cell for adding the property field
		setPropertyField(obj)		sets the propertyField to obj (obj must be a jQuery object)
		getPropertyField()			return the propertyField jQuery object
		lock()						forwards method to input field an disables hover effect
		unlock()					forwards method to input field an enables hover effect
		reset(v)					forwards method to input field
		activate()					forwards method to input field
		setText()					forwards method to input field
		setDataId()					forwards method to input field
		getDataId()					forwards method to input field
		setPrefix(s)				forwards method to input field

*/

(function ($) {

	function jsInterfaceRow(parent, label, options) {

		let lockState = false;
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}

		if (!options) options = {};
		const alignmentLabel = options.alignmentLabel || 'left';
		const alignmentProperty = options.alignmentProperty || 'left';
		const onOffSwitch = options.onOffSwitch || false;
		const switchCallback = options.onSwitchclick || null;
		const dataId = options.dataId || null;
		const uncheckedSrc = './inc/filer/images/unchecked_checkbox.png';
		const checkedSrc = './inc/filer/images/checked_checkbox.png';
		const self = this;
		const twoRows = options.twoRows || false;
		const noLabel = options.noLabel || false;


		parent.append("<div class='jsInterfaceRow'><div class='jsInterfaceRowLabelCell'></div><div class='jsInterfaceRowPropertyCell'></div></div>");
		const element = parent.find('div.jsInterfaceRow').last();
		if (twoRows) {
			element.addClass('twoRows');
		}
		if (noLabel) {
			element.addClass('noLabel');
		}
		const labelCell = element.find('.jsInterfaceRowLabelCell');
		const propertyCell = element.find('.jsInterfaceRowPropertyCell');
		labelCell.css('text-align', alignmentLabel);
		propertyCell.css('text-align', alignmentProperty);
		let propertyField;
		setLabel(label || '');
		element.on('click', onClick);

		if (onOffSwitch) $(labelCell).prepend("<img class='jsInterfaceRowOoSwitch' src=" + uncheckedSrc + "  style='height:16px' />&nbsp;");
		const ooSwitchClick = element.find('.jsInterfaceRowOoSwitch');

		/* public methods */

		function hide(v) {
			if (!v) {
				element.hide();
			} else {
				element.slideUp(v);
			}
		}

		function show(v) {
			if (!v) {
				element.show();
			} else {
				element.slideDown(v);
			}
		}

		function setLabel(newLabel) {
			label = newLabel;
			labelCell.html(label);
		}

		function getPropertyCell() {
			return propertyCell;
		}

		function setPropertyField(obj) {
			propertyField = obj;
		}

		function getPropertyField() {
			return propertyField;
		}

		function lock() {
			if (propertyField && propertyField.lock) {
				propertyField.lock();
			}
			element.addClass('lockedInterfaceRow');
			lockState = true;
		}

		function unlock() {
			if (propertyField && propertyField.unlock) {
				propertyField.unlock();
			}
			element.removeClass('lockedInterfaceRow');
			lockState = false;
		}

		function lockSwitch() {
			element.off('click', onClick);
			ooSwitchClick.off('click', onClick);
		}

		function unlockSwitch() {
			element.on('click', onClick);
			ooSwitchClick.on('click', onClick);
		}

		function clickSwitch(noCallback) {
			if (lockState) {
				unlock();
				$(ooSwitchClick).attr('src', checkedSrc);
				if (switchCallback && !noCallback) switchCallback.call(self, dataId, true);
			} else {
				lock();
				$(ooSwitchClick).attr('src', uncheckedSrc);
				if (switchCallback && !noCallback) switchCallback.call(self, dataId, false);
			}
		}

		function resetSwitches() {
			$(ooSwitchClick).attr('src', uncheckedSrc);
		}

		function triggerCallBack() {
			if (propertyField && propertyField.triggerCallBack) {
				propertyField.triggerCallBack();
			}
		}

		function activate() {
			if (propertyField && propertyField.activate) {
				propertyField.activate();
			}
		}

		function reset(v) {
			if (propertyField && propertyField.reset) {
				propertyField.reset(v);
			}
		}

		function setText(v) {
			if (propertyField && propertyField.setText) {
				propertyField.setText(v);
			}
		}

		function setDataId(v) {
			if (propertyField && propertyField.setDataId) {
				propertyField.setDataId(v);
			}
		}

		function getDataId() {
			if (propertyField && propertyField.getDataId) {
				return propertyField.getDataId();
			}
			return false;
		}

		function setPrefix(s) {
			if (propertyField && propertyField.setPrefix) {
				propertyField.setPrefix(s);
			}
		}


		/* private functions */

		function onClick(e) {
			e.stopPropagation();
			if ($(e.target).is("img")) {
				if (lockState) {
					unlock();
					$(ooSwitchClick).attr('src', checkedSrc);
					if (switchCallback) switchCallback.call(self, dataId, true);
				} else {
					lock();
					$(ooSwitchClick).attr('src', uncheckedSrc);
					if (switchCallback) switchCallback.call(self, dataId, false);
				}
			} else {
				activate();
			}
		}

		//export methods
		this.hide = hide;
		this.show = show;
		this.setLabel = setLabel;
		this.getPropertyCell = getPropertyCell;
		this.setPropertyField = setPropertyField;
		this.getPropertyField = getPropertyField;
		this.lock = lock;
		this.unlock = unlock;
		this.lockSwitch = lockSwitch;
		this.unlockSwitch = unlockSwitch;
		this.resetSwitches = resetSwitches;
		this.clickSwitch = clickSwitch;
		this.reset = reset;
		this.activate = activate;
		this.setText = setText;
		this.setDataId = setDataId;
		this.getDataId = getDataId;
		this.setPrefix = setPrefix;
		this.triggerCallBack = triggerCallBack;

	}

	//export class
	window.jsInterfaceRow = jsInterfaceRow;

})(jQuery);

/*

	jsStatusBar v1.0
		(c) 2014 by Eric J. Francois

	DESCRIPTION:
		this adds a status bar to the UI that can change text and background colour and also show temporary messages

	USAGE:
		instantiate the list with:
			new jsStatusBar(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			prepend			boolean		if true, the statusbar is added as first child of parent, rather than last
			defaultColour	string		CSS colour string to use as default background ('rgb(41, 41, 41)' if omitted)
			prefix			string		prefix to always show in front of whatever the message is
			useQueue		boolean		queue up all messages and show them one after another if this option is TRUE


	METHODS:
		setStatus(text, ttl, colour)		sets a new status text
												ttl is the time to live in milliseconds, before returning to standard message
												if ttl is omitted, the standard message is changed
												colour is a CSS colour string for the background during this message


*/

(function ($) {

	function jsStatusBar(parent, id, options) {

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}


		/* optional settings */
		const prepend = options.prepend || false;
		const prefix = options.prefix || '';
		const themeStatusColour = getComputedStyle(document.documentElement)
			.getPropertyValue('--oasys-status-bg').trim();
		const defaultColour = options.defaultColour || themeStatusColour || '#182f3b';
		let status = options.message || '';
		const useQueue = options.useQueue || false;
		const statusClasses = 'jsStatusBar-error jsStatusBar-warning jsStatusBar-success jsStatusBar-info';

		/* creation */
		const html = `<div id='${id}'></div>`;
		if (prepend) {
			parent.prepend(html);
		} else {
			parent.append(html);
		}
		const element = $('#' + id);
		element.css('background-color', defaultColour);

		let statusTimer = false;
		const statusQueue = [];
		setStatus(status);


		/* public methods */

		function setStatus(text, ttl, colour) {
			if (!ttl) {
				status = text;
				if (statusTimer === false) element.html(prefix + status);
				if (colour) setStatusStyle(colour);
				else if (statusTimer === false) setStatusStyle(false);
			} else {
				statusQueue.push({text: text, ttl: ttl, colour: colour});
				if (statusTimer === false || useQueue === false) {
					if (statusTimer) clearTimeout(statusTimer);
					advanceStatusQueue();
				}
			}
		}

		/* private functions */

		function advanceStatusQueue() {
			if (statusQueue.length > 0) {
				const msg = statusQueue.shift();
				element.html(prefix + msg.text);
				setStatusStyle(msg.colour);
				statusTimer = setTimeout(advanceStatusQueue, msg.ttl);
			} else {
				element.html(prefix + status);
				setStatusStyle(false);
				statusTimer = false;
			}
		}

		function setStatusStyle(colour) {
			const semanticColour = resolveSemanticColour(colour);
			element.removeClass(statusClasses);
			if (semanticColour) {
				element.css('background-color', '');
				element.addClass('jsStatusBar-' + semanticColour);
			} else if (colour) {
				element.animate({backgroundColor: colour}, 100);
			} else {
				element.animate({backgroundColor: defaultColour}, 100);
			}
		}

		function resolveSemanticColour(colour) {
			if (!colour) return false;
			const value = String(colour).trim().toLowerCase();
			const map = {
				'error': 'error',
				'danger': 'error',
				'red': 'error',
				'#f00': 'error',
				'#ff0000': 'error',
				'#dd1a00': 'error',
				'#aa2121': 'error',
				'rgb(255, 0, 0)': 'error',
				'warning': 'warning',
				'warn': 'warning',
				'yellow': 'warning',
				'orange': 'warning',
				'#a60': 'warning',
				'#aa6600': 'warning',
				'success': 'success',
				'ok': 'success',
				'green': 'success',
				'#0f0': 'success',
				'#0a0': 'success',
				'#00ff00': 'success',
				'#00aa00': 'success',
				'#22aa41': 'success',
				'rgb(0, 170, 0)': 'success',
				'rgb(0, 180, 0)': 'success',
				'info': 'info',
				'blue': 'info'
			};
			return map[value] || false;
		}

		/* export methods */
		this.setStatus = setStatus;

	}

	/* export class */
	window.jsStatusBar = jsStatusBar;

})(jQuery);

/*

	jsSidePanel v2.02
		(c) 2022 by Eric J. Francois
		
	DESCRIPTION:
		this installs an absolutely positioned panel left or right in its parent
		the panel may contain several sections that can opened and closed

	USAGE:

	include the CSS and the JS file in your HTML document
	instantiate the list with:
		new jsSidePanel(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			sections		map					a dictionary of sections to create
			dock			string				'right' if you want the sidebar to dock to the right side; defaults to 'left'
			width			number or string	width of sidebar as number of pixels or css string


	METHODS:
		setSection(sectionId, html)			replaces the contents of section with id 'sectionId' with the indicated html code

	EXAMPLE:

*/

(function ($) {

	function jsSidePanel(parent, id, options) {

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}
		if (!options) options = {};

		/* optional settings */
		const sectionList = options.sections || ['default'];
		const dock = options.dock || 'left';
		let width = options.width || '200px';
		let minWidth = options.minWidth || width;
		let maxWidth = options.maxWidth || width;
		let hideSectionTitles = options.hideSectionTitles || false;
		let title = options.title || null;
		if (typeof (width) === 'number') width = width + 'px';

		/* creation */
		const html = `<div id='${id}' class='jsSidePanel'><div id='${id}_handle' class='jsSidePanelHandle'></div><div id='${id}_title' class='jsSidePanelTitle'></div><div id='${id}_content' class='jsSidePanelContent'></div></div>`;
		if (dock === 'right') {
			parent.append(html);
		} else {
			parent.prepend(html);
		}
		const element = $(`#${id}`);
		const handle = $(`#${id}_handle`);
		const titleBar = $(`#${id}_title`);
		const contentBox = $(`#${id}_content`);
		if (!title) {
			titleBar.hide();
		} else {
			titleBar.text(title);
		}
		if (hideSectionTitles) {
			element.addClass('jssp_hideSectionTitles');
		}
		element.css('width', width);
		element.css('min-width', minWidth);
		element.css('max-width', maxWidth);
		element.addClass(dock);
		const sections = {};
		let hidden = false;
		const jsph = jsPointerHandler.instance;
		for (let i of sectionList.order) {
			const name = sectionList.labels[i];
			addSection(i, name);
		}
		let handleX0, handleW0;
		let resizing = false;
		jsph.listen(handle, {
			callbacks: {
				down: handleHold,
				move: handleMove,
				up: handleRelease,
				out: handleRelease,
				dblclick: resetSize
			}
		});

		/* private functions */
		function handleHold(e) {
			handleW0 = element.width();
			handleX0 = e.clientX;
			resizing = true;
		}

		function handleMove(e) {
			if (!resizing) {
				return;
			}
			let dx = e.clientX - handleX0;
			let w;
			if (dock === 'right') {
				w = handleW0 - dx;
			} else {
				w = handleW0 + dx;
			}
			element.css('width', w);
		}

		function handleRelease(e) {
			resizing = false;
		}

		function resetSize() {
			element.css('width', width);
		}

		function titleClicked(e) {
			const section = $(e.delegateTarget);
			const sectionId = section.data('section');
			 if (sections[sectionId].title.hasClass('active')) {
				 deactivateSection(sectionId);
			 } else {
				 activateSection(sectionId);
			 }
		}

		/* public methods */
		function hide() {
			hidden = true;
			element.hide();
		}

		function show() {
			hidden = false;
			element.show();
		}

		function addSection(key, name, css = null) {
			contentBox.append(`<div class="jsSidePanelSectionTitle">${name}<span class="jsSidePanelSectionIndicator"></span></div>`);
			contentBox.append(`<div id="${id}_${key}" class="jsSidePanelSection"></div>`);
			sections[key] = {
				panel: contentBox.find('.jsSidePanelSection').last(),
				title: contentBox.find('.jsSidePanelSectionTitle').last(),
				enabled: true
			};
			if (typeof(css) === 'object' && css !== null) {
				sections[key].title.css(css);
			}
			sections[key].title.addClass('active');
			sections[key].title.data('section', key);
			jsph.listen(sections[key].title, {
				callbacks: {
					click: titleClicked
				}
			})
		}

		function removeSection(key) {
			if (typeof (sections[key]) === 'undefined') {
				/* if section does not exist, do nothing */
				return;
			}
			jsph.clear(sections[key].title);
			sections[key].title.remove();
			sections[key].panel.remove();
			delete sections[key];
		}

		function removeAllSections() {
			for (let k in sections) {
				removeSection(k);
			}
		}

		function setSection(sectionId, html) {
			sections[sectionId].panel.html(html);
		}

		function clearSection(sectionId) {
			if (sectionId === '*') {
				for (let i in sections) {
					sections[i].panel.html('');
				}
			} else {
				sections[sectionId].panel.html('');
			}
		}

		function getSection(sectionId) {
			return sections[sectionId].panel;
		}

		function disableSection(sectionId) {
			sections[sectionId].title.addClass('jsspDisabled');
			// sections[sectionId].panel.addClass('jssp_hidden');
			sections[sectionId].enabled = false;
		}

		function enableSection(sectionId) {
			sections[sectionId].title.removeClass('jsspDisabled');
			// sections[sectionId].panel.removeClass('jssp_hidden');
			sections[sectionId].enabled = true;
		}

		function activateSection(sectionId) {
			if (sections[sectionId].enabled === false) return;
			sections[sectionId].title.addClass('active');
		}

		function deactivateSection(sectionId) {
			if (sections[sectionId].enabled === false) return;
			sections[sectionId].title.removeClass('active');
		}

		/* export methods */
		this.hide = hide;
		this.show = show;
		this.addSection = addSection;
		this.removeSection = removeSection;
		this.removeAllSections = removeAllSections;
		this.getSection = getSection;
		this.setSection = setSection;
		this.clearSection = clearSection;
		this.disableSection = disableSection;
		this.enableSection = enableSection;
		this.activateSection = activateSection;
		this.deactivateSection = deactivateSection;

	}

	/* export class */
	window.jsSidePanel = jsSidePanel;

})(jQuery);


/*

	jsLabel v1.04
		(c) 2014 by Eric J. Francois

	DESCRIPTION:
		This creates an interactive label, that can be easily changed, hidden or shown.
		It's useful for showing information in a web app that changes frequently

	USAGE:

	include the JS file in your HTML document
	instantiate the list with:
		new jsLabel(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			text		string							the text content for the label, will be ignored if 'labels' is defined
			labels		object							a dictionary of labels that will be shown depending of the value of the key
			value		string or number				initial value to be used with the labels dictionary
			styles		object							CSS styles to apply
			classes		string | array of strings		a list of classes to attribute to the span, or a single class name as string
			hidden		boolean							hide the label at creation

	METHODS:
		hide()			hide the label
		show()			show the label if it was hidden
		setText(s)		set the text to s
		reset(k)		sets the text to the label matching key k from dictionary 'labels'
		setLabels(m)	sets a new dictionary of labels

	EXAMPLE:
		label01 = new jsLabel(parent, 'jsLabel01', {
			text: 'some info',
			classes: ['infotag', 'propertiestag'],
			styles: {
				color: red
			},
			hidden: false
		})

*/

"use strict";

(function($) {

	function jsLabel(parent, id, options) {

		if (typeof(parent) === 'string') {
			parent = $(parent);
		}
		if (!options) options = {};
		const styles = options.styles || null;
		let classes = options.classes || null;
		let text = options.text || '';
		const hidden = options.hidden || false;
		let dataId = options.dataId || '';
		let value = null;
		let labels = options.labels || null;
		if (typeof(options.value) !== 'undefined') {
			value = options.value;
		}
		if (hidden) hide();
		if (classes && typeof(classes) === 'string') {
			classes = [classes];
		}

		const html = `<span id='${id}' class='jsLabel'>${text}</span>`;
		parent.append(html);
		const element = $('#' + id);

		if (classes) {
			for (let i in classes) {
				element.addClass(classes[i]);
			}
		}

		if (styles) {
			element.css(styles);
		}

		reset(value);

		/* methods */

		function setText(newText) {
			text = newText || '';
			element.text(text); //this must not be html() to avoid XSS
		}

		function reset(v) {
			if (v !== null && labels[v] !== null) {
				value = v;
				setText(labels[v]);
			}
		}

		function setLabels(newLabels) {
			if (newLabels) labels = newLabels;
			reset(value);
		}

		function hide() {
			element.hide();
		}

		function show() {
			element.show();
		}

		function setDataId(newDataId) {
			dataId = newDataId;
		}

		function getDataId() {
			return dataId;
		}

		//export methods
		this.setText = setText;
		this.reset = reset;
		this.setLabels = setLabels;
		this.hide = hide;
		this.show = show;
		this.setDataId = setDataId;
		this.getDataId = getDataId;

	}

	//export class
	window.jsLabel = jsLabel;

})(jQuery);

/* jsDashWidget 1.0 Tomas Kamarauskas/Willibrord Koch 2023/2025

This function creates a dashboard widget that contains:
- a title bar with the widget title text and an optional online help placeholder (span)
- a content container where the widget content can be injected later

Parameters:
* id            – identifier used for the content container (the overall widget gets {id}_dashWidget)
* title         – text displayed in the widget header
* titleClass    – optional additional CSS class for the title span
* contentClass  – optional additional CSS class for the content container
* hidden        – if true, the widget is initially hidden

Note:
The given ID applies to the content container (div), not the full widget.
To refer to the entire widget wrapper, use the ID pattern {yourGivenId}_dashWidget.
An empty <span> with the ID {yourGivenId}_help is automatically included in the title bar
and can be used as a placeholder for attaching an OasysHelp instance.
*/

(function ($) {
	function jsDashWidget(parent, id, options) {
		if (!(parent && parent.jquery)) parent = $(parent);
		options = options || {};

		const title        = options.title || "The title";
		const titleClass   = options.titleClass || "";
		const contentClass = options.contentClass || "";
		const hidden       = !!options.hidden;

		const html = `
			<div id="${id}_dashWidget" class="jsDashWidget">
				<div class="jsDashWidgetTitle">
					<span id="${id}_help" class="jsDashWidgetHelpAnchor"></span>
					<span class="jsDashWidgetTitleText ${titleClass}">${title}</span>
				</div>
				<div id="${id}" class="jsDashWidgetContentBox ${contentClass}"></div>
			</div>
		`;

		parent.append(html);
		if (hidden) $('#' + id + '_dashWidget').hide();

		// Keep existing behavior: return the content box
		return $('#' + id);
	}

	window.jsDashWidget = jsDashWidget;
})(jQuery);


