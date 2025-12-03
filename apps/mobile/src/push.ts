import * as Notifications from 'expo-notifications';

export async function requestPushPermissions() {
  const settings = await Notifications.getPermissionsAsync();
  if (!settings.granted) {
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  }
  return settings.granted;
}

export async function registerForPushToken() {
  const hasPerm = await requestPushPermissions();
  if (!hasPerm) return null;
  const token = await Notifications.getExpoPushTokenAsync();
  // TODO: envoyer le token au backend (endpoint /keys/devices pour push_token)
  return token.data;
}
