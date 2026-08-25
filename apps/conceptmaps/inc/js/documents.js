"use strict";

// UG legacy, kept in case there will be server side saving ?????
function saveDocument() {
	//savingWatcher.setSaved(true);
	clearSelection();
	let data = $.extend(true, {}, dd);
	for (let i in data) {
		if (data[i].type === 'handle') delete data[i];
	}
	data.name = documentName;
	const params = {action: 'save', overwrite: overwrite, data: data};
	sendData(params);
}

function uploadDocument() {
	let isContent = false;
	for (let i in dd) { // iterate document data object
		if (dd[i].type !== 'handle') { // check for existing data before uploading new data
			isContent = true;
			let dialogData = {
					buttons: [
						{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
						{label: UILANG.m('Overwrite'), 'default': true, value: 'overwrite'}
					],
					contents: UILANG.m('There is already content in the conceptmap. Loading a new conceptmap will delete everything in the current map!'),
					title: UILANG.m('Delete current objects?'),
					width: 400,
					returnPromise: true,
				};
				showDialog('overwriteDialog', dialogData).then(
					(res) => {
						if (res.button === 'overwrite') {
							loadNxfc();
						}
					}
				);
			return;
		}
	}
	if (isContent === false) loadNxfc(); // empty canvas
}

async function showDialog(id, dialogData) {
	let res = await new nxDialog(id, dialogData);
	return res;
}

function loadNxfc() {	
	 // create, trigger, read file input
       const input = $(document.createElement("input"));
       input.attr({"type":"file","accept":".nxfc","style":"top:100px;left:100px;z-index:20000;"});
       input.trigger("click"); 
       // open file select dialog
       /*let click_ev = document.createEvent("MouseEvent");
	click_ev.initEvent("click", false , true );
	input[0].dispatchEvent(click_ev);*/
       input.on('change', function (e) {
       	for (let i in dd) {
			if (dd[i].type !== 'handle') {deleteObj(parseInt(i));} // everything but the handles
		}
		// clear undo and redo lists
		undoList = [];
		redoList = [];
		undoMode = false;
		redoMode = false;
		switchUndoButtons();
		newUndoStep(); // push empty array to undoList
       	const reader = new FileReader();
       	reader.addEventListener('load', (e) => {
  		  const result = e.target.result;
  		  if ($.isEmptyObject(JSON.parse(result))) return; // don't load empty documents -> CMS-82
  		  recreateDocument(JSON.parse(result));
  		  if (OASYSCOM.getContext() === 'editor') {
       			savingWatcher.setSaved(false); // imported map mustn't set the saved to oasys state to true!
    		}
  		});
       	reader.readAsText(e.target.files[0]);
       });

        return false;
}

// download map to local disc
function downloadDocument() {
	// dialog header depends on context
	let oasysContext = OASYSCOM.getContext();
	let dialogHeader = 'Save Concept Map';
	if (oasysContext === 'editor' || oasysContext === 'manualCorrection') {
		dialogHeader = 'Export Concept Map';
	}
	let contextualMsg = '';
	if (oasysContext === 'editor') {
		contextualMsg = UILANG.m('saveDialogEditor');
	} else if (oasysContext === 'manualCorrection') {
		contextualMsg = UILANG.m('saveDialogCorrection');
	} else {
		contextualMsg = UILANG.m('saveDialog1');
	}

	let dialogData = {
		buttons: [
			{label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
			{label: UILANG.m('Save'), 'default': true, value: 'save'}
		],
            datafields: [
                'fName'
            ],
            mandatory: [
                'fName'
            ],
            focus: 'fName',
            values: {
               
            },
            contents: '<p>'+contextualMsg+'</p>'+UILANG.m('saveDialog2')+'<input type="text" id="fName" style="width: 98%; margin-top: 10px;">',
	            title: UILANG.m(dialogHeader),
            width: 700,
            callback: saveToDisk,
    };
    new nxDialog('saveDialog', dialogData, arguments);
}

function saveToDisk(b, fName) {
	if (b === 'cancel') return;
	clearSelection();
	let data = $.extend(true, {}, dd); // data of map objects
	for (let i in data) {
		if (data[i].type === 'handle') delete data[i];
	}
	let completeData = {meta: DATAFORMAT.getMeta(),map: data};
	const element = document.createElement('a');
  	element.setAttribute('href', 'data:attachment/nxfc;charset=utf-8,' + encodeURIComponent(JSON.stringify(completeData)));
  	element.setAttribute('download', fName+'.nxfc');
  	element.style.display = 'none';
  	document.body.appendChild(element);

  	element.click();

  	document.body.removeChild(element);

  	if (OASYSCOM.getContext() !== 'editor') { // in editor saving to disk isn't saving to oasys
  		savingWatcher.setSaved(true);
  	}
}


function loadFile(file) {
	const data = {file: file};
	documentName = file.replace(/\.nxfc$/, '');
	const params = {action: 'load', data: data};
	sendData(params);
}


function recreateDocument(data) {
	savingWatcher.setLoading(true); // avoid change of saved status while loading
	data = DATAFORMAT.prepareData(data);
	if (data.hasOwnProperty('error')) {
        let dialogData = {
            buttons : [
                {label: UILANG.m('Close'), 'cancel': true, value: 'ok'},
            ],
            width: 400
        };
        if (data.error === 'filefromthefuture') dialogData.contents = UILANG.m('filefromthefuture');
        new nxDialog('errorDialog', dialogData, null);
        return false;
    }
	//create the objects
	loadingMode = true;
	let pGridMode = gridMode; //save gridMode before switching it
	gridMode = false;
	let maxId = indexPointer; //handles already exist, so start with the highest id instead of 0
	//let objLabelUpdateList = []; // store to execute update after creation (dy bug)
	{
		for (let i in data) {
			let o = data[i];
			if (o.type === 'object') {
				let l = data[o.label];
				//objLabelUpdateList.push({id: i, text: l.text, style: l.style});// store for update after creation
				switch (o.subtype) {
					case 'rectangle':
						createRect(o.x, o.y, o.w, o.h, o.style, o.color, l.style, i, o.label, l.text, o.locked, l.locked);
						break;
					case 'roundedRectangle':
						createRoundedRect(o.x, o.y, o.w, o.h, o.style, o.color, l.style, i, o.label, l.text, o.locked, l.locked);
						break;
					case 'ellipse':
						createEllipse(o.x, o.y, o.w, o.h, o.style, o.color, l.style, i, o.label, l.text, o.locked, l.locked);
						break;
					case 'diamond':
						createDiamond(o.x, o.y, o.w, o.h, o.style, o.color, l.style, i, o.label, l.text, o.locked, l.locked);
						break;
					default:
						fcdb("Unsupported object type: %@", o.subtype);
						return;
				}
			}
		}
	}
	//create the connections, now that objects are in place
	let conList = []; // store connectors to bring labels to front
	{
		for (let i in data) {
			if (parseInt(i) > maxId) {
				maxId = parseInt(i);
			}
			let c = data[i]; //connector
			if (c.type === 'connector') {
				let b = data[c.label]; //labelbox
				let l = data[b.label]; //label
				let connection = createConnection(c.source, c.target, c.subtype, false, i, c.color, c.style, c.labelPosition, b.style, l.style, c.label, b.label, l.text, c.locked, l.locked);
				conList.push(connection); // for later iteration
			}
		}
	}
	let conId; // now bring the labels to front to avoid connector paths overlapping them
	while (conId = conList.shift()) { 
		updateConnectorLabel(conId, null, null, true);
	}
	setTimeout(function() {
    		//dyBugPatch(objLabelUpdateList)
			repositionLabels(1)
		}, 60);
	gridMode = pGridMode;
	indexPointer = ++maxId;
	loadingMode = false;
	bTools.setState(1); // switch to select tool
	savingWatcher.setSaved(true); 
	savingWatcher.setLoading(false); // activate on change data transmission to oasys
}

function dyBugPatch(labels) {
	let label;
	while (label = labels.shift()) { 
		updateObjectLabel(label.id, label.text, label.style);
	}
}


function onAjaxError(xhr, textStatus) {
	alert(textStatus);
}

function sendData(params) {
	$.ajax({
		data: params
	});
}
	
function onAjaxData(res) {
	if (res.error) {
		alert('An error occurred while saving the document: ' + res.msg);
	} else {
		let data = res.data;
		let dialogData;
		switch (res.action) {
			case 'save':
				dialogData = {
					buttons: [
						{label: 'OK', 'default': true, value: 'ok'}
					],
					contents: stringf('File \'%@\' has been saved.', data.destination, data.bytes),
					title: 'Document saved',
					width: 400
				};
				new nxDialog('saveDialog', dialogData, null);
				overwrite = 1;
				break;
			case 'overwrite':
				dialogData = {
					buttons: [
						{label: 'Cancel', 'cancel': true, value: 'cancel'},
						{label: 'Rename', value: 'rename'},
						{label: 'Overwrite', 'default': true, value: 'overwrite'}
					],
					contents: stringf('A document with the name "%@" already exists. Do you want to overwrite it?', documentName),
					title: 'Document already exists',
					width: 400,
					callback: overwriteDocument
				};
				new nxDialog('overwriteDialog', dialogData, null);
				break;
			case 'load':
				recreateDocument(data);
				break;
		}
	}
}

function overwriteDocument(button) {
		if (button === 'overwrite') {
			overwrite = 1;
			saveDocument();
		} else if (button === 'rename') {
			let dialogData = {
				buttons: [
					{label: 'Cancel', 'cancel': true, value: 'cancel'},
					{label: 'OK', 'default': true, value: 'ok'}
				],
				datafields: [
					'tfName'
				],
				focus: 'tfName',
				contents: '<p>Please eneter a new name for your document<br><input type="text" id="tfName" style="width: 100%; margin-top: 10px;"></p>',
				title: 'Rename document',
				width: 400,
				callback: renameDocument
			};
			new nxDialog('renameDialog', dialogData, null);
		}
}

function renameDocument(button, newName) {
	if (button === 'ok' && newName && newName !== '') {
		documentName = newName;
		saveDocument();
	}
}

function showHelp(btn) {
	shortcutsPopup.toggle();
}

function log() {
	if (logEnabled === false) {
		return;
	}
	let s = stringf.apply(this, arguments);
	const now = new Date().toLocaleTimeString();
	s = stringf("[%@] %@", now, s);
	const data = {name: documentName, log: s + "\r\n"};
	const params = {action: 'log', data: data};
	sendData(params);
}
