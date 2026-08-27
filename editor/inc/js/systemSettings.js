"use strict";
$(onReady);
$(document).on("contextmenu", function(e) { e.preventDefault(); return false; });

// gui elements
let kbHandler;
let waitDialog;
const buttons = {};
let gui = {};
const settingsObj = {};
let val;

// role flags
let isSuper = false;
let isAE    = false;              // elevated
let isPrivileged = false;         // computed client-side as (isSuper || isAE)

// cache for export + encryption map
let nonDefaultList = [];
let encMap = {};                  // { settingKey: 0|1 } provided by backend
let passwordSetMap = {};          // { settingKey: true } without exposing the stored value
let settingsListMode = 'all';
let encryptionRotationStatus = null;

function onReady() {
  // prevent browser drag&drop navigation
  $('body').on('dragover', e => e.preventDefault());
  $('body').on('drop',     e => e.preventDefault());

  $.ajaxSetup({
    type: "POST",
    cache: false,
    dataType: "json",
    timeout: 300000,
    success: ajaxSuccess,
    error: ajaxError,
    url: "systemSettingActions.php"
  });

  waitDialog = new jsModalWait('please wait');
  kbHandler  = new jsKeyboardHandler();
  kbHandler.registerShortcut('BACKSPACE'); // prevent browser back nav

  initGUI();
  gui = { boxes: {}, testLevel: {} };

  gui.statusBar = new jsStatusBar('#UI', 'statusBar', {
    prepend: true,
    prefix: '<strong style="margin-right: 10px;">System Settings</strong>'
  });

  // main buttons
  buttons.refreshSettingList = new jsButton2($('header'), 'refreshSettingList', {
    label: 'Refresh List',
    icon: '../images/toolbarIcons/ic_tb_refresh.png',
    iconWidth: 48, width: 80, height: 100,
    callback: refreshList, disabled: false
  });

  insertVerticalDivider('header');

  buttons.syscheck = new jsButton2($('header'), 'syscheck', {
    label: 'System Check',
    icon: '../images/toolbarIcons/ic_tb_systemCheck.png',
    iconWidth: 48, width: 80, height: 100,
    callback: syscheck, disabled: false
  });

  buttons.showModules = new jsButton2($('header'), 'showModules', {
    label: 'Custom modules',
    icon: '../images/toolbarIcons/ic_tb_installedModules.png',
    iconWidth: 48, width: 80, height: 100,
    callback: showModules, disabled: false
  });

  insertVerticalDivider('header', 'mm_div');
  $('#mm_div').hide();

  buttons.filecheck = new jsButton2($('header'), 'filecheck', {
    label: 'File System Check',
    icon: '../images/toolbarIcons/ic_tb_fileSystemCheck.png',
    iconWidth: 48, width: 80, height: 100,
    callback: filecheck, disabled: false
  });

  insertVerticalDivider('header', 'mm_div');
  $('#mm_div').hide();

  buttons.maintMode = new jsButton2($('header'), 'maintMode', {
    label: 'Maintenance Mode',
    icon: '../images/toolbarIcons/ic_tb_maintenanceMode.png',
    iconWidth: 48, width: 80, height: 100,
    callback: maintMode, disabled: false, hidden: true
  });

  buttons.rotateEncryptionKey = new jsButton2($('header'), 'rotateEncryptionKey', {
    label: 'Rotate encryption key',
    icon: '../images/toolbarIcons/ic_tb_resetPassword.png',
    iconWidth: 48, width: 90, height: 100,
    callback: openEncryptionRotation,
    disabled: true, hidden: true
  });

  // Export / Import (same temporary icon)
  buttons.exportSettings = new jsButton2($('header'), 'exportSettings', {
    label: 'Export settings',
    icon: '../images/toolbarIcons/ic_tb_exportSettings.png',
    iconWidth: 48, width: 80, height: 100,
    callback: openExportDialog,
    disabled: false,
    hidden: true
  });

  buttons.importSettings = new jsButton2($('header'), 'importSettings', {
    label: 'Import settings',
    icon: '../images/toolbarIcons/ic_tb_importSettings.png',
    iconWidth: 48, width: 80, height: 100,
    callback: openImportDialog,
    disabled: false,
    hidden: true
  });

  // content
  gui.s1 = createFlexSection('UI', 'sect001', 1000, 1000, 0, 'fullWidthFlex');

  gui.boxes.varSettings = createFlexBox(gui.s1, 'varSettings', {
    title: 'Settings list',
    minHeight: 480,
    panelHeight: 30,
    flex: 1,
    noPadding: false
  });

  // toolbar text
  gui.boxes.varSettings.getPanel().append(/* html */`
    <div id="settingsListHeader">
      <div id="settTbText"></div>
      <div id="settingsListMode" class="settingsListMode" role="group" aria-label="Settings display">
        <button type="button" class="isActive" data-mode="all" aria-pressed="true">ALL</button>
        <button type="button" data-mode="modified" aria-pressed="false">Modified</button>
      </div>
    </div>
  `);

  // table / structureView settings
  const settingsOptions = {
    onChange: propertiesChanged,
    onClick: propertiesClick,
    elements: [],
    tdSizes: { option: '150px', value: '330px', comment: '440px' },
    tableHead: { option: 'Setting', value: 'Value', comment: 'Description' },
    deleteLinkSize: '20px',
    cssStylesTable: { 'width': '100%', 'border': '0px', 'border-spacing': '0px' },
    cssStylesCells: {
      'padding': '3px', 'background-color': 'transparent',
      'border-bottom': '1px dotted #CCC', 'height': '25px'
    },
    cssHeadCells: { 'padding': '5px', 'background-color': '#e8e8e8', 'height': '20px' },
    consecutiveNumbers: false,
    dataId: 'settingsTable',
    tableHeadDisplay: true,
    appPath: '../inc/jsSortableTable/',
    readOnly: false,
    hideDeleteLinks: true,
    fixedOrder: true,
    actionField: true,
    actionFieldSize: '65px',
    actionFieldColText: "status",
    actionFieldDefaultText: "default",
    actionFieldModifiedText: "modified",
    actionFieldInactiveText: "immutable",
    filter: {
      startText: "Filter system settings..."
    },
    cssStylesAFdefault: { 'text-align': 'left', 'color': '#22AA41', 'font-size': '12px' },
    cssStylesAFmodified: {
      'color': '#8a1f1f',
      'font-size': '12px',
      'font-weight': '700',
      'text-align': 'left'
    },
    cssStylesAFinactive: { 'color': '#bebebe', 'text-align': 'left', 'font-size': '12px' }
  };
  gui.settingsView = new JsSortableTable('varSettings', 'varSettings_table', settingsOptions);
  $('#settingsListMode').on('click', 'button', function() {
    settingsListMode = String($(this).data('mode')) === 'modified' ? 'modified' : 'all';
    applySettingsListMode();
  });

  // initial data
  startAjax('fetchSettings', {});
}

/* =========================
   Maintenance Mode dialog
   ========================= */
