// Renderer entry. You own the DOM under `el`; return an unmount function.
// Vanilla by default — add React/etc. freely, esbuild bundles it into dist.

export function mount(el, api) {
  const t = (name, fallback) => api.theme?.[name] || fallback;

  el.style.cssText = `padding:24px;font-size:14px;color:${t('--ink-0', '#F2F3F5')};`;

  const heading = document.createElement('h2');
  heading.textContent = 'my plugin';
  heading.style.cssText = 'margin:0 0 12px;font-size:18px;';

  const output = document.createElement('pre');
  output.style.cssText = `padding:12px;border-radius:8px;background:${t('--vellum', '#15171B')};border:1px solid ${t('--hairline', 'rgba(255,255,255,0.08)')};`;
  output.textContent = '…';

  const button = document.createElement('button');
  button.textContent = 'greet';
  button.style.cssText = `margin:0 0 12px;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;background:${t('--neon', '#C5FF3D')};color:${t('--paper', '#0E0F12')};font-weight:600;`;
  button.onclick = async () => {
    try {
      const [greeting, visits] = await Promise.all([
        api.ipc.invoke('greet', 'world'),
        api.ipc.invoke('visits'),
      ]);
      output.textContent = `${greeting}\nvisit #${visits}`;
    } catch (err) {
      output.textContent = `error: ${err.message}`;
    }
  };

  const offTick = api.ipc.on('tick', ({ at }) => {
    output.textContent += `\ntick @ ${new Date(at).toLocaleTimeString()}`;
  });

  el.append(heading, button, output);

  return () => {
    offTick(); // unsubscribe events, clear timers, drop DOM refs
    el.replaceChildren();
  };
}
