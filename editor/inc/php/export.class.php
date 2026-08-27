<?php

/*
    TITLE:      EXPORT CLASS FOR BACKUP MODULE
    AUTHOR:     NILANJAN NAG
    VERSION:    2.0
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
if (!defined('BACKUP_OPERATION_ID')) {
    define('BACKUP_OPERATION_ID', bin2hex(random_bytes(12)));
}

function oasysBackupTempDir(): string
{
    $instance = substr(hash('sha256', realpath(__DIR__ . '/../../') ?: __DIR__), 0, 16);
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'oasys-backup-' . $instance . DIRECTORY_SEPARATOR . BACKUP_OPERATION_ID;
}

class DbOperationClass
{
    protected $dbCredentials;
    protected $tempDir;

    public function __construct()
    {
        global $app;
        if (!isset($app)) {
            $app = \Oasys\OasysApp::getInstance();
        }
        $this->dbCredentials = $app->getDbConfig();
        $this->tempDir = '';
    }

    protected function getBackupTempDir(): string
    {
        $tempBase = oasysBackupTempDir();

        if (!is_dir($tempBase) && !mkdir($tempBase, 0700, true) && !is_dir($tempBase)) {
            throw new Exception('Could not create temporary backup directory at: ' . $tempBase);
        }

        if (!is_writable($tempBase)) {
            throw new Exception('The temporary backup directory is not writable by the web application service.');
        }

        return $tempBase;
    }

    public function backupTables()
    {
		$this->tempDir = $this->getBackupTempDir();
        ini_set('memory_limit', '-1'); // don't want to hit system memory limits, which is possible with large DBs
        ini_set('max_execution_time', 1800); // 30 minute max execution time (1800 seconds)

        # ------------------------------------------------------------------- #
        # we use shell commands b/c doing the execution in PHP is much slower #
        # ------------------------------------------------------------------- #
        $dumpCmd = null;
        foreach (['mariadb-dump', 'mysqldump'] as $candidate) {
            $probe = @proc_open([$candidate, '--version'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $probePipes);
            if (is_resource($probe)) {
                fclose($probePipes[0]);
                stream_get_contents($probePipes[1]);
                stream_get_contents($probePipes[2]);
                fclose($probePipes[1]);
                fclose($probePipes[2]);
                if (proc_close($probe) === 0) { $dumpCmd = $candidate; break; }
            }
        }
        if ($dumpCmd === null) throw new Exception('Neither mariadb-dump nor mysqldump is available on this system.');

        $sqlFile = $this->tempDir . DIRECTORY_SEPARATOR . 'oasys-backup-' . preg_replace('/[^A-Za-z0-9_.-]/', '_', $this->dbCredentials->db) . '-' . DT_TIME_STAMP . '.sql';
        $errorFile = $this->tempDir . DIRECTORY_SEPARATOR . 'dump-error.log';
        $command = [$dumpCmd, '--user=' . $this->dbCredentials->user, '--host=' . $this->dbCredentials->host,
            '--max_allowed_packet=1GB', '--single-transaction', '--quick', '--lock-tables=false', $this->dbCredentials->db];
        $currentEnvironment = getenv();
        $environment = array_merge(is_array($currentEnvironment) ? $currentEnvironment : [], ['MYSQL_PWD' => (string)$this->dbCredentials->password]);
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', $sqlFile, 'wb'], 2 => ['file', $errorFile, 'wb']], $pipes, null, $environment);
        if (!is_resource($process)) throw new Exception('Unable to start the database dump process.');
        fclose($pipes[0]);
        $dmpRetCode = proc_close($process);

        if ($dmpRetCode === 0) {
            $this->filterDumpDefiners($sqlFile);
            return;
        } else {
            $eMsgFile = file($errorFile);
            $eMsg = ($eMsgFile !== false && !empty($eMsgFile)) ? $eMsgFile[count($eMsgFile) - 1] : "No further information available.";
            @unlink($sqlFile);
            throw new Exception("<strong>Unable to create database snapshot!</strong>\n<br><br>Error message(s):<br><br><strong>{$eMsg}</strong>");
        }
    }

    protected function filterDumpDefiners(string $sqlFile): void
    {
        if (!is_file($sqlFile) || filesize($sqlFile) === 0) throw new Exception('No data from database available!');
        $source = fopen($sqlFile, 'rb');
        $filtered = $sqlFile . '.filtered';
        $target = fopen($filtered, 'wb');
        if (!$source || !$target) throw new Exception('Could not process the database dump file.');
        while (($line = fgets($source)) !== false) {
            if (strpos($line, '50013 DEFINER') === false && fwrite($target, $line) === false) {
                fclose($source); fclose($target); @unlink($filtered);
                throw new Exception('Could not write the filtered database dump file.');
            }
        }
        fclose($source); fclose($target);
        if (!rename($filtered, $sqlFile)) { @unlink($filtered); throw new Exception('Could not finalize the database dump file.'); }
    }

    public function restoreTables($rName)
    {
		$this->tempDir = $this->getBackupTempDir();
        /*

        1.      take in filename to extract sql from
        2.      unzip just the sql file
        3.      execute contents of sql file which is restoring the db back to that particular state
        4.      clean up leftover .sql file from root

         */

        chdir(BKPROOT);

        //  check that filename being sent in matches a snapshot archive file name pattern
        if (basename($rName) !== $rName || preg_match('/^oasys_snapshot_[A-Za-z0-9_.-]+\.zip$/', $rName) !== 1) {
            throw new Exception("<p>The file <strong>{$rName}</strong> does not have a valid name for a snapshot archive.</p>
                <p>Only archive types of <span style='color: red;'>SNAPSHOT</span> may be used for rollbacks.</p>");
        }

        $zipObj = new ZipArchive();

        // verify zip file is openable
        if ($zipObj->open($rName) !== true) {
            throw new Exception("<p>Could not find or access archive file: <code>{$rName}</code>!</p>");
        }

        $sqlFileName = '';
        // get internal .sql file name from the outside .zip file name. they must be the same filename base.
        // using an file iteration  method in case we want to lift 'snapshot type only' restriction later and use the installers as well
        for ($x = 0; $x < $zipObj->numFiles; ++$x) {
            $i_file = $zipObj->getNameIndex($x, ZipArchive::FL_UNCHANGED);
            if (preg_match('/^oasys-backup-[A-Za-z0-9_.-]+\.sql$/', $i_file) === 1) {
                if ($sqlFileName !== '') throw new Exception('Snapshot contains more than one database dump.');
                $sqlFileName = $i_file;
            }
        }

        if ($sqlFileName === '') throw new Exception('Snapshot does not contain a valid database dump.');

        // extract .sql file to the system temp directory so restore processing does not depend on app-root writes
        $tempRestoreFile = $this->tempDir . DIRECTORY_SEPARATOR . $sqlFileName;
        if (!$zipObj->extractTo($this->tempDir, $sqlFileName) || !is_file($tempRestoreFile)) {
            $zipObj->close();
            throw new Exception('Could not extract the database dump from the snapshot.');
        }
        $zipObj->close();

        // use the sql importer method from our restore class to do our snapshot restore operation
        require_once __DIR__ . '/restore.class.php';
        $snRestoreObj = new data_restore();
        if (($restoreResult = $snRestoreObj->restoreSQL($tempRestoreFile)) !== true) {
            @unlink($tempRestoreFile); // in case of exception we don't want this left over in temp storage
            throw new Exception($restoreResult);
        }

        @unlink($tempRestoreFile); // final cleanup of file used for restore
        return $sqlFileName;
    }
}

