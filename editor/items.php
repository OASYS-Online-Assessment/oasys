<!DOCTYPE html>

<?Php
    require_once(__DIR__ . "/inc/php/initBackend.php");
    # ----------------------- #
    # Authentication Includes #
    # ----------------------- #
    $pageName = "content"; // set to the related 'editor button' string name (e.g., 'items')
    $isSubMod = false; // set true if a module page in a subdirectory
    $isActionFile = false; // set true if an "xxxActions.php" file
    require_once __DIR__ . "/inc/php/initBackend.php";
    require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
    require_once 'inc/php/cacheIncludes.php';
?>

<html lang="en">

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
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
        includeJS("../inc/tinymcePlugins/tabindent.js");
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
        includeCSS("../inc/jsTagEditor/jsTagEditor.css");
        includeJS("../inc/jsSortableTable/jsSortableTable.js");
        includeJS("../inc/jsTagEditor/jsTagEditor.js");
        includeJS("../inc/OasysHelp/OasysHelp.js");

        /* permission handling include */
        includeJS("inc/js/perms.js");

        /* custom stylesheets */
        includeCSS("inc/css/items.css");

        /* main script for the manager */
        includeJS("inc/js/items.js");

		$preSelect = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
		if ($preSelect === false) $preSelect = null;
		$preType = filter_input(INPUT_GET, 'ta', FILTER_VALIDATE_INT);
		if ($preType === false || !in_array($preType, [1, 2], true)) $preType = null;
		$pageGroupPackageAdmin = $myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();
		$preSelectJs = json_encode($preSelect, JSON_THROW_ON_ERROR);
		$preTypeJs = json_encode($preType, JSON_THROW_ON_ERROR);
		$pageGroupPackageAdminJs = json_encode($pageGroupPackageAdmin, JSON_THROW_ON_ERROR);

        echo <<<HTML
	<script type="text/javascript">
		window.preSelect = $preSelectJs;
		window.preType = $preTypeJs;
		window.pageGroupPackageAdmin = $pageGroupPackageAdminJs;
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

        /* interaction config metadata for content preview labels */
        echo "<script>window.interactionConfigs = window.interactionConfigs || {};</script>\n";
        $blockManifest = file_get_contents("interactions/manifest.json");
        $blockManifest = json_decode($blockManifest ?? '', true);
        foreach (($blockManifest['paths'] ?? []) as $interaction => $folder) {
            $configFile = "interactions/$folder/$interaction/config.js";
            if (file_exists($configFile)) {
                includeJS($configFile);
            }
        }
    ?>
</head>

<body data-managerid="content">
<iframe id="pageEditor" class="hidden"></iframe>
<div id="svgMainMenuSymbols" class="svgSymbols">
    <?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
</div>
</body>

</html>
