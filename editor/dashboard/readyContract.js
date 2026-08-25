// readyContract.js
// Attach a one-time readiness promise to any widget instance.
// Usage: withReadyContract(this, { timeoutMs: 2500, autoOnResolvedRefresh: true });

export function withReadyContract(instance, opts = {}) {
    const {
        timeoutMs = 2500,
        autoOnResolvedRefresh = true, // resolves when refresh() returns a resolved Promise
    } = opts;

    let resolved = false;
    let resolveFn;
    const readyPromise = new Promise((res) => { resolveFn = res; });

    function resolveOnce() {
        if (!resolved) { resolved = true; resolveFn(); }
    }

    // Public API
    instance.ready = () => readyPromise;
    instance.markReady = () => resolveOnce();

    // Safety cap so a single widget never blocks the dashboard
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        setTimeout(resolveOnce, timeoutMs);
    }

    // If the widget already has refresh(), wrap it to auto-resolve when it completes successfully.
    const hasRefresh = typeof instance.refresh === "function";
    if (autoOnResolvedRefresh && hasRefresh) {
        const orig = instance.refresh.bind(instance);
        instance.refresh = function (...args) {
            const ret = orig(...args);
            // If refresh returns a Promise, resolve on success.
            if (ret && typeof ret.then === "function") {
                ret.then(() => resolveOnce()).catch(() => { /* ignore; timeout or markReady can resolve */ });
            }
            return ret;
        };
    }

    return instance;
}
