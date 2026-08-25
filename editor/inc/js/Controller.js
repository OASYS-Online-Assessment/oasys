/*
	Controller class v2.13

	controller and model for an MVC
	(c) 2021-2026 Eric J. FRANCOIS

	methods:

	registerView(callback, ...path)
		tells the controller to call the callback function then any data changes within the given path

		example:
			controller.registerView( (list) => tabs.setTabs(list), 'main', 'languages' );
			this would send an update whenever data['main']['languages'] changes

		beware the use of an arrow function to link the callback: this is necessary when the callback function is a
		method of another class, otherwise 'this' will point to the Controller rather than the other object

	unregisterView(callback)
		removes all links to the given callback, previously registered with the registerView method

	setData(data, ...path)
		if path is not given, this sets the complete data, with a path it will overwrite only a part of data previously
		set
		example:
			controller.setData( [4, 8, 15, 16, 23, 42], 'lottery', 'numbers' );
			this will write the given array into data['lottery']['numbers']

	getData(...path)
		returns the data found at the path

	eraseData(...path)
		erases the property at the end of the path

	undo()
		undo the last setData command

	redo()
		redo last undo step

	disableUndo()
		when working with more than one controller, the microchanges might be registered with undo steps in a second
		controller linked to a subkey of this one; then disableUndo() allows to tell this controller not to track any
		changes … this allows to group all changes made inbetween disabling an reenabling undo functionality in one big
		undo step

	enableUndo()
		when tracking changes was disabled, this reenables it; all changes made since disabling undo will then be made
		into one big undo step

	setUndoIgnorePaths(paths)
		sets paths that should be ignored when creating undo steps; this is useful for automatically generated data that
		depends on another value, which is already tracked by the undo system

		paths is an array of arrays, each subarray is a path to be ignored

	clearUndoHistory()
		removes all undo and redo steps from the history

	checkPath(...path)
		returns true if the indicated path exists in the data

	resetChangedFlag()
		sets the dirty status to false … usually done after saving data

	isChanged()
		returns true if data has changed since creation time, resp. since resetting the changed flag

	registerOnChangeCallback(callback)
		defines the function to be called when the changed flag switches; this is perfect for controlling enabling or
		disabling a save button automatically

	pauseUpdates()
	resumeUpdates()
		these two methods allow to pause and resume the sending of updates to the registered views; this is necessary
		when multiple values that depend on each other are updated in a row; this would otherwise trigger multiple updates
		for each value, which would deliver inconsistent data to the views until the last value is set

	debugData()
		logs current data on the console

	addConsistencyRule(rule)
		adds a rule for data consistency checks; currently supported types are 'unique' and 'notEmpty'

	runConsistencyChecks()
		runs all consistency checks and write __valid flag; if no rules have been defined, do not write flag at all

	registerContextGetterAndSetter(getter, setter)
		this allows to register functions that will be called to get and set the context of the data; this is useful
		when using multiple languages in the data, for example
		when controller does an undo, it will call the setter function to update the context, other wise the undo might
		change data which is not visible to the user
		by calling the setContext function, the controller can have the GUI switch to the language for which the change
		was undone.

		example:
			this.controller.registerContextGetterAndSetter(() => getLanguage(), (lang) => switchLanguage(lang));

*/

class Controller {

	constructor(id) {
		this.debug = 0;
		this.debugFilter = 'editor'; //only log debug messages for the instance with this id
		this.debugDataComparison = 0;
		this.id = id; //id for debugging purposes
		this.data = {};
		this.dataToOverwrite = {};
		this.callbacks = {__callbacks: []};
		this.changedFlag = false;
		this.onChangeCallback = null;
		this.undoData = [];
		this.redoData = [];
		this.trackChanges = true;
		this.undoSteps = 20;
		this.init = true;
		this.undoTimestamp = null;
		this.undoPath = null;
		this.ignoreUndoPaths = [];
		this.getContext = null;
		this.setContext = null;
		this.context = null;
		this.skipUpdates = false;
		this.consistencyRules = [];
	}

