"use strict";

const debugTimer = false;
let settings = {};
let itemTimer = {};
let interval = -1;
let tsPrevious;
const intervalDelay = 250;
let secondsLeft = -1;
let tsLoginServer;
let tsItemStarted;
let tsPauseTest = 0;
let testPaused = false;
let resyncedAfterPause = false;
let waitingForResync = false;
let timerType = 'test';

self.onerror = function (message, filename, lineno, colno, error) {
	const stack = error.stack;

	let errorReport = new Date().toLocaleString() + '\n';
	errorReport += 'Error: ' + message + '\n';
	errorReport += 'File: timer.js\n';
	errorReport += 'Line: ' + lineno + '\n';
	errorReport += 'Column: ' + colno + '\n';
	errorReport += 'Stack: ' + stack + '\n';
	errorReport += '\n';

	postMessage({error: true, report: errorReport});
};

self.onmessage = function (e) {
	if (debugTimer) {
		console.log("timer worker received message:");
		console.log(e.data);
	}
	if (typeof(e.data.type) === 'undefined') {
		console.warn('Answers worker received package without type.');
		console.log(e.data);
	}
	switch (e.data.type) {
		case 'init':
			initTimer(e.data.settings);
			break;

		case 'initItemTimer':
			initItemTimer(e.data);
			break;

		case 'resync':
			if (debugTimer) console.log("timer worker got resync data: tsDelta = %f, tsPrecision = %f", e.data.tsDelta, e.data.tsPrecision);
			settings.tsPrecision = e.data.tsPrecision;
			settings.tsDelta = e.data.tsDelta;

			//restart timer
			if (settings.useTimer === true || timerType === 'item') {
				if (!testPaused) {
					tsPrevious = Date.now();
					if (interval === -1) interval = setInterval(updateTimeLeft, intervalDelay);
					if (debugTimer) console.log("restarting internal timer");
				} else {
					if (waitingForResync) {
						/*
							If the command to restart the timer after a connection loss has already arrived at the
							timer thread, this flag will tell us to start the timer with a newly calculated tsLoginServer
							Usually this should not happen, it is merely a safeguard.
						 */
						waitingForResync = false;
						testPaused = false;
						tsLoginServer = settings.tsLogin - settings.tsDelta * 1000;
						if (settings.useTimer === true) {
							tsPrevious = settings.tsLogin;
							if (interval === -1) interval = setInterval(updateTimeLeft, intervalDelay);
							if (debugTimer) console.log("timer worker restarted with: tsDelta = %f, tsPrecision = %f, tsLogin = %i, tsLoginServer = %i", settings.tsDelta, settings.tsPrecision, settings.tsLogin, tsLoginServer);
						}
					} else {
						/*
							This is the expected case: the test is still paused and new timestamp information arrives before
							the command to relaunch the timer. We set the flag that confirms the timestamps are up to date
						 */
						resyncedAfterPause = true;
					}
				}
			}
			break;

		case 'pauseTimer':
			testPaused = true;
			if (settings.useTimer || timerType === 'item') {
				if (interval !== -1) {
					if (interval !== -1) clearInterval(interval);
					interval = -1;
				}
				const now = Date.now();
				tsPauseTest = now - settings.tsDelta * 1000;
				const secondsUsed = Math.round(((now - (settings.tsDelta * 1000)) - tsLoginServer) / 1000);
				secondsLeft = settings.timeLeftAtLogin - secondsUsed;
				if (secondsLeft <= 0) {
					secondsLeft = 0;
				}
			} else {
				secondsLeft = -1;
			}
			/*
				Once the timer has been paused we need to calculate the timer that is still left so that we can communicate
				it to the server as soon as the connection is reestablished
			 */
			postMessage({error: false, action: 'timerPaused', secondsLeft: secondsLeft});
			break;

		case 'restartTimer':
			settings.tsLogin = e.data.tsLogin;
			settings.timeLeftAtLogin = secondsLeft;
			/*
				In this point we need to make sure that the new timestamps have already been delivered to the timer thread
				before we can restart the timer, otherwise we might end up with a broken tsLoginServer
			 */
			if (resyncedAfterPause) {
				resyncedAfterPause = false;
				testPaused = false;
				tsLoginServer = settings.tsLogin - settings.tsDelta * 1000;
				if (settings.useTimer === true) {
					tsPrevious = settings.tsLogin;
					if (interval === -1) interval = setInterval(updateTimeLeft, intervalDelay);
					if (debugTimer) console.log("timer worker restarted with: tsDelta = %f, tsPrecision = %f, tsLogin = %i, tsLoginServer = %i", settings.tsDelta, settings.tsPrecision, settings.tsLogin, tsLoginServer);
				}
			} else {
				waitingForResync = true;
			}
			break;

		case 'interruptTimer':
			stopTimer(true);
			break;

		case 'destroy':
			close();
			break;
	}
};

