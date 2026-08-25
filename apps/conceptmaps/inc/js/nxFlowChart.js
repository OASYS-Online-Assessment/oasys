"use strict";

//document
//size of DIN A4 in cm
// let paperWidth = 21;
let paperWidth = 26;
let paperHeight = 29.7;
let resolution = 150 / 2.54; //pixels per cm
let zoom = 1;
let scrollMode = false;

//undo
let undoList = [];
let redoList = [];
let undoMode = false;
let redoMode = false;

//buttons
let bTools;
let bDrawingTool, bConnectorTool, bStyle, bWidth, bColor;
let bZoom, bDelete, bUpload, bGrid, bScroll, bUndo, bRedo, bHome, bDownload, bLang, bHelp, bClearCanvas, bSave2oasys, bCloseEditor, bReturnToTest, bOpen, bSave, bShow, bLock;
let zoomPopup, gridPopup, shortcutsPopup, labelEditorPopup, lockPopup, langPopup;
let drawMode, connectMode;
let action;
let mode;
let textOverlay;
let overlayHeight;
let editorVeil;

const sections = {
	editor: true,
	list: false,
	icons: false
};

let params;
let documentName = '';
let overwrite = 0;
let touchDevice = false;

//let pointerHandler; // UG todo: remove touchDevice and all related stuff
let pointerHelper; // init in event.js
const savingWatcher = new SavingWatcher(); // set/get saving status, raise warning dialog for unsaved changes
$(window).on('beforeunload',savingWatcher.exitWithoutSaving);

window.OASYSCOM = new OasysCom();

let overlayWidth = overlayHeight = 36;
const dd = {}; //documentData
const ddIndex = {raph: {}, doc: {}}; //translation index from Raphael ids to document ids and vice versa
let indexPointer = 0;
let x0, y0;
let Ox, Oy;
let mX, mY;
let prevX, prevY;
let exactX, exactY;
let offCanvas = true;
let lastClick = 0;
let radius = 25;
let dragOffset = {
	x: 0,
	y: 0
};
let hoverId = -1;
let canvas;
let buttonStrip;
let maxDistanceForResize = 20;
let minSize = {
	w: 48,
	h: 48
};
//original size was 192 x 96, reduced temporarily for project
let initialObjSize = {
	w: 192,
	h: 96
};
let gridSize = 24;
let gridMode = true;
let gridVisible = true;
let titlesafe = {
	w: 20,
	h: 20
};
let canvasHeight;
let canvasWidth;

let objColor = "#dddddd";
let objStyle = {
	"stroke-dasharray": "",
	"stroke-width": 1,
};

let conColor = "#000000";
let connectorStyle = {
	"stroke-width": 2,
	"arrow-end": "block-wide-long",
	"stroke-dasharray": ""
};

let txtStyle = {
	fill: "#000000",
	"font-size" : "12",
	"font-weight" : "normal",
	"font-style" : "normal",
	"font-family" : "Arial, Helvetica, sans-serif"
};
let connectorLabelStyle = {
	fill: "#000000",
	"font-size" : "12",
	"font-weight" : "normal",
	"font-style" : "normal"
};
let labelBoxStyle = {
	stroke: "#000000",
	fill: "#ffffff",
	"stroke-width": 1
};
let handleStyle = {
	fill: "#155771",
	"fill-opacity": 1,
	"stroke-width": 0,
	stroke: '#000'
};
let marqueeStyle = {
	"stroke-width": 1,
	stroke: '#155771',
	fill: '#155771',
	"fill-opacity": 0.1,
	"stroke-dasharray": ""
};

let hoverStyle = {
	fill: "#96ceef",
	stroke: '#15a5e5'
};
let hoverConnectorStyle = {
	stroke: '#15a5e5'
};
let hoverLabelStyle = {
	fill: '#15a5e5'
};
let glowStyle = {
	color: '#15a5e5'
};
let connectorCorrector = (connectorStyle["stroke-width"] % 2) / 2;
let tempConnectorStyle = {
	"stroke-width": 2,
	stroke: '#96ceef',
	"arrow-end": "block-wide-long",
	"stroke-dasharray": "--"
};
let shadow = {width: 5, fill: true, opacity: 0.25, offsetx: 10, offsety: 10, color: 'black'};
let baseHandleSize = 12;
let baseHandleGap = 10;
let handleSize = baseHandleSize;
let handleGap = baseHandleGap;
let handles = [];
let marquee;
let marqueeCoords = {x0: 0, y0: 0, x1: 0, y1: 0};
let objInitialCoords = {
	x: -1,
	y: -1,
	w: -1,
	h: -1
};
let editList = {};
let dragging = false;
let draggingLabel = null;
let resizing = false;
let resizeMode = ''; //direction of resizing, e.g. ne, n, nw, ...
let resizeId = -1; //id of the object subject to being resized, before resizing actually starts
let selection = {};
let directions = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
let leftPanel;
let leftPanelVisible = true;
let labelEditorSection;
let labelEditor;
let currentConnection;
let connecting = false;
let tempConnectorId = null;
let canvasActionInProgress = false;
let positionSlider;
let lastId;
let editorVisible = false;
let debugCounter = 0;
// label editing
let oldTxt = '';
let txtObject;

let interceptedFunction;
let ignoreUndoStep = false;
let delayedEvent = null;
let loadingMode = false;

function getMatchingColor(color) {
	let retColor;
	color = color.slice(1); //remove hash
	let r = parseInt(color.substring(0, 2), 16),
		g = parseInt(color.substring(2, 4), 16),
		b = parseInt(color.substring(4, 6), 16);
	color = rgbToHsl(r, g, b);
}

function rgbToHsl(r, g, b) {
	r /= 255;
	g /= 255;
	b /= 255;
	let max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h, s, l = (max + min) / 2;
	if (max === min) {
		h = s = 0;
	} else {
		let d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}
	return [h, s, l];
}

function registerId(raphId, forcedId) {
	if (!(undoMode || redoMode || loadingMode) || !forcedId) {
		ddIndex.raph[raphId] = indexPointer;
		ddIndex.doc[indexPointer] = raphId;
		return indexPointer++; //return pointer then increment
	} else {
		//when redoing object creation we want to keep former id, hence the forced id
		ddIndex.raph[raphId] = forcedId;
		ddIndex.doc[forcedId] = raphId;
		return forcedId;
	}
}

function unregisterId(id) {
	const raphId = ddIndex.doc[id];
	delete ddIndex.raph[raphId];
	delete ddIndex.doc[id];
}

function undoHandler(action, params, data) {
	//console.log('###################### undoHandler ##############')
	//console.log(arguments)
	//do not register undo steps when loading a document
	if (loadingMode) {
		//console.log('###################### undoHandler skip when loading')
		return;
	}
	if (!undoMode) {
		//console.log('###################### undoHandler push 2 undo')
		undoList[undoList.length-1].push({action: action, params: params});
	} else {
		//console.log('###################### undoHandler push 2 redo')
		redoList[redoList.length-1].push({action: action, params: params});
	}
}

function newUndoStep() {
	//if current undo step has no data abort
	if (undoList[undoList.length-1] && undoList[undoList.length-1].length === 0) {
		return;
	}
	if (!undoMode && !redoMode) redoList = []; //clear redoList as we are branching off the tree here
	undoList.push([]);
	switchUndoButtons();
}

