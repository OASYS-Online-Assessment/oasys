window.interactionConfigs.slikert = {
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
		}, {
			"id": "noreply",
			"type": "propsSwitchRow",
			"settings": {"label": "show \"no reply\" option", "path": ["noReply"]}
		}, {
			"id": "tooltip",
			"type": "propsSwitchRow",
			"settings": {"label": "show tooltip", "path": ["tooltip"]}
		}]
	}, {
		"id": "values",
		"type": "propsDiv",
		"settings": {"label": "slikert values", "grid": "2col"},
		"children": [{
			"id": "min",
			"type": "propsSpinnerRow",
			"settings": {"label": "minimum value", "path": ["min"], "step": 1, "useGrid": true}
		}, {
			"id": "max",
			"type": "propsSpinnerRow",
			"settings": {"label": "maximum value", "path": ["max"], "step": 1, "useGrid": true}
		}, {
			"id": "step",
			"type": "propsSpinnerRow",
			"settings": {"label": "values interval", "path": ["step"], "step": 1, "min": 1, "useGrid": true}
		}]
	}, {
		"id": "info",
		"type": "propsLabel",
		"settings": {
			"label": "The slikert will have %@ choices",
			"errorLabel": "The slikert cannot be rendered",
			"paths": [["min"], ["max"], ["step"]],
			"converter": (min, max, step) => {
				if ((max <= min) || (max - min) % step !== 0) {
					return false;
				} else {
					let count = (Math.floor((max - min) / step) + 1);
					return count > 10 ? false : count;
				}
			}
		}
	}, {
		"id": "origin",
		"type": "propsDropDown",
		"settings": {
			"label": "slikert origin",
			"path": ["origin"],
			"options": [
				{"value": "L", "label": "left"},
				{"value": "C", "label": "centre"},
				{"value": "R", "label": "right"},
				{"value": "none", "label": "none"}
			]
		}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["origin"], "conditions": ["L", "R", "C"]},
		"children": [{
			"id": "originInfo",
			"type": "propsLabel",
			"settings": {"label": "The highlight will be drawn from the origin."}
		}, {
			"id": "bicolour",
			"type": "propsSwitchRow",
			"settings": {
				"label": "enable 2 colours for the highlight",
				"marginBottom": "10px",
				"path": ["bicolour"]
			}
		}, {
			"type": "propsToggleDiv",
			"settings": {"path": ["bicolour"], "conditions": [true]},
			"children": [{
				"id": "bicolourInfo",
				"type": "propsLabel",
				"settings": {"label": "The highlight will be drawn in red on the left side of the origin and in green on the right side of the origin."}
			}]
		}]
	}, {
		"id": "labelPosition",
		"type": "propsDropDown",
		"settings": {
			"label": "position of labels",
			"path": ["labelPosition"],
			"options": [
				{"value": "none", "label": "none"},
				{"value": "outside", "label": "on both sides"},
				{"value": "below", "label": "below (left, centre, right)"}
			]
		}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["labelPosition"], "conditions": ["outside"]},
		"children": [
			{
				"id": "labelWidth",
				"settings": {
					"label": "width of labels",
					"max": 300,
					"min": 20,
					"path": [
						"labelWidth"
					],
					"step": 10,
					"units": "px"
				},
				"type": "propsSpinnerRow"
			}
		]

	}],
	"script": [{
		"id": "export",
		"type": "propsTextField",
		"settings": {
			"label": "export as global variable",
			"path": ["export"]
		}
	}, {
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