async function maintMode(_button, stopMsg = "") {
  let mm_res = await startAjax("m_status");
  if (mm_res.error) return;
  let belist = "";

  if (mm_res.fecount > 0 && stopMsg === "") {
    stopMsg = `One or more test takers are active. You may not activate frontend maintenance mode until all test takers are logged out.`;
  }

  if (mm_res.becount > 0) {
    if (mm_res.fecount > 0) stopMsg += "<br><br>";
    stopMsg += `
      One or more backend logins are currently active. Activating backend maintenance mode will terminate all logged in editor sessions (excluding yourself).
      <br><br><u>Proceed at your own risk!</u>`;
    belist = mm_res.beusers.map(e => `<div class="sysMaintUser">${escapeHtml(e)}</div>`).join('');
  }

  const mmdObj = new nxDialog("mmodeDiag", {
    width: 560,
    title: "Current maintenance mode statuses",
    buttons: [{ label: "Close", value: "ok", 'default': true }],
    contents: `
      <div class="sysMaintDialog">
        ${stopMsg ? `<div class="sysMaintWarning">${stopMsg}</div>` : ''}
        <section class="sysMaintCard">
          <div id="mm_tsholder" class="sysMaintToggles"></div>
        </section>
        <section id="beblock" class="sysMaintCard sysMaintUsers" style="display: none;">
          <h3>Active Backend Logins</h3>
          <div>${belist}</div>
        </section>
      </div>`
  });

  if (mm_res.becount > 0) $('#beblock').show();

  for (const mEntry of Object.values(mm_res.m_status)) {
    insertToggleswitch($('#mm_tsholder'), mEntry.sys_section, mEntry.sys_section, {
      checked: (mEntry.status !== 0),
      readOnly: (mm_res.fecount > 0 && mEntry.sys_section === "frontend"),
      callback: function(section, value) {
        startAjax("change_m_status", { section, state: value ? 1 : 0 }).then((res) => {
          if (res.error) return;
          refreshEncryptionRotationStatus();
          if (res.stop) {
            mmdObj.dismiss();
            maintMode(null, "Sorry, one or more test takers are currently active! Please try again later.");
          }
        });
      }
    });
  }
}

/* =========================
   Encryption-key rotation
   ========================= */
async function refreshEncryptionRotationStatus() {
  if (!isSuper || !buttons.rotateEncryptionKey) return;
  const res = await startAjax('encryptionRotationStatus', {});
  if (res.error || !res.data) return;
  encryptionRotationStatus = res.data;
  if (res.data.fullMaintenance) buttons.rotateEncryptionKey.enable();
  else buttons.rotateEncryptionKey.disable();
  $('#rotateEncryptionKey').attr('title', res.data.fullMaintenance
    ? 'Rotate the OASYS database encryption key.'
    : 'Enable frontend and backend maintenance mode before rotating the encryption key.');
}

async function openEncryptionRotation() {
  const res = await startAjax('encryptionRotationStatus', {});
  if (res.error || !res.data) return;
  encryptionRotationStatus = res.data;
  if (!res.data.fullMaintenance) {
    showEncryptionMessage('Encryption key rotation', 'Frontend and backend maintenance mode must both be enabled.');
    return;
  }
  if (res.data.source === 'environment') openEnvironmentRotationDialog(res.data);
  else openManagedRotationDialog(res.data);
}

function encryptionSourceCard(status) {
  const sourceText = status.source === 'environment'
    ? 'Environment variables'
    : 'OASYS-managed crypt.ini file';
  return `<div class="ekrSource"><strong>Active key source:</strong> ${escapeHtml(sourceText)}</div>`;
}

function openManagedRotationDialog(status) {
  const dialog = new nxDialog('encryptionRotationManaged', {
    width: 700,
    title: 'Rotate encryption key',
    buttons: [
      { label: 'Cancel', value: 'cancel', cancel: true },
      { label: 'Use new secure key', value: 'rotate', 'default': true, disabled: true }
    ],
    contents: `<div class="ekrDialog">
      ${encryptionSourceCard(status)}
      <div class="ekrWarning"><strong>This operation re-encrypts all test-taker passwords and encrypted system settings.</strong>
        Do not leave maintenance mode or close this dialog while the rotation is running.</div>
      <label class="ekrConfirm"><input type="checkbox" id="ekrBackupConfirmed"> <span>I confirm that a current database backup and a protected backup of crypt.ini exist.</span></label>
    </div>`,
    callback: async function(value) {
      if (value !== 'rotate') return;
      const result = await startAjax('rotateManagedEncryptionKey', {});
      if (!result.error && result.data) showEncryptionCompletion(result.data);
      refreshEncryptionRotationStatus();
    }
  });
  $('#ekrBackupConfirmed').on('change', function() {
    if (this.checked) dialog.enableButton('rotate'); else dialog.disableButton('rotate');
  });
}

function openEnvironmentRotationDialog(status) {
  const stage = status.rotation?.stage || '';
  let body = encryptionSourceCard(status) + environmentWorkflowSteps(stage);
  let action = 'prepare';
  let actionLabel = 'Generate new key';

  if (!stage) {
    body += '<p>OASYS will generate a new key and IV. They are displayed only once and must be installed as pending server environment variables before database values can be updated.</p>';
  } else if (stage === 'awaiting_pending_environment') {
    action = 'verify'; actionLabel = 'Verify environment variables';
    body += environmentInstructions(status, 'Install the previously generated values, reload PHP, and then verify them.');
  } else if (stage === 'environment_verified') {
    action = 'rotateData'; actionLabel = 'Re-encrypt database';
    body += environmentInstructions(status, 'The pending variables were verified. They will be checked again immediately before the database is changed.');
  } else if (stage === 'awaiting_environment_promotion') {
    action = 'finalize'; actionLabel = 'Verify active variables and finish';
    body += environmentInstructions(status, 'Promote the pending values to the active key and IV variables, reload PHP, and then complete verification.');
  } else if (stage === 'rotating') {
    action = 'rotateData'; actionLabel = 'Resume database rotation';
    body += '<p>An interrupted database rotation was detected. Keep both active and pending environment variables available and resume the operation.</p>';
  }

  const dialogButtons = [{ label: 'Close', value: 'cancel', cancel: true }];
  if (stage === 'awaiting_pending_environment') {
    dialogButtons.push({ label: 'Keys lost? Restart process...', value: 'restart' });
  }
  dialogButtons.push({ label: actionLabel, value: action, 'default': true });
  new nxDialog('encryptionRotationEnvironment', {
    width: 760,
    title: 'Rotate encryption key',
    buttons: dialogButtons,
    contents: `<div class="ekrDialog">${body}</div>`,
    callback: async function(value) {
      if (value === 'cancel') return;
      if (value === 'restart') {
        confirmEnvironmentRotationRestart();
        return;
      }
      let result;
      if (value === 'prepare') result = await startAjax('prepareEnvironmentEncryptionKey', {});
      if (value === 'verify') result = await startAjax('verifyEnvironmentEncryptionKey', {});
      if (value === 'rotateData') result = await startAjax('rotateEnvironmentEncryptedData', {});
      if (value === 'finalize') result = await startAjax('finalizeEnvironmentEncryptionKey', {});
      if (result?.error || !result?.data) return;
      if (value === 'prepare') showGeneratedEnvironmentKey(result.data);
      else if (result.data.stage === 'complete') showEncryptionCompletion(result.data);
      else {
        const refreshed = await startAjax('encryptionRotationStatus', {});
        if (!refreshed.error) openEnvironmentRotationDialog(refreshed.data);
      }
      refreshEncryptionRotationStatus();
    }
  });
}

function confirmEnvironmentRotationRestart() {
  new nxDialog('confirmEncryptionRotationRestart', {
    width: 650,
    title: 'Restart encryption-key rotation?',
    buttons: [
      { label: 'Cancel', value: 'cancel', cancel: true },
      { label: 'Restart and generate new key', value: 'restart', 'default': true }
    ],
    contents: `<div class="ekrDialog"><div class="ekrWarning">
      <strong>The previously generated pending key and IV will become invalid for this rotation.</strong>
      Continue only if those values were lost or cannot be installed. Any pending values already configured on the server must then be replaced with the newly generated values.
    </div></div>`,
    callback: async function(value) {
      if (value !== 'restart') return;
      const result = await startAjax('prepareEnvironmentEncryptionKey', {});
      if (!result.error && result.data) showGeneratedEnvironmentKey(result.data);
      refreshEncryptionRotationStatus();
    }
  });
}

