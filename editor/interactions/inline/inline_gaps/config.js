window.interactionConfigs.inline_gaps = {
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
		"id": "order",
		"type": "propsDropDown",
		"settings": {
			"label": "answers order",
			"path": [
				"order"
			],
			"options": [
				{
					"value": "manual",
					"label": "manual"
				},
				{
					"value": "alphabet",
					"label": "alphabet"
				},
				{
					"value": "random",
					"label": "random"
				}
			]
		}
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