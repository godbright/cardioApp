/**
 * TTS message catalog.
 *
 * All spoken output routes through this module so adding Kinyarwanda
 * or other pilot languages is a content change, not a re-architecture.
 * Confirmed language list pending clinical team input — see CLAUDE.md.
 */

import Tts from 'react-native-tts';

export type SupportedLang = 'en' | 'rw' | 'fr' | 'sw';

// ─── Message catalog ──────────────────────────────────────────────────────────
// One key per spoken event; one string per supported language.
// Positioning scripts per valve site / ECG lead are keyed as
// `position.<siteId>` and must be extended as clinical team confirms sites.

const CATALOG: Record<string, Record<SupportedLang, string>> = {
  // ── Positioning ──
  'position.aortic': {
    en: 'Place the sensor at the right side of the upper chest, close to the breastbone.',
    rw: 'Shyira igikoresho ku ruhande rw\'iburyo rw\'igituza, hafi y\'igufwa.',
    fr: 'Placez le capteur sur le côté droit de la poitrine supérieure, près du sternum.',
    sw: 'Weka sensoro upande wa kulia wa kifua cha juu, karibu na mfupa wa kifua.',
  },
  'position.mitral': {
    en: 'Place the sensor at the tip of the heart, on the left side of the lower chest.',
    rw: 'Shyira igikoresho ku ntumbi y\'umutima, ku ruhande rw\'ibumoso rw\'igituza cy\'epfo.',
    fr: 'Placez le capteur à la pointe du cœur, côté gauche de la poitrine inférieure.',
    sw: 'Weka sensoro kwenye ncha ya moyo, upande wa kushoto wa kifua cha chini.',
  },
  'position.pulmonary': {
    en: 'Place the sensor on the left side of the upper chest, close to the breastbone.',
    rw: 'Shyira igikoresho ku ruhande rw\'ibumoso rw\'igituza cy\'hejuru, hafi y\'igufwa.',
    fr: 'Placez le capteur sur le côté gauche de la poitrine supérieure, près du sternum.',
    sw: 'Weka sensoro upande wa kushoto wa kifua cha juu, karibu na mfupa wa kifua.',
  },
  'position.tricuspid': {
    en: 'Place the sensor at the lower left edge of the breastbone.',
    rw: 'Shyira igikoresho ku nkomanizo y\'epfo y\'ibumoso y\'igufwa cy\'igituza.',
    fr: 'Placez le capteur au bord inférieur gauche du sternum.',
    sw: 'Weka sensoro kwenye ukingo wa chini wa kushoto wa mfupa wa kifua.',
  },
  // ECG lead positions — extended when Rijuven SDK confirms supported leads
  'position.L1': {
    en: 'Attach the electrode to the right wrist and left wrist as indicated.',
    rw: 'Shyira elektrod ku kidodo cy\'iburyo no ku kidodo cy\'ibumoso nk\'uko byagaragajwe.',
    fr: 'Fixez l\'électrode au poignet droit et au poignet gauche comme indiqué.',
    sw: 'Ambatisha elektrodi kwenye mkono wa kulia na mkono wa kushoto kama inavyoonyeshwa.',
  },
  'position.L2': {
    en: 'Attach the electrode to the right wrist and left ankle as indicated.',
    rw: 'Shyira elektrod ku kidodo cy\'iburyo no ku kirenge cy\'ibumoso nk\'uko byagaragajwe.',
    fr: 'Fixez l\'électrode au poignet droit et à la cheville gauche comme indiqué.',
    sw: 'Ambatisha elektrodi kwenye mkono wa kulia na kifundo cha mguu wa kushoto kama inavyoonyeshwa.',
  },
  // ── Quality feedback ──
  'quality.weak': {
    en: 'Signal too weak — try pressing more firmly.',
    rw: 'Ikimenyetso kiri bugufi — gerageza gusunika vuba.',
    fr: 'Signal trop faible — essayez d\'appuyer plus fermement.',
    sw: 'Ishara ni dhaifu sana — jaribu kusukuma zaidi.',
  },
  'quality.moving': {
    en: 'Moving in the right direction — hold still.',
    rw: 'Ugenda neza — hagarara.',
    fr: 'Vous allez dans la bonne direction — restez immobile.',
    sw: 'Unakwenda mwelekeo sahihi — simama bado.',
  },
  'quality.ready.auto': {
    en: 'Good signal — recording now.',
    rw: 'Ikimenyetso cyiza — turekorode.',
    fr: 'Bon signal — enregistrement en cours.',
    sw: 'Ishara nzuri — inaandika sasa.',
  },
  'quality.ready.manual': {
    en: 'Signal is good — press Record when ready.',
    rw: 'Ikimenyetso ni cyiza — kanda Rekoda iyo uri gika.',
    fr: 'Le signal est bon — appuyez sur Enregistrer lorsque vous êtes prêt.',
    sw: 'Ishara ni nzuri — bonyeza Rekodi unapokuwa tayari.',
  },
  'quality.dropped': {
    en: 'Signal lost — please reposition the sensor.',
    rw: 'Ikimenyetso cyabuze — simbura igikoresho.',
    fr: 'Signal perdu — veuillez repositionner le capteur.',
    sw: 'Ishara imepotea — tafadhali bonyeza upya sensoro.',
  },
  // ── Results ──
  'result.normal': {
    en: 'Heart sounds are normal. You may continue to the next patient.',
    rw: 'Amajwi y\'umutima ni meza. Ushobora gukomeza kujya ku murwayi ukurikira.',
    fr: 'Les bruits cardiaques sont normaux. Vous pouvez passer au patient suivant.',
    sw: 'Sauti za moyo ni za kawaida. Unaweza kuendelea kwa mgonjwa mwingine.',
  },
  'result.abnormal.pending': {
    en: 'Abnormal sound detected. Recording has been sent for confirmation. Continue to the next patient.',
    rw: 'Ijwi ritari rya gisanzwe ryabonetse. Inyandiko yoherejwe kugira ibigenzurwe. Komeza ku murwayi ukurikira.',
    fr: 'Son anormal détecté. L\'enregistrement a été envoyé pour confirmation. Continuez avec le patient suivant.',
    sw: 'Sauti isiyo ya kawaida imegunduliwa. Rekodi imetumwa kwa uthibitisho. Endelea kwa mgonjwa mwingine.',
  },
  'result.abnormal.confirmed': {
    en: 'Confirmation received. Aortic stenosis is suspected. Please refer this patient.',
    rw: 'Inyito yarabonywe. Gucishijwe kw\'imitsi y\'aorte birakekwa. Kohereza uyu murwayi.',
    fr: 'Confirmation reçue. Une sténose aortique est suspectée. Veuillez orienter ce patient.',
    sw: 'Uthibitisho umepokelewa. Stenosis ya aortic inashukiwa. Tafadhali mpeleke mgonjwa huyu.',
  },
  'result.inconclusive': {
    en: 'Recording quality was not sufficient. Please reposition and try again.',
    rw: 'Ubwiza bw\'inyandiko ntabwo bwahagije. Simbura hanyuma ugerageze nanone.',
    fr: 'La qualité de l\'enregistrement était insuffisante. Veuillez repositionner et réessayer.',
    sw: 'Ubora wa rekodi haukutosha. Tafadhali bonyeza upya na ujaribu tena.',
  },
  'result.ecg': {
    en: 'Heart rhythm recorded successfully.',
    rw: 'Inzira y\'umutima yanditswe neza.',
    fr: 'Rythme cardiaque enregistré avec succès.',
    sw: 'Rhythm ya moyo imerekodiwa kwa mafanikio.',
  },
};

