/** Teacher practice debug logging (?tfDebug=1 on URL). */

export function tfDbgTeacherPracticeEnabled() {
  try {
    return new URLSearchParams(window.location.search).get('tfDebug') === '1';
  } catch {
    return false;
  }
}

export function tfDbgTeacherPractice(label, payload) {
  if (!tfDbgTeacherPracticeEnabled()) return;
  try {
    console.log('[tactics-fighter:teacher-practice]', label, payload);
  } catch (_) {}
}