function environmentWorkflowSteps(stage) {
  const current = {
    '': 1,
    awaiting_pending_environment: 2,
    environment_verified: 3,
    rotating: 3,
    awaiting_environment_promotion: 4
  }[stage] || 1;
  const labels = [
    'Generate and save the new key',
    'Install and verify pending variables',
    'Re-encrypt and verify the database',
    'Promote and verify active variables'
  ];
  return `<ol class="ekrSteps">${labels.map((label, index) => {
    const number = index + 1;
    const stateClass = number < current ? 'isComplete' : (number === current ? 'isCurrent' : '');
    const marker = number < current ? '&#10003;' : number;
    return `<li class="${stateClass}"><span>${marker}</span><div>${escapeHtml(label)}</div></li>`;
  }).join('')}</ol>`;
}

function environmentInstructions(status, lead) {
  const names = status.pendingNames || {};
  return `<p>${escapeHtml(lead)}</p><div class="ekrEnvNames">
    <div><span>Pending key variable</span><code>${escapeHtml(names.key || 'OASYS_AES_PENDING_KEY')}</code></div>
    <div><span>Pending IV variable</span><code>${escapeHtml(names.iv || 'OASYS_AES_PENDING_IV')}</code></div>
  </div>${status.rotation?.fingerprint ? `<p>Expected fingerprint: <code>${escapeHtml(status.rotation.fingerprint)}</code></p>` : ''}`;
}

function showGeneratedEnvironmentKey(data) {
  const names = data.pendingNames || {};
  new nxDialog('generatedEncryptionKey', {
    width: 820,
    title: 'New environment key generated',
    buttons: [{ label: 'I have saved these values', value: 'ok', 'default': true }],
    contents: `<div class="ekrDialog">${environmentWorkflowSteps('')}
      <div class="ekrWarning">These values are displayed only once. Store them securely before closing this dialog.</div>
      ${secretValueRow(names.key || 'OASYS_AES_PENDING_KEY', data.key, 'ekrGeneratedKey')}
      ${secretValueRow(names.iv || 'OASYS_AES_PENDING_IV', data.iv, 'ekrGeneratedIv')}
      <p>Fingerprint: <code>${escapeHtml(data.fingerprint || '-')}</code></p>
      <p>After installing the pending variables, reload PHP and open this feature again to verify them.</p></div>`
  });
  $('.ekrCopy').on('click', async function() {
    const input = document.getElementById($(this).data('target'));
    if (!input) return;
    const button = $(this);
    const status = button.closest('.ekrSecret').find('.ekrCopyStatus');
    let copied = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(input.value);
        copied = true;
      } else {
        input.select();
        copied = document.execCommand('copy');
        input.setSelectionRange(0, 0);
      }
    } catch (_error) {
      copied = false;
    }
    window.clearTimeout(button.data('feedbackTimer'));
    button.toggleClass('isCopied', copied).text(copied ? 'Copied' : 'Copy failed');
    status.toggleClass('isError', !copied).text(copied ? 'Saved to clipboard' : 'Could not access the clipboard');
    button.data('feedbackTimer', window.setTimeout(() => {
      button.removeClass('isCopied').text('Copy');
      status.removeClass('isError').text('');
    }, 2200));
  });
}

function secretValueRow(name, value, id) {
  return `<label class="ekrSecret"><span>${escapeHtml(name)}</span><div><input id="${id}" type="text" readonly value="${escapeHtml(value)}"><button type="button" class="ekrCopy" data-target="${id}">Copy</button></div><span class="ekrCopyStatus" role="status" aria-live="polite"></span></label>`;
}

function showEncryptionCompletion(data) {
  const counts = data.counts || {};
  showEncryptionMessage('Encryption key rotation complete',
    `<div class="ekrCompletion">
       <div class="ekrCompletionLead">
         <span class="ekrCompletionIcon" aria-hidden="true">&#10003;</span>
         <div><strong>Rotation completed successfully</strong>
         <span>All encrypted database values were updated and verified.</span></div>
       </div>
       <div class="ekrCompletionStats">
         <div><strong>${Number(counts.logins || 0)}</strong><span>Test-taker logins</span></div>
         <div><strong>${Number(counts.passwords || 0)}</strong><span>Passwords and labels</span></div>
         <div><strong>${Number(counts.settings || 0)}</strong><span>Encrypted system settings</span></div>
       </div>
       <div class="ekrCompletionFingerprint"><span>Active fingerprint</span><code>${escapeHtml(data.fingerprint || '-')}</code></div>
     </div>`);
}

function showEncryptionMessage(title, contents) {
  new nxDialog('encryptionRotationMessage', {
    width: 650, title, contents: `<div class="ekrDialog">${contents}</div>`,
    buttons: [{ label: 'OK', value: 'ok', 'default': true }]
  });
}

/* =========================
   File system check dialog
   ========================= */
async function filecheck() {
  let ret = await startAjax("filesyscheck", {});
  if (ret.error) return;

  const outputLines = String(ret.output || '').split(/\r?\n/).slice(3);
  ret.output = outputLines.join('\n');

  const firstLine = outputLines[0];
  if (firstLine === "-----------------------------------------------------") {
    ret.output = "All files match.";
  }

  let fc_diag = new nxDialog("fc_diag_id", {
    buttons: [
      { label: "Ok", value: "ok", 'default': true },
      { label: "Copy to Clipboard", value: "cp2clip" },
      { label: "Clean up Files", value: "cleanup", disabled: true }
    ],
    width: "800",
    title: "File System Check",
    contents: `<pre id="fcTxt" style="font-family: monospace; font-size: 14px; white-space: pre-wrap">${escapeHtml(ret.output)}</pre>`,
    callback: function(button) {
      if (button === "cp2clip") {
        if (navigator.clipboard) {
          navigator.clipboard.writeText($('#fcTxt').text()).then(() => {
            alert('Copied to clipboard');
          }).catch(err => alert('Failed to copy text: ' + err));
        } else {
          const ta = document.createElement("textarea");
          ta.value = $('#fcTxt').text();
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); alert('Copied to clipboard'); }
          catch (err) { alert('Failed to copy text: ' + err); }
          document.body.removeChild(ta);
        }
      } else if (button === "cleanup") {
        startAjax("file_cleanup", {}).then((res) => {
          new nxDialog("remResult", {
            button: [{ label: "Ok", value: "ok", "default": true }],
            width: 1200,
            title: "File Cleanup Result",
            contents: `<pre style="white-space: pre-wrap">${escapeHtml(Array.isArray(res.res) ? res.res.join('\n') : (res.res || ''))}</pre>`
          });
        });
      }
    }
  });
  if (ret.output.includes("EXTRA:") || ret.output.includes("EMPTY:")) {
    fc_diag.enableButton("cleanup");
  }
}

/* =========================
   System check dialog
   ========================= */
async function syscheck() {
  let ret = await startAjax("syscheck", {});
  const data = ret.data || {};

  const sysHtml = `
    <div class="sysz-dialogWrap">
      ${renderSyscheckColumns(data)}
    </div>`;

  new nxDialog("sc_diag_id", {
    buttons: [{ label: "Ok", value: "ok", 'default': true }],
    title: "System Check",
    contents: sysHtml,
    width: 1205
  });
}

