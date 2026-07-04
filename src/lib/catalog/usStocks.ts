/** Statik ABD Borsası (NYSE/NASDAQ) arama kataloğu — sembol + ad, FİYATSIZ.
 *  Sadece aramayı besler; canlı fiyat YALNIZ aktif sete (store.activeUs) eklenince çekilir.
 *  ⚠️ Yalnız düz alfanümerik ticker (nokta/tire içeren sembol YOK — query string'te virgülle
 *  ayrılan listeye karışmasın diye, örn. BRK.B kasıtlı dışarıda). */
export interface UsStockEntry {
  readonly symbol: string;
  readonly name: string;
}

/** En tanınmış/likit ABD hisseleri (genişletilebilir; v1 yeterli kapsam). */
export const US_STOCKS: ReadonlyArray<UsStockEntry> = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'MA', name: 'Mastercard' },
  { symbol: 'UNH', name: 'UnitedHealth' },
  { symbol: 'HD', name: 'Home Depot' },
  { symbol: 'PG', name: 'Procter & Gamble' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'KO', name: 'Coca-Cola' },
  { symbol: 'PEP', name: 'PepsiCo' },
  { symbol: 'DIS', name: 'Walt Disney' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'ADBE', name: 'Adobe' },
  { symbol: 'CRM', name: 'Salesforce' },
  { symbol: 'ORCL', name: 'Oracle' },
  { symbol: 'INTC', name: 'Intel' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'QCOM', name: 'Qualcomm' },
  { symbol: 'CSCO', name: 'Cisco' },
  { symbol: 'IBM', name: 'IBM' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'MCD', name: "McDonald's" },
  { symbol: 'NKE', name: 'Nike' },
  { symbol: 'SBUX', name: 'Starbucks' },
  { symbol: 'BA', name: 'Boeing' },
  { symbol: 'GE', name: 'General Electric' },
  { symbol: 'CAT', name: 'Caterpillar' },
  { symbol: 'XOM', name: 'Exxon Mobil' },
  { symbol: 'CVX', name: 'Chevron' },
  { symbol: 'PFE', name: 'Pfizer' },
  { symbol: 'MRK', name: 'Merck' },
  { symbol: 'ABBV', name: 'AbbVie' },
  { symbol: 'T', name: 'AT&T' },
  { symbol: 'VZ', name: 'Verizon' },
  { symbol: 'BAC', name: 'Bank of America' },
  { symbol: 'WFC', name: 'Wells Fargo' },
  { symbol: 'GS', name: 'Goldman Sachs' },
  { symbol: 'MS', name: 'Morgan Stanley' },
  { symbol: 'C', name: 'Citigroup' },
  { symbol: 'PYPL', name: 'PayPal' },
  { symbol: 'UBER', name: 'Uber' },
  { symbol: 'ABNB', name: 'Airbnb' },
  { symbol: 'SPOT', name: 'Spotify' },
  { symbol: 'SHOP', name: 'Shopify' },
];

const BY_SYMBOL: Readonly<Record<string, string>> = Object.fromEntries(
  US_STOCKS.map((e) => [e.symbol, e.name]),
);

/** Sembolün adı; bilinmiyorsa sembolün kendisi (store/PriceList etiketlemesi). */
export function usStockName(symbol: string): string {
  return BY_SYMBOL[symbol] ?? symbol;
}

const SEARCH_LIMIT = 12;

/** Sembol VEYA ada göre büyük/küçük harf duyarsız arama; boş sorgu → []. Sonuç SEARCH_LIMIT ile sınırlı. */
export function searchUsStocks(query: string): UsStockEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const out: UsStockEntry[] = [];
  for (const e of US_STOCKS) {
    if (e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) {
      out.push(e);
      if (out.length >= SEARCH_LIMIT) break;
    }
  }
  return out;
}
