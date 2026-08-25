/* web worker that delegates the sending of data to the server */

"use strict";

const debugQueue = false;
let queue = {};	//data queued to be sent
let dataBundle = {};	//data that has already been sent, but reply from server has not arrived yet
const test = {};
const settings = {};
let timer = -1;
let waitingForResponse = false;
let skippedTrigger = false;
let payloadId = 0;	//an id that is incremented with every send action to be sure not to lose any data
let challenge = 0;	//part of the challenge response system for verifying server answers
let lastSuccessfulTransmission = 0;
let networkErrorCount = 0;
let tsTransmit, tsReceive, tsPrecision, tsDelta = 0;
let timestampUpdateRequested = 0; //1 = initiate contact to server immediately to get update, 2 = wait for server response then ask for update
let connectionFailure = false;
let connectionReestablished = false;
let timeLeftAtFailure = 0;
let applicationClosing = false;
let testClosing = false;
let testClosingOptions = {};
let metadata = {};

self.onerror = function (message, filename, lineno, colno, error) {
	const stack = error.stack;

	let errorReport = new Date().toLocaleString() + '\n';
	errorReport += 'Error: ' + message + '\n';
	errorReport += 'File: queue.js\n';
	errorReport += 'Line: ' + lineno + '\n';
	errorReport += 'Column: ' + colno + '\n';
	errorReport += 'Stack: ' + stack + '\n';
	errorReport += '\n';

	postMessage({error: true, errorMsg: errorReport, reportError: true});
};

self.onmessage = function (e) {
	/*
		even if the test is configured not to send data to the server, the queue worker will continue to communicate
		in order to be able to resync the timer if necessary
	 */
	if (typeof (e.data.type) === 'undefined') {
		console.warn('Answers worker received package without type.');
		console.log(e.data);
	}
	if (debugQueue) console.debug('Queue received data with type %s: %o', e.data.type, e.data);
	switch (e.data.type) {
		case 'init':
			initQueue(e.data);
			break;
		case 'destroy':
			close();
			break;
		case 'answer':
			queueAnswer(e.data);
			break;
		case 'behaviour':
			if (e.data.subType === 'login') {
				queueLogin(e.data);
			} else {
				queueBehaviour(e.data);
			}
			break;
		case 'deleteEvent':
			delete queue[e.data.eventId];
			break;
		case 'requestResync':
			//if the timer worker notices an irregularity it requests an updated tsDelta
			if (waitingForResponse) {
				timestampUpdateRequested = 2;
			} else {
				timestampUpdateRequested = 1;
			}
			//TODO: queue log entry about resync request
			sendQueue('sync request');
			break;
		case 'checkConnection':
			connectionFailure = true;
			timeLeftAtFailure = e.data.timeLeft;
			break;
		case 'flushQueue':
			testClosing = true;
			testClosingOptions = e.data.options;
			if (!test.saveResults) {
				clearInterval(timer);
				timer = -1;
				postMessage({error: false, action: 'testClosed'});
			} else if (waitingForResponse) {
				skippedTrigger = true;
			} else {
				sendQueue('test closing');
			}
			break;
		case 'updateMediaProgress':
			queueMetaData(e.data, 'mediaProgress');
			break;
	}
};

function initQueue(data) {
	test.requiredFieldCount = data.test.requiredFieldCount;
	test.timeLimit = data.butler.timeLimit;
	test.saveResults = data.butler.saveResults;
	test.userAgent = data.userAgent;
	test.screenSize = data.screenSize;
	test.mutationId = data.test.mutationId ?? -1;
	test.id = data.test.testId;
	settings.sendFrequency = data.settings.sendFrequency;
	settings.ajaxTimeout = data.settings.ajaxTimeout;
	settings.retryCount = data.settings.retryCount;
	settings.path = data.path;
	test.serialNumber = data.serialNumber;
	if (data.test.activity && data.test.activity.lastPayloadId) {
		payloadId = data.test.activity.lastPayloadId;
		lastSuccessfulTransmission = data.test.activity.lastPayloadId;
	}
	timer = setInterval(sendQueue, settings.sendFrequency, 'regular timer');
}

