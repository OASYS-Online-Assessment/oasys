<?php namespace oasysDropDown;

use OasysParserPlugin;

$plugin = new OasysParserPlugin('oasysDropDown', '/\[@DD#?\b(.*?)@?\]/i', 1);
$plugin->setPrefix("dd_");
$plugin->registerPreProcess(__NAMESPACE__ . '\preProcess');
$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i']);
$plugin->registerAttribute('readOnly', ['pattern' => '/(READONLY)/i', 'cast' => 'boolean']);
$plugin->registerAttribute('legacyList', ['pattern' => '/OPTIONS\s*=\s*"(.*?)"/i', 'process' => __NAMESPACE__ . '\populateList', 'localised' => true]);
$plugin->registerAttribute('options', ['pattern' => '/OPTION\s*=\s*"(.*?)"/i', 'process' => [$plugin, 'processOptions']]);
$plugin->registerAttribute('width', ['pattern' => '/WIDTH\s*=\s*"(\d+)"/i', 'cast' => 'int'], true);
$plugin->registerAttribute('values', ['localised' => true]); //has no pattern, gets data from populate list function

function preProcess(&$settings, OasysParserPlugin &$plugin, $lng, $itemId) {
	$plugin->setProperty('score', null);
}

function populateList(&$settings, $key, $lng) {
	$choiceString = $settings[$key][$lng];
	unset($settings[$key]);
	$choices = explode("|", $choiceString);
	if ($choices[0] !== '') {
		array_unshift($choices, '');
	}
	$values = [];
	$settings['processing'] = 'none';
	foreach ($choices as $k => $lbl) {
		if (preg_match("/\*$/", $lbl)) {
			$lbl = preg_replace("/\*$/", "", $lbl);
			$settings['processing'] = 'auto';
			$settings['correction'] = ['format' => VALUES_STRING, 'data' => (string)$k, 'noreply' => '0'];
		}
		$values[] = ['value' => (string)$k, 'label' => $lbl];
	}
	$settings['values'][$lng] = $values;

	$settings['signature'] = "DD {$settings['id']}";
}