function newRedoStep() {
	//if current undo step has no data abort
	if (redoList[redoList.length-1] && redoList[redoList.length-1].length === 0) {
		return;
	}
	redoList.push([]);
	switchUndoButtons();
}

function undoAction() {
	if (undoList.length < 2) return;
	savingWatcher.setSaved(false);
	log('undo');
	if (labelEditor.is(':focus')) {
		fcdb('undo');
		interceptedFunction = undoAction;
		labelEditor.get(0).blur();
		return;
	}
	undoMode = true;
	
	const pGridMode = gridMode; //save gridMode before switching it
	gridMode = false;
	undoList.pop(); //discard new undo step
	let undoActions = undoList.pop();
	/* close label editor if the next step is not label editing */
	if (undoActions[0].action.name !== 'updateConnectorLabel' && undoActions[0].action.name !== 'updateObjectLabel' && undoActions[0].action.name !== 'doUndoRedo') {
		clearSelection();
		if (labelEditorPopup && typeof labelEditorPopup.hide === 'function') {
			labelEditorPopup.hide();
		}
	}
	newRedoStep();
	for (let i = undoActions.length-1; i >= 0; i--) {
		undoActions[i].action.apply(this, undoActions[i].params);
	}
	newUndoStep();
	if (!ignoreUndoStep) {

	} else {
		ignoreUndoStep = false;
		redoList.pop();
		undoAction();		
	}
	newRedoStep();
	gridMode = pGridMode; //switch gridMode back
	switchUndoButtons();
	undoMode = false;
}

function redoAction() {
	savingWatcher.setSaved(false);
	log('redo');
	if (labelEditor.is(':focus')) {
		interceptedFunction = redoAction;
		labelEditor.get(0).blur();
		return;
	}
	redoMode = true;
	const pGridMode = gridMode; //save gridMode before switching it
	gridMode = false;
	redoList.pop(); // discard empty step
	let redoActions = redoList.pop();
	for (let i in redoActions) {
		redoActions[i].action.apply(this, redoActions[i].params);
	}
	/* close label editor if the next step is not label editing */
	if (redoActions[0].action.name !== 'updateConnectorLabel' && redoActions[0].action.name !== 'updateObjectLabel' && redoActions[0].action.name !== 'doUndoRedo') {
		clearSelection();
		if (labelEditorPopup && typeof labelEditorPopup.hide === 'function') {
			labelEditorPopup.hide();
		}
	}
	newUndoStep();
	newRedoStep();
	gridMode = pGridMode; //switch gridMode back
	switchUndoButtons();
	redoMode = false;	
}

function switchUndoButtons() {
	if (undoList.length <= 1) {
		bUndo.disable();
	} else {
		bUndo.enable();
	}
	if (redoList.length <= 1) {
		bRedo.disable();
	} else {
		bRedo.enable();
	}
}

function createRect(x, y, w, h, localObjStyle, localObjColor, localTxtStyle, objId, labelId, text, locked, labelslocked) {
	const correction = (localObjStyle["stroke-width"] % 2) / 2;
	const rx = grid(x-w/2, correction);
	const ry = grid(y-h/2, correction);
	const rw = grid(w);
	const rh = grid(h);
	const obj = canvas.rect(rx, ry, rw, rh, 0).attr(localObjStyle);
	const l = setObjLabel(obj, localTxtStyle);
	registerId(obj.id, objId);
	registerId(l.id, labelId);
	let children = [];
	children.push(get(l));
	dd[get(obj)] = {
		children: children,
		type: 'object',
		subtype: 'rectangle',
		style: localObjStyle,
		color: localObjColor,
		label: get(l),
		x: grid(x),
		y: grid(y),
		w: rw,
		h: rh,
		lw: w - titlesafe.w,
		lh: h - titlesafe.h,
		connections: {},
		remoteConnections: {},
		locked: locked
	};
	dd[get(l)] = {
		parent: get(obj),
		x: 0,
		y: 0,
		pos: 'c',
		type: 'label',
		locked: labelslocked,
		style: localTxtStyle,
		text: text || ''
	};
	if (text) updateObjectLabel(get(obj), text);
	undoHandler(deleteObj, [get(obj)]);
	updateObjectData(get(obj));
	if (!undoMode && !redoMode) log('create rectangle with id %@ [x: %@, y: %@, width: %@, height: %@, linestyle: %@, linewidth: %@, color: %@, text: %@]', get(obj), x, y, w, h, sLine(localObjStyle), localObjStyle["stroke-width"], localObjColor, text || '');
	savingWatcher.setSaved(false);
	return obj;
}

function createRoundedRect(x, y, w, h, localObjStyle, localObjColor, localTxtStyle, objId, labelId, text, locked, labelslocked) {
	const correction = (localObjStyle["stroke-width"] % 2) / 2;
	const rx = grid(x-w/2, correction);
	const ry = grid(y-h/2, correction);
	const rw = grid(w);
	const rh = grid(h);
	const obj = canvas.rect(rx, ry, rw, rh, radius).attr(localObjStyle);
	const l = setObjLabel(obj, localTxtStyle);
	registerId(obj.id, objId);
	registerId(l.id, labelId);
	let children = [];
	children.push(get(l));
	dd[get(obj)] = {
		children: children,
		type: 'object',
		subtype: 'roundedRectangle',
		style: localObjStyle,
		color: localObjColor,
		label: get(l),
		x: grid(x),
		y: grid(y),
		w: rw,
		h: rh,
		lw: w - titlesafe.w,
		lh: h - titlesafe.h,
		connections: {},
		remoteConnections: {},
		locked: locked
	};
	dd[get(l)] = {
		parent: get(obj),
		x: 0,
		y: 0,
		pos: 'c',
		type: 'label',
		locked: labelslocked,
		style: localTxtStyle,
		text: text || ''
	};
	if (text) updateObjectLabel(get(obj), text);
	undoHandler(deleteObj, [get(obj)]);
	updateObjectData(get(obj));
	if (!undoMode && !redoMode) log('create rounded rectangle with id %@ [x: %@, y: %@, width: %@, height: %@, linestyle: %@, linewidth: %@, color: %@, text: %@]', get(obj), x, y, w, h, sLine(localObjStyle), localObjStyle["stroke-width"], localObjColor, text || '');
	savingWatcher.setSaved(false);
	return obj;
}

function createEllipse(x, y, w, h, localObjStyle, localObjColor, localTxtStyle, objId, labelId, text, locked, labelslocked) {
	const correction = (localObjStyle["stroke-width"] % 2) / 2;
	x = grid(x);
	y = grid(y);
	const rx = grid(w/2, correction);
	const ry = grid(h/2, correction);
	const rw = grid(w);
	const rh = grid(h);
	const obj = canvas.ellipse(x, y, rx, ry).attr(localObjStyle);
	const l = setObjLabel(obj, localTxtStyle);
	registerId(obj.id, objId);
	registerId(l.id, labelId);
	let children = [];
	children.push(get(l));
	let area = 0;
	let lh, lw = 0;
	for (let i = 1; i < rx; i++) {
		let cs = i / rx;
		let angle = Math.acos(cs);
		let sn = Math.sin(angle);
		let a = sn * ry * i;
		if (a > area) {
			area = a;
			lw = i * 2;
			lh = sn * ry * 2;
		}
	}
	dd[get(obj)] = {
		children: children,
		type: 'object',
		subtype: 'ellipse',
		style: localObjStyle,
		color: localObjColor,
		label: get(l),
		x: x,
		y: y,
		w: rw,
		h: rh,
		lw: lw,
		lh: lh,
		connections: {},
		remoteConnections: {},
		locked: locked
	};
	dd[get(l)] = {
		parent: get(obj),
		x: 0,
		y: 0,
		pos: 'c',
		type: 'label',
		locked: labelslocked,
		style: localTxtStyle,
		text: text || ''
	};
	if (text) updateObjectLabel(get(obj), text);
	undoHandler(deleteObj, [get(obj)]);
	updateObjectData(get(obj));
	if (!undoMode && !redoMode) log('create ellipse with id %@ [x: %@, y: %@, width: %@, height: %@, linestyle: %@, linewidth: %@, color: %@, text: %@]', get(obj), x, y, w, h, sLine(localObjStyle), localObjStyle["stroke-width"], localObjColor, text || '');
	savingWatcher.setSaved(false);
	return obj;
}

