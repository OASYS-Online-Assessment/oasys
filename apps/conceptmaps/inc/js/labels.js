"use strict";

function setObjLabel(obj, localTxtStyle) {
	savingWatcher.setSaved(false);
	let bb = obj.getBBox();
	let cx = bb.x + bb.width / 2;
	let cy = bb.y + bb.height / 2;
	let l = canvas.text(cx, cy, '').attr(localTxtStyle);
	return l;
}

function setConnectorLabel(id, localLabelBoxStyle, localConnectorLabelStyle, labelBoxId, labelId, text, skipUndo, labellocked) {
	//savingWatcher.setSaved(false);
	let lp = dd[id].labelPoint;
	if (!localLabelBoxStyle) localLabelBoxStyle = labelBoxStyle;
	if (!localConnectorLabelStyle) localConnectorLabelStyle = connectorLabelStyle;
	let l = canvas.rect(lp.x, lp.y, 0, 0, 10).attr(localLabelBoxStyle);
	let t = canvas.text(lp.x, lp.y, '').attr(localConnectorLabelStyle);
	registerId(l.id, labelBoxId);
	registerId(t.id, labelId);
	dd[id].label = get(l);
	dd[id].children.push(get(l));
	dd[get(l)] = {
		parent: id,
		children: [get(t)],
		x: 0,
		y: 0,
		type: 'labelBox',
		locked: labellocked,
		label: get(t),
		style: clone(localLabelBoxStyle),
	};
	dd[get(t)] = {
		parent: get(l),
		x: 0,
		y: 0,
		pos: 'c',
		type: 'label',
		locked: labellocked,
		style: clone(localConnectorLabelStyle),
		text: ''
	};
	updateConnectorLabel(id, text, null, skipUndo);
	return l;
}

function updateConnectorLabel(id, txt, pos, skipUndo) {
	if (txt) {
		const code1 = txt.charCodeAt(txt.length - 1);
		const code2 = txt.charCodeAt(txt.length - 2);
		if (code1 === 10 && code2 === 10) txt = txt.slice(0,txt.length - 1)+' '+txt.slice(txt.length - 1); // add blank in order to prevent empty line frtom collapsing
	}
	let l =	get(dd[id].label);
	let t =	get(dd[get(l)].label);
	if (!skipUndo && (undoMode || redoMode)) {
		undoHandler(updateConnectorLabel, [id, dd[get(t)].text, dd[id].labelPosition]);	
	}
	if ((txt ?? null) !== null) {
		t.attr('text', txt);
		dd[get(t)].text = txt;
	} else {
		txt = dd[get(t)].text; // call by formatLabel
	}
	if (dd[dd[id].label].locked === false || DATAFORMAT.getRespectLock() === false) {
		if ((pos ?? null) !== null) {
			dd[id].labelPosition = pos;
			dd[id].labelPoint = getLabelPoint(id);
		}
		//set label position
    	t.attr({
    		x: dd[id].labelPoint.x + dd[get(l)].x,
    		y: dd[id].labelPoint.y + dd[get(l)].y
    	});
	}
	
	let box = $.extend(false, {}, t.getBBox());
	if (box.width === 0 && t.attr('text') !== '') {
		setTimeout(function() {
    		updateConnectorLabel(id, txt, pos, skipUndo);
		}, 70);		
		return;
	}
	box.x -= 7;
	box.width += 14;
	box.y -= 2;
	box.height += 4;
	l.attr(box);
	l.toFront();
	t.toFront();
	if (t.attr('text') === '' || dd[id].hidden) {
		l.hide();
		t.hide();
	} else {
		l.show();
		t.show();
	}
	labelEditor.val(txt); // when called by undoredo
	savingWatcher.setSaved(false);
}

