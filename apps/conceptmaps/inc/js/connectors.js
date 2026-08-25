"use strict";

//irreversibly destroy a connection
function deleteConnection(id) {
	if (dd[id] === undefined) return; // never delete the deleted
	for (let i in dd[id].children) {
		deleteObj(dd[id].children[i], id);
	}
    let data = dd[id];
    undoHandler(createConnection, [data.source, data.target, data.subtype, false, id, data.color, data.style, data.labelPosition, data.labelBoxStyle, data.textStyle, data.label, data.labelTextId, data.text]);
	if (!undoMode && !redoMode) log('delete connection with id %@', id);
	get(id).remove();
	unregisterId(id);
	let source = dd[id].source;
	let target = dd[id].target;
	delete dd[source].connections[target];
	delete dd[target].remoteConnections[source];
	if (dd[id].glow) dd[id].glow.remove();
	delete dd[id];
	delete selection[id];
	delete editList[id];
	hideTextOverlay();
	savingWatcher.setSaved(false);
}

//redraw the connections linked to a certain object
function updateConnections(id) {
	// savingWatcher.setSaved(false); // commented out, done by drawConnection, anyway
	{
		for (let k in dd[id].connections) {
			createConnection(id, parseInt(k));
		}
	}
	{
		for (let k in dd[id].remoteConnections) {
			createConnection(parseInt(k), id);
		}
	}
}

//redraw a specified connection
function updateConnection(id, type) {
	// savingWatcher.setSaved(false); // commented out, done by drawConnection, anyway
	undoHandler(updateConnection, [id, dd[id].subtype]);
	let start = dd[id].source;
	let end = dd[id].target;
	let cType = type || dd[id].subtype;
	createConnection(start, end, cType);
}

//delegate all jobs necessary for creating a connection
function createConnection(start, end, cType, forceConnection, cId, localColor, localStyle, labelPosition, labelBoxStyle, labelStyle, labelBoxId, labelId, text, conlocked, labellocked) {
	// savingWatcher.setSaved(false); // commented out, done by drawConnection, anyway
	// lockstates set?
	if(typeof conlocked === 'undefined') { // arg not supplied
		conlocked = DATAFORMAT.getObjectsLocked();
	}
	if(typeof labellocked === 'undefined') { // arg not supplied
		labellocked = DATAFORMAT.getLabelsLocked();
	}
	if (!dd[start].connections[end]) {
		dd[start].connections[end] = -1;
	} else {
		cId = dd[start].connections[end];
		if (cType) {
			dd[cId].subtype = cType; //if a change of subtype is required, adjust the document data
		} else {
			cType = dd[cId].subtype;
		}
	}
	let con;
	let obj0 = get(start);
	let obj1 = get(end);
	let k0;
	let k1;
	let q = 0;
	let cPoints = getConnectorPoints(obj0, obj1, cType);
	for (let i in cPoints[0]) {
		for (let j in cPoints[1]) {
			let cq = checkConnectionQuality(cPoints[0][i], i, cPoints[1][j], j);
			if (cq > q || (cq === q && (i === 'e' || i === 'w'))) {
				q = cq;
				k0 = i;
				k1 = j;
			}
		}
	}
	if (q > 0) {
		con = drawConnection(cPoints[0][k0], k0, cPoints[1][k1], k1, start, end, cType, false, cId, localColor, localStyle, labelPosition, labelBoxStyle, labelStyle, labelBoxId, labelId, text, conlocked, labellocked);
		dd[start].connections[end] = get(con); //save id of departing connection to source object
		dd[end].remoteConnections[start] = get(con); //save id of arriving connection to target object
	} else if (get(dd[start].connections[end])) {
		//if connected objects overlap, the connection is temporarily hidden, until the objects do not overlap any longer
		con = get(dd[start].connections[end]);

   		con.hide();
   		dd[get(con)].hidden = true;
   		updateConnectorLabel(get(con));
	} else { // allow connecting overlapping objects is a change in behaviour which solves several usability issues
		// identical to forceConnection which might have become obsolete...
		con = drawConnection({x:0, y:0}, 'c', {x:0, y:0}, 'c', start, end, cType, true, cId, localColor, localStyle, labelPosition, labelBoxStyle, labelStyle, labelBoxId, labelId, text, conlocked, labellocked);
		dd[start].connections[end] = get(con); //save id of departing connection to source object
		dd[end].remoteConnections[start] = get(con); //save id of arriving connection to target object
		con.hide();
   		dd[get(con)].hidden = true;

		//if we are trying to create a new connection on overlapping objects, the connection will not be created
		//delete dd[start].connections[end];
		//delete dd[end].remoteConnections[start];
	}
	currentConnection = null;
	//savingWatcher.setSaved(false);
	if (con) return get(con);
}