function createDiamond(x, y, w, h, localObjStyle, localObjColor, localTxtStyle, objId, labelId, text, locked, labelslocked) {
	const cx = grid(x);
	const cy = grid(y);
	w = grid(w);
	h = grid(h);
	const px0 = cx-w/2;
	const py0 = cy-h/2;
	const px1 = cx+w/2;
	const py1 = cy+h/2;
	const points = [
		{com: 'M', x: cx, y: py0},
		{com: 'L', x: px1, y: cy},
		{com: 'L', x: cx, y: py1},
		{com: 'L', x: px0, y: cy}
	];
	const pathString = createPathString(points, true);
	const obj = canvas.path(pathString).attr(localObjStyle);
	obj.attr({'x': cx, 'y': cy, 'width': w, 'height': h});
	const l = setObjLabel(obj, localTxtStyle);
	registerId(obj.id, objId);
	registerId(l.id, labelId);
	let children = [];
	children.push(get(l));
	dd[get(obj)] = {
		children: children,
		type: 'object',
		subtype: 'diamond',
		style: localObjStyle,
		color: localObjColor,
		label: get(l),
		x: cx,
		y: cy,
		w: grid(w),
		h: grid(h),
		lw: w/2,
		lh: h/2,
		connections: {},
		remoteConnections: {},
		locked: locked
	};
	dd[get(l)] = {
		parent: get(obj),
		x: 0,
		y: 0,
		pos: 'c',
		type: 'label',
		locked: labelslocked,
		style: localTxtStyle,
		text: text || ''
	};
	if (text) updateObjectLabel(get(obj), text);
	undoHandler(deleteObj, [get(obj)]);
	updateObjectData(get(obj));
	if (!undoMode && !redoMode) log('create ellipse with id %@ [x: %@, y: %@, width: %@, height: %@, linestyle: %@, linewidth: %@, color: %@, text: %@]', get(obj), x, y, w, h, sLine(localObjStyle), localObjStyle["stroke-width"], localObjColor, text || '');
	savingWatcher.setSaved(false);
	return obj;
}

function recreateObject(id, newType) {
	let data = dd[id];
	let newObj;
	switch(newType) {
		case 'rectangle':
			newObj = createRect(data.x, data.y, data.w, data.h, data.style, data.color, dd[data.label].style, null, null, dd[data.label].text, data.locked);
			break;
		case 'roundedRectangle':
			newObj = createRoundedRect(data.x, data.y, data.w, data.h, data.style, data.color, dd[data.label].style, null, null, dd[data.label].text, data.locked);
			break;
		case 'ellipse':
			newObj = createEllipse(data.x, data.y, data.w, data.h, data.style, data.color, dd[data.label].style, null, null, dd[data.label].text, data.locked);
			break;
		case 'diamond':
			newObj = createDiamond(data.x, data.y, data.w, data.h, data.style, data.color, dd[data.label].style, null, null, dd[data.label].text, data.locked);
			break;
		default:
			fcdb("Unsupported object type: %@", data.subtype);
			return;
	}
	{
		for (let i in dd[id].connections) {
			let conId = dd[id].connections[i];
			data = dd[conId];
			let conLabelBox = dd[conId].label;
			let conLabel = dd[conLabelBox].label;
			let newConId = createConnection(get(newObj), i, data.subtype, true, conId, data.color, data.style, data.labelPosition, dd[conLabelBox].style, dd[conLabel].style, null, null, dd[conLabel].text, data.locked);
			if (newConId) {
				if (selection[conId]) selection[newConId] = true;
			}
		}
	}
	{
		for (let i in dd[id].remoteConnections) {
			let conId = dd[id].remoteConnections[i];
			data = dd[conId];
			let conLabelBox = dd[conId].label;
			let conLabel = dd[conLabelBox].label;
			let newConId = createConnection(i, get(newObj), data.subtype, true, conId, data.color, data.style, data.labelPosition, dd[conLabelBox].style, dd[conLabel].style, null, null, dd[conLabel].text, data.locked);
			if (newConId) {
				if (selection[conId]) selection[newConId] = true;
			}
		}
	}
	return get(newObj);
}


function grid(v, gridCorr) {
	if (!gridCorr) gridCorr = 0;
	let tempGridSize = gridSize;
	if(!gridMode) tempGridSize = 1;
	let newV = Math.round(v / tempGridSize) * tempGridSize - gridCorr;
	return newV;
}

function getParentId(obj) {
	let id = get(obj);
	let parentId = id;
	while((id ?? null) !== null) {
		parentId = id;
		if (!dd[id]) {
			fcdb("Error determining parent of object with id=%@: dd[%@] not defined!", get(obj), id);
		}
		id = dd[id].parent;
	}
	return parentId;
}


function getObjectPoints(obj) {
	const bb = obj.getBBox();
	const points = {
		nw: {
			x: bb.x,
			y: bb.y
		},
		n: {
			x: (bb.x + bb.width / 2),
			y: bb.y
		},
		ne: {
			x: (bb.x + bb.width),
			y: bb.y
		},
		w: {
			x: bb.x,
			y: (bb.y + bb.height / 2)
		},
		c: {
			x: (bb.x + bb.width / 2),
			y: (bb.y + bb.height / 2)
		},
		e: {
			x: (bb.x + bb.width),
			y: (bb.y + bb.height / 2)
		},
		sw: {
			x: bb.x,
			y: (bb.y + bb.height)
		},
		s: {
			x: (bb.x + bb.width / 2),
			y: (bb.y + bb.height)
		},
		se: {
			x: (bb.x + bb.width),
			y: (bb.y + bb.height)
		}
	};
	return points;
}

