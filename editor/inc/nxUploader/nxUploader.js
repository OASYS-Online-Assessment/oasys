"use strict";

(function ($) {

	/*

	 nxUploader v2.09
	 copyright 2016-2025 by Eric J. FRANCOIS
	 -------------------------------------------------------------------------------------------------------------------
	 VERSIONS:
	 -------------------------------------------------------------------------------------------------------------------
	 v2.05					modified to allow individual drop messages and message for invalid fileTypes
	 							(and optional destination folder view)
	 v2.06					method "destroy" added
	 v2.07					removed binaryString readType as it is deprecated
	 v2.08					blocking uploads where filename contains <...> segments
	 v2.09					abort whole batch if files are offending
	 -------------------------------------------------------------------------------------------------------------------

	 Usage:

	 let nxUploaderSettings = {
		 filebrowser: 'fileBrowser',		//id of file browse form button
		 action: 'read',					//read or upload; decides whether file is read in clientside or uploaded to server
		 encoding: 'utf-8',					//encoding for reading file as text
		 readType: 'text',					//text, arrayBuffer or dataURL; decides how to read a file client side
		 formatPattern: /(\.mp4$|\.m4v$|\.mp3$|\.jpg$|\.jpeg$|\.png$|\.gif$)/i,		//regex pattern for deciding if file may or may not be uploaded/read
		 ajaxTimeout: 60000,
		 ajaxURL: 'actions.php',			//which file is going to handle the uploaded files
		 sendType: "POST",
		 dataType: "json",
		 successCallback: onData,			//callback after handling uploaded files (params are filename and data)
		 ajaxParams: onUploadFiles,			//function that prepares the additional parameters for the upload
		 beforeUploadCallback: clearButton	//function to be called before upload starts
	 }

	 let uploader = new nxUploader(nxUploaderSettings);

	 */

	function nxUploader(params) {
		let nxuSettings = {};
		let fileInput;
		let uploadCount;
		let uploadName;
		let fileList = [];
		let uploadQueue = [];
		let uploadStatus = 0; //0 = idle, 1 = uploading
		let draggingFiles = false;
		let popup;
		let dialog;
		let uploadVeil;
		let uploadTable;
		let dragTimer;
		let ignoreDragOver = false;
		let inactive = false;
		let reader;
		let totalQueueLength;
		let destinationSpan;
		nxuSettings.filebrowser = 'fileBrowser';
		nxuSettings.action = 'upload';	//read or upload
		nxuSettings.encoding = 'utf-8';
		nxuSettings.readType = 'text';	//text, arrayBuffer or dataURL
		nxuSettings.formatPattern = /(\.mp4$|\.m4v$|\.m4a$|\.mp3$|\.jpg$|\.jpeg$|\.png$|\.gif$|\.svg$|\.webp$)/i;
		nxuSettings.ajaxTimeout = 60000;
		nxuSettings.ajaxURL = 'actions.php';
		nxuSettings.sendType = "POST";
		nxuSettings.dataType = "json";
		nxuSettings.maxSize = 2 * 1024 * 1024; //2 MB max upload file size, as is the default value in php.ini
		nxuSettings.successCallback = null;
		nxuSettings.ajaxParams = null;
		nxuSettings.beforeUploadCallback = null;
		nxuSettings.afterUploadCallback = null;
		nxuSettings.invalidFiletypeMessage = UILANG.m('The following file(s) could not be uploaded, as they do not match one of the accepted file formats:');
		nxuSettings.dropMessage = UILANG.m('Please drop file here!');
		nxuSettings.showFolderDropMessage = false;
		nxuSettings.singleUploadMsg = UILANG.m('Only one file can be uploaded at a time. Please try again.');
		nxuSettings.abortOnInvalidFiletype = false;

		if (params)    nxuSettings = $.extend(true, nxuSettings, params);

		//initialize uploader
		const temp = new XMLHttpRequest();
		if (!temp.upload) {
			alert(UILANG.m('Your browser does not support asynchronous uploads. Please update to the newest version!'));
			return;
		}
		uploadVeil = createVeil();
		uploadVeil.append('<div id="nxUploaderPopup" style="text-align: center; position: relative; width: 400px; height: auto; max-height: 400px; overflow: auto; background-color: white; margin: 150px auto; -moz-box-shadow: 2px 2px 15px rgba(0, 0, 0, 0.64); -webkit-box-shadow: 2px 2px 15px rgba(0, 0, 0, 0.64); box-shadow: 2px 2px 15px rgba(0, 0, 0, 0.64); border: 1px solid #888; padding: 25px; color: #444;">'+nxuSettings.dropMessage+'</div>');
		if (nxuSettings.showFolderDropMessage === true) {
			$('#nxUploaderPopup').append('<br><b><span id="nxUploaderDestinationPath"></span></b>');
		}
		uploadVeil.append('<div id="nxUploaderDialog" style="position: relative; width: 600px; height: auto; max-height: 400px; overflow: auto; background-color: white; margin: 150px auto; -moz-box-shadow: 2px 2px 15px rgba(0, 0, 0, 0.64); -webkit-box-shadow: 2px 2px 15px rgba(0, 0, 0, 0.64); box-shadow: 2px 2px 15px rgba(0, 0, 0, 0.64); border: 1px solid #888; padding: 25px; color: #444;"></div>');
		popup = $('#nxUploaderPopup');
		popup.hide();
		dialog = $('#nxUploaderDialog');
		dialog.hide();
		destinationSpan = $('#nxUploaderDestinationPath');
		uploadTable = createTable();
		if (nxuSettings.filebrowser && nxuSettings.filebrowser !== '') {
			fileInput = $('#' + nxuSettings.filebrowser);
		}
		$('body').on('dragover.nxUploader', bodyDragOver);
		$('body').on('dragleave.nxUploader', bodyDragOut);
		uploadVeil.on('drop.nxUploader', fileDrop);
		if (fileInput && fileInput.length > 0) {
			fileInput.on('change', fileSelection);
		}
		if (typeof(settings) !== 'undefined' && settings.upload_max_filesize) {
			nxuSettings.maxSize = settings.upload_max_filesize;
		}

		function bodyDragOver(e) {
			clearTimeout(dragTimer);
			e.stopImmediatePropagation();
			e.preventDefault();
			if (ignoreDragOver) return;
			if (inactive) return;
			ignoreDragOver = true;
			if (!draggingFiles && ((e.originalEvent.dataTransfer.types.contains && e.originalEvent.dataTransfer.types.contains('Files')) || e.originalEvent.dataTransfer.types.indexOf && e.originalEvent.dataTransfer.types.indexOf('Files') >= 0)) {
				uploadVeil.show();
				popup.show();
				draggingFiles = true;
			}
		}

		function bodyDragOut() {
			if (inactive) return;
			ignoreDragOver = false;
			dragTimer = setTimeout(bodyDragTimeout, 100);
		}

		function bodyDragTimeout() {
			draggingFiles = false;
			popup.hide();
			uploadVeil.hide();
		}

		function fileSelection(e) {
			e.stopImmediatePropagation();
			e.preventDefault();
			fileList = $.extend(true, [], e.delegateTarget.files);
			$(e.delegateTarget).val('');
			handleFiles();
		}

		function fileDrop(e) {
			if (inactive) return;
			e.stopImmediatePropagation();
			e.preventDefault();
			ignoreDragOver = false;
			draggingFiles = false;
			popup.hide();
			fileList = $.extend(true, [], e.originalEvent.dataTransfer.files);
			handleFiles();
		}

		function handleFiles() {
			if (nxuSettings.singleUpload && fileList.length > 1) {
				showMessage(nxuSettings.singleUploadMsg);
				uploadVeil.hide();
				return;
			}
			if (fileList.length === 0) return;

			// Sort like before
			fileList.sort(function (a, b) {
				const nameA = a.name.toLowerCase(), nameB = b.name.toLowerCase();
				if (nameA < nameB) return -1;
				if (nameA > nameB) return 1;
				return 0;
			});

			//Abort whole batch on the FIRST offending file
			const tagPattern = /<[^>]+>/; // matches any complete <...> segment
			for (let i = 0; i < fileList.length; i++) {
				const fname = fileList[i].name;
				if (tagPattern.test(fname)) {
					const s = '<ul><li>' + fname + '</li></ul>';
					showMessage(
						UILANG.m('<p><strong>The following files could not be uploaded because their names contain a &lt;...&gt; segment:</strong></p>') + s
					);
					// Cleanup & abort
					popup.hide();
					uploadVeil.hide();
					fileList = [];
					uploadQueue = [];
					return;
				}
			}

			if (nxuSettings.beforeUploadCallback) {
				nxuSettings.beforeUploadCallback.apply(this);
			}

			const invalidFiles = [];
			const oversizedFiles = [];

			for (let i = 0; i < fileList.length; i++) {
				const f = fileList[i];

				if (nxuSettings.formatPattern.test(f.name)) {
					if (nxuSettings.action !== 'read' && f.size > nxuSettings.maxSize) {
						oversizedFiles.push(f.name);
					} else {
						const d = new Date();
						const seed = d.getTime() + i; // ensure unique rowId even within the same ms
						addTableRow({
							filename: `${f.name}<br><span class="nxUploaderFilesize" style="font-size: 12px; color: #AAA;">(${humanReadableSize(f.size)})</span>`,
							progress: createProgress(null, 'nxUploaderProgress' + seed, 100, 0)
						}, 'nxUploaderRow' + seed);
						f.rowId = seed;
						uploadQueue.push(f);
					}
				} else {
					invalidFiles.push(f.name);
				}
			}

			if (invalidFiles.length > 0) {
				let s = '<ul>';
				invalidFiles.forEach(function (el) { s += '<li>' + el + '</li>'; });
				s += "</ul>";
				showMessage('<p>' + nxuSettings.invalidFiletypeMessage + '</p>' + s);
			}

			if (oversizedFiles.length > 0) {
				let s = '<ul>';
				oversizedFiles.forEach(function (el) { s += '<li>' + el + '</li>'; });
				s += "</ul>";
				showMessage(sf(
					UILANG.m(
						'<p><strong>The following files could not be uploaded, as they are too big:</strong></p>%@<p>The maximum is set to %@ on this server. Please contact your administrator to change this setting if necessary.</p>'
					),
					s,
					humanReadableSize(nxuSettings.maxSize)
				));
			}

			if (nxuSettings.abortOnInvalidFiletype && (invalidFiles.length > 0 || oversizedFiles.length > 0)) {
				// Clear any queued uploads (we might have already enqueued some valid files)
				uploadQueue = [];
				fileList = [];

				// Remove progress rows, hide UI
				uploadTable.find('tr').remove();
				dialog.hide();
				uploadVeil.hide();

				return;
			}

			if (uploadQueue.length > 0) {
				uploadVeil.show();
				dialog.show();
				totalQueueLength = uploadQueue.length;
				uploadIfIdle();
			} else {
				uploadVeil.hide();
			}
		}


		function uploadIfIdle() {
			if (uploadStatus > 0 || uploadQueue.length === 0) return;
			uploadStatus = 1;
			const file = uploadQueue.shift();
			uploadCount = file.rowId;
			uploadName = file.name;
			if (nxuSettings.action === 'read') {
				reader = new FileReader();
				reader.addEventListener("load", onread, false);
				reader.addEventListener("error", readError, false);	//to be replaced by DOMException handler in the future; this error is deprecated
				reader.addEventListener("progress", onprogress, false);
				reader.fileName = file.name;
				switch (nxuSettings.readType) {
					case 'arrayBuffer':
						reader.readAsArrayBuffer(file);
						break;
					case 'dataURL':
						reader.readAsDataURL(file);
						break;
					default:
						reader.readAsText(file, nxuSettings.encoding);
				}
				return;
			}

			const formData = new FormData();
			if (nxuSettings.ajaxParams) {
				const params = nxuSettings.ajaxParams.apply(this);
				for (let i in params) {
					formData.append(i, params[i]);
				}
			}
			formData.append('userfile', file);

			// Send off request
			$.ajax({
				url: nxuSettings.ajaxURL,
				type: nxuSettings.sendType,
				cache: false,
				dataType: nxuSettings.dataType,
				timeout: nxuSettings.ajaxTimeout,
				success: function (res) {
					if (nxuSettings.successCallback) {
						nxuSettings.successCallback.call(this, res, onload);
					} else {
						onload(true);
					}
				},
				error: uploadError,
				processData: false,
				contentType: false,
				data: formData,
				xhr: function () {
					//replacing standard jQuery xhr object by customized one as jQuery does not support progress events
					const myXhr = new window.XMLHttpRequest();

					if (myXhr.upload) {
						myXhr.upload.addEventListener("progress", onprogress, false);
					}
					return myXhr;
				}
			});
		}

		function onprogress(e) {
			if (e.lengthComputable) {
				const percentage = Math.round((e.loaded * 100) / e.total);
				$('#nxUploaderProgress' + uploadCount).val(percentage);
			}
		}

		function onload(success) {
			if (success === false) totalQueueLength--;
			nextInLine();
		}

		function uploadError(xhr, textStatus, errorMessage) {
			const dialogData = {
				buttons: [
					{label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}
				],
				contents: sf(UILANG.m('The server sent the following error message for file "%@": %@'), uploadName, errorMessage),
				width: 600,
				title: UILANG.m('Error')
			};
			new nxDialog('Message', dialogData);
			totalQueueLength--;
			nextInLine();
		}

		function onread(e) {
			if (nxuSettings.successCallback) {
				nxuSettings.successCallback.call(this, reader.fileName, reader.result);
			}
			nextInLine();
		}

		function readError(e) {
			const dialogData = {
				buttons: [
					{label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}
				],
				contents: sf(UILANG.m('There was a problem reading the file "%@":<br><br>%@'), uploadName, e.target.error.message),
				width: 600,
				title: sf(UILANG.m('Error: %@'), e.target.error.name)
			};
			new nxDialog('Message', dialogData);
			totalQueueLength--;
			nextInLine();
		}

		function nextInLine() {
			$('#nxUploaderRow' + uploadCount).remove();
			uploadStatus = 0;
			if (uploadQueue.length === 0) {
				uploadVeil.hide();
				dialog.hide();
				fileList = [];
				uploadQueue = [];
				if (nxuSettings.afterUploadCallback) nxuSettings.afterUploadCallback.call(this, totalQueueLength);
			} else {
				uploadIfIdle();
			}
		}

		/*GUI */
		function createVeil() {
			$('body').append('<div id="nxUploaderVeil" style="position: fixed; width: 100%; height: 100%; z-index: 999999; background-color: rgba(255, 255, 255, .8); top: 0; left: 0;border: 5px solid #53a4f9;box-sizing: border-box;"></div>');
			const veil = $('#nxUploaderVeil');
			veil.hide();
			return veil;
		}

		function createTable() {
			let p;
			p = $('#nxUploaderDialog');
			p.append("<table id='nxUploaderProgressTable'><colgroup><col style='width: 50%;'><col style='width: 50%;'></colgroup></table>");
			const table = $('#nxUploaderProgressTable');
			table.width('100%');
			return table;
		}

		function addTableRow(data, id) {
			let html = "<tr>";
			for (let i in data) {
				html += `<td>${data[i]}</td>`;
			}
			html += "</tr>";
			uploadTable.append(html);
			const row = uploadTable.find('tr').last();
			if (id) {
				row.attr('id', id);
			}
			return row;
		}

		function createProgress(parent, id, max, value) {
			if (typeof(parent) === 'string') {
				parent = $('#' + parent);
			}
			if (!value) value = 0;
			if (!max) max = 100;
			const HTML = `<progress id='${id}' max='${max}' value='${value}' style='width: 100%;'></progress>`;
			if (parent) {
				parent.append(HTML);
				return $('#' + id);
			} else {
				return HTML;
			}
		}

		function updateDestination(s) {
			destinationSpan.html(s);
		}

		/* general helper functions */
		function humanReadableSize(b) {
			const kb = b / 1024;
			if (kb < 1) return (b + ' B');
			const mb = kb / 1024;
			if (mb < 1) return (Math.round(kb) + ' KB');
			return (Math.round(mb) + ' MB');
		}

		function sf(s) {
			for (let i = 1; i < arguments.length; i++) {
				const arg = arguments[i];
				s = s.replace(/%@/, arg);
			}
			return s;
		}

		function showMessage(msg) {
			const dialogData = {
				buttons: [
					{label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}
				],
				contents: msg,
				width: 600,
				title: UILANG.m('Alert'),
				icon: "../images/error.png",
				iconWidth: 64
			};
			new nxDialog('Message', dialogData);
		}

		function destroy(){
			$('body').off('dragover.nxUploader');
			$('body').off('dragleave.nxUploader');
			uploadVeil.off('drop.nxUploader');
			$( "#nxUploaderProgressTable").remove();
			$( "#nxUploaderDestinationPath").remove();
			$( "#nxUploaderPopup").remove();
			$( "#nxUploaderDialog").remove();
			$( "#nxUploaderVeil").remove();
		}

		/*
		 * 		methods
		 */

		this.busy = function () {
			return !(uploadStatus === 0 && uploadQueue.length === 0);
		};
		this.updateDestination = updateDestination;
		this.destroy = destroy;
		this.setInactive = function () {
			inactive = true;
		};
		this.setActive = function () {
			inactive = false;
		};
		this.hideVeil = function () {
			uploadVeil.hide();
		};
	}

	//export class
	window.nxUploader = nxUploader;


})(jQuery);