function renderSyscheckColumns(data) {
  const groups = {};
  Object.keys(data)
    .filter(k => !["req", "found", "failMsgs", "warn", "categories", "details"].includes(k))
    .forEach(k => {
      const category = data.categories?.[k] || "General";
      if (!groups[category]) groups[category] = [];
      groups[category].push(k);
    });

  const leftCategories = ["PHP runtime", "PHP extensions", "PHP configuration"];
  const categories = Object.keys(groups);
  const left = leftCategories.filter(c => groups[c]);
  const right = categories.filter(c => !leftCategories.includes(c));

  const renderColumn = categoryList => categoryList.map(category => `
    <section class="sysz-scGroup">
      <h3 class="sysz-scGroupTitle">${escapeHtml(category)}</h3>
      <table class="sysz-scTbl">
        <thead><tr><th class="sysz-icoCell">Status</th><th class="sysz-cellKey">Parameter</th><th class="sysz-cellReq">Required</th><th>Result</th></tr></thead>
        <tbody>${groups[category].map(k => {
      const v = data[k];
      let cls = "", icon = "OK";
      if (v === false) { cls = "is-fail"; icon = "FAIL"; }
      else if (v === "warn") { cls = "is-warn"; icon = "WARN"; }

      return `
        <tr class="${cls}">
          <td class="sysz-icoCell"><span class="sysz-statusIcon">${icon}</span></td>
          <td class="sysz-cellKey">${escapeHtml(k)}${data.details?.[k] ? `<div class="sysz-cellKeyMeta">${escapeHtml(data.details[k])}</div>` : ""}</td>
          <td class="sysz-cellReq">${escapeHtml(data.req?.[k] ?? "")}</td>
          <td class="sysz-cellFound">
            ${v === false
              ? `<div class="sysz-foundBlock">${escapeHtml(data.found?.[k] ?? "")}<div class="sysz-failMsg">${escapeHtml(data.failMsgs?.[k] ?? "")}</div></div>`
              : (v === "warn"
                ? `<div class="sysz-foundBlock">${escapeHtml(data.warn?.[k] ?? data.found?.[k] ?? "")}</div>`
                : `<div class="sysz-foundBlock">${escapeHtml(data.found?.[k] ?? "")}</div>`)}
          </td>
        </tr>`;
    }).join("")}</tbody>
      </table>
    </section>`).join("");

  return `
    <div class="sysz-scColumns">
      <div class="sysz-scColumn">${renderColumn(left)}</div>
      <div class="sysz-scColumn">${renderColumn(right)}</div>
    </div>`;
}

/* =========================
   Modules dialog
   ========================= */
