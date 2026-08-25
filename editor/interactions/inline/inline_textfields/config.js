window.interactionConfigs.inline_textfields = {
	"editor": [{
		"id": "id",
		"type": "propsTextField",
		"settings": {"label": "interaction id", "path": ["id"]}
	}, {
		"id": "options",
		"type": "propsDiv",
		"settings": {"label": "options"},
		"children": [{
			"id": "mandatory",
			"type": "propsSwitchRow",
			"settings": {"label": "mandatory field", "path": ["mandatory"]}
		}]
	}, {
		"id": "size",
		"type": "propsDropDown",
		"settings": {
			"label": "textfield size",
			"path": ["size"],
			"options": [{"value": "s", "label": "small"}, {"value": "m", "label": "medium"}, {"value": "l", "label": "large"}, {"value": "xl", "label": "extra large"}, {"value": "custom", "label": "custom"}]
		}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["size"], "conditions": ["custom"]},
		"children": [{
			"id": "width",
			"type": "propsTextField",
			"settings": {"label": "custom width (with CSS units)", "path": ["width"]}
		}]
	}, {
		"id": "filter",
		"type": "propsDropDown",
		"settings": {
			"label": "input filter",
			"path": ["filter"],
			"options": [{"value": "none", "label": "none"}, {
				"value": "letter_single",
				"label": "a single letter"
			}, {"value": "num_digit", "label": "numbers (single digit)"}, {
				"value": "num_entire_pos",
				"label": "numbers (integer, positive)"
			}, {"value": "num_entire", "label": "numbers (integer)"}, {
				"value": "num_decimal_pos",
				"label": "numbers (decimal, positive)"
			}, {"value": "num_decimal", "label": "numbers (decimal)"}, {
				"value": "date_DDMMYYYY",
				"label": "date (DD.MM.YYYY)"
			}, {"value": "custom", "label": "custom"}]
		}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["filter"], "conditions": ["custom"]},
		"children": [{
			"id": "pattern",
			"type": "propsTextField",
			"settings": {"label": "custom pattern (regex)", "path": ["pattern"]}
		}]
	}],
	"script": [{
		"id": "visibility",
		"type": "propsTextField",
		"settings": {"label": "visibility condition", "path": ["visibility"]}
	}],
	"scoring": [{
		"type": "propsToggleDiv",
		"settings": {"path": ["processing"], "conditions": ["manual"]},
		"children": [{
			"id": "manualScore",
			"type": "propsDiv",
			"settings": {"label": "scoring"},
			"children": [{
				"id": "scoreMax",
				"type": "propsSpinnerRow",
				"settings": {
					"label": "maximum points",
					"path": ["score", "maximum"],
					"step": 0.5,
					"min": 0.5,
					"max": 50
				}
			}]
		}]
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["processing"], "conditions": ["auto"]},
		"children": [{
			"id": "autoScore",
			"type": "propsDiv",
			"settings": {"label": "scoring", "grid": "2col"},
			"children": [{
				"id": "scoreInitial",
				"type": "propsSpinnerRow",
				"settings": {
					"label": "initial points",
					"path": ["score", "initial"],
					"useGrid": true,
					"step": 0.5
				}
			}, {
				"id": "scoreCorrect",
				"type": "propsSpinnerRow",
				"settings": {
					"label": "correct answer",
					"path": ["score", "correct"],
					"useGrid": true,
					"step": 0.5
				}
			}, {
				"id": "scoreWrong",
				"type": "propsSpinnerRow",
				"settings": {"label": "wrong answer", "path": ["score", "wrong"], "useGrid": true, "step": 0.5}
			}, {
				"id": "scoreMissing",
				"type": "propsSpinnerRow",
				"settings": {
					"label": "missing answer",
					"path": ["score", "missing"],
					"useGrid": true,
					"step": 0.5
				}
			}]
		}]
	}]
};