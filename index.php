<?php

	register_shutdown_function("whenTheShitHitsTheFan");
	use Oasys\OasysApp;
	use Random\RandomException;

	$action = filter_input(INPUT_GET, 'action') ?? filter_input(INPUT_POST, 'action');

	require_once 'inc/php/initSettings.php';

    try {
        $serialNumber = bin2hex(random_bytes(6));
    } catch (RandomException $e) {
        $serialNumber = uniqid();
    }

	/* find a custom landing page defined in a test */
	$customLandingPage = null;
	$landingPageIdValue = filter_input(INPUT_GET, 'landingPageId');
	if (!isset($landingPageIdValue)) {
		$landingPageIdValue = filter_input(INPUT_POST, 'landingPageId');
	}
	$landingPageId = filter_var($landingPageIdValue, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
	if ($landingPageId !== false) {
		$results = $db->fetchRow("SELECT metadata FROM tests WHERE id=?", [$landingPageId]);
		if (($results['rows'] ?? 0) === 1 && isset($results['data']['metadata'])) {
			$metadata = json_decode($results['data']['metadata'], true);
			$landingPageMetadata = $metadata['landing_page'] ?? null;
			if (is_array($landingPageMetadata) && ($landingPageMetadata['mode'] ?? 'default') === 'custom') {
				$languageContents = [];
				foreach (array_keys($config->getLanguages()) as $language) {
					$content = $landingPageMetadata[$language] ?? null;
					if (is_string($content) && trim($content) !== '') {
						$languageContents[$language] = $content;
					}
				}
				if (count($languageContents) > 0) {
					$customLandingPage = [
						'id' => $landingPageId,
						'contents' => $languageContents,
						'customCSS' => is_string($landingPageMetadata['customCSS'] ?? null) ? $landingPageMetadata['customCSS'] : ''
					];
				}
			}
		}
	}

	/* find the default landing page unless a test-specific one was found */
	$landingPage = '';
	if ($customLandingPage === null) {
		$landingPage = filter_input(INPUT_GET, 'landingPage');
		if (!isset($landingPage)) {
			$landingPage = filter_input(INPUT_POST, 'landingPage');
		}
		if (!isset($landingPage)) {
			$landingPage = $settings['landingPage'];
		}
	}
	$landingPageManifest = '[]';
	$landingPagePath = '';
	if ($landingPage !== '' && !((isset($_GET['action']) && $_GET['action'] === 'preview') || (isset($_POST['action']) && $_POST['action'] === 'preview')) && !((isset($_GET['login']) || isset($_POST['login'])) && (isset($_GET['password']) || isset($_POST['password'])))) {
		$landingPageDirectory = OasysApp::resolveLandingPageDirectory("landingPages/$landingPage");
		if ($landingPageDirectory !== false) {
			$manifestPath = $landingPageDirectory . 'loaderManifest.json';
			if (file_exists($manifestPath)) {
				$landingPagePath = $landingPageDirectory;
				$landingPageManifest = file_get_contents($manifestPath);
			} else {
				header("Location: " . rtrim($landingPageDirectory, '/'));
			}
		} else {
			$landingPageDirectory = OasysApp::resolveLandingPageDirectory("modules/$landingPage/landingPage");
			if ($landingPageDirectory !== false) {
				$manifestPath = $landingPageDirectory . 'loaderManifest.json';
				if (file_exists($manifestPath)) {
					$landingPagePath = $landingPageDirectory;
					$landingPageManifest = file_get_contents($manifestPath);
				} else {
					header("Location: " . rtrim($landingPageDirectory, '/'));
				}
			}
		}
	}

	function includeCSS($file): void
	{
		$mtime = filemtime($file);
		echo "<link rel='stylesheet' href='$file?update=$mtime'>";
	}

	function includeJS($file, $id = null): void
	{
		$mtime = filemtime($file);
		if (isset($id)) {
			echo "<script src='$file?update=$mtime' id='$id'></script>";
		} else {
			echo "<script src='$file?update=$mtime'></script>";
		}
	}

?>
	<!DOCTYPE html>
	<html lang="" translate="no">

	<head>
		<meta charset="utf-8">
		<title>OASYS</title>
		<meta http-equiv="X-UA-Compatible" content="IE=Edge">
		<meta name="viewport" content="width=device-width initial-scale=1.0 maximum-scale=1.0 user-scalable=no">
		<meta name="mobile-web-app-capable" content="yes">
		<link rel="icon" href="images/favicon.png">

		<?php
			includeCSS("inc/css/index.css");
			includeJS("inc/js/jquery-3.2.1.min.js");
			includeCSS("inc/jquery-ui-1.12.1/jquery-ui.min.css");
			includeJS("inc/jquery-ui-1.12.1/jquery-ui.min.js");
		?>

		<script>
			"use strict";
			<?php
			$jsonHexFlags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
			$parameters = [];
			//check for all supported parameters in GET and POST, where GET is applied if both are set (generally only the case when debugging)
			foreach (['mode', 'language', 'login', 'password', 'error', 'action', 'framed', 'data', 'variables'] as $parameterName) {
				$parameterValue = checkParameter($parameterName);
				if ($parameterValue !== null) {
					$parameters[$parameterName] = $parameterValue;
				}
			}
			$landingPageValue = ($landingPage != $settings['landingPage']) ? $landingPage : '';
			$landingPageManifestData = json_decode($landingPageManifest, true);
			if (!is_array($landingPageManifestData)) {
				$landingPageManifestData = [];
			}
			?>
			window.studentStateStorageKey = 'oasysStudentFrontendInstance:' + <?php echo json_encode($settings['JSrootURL'], $jsonHexFlags); ?>;
			window.restoreStudentState = false;
			window.serialNumber = <?php echo json_encode($serialNumber, $jsonHexFlags); ?>;
			try {
				const navigationEntry = performance.getEntriesByType('navigation')[0];
				const isReload = navigationEntry
					? navigationEntry.type === 'reload'
					: performance.navigation?.type === 1;
				const storedSerialNumber = sessionStorage.getItem(window.studentStateStorageKey);
				if (window.top === window && isReload && /^[a-f0-9]{12,13}$/.test(storedSerialNumber ?? '')) {
					window.serialNumber = storedSerialNumber;
					window.restoreStudentState = true;
				} else if (window.top === window) {
					// A normal navigation represents a new frontend instance, including a duplicated tab.
					sessionStorage.removeItem(window.studentStateStorageKey);
				}
			} catch (e) {
				// sessionStorage can be unavailable due to browser privacy settings; use the new instance.
			}
			window.parameters = <?php echo json_encode($parameters, $jsonHexFlags); ?>;
			window.customLandingPage = <?php echo json_encode($customLandingPage, $jsonHexFlags); ?>;
			let landingPage = <?php echo json_encode($landingPageValue, $jsonHexFlags); ?>;
			let landingPagePath = <?php echo json_encode($landingPagePath, $jsonHexFlags); ?>;
			let landingPageManifest = <?php echo json_encode($landingPageManifestData, $jsonHexFlags); ?>;
            if (typeof(parameters.data) !== 'undefined') {
                parameters.data = JSON.parse(parameters.data);
            }
			if (typeof(parameters.variables) !== 'undefined') {
                parameters.variables = JSON.parse(parameters.variables);
            }
		</script>
		<!--
			Dependencies for dynamic resource loader:
			they cannot be loaded on the fly as they are needed in order for the loader to function properly
		-->
		<?php
			includeJS("inc/js/declarations.js");
			includeJS("inc/js/rixTools.js");
			includeJS("inc/js/jsModalWait.js");
			includeJS("inc/js/jsPointerHandler.js");
			includeCSS("inc/nxButton/nxButton.css");
			includeJS("inc/nxButton/nxButton.js");
			includeCSS("inc/nxDialog/nxDialog.css");
			includeJS("inc/nxDialog/nxDialog.js");
			includeJS("inc/js/debug.js");
			includeJS("inc/js/loader.js");
		?>
		<script>
			window.MathJax = {
				chtml: {
					displayAlign: "center",
					displayIndent: "0",
					scale: 1,
					minScale: 50,
					mtextInheritFont: false,
					matchFontHeight: true
				},
				startup: {
					typeset: false
				},
				options: {
					renderActions: {
						addMenu: [],
						checkLoading: []
					},
					skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "annotation", "annotation-xml"],
					ignoreHtmlClass: "tex2jax_ignore",
					processHtmlClass: "tex2jax_process"
				},
				tex: {
					inlineMath: [
						['[$', '$]'],
						['{$', '$}']
					],
					displayMath: [
						['[$$', '$$]'],
						['{$$', '$$}']
					],
					processEscapes: false,
					processEnvironments: false,
					processRefs: false,
					tagSide: "right",
					tagIndent: "0.8em",
					multlineWidth: "85%",
					tags: "none",
					useLabelIds: true,
					packages: ['base', 'ams']
				},
				svg: {
					scale: 1,
					minScale: 50,
					mtextInheritFont: false
				}
			};
		</script>
		<script src="inc/mathjax/es5/tex-svg.js" id="MathJax-script"></script>
	</head>

	<body>
    <iframe id="studentLoginFrame" name="studentLoginFrame" class="hidden"></iframe>
    <iframe id="externalEditor" class="hidden"></iframe>
	<div id="contentWrapper"></div>
	</body>

	</html>
<?php

	function checkParameter(string $name): mixed {
		$val = filter_input(INPUT_GET, $name);
		if ($val === null) {
			$val = filter_input(INPUT_POST, $name);
		}

		if ($val === null) {
			return null;
		}

        //if parameter is numeric and does not start with a zero and it's neither login nor password, treat it as number
        //(login and password could be alphanumerical but also purely numerical, e.g. student ID as login)
		if (is_numeric($val) && !preg_match("/^0[0-9]+$/", $val) && $name != 'login' && $name != 'password') {
			return $val + 0;
		}

		$lowercaseValue = strtolower($val);
		if ($lowercaseValue == 'true') {
			return true;
		}
		if ($lowercaseValue == 'false') {
			return false;
		}

		return $val;
	}

    function whenTheShitHitsTheFan(): void {
        GLOBAL $returnData;
        if (isset($returnData['fatalError'])) {
            echo $returnData['fatalError'];
        }
        if (isset($returnData['error'])) {
            echo $returnData['error'];
        }
    }