function showModules() {
  let content;
  if (!settings || !settings.modules || Object.keys(settings.modules).length === 0) {
    content = "<p>No custom modules installed.</p>";
  } else {
    content = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ccc;">Module</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ccc;">Description</th>
            <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Min OASYS</th>
            <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Max OASYS</th>
            <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Version</th>
          </tr>
        </thead>
        <tbody>
          ${Object.keys(settings.modules).map(name => {
            const m = settings.modules[name];
            return `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>${escapeHtml(m.module ?? '')}</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(m.info ?? '')}</td>
                <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(m.oamin ?? '')}</td>
                <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(m.oamax ?? '')}</td>
                <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;"><strong>${escapeHtml(m.version ?? '')}</strong></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  new nxDialog("sc_moduleCheck_id", {
    buttons: [{ label: "Ok", value: "ok", 'default': true }],
    title: "Custom Modules Installed",
    contents: content,
    width: 800
  });
}

/* =========================
   Settings list + editors
   ========================= */
function refreshList() { startAjax('fetchSettings', {}); }

function propertiesClick(clickedId, _parentId, fieldDesc) {
  let clickedKey = (fieldDesc === 'actionField')
    ? clickedId.substring('actionField_varSettings_table_'.length)
    : clickedId;

  switch (settingsDefaults[clickedKey].format) {
    case 0: edit_bool(clickedKey); break;
    case 1: edit_int(clickedKey); break;
    case 3: edit_string(clickedKey); break;
    case 4: edit_single_choice_int(clickedKey); break;
    case 5: edit_single_choice_string(clickedKey); break;
    case 6: edit_multiple_choice(clickedKey); break;
    case 7: edit_password(clickedKey); break;
  }
}

function propertiesChanged() { /* not used */ }

function settingDialogShell(clickedKey, rowsHtml, extraClass = '') {
  return `
    <div class="sysSettingEditDialog ${extraClass}">
      <div class="sysSettingEditIntro">
        <span>System setting</span>
        <strong>${escapeHtml(clickedKey)}</strong>
      </div>
      <div class="sysSettingEditPanel">
        ${rowsHtml}
      </div>
    </div>`;
}

function settingEditRow(label, valueHtml, extraClass = '') {
  return `
    <div class="sysSettingEditRow ${extraClass}">
      <div class="sysSettingEditLabel">${escapeHtml(label)}</div>
      <div class="sysSettingEditValue">${valueHtml}</div>
    </div>`;
}

function settingStaticValue(value) {
  const displayValue = (value === '') ? '< no value set >' : stringifyValue(value);
  return `<span class="sysSettingStaticValue">${escapeHtml(displayValue)}</span>`;
}

function edit_bool(clickedKey, button) {
  if (!button) {
    const html = settingDialogShell(clickedKey,
      settingEditRow('Current', '<div id="setting" class="sysSettingControl"></div>') +
      settingEditRow('Default', settingStaticValue(settingsDefaults[clickedKey].value))
    );
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, title: 'Edit system setting: ' + clickedKey, width: 450, callback: edit_bool
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);
    const cvs = $('#setting');
    const settingVal = {};
    settingVal.currVal = new jsToggleswitch(cvs, 'tsCurrVal', {
      dataId: 'settVal', height: 20, width: 60,
      background: 'images/ic_ui_toggleswitch.png',
      changeCallback: (s, v) => { editSetDialog.enableButton('save'); val = v; }
    });
    settingVal.currVal.reset(settingsObj[clickedKey]);
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      if (settingsDefaults[clickedKey].value === val) resetSetting(clickedKey);
      else saveSetting(clickedKey, val, false);
    }
  }
}

function edit_int(clickedKey, button) {
  if (!button) {
    const html = settingDialogShell(clickedKey,
      settingEditRow('Current', '<div id="setting" class="sysSettingControl"></div>') +
      settingEditRow('Default', settingStaticValue(settingsDefaults[clickedKey].value)) +
      settingEditRow('Min / Max', `<span class="sysSettingStaticValue">${escapeHtml(settingsDefaults[clickedKey].min)} / ${escapeHtml(settingsDefaults[clickedKey].max)}</span>`)
    );
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, title: 'Edit system setting: ' + clickedKey, width: 450, callback: edit_int
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);
    const cvs = $('#setting');
    const settingVal = {};
    settingVal.currVal = new jsNumberInput(cvs, 'tsCurrVal', {
      dataId: 'settVal',
      range: settingsDefaults[clickedKey].min + '..' + settingsDefaults[clickedKey].max,
      step: settingsDefaults[clickedKey].step,
      height: 20, width: 100,
      initialValue: settingsObj[clickedKey],
      onChange: (_s, v) => { editSetDialog.enableButton('save'); val = v; }
    });
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      if (settingsDefaults[clickedKey].value === val) resetSetting(clickedKey);
      else {
        if (typeof settingsDefaults[clickedKey].min === 'number' && val < settingsDefaults[clickedKey].min) val = settingsDefaults[clickedKey].min;
        if (typeof settingsDefaults[clickedKey].max === 'number' && val > settingsDefaults[clickedKey].max) val = settingsDefaults[clickedKey].max;
        saveSetting(clickedKey, val, false);
      }
    }
  }
}

function edit_string(clickedKey, button, dataObj) {
  if (!button) {
    const dataFields = ['setting'];
    const html = settingDialogShell(clickedKey,
      settingEditRow('Current', '<input type="text" class="setClick sysSettingTextInput" id="setting">') +
      settingEditRow('Default', settingStaticValue(settingsDefaults[clickedKey].value))
    );
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, datafields: dataFields, mandatory: ['setting'], focus: 'setting',
      dataFormat: 'object', title: 'Edit system setting: ' + clickedKey, width: 500, callback: edit_string
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);
    $('#setting').val(settingsObj[clickedKey]).on('input', () => editSetDialog.enableButton('save'));
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      if (settingsDefaults[clickedKey].value === dataObj.setting) resetSetting(clickedKey);
      else saveSetting(clickedKey, dataObj.setting, false);
    }
  }
}

function edit_password(clickedKey, button, dataObj) {
  if (!button) {
    const dataFields = ['setting'];
    const html = settingDialogShell(clickedKey,
      settingEditRow('Current', '<input type="password" class="setClick sysSettingTextInput" id="setting" value="">') +
      settingEditRow('Default', settingStaticValue(settingsDefaults[clickedKey].value))
    );
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, datafields: dataFields, mandatory: ['setting'], focus: 'setting',
      dataFormat: 'object', title: 'Edit system setting: ' + clickedKey, width: 500, callback: edit_password
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);
    $('#setting').on('input', () => editSetDialog.enableButton('save'));
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      if (settingsDefaults[clickedKey].value === dataObj.setting) resetSetting(clickedKey);
      else saveSetting(clickedKey, dataObj.setting, true);
    }
  }
}

function edit_single_choice_int(clickedKey, button) {
  if (!button) {
    const html = settingDialogShell(clickedKey,
      settingEditRow('Current', '<div id="setting" class="sysSettingDrop"></div>') +
      settingEditRow('Default', settingStaticValue(settingsDefaults[clickedKey].value))
    );
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, title: 'Edit system setting: ' + clickedKey, width: 450, callback: edit_single_choice_int
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);
    const cvs = $('#setting');
    const contentDropList = [];
    for (let i in settingsDefaults[clickedKey].choices) {
      contentDropList.push({ label: i + ' ' + settingsDefaults[clickedKey].choices[i], value: i });
    }
    new jsDropList(cvs, 'tsCurrVal', {
      theme: 'backend',
      dataId: 'settVal', elements: contentDropList,
      initialValue: settingsObj[clickedKey].toString(),
      onChange: (_s, v) => { editSetDialog.enableButton('save'); val = v; }
    });
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      if (settingsDefaults[clickedKey].value === val) resetSetting(clickedKey);
      else { val = parseInt(val, 10); saveSetting(clickedKey, val, false); }
    }
  }
}

function edit_single_choice_string(clickedKey, button) {
  if (!button) {
    const html = settingDialogShell(clickedKey,
      settingEditRow('Current', '<div id="setting" class="sysSettingDrop"></div>') +
      settingEditRow('Default', settingStaticValue(settingsDefaults[clickedKey].value))
    );
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, title: 'Edit system setting: ' + clickedKey, width: 450, callback: edit_single_choice_string
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);
    const cvs = $('#setting');
    const contentDropList = [];
    for (let i in settingsDefaults[clickedKey].choices) {
      contentDropList.push({ label: settingsDefaults[clickedKey].choices[i], value: i });
    }
    new jsDropList(cvs, 'tsCurrVal', {
      theme: 'backend',
      dataId: 'settVal', elements: contentDropList, width: '100%',
      initialValue: settingsObj[clickedKey].toString(),
      onChange: (_s, v) => { editSetDialog.enableButton('save'); val = v; }
    });
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      if (settingsDefaults[clickedKey].value === val) resetSetting(clickedKey);
      else { val = String(val); saveSetting(clickedKey, val, false); }
    }
  }
}

function edit_multiple_choice(clickedKey, button) {
  if (!button) {
    const html = settingDialogShell(clickedKey, `
      <div class="sysSettingMultiHeader">
        <span>Option</span>
        <span>Current</span>
        <span>Default</span>
      </div>
      <div id="setting" class="sysSettingMultiGrid"></div>`, 'sysSettingMultiDialog');
    const dlgData = {
      buttons: [{ label: 'Cancel', 'cancel': true, value: 'cancel' }, { label: 'Reset to default', value: 'reset' }, { label: 'Save changes', 'default': true, disabled: true, value: 'save' }],
      contents: html, title: 'Edit system setting: ' + clickedKey, width: 650, callback: edit_multiple_choice
    };
    window.editSetDialog = new nxDialog('editSetDialog', dlgData, arguments);

    const cvs = $('#setting');
    let currentValues = settingsObj[clickedKey];
    if (!Array.isArray(currentValues)) {
      try { currentValues = JSON.parse(currentValues || '[]'); }
      catch { currentValues = []; }
    }
    if (!Array.isArray(currentValues)) currentValues = [];
    currentValues = currentValues.map(String);

    for (let i in settingsDefaults[clickedKey].choices) {
      cvs.append(`<div class="sysSettingMultiCell sysSettingMultiDesc">${escapeHtml(settingsDefaults[clickedKey].choices[i])}</div>`);
      if (currentValues.includes(String(i))) {
        cvs.append('<div id="div_' + i + '" class ="settingsItem sysSettingMultiCell sysSettingMultiCurrentItem settingChecked"><img alt="" src="../inc/filer/images/checked_checkbox.png" id="img_' + i + '" />&nbsp;' + escapeHtml(i) + '</div>');
      } else {
        cvs.append('<div id="div_' + i + '" class ="settingsItem sysSettingMultiCell sysSettingMultiCurrentItem"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_' + i + '" />&nbsp;' + escapeHtml(i) + '</div>');
      }
      if (settingsDefaults[clickedKey].value.indexOf(i) > -1) {
        cvs.append('<div class ="settingsItem sysSettingMultiCell sysSettingMultiDefault"><img alt="" src="../images/true.png" height="16px" />&nbsp;' + escapeHtml(i) + '</div>');
      } else {
        cvs.append('<div class ="settingsItem sysSettingMultiCell sysSettingMultiDefault"><img alt="" src="../images/false.png" height="16px" />&nbsp;' + escapeHtml(i) + '</div>');
      }

      $("#div_" + i).on("click", function() {
        $(this).toggleClass('settingChecked');
        $('img', this).attr('src',
          $(this).hasClass('settingChecked')
            ? '../inc/filer/images/checked_checkbox.png'
            : '../inc/filer/images/unchecked_checkbox.png'
        );
        editSetDialog.enableButton('save');
      });
    }
  } else {
    if (button === 'reset') resetSetting(clickedKey);
    if (button === 'save') {
      const writeArr = [];
      $('#setting .sysSettingMultiCurrentItem').each(function() {
        if ($(this).hasClass('settingChecked')) writeArr.push(this.id.slice(4));
      });
      const same = deepEqual(writeArr, settingsDefaults[clickedKey].value);
      if (same) { resetSetting(clickedKey); }
      else { const saveSett = JSON.stringify(writeArr); saveSetting(clickedKey, saveSett, false); }
    }
  }
}

/* helpers for saving/resetting a single setting */
function resetSetting(clickedKey) {
  gui.statusBar.setStatus('');
  startAjax('resetSetting', { clickedKey });
}

function saveSetting(clickedKey, value, encryption) {
  gui.statusBar.setStatus('');
  if (settingsDefaults[clickedKey]['value'] === value) { resetSetting(clickedKey); }
  else { startAjax('saveSetting', { clickedKey, value, encryption }); }
}

/* =========================
   EXPORT dialog
   ========================= */
function openExportDialog() {
  const list = buildNonDefaultList();
  const hasEncrypted = list.some(it => encMap[it.key] === 1);

  const warningHTML = hasEncrypted ? `
    <div class="export-callout" role="alert" aria-live="polite">
      <div class="enc-icon" aria-hidden="true">${lockOpenSvg(16)}</div>
      <div>
        <div class="callout-title">Encrypted values included</div>
        <p class="callout-text">
          This export contains settings that are stored encrypted. They will be exported in <strong>clear text</strong> only when the file is created.
          Handle the CSV securely and prevent unauthorized access.
        </p>
      </div>
    </div>` : ``;

  const legendHTML = hasEncrypted ? `
    <div class="export-legend">
      <span class="enc-icon" aria-hidden="true">${lockOpenSvg(12)}</span>
      <span>Marked values are stored encrypted</span>
    </div>` : ``;

  const listHTML = (list.length === 0)
    ? `<p class="export-none">There are no non-default settings. Nothing to export.</p>`
    : `
      ${legendHTML}
      <div class="export-table-wrap">
        <table class="tbl">
          <thead class="tbl-head">
            <tr>
              <th class="col-setting">Setting</th>
              <th>Current value</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(it => {
              const isDecrypted = encMap[it.key] === 1;
              const isPassword = isPasswordSetting(it.key);
              const badge = isDecrypted ? encryptedBadgeHtml() : ``;
              const displayValue = isPassword ? '' : stringifyValue(it.value);
              return `
                <tr class="${isDecrypted ? 'enc-row' : ''}">
                  <td class="tbl-cell"><code>${escapeHtml(it.key)}</code></td>
                  <td class="tbl-cell value-cell">${badge}${badge ? '&nbsp;&nbsp;' : ''}${escapeHtml(displayValue)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

  const intro = `
    <div class="export-wrap">
      <p class="export-intro-1">Only <strong>non-default</strong> values of this system will be saved as a CSV file.</p>
      <p class="export-intro-2">The CSV will contain two columns: <code>setting</code> and <code>value</code>.</p>
    </div>`;

  new nxDialog("export_settings_dialog", {
    width: 720,
    title: "Export system settings",
    contents: `${intro}${warningHTML}${listHTML}`,
    buttons: [
      { label: "Cancel", value: "cancel", cancel: true },
      { label: "Export file", value: "export", 'default': true, disabled: (list.length === 0) }
    ],
    callback: function(button) { if (button === "export") exportSettingsCsv(list); }
  });
}

function lockOpenSvg(size = 14) {
  return `
    <svg class="enc-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 17a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm6-6h-8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Z" stroke="#7f1d1d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9 7a4 4 0 1 1 8 0v2" stroke="#7f1d1d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

/* =========================
   IMPORT flow
   ========================= */
function openImportDialog() {
  const dlg = new nxDialog("import_settings_dialog", {
    width: 1100,  // wider
    title: "Import system settings",
    contents: `
      <div id="impShell" class="imp-shell">
        <!-- Step 1: big dropzone -->
        <div id="impStepDrop">
          <div class="imp-drop" id="impDrop" tabindex="0" role="button" aria-label="Drop CSV file here or choose one">
            <div class="imp-drop-inner">
              <div class="imp-icon" aria-hidden="true">⬆️</div>
              <div class="imp-title">Drop CSV here</div>
              <div class="imp-or">or</div>
              <label class="imp-choose" id="impChooseLbl" for="impFileInput">Select import file…</label>
              <input id="impFileInput" type="file" accept=".csv,text/csv" hidden />
              <div class="imp-hint">CSV with columns <code>setting</code>, <code>value</code></div>
            </div>
          </div>
        </div>

        <!-- Tiles -->
        <div id="impTilesWrap" style="display:none;">
          <div class="imp-tiles">
            <div class="imp-tile imp-ok" id="tile-valid">
              <div class="imp-tile-num" id="tileValidNum">0</div>
              <div class="imp-tile-label">Valid settings</div>
            </div>
            <div class="imp-tile" id="tile-ignored">
              <div class="imp-tile-num" id="tileIgnoredNum">0</div>
              <div class="imp-tile-label">Ignored settings</div>
            </div>
            <div class="imp-tile" id="tile-unknown">
              <div class="imp-tile-num" id="tileUnknownNum">0</div>
              <div class="imp-tile-label">Unknown settings</div>
            </div>
          </div>
        </div>

        <!-- Combined details table -->
        <div id="impDetails" style="display:none; flex:1; min-height:0;">
          <div class="export-table-wrap">
            <table class="tbl">
              <thead class="tbl-head">
                <tr>
                  <th class="col-setting" style="width:28%;">Setting</th>
                  <th style="width:22%;">Default</th>
                  <th style="width:34%;">CSV value</th>
                  <th style="width:16%;">Status / Reason</th>
                </tr>
              </thead>
              <tbody id="imp_combined_tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `,
    buttons: [
      { label: "Close", value: "cancel", cancel: true },
      { label: "Apply settings", value: "apply", 'default': true, disabled: true }
    ],
    callback: async function(button){
      if (button === 'apply' && dlg._impPayload) {
        const res = await startAjax('import_settings', dlg._impPayload);
        if (!res || res.error) {
          new nxDialog('impErr', {
            width: 520, title: 'Import failed',
            contents: `<div class="imp-error">${escapeHtml(res?.error || 'Unknown server error')}</div>`,
            buttons: [{label:'OK', value:'ok', 'default':true}]
          });
          return;
        }
        await startAjax('fetchSettings', {});
        dlg.dismiss();
      }
    }
  });

  // Elements
  const drop   = document.getElementById('impDrop');
  const fileIn = document.getElementById('impFileInput');
  const label  = document.getElementById('impChooseLbl');
  const stepDrop  = document.getElementById('impStepDrop');
  const tilesWrap = document.getElementById('impTilesWrap');
  const details   = document.getElementById('impDetails');

  const tileValid   = document.getElementById('tile-valid');
  const tileIgnored = document.getElementById('tile-ignored');
  const tileUnknown = document.getElementById('tile-unknown');
  const tileValidNum   = document.getElementById('tileValidNum');
  const tileIgnoredNum = document.getElementById('tileIgnoredNum');
  const tileUnknownNum = document.getElementById('tileUnknownNum');

  // helpers
  const resetInput = () => { fileIn.value = ''; };
  const setBusy = (on) => drop.classList.toggle('is-busy', !!on);

  // prevent “double choose”
  drop.addEventListener('click', (e) => {
    if (!e.target.closest('#impChooseLbl')) { resetInput(); fileIn.click(); }
  });
  label.addEventListener('click', (e) => { e.stopPropagation(); resetInput(); });
  drop.addEventListener('keydown', (e) => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); resetInput(); fileIn.click(); } });

  // drag & drop
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev,(e)=>{e.preventDefault();e.stopPropagation();drop.classList.add('is-drag');}));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev,(e)=>{e.preventDefault();e.stopPropagation();drop.classList.remove('is-drag');}));
  drop.addEventListener('drop', (e)=> handleFiles(e.dataTransfer.files));
  fileIn.addEventListener('change', (e)=> handleFiles(e.target.files));

  async function handleFiles(files){
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const text = await readFileAsText(files[0]);

      // strict preflight: > 2 cols => hard error
      const pre = csvPreflight(text);
      if (pre.tooManyCols) {
        new nxDialog('badCsvDlg', {
          width: 520, title: 'Invalid CSV',
          contents: `<div class="imp-error">
            This file has rows with <strong>more than two columns</strong>.<br>
            Provide exactly two columns: <code>setting,value</code>.<br>
            Example: <code>"debugSystem","true"</code>
          </div>`,
          buttons:[{label:'OK',value:'ok','default':true}]
        });
        return;
      }

      // parse: accept exactly 2 columns; 1-col rows ignored
      const rows = parseCsvTwoCols(text); // [{setting,value}]
      if (!rows.length) {
        new nxDialog('noRows', {
          width: 520, title: 'No usable rows',
          contents: `<div class="imp-error">
            No valid rows found. Each row must contain exactly two columns: <code>setting,value</code>.<br>
            Example: <code>"debugSystem","true"</code>
          </div>`,
          buttons:[{label:'OK',value:'ok','default':true}]
        });
        return;
      }

      const prep = prepareImport(rows);

      // counts
      const unknownCount = prep.ignored.filter(i => (i.reason||'').toLowerCase().startsWith('unknown setting')).length;
      tileValidNum.textContent   = String(prep.valid.length);
      tileIgnoredNum.textContent = String(prep.ignored.length);
      tileUnknownNum.textContent = String(unknownCount);

      // tile colors (red when > 0, ok green for valid if >0)
      tileValid.classList.toggle('imp-ok', prep.valid.length > 0);
      [ [tileIgnored, prep.ignored.length], [tileUnknown, unknownCount] ].forEach(([el, n])=>{
        el.classList.toggle('imp-bad', n > 0);
        el.classList.toggle('imp-ok', n === 0);
      });

      // render combined table immediately
      renderImportCombined(prep);

      // switch UI
      stepDrop.style.display = 'none';
      tilesWrap.style.display = 'block';
      details.style.display   = 'block';

      // enable Apply
      dlg.enableButton('apply', prep.valid.length > 0);

      // server payload
      dlg._impPayload = {
        items: prep.valid.map(v => ({
          option: v.key,
          value: v.storeValue,
          encryption: v.encrypt === true
        }))
      };
    } finally {
      setBusy(false);
    }
  }
}