function deleteObj(id, parent) {
	savingWatcher.setSaved(false);
    if ((id ?? null) === null || id === -1) return;
    if (typeof(id) === 'object') {
    	for (let i in id) deleteObj(parseInt(i));
    } else {
	    let obj = get(id);
	    if (!dd[id]) fcdb("unkown object: %@", id); //assertion error
	    let type = dd[id].type;
	    if (type === "object" || parent > -1) {
	        let children = dd[id].children;
	        for (let child in children) deleteObj(children[child], id);
	        if (type === "label") {
	            //copy meta data to parent needed later for undo action
	            let data = dd[id];
	            let parent = data.parent;
	            dd[parent].textStyle = data.style;
	            dd[parent].text = data.text;
	            //////
	            obj.remove();
	        	delete dd[id];
	        	unregisterId(id);
	        } else if (type === "labelBox") {
	            //copy meta data to parent needed later for undo action
	            let data = dd[id];
	            let parent = data.parent;
	            dd[parent].textStyle = data.textStyle;
	            dd[parent].text = data.text;
	            dd[parent].labelBoxStyle = data.style;
	            dd[parent].labelTextId = data.label;
	            //////
	            obj.remove();
	        	delete dd[id];
	        	unregisterId(id);
	        } else if (type === "object") {
	            for (let con in dd[id].connections) {
	                deleteConnection(dd[id].connections[con]);
	            }
	            for (let con in dd[id].remoteConnections) {
	                deleteConnection(dd[id].remoteConnections[con]);
	            }
	            unselectObj(id);
	            let data = dd[id];
	            let action;
	            switch(data.subtype) {
	            	case 'rectangle':
	            		action = createRect;
	            		break;
	            	case 'roundedRectangle':
	            		action = createRoundedRect;
	            		break;
	            	case 'ellipse':
	            		action = createEllipse;
	            		break;
	            	case 'diamond':
	            		action = createDiamond;
	            		break;
	            }
	            // undoHandler(updateObjectLabel, [id, data.text, data.textStyle]);
	            undoHandler(action, [data.x, data.y, data.w, data.h, data.style, data.color, data.textStyle, id, data.label, data.text, data.locked]);
            	if (!undoMode && !redoMode) log('delete object with id %@', id);
	            obj.remove();
	        	delete dd[id];
	        	unregisterId(id);
	        }
	    } else if (type === 'connector') {
	    	deleteConnection(id);
	    	updateSelection();
	    }
    }
}


function clearSelection() {
	if (bDelete) bDelete.disable(); // disable delete button
	hideHandles();
    for (let i in selection) {
    	unselectObj(i);
    }
    selection = {};
	if (action === 'selecting') {
		if (labelEditor) labelEditor.val('');
		if (bDrawingTool) {
			bDrawingTool.setValue('undefined');
			bDrawingTool.deactivate();
		}
		if (bConnectorTool) {
			bConnectorTool.setValue('undefined');
			bConnectorTool.deactivate();
		}
		if (bStyle) {
			bStyle.setValue('undefined');
			bStyle.deactivate();
		}
		if (bWidth) {
			bWidth.setValue('undefined');
			bWidth.deactivate();
		}
		if (bColor) {
			bColor.setValue('undefined');
			bColor.deactivate();
		}
		$('#container_cm_objects_color').hide();
		$('#container_cm_stroke_color').hide();
	}
}

function selectObj(id) {
	if(id === -1) return; // invalid
	if (mode === 'single') clearSelection();
	if (mode === 'multi' && selection[id] === true) {
		unselectObj(id);
		delete selection[id];
	} else {
		setHoverStyle(id);
		selection[id] = true;
	}
	updateSelection();
}

function selectObjectsInMarquee() {
	clearSelection();
	for (let i in dd) {
		const marqueePath = bBoxToPath(marquee.getBBox());
		if (dd[i].type === 'object') {
			if (Raphael.isBBoxIntersect(get(i).getBBox(), marquee.getBBox())) selectObj(i);
		}
		if (dd[i].type === 'connector') {
			const bBox = get(i).getBBox();
			if (marquee.isPointInside(bBox.x, bBox.y) || marquee.isPointInside(bBox.x2, bBox.y2)) {
				selectObj(i);
			} else if (Raphael.pathIntersection(marqueePath, dd[i].path).length > 0) {
				selectObj(i);
			}
		}
	}
}

function updateSelection() {
	// anything in selection which is not locked?
	let editableShapes = false;
	let editableCons = false;
	for (let i in selection) {
		if (dd[i].type === 'object' && dd[i].locked === false) editableShapes = true;
		if (dd[i].type === 'connector' && dd[i].locked === false) editableCons = true;
		if (count(selection) > 1 && dd[i].locked === true && DATAFORMAT.getRespectLock()) {
			unselectObj(i);
		}		
	}
	let rl = DATAFORMAT.getRespectLock();
	if (!editableShapes && !editableCons && rl) {
		bDelete.disable();
	} else {
		bDelete.enable();
	}

	// reset colorpicker
	$('#container_cm_stroke_color .sp-preview-inner').removeClass('sp-preview-multi');
	$('#container_cm_objects_color .sp-preview-inner').removeClass('sp-preview-multi');
	if (count(selection) === 0) {
		clearSelection();
		hideTextOverlay();
		editorVisible = false;
		if (action === 'selecting') {
			$('#propertiesSection_title').hide();
		}
	} else {
		$('#propertiesSection_title').show();
		if (bDrawingTool) {
			const objectType = getSelectionProperty('objectType');
			if (objectType !== 'disable') {
				bDrawingTool.activate();
				bDrawingTool.setValue(objectType);
			}
		}
		if (bConnectorTool) {
			const connectorType = getSelectionProperty('connectorType');
			if (connectorType !== 'disable') {
				bConnectorTool.activate();
				bConnectorTool.setValue(connectorType);
			}
		}
		if (bWidth) {
			const width = getSelectionProperty('stroke-width');
			if (width !== 'disable') {
				bWidth.activate();
				bWidth.setValue(width);
			}
		}
		if (bStyle) {
			const lineStyle = getSelectionProperty('stroke-dasharray');
			if (lineStyle !== 'disable') {
				bStyle.activate();
				bStyle.setValue(lineStyle);
			}
		}
		let oCol = false; // show or hide object color picker
		for (let s in selection) {
			if (dd[s].type === 'object') oCol = true;
		}
		// set colorpicker fill
		if (oCol) {
			let color = getSelectionProperty('fill'); // color picker fill			
			if (color !== 'disable') {
				$('#container_cm_objects_color').show(); // show color picker shape&connector
				if (color !== 'undefined') {
					$('#cm_objects_color').spectrum("set", color); // set colorpicker
				} else {
					$('#container_cm_objects_color .sp-preview-inner').addClass('sp-preview-multi');
				}
			}
		}

		// set colorpicker stroke
		let strocolor = getSelectionProperty('stroke'); // color picker fill
		if (strocolor !== 'disable') {
			$('#container_cm_stroke_color').show();
			if (strocolor !== 'undefined') {
				$('#cm_stroke_color').spectrum("set", strocolor); // set colorpicker
			} else {
				$('#container_cm_stroke_color .sp-preview-inner').addClass('sp-preview-multi');
			}
		}
		
		if (count(selection) === 1) {
			const selectedId = Object.keys(selection)[0];
			if (dd[selectedId].type === 'object') {
				const obj = get(selectedId);
				updateHandlePositions(obj);
				if (dd[selectedId].locked === false || DATAFORMAT.getRespectLock() === false) showHandles();
			}
		    for (let i in handles) {
		        dd[get(handles[i])].parent = selectedId;
		    }
			let txt = '';
			if (dd[selectedId].label) {
				const l = dd[selectedId].label;
				if (dd[l].type === 'labelBox') {
					const t = dd[l].label;
					txt = dd[t].text;
				} else {
					txt = dd[l].text;
				}
			}
			labelEditor.val(txt);
		} else {
			hideHandles();			
			//hideTextOverlay();
			labelEditor.val('');
		}
	}
}