function queueLogin(data) {
	if (!test.saveResults) {
		return;
	}
	//the login data is queued but then sendQueue is triggered immediately in order to get the most accurate timestamps possible
	queue[data.eventId] = data;
	sendQueue('queue login');
}

function queueAnswer(data) {
	if (typeof (data.eventId) === 'undefined') {
		console.warn('Answers worker received package without eventId.');
		console.log(data);
		return;
	}
	if (!test.saveResults) {
		return;
	}
	if (typeof (data.fieldsFilled) !== 'undefined') {
		test.fieldsFilled = data.fieldsFilled;
	}
	queue[data.eventId] = data;
}

function queueBehaviour(data) {
	if (typeof (data.eventId) === 'undefined') {
		console.warn('Answers worker received package without eventId.');
		console.log(data);
		return;
	}
	if (!test.saveResults) {
		return;
	}
	switch (data.subType) {
		case 'navigation':
			test.currentItem = JSON.parse(data['data']).currentItem;
			break;
		case 'language':
			test.currentLanguage = data.language;
			break;
	}
	queue[data.eventId] = data;
}

function queueMetaData(data, key) {
	if (!test.saveResults) {
		return;
	}
	metadata[key] = data[key];
}

function sendQueue(comment) {

	if (debugQueue) console.log('sendQueue (%s)', comment);

	if (waitingForResponse) {

		/*
		 If a package is still on its way to the server, we will not send another out until we get confirmation that the
		 other one has been received by the server. In this case we merely register that a trigger had to be delayed.
		 */

		skippedTrigger = true;
		if (debugQueue) console.log('skip');

	} else {

		/*
		 When we are ready to send out a new package we reset the flag that indicates if a trigger was skipped
		 */
		skippedTrigger = false;
		waitingForResponse = true;

		/*
		 preparation for sending the data if last transmission was successful:
		 - everything in the queue is now put into the dataBundle so that we know what is going to be on its way to the server
		 - the queue is then cleared, ready to accept new data waiting to be sent
		 */
		if (lastSuccessfulTransmission === payloadId) {
			dataBundle = queue;
			queue = {};
			if (objectLength(dataBundle) > 0) {
				payloadId++;
			}
		}
		challenge = getRandomInt(1, 1000000);

		const data = {
			payloadId: -1,
			metadata: metadata
		};

		if (testClosing) {
			if (debugQueue) console.log('closeTest == true');
			if (debugQueue) console.log(testClosingOptions);
			data.action = 'closeTest';
			data.options = testClosingOptions;
		}

		if (connectionFailure) {
			if (debugQueue) console.log('connectionFailure == true');
			/*
			 If a connection failure has been noticed, we will no longer send data to the server, but merely try to contact the
			 server without any payload to see if it's responding
			 */
			data.payloadId = -3;
		} else if (connectionReestablished) {
			if (debugQueue) console.log('connectionReestablished == true');
			/*
			 If we are just recovering from connection failure, we need to update the activity table and get new timestamps
			 */
			data.payloadId = -2;
			data.timeLeftAtFailure = timeLeftAtFailure;
			data.tsClient = Date.now();
		} else if (objectLength(dataBundle) > 0) {
			data.payloadId = payloadId;
			data.payload = dataBundle;
		}

		ajaxConnection(data);
	}
}

