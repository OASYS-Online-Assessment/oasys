/*
 * OASYS interaction plugin
 *
 * choice group
 *
 */

"use strict";

(function ($) {

	const type = 'oasysChoice';
	let defaultValue = "__noreply__";
	let instance;

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysChoice,
				cleanup: cleanUp,
				validResponse: validResponse,
				scoring: {},
				multipleInstancesAllowed: false,
				supportLabels: false, //labels are created automatically, will not be linked to external ones
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/*
	 definition of what constitutes a well formatted answer
	 depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */
	function validResponse(answer, options) {
		if (options.choiceType === 'multiple') {
			if (typeof (answer) === 'string' && answer !== '') {
				answer = JSON.parse(answer);
			}
			if (answer instanceof Array) {
				if (answer.length >= options.minRequired && (answer.length <= options.maxRequired || options.maxRequired === -1)) {
					return true;
				}
			}
			return false;
		} else if (options.choiceType === 'single') {
			return (answer !== "" && answer !== null && typeof (answer) !== 'undefined');
		} else if (options.choiceType === 'dropdown') {
			return (answer !== defaultValue && typeof(answer) !== 'undefined'&& answer !== null);
		}
	}


	/* test instance of choice */
	function oasysChoice(parent, options, item, currentValue, language) {
		/*
		 parent:			string or jQuery object		container element for this object
		 options:			object						structure depends on properties of plugin (see above)
		 item:	{
		 -			id:		int							id of current item in database
		 -			code:	string						item code set in item manager
		 }
		 currentValue:		string						may need to be parsed to number, boolean, object depending on plugin
		 */

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}

		/* optional settings */
		if (!options) return;

		/* creation */
		const choiceType = options.choiceType;

		/* establish order of choices */
		let items = {};
		let firstLang = null;

		if (options.choices.length === 0) {
			return;
		}

		//if order was established before use cached version (prevents from reshuffling if shuffled order was chosen)
		if (typeof(options.orderedChoices) !== 'undefined') {
			items = options.orderedChoices;
		} else {
			for (let i of Object.keys(options.choices[0].label)) {
				let sourceLang = i;
				if (firstLang === null) {
					firstLang = i;
				}
				items[i] = [];
				if (options.order === 'alphabet') {
					for (let j in options.choices) {
						items[i][j] = {value: options.choices[j].value, label: options.choices[j].label[sourceLang]};
					}
					orderArrayByProperty(items[i], 'label');
				} else if (options.order === 'random') {
					if (firstLang === i) {
						//define the order for the first language
						for (let j in options.choices) {
							items[i][j] = {
								value: options.choices[j].value,
								label: options.choices[j].label[sourceLang]
							};
						}
						shuffleArray(items[i]);
					} else {
						//if order has already been defined for one language fill in the other languages with the same order
						for (let j in items[firstLang]) {
							let item = fetchObjectFromArray(options.choices, {value: items[firstLang][j].value});
							items[i][j] = {value: items[firstLang][j].value, label: item.label[sourceLang]};
						}
					}
				} else {
					for (let j in options.choices) {
						items[i][j] = {value: options.choices[j].value, label: options.choices[j].label[sourceLang]};
					}
				}
			}
			options.orderedChoices = deepCopy(items); //save order for later use
		}

		const group = options.id;
		const code = options.code;
		let jsmcData;
		let theme;
		let groupInstance;
		let element;
		let lastValue;
		let block;
		let wrapperPrefix = '';
		let wrapperPostfix = '';

		switch (choiceType) {
			case 'single':
				if (typeof (currentValue) === 'undefined') {
					currentValue = "";
				}

				parent.html(`<div style="grid-row-gap: ${options.rowgap ?? 0}px; grid-column-gap: ${options.colgap ?? 50}px" class='choiceBlock choiceLayout_${options.layout} choiceLabelPosition_${options.labelPosition}'></div>`);
				parent.addClass(`choiceWrapper`);
				parent.addClass(`choiceAlignment_${options.alignment}`);
				block = parent.find('.choiceBlock');
				wrapperPrefix = "<div class='choiceCellInline'>";
				wrapperPostfix = "</div>";
				if ((options.layout === 'horizontal' && (options.labelPosition === 'above' || options.labelPosition === 'below')) || options.layout === 'twocolumns') {
					wrapperPrefix = "<div class='choiceCell'>";
				}

				jsmcData = {
					type: 'rb',
					onChange: sendData,
					initialValue: currentValue,
					dataId: options.code,
					elPrefix: "<div class='choiceElement'>",
					elPostfix: "</div>",
					lbPrefix: "<div class='choiceLabel'>",
					lbPostfix: "</div>",
					elements: []
				};

				if (options.labelPosition === 'left' || options.labelPosition === 'above' || options.labelPosition === 'only') {
					jsmcData.order = "labelFirst";
					jsmcData.lbPrefix = wrapperPrefix + jsmcData.lbPrefix;
					jsmcData.elPostfix += wrapperPostfix;
				} else {
					jsmcData.elPrefix = wrapperPrefix + jsmcData.elPrefix;
					jsmcData.lbPostfix += wrapperPostfix;
				}

				//check if skin defines a custom theme for radiobuttons
				theme = fetchFromObjPath(skin, ['customCSS', 'jsMC']);
				if (theme) {
					jsmcData.theme = theme;
				}

				for (let i in items[language]) {
					let el = {elementParent: block, labelParent: block};
					el.value = items[language][i].value;
					el.label = items[language][i].label;
					jsmcData.elements.push(el);
				}

				groupInstance = new jsMultipleChoice(code, jsmcData);
				initObj(window, ['oasysChoiceGroups', code, 'handle'], groupInstance);
				initObj(window, ['oasysChoiceGroups', code, 'value'], currentValue);
				break;

			case 'multiple':
				if (typeof (currentValue) === 'string' && currentValue !== '') {
					currentValue = JSON.parse(currentValue);
				} else {
					currentValue = [];
				}

				parent.html(`<div style="grid-row-gap: ${options.rowgap ?? 0}px; grid-column-gap: ${options.colgap ?? 50}px" class='choiceBlock choiceLayout_${options.layout} choiceLabelPosition_${options.labelPosition}'></div>`);
				parent.addClass(`choiceWrapper`);
				parent.addClass(`choiceAlignment_${options.alignment}`);
				block = parent.find('.choiceBlock');
				wrapperPrefix = "<div class='choiceCellInline'>";
				wrapperPostfix = "</div>";
				if ((options.layout === 'horizontal' && (options.labelPosition === 'above' || options.labelPosition === 'below')) || options.layout === 'twocolumns') {
					wrapperPrefix = "<div class='choiceCell'>";
				}

				jsmcData = {
					type: 'cb',
					onChange: sendData,
					initialValue: currentValue,
					dataId: options.code,
					elPrefix: "<div class='choiceElement'>",
					elPostfix: "</div>",
					lbPrefix: "<div class='choiceLabel'>",
					lbPostfix: "</div>",
					elements: []
				};

				if (options.labelPosition === 'left' || options.labelPosition === 'above' || options.labelPosition === 'only') {
					jsmcData.order = "labelFirst";
					jsmcData.lbPrefix = wrapperPrefix + jsmcData.lbPrefix;
					jsmcData.elPostfix += wrapperPostfix;
				} else {
					jsmcData.elPrefix = wrapperPrefix + jsmcData.elPrefix;
					jsmcData.lbPostfix += wrapperPostfix;
				}

				if (options.maxRequired > 0) {
					jsmcData.maxClickableCB = options.maxRequired;
				}

				//check if skin defines a custom theme for radiobuttons
				theme = fetchFromObjPath(skin, ['customCSS', 'jsMC']);
				if (theme) {
					jsmcData.theme = theme;
				}

				for (let i in items[language]) {
					let el = {elementParent: block, labelParent: block};
					el.value = items[language][i].value;
					el.label = items[language][i].label;
					jsmcData.elements.push(el);
				}

				groupInstance = new jsMultipleChoice(code, jsmcData);
				initObj(window, ['oasysChoiceGroups', code, 'handle'], groupInstance);
				initObj(window, ['oasysChoiceGroups', code, 'value'], currentValue);
				break;

			case 'dropdown':
				const dlData = {
					onChange: onChangeDD,
					elements: deepCopy(items[language]),
					initialValue: currentValue ?? defaultValue,
					readOnly: options.readOnly,
					dataId: options.id,
					width: options.width
				};
				dlData.elements.unshift({value: defaultValue, label: "&nbsp;"});
				let lastValue = dlData.initialValue;

				//check if skin defines a custom theme for check boxes
				theme = fetchFromObjPath(skin, ['customCSS', 'jsDL']);
				if (theme) {
					dlData.theme = theme;
				}

				parent.css('text-align', options.alignment);
				instance = new jsDropList(parent, options.code, dlData);
				initObj(window, ['oasysChoiceDropDowns', code, 'handle'], instance);
				initObj(window, ['oasysChoiceDropDowns', code, 'value'], currentValue);

				break;
		}

		if (options.required) state.requiredFields[options.id] = hasValue();

		/* private methods */
		function onChange(e) {
			const value = element.val();
			sendData(options.id, value);
			lastValue = value;
		}

		function onChangeDD(id, value) {
			if (value === lastValue) return;
			sendData(id, value);
			lastValue = value;
		}

		function sendData(code, value) {
			let data = {
				type: 'answer',
				itemId: item.id,
				fieldType: type,
				fieldId: group,
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft()
			};

			switch (choiceType) {
				case 'single':
					window.oasysChoiceGroups[code].value = value;
					data.fieldId = group;
					break;
				case 'multiple':
					window.oasysChoiceGroups[code].value = value;
					//continue working with a copy of the array from here on
					value = deepCopy(value);
					value = JSON.stringify(value);
					data.fieldId = group;
					break;
				case 'dropdown':
					window.oasysChoiceDropDowns[code].value = value;
					data.fieldId = options.id;
					break;
			}

			data.value = value;
			core_userEvent(data);

			switch (choiceType) {
				case 'single':
					for (let i in options.choices) {
						if (value !== options.choices[i].value && typeof (options.choices[i].link) !== 'undefined') {
							if (typeof (state.fieldInstances[options.choices[i].link]) !== 'undefined') {
								//clear linked textfield if radio button is not selected
								state.fieldInstances[options.choices[i].link].clear();
							}
						} else if (value === options.choices[i].value && typeof (options.choices[i].link) !== 'undefined') {
							//focus textfield if linked radio button is selected
							state.fieldInstances[options.choices[i].link].focus();
						}
					}
					if (options.proceedOnAnswer === true) {
						core_nextItem(true);
					}
					break;
				case 'multiple':
					value = JSON.parse(value);
					for (let i in options.choices) {
						if (!value.includes(options.choices[i].value) && typeof (options.choices[i].link) !== 'undefined') {
							if (typeof (state.fieldInstances[options.choices[i].link]) !== 'undefined') {
								//clear linked textfield if checkbox is not checked
								state.fieldInstances[options.choices[i].link].clear();
							}
						}
					}
					break;
			}
		}

		function hasValue() {
			if (choiceType === 'dropdown') {
				return validResponse(fetchFromObjPath(window, ['oasysChoiceDropDowns', code, 'value']), options);
			} else {
				return validResponse(fetchFromObjPath(window, ['oasysChoiceGroups', code, 'value']), options);
			}
		}

		return this;

	}

	function cleanUp() {
		for (let code in window.oasysChoiceDropDowns) {
			window.oasysChoiceDropDowns[code].handle.destroy();
		}
		window.oasysChoiceDropDowns = {};
		window.oasysChoiceGroups = {};
	}

	registerPlugin();

})(jQuery);