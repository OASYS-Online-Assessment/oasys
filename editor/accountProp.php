<!DOCTYPE html>
<?Php
# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "acctprop"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = false; // set true if an "xxxActions.php" file
require_once __DIR__ . "/inc/php/initBackend.php";
require_once __DIR__ . '/inc/php/authCommonFunctions.php'; // required for authentication inclusion
?>

<html lang="en">

<head>
	<meta http-equiv="Content-Type" content="text/html;charset=utf-8">
	<title>OASYS Account Settings</title>
	<link rel="icon" href="images/favicon.png">

	<!-- CSS Includes -->
	<link rel="stylesheet" href="../inc/nxButton/nxButton.css">
	<link rel="stylesheet" href="../inc/nxDialog/nxDialog.css" />
	<link rel="stylesheet" href="../inc/jsDropList/jsDropList.css" />
	<link rel="stylesheet" href="../inc/jsToggleswitch/jsToggleswitch.css" />
	<link rel="stylesheet" href="../inc/jsGUI/jsGUI.css" />
	<link type="text/css" href="inc/css/interface.css" rel="stylesheet">
	<link rel="stylesheet" href="../inc/jquery-ui-1.12.1/jquery-ui.min.css" />
	
	<!-- External JS Library Includes -->
	<script src="../inc/js/jquery-3.2.1.min.js"></script>
	<script src="../inc/jquery-ui-1.12.1/jquery-ui.min.js"></script>

	<!-- Oasys JS Module Includes -->
	<script src="../inc/js/rixTools.js"></script>
	<script src="../inc/js/jsModalWait.js"></script>
	<script src="../inc/js/jsPointerHandler.js"></script>
	<script src="../inc/nxButton/nxButton.js"></script>
	<script src="../inc/nxDialog/nxDialog.js"></script>
	<script src="../inc/jsDropList/jsDropList.js"></script>
	<script src="../inc/jsToggleswitch/jsToggleswitch.js"></script>
	<script src="inc/js/interface.js"></script>
	<script src="../inc/jsGUI/jsGUI.js"></script>



	<!-- main access authentication include -->
	<script src="inc/js/accountProp.js"></script>

	<!-- settings -->
	<?php
	include_once 'inc/php/settings2JS.php';
	?>
</head>

<body id="body" data-managerid="accountdetails">
	<div id="svgMainMenuSymbols" class="svgSymbols">
		<?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
	</div>
</body>

</html>
