window.interactionConfigs.conceptmap = {
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
	}],
	"scoring": [{
		"id": "scoreMax",
		"type": "propsSpinnerRow",
		"settings": {"label": "maximum points", "path": ["score", "maximum"], "step": 0.5}
	}]
};