function showTextOverlay() {
	if (count(selection) !== 1) return false;
	const selectedId = Object.keys(selection)[0];
	if (dd[dd[selectedId].label].locked === true && DATAFORMAT.getRespectLock()) return false;
	const obj = get(selectedId);
	let overlayX = 0;
	let overlayY = 0;
	if (dd[selectedId].type === 'object') {
		const bb = obj.getBBox();
		overlayX = (bb.x2) * zoom - overlayWidth; 
		overlayY = (bb.y2) * zoom - overlayHeight;
	} else if (dd[selectedId].type === 'connector') {
		const labelPoint = getLabelPoint(selectedId);
		overlayX = labelPoint.x * zoom; 
		overlayY = labelPoint.y * zoom;
	}
	textOverlay.css({left: overlayX + 'px', top: overlayY + 'px'}).show();
}

function hideTextOverlay() {
	textOverlay.hide();
}

function getSelectionProperty(property) {
	let value = 'disable';
	if (count(selection) > 0) {
		let init = true;
		for (let i in selection) {
			if (dd[i].locked === true && DATAFORMAT.getRespectLock()) continue;
			if (init) {
				if (property === 'color') {
					value =  dd[i][property];
				} else if (property === 'objectType') {
					if (dd[i].type === 'object') {
						value =  dd[i].subtype;
					} else {
						continue;
					}
				} else if (property === 'connectorType') {
					if (dd[i].type === 'connector') {
						value =  dd[i].subtype;
					} else {
						continue;
					}
				} else {
					value =  dd[i].style[property];
				}
				init = false;
			} else {
				let currentValue = '';
				if (property === 'color') {
					currentValue =  dd[i][property];
				} else if (property === 'objectType') {
					if (dd[i].type === 'object') {
						currentValue =  dd[i].subtype;
					} else {
						continue;
					}
				} else if (property === 'connectorType') {
					if (dd[i].type === 'connector') {
						currentValue =  dd[i].subtype;
					} else {
						continue;
					}
				} else {
					if (dd[i].style[property] === undefined) continue;
					currentValue =  dd[i].style[property];
				}
				if (value !== currentValue) {
					return 'undefined';
				}
			}
		}
	}
	return value;
}

function updateSelectionElements(typeFilter, newType) {
	//savingWatcher.setSaved(false);
	const selectionCopy = clone(selection);
	mode = 'multi';
	for (let i in selectionCopy) {
		if (dd[i] && dd[i].type === typeFilter) {
			switch(dd[i].type) {
				case 'connector':
					if (!undoMode && !redoMode) {
						log('change type of connector with id %@: %@', i, newType);
					}
					updateConnection(i, newType);
					updateGlow(i);
					break;
				case 'object':
					if (!undoMode && !redoMode) {
						log('change type of object with id %@: %@', i, newType);
					}
					const newId = recreateObject(i, newType);
					deleteObj(i);
					selectObj(newId);
			}
		}
	}
	updateSelection();
	for (let i in selection) {
		setHoverStyle(i);
	}
	mode = 'single';
}


function bBoxToPath(bBox) {
	return stringf("M%@ %@ L%@ %@ L%@ %@ L%@ %@ Z", bBox.x, bBox.y, bBox.x2, bBox.y, bBox.x2, bBox.y2, bBox.x, bBox.y2);
}

function setHoverStyle(id) {
	if (get(id) === null) return; // click on empty canvas area
	if (dd[id].locked === true && DATAFORMAT.getRespectLock() === true) return false;
	const obj = get(id);
	switch (dd[id].type) {
		case 'object':
			if (!dd[id].glow) dd[id].glow = obj.glow(glowStyle);
			break;
		case 'connector':
			if (!dd[id].glow && !dd[id].hidden) { // avoid dragging selections sets glows on hidden connectors
				dd[id].glow = obj.glow(glowStyle); 
			}
			break;
		case 'label':
			break;
	}
}

function unselectObj(id) {
	if (!dd[id]) return;
	removeGlow(id);
	delete selection[id];
	updateSelection();
}

function removeGlow(id) {
	if (dd[id] && dd[id].glow) {
		dd[id].glow.remove();
		delete dd[id].glow;
	}
}

function setObjectStyle(id) { // apply styles from dd to object
	const obj = get(id);
	obj.attr(dd[id].style);
	for (let i in dd[id].children) {
		setObjectStyle(dd[id].children[i]);
	}
	
}

function drawMarquee() {
	marquee = canvas.rect(0, 0, 0, 0, 0).attr(marqueeStyle);
	marquee.hide;
}

function drawHandles() {
	const coords = {x: 0, y: 0};
	const positions = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
	const parent = -1;
	for (let i in positions) {
		const pos = positions[i];
		const handle = canvas.rect(coords.x, coords.y, handleSize, handleSize, 0).attr(handleStyle);
		registerId(handle.id);
		const id = get(handle);
		dd[id] = {
			type: 'handle',
			pos: pos,
			parent: parent
		};
		handles.push(handle);
		handle.hide();
    }
}

function showHandles() {
    for (let i in handles) {
        handles[i].show();
    }
}

function hideHandles() {
    for (let i in handles) {
        handles[i].hide();
    }
}

function setHandleSize() {
	handleSize = Math.round(baseHandleSize / zoom);
	handleGap = Math.round(baseHandleGap / zoom);
    for (let i in handles) {
    	handles[i].attr({
    		width: handleSize,
    		height: handleSize
    	});
    }
    if (count(selection) === 1) {
		const selectedId = Object.keys(selection)[0];
		if (dd[selectedId].type === 'object') {
			const obj = get(selectedId);
			updateHandlePositions(obj);
		}
	}
}

//adjust handle coordinates when resizing
function updateHandlePositions(obj) {
	const points = getObjectPoints(obj);
	for (let i in handles) {
		const handle = handles[i];
		const pos = dd[get(handle)].pos;
		const coords = points[pos];
		determineHandlePosition(coords, pos);
        handle.attr('x', coords.x - 0.5);
        handle.attr('y', coords.y - 0.5);
        handle.attr(handleStyle);
        handle.toFront();
    }
}

function determineHandlePosition(coords, pos) {
	let x = coords.x;
	let y = coords.y;
	switch (pos) {
		case 'nw':
			x = x - handleSize - handleGap;
			y = y - handleSize - handleGap;
			break;
		case 'n':
			x = x - handleSize / 2;
			y = y - handleSize - handleGap;
			break;
		case 'ne':
			x = x + handleGap;
			y = y - handleSize - handleGap;
			break;
		case 'w':
			x = x - handleSize - handleGap;
			y = y - handleSize / 2;
			break;
		case 'e':
			x = x + handleGap;
			y = y - handleSize / 2;
			break;
		case 'sw':
			x = x - handleSize - handleGap;
			y = y + handleGap;
			break;
		case 's':
			x = x - handleSize / 2;
			y = y + handleGap;
			break;
		case 'se':
			x = x + handleGap;
			y = y + handleGap;
	}
	coords.x = x;
	coords.y = y;
}

function changeStroke(id, value) {
	if (dd[id].locked === true && DATAFORMAT.getRespectLock() === true) return;
	savingWatcher.setSaved(false);
	get(id).attr("stroke-dasharray", value);
	undoHandler(changeStroke, [id, dd[id].style["stroke-dasharray"]]);
	dd[id].style["stroke-dasharray"] = value;
	if (!undoMode && !redoMode) log('change line style of object with id %@: %@', id, sLine(dd[id].style));
}

