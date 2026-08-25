/*
 	jsPointerHandler v2.2.7
 	dependencies: jQuery 3.x
 */

"use strict";


class jsPointerHandler {

	static _instance = null;
	static _privateKey = Math.random();
	static _manager = null;

	/* singleton design pattern */
	static getInstance() {
		if (jsPointerHandler._instance === null) {
			jsPointerHandler._instance = new jsPointerHandler(this._privateKey);
		}
		return jsPointerHandler._instance;
	}

	static get instance() {
		return jsPointerHandler.getInstance();
	}

	static get x() {
		return this._manager.x;
	}

	static get y() {
		return this._manager.y;
	}

	constructor(key) {
		if (key !== jsPointerHandler._privateKey) {
			throw new Error('jsPointerHandler is a singleton class. Use jsPointerHandler.getInstance() instead');
		}
		/*
			debugLevel settings:
			0 => no debugging
			1 => clicks and hovers but no window moves
			2 => clicks and hovers and window moves only if entering or leaving an element
			3 => everything
		 */
		this.debugLevel = 0;
		this.debugMethod = 'log'; //'log' or 'trace'
		this.minDelay = 2000; // minimum delay between 2 similar events of different type for them to be recognized as 2 separate events
		this.minDelayAfterTouch = 2000; //minimum delay after a touch event for a mouseover event to be accepted
		this.dblClickDelay = 300; //the maximum delay in ms between 2 clicks to be recognized as double click
		this.updateInterval = null; //interval for updating the hover state when aggressive updates are needed
		this.constructor._manager = {
			jsphInstance: this,
			events: {},
			globalEvents: {},
			eventCounter: 1,
			clickInProgress: false,
			clickTimer: 0,
			dblClickTimestamp: -1,
			hoveredElements: {},
			pressId: -1,
			touchTimestamp: -1,
			delegates: {},
			x: 0,
			y: 0,
			observer: new MutationObserver((e) => this.onDomChange()),
			leavingId: -1,
			clickLog: {
				down: {type: null, timestamp: null, x: null, y: null},
				up: {type: null, timestamp: null, x: null, y: null}
			}
		};
		const config = {
			childList: true,
			subtree: true
		};
		this.constructor._manager.observer.observe($('body').get(0), config);

		//handlers on window
		$(window).on("pointerdown.jsPointerHandler", (e) => this.onWindowDown(e));
		$(window).on("pointerup.jsPointerHandler", (e) => this.onWindowUp(e));
		$(window).on("pointercancel.jsPointerHandler", (e) => this.onWindowCancel());
		$(window).on("pointermove.jsPointerHandler", (e) => this.onWindowMove(e));
		$(window).on("pointerout.jsPointerHandler", (e) => this.onWindowOut(e));

		this.manager = this.constructor._manager;
	}

	/* public methods */
	listen(elements, settings) {
		elements.each((idx, element) => {
			element = $(element);
			const localSettings = this.constructor.cln(settings);
			localSettings.counter = -1;
			if (typeof (localSettings.callbacks) === 'undefined') localSettings.callbacks = {};
			if (objectLength(this.manager.delegates) > 0) {
				for (let i in this.manager.delegates) {
					if (element.get(0) === this.manager.delegates[i].element.get(0)) {
						localSettings.counter = i;
						break;
					}
				}
			}

			if (localSettings.counter === -1) {
				localSettings.counter = this.manager.eventCounter++;
				element.attr('data-jsph', localSettings.counter);
				this.manager.delegates[localSettings.counter] = {element: element, settings: localSettings};
			} else {
				this.manager.delegates[localSettings.counter].settings = $.extend(true, this.manager.delegates[localSettings.counter].settings, localSettings);
			}

			//even if only an up callback is set, we must listen also to down to set the clickInProgress value correctly
			if (localSettings.callbacks.down || localSettings.callbacks.up || localSettings.callbacks.click || localSettings.callbacks.dblclick || localSettings.pressClass || localSettings.activeClass) {
				$(element).on("pointerdown.jsPointerHandler", (e) => this.onPointerDown(e));
			}
			if (localSettings.callbacks.up || localSettings.callbacks.click || localSettings.callbacks.dblclick || localSettings.pressClass || localSettings.activeClass) {
				$(element).on("pointerup.jsPointerHandler", (e) => this.onPointerUp(e));
			}

			if (localSettings.callbacks.over || localSettings.callbacks.leave || localSettings.hoverClass || localSettings.activeClass) {
				$(element).on("pointerover.jsPointerHandler", (e) => this.onPointerOver(e));
				$(element).on("pointerleave.jsPointerHandler", (e) => this.onPointerLeave(e));
			}

			/*
				the following css rule needs to be in place, otherwise touch devices cancel the move event taking
				it for themselves for scrolling or panning
			*/
			if (settings.allowScrolling) {
				$(element).css('touch-action', "pan-y pan-x");
			} else {
				$(element).css('touch-action', "none");
			}
		});
	};