//find the ideal connection points of source and target objects
function checkConnectionQuality(p0, d0, p1, d1) {
	let q = 0;
	let orientation = 1;
	switch (d0) {
		case 'n':
			q += dq(p0.y - p1.y);
			break;
		case 'e':
			q += dq(p1.x - p0.x);
			orientation *= -1;
			break;
		case 's':
			q += dq(p1.y - p0.y);
			break;
		case 'w':
			q += dq(p0.x - p1.x);
			orientation *= -1;
			break;
		case 'straight':
			//this is used for straight connectors which do not use object magnets
			q = getDistance(p0.x, p0.y, p1.x, p1.y);
			orientation = -1;
			if (q < 10) q = -1;
	}
	switch (d1) {
		case 'n':
			q += dq(p1.y - p0.y);
			break;
		case 'e':
			q += dq(p0.x - p1.x);
			orientation *= -1;
			break;
		case 's':
			q += dq(p0.y - p1.y);
			break;
		case 'w':
			q += dq(p1.x - p0.x);
			orientation *= -1;
			break;
	}
	if (orientation === 1) q=q-150; // UG: why????

	return q;
}

//calculate the connection quality value based on the distance
function dq(d) {
	let q;
	if (d<0) {
		q = -10000;
	} else if (d<50) {
		q = -0.2*Math.pow(d,2)+20*d;
	} else {
		q = -0.1*d+505;
	}
	return q;
}

//create the path string for drawing the connection
function drawConnection(p0, d0, p1, d1, start, end, cType, forceConnection, cId, localColor, localStyle, labelPosition, labelBoxStyle, labelStyle, labelBoxId, labelId, text, conlocked, labellocked) {
	if (!forceConnection && (d0 === 'c' || d1 === 'c')) return;
	// fix zero length paths
	if(Math.ceil(p0.x) === Math.ceil(p1.x) && Math.ceil(p0.y) === Math.ceil(p1.y)) {
		p1.x = p1.x +4;
		p1.y = p1.y +4;
	}
	const pPoints = createPathPoints(p0, d0, p1, d1,cType);
	if ((pPoints ?? null) === null) return;
	const pathString = createPathString(pPoints);
	let con;
	if (dd[start].connections[end] === -1) {
		//create a new path if no previous connection exists
		con = canvas.path(pathString);
		registerId(con.id, cId);
		dd[get(con)] = {
			type: 'connector',
			locked: conlocked,
			children: [],
			subtype: cType,
			source: start,
			target: end,
			path: pathString,
			style: localStyle || clone(connectorStyle),
			color: localColor || conColor,
			labelPosition: labelPosition || 0.4,
			hidden: false
		};
		/* keep logs for degugging NaN Safari Bug when connecting overlapping shapes (raphael arror error)
		console.log('drawConnection set attribute to')
		console.log(typeof dd[get(con)].style)
		console.log(dd[get(con)].style) */
	   	con.attr(dd[get(con)].style);
	   	/* console.log('attr set') */
		dd[get(con)].labelPoint = getLabelPoint(get(con));
		undoHandler(deleteConnection, [get(con)]);
		const data = dd[get(con)];
		if (!undoMode && !redoMode) log('create connection with id %@ [source: %@, destination: %@, type: %@, linestyle: %@, linewidth: %@, color: %@, text: "%@"]', get(con), start, end, cType, sLine(data.style), data.style['stroke-width'], data.color, text || '');
		const l = setConnectorLabel(get(con), labelBoxStyle, labelStyle, labelBoxId, labelId, text, true, labellocked);
	} else {
		//update old connection object
		con = get(dd[start].connections[end]);
		con.attr('path', pathString);
		dd[get(con)].path = pathString;
		con.show();
		dd[get(con)].hidden = false;
	   	con.attr(dd[get(con)].style);
		dd[get(con)].labelPoint = getLabelPoint(get(con));
		updateConnectorLabel(get(con));
	}
	return con;
}

