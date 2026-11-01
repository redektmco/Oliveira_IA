// A one-time message shown on the login screen after the app ends a session (expired, revoked or blocked).
const key = 'oliveira-auth-notice';
export function setAuthNotice(message: string) { try { sessionStorage.setItem(key, message); } catch { /* optional */ } }
export function takeAuthNotice() { try { const value = sessionStorage.getItem(key) || ''; sessionStorage.removeItem(key); return value; } catch { return ''; } }
