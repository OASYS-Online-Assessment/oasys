<!DOCTYPE html>
<?php
# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName     = "dashboard";  // set to the related 'editor button' string name (e.g., 'items')
$isSubMod     = false;        // set true if a module page in a subdirectory
$isActionFile = false;        // set true if an "xxxActions.php" file
require_once __DIR__ . '/inc/php/initBackend.php'; // required for authentication initialization
require_once __DIR__ . '/inc/php/authCommonFunctions.php'; // required for authentication inclusion
require_once __DIR__ . '/inc/php/cacheIncludes.php';       // required for cache handling
?>

<html lang="en">

<head>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8">
    <title>OASYS Dashboard</title>
    <link rel="icon" href="images/favicon.png">

    <?php
    /* Core JS/CSS libs (globals available to modules) */
    includeJS("../inc/js/jquery-3.2.1.min.js");
    includeJS("../inc/jquery-ui-1.12.1/jquery-ui.min.js");
    includeJS("../inc/jsTabs/jsTabs.js");
    includeJS("../images/svgIcons.js");
    includeJS("../inc/OasysHelp/OasysHelp.js");

    includeCSS("../inc/jquery-ui-1.12.1/jquery-ui.min.css");
    includeCSS("../inc/jsTabs/jsTabs.css");
    includeCSS("../inc/nxButton/nxButton.css");
    includeCSS("../inc/nxDialog/nxDialog.css");
    includeCSS("../inc/jsDropList/jsDropList.css");
    includeCSS("../inc/jsToggleswitch/jsToggleswitch.css");
    includeCSS("../inc/jsGUI/jsGUI.css");
    includeCSS("inc/css/interface.css");
    includeCSS("inc/css/dashboard.css");

    /* OASYS JS (globals used by widgets) */
    includeJS("../inc/js/rixTools.js");
    includeJS("../inc/js/jsModalWait.js");
    includeJS("../inc/js/jsPointerHandler.js");
    includeJS("../inc/nxButton/nxButton.js");
    includeJS("../inc/nxDialog/nxDialog.js");
    includeJS("../inc/jsDropList/jsDropList.js");
    includeJS("../inc/jsToggleswitch/jsToggleswitch.js");
    includeJS("inc/js/interface.js");
    includeJS("../inc/jsGUI/jsGUI.js");

    /* Server-side settings → JS */
    include_once 'inc/php/settings2JS.php';

    /***********************
     * Read widgets manifest
     ***********************/
    $dashboardPath = 'dashboard/';
    $jsonFilePath  = $dashboardPath . 'manifest.json';
    $jsonData      = @file_get_contents($jsonFilePath);
    $root          = $jsonData ? json_decode($jsonData, true) : null;

    if ($root === null) {
        echo "<!-- Error decoding dashboard manifest.json or file missing at {$jsonFilePath} -->";
        $root = [];
    }

    $hasTrees = (isset($root['user']) || isset($root['admin']));

    // Widget CSS and JS are loaded by dashboard.js when their scope is first shown.
    // Determine current admin role (highest wins)
    $currentAdminRole = null;
    if (isset($myAuth)) {
        if ($myAuth->checkSA()) {
            $currentAdminRole = 'superadmin';
        } elseif ($myAuth->checkElevatedAdmin()) {
            $currentAdminRole = 'elevated';
        } elseif ($myAuth->checkAdmin()) {
            $currentAdminRole = 'admin';
        }
    }

    $collectMeta = function (array $w, string $key) use ($dashboardPath) {
        $w = array_change_key_case($w, CASE_LOWER); // be forgiving with keys

        $path      = isset($w['path']) ? rtrim($w['path'], '/') . '/' : '';
        $js        = $w['js']        ?? null;
        $css       = $w['css']       ?? null;
        $jsC       = $w['jsconstruct'] ?? $key;
        $row       = isset($w['row'])      ? (int)$w['row']      : 1;
        $order     = isset($w['order'])    ? (int)$w['order']    : 1;
        $minW      = isset($w['minwidth']) ? (int)$w['minwidth'] : 300;
        $maxW      = isset($w['maxwidth']) ? (int)$w['maxwidth'] : 900;
        $height    = array_key_exists('height', $w) ? (int)$w['height'] : null;
        $width     = array_key_exists('width',  $w) ? (int)$w['width']  : null;
        $grow      = array_key_exists('grow',   $w) ? (int)$w['grow']   : null;
        $id        = $w['id'] ?? null;
        $jsPath    = !empty($js) ? $dashboardPath . $path . $js : null;
        $cssPath   = !empty($css) ? $dashboardPath . $path . $css : null;

        // Normalize roles (string or array) → array of lowercase strings
        $rolesRaw  = $w['roles'] ?? null;
        if (is_string($rolesRaw) && $rolesRaw !== '') {
            $roles = [strtolower($rolesRaw)];
        } elseif (is_array($rolesRaw)) {
            $roles = array_values(array_unique(array_map('strtolower', $rolesRaw)));
        } else {
            $roles = null; // visible to all admin types if section is "admin"
        }

        return [
            'key'         => $key,
            'id'          => $id,
            'path'        => $dashboardPath . $path,
            'js'          => $js,
            'css'         => $css,
            'jsUpdate'    => $jsPath && file_exists($jsPath) ? filemtime($jsPath) : null,
            'cssUpdate'   => $cssPath && file_exists($cssPath) ? filemtime($cssPath) : null,
            'jsconstruct' => $jsC,
            'row'         => $row,
            'order'       => $order,
            'minWidth'    => $minW,
            'maxWidth'    => $maxW,
            'height'      => $height,
            'width'       => $width,
            'grow'        => $grow,
            'roles'       => $roles, // ← keep for filtering
        ];
    };

    $metasUser  = [];
    $metasAdmin = [];

    if ($hasTrees) {
        foreach (['user' => 'metasUser', 'admin' => 'metasAdmin'] as $sec => $bucket) {
            if (!isset($root[$sec]) || !is_array($root[$sec])) continue;
            foreach ($root[$sec] as $key => $w) {
                if (!is_array($w)) continue;

                $meta = $collectMeta($w, is_string($key) ? $key : ($w['jsconstruct'] ?? 'widget'));

                // Admin-only role filtering
                if ($sec === 'admin') {
                    // If no admin role or roles restriction doesn't include the user's role → skip
                    if (empty($currentAdminRole)) {
                        continue; // not an admin at all
                    }
                    if (is_array($meta['roles']) && !in_array($currentAdminRole, $meta['roles'], true)) {
                        continue; // roles set but user's role not allowed
                    }
                }

                ${$bucket}[] = $meta;
            }
        }
    } else {
        // Flat legacy manifest → treat all as user
        foreach ($root as $key => $w) {
            if (!is_array($w)) continue;
            $metasUser[] = $collectMeta($w, is_string($key) ? $key : ($w['jsconstruct'] ?? 'widget'));
        }
    }


    // Emit manifest metas to window (used by dashboard.js to import modules)
    echo "<script>window.widgetMetaUser  = " . json_encode($metasUser,  JSON_UNESCAPED_SLASHES) . ";</script>";
    echo "<script>window.widgetMetaAdmin = " . json_encode($metasAdmin, JSON_UNESCAPED_SLASHES) . ";</script>";

    // Admin flag (use your auth if available)
    $isAdminJs = 'false';
    if (isset($myAuth)) {
        $isAdminJs = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? 'true' : 'false';
    }
    echo "<script>window.userIsAdmin = $isAdminJs;</script>";
    // Expose admin role to JS so widgets (like SystemStatus) can make role-based decisions
    $roleForJs = $currentAdminRole ? json_encode($currentAdminRole) : 'null';
    echo "<script>window.userRole = $roleForJs;</script>";

	// Derive the release label from the installed version file so the dashboard
	// identity follows future upgrades without changing its markup.
	$dashboardVersion = '3.7';
	$versionFile = __DIR__ . '/../oasys_ver.txt';
	if (is_file($versionFile)) {
		$versionText = (string)file_get_contents($versionFile);
		if (preg_match('/^vshort=(.+)$/mi', $versionText, $versionMatch)) {
			$dashboardVersion = trim($versionMatch[1]);
		}
	}
	echo "<script>window.dashboardVersion = " . json_encode($dashboardVersion) . ";</script>";
    ?>

    <!-- Load the dashboard bootstrap as an ES module -->
    <script type="module" src="inc/js/dashboard.js?update=<?php echo filemtime('inc/js/dashboard.js'); ?>"></script>
</head>

<body data-managerid="dashboard">
    <div id="svgMainMenuSymbols" class="svgSymbols">
        <?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
    </div>
</body>

</html>
