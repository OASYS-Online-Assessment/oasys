<?php

/*
    TITLE:      RESTORE CLASS FOR BACKUP MODULE
    AUTHOR:     NILANJAN NAG
    VERSION:    2.0
    DESC:       Main controller for data restore operations requested
                by the backup module. This class is responsible for 
                handling the main restore operations, such as executing 
                the SQL import file, updating the rootURL and landingPage 
                values in the settings table, updating the database.php 
                credentials, and performing file cleanup operations.

                A separate self-contained (older but still comatible)
                version of this class exists in the Upgrader 'index.php'
                code file for new installations.

                This file contains 1 class: 'data_restore'.
                The class is fairly self-explanatory as far as its
                respective purpose.
 */

class data_restore
{
    private rixPDO $db;

    function __construct()
    {
        // max 30 minute execution time for large DBs
        set_time_limit(1800);

        // initialize the OasysApp instance to access the database connection
        global $app;

        if (!isset($app)) {
            $app = \Oasys\OasysApp::getInstance();
        }

        // determine the correct constant for buffered query attr, as it is different in older Php versions
        $bufferedQueryAttr = defined('Pdo\\Mysql::ATTR_USE_BUFFERED_QUERY')
            ? constant('Pdo\\Mysql::ATTR_USE_BUFFERED_QUERY')
            : (defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY') ? PDO::MYSQL_ATTR_USE_BUFFERED_QUERY : 1000);

        // setup db init config parameters
        $dbInitConfig = ["attributes" => [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, // throw exceptions on errors which may help prevent half finished or corrupted restores
            PDO::ATTR_EMULATE_PREPARES => true, // this is required for some queries to work properly, especially with large DBs
            $bufferedQueryAttr => false // this helps with avoiding memory issues with large DBs, but may cause issues with some queries
        ]];

        // initialize the database connection for restore operations
        try {
            $this->db = $app::createDatabaseInstance('restore', $dbInitConfig);
        } catch (RuntimeException $e) {
            throw new Exception($e->getMessage());
        }
    }

    public function restoreSQL(string $sqlImportFile): true|string
    {
        $query = file_get_contents($sqlImportFile);
        if ($query === false || trim($query) === '') {
            return 'The snapshot SQL file is missing or empty.';
        }

        // no memory limit restrictions for this operation, as it can be intensive for large DBs
        ini_set('memory_limit', '-1');

        try {
            $result = $this->db->executeBatch($query);
            if (!empty($result['error']) || (($result['data']['totalErrors'] ?? 0) > 0)) {
                return $result['errorMsg'] ?? 'One or more SQL statements failed during restoration.';
            }
        } catch (RuntimeException $e) {
            return ($e->getMessage());
        }
        return true;
    }
}
