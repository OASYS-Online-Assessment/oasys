window.interactionConfigs.button = {
	"editor": [{
		"id": "align",
		"type": "propsDropDown",
		"settings": {
			"label": "text alignment",
			"path": ["align"],
			"options": [{"value": "left", "label": "left"}, {
				"value": "center",
				"label": "center"
			}, {"value": "right", "label": "right"}]
		}
	}, {
		"id": "action",
		"type": "propsDropDown",
		"settings": {
			"label": "action",
			"path": ["action"],
			"options": [
				{"value": "endTest", "label": "end test"},
				{"value": "gotoLogin", "label": "return to login screen"},
				{"value": "nextPage", "label": "go to next page"},
				{"value": "previousPage", "label": "go to previous page"},
				{"value": "switchLanguage", "label": "switch language"},
				{"value": "showLegalText", "label": "popup legal text"}
			]
		}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["action"], "conditions": ["endTest"]},
		"children": [{
			"id": "disableOnTestIncomplete",
			"type": "propsSwitchRow",
			"settings": {"label": "disable button when test is incomplete", "path": ["disableOnTestIncomplete"]}
		}]
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["action"], "conditions": ["switchLanguage"]},
		"children": [{
			"id": "language",
			"type": "propsDropDown",
			"settings": {"label": "language", "path": ["language"], "optionsObject": window.languages}
		}]
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["action"], "conditions": ["nextPage", "previousPage"]},
		"children": [{
			"id": "ignoreNavigationConstraints",
			"type": "propsSwitchRow",
			"settings": {"label": "ignore navigation constraints", "path": ["ignoreNavigationConstraints"]}
		}]
	}],
	"script": [{
		"id": "visibility",
		"type": "propsTextField",
		"settings": {"label": "visibility condition", "path": ["visibility"]}
	}]
};