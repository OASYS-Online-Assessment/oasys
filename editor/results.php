<!DOCTYPE html>

<?Php
    # ----------------------- #
    # Authentication Includes #
    # ----------------------- #
    $pageName = "testresults"; // set to the related 'editor button' string name (e.g., 'items')
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
    <title>OASYS test results</title>
    <link rel="icon" href="images/favicon.png">

    <?php
        includeCSS("../inc/jsSortableTable/jsSortableTable.css");
        includeCSS("../inc/jsButton2/jsButton2.css");
        includeCSS("../inc/nxDialog/nxDialog.css");
        includeCSS("../inc/nxButton/nxButton.css");
        includeCSS("../inc/jsSelectList/jsSelectList.css");
        includeCSS("../inc/jsToggleswitch/jsToggleswitch.css");
        includeCSS("../inc/jsDropList/jsDropList.css");
        includeCSS("../inc/jsGUI/jsGUI.css");
        includeCSS("../inc/filer/filez.css");
        includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");
        includeCSS("../inc/jquery_colorpicker/spectrum.css");
        includeCSS("../inc/jquery_colorpicker/oasys-spectrum.css");
        includeCSS("interactions/preview.css");
        includeCSS("../inc/jsTabs/jsTabs.css");
        includeCSS("../inc/jsMultipleChoice/jsMultipleChoice.css");
        includeCSS("inc/css/results.css");
        includeCSS("inc/css/testJourney.css");
        includeCSS("inc/css/interface.css");


        includeJS("../inc/js/jquery-3.2.1.min.js");
        includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
        includeJS("../inc/jsButton2/jsButton2.js");
        includeJS("../inc/jsGUI/jsGUI.js");
        includeJS("../inc/js/jsModalWait.js");
        includeJS("../inc/js/jsPointerHandler.js");
        includeJS("../inc/nxButton/nxButton.js");
        includeJS("../inc/nxDialog/nxDialog.js");
        includeJS("../inc/jsObjectForm/jsTextField.js");
        includeJS("../inc/jsSortableTable/jsSortableTable.js");
        includeJS("../inc/js/he.js");
        includeJS("../inc/jsSelectList/jsSelectList.js");
        includeJS("../inc/jsToggleswitch/jsToggleswitch.js");
        includeJS("../inc/jsObjectForm/jsCheckbox.js");
        includeJS("../inc/jsDropList/jsDropList.js");
        includeJS("../inc/js/rixTools.js");
        includeJS("../inc/js/jsKeyboardHandler.js");
        includeJS("inc/js/interface.js");
        includeJS("../inc/plotlyJs/plotly.min.2.35.2.js");
        includeJS("../inc/jquery_colorpicker/spectrum.js");
        includeJS("interactions/EditorFactory.js");
        includeJS("interactions/InteractionEditor.js");
        includeJS("inc/js/Controller.js");
        includeJS("../inc/jsMultipleChoice/jsMultipleChoice.js");
        includeJS("../inc/jsTabs/jsTabs.js");
        includeJS("../inc/OasysHelp/OasysHelp.js");
        includeJS("../inc/tinymce/js/tinymce/tinymce.min.js");
        includeJS("../inc/tinymcePlugins/tabindent.js");
        includeJS("../inc/tinymcePlugins/mediabrowser.js");
        includeJS("../inc/tinymcePlugins/imagebrowser.js");
        includeJS("inc/js/results_scoringClass.js");
        includeJS("inc/js/testJourney.js");
        includeJS("inc/js/results.js");
        includeJS("../images/svgIcons.js");

		//settings
		include_once 'inc/php/settings2JS.php';

		$preSelect = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
		if ($preSelect === false) $preSelect = null;
		$preType = filter_input(INPUT_GET, 'ta', FILTER_VALIDATE_INT);
		if ($preType === false || !in_array($preType, [3, 4], true)) $preType = null;
		$preSelectJs = json_encode($preSelect, JSON_THROW_ON_ERROR);
		$preTypeJs = json_encode($preType, JSON_THROW_ON_ERROR);
	?>

	<script type="text/javascript">
		window.preSelect = <?=$preSelectJs?>;
		window.preType = <?=$preTypeJs?>;
	</script>

    <?php
        $blockManifest = file_get_contents("interactions/manifest.json");
        $blockManifest = json_decode($blockManifest ?? '', true);

        foreach ($blockManifest['paths'] as $interaction => $folder) {
            $path = "interactions/$folder/$interaction/";
            $configFile = $path . "config.js";
            $jsFile = $path . "editor.js";
            $cssFile = $path . "editor.css";

            if (file_exists($configFile)) {
                includeJS($configFile);
            }
            if (file_exists($jsFile)) {
                includeJS($jsFile);
            }
            if (file_exists($cssFile)) {
                includeCSS($cssFile);
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

<body data-managerid="testresults">
<iframe id="ms_external_cm_viewer"></iframe>
<div id="svgMainMenuSymbols" class="svgSymbols">
    <?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
</div>
</body>

</html>
