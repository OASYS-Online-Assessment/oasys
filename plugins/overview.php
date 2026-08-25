<?php

	namespace oasysOverview;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysOverview', '/\[@OVERVIEW\b(.*?)@?\]/i');
	$plugin->registerAttribute('overviewType', ['pattern' => '/TYPE\s*=\s*"(checkmark|value|list|progress)"/i', 'defaultValue' => 'checkmark']);
	$plugin->registerAttribute('source', ['pattern' => '/SOURCE\s*=\s*"(.*?)"/i', 'defaultValue' => '']);
	$plugin->registerAttribute('colour', ['pattern' => '/(?:COLOUR|COLOR)\s*=\s*"(.*?)"/i', 'defaultValue' => '#000000']);
	$plugin->registerAttribute('min', ['pattern' => '/\bMIN\s*=\s*"(\-?\d+\.?\d*)"/i', 'defaultValue' => '0', 'cast' => 'float']);
	$plugin->registerAttribute('max', ['pattern' => '/\bMAX\s*=\s*"(\-?\d+\.?\d*)"/i', 'defaultValue' => '5', 'cast' => 'float']);
	$plugin->registerAttribute('width', ['pattern' => '/\bWIDTH\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => '50']);
	$plugin->registerAttribute('height', ['pattern' => '/\bHEIGHT\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => '0.5em']);
	$plugin->registerAttribute('fontsize', ['pattern' => '/\bFONTSIZE\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => '1em']);
	$plugin->registerAttribute('list', ['pattern' => '/LIST\s*=\s*"(.*?)"/i', 'localised' => true], true);
	$plugin->registerAttribute('hideLabel', ['pattern' => '/(\bHIDELABEL\b)/i', 'cast' => 'boolean']);
	$plugin->setPrefix("overview_");
	$plugin->setCategory('static');
	$plugin->registerPostProcess(__NAMESPACE__ . '\postProcess');


	function postProcess(&$settings, &$plugin, $lng, $itemId) {
		if (isset($settings['list'])) {
			$list = $settings['list'][$lng];
			$list = explode("|", $list);
			$newList = [];
			$counter = $settings['min'];
			foreach ($list as $pair) {
				$kv = preg_split("/(?<!\\\\)\s*:\s*/", $pair, 2);
				if (count($kv) === 1) {
					$newList[$counter++] = $kv[0];
				} elseif (count($kv) === 2) {
					$newList[$kv[0]] = $kv[1];
				}
			}
			$settings['list'][$lng] = $newList;
		}
	}
