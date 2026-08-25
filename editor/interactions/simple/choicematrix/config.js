window.interactionConfigs.choicematrix = {
	"editor": [
		{
			"id": "id",
			"settings": {
				"label": "interaction id",
				"path": [
					"id"
				]
			},
			"type": "propsTextField"
		},
		{
			"children": [
				{
					"id": "mandatory",
					"settings": {
						"label": "mandatory field",
						"path": [
							"mandatory"
						]
					},
					"type": "propsSwitchRow"
				},
				{
					"id": "shuffle",
					"settings": {
						"label": "shuffle rows",
						"path": [
							"shuffle"
						]
					},
					"type": "propsSwitchRow"
				}
			],
			"id": "options",
			"settings": {
				"label": "options"
			},
			"type": "propsDiv"
		},
		{
			"id": "choiceType",
			"settings": {
				"label": "choice type",
				"options": [
					{
						"label": "single choice",
						"value": "single"
					},
					{
						"label": "multiple choices",
						"value": "multiple"
					}
				],
				"path": [
					"choiceType"
				]
			},
			"type": "propsDropDown"
		},
		{
			"children": [
				{
					"children": [
						{
							"id": "limit",
							"settings": {
								"label": "limit number of answers",
								"path": [
									"limit"
								]
							},
							"type": "propsCheckboxRow"
						},
						{
							"children": [
								{
									"id": "minAnswers",
									"settings": {
										"label": "required number of answers",
										"min": 0,
										"path": [
											"limit_min"
										],
										"step": 1,
										"useGrid": true
									},
									"type": "propsSpinnerRow"
								},
								{
									"id": "maxAnswers",
									"settings": {
										"label": "maximum number of answers",
										"min": 1,
										"path": [
											"limit_max"
										],
										"step": 1,
										"useGrid": true
									},
									"type": "propsSpinnerRow"
								}
							],
							"settings": {
								"conditions": [
									true
								],
								"grid": "2col",
								"path": [
									"limit"
								]
							},
							"type": "propsToggleDiv"
						}
					],
					"id": "inputControl",
					"settings": {
						"label": "input control"
					},
					"type": "propsDiv"
				}
			],
			"settings": {
				"conditions": [
					"multiple"
				],
				"path": [
					"choiceType"
				]
			},
			"type": "propsToggleDiv"
		},
		{
			"children": [
				{
					"id": "fieldWidth",
					"settings": {
						"label": "width of fields",
						"max": 200,
						"min": 20,
						"path": [
							"fieldWidth"
						],
						"step": 10,
						"units": "px",
						"useGrid": true
					},
					"type": "propsSpinnerRow"
				},
				{
					"id": "labelWidth",
					"settings": {
						"label": "min. width of labels",
						"max": 1000,
						"min": 20,
						"path": [
							"labelWidth"
						],
						"step": 10,
						"units": "px",
						"useGrid": true
					},
					"type": "propsSpinnerRow"
				}
			],
			"id": "layoutGroup",
			"settings": {
				"grid": "2col",
				"label": "layout"
			},
			"type": "propsDiv"
		},
		{
			"id": "layout",
			"settings": {
				"label": "layout type",
				"options": [
					{
						"label": "labels in place",
						"value": "inplace"
					},
					{
						"label": "labels in legend",
						"value": "legend"
					}
				],
				"path": [
					"layout"
				]
			},
			"type": "propsDropDown"
		}
	],
	"script": [
		{
			"id": "visibility",
			"settings": {
				"label": "visibility condition",
				"path": [
					"visibility"
				]
			},
			"type": "propsTextField"
		}
	],
	"scoring": [
		{
			"children": [
				{
					"children": [
						{
							"id": "scoreMax",
							"settings": {
								"label": "maximum points",
								"path": [
									"score",
									"maximum"
								],
								"step": 0.5,
								"min": 0.5,
								"max": 50
							},
							"type": "propsSpinnerRow"
						}
					],
					"id": "manualScore",
					"settings": {
						"label": "scoring"
					},
					"type": "propsDiv"
				}
			],
			"settings": {
				"conditions": [
					"manual"
				],
				"path": [
					"processing"
				]
			},
			"type": "propsToggleDiv"
		},
		{
			"children": [
				{
					"children": [
						{
							"id": "scoreInitial",
							"settings": {
								"label": "initial points",
								"path": [
									"score",
									"initial"
								],
								"step": 0.5,
								"useGrid": true
							},
							"type": "propsSpinnerRow"
						},
						{
							"id": "scoreCorrect",
							"settings": {
								"label": "correct answer",
								"path": [
									"score",
									"correct"
								],
								"step": 0.5,
								"useGrid": true
							},
							"type": "propsSpinnerRow"
						},
						{
							"id": "scoreWrong",
							"settings": {
								"label": "wrong answer",
								"path": [
									"score",
									"wrong"
								],
								"step": 0.5,
								"useGrid": true
							},
							"type": "propsSpinnerRow"
						},
						{
							"id": "scoreMissing",
							"settings": {
								"label": "missing answer",
								"path": [
									"score",
									"missing"
								],
								"step": 0.5,
								"useGrid": true
							},
							"type": "propsSpinnerRow"
						}
					],
					"id": "autoScore",
					"settings": {
						"grid": "2col",
						"label": "scoring"
					},
					"type": "propsDiv"
				},
				{
					"id": "info",
					"settings": {
						"label": "Note: the score is applied to every row individually"
					},
					"type": "propsLabel"
				}
			],
			"settings": {
				"conditions": [
					"auto"
				],
				"path": [
					"processing"
				]
			},
			"type": "propsToggleDiv"
		}
	]
};