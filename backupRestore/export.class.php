<?php

/*
    TITLE:      EXPORT CLASS FOR BACKUP MODULE
    AUTHOR:     NILANJAN NAG
    BUILT:      2019-05-07 11:01:16
    VERSION:    1.1
    DESC:       Main controller for client UI (upgrader.js) which
                handles all export / archive creation functions
                for Oasys Backup module. Also references restore.class.php
                which handles snapshot restoration operation.

                This file contains 2 classes: 'DbOperationClass' and 'FileOperationClass'.
                Each of the classes are fairly self-explanatory as far as their
                respective purpose.
 */

// initializes a static date+time stamp value to name our database export and filesystem archive outputs
define('DT_TIME_STAMP', date('Ymd-His', time()));

class DbOperationClass
{
    public $host = '';
    public $username = '';
    public $passwd = '';
    public $dbName = '';
    public $charset = '';
    public $conn = null;

    public function __construct($host, $username, $passwd, $dbName, $charset = 'utf8mb4')
    {
        $this->host = $host;
        $this->username = $username;
        $this->passwd = $passwd;
        $this->dbName = $dbName;
        $this->charset = $charset;
        $this->initializeDb();
    }

    protected function initializeDb()
    {
        try {
            $this->conn = new PDO(
                'mysql:host=' . $this->host . ';dbname=' . $this->dbName . ';charset=utf8mb4',
                $this->username,
                $this->passwd,
                []
            );
        } catch (PDOException $e) {
            throw new Exception($e->getMessage());
        }
    }

