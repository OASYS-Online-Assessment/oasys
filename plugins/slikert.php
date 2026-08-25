<?php namespace oasysSlikert;

use OasysParserPlugin;

$plugin = new OasysParserPlugin('oasysSlikert', '/\[@SLIKERT#?\b(.*?)@\]/i', 1);
$plugin->setPrefix("slikert_");
$plugin->registerPreProcess(__NAMESPACE__ . '\preProcess');
$plugin->registerAttribute('id', ['pattern' => '/\bID\s*=\s*"(.*?)"/i']);

$plugin->registerAttribute('min', ['pattern' => '/\bMIN\s*=\s*"(\-?\d+\.?\d*)"/i', 'defaultValue' => '0', 'cast' => 'int']);
$plugin->registerAttribute('max', ['pattern' => '/\bMAX\s*=\s*"(\-?\d+\.?\d*)"/i', 'defaultValue' => '5', 'cast' => 'int']);
$plugin->registerAttribute('origin', ['pattern' => '/\bORIGIN\s*=\s*"(L|C|R)"/i', 'defaultValue' => 'L']);
$plugin->registerAttribute('step', ['pattern' => '/\bSTEP\s*=\s*"(\d+\.?\d*)"/i', 'defaultValue' => '1', 'cast' => 'int']);

$plugin->registerAttribute('monocolour', ['pattern' => '/\b(MONOCOLOUR)/i', 'cast' => 'boolean']);

$plugin->registerAttribute('labelLeft', ['pattern' => '/\bMINLABEL\s*=\s*"(.*?)"/i', 'localised' => true]);
$plugin->registerAttribute('labelCentre', ['pattern' => '/\bCENTERLABEL\s*=\s*"(.*?)"/i', 'localised' => true]);
$plugin->registerAttribute('labelRight', ['pattern' => '/\bMAXLABEL\s*=\s*"(.*?)"/i', 'localised' => true]);
$plugin->registerAttribute('labelNoReply', ['pattern' => '/\bNOREPLYLABEL\s*=\s*"(.*?)"/i', 'localised' => true], true);

$plugin->registerAttribute('correct', ['pattern' => '/\bCORRECT\s*=\s*"(-?\d+(?:..-?\d+)?)"/i'], true);

$plugin->registerPostProcess(__NAMESPACE__ . '\finalise');


function preProcess(&$settings, OasysParserPlugin &$plugin, $lng, $itemId) {
	$plugin->setProperty('score', null);
}

function finalise(&$settings, &$plugin, $lng, $itemId)
{
	$settings['origin'] = strtoupper($settings['origin']);

	if ($settings['step'] === 0) {
		/*
		 * if step is either 0 or not a number set it to 1
		 */
		$settings['step'] = 1;
	}

	if (isset($settings['labelLeft'])) {
		$settings['labelLeft'] = preg_replace("/\|/", "<br>", $settings['labelLeft']);
	}

	if (isset($settings['labelCentre'])) {
		$settings['labelCentre'] = preg_replace("/\|/", "<br>", $settings['labelCentre']);
	}

	if (isset($settings['labelRight'])) {
		$settings['labelRight'] = preg_replace("/\|/", "<br>", $settings['labelRight']);
	}

	if (isset($settings['correct'])) {
		$settings['processing'] = 'auto';
		preg_match("/(-?\d+)(?:..(-?\d+))?/", $settings['correct'], $matches);
		$settings['correction']['data'] = ['min' => $matches[1], 'max' => $matches[1]];
		if (isset($matches[2])) {
			$settings['correction']['data']['max'] = $matches[2];
		}
		$settings['correction']['format'] = VALUES_RANGE;
		$settings['correction']['noreply'] = "N/A";
	} else {
		$settings['processing'] = 'none';
	}

	if (isset($settings['monocolour']) && $settings['monocolour'] === true) {
		$settings['bicolour'] = false;
	} else {
		$settings['bicolour'] = true;
	}

	unset($settings['monocolour']);
	$settings['signature'] = "SLIKERT {$settings['id']}";

	if (isset($settings['labelNoReply'])) {
		$settings['noReply'] = true;
	}

}