	clear(elements) {
		elements.each((idx, element) => {
			element = $(element);
			const delegateId = this.constructor.fetchTargetId(element);
			if (this.manager.hoveredElements[delegateId]) {
				this.stopHovering({
					type: 'pointerleave',
					currentTarget: element.get(0),
					target: element.get(0)
				}, this.manager.delegates[delegateId].settings);
			}
			if (typeof (this.manager.delegates[delegateId]) === 'undefined') {
				console.warn("jsPH error on clear: element not registered");
				console.warn(element);
				return;
			}

			const settings = this.manager.delegates[delegateId].settings;

			if (settings.callbacks.down || settings.callbacks.up || settings.callbacks.click || settings.callbacks.dblclick || settings.pressClass || settings.activeClass) {
				$(element).off("pointerdown.jsPointerHandler");
			}
			if (settings.callbacks.up || settings.callbacks.click || settings.callbacks.dblclick || settings.pressClass || settings.activeClass) {
				$(element).off("pointerup.jsPointerHandler");
			}

			if (settings.callbacks.over || settings.callbacks.leave || settings.hoverClass || settings.activeClass) {
				$(element).off("pointerover.jsPointerHandler");
				$(element).off("pointerleave.jsPointerHandler");
			}

			//removing this CSS rule since the element is no longer to be moved
			$(element).css('touch-action', "");

			delete this.manager.delegates[delegateId];
		});
	};

	pause(elements) {
		elements.each((idx, element) => {
			element = $(element);
			const delegateId = this.constructor.fetchTargetId(element);
			if (this.manager.hoveredElements[delegateId]) {
				this.stopHovering({
					type: 'pointerleave',
					currentTarget: element.get(0),
					target: element.get(0)
				}, this.manager.delegates[delegateId].settings);
			}
			if (typeof (this.manager.delegates[delegateId]) === 'undefined') {
				console.warn("jsPH error on pause: element not registered");
				console.warn(element);
				return;
			}
			const settings = this.manager.delegates[delegateId].settings;
			settings.disabled = true;
		});
	};

	resume(elements) {
		elements.each((idx, element) => {
			element = $(element);
			const delegateId = this.constructor.fetchTargetId(element);
			if (typeof (this.manager.delegates[delegateId]) === 'undefined') {
				console.warn("jsPH error on resume: element not registered");
				console.warn(element);
				return;
			}
			const settings = this.manager.delegates[delegateId].settings;
			settings.disabled = false;
		});
	};

	/* Firefox and Safari to do not send enter and leave events if the pointer is still and the element
	*  is animated. So this mode can be activated when an animation is happening to force jsPointerHandler
	*  to aggressively check if the pointer starts or stops hovering the elements it delegates */
	forceHoverUpdates(state) {
		this.db(1, `forceHoverUpdate(${state ? 'true' : 'false'})`);
		if (state) {
			if (this.updateInterval) return;
			this.updateInterval = setInterval(() => this.updateHoveredElements(3), 50);
			this.db(1, `forceHoverUpdate enabled`);
		} else {
			if (this.updateInterval) {
				clearInterval(this.updateInterval);
				this.updateInterval = null;
				this.db(1, `forceHoverUpdate disabled`);
			}
		}
	}

