"use strict";

/*
	this file contains all the functions necessary to support scripting in OASYS
 */


//execute a script (used for doubling back to previous items or for skipping items)
function scripting_executeScript(script, context, itemId) {
	debug_log("scripting", `scripting_executeScript(script, '${context}', ${itemId})`);
	debug_variable("scripting", script);
	try {
		const commands = script['commands'];
		for (let cmdNum in commands) {
			const cmd = commands[cmdNum];
			const type = cmd.type;
			switch (type) {
				case 'if':
					if (scripting_executeIfCmd(cmd) === true) return true;
					break;
				case 'execute':
					if (scripting_executeActions(cmd.actions) === true) return true;
					break;
			}
		}
	} catch (err) {
		console.error(err);
		console.log(script);
	}
}

//execute an if/else command from a script
function scripting_executeIfCmd(cmd) {
	debug_log("scripting", `scripting_executeIfCmd(cmd)`);
	debug_variable("scripting", cmd);
	const conditions = cmd.conditions;
	let scriptState = true;
	let logic = "&&";
	for (let condNum in conditions) {
		const cond = conditions[condNum].condition;
		const result = scripting_evaluateCondition(cond);
		switch (logic) {
			case '&&':
				scriptState = scriptState && result;
				break;
			case '||':
				scriptState = scriptState || result;
				break;
		}
		logic = conditions[condNum].logic || false;
	}
	debug_variable("scripting", scriptState);
	if (scriptState === true) {
		if (scripting_executeActions(cmd.if) === true) return true;
	} else if (typeof (cmd.else) !== 'undefined') {
		if (scripting_executeActions(cmd.else) === true) return true;
	}
}

function scripting_evaluateCondition(cond) {
	debug_log("scripting", `scripting_evaluateCondition(cond)`);
	debug_variable("scripting", cond);
	let term1;
	if (cond.term1.type === 'globalVariable') {
		if (cond.term1.value.includes('.')) {
			term1 = fetchFromPath(globalVariables, ...cond.term1.value.split('.'));
		} else {
			term1 = globalVariables[cond.term1.value];
		}
	} else if (cond.term1.type === 'localVariable') {
		if (typeof (answers[state.currentItemId][cond.term1.value]) !== 'undefined') {
			term1 = answers[state.currentItemId][cond.term1.value];
		}
	} else {
		term1 = cond.term1.value;
	}

	let term2;
	if (cond.term2.type === 'globalVariable') {
		if (cond.term2.value.includes('.')) {
			term2 = fetchFromPath(globalVariables, ...cond.term2.value.split('.'));
		} else {
			term2 = globalVariables[cond.term2.value];
		}
	} else if (cond.term2.type === 'localVariable') {
		if (typeof (answers[state.currentItemId][cond.term2.value]) !== 'undefined') {
			term2 = answers[state.currentItemId][cond.term2.value];
		}
	} else {
		term2 = cond.term2.value;
	}

	switch (cond.operator) {
		// ==|!=|>|<|>=|<=|contains|!contains
		case "==":
			return (term1 === term2);
		case "!=":
			return (term1 !== term2);
		case ">":
			return (term1 > term2);
		case "<":
			return (term1 < term2);
		case ">=":
			return (term1 >= term2);
		case "<=":
			return (term1 <= term2);
		case "contains":
			try {
				term1 = JSON.parse(term1);
				return (term1.indexOf(term2) > -1);
			} catch (e) {
				//if term1 has not been set yet, well catch an exception and return false, as term1 does not contain term2
				return false
			}
		case "!contains":
			try {
				term1 = JSON.parse(term1);
				return (term1.indexOf(term2) === -1);
			} catch (e) {
				//if term1 has not been set yet, well catch an exception and return true, as term1 does not contain term2
				return true
			}
	}

	alert("An error occurred evaluating the conditions from a script!"); //this line should never be reachable ... theoretically! :-)
	return false;
}

