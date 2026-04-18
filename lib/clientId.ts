const CLIENT_ID_KEY = 'fp_clientId_v1';

export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (id && id.length > 8) return id;
  id = 'c_' + Math.random().toString(36).slice(2) + '_' + Date.now();
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}
