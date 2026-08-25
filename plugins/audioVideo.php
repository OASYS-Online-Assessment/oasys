<?php namespace oasysAudioVideo;

require_once __DIR__ . "/../inc/php/mp4Info.php";
require_once __DIR__ . "/../inc/php/rixPDO.php";
require_once __DIR__ . "/../inc/php/database.php";

use OasysParserPlugin;

$plugin = new OasysParserPlugin('oasysAudioVideo', '/\[@(AUDIO|VIDEO)\b(.*?)@?\]/i', 2, ['mediaType' => 1]);
$plugin->setPrefix("av_");
$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i']);
$plugin->registerAttribute('file', ['pattern' => '/FILE\s*=\s*"(.*?)"/i', 'localised' => true]);
$plugin->registerAttribute('maxPlayCount', ['pattern' => '/MAXPLAYCOUNT\s*=\s*"(.*?)"/i', 'default' => 0, 'cast' => 'integer']);
$plugin->registerAttribute('disableControls', ['pattern' => '/(DISABLECONTROLS)/i', 'cast' => 'boolean', 'default' => false]);
$plugin->registerAttribute('autoPlay', ['pattern' => '/(AUTOPLAY)/i', 'cast' => 'boolean', 'default' => false]);
$plugin->registerAttribute('required', ['pattern' => '/(REQUIREPLAY)/i', 'cast' => 'boolean', 'default' => false]);
$plugin->registerAttribute('noPlaceHolder', ['pattern' => '/(NOPLACEHOLDER)/i', 'cast' => 'boolean', 'default' => false]);
$plugin->registerAttribute('navigateOnEnd', ['pattern' => '/(NAVIGATEONEND)/i', 'cast' => 'boolean', 'default' => false]);
$plugin->registerAttribute('hidden', ['pattern' => '/(HIDDEN)/i', 'cast' => 'boolean', 'default' => false]);
$plugin->registerAttribute('info', ['localised' => true]); //has no pattern, gets data from finalise function
$plugin->registerPostProcess(__NAMESPACE__ . '\finalise');


/**
 * @throws \Exception
 */
function finalise(&$conf, $key, $lng): void {
	global $sql_host, $sql_db, $sql_user, $sql_password, $settings, $returnData;

	$conf['mediaType'] = strtolower($conf['mediaType']);
	if ($conf['maxPlayCount'] > 0) {
		$conf['disableControls'] = true;
	}

	/* if file is video try to read media information (mainly in order to get dimensions) */
	if ($conf['mediaType'] === 'video') {
		$db = new \rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../logs/videoPlugin_errors.txt');
		$results = $db->results();
		if ($results['error']) {
			if (!isset ($returnData)) {
				$returnData = [];
			}
			$returnData = ['fatalError' => $results['error']]; // most scripts that include settings.php should send this back as json
			die();
		}
		preg_match("/fileid=(\d+)/", $conf['file'][$lng], $matches);
		$fileid = $matches[1];
		$query = "SELECT parent from media WHERE id = ?";
		$results = $db->fetchValue($query, [$fileid]);

		if (!$results['error']) {
			if ($settings['mediaLocation'] === 'disk') {
				$path = __DIR__ . "/../media/{$results['data']}/$fileid.dat";
			} elseif ($settings['mediaLocation'] === 'database') {
				$path = $fileid;
			}
		}

		$error = false;
		$info = null;
		$conf['info'] = null;

		if (isset($path)) {
			try {
				$info = new \mp4Info($settings['mediaLocation'], $path, $db);
			} catch (\Exception $e) {
				$error = $e->getMessage();
				throw new \Exception("AudioVideo plugin error: " . $error);
			}

			if (!$error && $info instanceof \mp4Info) {
				$conf['info'][$lng] = $info->getInfo();
			}
		}
	}
}