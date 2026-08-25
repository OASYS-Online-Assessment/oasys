<?PHP
class data_restore
{
    var $host = '';
    var $username = '';
    var $passwd = '';
    var $dbName = '';
    var $conn = null;

    function __construct($host, $username, $passwd, $dbName)
    {
        $this->host = $host;
        $this->username = $username;
        $this->passwd = $passwd;
        $this->dbName = $dbName;
        $this->initializeDb();
    }

    protected function initializeDb()
    {
        try {
            $this->conn = new PDO('mysql:host=' . $this->host . ';dbname=' . $this->dbName . ';charset=utf8mb4', $this->username, $this->passwd);
        } catch (PDOException $e) {
            return ($e->getMessage());
        }
    }

    public function restoreSQL($sqlImportFile)
    {
        set_time_limit(1800000); // setting for 30 minute execution timeout


        /* NOTE: https://bugs.php.net/bug.php?id=61613 */
        /* NOTE: https://phpdelusions.net/pdo#multiquery */

        $this->conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, true); // allows for multiline pdo query execution w/ prep statements
        $this->conn->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $query = file_get_contents($sqlImportFile);

        $query = str_replace("INSERT INTO", "INSERT IGNORE INTO", $query);
        // file_put_contents("query.txt", $query); // for debugging

        try {
            $stmt = $this->conn->prepare($query);
        } catch (PDOException $e) {
            return $e->getMessage();
        }

        try {
            ini_set('memory_limit', '-1'); // don't want to hit system memory limits, which is possible with large DBs
            $stmt->execute();
            while ($stmt->nextRowset()) {
                /* https://bugs.php.net/bug.php?id=61613 */
            };
        } catch (PDOException $e) {
            return ($e->getMessage());
        }

        return true;
    }

    public function updateRootSql(string $curPath, string $rootPath)
    {

        // Windows file system slash fix
        $curPath = str_replace("\\", "/", $curPath);

        // if the app root is the same as serve root, we want '/' to be the rootURL value in settings, otherwise, the diff between the two
        $updatedRootURL = ($curPath == $rootPath) ? "/" : str_split($curPath, strlen($rootPath));
        $commentVal = "Auto set by Oasys Installer";

        (string)$updatedRootURL = $updatedRootURL[1] ?? $updatedRootURL[0];

        // string checks and fixes
        $updatedRootURL = trim($updatedRootURL);
        $updatedRootURL = (substr($updatedRootURL, 0, 1) != "/") ? "/" . $updatedRootURL : $updatedRootURL;
        $updatedRootURL = (substr($updatedRootURL, -1, 1) != "/") ? $updatedRootURL . "/" : $updatedRootURL;

        // sql to update the rootURL+landingPage vals in 'settings' table
        $stmt = $this->conn->prepare("UPDATE settings SET value = :rootVal,comment = :cmtVal WHERE option='rootURL' OR option='landingPage'");
        $stmt->bindParam(":rootVal", $updatedRootURL);
        $stmt->bindParam(":cmtVal", $commentVal);

        /* exec rootURL and landingPage update */
        try {
            $stmt->execute();
        } catch (PDOException $e) {
            return $e->getMessage();
        }

        return true;
    }

    public function updateDatabasePhp($host, $user, $pass, $name, $dirArr = [])
    {
        foreach ($dirArr as $dir) {

            /* backup existing database.php files */
            if (rename($dir . "database.php", $dir . date("Ymd-His", time()) . "database.php") === false)
                return "Could not rename: <u>database.php</u> to: <u>" . date("Ymd-His", time()) . "database.php" . "</u> in <u>{$dir}</u>. You may have to update your <i>database.php</i> credentials manually.";

            /* build new credentials based on new db connection vars */
            $newCreds = "<?php
                        // credentials for connecting to a database
                        \t \$sql_host = '{$host}';
                        \t \$sql_user = '{$user}';
                        \t \$sql_password = '{$pass}';
                        \t \$sql_db = '{$name}';
                        ?>";

            /* write new database.php file */
            if (file_put_contents($dir . "database.php", $newCreds) === false)
                return "Could not write file: " . $dir . "database.php. You may have to update your <i>database.php</i> credentials manually.";
        }

        return true;
    }

    public function fileCleanup(array $dirClean = [], array $fileClean = [])
    {
        // run our del operations from app root

        // file/glob del routine
        $this->delGlob($fileClean);

        // recursive dir removal
        foreach ($dirClean as $dirVal) {
            $this->delTree($dirVal);
        }
    }

    private function delTree($fileDirDel)
    {
        $fbObjects = array_diff(scandir($fileDirDel), array('.', '..'));

        // internal loop to find and delete the files in the dir
        foreach ($fbObjects as $fdObj) {
            (is_dir("{$fileDirDel}/{$fdObj}")) ? $this->delTree("{$fileDirDel}/{$fdObj}") : unlink("{$fileDirDel}/{$fdObj}");
        }

        // delete the dir after the foreach (file deletes) exits above for said dir
        rmdir($fileDirDel);
    }

    private function delGlob($fileGlobs)
    {
        // we will break open the input arg array and then break open the glob that results from that, then unlink each entry
        foreach ($fileGlobs as $delGlob) {

            foreach (glob($delGlob) as $fileDel) {
                unlink($fileDel);
            }
        }
    }

    public function indexPhpRestore($originalIndex = "index.bkp", $tempIndex = "index.php")
    {
        if (!@copy('../' . $originalIndex, '../' . $tempIndex)) return false;
        return true;
    }
}
