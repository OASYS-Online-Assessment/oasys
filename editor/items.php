<!DOCTYPE html>

<?Php
# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "content"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = false; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
require_once 'inc/php/cacheIncludes.php';
?>

<html lang="en">

<head>
	<meta charset="utf-8" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
	<title>OASYS content</title>
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

	/* tinyMCE (only for those that need an editor */
	includeJS("../inc/tinymce/js/tinymce/tinymce.min.js");
	includeJS("../inc/tinymcePlugins/mediabrowser.js");

	/* media playback */
	includeJS("../inc/mejs/mediaelement-and-player.min.js");
	includeCSS("../inc/mejs/mediaelementplayer.css");

	/* custom API */
	includeJS("../inc/js/rixTools.js"); /* general helper tools */
	includeJS("../inc/js/jsKeyboardHandler.js"); /* easy registering of keyboard shortcuts */
	includeJS("../inc/js/jsPointerHandler.js");

	/* svg icon strings */
	includeJS("../images/svgIcons.js");

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
	includeJS("../inc/jsGUI/jsGUI.js");
	includeCSS("../inc/jsGUI/jsGUI.css");
	includeJS("../inc/filer/filer.js");
	includeCSS("../inc/filer/filez.css");
	includeJS("inc/js/interface.js");
	includeCSS("inc/css/interface.css");
	includeJS("inc/nxUploader/nxUploader.js");
	includeJS("../inc/jsMediaPlugin/jsMediaPlugin.js");
	includeCSS("../inc/jsMediaPlugin/jsMediaPlugin.css");
	includeCSS("../inc/jsSortableTable/jsSortableTable.css");
	includeJS("../inc/jsSortableTable/jsSortableTable.js");
    includeJS("../inc/OasysHelp/OasysHelp.js");

	/* permission handling include */
	includeJS("inc/js/perms.js");

    /* custom stylesheets */
    includeCSS("inc/css/items.css");

	/* main script for the manager */
	includeJS("inc/js/items.js");

    $preSelect = $_GET['id'] ?? null;
    $preType= $_GET['ta'] ?? null;

    echo <<<HTML
	<script type="text/javascript">
		window.preSelect = '$preSelect';
		window.preType = '$preType';
	</script>
	HTML;

	/* inclusion of any plugins found in the plugins folder (plugins for response types) */
	foreach (glob("../plugins/*.js") as $file) {
        includeJS($file);
	}
	foreach (glob("../plugins/*.css") as $file) {
		includeCSS($file);
	}

	/* settings */
	include_once 'inc/php/settings2JS.php';
	?>
</head>

<body data-managerid="content">
	<iframe id="pageEditor" class="hidden"></iframe>
	<div id="svgMainMenuSymbols" class="svgSymbols">
		<?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
	</div>
</body>

</html>