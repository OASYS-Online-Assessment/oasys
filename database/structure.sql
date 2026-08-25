/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.2-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: oasys
-- ------------------------------------------------------
-- Server version	11.8.2-MariaDB

SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT ;
SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS ;
SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION ;
SET NAMES utf8mb4 ;
SET @OLD_TIME_ZONE=@@TIME_ZONE ;
SET TIME_ZONE='+00:00' ;
SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 ;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 ;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' ;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `activity`
--

DROP TABLE IF EXISTS `activity`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `activity` (
  `loginId` int(11) DEFAULT NULL COMMENT 'foreign key id of testee',
  `passwordId` int(11) NOT NULL COMMENT 'foreign key id of password',
  `testId` int(11) NOT NULL COMMENT 'foreign key id of test',
  `timeLimit` int(11) DEFAULT -1,
  `tsLoginServer` timestamp(3) NULL DEFAULT current_timestamp(3) COMMENT 'timestamp of the last login',
  `tsActiveServer` timestamp(3) NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3) COMMENT 'timestamp of last contact with server',
  `timeLeftAtLogin` int(11) DEFAULT NULL COMMENT 'seconds left at last login',
  `timeLeft` int(11) DEFAULT NULL COMMENT 'seconds left at last contact with server (-1 = unlimited)',
  `tsFirstLoginServer` timestamp(3) NULL DEFAULT current_timestamp(3) COMMENT 'timestamp of the first login',
  `serialNumber` varchar(13) DEFAULT NULL,
  `lastPayloadId` int(255) DEFAULT 0,
  `lastEventId` int(11) DEFAULT NULL,
  `progress` float(255,2) DEFAULT NULL,
  `currentItem` int(11) DEFAULT NULL,
  `language` varchar(255) DEFAULT NULL,
  `clientOpen` tinyint(1) DEFAULT 0,
  `instructions` longtext DEFAULT NULL COMMENT 'instructions to the front end, sent from the editor',
  `metaData` longtext DEFAULT NULL COMMENT 'any extra information linked to this activity',
  PRIMARY KEY (`passwordId`,`testId`) USING BTREE,
  KEY `passwordId` (`passwordId`) USING BTREE,
  KEY `testId` (`testId`) USING BTREE,
  KEY `loginId` (`loginId`) USING BTREE,
  KEY `loginId_2` (`loginId`,`passwordId`,`testId`) USING BTREE,
  KEY `tsActiveServer` (`tsActiveServer`) USING BTREE,
  CONSTRAINT `activity_loginId` FOREIGN KEY (`loginId`) REFERENCES `logins` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `activity_passwordId` FOREIGN KEY (`passwordId`) REFERENCES `passwords` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `activity_testId` FOREIGN KEY (`testId`) REFERENCES `tests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `answers`
--

DROP TABLE IF EXISTS `answers`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `answers` (
  `loginId` int(255) NOT NULL,
  `passwordId` int(255) NOT NULL,
  `testId` int(255) NOT NULL,
  `itemId` int(255) NOT NULL,
  `fieldId` varchar(255) NOT NULL,
  `fieldType` varchar(255) NOT NULL,
  `language` varchar(255) NOT NULL,
  `value` text NOT NULL,
  `tsServer` timestamp(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  `tsClient` timestamp(3) NULL DEFAULT NULL,
  PRIMARY KEY (`passwordId`,`testId`,`itemId`,`fieldId`) USING BTREE,
  KEY `passwordId` (`passwordId`) USING BTREE,
  KEY `testId` (`testId`) USING BTREE,
  KEY `login-password-test-item` (`loginId`,`testId`,`itemId`,`passwordId`) USING BTREE,
  KEY `login-password-test` (`loginId`,`testId`,`passwordId`) USING BTREE,
  KEY `itemId` (`itemId`) USING BTREE,
  KEY `loginId` (`loginId`,`passwordId`,`testId`) USING BTREE,
  CONSTRAINT `answersActivity` FOREIGN KEY (`loginId`, `passwordId`, `testId`) REFERENCES `activity` (`loginId`, `passwordId`, `testId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `answersItemId` FOREIGN KEY (`itemId`) REFERENCES `items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `apiKeys`
--

DROP TABLE IF EXISTS `apiKeys`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `apiKeys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) NOT NULL,
  `secret` varchar(255) NOT NULL,
  `api` varchar(255) NOT NULL,
  `comment` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `apiRequests`