	/* private methods */
	onPointerDown(e) {
		if (e.originalEvent.buttons !== 1) return;
		if (this.manager.clickInProgress) return;
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		this.manager.pointerType = e.originalEvent.pointerType;
		this.manager.clickLog.down = {
			type: this.manager.pointerType,
			timestamp: Date.now(),
			x: this.manager.x,
			y: this.manager.y
		};
		const delegate = $(e.currentTarget);
		const delegateId = this.constructor.fetchTargetId(delegate);
		const settings = this.manager.delegates[delegateId].settings;
		if (settings.disabled === true) return;
		this.db(1, `onPointerDown [${e.type}] ${settings.counter}`);
		const ts = Date.now();
		this.manager.globalEvents.down = ts;

		if (Date.now() - this.manager.touchTimestamp < this.minDelayAfterTouch) {
			return;
		}

		//start hover state in case of touch event
		if (e.originalEvent.pointerType !== 'mouse') {
			this.startHovering(e, settings);
		}

		const id = settings.counter + '_down';
		if (this.manager.events[id]) {
			const delta = Math.abs(ts - this.manager.events[id].ts);
			if (this.manager.events[id].type !== e.type && delta < this.minDelay) {
				return;
			}
		}

		this.manager.events[id] = {
			ts: ts,
			type: e.type
		};

		this.manager.clickInProgress = settings.counter;
		this.manager.pressId = settings.counter;
		if (settings.pressClass) {
			delegate.addClass(settings.pressClass);
		}
		if (settings.activeClass && this.manager.hoveredElements[this.manager.pressId]) {
			delegate.addClass(settings.activeClass);
		}

		if (typeof (settings.callbacks.down) === 'function') {
			settings.callbacks.down.call(delegate, e);
		}
		this.updateHoveredElements(1);
	}

	onPointerUp(e) {
		if (e.originalEvent.buttons !== 0) return;
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		this.manager.pointerType = e.originalEvent.pointerType;
		this.manager.clickLog.up = {
			type: this.manager.pointerType,
			timestamp: Date.now(),
			x: this.manager.x,
			y: this.manager.y
		};
		if (!this.manager.delegates[this.manager.clickInProgress]) return;
		const delegate = this.manager.delegates[this.manager.clickInProgress].element;
		const delegateId = this.constructor.fetchTargetId(delegate);
		const settings = this.manager.delegates[delegateId].settings;
		if (settings.disabled === true) return;
		this.db(1, `onPointerUp [${e.type}] ${settings.counter}`);
		const ts = Date.now();
		this.manager.globalEvents.up = ts;

		if (Date.now() - this.manager.touchTimestamp < this.minDelayAfterTouch) {
			return;
		}

		const id = settings.counter + '_up';
		if (this.manager.events[id]) {
			const delta = Math.abs(ts - this.manager.events[id].ts);
			if (this.manager.events[id].type !== e.type && delta < this.minDelay) {
				return;
			}
		}

		this.manager.pressId = -1;
		if (settings.pressClass) {
			delegate.removeClass(settings.pressClass);
		}
		if (settings.activeClass) {
			delegate.removeClass(settings.activeClass);
		}

		this.manager.events[id] = {
			ts: ts,
			type: e.type
		};

		const realTarget = $(document.elementFromPoint(this.manager.x, this.manager.y));
		if (!delegate.is(realTarget) && !$.contains(delegate.get(0), realTarget.get(0))) {
			if (typeof (settings.callbacks.out) === 'function') {
				const e2 = this.constructor.cln(e);
				e2.type = 'pointerout';
				e2.target = realTarget.get(0); //override to make touch events behave the same as mouse events
				settings.callbacks.out.call(delegate, e2);
			}
			this.manager.clickInProgress = false;

			/* check if another element should receive a pointerover event now that the button is no longer pressed */
			const newId = this.fetchIdForElement(realTarget);
			if (newId !== -1) {
				if (e.originalEvent.pointerType === 'mouse') {
					this.db(1, `onPointerUp`);
					this.startHovering({
						type: 'pointerover',
						currentTarget: this.manager.delegates[newId].element.get(0),
						target: this.manager.delegates[newId].element.get(0),
						originalEvent: e.originalEvent
					}, this.manager.delegates[newId].settings);
				}
			}
			return;
		}

		if (typeof (settings.callbacks.up) === 'function' && this.manager.clickInProgress === settings.counter) {
			settings.callbacks.up.call(delegate, e);
		}

		if ((typeof (settings.callbacks.click) === 'function' || typeof (settings.callbacks.dblclick) === 'function') && this.manager.clickInProgress === settings.counter) {
			if (typeof (settings.callbacks.dblclick) === 'function') {
				if (settings.waitForDblclick) {
					if (this.manager.clickTimer !== 0) {
						clearTimeout(this.manager.clickTimer);
						this.manager.clickTimer = 0;
						this.onDblClick(e, settings);
					} else {
						this.manager.clickTimer = setTimeout(() => {
							this.onClick(e, settings)
						}, this.dblClickDelay);
					}
				} else {
					if (Math.abs(Date.now() - this.manager.dblClickTimestamp) < this.dblClickDelay) {
						this.onDblClick(e, settings);
					} else {
						this.manager.dblClickTimestamp = Date.now();
						this.onClick(e, settings);
					}
				}
			} else {
				this.onClick(e, settings);
			}
		}

		//end hover state in case of touch event
		if (e.originalEvent.pointerType !== 'mouse') {
			this.stopHovering(e, settings);
		}

		this.manager.clickInProgress = false;
		this.updateHoveredElements(1);
	}

