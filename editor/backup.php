<!DOCTYPE html>

<?Php
# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "backup"; // set to the related 'editor button' string name (e.g., 'items')
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
    <title>OASYS backup</title>
    <link rel="icon" href="images/favicon.png">
    
    <?php
        includeCSS("../inc/jquery_contextmenu/jquery.contextMenu.css");
        includeCSS("../inc/filer/filez.css");
        includeCSS("../inc/jsSortableTable/jsSortableTable.css");
        includeCSS("../inc/jsButton2/jsButton2.css");
        includeCSS("../inc/nxDialog/nxDialog.css");
        includeCSS("../inc/nxButton/nxButton.css");
        includeCSS("../inc/jsSelectList/jsSelectList.css");
        includeCSS("../inc/jsGUI/jsGUI.css");
        includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");
        includeCSS("inc/css/interface.css");
        includeJS("../inc/js/jquery-3.2.1.min.js");
        includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
        includeJS("../inc/js/jsPointerHandler.js");
        includeJS("../inc/jsButton2/jsButton2.js");
        includeJS("../inc/js/he.js");
        includeJS("../inc/jsSelectList/jsSelectList.js");
        includeJS("../inc/jsGUI/jsGUI.js");
        includeJS("../inc/js/jsModalWait.js");
        includeJS("../inc/nxButton/nxButton.js");
        includeJS("../inc/nxDialog/nxDialog.js");
        includeJS("../inc/jsSortableTable/jsSortableTable.js");
        includeJS("../inc/js/rixTools.js");
        includeJS("../inc/js/jsKeyboardHandler.js");
        includeJS("../inc/filer/filer.js");
        includeJS("../inc/jquery_contextmenu/jquery.contextMenu.js");
        includeJS("../inc/jquery_hover_intent/jquery.hoverIntent.minified.js");
        includeJS("inc/js/interface.js");
        includeJS("inc/js/backup.js");
        includeJS("../images/svgIcons.js");
    
        //settings
        include_once 'inc/php/settings2JS.php';
    ?>
</head>

<body data-managerid="backup">
    <div id="svgMainMenuSymbols" class="svgSymbols">
        <?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
    </div>
</body>

</html>