function ajaxConnection(data) {
	data.test = test;
	data.challenge = challenge;
	tsTransmit = new Date().getTime() / 1000;
	skippedTrigger = false;
	const xhr = new XMLHttpRequest();
	xhr.open('post', settings.path + "saveData.php", true);
	xhr.timeout = settings.ajaxTimeout;
	xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	xhr.onreadystatechange = function () {
		let status;
		let data;
		if (xhr.readyState === XMLHttpRequest.DONE) {
			status = xhr.status;
			if (status === 200 && xhr.responseText) {
				try {
					data = JSON.parse(xhr.responseText);
					if (data.fatalError) {
						postMessage({error: true, errorMsg: data.fatalError});
						clearInterval(timer);
						timer = -1;
					} else if (data.error) {
						postMessage({error: true, errorMsg: data.error});
						clearInterval(timer);
						timer = -1;
					} else {
						xhrSuccess(data);
					}
				} catch (e) {
					console.error("JSON parse error: " + e);
					console.warn(xhr.responseText);
					// Your data to be logged
					let dataToSend = new Date().toLocaleString() + '\n';
					dataToSend += 'queue JSON parse error: ' + e + '\n';
					dataToSend += 'queue responseText: ' + xhr.responseText + '\n';
					dataToSend += '\n';

					// Use the 'fetch' API to send the data to the server
					fetch(settings.path + 'queueLogger.php', {
						method: 'POST',
						body: dataToSend
					});
					status = 0;
				}
			}
			if (status === 0) {
				/* timeout => try and resend the data bundle */
				networkErrorCount++;
				if (debugQueue) console.log("no response from server ... errorcount", networkErrorCount);
				if (networkErrorCount === 1) {
					clearInterval(timer);
					timer = setInterval(sendQueue, 5000, 'error timer');
				}
				if (networkErrorCount === settings.retryCount) {
					if (debugQueue) console.log("server can no longer be reached ... pausing test");
					postMessage({error: false, action: 'pauseTest'});
					/*
					 At this point we told the core that there is no more connection. The core will now tell the timer
					 thread to stop count down (if timer is used) and remember the time left when test was paused. This
					 information will then be sent back via the core to the queue thread which then stops trying to
					 send payload but tries to reestablish connection first with the information of how much time is
					 still left.
					 */
				}
				waitingForResponse = false;
			}
			if (status !== 0 && status !== 200) {
				clearInterval(timer);
				timer = -1;
				postMessage({error: true, errorMsg: "AJAX request returned status " + status});
			}

		}
	};
	if (debugQueue) console.log("sending data", data);
	xhr.send(UTF8ToBase64(JSON.stringify(data)));
}

function xhrSuccess(res) {
	if (debugQueue) console.log("queue AJAX success", res);
	tsReceive = new Date().getTime() / 1000;
	waitingForResponse = false;
	if (typeof (res.instructions) !== 'undefined') {
		postMessage({error: false, action: 'instructions', instructions: res.instructions});
	}
	if (typeof (res.timeLeftAtLogin) !== 'undefined') {
		postMessage({error: false, action: 'timeLeftAtLogin', timeLeftAtLogin: res.timeLeftAtLogin});
	}

	/*
	 If we reestablished connection to the server after a network failure, we'll need to ask for an update of timestamps
	 right away, as a lot may have happened on the client side since we were last able to talk to the server
	 */
	if (res.payloadId === -3) {
		connectionFailure = false;
		connectionReestablished = true;
		timestampUpdateRequested = 1;
		clearInterval(timer);
		timer = setInterval(sendQueue, settings.sendFrequency, 'regular timer');
		sendQueue('recovering from disconnection'); //reconnect again with the server immediately and ignore current timestamps
		return;
	}

	/*
	 If a timestamp update was requested while still waiting for the server to reply, there is a good chance that
	 the system clock changed during the transmission => timestamps will be useless.

	 In that case we need to do another request to the server immediately to get a valid timestamp.
	 */
	if (timestampUpdateRequested === 2) {
		timestampUpdateRequested = 1;
		skippedTrigger = true;
	} else {
		checkTimestamps(res.tsServer);
	}

	//check challenge/response checksum
	if (res.response + challenge !== res.checksum) {
		console.log('challenge/response error');
		sendQueue('challenge/response error');
	} else {
		if (res.payloadId === -2) {
			connectionReestablished = false; //switch back to normal operation
			if (debugQueue) console.log("server is reachable again ... resuming test");
			postMessage({error: false, action: 'resumeTest'});
		}
		networkErrorCount = 0;
		if (objectLength(dataBundle) > 0) {
			lastSuccessfulTransmission = res.payloadId;
			const eventIds = Object.keys(dataBundle);
			if (debugQueue) console.log('Successfully sent following eventIds:', eventIds);
			if (eventIds.length > 0) {
				postMessage({error: false, action: 'clearEvents', eventIds: eventIds, payloadId: res.payloadId});
			}
		} else {
			if (debugQueue) console.log('Successfully sent keep alive signal');
		}
		if (res.testClosed === true) {
			postMessage({error: false, action: 'testClosed'});
			clearInterval(timer);
			timer = -1;
			skippedTrigger = false;
		}

		if (res.forceLogoff === true) {
			postMessage({error: false, action: 'forceLogoff'});
			clearInterval(timer);
			timer = -1;
			skippedTrigger = false;
		}

		if (skippedTrigger) {
			sendQueue('skipped trigger');
		}
	}
}