	onPointerOver(e) {
		e.preventDefault();
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		this.manager.pointerType = e.originalEvent.pointerType;
		if (Date.now() - this.manager.touchTimestamp < this.minDelayAfterTouch) {
			return;
		}
		const delegate = $(e.currentTarget);
		const delegateId = this.constructor.fetchTargetId(delegate);
		const settings = this.manager.delegates[delegateId].settings;
		if (settings.disabled === true) return;
		this.db(1, `onPointerOver [${e.type}]`);
		if (!this.manager.hoveredElements[settings.counter] && (this.manager.clickInProgress === false || this.manager.clickInProgress === settings.counter)) {
			this.startHovering(e, settings);
		}
		this.updateHoveredElements(1);
	}

	startHovering(e, settings) {
		if (settings.disabled === true) return;
		/*
			the next statement tries to get rid of fake hover events on touch devices if the pointerType === touch
			some devices however mistakenly send "mouse" as pointertype even on touch ... nothing we can do then.
		*/
		if (typeof (e.originalEvent.pointerType) !== 'undefined' && e.originalEvent.pointerType === 'touch') return;
		this.db(1, `startHovering [${e.type}] ${settings.counter}`);
		const e2 = this.constructor.cln(e);
		e2.type = 'pointerover';
		const delegate = $(e.currentTarget);
		this.manager.hoveredElements[settings.counter] = true;
		if (settings.hoverClass) {
			delegate.addClass(settings.hoverClass);
		}
		if (settings.activeClass && this.manager.hoveredElements[this.manager.pressId]) {
			delegate.addClass(settings.activeClass);
		}
		if (typeof (settings.callbacks.over) === 'function') {
			settings.callbacks.over.call(delegate, e2);
		}
	}

	onPointerLeave(e) {
		e.preventDefault();
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		this.manager.pointerType = e.originalEvent.pointerType;
		if (Date.now() - this.manager.touchTimestamp < this.minDelayAfterTouch) return;
		const delegate = $(e.currentTarget);
		const delegateId = this.constructor.fetchTargetId(delegate);
		const settings = this.manager.delegates[delegateId].settings;
		if (settings.disabled === true) return;
		this.db(1, `onPointerLeave [${e.type}]`);
		if (this.manager.hoveredElements[settings.counter]) {
			this.manager.leavingId = settings.counter; //register id pointer is leaving on black list (see this.onDomChange)
			this.stopHovering(e, settings);
		}
	}

	stopHovering(e, settings) {
		if ((typeof (settings) !== 'undefined' && settings.disabled === true)) return;
		this.db(1, `stopHovering [${e.type}] ${settings.counter}`);
		const e2 = this.constructor.cln(e);
		e2.type = 'pointerleave';
		const delegate = $(e.currentTarget);
		delete this.manager.hoveredElements[settings.counter];
		if (settings.hoverClass) {
			delegate.removeClass(settings.hoverClass);
		}
		if (settings.activeClass) {
			delegate.removeClass(settings.activeClass);
		}

		if (typeof (settings.callbacks.leave) === 'function') {
			settings.callbacks.leave.call(delegate, e2);
		}
	}

	onClick(e, settings) {
		if (settings.disabled === true) return;
		const delegate = $(e.currentTarget);
		if (this.manager.clickTimer !== 0) {
			clearTimeout(this.manager.clickTimer);
			this.manager.clickTimer = 0;
		}
		if (typeof (settings.callbacks.click) === 'function') {
			this.db(1, `onClick [${e.type}]`);
			const e2 = this.constructor.cln(e);
			e2.type = 'click';
			settings.callbacks.click.call(delegate, e2);
		}
	}

