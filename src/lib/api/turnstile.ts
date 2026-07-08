/**
 * Cloudflare Turnstile gorunmez widget yardimcisi. Script bir kez enjekte
 * edilir; getTurnstileToken her cagrida gecici container'da execute eder.
 * SP3b CSP notu: script-src + frame-src'e challenges.cloudflare.com eklenecek.
 */
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile yüklenemedi')));
    s.onerror = () => reject(new Error('turnstile script hatası'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function getTurnstileToken(siteKey: string): Promise<string> {
  const turnstile = await loadScript();
  const container = document.createElement('div');
  document.body.appendChild(container);
  try {
    return await new Promise<string>((resolve, reject) => {
      // Not: "Invisible" davranisi Cloudflare dashboard'da widget modu olarak secilir
      // (Task 0); render()'a size parametresi GECILMEZ.
      const widgetId = turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => {
          turnstile.remove(widgetId);
          resolve(token);
        },
        'error-callback': () => {
          turnstile.remove(widgetId);
          reject(new Error('turnstile doğrulaması başarısız'));
        },
      });
    });
  } finally {
    container.remove();
  }
}
