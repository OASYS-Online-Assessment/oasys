<!DOCTYPE html>

<?Php
    # ----------------------- #
    # Authentication Includes #
    # ----------------------- #
    $pageName = "testtakers"; // set to the related 'editor button' string name (e.g., 'items')
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
    <title>OASYS test takers</title>
    <link rel="icon" href="images/favicon.png">

    <?php
        includeCSS("../inc/jquery_contextmenu/jquery.contextMenu.css");
        includeCSS("../inc/filer/filez.css");
        includeCSS("../inc/jsSortableTable/jsSortableTable.css");
        includeCSS("../inc/jsNumberInput/jsNumberInput.css");
        includeCSS("../inc/jsButton2/jsButton2.css");
        includeCSS("../inc/nxDialog/nxDialog.css");
        includeCSS("../inc/nxButton/nxButton.css");
        includeCSS("../inc/jsSelectList/jsSelectList.css");
        includeCSS("../inc/jsGUI/jsGUI.css");
        includeCSS("../inc/jsToggleswitch/jsToggleswitch.css");
        includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");
        includeCSS("../inc/mejs/mediaelementplayer.css");
        includeCSS("../inc/jsToggleswitch/jsToggleswitch.css");
        includeCSS("../inc/jsDropList/jsDropList.css");
        includeCSS("../inc/jsMultipleChoice/jsMultipleChoice.css");
        includeCSS("inc/css/interface.css");
        includeCSS("../inc/jsTagEditor/jsTagEditor.css");
        includeJS("../inc/js/jquery-3.2.1.min.js");
        includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
        includeJS("../inc/tinymce/js/tinymce/tinymce.min.js");
        includeJS("../inc/tinymcePlugins/tabindent.js");
        includeJS("../inc/tinymcePlugins/mediabrowser.js");
        includeJS("inc/nxUploader/nxUploader.js");
        includeJS("../inc/js/he.js");
        includeJS("../inc/jsButton2/jsButton2.js");
        includeJS("../inc/js/he.js");
        includeJS("../inc/jsSelectList/jsSelectList.js");
        includeJS("../inc/jsObjectForm/jsTextField.js");
        includeJS("../inc/jsObjectForm/jsSpinner.js");
        includeJS("../inc/jsObjectForm/jsCheckbox.js");
        includeJS("../inc/OasysHelp/OasysHelp.js");
        includeJS("../inc/jsGUI/jsGUI.js");
        includeJS("../inc/js/jsModalWait.js");
        includeJS("../inc/js/jsPointerHandler.js");
        includeJS("../inc/nxButton/nxButton.js");
        includeJS("../inc/nxDialog/nxDialog.js");
        includeJS("../inc/jsToggleswitch/jsToggleswitch.js");
        includeJS("../inc/jsSortableTable/jsSortableTable.js");
        includeJS("../inc/jsTagEditor/jsTagEditor.js");
        includeJS("../inc/jsNumberInput/jsNumberInput.js");
        includeJS("../inc/js/rixTools.js");
        includeJS("../inc/js/jsKeyboardHandler.js");
        includeJS("../inc/filer/filer.js");
        includeJS("../inc/jquery_contextmenu/jquery.contextMenu.js");
        includeJS("../inc/jquery_hover_intent/jquery.hoverIntent.minified.js");
        includeJS("../inc/mejs/mediaelement-and-player.min.js");
        includeJS("../inc/jsDropList/jsDropList.js");
        includeJS("../inc/jsMultipleChoice/jsMultipleChoice.js");
        includeJS("inc/js/interface.js");
        includeJS("../images/svgIcons.js");

        //permission handling include
        includeJS("inc/js/perms.js");

        //main testsTakers script
        includeJS("inc/js/testTakers.js");


        //settings
        include_once 'inc/php/settings2JS.php';
    ?>

    <script type="text/javascript">
        window.preSelect = '<?=$_GET['id'] ?? null ?>';
        window.preType = '<?=$_GET['ta'] ?? null ?>';
    </script>

</head>

<body data-managerid="testtakers">
<div id="svgMainMenuSymbols" class="svgSymbols">
    <?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
</div>
</body>

</html>
