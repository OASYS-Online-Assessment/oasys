window.interactionConfigs.choice = {
	"editor": [
		{
			"id": "id",
			"type": "propsTextField",
			"settings": {
				"label": "interaction id",
				"path": [
					"id"
				]
			}
		},
		{
			"id": "options",
			"type": "propsDiv",
			"settings": {
				"label": "options"
			},
			"children": [
				{
					"id": "mandatory",
					"type": "propsSwitchRow",
					"settings": {
						"label": "mandatory field",
						"path": [
							"mandatory"
						]
					}
				},
				{
					"type": "propsToggleDiv",
					"settings": {
						"path": [
							"choiceType"
						],
						"conditions": [
							"single"
						]
					},
					"children": [
						{
							"type": "propsToggleDiv",
							"settings": {
								"path": [
									"textfields",
									"single"
								],
								"conditions": [
									false
								]
							},
							"children": [
								{
									"id": "proceedOnAnswer",
									"type": "propsSwitchRow",
									"settings": {
										"label": "go to next page when answered",
										"path": [
											"proceedOnAnswer"
										]
									}
								}
							]
						}
					]
				}
			]
		},
		{
			"id": "choiceType",
			"type": "propsDropDown",
			"settings": {
				"label": "choice type",
				"path": [
					"choiceType"
				],
				"options": [
					{
						"value": "single",
						"label": "single choice"
					},
					{
						"value": "multiple",
						"label": "multiple choices"
					},
					{
						"value": "dropdown",
						"label": "dropdown field"
					}
				]
			}
		},
		{
			"type": "propsToggleDiv",
			"settings": {
				"path": [
					"choiceType"
				],
				"conditions": [
					"multiple"
				]
			},
			"children": [
				{
					"id": "inputControl",
					"type": "propsDiv",
					"settings": {
						"label": "input control"
					},
					"children": [
						{
							"id": "limit",
							"type": "propsCheckboxRow",
							"settings": {
								"label": "limit number of answers",
								"path": [
									"limit"
								]
							}
						},
						{
							"type": "propsToggleDiv",
							"settings": {
								"path": [
									"limit"
								],
								"conditions": [
									true
								]
							},
							"children": [
								{
									"type": "propsToggleDiv",
									"settings": {
										"path": [
											"mandatory"
										],
										"conditions": [
											true
										]
									},
									"children": [
										{
											"id": "minAnswers",
											"type": "propsSpinnerRow",
											"settings": {
												"label": "required number of answers",
												"path": [
													"limit_min"
												],
												"step": 1,
												"min": 0
											}
										}
									]
								},
								{
									"id": "maxAnswers",
									"type": "propsSpinnerRow",
									"settings": {
										"label": "maximum number of answers",
										"path": [
											"limit_max"
										],
										"step": 1,
										"min": 1
									}
								}
							]
						}
					]
				}
			]
		},
		{
			"id": "order",
			"type": "propsDropDown",
			"settings": {
				"label": "choice order",
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
		},
		{
			"type": "propsToggleDiv",
			"settings": {
				"path": [
					"order"
				],
				"conditions": [
					"manual"
				]
			},
			"children": [
				{
					"type": "propsToggleDiv",
					"settings": {
						"path": [
							"choiceType"
						],
						"conditions": [
							"single"
						]
					},
					"children": [
						{
							"id": "singleTextfieldGroup",
							"type": "propsDiv",
							"settings": {
								"label": "custom answer"
							},
							"children": [
								{
									"id": "singleTextfield",
									"type": "propsCheckboxRow",
									"settings": {
										"label": "add a textfield to last choice",
										"path": [
											"textfields",
											"single"
										]
									}
								}
							]
						}
					]
				},
				{
					"type": "propsToggleDiv",
					"settings": {
						"path": [
							"choiceType"
						],
						"conditions": [
							"multiple"
						]
					},
					"children": [
						{
							"id": "multipleTextFieldsGroup",
							"type": "propsDiv",
							"settings": {
								"label": "custom answers"
							},
							"children": [
								{
									"id": "multipleTextfields",
									"type": "propsSpinnerRow",
									"settings": {
										"label": "add textfields to this many choices",
										"path": [
											"textfields",
											"multiple"
										],
										"step": 1,
										"min": 0,
										"max": 3
									}
								}
							]
						}
					]
				},
				{
					"type": "propsToggleDiv",
					"settings": {
						"logic": [
							{
								"path": [
									"textfields",
									"multiple"
								],
								"operator": ">",
								"value": 0
							},
							{
								"path": [
									"textfields",
									"single"
								],
								"operator": "===",
								"value": true
							}
						],
						"logicOperator": "||"
					},
					"children": [
						{
							"id": "size",
							"type": "propsDropDown",
							"settings": {
								"label": "textfield size",
								"path": [
									"size"
								],
								"options": [
									{
										"value": "s",
										"label": "small"
									},
									{
										"value": "m",
										"label": "medium"
									},
									{
										"value": "l",
										"label": "large"
									},
									{
										"value": "xl",
										"label": "extra large"
									},
									{
										"value": "custom",
										"label": "custom"
									}
								]
							}
						},
						{
							"type": "propsToggleDiv",
							"settings": {
								"path": [
									"size"
								],
								"conditions": [
									"custom"
								]
							},
							"children": [
								{
									"id": "width",
									"type": "propsTextField",
									"settings": {
										"label": "custom width (with CSS units)",
										"path": [
											"width"
										]
									}
								}
							]
						}
					]
				}
			]
		},
		{
			"type": "propsToggleDiv",
			"settings": {
				"path": [
					"choiceType"
				],
				"conditions": [
					"single",
					"multiple"
				]
			},
			"children": [
				{
					"id": "layout",
					"type": "propsDropDown",
					"settings": {
						"label": "layout",
						"path": [
							"layout"
						],
						"options": [
							{
								"value": "vertical",
								"label": "vertical"
							},
							{
								"value": "horizontal",
								"label": "horizontal"
							},
							{
								"value": "twocolumns",
								"label": "in two columns"
							}
						]
					}
				},
				{
					"id": "gapProps",
					"type": "propsDiv",
					"settings": {
						"label": "gap between choices",
						"grid": "2col"
					},
					"children": [
						{
							"id": "rowGap",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "between rows",
								"path": [
									"rowgap"
								],
								"useGrid": true,
								"step": 1,
								"min": 0,
								"max": 50,
								"units": "px"
							}
						}, {
							"id": "colGap",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "between columns",
								"path": [
									"colgap"
								],
								"useGrid": true,
								"step": 5,
								"min": 0,
								"max": 200,
								"units": "px"
							}
						}
					]
				},
				{
					"id": "labelPosition",
					"type": "propsDropDown",
					"settings": {
						"label": "label position",
						"path": [
							"labelPosition"
						],
						"options": [
							{
								"value": "right",
								"label": "right"
							},
							{
								"value": "above",
								"label": "above"
							},
							{
								"value": "below",
								"label": "below"
							},
							{
								"value": "left",
								"label": "left"
							},
							{
								"value": "only",
								"label": "show only label"
							}
						]
					}
				}
			]
		},
		{
			"id": "alignment",
			"type": "propsDropDown",
			"settings": {
				"label": "alignment",
				"path": [
					"alignment"
				],
				"options": [
					{
						"value": "left",
						"label": "left"
					},
					{
						"value": "center",
						"label": "center"
					},
					{
						"value": "right",
						"label": "right"
					}
				]
			}
		}
	],
	"script": [
		{
			"id": "export",
			"type": "propsTextField",
			"settings": {
				"label": "export as global variable",
				"path": [
					"export"
				]
			}
		},
		{
			"id": "visibility",
			"type": "propsTextField",
			"settings": {
				"label": "visibility condition",
				"path": [
					"visibility"
				]
			}
		}
	], "scoring": [
		{
			"type": "propsToggleDiv",
			"settings": {
				"path": [
					"processing"
				],
				"conditions": [
					"manual"
				]
			},
			"children": [
				{
					"id": "manualScore",
					"type": "propsDiv",
					"settings": {
						"label": "scoring"
					},
					"children": [
						{
							"id": "scoreMax",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "maximum points",
								"path": [
									"score",
									"maximum"
								],
								"step": 0.5,
								"min": 0.5,
								"max": 50
							}
						}
					]
				}
			]
		},
		{
			"type": "propsToggleDiv",
			"settings": {
				"path": [
					"processing"
				],
				"conditions": [
					"auto"
				]
			},
			"children": [
				{
					"id": "autoScore",
					"type": "propsDiv",
					"settings": {
						"label": "scoring",
						"grid": "2col"
					},
					"children": [
						{
							"id": "scoreInitial",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "initial points",
								"path": [
									"score",
									"initial"
								],
								"useGrid": true,
								"step": 0.5
							}
						},
						{
							"id": "scoreCorrect",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "correct answer",
								"path": [
									"score",
									"correct"
								],
								"useGrid": true,
								"step": 0.5
							}
						},
						{
							"id": "scoreWrong",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "wrong answer",
								"path": [
									"score",
									"wrong"
								],
								"useGrid": true,
								"step": 0.5
							}
						},
						{
							"id": "scoreMissing",
							"type": "propsSpinnerRow",
							"settings": {
								"label": "missing answer",
								"path": [
									"score",
									"missing"
								],
								"useGrid": true,
								"step": 0.5
							}
						}
					]
				}
			]
		}
	]
};
