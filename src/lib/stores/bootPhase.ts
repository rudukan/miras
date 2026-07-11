/** Açılış fazı kararı (spec §4.A). 'boot' yalnız oturum durumu henüz bilinmiyorken;
 *  local kayıt her zaman senkron intro açar — mevcut kullanıcıya flash/regresyon yok. */
export type StartPhase = 'boot' | 'welcome' | 'intro';

export function initialPhase(
  hasLocalSave: boolean,
  hasSession: boolean | undefined,
): StartPhase {
  if (hasLocalSave) return 'intro';
  if (hasSession === undefined) return 'boot';
  return hasSession ? 'intro' : 'welcome';
}