/* =========================
   IMPORT helpers
   ========================= */

// Quick preflight: detects any row with >2 comma-separated fields (CSV with quotes aware)
function csvPreflight(text) {
  let tooManyCols = false;
  let i = 0, f = '', inQ = false, row = [];
  const flushField = () => { row.push(f); f=''; };
  const flushRow = () => {
    // if more than 2 fields (even empty), flag
    if (row.length > 2) tooManyCols = true;
    row = [];
  };
  while (i < text.length) {
    const c = text[i++];
    if (inQ) {
      if (c === '"') {
        if (text[i] === '"') { f += '"'; i++; } else { inQ = false; }
      } else { f += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') flushField();
      else if (c === '\n') { flushField(); flushRow(); }
      else if (c === '\r') { /* ignore */ }
      else f += c;
    }
  }
  flushField(); flushRow();
  return { tooManyCols };
}

function renderImportCombined(prep) {
  const $body = $('#imp_combined_tbody').empty();
  const rows = [];

  // valid first (optional)
  prep.valid.forEach(v => rows.push({
    type:'valid',
    key:v.key,
    def:v.default,
    csv:v.csvValue,
    statusHtml:`<span class="status status-ok">valid</span>`
  }));

  // ignored (includes invalid values + unknown)
  prep.ignored.forEach(i=>{
    const isUnknown = (i.reason||'').toLowerCase().startsWith('unknown setting');
    rows.push({
      type: isUnknown ? 'unknown' : 'ignored',
      key: i.key,
      def: '',
      csv: i.csvValue,
      statusHtml:`<span class="status status-warn">${escapeHtml(i.reason||'Ignored')}</span>`
    });
  });

  rows.forEach(r=>{
    const rowCls = (r.type==='valid') ? '' : 'row-warn';
    $body.append(`
      <tr class="${rowCls}">
        <td class="tbl-cell"><code>${escapeHtml(r.key)}</code></td>
        <td class="tbl-cell">${escapeHtml(stringifyValue(r.def))}</td>
        <td class="tbl-cell value-cell">${formatImportCsvValueCell(r)}</td>
        <td class="tbl-cell">${r.statusHtml}</td>
      </tr>
    `);
  });
}

function formatImportCsvValueCell(row) {
  if (isPasswordSetting(row.key) && row.type === 'valid') {
    return encryptedBadgeHtml('Will be stored encrypted');
  }
  return escapeHtml(stringifyValue(row.csv));
}


// Parser that returns only rows with EXACTLY two columns
function parseCsvTwoCols(text) {
  const out = [];
  let i = 0, f = '', inQ = false, row = [];
  const flushField = () => { row.push(f); f=''; };
  const flushRow = () => {
    if (row.length === 2) {
      out.push({ setting: row[0].trim(), value: row[1] });
    }
    row = [];
  };
  while (i < text.length) {
    const c = text[i++];
    if (inQ) {
      if (c === '"') {
        if (text[i] === '"') { f += '"'; i++; } else { inQ = false; }
      } else { f += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') flushField();
      else if (c === '\n') { flushField(); flushRow(); }
      else if (c === '\r') { /* ignore CR */ }
      else f += c;
    }
  }
  flushField(); flushRow();

  // Drop optional header
  if (out.length && out[0].setting.toLowerCase() === 'setting') out.shift();

  return out;
}


function prepareImport(rows) {
  // rows: [{setting, value}]
  const valid = [];
  const ignored = [];

  for (const r of rows) {
    const key = (r.setting || '').trim();
    const raw = (r.value ?? '').toString();

    if (!key) { ignored.push({ key: '(empty)', csvValue: raw, reason: 'Missing setting key' }); continue; }
    if (!(key in settingsDefaults)) {
      ignored.push({ key, csvValue: raw, reason: 'Unknown setting' });
      continue;
    }

    const def = settingsDefaults[key];
    const fmt = def.format;

    const norm = normalizeCsvValue(fmt, def, raw);
    if (!norm.ok) {
      ignored.push({ key, csvValue: raw, reason: norm.reason || 'Invalid value' });
      continue;
    }

    valid.push({
      key,
      csvValue: norm.displayValue,
      storeValue: norm.storeValue,
      default: def.value,
      encrypt: (fmt === 7) // passwords stored encrypted
    });
  }
  return { valid, ignored };
}

function normalizeCsvValue(fmt, def, rawStr) {
  const s = (rawStr ?? '').toString().trim();

  // 0=bool, 1=int, 2=double(not used), 3=string, 4=single_choice_int, 5=single_choice_string, 6=multiple_choice, 7=password
  switch (fmt) {
    case 0: {
      const t = s.toLowerCase();
      if (['true','1','yes','on'].includes(t))  return { ok: true, storeValue: true,  displayValue: 'true'  };
      if (['false','0','no','off'].includes(t)) return { ok: true, storeValue: false, displayValue: 'false' };
      return { ok: false, reason: 'Expected boolean' };
    }
    case 1: {
      if (!/^-?\d+$/.test(s)) return { ok: false, reason: 'Expected integer' };
      let v = parseInt(s, 10);
      if (typeof def.min === 'number' && v < def.min) return { ok: false, reason: `Below min (${def.min})` };
      if (typeof def.max === 'number' && v > def.max) return { ok: false, reason: `Above max (${def.max})` };
      if (typeof def.step === 'number' && def.step > 0 && typeof def.min === 'number') {
        const delta = Math.abs(v - def.min) % def.step;
        if (delta !== 0) return { ok: false, reason: `Not matching step (${def.step})` };
      }
      return { ok: true, storeValue: v, displayValue: String(v) };
    }
    case 3: { return { ok: true, storeValue: s, displayValue: s }; }
    case 4: {
      if (!(s in def.choices)) return { ok: false, reason: 'Unknown choice' };
      return { ok: true, storeValue: parseInt(s,10), displayValue: s };
    }
    case 5: {
      if (!(s in def.choices)) return { ok: false, reason: 'Unknown choice' };
      return { ok: true, storeValue: s, displayValue: s };
    }
    case 6: {
      let arr = [];
      if (s.startsWith('[')) {
        try {
          const tmp = JSON.parse(s);
          if (!Array.isArray(tmp)) return { ok:false, reason:'Expected array' };
          arr = tmp.map(x => String(x));
        } catch { return { ok:false, reason:'Invalid JSON' }; }
      } else {
        arr = s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];
      }
      const all = Object.keys(def.choices || {});
      for (const x of arr) if (!all.includes(x)) return { ok:false, reason:`Unknown entry: ${x}` };
      return { ok:true, storeValue: JSON.stringify(arr), displayValue: JSON.stringify(arr) };
    }
    case 7: {
      if (s === '') return { ok: false, reason: 'Pwd cannot be empty' };
      return { ok: true, storeValue: s, displayValue: 'encrypted' };
    }
    default: { return { ok: true, storeValue: s, displayValue: s }; }
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('File read error'));
    r.readAsText(file, 'utf-8');
  });
}