	onDblClick(e, settings) {
		if (settings.disabled === true) return;
		const delegate = $(e.currentTarget);
		this.db(1, `onDblClick [${e.type}]`);
		const e2 = this.constructor.cln(e);
		e2.type = 'dblclick';
		settings.callbacks.dblclick.call(delegate, e2);
	}

	fetchIdForElement(target) {
		for (let i in this.manager.delegates) {
			if (this.manager.delegates[i].element.is(target) || $.contains(this.manager.delegates[i].element.get(0), target.get(0))) {
				return parseInt(i);
			}
		}
		return -1;
	}

	onWindowDown(e) {
		if (e.originalEvent.buttons !== 1) return;
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		this.manager.pointerType = e.originalEvent.pointerType;

		const ts = Date.now();

		if (Math.abs(ts - (this.manager.globalEvents.down || 0)) > 500) {
			this.db(1, `onWindowDown [${e.type}] - ${e.timeStamp}`);
			this.manager.globalEvents.down = ts;
			this.manager.clickInProgress = 'window';
		}

	}

	onWindowMove(e) {
		this.manager.leavingId = -1; //clear the hover blacklist
		let e2;
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		if (this.manager.globalEvents.move?.x === this.manager.x && this.manager.globalEvents.move?.y === this.manager.y) {
			//do not execute 2 consecutive windowMove events with the exact same coordinates
			return;
		}
		this.manager.globalEvents.move = {x: this.manager.x, y: this.manager.y};
		this.db(3, `onWindowMove [${e.type}] ${this.manager.x}, ${this.manager.y}`);
		this.manager.pointerType = e.originalEvent.pointerType;
		if (this.manager.delegates[this.manager.clickInProgress]) {
			const realTarget = $(document.elementFromPoint(this.manager.x, this.manager.y));
			if (typeof (this.manager.delegates[this.manager.clickInProgress].settings.callbacks.move) === 'function') {
				this.manager.delegates[this.manager.clickInProgress].settings.callbacks.move.call(this.manager.delegates[this.manager.clickInProgress].element, {
					x: this.manager.x,
					y: this.manager.y,
					clientX: this.manager.x,
					clientY: this.manager.y,
					target: realTarget
				});
			}
			if (!this.manager.delegates[this.manager.clickInProgress].element.is(realTarget) && !$.contains(this.manager.delegates[this.manager.clickInProgress].element.get(0), realTarget.get(0))) {
				if (objectLength(this.manager.hoveredElements) > 0) {
					e2 = this.constructor.cln(e);
					e2.currentTarget = this.manager.delegates[this.manager.clickInProgress].element.get(0);
					e2.target = e2.currentTarget;
					this.db(2, `onWindowMove (and leave element) [${e.type}]`);
					this.stopHovering(e2, this.manager.delegates[this.manager.clickInProgress].settings);
				}
			} else {
				if (!this.manager.hoveredElements[this.manager.clickInProgress]) {
					e2 = this.constructor.cln(e);
					e2.currentTarget = this.manager.delegates[this.manager.clickInProgress].element.get(0);
					e2.target = e2.currentTarget;
					this.db(2, `onWindowMove (and enter element) [${e.type}]`);
					this.startHovering(e2, this.manager.delegates[this.manager.clickInProgress].settings);
				}
			}
		}
		this.updateHoveredElements(2);
	}