function initTimer(data) {
	settings = data;
	if (debugTimer) {
		console.log("timer worker, new settings: timeLeftAtLogin = %i", settings.timeLeftAtLogin);
	}
	tsLoginServer = settings.tsLogin - settings.tsDelta * 1000;
	if (settings.useTimer === true) {
		tsPrevious = settings.tsLogin;
		if (interval === -1) interval = setInterval(updateTimeLeft, intervalDelay);
		if (debugTimer) console.log("timer worker initialised with: tsDelta = %f, tsPrecision = %f, tsLogin = %i, tsLoginServer = %i", settings.tsDelta, settings.tsPrecision, settings.tsLogin, tsLoginServer);
	} else {
		if (debugTimer) console.log("no time limit set");
	}
}

function initItemTimer(data) {
	itemTimer = data;
	timerType = 'item';
	tsItemStarted = Date.now();
	tsPrevious = tsItemStarted;
	if (interval === -1) interval = setInterval(updateTimeLeft, intervalDelay);
}

function updateTimeLeft() {
	const now = Date.now();
	const d = now - tsPrevious;
	tsPrevious = now;
	if (d < intervalDelay - 100 || d > intervalDelay + 1000) {
		/*
			The delay between 2 calls of this function will usually not be exactly as long as desired, depending on the load of the computer

			* If the delay is shorter by 100 ms than expected we can assume that the system clock has been altered between 2 calls.
			  (this used to be 10 ms, but Chrome on Windows 10 often triggers around 40 ms too early, so it was changed to 100 ms to be on the safe side

			* If the delay is a signifcantly higher than expected (testing for more than a second difference in this case) it might be just
			  that the computer was overloaded for a moment, but it gives reasonable doubt that the system clock may have been altered.

			In both cases we will ask the queue worker to update the difference between the system clock and the server clock
		 */
		if (debugTimer) {
			console.log("Timer worker detected irregularity => requesting resync", d);
			console.log("Expected intervalDelay", intervalDelay);
			console.log("Detected intervalDelay", d);
		}
		if (interval !== -1) clearInterval(interval);
		interval = -1;
		postMessage({error: false, action: 'resync'});
	} else {
		let secondsUsed;
		let timeLeftString;
		let minutesLeft;
		let hoursLeft;
		let percentageUsed;

		if (timerType === 'test') {
			secondsUsed = Math.round(((now - (settings.tsDelta * 1000)) - tsLoginServer) / 1000);
			secondsLeft = settings.timeLeftAtLogin - secondsUsed;
			timeLeftString = lpad(secondsLeft % 60, 2, '0');
			minutesLeft = Math.floor(secondsLeft / 60);
			timeLeftString = lpad(minutesLeft % 60, 2, '0') + ":" + timeLeftString;
			hoursLeft = Math.floor(minutesLeft / 60);
			timeLeftString = lpad(hoursLeft, 2, '0') + ":" + timeLeftString;
			percentageUsed = Math.round(secondsLeft / (settings.timeLimit * 60) * 100);
		} else if(timerType === 'item') {
			secondsUsed = Math.round((now - tsItemStarted) / 1000);
			secondsLeft = itemTimer.timeLimit - secondsUsed;
			timeLeftString = lpad(secondsLeft % 60, 2, '0');
			minutesLeft = Math.floor(secondsLeft / 60);
			timeLeftString = lpad(minutesLeft % 60, 2, '0') + ":" + timeLeftString;
			hoursLeft = Math.floor(minutesLeft / 60);
			timeLeftString = lpad(hoursLeft, 2, '0') + ":" + timeLeftString;
			percentageUsed = Math.round(secondsUsed / (settings.timeLimit * 60) * 100);
		}

		const timerData = {
			secondsLeft: secondsLeft,
			timeLeftString: timeLeftString,
			percentageUsed: percentageUsed,
			stringElements: {
				seconds: lpad(secondsLeft % 60, 2, '0'),
				minutes: lpad(minutesLeft % 60, 2, '0'),
				hours: lpad(hoursLeft, 2, '0')
			}
		};

		postMessage({error: false, action: 'updateTimeLeft', timerStatus: timerData});

		if (secondsLeft <= 0) {
			stopTimer();
		}

	}
}

function stopTimer(manualInterruption) {
	secondsLeft = 0;
	if (interval !== -1) clearInterval(interval);
	interval = -1;
	if (timerType === 'test') {
		if (!manualInterruption) postMessage({error: false, action: 'timeUp'});
	} else  if(timerType === 'item') {
		if (!manualInterruption) postMessage({error: false, action: 'itemTimeUp'});
		itemTimer = null;
		timerType = 'test';
	}
}

function lpad(s, n, c) {
	if (typeof(c) === 'undefined') c = ' ';
	s = String(s);
	while (s.length < n) {
		s = c + s;
	}
	return s;
}