/* =========================
   EXPORT helpers
   ========================= */
function buildNonDefaultList() {
  const out = [];
  for (const key of Object.keys(settingsDefaults)) {
    if (settingsDefaults[key]['scope'] !== 0) continue;
    const isPassword = isPasswordSetting(key);
    let cur = isPassword
      ? (passwordSetMap[key] ? 'encrypted' : settingsDefaults[key]['value'])
      : ((key in settingsObj) ? settingsObj[key] : settingsDefaults[key]['value']);
    let def = settingsDefaults[key]['value'];

    if (typeof cur === 'object' && cur !== null) cur = JSON.parse(JSON.stringify(cur));
    if (typeof def === 'object' && def !== null) def = JSON.parse(JSON.stringify(def));

    if (!deepEqual(cur, def)) out.push({ key, value: cur });
  }
  nonDefaultList = out;
  return out;
}

async function exportSettingsCsv(list) {
  const exportValues = await fetchExportValues(list);
  if (!exportValues) return;

  const header = ['setting', 'value'];
  const rows = [header];

  for (const { key, value } of list) {
    const exportValue = (key in exportValues) ? exportValues[key] : value;
    const valStr = stringifyValue(exportValue);
    rows.push([key, valStr]);
  }

  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });

  const fname = `oasys_settings_${formatDateDDMMYYYY(new Date())}.csv`;
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url; link.download = fname;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

