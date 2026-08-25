window.interactionConfigs.textarea = {
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
		"id": "sanitization",
		"type": "propsDiv",
		"settings": {"label": "sanitize input", "grid": "2col"},
		"children": [{
			"id": "limit",
			"type": "propsSpinnerRow",
			"settings": {"label": "character limit", "path": ["limit"], "step": 1, "min": 1, "max": 16383, "useGrid": true}
		}]
	}, {
		"id": "size",
		"type": "propsDropDown",
		"settings": {
			"label": "textarea size",
			"path": ["size"],
			"options": [{"value": "s", "label": "small"}, {"value": "m", "label": "medium"}, {
				"value": "l",
				"label": "large"
			}, {"value": "xl", "label": "extra large"}, {"value": "custom", "label": "custom"}]
		}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["size"], "conditions": ["custom"]},
		"children": [{
			"id": "width",
			"type": "propsTextField",
			"settings": {"label": "custom width (with CSS units)", "path": ["width"]}
		}, {
			"id": "height",
			"type": "propsTextField",
			"settings": {"label": "custom height (with CSS units)", "path": ["height"]}
		}]
	}, {
		"id": "resize",
		"type": "propsDropDown",
		"settings": {
			"label": "resizability",
			"path": ["resize"],
			"options": [{"value": "none", "label": "fixed size"}, {
				"value": "horizontal",
				"label": "horizontal"
			}, {"value": "vertical", "label": "vertical"}, {"value": "both", "label": "both"}]
		}
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
	}]
};