    public function backupTables()
    {
        ini_set('memory_limit', '-1'); // don't want to hit system memory limits, which is possible with large DBs
        ini_set('max_execution_time', 1800); // 30 minute max execution time (1800 seconds)

        # ----------------------------------------------------------------- #
        # first try shell command b/c it's 100x faster than the next method #
        # ----------------------------------------------------------------- #
        $escPwd = addcslashes($this->passwd, '$"'); // need to escape $ since it messes with Php intepretation, and " since we're wrapping the pwd in "
        exec("mysqldump --user={$this->username} --password=\"{$escPwd}\" --host={$this->host} {$this->dbName} --max_allowed_packet=1GB --lock-tables=false --log-error=\"../logs/bkp_export_error.log\"", $dmpOut, $dmpRetCode);
        unset($escPwd);

        if ($dmpRetCode === 0) {
            // filter out 'definer' definition for view backup which causes issues on db restoration
            foreach ($dmpOut as $key => $value) {
                if (strpos($value, "50013 DEFINER") !== false) unset($dmpOut[$key]);
            }

            $final = implode("\n", $dmpOut);
            $this->saveBackup($final);
            return;
        } else {
            /* get the last line of the backup error file to send back */
            $eMsgFile = file("../logs/bkp_export_error.log");
            $eMsg = $eMsgFile[count($eMsgFile) - 1];
            throw new Exception("<strong>Unable to create database snapshot!</strong><br><br>Error message(s):<br><br><strong>{$eMsg}</strong>");
            exit;
        }

        # ------------------------------------------------------------------------------------------------------- #
        # alt method to export (slow); this is not in use anymore but being kept around just in case of emergency #
        # ------------------------------------------------------------------------------------------------------- #

        /* 
            $tables = array();
            $stmt = $this->conn->prepare('SHOW TABLES');
            $stmt->execute();
            $qresult = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($qresult as $k => $v) {
                array_push($tables, array_values($v)[0]);
            }

            $sql = "\n\n";
            $sql .= "SET FOREIGN_KEY_CHECKS=0;\n\n";

            foreach ($tables as $table) {

                $sql .= "DROP TABLE IF EXISTS `" . $table . "`;";
                $sql .= "\nDROP TABLE IF EXISTS `" . strtolower($table) . "`;";
                $sql .= "\nDROP TABLE IF EXISTS `" . strtoupper($table) . "`;"; // windows/unix case issues... these 2 statements makes sure most case combos get nuked
                $stmt = $this->conn->prepare('SHOW CREATE TABLE ' . $table);
                $stmt->execute();
                $qresult = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $sql .= "\n\n" . $qresult[0]['Create Table'] . ";\n\n";

                $stmt = $this->conn->prepare('SELECT * FROM ' . $table);
                $stmt->execute();
                $qresult = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $numFields = $stmt->columnCount();

                $sql .= "ALTER TABLE `" . $table . "` DISABLE KEYS;\n\n";
                $sql .= "BEGIN;\n"; // BEGIN/COMMIT block + key disable should speed things up a bit

                foreach ($qresult as $row) {
                    $keys = '';
                    $values = '';
                    $i = 0;
                    foreach ($row as $key => $value) {
                        // $id = $row['id']; // moving this line down to the blobtype check block to avoid fatal exception throws when $row['id] doesn't exist!
                        $query = $this->conn->prepare('SELECT data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = "' . $table . '" and COLUMN_NAME="' . $key . '" AND TABLE_SCHEMA="' . $this->dbName . '"');
                        $query->execute();
                        $queryresult = $query->fetchAll(PDO::FETCH_ASSOC);
                        $datatype = $queryresult[0]['data_type'];

                        if (strpos($datatype, 'blob') !== false) {
                            $id = $row['id'];
                            $blobquery = $this->conn->prepare('SELECT HEX(' . $key . ') from ' . $table . ' where id=' . $id);
                            $blobquery->execute();
                            $blobqueryresult = $blobquery->fetchAll(PDO::FETCH_ASSOC);
                            $hexvalue = $blobqueryresult[0]['HEX(blobdata)'];

                            if ($value != '') {
                                $value = '0x' . $hexvalue;
                            }
                            if (isset($value)) {
                                if ($value != null) {
                                    $values .= $value;
                                } else {
                                    $values .= 'NULL';
                                }
                            } else {
                                $values .= "''";
                            }
                        } elseif (strpos($datatype, 'text') !== false) {
                            $value = addslashes($value);
                            $value = str_replace(array("\r", "\n", "\t"), array('\\r', '\\n', '\\t'), $value);
                            if (isset($value)) {
                                $values .= "'" . $value . "'";
                            } else {
                                $values .= "''";
                            }
                        } else {
                            $value = addslashes($value);
                            $value = str_replace(array("\r", "\n", "\t"), array('\\r', '\\n', '\\t'), $value);
                            if (isset($value)) {
                                if ($value != null) {
                                    $values .= "'" . $value . "'";
                                } else {
                                    $values .= 'NULL';
                                }
                            } else {
                                $values .= "''";
                            }
                        }

                        if ($key === 'default') {
                            $key = '`default`';
                        }
                        if ($key === 'option') {
                            $key = '`option`';
                        }
                        $keys .= $key;
                        if ($i < ($numFields - 1)) {
                            $values .= ',';
                            $keys .= ',';
                        }
                        ++$i;
                    }

                    $sql .= 'INSERT INTO ' . $table . ' (' . $keys . ') VALUES(' . $values . ')';
                    $sql .= ";\n";
                }

                $sql .= "COMMIT;\n";
                $sql .= "ALTER TABLE `" . $table . "` ENABLE KEYS;\n";

                $sql .= "\n\n";
            }
            $this->saveBackup($sql);
            // return $this->saveBackup($sql);
        */
    }

    protected function saveBackup(&$sql)
    {
        // check if our sql file is blank or not
        if (!$sql) {
            throw new Exception('An error has occured. No data from database available!');
            exit;
        }

        // try to cretae SQL export/import file
        try {
            $sqlFile = DOCROOT . 'oasys-backup-' . $this->dbName . '-' . DT_TIME_STAMP . '.sql';
            $bkpFileHandle = fopen($sqlFile, 'w+');
            if (!$bkpFileHandle) {
                throw new Exception('Specified target folder is not available or rights are not sufficient!');
            }
            if (!fwrite($bkpFileHandle, $sql)) {
                throw new Exception('Could not write database file!');
            }
            fclose($bkpFileHandle);
        } catch (Exception $e) {
            throw new Exception($e->getMessage());
        }
    }

