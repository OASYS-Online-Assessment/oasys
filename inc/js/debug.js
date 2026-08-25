"use strict";

// debug_enable('login');
// debug_enable('loader');
// debug_enable('skin');
// debug_enable('scripting');

let debug = {};

/* debugging – comment out in production */
	// debug.test = {};
	// debug.test.variables = {};
	// debug.test.variables['course'] = {global: true, text: {'*': 'Potion making'}};
/*****************************************/

function debug_enable(module) {
	debugModules[module] = true;
}

function debug_log(module, ...args) {
	if (!debugModules[module] === true) return;
	const tsString = debug_timeStamp();
	let msg = stringf.apply(this, args);
	const stack = new Error().stack;
	const lines = stack.split('\n');
	const callerLine = lines[2]?.trim().replace(/^at\s+/, '');

	console.log(`${tsString} ${msg}\n[${callerLine}]`);
}

function debug_variable(module, variable) {
	if (!debugModules[module] === true) return;
	const tsString = debug_timeStamp();
	console.log(tsString, variable);
}

function debug_timeStamp() {
	let ts = performance.now();
	ts = Math.round(ts);
	const ms = lpad(ts % 1000, 2, '0');
	ts = Math.floor(ts / 1000);
	const s = lpad(ts % 60, 2, '0');
	ts = Math.floor(ts / 60);
	const m = lpad(ts % 60, 2, '0');
	ts = Math.floor(ts / 60);
	const h = lpad(ts % 24, 2, '0');

	return `${h}:${m}:${s}.${ms}: `;
}