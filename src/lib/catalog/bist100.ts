/** Statik BIST100 arama kataloğu — sembol + TR ad, FİYATSIZ.
 *  Sadece aramayı besler; canlı fiyat YALNIZ aktif sete (store.activeBist) eklenince çekilir.
 *  ⚠️ Anlık snapshot: BIST100 ~3 ayda yeniden dengelenir; liste data'dır, genişletilebilir/quant rafine eder. */
export interface Bist100Entry {
  readonly symbol: string;
  readonly name: string;
}

/** En likit/bilinen BIST sembolleri (genişletilebilir; v1 yeterli kapsam). */
export const BIST100: ReadonlyArray<Bist100Entry> = [
  { symbol: 'THYAO', name: 'Türk Hava Yolları' },
  { symbol: 'ASELS', name: 'Aselsan Elektronik' },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik' },
  { symbol: 'GUBRF', name: 'Gübre Fabrikaları' },
  { symbol: 'KCHOL', name: 'Koç Holding' },
  { symbol: 'TUPRS', name: 'Tüpraş Rafinerileri' },
  { symbol: 'SASA', name: 'SASA Polyester' },
  { symbol: 'YKBNK', name: 'Yapı Kredi Bankası' },
  { symbol: 'BIMAS', name: 'BİM Birleşik Mağazalar' },
  { symbol: 'AKBNK', name: 'Akbank' },
  { symbol: 'GARAN', name: 'Garanti BBVA' },
  { symbol: 'ISCTR', name: 'İş Bankası (C)' },
  { symbol: 'SISE', name: 'Şişecam' },
  { symbol: 'PETKM', name: 'Petkim Petrokimya' },
  { symbol: 'FROTO', name: 'Ford Otosan' },
  { symbol: 'TOASO', name: 'Tofaş Oto Fabrika' },
  { symbol: 'TCELL', name: 'Turkcell' },
  { symbol: 'TTKOM', name: 'Türk Telekom' },
  { symbol: 'KOZAL', name: 'Koza Altın' },
  { symbol: 'KOZAA', name: 'Koza Anadolu Metal' },
  { symbol: 'PGSUS', name: 'Pegasus Hava Taşımacılığı' },
  { symbol: 'HEKTS', name: 'Hektaş' },
  { symbol: 'SAHOL', name: 'Sabancı Holding' },
  { symbol: 'ENKAI', name: 'Enka İnşaat' },
  { symbol: 'TAVHL', name: 'TAV Havalimanları' },
  { symbol: 'ARCLK', name: 'Arçelik' },
  { symbol: 'VESTL', name: 'Vestel Elektronik' },
  { symbol: 'EKGYO', name: 'Emlak Konut GYO' },
  { symbol: 'HALKB', name: 'Halkbank' },
  { symbol: 'VAKBN', name: 'VakıfBank' },
  { symbol: 'OYAKC', name: 'Oyak Çimento' },
  { symbol: 'MGROS', name: 'Migros Ticaret' },
  { symbol: 'ULKER', name: 'Ülker Bisküvi' },
  { symbol: 'DOHOL', name: 'Doğan Holding' },
  { symbol: 'ASTOR', name: 'Astor Enerji' },
  { symbol: 'ALARK', name: 'Alarko Holding' },
  { symbol: 'BRSAN', name: 'Borusan Boru' },
  { symbol: 'TTRAK', name: 'Türk Traktör' },
  { symbol: 'KRDMD', name: 'Kardemir (D)' },
  { symbol: 'GESAN', name: 'Girişim Elektrik' },
];

const BY_SYMBOL: Readonly<Record<string, string>> = Object.fromEntries(
  BIST100.map((e) => [e.symbol, e.name]),
);

/** Sembolün TR adı; bilinmiyorsa sembolün kendisi (store/PriceList etiketlemesi). */
export function bistName(symbol: string): string {
  return BY_SYMBOL[symbol] ?? symbol;
}

const SEARCH_LIMIT = 12;

/** Sembol VEYA ada göre büyük/küçük harf duyarsız arama; boş sorgu → []. Sonuç SEARCH_LIMIT ile sınırlı. */
export function searchBist100(query: string): Bist100Entry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const out: Bist100Entry[] = [];
  for (const e of BIST100) {
    if (e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) {
      out.push(e);
      if (out.length >= SEARCH_LIMIT) break;
    }
  }
  return out;
}
