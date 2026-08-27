<?php
	header('Access-Control-Allow-Origin: *');
?>
<!DOCTYPE HTML>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta http-equiv="Pragma" content="no-cache">
		<meta http-equiv="Expires" content="-1">
		<meta http-equiv="CACHE-CONTROL" content="NO-CACHE">
		<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0'/>
		<title>ConceptMaps</title>
		<link rel="shortcut icon" href="favicon.ico" type="image/x-icon">
		<?php
        require_once '../../editor/inc/php/cacheIncludes.php'; // required for cache handling
		includeCSS("nxFlowChart.css");
		includeCSS("inc/nxMultiState/nxMultiState.css");
		includeCSS("inc/nxSwitch/nxSwitch.css");
		includeCSS("../../inc/nxPopup/nxPopup.css");
		includeCSS("../../inc/nxButton/nxButton.css");
		includeCSS("../../inc/nxDialog/nxDialog.css");
        includeCSS("../../inc/jquery-ui-1.12.1/jquery-ui.min.css");
        includeCSS("../../inc/jquery_colorpicker/spectrum.css");
        includeCSS("../../inc/jquery_colorpicker/oasys-spectrum.css");
        includeCSS("style.css");
        includeJS("../../inc/js/jquery-3.2.1.min.js");
        includeJS("../../inc/jquery-ui-1.12.1/jquery-ui.min.js");
        includeJS("../../inc/raphael/raphael.js");
        includeJS("../../inc/js/jsPointerHandler.js");
        includeJS("../../inc/js/jsPointerHelper.js");
        includeJS("inc/js/savingWatcher.js");
        includeJS("inc/js/oasysCom.js");
        includeJS("inc/js/dataFormat.js");
        includeJS("inc/js/labels.js");
        includeJS("inc/js/connectors.js");
        includeJS("inc/js/events.js");
		includeJS("inc/js/nxFlowChart.js");
        includeJS("inc/nxMultiState/nxMultiState.js");
        includeJS("inc/nxSwitch/nxSwitch.js");
        includeJS("../../inc/nxPopup/nxPopup.js");
        includeJS("../../inc/nxButton/nxButton.js");
		includeJS("../../inc/nxDialog/nxDialog.js");
		includeJS("../../inc/js/rixTools.js");
        includeJS("inc/js/documents.js");
		includeJS("../../inc/jquery_colorpicker/spectrum.js");
		#keep at the bottom!
		includeJS("inc/js/lang.js");
		?>
		<meta name="apple-mobile-web-app-capable" content="yes"/>
		<script type="text/javascript">
			if (window.document.documentMode) { // IE not supported
  				alert('Internet Explorer is not supported. Please use a modern browser.');
			}

			const fileFormat = 1;
			const DATAFORMAT = new DataFormat();
			DATAFORMAT.setFileFormat(fileFormat);
			DATAFORMAT.setMeta({fileversion: fileFormat});

			let UILANG;
			$(document).ready(function() {
				UILANG = new Lang(); // translation class
				domReady();
			});
		</script>
	</head>
	<body>
	<div id="portrait-warning"><img id="warning-block" src="images/portrait-warning.png"></div>
	<header>
		<div id="controls-container">
			<div id="tools-container"></div>
			<div id="controls"></div>
			<div id="controls_right"></div>
		</div>
		

	</header>
		<div id="leftPanel">
			<!-- UG commented out collapsiblesidebar -->
			<!-- div id="leftPanelBar"></div -->
			<div id="innerLeftPanel"></div>
		</div>
		<div id="main">
			<div id="wrapper">
				<div id="canvas"></div>
			</div>
		</div>
		<footer>
			<span id="db"></span>
		</footer>
		<!-- div id="scrollMsg" class="nxPopup"><p>scrollmode active</p></div -->
	</body>
	<svg id="mainMenuSymbols" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
				<symbol id="mm_uploadIcon" viewBox="0 0 46 46">
				<g transform="matrix(1,0,0,1,-382,0)">
					<g id="icon-upload" transform="matrix(1,0,0,1,382.067,7.10543e-15)">
						<rect x="0" y="0" width="46" height="46" style="fill:none;"/>
						<g id="Layer-2" transform="matrix(0.388544,0,0,0.388544,11.1021,8.54813)">
							<g>
								<g transform="matrix(2.79963,0,0,2.48046,-1126.47,-20.8368)">
									<path d="M401.832,39.493L407.717,39.493L407.717,43.24L398.512,43.24L398.512,3.551L421.611,3.551C421.611,3.551 424.95,6.836 424.934,6.82L428.09,9.846L428.09,43.24L419.187,43.24L419.187,39.493L424.77,39.493L424.77,11.58L422.777,9.668L420.367,7.297L401.832,7.297L401.832,39.493Z"/>
								</g>
								<g transform="matrix(2.57371,0,0,2.57371,-1041.59,-22.0004)">
									<path d="M414.719,21.869L412.136,24.452L409.582,21.899L416.506,14.975L423.622,22.091L421.069,24.645L418.33,21.906L418.408,39.971L414.797,39.987L414.719,21.869Z"/>
								</g>
							</g>
						</g>
					</g>
				</g>
				</symbol>
		<symbol id="mm_helpIcon" viewBox="0 0 46 46" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <g transform="matrix(1,0,0,1,-552.382,0)">
        <g id="icon-help" transform="matrix(1,0,0,1,552.382,0)">
            <rect x="0" y="0" width="46" height="46" style="fill:none;"/>
			<g transform="matrix(1,0,0,1,-552.382,0)">
                <path d="M575.674,41.178C565.641,41.178 557.496,33.033 557.496,23C557.496,12.967 565.641,4.822 575.674,4.822C585.707,4.822 593.852,12.967 593.852,23C593.852,33.033 585.707,41.178 575.674,41.178ZM575.674,38.956C566.868,38.956 559.718,31.806 559.718,23C559.718,14.194 566.868,7.044 575.674,7.044C584.48,7.044 591.63,14.194 591.63,23C591.63,31.806 584.48,38.956 575.674,38.956ZM572.902,32.245C572.902,31.548 573.139,30.972 573.613,30.52C574.086,30.067 574.693,29.84 575.432,29.84C576.171,29.84 576.778,30.067 577.251,30.52C577.725,30.972 577.962,31.548 577.962,32.245C577.962,32.932 577.73,33.5 577.267,33.947C576.804,34.395 576.192,34.619 575.432,34.619C574.672,34.619 574.06,34.395 573.597,33.947C573.134,33.5 572.902,32.932 572.902,32.245ZM573.355,27.451C573.355,25.993 573.532,24.832 573.886,23.968C574.24,23.104 574.888,22.253 575.83,21.415C576.772,20.577 577.4,19.895 577.712,19.369C578.024,18.843 578.181,18.289 578.181,17.706C578.181,15.946 577.368,15.067 575.744,15.067C574.974,15.067 574.357,15.304 573.894,15.777C573.43,16.251 573.188,16.904 573.168,17.737L568.639,17.737C568.659,15.749 569.302,14.192 570.567,13.068C571.832,11.943 573.558,11.381 575.744,11.381C577.951,11.381 579.664,11.915 580.882,12.982C582.1,14.049 582.709,15.556 582.709,17.503C582.709,18.388 582.512,19.223 582.116,20.009C581.72,20.795 581.028,21.667 580.039,22.625L578.774,23.828C577.983,24.588 577.53,25.478 577.415,26.498L577.353,27.451L573.355,27.451Z" />
            </g>
        </g>
    </g>
</symbol>
	</svg>
</html>