--

DROP TABLE IF EXISTS `apiRequests`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `apiRequests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `keyId` int(11) NOT NULL,
  `created` timestamp(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  `challenge` varchar(255) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `apichallengekey` (`keyId`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `behaviour`
--

DROP TABLE IF EXISTS `behaviour`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `behaviour` (
  `loginId` int(11) NOT NULL COMMENT 'foreign key id of testee',
  `passwordId` int(11) NOT NULL COMMENT 'foreign key id of password',
  `testId` int(11) NOT NULL COMMENT 'foreign key id of test',
  `tsServer` timestamp(3) NULL DEFAULT current_timestamp(3),
  `tsClient` timestamp(3) NULL DEFAULT NULL,
  `timeLeft` int(11) DEFAULT NULL,
  `eventId` int(11) NOT NULL,
  `itemId` int(11) DEFAULT NULL,
  `language` varchar(255) DEFAULT NULL,
  `eventType` varchar(255) DEFAULT NULL,
  `subType` varchar(255) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  PRIMARY KEY (`loginId`,`passwordId`,`testId`,`eventId`) USING BTREE,
  KEY `passwordId` (`passwordId`) USING BTREE,
  KEY `testId` (`testId`) USING BTREE,
  KEY `loginId` (`loginId`) USING BTREE,
  KEY `activityPK` (`loginId`,`passwordId`,`testId`) USING BTREE,
  CONSTRAINT `behaviour_activity` FOREIGN KEY (`loginId`, `passwordId`, `testId`) REFERENCES `activity` (`loginId`, `passwordId`, `testId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `charts`
--