	/* register a callback to be informed on updates */
	registerView(callback, ...path) {
		this.db(1, `registerView`, path);
		if (typeof (callback) !== 'function') {
			console.error("Model.registerView error: callback needs to be a function");
			return;
		}

		let c = this.callbacks;
		if (path.length !== 0) {
			while (path.length > 0) {
				let i = path.shift();
				if (i === "__callbacks") {
					console.error("Model.registerView error: '__callbacks' is a reserved key");
					return;
				}
				if (typeof (c[i]) === 'undefined') {
					c[i] = {__callbacks: []};
				}
				c = c[i];
			}
		}
		if (c.__callbacks.includes(callback)) {
			console.error("Model.registerView error: callback already registered");
			return;
		}
		c.__callbacks.push(callback);
	}

	/*
		pausing updates is necessary when multiple values that depend on each other are updated in a row; this would
		otherwise trigger multiple updates for each value, which would deliver inconsistent data to the views
		until the last value is set
	 */
	pauseUpdates() {
		this.db(1, `pauseUpdates`);
		this.skipUpdates = true;
	}

	resumeUpdates() {
		this.db(1, `resumeUpdates`);
		this.skipUpdates = false;
	}

	dispatchUpdates(...path) {
		this.db(1, `dispatchUpdates`, path);
		//if updates are paused, we don't dispatch any updates
		if (this.skipUpdates) {
			return;
		}
		this.dispatcherRecursion(path, [], this.callbacks);
	}