	onWindowUp(e) {
		let e2;
		if (e.originalEvent.buttons !== 0) return;
		const ts = Date.now();
		this.manager.x = this.constructor.fetchX(e);
		this.manager.y = this.constructor.fetchY(e);
		this.manager.pointerType = e.originalEvent.pointerType;

		if (Math.abs(ts - (this.manager.globalEvents.up || 0)) > 500) {
			this.db(1, `onWindowUp [${e.type}]`);
			this.manager.globalEvents.up = ts;
			if (this.manager.delegates[this.manager.clickInProgress]) {
				this.manager.pressId = -1;
				if (this.manager.delegates[this.manager.clickInProgress].settings.pressClass) {
					this.manager.delegates[this.manager.clickInProgress].element.removeClass(this.manager.delegates[this.manager.clickInProgress].settings.pressClass);
				}
				if (this.manager.delegates[this.manager.clickInProgress].settings.activeClass) {
					this.manager.delegates[this.manager.clickInProgress].element.removeClass(this.manager.delegates[this.manager.clickInProgress].settings.activeClass);
				}

				if (typeof (this.manager.delegates[this.manager.clickInProgress].settings.callbacks.out) === 'function') {
					this.db(1, `onWindowUp pointerout`);
					e2 = this.constructor.cln(e);
					e2.type = 'pointerout';
					this.manager.delegates[this.manager.clickInProgress].settings.callbacks.out.call(this.manager.delegates[this.manager.clickInProgress].element, e2);
				}
			}

			//check if the button was released outside of the browser window
			if (this.manager.x < 0 || this.manager.x > window.innerWidth || this.manager.y < 0 || this.manager.y > window.innerHeight) {
				if (typeof (this.manager.delegates[this.manager.clickInProgress]) !== 'undefined' && typeof (this.manager.delegates[this.manager.clickInProgress].settings.callbacks.outsidewindow) === 'function') {
					this.db(1, `onWindowUp pointeroutsidewindow`);
					e2 = this.constructor.cln(e);
					e2.type = 'pointeroutsidewindow';
					if (typeof (this.manager.delegates[this.manager.clickInProgress].settings.callbacks.outsidewindow) === 'function') {
						this.manager.delegates[this.manager.clickInProgress].settings.callbacks.outsidewindow.call(this.manager.delegates[this.manager.clickInProgress].element, e2);
					}
				}
			}
			this.manager.clickInProgress = false;

			/* check if another element should receive a pointerover event now that the button is no longer pressed */
			const newTarget = $(document.elementFromPoint(this.manager.x, this.manager.y));
			const newId = this.fetchIdForElement(newTarget);
			if (newId !== -1) {
				if (e.originalEvent.pointerType === 'mouse') {
					this.startHovering({
						type: 'pointerover',
						currentTarget: this.manager.delegates[newId].element.get(0),
						target: this.manager.delegates[newId].element.get(0),
						originalEvent: e.originalEvent
					}, this.manager.delegates[newId].settings);
				}
			}
		}
	}

	onWindowOut(e) {
		this.db(3, `onWindowOut [${e.type}]`);
		//workaround Safari bug causes more problems with Safari and other browsers, so commenting this out again.
		// if (this.manager.clickInProgress && e.originalEvent.buttons === 0) {
		/*
			Safari has a bug where the pointerUp event is not sent after clicking on an option in a <SELECT>
			element. However a pointerout event is triggered when the dropdown list closes again. So to work
			around the problem, we check for a pointerout event if no button is being held while
			jsPointerHandler still thinks a click is in progress -> cancel the click event.
		*/
		// onWindowCancel();
		// }
	}

	onWindowCancel() {
		this.db(1, `onWindowCancel`);
		if (this.manager.delegates[this.manager.clickInProgress]) {
			this.manager.pressId = -1;
			if (this.manager.delegates[this.manager.clickInProgress].settings.pressClass) {
				this.manager.delegates[this.manager.clickInProgress].element.removeClass(this.manager.delegates[this.manager.clickInProgress].settings.pressClass);
			}
			if (this.manager.delegates[this.manager.clickInProgress].settings.activeClass) {
				this.manager.delegates[this.manager.clickInProgress].element.removeClass(this.manager.delegates[this.manager.clickInProgress].settings.activeClass);
			}
		}
		this.manager.clickInProgress = false;
	}

