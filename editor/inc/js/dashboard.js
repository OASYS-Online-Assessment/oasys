"use strict";

/* ============================================================
   OASYS Dashboard (width grows; height fixed per row via manifest)
   - Row height = max(widget.height) of that row (per scope)
   - Widgets: height:100% (no vertical growth beyond row)
   - Frame (#dashScrollWrap) scrolls only when needed (auto)
   - Boot gate hides everything until CSS/modules/widgets are ready
   ============================================================ */

let waitDialog;
let gui = {};

// Registry of widget instances (keyed by widget DOM id)
window._dashWidgets = window._dashWidgets || new Map();

document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('DOMContentLoaded', onDOMReady);

async function onDOMReady() {
    initGUI?.();

    // --- Boot mask & boot flag (prevents half-painted UI) ---
    document.body.setAttribute('data-dash-booting', '1');
    if (!document.getElementById('dashBootMask')) {
        const m = document.createElement('div');
        m.id = 'dashBootMask';

        // LOGO: use your transparent PNG in /editor/images
        const LOGO_PATH = (window.settings?.JSrootURL || "/") + "editor/images/oasyslogo.png";

        m.innerHTML = `
              <img class="bootLogo" src="${LOGO_PATH}" alt="OASYS" />
              <div class="bootVersion">OASYS ${String(window.dashboardVersion || '3.7')}</div>
              <div class="boot-text">${UILANG?.m?.('Loading dashboard…') || 'Loading dashboard…'}</div>
              <div class="spinner" aria-hidden="true"></div>
            `;
        document.body.appendChild(m);
    }

    waitDialog = new jsModalWait(UILANG.m('please wait'));
    globalThis.waitDialog = waitDialog;
	let dashboardWaitCount = 0;
	globalThis.dashboardWaitStart = () => {
		dashboardWaitCount++;
		if (dashboardWaitCount === 1) waitDialog.show();
	};
	globalThis.dashboardWaitEnd = () => {
		dashboardWaitCount = Math.max(0, dashboardWaitCount - 1);
		if (dashboardWaitCount === 0) waitDialog.hide();
	};

    const userName = window.localUName;
    gui.main = createFlexSection('UI', 'dashboardContainer', 900, 1250, 1, 'fullWidthFlex');
    gui.mainUserActions = createFlexBox(gui.main, 'dashboardHeader', {});

    // === wrapper + inner holder (sections live under #dashboardWidgets) ===
    const root = document.getElementById('dashboardContainer');
    if (root && !document.getElementById('dashScrollWrap')) {
        const wrap = document.createElement('div');
        wrap.id = 'dashScrollWrap';
        wrap.style.width = '100%';
        wrap.style.overflowX = 'auto';
        wrap.style.overflowY = 'auto';

        const widgets = document.createElement('div');
        widgets.id = 'dashboardWidgets';

        root.appendChild(wrap);
        wrap.appendChild(widgets);

        window.gui = window.gui || {};
        gui.widgets = '#dashboardWidgets';
    }

    const headerDiv = `
    <div class="dashNameSection">
      <div class="dashGreetingLine">
        <div>
          <div id="dashUserName"></div>
          <div id="dashWelcomeMsg">${UILANG.m("Welcome to your OASYS workspace")}</div>
        </div>
      </div>
    </div>
    <div id="headerButtonsContainer"></div>`;
    $("#dashboardHeader").append(headerDiv);
	document.getElementById('dashUserName').textContent = userName == null ? '' : String(userName);

    startAjax("check", {});

    /* ----------------- widgets via manifest (ESM) ----------------- */

    const metasUser  = Array.isArray(window.widgetMetaUser)  ? window.widgetMetaUser  : [];
    const metasAdmin = Array.isArray(window.widgetMetaAdmin) ? window.widgetMetaAdmin : [];

    const normalize = (list) =>
        list.map(m => ({
            ...m,
            row: Number(m.row) || 1,
            order: Number(m.order) || 1,
            height: Number(m.height) || 260 // default height if not provided
        })).sort((a, b) => (a.row - b.row) || (a.order - b.order));

    const listUser  = normalize(metasUser);
    const listAdmin = normalize(metasAdmin);

    // ===== Robust admin detection =====
    function asBool(v) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number')  return v !== 0;
        if (typeof v === 'string')  return v.toLowerCase() === 'true' || v === '1';
        return !!v;
    }
    const userIsAdmin =
        asBool(window.userIsAdmin) ||
        asBool(window.settings?.userIsAdmin) ||
        (Array.isArray(window.settings?.roles) && window.settings.roles.includes('admin')) ||
        asBool(window.settings?.perm?.admin);

    // ===== Layout constants =====
    const GRID_BASE_UNIT = 200;
    const GRID_GAP_PX    = 10;
    const GROWTH_CAP     = 1.5; // horizontal growth cap (+50%)

    const dashWrap = document.getElementById('dashScrollWrap');
    if (dashWrap) {
        dashWrap.style.setProperty('--gridGap', `${GRID_GAP_PX}px`);
        dashWrap.style.setProperty('--colMin',  `${GRID_BASE_UNIT}px`);
    }

    // ===== DOM helpers =====
    function getScrollRoot() {
        let widgets = document.getElementById('dashboardWidgets');
        if (!widgets) {
            const dc = document.getElementById('dashboardContainer');
            const wrap = document.createElement('div');
            wrap.id = 'dashScrollWrap';
            wrap.style.width = '100%';
            wrap.style.overflowX = 'auto';
            wrap.style.overflowY = 'auto';
            widgets = document.createElement('div');
            widgets.id = 'dashboardWidgets';
            dc && dc.appendChild(wrap);
            wrap.appendChild(widgets);
        }
        return widgets;
    }

    function ensureSection(scope) {
        const scroller = getScrollRoot();
        const id = `dashSection_${scope}`;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = scope === 'admin' ? 'dash-section admin-scope' : 'dash-section user-scope';

            const body = document.createElement('div');
            body.className = 'dash-section-body';
            el.appendChild(body);

            if (scope === 'admin') {
                scroller.insertAdjacentElement('afterbegin', el);
            } else {
                const adminEl = document.getElementById('dashSection_admin');
                adminEl ? adminEl.insertAdjacentElement('afterend', el) : scroller.appendChild(el);
            }
        }
        return el.querySelector('.dash-section-body');
    }

    function ensureRow(rowNo, scope) {
        rowNo = Number(rowNo) || 1;
        const container = ensureSection(scope);
        const id = `dashRow_${scope}_${rowNo}`;
        let row = document.getElementById(id);
        if (!row) {
            row = document.createElement('div');
            row.id = id;
            row.className = 'dash-row';
            const prev = document.getElementById(`dashRow_${scope}_${rowNo - 1}`);
            prev && prev.parentElement === container ? prev.insertAdjacentElement('afterend', row) : container.appendChild(row);
        }
        return $('#' + id);
    }

    // ---- asset helpers ----
    function assetUrl(rel, update) {
        const url = new URL(rel, document.baseURI);
        if (update) url.searchParams.set('update', update);
        return url.href;
    }

    function resolveModuleUrl(meta) {
        const rel = `${meta.path || ''}${meta.js || ''}`;
        return assetUrl(rel, meta.jsUpdate);
    }

    // Await CSS before importing JS module
    async function loadWidgetModule(meta) {
        await ensureCSS(meta);
        const url = resolveModuleUrl(meta);
        try {
            const mod = await import(/* webpackIgnore: true */ url);
            return mod?.default || mod?.[meta.jsconstruct];
        } catch (e) {
            console.error('Failed to import widget module:', url, e);
            return null;
        }
    }

    // Promise-based CSS loader (idempotent)
    function ensureCSS(meta) {
        if (!meta?.css) return Promise.resolve();
        const href = assetUrl(`${meta.path || ''}${meta.css}`, meta.cssUpdate);

        // Already applied?
        for (const s of document.styleSheets) {
            if (s.href && s.href === href) return Promise.resolve();
        }
        // Already queued in DOM?
        if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === href)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = () => resolve();
            link.onerror = () => reject(new Error('CSS failed: ' + href));
            document.head.appendChild(link);
        });
    }

    /* ============================================================
       GRID LAYOUT (width) + ROW HEIGHTS (from manifest)
       ============================================================ */
    function computeGridAndHeights(list) {
        const items = list.map(meta => {
            const minW   = Number(meta.minWidth ?? 300);
            const forced = Number(meta.span);
            const span   = Number.isFinite(forced) && forced > 0
                ? forced
                : Math.max(1, Math.ceil(minW / GRID_BASE_UNIT));
            return {
                idForDom: meta.id || meta.jsconstruct,
                row: Number(meta.row || 1),
                span,
                minW,
                height: Number(meta.height) || 260
            };
        });

        // total columns per row
        const totals = new Map();
        // max row height per row
        const rowHeights = new Map();

        for (const it of items) {
            totals.set(it.row, (totals.get(it.row) || 0) + it.span);
            rowHeights.set(it.row, Math.max(rowHeights.get(it.row) || 0, it.height));
        }

        const scopeCols = Math.max(...(totals.size ? [...totals.values()] : [1]));
        return { items, totals, scopeCols, rowHeights };
    }

    function applyGrid(scope, list) {
        const { items, totals, scopeCols, rowHeights } = computeGridAndHeights(list);

        const sectionBody = document.querySelector(`#dashSection_${scope} .dash-section-body`);
        if (sectionBody) {
            sectionBody.dataset.scopeCols = String(scopeCols);
            sectionBody.style.setProperty('--colMin', `${GRID_BASE_UNIT}px`);
        }

        // Set each row’s columns AND a fixed row height (max of widget heights in that row)
        totals.forEach((rowTotal, rowNo) => {
            const rowEl = document.getElementById(`dashRow_${scope}_${rowNo}`);
            if (!rowEl) return;
            rowEl.style.display = 'grid';
            rowEl.style.gap = `${GRID_GAP_PX}px`;
            rowEl.style.gridTemplateColumns = `repeat(${rowTotal}, minmax(${GRID_BASE_UNIT}px, 1fr))`;
            rowEl.style.alignItems = 'stretch';

            const h = rowHeights.get(rowNo) || 260;
            rowEl.style.height = `${h}px`; // fixed row height
        });

        // Place widgets and lock their height to 100% of their row
        for (const it of items) {
            const el = document.getElementById(it.idForDom + '_dashWidget');
            if (!el) continue;

            // Width behavior (grid controls it)
            el.style.removeProperty('flex');
            el.style.removeProperty('width');
            el.style.removeProperty('max-width');
            el.style.removeProperty('min-width');

            el.style.gridColumn = `span ${it.span}`;

            // Height: fill row; never exceed
            el.style.height     = '100%';
            el.style.maxHeight  = '100%';
            el.style.minHeight  = '0';

            const rowEl = document.getElementById(`dashRow_${scope}_${it.row}`);
            if (rowEl && el.parentElement !== rowEl) rowEl.appendChild(el);
        }

        document.getElementById('dashboardWidgets')?.style.setProperty('--gridGap', `${GRID_GAP_PX}px`);
        return scopeCols;
    }

    // For non-grid parents (not used now), keep a safe stub
    function applySize(meta, idForDom, scope) {
        const el = document.getElementById(idForDom + '_dashWidget');
        if (!el) return;

        const parent = el.parentElement;
        const isGrid = parent && getComputedStyle(parent).display === 'grid';

        if (!isGrid) {
            const minW  = meta.minWidth ?? 300;
            const maxW  = meta.maxWidth ?? null;
            const basis = meta.width ?? minW;
            const grow  = (meta.grow != null) ? (Number(meta.grow) || 1) : 1;

            el.style.width    = 'auto';
            el.style.minWidth = `${minW}px`;
            if (maxW != null) el.style.maxWidth = `${maxW}px`;
            el.style.flex     = `${grow} 1 ${basis}px`;
        } else {
            el.style.removeProperty('flex');
            el.style.removeProperty('width');
            el.style.removeProperty('max-width');
            el.style.removeProperty('min-width');
        }

        // Vertical sizing handled by the row; ensure widget fills the row
        el.style.height    = '100%';
        el.style.maxHeight = '100%';
        el.style.minHeight = '0';
    }

    async function render(list, scope) {
        const readyPromises = [];

        const widgetClasses = await Promise.all(list.map(meta => loadWidgetModule(meta)));
		for (let index = 0; index < list.length; index++) {
			const meta = list[index];
			const WidgetClass = widgetClasses[index];
            if (typeof WidgetClass !== 'function') {
                console.warn(`Widget class not found for ${meta.jsconstruct}`);
                continue;
            }
            const $rowParent = ensureRow(meta.row, scope);
            const idForDom = meta.id || meta.jsconstruct;

            try {
                const instance = new WidgetClass($rowParent, idForDom);
                try { window._dashWidgets.set(idForDom, instance); } catch {}

                // If a widget exposes a readiness contract, use it; otherwise a short settle tick
                const p =
                    (typeof instance.ready === 'function' && instance.ready()) ||
                    instance.readyPromise ||
                    new Promise(resolve => {
                        requestAnimationFrame(() => setTimeout(resolve, 50));
                    });

                readyPromises.push(Promise.resolve(p).catch(() => {}));
            } catch (e) {
                console.error(`Failed to instantiate ${meta.jsconstruct}`, e);
                continue;
            }

            applySize(meta, idForDom, scope);
        }

        return readyPromises;
    }

    // ===== Render (still under boot mask) =====
    const [adminReadies, userReadies] = await Promise.all([
		(userIsAdmin && listAdmin.length) ? render(listAdmin, 'admin') : [],
		listUser.length ? render(listUser, 'user') : []
	]);

    // Apply grid to BOTH scopes and capture baseline column counts
    const adminColsBaseline = (userIsAdmin && listAdmin.length) ? applyGrid('admin', listAdmin) : 0;
    const userColsBaseline  = listUser.length ? applyGrid('user', listUser) : 0;

    // ===== Horizontal sizing (per visible scope only) =====
    function baselineFromCols(cols) {
        if (!cols) return 0;
        return cols * GRID_BASE_UNIT + (cols - 1) * GRID_GAP_PX;
    }
    function visibleBaselineColsFor(scope) {
        return (scope === 'admin') ? (adminColsBaseline || 1) : (userColsBaseline || 1);
    }
    function sizeVisibleScope(scope) {
        const wrap    = document.getElementById('dashScrollWrap');
        const widgets = document.getElementById('dashboardWidgets');
        if (!wrap || !widgets) return;

        const body = document.querySelector(`#dashSection_${scope} .dash-section-body`);
        if (!body) return;

        const colsBL    = visibleBaselineColsFor(scope);
        const baseline  = baselineFromCols(colsBL);
        const ws        = getComputedStyle(widgets);
        const padL      = parseFloat(ws.paddingLeft)  || 0;
        const padR      = parseFloat(ws.paddingRight) || 0;
        const innerAvail= Math.max(0, wrap.clientWidth - padL - padR);
        const canGrow   = innerAvail >= baseline;
        const target    = canGrow ? Math.min(innerAvail, Math.round(baseline * GROWTH_CAP)) : baseline;

        body.style.setProperty('--colMin', `${GRID_BASE_UNIT}px`);
        body.style.minWidth = `${baseline}px`;
        if (canGrow) {
            body.style.width    = '100%';
            body.style.maxWidth = `${target}px`;
        } else {
            body.style.width = `${baseline}px`;
            body.style.removeProperty('max-width');
        }
    }

    // ====== Scope toggle ======
    const SCOPE_STORAGE_KEY = 'oasys.dashboard.scope';
    const scopeLabels = { admin: 'Admin', user: 'User'};

    function getStoredScope() {
        try {
            const v = localStorage.getItem(SCOPE_STORAGE_KEY);
            return (v === 'admin' || v === 'user') ? v : null;
        } catch { return null; }
    }
    function defaultScope() {
        return userIsAdmin ? (getStoredScope() || 'admin') : 'user';
    }

    let currentScope = defaultScope();

    function injectScopeToggle(isAdmin, force = false) {
        if (!isAdmin && !force) return;

        const tryInsert = () => {
            const buttons = document.getElementById('headerButtonsContainer');
            if (!buttons) { setTimeout(tryInsert, 100); return; }
            if (document.getElementById('scopeToggle')) return;

            buttons.insertAdjacentHTML('afterbegin', `
        <div id="scopeToggle" class="scope-toggle" role="tablist" aria-label="Dashboard scope">
          <button type="button" class="scope-btn" data-scope="admin" role="tab" aria-selected="false">${scopeLabels.admin}</button>
          <button type="button" class="scope-btn" data-scope="user"  role="tab" aria-selected="false">${scopeLabels.user}</button>
        </div>`);

            const toggle = document.getElementById('scopeToggle');
            toggle.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-scope]');
                if (btn) setScope(btn.dataset.scope);
            });

            updateToggleUI(currentScope);
        };

        tryInsert();
    }

    function updateToggleUI(scope) {
        const toggle = document.getElementById('scopeToggle');
        if (!toggle) return;
        toggle.querySelectorAll('.scope-btn').forEach(btn => {
            const active = btn.dataset.scope === scope;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', String(active));
        });
    }

    function setScope(scope) {
        currentScope = (scope === 'admin') ? 'admin' : 'user';
        try { localStorage.setItem(SCOPE_STORAGE_KEY, currentScope); } catch {}
        const adminSec = document.getElementById('dashSection_admin');
        const userSec  = document.getElementById('dashSection_user');

        if (adminSec) adminSec.style.display = (currentScope === 'admin') ? '' : 'none';
        if (userSec)  userSec.style.display  = (currentScope === 'user')  ? '' : 'none';

        document.body.classList.toggle('dashboard-admin-active', currentScope === 'admin');
        document.body.classList.toggle('dashboard-user-active', currentScope === 'user');

        updateToggleUI(currentScope);
        sizeVisibleScope(currentScope);
        fitFrameHeight();
    }

    // ---- Refresh button (left of toggle) ----
    function injectRefreshButton(isAdmin, force = false) {
        if (!isAdmin && !force) return;

        const tryInsert = () => {
            const buttons = document.getElementById('headerButtonsContainer');
            if (!buttons) { setTimeout(tryInsert, 100); return; }

            if (!document.getElementById('refreshBtnWrap')) {
                const holder = document.createElement('span');
                holder.id = 'refreshBtnWrap';
                buttons.insertAdjacentElement('afterbegin', holder);
            }

            if (!document.getElementById('btnRefreshWidgets')) {
                const ICON =
                    (window.svgIcons && (svgIcons.refresh || svgIcons.reload || svgIcons.sync)) || '';

                new nxButton('refreshBtnWrap', 'btnRefreshWidgets', {
                    iconHeight: 18,
                    tooltip: 'Refresh widgets',
                    icon: ICON,
                    label: 'Refresh',
                    callback: () => refreshAllWidgets()
                });
            }
        };

        tryInsert();
    }

    // Inject controls (toggle is only for admins)
    injectScopeToggle(userIsAdmin);
    injectRefreshButton(userIsAdmin);

    if (userIsAdmin && !document.getElementById('scopeToggle')) {
        console.warn('[dash] scopeToggle was not created (check #headerButtonsContainer)');
    }

    // ---- Header buttons after toggle ----
    new nxButton("headerButtonsContainer", "btnAcSettings", {
        iconHeight: 20,
        tooltip: UILANG.m('Settings'),
        icon: svgIcons.settings,
        callback: () => window.location.replace(settings.JSrootURL + 'editor/accountProp.php')
    });

    new nxButton("headerButtonsContainer", "btnLogoff", {
        iconHeight: 20,
        tooltip: UILANG.m('Logout'),
        icon: svgIcons.logout,
        callback: () => {
            sessionStorage.clear();
            $.ajax({
                type: "POST",
                cache: false,
                dataType: "json",
                timeout: 300000,
                url: settings.JSrootURL + "editor/userMgmtActions.php",
                data: { action: 'logout', data: {}, src: "mlgpage" },
                success: (res) => {
                    if (res.SSOlogout) {
                        window.location.replace(settings.JSrootURL + "editor/sso.php?a=logout&s=editor");
                    } else {
                        window.location.replace(settings.JSrootURL + "editor/");
                    }
                },
                error: () => {
                    alert("Sorry! Unable to correctly logout of Oasys. Please contact the System Administrator.");
                    window.location.replace(settings.JSrootURL + "editor/");
                }
            });
        }
    });

    // ===== Initial sizing & scope (still hidden by boot mask) =====
    if (document.getElementById('dashSection_admin') || document.getElementById('dashSection_user')) {
        setScope(currentScope);
    }
    fitFrameHeight();
    sizeVisibleScope(currentScope);

    // ---- Wait for readiness (CSS + modules + first-frame; optional widget.ready()) ----
    const allReadies = [...adminReadies, ...userReadies];

    // Safety cap: don't hang forever if a widget never resolves its ready()
    const cap = (p, ms = 2000) => new Promise(resolve => {
        let t = setTimeout(resolve, ms);
        Promise.resolve(p).finally(() => { clearTimeout(t); resolve(); });
    });

    // Optionally also wait for fonts to reduce text reflow flash
    const fontReady = (document.fonts && document.fonts.ready) ? Promise.race([
        document.fonts.ready,
        new Promise(r => setTimeout(r, 500))
    ]) : Promise.resolve();

    await Promise.all([...allReadies.map(p => cap(p)), fontReady]);

    // Let layout fully settle before reveal
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // ---- Reveal
    document.body.removeAttribute('data-dash-booting');
    document.getElementById('dashBootMask')?.remove();

    // Re-evaluate after reveal (accurate measurements)
    sizeVisibleScope(currentScope);
    fitFrameHeight();

    // Bind resize after reveal (avoid early thrash)
    const _debouncedResize  = debounce(() => {
        sizeVisibleScope(currentScope);
        fitFrameHeight();
    }, 80);
    window.addEventListener('resize', _debouncedResize);
}

