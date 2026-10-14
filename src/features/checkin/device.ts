/** A random id for this phone, sent with every scan so the server can tell phones apart. Not personal data. */
export function deviceId(): string {
  const KEY = 'hip.deviceId';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `dev_${crypto.randomUUID().slice(0, 12)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

/** A readable name for this phone in the admin's device list, e.g. "iPhone" or "Android phone". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  const android = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/i);
  if (android) return android[1].trim() || 'Android phone';
  if (/Android/i.test(ua)) return 'Android phone';
  if (/Mac OS X/i.test(ua)) return 'Mac browser';
  if (/Windows/i.test(ua)) return 'Windows browser';
  return 'Browser';
}