function formatLabel(e){
	let id = getKey(selection, 0); // parent shape id
	let l,s,d,i;
	// if it's a shape
	if (dd[id].type === 'object') {
		i = dd[id].children[0];
		l = get(i); // the label 
		s = dd[dd[id].children[0]].style;
		d = dd[dd[id].children[0]];
	} else if (dd[id].type === 'connector') { // the child of the connector is a shape which is the parent of the label...
		i = dd[dd[id].children[0]].children[0];
		l = get(i); // the label 
		s = dd[dd[dd[id].children[0]].children[0]].style; // bracket wrap ^
		d = dd[dd[dd[id].children[0]].children[0]];
	}	
	let st = {}; // style
	for (let i in s) {
		st[i] = s[i];
	}
	undoHandler(doUndoRedo, [{target: i, style: st}]);
	newUndoStep();
	switch (e.data.sender) {
		case 'cm_toolbar_bold_btn':
			if (s['font-weight'] === 'bold') {
				$('#cm_toolbar_bold_btn').removeClass('selected-tool-btn_'+UILANG.currentLang());
				s['font-weight'] = 'normal';
			} else {
				$('#cm_toolbar_bold_btn').addClass('selected-tool-btn_'+UILANG.currentLang());
				s['font-weight'] = 'bold';
			}

			break;
		case 'cm_toolbar_italic_btn':
			if (s['font-style'] === 'italic') {
				$('#cm_toolbar_italic_btn').removeClass('selected-tool-btn_'+UILANG.currentLang());
				s['font-style'] = 'normal';
			} else {
				$('#cm_toolbar_italic_btn').addClass('selected-tool-btn_'+UILANG.currentLang());
				s['font-style'] = 'italic';
			}

			break;
		case 'cm_toolbar_size':
			s['font-size'] = $('#cm_toolbar_size').val();
			break;
		case 'cm_toolbar_color':
			s['fill'] = e.data.color;
			break;
	}

	l.attr(s); // apply to label
	//dd[dd[id].children[0]].style = s; // overwrite style of label in dd
	d.style = s;
	// trigger update if it's a connector label
	if (dd[id].type === 'connector') {
		updateConnectorLabel(id, null, null, true);
	} else {
		
	}
	wrapLabel(l);
	savingWatcher.setSaved(false);
	// preview in textarea
	$('#labelEditor').css({'color' : s.fill , 'font-size' : s['font-size']+'px' , 'font-weight' : s['font-weight'] , 'font-style' : s['font-style']});
}

// apply undo/redo to a label
function doUndoRedo(params) {
	let parentObj; // for setEditorToolsState 
	// first save current state for redo
	let u = {};
	for (let i in dd[params.target].style) {
		u[i] = dd[params.target].style[i];
	}
	let l = get(params.target); // the label
	let s = params.style;
	l.attr(s); // apply to label
	dd[params.target].style = params.style;
	undoHandler(doUndoRedo, [{target: params.target, style: u}]);
	if (typeof(dd?.[dd?.[dd?.[params?.target]?.parent]?.parent]?.type) !== "undefined" && dd?.[dd?.[dd?.[params?.target]?.parent]?.parent]?.type === 'connector') {
		updateConnectorLabel(dd[dd[params.target].parent].parent, null, null, true);
		parentObj = dd[dd[params.target].parent].parent;
	} else {
		parentObj = dd[params.target].parent;
	}

	// parent objects id for setEditorToolsState 
	setEditorToolsState(parentObj); 
}

