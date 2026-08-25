<!DOCTYPE html>

<?Php
# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "activityTracker"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = false; // set true if an "xxxActions.php" file
require_once __DIR__ . "/inc/php/initBackend.php";
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
require_once 'inc/php/cacheIncludes.php'; // required for cache handling
?>

<html lang="en">

<head>
	<meta charset="utf-8" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
	<title>OASYS activity tracker</title>
	<link rel="icon" href="images/favicon.png">

    <?php
        //jQuery, jQuery UI and plugins
        includeJS("../inc/js/jquery-3.2.1.min.js");
        includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
        includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");

        //custom API
        includeJS("../inc/js/rixTools.js"); //general helper tools
        includeJS("../inc/js/jsKeyboardHandler.js"); //easy registering of keyboard shortcuts
        includeJS("../inc/js/jsPointerHandler.js");

        //svg icon strings
        includeJS("../images/svgIcons.js");

        //custom GUI elements
        includeJS("../inc/jsButton2/jsButton2.js");
        includeCSS("../inc/jsButton2/jsButton2.css");
        includeJS("../inc/js/jsModalWait.js");
        includeJS("../inc/nxButton/nxButton.js");
        includeCSS("../inc/nxButton/nxButton.css");
        includeJS("../inc/nxDialog/nxDialog.js");
        includeCSS("../inc/nxDialog/nxDialog.css");
        includeJS("../inc/jsNumberInput/jsNumberInput.js");
        includeCSS("../inc/jsNumberInput/jsNumberInput.css");
        includeJS("inc/js/interface.js");
        includeCSS("inc/css/interface.css");
        includeJS("../inc/jsGUI/jsGUI.js");
        includeCSS("../inc/jsGUI/jsGUI.css");
        includeJS("../inc/jsMultipleChoice/jsMultipleChoice.js");
        includeCSS("../inc/jsMultipleChoice/jsMultipleChoice.css");
        includeJS("../inc/OasysHelp/OasysHelp.js");
        includeCSS("interactions/preview.css");
        includeJS("interactions/EditorFactory.js");
        includeJS("interactions/InteractionEditor.js");
        includeJS("inc/js/Controller.js");
        includeJS("inc/js/results_scoringClass.js");
        includeJS("inc/js/testJourney.js");

        //main script for the manager
        includeJS("inc/js/activityTracker.js");
        includeCSS("inc/css/activityTracker.css");
        includeCSS("inc/css/testJourney.css");

        //settings
        include_once 'inc/php/settings2JS.php';
	?>
    <?php
        $blockManifest = json_decode(file_get_contents("interactions/manifest.json") ?: '{}', true);
        foreach (($blockManifest['paths'] ?? []) as $interaction => $folder) {
            $path = "interactions/$folder/$interaction/";
            if (file_exists($path . "config.js")) includeJS($path . "config.js");
            if (file_exists($path . "editor.js")) includeJS($path . "editor.js");
            if (file_exists($path . "editor.css")) includeCSS($path . "editor.css");
        }
    ?>
</head>

<body data-managerid="activityTracker">
	<div id="svgMainMenuSymbols" class="svgSymbols">
		<?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
	</div>
</body>

</html>
