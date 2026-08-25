<?Php

/*
    ##########################################################################################
    Upgrader Installer database maintenance and cleaner utility.

    VERSION: 1.1
    AUTHOR: Nilanjan Nag
    DATE:   2019-06-04 09:00:06
    ##########################################################################################
*/

register_shutdown_function('exit_handler');

echo "<div style='font-family: monospace;'>";

// Get and assign our data related to the requested action
$action = filter_input(INPUT_POST, 'action');
if ($action === "resetPkg") {
    if (!$dataVar = filter_input(INPUT_POST, 'varField', FILTER_VALIDATE_REGEXP, ["options" => ["regexp" => "/^oasys_pkg.*\.zip$/"]])) {
        echo "<span style='color: red;'>Invalid package name detected.</span><br>";
        exit;
    }
} elseif ($action === "setVer") {
    // if (!$dataVar = filter_input(INPUT_POST, 'varField', FILTER_VALIDATE_REGEXP, ["options" => ["regexp" => "/^\d\.\d.+$/"]])) {
    if (!$dataVar = filter_input(INPUT_POST, 'varField', FILTER_VALIDATE_REGEXP, ["options" => ["regexp" => "/(?:^\d)(?:\.\d[\w\.-]?)/"]])) {
        echo "<span style='color: red;'>Invalid version string detected.</span><br>";
        exit;
    }
} else {
    $dataVar = $action;
}

// do the requested action
$action($dataVar);

echo "</div>";

function dbConnect()
{
    // verify main installer db file exists
    if (!file_exists('install.db')) {
        echo "Did not find 'install.db' file!<br>";
        exit;
    }
    echo "Found 'install.db' Installer database file.<br>";

    // try to make a valid connection to db
    try {
        $sldb = new PDO('sqlite:install.db');
    } catch (PDOException $e) {
        echo "Could not connect to 'install.db' database file.<br>";
        echo "<br>";
        echo "Error message from PDO: " . $e->getMessage();
        exit;
    }
    echo "Successfully connected to Installer database file.<br>";

    echo "----------------------------------------<br>";

    return $sldb;
}

function setVer($verNum)
{
    $verNum = "v={$verNum}";
    $verFile = file_get_contents('../oasys_ver.txt');
    $newFile = preg_replace('/^v=\d.*$/m', $verNum, $verFile);

    if (file_put_contents('../oasys_ver.txt', $newFile) !== false) {
        echo "<pre style='color: green;'>Successfully wrote new data to version flie:\n\n" . $newFile . "</pre>";
    } else {
        echo "<pre style='color: red;'>Unable to write new file version value to 'oasys_ver.txt'!</pre>";
    }
}

function resetPkg($packageName)
{
    $sldb = dbConnect();

    $pdostmt = $sldb->prepare("SELECT COUNT(*) FROM package_status WHERE package = ?");
    $pdostmt->execute([$packageName]);
    $retData = $pdostmt->fetchAll(PDO::FETCH_COLUMN);
    if ((int) $retData[0] === 0) {
        echo "<span style='color: red;'>A package with the name '$packageName' was not found in the Installer database.</span><br>";
        exit;
    }

    if ($sldb->prepare("DELETE FROM package_status WHERE package = ?")->execute([$packageName])) {
        echo "<span style='color: green;'>Successfully removed '$packageName' entry from Installer database!</span><br>";
    } else {
        echo "<span style='color: red;'>Unable to remove '$packageName' entry from the Installer database.</span><br>";
    }
}

function resetAllPkg($nullvar)
{
    $sldb = dbConnect();

    if ($sldb->prepare("DELETE FROM package_status")->execute()) {
        echo "<span style='color: green;'>Successfully removed ALL package entries from Installer database!</span><br>";
    } else {
        echo "<span style='color: red;'>Could not remove all packages from Installer database.</span><br>";
    }
}

function exit_handler()
{
    echo "<br><br><button onclick='window.location=\"instmain.html\"'>Back to Maintenance Utility</button>";
}