// sets the states of the editor tools according to the format of the selected object
function setEditorToolsState(id = null) {
	if ((id ?? null) === null) id = getKey(selection, 0); // parent shape id in case there is no selection
	let bg = '#ffffff'; // default editor bg
	// shape or connector?
	let s;
	let txt; // workaround for edge bug undefined textarea val
	if (dd[id].type === 'object') {
		bg = dd[id].style.fill;
		s = dd[dd[id].children[0]].style;
		// 4 edge bug
		let l = get(dd[id].label);
		txt = dd[dd[id].label].text;
		// fix contrast for empty label if necessary
		if (txt === '') {
			let contrast = getContrast(bg, s.fill);
			if (!contrast) {
				let cColor = getContrastingColor(bg);
				s['fill'] = cColor;
				l.attr(s);
			}
		}
	} else if (dd[id].type === 'connector') { // the child of the connector is a shape which is the parent of the label...
		s = dd[dd[dd[id].children[0]].children[0]].style; // bracket wrap ^
		// 4 edge bug
		let l =	get(dd[id].label);
		let t =	get(dd[get(l)].label);
		txt = dd[dd[dd[id].children[0]].children[0]].text;
	}	 

	if (s['font-weight'] === 'bold') {
		$('#cm_toolbar_bold_btn').addClass('selected-tool-btn_'+UILANG.currentLang());
	} else {
		$('#cm_toolbar_bold_btn').removeClass('selected-tool-btn_'+UILANG.currentLang());
	}
	if (s['font-style'] === 'italic') {
		$('#cm_toolbar_italic_btn').addClass('selected-tool-btn_'+UILANG.currentLang());
	} else {
		$('#cm_toolbar_italic_btn').removeClass('selected-tool-btn_'+UILANG.currentLang());
	}
	//$('#cm_toolbar_size:eq('+s['font-size']+')').prop('selected', true);
	$('#cm_toolbar_size').val(s['font-size']);
	$("#cm_toolbar_color").spectrum("set", s['fill']);
	// preview in textarea
	$('#labelEditor').css({'background-color' : bg, 'color' : s.fill , 'font-size' : s['font-size']+'px' , 'font-weight' : s['font-weight'] , 'font-style' : s['font-style']});
	// 4 edge bug, redundant but...
	labelEditor.val(txt);
}

//updates text of an object label; id parameter is id of object, NOT id of label 
function updateObjectLabel(id, txt, style) {
	const code1 = txt.charCodeAt(txt.length - 1);
	const code2 = txt.charCodeAt(txt.length - 2);
	if (code1 === 10 && code2 === 10) txt = txt.slice(0,txt.length - 1)+' '+txt.slice(txt.length - 1); // add blank in order to prevent empty line frtom collapsing
	if (!dd[id]) return;
	const obj = get(id);
	const l = get(dd[id].label);
	l.attr('text', txt);

	if (undoMode || redoMode) {
		undoHandler(updateObjectLabel, [id, dd[get(l)].text]);	
	}
	dd[get(l)].text = txt;
	if (style) {
		l.attr(style);
		dd[get(l)].style = clone(style);
	}
	const bb = obj.getBBox();
	wrapLabel(l);
	labelEditor.val(txt); // when called by undoredo
	savingWatcher.setSaved(false);
}

function wrapLabel(obj) {
	const data = dd[dd[get(obj)].parent];
	const maxW = data.lw;
	const maxH = data.lh;

	let txt = dd[get(obj)].text;
	obj.attr('text', txt);
	let bb = obj.getBBox();
	if(bb.width < maxW && bb.height < maxH) {
		return;
	}
	txt = txt.replace(/[\n\r]/g,'\n ');
	const wordList = txt.split(' ');
	let wrappedLabel = '';
	let previousLabel;
	let i = 0;
	let wordsInLine = 0;
	let loopWord;
	while(i < wordList.length) {
		loopWord = false;
		previousLabel = wrappedLabel;
		//if this is not the first word, add a space
		if (wordsInLine > 0)
			wrappedLabel += ' ';
		wrappedLabel += wordList[i];
		wordsInLine++;
		obj.attr('text', wrappedLabel);
		bb = obj.getBBox();
		if (bb.width > maxW) {
			if (wordsInLine > 1) {
				wrappedLabel = previousLabel + '\n' + wordList[i];
				wordsInLine = 1;
				bb = obj.getBBox();
				if (bb.width > maxW) {
					loopWord=true;
					wrappedLabel = previousLabel + '\n';
					wordsInLine = 0;
				}
			} else if (wordsInLine === 1) {
				let charCount = 0;
				let leftOvers = '';
				while(bb.width > maxW) {
					charCount--;
					wrappedLabel = previousLabel + wordList[i];
					leftOvers = wrappedLabel.slice(charCount);
					wrappedLabel = wrappedLabel.slice(0, charCount);
					obj.attr('text', wrappedLabel);
					if (wrappedLabel.length < 1) {
						return;
					}
					bb = obj.getBBox();
				}
				wordList[i] = wordList[i].slice(0, charCount);
				wordList.splice(i + 1, 0, leftOvers);
			}
		}
		if(bb.height > maxH && previousLabel !== '') {
			wrappedLabel = previousLabel;
			if (wrappedLabel.slice(-1) === '\n') {
				wrappedLabel = wrappedLabel.slice(0, -1);
			}
			let tmpLabel = wrappedLabel;
			wrappedLabel+=' …';
			obj.attr('text', wrappedLabel);
			bb = obj.getBBox();
			if (bb.width > maxW) {
				wrappedLabel = tmpLabel.slice(0,-2) + '…';
			}
			break;
		}
		if (!loopWord) i++;
	}
	obj.attr('text', wrappedLabel);
}

