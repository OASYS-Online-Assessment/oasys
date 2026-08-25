# Cumulative Changes from 3.4 to 3.5

This patch can be run to upgrade any OASYS version 3.4.x to 3.5.0.

If the upgrade is not done with the included updater, it is imperative to run the page updater manually, which is used to bring all properties up to date. Since some fields have been upgraded with extra properties during the OASYS 3.4 lifecycle, some old content cannot run unless it is upgraded first.

In the browser, navigate to `<OASYS URL>/modules/oit/updateItems.php` and click on **'Update all pages in database'**. That should show a list of changes done to the database. If the script is run a second time it should not show anything in the list any more.

If the normal OASYS updater is used, this step is not necessary, it will be done automatically.
