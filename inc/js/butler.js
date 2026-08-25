"use strict";

/*
 The butler reunites all functions that manage test and testee options. It knows
 what a testee may or may not do at a given point in time. The biggest job is
 managing navigation permissions, but it also regulates whether data may be sent
 to the server or not and blocking the test when the server cannot be reached.

 It will also perform a myriad of other menial tasks that noone else wants to do.
 */


function butler_init() {
	// set defaults
	window.butler = {
		limitNavigation: false,
		navigationDisabledByScript: false,
		saveResults: true,
		showScore: false,
		useTimer: false,
		timeLimit: 0,
		demoMode: false,
		skin: {},
		buttons: {}
	};

	//set options from test data
	if (test.options) {
		butler.limitNavigation = test.options.limitNavigation;
		butler.saveResults = test.options.saveResults;
		butler.showScore = test.options.showScore;
		butler.useTimer = test.options.useTimer;
		butler.timeLimit = test.options.timeLimit;
		butler.waitForMediaCache = test.options.waitForMediaCache ?? false;
	}

	//set testee overrides
	if (test.login.overrides.allowNavigation === true) butler.limitNavigation = false;
	if (test.login.overrides.demoMode === true) butler.demoMode = true;
	if (test.login.overrides.disableSaving === true) {
		butler.saveResults = false;
	}
	if (test.login.overrides.disableTimer === true) butler.useTimer = false;
	if (test.login.overrides.additionalTime > 0) {
		butler.timeLimit = Math.round(butler.timeLimit * (1 + test.login.overrides.additionalTime / 100));
	}

	/*
		export test taker overrides to globalVariables to allow modifying content based on these
		For instance, if timer is disabled, the last page could be modified to show a close button instead of requiring
		the user to wait for the timer to finish
	 */
	globalVariables.__overrides = {
		allowNavigation: test.login.overrides.allowNavigation,
		demoMode: test.login.overrides.demoMode,
		disableSaving: test.login.overrides.disableSaving,
		disableTimer: test.login.overrides.disableTimer,
		additionalTime: test.login.overrides.additionalTime ?? 0
	};

	//if no time limit is given, the useTimer option is set to false and the other way round
	if (butler.timeLimit === 0) butler.useTimer = false;
	if (butler.useTimer === false) butler.timeLimit = 0;

	//the item buttons are disabled at creation time and are now enabled if there is no limitation
	if (!butler.limitNavigation) {
		if (typeof (skin_switchItemButtons) === 'function') {
			skin_switchItemButtons(true);
		}
	}

	// export butler options to globalVariables to allow selectively showing content based on these
	globalVariables.__options = {
		limitNavigation: butler.limitNavigation,
		saveResults: butler.saveResults,
		showScore: butler.showScore,
		useTimer: butler.useTimer,
		timeLimit: butler.timeLimit
	};

	//initialize skin options
	for (let option in window.skin.properties) {
		//support for legacy information in database (prior to v3.5)
		if (typeof(test.skin.skinOptions[option]) === 'object') {
			test.skin.skinOptions[option] = test.skin.skinOptions[option].value ?? window.skin.properties[option].defaultValue;
		} else if (typeof (test.skin.skinOptions[option]) === 'undefined') {
			test.skin.skinOptions[option] = window.skin.properties[option].defaultValue;
		}
		butler.skin[option] = test.skin.skinOptions[option];
		if (typeof (skin_setOption) === 'function') {
			skin_setOption(option, butler.skin[option]);
		}
	}

	/* if floatingQuestions is not active, let's check if any page overrides this setting */
	if (butler.skin.floatingQuestions === true) {
		if (typeof (skin_enableFloatingQuestions) === 'function') {
			skin_enableFloatingQuestions();
		}
	} else {
		for (let i in test.structure.items) {
			if (test.structure.items[i].overrides.floatingQuestions === true) {
				if (typeof (skin_enableFloatingQuestions) === 'function') {
					skin_enableFloatingQuestions();
					break;
				}
			}
		}
	}

}

function butler_debug() {
	butler.limitNavigation = false;
	butler.navigationDisabledByScript = false;
	butler.saveResults = false;
	butler_updateNavigation();
	if (typeof (skin_switchItemButtons) === 'function') {
		skin_switchItemButtons(true);
	}
}