// dy bug patch
function repositionLabels(numOfRuns) {
	numOfRuns ++;
	if(numOfRuns > 10){
		return;
	}
	for (let index in dd) {
		if (dd[index].type === 'label' && dd[index].text !== '' && dd[index].text !== undefined) {
			if (dd[dd[index].parent].type === 'object') {
				updateObjectLabel(dd[index].parent, dd[index].text, dd[index].style);
			} else if (dd[dd[index].parent].type === 'labelBox') {
				updateConnectorLabel(dd[dd[index].parent].parent, dd[index].text, null, true);
			}
		}
	}
	const tf = $('tspan');
	let irregularOffset = false;
	tf.each(function(index, element) {
	    // 'index' is the index of the current 'tspan' element in the selection
	    // 'element' is the DOM element at the current index
	    //console.log('Index: ' + index + ', Text Content: ' + $(element).text());
	    //console.log(element.attributes.dy)
	    //console.log($(element).attr('dy'))
	    if ($(element).attr('dy') > 8 && $(element).text() !== '') {
	    	irregularOffset = true;
	    }
	});

	if (irregularOffset === true) {
		setTimeout(function() {
    		repositionLabels(numOfRuns)
		}, 70);	
	}

}

// label tools #########################

function getContrast(hexColor1, hexColor2) {
  // Convert hex colors to RGB
  const rgbColor1 = hexToRgb(hexColor1);
  const rgbColor2 = hexToRgb(hexColor2);

  // Calculate contrast ratio
  const contrast = calculateContrast(rgbColor1, rgbColor2);

  // Determine if contrast is sufficient
  if (contrast >= 4.5) {
    return true; // sufficient
  } else {
    return false;
  }
}

function hexToRgb(hexColor) {
  const hex = hexColor.replace("#", "");
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r: r, g: g, b: b };
}

function calculateContrast(rgbColor1, rgbColor2) {
	const luminance1 = calculateLuminance(rgbColor1);
	const luminance2 = calculateLuminance(rgbColor2);
	const contrast = (Math.max(luminance1, luminance2) + 0.05) / (Math.min(luminance1, luminance2) + 0.05);
	return contrast;
}

function calculateLuminance(rgbColor) {
	let {r, g, b} = rgbColor;
	const sRGB = [r / 255, g / 255, b / 255];
	const sRGBAdjusted = sRGB.map(function (channel) {
		if (channel <= 0.03928) {
			return channel / 12.92;
		} else {
			return Math.pow((channel + 0.055) / 1.055, 2.4);
		}
	});
	const luminance = 0.2126 * sRGBAdjusted[0] + 0.7152 * sRGBAdjusted[1] + 0.0722 * sRGBAdjusted[2];
	return luminance;
}

function getContrastingColor(hexColor) {
  // Convert hex color to RGB
	const rgbColor = hexToRgb(hexColor);

	// Calculate luminance
	const luminance = calculateLuminance(rgbColor);

	// Determine the appropriate contrasting color
	const contrastingColor = (luminance > 0.5) ? "#000000" : "#FFFFFF";

	return contrastingColor;
}
