// Haptic feedback — thin wrapper around expo-haptics with a module-level
// enable/disable switch, mirroring sound/index.js's own setSoundEnabled
// pattern. App.js calls setHapticsEnabled whenever the Settings screen's
// Haptics toggle changes, so every call site in useGame.js (ladder or daily
// — both share this hook) stays unaware of the setting itself.
import * as Haptics from 'expo-haptics';

let enabled = true;
export function setHapticsEnabled(v) { enabled = v; }

export function impactLight() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
export function impactMedium() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
export function impactHeavy() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}
export function notifySuccess() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
export function notifyError() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