function checkTimestamps(tsServer) {
	const newDelta = Math.round((tsReceive + tsTransmit) / 2 - tsServer);
	const newPrecision = (tsReceive - tsTransmit) / 2;
	const oldDelta1 = tsDelta - tsPrecision;
	const oldDelta2 = tsDelta + tsPrecision;
	if (newDelta - newPrecision > oldDelta2 || newDelta + newPrecision < oldDelta1 || timestampUpdateRequested === 1) {
		// delta ranges do not overlap or timer worker specifically requested an update => resynchronize timer
		postMessage({error: false, action: 'resync', delta: newDelta, precision: newPrecision});
		tsDelta = newDelta;
		tsPrecision = newPrecision;
	} else {
		if (newPrecision < tsPrecision) {
			tsDelta = newDelta;
			tsPrecision = newPrecision;
		}
	}
	timestampUpdateRequested = 0;
}

function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min)) + min;
}

function objectLength(o) {
	return (Object.keys(o).length);
}

function encodeToHex(str) {
	if (typeof (str) !== "string") {
		if (!str) {
			return '';
		} else {
			str = str.toString();
		}
	}
	const bytes = toUTF8Array(str);
	return bytes.map(function (v) {
		return v.toString(16)
	}).join('');
}

/**
 * @returns {number[]}
 */
function toUTF8Array(str) {
	const utf8 = [];
	for (let i = 0; i < str.length; i++) {
		let charcode = str.charCodeAt(i);
		if (charcode < 0x80) utf8.push(charcode);
		else if (charcode < 0x800) {
			utf8.push(0xc0 | (charcode >> 6),
				0x80 | (charcode & 0x3f));
		} else if (charcode < 0xd800 || charcode >= 0xe000) {
			utf8.push(0xe0 | (charcode >> 12),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		} else {
			i++;
			charcode = 0x10000 + (((charcode & 0x3ff) << 10)
				| (str.charCodeAt(i) & 0x3ff));
			utf8.push(0xf0 | (charcode >> 18),
				0x80 | ((charcode >> 12) & 0x3f),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		}
	}
	return utf8;
}

function bytesToBase64(bytes) {
	const chunkSize = 0x8000; // 32768, safely under the engine limit
	let binString = '';

	for (let i = 0; i < bytes.length; i += chunkSize) {
		// .slice() works on both standard Arrays and Uint8Arrays
		const chunk = bytes.slice(i, i + chunkSize);
		binString += String.fromCodePoint(...chunk);
	}

	return btoa(binString);
}

function UTF8ToBase64(utf8String) {
	return bytesToBase64(new TextEncoder().encode(utf8String));
}
