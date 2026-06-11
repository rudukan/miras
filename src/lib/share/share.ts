export type ShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled';

/**
 * PNG paylaşımı — sırayla dener: Web Share (dosya) → Clipboard → indirme.
 * Gerçek cihaz checklist'i: docs/deney-runbook.md (Android Chrome share, masaüstü clipboard, iOS Safari).
 */
export async function sharePng(blob: Blob, filename = 'miras-kapanis.png'): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Miras — Günlük Kapanış' });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // paylaşım başarısız — clipboard/indirmeye düş
    }
  }

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // clipboard başarısız — indirmeye düş
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