	dispatcherRecursion(dtPath, cbPath, cbSubtree, depth = 0) {
		if ((this.pathIsSubset(cbPath, dtPath) || this.pathIsSubset(dtPath, cbPath))) {
			this.db(2, `dispatcherRecursion`, dtPath, cbPath, cbSubtree, depth);
			//if the callback path is a subset of the data path, we need to dispatch branch level updates
			if (cbSubtree.__callbacks.length > 0) {
				//only dispatch update if data has actually changed
				if (!this.compareData(this.#getDataInternal(...cbPath), this.#getDataToOverwrite(...cbPath))) {
					for (let cb of cbSubtree.__callbacks) {
						cb.call(this, this.#getDataInternal(...cbPath));
					}
				}
			}
			for (let i in cbSubtree) {
				if (i !== '__callbacks') {
					if (dtPath.length > cbPath.length) {
						this.dispatcherRecursion([...dtPath], [...cbPath, i], cbSubtree[i], depth + 1);
					} else {
						this.dispatcherRecursion([...dtPath, i], [...cbPath, i], cbSubtree[i], depth + 1);
					}
				}
			}
		}
	}

	/* remove a specific callback from the registered views */
	unregisterView(callback, haystack = null) {
		this.db(1, `unregisterView`, callback, haystack);
		if (haystack === null) {
			haystack = this.callbacks;
		}
		if (haystack.__callbacks.includes(callback)) {
			haystack.__callbacks.splice(haystack.__callbacks.indexOf(callback), 1);
		}
		for (let i in haystack) {
			if (i === '__callbacks') {
				continue;
			}
			this.unregisterView(callback, haystack[i]);
		}
	}

	/* 	set new data; indicate a path to update only part of the existing data */
	setData(data, ...path) {
		this.db(1, `setData`, path, data);
		/* prevent internal keys to be overwritten */
		if (!this.checkPathValidity(...path)) {
			return;
		}
		if (this.compareData(this.#getDataInternal(...path), data)) {
			//data has not changed: return
			return;
		}

		if (this.getContext) {
			this.context = this.getContext();
		}
		this.createUndoStep(path, data);

		let originalPath = this.clone(path);
		if (path.length !== 0) {
			let d = this.data;
			while (path.length > 1) {
				let i = path.shift();
				if (typeof (d[i]) === 'undefined') {
					d[i] = {};
				}
				d = d[i];
			}
			d[path] = this.clone(data);
		} else {
			this.data = this.clone(data);
		}
		this.runConsistencyChecks();
		this.dispatchUpdates(...originalPath);
		this.changedFlag = true;
		this.sendOnChangeNotification();
		this.init = false;
	}

	/* return data from a subkey of the data store */
	getData(...path) {
		this.db(1, `getData`, path);
		return this.getSubTree(this.data, ...path);
	}

	/* this method is identical to getData, but for internal calls only … only the debug level changes to avoid clutter */
	#getDataInternal(...path) {
		this.db(2, `getDataInternal`, path);
		return this.getSubTree(this.data, ...path);
	}

	#getDataToOverwrite(...path) {
		this.db(2, `getDataToOverwrite`, path);
		return this.getSubTree(this.dataToOverwrite, ...path);
	}

	/* erase data from a subkey of the data store */
	eraseData(...path) {
		this.db(1, `eraseData`, path);
		let originalPath = this.clone(path);
		let lastKey = path.pop();
		let data = this.data;
		for (let i in path) {
			if (typeof (data[path[i]]) === 'undefined') {
				return;
			}
			data = data[path[i]];
		}
		delete data[lastKey];
		this.runConsistencyChecks();
		this.dispatchUpdates(...originalPath);
		this.changedFlag = true;
		this.sendOnChangeNotification();
	}

	getSubTree(tree, ...path) {
		this.db(2, `getSubTree`, path);
		for (let i of path) {
			if (typeof (tree[i]) === 'undefined') {
				return null;
			}
			tree = tree[i];
		}
		return this.clone(tree);
	}

	getLengthOfArray(...path) {
		this.db(3, `getLengthOfArray`, path);
		let d = this.#getDataInternal(...path);
		if (Array.isArray(d)) {
			return d.length;
		} else {
			return -1;
		}
	}

	/* check validity of a path: none of the keys must start with 2 underscores, those are internal variables */
	checkPathValidity(...path) {
		this.db(3, `checkPathValidity`, path);
		for (let i of path) {
			if (typeof (i) === 'string' && (i.substring(0, 2) === '__')) {
				console.error(`Controller error: invalid key name '${i}' in path`);
				return false;
			}
		}
		return true;
	}

	clearUndoHistory() {
		this.db(1, `clearUndoHistory`);
		this.redoData = [];
		this.undoData = [];
	}

	createUndoStep(path, data) {
		let dataType = typeof(data);
		this.db(1, `createUndoStep`, path, dataType);
		if (this.trackChanges && !this.init) {

			//check if path is not on the ignore list
			if (this.findUndoIgnorePath(path)) {
				this.db(1,`skipped undo step creation, path ${JSON.stringify(path)} is on the ignore list`);
				return;
			}

			let now = new Date();
			now = now.getTime();

			//any updates happening within 500 ms of the previous update will not create an undo step
			if (this.undoTimestamp && now - this.undoTimestamp < 500) {
				this.db(1, `skipped undo step creation, last update was less than 500ms ago`);
				return;
			}

			//if the new data updates the same key as the previous update and this happened within 2 seconds, do not create undo step
			if (this.undoTimestamp && this.undoPath && now - this.undoTimestamp < 2000 && this.comparePaths(this.undoPath, path)) {
				let divergingPath = (this.compareAndFindAncestor(this.#getDataInternal(...path), data));
				if (this.comparePaths(this.undoSubTreePath, divergingPath)) {
					this.db(1, `skipped undo step creation`);
					this.undoTimestamp = now;
					this.undoPath = structuredClone(path);
					return;
				} else {
					this.undoSubTreePath = divergingPath;
				}
			}

			this.db(1, `creation of undo step is valid, proceeding …`);

			//clear any redo data
			this.redoData = [];

			this.undoTimestamp = now;
			this.undoPath = structuredClone(path);

			//if undo history is full, we'll remove the oldest step before creating a new one;
			if (this.undoData.length === this.undoSteps) {
				this.undoData.splice(0, 1);
			}
			//make a deep copy of the data and add it to the undo history
			this.undoData.push({context: this.context, data: this.clone(this.data)});
		}
	}

	undo() {
		this.db(1, `undo`);
		if (!this.trackChanges || this.undoData.length === 0) {
			return;
		}
		//prevent new undo steps to be created when undoing
		let now = new Date();
		now = now.getTime();
		this.undoTimestamp = now;

		//create redo step
		this.redoData.push({context: this.context, data: this.clone(this.data)});
		//write undo data back into main data
		let undoStep = this.undoData.pop();
		this.dataToOverwrite = this.clone(this.data);
		this.data = undoStep.data;
		this.context = undoStep.context;

		this.dispatchUpdates();
		this.dataToOverwrite = {};
		if (this.setContext && this.context) {
			this.setContext.call(this, this.context);
		}
		this.changedFlag = true;
		this.sendOnChangeNotification();
	}

	redo() {
		if (!this.trackChanges || this.redoData.length === 0) {
			return;
		}
		//prevent new undo steps to be created when redoing
		let now = new Date();
		now = now.getTime();
		this.undoTimestamp = now;

		//create undo step
		this.undoData.push({context: this.context, data: this.clone(this.data)});
		//write redo data back into main data
		let redoStep = this.redoData.pop();
		this.dataToOverwrite = this.clone(this.data);
		this.data = redoStep.data;

		this.dispatchUpdates();
		this.dataToOverwrite = {};
		if (this.setContext && this.context) {
			this.setContext.call(this, this.context);
		}
		this.context = redoStep.context;
		this.changedFlag = true;
		this.sendOnChangeNotification();
	}

	/* when working on a subset level of the data, this controller should not log undo steps -> disable undo */
	disableUndo() {
		this.db(1, `disableUndo`);
		this.trackChanges = false;
		if (this.undoData.length === this.undoSteps) {
			this.undoData.splice(0, 1);
		}
		//make a deep copy of the data and add it to the undo history
		this.undoData.push({context: this.context, data: this.clone(this.data)});
		//clear any redo data
		this.redoData = [];
	}

	enableUndo() {
		this.db(1, `enableUndo`);
		this.trackChanges = true;
		if (this.undoData.length > 0 && this.compareData(this.data, this.undoData[this.undoData.length - 1].data)) {
			/*	if no changes were made between disabling and reenabling undo, we'll need to remove the undo step
				created when disabling the tracking of changes */
			this.undoData.pop();
		}
	}

	setUndoIgnorePaths(paths) {
		this.db(1, `setUndoIgnorePaths`, paths);
		for (let path of paths) {
			if (!this.findUndoIgnorePath(path)) {
				this.ignoreUndoPaths.push(path);
			}
		}
	}

	findUndoIgnorePath(path) {
		this.db(2, `findUndoIgnorePath`, path);
		for (let i of this.ignoreUndoPaths) {
			if (this.comparePaths(i, path)) {
				return true;
			}
		}
		return false;
	}

	/* verify if path exists */
	checkPath(...path) {
		this.db(3, `checkPath`, path);
		let d = this.data;
		for (let i of path) {
			if (typeof (d[i]) === 'undefined') {
				return false;
			}
			d = d[i];
		}
		return true;
	}

	/* compare if 2 paths are equal */
	comparePaths(p1, p2) {
		this.db(3, `comparePaths`, p1, p2);
		if (!p1 || !p2) {
			return false;
		}
		if (p1.length !== p2.length) {
			return false;
		}
		for (let i in p1) {
			if (p1[i] !== p2[i]) {
				return false;
			}
		}
		return true;
	}

	/* check if one path is a subset of the other */
	pathIsSubset(path1, path2) {
		this.db(3, `pathIsSubset`, path1, path2);
		if (!Array.isArray(path1) || !Array.isArray(path2)) {
			console.error('Controller "pathIsSubset": Both parameters must be arrays');
			return false;
		}

		if (path1.length > path2.length) {
			return false;
		}

		for (let i = 0; i < path1.length; i++) {
			if (path1[i] !== path2[i]) {
				return false;
			}
		}
		return true;
	}

	/* reset the flag that indicates if changes have been made to the data */
	resetChangedFlag() {
		this.db(1, `resetChangedFlag`);
		this.changedFlag = false;
		this.sendOnChangeNotification();
	}

	/* returns the flag that indicates if changes have been made to the data */
	isChanged() {
		this.db(1, `isChanged`);
		return this.changedFlag;
	}

	/* check if all the indicated strings exist as keys in the object */
	checkKeys(obj, ...keys) {
		this.db(3, `checkKeys`, obj, keys);
		for (const key of keys) {
			if (!(key in obj)) {
				console.error(`Controller "checkKeys": Key '${key}' not found.`);
				return false;
			}
		}
		return true;
	}

	/* register a callback to be notified when changes happen */
	registerOnChangeCallback(callback) {
		this.db(1, `registerOnChangeCallback`);
		if (typeof (callback) !== 'function') {
			console.error("Model.registerOnChangeCallback error: callback needs to be a function");
			return;
		}
		this.onChangeCallback = callback;
	}

	/* notify registered callback that a change has happened */
	sendOnChangeNotification() {
		this.db(1, `sendOnChangeNotification`);
		if (this.onChangeCallback) {
			this.onChangeCallback.call(this, this.isChanged());
		}
	}

	registerContextGetterAndSetter(getter, setter) {
		this.db(1, `registerContextGetterAndSetter`);
		if (typeof (getter) === 'function' && typeof (setter) === 'function') {
			this.getContext = getter;
			this.setContext = setter;
		}
	}

	/* return count of keys in an object */
	objectLength(o) {
		this.db(3, `objectLength`, o);
		return (Object.keys(o).length);
	}

	/* deep copy data */
	clone(d) {
		this.db(3, `clone`, d);
		if (Array.isArray(d)) {
			let a = [];
			for (let i in d) {
				a[i] = this.clone(d[i]);
			}
			return a;
		} else if (d === null) {
			/*	this is necessary because in javascript typeof(null) === 'object' which would convert any null value to
				{} in the next if clause */
			return null;
		} else if (typeof (d) === 'object') {
			let a = {};
			for (let i in d) {
				a[i] = this.clone(d[i]);
			}
			return a;
		} else {
			return d;
		}
	}

	/* write current data structure to console */
	debugData() {
		console.dir(this.data);
	}

	compareData(d1, d2) {
		this.db(3, `compareData`, d1, d2);
		if (d1 === d2) {
			this.logComparison('compareData: data is equal', d1, d2);
			return true;
		} else if (d1 === null || d2 === null) {
			this.logComparison('compareData: data is null', d1, d2);
			return false;
		} else if (typeof (d1) !== typeof (d2)) {
			this.logComparison('compareData: data types are different', d1, d2);
			return false;
		} else if (Array.isArray(d1)) {
			if (!Array.isArray(d2)) {
				this.logComparison('compareData: d2 is not an array', d1, d2);
				return false;
			} else if (d1.length !== d2.length) {
				this.logComparison('compareData: arrays have different lengths', d1, d2);
				return false;
			}
			for (let i in d1) {
				if (typeof (d1[i]) === 'object') {
					if (this.compareData(d1[i], d2[i]) === false) {
						this.logComparison('compareData: array subpaths are different', d1, d2);
						return false;
					}
				} else if (d1[i] !== d2[i]) {
					this.logComparison('compareData: array values are different', d1, d2);
					return false;
				}
			}
			this.logComparison('compareData: arrays are equal', d1, d2);
			return true;
		} else if (typeof (d1) === 'object') {
			if (Object.keys(d1).length !== Object.keys(d2).length) {
				this.logComparison('compareData: objects have different key counts', d1, d2);
				return false;
			}
			for (let i in d1) {
				if (typeof (d1[i]) === 'object') {
					if (this.compareData(d1[i], d2[i]) === false) {
						this.logComparison('compareData: object subpaths are different', d1, d2);
						return false;
					}
				} else if (d1[i] !== d2[i]) {
					this.logComparison('compareData: object values are different', d1, d2);
					return false;
				}
			}
			this.logComparison('compareData: objects are equal', d1, d2);
			return true;
		} else {
			this.logComparison('compareData: data is different', d1, d2);
			return false;
		}
	}

	logComparison(msg, d1, d2) {
		if (this.debugDataComparison !== 1) return;
		console.log(msg);
		console.log(this.clone(d1));
		console.log(this.clone(d2));
	}

	findDivergingSubtrees(d1, d2, path = []) {
		if (typeof d1 !== typeof d2) {
			return [path]; // Divergence due to type mismatch
		}

		if (typeof d1 !== 'object' || d1 === null || d2 === null) {
			if (d1 !== d2) {
				return [path]; // Divergence due to value mismatch
			}
			return []; // No divergence
		}

		if (Array.isArray(d1) !== Array.isArray(d2)) {
			return [path]; // Divergence due to one being an array and the other not
		}

		const keys1 = Array.isArray(d1) ? d1.map((_, i) => i) : Object.keys(d1);
		const keys2 = Array.isArray(d2) ? d2.map((_, i) => i) : Object.keys(d2);
		const allKeys = new Set([...keys1, ...keys2]);

		let divergences = [];
		for (const key of allKeys) {
			if (!(key in d1) || !(key in d2)) {
				divergences.push([...path, key]); // Divergence due to a missing key
			} else {
				const result = this.findDivergingSubtrees(d1[key], d2[key], [...path, key]);
				divergences = divergences.concat(result); // Collect all divergences
			}
		}

		return divergences;
	}

	findCommonAncestor(paths) {
		if (paths.length === 0) return []; // No divergences
		if (paths.length === 1) return paths[0]; // Only one divergence, no need for a common ancestor

		let commonAncestor = paths[0];

		for (let i = 1; i < paths.length; i++) {
			const path = paths[i];
			let j = 0;

			// Compare paths element by element
			while (j < commonAncestor.length && j < path.length && commonAncestor[j] === path[j]) {
				j++;
			}

			// Reduce the commonAncestor to the shared part
			commonAncestor = commonAncestor.slice(0, j);
			if (commonAncestor.length === 0) break; // No common ancestor exists
		}

		return commonAncestor;
	}

	compareAndFindAncestor(d1, d2) {
		const divergences = this.findDivergingSubtrees(d1, d2);
		return this.findCommonAncestor(divergences);
	}

	dataIsSet(...path) {
		let d = this.#getDataInternal(...path);
		return d !== null;
	}

	/* check if data is valid; returns true also if the consistency rules have not been defined */
	isDataValid() {
		this.db(2, `isDataValid`);
		return this.data.__valid || this.consistencyRules.length === 0;
	}

	/* registers rules for data consistency checks */
	addConsistencyRule(rule) {
		this.db(1, `addConsistencyRule`, rule);
		if (!this.checkKeys(rule, 'type')) return;
		switch (rule.type) {
			case 'unique':
				if (!this.checkKeys(rule, 'path', 'subPath')) return;
				if (typeof (rule.path) === 'string') {
					rule.path = [rule.path];
				}
				if (typeof (rule.subPath) === 'string') {
					rule.subPath = [rule.subPath];
				}
				break;
			case 'notEmpty':
				if (!this.checkKeys(rule, 'path', 'subPath')) return;
				if (typeof (rule.path) === 'string') {
					rule.path = [rule.path];
				}
				break;
		}
		this.consistencyRules.push(rule);
	}

	/* run all consistency checks */
	runConsistencyChecks() {
		this.db(1, `runConsistencyChecks`);
		/* if no rules have been defined, do not write __valid flag at all */
		if (this.consistencyRules.length === 0) {
			return;
		}
		let valid = true;
		for (let rule of this.consistencyRules) {
			switch (rule.type) {
				case 'unique':
					valid = valid && this.consistencyCheck_Unique(rule);
					break;
					case 'notEmpty':
					valid = valid && this.consistencyCheck_NotEmpty(rule);
					break;
			}
		}
		this.data.__valid = valid;
	}

	/* check if all values in a subkey are unique */
	consistencyCheck_Unique(rule) {
		this.db(1, `consistencyCheck_Unique`, rule);
		let data = this.#getDataInternal(...rule.path);
		if (data === null) {
			return true;
		}
		let uniqueValues = [];
		for (let i in data) {
			let value = this.#getDataInternal(...rule.path, i, ...rule.subPath);
			if (uniqueValues.includes(value)) {
				return false
			} else {
				uniqueValues.push(value);
			}
		}
		return true;
	}

	consistencyCheck_NotEmpty(rule) {
		this.db(1, `consistencyCheck_NotEmpty`, rule);
		let data = this.#getDataInternal(...rule.path);
		if (data === null) {
			return false;
		}
		for (let i in data) {
			let value = this.#getDataInternal(...rule.path, i, ...rule.subPath);
			if (value === null || value === '') {
				return false;
			}
		}
		return true;
	}

	db(level,...args) {
		if (this.debugFilter && this.debugFilter !== this.id) {
			return;
		}
		if (this.debug >= level) {
			console.trace(`%cController "${this.id}":`, "color: orange; font-weight: bold;", ...args);
		}
	}
}

/*
	Changelog:

	v2.01
		- modified how the creation of undoSteps is skipped when a lot of changes are made in a row
	v2.02
		- added the ability to ignore specfific paths when creating undo steps
	v2.03
		- fixed a dispatch bug
		- updated documentation on all public methods
	v2.04
		- added eraseData method
	v2.05
		- added the ability to skip a number of undo steps
		- modified debugging output
	v2.06
		- added more consistent debugging output
		- several enhancements in undo and redo handling
	v2.07
		- not skipping undo steps on fast data entry any longer if changes happen in subpaths
	v2.08
		- removed skipUndo functionality
		- added feature to ignore undo steps for changes that happen within 100ms of each other
			(usually due to paths that depend on each other)
		- increased undo step creation time to 2 seconds for the same path
		- duplicated getData method for internal use, so that debugging will not spam the console
	v2.09
		- preventing undo steps to be created when triggering undo or redo
	v2.10
		- increased undo step creation skip time from 100ms to 500ms
	v2.11
		- added a method to check if a path exists in the data
	v2.12
		- fixed a problem with the dispatcher

 */