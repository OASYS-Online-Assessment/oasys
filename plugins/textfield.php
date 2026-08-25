<?php namespace oasysTextfield;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysTextfield', '/\[@TF#?\b(.*?)@\]/i', 1);
	$plugin->setPrefix("tf_");
	$plugin->registerPreProcess(__NAMESPACE__ . '\preProcess');
	$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i']);
	$plugin->registerAttribute('pattern', ['pattern' => '/PATTERN\s*=\s*"(.*?)"/i']);
	$plugin->registerAttribute('correct', ['pattern' => '/CORRECT\s*=\s*"(.*?)"/i'], true);
	$plugin->registerAttribute('ignoreCase', ['pattern' => '/\b(IGNORECASE)\b/i', 'cast' => 'boolean']);
	$plugin->registerAttribute('width', ['pattern' => '/\bWIDTH\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => '200']);
	$plugin->registerAttribute('maxwidth', ['pattern' => '/\bMAXWIDTH\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => 'calc(100% - 25px)']);
	$plugin->registerAttribute('size', ['pattern' => '/SIZE\s*=\s*"?(\d+)"?/i', 'cast' => 'int', 'deprecated' => true]);
	$plugin->registerAttribute('prefill', ['pattern' => '/(PREFILL|VALUE)\s*=\s*"(.*?)"/i', 'captureGroup' => 2]);
	$plugin->registerAttribute('readOnly', ['pattern' => '/\b(READONLY)\b/i', 'cast' => 'boolean']);
	$plugin->registerAttribute('alignment', ['pattern' => '/ALIGN\s*=\s*"(.*?)"/i', 'validValues' => ['left', 'right', 'center'], 'defaultValue' => 'left']);
	$plugin->registerAttribute('placeholder', ['pattern' => '/PLACEHOLDER\s*=\s*"(.*?)"/i', 'localised' => true]);
	$plugin->registerAttribute('options', ['pattern' => '/OPTIONS?\s*=\s*"(.*?)"/i', 'process' => [$plugin, 'processOptions']]);
	$plugin->registerPostProcess(__NAMESPACE__ . '\cleanup');
	$plugin->setLabelType('TF');


	function preProcess(&$settings, OasysParserPlugin &$plugin, $lng, $itemId) {
		$plugin->setProperty('score', null);
	}

	function cleanup(&$settings) {
		/*
			OASYS v1 used the size attribute as count of characters (old style HTML input attribute without resorting to CSS)
			In this version we'll fly with CSS only and want px widths, so we multiply by 10 which roughly equals the original
			size considering the standard font & font size used in the old version.
			Note: The SIZE attribute will overwrite the WIDTH attribute if both are given.
		*/
		if (isset($settings['size'])) {
			$settings['width'] = 10 * $settings['size'];
		}

		if (isset($settings['correct'])) {
			$settings['processing'] = 'auto';
			$settings['correction'] = ['format' => VALUES_STRING, 'data' => explode("|", $settings['correct'])];
			$settings['correction']['ignoreCase'] = (bool)$settings['ignoreCase'];
		} else {
			$settings['processing'] = 'none';
		}

		$settings['signature'] = "TF {$settings['id']}";

		unset($settings['size']);
		unset($settings['ignoreCase']);
		unset($settings['correct']);
	}