let _lang: SupportedLang = 'en';

export function setTtsLanguage(lang: SupportedLang) {
  _lang = lang;
  Tts.setDefaultLanguage(langCode(lang));
}

function langCode(lang: SupportedLang): string {
  switch (lang) {
    case 'rw': return 'rw-RW';
    case 'fr': return 'fr-FR';
    case 'sw': return 'sw-TZ';
    default:   return 'en-US';
  }
}

export function speak(key: string): void {
  const entry = CATALOG[key];
  if (!entry) {
    console.warn(`[TTS] unknown key: ${key}`);
    return;
  }
  const text = entry[_lang] ?? entry['en'];
  Tts.stop();
  Tts.speak(text);
}

export function speakPosition(siteId: string): void {
  speak(`position.${siteId}`);
}

export function speakResult(kind: string, online?: boolean): void {
  if (kind === 'normal')       { speak('result.normal'); return; }
  if (kind === 'abnormal')     { speak(online ? 'result.abnormal.confirmed' : 'result.abnormal.pending'); return; }
  if (kind === 'inconclusive') { speak('result.inconclusive'); return; }
  if (kind === 'ecg')          { speak('result.ecg'); return; }
}

export function getPositionText(siteId: string, lang?: SupportedLang): string {
  const l = lang ?? _lang;
  return CATALOG[`position.${siteId}`]?.[l] ?? CATALOG[`position.${siteId}`]?.en ?? '';
}