	updateHoveredElements(logLevel = 1) {
		this.db(logLevel, `updateHoveredElements (x:${this.manager.x}, y:${this.manager.y})`);
		/* the calls to be made are first put on hold, so that we can trigger the 'leave' events before the 'over' events,
		 * which is crucial when callbacks are fired */
		let callbacksOnHold = {'leave': [], 'over': []};
		for (let i in this.manager.delegates) {
			let element = this.manager.delegates[i].element;
			let settings = this.manager.delegates[i].settings;
			let hovered = element.is($(document.elementFromPoint(this.manager.x, this.manager.y))) || $.contains(element.get(0), $(document.elementFromPoint(this.manager.x, this.manager.y)).get(0));
			if (hovered && !this.manager.hoveredElements[i] && settings.disabled !== true) {
				callbacksOnHold.over.push(() => {
					this.db(1, `updateHoveredElements added (x:${this.manager.x}, y:${this.manager.y}, id:${settings.counter})`);
					this.manager.hoveredElements[settings.counter] = true;
					if (settings.hoverClass) {
						element.addClass(settings.hoverClass);
					}
					if (settings.activeClass && this.manager.hoveredElements[this.manager.pressId]) {
						element.addClass(settings.activeClass);
					}
					if (typeof (settings.callbacks.over) === 'function') {
						settings.callbacks.over.call(element, {
							target: element.get(0),
							currentTarget: element.get(0),
							delegateTarget: element.get(0)
						});
						/*
							it should be fine to the element back all three targets, since over and leave events cannot
							be delegated, so the element that is hovered is always the one that is targeted.
						 */
					}
				});
			} else if (!hovered && this.manager.hoveredElements[i] && settings.disabled !== true) {
				callbacksOnHold.leave.push(() => {
					this.db(1, `updateHoveredElements removed (x:${this.manager.x}, y:${this.manager.y}, id:${settings.counter})`);
					delete this.manager.hoveredElements[settings.counter];
					if (settings.hoverClass) {
						element.removeClass(settings.hoverClass);
					}
					if (settings.activeClass) {
						element.removeClass(settings.activeClass);
					}
					if (typeof (settings.callbacks.leave) === 'function') {
						settings.callbacks.leave.call(element, {
							target: element.get(0),
							currentTarget: element.get(0),
							delegateTarget: element.get(0)
						});
					}
				});
			}
		}
		for (let i in callbacksOnHold.leave) {
			callbacksOnHold.leave[i]();
		}
		for (let i in callbacksOnHold.over) {
			callbacksOnHold.over[i]();
		}
	}

	onDomChange() {
		for (let i in this.manager.hoveredElements) {
			if (typeof (this.manager.delegates[i]) === 'undefined') {
				delete this.manager.hoveredElements[i];
				this.db(1, `onDomChange -> hovered element deleted (id:${i})`);
			}
		}
		for (let i in this.manager.delegates) {
			if (!document.body.contains(this.manager.delegates[i].element.get(0))) {
				delete this.manager.delegates[i];
				if (this.manager.clickInProgress === parseInt(i)) this.manager.clickInProgress = false;
				if (this.manager.hoveredElements[i]) delete this.manager.hoveredElements[i];
				this.db(1, `onDomChange -> delegate deleted (id:${i})`);
			}
		}
		const newTarget = $(document.elementFromPoint(this.manager.x, this.manager.y));
		let newId = this.fetchIdForElement(newTarget);
		/*	Workaround a bug in Firefox:
			When the mouse pointer is moved from the bottom over an element and a DOM change is triggered while the
			pointer resides on the lowest or the rightmost edge of the element, the elementFromPoint() method returns
			the parent element of the element that the mouse pointer is actually hovering. This causes the stopHovering
			method to be called even though the element is still being hovered. To prevent this, we check the coordinates
			of the mouse pointer against the bounding box of the element that was hovered before.
		 */
		for (let i in this.manager.hoveredElements) {
			let bBox = this.manager.delegates[i].element.get(0).getBoundingClientRect();
			if (this.manager.x >= bBox.left && this.manager.x <= bBox.right && this.manager.y >= bBox.top && this.manager.y <= bBox.bottom) {
				newId = i;
				break;
			}
		}
		if (newId !== -1 && newId === this.manager.leavingId) {
			/*	Workaround a bug in Firefox (and maybe Safari?):
				FF sometimes calls onPointerLeave handler while document.elementFromPoint() still believes that the
				mouse pointer is hovering the element that it just left. So in the onPointerLeave handler we set the
				id of the element that was just left on a blacklist which is cleared at the next windowMove event.
				If onDomChange handler is called while there is an id on the blacklist, and the newly determined
				element being hovered is the blacklisted one, we ignore it to prevent rehilighting an element that
				the mouse pointer already left. */
			this.db(1, `onDomChange -> caught blacklisted id (x:${this.manager.x}, y:${this.manager.y}, id:${newId})`);
			return;
		}
		if (newId !== -1 && !this.manager.hoveredElements[newId] && this.manager.pointerType === 'mouse') {
			this.db(1, `onDomChange -> start (x:${this.manager.x}, y:${this.manager.y}, id:${newId})`);
			this.startHovering({
				type: 'pointerover',
				currentTarget: this.manager.delegates[newId].element.get(0),
				target: this.manager.delegates[newId].element.get(0),
				originalEvent: {pointerType: this.manager.pointerType}
			}, this.manager.delegates[newId].settings);
		} else if (newId === -1 && objectLength(this.manager.hoveredElements) > 0) {
			this.db(1, `onDomChange -> stop (${this.manager.x}, ${this.manager.y})`);
			for (let i in this.manager.hoveredElements) {
				if (typeof (this.manager.delegates[i]) !== 'undefined') {
					this.stopHovering({
						type: 'pointerleave',
						currentTarget: this.manager.delegates[i].element.get(0),
						target: this.manager.delegates[i].element.get(0)
					}, this.manager.delegates[i].settings);
				} else {
					delete this.manager.hoveredElements[i];
				}
			}
		}
	}