function butler_updateNavigation() {

	//switch left button
	if (butler_mayGoToItem(state.currentItem - 1) && butler.navigationDisabledByScript !== true) {
		if (typeof (skin_switchButton) === 'function') {
			skin_switchButton('left', true);
		}
	} else {
		if (typeof (skin_switchButton) === 'function') {
			skin_switchButton('left', false);
		}
	}

	//switch right button
	if (butler_mayGoToItem(state.currentItem + 1) && butler.navigationDisabledByScript !== true) {
		if (typeof (skin_switchButton) === 'function') {
			skin_switchButton('right', true);
		}
	} else {
		if (typeof (skin_switchButton) === 'function') {
			skin_switchButton('right', false);
		}
	}

	//switch previous page buttons in item or stimulus
	if (butler.buttons.previousPage) {
		for (let button of butler.buttons.previousPage) {
			if (butler_mayGoToItem(state.currentItem - 1) || button.options.force) {
				button.instance.enable();
			} else {
				button.instance.disable();
			}
		}
	}

	//switch next page buttons in item or stimulus
	if (butler.buttons.nextPage) {
		for (let button of butler.buttons.nextPage) {
			if (butler_mayGoToItem(state.currentItem + 1) || button.options.force) {
				button.instance.enable();
			} else {
				button.instance.disable();
			}
		}
	}
}

function butler_updateItemButtons(itemId) {
	for (let i in test.structure.items) {
		if (test.structure.items[i].hiddenID === itemId) {
			if (typeof (skin_setItemButtonStatus) === 'function') {
				skin_setItemButtonStatus(i, !test.itemRequirements[itemId]);
			}
		}
	}
}

function butler_updateItemOptions() {
	for (let option in butler.skin) {
		let value = butler.skin[option];
		if (typeof (test.structure.items[state.currentItem].overrides[option]) !== 'undefined') {
			value = test.structure.items[state.currentItem].overrides[option];
		}
		/* special rules for floatingQuestions (if supported by skin) */
		if (option === 'floatingQuestions') {
			if (!test.items[state.currentItemId].link) {
				value = false;
			}
		}
		if (typeof (skin_setOption) === 'function') {
			skin_setOption(option, value);
		}
	}
}

function butler_disableNavigationByScript() {
	/*
		A script may need to make an item look like the last item of a test due to conditional branching, even though
		it's not really the last item. This function takes care of that.
	 */
	butler.navigationDisabledByScript = true;
	butler_updateNavigation();
}

function butler_reenableNavigationByScript() {
	/*
		This reenables navigation, that was previously disabled by a script. This function does not override other item
		requirements, though. So if mandatory fields are not filled, navigation might still remain inactive after
		calling this function.
	 */
	butler.navigationDisabledByScript = false;
	butler_updateNavigation();
}

function butler_mayGoToItem(n) {
	if (typeof (test.structure.items[n]) === 'undefined') {
		//if item does not exist, user can't navigate there
		return false;
	}
	if (typeof (state.currentItem) === 'undefined') {
		//at loading time the test is always allowed to open the first item
		state.currentItem = n;
		return true;
	}
	if (!butler.limitNavigation) {
		//with no limitation on navigation the user is free to navigate
		return true;
	}
	if (n <= state.currentItem) {
		//if navigation is limited, user must never go back
		return false;
	}
	if (n > state.currentItem + 1) {
		//if navigation is limited, user cannot skip over 1 or more items
		return false;
	}
	if (n === state.currentItem + 1) {
		for (let i in state.requiredFields) {
			if (state.requiredFields[i] === false) {
				return false;
			}
		}
		return true;
	}
}

//register buttons included in stimulus or item
function butler_registerButton(type, instance, options) {
	if (typeof window.butler.buttons[type] === 'undefined') {
		window.butler.buttons[type] = [];
	}
	window.butler.buttons[type].push({
		instance: instance,
		options: options
	});
}

//unregister buttons included in stimulus or item
function butler_clearButtons(type = null) {
	if (!type) {
		window.butler.buttons = {};
		return;
	}
	window.butler.buttons[type] = [];
}

function butler_checkOption(option) {
	/*
		This function checks whether the given option is set to true in the butler object.
		It returns true if the option is set, false otherwise.
	 */
	if (typeof (butler[option]) === 'undefined') {
		return false;
	}
	return butler[option];
}