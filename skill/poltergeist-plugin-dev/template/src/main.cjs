// Main-process entry. Runs unsandboxed in Electron main — keep it lean.
// Register ipc handlers in activate(); clean everything up in deactivate().

let ticker = null;

module.exports = {
  activate(ctx) {
    ctx.log('activated');

    // invoked from the renderer as api.ipc.invoke('greet', name)
    ctx.ipc.handle('greet', (name) => {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('greet needs a non-empty name'); // rejects only this call
      }
      return `hello, ${name.trim()} 👻`;
    });

    // remember things across restarts
    ctx.ipc.handle('visits', () => {
      const n = (ctx.settings.get('visits') ?? 0) + 1;
      ctx.settings.set('visits', n);
      return n;
    });

    // push an event to the renderer every 10s (api.ipc.on('tick', cb))
    ticker = setInterval(() => ctx.ipc.send('tick', { at: Date.now() }), 10_000);
  },

  deactivate() {
    clearInterval(ticker); // called on disable, uninstall, reload, and app quit
    ticker = null;
  },
};
