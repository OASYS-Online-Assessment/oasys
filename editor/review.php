<!DOCTYPE html>
<?php
    # ----------------------- #
    # Authentication Includes #
    # ----------------------- #
    $pageName = "content"; // this has no editor button, it depends on the permissions to use the content editor
    $isSubMod = false; // set true if a module page in a subdirectory
    $isActionFile = false; // set true if an "xxxActions.php" file
    require_once __DIR__ . "/inc/php/initBackend.php";
    require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
    require_once 'inc/php/cacheIncludes.php'; // required for cache handling
?>
<html lang="en">

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <title>OASYS review interface</title>
    <link rel="icon" href="images/favicon.png">

    <?php
        /* jQuery, jQuery UI and plugins */
        includeJS("../inc/js/jquery-3.2.1.min.js");

        /* media playback */
        includeJS("../inc/mejs/mediaelement-and-player.min.js");
        includeCSS("../inc/mejs/mediaelementplayer.css");

        /* custom API */
        includeJS("../inc/js/rixTools.js"); /* general helper tools */
        includeJS("../inc/js/jsPointerHandler.js");

        /* custom GUI elements */
        includeCSS("../inc/fonts/opensans.css");
        includeJS("../inc/jsMultipleChoice/jsMultipleChoice.js");
        includeCSS("../inc/jsMultipleChoice/jsMultipleChoice.css");
        includeJS("../inc/js/jsModalWait.js");

        /* main script for the manager */
        includeJS("inc/js/review.js");
        includeCSS("inc/css/review.css");

        /* settings */
        include_once 'inc/php/settings2JS.php';

        echo "<script>\n";
        if (isset($_POST['pageId'])) {
            echo "\tconst pageId = {$_POST['pageId']};\n";
        } else {
            echo "\tconst pageId = -1;\n";
        }
        echo "</script>\n";


        /* interactions */
        includeJS("interactions/EditorFactory.js");
        includeJS("interactions/InteractionEditor.js");
        includeCSS("interactions/preview.css");
        $blockManifest = file_get_contents("interactions/manifest.json");
        $blockManifest = json_decode($blockManifest ?? '', true);

        foreach ($blockManifest['paths'] as $interaction => $folder) {
            $interactionPath = "$folder/$interaction/";
            $path = "interactions/$interactionPath";
            $configFile = $path . "config.js";
            $cssFile = $path . "editor.css";

            if (file_exists($cssFile)) {
                includeCSS($cssFile);
            }
            if (file_exists($configFile)) {
                includeJS($configFile);
                includeJSEditor("interactions/", $interactionPath);
            } else {
                // if no config file is found, we will write an HTML comment
                echo "<!-- No config file found for interaction '$interaction'. -->\n";
            }
        }
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
    <?php
        includeJS("../inc/mathjax/es5/tex-svg.js", "MathJax-script");
    ?>
</head>

<body data-managerid="review">
<div id="outer_wrapper">
    <div id="controls"></div>
    <div id="mainContent"></div>
</div>
</body>
</html>