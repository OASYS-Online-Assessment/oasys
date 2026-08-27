<?php

	require_once __DIR__ . "/OasysParserPlugin.php";
	require_once __DIR__ . "/OasysParserPreProcessor.php";
	require_once __DIR__ . "/OasysIdGenerator.php";
	foreach (glob(__DIR__ . "/../../pluginPreProcessors/*.php") as $file) {
		include_once $file;
	}
	foreach (glob(__DIR__ . "/../../plugins/*.php") as $file) {
		include_once $file;
	}

	/** @noinspection HtmlUnknownAttribute */
	function parseSource(&$source, &$fields, &$options, &$errors, $itemId, $flags = []): void {
		if (is_array($options)) {
			$options = (object)$options;
		}
		$generatedFields = [];
		$processors = OasysParserPreProcessor::getProcessors();
		$plugins = OasysParserPlugin::getPlugins();
		$languages = [];
		if ($source === null || count($source) === 0) {
			return;
		}
		foreach ($source as $lng => $txt) {
			$languages[] = $lng;
			$generatedFields[$lng] = [];
			$labels = [];
			/* remove HTML comments */
			$txt = preg_replace("/<!--.*?-->/s", "", $txt);
			foreach ($processors as $processorName => $processor) {
				preParse($txt, $options, $errors, $processor, $lng, $itemId);
			}
			foreach ($plugins as $pluginType => $plugin) {
				try {
					rxGenericField($txt, $fields, $generatedFields[$lng], $labels, $options, $errors, $plugin, $lng, $itemId, $flags);
					$source[$lng] = $txt;
				} catch (Exception $e) {
					$errors[] = $e->getMessage();
				}
			}
		}

		//let's choose the first language as primary and copy all field data
		$primaryLanguage = array_shift($languages);
		if (isset($generatedFields[$primaryLanguage]) && is_array($generatedFields[$primaryLanguage])) {

			//add fields to list in order of appearance from the source
			$src = $source[$primaryLanguage];
			$pattern = "/<span class='oasysTag.*?' data-id='(.*?)'.*?<\/span>/";
			$match = true;
			while ($match) {
				$match = false;
				if (preg_match($pattern, $src, $captures) > 0) {
					$match = true;
					$id = hex2bin($captures[1]);
					unset($captures);
					$src = preg_replace($pattern, '', $src, 1);
					if (!isset($fields->$id)) {
						$fields->$id = (object)$generatedFields[$primaryLanguage][$id];
						unset($generatedFields[$primaryLanguage][$id]);
					}
				}
			}

			//add any possibly missing fields as last (though there should be nothing left --> expect the unexpected)
			if (count($generatedFields[$primaryLanguage]) > 0) {
				foreach ($generatedFields[$primaryLanguage] as $id => $fieldData) {
					$fields->$id = (object)$fieldData;
				}
			}
			linkLabels($source[$primaryLanguage], $labels);
		}

		//if there are more languages we'll now merge in localised data
		if (count($languages) > 0) {
			foreach ($languages as $lng) {
				foreach ($generatedFields[$lng] as $id => $fieldData) {
					$plugin = OasysParserPlugin::getPlugin($fieldData['type']);
					foreach ($fieldData as $k => $v) {
						if ($plugin->isLocalised($k)) {
							if (isset($fields->$id->$k) && is_array($fields->$id->$k)) {
								$fields->$id->$k = array_merge($fields->$id->$k, $v);
							}
						}
					}
				}
				linkLabels($source[$lng], $labels);
			}
		}
	}

	function preParse(&$txt, &$options, &$errors, &$processor, $lng, $itemId): void {
		$pattern = $processor->getPattern();
		$captureGroup = $processor->getCaptureGroup();
		$match = true;
		while ($match) {
			$match = false;
			if (preg_match($pattern, $txt, $captures) > 0) {
				$match = true;
				$attributes = $captures[$captureGroup];
				$replacement = $processor->parseSettings($attributes, $lng, $captures, $itemId);
				unset($captures);
				$txt = preg_replace($pattern, $replacement, $txt, 1);
			}
		}
	}

	function rxGenericField(&$txt, &$fields, &$fieldList, &$labels, &$options, &$errors, &$plugin, $lng, $itemId, $flags): void {
		$pattern = $plugin->getPattern();
		$captureGroup = $plugin->getCaptureGroup();
		$category = $plugin->getCategory();
		$match = true;
		$idGenerator = OasysIdGenerator::getInstance($fields, $itemId);
		$prefix = $plugin->getPrefix();
		while ($match) {
			$match = false;
			if (preg_match($pattern, $txt, $captures) > 0) {
				$match = true;
				$attributes = $captures[$captureGroup];
				$settings = $plugin->parseSettings($attributes, $lng, $captures, $itemId);
				unset($captures);
				if ($category === 'fields' || $category === 'static') {
					if (!isset($settings['id']) || $settings['id'] === '') {
						$settings['id'] = $idGenerator->getId($lng, $prefix);
					} else {
						if (isset($fields->{$settings['id']})) {
							$errors[] = "ERROR: field with id='{$settings['id']}' already exists!";
						}
					}
					$settings['code'] = bin2hex($settings['id']);
					$extraAttribs = [];
					$placeHolder = "";
					if (isset($flags['preserveSource']) && $flags['preserveSource'] === true) {
						$placeHolder = isset($settings['signature']) ?  "[[{$settings['signature']}]]" : "[[{$settings['id']}]]";
					}
					if (isset($settings['domAttributes'])) {
						foreach ($settings['domAttributes'] as $attribKey => $attribValue) {
							$extraAttribs[] = "$attribKey='$attribValue'";
						}
						$extraAttribString = implode(" ", $extraAttribs);
						$spanHTML = "<span class='oasysTag {$settings['type']}' data-id='{$settings['code']}' $extraAttribString>$placeHolder</span>";
						unset($settings['domAttributes']);
					} else {
						$spanHTML = "<span class='oasysTag {$settings['type']}' data-id='{$settings['code']}'>$placeHolder</span>";
					}
					$txt = preg_replace($pattern, $spanHTML, $txt, 1);
					$fieldList[$settings['id']] = $settings;
				} else if ($category === 'options') {
					$optKey = $plugin->getCategoryKey();
					$optMode = $plugin->getCategoryMode();
					if ($optMode === 'list') {
						if (property_exists($options, $optKey) && !is_array($options->$optKey)) {
							$errors[] = "ERROR: options->$optKey already exists and is not an array!";
						} else {
							if (!property_exists($options, $optKey)) {
								$options->$optKey = [];
							}
							$options->$optKey[] = $settings;
						}
					} else if ($optMode === 'value') {
						if (property_exists($options, $optKey)) {
							$errors[] = "ERROR: options->$optKey already exists, refusing to overwrite it!";
						} else {
							$options->$optKey = $settings;
						}					} else {
						$errors[] = "ERROR: invalid categoryMode ('$optMode')!'";
					}
					$txt = preg_replace($pattern, "", $txt, 1);
				} else if ($category === 'labels') {
					$autoId = $idGenerator->getId($lng, $prefix);
					$spanHTML = "<span class='oasysLabel' data-autoId='$autoId'>$2</span>";
					$settings['id'] = $autoId;
					$labels[] = $settings;
					$txt = preg_replace($pattern, $spanHTML, $txt, 1);
				} else {
					$errors[] = "ERROR: invalid category ('$category')!'";
					$txt = preg_replace($pattern, "", $txt, 1);
				}
			}
		}
	}

	function linkLabels(&$txt, &$labels): void {
		$labelCount = count($labels);
		if ($labelCount === 0) return;
		$pattern = "/<span class='oasysTag (\w+)\b.*?' (.+?)>/i";
		$match = true;
		$offset = 0;
		$labelCounter = 0;
		$newLink = true;
		$linkOffsets = [];
		while ($match && $labelCounter < $labelCount) {
			$link = bin2hex($labels[$labelCounter]['link']);
			$match = false;
			if ($link!== '' && $newLink === true) {
				//if link is specified in label restart searching from beginning unless group appeared already before
				$offset = $linkOffsets[$link] ?? 0;
			}
			if (preg_match($pattern, $txt, $captures, PREG_OFFSET_CAPTURE, $offset) > 0) {
				$match = true;
				$offset = intval($captures[0][1]) + strlen($captures[0][0]);
				$newLink = false;
				$pluginName = $captures[1][0];
				$plugin = OasysParserPlugin::getPlugin($pluginName);
				$attributes = $captures[2][0];
				$code = OasysParserPlugin::rxAttribute("/data-id='(\w*)'/i", $attributes, 1, false);
				$type = $plugin->getLabelType();
				$value = OasysParserPlugin::rxAttribute("/data-value='(.*?)'/i", $attributes, 1, false);
				if ($type === $labels[$labelCounter]['labelType'] || ($labels[$labelCounter]['labelType'] === '*' && ($type == 'RB' || $type == 'CB'))) {
					/*
						if the type matches the one for the first label in the list or if no type is set for the label
						it will apply to either radiobuttons or checkboxes (this is necessary to support legacy item
						format from OASYS v1, where labels are ONLY applicable for radiobuttons and checkboxes with no
						type separation on a first come first serve basis
					*/
					if ($link === '' || $link === $code) {
						/*
						 	if a link for the label is specified, we can only link it if the code matches, otherwise we
							will pass this field over looking for the right one.
						 */
						$labels[$labelCounter]['code'] = $code;
						$labels[$labelCounter]['value'] = $value;
						$labelCounter++;
						$newLink = true;
						$linkOffsets[$link] = $offset;
					}
				}
				unset($captures);
			}
		}
		foreach ($labels as $label) {
			if (isset($label['code']) && $label['code'] !== false) {
				$id = $label['id'];
				$code = $label['code'];
				$value = $label['value'];
				$pattern = "/<span class='oasysLabel' data-autoId='$id'>(.*?)<\/span>/i";
				if ($value || $value === "0") {
					$replacement = "<span class='oasysLabel' data-id='$code' data-value='$value'>$1</span>";
				} else {
					$replacement = "<span class='oasysLabel' data-id='$code'>$1</span>";
				}
				$txt = preg_replace($pattern, $replacement, $txt);
			}
		}
	}