    public function restoreTables($rName)
    {
        /*

        1.      take in filename to extract sql from
        2.      unzip just the sql file
        3.      execute contents of sql file which is restoring the db back to that particular state
        4.      clean up leftover .sql file from root

         */

        chdir(BKPROOT);

        //  check that filename being sent in matches a snapshot archive file name pattern
        if (preg_match('/^oasys_snapshot_.+\.zip$/', $rName) === 0) {
            throw new Exception("<p>The file <strong>{$rName}</strong> does not have a valid name for a snapshot archive.</p>
                <p>Only archive types of <span style='color: red;'>SNAPSHOT</span> may be used for rollbacks.</p>");
            exit;
        }

        $zipObj = new ZipArchive();

        // verify zip file is openable
        if ($zipObj->open($rName) !== true) {
            throw new Exception("<p>Could not find or access archive file: <code>{$rName}</code>!</p>");
            exit;
        }

        $sqlFileName = '';
        // get internal .sql file name from the outside .zip file name. they must be the same filename base.
        // using an file iteration  method in case we want to lift 'snapshot type only' restriction later and use the installers as well
        for ($x = 0; $x < $zipObj->numFiles; ++$x) {
            $i_file = str_replace('/', '', $zipObj->getNameIndex($x, ZipArchive::FL_UNCHANGED));
            if (preg_match("/^oasys-backup-.+\.sql/", $i_file)) {
                $sqlFileName = str_replace('/', '', $zipObj->getNameIndex($x));
            }
        }

        // extract .sql file to app root (remember we chdir'd earlier)

        $zipObj->extractTo('./', $sqlFileName);
        $zipObj->close();

        // back from whence we came

        // use the sql importer method from our restore class to do our snapshot restore operation
        require_once 'restore.class.php';
        global $sql_db, $sql_host, $sql_password, $sql_user;
        $snRestoreObj = new data_restore($sql_host, $sql_user, $sql_password, $sql_db);
        if (!$snRestoreObj->restoreSQL($sqlFileName)) {
            unlink($sqlFileName); // in case of exception we don't want this left over in the root
            throw new Exception('Sorry, could not sucessfully restore this snapshot.');
        }

        unlink($sqlFileName); // final cleanup of file used for restore
        return $sqlFileName;
    }
}

class FileOperationClass
{
    public $zipFileLoc = '';
    public $lastFileCreated = '';
    public $archiveType = '';
    public $fileErrList = [];

    public function __construct($bkpType)
    {
        $this->zipFileLoc = BKPROOT . 'oasys_' . $bkpType . '_' . DT_TIME_STAMP . '.zip';
        $this->archiveType = $bkpType;
    }