function createPathPoints(p0, d0, p1, d1, cType) {
	const pPoints = [];
	pPoints.push({x: p0.x, y: p0.y, com: 'M'});
	if (cType === 'lines') {
		if ((d0 === 'n' || d0 === 's') && (d1 === 'n' || d1 === 's')) {
			pPoints.push({x: p0.x, y: (p0.y+p1.y)/2, com: 'L'});
			pPoints.push({x: p1.x, y: (p0.y+p1.y)/2, com: 'L'});
		} else if ((d0 === 'e' || d0 === 'w') && (d1 === 'e' || d1 === 'w')) {
			pPoints.push({x: (p0.x+p1.x)/2, y: p0.y, com: 'L'});
			pPoints.push({x: (p0.x+p1.x)/2, y: p1.y, com: 'L'});
		} else if ((d0 === 'e' || d0 === 'w') && (d1 === 'n' || d1 === 's')) {
			pPoints.push({x: p1.x, y: p0.y, com: 'L'});
		} else if ((d0 === 'n' || d0 === 's') && (d1 === 'e' || d1 === 'w')) {
			pPoints.push({x: p0.x, y: p1.y, com: 'L'});
		}
		pPoints.push({x: p1.x, y: p1.y, com: 'L'});
	} else if (cType === 'bezier') {
		if ((d0 === 'n' || d0 === 's') && (d1 === 'n' || d1 === 's')) {
			pPoints.push({cx: p0.x, cy: (2*p0.y+p1.y)/3, x: (p0.x+p1.x)/2, y: (p0.y+p1.y)/2, com: 'Q'});
			pPoints.push({cx: p1.x, cy: (p0.y+2*p1.y)/3, x: p1.x, y: p1.y, com: 'Q'});
		} else if ((d0 === 'e' || d0 === 'w') && (d1 === 'e' || d1 === 'w')) {
			pPoints.push({cx: (2*p0.x+p1.x)/3, cy: p0.y, x: (p0.x+p1.x)/2, y: (p0.y+p1.y)/2, com: 'Q'});
			pPoints.push({cx: (p0.x+2*p1.x)/3, cy: p1.y, x: p1.x, y: p1.y, com: 'Q'});
		} else if ((d0 === 'e' || d0 === 'w') && (d1 === 'n' || d1 === 's')) {
			let p2;
			if (p1.x-p0.x>50) {
				pPoints.push({x: p1.x-50, y: p0.y, com: 'L'});
			}
			if (p1.x-p0.x<-50) {
				pPoints.push({x: p1.x+50, y: p0.y, com: 'L'});
			}
			if (p1.y-p0.y>50) {
				p2 = {x: p1.x, y: p0.y+50};
				pPoints.push({cx: p1.x, cy: p0.y, x: p2.x, y: p2.y, com: 'Q'});
				pPoints.push({x: p1.x, y: p1.y, com: 'L'});
			} else if (p1.y - p0.y < -50) {
				p2 = {x: p1.x, y: p0.y-50};
				pPoints.push({cx: p1.x, cy: p0.y, x: p2.x, y: p2.y, com: 'Q'});
				pPoints.push({x: p1.x, y: p1.y, com: 'L'});
			} else {
				pPoints.push({cx: p1.x, cy: p0.y, x: p1.x, y: p1.y, com: 'Q'});
			}
		} else if ((d0 === 'n' || d0 === 's') && (d1 === 'e' || d1 === 'w')) {
			let p2;
			if (p1.y-p0.y>50) {
				pPoints.push({y: p1.y-50, x: p0.x, com: 'L'});
			}
			if (p1.y-p0.y<-50) {
				pPoints.push({y: p1.y+50, x: p0.x, com: 'L'});
			}
			if (p1.x-p0.x>50) {
				p2 = {y: p1.y, x: p0.x+50};
				pPoints.push({cy: p1.y, cx: p0.x, y: p2.y, x: p2.x, com: 'Q'});
				pPoints.push({y: p1.y, x: p1.x, com: 'L'});
			} else if (p1.x - p0.x < -50) {
				p2 = {y: p1.y, x: p0.x-50};
				pPoints.push({cy: p1.y, cx: p0.x, y: p2.y, x: p2.x, com: 'Q'});
				pPoints.push({y: p1.y, x: p1.x, com: 'L'});
			} else {
				pPoints.push({cy: p1.y, cx: p0.x, y: p1.y, x: p1.x, com: 'Q'});
			}
		}
	} else if (cType === 'straight') {
		pPoints.push({x: p1.x, y: p1.y, com: 'L'});
	} else {
		return null;
	}
	return pPoints;
}