function changeStrokeWidth(id, value) {
	if (dd[id].locked === true && DATAFORMAT.getRespectLock() === true) return;
	savingWatcher.setSaved(false);
	get(id).attr("stroke-width", value);
	undoHandler(changeStrokeWidth, [id, dd[id].style["stroke-width"]]);
	if (!undoMode && !redoMode) log('change line width of object with id %@: %@', id, value);
	dd[id].style["stroke-width"] = value;
}

function changeColor(id, value, sender) {
	if (dd[id].locked === true && DATAFORMAT.getRespectLock() === true) return;
	if (!undoMode && !redoMode) log('change color of object with id %@: %@', id, value);
	let undoStyle;
	if (dd[id].type === 'object') {
		undoStyle = {fill : dd[id].style["fill"] , stroke : dd[id].style["stroke"]};
		if (sender === 'colorButton') dd[id].style["fill"] = value;
		if (sender === 'strokeColorButton') dd[id].style["stroke"] = value;
		// $('#cm_stroke_color').spectrum("get").toHexString()
		
	} else if (dd[id].type === 'connector' && sender === 'strokeColorButton') {
		undoStyle = {stroke : dd[id].style["stroke"]};
		const l = get(dd[id].label);
		dd[id].style.stroke = value;
		dd[dd[id].label].style.stroke = value;
		
	}
	dd[id].color = value;
	setObjectStyle(id);

	savingWatcher.setSaved(false);
	//let obj = get(id);
	undoHandler(resetColor, [id, undoStyle]);
}

function resetColor(id, attr) { // called from undo
	let undoStyle;
	if (dd[id].type === 'object') {
		undoStyle = {fill : dd[id].style["fill"] , stroke : dd[id].style["stroke"]};
		dd[id].style["fill"] = attr.fill;
		dd[id].style["stroke"] = attr.stroke;
		dd[id].color = attr.fill;
		
	} else if (dd[id].type === 'connector') {
		undoStyle = {stroke : dd[id].style["stroke"]};
		const l = get(dd[id].label);
		dd[id].style.stroke = attr.stroke;
		dd[dd[id].label].style.stroke = attr.stroke;
		dd[id].color = attr.stroke;
	}
	setObjectStyle(id);

	savingWatcher.setSaved(false);
	undoHandler(resetColor, [id, undoStyle]);
}

function resizeObj() {
	savingWatcher.setSaved(false);
	let dx = mX - x0;
	let dy = mY - y0;
	if (resizeMode === 'n' || resizeMode === 's') {
		dx = 0;
	}
	if (resizeMode === 'w' || resizeMode === 'e') {
		dy = 0;
	}
	let w = objInitialCoords.w;
	let h = objInitialCoords.h;
	const cx = objInitialCoords.x;
	const cy = objInitialCoords.y;
	let x = cx - w / 2;
	let y = cy - h / 2;
	const resizeFlags = {
		n: false,
		s: false,
		w: false,
		e: false
	};
	switch (resizeMode) {
		case 'nw':
			resizeFlags.n = true;
			resizeFlags.w = true;
			break;
		case 'n':
			resizeFlags.n = true;
			break;
		case 'ne':
			resizeFlags.n = true;
			resizeFlags.e = true;
			break;
		case 'w':
			resizeFlags.w = true;
			break;
		case 'e':
			resizeFlags.e = true;
			break;
		case 'sw':
			resizeFlags.s = true;
			resizeFlags.w = true;
			break;
		case 's':
			resizeFlags.s = true;
			break;
		case 'se':
			resizeFlags.s = true;
			resizeFlags.e = true;
			break;
	}
	if(resizeFlags.n) {
		y += dy;
		h -= dy;
		if(h < minSize.h) {
			h = minSize.h;
			y = objInitialCoords.y + objInitialCoords.h / 2 - minSize.h;
		}
	}
	if(resizeFlags.s) {
		h += dy;
		if(h < minSize.h) {
			h = minSize.h;
		}
	}
	if(resizeFlags.w) {
		x += dx;
		w -= dx;
		if(w < minSize.w) {
			w = minSize.w;
			x = objInitialCoords.x + objInitialCoords.w / 2 - minSize.w;
		}
	}
	if(resizeFlags.e) {
		w += dx;
		if(w < minSize.w) {
			w = minSize.w;
		}
	}
	const obj = get(resizeId);
	const stroke = (obj.attr('stroke-width'));
	const mvCorr = (stroke % 2) / 2;
	if (dd[resizeId].subtype === 'ellipse') {
		obj.attr("rx", grid(w) / 2);
		obj.attr("ry", grid(h) / 2);
		obj.attr("cx", grid(x - 0.1) + grid(w) / 2); //to eliminate rounding errors, we introduce the "-0.1" before rounding to the grid
		obj.attr("cy", grid(y - 0.1) + grid(h) / 2);
	} else if (dd[resizeId].subtype === 'diamond') {
		w = grid(w);
		h = grid(h);
		x = grid(x - 0.1) + w / 2; //to eliminate rounding errors, we introduce the "-0.1" before rounding to the grid
		y = grid(y - 0.1) + h / 2;
		obj.attr("x", x);
		obj.attr("y", y);
		obj.attr("width", w);
		obj.attr("height", h);
		const px0 = grid(x - w / 2);
		const py0 = grid(y - h / 2);
		const px1 = grid(x + w / 2);
		const py1 = grid(y + h / 2);
		const points = [
			{com: 'M', x: x, y: py0},
			{com: 'L', x: px1, y: y},
			{com: 'L', x: x, y: py1},
			{com: 'L', x: px0, y: y}
		];
		const pathString = createPathString(points, true);
		obj.attr('path', pathString);
	} else {
		obj.attr("x", grid(x-0.1, mvCorr)); //to eliminate rounding errors, we introduce the "-0.1" before rounding to the grid
		obj.attr("y", grid(y-0.1, mvCorr));
		obj.attr("width", grid(w));
		obj.attr("height", grid(h));
	}
	updateGlow(resizeId);
	updateObjectData(resizeId);
	updateHandlePositions(obj);
	updateChildPositions(obj);
	const l = get(dd[get(obj)].label);
	wrapLabel(l);
}

