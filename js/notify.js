// Notifications locales (aucun serveur). Utilisées pour les alertes de seuil budgétaire.
export const notificationsSupported = () => typeof Notification !== 'undefined';

export async function requestNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function notify(title, body, tag = 'budget') {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'fr' });
    else new Notification(title, { body, tag });
  } catch {
    /* Android Chrome interdit new Notification() hors service worker : on ignore. */
  }
}
