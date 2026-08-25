<!DOCTYPE html>
<?Php
# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "dashboard"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = false; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
require_once 'inc/php/cacheIncludes.php'; // required for cache handling
?>

<html lang="en">

<head>
	<meta http-equiv="Content-Type" content="text/html;charset=utf-8">
	<title>OASYS Dashboard</title>
	<link rel="icon" href="images/favicon.png">
	<?php
		/* jQuery, jQuery UI and plugins */
		includeJS("../inc/js/jquery-3.2.1.min.js");
		includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
		includeJS("../inc/jsTabs/jsTabs.js");
		includeJS("../images/svgIcons.js");
		includeCSS("../inc/jsTabs/jsTabs.css");

        //CSS Includes
        includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");
        includeCSS("../inc/nxButton/nxButton.css");
        includeCSS("../inc/nxDialog/nxDialog.css");
        includeCSS("../inc/jsDropList/jsDropList.css");
        includeCSS("../inc/jsToggleswitch/jsToggleswitch.css");
        includeCSS("../inc/jsGUI/jsGUI.css");
        includeCSS("inc/css/interface.css");
        
        //External JS Library Includes
        includeJS("../inc/js/jquery-3.2.1.min.js");
        includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
    
        //Oasys JS Module Includes
        includeJS("../inc/js/rixTools.js");
        includeJS("../inc/js/jsModalWait.js");
        includeJS("../inc/js/jsPointerHandler.js");
        includeJS("../inc/nxButton/nxButton.js");
        includeJS("../inc/nxDialog/nxDialog.js");
        includeJS("../inc/jsDropList/jsDropList.js");
        includeJS("../inc/jsToggleswitch/jsToggleswitch.js");
        includeJS("inc/js/interface.js");
        includeJS("../inc/jsGUI/jsGUI.js");
    
        //main access authentication include
        includeJS("inc/js/dashboard.js");
    
        //settings
        include_once 'inc/php/settings2JS.php';
        
        #############
        # read widgets JSON 
        #############
        $dashboardPath = 'dashboard/';
        $jsonFilePath  = $dashboardPath.'manifest.json';
        $jsonData      = file_get_contents($jsonFilePath);
        $widgets       = json_decode($jsonData, true);
        if ($widgets === null) {
        // Error occurred while decoding JSON
            echo "Error decoding JSON!";
        } else {
            $widgetListString = "<script>let widgetList = ["; // array of widget constructors
            foreach($widgets as $widget){
                includeJS($dashboardPath.$widget['path'].$widget['js']);
                includeCSS($dashboardPath.$widget['path'].$widget['css']);
                $widgetListString .= "'".$widget['jsconstruct']."',";
            }
            $widgetListString = rtrim($widgetListString, ",");
            $widgetListString .= "]</script>";
            echo $widgetListString;
        }
	?>
</head>

<body data-managerid="dashboard">
	<div id="svgMainMenuSymbols" class="svgSymbols">
		<?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
	</div>
</body>

</html>