/**
 * jsDragAndDrop.js
 * dependencies: jQuery
 *
 * version 1.1.8
 */

"use strict";

(function ($, global) {

	if (typeof (global.jsDNDManager) !== 'undefined') {
		//if jsDNDManager is already loaded, we stop here ... there is no need to load another instance of the same library
		return;
	}
	/*
		put into place the jsDNDManager to keep all information of draggables and dropzones together
	 */
	global.jsDNDManager = {};
	global.jsDNDManager.init = jsDragAndDrop_init;
	global.jsDNDManager.dzList = {};
	global.jsDNDManager.dgList = {};
	global.jsDNDManager.dgData = {};
	global.jsDNDManager.scrollObservees = [];
	global.jsDNDManager.remove = jsDragAndDrop_remove;
	global.jsDNDManager.removeAll = jsDragAndDrop_removeAll;
	global.jsDNDManager.addListener = jsDragAndDrop_addScrollListener;
	global.jsDNDManager.removeListener = jsDragAndDrop_removeScrollListener;
	global.jsDNDManager.update = updateDraggablePositions;
	global.jsDNDManager.findDraggableByFilter = findDraggableByFilter;
	global.jsDNDManager.moveDraggableTo = moveDraggableTo;
	global.jsDNDManager.findAndMoveDraggableTo = findAndMoveDraggableTo;
	global.jsDNDManager.debug = 0;
	let pHandler;
	let dzList = global.jsDNDManager.dzList;
	let dgList = global.jsDNDManager.dgList;
	let dgData = global.jsDNDManager.dgData;
	let dzCounter = 1;
	let dgCounter = 1;
	let slotPositions = [];

	function jsDragAndDrop_init() {

		let stylesheet = addStylesheet();
		addStylesheetRules(stylesheet, {
			'.jsDraggable *': 'pointer-events: none;',
			'.jsDraggable': 'user-select: none; cursor: pointer; transition: margin 0.2s ease;',
			'.jsDropZone': 'user-select: none;',
			'.jsDraggable.shiftDown': 'margin-top: 20px;',
			'.jsDraggable.shiftUp': 'margin-top: -20px;',
			'.jsDraggable.shiftLeft': 'margin-left: -20px;',
			'.jsDraggable.shiftRight': 'margin-left: 20px;',
			'.jsDnD_beingDragged': 'box-shadow:  5px 5px 10px rgba(0,0,0,0.80)'
		});

		if (typeof (jsPointerHandler) !== 'undefined') {
			try {
				pHandler = jsPointerHandler.instance;
			} catch (e) {
				console.error(e);
				global.stop();
			}
		} else {
			console.error("jsPointerHandler dependency is not loaded ... cannot proceed!");
			global.stop(); //stop all javascript execution if jsPointerHandler dependency is missing
		}

		$(window).on('resize', updateDraggablePositions);
		$(window).on('orientationchange', onOrientationChange);

	}

	/*
		when window resizes there is a chance that dropboxes will change their position, so we need to update all box
		coordinates and then redraw to update draggable positions (as they are not child nodes, but are positioned
		absolutely on a top layer.
	 */
	function updateDraggablePositions() {
		for (let i in dzList) {
			dzList[i].instance.updateBox();
			dzList[i].instance.updateItemPositions(true);
			dzList[i].instance.redraw();
		}
		for (let i in dgList) {
			dgList[i].instance.updateClipPath();
		}
	}

	/*
		there is no way to get an event when the orientation change has finished, so we need to add a timeout to be
		certain to get the correct new coordinates.
	 */
	function onOrientationChange() {
		setTimeout(updateDraggablePositions, 500);
	}

	function jsDragAndDrop_addScrollListener(element) {
		if (typeof (element) === 'string') {
			element = $(element);
		}
		if (global.jsDNDManager.scrollObservees.indexOf(element) !== -1) return;
		element.on("scroll", updateDraggablePositions);
		global.jsDNDManager.scrollObservees.push(element);
	}

	function jsDragAndDrop_removeScrollListener(element) {
		if (typeof (element) === 'string') {
			element = $(element);
		}
		element.off("scroll");
		removeFromArray(global.jsDNDManager.scrollObservees, element);
	}

	function jsDragAndDrop_remove(type, id) {
		if (type === 'dz') {
			if (typeof (dzList[id]) !== 'undefined') {
				dzList[id].instance.destroy();
				delete dzList[id];
			}
		} else if (type === 'dg') {
			let v = null;
			if (typeof (dgList[id]) !== 'undefined') {
				v = dgList[id].instance.getData().value;
				dgList[id].instance.destroy();
				delete dgList[id];
				if (typeof (dgData[v]) !== 'undefined') {
					delete dgData[v];
				}
			}
		}
	}

	function jsDragAndDrop_removeAll() {
		for (let i in dgList) {
			jsDragAndDrop_remove('dg', i);
		}
		for (let i in dzList) {
			jsDragAndDrop_remove('dz', i);
		}
		for (let i in global.jsDNDManager.scrollObservees) {
			jsDragAndDrop_removeScrollListener(global.jsDNDManager.scrollObservees[i]);
		}
	}

	function findDraggableByFilter(filter, group = null) {
		let matches = [];
		for (let i in dgList) {
			let dg = dgList[i].instance;
			if (dg.matchGroup(group) && dg.matchFilter(filter)) {
				matches.push(dg);
			}
		}
		if (matches.length === 0) {
			console.error(`No draggable found with filter ${JSON.stringify(filter)} and group ${group}`);
			return null;
		} else if (matches.length > 1) {
			console.error(`Multiple draggables found with filter ${JSON.stringify(filter)} and group ${group}`);
			return null;
		} else {
			return matches[0];
		}
	}

	function moveDraggableTo(dg, dz, animated = true) {
		if (global.jsDNDManager.debug) {
			console.log('moveDraggableTo');
			console.log(dg);
			console.log(dz);
		}
		if (!(dg instanceof jsDraggable)) {
			console.error("function moveDraggableTo(): jsDNDManager has been given a parameter that is not an instance of jsDraggable ... aborting!");
			return;
		}
		if (!(dz instanceof jsDropZone)) {
			console.error("function moveDraggableTo(): jsDNDManager has been given a parameter that is not an instance of jsDropZone ... aborting!");
			return;
		}
		let source = dg.getSource();
		if (source) {
			source.removeDraggable(dg);
			source.redraw(animated);
			dz.dock(dg, animated);
		}
	}

	function findAndMoveDraggableTo(filter, group, dz, animated = true) {
		let dg = findDraggableByFilter(filter, group);
		if (dg) {
			moveDraggableTo(dg, dz, animated);
		}
	}

	global.jsDropZone = function (parent, settings) {
		if (global.jsDNDManager.debug) {
			console.log('jsDropZone');
			console.log(settings);
		}
		if (typeof (parent) === 'string') {
			parent = $(parent);
		} else if (!(parent instanceof $)) {
			console.error("jsDropZone has been given a parent that is neither a string nor a jQuery object ... aborting!");
			return;
		} else if (parent.length < 1) {
			console.error("jsDropZone has been given a jQuery object as parent that does not contain any elements ... aborting!");
			return;
		} else if (parent.length > 1) {
			console.error("jsDropZone has been given a parent that consists of more than 1 element ... aborting!");
			return;
		}

		let orderOverride = settings.orderOverride || false;
		let orderOverrideKey = settings.orderOverrideKey || 'value';

		let onChange = null;
		if (typeof (settings.onChange) === 'function') {
			onChange = settings.onChange;
		}

		let id = this.id = settings.id || false;
		if (id !== false) {
			if (typeof (dzList[id]) !== 'undefined') {
				console.error("ERROR: dropZone ids need to be unique. Conflicting id = '%s'", id);
				return;
			}
		} else {
			id = this.id = '__dz' + dzCounter++;
		}

		parent.append(`<div class="jsDropZone"></div>`);
		let element = parent.find('div.jsDropZone').last();

		/* add custom classes to the dropzone; settings.class can contain multiple classes as space separated string */
		if (settings.class) {
			element.addClass(settings.class);
		}

		if (settings.style) {

			element.css(settings.style);
			/*
				ATTENTION: padding of the dropbox will not effect draggables, which are positioned absolutely
				To set the padding use the settings.padding object (see below)
			 */
		}

		if (settings.html) {
			element.html(settings.html);
		} else if (settings.label) {
			element.html(settings.label);
		}

		/*
			unless otherwise indicated, a dropzone can always contain only a single draggable
			a limit of 0 indicates that the dropzone accepts any number of draggables
		 */
		let maxDraggableCount = settings.maxDraggableCount;
		if (!maxDraggableCount && maxDraggableCount !== 0) {
			maxDraggableCount = 1;
		}

		/*
			the behaviour setting defines if a dropzone has a special role

			default:		a standard dropzone that can accept 1 or more draggables depending on the maxDraggableCount
							setting
			remove:			a dropzone that cannot accept any draggable; its function is that of a rubbish bin
							cloned draggables will be destroyed when dropped here, others will be refused



			the onFull setting describes what happens when a draggable is dropped on a dropzone that is already occupied

			replace:		the draggable that is already in the dropzone will be replaced by the new one
			refuse:			if the dropzone is full, new ones are refused



			the onDrop setting describes where a draggable is added to a dropzone that can hold more than 1 draggable

			beginning:		the draggable being dropped is always added at the beginning of the list
			end:			the draggable being dropped is always added at the end of the list
			insert:			the draggable being dropped is always inserted at the place where it has been dropped
			auto:			the draggable being dropped is always inserted at the place where it belongs
							(for this setting it is necessary to set the orderBy preference as well)



			the orderBy setting is necessary only if onDrop == 'auto'
			it sets a key name by which draggables are automatically ordered
			the draggables need to be assigned this key in the data attribute



			the orientation setting describes in which direction a dropzone, that can hold multiple draggables, is filled

			horizontal:		from left to right if onDrop=='beginning' or from right to left if onDrop=='end'
			vertical:		from top to bottom if onDrop=='beginning' or from bottom to top if onDrop=='end'


			the flag acceptClones marks a dropzone specifically for accepting clones, and only clones
		 */

		let type = settings.behaviour;
		if (type !== 'remove') {
			type = 'default';
		}
		let acceptClones = (settings.acceptClones ?? false) || (type === 'remove');
		let onFull = settings.onFull;
		let onDrop = settings.onDrop;
		let orderBy = settings.orderBy || false;
		let orientation = settings.orientation;
		let alignment = settings.alignment || {x: 'left', y: 'top'};
		let zIndexBaseValue = settings.zIndexBaseValue || 1;

		//let's sanitize the settings
		if (onFull !== 'replace' && onFull !== 'refuse') {
			onFull = 'replace';
		}

		if (onDrop !== 'beginning' && onDrop !== 'end' && onDrop !== 'insert' && onDrop !== 'auto') {
			onDrop = 'end';
		} else if (onDrop === 'auto' && typeof (orderBy) !== 'string') {
			onDrop = 'beginning';
		}

		if ((onDrop === 'insert' || onDrop === 'auto') && onFull === 'replace') {
			onFull = 'refuse';
			/*
				onDrop behaviours of 'insert' and 'auto' are not compatible with onFull behaviour of 'replace'.
				There is no way to decide automatically which draggable to remove to make place for the new one!
				Reverting to 'refuse' behaviour.
			 */
		}

		let dimensionKey;
		let coordinateKey;
		let secondaryDimensionKey;
		let secondaryCoordinateKey;
		let originKey;
		let originOppositeKey;
		let originOpposites = {
			'left': 'right',
			'right': 'left',
			'top': 'bottom',
			'bottom': 'top'
		};
		let secondaryOriginKey;
		let xOrigin = 'left';
		let yOrigin = 'top';
		let gapClass;
		let reverseGapClass;
		let insertionSlot = 0;

		if (alignment.x === 'right') xOrigin = 'right';
		if (alignment.y === 'bottom') yOrigin = 'bottom';
		if (orientation !== 'horizontal') orientation = 'vertical';

		switch (orientation) {
			case 'horizontal':
				dimensionKey = 'width';
				secondaryDimensionKey = 'height';
				coordinateKey = 'x';
				secondaryCoordinateKey = 'y';
				originKey = xOrigin;
				secondaryOriginKey = yOrigin;
				if (xOrigin === 'right') {
					gapClass = 'shiftLeft';
					reverseGapClass = 'shiftRight';
				} else {
					gapClass = 'shiftRight';
					reverseGapClass = 'shiftLeft';
				}
				break;
			case 'vertical':
				dimensionKey = 'height';
				secondaryDimensionKey = 'width';
				coordinateKey = 'y';
				secondaryCoordinateKey = 'x';
				originKey = yOrigin;
				secondaryOriginKey = xOrigin;
				if (yOrigin === 'bottom') {
					gapClass = 'shiftUp';
					reverseGapClass = 'shiftDown';
				} else {
					gapClass = 'shiftDown';
					reverseGapClass = 'shiftUp';
				}
				break;
		}
		originOppositeKey = originOpposites[originKey];

		/*
			the padding of the dropzone must be set as a separate pair of settings and only in pixels, as the draggables
			MUST remain in absolute display, and we can't use CSS strings like "calc(50%-37px)" with jQuery.animate()
		 */

		let padding = settings.padding || {};
		if (typeof (padding.left) !== 'number') padding.left = 0;
		if (typeof (padding.right) !== 'number') padding.right = 0;
		if (typeof (padding.top) !== 'number') padding.top = 0;
		if (typeof (padding.bottom) !== 'number') padding.bottom = 0;

		/*
			If a dropzone can hold multiple draggables they need to be arranged in a grid (either horizontally or
			vertically). If gridSize is a number draggables will always be placed at coordinates of a multiple of that
			number in pixels. Draggables are allowed to overlap (e.g. like a solitaire game of cards).
			If gridSize is 0, then the dropzone will calculate the width or height of the draggables (depending on
			whether the arrangement is horizontal or vertical) and set the draggables so that they don't overlap next
			to each other or underneath each other.
		 */

		let gridSize = settings.gridSize || 0;
		if (typeof (gridSize) !== 'number') gridSize = 0;

		/*
			In case draggables should not touch each other, we can add spacing to define a number of pixels to leave
			blank between items.
		*/

		let spacing = settings.spacing || 5;
		if (typeof (spacing) !== 'number') spacing = 5;

		/*
			a dropzone can define an array of strings as groups value to control which draggables can be dropped here
			or it can be set to the boolean TRUE to accept any draggable that is dropped on it
			ATTENTION: if acceptClones is defined it will refuse any draggable that is not a clone and vice versa
		 */

		let groups = settings.groups || true;
		if (typeof (groups) === 'string') {
			groups = [groups];
		}

		dzList[id] = {
			element: element,
			instance: this
		};

		let self = this;
		let dzBox;


		let items = this.items = [];

		let updateBox = this.updateBox = function () {
			dzBox = self.dzBox = {
				left: element.offset().left,
				top: element.offset().top,
				right: element.offset().left + element.outerWidth(),
				bottom: element.offset().top + element.outerHeight(),
				width: element.outerWidth(),
				height: element.outerHeight(),
				area: element.outerHeight() * element.outerWidth()
			};
		};

		updateBox();

		let get = this.get = function () {
			return element;
		};

		let destroy = this.destroy = function () {
			element.remove();
		};

		/*
			getter method to see if this dz is ordered and hence can accept draggables that are already docked here,
			in order to change their position inside the dropzone
		 */
		let ordered = this.ordered = function () {
			return (onDrop === 'insertion');
		};

		let getObjects = this.getObjects = function () {
			let objects = [];
			for (let i in items) {
				objects[i] = items[i].instance.getData();
			}
			return objects;
		};

		/*
			this function is called after adding an item to a dropzone, resp. after removing an item, so that all the other
			draggables can be moved to their new coordinates to keep the dropzone nice and tidy
		 */
		let updateItemPositions = this.updateItemPositions = function (skipOnChangeEvent = false) {
			if (global.jsDNDManager.debug) {
				console.log('updateItemPositions');
				console.log(items);
			}
			let nextPosition = padding[originKey];
			let nextSecondaryPosition = padding[secondaryOriginKey];

			let objects = [];

			for (let i in items) {

				//save item position in the item list
				if (onDrop === 'auto') {
					if ((nextPosition + items[i][dimensionKey]) > dzBox[dimensionKey] - padding[originOppositeKey]) {
						nextSecondaryPosition += items[i][secondaryDimensionKey] + spacing;
						nextPosition = padding[originKey];
					}
				}
				items[i][coordinateKey] = nextPosition;
				items[i][secondaryCoordinateKey] = nextSecondaryPosition;

				//calculate position of next item
				if (gridSize === 0) {
					nextPosition += items[i][dimensionKey] + spacing;
				} else {
					nextPosition += gridSize;
				}
				items[i].instance.setSourcePosition(i);
				objects[i] = items[i].instance.getData();
			}
			updateSlotPositions();

			/*
				if a callback function is provided it will be called, otherwise we'll dispatch a custom event instead.
			 */
			if (onChange && !skipOnChangeEvent) {
				onChange.call(self, id, objects);
			} else {
				let event = new CustomEvent("jsDndChange", {
					detail: {
						id: id,
						objects: objects
					},
					bubbles: true,
					cancelable: false
				});
				element.get(0).dispatchEvent(event);
			}
		};

		/*
			redraw (with animation or not) the new positions of all draggables in this zone
		 */

		let redraw = this.redraw = function (animated) {
			for (let i in items) {
				let coords = getCoordinates(items[i].instance);

				if (animated) {
					items[i].instance.moveDraggable(coords.x, coords.y);
					items[i].element.css('z-index', zIndexBaseValue + parseInt(i));
				} else {
					let cssObject = {};
					cssObject['left'] = coords.x + 'px';
					cssObject['top'] = coords.y + 'px';
					cssObject['z-index'] = zIndexBaseValue + parseInt(i);
					items[i].element.css(cssObject);
				}
			}
		};

		/*
			dropzones configured to be manually sorted need to keep the insertion positions up to date
		 */
		let updateSlotPositions = function () {
			if (onDrop !== 'insert') return;
			if (global.jsDNDManager.debug) {
				console.log('updateSlotPositions');
			}
			let pos = 0;
			slotPositions = [];
			for (let i in items) {
				pos = items[i][coordinateKey] + 20;
				slotPositions.push(pos);
			}
			insertionSlot = items.length;
		};

		let updateInsertionSpot = this.updateInsertionSpot = function (pos, dgBox, sourcePos, localMove) {
			if (onDrop !== 'insert') return;
			let posOnAxis;
			switch (originKey) {
				case 'bottom':
					posOnAxis = dzBox.height - (pos.top - dzBox.top) - dgBox.height;
					break;
				case 'right':
					posOnAxis = dzBox.width - (pos.left - dzBox.left) - dgBox.width;
					break;
				default:
					posOnAxis = pos[originKey] - dzBox[originKey];
			}
			insertionSlot = slotPositions.length;
			for (let i in slotPositions) {
				if (!items[i]) continue;
				if (localMove && sourcePos === i) continue;
				let slotPos = slotPositions[i];
				if (!localMove) {
					if (slotPos > posOnAxis) {
						if (insertionSlot > i) insertionSlot = i;
						items[i].element.addClass(gapClass);
					} else {
						items[i].element.removeClass(gapClass);
					}
				} else {
					/* if item is being moved inside the dropzone to a new position, the situation is much more complex ... */
					if (slotPos > posOnAxis) {
						if (insertionSlot > i) insertionSlot = i;
					}
					if (slotPos > posOnAxis && i < sourcePos) {
						items[i].element.addClass(gapClass);
					} else if (slotPos <= posOnAxis && i > sourcePos) {
						items[i].element.addClass(reverseGapClass);
					} else {
						items[i].element.removeClass(gapClass);
						items[i].element.removeClass(reverseGapClass);
					}
				}
			}
		};

		let removeDraggable = this.removeDraggable = function (dg) {
			if (global.jsDNDManager.debug) console.log('removeDraggable');
			if (!(dg instanceof jsDraggable)) {
				console.error("function removeDraggable(): jsDropZone has been given a parameter that is not an instance of jsDraggable ... aborting!");
				return;
			}
			removeFromArray(items, dg, 'instance');
			updateItemPositions();
		};

		let addToPool = this.addToPool = function (dg, animated, forcedPosition) {
			if (global.jsDNDManager.debug) console.log('addToPool');
			dg.setSource(self);
			let item = {
				instance: dg,
				element: dg.get(),
				x: padding[xOrigin],
				y: padding[yOrigin],
				width: dg.width,
				height: dg.height,
				orderValue: false
			};

			if (onDrop === 'auto') {
				item.orderValue = dg.getDataEntry(orderBy);
				if (typeof(item.orderValue) === 'string') {
					item.orderValue = item.orderValue.toLowerCase();
				}
			}

			/*
				if a specific order has to be established at creation time the following routine checks against the
				orderOverride array where draggables need to be placed
			 */
			if (orderOverride && items.length > 0) {
				let v = dg.getDataEntry(orderOverrideKey);
				let vFound = false;
				let idx = null;
				for (let i in items) {
					vFound = false;
					idx = -1;
					for (let j in orderOverride) {
						idx = i;
						if (items[i].instance.getDataEntry(orderOverrideKey) === orderOverride[j]) {
							break;
						}
						if (orderOverride[j] === v) {
							vFound = true;
						}
					}
					if (vFound === true) {
						break;
					}
				}

				if (vFound === true) {
					forcedPosition = idx;
				} else {
					forcedPosition = idx + 1;
				}

				if (orderOverride.length === items.length + 1) {
					orderOverride = false;
				}
			}

			let itemPosition;
			if (typeof (forcedPosition) !== 'undefined' && onDrop !== 'auto') {
				/*
					forcedPosition is only set if a draggable gets sent to this dropzone because it gets kicked out from
					its former source dz; in this case we put it in the same position as the draggable that kicked it out
					occupied before. An exception to this rule is the case it gets send to an automatically sorted dropzone,
					where it will have to take its proper place.
				 */
				items.splice(forcedPosition, 0, item);
				itemPosition = forcedPosition;
			} else {
				switch (onDrop) {
					case 'beginning':
						items.unshift(item);
						itemPosition = 0;
						break;
					case 'end':
						items.push(item);
						itemPosition = items.length - 1;
						break;
					case 'insert':
						items.splice(insertionSlot, 0, item);
						itemPosition = insertionSlot;
						break;
					case 'auto':
						let spotFound = false;
						for (let i in items) {
							insertionSlot = i;
							if (items[i].orderValue > item.orderValue) {
								spotFound = true;
								break;
							}
						}
						if (!spotFound) {
							items.push(item);
							itemPosition = items.length - 1;
						} else {
							items.splice(insertionSlot, 0, item);
							itemPosition = insertionSlot;
						}
						break;
					default:
						console.error('addToPool() error: unknown onDrop method: ' + onDrop);
				}
			}
			updateItemPositions();
			redraw(animated);
			return itemPosition;
		};

		/*
			if a draggable moves position inside the dropzone it already is, it does not have to be removed and docked
			again ... we merely move it to the new position and redraw.
		 */
		let changePosition = this.changePosition = function (dg, animated, completeDockingProcedure) {
			if (global.jsDNDManager.debug) console.log('changePosition');
			let oldPos = dg.getSourcePosition();
			let newPos = insertionSlot;
			if (newPos !== oldPos) {
				let tmpItems = items.splice(oldPos, 1);
				if (newPos > oldPos) {
					/*
						if the newPosition is higher than the former one, it will have to be decremented by 1 after we remove
						the item from its current position, as all items move a step farther down
					 */
					newPos--;
				}
				items.splice(newPos, 0, tmpItems[0]);
			}

			/* if newPos === oldPos, we merely need to update the positions and redraw -> no item changes position */
			updateItemPositions();
			for (let i in items) {
				items[i].element.removeClass(gapClass);
				items[i].element.removeClass(reverseGapClass);
			}
			redraw(animated);
			if (typeof (completeDockingProcedure) === 'function') completeDockingProcedure.call(dg);
		};

		let positionToBeRemoved = this.positionToBeRemoved = function () {
			if (global.jsDNDManager.debug) console.log('positionToBeRemoved');
			let dgPosition;
			if (items.length === 0) {
				console.error("function positionToBeRemoved(): no item in dropzone to be removed ... aborting!");
				return null;
			}
			switch (onDrop) {
				case 'beginning':
					//if new items are added at the beginning we remove the last item when full
					dgPosition = items.length - 1;
					break;
				case 'end':
					//if new items are added at the end we remove the first item when full
					dgPosition = 0;
					break;
				default:
					/*
						if onDrop is neither 'end' nor 'beginning' the onFull method should have reverted to 'refuse',
						so this cannot really ever happen, it's merely here as failsafe in case of a bug
					 */
					return null;
			}
			return dgPosition;
		};

		let toBeRemovedType = this.toBeRemovedType = function () {
			if (global.jsDNDManager.debug) console.log('toBeRemovedType');
			let dgPosition = positionToBeRemoved();
			let dgToRemove = items[dgPosition]?.instance;
			return {clone: dgToRemove.isClone(), template: dgToRemove.isCloneTemplate()};
		};

		/* this removes an item from a pool which has reached its maximum size */
		let removeFromPool = this.removeFromPool = function () {
			if (global.jsDNDManager.debug) console.log('removeFromPool');
			let dgPosition = positionToBeRemoved();
			let dgToRemove = items[dgPosition];
			items.splice(dgPosition, 1);

			return dgToRemove.instance;
		};

		let dock = this.dock = function (dg, animated, completeDockingProcedure, forcedPosition) {
			if (global.jsDNDManager.debug) console.trace(`dock (isClone: ${dg.isClone() ? 'true' : 'false'}, isTemplate: ${dg.isCloneTemplate() ? 'true' : 'false'})`);
			//abort if the dock method is called with a parameter that has the wrong type
			if (!(dg instanceof jsDraggable)) {
				console.error("function dock(): jsDropZone has been given a parent that is not an instance of jsDraggable ... aborting!");
				if (typeof (completeDockingProcedure) === 'function') completeDockingProcedure.call(dg);
				return false;
			}

			//if this dropzone is a rubbish bin, it destroys the clones dropped onto it
			if (type === 'remove') {
				dg.destroy(true);
				return;
			}

			//abort if the dock method is called for a draggable that is not allowed to dock here
			let acceptance = acceptable(dg.group, dg.isCloneTemplate(), dg.isClone());
			if (acceptance === 0) {
				console.error("function dock(): group mismatch ... aborting!");
				if (typeof (completeDockingProcedure) === 'function') completeDockingProcedure.call(dg);
				return false;
			} else {
				/*
					If a template was cloned before and we need to reestablish the status quo, the acceptable()
					function will let us know that it only accepts clones. So if a template is to be docked here
					this means we need to convert it to a clone again.
				*/
				if (acceptance === 2) {
					dg.convertToCloned();
				}
			}

			//if this dropzone contains clone templates, it defaults to onDrop = 'end' and onFull = 'refuse'
			if (dg.isCloneTemplate()) {
				onDrop = 'end';
				onFull = 'refuse';
			}


			if (items.length >= maxDraggableCount) {
				if (global.jsDNDManager.debug) console.log('dz full -> ' + onFull);
				if (onFull === 'refuse') {
					if (typeof (completeDockingProcedure) === 'function') completeDockingProcedure.call(dg);
					return false;
				} else if (onFull === 'replace') {
					let dgType = toBeRemovedType();
					if (dgType.clone === false) {
						if (dg.isClone()) {
							dg.destroy();
						} else {
							let toBeRemoved = removeFromPool();
							toBeRemoved.sendTo(dg.getSource(), dg.getSourcePosition());
						}
					} else {
						let toBeRemoved = removeFromPool();
						toBeRemoved.destroy();
					}
				}
			}

			updateBox();

			let itemPos = addToPool(dg, animated, forcedPosition);
			dg.setSource(self, itemPos);

			disableDockable();

			if (typeof (completeDockingProcedure) === 'function') completeDockingProcedure.call(dg);
			return true;
		};

		/*
			this function checks if a draggable with a given group may be dropped here
			it does not take into account if there is still space for the draggable or not
		 */
		let acceptable = this.acceptable = function (group, isTemplate = false, isClone = false) {
			if (global.jsDNDManager.debug > 0) console.trace(`acceptable, ${group} ${isTemplate ? ', template' : ''}${isClone ? ', clone' : ''}`);

			//return 0 to refuse, 1 to accept and 2 to force conversion
			let returnValue = 0;
			if (acceptClones === isClone) {
				returnValue = 1;
			} else if (acceptClones && isTemplate) {
				returnValue = 2;
			}
			if (returnValue === 0) return 0;

			//after establishing acceptance base on clone status test groups (rejection override)
			if (groups === true || (Array.isArray(groups) && groups.indexOf(group) > -1)) {
				return returnValue;
			} else {
				return 0;
			}
		};

		/*
			the following method is triggered when a draggable is moved, to check if it's close enough to this dropzone to be dropped on it
			the intersection area has to exceed 20% of the area of the draggable
		 */
		let dockable = this.dockable = function (dg, dgBox, x, y, group) {
			if (global.jsDNDManager.debug > 0) console.log(`dockable, ${group} ${dg.isCloneTemplate() ? ', template' : ''}${dg.isClone() ? ', clone' : ''}`);
			/*
			Let's check acceptability to know if this draggable can dock here.
			Note that this function is only called while dragging a draggable. Since cloneTemplates being dragged will
			be cloned on drop, we need to translate the value of dg.isCloneTemplate as dg.isClone for the acceptability
			check. Hence the following paremeters:
			 */
			let acceptance = acceptable(group, false, dg.isCloneTemplate() || dg.isClone());
			if (acceptance === 0) {
				return 0;
			}

			//if this draggable is already in this same dropzone, refuse to dock it there again
			if (dg.getSource() === this && onDrop !== 'insert') {
				return 0;
			}

			//check if dropzone is full already
			if (items.length >= maxDraggableCount && dg.getSource() !== this) {
				if (onFull === 'refuse') {
					return 0;
				}
			}

			//if this dropzone is a rubbish bin for clones it can only accept cloned draggables
			if (type === 'remove' && dg.isClone() !== true) {
				return 0;
			}

			//check if orderBy value is present for automatically order dropzone
			if (onDrop === 'auto') {
				if (dg.getDataEntry(orderBy) === false) {
					return false;
				}
			}

			updateBox();

			//let's start with getting the coordinates of the potential intersection
			let left = Math.max(dgBox.left, dzBox.left);
			let top = Math.max(dgBox.top, dzBox.top);
			let right = Math.min(dgBox.right, dzBox.right);
			let bottom = Math.min(dgBox.bottom, dzBox.bottom);

			//if the right border coordinate is lower than the left one, or bottom coordinate lower than the top one we can abort right away
			if (right < left || bottom < top) {
				return 0;
			}

			let intersectingArea = (right - left) * (bottom - top);

			if (intersectingArea / dgBox.area > 0.2) {
				return (intersectingArea / dgBox.area);
			} else {
				return 0;
			}
		};

		let enableDockable = this.enableDockable = function () {
			element.addClass('jsDnD_dockable');
		};

		let disableDockable = this.disableDockable = function () {
			element.removeClass('jsDnD_dockable');
			if (onDrop === 'insert') {
				for (let i in items) {
					items[i].element.removeClass(gapClass);
					items[i].element.removeClass(reverseGapClass);
				}
			}
		};

		let getCoordinates = this.getCoordinates = function (dg) {
			if (global.jsDNDManager.debug) console.log('getCoordinates');

			let item = fetchObjectFromArray(items, {instance: dg}, true);

			let coords = {xOrigin: xOrigin, yOrigin: yOrigin};
			if (xOrigin === 'left') {
				coords.x = dzBox.left + item.x
			} else {
				coords.x = dzBox.right - item.x - item.width;
			}
			if (yOrigin === 'top') {
				coords.y = dzBox.top + item.y
			} else {
				coords.y = dzBox.bottom - item.y - item.height;
			}

			return coords;
		};

		if ((onDrop === 'insert')) {
			updateSlotPositions();
		}

	};

	global.jsDraggable = function (parent, settings, existingElement) {

		if (global.jsDNDManager.debug) {
			console.log('jsDraggable');
			console.log(settings);
		}

		let frameId = settings.frameId ?? 'jsDragAndDropFrame';
		let frameZIndex = settings.frameZIndex || 1;
		if ($('#' + frameId).length === 0) {
			//if frame does not exist yet, create it
			$('body').append('<div id="' + frameId + '" class="jsDragAndDropFrame"></div>');
		}
		let frameElement = $('#' + frameId);
		frameElement.css('z-index', settings.frameZIndex);
		let clippingTemplate = settings.clipFrameTo || false;
		if (clippingTemplate) {
			let frameMask = {
				x: clippingTemplate.offset().left,
				y: clippingTemplate.offset().top,
				width: clippingTemplate.outerWidth(),
				height: clippingTemplate.outerHeight()
			};
			let clipPath = "xywh(" + frameMask.x + "px " + frameMask.y + "px " + frameMask.width + "px " + frameMask.height + "px)";
			frameElement.css('clip-path', clipPath);
		}

		if (typeof (parent) === 'string') {
			if (typeof (dzList[parent]) !== 'undefined') {
				parent = dzList[parent].instance;
			}
		}

		if (!(parent instanceof jsDropZone)) {
			console.error("jsDraggable has been given a parent that is not an instance of jsDropZone ... aborting!");
			return;
		}

		let ghost; //used when draggable is cloned
		let cloned = false; //show no animation on initial docking
		let element = null;
		if (typeof (existingElement) !== 'undefined') {
			element = existingElement;
			element.removeClass('jsDraggable_ghost');
			cloned = true; //since this element exist already we want to animate the initial docking
		} else {
			element = $('<div class="jsDraggable"></div>');

			if (settings.html) {
				element.html(settings.html);
			} else if (settings.label) {
				element.html(settings.label);
			}

			if (settings.style) {
				element.css(settings.style);
			}

			element.css("position", "absolute");
		}

		/* add custom classes to the draggable; settings.class can contain multiple classes as space separated string */
		if (settings.class) {
			element.addClass(settings.class);
		}

		let id = this.id = 'dg' + dgCounter++;
		dgList[id] = {
			element: element,
			instance: this
		};

		frameElement.append(element);

		this.width = element.outerWidth();
		this.height = element.outerHeight();
		let zIndexDragging = settings.zIndexDragging || 100;

		/*
			the group allows to define which draggables may be dropped on which dropzones (groups must match)
			while a draggable always belongs to one group, a dropzone can be configured to accept several groups
		 */
		let group = this.group = settings.group || 'default';

		if (group instanceof Array) {
			group = group[0];
		}

		let data = settings.data || {};

		let cloneTemplate = (settings.clone === true) || false;
		if (cloneTemplate && parent.acceptClones) {

		}

		let get = this.get = function () {
			return element;
		};

		let destroy = this.destroy = function (animated) {
			if (animated) {
				element.animate({opacity: 0}, 50, function () {
					element.remove();
				});
			} else {
				element.remove();
			}
		};

		/*
			self is a pointer to the instance of the draggable, as the 'this' keyword will not point to the
			instance when used inside a method
		 */
		let self = this;

		//source will always contain a pointer to the dropzone in which this draggable is docked
		let source = parent;

		//sourcePos is the index in which position the draggable is docked in a multi dropzone
		let sourcePos = 0;

		//origin will keep a pointer to the dropzone in which the draggable was originally created
		let origin = parent;

		//target will have a pointer for a potential dropzone to dock the draggable to while dragging
		let target = false;

		let x0 = 0;
		let y0 = 0;
		let dx = 0;
		let dy = 0;

		let updateClipPath = this.updateClipPath = function () {
			if (clippingTemplate) {
				let frameMask = {
					x: clippingTemplate.offset().left,
					y: clippingTemplate.offset().top,
					width: clippingTemplate.outerWidth(),
					height: clippingTemplate.outerHeight()
				};
				let clipPath = "xywh(" + frameMask.x + "px " + frameMask.y + "px " + frameMask.width + "px " + frameMask.height + "px)";
				frameElement.css('clip-path', clipPath);
			}
		};

		//if a draggable is replaced in a dropzone, this method will take care of moving it to its new destination
		let sendTo = this.sendTo = function (dz, itemPos) {
			if (dz.acceptable(group) !== 0 && !cloned && !cloneTemplate) {
				/* this should never be called on a draggable that is either a clone or a template */
				dz.dock(self, true, null, itemPos);
				target = source = dz;
			} else {
				element.offset({
					left: source.dzBox.left,
					top: source.dzBox.top
				});
				moveDraggable(origin.dzBox.left, origin.dzBox.top, function () {
					origin.dock(self);
					target = source = origin;
				});
			}
		};

		let setSource = this.setSource = function (dz, itemPos) {
			source = dz;
			setSourcePosition(itemPos);
		};

		let getSource = this.getSource = function () {
			return source;
		};

		let setSourcePosition = this.setSourcePosition = function (itemPos) {
			sourcePos = itemPos;
		};

		let getSourcePosition = this.getSourcePosition = function () {
			return sourcePos;
		};

		let getOrigin = this.getOrigin = function (dz) {
			return origin;
		};

		let getData = this.getData = function () {
			return data;
		};

		let setData = this.setData = function (newData) {
			data = newData;
		};

		let getDataEntry = this.getDataEntry = function (key) {
			return data[key] || false;
		};

		let setDataEntry = this.setDataEntry = function (key, value) {
			data[key] = value;
		};

		/* check if the data property of the draggable matches a specific filter */
		let matchFilter = this.matchFilter = function (filter) {
			for (let key in filter) {
				if (data[key] !== filter[key]) {
					return false;
				}
			}
			return true;
		};

		/* check if the draggable matches a specific group; if no group is indicated it's automatically a match */
		let matchGroup = this.matchGroup = function (group) {
			if (group === null) {
				return true;
			} else {
				return (group === self.group);
			}
		};

		let isCloneTemplate = this.isCloneTemplate = function () {
			return cloneTemplate;
		};

		let isClone = this.isClone = function () {
			return cloned;
		};

		let convertToCloned = this.convertToCloned = function () {
			cloned = true;
			cloneTemplate = false;
		};

		let dgBox = {
			height: element.outerHeight(),
			width: element.outerWidth(),
			area: element.outerHeight() * element.outerWidth()
		};

		function pDown(e) {
			if (global.jsDNDManager.debug > 1) console.log('pDown');
			let pos = element.offset();
			x0 = pos.left;
			y0 = pos.top;
			dx = jsPointerHandler.fetchX(e) - pos.left;
			dy = jsPointerHandler.fetchY(e) - pos.top;
			if (!cloneTemplate) {
				element.css('z-index', zIndexDragging);
			} else {
				ghost = element.clone();
				ghost.appendTo("body");
				ghost.addClass("jsDnD_beingDragged");
				ghost.addClass("jsDraggable_ghost");
				ghost.removeAttr('data-jsph');
				ghost.removeAttr('id');
				ghost.css('z-index', zIndexDragging);
			}
		}

		function pMove(e) {
			if (global.jsDNDManager.debug > 2) console.log('pMove', e.x, e.y, dx, dy);
			let newPos = {
				left: (e.x - dx),
				top: (e.y - dy)
			};

			if (!cloneTemplate) {
				element.offset(newPos);
			} else {
				ghost.offset(newPos);
			}

			let newTarget = false;
			let targetScore = 0;
			dgBox.left = newPos.left;
			dgBox.right = newPos.left + dgBox.width;
			dgBox.top = newPos.top;
			dgBox.bottom = newPos.top + dgBox.height;

			for (let i in dzList) {
				let tempScore = dzList[i].instance.dockable(self, dgBox, e.x, e.y, group, cloneTemplate, cloned);
				if (tempScore > targetScore) {
					newTarget = dzList[i].instance;
					targetScore = tempScore;
				}
			}

			if (newTarget !== target) {
				if (target) {
					target.disableDockable();
				}
				if (newTarget) {
					target = newTarget;
					if (newTarget !== source) target.enableDockable();
				} else {
					target = false;
				}
			} else {
				if (target === source) {
					target.updateInsertionSpot(newPos, dgBox, sourcePos, true);
				} else if (target instanceof jsDropZone) {
					target.updateInsertionSpot(newPos, dgBox);
				}
			}
		}

		function pUp(e) {
			if (global.jsDNDManager.debug > 1) console.log('pUp');
			if (!cloneTemplate) {
				pHandler.pause(element);
				if (!target) {
					//if draggable has not been moved over a dropzone that can accept it, we'll return it to where it was
					moveDraggable(x0, y0, completeDockingProcedure);
				} else {
					//if a new dropzone has been found we remove the draggable from its current source
					if (target !== source) {
						let oldSource = source;
						source.removeDraggable(self);
						target.dock(self, true, completeDockingProcedure);
						oldSource.redraw(true);
					} else {
						source.changePosition(self, true, completeDockingProcedure);
					}
				}
			} else {
				if (!target || target === source) {
					moveGhost(x0, y0, function () {
						ghost.remove();
						ghost = null;
					});
				} else {
					ghost.removeClass('jsDnD_beingDragged');
					let clonedSettings = cloneObj(settings);
					clonedSettings.clone = false;
					new jsDraggable(target, clonedSettings, ghost);
					ghost = null;
				}
			}
			x0 = 0;
			y0 = 0;
			dx = 0;
			dy = 0;
		}

		function completeDockingProcedure() {
			pHandler.resume(element);
			source.redraw(false);
		}

		/*
			this function is used to move a draggable to a specific position, either for docking it to the right place
			or for returning it to its source if dropped in an invalid spot, etc.
		 */

		let moveDraggable = this.moveDraggable = function (targetX, targetY, complete) {
			if (global.jsDNDManager.debug) console.trace('moveDraggable(%d, %d)', targetX, targetY);
			let distance = jsDND_getDistance(element.offset(), targetX, targetY);
			let duration = 100 * Math.ceil(distance.absolute / 100);
			if (duration > 200) duration = Math.ceil(200 + (duration - 200) / 3);
			if (duration > 400) duration = 400;
			element.animate({
				'left': targetX + 'px',
				'top': targetY + 'px'
			}, duration, 'easeOutBack', complete || function () {
				pHandler.resume(element);
			});
		};

		/*
			when dragging the ghost of a clonable draggable, we need to return it to its source while fading it out,
			when it's been dropped in an invalid place
		 */

		let moveGhost = this.moveGhost = function (targetX, targetY, complete) {
			if (global.jsDNDManager.debug) console.log('moveGhost(%d, %d)', targetX, targetY);
			let distance = jsDND_getDistance(ghost.offset(), targetX, targetY);
			let duration = 100 * Math.ceil(distance.absolute / 100);
			if (duration > 200) duration = Math.ceil(200 + (duration - 200) / 3);
			if (duration > 400) duration = 400;
			ghost.animate({
				'left': targetX + 'px',
				'top': targetY + 'px',
				'opacity': 0
			}, duration, 'easeOutQuint', complete || null);
		};

		let jsphSettings = {
			callbacks: {
				down: pDown,
				up: pUp,
				move: pMove,
				out: pUp
			}
		};

		if (!cloneTemplate) {
			jsphSettings.pressClass = "jsDnD_beingDragged";
		}

		pHandler.listen(element, jsphSettings);

		parent.dock(this, cloned);

	};


	function jsDND_getDistance(pos, x0, y0) {
		let distance = {};
		distance.x = Math.abs(pos.left - x0);
		distance.y = Math.abs(pos.top - y0);
		distance.absolute = Math.sqrt(Math.pow(distance.x, 2) + Math.pow(distance.y, 2));
		return distance;
	}


}(jQuery, window));

/*
	release notes:
	versions prior to v1.1.1 -> check git commit history for details
	v1.1.1:
		- upgraded to use jsPointerHandler v2.1.0
	v1.1.2:
		- added easing on gap classes in CSS
	v1.1.3:
		- failsafes in code to keep linter happy
	v1.1.4:
		- added support for custom classes on draggables and dropzones
		- fixed ordering of draggables in dropzones when lowercase and uppercase strings are mixed
		- added support for wrapping draggables in a container if onDrop is "auto"
	v1.1.5:
		- added a frame with a clipping mask to contain the draggables
	v1.1.6:
		- preventing onChange to be triggered when window is resized
	v1.1.7:
		- added convenience methods for finding and moving draggables
	v1.1.8:
		- type="remove" now implies acceptClones
 */