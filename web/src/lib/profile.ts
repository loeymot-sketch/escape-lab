import { bool, rec } from './guard';

export type ProfileSettings = { sound: boolean; reduceMotion: boolean; notifications: boolean };

export function normalizeProfileSettings(payload: unknown): ProfileSettings {
  const root = rec(payload, 'profile');
  const settings = rec(root.settings, 'profile', 'settings');
  return {
    sound: bool(settings.sound, 'profile', 'sound'),
    reduceMotion: bool(settings.reduceMotion, 'profile', 'reduceMotion'),
    notifications: bool(settings.notifications, 'profile', 'notifications'),
  };
}
