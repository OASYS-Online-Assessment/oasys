"use strict";
//definition of global objects that will receive all the information along the way

//for debugging
window.debugModules = {};

//for the loader
window.text = {};		//messages and labels in different languages
window.loader = {};	//global object keeping track of loader activity

//for general use throughout the platform:
window.dialogs = {};	//dialog instances
window.keyboardHandler = null;
window.pointerHandler = null;
window.defaults = {};	//defaults, like default language of the platform
window.plugins = {};	//this is where plugins register themselves

//for use during loginPage:
window.loginPage = {};	//everything related to the login page

//for use during a test session:
window.testee = {};		//everything related to the test taker
window.test = {};		//everything related to the test itself (structure, content, time, etc.)
window.skin = {};		//everything related to the skin (callbacks, properties, etc.)
window.timer = {
	settings: {},		//settings of the timer
	status: {}			//current status (time left)
};
window.itemTimer = {
	settings: {}		//settings of the itemTimer
};

window.state = {};		//everything related to the current status of the test (current item number, etc.)
window.butler = {};		//permissions management and other options
window.workers = {};	//pointers to the web workers
window.answers = {};	//storage for all answers given for all fields
window.events = {};		//storage of data to be sent to queue worker; every entry will be removed once the queue worker confirms that it's been transmitted
window.techLog = [];	//technical log of what's happening
window.stylesheets = {};	//will hold custom stylesheets as required (e.g. by test, by item, by plugin, etc.)
window.globalVariables = {};	//storage of global variables
window.hooks = {};		//hooks for the core functionality installed by any plugin or other parth of code
window.core = {};		//variables for the core functionality