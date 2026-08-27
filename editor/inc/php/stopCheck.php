<?php
# ------------------------------------------------------------ #
# Hard stop any and all backend logins when .stopfile exists   #
# ------------------------------------------------------------ #
if (file_exists(__DIR__ . '/../../../.stopfile')) {
	echo '<meta http-equiv="Content-Type" content="text/html;charset=utf-8">';
	echo '<title>OASYS Editor Index</title>';
	echo "<style>
		body {
			background-color: #000;
			color: #fff;
			font-family: Consolas, sans-serif;
			text-align: center;
			padding-top: 20%;
		}</style>";
	echo "<h1>OASYS is currently down for maintenance</h1>";
	echo "<p style='font-size: larger;'>Please try again later.</p>";
	exit;
}