async function fetchExportValues(list) {
  const res = await startAjax('export_settings_values', { keys: list.map(it => it.key) });
  if (!res || res.error) return null;
  return res.values || {};
}

/* =========================
   General helpers
   ========================= */
   
function isPasswordSetting(key) {
  return settingsDefaults?.[key]?.format === 7;
}

function encryptedBadgeHtml(title = 'Stored encrypted') {
  return `<span class="enc-badge" title="${escapeHtml(title)}">${lockOpenSvg(11)} Encryption</span>`;
}

function renderPasswordBadgesInSettingsList() {
  $('#sortableTable_varSettings_table tr.data-rows_varSettings_table').each(function() {
    const key = $(this).attr('data-id');
    if (!isPasswordSetting(key) || !passwordSetMap[key]) return;
    $(this).find('td[data-fielddesc="value"]').html(encryptedBadgeHtml());
  });
}

function stringifyValue(v) {
  if (v === null || typeof v === 'undefined') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function csvEscape(field) { const s = String(field).replace(/"/g, '""'); return `"${s}"`; }
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function deepEqual(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return String(a) === String(b); } }
function formatDateDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

/* =========================
   Server comms
   ========================= */
async function startAjax(action, data) {
  waitDialog.show();
  const params = { action, data: JSON.stringify(data || {}) };
  return $.ajax({ data: params });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
  waitDialog.hide();
  const dialogData = {
    buttons: [{ label: 'OK', 'default': true, cancel: true, value: 'ok' }],
    contents: (jqXHR.responseJSON && jqXHR.responseJSON.fatalError)
      ? jqXHR.responseJSON.fatalError
      : ('An unexpected error occurred: ' + (errorThrown || textStatus)),
    title: 'Error: ' + (errorThrown || textStatus),
    width: 500
  };
  new nxDialog('ajaxError', dialogData);
}

function ajaxSuccess(res) {
  // set logged in username
  $('#un_val').html(res.loggedInName);

  // role flags from backend
  isSuper = !!res.isSuper;
  isAE    = !!res.isAE;
  isPrivileged = (isSuper || isAE);

  // Maintenance Mode SA-only
  if (isSuper) {
    buttons.maintMode.show();
    buttons.rotateEncryptionKey.show();
    $("#mm_div").show();
  }
  else {
    buttons.maintMode.hide();
    buttons.rotateEncryptionKey.hide();
    $("#mm_div").hide();
  }

  // Export/Import button visibility
  if (isPrivileged) {
    buttons.exportSettings?.show && buttons.exportSettings.show();
    buttons.importSettings?.show && buttons.importSettings.show();
  } else {
    buttons.exportSettings?.hide && buttons.exportSettings.hide();
    buttons.importSettings?.hide && buttons.importSettings.hide();
  }

  waitDialog.hide();

  if (res.fatalError) {
    new nxDialog('fatalError', {
      buttons: [{ label: 'OK', 'default': true, cancel: true, value: 'ok' }],
      contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br />' + res.fatalError),
      title: "Error", icon: "../images/error.png", iconWidth: 64, width: 500
    });
    return;
  }

  if (res.error !== false) {
    new nxDialog('error', {
      buttons: [{ label: 'OK', 'default': true, cancel: true, value: 'ok' }],
      contents: formatActionErrorMessage('<strong>Sorry! The action cannot be completed.</strong><br />' + res.error),
      title: "Error", icon: "../images/error.png", iconWidth: 64, width: 500
    });
    if (res.reload) startAjax('fetchSettings', {});
    return;
  }

  if (res.adjustedSetting) {
    gui.statusBar.setStatus(
      `${res.adjustedSetting.option} was automatically set to ${String(res.adjustedSetting.value)} to keep the cookie settings compatible.`,
      false,
      'error'
    );
  }

  switch (res.action) {
    case 'fetchSettings': {
      if (!res.data) res.data = {};
      encMap = res.encMap || {};
      passwordSetMap = res.passwordSetMap || {};

      const listArray = [];
      nonDefaultList = [];

      for (const key of Object.keys(settingsDefaults)) {
        if (settingsDefaults[key]['scope'] !== 0) continue;

        const isPassword = isPasswordSetting(key);
        const hasOverride = isPassword ? !!passwordSetMap[key] : (key in res.data);
        let listValue = isPassword
          ? (hasOverride ? 'encrypted' : settingsDefaults[key]['value'])
          : (hasOverride ? res.data[key] : settingsDefaults[key]['value']);
        const listOverride = hasOverride ? { hiddendata: true } : {};

        settingsObj[key] = listValue;

        const def = settingsDefaults[key]['value'];
        if (!deepEqual(listValue, def)) nonDefaultList.push({ key, value: listValue });

        let displayVal = (typeof listValue === 'object') ? JSON.stringify(listValue) : String(listValue);
        if (displayVal.length > 44) displayVal = displayVal.substring(0, 44) + ' ...';

        const listItem = {};
        const listComment = (typeof settingsDefaults[key]['comment'] !== 'undefined') ? settingsDefaults[key]['comment'] : '';

        if (typeof settingsDefaults[key]['options'] !== 'undefined') {
          listItem.option = key;
          listItem.actionField = '-';
        } else {
          listItem.option = { id: key, data: key, hiddenData: {} };
          listItem.actionField = listOverride;
        }
        listItem.hiddenID = key;
        listItem.value = displayVal;
        listItem.comment = listComment;

        listArray.push(listItem);
      }

      gui.settingsView.clearElements();
      $.each(listArray, function(_k, v) { gui.settingsView.addElement(v, true); });
      markModifiedSettingRows();
      applySettingsListMode();
      renderPasswordBadgesInSettingsList();
      $('#settTbText').html(listArray.length + ' system settings found');
      $('[data-fielddesc="comment"]').css('white-space', 'pre-line');
      refreshEncryptionRotationStatus();
      break;
    }
    case 'saveSetting':
    case 'resetSetting':
      refreshList();
      break;
  }
}

function markModifiedSettingRows() {
  $('#sortableTable_varSettings_table td[data-aftype="modified"]')
    .closest('tr')
    .addClass('settingsModifiedRow');
}

function applySettingsListMode() {
  $('#settingsListMode button').each(function() {
    const active = String($(this).data('mode')) === settingsListMode;
    $(this).toggleClass('isActive', active).attr('aria-pressed', active ? 'true' : 'false');
  });
  gui.settingsView.setRowFilter(
    settingsListMode === 'modified'
      ? (row) => row.classList.contains('settingsModifiedRow')
      : null
  );
}
