/** @typedef {{ distance: number, text: string }} StoryBeat */

/**
 * Mesafeye göre tek seferlik hikâye satırları.
 * Tema: Geçmişindeki bir an seni kovalıyor; koştukça hatırlıyorsun.
 * @type {StoryBeat[]}
 */
export const STORY_BEATS = [
  {
    distance: 1000,
    text: 'Koşmaya başladın. Arkana bakma dediler. Kim dedi?',
  },
  {
    distance: 3000,
    text: 'Ayak sesleri seninkilerle aynı ritimde.',
  },
  {
    distance: 5000,
    text: 'Hatırladın: O gün geri dönmedin.',
  },
  {
    distance: 10000,
    text: 'Yol sonsuz değil. Sen durmak istemiyorsun.',
  },
  {
    distance: 15000,
    text: 'O sen değilsin, dedin. Peki o zaman kim koşuyor?',
  },
  {
    distance: 25000,
    text: 'Yakalandığında korkmuyorsun. Merak ediyorsun.',
  },
  {
    distance: 32000,
    text: 'Gece olunca her şey netleşiyor. Her şey.',
  },
  {
    distance: 38000,
    text: 'Gündüz kaçarsın. Gece hatırlarsın. İkisi de aynı koşu.',
  },
  {
    distance: 45000,
    text: 'Köprüler, boşluklar, virajlar — hepsi o günün koridorları.',
  },
  {
    distance: 52000,
    text: 'Koşmak ceza değilmiş. Geri dönmemek ceza.',
  },
  {
    distance: 60000,
    text: 'Peşindeki yüz netleşti: tanıdık. Kaçtığın ama unutamadığın.',
  },
  {
    distance: 68000,
    text: 'Nefesin onunkiyle çakışıyor. İkiniz de aynı cümleyi söylüyorsunuz: “Bir daha.”',
  },
  {
    distance: 75000,
    text: 'Artık kimin kovaladığını değil, kimi geride bıraktığını soruyorsun.',
  },
  {
    distance: 82000,
    text: 'Bitiş çizgisi yok. O gün zaten bitmemişti.',
  },
  {
    distance: 90000,
    text: 'On bin metre kaldı. Ya da hiç kalmadı. Yine de hızlanıyorsun.',
  },
  {
    distance: 95000,
    text: 'Arkana baktın — ilk kez. O da durmamış. Gülümsüyor.',
  },
  {
    distance: 100000,
    text: 'Yüz bin metre. Geçmişine yetişmedin. Onunla yan yana koşmaya başladın.',
  },
];

/**
 * Verilen mesafede gösterilmemiş ilk hikâye anını döndürür.
 * @param {number} distance
 * @param {Set<number>} shownDistances
 * @returns {StoryBeat | null}
 */
export function findNewStoryBeat(distance, shownDistances) {
  const d = Math.floor(distance);
  for (const beat of STORY_BEATS) {
    if (d >= beat.distance && !shownDistances.has(beat.distance)) {
      return beat;
    }
  }
  return null;
}

/**
 * @param {number} distance
 * @returns {string}
 */
export function formatStoryMilestone(distance) {
  return `${distance.toLocaleString('tr-TR')} m`;
}
