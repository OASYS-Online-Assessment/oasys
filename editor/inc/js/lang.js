"use strict";

class Lang {

	constructor() {
		this.loadingMessages = [/*loadingMessages*/];
		this.msg = {/*msgStrings*/};
		this.en = {/*enStrings*/};

		for (let msg of this.loadingMessages) {
			alert(msg);
		}

	}

	/*
	 * In order to do replacements, the second parameter must be an object with the keys being the index of the
	 * replacement. The replacement string must be in the format ${index} in the string.
	 */

	/* returns the key if no translation exists */
	e(str, replacements = null) {
		return this.prepareString(false, str, replacements);
	}

	/* returns an error message if no translation exists */
	m(key, replacements = null) {
		return this.prepareString(true, key, replacements);
	}

	prepareString(debug, key, replacements) {
		let r;
		if (typeof this.msg[key] !== 'undefined' && this.msg[key] !== '') {
			r = this.msg[key];
			if (replacements !== null) {
				r = this.doReplacements(r, replacements);
			}
		} else if (typeof this.en[key] !== 'undefined' && this.en[key] !== '') {
			r = this.en[key];
			if (replacements !== null) {
				r = this.doReplacements(r, replacements);
			}
		} else {
			if (settings.debugSystem === true && debug === true) {
				if (typeof this.msg[key] === 'undefined') {
					r = 'missing string';
					console.log(`UILANG: missing key "${key}"`);
				} else if (this.msg[key] === '') {
					r = 'empty string';
					console.log(`UILANG: empty string "${key}"`);
				}
			} else {
				r = key;
			}
		}
		return r;
	}

	doReplacements(str, replacements) {
		for (let i in replacements) {
			str = str.replace("${" + i + "}", replacements[i]);
		}
		return str;
	}
}

const UILANG = new Lang();