    /**
     * Inspired by and customized from https://stackoverflow.com/questions/1334613/how-to-recursively-zip-a-directory-in-php
     * which does the heavy lifting for the zip creation.
     * @param string $source The source directory in which we launch our backup operations.
     * @param string $destination The name of the ZIP file to which we are writing our backup contents.
     */
    public function ZipUp($source, $destination)
    {
        // $source .= "/oatest/"; // DEBUG: just temporary to speed up zipping tests!

        /*
            ##########################################################################################
            OPERATIONS COMMON TO EITHER/ANY SWITCH CASE
            ##########################################################################################
        */

        chdir($source); // launch all operations from oasys web root, which is hopefully what $source is at this point

        // create our primary zip file to add contents depending on $archiveType switch case
        $zipObj = new ZipArchive();
        if (!$zipObj->open($destination, ZipArchive::CREATE)) {
            throw new Exception('Could not create destination archive file at: ' . $destination);
            exit;
        }

        // ----------------------------------------------------------------------------------------- #
        // ----------------------------------                                                        #
        // SWITCH CASE CHECK ON ARCHIVE TYPE:                                                        #
        // ----------------------------------                                                        #
        // SNAPSHOT: only zip up .sql file                                                           #
        // INSTALLER: zip up .sql file and entire file structure, and add installer package to root  #
        // FULLBACKUP: zip up .sql file and entire file structure                                    #
        // ----------------------------------------------------------------------------------------- #

        switch ($this->archiveType) {
                // ---------------- #
                // Snapshot builder #
                // ---------------- #
            case 'snapshot':
                chdir('..');
                if (count(glob('oasys-backup*.sql')) > 1) {
                    throw new Exception('<p>More than one eligible .SQL file found in root. Please clean up the directory of stray files and retry.');
                    exit;
                }

                $sqlFiles = glob('oasys-backup-*.sql');
                if ($sqlFiles && count($sqlFiles) > 0) {
                    foreach ($sqlFiles as $sqlFile) {
                        if (!$zipObj->addFile($sqlFile)) {
                            throw new Exception('<p>Unable to create snapshot archive! Check for leftover .SQL file(s) in your Oasys web application root and manually remove them.</p>');
                        }
                    }
                } else {
                    throw new Exception('<p>Unable to create snapshot archive! Check for leftover .SQL file(s) in your Oasys web application root and manually remove them.</p>');
                }

                // media backup
                if (is_dir("media")) {
                    $recDirIter = new RecursiveDirectoryIterator('./media' . DIRECTORY_SEPARATOR, 0);
                    $allPkgFiles = new RecursiveIteratorIterator(($recDirIter), RecursiveIteratorIterator::SELF_FIRST);

                    foreach ($allPkgFiles as $pkgInstallerFile) {

                        if (!is_dir($pkgInstallerFile)) {
                            $crazyVar = substr(explode('./', $pkgInstallerFile->getPathname())[1], 0);
                            if (!$zipObj->addFile($pkgInstallerFile, $this->slashFix($crazyVar))) {
                                throw new Exception("Unable to add Installer Package file: <strong>$pkgInstallerFile</strong>");
                            }
                        }
                    }
                }

                break;

                // ----------------- #
                // Installer builder #
                // ----------------- #

            case 'fullBackup':
            case 'installer':

                /* !! installer disabled for the time being !! */

                chdir('..');

                //NOTE: will not include empty directories - limitation of RecursiveIteratorIterator...(?)

                $recDirIter = new RecursiveDirectoryIterator('./', 0);
                $allFiles = new RecursiveIteratorIterator($recDirIter, RecursiveIteratorIterator::SELF_FIRST);
                $fileResult = [];

                /* nested function calling another function to determine if particular file or path should be filtered out */
                foreach ($allFiles as $file2zip) {
                    if (is_dir($file2zip) || ($this->filePathFilter($file2zip->getPathname()) !== false)) {
                        continue;
                    }

                    $fileResult[] = $file2zip->getPathname();

                    //$fileResult = preg_grep("/^db\/backupRestore\/tmpPrepare/", $fileResult, PREG_GREP_INVERT); // alt unused regex method for filtering; slower
                }

                /* MAIN FILE ARRAY ADD TO ZIP ROUTINE AND CONVERT SLASHES TO FWD (BECOMES WINDOWS & *NIX COMPATIBLE) */
                foreach ($fileResult as $zipAddFile) {
                    if (!$zipObj->addFile($this->slashFix($zipAddFile))) {
                        $this->fileErrList[] = $zipAddFile;
                        // throw new Exception("Could not add file to destination archive: " . $zipAddFile); // this caused too many err notifications
                    }
                }

                /*
                ######################################################################################################
                POST ARCHIVE OPERATIONS: Recreate filtered folders, renames to prep for installer package, etc.
                ######################################################################################################
                 */

                /* put back dirs that were removed but are required to be present, and put in the default permissions */
                foreach (['logs', 'pkg_installer/downloads'] as $dirVal) {
                    if (!$zipObj->addEmptyDir($dirVal)) {
                        error_clear_last(); // we override the standard fatal error message with our own by wiping out last error
                        throw new Exception("Could not add '{$dirVal}/' directory back into ZIP archive");
                    } else {
                        $zipObj->getExternalAttributesName($dirVal, $opsys, $attr);
                        // the 17917 is the non-bit shifted decimal representation of the octal 775 which is our target setting
                        $zipObj->setExternalAttributesName($dirVal, ZipArchive::OPSYS_UNIX, '17917' << 16);
                    }
                }


                // rename internal index to bkp to restore later on install; remove old bkp file if it exists
                if (file_exists("index.bkp")) unlink("index.bkp");

                if (!$zipObj->renameName('index.php', 'index.bkp')) {
                    throw new Exception('<p>Could not internally rename <strong>index.php</strong> to <strong>index.bkp</strong>, which is required</p>');
                }
                // DEBUG: OUTPUT ARRAY OF WHAT THE INTERNAL FILE NAMES ARE INSIDE ZIP

                // for ($i = 0; $i < $zipObj->numFiles; $i++) {
                //     $tmpOut[] = $zipObj->getNameIndex($i);
                // }

                // file_put_contents("attr.txt", "\n\n" . print_r($tmpOut, true), FILE_APPEND);

                /* CREATE OUTSIDE ZIP FILE WHICH WILL BE THE ACTUAL INSTALLER + INSTALLER SOURCE 'MASTER' PACKAGE
                    1.  Close our orignal outside zip file
                    2.  Rename existing zip to 'oasys_install_pkg.zip'
                    3.  create new zip which was old zip name
                    4.  add 'oasys_install_pkg.zip'
                    5.  add 'installer.php'

                    A.  todo: in future, may have to have various JS includes in installer pkg if non-internet enabled installed a requirement
                 */

                //  close out orig zip file if installer, otherwise break switch and continue for fullBackup
                if ($this->archiveType === 'fullBackup') break;
                $zipObj->close();

                // rename pkg zip to standard generic name
                if (!(rename($destination, 'oasys_install_pkg.zip'))) {
                    error_clear_last(); // we override the standard fatal error message with our own by wiping out last error
                    throw new Exception('Could not rename original ZIP package <strong>' . basename($destination) . '</strong> to new name <strong>oasys_install_pkg.zip</strong>');
                }

                // create new "outside" zip file with date/time name
                if ($zipObj->open($destination, ZipArchive::CREATE) !== true) {
                    throw new Exception("Unable to create final ZIP package installer archive: <strong>$destination</strong>");
                }

                // add our install pkg zip and remove outsize zip if successful
                if (!$zipObj->addFile('oasys_install_pkg.zip')) {
                    throw new Exception('Unable to add inside ZIP package archive: <strong>oasys_install_pkg.zip</strong>');
                }

                /* !! not doing installer pkg stuff for the time being, so this last section skipped */

                /* MAIN INSTALLER PACKAGE FILES ADD TO ZIP ROUTINE */
                /* THIS IS AN ABSURD IMPLEMENTATION. LEARN RECURSIVEDIRECTORYITERATOR BETTER!!!! -NN TO SELF */
                /**
                 * @var Traversable
                 */
                // $recDirIter = new RecursiveDirectoryIterator($source . 'installer_pkg' . DIRECTORY_SEPARATOR, 0);
                // $allPkgFiles = new RecursiveIteratorIterator(($recDirIter), RecursiveIteratorIterator::SELF_FIRST);
                // foreach ($allPkgFiles as $pkgInstallerFile) {
                //     if (!is_dir($pkgInstallerFile)) {
                //         $crazyVar = substr(explode($source . 'installer_pkg', $pkgInstallerFile->getPathname())[1], 1);
                //         if (!$zipObj->addFile($pkgInstallerFile, $this->slashFix($crazyVar))) {
                //             throw new Exception("Unable to add Installer Package file: <strong>$pkgInstallerFile</strong>");
                //         }
                //     }
                // }

                /* MORE DEBUG / TEST STUFF */

                // $allPkgFiles->rewind();

                // while ($allPkgFiles->valid()) {
                //     if (!$allPkgFiles->isDot()) {
                //         file_put_contents("debug.log", $allPkgFiles->getSubPathName() . "\n");
                //     }
                //     $allPkgFiles->next();
                // }

                break;

                // --------------------- #
                // Full file/db snapshot #
                // --------------------- #
        }

        # -------------------------------------- #
        # Common operations for all backup types #
        # -------------------------------------- #

        $zipObj->setArchiveComment('Generated ' . strtoupper($this->archiveType) . ' PACKAGE from Oasys Backup Module at: ' . date('Ymd-His', time())); // add comment property and content to our archive

        // Force adding the version file regardless of package type for reading later
        $zipObj->addFile('oasys_ver.txt');

        // Add database version file for reading and comparison later
        global $settings;
        $dbVer = $settings['database_version'];

        file_put_contents('db_ver.txt', $dbVer);
        $zipObj->addFile('db_ver.txt');

        /* try and close out the file; if successful, remove the SQL export file from docroot location as a cleanup task */
        if ($zipObj->close()) {
            $rmFiles = glob(DOCROOT . 'oasys-backup-*.sql'); // if there's any left over SQL file in docroot, clean up
            if ($this->archiveType === 'installer')  $rmFiles[] = 'oasys_install_pkg.zip'; // cleanup for full file archive types
            foreach ($rmFiles as $rmFile) {
                @unlink($rmFile);
            }
            unlink("db_ver.txt");

            error_clear_last(); // we don't want to throw an error if a file's not there

            /* Finally move ZIP archive file to docroot */
            // if (!rename($destination, BKPROOT . basename($destination))) throw new Exception('Could not move ZIP backup file to document root directory!');

            $this->lastFileCreated = basename($destination);
        }

        /*
            ##########################################################################################
            some other zipArchive properties if ever wanting to return add'l info.
            ##########################################################################################
         */

        /*
            NUMBER OF FILES: {$zipObj->numFiles}
            STATUS: {$zipObj->status}
            SYSTEM STATUS: {$zipObj->statusSys}
            FILENAME: {$zipObj->filename}
            ARCHIVE COMMENT: {$zipObj->comment}
         */
    }

