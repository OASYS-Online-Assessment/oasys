<!DOCTYPE html>
<?php
	# ----------------------- #
	# Authentication Includes #
	# ----------------------- #
	$pageName = "pages"; // set to the related 'editor button' string name (e.g., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = false; // set true if an "xxxActions.php" file
	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
	require_once 'inc/php/cacheIncludes.php'; // required for cache handling
?>
<html lang="en">

<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<title>OASYS page editor</title>
	<link rel="icon" href="images/favicon.png">

	<?php
		/* jQuery, jQuery UI and plugins */
		includeJS("../inc/js/jquery-3.2.1.min.js");
		includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
		includeJS("../inc/jquery_contextmenu/jquery.contextMenu.js");
		includeJS("../inc/jquery_hover_intent/jquery.hoverIntent.minified.js");
		includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");
		includeCSS("../inc/jquery_contextmenu/jquery.contextMenu.css");

		/* adding html entity encoding library */
		includeJS("../inc/js/he.js");

		/* svg icon strings */
		includeJS("../images/svgIcons.js");

		/* tinyMCE (only for those that need an editor */
		includeJS("../inc/tinymce/js/tinymce/tinymce.min.js");
		includeJS("../inc/tinymcePlugins/mediabrowser.js");
		includeJS("../inc/tinymcePlugins/imagebrowser.js");


		/* media playback */
		includeJS("../inc/mejs/mediaelement-and-player.min.js");
		includeCSS("../inc/mejs/mediaelementplayer.css");

		/* custom API */
		includeJS("../inc/js/rixTools.js"); /* general helper tools */
		includeJS("../inc/js/jsKeyboardHandler.js"); /* easy registering of keyboard shortcuts */
		includeJS("../inc/js/jsPointerHandler.js");
        includeCSS("../inc/jsDragAndDrop/jsDragAndDrop.css");
		includeJS("../inc/jsDragAndDrop/jsDragAndDrop.js");

		/* custom GUI elements */
		includeJS("../inc/jsButton2/jsButton2.js");
		includeCSS("../inc/jsButton2/jsButton2.css");
		includeJS("../inc/jsSelectList/jsSelectList.js");
		includeCSS("../inc/jsSelectList/jsSelectList.css");
		includeJS("../inc/jsObjectForm/jsTextField.js");
		includeJS("../inc/jsObjectForm/jsSpinner.js");
		includeJS("../inc/jsObjectForm/jsCheckbox.js");
		includeJS("../inc/jsObjectForm/jsDropdown.js");
		includeJS("../inc/jsMultipleChoice/jsMultipleChoice.js");
		includeCSS("../inc/jsMultipleChoice/jsMultipleChoice.css");
		includeJS("../inc/jsEditorElements/jsEditorElements.js");
		includeCSS("../inc/jsEditorElements/jsEditorElements.css");
		includeJS("../inc/jsPopupEditor/jsPopupEditor.js");
		includeCSS("../inc/jsPopupEditor/jsPopupEditor.css");
		includeJS("../inc/js/jsModalWait.js");
		includeJS("../inc/nxButton/nxButton.js");
		includeCSS("../inc/nxButton/nxButton.css");
		includeJS("../inc/nxDialog/nxDialog.js");
		includeCSS("../inc/nxDialog/nxDialog.css");
		includeJS("../inc/jsToggleswitch/jsToggleswitch.js");
		includeCSS("../inc/jsToggleswitch/jsToggleswitch.css");
		includeJS("../inc/jsDropList/jsDropList.js");
		includeCSS("../inc/jsDropList/jsDropList.css");
		includeJS("../inc/jsNumberInput/jsNumberInput.js");
		includeCSS("../inc/jsNumberInput/jsNumberInput.css");
		includeJS("../inc/jsTabs/jsTabs.js");
		includeCSS("../inc/jsTabs/jsTabs.css");
		includeJS("../inc/jsGUI/jsGUI.js");
		includeCSS("../inc/jsGUI/jsGUI.css");
		includeJS("../inc/filer/filer.js");
		includeCSS("../inc/filer/filez.css");
		includeJS("inc/js/interface.js");
		includeCSS("inc/css/interface.css");
		includeJS("inc/nxUploader/nxUploader.js");
		includeJS("../inc/jsMediaPlugin/jsMediaPlugin.js");
		includeCSS("../inc/jsMediaPlugin/jsMediaPlugin.css");
		includeJS("inc/js/Controller.js");
		includeJS("interactions/EditorFactory.js");
		includeCSS("interactions/preview.css");
		includeJS("interactions/InteractionEditor.js");
        includeJS("../inc/OasysHelp/OasysHelp.js");

		/* main script for the manager */
		includeJS("inc/js/pages.js");
		includeCSS("inc/css/pages.css");

		/* settings */
		include_once 'inc/php/settings2JS.php';

		echo "<script>\n";
		if (isset($_GET['id'])) {
			echo "\tconst pageId = {$_GET['id']};\n";
		} else {
			echo "\tconst pageId = -1;\n";
		}
		echo "</script>\n";

		/* interactions */
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

<body data-managerid="pages">
<iframe id="externalEditor" class="hidden"></iframe>
</body>

</html>