class FileOperationClass
{
    public $zipFileLoc = '';
    public $lastFileCreated = '';
    public $archiveType = '';
    public $fileErrList = [];
    protected $settings;
    protected $tempDir;

    public function __construct($bkpType)
    {
        global $app;
        if (!isset($app)) {
            $app = \Oasys\OasysApp::getInstance();
        }
        $this->settings = $app->config->getSettingsArray();
        $this->zipFileLoc = BKPROOT . 'oasys_' . $bkpType . '_' . DT_TIME_STAMP . '-' . substr(BACKUP_OPERATION_ID, 0, 8) . '.zip';
        $this->archiveType = $bkpType;
        $this->tempDir = $this->getBackupTempDir();
    }

    protected function getBackupTempDir(): string
    {
        $tempBase = oasysBackupTempDir();

        if (!is_dir($tempBase) && !mkdir($tempBase, 0700, true) && !is_dir($tempBase)) {
            throw new Exception('Could not create temporary backup directory at: ' . $tempBase);
        }

        if (!is_writable($tempBase)) {
            throw new Exception('The temporary backup directory is not writable by the web application service.');
        }

        return $tempBase;
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
        if (!$zipObj->open($destination, ZipArchive::CREATE | ZipArchive::OVERWRITE)) {
            throw new Exception('Could not create destination archive file at: ' . $destination);
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
                $backupSqlFiles = glob($this->tempDir . DIRECTORY_SEPARATOR . 'oasys-backup-*.sql');
                if (count($backupSqlFiles) > 1) {
                    throw new Exception('<p>More than one eligible .SQL file found in the temporary backup directory. Please clean up the stray files and retry.</p>');
                }

                if ($backupSqlFiles && count($backupSqlFiles) > 0) {
                    foreach ($backupSqlFiles as $sqlFile) {
                        if (!$zipObj->addFile($sqlFile, basename($sqlFile))) {
                            throw new Exception('<p>Unable to create snapshot archive! Check for leftover .SQL file(s) in the temporary backup directory and manually remove them.</p>');
                        }
                    }
                } else {
                    throw new Exception('<p>Unable to create snapshot archive! Check for leftover .SQL file(s) in the temporary backup directory and manually remove them.</p>');
                }

                // Snapshot user-generated content from both supported stores.
                foreach (['media', 'customContent'] as $contentDirectory) {
                    $zipObj->addEmptyDir($contentDirectory);
                    if (!is_dir($contentDirectory)) continue;
                    $recDirIter = new RecursiveDirectoryIterator('./' . $contentDirectory . DIRECTORY_SEPARATOR, FilesystemIterator::SKIP_DOTS);
                    $allPkgFiles = new RecursiveIteratorIterator($recDirIter, RecursiveIteratorIterator::SELF_FIRST);
                    foreach ($allPkgFiles as $contentFile) {
                        $archivePath = $this->slashFix($contentFile->getPathname());
                        if ($contentFile->isDir()) {
                            $zipObj->addEmptyDir($archivePath);
                        } elseif (!$zipObj->addFile($contentFile->getPathname(), $archivePath)) {
                            throw new Exception('Unable to add generated-content file: <strong>' . $contentFile->getPathname() . '</strong>');
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

                /* CREATE OUTSIDE ZIP FILE WHICH WILL BE THE ACTUAL INSTALLER + INSTALLER SOURCE 'MASTER' PACKAGE
                    1.  Close our orignal outside zip file
                    2.  Rename existing zip to 'oasys_install_pkg.zip'
                    3.  create new zip which was old zip name
                    4.  add 'oasys_install_pkg.zip'
                    5.  add 'installer.php'
                 */

                //  close out orig zip file if installer, otherwise break switch and continue for fullBackup
                if ($this->archiveType === 'fullBackup') break;
                $zipObj->close();

                $tempInstallerArchiveFile = $this->tempDir . DIRECTORY_SEPARATOR . 'oasys_install_pkg.zip';

                // rename pkg zip to standard generic name
                if (!(rename($destination, $tempInstallerArchiveFile))) {
                    error_clear_last(); // we override the standard fatal error message with our own by wiping out last error
                    throw new Exception('Could not rename original ZIP package <strong>' . basename($destination) . '</strong> to new name <strong>oasys_install_pkg.zip</strong>');
                }

                // create new "outside" zip file with date/time name
                if ($zipObj->open($destination, ZipArchive::CREATE) !== true) {
                    throw new Exception("Unable to create final ZIP package installer archive: <strong>$destination</strong>");
                }

                // add our install pkg zip and remove outsize zip if successful
                if (!$zipObj->addFile($tempInstallerArchiveFile, basename($tempInstallerArchiveFile))) {
                    throw new Exception('Unable to add inside ZIP package archive: <strong>oasys_install_pkg.zip</strong>');
                }

                break;
        }

        # -------------------------------------- #
        # Common operations for all backup types #
        # -------------------------------------- #

        $zipObj->setArchiveComment('Generated ' . strtoupper($this->archiveType) . ' PACKAGE from Oasys Backup Module at: ' . date('Ymd-His', time())); // add comment property and content to our archive

        // Force adding the version file regardless of package type for reading later
        $zipObj->addFile('oasys_ver.txt');

        // Add database version file for reading and comparison later
        $dbVer = $this->settings['database_version'];
        $dbVerPath = $this->tempDir . DIRECTORY_SEPARATOR . 'db_ver.txt';

        file_put_contents($dbVerPath, $dbVer);
        $zipObj->addFile($dbVerPath, 'db_ver.txt');

        /* try and close out the file; if successful, remove temporary SQL export files and metadata */
        if ($zipObj->close()) {
            $rmFiles = glob($this->tempDir . DIRECTORY_SEPARATOR . 'oasys-backup-*.sql');
            if ($this->archiveType === 'installer') {
                $rmFiles[] = $this->tempDir . DIRECTORY_SEPARATOR . 'oasys_install_pkg.zip';
            }
            foreach ($rmFiles as $rmFile) {
                @unlink($rmFile);
            }
            @unlink($dbVerPath);

            error_clear_last(); // we don't want to throw an error if a file's not there

            /* Finally move ZIP archive file to docroot */
            // if (!rename($destination, BKPROOT . basename($destination))) throw new Exception('Could not move ZIP backup file to document root directory!');

            $this->lastFileCreated = basename($destination);
        }
    }

    private function slashFix($slash)
    {
        $slash = str_replace('.\\', '', $slash);
        $slash = str_replace('\\', '/', $slash);
        $slash = str_replace('./', '', $slash); // absolute must for unix filepath systems!

        return $slash;
    }

    private function filePathFilter($fPath, bool $filterPaths = true)
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
        if (basename($fileToDelete) !== $fileToDelete || preg_match('/^oasys_(snapshot|fullBackup|installer)_[A-Za-z0-9_.-]+\.zip$/', $fileToDelete) !== 1) {
            throw new Exception("<p>This is not a valid removable archive: <code style='font-weight: bold; margin-top: 2em;'>{$fileToDelete}</code></p>");
        }

        $delfFullName = BKPROOT . $fileToDelete;

        if (!file_exists($delfFullName)) {
            throw new Exception("<p>Could not find the archive file to delete: <code style='font-weight: bold; margin-top: 2em;'>{$fileToDelete}</code></p>");
        }

        if (!unlink($delfFullName)) {
            throw new Exception("Could not delete the archive file: {$fileToDelete}!");
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

            // Retrive internal ZIP archive comment
            $commentOpen = $zipComment->open(basename($zipFile));
            $zipFileList[$key]['comment'] = $commentOpen === true ? $zipComment->getArchiveComment(ZipArchive::FL_UNCHANGED) : '';
            $zipFileList[$key]['actionButtons'][0]['hiddenData'] = ($key + 1);
            $zipFileList[$key]['actionButtons'][0]['name'] = 'download';
            $zipFileList[$key]['actionButtons'][0]['classes'] = 'dlSortableTableIcon';

            $zipFileList[$key]['actionButtons'][1]['hiddenData'] = ($zipFileList[$key]['type'] === 'Snapshot') ? $zipFileList[$key]['db_ver'] : false;
            $zipFileList[$key]['actionButtons'][1]['name'] = 'restore';
            $zipFileList[$key]['actionButtons'][1]['classes'] = 'rsSortableTableIcon';

            if ($commentOpen === true) $zipComment->close();
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
                if (!isset($verMatch[2])) {
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
