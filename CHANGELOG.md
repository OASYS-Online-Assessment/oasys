# Changelog

All notable changes to OASYS are documented in this file.

## [3.6.9] - 2026-09-23

### Added
- CHANGELOG.md (this file), SECURITY.md, and README.md have been added.

### Changed
- Cleaning routine of FrontendState and BackendState classes have been made less aggressive.
- rixPDO updated to v2.03 adding the inTransaction() method.

## [3.6.8] - 2026-09-22

### Added

- Slider interaction now supports showing tick marks for subdivisions.

## [3.6.7] - 2026-09-10

### Fixed

- Corrected the database migration files included in the release package.
- Updated the release version metadata.

## [3.6.6] - 2026-09-05

### Added

- Added clearer loading and waiting states to long-running dashboard operations.
- Added additional system-status and integrity-check information for administrators.
- Added project documentation and database migration documentation to the public repository.

### Changed

- Improved dashboard, activity-tracking, test-results, and watchlist performance.
- Improved grouping behavior in the Results Manager.
- Improved Report Builder compatibility.
- Modernized the administrator login and system-status interfaces.
- Updated interface translations in English, French, and German.

### Fixed

- Fixed several dashboard and results-display issues.
- Fixed inconsistent loading-state and modal behavior.

## [3.6.5] - 2026-09-04

### Fixed

- Restored an additional line of code that was unintentionally left disabled during the 3.6.3 update.

## [3.6.4] - 2026-09-02

### Fixed

- Restored a line of code that had been left disabled during debugging.

## [3.6.3] - 2026-09-01

### Changed

- Removed a blocking database-integrity check from the dashboard so that detected problems can be reported without preventing dashboard access.

## [3.6.2] - 2026-08-31

### Fixed

- Corrected the system check when the database patch list is empty.
- Corrected validation of the mandatory OpenSSL PHP extension.

## [3.6.1] - 2026-08-31

### Fixed

- Fixed a system-check failure that occurred when the database patch list was empty.
- Fixed reporting of the mandatory OpenSSL PHP extension.

## [3.6.0] - 2026-08-27

### New features

- New dashboards for back-end users and administrators with integrated activity monitoring.
- Test Journeys in the Results Manager and Activity Tracker.
- Draft/Published (Locked) workflow to protect published assessments and existing results.
- Bulk editing and new landing-page, finish-screen, and score-screen editors in the Test Manager, including previews and advanced conditional score ranges.
- Import and export of test page groups, including their media.
- Ability to copy test content, landing pages, finish screens, privacy notes, and score screens between tests.
- Ability to load existing pages from other page groups in the Content Manager.
- Advanced search features, including ID searches and extended meta-tag searches.
- Improved Media Manager workflow with bulk media upload support.
- Enhanced permissions, access control, permission-aware exports, and filtered reporting and statistics.
- Revised manual-scoring workflows and usability improvements.
- Date-filtered result resets in the Test Manager and Test Taker Manager.
- CSV import support for back-end users and improved user-management workflows.
- SAML support and improved login and session management.
- Localization improvements with missing-translation warnings.
- System settings import and export for simplified deployment and maintenance.
- Secure encryption-key rotation for encrypted database content and system settings.
- Various interface refreshes and usability enhancements.
- Option to add custom CSS to every page.
- Enhanced slider interaction that allows subdivisions.
- Option to copy labels to values in choice and choice-matrix interactions.
- New system settings for controlling the cookie policy.
- New system settings for fine-tuning LDAP connections and certificate handling.
- New system settings for configuring data-transfer optimization.
- Ability to redirect specific logins to another OASYS server.
- Updated PHP and MariaDB compatibility, with workflow, security, and performance improvements throughout OASYS 3.6.

### Added

- Added a custom CSS editor to the Page Editor.
- Added **Collapse all** and **Expand all** controls to the Page Editor.
- Added an option to copy labels to values in choice and choice-matrix interactions.
- Added encryption-key rotation for super administrators.
- Added authorization checks for Page Editor actions and other previously uncovered actions.
- Added ownership validation for child records in the Test Manager.

### Changed

- Updated `math-php` to version 2.13.0 for PHP 8.4 and PHP 8.5 compatibility.
- Updated system checks, maximum-version requirements, and the feature list.
- Moved legacy `[@CSS …]` content into the Page Editor custom CSS field and retired the legacy plugin.
- Improved published and locked behavior for restricted accounts.
- Updated localization resources and product manuals.
- Consolidated database patches and removed legacy database files and session-table references.

### Fixed

- Fixed keyboard navigation between inline rich-text fields and corrected tab order in choice interactions.
- Fixed missing controls in the popup rich-text editor.
- Fixed incorrect positioning when duplicating blocks.
- Fixed preview, Results Manager, and concept-map styling issues.
- Fixed language selection on the editor login screen.

### Security

- Prevented passwords from being written to the web-server error log.
- Improved validation of URL parameters.
- Expanded permission checks for editor actions.
