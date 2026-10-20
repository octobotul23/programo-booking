// What a phone WebView can't do by itself (save a file, print, copy over plain http) the Android app does
// natively (android/app/src/main/java/ro/programo/app/ProgramoPlugin.java). In a browser the web way is used.
import { Capacitor, registerPlugin } from '@capacitor/core';

const Programo = registerPlugin('Programo');
const inApp = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Programo');

/**
 * Saves text as a file: a download in a browser, the phone's share sheet (Files, Drive, email…) in the app.
 * Rejects when it can't, so the caller can say so.
 */
export async function saveTextFile(name, mimeType, text) {
  if (inApp()) {
    await Programo.saveFile({ name, mimeType, text });
    return;
  }
  if (Capacitor.isNativePlatform()) {
    // the iOS app has no helper of its own, and its web view ignores download links: the system share sheet,
    // which the page may only use from an https address
    const file = new File([text], name, { type: mimeType });
    if (!navigator.canShare?.({ files: [file] })) throw new Error('save_unsupported');
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e?.name !== 'AbortError') throw e; // closing the sheet is not a failure
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** What to say when saving failed: on plain http the iPhone app can't save at all, which trying again won't change. */
export const saveErrorKey = (e, key) => (e?.message === 'save_unsupported' ? 'common.saveUnsupported' : key);

/** The print dialog for the current page (its print styles apply); in the app, Android's printing / Save as PDF. */
export function printPage() {
  if (inApp()) Programo.print().catch(() => {});
  else window.print();
}

/**
 * Copies text. False when nothing could, so the caller shows it to copy by hand. `sensitive` keeps it out of
 * the clipboard preview on Android 13+ (backup codes).
 */
export async function copyText(text, { sensitive = false } = {}) {
  try {
    if (inApp()) {
      await Programo.copyText({ text, sensitive });
      return true;
    }
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied or unavailable: the old way below */
  }
  // a plain-http address (Tailscale) has no clipboard API; the old copy command still works during a tap
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