    private function slashFix($slash)
    {
        $slash = str_replace('.\\', '', $slash);
        $slash = str_replace('\\', '/', $slash);
        $slash = str_replace('./', '', $slash); // absolute must for unix filepath systems!

        return $slash;
    }

    private function filePathFilter($fPath, BOOL $filterPaths = true)
    {
        /* FILE pattern filter */
        $filterArr = array(
            'oasys_snapshot_',
            'oasys_installer_',
            'oasys_fullBackup_',
            '.gitignore',
        );

        /* DIRECTORY pattern filter */
        if ($filterPaths) {
            $filterArr[] = 'logs' . DIRECTORY_SEPARATOR; // filter out all log files /logs
            $filterArr[] = '.git' . DIRECTORY_SEPARATOR; // filter out all dev /.git files
            $filterArr[] = '.vscode' . DIRECTORY_SEPARATOR; // filter out all Visual Studio Code editor files
            $filterArr[] = 'pkg_installer' . DIRECTORY_SEPARATOR . 'downloads' . DIRECTORY_SEPARATOR; // filter out all package downloads
            $filterArr[] = '.phan' . DIRECTORY_SEPARATOR; // filter out all Php static analysis library files
        }

        foreach ($filterArr as $faItem) {
            if (strpos($fPath, $faItem) !== false) {
                return strpos($fPath, $faItem);
            }
        }

        return false;
    }