	static fetchX(e) {
		if (typeof (e.clientX) !== 'undefined') return e.clientX;
		if (typeof (e.originalEvent.clientX) !== 'undefined') return e.originalEvent.clientX;
		if (typeof (e.originalEvent.changedTouches) !== 'undefined' && typeof (e.originalEvent.changedTouches[0]) !== 'undefined') return e.originalEvent.changedTouches[0].clientX;
		return 0;
	}

	static fetchY(e) {
		if (typeof (e.clientY) !== 'undefined') return e.clientY;
		if (typeof (e.originalEvent.clientY) !== 'undefined') return e.originalEvent.clientY;
		if (typeof (e.originalEvent.changedTouches) !== 'undefined' && typeof (e.originalEvent.changedTouches[0]) !== 'undefined') return e.originalEvent.changedTouches[0].clientY;
		return 0;
	}

	static fetchTargetId(currentTarget) {
		let id = $(currentTarget).attr('data-jsph');
		//convert id to integer if it is a string
		if (typeof (id) !== 'undefined') {
			id = parseInt(id);
		}
		return id;
	}

	static cln(o) {
		return jQuery.extend(true, {}, o);
	}

	db(level, message) {
		let d = new Date();
		let timeString = `[${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()}]`;
		if (this.debugMethod === 'log') {
			if (level <= this.debugLevel) {
				console.log(timeString, message);
			}
		} else if (this.debugMethod === 'trace') {
			if (level <= this.debugLevel) {
				console.trace(timeString, message);
			}
		}
	}
}

/*
	release notes

	versions prior to 2.0.0 -> check git comments for details
	2.0.0:
		- transformed jsPointerHandler into a real class rather than the old style JS object used as pseudo class
		- added support to force hover updates in case of animations (fix for FireFox & Safari)
	2.1.0:
		- added warning if jsPointerHandler is instantiated directly rather than as singleton
		- moving manager into static class property
	2.2.0:
		- setting pointer events as the de facto standard and removing support for touch and mouse events
	2.2.1:
		- added target, currentTarget and delegateTarget to the event object passed in updateHoveredElements callbacks
		- added a call to updateHoveredElements after a pointerdown, pointerup or pointermove event in case the element
		  is hidden by that action (FF and Safari will not send a leave event in that case)
	2.2.2:
		- solved a problem with decimal values in the coordinates of the mouse pointer
		- replaced delegateTarget with currentTarget in several event handlers
	2.2.3:
		- fixed a problem where entering an element slowly from the right or bottom edge would not trigger a hover event
		- cleaned out some code that was supposed to be removed in v2.2.0
	2.2.4:
		- overridde the target property in the event object in onPointerUp to make touch events behave the same as mouse
		  events when touch is released outside of initial element
		- removed dependency on rixTools by using template literals for debug messages
	2.2.5:
		- just some code clean up to keep the linter happy
	2.2.6:
		- modifications to updateHoveredElements to ensure 'leave' events are triggered before 'over' events
		- replaced the method on how to check if an element is hovered by a more reliable method
	2.2.7:
		- corrected the CSS rule for allowing scrolling on delegated elements (was set to "scroll" before, which is not
		  a valid value and needs to be "pan-x pan-y" to work properly on mobile devices)
 */