//draw the connection indicator while working with the connector tool
function drawTempConnection() {
	const obj = get(currentConnection.startId);
	const p = getObjectPoints(obj);
	const c = p.c;
	const pathString = stringf("M%@ %@ L%@ %@", Math.round(c.x) - 0.5, Math.round(c.y) - 0.5, Math.round(mX) - 0.5, Math.round(mY) - 0.5);

	// avoid raphael.js bug for paths shorter than >2px
	let distX = Math.abs(Math.round(c.x) - 0.5 - Math.round(mX) - 0.5);
	let distY = Math.abs(Math.round(c.y) - 0.5 - Math.round(mY) - 0.5);
	if (distX <= 4 && distY <= 4) {
		return;
	}

	let con;
	if (tempConnectorId) {
		con = canvas.getById(tempConnectorId);
		con.attr('path', pathString);
	} else {
		con = canvas.path(pathString);
		con.attr(tempConnectorStyle);
		tempConnectorId = con.id;
	}
}

//check from which side of the object a connector line can be drawn in a straight line
function getConnectorPoints(obj0, obj1, cType) {
	const p0 = getObjectPoints(obj0);
	const p1 = getObjectPoints(obj1);
	const c0 = p0.c;
	const c1 = p1.c;
	const cPoints = [];
	cPoints[0] = {};
	cPoints[1] = {};
	if (cType === 'straight') {
		let alpha = getAngle(c0, c1);
		let objType = dd[get(obj0)].subtype;
		let cPath = stringf("M%@ %@ L%@ %@", c0.x, c0.y, c1.x, c1.y);
		let objPath0 = objToPath(get(obj0));
		let objPath1 = objToPath(get(obj1));
		let intersectionS = Raphael.pathIntersection(cPath, objPath0);
		let intersectionD = Raphael.pathIntersection(cPath, objPath1);
		if (intersectionS[0] && intersectionD[0]) {
			const source = {
				x: intersectionS[0].x,
				y: intersectionS[0].y
			};
			const destination = {
				x: intersectionD[0].x,
				y: intersectionD[0].y
			};
			if (!obj0.isPointInside(destination.x, destination.y)) {
				cPoints[0].straight = source;
				cPoints[1].straight = destination;
			} else {
				//if shapes overlap the points are marked with 'c' as anchor to indicate that no line shall be drawn
				cPoints[0].c = c0;
				cPoints[1].c = c1;
			}
		} else {
			//if no intersection was found the center will be used as anchor, so that no line is drawn
			cPoints[0].c = c0;
			cPoints[1].c = c1;
		}
	} else {
		const zone = getZone(obj0, c1.x, c1.y);
		switch(zone) {
			case 'n':
				cPoints[0].n = p0.n;
				cPoints[1].s = p1.s;
				break;
			case 'e':
				cPoints[0].e = p0.e;
				cPoints[1].w = p1.w;
				break;
			case 'w':
				cPoints[0].w = p0.w;
				cPoints[1].e = p1.e;
				break;
			case 's':
				cPoints[0].s = p0.s;
				cPoints[1].n = p1.n;
				break;
			case 'ne':
				cPoints[0].n = p0.n;
				cPoints[0].e = p0.e;
				cPoints[1].s = p1.s;
				cPoints[1].w = p1.w;
				break;
			case 'nw':
				cPoints[0].n = p0.n;
				cPoints[0].w = p0.w;
				cPoints[1].s = p1.s;
				cPoints[1].e = p1.e;
				break;
			case 'se':
				cPoints[0].s = p0.s;
				cPoints[0].e = p0.e;
				cPoints[1].n = p1.n;
				cPoints[1].w = p1.w;
				break;
			case 'sw':
				cPoints[0].s = p0.s;
				cPoints[0].w = p0.w;
				cPoints[1].n = p1.n;
				cPoints[1].e = p1.e;
				break;
			case 'hover':
				cPoints[0].c = p0.c;
				cPoints[1].c = p1.c;
		}
	}
	return cPoints;
}