DROP TABLE IF EXISTS `charts`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `charts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `testId` int(11) NOT NULL,
  `ownerId` int(11) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `visibility` tinyint(1) DEFAULT 0,
  `data` mediumblob DEFAULT NULL COMMENT 'contains serialized chart data - must be blob in case of null bytes',
  `layoutData` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `idtitleunq` (`testId`,`title`) USING BTREE,
  KEY `fktestid` (`testId`) USING BTREE,
  KEY `ididx` (`id`) USING BTREE,
  KEY `fkownerid` (`ownerId`) USING BTREE,
  CONSTRAINT `fkownerid` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fktestid` FOREIGN KEY (`testId`) REFERENCES `tests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `dbPatchLog`
--

DROP TABLE IF EXISTS `dbPatchLog`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `dbPatchLog` (
  `patch` smallint(5) NOT NULL COMMENT 'database patch version that was applied',
  `date` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'date when patch was applied',
  `comment` varchar(255) DEFAULT NULL COMMENT 'summary of what patch was all about',
  PRIMARY KEY (`patch`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `inlTestSessions`
--

DROP TABLE IF EXISTS `inlTestSessions`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `inlTestSessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dates` date DEFAULT NULL,
  `tSessions` varchar(255) DEFAULT NULL,
  `tts` longtext DEFAULT NULL,
  `oid` int(10) unsigned NOT NULL,
  `sessionType` enum('ST','ZLO') NOT NULL DEFAULT 'ST',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unq_oid` (`oid`),
  KEY `idx_oid` (`oid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `itemFolderAccess`
--

DROP TABLE IF EXISTS `itemFolderAccess`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `itemFolderAccess` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `folderId` int(11) DEFAULT NULL,
  `userGroupId` int(11) DEFAULT NULL,
  `inherited` int(11) DEFAULT NULL,
  `accessDef` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `ifid_uid_unique` (`folderId`,`userGroupId`) USING BTREE,
  KEY `folderAccess_userId` (`userGroupId`) USING BTREE,
  CONSTRAINT `folderLink` FOREIGN KEY (`folderId`) REFERENCES `itemFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `usergroupLink` FOREIGN KEY (`userGroupId`) REFERENCES `userGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `itemFolders`
--

DROP TABLE IF EXISTS `itemFolders`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `itemFolders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `parent` int(11) DEFAULT NULL,
  `options` longtext DEFAULT NULL,
  `owner` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  KEY `parent` (`parent`) USING BTREE,
  KEY `owner` (`owner`) USING BTREE,
  CONSTRAINT `itemFoldersOwner` FOREIGN KEY (`owner`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `itemFoldersParent` FOREIGN KEY (`parent`) REFERENCES `itemFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `itemGroupAccess`
--

DROP TABLE IF EXISTS `itemGroupAccess`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `itemGroupAccess` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `itemgroupId` int(11) NOT NULL,
  `userId` int(11) NOT NULL,
  `accessDef` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `igid_uid_unique` (`itemgroupId`,`userId`) USING BTREE,
  KEY `itemGroupAccess_userId` (`userId`) USING BTREE,
  CONSTRAINT `itemGroupAccess_itemGroupId` FOREIGN KEY (`itemgroupId`) REFERENCES `itemGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `itemGroupAccess_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `itemGroups`
--

DROP TABLE IF EXISTS `itemGroups`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `itemGroups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `options` longtext DEFAULT NULL,
  `parent` int(11) DEFAULT NULL,
  `owner` int(11) DEFAULT NULL,
  `permissions` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  KEY `permissions` (`permissions`) USING BTREE,
  KEY `owner` (`owner`) USING BTREE,
  KEY `itemGroupsFolder` (`parent`) USING BTREE,
  CONSTRAINT `itemGroupsFolder` FOREIGN KEY (`parent`) REFERENCES `itemFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `itemGroupsOwner` FOREIGN KEY (`owner`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `items`
--

DROP TABLE IF EXISTS `items`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `groupId` int(11) NOT NULL,
  `itemCode` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `languages` longtext DEFAULT NULL,
  `blocks` longtext DEFAULT NULL,
  `parsed` longtext DEFAULT NULL,
  `fields` longtext DEFAULT NULL,
  `options` longtext DEFAULT NULL,
  `scripts` longtext DEFAULT NULL,
  `metadata` longtext DEFAULT NULL,
  `link` int(11) DEFAULT NULL COMMENT 'links to stimulus',
  `lock` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`lock`)),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  KEY `itemCode` (`itemCode`) USING BTREE,
  KEY `groupId` (`groupId`) USING BTREE,
  KEY `link` (`link`) USING BTREE,
  CONSTRAINT `items_groupId` FOREIGN KEY (`groupId`) REFERENCES `itemGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `items_link` FOREIGN KEY (`link`) REFERENCES `items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `l10n`
--

DROP TABLE IF EXISTS `l10n`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `l10n` (
  `variable` varchar(255) NOT NULL DEFAULT '',
  `language` varchar(255) NOT NULL,
  `context` varchar(255) NOT NULL,
  `text` varchar(255) DEFAULT '',
  PRIMARY KEY (`variable`,`language`,`context`) USING BTREE,
  KEY `language` (`language`) USING BTREE,
  KEY `variable` (`variable`,`context`) USING BTREE,
  CONSTRAINT `l10n_Language` FOREIGN KEY (`language`) REFERENCES `languages` (`code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `languages`
--

DROP TABLE IF EXISTS `languages`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `languages` (
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `fallback` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`code`) USING BTREE,
  KEY `code` (`code`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `logClient`
--

DROP TABLE IF EXISTS `logClient`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `logClient` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `loginId` int(11) NOT NULL,
  `passwordId` int(11) NOT NULL,
  `testId` int(11) DEFAULT NULL,
  `serialNumber` varchar(255) DEFAULT NULL,
  `tsClient` timestamp(3) NULL DEFAULT NULL,
  `tsServer` timestamp(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  `timeleft` int(11) DEFAULT NULL,
  `log` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `login` (`passwordId`) USING BTREE,
  KEY `testId` (`testId`) USING BTREE,
  KEY `loginId` (`loginId`,`passwordId`,`testId`) USING BTREE,
  CONSTRAINT `logClient_activity` FOREIGN KEY (`loginId`, `passwordId`, `testId`) REFERENCES `activity` (`loginId`, `passwordId`, `testId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `logErrors`
--

DROP TABLE IF EXISTS `logErrors`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `logErrors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tsServer` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `message` varchar(255) DEFAULT NULL,
  `data` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `id` (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `logTransfers`
--

DROP TABLE IF EXISTS `logTransfers`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `logTransfers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `serialNumber` varchar(255) DEFAULT NULL,
  `loginId` int(11) DEFAULT NULL,
  `passwordId` int(11) DEFAULT NULL,
  `testId` int(11) DEFAULT NULL,
  `challenge` int(11) DEFAULT NULL,
  `payloadId` int(11) DEFAULT NULL,
  `tsServer` timestamp(3) NULL DEFAULT current_timestamp(3),
  `data` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `loginId` (`loginId`) USING BTREE,
  KEY `passwordId` (`passwordId`) USING BTREE,
  KEY `testId` (`testId`) USING BTREE,
  KEY `loginId_2` (`loginId`,`passwordId`,`testId`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `logins`
--

DROP TABLE IF EXISTS `logins`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `logins` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `overrides` longtext DEFAULT NULL,
  `parent` int(11) DEFAULT 1,
  `template` enum('testee','template','cloned') DEFAULT 'testee',
  `loginType` enum('local','directPass','LDAP','SAML') DEFAULT 'local',
  `password` varchar(255) DEFAULT NULL,
  `info` longtext DEFAULT NULL,
  `displayName` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `loginsId` (`id`) USING BTREE,
  UNIQUE KEY `loginsName` (`name`) USING BTREE,
  KEY `loginsParent` (`parent`) USING BTREE,
  CONSTRAINT `loginsParent` FOREIGN KEY (`parent`) REFERENCES `loginsFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `loginsFolderAccess`
--

DROP TABLE IF EXISTS `loginsFolderAccess`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `loginsFolderAccess` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `folderId` int(11) DEFAULT NULL,
  `userGroupId` int(11) DEFAULT NULL,
  `inherited` int(11) DEFAULT NULL,
  `accessDef` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `ifid_uid_unique` (`folderId`,`userGroupId`) USING BTREE,
  KEY `loginAccess_userid` (`userGroupId`) USING BTREE,
  CONSTRAINT `loginfolderaccess_ibfk_1` FOREIGN KEY (`folderId`) REFERENCES `loginsFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `loginfolderaccess_ibfk_2` FOREIGN KEY (`userGroupId`) REFERENCES `userGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `loginsFolders`
--

DROP TABLE IF EXISTS `loginsFolders`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `loginsFolders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `parent` int(11) DEFAULT 1,
  `owner` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  KEY `parent` (`parent`) USING BTREE,
  CONSTRAINT `loginsFoldersParent` FOREIGN KEY (`parent`) REFERENCES `loginsFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `media`
--

DROP TABLE IF EXISTS `media`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `media` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `filetype` varchar(4) DEFAULT NULL,
  `parent` int(11) DEFAULT 1,
  `created` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `filesize` int(15) DEFAULT NULL,
  `uuid` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `mediaId` (`id`) USING BTREE,
  KEY `parent` (`parent`) USING BTREE,
  CONSTRAINT `media_ibfk_1` FOREIGN KEY (`parent`) REFERENCES `itemGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `mediaFiles`
--

DROP TABLE IF EXISTS `mediaFiles`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `mediaFiles` (
  `id` int(10) NOT NULL,
  `data` longblob DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  CONSTRAINT `mediaFileId` FOREIGN KEY (`id`) REFERENCES `media` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `passwords`
--

DROP TABLE IF EXISTS `passwords`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `passwords` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `loginID` int(11) DEFAULT NULL,
  `structure` longtext DEFAULT NULL,
  `name` varchar(255) DEFAULT '1',
  `tag` varchar(255) DEFAULT NULL,
  `label` varchar(255) DEFAULT NULL,
  `options` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `pwId` (`id`) USING BTREE,
  UNIQUE KEY `pw` (`name`,`loginID`) USING BTREE,
  KEY `loginID` (`loginID`) USING BTREE,
  CONSTRAINT `passwordsLoginID` FOREIGN KEY (`loginID`) REFERENCES `logins` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `scoring`
--

DROP TABLE IF EXISTS `scoring`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `scoring` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `testId` int(11) DEFAULT NULL,
  `loginId` int(11) DEFAULT NULL,
  `loginName` varchar(255) DEFAULT NULL,
  `passwordId` int(11) DEFAULT NULL,
  `points` tinytext DEFAULT NULL,
  `scoringData` longtext DEFAULT NULL,
  `givenScoringData` longtext DEFAULT NULL,
  `finalScore` decimal(15,5) DEFAULT NULL,
  `lastRunTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `idx_scoring_main` (`testId`,`passwordId`,`loginId`) USING BTREE COMMENT 'testId and loginId combination always should be unique',
  KEY `fk_loginId` (`loginId`) USING BTREE,
  KEY `fk_loginName` (`loginName`) USING BTREE,
  KEY `fk_password` (`passwordId`) USING BTREE,
  CONSTRAINT `fk_loginId` FOREIGN KEY (`loginId`) REFERENCES `logins` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_loginName` FOREIGN KEY (`loginName`) REFERENCES `logins` (`name`) ON UPDATE CASCADE,
  CONSTRAINT `fk_password` FOREIGN KEY (`passwordId`) REFERENCES `passwords` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_testId` FOREIGN KEY (`testId`) REFERENCES `tests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL COMMENT 'session id',
  `data` text NOT NULL DEFAULT '' COMMENT 'session contents',
  `modified` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'modification timestamp',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  KEY `date` (`modified`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `settings` (
  `option` varchar(255) NOT NULL,
  `value` varchar(255) NOT NULL,
  `encryption` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`option`) USING BTREE,
  UNIQUE KEY `option` (`option`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC COMMENT='v47';
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `stateFrontend`
--

DROP TABLE IF EXISTS `stateFrontend`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `stateFrontend` (
  `stateId` varchar(13) NOT NULL COMMENT 'id from the cookie',
  `instanceId` varchar(13) NOT NULL COMMENT 'id of the window',
  `active` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'updated on every use',
  `loginId` int(11) DEFAULT NULL COMMENT 'can be NULL if student id is used or in preview mode',
  `passwordId` int(11) DEFAULT NULL COMMENT 'can be NULL if student id is used or in preview mode',
  `testId` int(11) DEFAULT NULL COMMENT 'can be NULL if student id is used or in preview mode',
  `studentId` int(11) DEFAULT NULL COMMENT 'is NULL if student id feature is not used',
  `preview` varchar(255) DEFAULT NULL COMMENT 'type of preview shown or empty if not a preview',
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'additional data fed to OASYS from external source (e.g. variables to be displayed)' CHECK (json_valid(`data`)),
  PRIMARY KEY (`stateId`,`instanceId`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `systemState`
--

DROP TABLE IF EXISTS `systemState`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `systemState` (
  `sys_section` varchar(255) NOT NULL,
  `status` int(1) NOT NULL DEFAULT 0 COMMENT 'maint mode - 0 = normal; 1 = active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `testCache`
--

DROP TABLE IF EXISTS `testCache`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `testCache` (
  `passwordId` int(11) NOT NULL,
  `testId` int(11) NOT NULL,
  `structure` longtext NOT NULL DEFAULT '',
  `labels` longtext DEFAULT NULL CHECK (json_valid(`labels`)),
  `skin` longtext DEFAULT NULL CHECK (json_valid(`skin`)),
  `options` longtext DEFAULT NULL CHECK (json_valid(`options`)),
  `variables` longtext DEFAULT NULL CHECK (json_valid(`variables`)),
  PRIMARY KEY (`passwordId`,`testId`) USING BTREE,
  KEY `testCache_testId` (`testId`) USING BTREE,
  CONSTRAINT `testCache_activity` FOREIGN KEY (`passwordId`, `testId`) REFERENCES `activity` (`passwordId`, `testId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `testFluidStructure`
--

DROP TABLE IF EXISTS `testFluidStructure`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `testFluidStructure` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `testID` int(11) DEFAULT NULL,
  `poolID` int(11) DEFAULT NULL,
  `numberOfItems` longtext DEFAULT NULL,
  `random` enum('0','1') DEFAULT '1',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `fluidId` (`id`) USING BTREE,
  KEY `testID` (`testID`) USING BTREE,
  CONSTRAINT `testFluidStructure_ibfk_1` FOREIGN KEY (`testID`) REFERENCES `tests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `testFolderAccess`
--

DROP TABLE IF EXISTS `testFolderAccess`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `testFolderAccess` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `folderId` int(11) DEFAULT NULL,
  `userGroupId` int(11) DEFAULT NULL,
  `inherited` int(11) DEFAULT NULL,
  `accessDef` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `ifid_uid_unique` (`folderId`,`userGroupId`) USING BTREE,
  KEY `folderAccess_userId` (`userGroupId`) USING BTREE,
  CONSTRAINT `testfolderaccess_ibfk_1` FOREIGN KEY (`folderId`) REFERENCES `testFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `testfolderaccess_ibfk_2` FOREIGN KEY (`userGroupId`) REFERENCES `userGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `testFolders`
--

DROP TABLE IF EXISTS `testFolders`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `testFolders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `parent` int(11) DEFAULT 1,
  `owner` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  KEY `parent` (`parent`) USING BTREE,
  CONSTRAINT `parent` FOREIGN KEY (`parent`) REFERENCES `testFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `testPools`
--

DROP TABLE IF EXISTS `testPools`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `testPools` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `testID` int(11) DEFAULT NULL,
  `structure` longtext DEFAULT NULL,
  `name` varchar(255) DEFAULT '1',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `poolId` (`id`) USING BTREE,
  KEY `testID` (`testID`) USING BTREE,
  CONSTRAINT `testPools_ibfk_1` FOREIGN KEY (`testID`) REFERENCES `tests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `tests`
--

DROP TABLE IF EXISTS `tests`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `tests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `structure` longtext DEFAULT NULL,
  `labels` longtext DEFAULT NULL,
  `options` longtext DEFAULT NULL,
  `info` longtext DEFAULT NULL,
  `skin` longtext DEFAULT NULL,
  `variables` longtext DEFAULT NULL,
  `metadata` longtext DEFAULT NULL,
  `parent` int(11) DEFAULT 1,
  `owner` int(11) DEFAULT NULL,
  `userGroup` int(11) DEFAULT NULL,
  `permissions` int(11) DEFAULT NULL,
  `lockstate` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `testId` (`id`) USING BTREE,
  KEY `owner` (`owner`) USING BTREE,
  KEY `userGroup` (`userGroup`) USING BTREE,
  KEY `parent` (`parent`) USING BTREE,
  CONSTRAINT `group` FOREIGN KEY (`userGroup`) REFERENCES `userGroups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `owner` FOREIGN KEY (`owner`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `testsParent` FOREIGN KEY (`parent`) REFERENCES `testFolders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `userGroupAccess`
--

DROP TABLE IF EXISTS `userGroupAccess`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `userGroupAccess` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) NOT NULL,
  `usergroupId` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `idx_user_group_unique` (`userId`,`usergroupId`) USING BTREE,
  UNIQUE KEY `idx_id_unique` (`id`) USING BTREE,
  KEY `fk_usergroupId_userGroupTable` (`usergroupId`) USING BTREE,
  CONSTRAINT `fk_userId_userTable` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_usergroupId_userGroupTable` FOREIGN KEY (`usergroupId`) REFERENCES `userGroups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `userGroups`
--

DROP TABLE IF EXISTS `userGroups`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `userGroups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `accessDef` longtext DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE,
  UNIQUE KEY `name` (`name`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `defLang` varchar(255) DEFAULT NULL,
  `options` varchar(255) DEFAULT NULL,
  `lastLogin` timestamp NULL DEFAULT NULL,
  `accessDef` longtext DEFAULT NULL,
  `homeaccess` tinyint(1) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `bad_logins` int(6) DEFAULT 0,
  `last_bad_pass` timestamp(6) NULL DEFAULT NULL,
  `acct_type` varchar(255) DEFAULT NULL COMMENT 'This field indicates whether the account is ''local'' or a domain-linked copy of an account (AD acct with LDAP authentication)',
  `resetdata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`resetdata`)),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `name` (`name`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
SET character_set_client = @saved_cs_client ;

--
-- Temporary table structure for view `view_q_list`
--

DROP TABLE IF EXISTS `view_q_list`;
DROP VIEW IF EXISTS `view_q_list`;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `view_q_list` AS SELECT
 1 AS `id`,
  1 AS `itemCode`,
  1 AS `itemName`,
  1 AS `languages`,
  1 AS `itemTypes`,
  1 AS `scoringTypes` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `view_tt_list`
--

DROP TABLE IF EXISTS `view_tt_list`;
DROP VIEW IF EXISTS `view_tt_list`;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `view_tt_list` AS SELECT
 1 AS `passwordId`,
  1 AS `passwordTag`,
  1 AS `loginId`,
  1 AS `testId`,
  1 AS `testIdAll`,
  1 AS `loginName`,
  1 AS `displayName`,
  1 AS `finalScore`,
  1 AS `progress`,
  1 AS `lConn`,
  1 AS `status` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `watchList`
--

DROP TABLE IF EXISTS `watchList`;
SET @saved_cs_client     = @@character_set_client ;
SET character_set_client = utf8mb4 ;
CREATE TABLE `watchList` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `foreign_id` int(11) DEFAULT NULL,
  `foreign_table` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `pageFolder_key` int(11) GENERATED ALWAYS AS (case when `foreign_table` = 1 then `foreign_id` end) STORED,
  `pageGroup_key` int(11) GENERATED ALWAYS AS (case when `foreign_table` = 2 then `foreign_id` end) STORED,
  `testFolder_key` int(11) GENERATED ALWAYS AS (case when `foreign_table` = 3 then `foreign_id` end) STORED,
  `test_key` int(11) GENERATED ALWAYS AS (case when `foreign_table` = 4 then `foreign_id` end) STORED,
  `testTakerFolder_key` int(11) GENERATED ALWAYS AS (case when `foreign_table` = 5 then `foreign_id` end) STORED,
  `testTaker_key` int(11) GENERATED ALWAYS AS (case when `foreign_table` = 6 then `foreign_id` end) STORED,
  PRIMARY KEY (`id`),
  KEY `fk1` (`pageFolder_key`) USING BTREE,
  KEY `fk2` (`pageGroup_key`) USING BTREE,
  KEY `fk3` (`testFolder_key`) USING BTREE,
  KEY `fk4` (`test_key`) USING BTREE,
  KEY `fk5` (`testTakerFolder_key`) USING BTREE,
  KEY `fk6` (`testTaker_key`) USING BTREE,
  KEY `fk7` (`user_id`) USING BTREE,
  CONSTRAINT `fk1` FOREIGN KEY (`pageFolder_key`) REFERENCES `itemFolders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk2` FOREIGN KEY (`pageGroup_key`) REFERENCES `itemGroups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk3` FOREIGN KEY (`testFolder_key`) REFERENCES `testFolders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk4` FOREIGN KEY (`test_key`) REFERENCES `tests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk5` FOREIGN KEY (`testTakerFolder_key`) REFERENCES `loginsFolders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk6` FOREIGN KEY (`testTaker_key`) REFERENCES `logins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk7` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
SET character_set_client = @saved_cs_client ;

--
-- Final view structure for view `view_q_list`
--

DROP VIEW IF EXISTS `view_q_list`;
SET @saved_cs_client          = @@character_set_client ;
SET @saved_cs_results         = @@character_set_results ;
SET @saved_col_connection     = @@collation_connection ;
SET character_set_client      = utf8mb4 ;
SET character_set_results     = utf8mb4 ;
SET collation_connection      = utf8mb4_general_ci ;
CREATE ALGORITHM=UNDEFINED 
DEFINER=CURRENT_USER SQL SECURITY DEFINER 
/*!50001 VIEW `view_q_list` AS select `items`.`id` AS `id`,`items`.`itemCode` AS `itemCode`,`items`.`name` AS `itemName`,`items`.`languages` AS `languages`,json_extract(`items`.`blocks`,'$[*].type') AS `itemTypes`,json_extract(`items`.`fields`,'$.*.processing') AS `scoringTypes` from `items` */;
SET character_set_client      = @saved_cs_client ;
SET character_set_results     = @saved_cs_results ;
SET collation_connection      = @saved_col_connection ;

--
-- Final view structure for view `view_tt_list`
--

DROP VIEW IF EXISTS `view_tt_list`;
SET @saved_cs_client          = @@character_set_client ;
SET @saved_cs_results         = @@character_set_results ;
SET @saved_col_connection     = @@collation_connection ;
SET character_set_client      = utf8mb3 ;
SET character_set_results     = utf8mb3 ;
SET collation_connection      = utf8mb4_general_ci ;
CREATE ALGORITHM=UNDEFINED 
DEFINER=CURRENT_USER SQL SECURITY DEFINER 
/*!50001 VIEW `view_tt_list` AS select distinct `scoring`.`passwordId` AS `passwordId`,`passwords`.`tag` AS `passwordTag`,`scoring`.`loginId` AS `loginId`,`scoring`.`testId` AS `testId`,json_extract(`passwords`.`structure`,'$[*].hiddenID') AS `testIdAll`,`scoring`.`loginName` AS `loginName`,`logins`.`displayName` AS `displayName`,`scoring`.`finalScore` AS `finalScore`,`activity`.`progress` AS `progress`,`activity`.`tsActiveServer` AS `lConn`,case when `activity`.`timeLeft` = 0 then 'SUBMITTED' collate utf8mb4_unicode_520_ci when `activity`.`timeLeft` > 0 then concat(`activity`.`timeLeft`,' MINUTES REMAINING') collate utf8mb4_unicode_520_ci when `activity`.`timeLeft` < 0 then 'NO TIME LIMIT' collate utf8mb4_unicode_520_ci when `activity`.`timeLeft` is null then 'NOT STARTED' else 'NOT SUBMITTED' collate utf8mb4_unicode_520_ci end AS `status` from (((`scoring` join `activity` on(`scoring`.`passwordId` = `activity`.`passwordId` and `scoring`.`testId` = `activity`.`testId`)) join `passwords` on(`scoring`.`passwordId` = `passwords`.`id`)) join `logins` on(`scoring`.`loginId` = `logins`.`id` and `logins`.`template` in ('testee','cloned'))) group by `scoring`.`passwordId`,`scoring`.`testId` */;
SET character_set_client      = @saved_cs_client ;
SET character_set_results     = @saved_cs_results ;
SET collation_connection      = @saved_col_connection ;
SET TIME_ZONE=@OLD_TIME_ZONE ;

SET SQL_MODE=@OLD_SQL_MODE ;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS ;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS ;
SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT ;
SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS ;
SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION ;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2025-08-28 16:05:31
