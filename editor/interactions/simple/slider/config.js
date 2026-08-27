window.interactionConfigs.slider = {
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
		}]
	}, {
		"id": "values",
		"type": "propsDiv",
		"settings": {"label": "slider values", "grid": "2col"},
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
		}, {
			"id": "subDivisions",
			"type": "propsSpinnerRow",
			"settings": {"label": "sub divisions", "path": ["subDivisions"], "step": 1, "min": 1, "max": 1000, "useGrid": true}
		}]
	}, {
		"id": "info",
		"type": "propsLabel",
		"settings": {
			"label": "The slider will have %@ segments",
			"errorLabel": "The slider cannot be rendered",
			"paths": [["min"], ["max"], ["step"]],
			"converter": (min, max, step) => {
				if ((max <= min) || (max - min) % step !== 0) {
					return false;
				} else {
					return (Math.floor((max - min) / step));
				}
			}
		}
	}, {
		"id": "layout",
		"type": "propsDiv",
		"settings": {"label": "layout"},
		"children": [{
			"id": "showSteps",
			"type": "propsSwitchRow",
			"settings": {"label": "show steps", "path": ["showSteps"]}
		}, {
			"type": "propsToggleDiv",
			"settings": {"path": ["showSteps"], "conditions": [true]},
			"children": [{
				"id": "showValues",
				"type": "propsSwitchRow",
				"settings": {"label": "show value of each step", "path": ["showAllValues"]}
			}]
		}, {
			"id": "showCurrentValue",
			"type": "propsSwitchRow",
			"settings": {"label": "show value over handle", "path": ["showValue"]}
		}]
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