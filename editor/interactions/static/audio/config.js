window.interactionConfigs.audio = {
	"editor": [{
		"id": "id",
		"type": "propsTextField",
		"settings": {"label": "interaction id", "path": ["id"]}
	}, {
		"id": "limitPlayCount",
		"type": "propsSwitchRow",
		"settings": {"label": "limit play count", "path": ["limitPlayCount"]}
	}, {
		"type": "propsToggleDiv",
		"settings": {"path": ["limitPlayCount"], "conditions": [true]},
		"children": [{
			"id": "maxPlayCount",
			"type": "propsSpinnerRow",
			"settings": {"label": "maximum play count", "path": ["maxPlayCount"], "step": 1, "useGrid": false, "min": 1,  "addClass":"avCounterSpinner"}
		}, {
			"id": "noPlaceHolder",
			"type": "propsSwitchRow",
			"settings": {"label": "don't use placeholder", "path": ["noPlaceHolder"],"useGrid": false}
		}]
	}, {
		"id": "disableControls",
		"type": "propsSwitchRow",
		"settings": {"label": "disable controls", "path": ["disableControls"]}
	}, {
		"id": "autoPlay",
		"type": "propsSwitchRow",
		"settings": {"label": "play automatically", "path": ["autoPlay"]}
	}, {
		"id": "required",
		"type": "propsSwitchRow",
		"settings": {"label": "must be played", "path": ["required"]}
	}, {
		"id": "navigateOnEnd",
		"type": "propsSwitchRow",
		"settings": {"label": "proceed after playing", "path": ["navigateOnEnd"]}
	}, {
		"id": "hidden",
		"type": "propsSwitchRow",
		"settings": {"label": "hide player", "path": ["hidden"]}
	}],
	"script": [{
		"id": "visibility",
		"type": "propsTextField",
		"settings": {"label": "visibility condition", "path": ["visibility"]}
	}]
};