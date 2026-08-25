/*
    jsTabs v1.02
 */

class jsTabs {

	list = [];
	selected = null;
	eventTypes = {
		select: 'select_'
	};

	constructor(parent, id) {
		this.parent = parent;
		this.id = id;

		for (let i in this.eventTypes) {
			this.eventTypes[i] = this.eventTypes[i] + id;
		}

		let html = `<div id="${id}" class="jsTabsBar"></div>`;
		parent.append(html);
		this.bar = parent.find(`#${id}`);

		this.pointerHandler = jsPointerHandler.instance;
	}

	setTabs(list, language= null) {
		//if not a key/value list convert the list to an object using the same string for key and value
		if (Array.isArray(list)) {
			this.list = {};
			for (let lbl of list) {
				this.list[lbl] = lbl;
			}
		} else if (typeof (list) === 'object') {
			this.list = list;
		} else {
			console.error("jsTabs.setTabs(list) error: list must be array or object");
			return;
		}
		if (language) {
			this.selected = language;
		}
		this.renderTabs(language);
	}

	renderTabs() {
		this.pointerHandler.clear(this.bar.children('.jsTab'));

		let html = '';
		for (let i in this.list) {
			html += `<div class='jsTab' data-key='${i}'>${this.list[i]}</div>`;
		}
		this.bar.html(html);

		this.pointerHandler.listen(this.bar.children('.jsTab'), {
			callbacks: {
				click: (e) => this.tabClicked(e) //arrow function in order to preserve 'this'
			},
			hoverClass: 'jstHovered'
		});

		if (this.selected === null || typeof(this.list[this.selected]) === 'undefined') {
			if (Object.keys(this.list).length > 0) {
				this.tabClicked({delegateTarget: this.bar.children().get(0)});
			} else {
				this.selected = null;
				this.dispatchSelection();
			}
		} else {
			this.select(this.selected);
		}
	}

	//programmatically select a tab
	select(key) {
		this.bar.children('.jsTab').removeClass('jstActive');
		this.bar.find(`.jsTab[data-key='${key}']`).addClass('jstActive');
		if (this.selected !== key) {
			this.selected = key;
			this.dispatchSelection();
		}
	}

	//function called when clicking on a tab
	tabClicked(e) {
		let target = $(e.delegateTarget);
		this.select(target.data('key'));
	}

	getEventType(type) {
		if (typeof(this.eventTypes[type]) === 'undefined') {
			return null;
		}
		return this.eventTypes[type];
	}

	dispatchSelection() {
		let custEvent = new CustomEvent(this.eventTypes.select, {
			detail: this.selected
		});
		window.dispatchEvent(custEvent);
	}


}