//this resize function is only used for the undo handler
function quickResize(id, x, y, w, h) {
	const data = dd[id];
	if (data.x === x && data.y === y && data.h === h && data.w === w) {
		ignoreUndoStep = true;
	}
	removeGlow(id);
	undoHandler(quickResize, [id, data.x, data.y, data.w, data.h]);
	const obj = get(id);
	let correction;
	let rx;
	let ry;
	if (data.subtype === 'rectangle' || data.subtype === 'roundedRectangle') {
		correction = (data.style["stroke-width"] % 2) / 2;
		rx = grid(x-w/2, correction);
		ry = grid(y-h/2, correction);
		const rw = grid(w);
		const rh = grid(h);
		obj.attr("x", grid(rx, correction));
		obj.attr("y", grid(ry, correction));
		obj.attr("width", grid(rw));
		obj.attr("height", grid(rh));
	} else if (data.subtype === 'ellipse') {
		correction = (data.style["stroke-width"] % 2) / 2;
		x = grid(x);
		y = grid(y);
		rx = grid(w/2, correction);
		ry = grid(h/2, correction);
		obj.attr("rx", rx);
		obj.attr("ry", ry);
		obj.attr("cx", x);
		obj.attr("cy", y);
	} else if (data.subtype === 'diamond') {
		const cx = grid(x);
		const cy = grid(y);
		w = grid(w);
		h = grid(h);
		obj.attr("x", x);
		obj.attr("y", y);
		obj.attr("width", w);
		obj.attr("height", h);
		const px0 = cx - w / 2;
		const py0 = cy - h / 2;
		const px1 = cx + w / 2;
		const py1 = cy + h / 2;
		const points = [
			{com: 'M', x: cx, y: py0},
			{com: 'L', x: px1, y: cy},
			{com: 'L', x: cx, y: py1},
			{com: 'L', x: px0, y: cy}
		];
		const pathString = createPathString(points, true);
		obj.attr('path', pathString);
	}
	updateObjectData(id);
	updateConnections(id);
	updateChildPositions(get(id));
}

function updateObjectData(id) {
	const obj = get(id);
	if (dd[id].subtype === 'ellipse') {
		const rx = Math.ceil(obj.attr("rx"));
		const ry = Math.ceil(obj.attr("ry"));
		dd[id].x = Math.ceil(obj.attr("cx"));
		dd[id].y = Math.ceil(obj.attr("cy"));
		dd[id].w = rx * 2;
		dd[id].h = ry * 2;
		let area = 0;
		let lh, lw = 0;
		for (let i = 1; i < rx; i++) {
			const cs = i / rx;
			const angle = Math.acos(cs);
			const sn = Math.sin(angle);
			const a = sn * ry * i;
			if (a > area) {
				area = a;
				lw = i * 2;
				lh = sn * ry * 2;
			}
		}
		dd[id].lw = lw;
		dd[id].lh = lh;
	} else if (dd[id].subtype === 'diamond') {
		dd[id].x = Math.ceil(obj.attr("x"));
		dd[id].y = Math.ceil(obj.attr("y"));
		dd[id].w = Math.ceil(obj.attr("width"));
		dd[id].h = Math.ceil(obj.attr("height"));
		dd[id].lw = dd[id].w / 2;
		dd[id].lh = dd[id].h / 2;
	} else {
		dd[id].w = Math.ceil(obj.attr("width"));
		dd[id].h = Math.ceil(obj.attr("height"));
		dd[id].x = Math.ceil(obj.attr("x") + dd[id].w / 2);
		dd[id].y = Math.ceil(obj.attr("y") + dd[id].h / 2);
		dd[id].lw = dd[id].w - titlesafe.w;
		dd[id].lh = dd[id].h - titlesafe.h;
	}
}

function updateGlow(id) {
	dd[id].glow.remove();
	dd[id].glow = get(id).glow(glowStyle);
}

//update positions of all children when resizing or moving parent
function updateChildPositions(parent) {
	const children = dd[get(parent)].children;
	for(let i in children) {
		const obj = get(children[i]);
		const pos = {pos: dd[get(obj)].pos, x: dd[get(obj)].x, y: dd[get(obj)].y};
		const coords = determineChildPosition(parent, pos);
		obj.attr("x", coords.x);
		obj.attr("y", coords.y);
	}
}

function determineChildPosition(parent, relativePosition) {
	const bb = parent.getBBox();
	const pos = relativePosition.pos;
	const offsetX = relativePosition.x;
	const offsetY = relativePosition.y;
	const points = getObjectPoints(parent);
	const coords = points[pos];
	coords.x += offsetX;
	coords.y += offsetY;
	return coords;
}

function setResizeMode(pos) {
	if(pos === '') {
		//$('#canvas').css({cursor: 'default'});
		resizeMode = '';
		resizeId = -1;
	} else {
		resizeMode = pos;
		//$('#canvas').css({cursor: resizeMode + '-resize'});
		resizeId = hoverId;
	}
}

function updateHoverId(clientX, clientY) {
	if (action === 'drawing') return;	//hoverId is of no consequence when drawing
	let obj = canvas.getElementByPoint(clientX, clientY);
	if (obj && !dd[get(obj)]) obj = null;	//do not consider objects with no entry in dd => those are temporary objects like the tempConnectorLine
	if ((obj ?? null) === null) obj = fetchNeighbor(clientX, clientY, 10);
	if ((obj ?? null) === null) {
		if (hoverId > -1 && selection[hoverId]!==true) removeGlow(hoverId);
		hoverId = -1;
		setResizeMode('');
		//return previously hovered object to it's normal look
	} else {
		const parentId = getParentId(obj);
		//return previously hovered object to it's normal look
		if (hoverId > -1 && selection[hoverId]!==true) removeGlow(hoverId);
		hoverId = parentId;
		const parent = get(parentId);
		if (dd[get(obj)].type === 'handle') {
			setResizeMode(dd[get(obj)].pos);
		} else {
            setResizeMode('');
            if (dd[hoverId].type === 'object' && action === 'selecting') {
				setHoverStyle(parentId);
			} else if (dd[hoverId].type === 'object' && action === 'connecting') {
				if (!currentConnection) {
					//hilight potential source element for a connection
					setHoverStyle(parentId);
				} else if (!dd[hoverId].remoteConnections[currentConnection.startId] && hoverId !== currentConnection.startId) {
					//only hilight object if it can accept a connection from source object
					setHoverStyle(parentId);
				} 
			} else if (dd[hoverId].type === 'connector' && (action === 'selecting')) {
				setHoverStyle(parentId);
			}
		}
	}
}

function saveInitialPositions(list) {
	editList = {};
	editList.prevX = mX;
	editList.prevY = mY;
	for (let i in list) {
		if (dd[i].type !== 'object') continue;
		editList[i] = {};
		const obj = get(i);
		editList[i].initialX = dd[i].x;
		editList[i].initialY = dd[i].y;
		if (dd[i].subtype === 'ellipse') {
			editList[i].exactX = obj.attr('cx');
			editList[i].exactY = obj.attr('cy');
		} else {
			editList[i].exactX = obj.attr('x');
			editList[i].exactY = obj.attr('y');
		}
	}
}

function fetchNeighbor(x, y, maxDist) {
	let obj;
	let id = -1;
	const distance = maxDist * maxDist;
	for (let x1 = x-maxDist; x1 <= x+maxDist; x1++) {
		for (let y1 = y-maxDist; y1 <= y+maxDist; y1++) {
			obj = canvas.getElementByPoint(x1, y1);
			if (obj) {
				const d = getDistance(x, y, x1, y1);
				if (d < distance && dd[get(obj)] && dd[get(obj)].type !== 'handle') {
					id = getParentId(obj);
				}
			}
		}
	}
	if (id > -1) {
		return get(id);
	} else {
		return null;
	}
}

function get(param) {
	if (typeof(param) === 'object') {
		return ddIndex.raph[param.id]; //if object is given, return document id
	} else {
		return canvas.getById(ddIndex.doc[param]); //if document id is given, return object
	}
}

function getLabelPoint(id) {
	if (!dd[id] || !dd[id].type === 'connector') return;
	let pos = dd[id].labelPosition;
	if (pos < 0) pos = 0;
	if (pos > 1) pos = 1;
	const obj = get(id);
	return obj.getPointAtLength(obj.getTotalLength() * pos);
}