/* ================================
   Frame height (lets frame scroll if needed)
   ================================ */
function fitFrameHeight() {
    const wrap = document.getElementById('dashScrollWrap');
    if (!wrap) return;

    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    const top       = wrap.getBoundingClientRect().top;

    const available = Math.max(0, Math.floor(viewportH - top));
    wrap.style.height = available + 'px';
}

/* ================================
   AJAX CONFIG AND STANDARD HANDLERS
   ================================ */

$.ajaxSetup({
    type: "POST",
    cache: false,
    dataType: "json",
    timeout: 300000,
    success: ajaxSuccess,
    error: ajaxError,
    url: "dashboardActions.php"
});

function startAjax(action, data) {
    globalThis.dashboardWaitStart?.();
    const params = { action, data: JSON.stringify(data) };
    $.ajax({ data: params });
}

function ajaxError(jqXHR, textStatus, errorThrown) {
    globalThis.dashboardWaitEnd?.();
    const retContents = (jqXHR.responseJSON !== undefined)
        ? jqXHR.responseJSON.fatalError
        : UILANG.m("No server data returned");

    new nxDialog('ajaxError', {
        buttons: [{ label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok' }],
        contents: retContents,
        title: UILANG.m('Error') + ': ' + errorThrown,
        width: 500
    });
}

function ajaxSuccess(res) {
    $('#un_val').text(res.loggedInName || '');
    globalThis.dashboardWaitEnd?.();

    if (res.fatalError) {
        new nxDialog('fatalError', {
            buttons: [{ label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok' }],
            contents: formatActionErrorMessage(`<strong>${UILANG.m('action_not_completed')}</strong><br />${res.fatalError}`),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 500
        });
        return;
    }

    if (res.error) {
        gui?.statusBar?.setStatus?.(res.error, 3000, '#DD1A00');

        new nxDialog('error', {
            buttons: [{ label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok' }],
            contents: formatActionErrorMessage(`<strong>${UILANG.m('Sorry! The action cannot be completed.')}</strong><br><p>${res.error}</p>`),
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64,
            width: 800
        });
    }

    switch (res.action) {
        case "check":
            break;
        default:
            break;
    }
}

/* ================================
   Utilities
   ================================ */
function debounce(fn, wait = 150) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* ================================
   Refresh helpers
   ================================ */
function refreshAllWidgets() {
    try {
        let refreshed = 0;
        const map = window._dashWidgets;
        if (map && typeof map.forEach === 'function') {
            map.forEach((inst, key) => {
                try {
                    if (inst && typeof inst.refresh === 'function') {
                        inst.refresh();
                        refreshed++;
                    }
                } catch (e) {
                    console.warn('Widget refresh failed for', key, e);
                }
            });
        }
        if (refreshed === 0) {
            location.reload();
        }
    } catch (e) {
        console.error('refreshAllWidgets error:', e);
        location.reload();
    }
}