function scripting_executeActions(actions) {
	debug_log("scripting", `scripting_executeActions(actions)`);
	debug_variable("scripting", actions);
	if (!Array.isArray(actions)) {
		alert("Error executing actions from a script: not an array!");
		return;
	}
	for (let actionNum in actions) {
		const cmd = actions[actionNum].cmd;
		const params = actions[actionNum].parameters;
		let itemId;
		switch (cmd) {
			case 'next':
				debug_log("scripting", `next`);
				butler_reenableNavigationByScript();
				core_sendBehaviour('scripting', {command: 'next'});
				core_nextItem();
				return true; //this return value will bubble upwards to the core_gotoItem command to break the flow without finishing the script
			case 'skip':
				debug_log("scripting", `skip`);
				butler_reenableNavigationByScript();
				core_sendBehaviour('scripting', {command: 'skip'});
				if (state.navigationDirection === 'forward') {
					core_nextItem(true);
				} else {
					core_previousItem(true);
				}
				return true; //this return value will bubble upwards to the core_gotoItem command to break the flow without finishing the script
			case 'goto':
				debug_log("scripting", `goto`);
				itemId = core_lookupItemCode(params[0]);
				if (itemId === false) {
					alert("Error in 'goto' command! Itemcode not found: " + params[0]);
					return;
				}
				const itemNum = core_getItemNumber(itemId);
				if (itemNum === false) {
					alert("Error in 'goto' command! Itemcode not in structure: " + params[0] + " [id=" + itemId + "]");
					return;
				}
				core_sendBehaviour('scripting', {
					command: 'goto',
					itemCode: params[0],
					itemId: itemId,
					itemNum: itemNum
				});
				butler_reenableNavigationByScript();
				debug_log("scripting", `core_gotoItem(${itemNum});`);
				core_gotoItem(itemNum, true);
				return true; //this return value will bubble upwards to the core_gotoItem command to break the flow without finishing the script
			case 'reset':
				debug_log("scripting", `reset`);
				itemId = core_lookupItemCode(params[0]);
				if (itemId === false) {
					alert("Error in 'reset' command! Itemcode not found: " + params[0]);
					return;
				}
				core_sendBehaviour('scripting', {command: 'reset', itemCode: params[0], itemId: itemId});
				debug_log("scripting", `core_resetItem(${itemId}, false);`);
				core_resetItem(itemId, false);
				break;
			case 'disableNavigation':
				debug_log("scripting", `disableNavigation`);
				core_sendBehaviour('scripting', {command: 'disableNavigation'});
				butler_disableNavigationByScript();
				break;
			case 'init':
				debug_log("scripting", `init`);
				if (params.length !== 2) {
					alert("Error in 'init' command! Expected 2 parameters, but found: " + params.length);
					return;
				}
				//if params[0] starts with two underscores, it is an internal variable, so we do not modify it in globalVariables
				if (params[0].startsWith("__")) {
					debug_log("scripting", `cannot set internal variable: ${params[0]}`);
					return;
				}
				core_sendBehaviour('scripting', {command: 'init', variable: params[0], value: params[1]});
				if (typeof (globalVariables[params[0]]) === 'undefined') {
					globalVariables[params[0]] = scripting_getValue(params[1]);
				}
				break;
			case 'set':
				debug_log("scripting", `set`);
				if (params.length !== 2) {
					alert("Error in 'set' command! Expected 2 parameters, but found: " + params.length);
					return;
				}
				//if params[0] starts with two underscores, it is an internal variable, so we do not modify it in globalVariables
				if (params[0].startsWith("__")) {
					debug_log("scripting", `cannot set internal variable: ${params[0]}`);
					return;
				}
				core_sendBehaviour('scripting', {command: 'set', variable: params[0], value: params[1]});
				globalVariables[params[0]] = scripting_getValue(params[1]);
				break;
			case 'increment':
				debug_log("scripting", `increment`);
				if (params.length !== 1) {
					alert("Error in 'increment' command! Expected 1 parameter, but found: " + params.length);
					return;
				}
				//if params[0] starts with two underscores, it is an internal variable, so we do not modify it in globalVariables
				if (params[0].startsWith("__")) {
					debug_log("scripting", `cannot increment internal variable: ${params[0]}`);
					return;
				}
				core_sendBehaviour('scripting', {command: 'increment', variable: params[0]});
				if (typeof (globalVariables[params[0]]) === 'undefined') {
					globalVariables[params[0]] = 0;
				}
				globalVariables[params[0]]++;
				break;
			case 'hide':
				debug_log("scripting", `hide`);
				if (params.length !== 1) {
					alert("Error in 'hide' command! Expected 1 parameter, but found: " + params.length);
					return;
				}
				core_sendBehaviour('scripting', {command: 'hide', selector: params[0]});
				$(params[0]).hide();
				break;
			case 'show':
				debug_log("scripting", `show`);
				if (params.length !== 1) {
					alert("Error in 'hide' command! Expected 1 parameter, but found: " + params.length);
					return;
				}
				core_sendBehaviour('scripting', {command: 'show', selector: params[0]});
				$(params[0]).show();
				break;
			case 'avg':
				let avg_param;
				let avg_result = 0;
				for (let i = 0; i < params.length; i++) {
					avg_param = scripting_getValue(params[i]);
					//cast to number
					if (typeof (avg_param) === 'string') {
						avg_param = parseFloat(avg_param);
					}
					if (isNaN(avg_param)) {
						alert("Error in 'avg' command! Parameter is not a number: " + params[i]);
						return;
					}
					avg_result += avg_param;
				}
				avg_result = avg_result / params.length;
				core_sendBehaviour('scripting', {command: 'avg', variable: params[0], value: avg_result});
				return avg_result;
			case 'sum':
				let sum_param;
				let sum_result = 0;
				for (let i = 0; i < params.length; i++) {
					sum_param = scripting_getValue(params[i]);
					//cast to number
					if (typeof (sum_param) === 'string') {
						sum_param = parseFloat(sum_param);
					}
					if (isNaN(sum_param)) {
						alert("Error in 'sum' command! Parameter is not a number: " + params[i]);
						return;
					}
					sum_result += sum_param;
				}
				core_sendBehaviour('scripting', {command: 'sum', variable: params[0], value: sum_result});
				return sum_result;
		}
	}
}

function scripting_getValue(param) {
	debug_log("scripting", `scripting_getValue(${param})`);
	//if param is a string and starts with a $ it is a variable so we get the value from globalVariables[name]
	if (typeof (param) === 'string' && param.startsWith("$")) {
		const variableName = param.substring(1);
		if (typeof (globalVariables[variableName]) !== 'undefined') {
			return globalVariables[variableName];
		} else {
			alert("Error in 'getValue' command! Variable not found: " + variableName);
			return false;
		}
	} else if (typeof (param) === 'string') {
		return param;
	} else if (typeof (param) === 'number') {
		return param;
	} else if (typeof (param) === 'object') {
		return scripting_executeActions([param]);
	}

}
