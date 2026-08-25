<?php

    register_shutdown_function("whenTheShitHitsTheFan");

	$action = filter_input(INPUT_GET, 'action') ?? filter_input(INPUT_POST, 'action');

	global $filterSettings;
	$filterSettings = true;

	require_once 'inc/php/database.php';
	require_once 'inc/php/settings.php';

    try {
        $serialNumber = bin2hex(random_bytes(6));
    } catch (\Random\RandomException $e) {
        $serialNumber = uniqid();
    }

    /* find custom landing page if required */
	$landingPage = filter_input(INPUT_GET, 'landingPage');
	if (!isset($landingPage)) {
		$landingPage = filter_input(INPUT_POST, 'landingPage');
	}
	if (!isset($landingPage)) {
		$landingPage = $settings['landingPage'];
	}
	$landingPageManifest = '[]';
	$landingPagePath = '';
	if ($landingPage !== '' && !((isset($_GET['action']) && $_GET['action'] === 'preview') || (isset($_POST['action']) && $_POST['action'] === 'preview')) && !((isset($_GET['login']) || isset($_POST['login'])) && (isset($_GET['password']) || isset($_POST['password']) || isset($settings['defaultPassword'])))) {
		if (file_exists("landingPages/$landingPage")) {
			if (file_exists("landingPages/$landingPage/loaderManifest.json")) {
				$landingPagePath = "landingPages/$landingPage/";
				$landingPageManifest = file_get_contents("landingPages/$landingPage/loaderManifest.json");
			} else {
				header("Location: landingPages/$landingPage");
			}
		} elseif (file_exists("modules/$landingPage/landingPage")) {
			if (file_exists("modules/$landingPage/landingPage/loaderManifest.json")) {
				$landingPagePath = "modules/$landingPage/landingPage/";
				$landingPageManifest = file_get_contents("modules/$landingPage/landingPage/loaderManifest.json");
			} else {
				header("Location: modules/$landingPage/landingPage");
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
			window.serialNumber = "<?php echo $serialNumber; ?>";
			window.parameters = {};
			<?php
			//check for all supported parameters in GET and POST, where GET is applied if both are set (generally only the case when debugging)
			checkParameter('mode');
			checkParameter('language');
			checkParameter('login');
			checkParameter('password');
			checkParameter('error');
			checkParameter('action');
            checkParameter('framed');
			checkParameter('data'); //JSON encoded string
			checkParameter('variables'); //JSON encoded string
			if ($landingPage != $settings['landingPage']) {
				echo "let landingPage = '$landingPage';\n";
			} else {
				echo "let landingPage = '';\n";
			}
			echo "let landingPagePath = '$landingPagePath';\n";
			echo "let landingPageManifest = $landingPageManifest\n"; //quotes omitted intentionally => JSON injected into Javascript as native object
			?>
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

	function checkParameter($name):void {
		GLOBAL $serialNumber;
		$val = filter_input(INPUT_GET, $name);
		if (!isset($val)) {
			$val = filter_input(INPUT_POST, $name);
		}
		if (isset($val)) {
            //if parameter is numeric and does not start with a zero and it's neither login nor password, treat it as number
            //(login and password could be alphanumerical but also purely numerical, e.g. student ID as login)
			if (is_numeric($val) && !preg_match("/^0[0-9]+$/", $val) && $name != 'login' && $name != 'password') {
				echo "\t\t\tparameters.$name = $val;\n";
			} else {
				if (strtolower($val) == 'true' || strtolower($val) == 'false') {
					echo "\t\t\tparameters.$name = " . strtolower($val) . ";\n";
				} else {
					echo "\t\t\tparameters.$name = '" . addslashes($val) . "';\n";
				}
			}
		}
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