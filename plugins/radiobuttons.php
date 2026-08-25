<?php namespace oasysRadioButton;

use OasysParserPlugin;

$plugin = new OasysParserPlugin('oasysRadioButton', '/\[@RB#?\b([\*]?)(.*?)@?\]/i', 2, ['flag' => 1]);
$plugin->setPrefix("rb_");
$plugin->registerPreProcess(__NAMESPACE__ . '\preProcess');
$plugin->registerAttribute('id', ['pattern' => '/GROUP\s*=\s*"(.*?)"/i']);
$plugin->registerAttribute('value', ['pattern' => '/(ID|VALUE)\s*=\s*"(.*?)"/i', 'captureGroup' => 2, 'encode' => 'hex', 'domAttributeName' => 'data-value']);
$plugin->registerAttribute('height', ['pattern' => '/HEIGHT\s*=\s*"(\d+)"/i', 'cast' => 'int'], true);
//$plugin->registerAttribute('readOnly', ['pattern' => '/(\bREADONLY\b)/i', 'cast' => 'boolean']);
$plugin->registerAttribute('correct', ['pattern' => '/(\bCORRECT\b)/i', 'cast' => 'boolean']);
$plugin->registerAttribute('noreply', ['pattern' => '/(\bNOREPLY\b)/i', 'cast' => 'boolean']);
$plugin->registerAttribute('newGroup', ['pattern' => '/(\bNG\b)/i', 'cast' => 'boolean']);
$plugin->registerAttribute('options', ['pattern' => '/OPTIONS?\s*=\s*"(.*?)"/i', 'process' => [$plugin, 'processOptions']]);
$plugin->registerPostProcess(__NAMESPACE__ . '\postProcess');
$plugin->setProperty('previousItemId', -1); //serves to know when a new item starts so that counters can be reset
$plugin->setProperty('previousLanguage', ""); //serves to know when a new item version starts so that counters can be reset
$plugin->setLabelType('RB');

/**
 * @param $settings
 * @param $plugin OasysParserPlugin
 * @param $lng
 * @param $itemId
 */

function preProcess(&$settings, OasysParserPlugin &$plugin, $lng, $itemId) {
	// if we are processing a new page or a new language version of the same page
	if ($plugin->getProperty('previousItemId') !== $itemId || $plugin->getProperty('previousLanguage') !== $lng) {
		$plugin->setProperty('autoGroupCounter', 1); //a simple counter for keeping track of groups if no name is provided
		$plugin->setProperty('autoValueCounter', 1); //a simple counter for keeping track of values if none is provided
		$plugin->setProperty('lastGroup', false); //is set when the first named group is encountered
		$plugin->setProperty('defaultHeight', 20); //preset the default height to 20 pixels
		$plugin->setProperty('requiredGroup', true); //saves 'required' setting for the whole group
		$plugin->setProperty('newItem', true); //this is cleared whith the first group, it prevents unnecessary counter increases
		$plugin->setProperty('previousItemId', $itemId);
		$plugin->setProperty('previousLanguage', $lng);
		$plugin->setProperty('exportName', false);
		$plugin->setProperty('processing', "none");
	}
}

/**
 * @param $settings
 * @param $plugin OasysParserPlugin
 * @param $lng
 * @param $itemId
 */

function postProcess(&$settings, OasysParserPlugin &$plugin, $lng, $itemId) {

	//		GLOBAL $returnData;

	if (isset($settings['height'])) {
		/* if a new height is defined save it as new default for future buttons */
		$plugin->setProperty('defaultHeight', $settings['height']);
	} else {
		/* if no height is set apply the default one */
		$settings['height'] = $plugin->getProperty('defaultHeight');
	}

	if ($plugin->getProperty('newItem') === false) {
		if ($settings['newGroup']) {
			/* if "newGroup" attribute was found */
			$plugin->setProperty('lastGroup', false); //in case we had a named group before this new one we clear that name now
			$plugin->increaseProperty('autoGroupCounter'); //the automatic group counter is increased by 1
			$plugin->setProperty('autoValueCounter', 1);
			$plugin->setProperty('correction', '');
			$plugin->setProperty('exportName', false);
			$plugin->setProperty('comment', false);
			$plugin->setProperty('processing', "none");
		} else {
			$plugin->increaseProperty('autoValueCounter');
		}
	} else {
		$plugin->setProperty('newItem', false);
	}

	unset($settings['newGroup']); //does not need to be sent to the client

	$lastGroup = $plugin->getProperty('lastGroup'); //fetch last used group name

	if ($settings['id'] == "") {
		/* if no group name was specified */
		if ($lastGroup !== false) {
			//if a group name has indeed been specified in a previous instance belonging to this same group we'll use it
			$settings['id'] = $lastGroup;
			$groupChanged = false;
		} else {
			//if there was no group name specified before, we'll generate one with the automatic group counter
			$settings['id'] = "rbGroup_" . $plugin->getProperty('autoGroupCounter');
			$plugin->setProperty('lastGroup', $settings['id']);
			$groupChanged = true;
		}
	} else {
		if ($lastGroup !== false && $lastGroup !== $settings['id']) {
			$plugin->setProperty('autoValueCounter', 1);
			$groupChanged = true;
		} elseif ($lastGroup === $settings['id']) {
			$groupChanged = false;
		} else {
			$groupChanged = true;
		}
		/* if a group is specified in this instance, we'll save it for use with the next instances that might not repeat the group name */
		$plugin->setProperty('lastGroup', $settings['id']);
	}

	if (!$settings['value']) {
		$settings['value'] = bin2hex($plugin->getProperty('autoValueCounter'));
		$settings['domAttributes']['data-value'] = $settings['value'];
	}

	if ($groupChanged) {
		$plugin->setProperty('requiredGroup', $settings['required']); //saves 'required' setting for the whole group
		$plugin->setProperty('correction', '');
		$plugin->setProperty('exportName', false);
		$plugin->setProperty('comment', false);
		$plugin->setProperty('processing', "none");
		$plugin->setProperty('score', null);
	} else {
		$settings['required'] = $plugin->getProperty('requiredGroup');
	}

	if ($settings['flag'] === "*" || $settings['correct'] === true) {
		$plugin->setProperty('processing', 'auto');
		$plugin->setProperty('correction', hex2bin($settings['value']));
	}
	$settings['processing'] = $plugin->getProperty('processing');

	if ($settings['processing'] === 'auto') {
		$settings['correction']['format'] = VALUES_STRING;
		$settings['correction']['data'] = $plugin->getProperty('correction');
		if ($settings['noreply'] === true) {
			$settings['correction']['noreply'] = hex2bin($settings['value']);
			unset ($settings['noreply']);
		}
	}

	if (isset($settings['export'])) {
		if ($settings['export'] === "") {
			//if EXPORT attribute is set, but no name specified, export under ID of field
			$settings['export'] = $settings['id'];
		}
		$plugin->setProperty('exportName', $settings['export']);
	}

	if (isset($settings['comment'])) {
		$plugin->setProperty('comment', $settings['comment']);
	} else {
		$settings['comment'] = $plugin->getProperty('comment');
	}

	$settings['export'] = $plugin->getProperty('exportName');
	$settings['signature'] = "RB {$settings['id']} / " . hex2bin($settings['value']);

	unset ($settings['flag']);
	unset ($settings['correct']);
	unset ($settings['value']);

}