    public static function delArchive($fileToDelete)
    {
        // lock down the delete routine just a bit to prevent param injections to destroy other system files
        if ((substr($fileToDelete, 0, 15) !== 'oasys_snapshot_') && (substr($fileToDelete, 0, 16) !== 'oasys_installer_') && (substr($fileToDelete, 0, 16) !== 'oasys_fullBackup')) {
            throw new Exception("<p>This is not a valid removable archive: <code style='font-weight: bold; margin-top: 2em;'>{$fileToDelete}</code></p>");
        }

        $delfFullName = BKPROOT . $fileToDelete;

        if (!file_exists($delfFullName)) {
            throw new Exception("<p>Could not find the archive file to delete: <code style='font-weight: bold; margin-top: 2em;'>{$fileToDelete}</code></p>");
            exit;
        }

        if (!unlink($delfFullName)) {
            throw new Exception("Could not delete the archive file: {$fileToDelete}!");
            exit;
        }

        return $fileToDelete;
    }

    public static function getArchiveList()
    {
        //  goto docroot -> read all *.zip files -> return as $results['data'] object
        chdir(BKPROOT);

        $docrootTmp = glob('./oasys_*.zip'); // get initial file list
        $docrootArr = []; // temp array to hold file date and file list
        $docrootList = []; // the final target array which will be used to iterate all our properties

        // create array as [modify_date => filename]
        foreach ($docrootTmp as $k => $v) {
            $docrootArr[$v] = filemtime($v);
        }
        // krsort($docrootArr); //NOTE: This sort will put newest file at top of list. use ksort($arr) to put newest file in last position
        arsort($docrootArr); //NOTE: This sort will put newest file at top of list. use asort($arr) to put newest file in last position

        // put sorted values from array back into clean array with 0-based key index
        foreach ($docrootArr as $key => $zipFile) {
            $docrootList[] = $key;
        }

        $zipFileList = []; // array to hold iterated file name properties eventually transferred to our $returnData
        $zipComment = new ZipArchive(); // for zipfile comment reading
        $instCount = 0;
        $snapCount = 0;
        $fullCount = 0;

        foreach ($docrootList as $key => $zipFile) {
            // if (pathinfo($zipFile, PATHINFO_EXTENSION) !== "zip") continue; // unused routine to filter out non-zip, went with glob method above instead
            // (int)$key += 1; // lost one day of work from debugging to realize that id must be > 0, and the index here starts at 0
            // $zipFileList[$key]['filename']['id'] = $key;
            $zipFileList[$key]['filename'] = basename($zipFile);
            $zipFileList[$key]['created'] = date('Y-m-d H:i:s', filectime($zipFile));
            $zipFileList[$key]['size'] = number_format((filesize($zipFile) / 1048576), 2) . ' MB';
            $zipFileList[$key]['version'] = FileOperationClass::getVer($zipFile);
            $zipFileList[$key]['db_ver'] = FileOperationClass::getDbVer($zipFile);
            $zipFileList[$key]['hiddenID'] = $key + 1; // +1 for js index ref use

            // determine archive type based on filename prefix
            if (strpos(basename($zipFile), 'oasys_snapshot_') !== false) {
                $zipFileList[$key]['type'] = 'Snapshot';
                ++$snapCount;
            } elseif (strpos(basename($zipFile), 'oasys_installer_') !== false) {
                $zipFileList[$key]['type'] = 'Installer';
                ++$instCount;
            } elseif (strpos(basename($zipFile), 'oasys_fullBackup_') !== false) {
                $zipFileList[$key]['type'] = 'Full Backup';
                ++$fullCount;
            } else {
                $zipFileList[$key]['type'] = 'Unknown'; // this should never be shown on the fetch display list
            }

            // Retrive internal ZIP archive comment to output to JS UI
            $zipComment->open(basename($zipFile));
            $zipFileList[$key]['comment'] = $zipComment->getArchiveComment(ZipArchive::FL_UNCHANGED);
            // $zipFileList[$key]['download'] = "<a href='#'><img height='100%' style='padding-left: 27px; cursor: pointer;' src='../images/flexSectionToolBar/ic_flex_tb_download.png' onclick='dlZip(" . ($key + 1) . ")'></a>";
            // $zipFileList[$key]['download'] = ($key + 1);
            $zipFileList[$key]['actionButtons'][0]['hiddenData'] = ($key + 1);
            $zipFileList[$key]['actionButtons'][0]['name'] = 'download';
            $zipFileList[$key]['actionButtons'][0]['classes'] = 'dlSortableTableIcon';

            // do not display restore 'wizard' icon if type is 'installer'; only for 'snapshot'
            // $zipFileList[$key]['restore'] = ($zipFileList[$key]['type'] === 'Snapshot')
            //     ? "<a href='#'><img height='100%' style='padding-left: 8px; cursor: pointer; padding-top: 1px;' src='../images/flexSectionToolBar/ic_flex_tb_restore.png' onclick=\"snRestore(" . ($key + 1) . ",'" . $zipFileList[$key]['db_ver'] . "')\"></a>"
            //     : "<a href='#'><div style='height: 25px; width: 33px; padding-left: 8px;')'></a>";
            $zipFileList[$key]['actionButtons'][1]['hiddenData'] = ($zipFileList[$key]['type'] === 'Snapshot') ? $zipFileList[$key]['db_ver'] : false;
            $zipFileList[$key]['actionButtons'][1]['name'] = 'restore';
            $zipFileList[$key]['actionButtons'][1]['classes'] = 'rsSortableTableIcon';

            // $zipFileList[$key]['remove'] = "<a href='#'><img height='100%' style='padding-left: 13px;' src='../images/deleteHover.png' onclick='deleteZip(" . ($key + 1) . ")'></a>";
            $zipComment->close();
        }

        // $zipFileList['installerCount'] = $instCount;
        $zipFileList['snapshotCount'] = $snapCount;
        $zipFileList['fullbkpCount'] = $fullCount;

        return $zipFileList;
    }

    public static function getDbVer(String $zipFile): string
    {
        $verDbVar = null;

        $zObj = new zipArchive;
        $zfRes = $zObj->open($zipFile);

        if ($zfRes) {

            $verValue = $zObj->getFromName("db_ver.txt");
            if ($verValue === false) {
                return "VER FILE MISSING!";
            } else {
                return $verValue;
            }
        } else {
            return "INVALID ARCHIVE!!";
        }
    }

    public static function getVer(String $zipFile): string
    {
        $zObj = new ZipArchive;
        $zfRes = $zObj->open($zipFile);

        if ($zfRes) {
            $verValue = $zObj->getFromName("oasys_ver.txt");

            if ($verValue === false) {
                return "VER FILE MISSING!";
            } else {
                preg_match('/(vshort=v?)(.+.)$/m', $verValue, $verMatch);
                if (is_null($verValue[2])) {
                    return "BAD VER FILE!";
                } else {
                    return $verMatch[2];
                }
            }
        } else {
            return "INVALID ARCHIVE!";
        }
    }
}