function getDistance(x1, y1, x2, y2) {
	return Math.round(Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)));
}

/*
 * calculate angle between 2 points
 * p1 = p2 = {x, y}
 */
function getAngle(p1, p2) {
	const dy = p2.y - p1.y;
	const dx = p2.x - p1.x;
	const theta = Math.atan2(dy, dx);
	return theta;
}

function getNearestPoint(obj, x, y) {
	let l = 0;
	let d;
	let p;
	let dPrime;
	for (let i=0; i<1; i+=0.1) {
		p = obj.getPointAtLength(obj.getTotalLength() * i);
		dPrime = getDistance(p.x, p.y, x, y);
		if (!d || d > dPrime) {
			l = i;
			d = dPrime;
		}
	}
	let min = l - 0.1;
	let max = l + 0.1;
	if (min < 0) min = 0;
	if (max > 1) max = 1;
	const res = divideAndSearch(obj, min, max, x, y);
	return res;
}

function divideAndSearch(obj, min, max, x, y) {
	const middle = Math.round((max + min) * 50) / 100;
	let res = {};
	const p0 = obj.getPointAtLength(obj.getTotalLength() * min);
	const d0 = getDistance(p0.x, p0.y, x, y);
	const p1 = obj.getPointAtLength(obj.getTotalLength() * middle);
	const d1 = getDistance(p1.x, p1.y, x, y);
	const p2 = obj.getPointAtLength(obj.getTotalLength() * max);
	const d2 = getDistance(p2.x, p2.y, x, y);
	if (min === middle || max === middle) {
		res.p = p1;
		res.d = d1;
		res.l = middle;
	} else {
		if (d0 > d2) {
			res = divideAndSearch(obj, middle, max, x, y);
		} else {
			res = divideAndSearch(obj, min, middle, x, y);
		}
	}
	return res;
}


function getZone(obj, x, y) {
	const bb = obj.getBBox(false);
	let zone = '';
	if (y < bb.y) {
		zone += 'n';
	} else if (y > bb.y + bb.height) {
		zone += 's';
	}
	if (x < bb.x) {
		zone += 'w';
	} else if (x > bb.x + bb.width) {
		zone += 'e';
	}
	if (zone === '')
		zone = 'hover';
	return zone;
}

function objToPath(id) {
	if (!dd[id] || dd[id].type!=='object') return;
	const data = dd[id];
	const hw = data.w / 2;
	const hh = data.h / 2;
	const cx = data.x;
	const cy = data.y;
	let path;
	switch (data.subtype) {
		case 'rectangle':
			path = stringf("M%@ %@ H%@ V%@ H%@ Z", cx - hw, cy - hh, cx + hw, cy + hh, cx - hw);
			break;
		case 'roundedRectangle':
			path = stringf("M%@ %@ A%@ %@ 0 0 1 %@ %@ ", cx - hw, cy - hh + radius, radius, radius, cx - hw + radius, cy - hh);
			path+= stringf("H%@ A%@ %@ 0 0 1 %@ %@ ", cx + hw - radius, radius, radius, cx + hw, cy - hh + radius);
			path+= stringf("V%@ A%@ %@ 0 0 1 %@ %@ ", cy + hh - radius, radius, radius, cx + hw - radius, cy + hh);
			path+= stringf("H%@ A%@ %@ 0 0 1 %@ %@ Z", cx - hw + radius, radius, radius, cx - hw, cy + hh - radius);
			break;
		case 'ellipse':
			path = stringf("M%@ %@ A%@ %@ 0 0 1 %@ %@", cx, cy - hh, hw, hh, cx + hw, cy);
			path+= stringf("A%@ %@ 0 0 1 %@ %@", hw, hh, cx, cy + hh);
			path+= stringf("A%@ %@ 0 0 1 %@ %@", hw, hh, cx - hw, cy);
			path+= stringf("A%@ %@ 0 0 1 %@ %@", hw, hh, cx, cy - hh);
			break;
		case 'diamond':
		default:
			path = get(id).attr('path');
			break;
		
	}
	return path;
}

/*
 * This function creates the path string from a bunch of points
 * 
 * pPoints is an Array of Objects, each of which describes a point and the command of what to do with the coordinates:
 * e.g.: pPoints[1] = {com: 'L', x: 100, y: 50}
 * 
 * commands can be 'M' for moving without drawing, 'L' for drawing a stright line from current position to given point, 'Q' for quadratic (bezier) curves
 * 
 * the 'close' parameter defines whether the path should be closed at the end
 * 
 */

function createPathString(pPoints, close) {
	let pathString = '';
	for (let i in pPoints) {
		const p = pPoints[i];
		if (p.com !== 'Q') {
            pathString += stringf("%@%@ %@ ", p.com, Math.round(p.x) - connectorCorrector, Math.round(p.y) - connectorCorrector);
        } else {
            pathString += stringf("%@%@ %@ %@ %@ ", p.com, Math.round(p.cx) - connectorCorrector, Math.round(p.cy) - connectorCorrector, Math.round(p.x) - connectorCorrector, Math.round(p.y) - connectorCorrector);
        }
    }
    if (close) pathString += " Z";
    return pathString;
}

function addSeparator(target, type, marginBefore, marginAfter) {
	if (!target) target = 'controls';
	if (!type) type = 'verticalLine';
	if (!marginBefore) marginBefore = 10;
	if (!marginAfter) marginAfter = 10;
	switch (type) {
		case 'horizontal':
		case 'horizontalSpace':
			$('#' + target).append(stringf('<div class="separator %@" style="margin-left: %@px; margin-right: %@px"></div>', type, marginBefore, marginAfter));
		break;
		case 'vertical':
		case 'verticalSpace':
			$('#' + target).append(stringf('<div class="separator %@" style="margin-top: %@px; margin-bottom: %@px"></div>', type, marginBefore, marginAfter));
		break;
	}
}

function addSection(target, id, title, contents, style) {
	if (!id) return;
	if(!style) style = '';
	if (title) {
		//title = stringf("<p data-translate='%@' class='sectionTitle' id='%@_title'>%@</p>", title, id, UILANG.m(title));
		title = stringf("<p data-translate='%@' class='sectionTitle' id='%@_title'>%@</p>", title, id, UILANG.m(title));
	} else {
		title = '';
	}
	if (!contents) contents = '';
	$('#'+target).append(stringf('<div class="section" id="%@" style="'+style+'"">%@%@</div>', id, title, contents));
}

function setGrid(n) {
	if (gridVisible) {
		$('#canvas').css("background-image", stringf("url(images/grid_%@.png)", n));
	} else {
		$('#canvas').css("background-image", "");
	}
}

function clone(obj) {
	return $.extend(true, {}, obj);	
}

function count(o) {
	return Object.keys(o).length;
}

function sLine(s) {
	switch (s['stroke-dasharray']) {
		case '':	return 'solid';
		case '.':	return 'points (narrow)';
		case '. ':	return 'points (wide)';
		case '-':	return 'dashes (narrow)';
		case '- ':	return 'dashes (wide)';
		case '--':	return 'long dashes';
		default:	return '???';
	}
}

function stringf(s) {
	for(let i = 1; i < arguments.length; i++) {
		s = s.replace(/%@/, arguments[i]);
	}
	return s;
}

function fcdb() {
	$('#db').html(stringf.apply(this, arguments));
}