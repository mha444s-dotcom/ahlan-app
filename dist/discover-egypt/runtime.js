// A local execution scope for the original Discover code. All nodes belong to
// Ahlan's document; selectors and event delegation stay inside this component.
export function createRuntime({host, shadow, body, documentElement, assetURL, viewportHeight, fetchResource}) {
  const nativeWindow = window;
  const nativeDocument = document;
  const listeners = [], observers = [], tasks = new Map();
  let active = true, disposed = false, nextTask = 0, pausedAt = 0, pausedDuration = 0;
  const now = () => (active ? performance.now() : pausedAt) - pausedDuration;

  function schedule(task) {
    if (!active || disposed) return;
    if (task.kind === 'frame') {
      task.nativeId = nativeWindow.requestAnimationFrame(() => {
        tasks.delete(task.id);
        if (active && !disposed) task.callback(now());
      });
    } else {
      task.nativeId = nativeWindow.setTimeout(() => {
        tasks.delete(task.id);
        if (active && !disposed) task.callback(...task.args);
      }, Math.max(0, task.due - now()));
    }
  }
  function addTask(kind, callback, delay = 0, args = []) {
    const task = {id: ++nextTask, kind, callback, args, due: now() + Math.max(0, Number(delay) || 0)};
    tasks.set(task.id, task); schedule(task); return task.id;
  }
  function cancelTask(id) {
    const task = tasks.get(id);
    if (!task) return;
    if (task.kind === 'frame') nativeWindow.cancelAnimationFrame(task.nativeId);
    else nativeWindow.clearTimeout(task.nativeId);
    tasks.delete(id);
  }
  function listen(target, type, callback, options) {
    const guarded = function(event) { if (active && !disposed) callback.call(this, event); };
    target.addEventListener(type, guarded, options);
    listeners.push({target, type, callback, guarded, options});
  }
  function unlisten(target, type, callback, options) {
    for (let i = listeners.length - 1; i >= 0; i--) {
      const item = listeners[i];
      if (item.target === target && item.type === type && item.callback === callback) {
        target.removeEventListener(type, item.guarded, options ?? item.options);
        listeners.splice(i, 1);
      }
    }
  }
  function scopedObserver(NativeObserver, intersection) {
    if (typeof NativeObserver !== 'function') return undefined;
    return class {
      constructor(callback, options) {
        this.targets = new Set(); this.callback = callback;
        this.native = new NativeObserver(entries => { if (active && !disposed) callback(entries, this); }, options);
        observers.push(this);
      }
      observe(element) { this.targets.add(element); this.native.observe(element); }
      unobserve(element) { this.targets.delete(element); this.native.unobserve(element); }
      disconnect() { this.targets.clear(); this.native.disconnect(); }
      takeRecords() { return this.native.takeRecords?.() || []; }
      refresh() {
        if (intersection) for (const element of this.targets) { this.native.unobserve(element); this.native.observe(element); }
        else this.callback([], this);
      }
    };
  }

  const localDocument = {
    body, documentElement, dir: 'rtl',
    get activeElement() { return shadow.activeElement || body; },
    getElementById: id => shadow.getElementById(id),
    querySelector: selector => shadow.querySelector(selector),
    querySelectorAll: selector => shadow.querySelectorAll(selector),
    createElement: (...args) => nativeDocument.createElement(...args),
    createTextNode: text => nativeDocument.createTextNode(text),
    addEventListener: (type, callback, options) => listen(shadow, type, callback, options),
    removeEventListener: (type, callback, options) => unlisten(shadow, type, callback, options)
  };
  const scoped = {
    document: localDocument,
    requestAnimationFrame: callback => addTask('frame', callback),
    cancelAnimationFrame: cancelTask,
    setTimeout: (callback, delay, ...args) => addTask('timer', callback, delay, args),
    clearTimeout: cancelTask,
    performance: {now},
    IntersectionObserver: scopedObserver(nativeWindow.IntersectionObserver, true),
    ResizeObserver: scopedObserver(nativeWindow.ResizeObserver, false),
    addEventListener: (type, callback, options) => listen(nativeWindow, type, callback, options),
    removeEventListener: (type, callback, options) => unlisten(nativeWindow, type, callback, options)
  };
  const localWindow = new Proxy(nativeWindow, {
    get(target, key) {
      if (key === 'window' || key === 'self') return localWindow;
      if (key === 'document') return localDocument;
      if (key === 'innerHeight') return viewportHeight();
      if (Object.hasOwn(scoped, key)) return scoped[key];
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const env = {
    ...scoped, window: localWindow, history: nativeWindow.history, location: nativeWindow.location,
    // Read access occurs inside the original try/catch blocks, including when
    // browser privacy settings make the localStorage getter itself throw.
    localStorage: {
      getItem: key => nativeWindow.localStorage.getItem(key),
      setItem: (key, value) => nativeWindow.localStorage.setItem(key, value)
    },
    matchMedia: nativeWindow.matchMedia.bind(nativeWindow),
    getComputedStyle: nativeWindow.getComputedStyle.bind(nativeWindow),
    fetch: fetchResource || nativeWindow.fetch.bind(nativeWindow), alert: nativeWindow.alert.bind(nativeWindow),
    queueMicrotask: nativeWindow.queueMicrotask.bind(nativeWindow),
    devicePixelRatio: nativeWindow.devicePixelRatio, Event:nativeWindow.Event, assetURL
  };
  function setActive(next) {
    if (disposed || active === next) return;
    if (!next) {
      pausedAt = performance.now(); active = false;
      for (const task of tasks.values()) {
        if (task.kind === 'frame') nativeWindow.cancelAnimationFrame(task.nativeId);
        else nativeWindow.clearTimeout(task.nativeId);
      }
    } else {
      pausedDuration += performance.now() - pausedAt; active = true;
      for (const task of tasks.values()) schedule(task);
      for (const observer of observers) observer.refresh();
    }
  }
  function dispose() {
    if (disposed) return;
    setActive(false); disposed = true;
    for (const task of [...tasks.keys()]) cancelTask(task);
    for (const item of listeners) item.target.removeEventListener(item.type, item.guarded, item.options);
    for (const observer of observers) observer.disconnect();
    listeners.length = 0;
  }
  return {env, setActive, dispose};
}
