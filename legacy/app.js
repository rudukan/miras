// Miras Oyunu - Core Game Engine v2.3.0 (Tycoon & Taxation Engine)

// ==========================================
// 1. SOUND ENGINE (WEB AUDIO API)
// ==========================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Play the nostalgic CRT Degauss on startup
    this.playDegauss();
    
    // Smoothly phase in the background server hum as the degauss coil fades
    setTimeout(() => {
      this.startHum();
    }, 1200);
  }

  setMute(state) {
    this.muted = state;
    if (this.muted && this.humOsc) {
      try { this.humGain.gain.setValueAtTime(0, this.ctx.currentTime); } catch(e) {}
    } else if (!this.muted && this.humOsc) {
      try { this.humGain.gain.setValueAtTime(0.015, this.ctx.currentTime); } catch(e) {}
    }
  }

  startHum() {
    if (this.muted || !this.ctx) return;
    try {
      this.humOsc = this.ctx.createOscillator();
      this.humGain = this.ctx.createGain();
      this.humOsc.type = 'sine';
      this.humOsc.frequency.setValueAtTime(55, this.ctx.currentTime);
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(80, this.ctx.currentTime);

      this.humOsc.connect(filter);
      filter.connect(this.humGain);
      this.humGain.connect(this.ctx.destination);
      
      this.humGain.gain.setValueAtTime(0.015, this.ctx.currentTime);
      this.humOsc.start(0);
    } catch (e) {
      console.log("Hum failed to start:", e);
    }
  }

  playClick() {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const sampleRate = this.ctx.sampleRate;
      
      // Generate a short 30ms white noise buffer for tactile texture
      const bufferSize = sampleRate * 0.03;
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      // Click Component: High-frequency leaf snap (Cherry MX Blue click jacket simulation)
      const noiseSource1 = this.ctx.createBufferSource();
      noiseSource1.buffer = buffer;
      
      const filter1 = this.ctx.createBiquadFilter();
      filter1.type = 'bandpass';
      // Randomize center frequency slightly (+/- 750Hz) to represent typing on different keys
      const clickFreq = 6000 + (Math.random() - 0.5) * 1500;
      filter1.frequency.setValueAtTime(clickFreq, now);
      filter1.Q.setValueAtTime(6, now);
      
      const gain1 = this.ctx.createGain();
      gain1.gain.setValueAtTime(0.04, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.006);
      
      noiseSource1.connect(filter1);
      filter1.connect(gain1);
      gain1.connect(this.ctx.destination);
      noiseSource1.start(now);
      
      // Clack Component: Mid-low housing impact (plastic bottoming out)
      const noiseSource2 = this.ctx.createBufferSource();
      noiseSource2.buffer = buffer;
      
      const filter2 = this.ctx.createBiquadFilter();
      filter2.type = 'bandpass';
      // Randomize housing clack frequency (+/- 100Hz)
      const clackFreq = 950 + (Math.random() - 0.5) * 200;
      filter2.frequency.setValueAtTime(clackFreq, now);
      filter2.Q.setValueAtTime(4, now);
      
      const gain2 = this.ctx.createGain();
      gain2.gain.setValueAtTime(0.12, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      
      noiseSource2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(this.ctx.destination);
      noiseSource2.start(now);

      // Spring Ping Component: Vintage IBM buckling spring metallic ring
      const pingOsc = this.ctx.createOscillator();
      pingOsc.type = 'sine';
      const pingFreq = 2200 + (Math.random() - 0.5) * 500;
      pingOsc.frequency.setValueAtTime(pingFreq, now);
      
      const pingGain = this.ctx.createGain();
      pingGain.gain.setValueAtTime(0.008, now);
      pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      
      pingOsc.connect(pingGain);
      pingGain.connect(this.ctx.destination);
      pingOsc.start(now);
      pingOsc.stop(now + 0.035);
    } catch (e) {
      console.log("Mechanical click synthesis failed:", e);
    }
  }

  playDegauss() {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const duration = 1.6;
      
      // 1. Primary Low AC Hum Surge (Power degaussing coil active surge)
      const humOsc = this.ctx.createOscillator();
      humOsc.type = 'triangle';
      humOsc.frequency.setValueAtTime(110, now);
      humOsc.frequency.exponentialRampToValueAtTime(28, now + duration);
      
      const humFilter = this.ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.setValueAtTime(160, now);
      humFilter.frequency.exponentialRampToValueAtTime(40, now + duration);
      humFilter.Q.setValueAtTime(5, now);
      
      const humGain = this.ctx.createGain();
      humGain.gain.setValueAtTime(0.35, now);
      humGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      
      humOsc.connect(humFilter);
      humFilter.connect(humGain);
      humGain.connect(this.ctx.destination);
      humOsc.start(now);
      humOsc.stop(now + duration);
      
      // 2. High-Voltage Shadow Mask Static Crackle / Rustle
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;
      
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2200, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(250, now + 1.0);
      noiseFilter.Q.setValueAtTime(1.8, now);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.04, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
      
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noiseSource.start(now);
      
      // 3. Metallic Coil Spring Expansion Ring
      const ringOsc = this.ctx.createOscillator();
      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(360, now);
      ringOsc.frequency.exponentialRampToValueAtTime(80, now + 1.2);
      
      const ringGain = this.ctx.createGain();
      ringGain.gain.setValueAtTime(0.025, now);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      
      ringOsc.connect(ringGain);
      ringGain.connect(this.ctx.destination);
      ringOsc.start(now);
      ringOsc.stop(now + 1.2);
    } catch (e) {
      console.log("CRT Degauss synthesis failed:", e);
    }
  }

  playBeep(freq = 880, duration = 0.05, type = 'sine', volume = 0.05) {
    if (this.muted || !this.ctx) return;
    
    // Intercept default parameters to play mechanical key click instead of a generic flat tone
    if (freq === 880 && duration === 0.05 && type === 'sine' && volume === 0.05) {
      this.playClick();
      return;
    }
    
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(0);
      osc.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }

  playSuccess() {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Satisfying arpeggiated 8-bit chiptune win fanfare (C major run)
      const notes = [
        { f: 523.25, d: 0.06 },  // C5
        { f: 659.25, d: 0.06 },  // E5
        { f: 783.99, d: 0.06 },  // G5
        { f: 1046.50, d: 0.06 }, // C6
        { f: 1318.51, d: 0.06 }, // E6
        { f: 1567.98, d: 0.06 }, // G6
        { f: 2093.00, d: 0.22 }  // C7 (sustained peak)
      ];
      
      notes.forEach((note, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        const noteStart = now + index * 0.06;
        const noteEnd = noteStart + note.d;
        
        osc.frequency.setValueAtTime(note.f, noteStart);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.03, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(noteStart);
        osc.stop(noteEnd);
      });
    } catch (e) {}
  }

  playError() {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Retro double-sawtooth beating frequency drop for crunchy error buzz
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      const gain2 = this.ctx.createGain();
      
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(140, now);
      osc1.frequency.linearRampToValueAtTime(55, now + 0.22);
      
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(144, now); // Discordant offset
      osc2.frequency.linearRampToValueAtTime(56.5, now + 0.22);
      
      gain1.gain.setValueAtTime(0.05, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      
      gain2.gain.setValueAtTime(0.05, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.22);
      osc2.stop(now + 0.22);
    } catch(e) {}
  }

  playAlert() {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const tones = [0, 0.08];
      
      // Retro warning chime: quick double square-wave pitch slides
      tones.forEach((delay) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        const start = now + delay;
        const end = start + 0.07;
        
        osc.frequency.setValueAtTime(880, start);
        osc.frequency.exponentialRampToValueAtTime(440, start + 0.07);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.04, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(end);
      });
    } catch(e) {}
  }

  playTypewriter() {
    this.playClick();
  }
}

const sound = new SoundEngine();

// ==========================================
// 2. MACRO DATA GENERATOR AND CONSTANTS
// ==========================================
if (typeof TICKER_INFO === 'undefined') {
  window.TICKER_INFO = {
    // BIST Stocks (TRY ₺)
    THYAO: { name: "Türk Hava Yolları", base: 235.0, vol: 0.012, curve: [1.0, 1.12, 1.28, 1.35, 1.25, 1.15, 1.18, 1.22], currency: "TRY" },
    EREGL: { name: "Ereğli Demir Çelik", base: 41.2, vol: 0.010, curve: [1.0, 1.05, 1.18, 1.30, 1.20, 1.10, 1.05, 1.14], currency: "TRY" },
    ASELS: { name: "Aselsan Elektronik", base: 46.5, vol: 0.016, curve: [1.0, 1.20, 1.35, 1.55, 1.40, 1.30, 1.48, 1.52], currency: "TRY" },
    GUBRF: { name: "Gübre Fabrikaları", base: 145.0, vol: 0.045, curve: [1.0, 0.82, 1.15, 0.75, 1.25, 0.90, 1.35, 1.10], currency: "TRY" },
    KCHOL: { name: "Koç Holding", base: 142.0, vol: 0.012, curve: [1.0, 1.25, 1.58, 1.78, 1.60, 1.40, 1.35, 1.45], currency: "TRY" },
    TUPRS: { name: "Tüpraş Rafinerileri", base: 138.0, vol: 0.014, curve: [1.0, 1.15, 1.38, 1.52, 1.38, 1.22, 1.20, 1.28], currency: "TRY" },
    YKBNK: { name: "Yapı Kredi Bankası", base: 21.0, vol: 0.018, curve: [1.0, 1.20, 1.48, 1.65, 1.42, 1.28, 1.22, 1.34], currency: "TRY" },
    BIMAS: { name: "BİM Birleşik Mağazalar", base: 310.0, vol: 0.009, curve: [1.0, 1.18, 1.35, 1.50, 1.58, 1.62, 1.52, 1.58], currency: "TRY" },
    SASA: { name: "Sasa Polyester", base: 39.5, vol: 0.022, curve: [1.0, 0.88, 0.78, 0.65, 0.58, 0.52, 0.56, 0.60], currency: "TRY" },
    
    // Traditional Altın (TRY ₺ with buy/sell bank spread)
    ALTIN: { name: "Gram Altın (Banka)", base: 1980.0, vol: 0.006, curve: [1.0, 1.08, 1.15, 1.22, 1.28, 1.35, 1.42, 1.50], currency: "TRY" },
    
    // Cryptocurrencies (USD $)
    BTC: { name: "Bitcoin", base: 42200.0, vol: 0.020, curve: [1.0, 1.08, 1.32, 1.68, 1.55, 1.42, 1.54, 1.88], currency: "USD" },
    ETH: { name: "Ethereum", base: 2280.0, vol: 0.025, curve: [1.0, 1.10, 1.42, 1.72, 1.48, 1.32, 1.22, 1.45], currency: "USD" },
    SOL: { name: "Solana", base: 101.50, vol: 0.035, curve: [1.0, 1.15, 1.52, 1.95, 1.65, 1.38, 1.45, 2.02], currency: "USD" },
    
    // USD Bonds (USD $)
    EUROBOND: { name: "Hazine Dolar Tahvili", base: 1000.0, vol: 0.0, curve: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], currency: "USD" }
  };
}

if (typeof MACRO_DATABASE === 'undefined') {
  const usdTryCurve = [29.90, 31.05, 32.25, 32.70, 33.15, 33.95, 34.35, 35.30];
  const tcmbCurve = [42.5, 45.0, 45.0, 50.0, 50.0, 50.0, 50.0, 50.0];
  const kfeCurve = [1.0, 1.05, 1.09, 1.14, 1.18, 1.23, 1.29, 1.36];

  const historicalHeadlines = [
    { w: 0, title: "TCMB Faiz Artırım Kararı Açıklandı", body: "Merkez Bankası politika faiz oranını %42.5 seviyesinden %45'e yükselterek mali disiplini güçlendirdi. Kur sakin." },
    { w: 6, title: "Şimşek'ten Yabancı Yatırımcı Ziyareti", body: "Hazine ve Maliye Bakanlığı, Londra ve New York temaslarının olumlu geçtiğini duyurdu. Portföy girişlerinde kıpırdanma var." },
    { w: 12, title: "TCMB'den Sürpriz Karar: Faizler %50'ye Çıktı!", body: "Enflasyon baskılarını sınırlamak amacıyla Merkez Bankası faizi %50 seviyesine çekti. Mevduat getirileri zirvede." },
    { w: 18, title: "BIST Rekor Tazeledi", body: "Bankacılık (YKBNK) ve Holding (KCHOL) hisseleri öncülüğünde Borsa İstanbul endeksi tüm zamanların en yüksek seviyesini test etti." },
    { w: 25, title: "Yaz Sezonunda Havacılık Zirvesi", body: "Turizm doluluk oranlarının rekor kırmasıyla THYAO gelirlerinde yükseliş öngörülüyor. Sektör hisseleri güçlü." },
    { w: 32, title: "Kredi Derecelendirme Not Artışı", body: "Moody's Türkiye'nin kredi notunu iki kademe yükselterek görünümü pozitif olarak teyit etti. Piyasalara taze fon girişi." },
    { w: 40, title: "Küresel Sanayi Talebinde Yavaşlama", body: "Demir-çelik emtia fiyatlarındaki geri çekilme nedeniyle EREGL bilançolarında kar marjı baskısı. Hisse yatay seyrediyor." },
    { w: 47, title: "Yıl Sonu Enflasyon Beklentileri", body: "Aralık ayı enflasyon verisi yıllık %50 civarında dengelenmeye başladı. Faiz indirim tartışmaları gündemde." }
  ];

  function interpolateCurve(curveArray, index52) {
    const len = curveArray.length;
    const pos = (index52 / 51) * (len - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    if (idx >= len - 1) return curveArray[len - 1];
    return curveArray[idx] * (1 - frac) + curveArray[idx + 1] * frac;
  }

  window.MACRO_DATABASE = [];
  for (let w = 0; w < 52; w++) {
    const usdTry = parseFloat(interpolateCurve(usdTryCurve, w).toFixed(4));
    const tcmbRate = parseFloat(interpolateCurve(tcmbCurve, w).toFixed(2));
    const kfeIndex = parseFloat(interpolateCurve(kfeCurve, w).toFixed(4));
    
    const stockPrices = {};
    Object.keys(TICKER_INFO).forEach(ticker => {
      const info = TICKER_INFO[ticker];
      const multiplier = interpolateCurve(info.curve, w);
      stockPrices[ticker] = parseFloat((info.base * multiplier).toFixed(2));
    });

    const foundHeadline = historicalHeadlines.find(h => h.w === w);
    const headline = foundHeadline ? { title: foundHeadline.title, body: foundHeadline.body } : null;

    window.MACRO_DATABASE.push({
      usdTry,
      tcmbRate,
      kfeIndex,
      stockPrices,
      headline
    });
  }
}

// ==========================================
// 3. GAME STATE AND CONFIGURATION
// ==========================================
const GAME_STATE = {
  day: 1,
  totalDays: 365,
  cash: 1000000.00,       // USD Cash
  tryCash: 0.00,          // TRY Cash
  bankBalance: 0.00,      // Vadeli Bank Deposit (TRY)
  usdTry: 29.90,          // Live USD/TRY rate
  tcmbRate: 42.50,        // Live TCMB rate
  kfeIndex: 1.0,
  flowRate: 0.00,         // USD flow rate equivalents per sec
  accumulatedInterest: 0,
  accumulatedRentTRY: 0,  // Rent tax aggregator
  daysSinceLastTaxAudit: 0,
  
  inflationRateDaily: 0.0001,
  inflationThreshold: 1000000.00,
  
  properties: [
    { name: "İç Anadolu Tarım Arazisi", type: "Arsa", cost: 1200000, yield: 700, count: 0, delay: 5 },
    { name: "İstanbul 1+1 Daire", type: "Konut", cost: 4500000, yield: 2600, count: 0, delay: 8 },
    { name: "Ege Turizm İmarı", type: "Arsa", cost: 9000000, yield: 5600, count: 0, delay: 10 },
    { name: "Kadıköy Butik Kafe", type: "İşletme", cost: 15000000, yield: 10000, count: 0, delay: 12 },
    { name: "Antalya Deniz Rezidans", type: "Konut", cost: 28000000, yield: 20000, count: 0, delay: 14 },
    { name: "Bodrum Butik Otel", type: "İşletme", cost: 65000000, yield: 50000, count: 0, delay: 18 }
  ],
  pendingTapu: [],
  
  // Business policies & purchased upgrades (Idx 3 is Cafe, Idx 5 is Hotel)
  businessPolicies: {
    3: "normal",
    5: "normal"
  },
  businessUpgrades: {
    3: [false, false], // [Tadilat, Reklam]
    5: [false, false]
  },
  
  stocks: {},
  techAgent: {
    active: false,
    cost: 50000,
    yield: 80.00,
    autoTrade: false,
    upgrades: [
      { name: "Bulut Sunucu Ölçekleme", cost: 75000, yield: 250.00, purchased: false, desc: "Altyapıyı optimize eder, pasif nakit akışını kalıcı olarak +$250/sn artırır." },
      { name: "Viral Reklam Kampanyası", cost: 160000, yield: 650.00, purchased: false, desc: "AI reklam bütçesi yaratır, pasif nakit akışını +$650/sn artırır." }
    ]
  },

  selectedTicker: "THYAO",
  modalActiveIndex: null, // target property index for the business modal
  gameActive: false,
  localServerActive: false,
  liveListing: null,
  secondsSinceLastListing: 0,
  taxReportingMode: 'enag',
  taxEvadedAccumulated: 0,
  fxSource: 'bank',
  loanSharkDebt: 0,
  loanSharkTimer: 0,
  loanSharkInterestTimer: 0,
  usdTryLockValue: null,
  electionShockApplied: false
};

// Base cost and yields for KFE calculations
const basePropCosts = [1200000, 4500000, 9000000, 15000000, 28000000, 65000000];
const basePropYields = [700, 2600, 5600, 10000, 20000, 50000];

// Initialize assets
Object.keys(TICKER_INFO).forEach(ticker => {
  const info = TICKER_INFO[ticker];
  GAME_STATE.stocks[ticker] = {
    name: info.name,
    price: info.base,
    basePrice: info.base,
    change: 0.0,
    held: 0,
    avgCost: 0,
    volatility: info.vol,
    noise: 0.0,
    history: Array(50).fill(info.base),
    currency: info.currency,
    leverage: 1,
    borrowed: 0,
    marginPaid: 0,
    liquidationPrice: 0,
    marginCallPrice: 0,
    marginCallActive: false,
    marginCallTimer: 0
  };
});

// Formatting Helpers
const formatUSD = (val) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

const formatTRY = (val) => {
  return "₺" + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const formatPercent = (val) => {
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
};

// BIST Market Session Control & Holidays
function isTurkeyHoliday(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0=Jan, 4=May)
  const day = date.getDate();

  // Fixed holidays
  if (month === 0 && day === 1) return true; // Yılbaşı
  if (month === 3 && day === 23) return true; // 23 Nisan
  if (month === 4 && day === 1) return true; // 1 Mayıs
  if (month === 4 && day === 19) return true; // 19 Mayıs
  if (month === 6 && day === 15) return true; // 15 Temmuz
  if (month === 7 && day === 30) return true; // 30 Ağustos
  if (month === 9 && day === 29) return true; // 29 Ekim

  // 2026 Variable Islamic Holidays
  if (year === 2026) {
    // Ramazan Bayramı 2026: March 19-22
    if (month === 2) { // March
      if (day >= 19 && day <= 22) return true;
    }
    // Kurban Bayramı 2026: May 26-30
    if (month === 4) { // May
      if (day >= 26 && day <= 30) return true;
    }
  }
  return false;
}

function isBistMarketOpen(date) {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  if (isTurkeyHoliday(date)) return false;

  const hours = date.getHours();
  if (hours < 10 || hours >= 18) return false;

  return true;
}

function checkBistOpen() {
  if (GAME_STATE.mode !== 'live') return true;
  return isBistMarketOpen(new Date());
}

async function fetchLiveNews() {
  if (GAME_STATE.mode !== 'live' || !GAME_STATE.gameActive) return;
  try {
    const res = await fetch('http://localhost:3000/api/news');
    if (!res.ok) throw new Error("News response not ok");
    const news = await res.json();
    
    if (news && news.length > 0) {
      const idx = Math.floor(Math.random() * news.length);
      const item = news[idx];
      
      document.getElementById("news-title").textContent = item.title;
      document.getElementById("news-body").textContent = item.body;
      document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
      sound.playAlert();
      addLog(`CANLI HABER: ${item.title}`, "warning");
    }
  } catch (e) {
    console.error("Failed to fetch live news:", e.message);
  }
}

// ==========================================
// 4. AUTO-FX CONVERSION ENGINE (USD <-> TRY SYMMETRIC ENGINE)
// ==========================================
function ensureTRYBalance(amountTRY) {
  if (GAME_STATE.tryCash >= amountTRY) return true;
  
  let shortageTRY = amountTRY - GAME_STATE.tryCash;
  
  // 1. Pull from bank deposits first
  if (GAME_STATE.bankBalance >= shortageTRY) {
    GAME_STATE.bankBalance = parseFloat((GAME_STATE.bankBalance - shortageTRY).toFixed(2));
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + shortageTRY).toFixed(2));
    addLog(`[VADELİ HESAP MUKAVELESİ] Hesaptaki ₺${shortageTRY.toLocaleString('tr-TR')} likidite açığı, otomatik virman talimatı doğrultusunda cari hesaba aktarılmıştır.`, "info");
    return true;
  } else if (GAME_STATE.bankBalance > 0) {
    const bankDrawn = GAME_STATE.bankBalance;
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + bankDrawn).toFixed(2));
    shortageTRY -= bankDrawn;
    GAME_STATE.bankBalance = 0;
    addLog(`[VADELİ HESAP TASFİYESİ] Mevduat hesabındaki ₺${bankDrawn.toLocaleString('tr-TR')} tutarındaki bakiyenin tamamı nemalandırma vadesi beklenmeksizin bozulmuştur. Kalan bakiye açığı: ₺${shortageTRY.toLocaleString('tr-TR')}`, "info");
  }
  
  // 2. Sell USD if still short
  const rate = GAME_STATE.usdTry;
  const effRate = GAME_STATE.techAgent.active ? rate : rate * 0.999;
  const usdNeeded = shortageTRY / effRate;
  
  if (GAME_STATE.cash >= usdNeeded) {
    GAME_STATE.cash = parseFloat((GAME_STATE.cash - usdNeeded).toFixed(2));
    const convertedTRY = usdNeeded * effRate;
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + convertedTRY).toFixed(2));
    
    const feeUSD = GAME_STATE.techAgent.active ? 0 : usdNeeded * 0.001;
    addLog(`[REŞAT DÖVİZ OFİSİ] Cari TL hesabındaki ₺${shortageTRY.toLocaleString('tr-TR')} tutarındaki likidite noksanlığını kapatmak adına ${formatUSD(usdNeeded)} satılarak bozdurulmuştur. (Tahsil edilen BSMV ve Komisyon: ${formatUSD(feeUSD)})`, "info");
    return true;
  }
  return false;
}

function ensureUSDBalance(amountUSD) {
  if (GAME_STATE.cash >= amountUSD) return true;
  
  let shortageUSD = amountUSD - GAME_STATE.cash;
  const rate = GAME_STATE.usdTry;
  const comm = GAME_STATE.techAgent.active ? 0 : 0.001;
  const tryNeeded = (shortageUSD * rate) / (1 - comm);
  
  // Try to use tryCash first
  if (GAME_STATE.tryCash >= tryNeeded) {
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - tryNeeded).toFixed(2));
    GAME_STATE.cash = parseFloat((GAME_STATE.cash + shortageUSD).toFixed(2));
    
    const feeTRY = GAME_STATE.techAgent.active ? 0 : tryNeeded * 0.001;
    addLog(`[REŞAT DÖVİZ OFİSİ] Döviz alımı nakit noksanlığı sebebiyle ₺${tryNeeded.toLocaleString('tr-TR', {minimumFractionDigits: 2})} satılarak döviz tevdiat hesabına aktarılmıştır. (Komisyon: ₺${feeTRY.toFixed(2)})`, "info");
    return true;
  }
  
  // If tryCash is short, check if we can withdraw from bank balance
  const totalTRYAvailable = GAME_STATE.tryCash + GAME_STATE.bankBalance;
  if (totalTRYAvailable >= tryNeeded) {
    const bankShortage = tryNeeded - GAME_STATE.tryCash;
    GAME_STATE.bankBalance = parseFloat((GAME_STATE.bankBalance - bankShortage).toFixed(2));
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + bankShortage).toFixed(2));
    addLog(`[VADELİ HESAP VİRMANI] Döviz alımı teminat açığı sebebiyle vadeli TL hesabından ₺${bankShortage.toLocaleString('tr-TR')} re'sen çekilmiştir.`, "info");
    
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - tryNeeded).toFixed(2));
    GAME_STATE.cash = parseFloat((GAME_STATE.cash + shortageUSD).toFixed(2));
    
    const feeTRY = GAME_STATE.techAgent.active ? 0 : tryNeeded * 0.001;
    addLog(`[REŞAT DÖVİZ OFİSİ] Döviz alımı nakit noksanlığı sebebiyle ₺${tryNeeded.toLocaleString('tr-TR', {minimumFractionDigits: 2})} satılarak döviz tevdiat hesabına aktarılmıştır. (Komisyon: ₺${feeTRY.toFixed(2)})`, "info");
    return true;
  }
  
  return false;
}

// ==========================================
// 5. CHART RENDERING ENGINE (CANVAS - DYNAMIC CURRENCY ACCORDING TO ACTIVE ASSET)
// ==========================================
function drawChart() {
  const canvas = document.getElementById("bist-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  const width = rect.width;
  const height = rect.height;
  
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, width, height);
  
  const ticker = GAME_STATE.selectedTicker;
  const stock = GAME_STATE.stocks[ticker];
  const history = stock.history;
  
  let minPrice = Math.min(...history);
  let maxPrice = Math.max(...history);
  const margin = (maxPrice - minPrice) * 0.15 || 2.0;
  maxPrice += margin;
  minPrice -= margin;
  if (minPrice < 0) minPrice = 0;
  
  // Draw Grid Lines (Horizontal)
  ctx.strokeStyle = "#16223d";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#4a628a";
  ctx.font = "9px 'JetBrains Mono', monospace";
  
  const symbol = stock.currency === "USD" ? "$" : "₺";
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const yVal = maxPrice - (i / gridLines) * (maxPrice - minPrice);
    const y = 30 + (i / gridLines) * (height - 45);
    
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(width - 65, y);
    ctx.stroke();
    
    ctx.fillText(symbol + yVal.toFixed(stock.currency === "USD" ? 2 : 2), width - 60, y + 3);
  }
  
  const isUp = history[history.length - 1] >= history[history.length - 2];
  const trendColor = isUp ? "#00ff66" : "#ff3366";
  const trendColorAlpha = isUp ? "rgba(0, 255, 102, 0.08)" : "rgba(255, 51, 102, 0.08)";
  
  const dataPoints = history.length;
  const stepX = (width - 80) / (dataPoints - 1);
  
  ctx.beginPath();
  for (let i = 0; i < dataPoints; i++) {
    const x = 10 + i * stepX;
    const y = 30 + (1 - (history[i] - minPrice) / (maxPrice - minPrice)) * (height - 45);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.save();
  ctx.lineTo(10 + (dataPoints - 1) * stepX, height - 15);
  ctx.lineTo(10, height - 15);
  ctx.closePath();
  let grad = ctx.createLinearGradient(0, 30, 0, height - 15);
  grad.addColorStop(0, trendColorAlpha);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
  
  ctx.strokeStyle = trendColor;
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 6;
  ctx.shadowColor = trendColor;
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  const lastX = 10 + (dataPoints - 1) * stepX;
  const lastY = 30 + (1 - (history[history.length - 1] - minPrice) / (maxPrice - minPrice)) * (height - 45);
  
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, 2 * Math.PI);
  ctx.fillStyle = trendColor;
  ctx.shadowBlur = 8;
  ctx.shadowColor = trendColor;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ==========================================
// 6. UPDATE AND UI BINDINGS
// ==========================================
function updateUI() {
  const totalWealthUSD = getNetWorthUSD();
  
  document.getElementById("total-wealth").textContent = formatUSD(totalWealthUSD);
  if (totalWealthUSD >= GAME_STATE.inflationThreshold) {
    document.getElementById("total-wealth").className = "text-base font-bold text-term-green glow-text-green";
  } else {
    document.getElementById("total-wealth").className = "text-base font-bold text-term-amber";
  }
  
  document.getElementById("usd-cash").textContent = formatUSD(GAME_STATE.cash);
  document.getElementById("try-cash").textContent = formatTRY(GAME_STATE.tryCash);
  document.getElementById("ui-live-rate").textContent = `1 USD = ₺${GAME_STATE.usdTry.toFixed(2)}`;
  
  // Calculate Flow Rate
  // Properties rents (adjusted by policy multipliers)
  let propYieldTRY = 0;
  GAME_STATE.properties.forEach((p, idx) => {
    let multiplier = 1.0;
    
    // Check if upgraded
    if (GAME_STATE.businessUpgrades[idx]) {
      if (GAME_STATE.businessUpgrades[idx][0]) multiplier += 0.25; // Renovations
      if (GAME_STATE.businessUpgrades[idx][1]) multiplier += 0.10; // Marketing
    }
    
    // Check pricing policy
    let policyFactor = 1.0;
    if (GAME_STATE.businessPolicies[idx]) {
      const policy = GAME_STATE.businessPolicies[idx];
      if (policy === "low") policyFactor = 0.95 * 0.8;
      else if (policy === "normal") policyFactor = 0.70 * 1.0;
      else if (policy === "high") policyFactor = 0.45 * 2.0;
    }
    
    propYieldTRY += p.count * p.yield * multiplier * policyFactor;
  });
  
  let techYieldUSD = 0;
  if (GAME_STATE.techAgent.active) {
    techYieldUSD += GAME_STATE.techAgent.yield;
    GAME_STATE.techAgent.upgrades.forEach(u => {
      if (u.purchased) techYieldUSD += u.yield;
    });
  }
  
  // Eurobond yields paid daily, so saniyelik flow rate is 7% per year: $1000 * 0.07 / 365 = $0.1917 per day
  // Since 2 seconds is 1 game day, saniyelik yield is: (Eurobond count * 1000 * 0.07 / 365) / 2
  const eurobondsCount = GAME_STATE.stocks.EUROBOND.held;
  const eurobondYieldUSD = (eurobondsCount * 1000 * 0.07 / 365) / 2;
  
  const totalFlowUSD = techYieldUSD + eurobondYieldUSD + (propYieldTRY / GAME_STATE.usdTry);
  GAME_STATE.flowRate = totalFlowUSD;
  document.getElementById("flow-rate").textContent = `+$${totalFlowUSD.toFixed(2)}/sn`;
  
  if (GAME_STATE.mode === 'live') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR');
    const dateStr = now.toLocaleDateString('tr-TR');
    document.getElementById("day-counter-text").textContent = `${dateStr} ${timeStr}`;
  } else {
    document.getElementById("day-counter-text").textContent = `GÜN ${GAME_STATE.day} / ${GAME_STATE.totalDays}`;
  }
  const progressPct = (GAME_STATE.day / GAME_STATE.totalDays) * 100;
  document.getElementById("day-progress").style.width = `${progressPct}%`;
  document.getElementById("days-remaining-label").textContent = `${GAME_STATE.totalDays - GAME_STATE.day} Gün`;

  // Update BIST session pill status
  const bistOpen = checkBistOpen();
  const sessionPill = document.getElementById("bist-session-pill");
  if (sessionPill) {
    if (bistOpen) {
      sessionPill.textContent = "[ SEANS AÇIK ]";
      sessionPill.className = "px-1.5 py-0.5 text-[8px] font-bold rounded font-mono uppercase tracking-widest border border-term-green/20 bg-term-green/10 text-term-green";
    } else {
      sessionPill.textContent = "[ SEANS DIŞI ]";
      sessionPill.className = "px-1.5 py-0.5 text-[8px] font-bold rounded font-mono uppercase tracking-widest border border-term-red/20 bg-term-red/10 text-term-red animate-pulse";
    }
  }

  document.getElementById("inflation-threshold").textContent = formatUSD(GAME_STATE.inflationThreshold);
  const targetYearEnd = 1000000 * Math.pow(1 + GAME_STATE.inflationRateDaily, GAME_STATE.totalDays);
  document.getElementById("target-wealth-label").textContent = formatUSD(targetYearEnd);
  
  updateQuantAgent(totalWealthUSD);
  updateTechAgentUI();
  updateStockTradePanel();
  updateRealEstateUI();

  // KFE UI Update
  const kfeEl = document.getElementById("ui-kfe-index");
  const kfeChangeEl = document.getElementById("ui-kfe-change");
  if (kfeEl && kfeChangeEl) {
    kfeEl.textContent = GAME_STATE.kfeIndex.toFixed(4);
    const kfeChangeVal = GAME_STATE.kfeChange || 0;
    kfeChangeEl.textContent = `[${kfeChangeVal >= 0 ? "+" : ""}${kfeChangeVal.toFixed(3)}%]`;
    kfeChangeEl.className = `font-bold font-mono ${kfeChangeVal >= 0 ? 'text-term-green' : 'text-term-red'}`;
  }

  // Update Fx Source displays
  if (GAME_STATE.fxSource === 'bazaar') {
    const buyRate = GAME_STATE.usdTry * 1.015;
    const sellRate = GAME_STATE.usdTry * 0.985;
    document.getElementById("fx-current-rate").innerHTML = `Alış: ₺${buyRate.toFixed(4)} | <span class="text-[9px] text-gray-500 font-normal">Satış: ₺${sellRate.toFixed(4)}</span>`;
    document.getElementById("fx-fee-indicator").textContent = "Kapalıçarşı Komisyonu: %0.3";
  } else {
    document.getElementById("fx-current-rate").textContent = `₺${GAME_STATE.usdTry.toFixed(4)}`;
    const feePct = bistOpen ? (GAME_STATE.techAgent.active ? "0" : "0.1") : "2.0";
    document.getElementById("fx-fee-indicator").textContent = `Banka Komisyonu: %${feePct}`;
  }

  // Update Tefeci Cafer displays
  const sharkDebtEl = document.getElementById("loan-shark-debt");
  const sharkBtn = document.getElementById("loan-shark-borrow-btn");
  if (sharkDebtEl && sharkBtn) {
    if (GAME_STATE.loanSharkDebt > 0) {
      sharkDebtEl.textContent = `₺${Math.ceil(GAME_STATE.loanSharkDebt).toLocaleString('tr-TR')} (${GAME_STATE.loanSharkTimer}s)`;
      sharkBtn.textContent = `[ BORÇ ÖDE: -₺${Math.ceil(GAME_STATE.loanSharkDebt).toLocaleString('tr-TR')} ]`;
      sharkBtn.className = "w-full py-1 bg-term-red/20 border border-term-red hover:bg-term-red/30 text-term-red font-bold uppercase rounded transition-all";
    } else {
      sharkDebtEl.textContent = "₺0.00";
      sharkBtn.textContent = "[ BORÇ AL: +₺500,000 ]";
      sharkBtn.className = "w-full py-1 bg-term-red/10 border border-term-red/30 hover:bg-term-red hover:text-black text-term-red font-bold uppercase rounded transition-all";
    }
  }

  document.getElementById("bank-interest-rate").textContent = `%${GAME_STATE.tcmbRate.toFixed(2)} Yıllık`;
  document.getElementById("bank-balance").textContent = formatTRY(GAME_STATE.bankBalance);

  // Call policy toggles and election UI updates
  updateTaxPolicyUI();
  updateFxTabUI();
  updateElectionUI();

  updateBalanceSheet(totalWealthUSD);
}

function updateTaxPolicyUI() {
  const tuikBtn = document.getElementById("tax-policy-tuik");
  const enagBtn = document.getElementById("tax-policy-enag");
  if (!tuikBtn || !enagBtn) return;
  if (GAME_STATE.taxReportingMode === 'tuik') {
    tuikBtn.className = "py-1 bg-term-red/20 border border-term-red/50 text-term-red text-[8px] font-bold rounded uppercase transition-all";
    enagBtn.className = "py-1 bg-term-panelLight border border-term-border text-gray-400 text-[8px] font-bold rounded uppercase hover:border-term-green transition-all";
  } else {
    tuikBtn.className = "py-1 bg-term-panelLight border border-term-border text-gray-400 text-[8px] font-bold rounded uppercase hover:border-term-red transition-all";
    enagBtn.className = "py-1 bg-term-green/20 border border-term-green/50 text-term-green text-[8px] font-bold rounded uppercase transition-all";
  }
}

function updateFxTabUI() {
  const bankTab = document.getElementById("fx-tab-bank");
  const bazaarTab = document.getElementById("fx-tab-bazaar");
  if (!bankTab || !bazaarTab) return;
  if (GAME_STATE.fxSource === 'bazaar') {
    bankTab.className = "flex-1 py-1 hover:bg-[#141c30] text-gray-400 font-bold uppercase transition-all";
    bazaarTab.className = "flex-1 py-1 bg-term-amber/15 text-term-amber font-bold uppercase transition-all";
  } else {
    bankTab.className = "flex-1 py-1 bg-term-blue/15 text-term-blue font-bold uppercase transition-all";
    bazaarTab.className = "flex-1 py-1 hover:bg-[#141c30] text-gray-400 font-bold uppercase transition-all";
  }
}

function updateElectionUI() {
  const pill = document.getElementById("election-status-pill");
  if (!pill) return;
  
  if (GAME_STATE.day >= 35 && GAME_STATE.day <= 55) {
    pill.classList.remove("hidden");
    pill.textContent = `[ SEÇİM SATH-I MAHAL - Kalan: ${56 - GAME_STATE.day} Gün ]`;
    pill.className = "px-1.5 py-0.5 text-[8px] font-bold rounded font-mono uppercase tracking-widest border border-term-amber/20 bg-term-amber/10 text-term-amber animate-pulse";
  } else if (GAME_STATE.day === 56) {
    pill.classList.remove("hidden");
    pill.textContent = "[ POST-SEÇİM ŞOKU ]";
    pill.className = "px-1.5 py-0.5 text-[8px] font-bold rounded font-mono uppercase tracking-widest border border-term-red/20 bg-term-red/10 text-term-red animate-pulse";
  } else {
    pill.classList.add("hidden");
  }
}

function getNetWorthUSD() {
  let propValTRY = 0;
  GAME_STATE.properties.forEach(p => {
    propValTRY += p.count * p.cost;
  });
  GAME_STATE.pendingTapu.forEach(order => propValTRY += order.cost);
  
  let stockValTRY = 0;
  let stockValUSD = 0;
  let borrowedTRY = 0;
  let borrowedUSD = 0;
  Object.keys(GAME_STATE.stocks).forEach(ticker => {
    const s = GAME_STATE.stocks[ticker];
    if (s.currency === "USD") {
      stockValUSD += s.held * s.price;
      borrowedUSD += s.borrowed || 0;
    } else {
      stockValTRY += s.held * s.price;
      borrowedTRY += s.borrowed || 0;
    }
  });
  
  const totalAssetsTRY = GAME_STATE.tryCash + GAME_STATE.bankBalance + propValTRY + (stockValTRY - borrowedTRY) - GAME_STATE.loanSharkDebt;
  return GAME_STATE.cash + (stockValUSD - borrowedUSD) + (totalAssetsTRY / GAME_STATE.usdTry);
}

function updateQuantAgent(netWorthUSD) {
  const usdCashEquivalent = GAME_STATE.cash;
  const tryCashEquivalent = (GAME_STATE.tryCash + GAME_STATE.bankBalance) / GAME_STATE.usdTry;
  const totalCashEq = usdCashEquivalent + tryCashEquivalent;
  const cashPct = netWorthUSD > 0 ? (totalCashEq / netWorthUSD) * 100 : 0;
  
  let propValTRY = 0;
  GAME_STATE.properties.forEach(p => propValTRY += p.count * p.cost);
  const propPct = netWorthUSD > 0 ? ((propValTRY / GAME_STATE.usdTry) / netWorthUSD) * 100 : 0;
  
  let stockValTRY = 0;
  let stockValUSD = 0;
  Object.keys(GAME_STATE.stocks).forEach(ticker => {
    const s = GAME_STATE.stocks[ticker];
    if (s.currency === "USD") stockValUSD += s.held * s.price;
    else stockValTRY += s.held * s.price;
  });
  const totalStockUSD = stockValUSD + (stockValTRY / GAME_STATE.usdTry);
  const stockPct = netWorthUSD > 0 ? (totalStockUSD / netWorthUSD) * 100 : 0;
  
  document.getElementById("alloc-cash").style.width = `${cashPct}%`;
  document.getElementById("alloc-property").style.width = `${propPct}%`;
  document.getElementById("alloc-stock").style.width = `${stockPct}%`;
  
  document.getElementById("quant-allocation-txt").textContent = 
    `Nakit %${Math.round(cashPct)} | Emlak %${Math.round(propPct)} | Varlıklar %${Math.round(stockPct)}`;

  let msg = "Piyasalar sakin. Portföy dağılımı bekleniyor.";
  if (GAME_STATE.day < 5 && cashPct > 90) {
    msg = "QUANT RISK: Tüm paranız nakitte. Lira kur hareketleri ve enflasyona karşı koruma sağlamak amacıyla yatırımları planlayın.";
  } else if (cashPct > 85) {
    msg = "QUANT RISK: Çok yüksek nakit! Eurobond tahvilleri veya yüksek mevduat faizlerine geçerek Lira erimesini durdurun.";
  } else if (stockPct > 65) {
    msg = "QUANT UYARI: Kripto/BİST yoğunluğu çok yüksek. Volatilitenin yüksek olması net varlığınızı sarsabilir.";
  } else if (propPct > 55) {
    msg = "QUANT ANALİZ: Emlak/İşletme portföyü dengeli. Rant ve kira gelirleri ₺ bazında yüksek akış sağlıyor.";
  } else {
    msg = "QUANT OPTİMUM: Portföy dağılımı stabil. Kur, faiz ve hisse dengesi ideal seviyelerde yönetiliyor.";
  }
  
  document.getElementById("quant-message").textContent = msg;
}

function updateTechAgentUI() {
  const card = document.getElementById("tech-agent-card");
  const status = document.getElementById("tech-status");
  const msg = document.getElementById("tech-message");
  const btn = document.getElementById("tech-btn");
  
  if (!GAME_STATE.techAgent.active) {
    card.className = "bg-term-bg/60 border border-red-500/20 rounded p-3 flex flex-col space-y-2 relative overflow-hidden group hover:border-red-500/40 transition-all";
    status.className = "px-1.5 py-0.5 text-[9px] bg-red-500/10 text-red-500 rounded border border-red-500/20 uppercase tracking-widest font-semibold flex items-center gap-1 font-mono animate-pulse";
    status.innerHTML = "UYKUDA";
    msg.textContent = "Amcanızın eski AI şirketi altyapısı hazır ama uykuda. Sunucuları açmak ve reklam çıkmak için $50,000 işletme sermayesi gerekiyor.";
    btn.textContent = "[ Şirketi $50,000'a Uyandır ]";
    btn.className = "w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500 text-red-500 font-bold uppercase text-[9px] tracking-wider rounded font-mono transition-all duration-200";
  } else {
    card.className = "bg-term-bg/60 border border-term-green/20 rounded p-3 flex flex-col space-y-2 relative overflow-hidden group hover:border-term-green/40 transition-all";
    status.className = "px-1.5 py-0.5 text-[9px] bg-term-green/10 text-term-green rounded border border-term-green/20 uppercase tracking-widest font-semibold flex items-center gap-1 font-mono";
    status.innerHTML = `<span class="w-1.5 h-1.5 bg-term-green rounded-full inline-block animate-pulse"></span>AKTİF`;
    
    const nextUpgrade = GAME_STATE.techAgent.upgrades.find(u => !u.purchased);
    if (nextUpgrade) {
      msg.textContent = `SUNUCULAR AKTİF (+$80.00/sn). Sıradaki Yükseltme: ${nextUpgrade.name} (${nextUpgrade.desc})`;
      btn.textContent = `[ ${nextUpgrade.name.toUpperCase()}: $${nextUpgrade.cost.toLocaleString()} ]`;
      btn.className = "w-full py-1.5 bg-term-blue/10 hover:bg-term-blue/20 border border-term-blue/30 hover:border-term-blue text-term-blue font-bold uppercase text-[9px] tracking-wider rounded font-mono transition-all duration-200";
      btn.style.display = "block";
    } else {
      msg.textContent = "ALTYAPI MAKSİMUM KAPASİTEDE. Tüm yazılım optimizasyonları ve AI veri tabanı modülleri kararlı çalışıyor.";
      btn.style.display = "none";
    }
  }
}

function updateStockTradePanel() {
  const ticker = GAME_STATE.selectedTicker;
  const stock = GAME_STATE.stocks[ticker];
  const isUp = stock.price >= stock.history[stock.history.length - 2];
  const currencySymbol = stock.currency === "USD" ? "$" : "₺";
  
  const displayTickerName = `${ticker} (${stock.name})`;
  if (stock.marginCallActive) {
    document.getElementById("selected-ticker-name").innerHTML = `${displayTickerName} <span class="text-term-red font-bold animate-pulse font-mono">[MARGIN CALL: ${stock.marginCallTimer}s]</span>`;
  } else {
    document.getElementById("selected-ticker-name").textContent = displayTickerName;
  }
  
  const priceEl = document.getElementById("selected-ticker-price");
  if (ticker === "ALTIN") {
    // Show bank buy/sell spread for gold
    const sellPrice = stock.price * 0.985;
    priceEl.innerHTML = `Alış: ₺${stock.price.toFixed(2)} | <span class="text-xs text-gray-500 font-normal">Satış: ₺${sellPrice.toFixed(2)}</span>`;
    priceEl.className = "text-xs font-bold text-term-green";
  } else {
    priceEl.textContent = `${currencySymbol}${stock.price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    priceEl.className = `text-sm font-bold ${isUp ? 'text-term-green' : 'text-term-red'}`;
  }
  
  const changeEl = document.getElementById("selected-ticker-change");
  changeEl.textContent = (isUp ? "▲ " : "▼ ") + formatPercent(stock.change);
  changeEl.className = `text-[10px] font-semibold ${isUp ? 'text-term-green' : 'text-term-red'}`;
  
  document.getElementById("selected-ticker-held").textContent = `${stock.held.toLocaleString()} Adet`;
  
  const avgCostEl = document.getElementById("selected-ticker-avg-cost");
  const plEl = document.getElementById("selected-ticker-pl");
  
  if (stock.held > 0) {
    avgCostEl.textContent = `${currencySymbol}${stock.avgCost.toFixed(2)}`;
    
    // Spread math for gold sales P&L
    const sellVal = ticker === "ALTIN" ? stock.price * 0.985 : stock.price;
    const plValue = (sellVal - stock.avgCost) * stock.held;
    
    plEl.textContent = `${plValue >= 0 ? "+" : ""}${currencySymbol}${plValue.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    plEl.className = `text-[10px] font-bold ${plValue >= 0 ? 'text-term-green' : 'text-term-red'}`;
  } else {
    avgCostEl.textContent = "-";
    plEl.textContent = "-";
    plEl.className = "text-[10px] text-gray-400 font-bold";
  }

  // Adjust leverage stats block
  const selectedLeverage = parseInt(document.getElementById("trade-leverage").value) || 1;
  const showLeverageBlock = stock.held > 0 ? (stock.leverage > 1) : (selectedLeverage > 1);
  const leverageInfoBlock = document.getElementById("leverage-info-block");
  if (leverageInfoBlock) {
    if (showLeverageBlock) {
      leverageInfoBlock.classList.remove("hidden");
      leverageInfoBlock.classList.add("flex");
      
      const marginVal = stock.held > 0 ? stock.marginPaid : ((parseFloat(qtyInput.value) || 0) * stock.price / selectedLeverage);
      const liqPrice = stock.held > 0 ? stock.liquidationPrice : (stock.price * (1 - 0.85 / selectedLeverage));
      
      document.getElementById("selected-ticker-margin").textContent = stock.currency === "USD" ? formatUSD(marginVal) : formatTRY(marginVal);
      document.getElementById("selected-ticker-liquidation").textContent = `${stock.currency === "USD" ? formatUSD(liqPrice) : formatTRY(liqPrice)}`;
    } else {
      leverageInfoBlock.classList.remove("flex");
      leverageInfoBlock.classList.add("hidden");
    }
  }

  // Adjust Max buy label dynamically based on asset currency and leverage
  if (stock.currency === "USD") {
    const totalUSDCombined = GAME_STATE.cash + (GAME_STATE.tryCash / GAME_STATE.usdTry);
    const maxBuyUSD = Math.floor((totalUSDCombined * selectedLeverage) / stock.price);
    document.getElementById("quick-cash-limit").textContent = `Max Alım: ${maxBuyUSD.toLocaleString()} Adet (USD) [${selectedLeverage}x]`;
  } else {
    const rate = GAME_STATE.usdTry;
    const effRate = GAME_STATE.techAgent.active ? rate : rate * 0.999;
    const totalTRYCombined = GAME_STATE.tryCash + GAME_STATE.cash * effRate;
    const maxBuyTRY = Math.floor((totalTRYCombined * selectedLeverage) / stock.price);
    document.getElementById("quick-cash-limit").textContent = `Max Alım: ${maxBuyTRY.toLocaleString()} Adet (TRY) [${selectedLeverage}x]`;
  }
}

// ==========================================
// 6B. DYNAMIC REAL ESTATE RENDERING ENGINE
// ==========================================
function updateRealEstateUI() {
  const container = document.getElementById("real-estate-list");
  if (!container) return;
  
  const rate = GAME_STATE.usdTry;
  const effRate = GAME_STATE.techAgent.active ? rate : rate * 0.999;
  const totalCombinedTRY = GAME_STATE.tryCash + GAME_STATE.cash * effRate;

  let html = "";
  GAME_STATE.properties.forEach((p, idx) => {
    let pendingHtml = "";
    const activeOrders = GAME_STATE.pendingTapu.filter(o => o.propIndex === idx);
    
    activeOrders.forEach(order => {
      pendingHtml += `
        <div class="p-1 bg-[#141c30]/90 border border-term-border rounded text-[9px] space-y-1 font-mono text-term-amber my-1 relative overflow-hidden">
          <div class="flex justify-between items-center">
            <span>Tapu: <span class="font-bold text-white">${order.daysRemaining} Gün</span></span>
            <button data-order-id="${order.id}" class="bribe-btn px-1.5 py-0.5 bg-term-amber/20 hover:bg-term-amber hover:text-black border border-term-amber/30 text-term-amber rounded text-[8px] font-bold transition-all">
              [ RÜŞVET: ₺${order.bribeCost.toLocaleString('tr-TR')} ]
            </button>
          </div>
        </div>
      `;
    });

    // 4% Tapu harcı tax markup
    const displayCostTRY = Math.round(p.cost * 1.04);
    const isAffordable = totalCombinedTRY >= displayCostTRY;
    const btnClass = isAffordable 
      ? "buy-prop-btn w-full py-1 bg-term-blue/15 hover:bg-term-blue hover:text-black border border-term-blue/30 hover:border-term-blue text-term-blue font-bold uppercase text-[9px] tracking-wider rounded font-mono transition-all"
      : "buy-prop-btn w-full py-1 bg-term-border/10 border border-term-border text-gray-600 cursor-not-allowed text-[9px] font-bold uppercase tracking-wider rounded font-mono";

    // Manage button visible if owned > 0 for businesses (Cafe at idx 3, Hotel at idx 5)
    const canManage = (idx === 3 || idx === 5) && p.count > 0;
    const manageBtnHtml = canManage 
      ? `<button data-prop-index="${idx}" class="manage-prop-btn w-full py-1 bg-term-amber/15 hover:bg-term-amber hover:text-black border border-term-amber/30 hover:border-term-amber text-term-amber font-bold uppercase text-[9px] tracking-wider rounded font-mono transition-all">[ YÖNET ]</button>`
      : "";

    html += `
      <div id="property-card-${idx}" class="bg-term-bg/60 border border-term-border rounded p-2.5 flex flex-col justify-between space-y-2 group hover:border-term-blue/30 transition-all min-h-[145px]">
        <div class="flex justify-between items-start">
          <div class="max-w-[70%]">
            <h4 class="text-[10px] font-bold text-white font-mono leading-tight truncate" title="${p.name}">${p.name}</h4>
            <span class="text-[8px] text-gray-500 font-mono uppercase tracking-wider">${p.type}</span>
          </div>
          <span class="px-1.5 py-0.5 text-[9px] bg-term-blue/10 text-term-blue rounded font-bold border border-term-blue/20 font-mono shrink-0">${p.count} Adet</span>
        </div>
        <div class="text-[9px] font-mono leading-snug">
          <div class="flex justify-between py-0.5 border-b border-term-border/30">
            <span class="text-gray-500">Maliyet:</span>
            <span class="text-white font-semibold">₺${p.cost.toLocaleString('tr-TR')}</span>
          </div>
          <div class="flex justify-between py-0.5 border-b border-term-border/30 text-gray-500">
            <span>+ %4 Tapu Harcı:</span>
            <span>₺${Math.round(p.cost * 0.04).toLocaleString('tr-TR')}</span>
          </div>
          <div class="flex justify-between py-0.5">
            <span class="text-gray-500">Kira Akışı:</span>
            <span class="text-term-green font-semibold">+₺${p.yield.toLocaleString('tr-TR')}/sn</span>
          </div>
        </div>
        
        <!-- Pending queues -->
        <div class="space-y-0.5">${pendingHtml}</div>
        
        <div class="grid grid-cols-${canManage ? '2' : '1'} gap-1.5 pt-1">
          <button data-prop-index="${idx}" class="${btnClass}">
            [ SATIN AL ]
          </button>
          ${manageBtnHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function updateBalanceSheet(netWorthUSD) {
  let propValTRY = 0;
  GAME_STATE.properties.forEach(p => propValTRY += p.count * p.cost);
  GAME_STATE.pendingTapu.forEach(order => propValTRY += order.cost);
  
  let stockValTRY = 0;
  let stockValUSD = 0;
  let borrowedTRY = 0;
  let borrowedUSD = 0;
  Object.keys(GAME_STATE.stocks).forEach(ticker => {
    const s = GAME_STATE.stocks[ticker];
    if (s.currency === "USD") {
      stockValUSD += s.held * s.price;
      borrowedUSD += s.borrowed || 0;
    } else {
      stockValTRY += s.held * s.price;
      borrowedTRY += s.borrowed || 0;
    }
  });

  document.getElementById("summary-cash-usd").textContent = formatUSD(GAME_STATE.cash);
  document.getElementById("summary-cash-try").textContent = formatTRY(GAME_STATE.tryCash);
  document.getElementById("summary-deposit-try").textContent = formatTRY(GAME_STATE.bankBalance);
  
  const netStockValTRY = (stockValTRY - borrowedTRY) + ((stockValUSD - borrowedUSD) * GAME_STATE.usdTry);
  document.getElementById("summary-stocks-try").textContent = formatTRY(netStockValTRY);
  document.getElementById("summary-properties-try").textContent = formatTRY(propValTRY);
  document.getElementById("summary-total").textContent = formatUSD(netWorthUSD);

  const usdCashEq = GAME_STATE.cash;
  const tryCashEq = (GAME_STATE.tryCash + GAME_STATE.bankBalance) / GAME_STATE.usdTry;
  const totalCashEq = usdCashEq + tryCashEq;
  
  const cashPct = netWorthUSD > 0 ? (totalCashEq / netWorthUSD) * 100 : 0;
  const propPct = netWorthUSD > 0 ? ((propValTRY / GAME_STATE.usdTry) / netWorthUSD) * 100 : 0;
  const stockPct = netWorthUSD > 0 ? ((netStockValTRY / GAME_STATE.usdTry) / netWorthUSD) * 100 : 0;

  document.getElementById("bar-cash").style.width = `${cashPct}%`;
  document.getElementById("bar-property").style.width = `${propPct}%`;
  document.getElementById("bar-stock").style.width = `${stockPct}%`;
}

function addLog(msg, type = "normal") {
  const container = document.getElementById("log-container");
  if (!container) return;
  
  const div = document.createElement("div");
  const time = new Date().toLocaleTimeString('tr-TR', { hour12: false });
  
  let colorClass = "text-gray-400";
  if (type === "success") colorClass = "text-term-green";
  else if (type === "warning") colorClass = "text-term-amber";
  else if (type === "error") colorClass = "text-term-red";
  else if (type === "info") colorClass = "text-term-blue";
  
  div.className = `${colorClass} py-0.5 border-b border-term-border/20`;
  div.innerHTML = `<span class="text-gray-600">[${time}]</span> ${msg}`;
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ==========================================
// 6C. BUSINESS MANAGEMENT MODAL UPDATE CONTROLS
// ==========================================
function updateBusinessModalUI() {
  const idx = GAME_STATE.modalActiveIndex;
  if (idx === null) return;
  const prop = GAME_STATE.properties[idx];
  
  document.getElementById("modal-biz-name").textContent = `${prop.name} (Sahip olunan: ${prop.count} Adet)`;
  
  // Highlight active pricing policy button
  const policy = GAME_STATE.businessPolicies[idx] || "normal";
  ["low", "normal", "high"].forEach(p => {
    const btn = document.getElementById(`policy-${p}`);
    if (p === policy) {
      btn.className = "py-2 border border-term-blue bg-term-blue/15 text-term-blue font-bold rounded text-[9px] uppercase transition-all";
    } else {
      btn.className = "py-2 border border-term-border hover:border-term-blue bg-term-bg/40 text-gray-400 font-bold rounded text-[9px] uppercase transition-all";
    }
  });

  // Load Upgrade Cost & Button details
  const isCafe = idx === 3;
  const tadilatCost = isCafe ? 1500000 : 8000000;
  const reklamCost = isCafe ? 400000 : 1800000;
  
  const tadilatPurchased = GAME_STATE.businessUpgrades[idx][0];
  const reklamPurchased = GAME_STATE.businessUpgrades[idx][1];

  // Upgrades Titles & Descs
  document.getElementById("modal-upg-0-name").textContent = isCafe ? "Espresso Makinesi & Konsept Tadilatı" : "Yüzme Havuzu İnşaatı";
  document.getElementById("modal-upg-0-desc").textContent = isCafe ? "Yeni nesil kahve makineleri kurun. Gelir kalıcı %25 artar." : "Lüks yüzme havuzu inşa edin. Gelir kalıcı %25 artar.";
  
  document.getElementById("modal-upg-1-name").textContent = isCafe ? "Instagram Influencer İşbirlikleri" : "Booking & AI Reklam Kampanyası";
  document.getElementById("modal-upg-1-desc").textContent = isCafe ? "Popüler kahve gurmeleriyle reklam yapın. Gelir %10 artar." : "Sosyal medya reklamları ve booking öne çıkarma. Gelir %10 artar.";

  // Upgrades Buttons styles
  const upg0Btn = document.getElementById("modal-upg-0-btn");
  if (tadilatPurchased) {
    upg0Btn.textContent = "[ AKTİF ]";
    upg0Btn.className = "px-2.5 py-1.5 bg-term-green/10 border border-term-green text-term-green text-[9px] font-bold uppercase rounded cursor-not-allowed shrink-0";
  } else {
    upg0Btn.textContent = `₺${tadilatCost.toLocaleString('tr-TR')}`;
    upg0Btn.className = "px-2.5 py-1.5 bg-term-blue/15 hover:bg-term-blue hover:text-black border border-term-blue/30 text-term-blue text-[9px] font-bold uppercase rounded transition-all shrink-0";
  }

  const upg1Btn = document.getElementById("modal-upg-1-btn");
  if (reklamPurchased) {
    upg1Btn.textContent = "[ AKTİF ]";
    upg1Btn.className = "px-2.5 py-1.5 bg-term-green/10 border border-term-green text-term-green text-[9px] font-bold uppercase rounded cursor-not-allowed shrink-0";
  } else {
    upg1Btn.textContent = `₺${reklamCost.toLocaleString('tr-TR')}`;
    upg1Btn.className = "px-2.5 py-1.5 bg-term-blue/15 hover:bg-term-blue hover:text-black border border-term-blue/30 text-term-blue text-[9px] font-bold uppercase rounded transition-all shrink-0";
  }
}

// ==========================================
// 7. STOCK PRICE SIMULATOR
// ==========================================
function updateStockPrices() {
  const bistOpen = checkBistOpen();
  
  Object.keys(GAME_STATE.stocks).forEach(ticker => {
    const s = GAME_STATE.stocks[ticker];
    if (s.volatility === 0.0) return; // Eurobond is risk-free constant
    
    const isBistTicker = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
    if (isBistTicker && GAME_STATE.mode === 'live' && !bistOpen) {
      // BIST is closed! Keep price static but push to history to maintain chart width
      s.history.push(s.price);
      if (s.history.length > 50) {
        s.history.shift();
      }
      return;
    }
    
    const rand = (Math.random() - 0.5) * 2;
    s.noise += rand * s.volatility;
    s.noise = Math.max(-0.045, Math.min(0.045, s.noise));
    
    s.price = parseFloat((s.basePrice * (1 + s.noise)).toFixed(2));
    if (s.price < 0.1) s.price = 0.1;
    s.change = ((s.price - s.basePrice) / s.basePrice) * 100;
    
    s.history.push(s.price);
    if (s.history.length > 50) {
      s.history.shift();
    }

    // Leverage Margin Call Trigger Check
    if (s.held > 0 && s.leverage > 1) {
      if (s.price <= s.marginCallPrice) {
        if (!s.marginCallActive) {
          s.marginCallActive = true;
          s.marginCallTimer = 10;
          addLog(`[MARGIN CALL] ⚠ ${ticker} pozisyonunuzda teminat erimesi %85'e ulaştı! Tasfiyeyi önlemek için 10 saniye içinde kapatın veya ekleme yapın!`, "error");
          sound.playError();
        }
      } else {
        if (s.marginCallActive) {
          s.marginCallActive = false;
          s.marginCallTimer = 0;
          addLog(`[SİSTEM] ${ticker} pozisyonu güvenli bölgeye ulaştı, Margin Call iptal edildi.`, "success");
          sound.playSuccess();
        }
      }
    }
  });

  drawChart();
  updateStockTradePanel();
}

// ==========================================
// CANLI VERİ VE BAĞLANTI SERVİSLERİ (LIVE MODE API)
// ==========================================
let lastCryptoFetchTime = 0;
let cachedCryptoPrices = null;

async function fetchLivePrices() {
  if (GAME_STATE.mode !== 'live' || !navigator.onLine || !GAME_STATE.gameActive) return;
  
  const now = Date.now();
  if (now - lastCryptoFetchTime < 5000 && cachedCryptoPrices) {
    cachedCryptoPrices.forEach(res => {
      const tickerMap = { 'BTCUSDT': 'BTC', 'ETHUSDT': 'ETH', 'SOLUSDT': 'SOL' };
      const ticker = tickerMap[res.symbol];
      if (ticker) {
        GAME_STATE.stocks[ticker].basePrice = parseFloat(res.price);
      }
    });
    drawChart();
    updateStockTradePanel();
    return;
  }
  
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const promises = symbols.map(sym => 
      fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`)
        .then(res => {
          if (!res.ok) throw new Error("Binance response not ok");
          return res.json();
        })
    );
    const results = await Promise.all(promises);
    cachedCryptoPrices = results;
    lastCryptoFetchTime = now;
    
    results.forEach(res => {
      const tickerMap = { 'BTCUSDT': 'BTC', 'ETHUSDT': 'ETH', 'SOLUSDT': 'SOL' };
      const ticker = tickerMap[res.symbol];
      if (ticker) {
        const livePrice = parseFloat(res.price);
        const s = GAME_STATE.stocks[ticker];
        s.basePrice = livePrice;
      }
    });
    
    drawChart();
    updateStockTradePanel();
  } catch (e) {
    console.error("Live crypto sync failed:", e);
  }
}

async function fetchUSDTRY() {
  if (GAME_STATE.mode !== 'live' || !navigator.onLine || !GAME_STATE.gameActive) return;
  
  // Lock rate during election
  if (GAME_STATE.day >= 35 && GAME_STATE.day <= 55) return;
  
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error("Exchange rate API response not ok");
    const data = await res.json();
    if (data && data.rates && data.rates.TRY) {
      let rate = data.rates.TRY;
      if (GAME_STATE.day >= 56) {
        rate = rate * 1.25; // Apply shock factor post election
      }
      GAME_STATE.usdTry = parseFloat(rate.toFixed(4));
    }
  } catch (e) {
    console.error("Live FX sync failed:", e);
  }
}

async function fetchLiveBistPrices() {
  if (GAME_STATE.mode !== 'live' || !GAME_STATE.gameActive) return;
  try {
    const res = await fetch('http://localhost:3000/api/bist');
    if (!res.ok) throw new Error("Local server response not ok");
    const prices = await res.json();
    
    // Update base prices for all BIST stocks and Altın
    Object.keys(prices).forEach(ticker => {
      if (GAME_STATE.stocks[ticker]) {
        let p = prices[ticker];
        if (GAME_STATE.day >= 56 && ticker !== 'ALTIN') {
          p = p * 0.85; // BIST remains crushed post shock
        }
        GAME_STATE.stocks[ticker].basePrice = p;
      }
    });

    if (!GAME_STATE.localServerActive) {
      GAME_STATE.localServerActive = true;
      addLog("[SİSTEM] Yerel BIST veri sunucusu bağlandı. Canlı veriler aktif.", "success");
      setLiveStatus('live');
    }
  } catch (e) {
    if (GAME_STATE.localServerActive) {
      GAME_STATE.localServerActive = false;
      addLog("[UYARI] Yerel BIST veri sunucusu bağlantısı koptu! Hibrid drift simülasyonuna geçildi.", "warning");
      setLiveStatus('live');
    }
  }
}

function setLiveStatus(status) {
  const pill = document.getElementById("live-status-pill");
  if (!pill) return;
  
  if (status === 'local') {
    pill.textContent = "[ ⚠ LOCAL ]";
    pill.className = "px-2 py-0.5 text-[9px] font-bold rounded font-mono uppercase tracking-wider border bg-term-amber/10 text-term-amber border-term-amber/30 transition-all duration-300";
  } else if (status === 'sync') {
    pill.textContent = "[ ↻ SYNC ]";
    pill.className = "px-2 py-0.5 text-[9px] font-bold rounded font-mono uppercase tracking-wider border bg-term-blue/10 text-term-blue border-term-blue/30 animate-pulse transition-all duration-300";
  } else if (status === 'live') {
    const suffix = GAME_STATE.localServerActive ? " + BIST" : "";
    pill.textContent = `[ ● LIVE${suffix} ]`;
    pill.className = "px-2 py-0.5 text-[9px] font-bold rounded font-mono uppercase tracking-wider border bg-term-green/10 text-term-green border-term-green/30 transition-all duration-300 shadow-[0_0_8px_rgba(0,255,102,0.3)]";
  }
}

// ==========================================
// SAHİBİNDEN LIVE DEAL & BARGAIN ENGINE
// ==========================================
const SAHIBINDEN_TITLES = [
  { p: 0, t: "Borçtan dolayı acil satılık İç Anadolu tarlası" },
  { p: 0, t: "Hisse senedinde batan amcadan kelepir tarla" },
  { p: 1, t: "Ev sahibinin yurt dışına kaçması sebebiyle acil 1+1" },
  { p: 1, t: "Kriptoda likit olan gençten satılık yatırımlık daire" },
  { p: 2, t: "Belediye imar planı öncesi el altından Ege arsası" },
  { p: 2, t: "Mirasyedilerin kavgasından dolayı kelepir imarlı arsa" },
  { p: 3, t: "Kadıköy'de devren kiralık butik kafe (makine dahil!)" },
  { p: 3, t: "Vergi denetiminden korkan esnaftan acil satılık kafe" },
  { p: 4, t: "Kriptocu fenomenden hacizli Antalya rezidans dairesi" },
  { p: 4, t: "Boşanma davası nedeniyle acil elden çıkarılan lüks konut" },
  { p: 5, t: "Sezon sonu fahiş fiyat cezası yiyen butik otel binası" },
  { p: 5, t: "Bankacılık borç yapılandırması sebebiyle acil otel satışı" }
];

const SELLER_PROFILES = [
  { name: "Müteahhit Sabri", type: "paragoz", avatar: "👷‍♂️", dialogue: "Kardeşim mal ortada. Acil nakit sıkışıklığım olmasa hayatta satmam. Doları nakit severiz." },
  { name: "Emlakçı Cabbar", type: "kurnaz", avatar: "🕶️", dialogue: "Bak kardeşim bu mahalle uçacak. Fırsatı kaçırma derim, komisyonda yardımcı oluruz." },
  { name: "Mirasyedi Cemil", type: "mirasyedi", avatar: "🕺", dialogue: "Kanka acil nakit lazım ya, Binance'e girmem lazım coin düştü. Hızlı alacaksan al." }
];

function updateLiveListings() {
  if (GAME_STATE.liveListing) {
    GAME_STATE.liveListing.timeRemaining--;
    if (GAME_STATE.liveListing.timeRemaining <= 0) {
      addLog(`[SAHİBİNDEN] "${GAME_STATE.liveListing.title}" ilanının süresi doldu ve yayından kaldırıldı.`, "error");
      GAME_STATE.liveListing = null;
      sound.playError();
      if (GAME_STATE.bargainingActive) {
        closeBargainModal();
      }
    }
  } else {
    GAME_STATE.secondsSinceLastListing = (GAME_STATE.secondsSinceLastListing || 0) + 1;
    if (GAME_STATE.secondsSinceLastListing >= 20) {
      GAME_STATE.secondsSinceLastListing = 0;
      generateLiveListing();
    }
  }
  updateLiveListingsUI();
}

function generateLiveListing() {
  const propIndex = Math.floor(Math.random() * GAME_STATE.properties.length);
  const possibleTitles = SAHIBINDEN_TITLES.filter(t => t.p === propIndex);
  const title = possibleTitles[Math.floor(Math.random() * possibleTitles.length)].t;
  
  const marketPrice = GAME_STATE.properties[propIndex].cost;
  const discount = 0.15 + Math.random() * 0.15; // 15% to 30% discount
  const askingPrice = Math.round(marketPrice * (1 - discount));
  
  const profile = SELLER_PROFILES[Math.floor(Math.random() * SELLER_PROFILES.length)];
  
  let timeLimit = 15 + Math.floor(Math.random() * 10);
  if (profile.type === "mirasyedi") timeLimit = 10 + Math.floor(Math.random() * 5);
  
  GAME_STATE.liveListing = {
    propIndex: propIndex,
    title: title,
    cost: marketPrice,
    askingPrice: askingPrice,
    originalAskingPrice: askingPrice,
    seller: {
      name: profile.name,
      type: profile.type,
      avatar: profile.avatar,
      dialogue: profile.dialogue,
      sabir: 100,
      bribed: false
    },
    timeRemaining: timeLimit,
    bargainCount: 0
  };
  
  addLog(`[SAHİBİNDEN <LIVE>] Yeni kelepir ilan düştü: "${title}" (Kelepir Oranı: %${Math.round(discount * 100)})`, "warning");
  sound.playAlert();
}

function updateLiveListingsUI() {
  const container = document.getElementById("live-deal-container");
  const timerLabel = document.getElementById("deal-timer-label");
  if (!container || !timerLabel) return;
  
  const listing = GAME_STATE.liveListing;
  if (!listing) {
    timerLabel.textContent = "-";
    container.innerHTML = `<span class="text-[9px] text-gray-500 leading-normal">Kelepir ilanlar taranıyor...</span>`;
    return;
  }
  
  timerLabel.textContent = `Kalan: ${listing.timeRemaining}s`;
  timerLabel.className = `text-[8px] font-bold font-mono uppercase ${listing.timeRemaining < 6 ? 'text-term-red animate-pulse' : 'text-term-amber'}`;
  
  container.innerHTML = `
    <div class="flex flex-col justify-between h-full space-y-1.5 text-left font-mono">
      <div class="min-h-[36px]">
        <h4 class="text-[9px] font-bold text-white leading-tight line-clamp-2" title="${listing.title}">${listing.title}</h4>
      </div>
      <div class="text-[8px] space-y-0.5 leading-snug">
        <div class="flex justify-between">
          <span class="text-gray-500">Piyasa:</span>
          <span class="text-term-blue font-semibold">₺${listing.cost.toLocaleString('tr-TR')}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">İlan:</span>
          <span class="text-term-amber font-bold">₺${listing.askingPrice.toLocaleString('tr-TR')}</span>
        </div>
      </div>
      <button id="open-bargain-btn" class="w-full py-1 bg-term-amber/15 hover:bg-term-amber hover:text-black border border-term-amber/30 text-term-amber font-bold uppercase text-[9px] tracking-wider rounded transition-all">
        [ PAZARLIK SIM ]
      </button>
    </div>
  `;
}

function openBargainModal() {
  const listing = GAME_STATE.liveListing;
  if (!listing) return;
  
  GAME_STATE.bargainingActive = true;
  
  document.getElementById("seller-name").textContent = listing.seller.name;
  
  let typeLabel = "Paragöz";
  if (listing.seller.type === "kurnaz") typeLabel = "Kurnaz Esnaf";
  else if (listing.seller.type === "mirasyedi") typeLabel = "Aceleci Mirasyedi";
  document.getElementById("seller-type").textContent = typeLabel;
  
  document.getElementById("seller-avatar").textContent = listing.seller.avatar;
  document.getElementById("seller-dialogue").textContent = `"${listing.seller.dialogue}"`;
  document.getElementById("bargain-prop-name").textContent = listing.title;
  document.getElementById("bargain-market-price").textContent = `₺${listing.cost.toLocaleString('tr-TR')}`;
  document.getElementById("bargain-asking-price").textContent = `₺${listing.askingPrice.toLocaleString('tr-TR')}`;
  
  updateBargainModalUI();
  
  const modal = document.getElementById("bargain-modal");
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.classList.add("opacity-100");
  sound.playBeep();
}

function updateBargainModalUI() {
  const listing = GAME_STATE.liveListing;
  if (!listing) return;
  
  const sabir = listing.seller.sabir;
  const bar = document.getElementById("seller-anger-bar");
  const label = document.getElementById("seller-anger-label");
  
  bar.style.width = `${sabir}%`;
  if (sabir > 60) {
    bar.className = "bg-term-green h-full transition-all duration-300";
    label.textContent = "Sakin / Sabırlı";
    label.className = "text-term-green";
  } else if (sabir > 30) {
    bar.className = "bg-term-amber h-full transition-all duration-300";
    label.textContent = "Sıkkın / Kararsız";
    label.className = "text-term-amber";
  } else if (sabir > 0) {
    bar.className = "bg-term-red h-full transition-all duration-300";
    label.textContent = "ÖFKELİ / KOPMAK ÜZERE";
    label.className = "text-term-red animate-pulse";
  } else {
    bar.className = "bg-red-800 h-full transition-all duration-300";
    label.textContent = "TERK ETTİ";
    label.className = "text-red-700 font-bold";
  }
  
  document.getElementById("bargain-asking-price").textContent = `₺${listing.askingPrice.toLocaleString('tr-TR')}`;
  
  const acceptBtn = document.getElementById("bargain-accept-btn");
  acceptBtn.textContent = `EL SIKIŞ (₺${listing.askingPrice.toLocaleString('tr-TR')})`;
  
  acceptBtn.disabled = sabir <= 0;
  
  const optionsGroup = document.getElementById("bargain-options-group");
  const buttons = optionsGroup.querySelectorAll("button");
  buttons.forEach(btn => {
    btn.disabled = sabir <= 0 || listing.bargainCount >= 3;
    if (sabir <= 0 || listing.bargainCount >= 3) {
      btn.classList.add("opacity-50", "cursor-not-allowed");
    } else {
      btn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  });

  const dollarBtn = document.getElementById("bargain-opt-dolar");
  const usdNeeded = (listing.askingPrice * 0.92) / GAME_STATE.usdTry;
  if (GAME_STATE.cash < usdNeeded) {
    dollarBtn.disabled = true;
    dollarBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
}

function handleBargainAction(option) {
  const listing = GAME_STATE.liveListing;
  if (!listing || listing.seller.sabir <= 0 || listing.bargainCount >= 3) return;
  
  listing.bargainCount++;
  sound.playClick();
  
  let dialogueText = "";
  let priceDropPercent = 0;
  let sabirChange = 0;
  
  const type = listing.seller.type;
  
  if (option === 'sunnet') {
    priceDropPercent = 0.05;
    sabirChange = -15 - Math.floor(Math.random() * 10);
    
    if (type === 'paragoz') {
      dialogueText = `"Ulan hadi sünnettir diye kırıyorum ama daha fazlasını isteme, zarar ediyorum!"`;
    } else if (type === 'kurnaz') {
      dialogueText = `"Güzel kardeşim, senin güzel hatrına komisyondan kıstım biraz bak. Düz hesap yaptık."`;
    } else {
      dialogueText = `"Tamam kanka ya uğraştırma beni, kırdım gitti beş yüzde bir şeyler."`;
    }
  } 
  else if (option === 'olucu') {
    priceDropPercent = 0.15;
    
    if (type === 'paragoz') {
      sabirChange = -60 - Math.floor(Math.random() * 15);
      dialogueText = `"Sen benimle dalga mı geçiyorsun?! Bu fiyata ahır bile vermezler! Haddini bil!"`;
    } else if (type === 'kurnaz') {
      sabirChange = -40 - Math.floor(Math.random() * 10);
      dialogueText = `"Ölücülere mal vermem normalde ama nakit ihtiyacımız var. Alacaksan son fiyattır bu!"`;
    } else {
      sabirChange = -20 - Math.floor(Math.random() * 10);
      dialogueText = `"Oha kanka çok öldürdün ama harbi nakit lazım, tamam bari, al senin olsun."`;
    }
  } 
  else if (option === 'dolar') {
    priceDropPercent = 0.08;
    
    if (type === 'paragoz') {
      sabirChange = +15;
      dialogueText = `"Dolar mı dedin? Yeşil banknotlar... Bak bu teklif hoşuma gitti, el sıkışalım o zaman!"`;
    } else if (type === 'kurnaz') {
      sabirChange = -5;
      dialogueText = `"Döviz bazında ödeme mi? Tamam kanka, komisyonsuz ve BSMV'siz çözelim o zaman."`;
    } else {
      sabirChange = -10;
      dialogueText = `"Dolar da uyar bana, Binance hesabıma atarım direkt. Kabulümdür."`;
    }
  } 
  else if (option === 'kusur') {
    priceDropPercent = 0.06;
    sabirChange = -25 - Math.floor(Math.random() * 10);
    
    if (type === 'paragoz') {
      dialogueText = `"Mülkü mü kötülüyorsun sen? Deprem raporu tam buranın! Beğenmiyorsan alma kardeşim!"`;
    } else if (type === 'kurnaz') {
      sabirChange = -15;
      dialogueText = `"Ufak tefek boya masrafını kastediyorsun sanırım. Tamam, onun hatrına biraz daha düştüm."`;
    } else {
      dialogueText = `"Ya deprem falan kafa açma şimdi kanka, tamam kırdık işte fiyattan biraz daha."`;
    }
  }
  
  listing.seller.sabir = Math.max(0, Math.min(100, listing.seller.sabir + sabirChange));
  
  if (listing.seller.sabir > 0) {
    listing.askingPrice = Math.round(listing.askingPrice - listing.originalAskingPrice * priceDropPercent);
    if (listing.askingPrice < listing.originalAskingPrice * 0.5) {
      listing.askingPrice = Math.round(listing.originalAskingPrice * 0.5);
    }
    document.getElementById("seller-dialogue").textContent = dialogueText;
    sound.playSuccess();
  } else {
    document.getElementById("seller-dialogue").textContent = `"Hadi kardeşim işine bak! Boş muhabbet yapanlara, ölücülere satacak malım yok benim!"`;
    sound.playError();
  }
  
  updateBargainModalUI();
}

function finalizeBargainPurchase() {
  const listing = GAME_STATE.liveListing;
  if (!listing || listing.seller.sabir <= 0) return;
  
  const costTRY = listing.askingPrice;
  const displayCostTRY = Math.round(costTRY * 1.04);
  
  if (!ensureTRYBalance(displayCostTRY)) {
    sound.playError();
    addLog("Gayrimenkul ve tapu harcı masrafları için toplam bakiye yetersiz!", "error");
    return;
  }
  
  GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - displayCostTRY).toFixed(2));
  
  const delayDays = GAME_STATE.properties[listing.propIndex].delay;
  const bribeCost = Math.round(costTRY * 0.08);
  
  const order = {
    id: Date.now() + Math.random(),
    propIndex: listing.propIndex,
    name: listing.title,
    daysRemaining: delayDays,
    bribeCost: bribeCost,
    cost: costTRY
  };
  
  GAME_STATE.pendingTapu.push(order);
  
  addLog(`[TAPU BAŞVURUSU] Sahibinden alınan "${listing.title}" tescil talebi alınmıştır. %4 Tapu Harcı tahsil edilmiştir: ₺${Math.round(costTRY * 0.04).toLocaleString('tr-TR')}. Tescil süresi: ${delayDays} gün.`, "info");
  
  closeBargainModal();
  GAME_STATE.liveListing = null;
  updateUI();
}

function closeBargainModal() {
  const modal = document.getElementById("bargain-modal");
  modal.classList.remove("opacity-100");
  modal.classList.add("opacity-0", "pointer-events-none");
  GAME_STATE.bargainingActive = false;
  sound.playBeep();
  updateUI();
}

function updateLiveEvents() {
  if (GAME_STATE.tenantStrike && GAME_STATE.tenantStrike > 0) {
    GAME_STATE.tenantStrike--;
    if (GAME_STATE.tenantStrike === 0) {
      addLog("[SİSTEM] Kiracılarla anlaşma sağlandı, boykot sona erdi. Kira akışları normale döndü.", "success");
      sound.playSuccess();
    }
  }

  GAME_STATE.secondsSinceLastEvent = (GAME_STATE.secondsSinceLastEvent || 0) + 1;
  if (GAME_STATE.secondsSinceLastEvent >= 45) {
    GAME_STATE.secondsSinceLastEvent = 0;
    if (Math.random() < 0.15) {
      triggerLiveEvent();
    }
  }
}

function triggerLiveEvent() {
  const ownedProperties = GAME_STATE.properties.filter(p => p.count > 0);
  const totalOwnedCount = GAME_STATE.properties.reduce((acc, p) => acc + p.count, 0);
  
  if (totalOwnedCount === 0) return; // No properties owned, skip events
  
  const eventId = Math.floor(Math.random() * 5);
  
  if (eventId === 0) {
    const randomProp = ownedProperties[Math.floor(Math.random() * ownedProperties.length)];
    const repairCost = 30000;
    
    addLog(`[KİRACI BİLDİRİMİ] "${randomProp.name}" mülkünüzün ana su borusu patladı! Kiracılar acil tamirat istiyor.`, "warning");
    sound.playAlert();
    
    if (ensureTRYBalance(repairCost)) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - repairCost).toFixed(2));
      addLog(`[ACİL TAMİRAT] Tesisatçı çağrıldı ve masraflar ödendi: -${formatTRY(repairCost)}. Kiracılar memnun.`, "success");
      sound.playSuccess();
    } else {
      GAME_STATE.tenantStrike = 30; // 30 seconds strike
      addLog(`[UYARI] Tesisat masraflarını karşılayacak nakit bulunamadı! Kiracılar boykot kararı aldı ve kira ödemelerini durdurdu (%75 kira kesintisi devrede, 30sn).`, "error");
      sound.playError();
    }
  } 
  else if (eventId === 1) {
    const randomProp = ownedProperties[Math.floor(Math.random() * ownedProperties.length)];
    const lawyerFee = 40000;
    addLog(`[KİRACI İHTARNAMESİ] "${randomProp.name}" kiracınız, fahiş kira zammı iddiasıyla Sulh Hukuk Mahkemesi'ne dava açtı.`, "error");
    sound.playAlert();
    
    if (ensureTRYBalance(lawyerFee)) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - lawyerFee).toFixed(2));
      addLog(`[MAHKEME MASRAFI] Avukat tutuldu ve mahkeme harçları yatırıldı: -${formatTRY(lawyerFee)}. İtiraz davası sürüyor.`, "warning");
    } else {
      endGame("seizure"); // Insolvency under legal liabilities
    }
  } 
  else if (eventId === 2) {
    const auditFine = 60000;
    addLog(`[GELİR İDARESİ BAŞKANLIĞI] Kira tahsilatlarının kayıtsız IBAN transferleriyle yapıldığı tespit edildi!`, "error");
    sound.playAlert();
    
    if (ensureTRYBalance(auditFine)) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - auditFine).toFixed(2));
      addLog(`[VERGİ CEZASI] Usulsüzlük ve vergi ziyaı cezası mükellef hesabından re'sen tahsil edilmiştir: -${formatTRY(auditFine)}.`, "error");
      sound.playError();
    } else {
      endGame("seizure");
    }
  } 
  else if (eventId === 3) {
    const randomProp = ownedProperties[Math.floor(Math.random() * ownedProperties.length)];
    const cleaningCost = 25000;
    addLog(`[KADIKÖY EMLAK KRİZİ] "${randomProp.name}" kiracınız son kiraları ödemeden ve evi tahrip ederek gece yarısı kaçtı!`, "warning");
    sound.playAlert();
    
    if (ensureTRYBalance(cleaningCost)) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - cleaningCost).toFixed(2));
      addLog(`[TAHLİYE MASRAFI] Çilingir ve temizlik masrafları ödendi: -${formatTRY(cleaningCost)}. Yeni kiracı ilanı verildi.`, "success");
    } else {
      addLog(`[BÜROKRASİ ENGELLİ] Temizlik masrafları ödenemediği için mülk 20 saniye boş kalacaktır.`, "error");
    }
  } 
  else if (eventId === 4) {
    const daskPremium = 15000 * totalOwnedCount;
    addLog(`[DASK POLİÇE TAHAKKUKU] Sahip olduğunuz ${totalOwnedCount} gayrimenkul için Zorunlu Deprem Sigortası primleri kesildi.`, "info");
    sound.playAlert();
    
    if (ensureTRYBalance(daskPremium)) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - daskPremium).toFixed(2));
      addLog(`[SİGORTA ÖDEMESİ] DASK sigorta primleri re'sen tahsil edildi: -${formatTRY(daskPremium)}.`, "success");
    } else {
      endGame("seizure");
    }
  }
}

function updateLiveKFE() {
  if (typeof GAME_STATE.prevUsdTry === 'undefined') {
    GAME_STATE.prevUsdTry = GAME_STATE.usdTry;
  }
  
  let kfeDrift = 0.00004; // baseline positive drift (inflation)
  
  // 1. USD/TRY impact (Turkish housing tracks USD/TRY)
  const usdTryChange = (GAME_STATE.usdTry - GAME_STATE.prevUsdTry) / GAME_STATE.prevUsdTry;
  if (usdTryChange > 0) {
    kfeDrift += usdTryChange * 0.70; // adjust prices up instantly
  } else if (usdTryChange < 0) {
    kfeDrift += usdTryChange * 0.10; // sticky downwards
  }
  GAME_STATE.prevUsdTry = GAME_STATE.usdTry;
  
  // 2. BIST capital rotation impact
  let totalBistChange = 0;
  let bistCount = 0;
  const bistTickers = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'];
  bistTickers.forEach(t => {
    totalBistChange += GAME_STATE.stocks[t].change;
    bistCount++;
  });
  const avgBistChange = totalBistChange / bistCount;
  
  if (avgBistChange > 1.5) {
    kfeDrift -= 0.00005; // BIST rally cools housing slightly
  } else if (avgBistChange < -1.5) {
    kfeDrift += 0.0001; // BIST crash drives capital to safe-haven housing
  }
  
  // 3. TCMB Interest Rate impact
  const tcmbImpact = (40 - GAME_STATE.tcmbRate) * 0.000005;
  kfeDrift += tcmbImpact;
  
  // 4. Random noise (market micro-fluctuations)
  const noise = (Math.random() - 0.49) * 0.00005;
  kfeDrift += noise;
  
  // Update KFE Index
  const lastKfe = GAME_STATE.kfeIndex;
  GAME_STATE.kfeIndex = parseFloat((GAME_STATE.kfeIndex * (1 + kfeDrift)).toFixed(6));
  if (GAME_STATE.kfeIndex < 0.5) GAME_STATE.kfeIndex = 0.5;
  
  GAME_STATE.kfeChange = ((GAME_STATE.kfeIndex - lastKfe) / lastKfe) * 100;
  
  // Scale properties prices & yields in real-time
  GAME_STATE.properties.forEach((p, idx) => {
    p.cost = Math.round(basePropCosts[idx] * GAME_STATE.kfeIndex);
    p.yield = Math.round(basePropYields[idx] * GAME_STATE.kfeIndex);
  });
}

function shareScore(outcome) {
  const netWorthUSD = getNetWorthUSD();
  const formattedWealth = netWorthUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = GAME_STATE.day;
  const gameUrl = window.location.href;
  
  let text = "";
  if (outcome === 'win') {
    text = `⚖️ Amcamın vasiyet ettiği 1.000.000 USD sermayeyi, rüşvetçi tapu memurlarına ve enflasyon canavarına yedirmeden tam $${formattedWealth} yaptım! Mahkeme miras hakkımı tescilledi, artık Kadıköy'de butik otel sahibiyim. Tokatla enflasyonu: ${gameUrl} #MirasOyunu #BIST100`;
  } else if (outcome === 'bankruptcy') {
    text = `💸 BIST'te kaldıraç açıp, amcamın 1.000.000 Dolarını batırdım! Gün ${day}'de iflas bayrağını çektim, haciz memurları kapıda. Sicilim sıfırlandı, artık ben de bir küçük esnafım. Benden daha kötü batan var mı? ${gameUrl} #MirasOyunu #BorsadaBatanlar`;
  } else if (outcome === 'seizure') {
    text = `🐢 365 gün boyunca amcamın mirasını faizde yatırıp koruduğumu sandım ama Türkiye enflasyonu beni yuttu! $${formattedWealth} servetim olmasına rağmen reelde eridiğim için devlet tüm varlıklarıma el koydu. Enflasyon lobisi kazandı. ${gameUrl} #MirasOyunu #EnflasyonCanavarı`;
  }
  
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(twitterUrl, '_blank');
}

// ==========================================
// 8. SIMULATION INTERVALS AND LOOPS
// ==========================================
function initOnboarding() {
  sound.init();
  const onboarding = document.getElementById("onboarding-screen");
  onboarding.classList.remove("hidden", "pointer-events-none");
  onboarding.offsetHeight; // force layout reflow
  onboarding.classList.remove("opacity-0");
  onboarding.classList.add("opacity-100");
  
  const courtTextDiv = document.getElementById("court-text");
  const acceptContainer = document.getElementById("accept-container");
  
  const courtTextContent = `T.C. İSTANBUL 4. SULH HUKUK MAHKEMESİ
ESAS NO: 2026/4102 Esas
KARAR NO: 2026/894 Karar

MURİS: Mümtaz Mirasyedi (Vefat: 12/01/2026)
VARİS: Vasiyet Alacaklısı (Oyuncu)
KONU: Tenfiz ve Vasiyet Şartnamesinin İfası Tebliği

GEREĞİ DÜŞÜNÜLDÜ:
Muris Mümtaz Mirasyedi'nin terekesinden varise tefrik edilen 1.000.000 USD (Bir Milyon Amerikan Doları) tutarındaki nakit sermayenin, Türkiye Cumhuriyeti'nin yüksek oynaklığa sahip makroekonomik koşullarında 365 gün boyunca işletilmesine;

1- Varisin bu süre zarfında Borsa İstanbul (BIST), Vadeli Mevduat, Gayrimenkul Yatırımları ve Yazılım Startup'ı (Tech Agent) dahil olmak üzere tüm yatırım araçlarını serbestçe kullanmasına,
2- Kümülatif enflasyon eşiği altında kalan her türlü yatırım modelinde vasiyet şartlarının ihlal edilmiş sayılacağına ve tüm aktiflerin Hazine'ye irat kaydedileceğine,
3- Otomatik kur dönüşümleri ve tapu devirlerinde cari kanuni harç ve rüşvet rüsumatlarının uygulanmasına,

İstinaf yolu kapalı olmak üzere kesin olarak karar verilmiştir.
Mirasçı, aşağıdaki butona tıklayarak vasiyet yükümlülüklerini resmen kabul etmiş sayılacaktır.`;

  let index = 0;
  courtTextDiv.textContent = "";
  acceptContainer.classList.remove("opacity-100");
  acceptContainer.classList.add("opacity-0");

  function typeWriter() {
    if (index < courtTextContent.length) {
      courtTextDiv.textContent += courtTextContent.charAt(index);
      index++;
      if (index % 2 === 0) {
        sound.playTypewriter();
      }
      setTimeout(typeWriter, 15);
    } else {
      acceptContainer.classList.remove("opacity-0");
      acceptContainer.classList.add("opacity-100");
    }
  }

  // Start typing after a short delay to allow screen fade-in
  setTimeout(typeWriter, 500);

  document.getElementById("accept-campaign-btn").addEventListener("click", () => {
    sound.playSuccess();
    startSimulation('campaign');
  }, { once: true });

  document.getElementById("accept-live-btn").addEventListener("click", () => {
    sound.playSuccess();
    startSimulation('live');
  }, { once: true });

  document.getElementById("accept-crisis2001-btn").addEventListener("click", () => {
    sound.playSuccess();
    startSimulation('crisis2001');
  }, { once: true });

  document.getElementById("accept-shock2018-btn").addEventListener("click", () => {
    sound.playSuccess();
    startSimulation('shock2018');
  }, { once: true });
}

function startSimulation(mode = 'campaign') {
  sound.init();
  GAME_STATE.mode = mode;
  
  const onboarding = document.getElementById("onboarding-screen");
  onboarding.classList.add("opacity-0");
  setTimeout(() => {
    onboarding.style.display = "none";
    const terminal = document.getElementById("terminal-screen");
    terminal.classList.remove("hidden");
    terminal.offsetHeight;
    terminal.classList.add("opacity-100");
  }, 1000);

  GAME_STATE.gameActive = true;
  
  if (mode === 'live') {
    GAME_STATE.totalDays = 90;
    const week51Data = MACRO_DATABASE[51];
    GAME_STATE.usdTry = week51Data.usdTry;
    GAME_STATE.tcmbRate = week51Data.tcmbRate;
    GAME_STATE.kfeIndex = week51Data.kfeIndex;
    GAME_STATE.cash = 1000000.00;
    GAME_STATE.tryCash = 0.00;
    GAME_STATE.inflationThreshold = 1000000.00;
    GAME_STATE.inflationRateDaily = 0.0001;
    
    GAME_STATE.prevUsdTry = week51Data.usdTry;
    GAME_STATE.kfeChange = 0.0;
    
    Object.keys(GAME_STATE.stocks).forEach(ticker => {
      if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
        const s = GAME_STATE.stocks[ticker];
        s.basePrice = week51Data.stockPrices[ticker];
        s.price = week51Data.stockPrices[ticker];
        s.history = Array(50).fill(week51Data.stockPrices[ticker]);
      }
    });

    addLog("[BAĞLANTI] Canlı seans akışı başlatılıyor...", "info");
    if (navigator.onLine) {
      setLiveStatus('sync');
      setTimeout(() => {
        if (navigator.onLine && GAME_STATE.mode === 'live') {
          setLiveStatus('live');
          addLog("[BAĞLANTI] Canlı seans bağlantısı kuruldu. Binance ve Döviz API'leri aktif.", "success");
          fetchLivePrices();
          fetchUSDTRY();
          fetchLiveBistPrices();
        }
      }, 1500);
    } else {
      setLiveStatus('local');
      addLog("[UYARI] İnternet bağlantısı yok! Yerel simülasyon moduna geçildi.", "warning");
    }
    
    // Periodically fetch live prices (Binance and local BIST server)
    GAME_STATE.liveInterval = setInterval(() => {
      fetchLivePrices();
      fetchLiveBistPrices();
    }, 3000);
    
    // Periodically fetch USD/TRY
    GAME_STATE.liveFxInterval = setInterval(() => {
      fetchUSDTRY();
    }, 20000);

    // Fetch live news initially and periodically
    fetchLiveNews();
    GAME_STATE.liveNewsInterval = setInterval(() => {
      fetchLiveNews();
    }, 30000);
    addLog("Miras vasiyeti onaylandı. $1,000,000 USD fonu teslim alındı.", "success");
  } else if (mode === 'crisis2001') {
    GAME_STATE.cash = 100000.00;
    GAME_STATE.tryCash = 5000000.00;
    GAME_STATE.totalDays = 30;
    GAME_STATE.inflationThreshold = 100000.00;
    GAME_STATE.inflationRateDaily = 0.0061;
    GAME_STATE.usdTry = 0.68;
    GAME_STATE.tcmbRate = 120.0;
    GAME_STATE.kfeIndex = 1.0;
    
    const multiplier = 0.003;
    Object.keys(GAME_STATE.stocks).forEach(ticker => {
      const s = GAME_STATE.stocks[ticker];
      if (ticker === 'ALTIN') {
        s.basePrice = 8.5;
      } else if (ticker === 'BTC' || ticker === 'ETH' || ticker === 'SOL') {
        s.basePrice = 0.0;
      } else {
        s.basePrice = parseFloat((TICKER_INFO[ticker].base * multiplier).toFixed(2));
      }
      s.price = s.basePrice;
      s.history = Array(50).fill(s.basePrice);
    });

    setLiveStatus('local');
    addLog("[2001 KRİZİ] Kriz simülasyonu başladı! Matrah ve döviz büroları alarma geçti.", "error");
    addLog("Miras vasiyeti onaylandı. $100,000 USD ve ₺5,000,000 TRY fonları teslim alındı.", "success");
  } else if (mode === 'shock2018') {
    GAME_STATE.cash = 500000.00;
    GAME_STATE.tryCash = 1000000.00;
    GAME_STATE.totalDays = 45;
    GAME_STATE.inflationThreshold = 500000.00;
    GAME_STATE.inflationRateDaily = 0.0013;
    GAME_STATE.usdTry = 4.80;
    GAME_STATE.tcmbRate = 17.75;
    GAME_STATE.kfeIndex = 1.0;
    
    const multiplier = 0.08;
    Object.keys(GAME_STATE.stocks).forEach(ticker => {
      const s = GAME_STATE.stocks[ticker];
      if (ticker === 'ALTIN') {
        s.basePrice = 180.0;
      } else if (ticker === 'BTC') {
        s.basePrice = 6500.0;
      } else if (ticker === 'ETH') {
        s.basePrice = 450.0;
      } else if (ticker === 'SOL') {
        s.basePrice = 0.0;
      } else {
        s.basePrice = parseFloat((TICKER_INFO[ticker].base * multiplier).toFixed(2));
      }
      s.price = s.basePrice;
      s.history = Array(50).fill(s.basePrice);
    });

    setLiveStatus('local');
    addLog("[2018 KUR ŞOKU] Brunson krizi senaryosu başladı. Dolar sepetini doğru yönetin.", "warning");
    addLog("Miras vasiyeti onaylandı. $500,000 USD ve ₺1,000,000 TRY fonları teslim alındı.", "success");
  } else {
    GAME_STATE.cash = 1000000.00;
    GAME_STATE.tryCash = 0.00;
    GAME_STATE.totalDays = 365;
    GAME_STATE.inflationThreshold = 1000000.00;
    GAME_STATE.inflationRateDaily = 0.0001;
    
    const week0Data = MACRO_DATABASE[0];
    GAME_STATE.usdTry = week0Data.usdTry;
    GAME_STATE.tcmbRate = week0Data.tcmbRate;
    GAME_STATE.kfeIndex = week0Data.kfeIndex;
    
    Object.keys(GAME_STATE.stocks).forEach(ticker => {
      const s = GAME_STATE.stocks[ticker];
      s.basePrice = week0Data.stockPrices[ticker];
      s.price = week0Data.stockPrices[ticker];
      s.history = Array(50).fill(week0Data.stockPrices[ticker]);
    });

    setLiveStatus('local');
    addLog("Vasiyet seferi başladı. Yerel makroekonomik veri seti devrede.", "info");
    addLog("Miras vasiyeti onaylandı. $1,000,000 USD fonu teslim alındı.", "success");
  }

  addLog("Merkez Bankası, TÜİK ve Gelir İdaresi takibi devrede.", "info");

  // A. 1-Second Cash Flow and Auto-trading Loop
  GAME_STATE.gameInterval = setInterval(() => {
    // USD Flow (Tech Agent + Eurobonds)
    let techYieldUSD = 0;
    if (GAME_STATE.techAgent.active) {
      techYieldUSD += GAME_STATE.techAgent.yield;
      GAME_STATE.techAgent.upgrades.forEach(u => {
        if (u.purchased) techYieldUSD += u.yield;
      });
    }
    const eurobondsCount = GAME_STATE.stocks.EUROBOND.held;
    const eurobondYieldUSD = (eurobondsCount * 1000 * 0.07 / 365) / 2;
    const totalUSDYield = techYieldUSD + eurobondYieldUSD;
    if (totalUSDYield > 0) {
      GAME_STATE.cash = parseFloat((GAME_STATE.cash + totalUSDYield).toFixed(2));
    }
    
    // TRY Flow (Properties rents adjusted by pricing policies, upgrades, and tenant strikes)
    let propYieldTRY = 0;
    const strikePenalty = (GAME_STATE.tenantStrike && GAME_STATE.tenantStrike > 0) ? 0.25 : 1.0;
    
    GAME_STATE.properties.forEach((p, idx) => {
      let multiplier = 1.0;
      if (GAME_STATE.businessUpgrades[idx]) {
        if (GAME_STATE.businessUpgrades[idx][0]) multiplier += 0.25;
        if (GAME_STATE.businessUpgrades[idx][1]) multiplier += 0.10;
      }
      
      let policyFactor = 1.0;
      if (GAME_STATE.businessPolicies[idx]) {
        const policy = GAME_STATE.businessPolicies[idx];
        if (policy === "low") policyFactor = 0.95 * 0.8;
        else if (policy === "normal") policyFactor = 0.70 * 1.0;
        else if (policy === "high") policyFactor = 0.45 * 2.0; // Profit factor is 2.0 but low occupancy
      }
      
      propYieldTRY += p.count * p.yield * multiplier * policyFactor * strikePenalty;
    });
    
    if (propYieldTRY > 0) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + propYieldTRY).toFixed(2));
      GAME_STATE.accumulatedRentTRY += propYieldTRY;
    }

    // Tefeci Cafer loan timer ticks
    if (GAME_STATE.loanSharkDebt > 0) {
      GAME_STATE.loanSharkTimer--;
      GAME_STATE.loanSharkInterestTimer--;
      
      if (GAME_STATE.loanSharkInterestTimer <= 0) {
        // Compound 5% interest
        GAME_STATE.loanSharkDebt = parseFloat((GAME_STATE.loanSharkDebt * 1.05).toFixed(2));
        GAME_STATE.loanSharkInterestTimer = 10;
        addLog(`[TEFECİ FAİZİ] %5 faiz eklendi. Güncel borç: ₺${Math.ceil(GAME_STATE.loanSharkDebt).toLocaleString('tr-TR')}`, "warning");
        sound.playError();
      }
      
      if (GAME_STATE.loanSharkTimer <= 0) {
        // Foreclosure!
        const ownedProps = GAME_STATE.properties.filter(p => p.count > 0);
        if (ownedProps.length > 0) {
          const prop = ownedProps[Math.floor(Math.random() * ownedProps.length)];
          prop.count--;
          addLog(`[TEFECİ HACZİ] 🚨 Cafer'in adamları vadesi dolan borç sebebiyle "${prop.name}" mülkünüze re'sen el koydu! Borç sıfırlandı.`, "error");
        } else {
          // No properties, seize tryCash and USD cash up to debt val
          const trySeized = GAME_STATE.tryCash;
          const remainingDebtTRY = GAME_STATE.loanSharkDebt - trySeized;
          GAME_STATE.tryCash = 0;
          
          let usdSeized = 0;
          if (remainingDebtTRY > 0) {
            usdSeized = Math.min(GAME_STATE.cash, remainingDebtTRY / GAME_STATE.usdTry);
            GAME_STATE.cash = parseFloat((GAME_STATE.cash - usdSeized).toFixed(2));
          }
          addLog(`[TEFECİ HACZİ] 🚨 Cafer'in adamları mülk bulamadığı için kasanızdaki ₺${trySeized.toLocaleString('tr-TR')} nakit Liraya ve ${formatUSD(usdSeized)} nakit Dolara el koyarak borcu kapattı!`, "error");
        }
        GAME_STATE.loanSharkDebt = 0;
        GAME_STATE.loanSharkTimer = 0;
        GAME_STATE.loanSharkInterestTimer = 0;
        sound.playError();
      }
    }

    // Leverage Margin Call timer ticks
    Object.keys(GAME_STATE.stocks).forEach(ticker => {
      const s = GAME_STATE.stocks[ticker];
      if (s.held > 0 && s.leverage > 1 && s.marginCallActive) {
        s.marginCallTimer--;
        if (s.marginCallTimer <= 0) {
          // LIQUIDATE!
          const clickPrice = s.price;
          const grossVal = s.held * clickPrice;
          const penalty = grossVal * 0.05;
          const netPayout = grossVal - s.borrowed - penalty;
          
          if (s.currency === "USD") {
            GAME_STATE.cash = parseFloat((GAME_STATE.cash + netPayout).toFixed(2));
          } else {
            GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + netPayout).toFixed(2));
          }
          
          addLog(`[LİKİDASYON] 🚨 ${ticker} kaldıraçlı pozisyonunuz margin call süresi (10sn) bittiği için re'sen tasfiye edilmiştir. Ceza: ${s.currency === "USD" ? formatUSD(penalty) : formatTRY(penalty)}.`, "error");
          
          s.held = 0;
          s.avgCost = 0;
          s.borrowed = 0;
          s.marginPaid = 0;
          s.leverage = 1;
          s.marginCallActive = false;
          s.marginCallTimer = 0;
          
          sound.playError();
        }
      }
    });

    if (GAME_STATE.techAgent.autoTrade) {
      runAutoTradingAI();
    }

    if (GAME_STATE.mode === 'live') {
      updateLiveKFE();
      updateLiveListings();
      updateLiveEvents();
    }

    updateUI();
    checkGameOver();
  }, 1000);

  // B. Day Tick Loop (Macros, Inflation, Tapu Decrement, Tax Audits)
  const dayTickDelay = (mode === 'live') ? 10000 : 2000;
  GAME_STATE.dayInterval = setInterval(() => {
    GAME_STATE.day++;
    GAME_STATE.daysSinceLastTaxAudit++;
    
    GAME_STATE.inflationThreshold = parseFloat((GAME_STATE.inflationThreshold * (1 + GAME_STATE.inflationRateDaily)).toFixed(2));
    
    // Bank deposit interest compounding daily with 7.5% stopaj vergi deduction
    if (GAME_STATE.bankBalance > 0) {
      const dailyInterestGross = (GAME_STATE.bankBalance * (GAME_STATE.tcmbRate / 100)) / 365;
      const stopajTax = dailyInterestGross * 0.075; // 7.5% stopaj tax
      const dailyInterestNet = dailyInterestGross - stopajTax;
      
      GAME_STATE.bankBalance = parseFloat((GAME_STATE.bankBalance + dailyInterestNet).toFixed(2));
      GAME_STATE.accumulatedInterest += dailyInterestNet;
      
      if (GAME_STATE.day % 10 === 0) {
        addLog(`Son 10 günün net mevduat faizi yatırıldı (%7.5 stopaj kesildi): +${formatTRY(GAME_STATE.accumulatedInterest)}`, "success");
        GAME_STATE.accumulatedInterest = 0;
      }
    }

    // Fırsatçı (high) pricing policy penalty check: 3% daily chance of customer audit fines
    for (let idx of [3, 5]) {
      if (GAME_STATE.properties[idx].count > 0 && GAME_STATE.businessPolicies[idx] === "high") {
        if (Math.random() < 0.03) {
          const fineTRY = idx === 3 ? 100000 : 350000;
          if (ensureTRYBalance(fineTRY)) {
            GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - fineTRY).toFixed(2));
            sound.playError();
            addLog(`[BELEDİYE ENCÜMEN KARARI] Fiyat Denetim Ekiplerince ${GAME_STATE.properties[idx].name} adresinde yapılan kontrolde Tüketici Kanunu'na muhalefet saptanmış ve encümen kararıyla -${formatTRY(fineTRY)} idari para cezası tebliğ edilmiştir.`, "error");
          }
        }
      }
    }

    // TÜİK audit check (5% daily chance if TÜİK matrah selected)
    if (GAME_STATE.taxReportingMode === 'tuik' && GAME_STATE.taxEvadedAccumulated > 0) {
      if (Math.random() < 0.05) {
        const fineTRY = 150000 + GAME_STATE.taxEvadedAccumulated * 1.4;
        GAME_STATE.taxEvadedAccumulated = 0; // reset
        
        sound.playError();
        addLog(`[VERGİ DENETİMİ] 🚨 Maliye Bakanlığı denetmenleri geriye dönük incelemede TÜİK beyanlarınızın gerçeği yansıtmadığını saptadı! Usulsüzlük cezası ve gecikme faizi kesildi: -${formatTRY(fineTRY)}`, "error");
        
        if (!ensureTRYBalance(fineTRY)) {
          endGame("seizure");
          return;
        }
        GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - fineTRY).toFixed(2));
      }
    }

    // 50-Day progressive Rent Income Tax Beyannamesi (Gelir Vergisi)
    if (GAME_STATE.daysSinceLastTaxAudit >= 50) {
      GAME_STATE.daysSinceLastTaxAudit = 0;
      const rents = GAME_STATE.accumulatedRentTRY;
      GAME_STATE.accumulatedRentTRY = 0;
      
      if (rents > 100000) {
        // Calculate progressive income tax based on honest vs reported rents
        let honestTax = 0;
        if (rents <= 250000) honestTax = rents * 0.15;
        else if (rents <= 500000) honestTax = (250000 * 0.15) + (rents - 250000) * 0.20;
        else honestTax = (250000 * 0.15) + (250000 * 0.20) + (rents - 500000) * 0.30;
        
        let reportedRents = rents;
        if (GAME_STATE.taxReportingMode === 'tuik') {
          reportedRents = rents * 0.40;
        }
        
        let taxTRY = 0;
        if (reportedRents <= 250000) taxTRY = reportedRents * 0.15;
        else if (reportedRents <= 500000) taxTRY = (250000 * 0.15) + (reportedRents - 250000) * 0.20;
        else taxTRY = (250000 * 0.15) + (250000 * 0.20) + (reportedRents - 500000) * 0.30;
        
        if (GAME_STATE.taxReportingMode === 'tuik') {
          GAME_STATE.taxEvadedAccumulated += (honestTax - taxTRY);
          addLog(`[TÜİK MATRAH BEYANI] Gayrimenkul irat matrahı TÜİK endeksiyle %60 indirgenerek ₺${reportedRents.toLocaleString('tr-TR')} olarak beyan edilmiş ve ₺${taxTRY.toLocaleString('tr-TR')} vergi tahakkuk ettirilmiştir. Ceza riski devrededir.`, "warning");
        } else {
          addLog(`[ENAG MATRAH BEYANI] Şeffaf ENAG endeksiyle gayrimenkul irat matrahı ₺${reportedRents.toLocaleString('tr-TR')} olarak dürüst beyan edilmiş ve ₺${taxTRY.toLocaleString('tr-TR')} gelir vergisi tahakkuk ettirilmiştir.`, "info");
        }
        
        sound.playAlert();
        
        if (!ensureTRYBalance(taxTRY)) {
          // Total insolvency under tax liabilities
          endGame("seizure");
          return;
        }
        GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - taxTRY).toFixed(2));
        addLog(`[VERGİ DAİRESİ TAHSİLATI] Tahakkuk eden vergi borcu mükellef kasasından re'sen tahsil edilmiştir: -${formatTRY(taxTRY)}.`, "success");
      }
    }

    // Bureaucracy tick for Tapu
    if (GAME_STATE.pendingTapu.length > 0) {
      GAME_STATE.pendingTapu.forEach(order => {
        order.daysRemaining--;
        if (order.daysRemaining === 0) {
          GAME_STATE.properties[order.propIndex].count++;
          addLog(`[TAPU TESCİLİ] Bürokrasi ve imar incelemeleri nihayete ermiş olup, ${order.name} mülkiyeti Kat Mülkiyeti Kanunu uyarınca adınıza resmen tescil edilmiştir.`, "success");
          sound.playSuccess();
        }
      });
      GAME_STATE.pendingTapu = GAME_STATE.pendingTapu.filter(order => order.daysRemaining > 0);
    }

    // Live mode election cycle checks
    if (GAME_STATE.mode === 'live') {
      if (GAME_STATE.day >= 35 && GAME_STATE.day <= 55) {
        GAME_STATE.tcmbRate = 25.00;
        GAME_STATE.inflationRateDaily = 0.0002;
        
        // Pump BIST stocks basePrice by 2% daily
        Object.keys(GAME_STATE.stocks).forEach(ticker => {
          const isBist = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
          if (isBist) {
            const s = GAME_STATE.stocks[ticker];
            s.basePrice = parseFloat((s.basePrice * 1.02).toFixed(2));
          }
        });
      } else if (GAME_STATE.day === 56) {
        if (!GAME_STATE.electionShockApplied) {
          GAME_STATE.electionShockApplied = true;
          GAME_STATE.inflationRateDaily = 0.0001;
          
          GAME_STATE.usdTry = parseFloat((GAME_STATE.usdTry * 1.25).toFixed(4));
          GAME_STATE.tcmbRate = 55.00;
          
          Object.keys(GAME_STATE.stocks).forEach(ticker => {
            const isBist = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
            if (isBist) {
              const s = GAME_STATE.stocks[ticker];
              s.basePrice = parseFloat((s.basePrice * 0.85).toFixed(2));
              s.price = s.basePrice;
            }
          });
          
          document.getElementById("news-title").textContent = "SEÇİM SONRASI EKONOMİK ACI REÇETE DEVREDE!";
          document.getElementById("news-body").textContent = "Baskılanan dolar kuru serbest bırakıldı, kur %25 patlayarak ₺" + GAME_STATE.usdTry.toFixed(2) + " seviyesine fırladı! TCMB politika faizini şok kararla %55'e çıkardı. BIST devre kesti!";
          document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
          
          sound.playAlert();
          addLog("[SEÇİM SONRASI ŞOK] 🚨 Acı reçete devrede! Kur %25 fırladı, faizler %55 oldu, borsa çöktü!", "error");
        }
      } else if (GAME_STATE.day > 56) {
        GAME_STATE.tcmbRate = 55.00;
      }
    }

    // Fetch weekly macro parameters for LERP or Live Mode drift
    if (GAME_STATE.mode === 'campaign') {
      const progressWeeks = (GAME_STATE.day - 1) / 7;
      const w0 = Math.min(51, Math.floor(progressWeeks));
      const w1 = Math.min(51, w0 + 1);
      const frac = w0 === 51 ? 0 : progressWeeks - w0;
      
      const weeklyData0 = MACRO_DATABASE[w0];
      const weeklyData1 = MACRO_DATABASE[w1];
      
      const baseUsdTry = (weeklyData0.usdTry * (1 - frac) + weeklyData1.usdTry * frac);
      const baseTcmbRate = (weeklyData0.tcmbRate * (1 - frac) + weeklyData1.tcmbRate * frac);
      
      if (GAME_STATE.day >= 35 && GAME_STATE.day <= 55) {
        GAME_STATE.tcmbRate = 25.00;
        GAME_STATE.inflationRateDaily = 0.0002;
        if (!GAME_STATE.usdTryLockValue) {
          GAME_STATE.usdTryLockValue = GAME_STATE.usdTry;
        }
        GAME_STATE.usdTry = GAME_STATE.usdTryLockValue;
        
        // Pump BIST stocks basePrice by 2% daily
        Object.keys(GAME_STATE.stocks).forEach(ticker => {
          const isBist = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
          if (isBist) {
            const s = GAME_STATE.stocks[ticker];
            s.basePrice = parseFloat((s.basePrice * 1.02).toFixed(2));
          }
        });
      } else if (GAME_STATE.day === 56) {
        if (!GAME_STATE.electionShockApplied) {
          GAME_STATE.electionShockApplied = true;
          GAME_STATE.inflationRateDaily = 0.0001;
          
          const oldRate = GAME_STATE.usdTryLockValue || GAME_STATE.usdTry;
          GAME_STATE.usdTry = parseFloat((oldRate * 1.25).toFixed(4));
          GAME_STATE.tcmbRate = 55.00;
          
          Object.keys(GAME_STATE.stocks).forEach(ticker => {
            const isBist = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
            if (isBist) {
              const s = GAME_STATE.stocks[ticker];
              s.basePrice = parseFloat((s.basePrice * 0.85).toFixed(2));
              s.price = s.basePrice;
            }
          });
          
          document.getElementById("news-title").textContent = "SEÇİM SONRASI EKONOMİK ACI REÇETE DEVREDE!";
          document.getElementById("news-body").textContent = "Baskılanan dolar kuru serbest bırakıldı, kur %25 patlayarak ₺" + GAME_STATE.usdTry.toFixed(2) + " seviyesine fırladı! TCMB politika faizini şok kararla %55'e çıkardı. BIST devre kesti!";
          document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
          
          sound.playAlert();
          addLog("[SEÇİM SONRASI ŞOK] 🚨 Acı reçete devrede! Kur %25 fırladı, faizler %55 oldu, borsa çöktü!", "error");
        }
      } else if (GAME_STATE.day > 56) {
        GAME_STATE.usdTry = parseFloat((baseUsdTry * 1.25).toFixed(4));
        GAME_STATE.tcmbRate = 55.00;
      } else {
        GAME_STATE.usdTry = parseFloat(baseUsdTry.toFixed(4));
        GAME_STATE.tcmbRate = parseFloat(baseTcmbRate.toFixed(2));
      }
      
      GAME_STATE.kfeIndex = parseFloat((weeklyData0.kfeIndex * (1 - frac) + weeklyData1.kfeIndex * frac).toFixed(4));
      
      // Scale real estate purchase costs and rents dynamically using TCMB KFE index
      GAME_STATE.properties.forEach((p, idx) => {
        p.cost = Math.round(basePropCosts[idx] * GAME_STATE.kfeIndex);
        p.yield = Math.round(basePropYields[idx] * GAME_STATE.kfeIndex);
      });
      
      // Scale BIST basePrices from database, EXCEPT during election period
      if (GAME_STATE.day < 35 || GAME_STATE.day > 56) {
        Object.keys(GAME_STATE.stocks).forEach(ticker => {
          const p0 = weeklyData0.stockPrices[ticker];
          const p1 = weeklyData1.stockPrices[ticker];
          let baseP = p0 * (1 - frac) + p1 * frac;
          if (GAME_STATE.day > 56 && ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker)) {
            baseP = baseP * 0.85; // BIST remains crushed post shock
          }
          GAME_STATE.stocks[ticker].basePrice = parseFloat(baseP.toFixed(2));
        });
      }
      
      if ((GAME_STATE.day - 1) % 7 === 0 && weeklyData0.headline) {
        document.getElementById("news-title").textContent = weeklyData0.headline.title;
        document.getElementById("news-body").textContent = weeklyData0.headline.body;
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog(`HABER AJANSI: ${weeklyData0.headline.title}`, "warning");
      }
    } else if (GAME_STATE.mode === 'crisis2001') {
      // 1. Math Model for 2001 Crisis
      if (GAME_STATE.day === 5) {
        GAME_STATE.usdTry = 1.36;
        GAME_STATE.tcmbRate = 7500.0;
        
        // BIST crashes by 50%
        Object.keys(GAME_STATE.stocks).forEach(ticker => {
          const s = GAME_STATE.stocks[ticker];
          if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
            s.basePrice = parseFloat((s.basePrice * 0.50).toFixed(2));
          }
        });
        
        document.getElementById("news-title").textContent = "ANAYASA KİTAPÇIĞI FIRLATILDI! BÜYÜK BUHRAN!";
        document.getElementById("news-body").textContent = "Çankaya Köşkü'nde Anayasa kitapçığı fırlatıldı! Gecelik faizler %7500'e fırladı. Dolar kuru bir günde iki katına çıktı. Borsa çöktü.";
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog("GELİŞME: Anayasa kitapçığı fırlatıldı! Gecelik faizler %7500, dolar kuru bir günde iki katına çıktı!", "error");
      } else if (GAME_STATE.day === 8) {
        GAME_STATE.tcmbRate = 150.0;
        addLog("GELİŞME: Faizler sakinleşiyor. TCMB gecelik faizleri %150 seviyesinde dengelemeye çalışıyor.", "info");
      }
      
      // USD/TRY slides slowly towards 1.60 by Day 30 after Day 5
      if (GAME_STATE.day > 5) {
        const daysPassed = GAME_STATE.day - 5;
        GAME_STATE.usdTry = parseFloat((1.36 + (daysPassed / 25) * 0.24).toFixed(4));
      } else {
        // Day 1 to 4 drift: 0.68 to 0.70
        GAME_STATE.usdTry = parseFloat((0.68 + (GAME_STATE.day / 5) * 0.02).toFixed(4));
      }
      
      // Bank run risk: 5% chance per day of freezing 30% of bank balance
      if (GAME_STATE.bankBalance > 0 && Math.random() < 0.05) {
        const seized = parseFloat((GAME_STATE.bankBalance * 0.30).toFixed(2));
        GAME_STATE.bankBalance = parseFloat((GAME_STATE.bankBalance - seized).toFixed(2));
        sound.playError();
        addLog(`[TMSF TASFİYE EMİRİ] Mevduat yaptığınız bankanın likidite krizi sebebiyle yönetimine TMSF el koymuştur. Mevduatınızın %30'u (₺${seized.toLocaleString('tr-TR')}) dondurulmuştur!`, "error");
      }
      
      // Real estate drifts up with inflation
      GAME_STATE.kfeIndex = parseFloat((GAME_STATE.kfeIndex * 1.005).toFixed(4));
      GAME_STATE.properties.forEach((p, idx) => {
        p.cost = Math.round(basePropCosts[idx] * 0.003 * GAME_STATE.kfeIndex);
        p.yield = Math.round(basePropYields[idx] * 0.003 * GAME_STATE.kfeIndex);
      });
      
      // Drift stock prices
      Object.keys(GAME_STATE.stocks).forEach(ticker => {
        const s = GAME_STATE.stocks[ticker];
        if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
          const randomWalk = (Math.random() - 0.49) * s.volatility * 2.0;
          s.basePrice = parseFloat((s.basePrice * (1 + randomWalk)).toFixed(2));
        }
      });
    } else if (GAME_STATE.mode === 'shock2018') {
      // 2. Math Model for 2018 Kur Şoku
      if (GAME_STATE.day === 10) {
        GAME_STATE.usdTry = 6.50;
        // BIST crashes by 10%
        Object.keys(GAME_STATE.stocks).forEach(ticker => {
          const s = GAME_STATE.stocks[ticker];
          if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
            s.basePrice = parseFloat((s.basePrice * 0.90).toFixed(2));
          }
        });
        document.getElementById("news-title").textContent = "TRUMP'TAN TÜRKİYE'YE TEHDİT TWEETİ!";
        document.getElementById("news-body").textContent = "Donald Trump: 'Türkiye ile ilişkilerimiz iyi değil. Çelik gümrük vergilerini 2 katına çıkarıyorum, ekonomilerini mahvedeceğim!' Dolar kuru bir günde ₺6.50 oldu.";
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog("TRUMP TWEET: 'Türkiye ekonomisini mahvedeceğim!' Kur ₺6.50!", "error");
      } else if (GAME_STATE.day === 18) {
        GAME_STATE.usdTry = 7.20;
        document.getElementById("news-title").textContent = "TRUMP: 'GÜMRÜK VERGİLERİNİ İKİ KATINA ÇIKARDIM!'";
        document.getElementById("news-body").textContent = "Donald Trump Türkiye aleyhine yeni tweetler atarak kur ataklarını körükledi. Dolar kuru ₺7.20 zirvesini gördü.";
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog("TRUMP TWEET: Trump açıklamaları dolar kurunu ₺7.20 yaptı!", "error");
      } else if (GAME_STATE.day === 25) {
        GAME_STATE.tcmbRate = 24.00;
        GAME_STATE.usdTry = 6.20;
        // BIST rallies by 8%
        Object.keys(GAME_STATE.stocks).forEach(ticker => {
          const s = GAME_STATE.stocks[ticker];
          if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
            s.basePrice = parseFloat((s.basePrice * 1.08).toFixed(2));
          }
        });
        document.getElementById("news-title").textContent = "TCMB'DEN 625 BAZ PUAN FAİZ ARTIRIMI!";
        document.getElementById("news-body").textContent = "Merkez Bankası politika faizini %24.00 seviyesine yükseltti! Kur ₺6.20 seviyesine geri çekildi. Borsa coşkulu.";
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog("TCMB FAİZ ŞOKU: Politika faizi %24.00'e çıkarıldı! Kur ₺6.20'ye bastırıldı.", "success");
      } else if (GAME_STATE.day === 30) {
        GAME_STATE.usdTry = 6.60;
        document.getElementById("news-title").textContent = "BRUNSON DAVASINDA KARAR YAKLAŞIYOR";
        document.getElementById("news-body").textContent = "Rahip Brunson davasında nihai duruşma beklentileriyle piyasada volatilite arttı. Kur ₺6.60 seviyesinde dalgalanıyor.";
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog("GELİŞME: Brunson davasında karar haftası beklentisi kuru ₺6.60 yaptı.", "warning");
      }
      
      // USD/TRY curves
      if (GAME_STATE.day < 10) {
        GAME_STATE.usdTry = parseFloat((4.80 + (GAME_STATE.day / 10) * 0.20).toFixed(4));
      } else if (GAME_STATE.day > 10 && GAME_STATE.day < 18) {
        const days = GAME_STATE.day - 10;
        GAME_STATE.usdTry = parseFloat((6.50 + (days / 8) * 0.30).toFixed(4));
      } else if (GAME_STATE.day > 18 && GAME_STATE.day < 25) {
        const days = GAME_STATE.day - 18;
        GAME_STATE.usdTry = parseFloat((7.20 + (days / 7) * 0.20).toFixed(4));
      } else if (GAME_STATE.day > 25) {
        const days = GAME_STATE.day - 25;
        GAME_STATE.usdTry = parseFloat((6.20 - (days / 20) * 0.20).toFixed(4));
      }
      
      // Real estate index slows down reelde
      GAME_STATE.kfeIndex = parseFloat((GAME_STATE.kfeIndex * 0.998).toFixed(4));
      GAME_STATE.properties.forEach((p, idx) => {
        p.cost = Math.round(basePropCosts[idx] * 0.08 * GAME_STATE.kfeIndex);
        p.yield = Math.round(basePropYields[idx] * 0.08 * GAME_STATE.kfeIndex);
      });
      
      // Drift stock prices
      Object.keys(GAME_STATE.stocks).forEach(ticker => {
        const s = GAME_STATE.stocks[ticker];
        if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
          const randomWalk = (Math.random() - 0.49) * s.volatility * 2.0;
          s.basePrice = parseFloat((s.basePrice * (1 + randomWalk)).toFixed(2));
        }
      });
    } else if (GAME_STATE.mode === 'live') {
      // 1. KFE Index inflation drift and property scaling are now handled in the 1-second gameInterval loop for smooth real-time ticks
      
      // 3. Drift for BIST and ALTIN basePrices
      Object.keys(GAME_STATE.stocks).forEach(ticker => {
        const s = GAME_STATE.stocks[ticker];
        const isBistTicker = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
        if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND') {
          if (isBistTicker && !checkBistOpen()) return; // Skip drift when BIST is closed
          if (GAME_STATE.localServerActive) return; // Skip drift when using live prices from server
          const baseDrift = GAME_STATE.tcmbRate / 100 / 365;
          const randomWalk = (Math.random() - 0.48) * s.volatility * 2.0; // slight positive bias
          const totalDrift = baseDrift + randomWalk;
          s.basePrice = parseFloat((s.basePrice * (1 + totalDrift)).toFixed(2));
        }
      });
      
      // 4. Live Mode Headlines & Interest Rate Shocks
      if (Math.random() < 0.15) {
        const liveHeadlines = [
          { title: "TCMB Olağanüstü Toplantı Kararı", type: "rate_up", body: "Enflasyonla mücadele kapsamında TCMB politika faizini 250 baz puan artırarak sıkı duruşunu güçlendirdi!" },
          { title: "TCMB Faiz İndirimine Gitti!", type: "rate_down", body: "Piyasa beklentilerinin aksine TCMB politika faizini 250 baz puan düşürdü. Banka hisseleri hareketli!" },
          { title: "BIST Devre Kesti!", type: "bist_crash", body: "Küresel borsalardaki satış dalgasıyla Borsa İstanbul'da devre kesici uygulandı, işlemler geçici olarak durduruldu." },
          { title: "JPMorgan Türkiye Raporu", type: "bist_rally", body: "JPMorgan, Türk hisse senetleri için tavsiyesini 'Ağırlık Artır' seviyesine yükseltti. BIST alıcılı açıldı!" },
          { title: "Leylek Konut Vergisi İsyanı", type: "kfe_boom", body: "Maliye Bakanlığı gayrimenkul alım satım harçlarını artırma kararı aldı. KFE konut endeksi fırladı!" },
          { title: "Kuyumcularda Gram Altın İzdihamı", type: "gold_rush", body: "Güvenli liman arayışındaki yerli yatırımcılar kuyumculara akın etti. Gram Altın talebi zirvede." }
        ];
        
        const headline = liveHeadlines[Math.floor(Math.random() * liveHeadlines.length)];
        
        if (headline.type === "rate_up") {
          GAME_STATE.tcmbRate = Math.min(65.0, GAME_STATE.tcmbRate + 2.50);
          Object.keys(GAME_STATE.stocks).forEach(ticker => {
            const s = GAME_STATE.stocks[ticker];
            if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND' && ticker !== 'ALTIN') {
              s.basePrice = parseFloat((s.basePrice * 0.97).toFixed(2));
            }
          });
        } else if (headline.type === "rate_down") {
          GAME_STATE.tcmbRate = Math.max(25.0, GAME_STATE.tcmbRate - 2.50);
          Object.keys(GAME_STATE.stocks).forEach(ticker => {
            const s = GAME_STATE.stocks[ticker];
            if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND' && ticker !== 'ALTIN') {
              s.basePrice = parseFloat((s.basePrice * 1.03).toFixed(2));
            }
          });
        } else if (headline.type === "bist_crash") {
          Object.keys(GAME_STATE.stocks).forEach(ticker => {
            const s = GAME_STATE.stocks[ticker];
            if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND' && ticker !== 'ALTIN') {
              s.basePrice = parseFloat((s.basePrice * 0.94).toFixed(2));
            }
          });
        } else if (headline.type === "bist_rally") {
          Object.keys(GAME_STATE.stocks).forEach(ticker => {
            const s = GAME_STATE.stocks[ticker];
            if (ticker !== 'BTC' && ticker !== 'ETH' && ticker !== 'SOL' && ticker !== 'EUROBOND' && ticker !== 'ALTIN') {
              s.basePrice = parseFloat((s.basePrice * 1.05).toFixed(2));
            }
          });
        } else if (headline.type === "kfe_boom") {
          GAME_STATE.kfeIndex = parseFloat((GAME_STATE.kfeIndex * 1.06).toFixed(4));
        } else if (headline.type === "gold_rush") {
          const gold = GAME_STATE.stocks.ALTIN;
          gold.basePrice = parseFloat((gold.basePrice * 1.04).toFixed(2));
        }
        
        document.getElementById("news-title").textContent = headline.title;
        document.getElementById("news-body").textContent = headline.body;
        document.getElementById("news-badge").className = "text-[9px] text-term-red font-bold uppercase tracking-widest animate-pulse font-mono";
        sound.playAlert();
        addLog(`CANLI HABER: ${headline.title}`, "warning");
      }
    }

    updateUI();
  }, dayTickDelay);

  // C. 0.5-Second Stock Market Tick
  GAME_STATE.stockInterval = setInterval(() => {
    updateStockPrices();
  }, 500);
}

function runAutoTradingAI() {
  const gubrf = GAME_STATE.stocks.GUBRF;
  const history = gubrf.history;
  const len = history.length;
  if (len < 5) return;
  
  const avg = history.slice(len - 5).reduce((a,b) => a+b, 0) / 5;
  if (gubrf.price < avg * 0.96 && GAME_STATE.tryCash > gubrf.price * 10) {
    const buyCapital = GAME_STATE.tryCash * 0.05;
    const qty = Math.floor(buyCapital / gubrf.price);
    if (qty > 0) {
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - qty * gubrf.price).toFixed(2));
      const oldVal = gubrf.held * gubrf.avgCost;
      gubrf.held += qty;
      gubrf.avgCost = (oldVal + qty * gubrf.price) / gubrf.held;
      addLog(`[AI AUTO-TRADE] GUBRF düzeltme seviyesi tespit edildi. ${qty} Adet ALINDI.`, "info");
    }
  } 
  else if (gubrf.held > 0 && gubrf.price > gubrf.avgCost * 1.05) {
    const sellCash = gubrf.held * gubrf.price;
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + sellCash).toFixed(2));
    const profit = sellCash - (gubrf.held * gubrf.avgCost);
    addLog(`[AI AUTO-TRADE] GUBRF kâr satışı yapıldı. ${gubrf.held} Adet SATILDI. Kâr: +${formatTRY(profit)}`, "success");
    gubrf.held = 0;
    gubrf.avgCost = 0;
  }
}

// ==========================================
// 9. GAME OVER AND WIN CONDITIONS
// ==========================================
function checkGameOver() {
  if (!GAME_STATE.gameActive) return;
  const netWorthUSD = getNetWorthUSD();
  
  if (netWorthUSD <= 0 || GAME_STATE.cash < 0 || GAME_STATE.tryCash < -100) {
    endGame("bankruptcy");
    return;
  }
  
  if (GAME_STATE.day >= GAME_STATE.totalDays) {
    if (netWorthUSD >= GAME_STATE.inflationThreshold) {
      endGame("win");
    } else {
      endGame("seizure");
    }
  }
}

function endGame(outcome) {
  GAME_STATE.gameActive = false;
  clearInterval(GAME_STATE.gameInterval);
  clearInterval(GAME_STATE.dayInterval);
  clearInterval(GAME_STATE.stockInterval);
  if (GAME_STATE.liveInterval) clearInterval(GAME_STATE.liveInterval);
  if (GAME_STATE.liveFxInterval) clearInterval(GAME_STATE.liveFxInterval);
  if (GAME_STATE.liveNewsInterval) clearInterval(GAME_STATE.liveNewsInterval);
  
  const netWorthUSD = getNetWorthUSD();
  
  if (outcome === "win") {
    sound.playSuccess();
    document.getElementById("win-inflation-target").textContent = formatUSD(GAME_STATE.inflationThreshold);
    document.getElementById("win-final-wealth").textContent = formatUSD(netWorthUSD);
    const screen = document.getElementById("win-screen");
    screen.classList.remove("pointer-events-none");
    screen.classList.add("opacity-100");
  } 
  else if (outcome === "bankruptcy") {
    sound.playError();
    document.getElementById("bankruptcy-day").textContent = `Gün ${GAME_STATE.day}`;
    const screen = document.getElementById("loss-bankruptcy-screen");
    screen.classList.remove("pointer-events-none");
    screen.classList.add("opacity-100");
  } 
  else if (outcome === "seizure") {
    sound.playError();
    document.getElementById("seizure-inflation-target").textContent = formatUSD(GAME_STATE.inflationThreshold);
    document.getElementById("seizure-final-wealth").textContent = formatUSD(netWorthUSD);
    const screen = document.getElementById("loss-seizure-screen");
    screen.classList.remove("pointer-events-none");
    screen.classList.add("opacity-100");
  }

  // Save score to leaderboard
  setTimeout(() => {
    saveLeaderboardScore(netWorthUSD, outcome);
  }, 1200);
}

// ==========================================
// 9B. LIDERLIK TABLOSU (LEADERBOARD SYSTEM)
// ==========================================
function getLeaderboard() {
  const data = localStorage.getItem('miras_leaderboard');
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveLeaderboardScore(netWorthUSD, status) {
  const name = prompt("Vasiyet davası sonuçlandı! Mükellef adınızı tescil ettiriniz:", "Miraszede");
  if (!name) return;
  
  const scores = getLeaderboard();
  scores.push({
    name: name,
    mode: GAME_STATE.mode,
    day: GAME_STATE.day,
    netWorth: parseFloat(netWorthUSD.toFixed(2)),
    status: status,
    date: new Date().toLocaleDateString('tr-TR')
  });
  
  // Sort by netWorth descending
  scores.sort((a, b) => b.netWorth - a.netWorth);
  
  localStorage.setItem('miras_leaderboard', JSON.stringify(scores));
  displayLeaderboard();
}

function displayLeaderboard() {
  const rowsContainer = document.getElementById("leaderboard-rows");
  if (!rowsContainer) return;
  
  const scores = getLeaderboard();
  if (scores.length === 0) {
    rowsContainer.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500 text-[10px]">Henüz tescillenmiş sicil kaydı bulunmamaktadır.</td></tr>`;
    return;
  }
  
  let html = "";
  scores.forEach((s, idx) => {
    let modeText = "Vasiyet Seferi";
    if (s.mode === "live") modeText = "Canlı Seans";
    else if (s.mode === "crisis2001") modeText = "2001 Krizi";
    else if (s.mode === "shock2018") modeText = "2018 Şoku";
    
    let statusText = "Başarılı";
    let statusClass = "text-term-green";
    if (s.status === "bankruptcy") {
      statusText = "İflas";
      statusClass = "text-term-red";
    } else if (s.status === "seizure") {
      statusText = "Kamulaştırıldı";
      statusClass = "text-term-amber";
    }
    
    html += `
      <tr class="border-b border-term-border/40 hover:bg-term-panel/40">
        <td class="p-2 border-r border-term-border text-center text-term-amber font-bold">${idx + 1}</td>
        <td class="p-2 border-r border-term-border text-white font-bold">${s.name}</td>
        <td class="p-2 border-r border-term-border">${modeText}</td>
        <td class="p-2 border-r border-term-border text-center">${s.day}</td>
        <td class="p-2 border-r border-term-border text-right text-term-green font-bold">$${s.netWorth.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="p-2 ${statusClass} font-bold">${statusText}</td>
      </tr>
    `;
  });
  
  rowsContainer.innerHTML = html;
}

function resetLeaderboard() {
  if (confirm("Tüm mükellef sicil kayıtlarını silmek istediğinize emin misiniz?")) {
    localStorage.removeItem('miras_leaderboard');
    displayLeaderboard();
    sound.playAlert();
    addLog("[SİSTEM] Tüm mükellef sicil kayıtları sıfırlanmıştır.", "warning");
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    addLog("[SİSTEM] Tescil beratı ve başarı belgesi panoya kopyalanmıştır!", "success");
    sound.playSuccess();
  }).catch(() => {
    alert("Panoya kopyalama başarısız oldu.");
  });
}

function getShareText(outcome) {
  const netWorthUSD = getNetWorthUSD();
  const formattedWealth = netWorthUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = GAME_STATE.day;
  const gameUrl = window.location.href;
  
  let asciiArt = "";
  if (outcome === 'win') {
    asciiArt = `
===================================================
       T.C. İSTANBUL 4. SULH HUKUK MAHKEMESİ       
           MİRAS VE TENFİZ TESCİL BERATI           
===================================================
Mirasçı, vasiyet yükümlülüklerini ifa ederek
enflasyon canavarına karşı zafer kazanmıştır.

[+] TESCİL EDİLEN NET SERVET: $${formattedWealth}
[+] TAMAMLANAN SÜRE: ${day} / ${GAME_STATE.totalDays} Gün
[+] KARAR: BÜTÜN VARLIKLAR VARİSE TESLİM EDİLMİŞTİR!
---------------------------------------------------
Miras Oyunu - Tokatla Enflasyonu! ${gameUrl}
===================================================
`;
  } else if (outcome === 'bankruptcy') {
    asciiArt = `
===================================================
     T.C. İSTANBUL İCRA VE İFLAS MÜDÜRLÜĞÜ       
             ACİZ VESİKASI VE İLAM                 
===================================================
Mükellef, kaldıraçlı işlemler ve yanlış kararlarla
murisin tüm sermayesini batırmıştır.

[-] BORÇLU NET SERVETİ: $0.00
[-] İFLAS EDİLEN GÜN: Gün ${day}
[-] KARAR: KAMU ALACAKLARI İÇİN HACİZ BAŞLATILMIŞTIR!
---------------------------------------------------
Miras Oyunu - Borsada Batanlar Kulübü! ${gameUrl}
===================================================
`;
  } else if (outcome === 'seizure') {
    asciiArt = `
===================================================
       T.C. HAKİMİYETİ MİLLİYE MAHKEMESİ           
             KAMULAŞTIRMA VE İPTAL İLAMI           
===================================================
Mükellef, parayı korumuş fakat Türkiye enflasyonuna
yenik düşürerek reelde değer kaybettirmiştir.

[-] MATRAH BİTİRİŞ SERVETİ: $${formattedWealth}
[-] HEDEF ENFLASYON EŞİĞİ: $${GAME_STATE.inflationThreshold.toLocaleString('en-US', {minimumFractionDigits: 2})}
[-] KARAR: TÜM MEVDUAT VE MÜLKLER HAZİNEYE DEVREDİLDİ!
---------------------------------------------------
Miras Oyunu - Enflasyon Canavarı Kazandı! ${gameUrl}
===================================================
`;
  }
  return asciiArt.trim();
}

// ==========================================
// 10. INTERACTION LISTENERS & TRIGGERS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("current-onboarding-time").textContent = new Date().toLocaleDateString('tr-TR');
  
  // Initialize onboarding with typewriter and satirical disclaimer
  initOnboarding();

  // Sound and CRT toggles
  document.getElementById("sound-toggle-btn").addEventListener("click", (e) => {
    GAME_STATE.soundMuted = !GAME_STATE.soundMuted;
    sound.setMute(GAME_STATE.soundMuted);
    e.target.textContent = `[ SES: ${GAME_STATE.soundMuted ? 'KAPALI' : 'AÇIK'} ]`;
    sound.playBeep();
  });

  document.getElementById("crt-toggle-btn").addEventListener("click", (e) => {
    const overlay = document.getElementById("crt-overlay");
    if (overlay.classList.contains("scanlines")) {
      overlay.classList.remove("scanlines");
      document.body.classList.remove("crt-flicker");
      e.target.textContent = "[ CRT: KAPALI ]";
    } else {
      overlay.classList.add("scanlines");
      document.body.classList.add("crt-flicker");
      e.target.textContent = "[ CRT: AÇIK ]";
    }
    sound.playBeep();
  });

  // Autocomplete search box listeners
  const searchInput = document.getElementById("stock-search");
  const suggestionsBox = document.getElementById("search-suggestions");
  
  function scrollToPropertyCard(idx) {
    const card = document.getElementById(`property-card-${idx}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Add glowing green border classes
      card.classList.remove("border-term-border");
      card.classList.add("border-term-green", "glow-border-green");
      
      // Remove glowing border after 2.5s
      setTimeout(() => {
        card.classList.remove("border-term-green", "glow-border-green");
        card.classList.add("border-term-border");
      }, 2500);
    }
  }

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toUpperCase().trim();
    if (!query) {
      suggestionsBox.classList.add("hidden");
      return;
    }
    
    let html = "";
    Object.keys(TICKER_INFO).forEach(ticker => {
      const info = TICKER_INFO[ticker];
      if (ticker.includes(query) || info.name.toUpperCase().includes(query)) {
        const currentPrice = GAME_STATE.stocks[ticker].price;
        const curSymbol = info.currency === "USD" ? "$" : "₺";
        html += `
          <div class="suggestion-item p-2 hover:bg-term-panel/80 cursor-pointer border-b border-term-border/40 flex justify-between" data-ticker="${ticker}">
            <span class="font-bold text-white">${ticker} <span class="text-[9px] text-gray-400 font-normal">(${info.name})</span></span>
            <span class="text-term-green font-bold">${curSymbol}${currentPrice.toFixed(2)}</span>
          </div>
        `;
      }
    });

    // Also search properties
    GAME_STATE.properties.forEach((p, idx) => {
      if (p.name.toUpperCase().includes(query) || p.type.toUpperCase().includes(query)) {
        html += `
          <div class="suggestion-item p-2 hover:bg-term-panel/80 cursor-pointer border-b border-term-border/40 flex justify-between" data-property-index="${idx}">
            <span class="font-bold text-white">${p.name} <span class="text-[9px] text-term-blue font-normal">(${p.type})</span></span>
            <span class="text-term-blue font-bold">₺${p.cost.toLocaleString('tr-TR')}</span>
          </div>
        `;
      }
    });
    
    if (html) {
      suggestionsBox.innerHTML = html;
      suggestionsBox.classList.remove("hidden");
    } else {
      suggestionsBox.innerHTML = `<div class="p-2 text-gray-500 text-[10px]">Varlık bulunamadı.</div>`;
      suggestionsBox.classList.remove("hidden");
    }
  });

  suggestionsBox.addEventListener("click", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    
    const ticker = item.getAttribute("data-ticker");
    const propIdx = item.getAttribute("data-property-index");
    
    if (ticker) {
      GAME_STATE.selectedTicker = ticker;
      searchInput.value = ticker;
      suggestionsBox.classList.add("hidden");
      
      sound.playBeep(600, 0.05, 'sine', 0.04);
      updateUI();
      drawChart();
    } else if (propIdx !== null) {
      const idx = parseInt(propIdx);
      const prop = GAME_STATE.properties[idx];
      searchInput.value = prop.name;
      suggestionsBox.classList.add("hidden");
      
      sound.playBeep(600, 0.05, 'sine', 0.04);
      scrollToPropertyCard(idx);
    }
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      suggestionsBox.classList.add("hidden");
    }, 250);
  });

  // Quantity quick-buttons helper (USD/TRY adaptive)
  const qtyInput = document.getElementById("trade-qty");
  
  document.getElementById("btn-qty-10").addEventListener("click", () => {
    qtyInput.value = 10;
    sound.playBeep();
  });
  document.getElementById("btn-qty-100").addEventListener("click", () => {
    qtyInput.value = 100;
    sound.playBeep();
  });
  document.getElementById("btn-qty-max").addEventListener("click", () => {
    const ticker = GAME_STATE.selectedTicker;
    const stock = GAME_STATE.stocks[ticker];
    if (stock.currency === "USD") {
      // 0.1% conversion commission applies if converting TRY -> USD
      const comm = GAME_STATE.techAgent.active ? 0 : 0.001;
      const totalTRYUSD = (GAME_STATE.tryCash + GAME_STATE.bankBalance) / GAME_STATE.usdTry * (1 - comm);
      const totalUSDCombined = GAME_STATE.cash + totalTRYUSD;
      qtyInput.value = Math.max(0, Math.floor(totalUSDCombined / stock.price));
    } else {
      // 0.2% trade commission applies on BIST stock buy
      const tradeComm = GAME_STATE.techAgent.active ? 0 : 0.002;
      const priceWithComm = stock.price * (1 + tradeComm);
      // 0.1% conversion commission applies if converting USD -> TRY
      const rate = GAME_STATE.usdTry;
      const effRate = GAME_STATE.techAgent.active ? rate : rate * 0.999;
      const totalTRYCombined = GAME_STATE.tryCash + GAME_STATE.bankBalance + GAME_STATE.cash * effRate;
      qtyInput.value = Math.max(0, Math.floor(totalTRYCombined / priceWithComm));
    }
    sound.playBeep();
  });
  document.getElementById("btn-qty-all").addEventListener("click", () => {
    const stock = GAME_STATE.stocks[GAME_STATE.selectedTicker];
    qtyInput.value = stock.held;
    sound.playBeep();
  });

  // Stock Market transactions (Adaptive TRY/USD, Gold spread, Leverage and Auto-FX)
  document.getElementById("buy-btn").addEventListener("click", () => {
    const ticker = GAME_STATE.selectedTicker;
    const stock = GAME_STATE.stocks[ticker];
    const qty = parseInt(qtyInput.value);
    
    const isBistTicker = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
    if (isBistTicker && !checkBistOpen()) {
      sound.playError();
      addLog(`[EMİR İPTALİ] Borsa İstanbul şu anda seans dışıdır. BIST işlemleri hafta içi 10:00 - 18:00 saatleri arasında gerçekleştirilebilir.`, "error");
      return;
    }
    
    if (GAME_STATE.mode === 'crisis2001' && (ticker === 'BTC' || ticker === 'ETH' || ticker === 'SOL')) {
      sound.playError();
      addLog(`[ZAMAN PARADOKSU] 2001 yılında Satoshi Nakamoto henüz Bitcoin makalesini yayınlamamıştır! Kripto ticareti askıya alınmıştır.`, "error");
      return;
    }
    if (GAME_STATE.mode === 'shock2018' && ticker === 'SOL') {
      sound.playError();
      addLog(`[ZAMAN PARADOKSU] Solana (SOL) 2018 yılında henüz halka açılmamıştır (Lansman: 2020).`, "error");
      return;
    }
    
    if (isNaN(qty) || qty <= 0) {
      sound.playError();
      addLog("Hatalı işlem miktarı.", "error");
      return;
    }
    
    // Leverage Check
    const selectedLeverage = parseInt(document.getElementById("trade-leverage").value) || 1;
    if (stock.held > 0 && stock.leverage !== selectedLeverage) {
      sound.playError();
      addLog(`[EMİR İPTALİ] Mevcut pozisyonunuz ${stock.leverage}x kaldıraçlıdır. Farklı bir kaldıraçla ekleme yapmak için önce pozisyonu kapatmalı veya aynı kaldıraç seçeneğini (${stock.leverage}x) kullanmalısınız.`, "error");
      return;
    }

    const clickPrice = stock.price;
    
    // Slippage Simulation (only BIST/Crypto in Live Mode)
    let executionPrice = clickPrice;
    if (GAME_STATE.mode === 'live' && ticker !== 'EUROBOND' && ticker !== 'ALTIN') {
      const slippage = (Math.random() - 0.5) * 0.012; // Simulated network slippage (-0.6% to +0.6%)
      if (Math.abs(slippage) > 0.005) { // If exceeds 0.5%
        sound.playError();
        addLog(`[İŞLEM İPTALİ] Sapma (Slippage) %${(slippage * 100).toFixed(2)} olarak gerçekleşti. Tolerans sınırı (%0.50) aşıldığı için emir borsadan geri çekilmiştir.`, "error");
        return;
      }
      executionPrice = parseFloat((clickPrice * (1 + slippage)).toFixed(2));
    }
    
    const totalCost = qty * executionPrice;
    const marginNeeded = totalCost / selectedLeverage;
    const borrowAmount = totalCost - marginNeeded;
    
    if (stock.currency === "USD") {
      // USD Transacted Asset (Crypto/Eurobond)
      if (!ensureUSDBalance(marginNeeded)) {
        sound.playError();
        addLog("Yetersiz toplam nakit! USD kaldıraçlı alım iptal edildi.", "error");
        return;
      }
      GAME_STATE.cash = parseFloat((GAME_STATE.cash - marginNeeded).toFixed(2));
      
      const currentVal = stock.held * stock.avgCost;
      stock.held += qty;
      stock.avgCost = (currentVal + totalCost) / stock.held;
      stock.leverage = selectedLeverage;
      stock.marginPaid += marginNeeded;
      stock.borrowed += borrowAmount;
      
      if (stock.leverage > 1) {
        stock.liquidationPrice = stock.avgCost * (1 - 0.85 / stock.leverage);
        stock.marginCallPrice = stock.avgCost * (1 - 0.70 / stock.leverage);
      } else {
        stock.liquidationPrice = 0;
        stock.marginCallPrice = 0;
      }
      
      sound.playSuccess();
      const slipStr = executionPrice !== clickPrice ? ` (Fiyat Sapması: %${((executionPrice - clickPrice)/clickPrice * 100).toFixed(2)})` : "";
      addLog(`${qty} Adet ${ticker} [${selectedLeverage}x Kaldıraç] satın alındı. Yatırılan Teminat: ${formatUSD(marginNeeded)}, Borçlanılan: ${formatUSD(borrowAmount)}${slipStr}`, "success");
    } else {
      // TRY Transacted Asset (BIST Stocks/Gold)
      const feeTRY = GAME_STATE.techAgent.active ? 0 : totalCost * 0.002; // fee applies to total volume
      const costTRY = marginNeeded + feeTRY;
      
      if (!ensureTRYBalance(costTRY)) {
        sound.playError();
        addLog("Yetersiz toplam bakiye! TRY kaldıraçlı alım iptal edildi.", "error");
        return;
      }
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - costTRY).toFixed(2));
      
      const currentVal = stock.held * stock.avgCost;
      stock.held += qty;
      stock.avgCost = (currentVal + totalCost) / stock.held;
      stock.leverage = selectedLeverage;
      stock.marginPaid += marginNeeded;
      stock.borrowed += borrowAmount;
      
      if (stock.leverage > 1) {
        stock.liquidationPrice = stock.avgCost * (1 - 0.85 / stock.leverage);
        stock.marginCallPrice = stock.avgCost * (1 - 0.70 / stock.leverage);
      } else {
        stock.liquidationPrice = 0;
        stock.marginCallPrice = 0;
      }
      
      sound.playSuccess();
      const slipStr = executionPrice !== clickPrice ? ` (Fiyat Sapması: %${((executionPrice - clickPrice)/clickPrice * 100).toFixed(2)})` : "";
      addLog(`${qty} Adet ${ticker} [${selectedLeverage}x Kaldıraç] satın alındı. Yatırılan Teminat: ${formatTRY(marginNeeded)}, Borçlanılan: ${formatTRY(borrowAmount)} (Komisyon: ${formatTRY(feeTRY)})${slipStr}`, "success");
    }
    
    updateUI();
  });

  document.getElementById("sell-btn").addEventListener("click", () => {
    const ticker = GAME_STATE.selectedTicker;
    const stock = GAME_STATE.stocks[ticker];
    const qty = parseInt(qtyInput.value);
    
    const isBistTicker = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'YKBNK', 'BIMAS', 'SASA'].includes(ticker);
    if (isBistTicker && !checkBistOpen()) {
      sound.playError();
      addLog(`[EMİR İPTALİ] Borsa İstanbul şu anda seans dışıdır. BIST işlemleri hafta içi 10:00 - 18:00 saatleri arasında gerçekleştirilebilir.`, "error");
      return;
    }
    
    if (GAME_STATE.mode === 'crisis2001' && (ticker === 'BTC' || ticker === 'ETH' || ticker === 'SOL')) {
      sound.playError();
      addLog(`[ZAMAN PARADOKSU] 2001 yılında Satoshi Nakamoto henüz Bitcoin makalesini yayınlamamıştır! Kripto ticareti askıya alınmıştır.`, "error");
      return;
    }
    if (GAME_STATE.mode === 'shock2018' && ticker === 'SOL') {
      sound.playError();
      addLog(`[ZAMAN PARADOKSU] Solana (SOL) 2018 yılında henüz halka açılmamıştır (Lansman: 2020).`, "error");
      return;
    }
    
    if (isNaN(qty) || qty <= 0 || stock.held < qty) {
      sound.playError();
      addLog("Portföyünüzde yeterli varlık bulunamadı!", "error");
      return;
    }
    
    const clickPrice = ticker === "ALTIN" ? stock.price * 0.985 : stock.price; // Spread for Gold
    
    // Slippage Simulation (only BIST/Crypto in Live Mode)
    let executionPrice = clickPrice;
    if (GAME_STATE.mode === 'live' && ticker !== 'EUROBOND' && ticker !== 'ALTIN') {
      const slippage = (Math.random() - 0.5) * 0.012; // Simulated network slippage (-0.6% to +0.6%)
      if (Math.abs(slippage) > 0.005) { // If exceeds 0.5%
        sound.playError();
        addLog(`[İŞLEM İPTALİ] Sapma (Slippage) %${(slippage * 100).toFixed(2)} olarak gerçekleşti. Tolerans sınırı (%0.50) aşıldığı için emir borsadan geri çekilmiştir.`, "error");
        return;
      }
      executionPrice = parseFloat((clickPrice * (1 + slippage)).toFixed(2));
    }
    
    const grossVal = qty * executionPrice;
    const fraction = qty / stock.held;
    const repayAmount = stock.borrowed * fraction;
    const marginRefund = stock.marginPaid * fraction;
    
    if (stock.currency === "USD") {
      const netPayoutUSD = grossVal - repayAmount;
      GAME_STATE.cash = parseFloat((GAME_STATE.cash + netPayoutUSD).toFixed(2));
      
      const costBasis = qty * stock.avgCost;
      const profit = grossVal - costBasis;
      
      stock.held -= qty;
      stock.borrowed -= repayAmount;
      stock.marginPaid -= marginRefund;
      
      if (stock.held === 0) {
        stock.avgCost = 0;
        stock.borrowed = 0;
        stock.marginPaid = 0;
        stock.leverage = 1;
        stock.liquidationPrice = 0;
        stock.marginCallPrice = 0;
        stock.marginCallActive = false;
        stock.marginCallTimer = 0;
      }
      
      sound.playSuccess();
      const slipStr = executionPrice !== clickPrice ? ` (Fiyat Sapması: %${((executionPrice - clickPrice)/clickPrice * 100).toFixed(2)})` : "";
      addLog(`${qty} Adet ${ticker} satıldı. Borç Geri Ödendi: ${formatUSD(repayAmount)}, Net Nakit Girişi: ${formatUSD(netPayoutUSD)} | Net Kâr: ${profit >= 0 ? '+' : ''}${formatUSD(profit)}${slipStr}`, "success");
    } else {
      const feeTRY = GAME_STATE.techAgent.active ? 0 : grossVal * 0.002;
      const netPayoutTRY = (grossVal - repayAmount) - feeTRY;
      
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + netPayoutTRY).toFixed(2));
      
      const costBasisTRY = qty * stock.avgCost;
      const profitTRY = (grossVal - feeTRY) - costBasisTRY;
      
      stock.held -= qty;
      stock.borrowed -= repayAmount;
      stock.marginPaid -= marginRefund;
      
      if (stock.held === 0) {
        stock.avgCost = 0;
        stock.borrowed = 0;
        stock.marginPaid = 0;
        stock.leverage = 1;
        stock.liquidationPrice = 0;
        stock.marginCallPrice = 0;
        stock.marginCallActive = false;
        stock.marginCallTimer = 0;
      }
      
      sound.playSuccess();
      const slipStr = executionPrice !== clickPrice ? ` (Fiyat Sapması: %${((executionPrice - clickPrice)/clickPrice * 100).toFixed(2)})` : "";
      addLog(`${qty} Adet ${ticker} satıldı. Borç Geri Ödendi: ${formatTRY(repayAmount)}, Net Nakit Girişi: ${formatTRY(netPayoutTRY)} | Net Kâr: ${profitTRY >= 0 ? '+' : ''}${formatTRY(profitTRY)} (Komisyon: ${formatTRY(feeTRY)})${slipStr}`, "success");
    }
    
    updateUI();
  });

  // Exchange Desk (Döviz Ofisi)
  document.getElementById("fx-buy-try-btn").addEventListener("click", () => {
    const amountUSD = parseFloat(document.getElementById("fx-amount").value);
    
    if (isNaN(amountUSD) || amountUSD <= 0 || GAME_STATE.cash < amountUSD) {
      sound.playError();
      addLog("Hatalı işlem tutarı veya yetersiz USD nakit bakiye!", "error");
      return;
    }
    
    const feeUSD = GAME_STATE.techAgent.active ? 0 : amountUSD * 0.001;
    const netUSD = amountUSD - feeUSD;
    const creditedTRY = netUSD * GAME_STATE.usdTry;
    
    GAME_STATE.cash = parseFloat((GAME_STATE.cash - amountUSD).toFixed(2));
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + creditedTRY).toFixed(2));
    
    sound.playSuccess();
    addLog(`Dolar Satıldı: ${formatUSD(amountUSD)} -> TRY Alındı: ${formatTRY(creditedTRY)} (Komisyon: ${formatUSD(feeUSD)})`, "success");
    updateUI();
  });

  document.getElementById("fx-buy-usd-btn").addEventListener("click", () => {
    const amountTRY = parseFloat(document.getElementById("fx-amount").value);
    
    if (isNaN(amountTRY) || amountTRY <= 0 || GAME_STATE.tryCash < amountTRY) {
      sound.playError();
      addLog("Hatalı işlem tutarı veya yetersiz TRY nakit bakiye!", "error");
      return;
    }
    
    const feeTRY = GAME_STATE.techAgent.active ? 0 : amountTRY * 0.001;
    const netTRY = amountTRY - feeTRY;
    const creditedUSD = netTRY / GAME_STATE.usdTry;
    
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - amountTRY).toFixed(2));
    GAME_STATE.cash = parseFloat((GAME_STATE.cash + creditedUSD).toFixed(2));
    
    sound.playSuccess();
    addLog(`TRY Satıldı: ${formatTRY(amountTRY)} -> Dolar Alındı: ${formatUSD(creditedUSD)} (Komisyon: ${formatTRY(feeTRY)})`, "success");
    updateUI();
  });

  // Vadeli Mevduat
  document.getElementById("bank-deposit-btn").addEventListener("click", () => {
    const amountTRY = parseFloat(document.getElementById("bank-amount").value);
    
    if (isNaN(amountTRY) || amountTRY <= 0) {
      sound.playError();
      addLog("Hatalı mevduat miktarı!", "error");
      return;
    }
    
    if (!ensureTRYBalance(amountTRY)) {
      sound.playError();
      addLog("Mevduat yatırmak için toplam bakiye yetersiz!", "error");
      return;
    }
    
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - amountTRY).toFixed(2));
    GAME_STATE.bankBalance = parseFloat((GAME_STATE.bankBalance + amountTRY).toFixed(2));
    
    sound.playSuccess();
    addLog(`Banka Yatırımı: ${formatTRY(amountTRY)} vadeli mevduat hesabına yatırıldı.`, "success");
    updateUI();
  });

  document.getElementById("bank-withdraw-btn").addEventListener("click", () => {
    const amountTRY = parseFloat(document.getElementById("bank-amount").value);
    
    if (isNaN(amountTRY) || amountTRY <= 0 || GAME_STATE.bankBalance < amountTRY) {
      sound.playError();
      addLog("Hatalı çekim miktarı veya vadeli hesapta yetersiz bakiye!", "error");
      return;
    }
    
    GAME_STATE.bankBalance = parseFloat((GAME_STATE.bankBalance - amountTRY).toFixed(2));
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + amountTRY).toFixed(2));
    
    sound.playSuccess();
    addLog(`Banka Çekimi: ${formatTRY(amountTRY)} vadeli hesaptan çekilerek nakit TRY'ye aktarıldı.`, "success");
    updateUI();
  });

  // Real estate purchase & Management & Bribe click handlers (with %4 Tapu Harcı)
  document.getElementById("real-estate-list").addEventListener("click", (e) => {
    const buyBtn = e.target.closest(".buy-prop-btn");
    if (buyBtn) {
      const propIdx = parseInt(buyBtn.getAttribute("data-prop-index"));
      const prop = GAME_STATE.properties[propIdx];
      
      // 4% Tapu harcı tax markup on cost
      const displayCostTRY = Math.round(prop.cost * 1.04);
      
      if (!ensureTRYBalance(displayCostTRY)) {
        sound.playError();
        addLog("Gayrimenkul ve tapu harcı masrafları için toplam bakiye yetersiz!", "error");
        return;
      }
      
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - displayCostTRY).toFixed(2));
      
      const delayDays = prop.delay;
      const bribeCost = Math.round(prop.cost * 0.08);
      
      const order = {
        id: Date.now() + Math.random(),
        propIndex: propIdx,
        name: prop.name,
        daysRemaining: delayDays,
        bribeCost: bribeCost,
        cost: prop.cost
      };
      
      GAME_STATE.pendingTapu.push(order);
      
      addLog(`[TAPU DAİRESİ BAŞVURUSU] ${prop.name} tescil talebi alınmıştır. %4 Tapu Harcı tahsil edilmiştir: ₺${Math.round(prop.cost * 0.04).toLocaleString('tr-TR')}. Bürokratik onay süresi: ${delayDays} gün.`, "info");
      updateUI();
    }
    
    const bribeBtn = e.target.closest(".bribe-btn");
    if (bribeBtn) {
      const orderId = parseFloat(bribeBtn.getAttribute("data-order-id"));
      const orderIndex = GAME_STATE.pendingTapu.findIndex(o => o.id === orderId);
      if (orderIndex === -1) return;
      
      const order = GAME_STATE.pendingTapu[orderIndex];
      
      if (!ensureTRYBalance(order.bribeCost)) {
        sound.playError();
        addLog("Rüşvet ödemesi için toplam bakiye yetersiz!", "error");
        return;
      }
      
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - order.bribeCost).toFixed(2));
      
      GAME_STATE.properties[order.propIndex].count++;
      addLog(`[TAPU MÜDÜRÜ İKRAMI] Tapu memuruna sunulan "hızlandırma çorba parası" (Rüşvet) kabul edilmiştir. Bürokrasi engelleri aşılmış ve ${order.name} mülkiyeti adınıza tescil edilmiştir.`, "success");
      sound.playSuccess();
      
      GAME_STATE.pendingTapu.splice(orderIndex, 1);
      updateUI();
    }

    // Business Management Modal click open
    const manageBtn = e.target.closest(".manage-prop-btn");
    if (manageBtn) {
      const propIdx = parseInt(manageBtn.getAttribute("data-prop-index"));
      GAME_STATE.modalActiveIndex = propIdx;
      
      // Update and Show Modal
      updateBusinessModalUI();
      const modal = document.getElementById("business-modal");
      modal.classList.remove("opacity-0", "pointer-events-none");
      modal.classList.add("opacity-100");
      sound.playBeep();
    }
  });

  // Business Management Modal click actions
  document.getElementById("modal-close-btn").addEventListener("click", () => {
    const modal = document.getElementById("business-modal");
    modal.classList.remove("opacity-100");
    modal.classList.add("opacity-0", "pointer-events-none");
    GAME_STATE.modalActiveIndex = null;
    sound.playBeep();
    updateUI();
  });

  document.getElementById("modal-pricing-group").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    
    const policy = btn.getAttribute("data-policy");
    const idx = GAME_STATE.modalActiveIndex;
    if (idx === null || !policy) return;
    
    GAME_STATE.businessPolicies[idx] = policy;
    sound.playBeep(650, 0.05, 'sine', 0.03);
    
    const pName = GAME_STATE.properties[idx].name;
    const policyLabel = policy === "low" ? "DÜŞÜK" : (policy === "high" ? "FIRSATÇI (YÜKSEK)" : "NORMAL");
    addLog(`[İŞLETME FİYATLANDIRMA] ${pName} fiyat politikası güncellendi: ${policyLabel}`, "info");
    
    updateBusinessModalUI();
  });

  // Upgrades actions in modal
  document.getElementById("modal-upg-0-btn").addEventListener("click", () => {
    const idx = GAME_STATE.modalActiveIndex;
    if (idx === null || GAME_STATE.businessUpgrades[idx][0]) return;
    
    const isCafe = idx === 3;
    const cost = isCafe ? 1500000 : 8000000;
    
    if (!ensureTRYBalance(cost)) {
      sound.playError();
      addLog("Fiziksel tadilat yatırımı için toplam bakiye yetersiz!", "error");
      return;
    }
    
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - cost).toFixed(2));
    GAME_STATE.businessUpgrades[idx][0] = true;
    
    sound.playSuccess();
    addLog(`[İŞLETME YÜKSELTME] ${GAME_STATE.properties[idx].name} tesis tadilatı tamamlandı! Gelirler %25 arttı.`, "success");
    updateBusinessModalUI();
  });

  document.getElementById("modal-upg-1-btn").addEventListener("click", () => {
    const idx = GAME_STATE.modalActiveIndex;
    if (idx === null || GAME_STATE.businessUpgrades[idx][1]) return;
    
    const isCafe = idx === 3;
    const cost = isCafe ? 400000 : 1800000;
    
    if (!ensureTRYBalance(cost)) {
      sound.playError();
      addLog("Pazarlama yatırımı için toplam bakiye yetersiz!", "error");
      return;
    }
    
    GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - cost).toFixed(2));
    GAME_STATE.businessUpgrades[idx][1] = true;
    
    sound.playSuccess();
    addLog(`[İŞLETME YÜKSELTME] ${GAME_STATE.properties[idx].name} reklam çalışması aktifleşti! Gelirler %10 arttı.`, "success");
    updateBusinessModalUI();
  });

  // Sahibinden Live Deals & Bargaining listeners
  const dealContainer = document.getElementById("live-deal-container");
  if (dealContainer) {
    dealContainer.addEventListener("click", (e) => {
      if (e.target.closest("#open-bargain-btn")) {
        openBargainModal();
      }
    });
  }

  document.getElementById("bargain-close-btn").addEventListener("click", closeBargainModal);
  document.getElementById("bargain-cancel-btn").addEventListener("click", closeBargainModal);
  document.getElementById("bargain-accept-btn").addEventListener("click", finalizeBargainPurchase);
  
  document.getElementById("bargain-opt-sunnet").addEventListener("click", () => handleBargainAction('sunnet'));
  document.getElementById("bargain-opt-olucu").addEventListener("click", () => handleBargainAction('olucu'));
  document.getElementById("bargain-opt-dolar").addEventListener("click", () => handleBargainAction('dolar'));
  document.getElementById("bargain-opt-kusur").addEventListener("click", () => handleBargainAction('kusur'));

  // Quick asset selectors
  document.querySelectorAll(".quick-ticker-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const ticker = e.currentTarget.getAttribute("data-ticker");
      if (ticker && GAME_STATE.stocks[ticker]) {
        GAME_STATE.selectedTicker = ticker;
        sound.playBeep(600, 0.05, 'sine', 0.04);
        updateUI();
        drawChart();
      }
    });
  });

  // Tech Agent activation / upgrades
  document.getElementById("tech-btn").addEventListener("click", () => {
    if (!GAME_STATE.techAgent.active) {
      if (GAME_STATE.cash < GAME_STATE.techAgent.cost) {
        sound.playError();
        addLog("Teknoloji sunucularını açmak için $50,000 USD işletme sermayesi bulunmuyor!", "error");
        return;
      }
      
      GAME_STATE.cash = parseFloat((GAME_STATE.cash - GAME_STATE.techAgent.cost).toFixed(2));
      GAME_STATE.techAgent.active = true;
      
      sound.playSuccess();
      addLog("TECH AGENT uyandırıldı! Sunucular aktif. Döviz ve BIST komisyonları %0'a indirildi. Pasif akış: +$80/sn.", "success");
      updateUI();
    } else {
      const upgrade = GAME_STATE.techAgent.upgrades.find(u => !u.purchased);
      if (!upgrade) return;
      
      if (GAME_STATE.cash < upgrade.cost) {
        sound.playError();
        addLog("Seçili teknolojik altyapı yükseltmesi için USD bakiye yetersiz!", "error");
        return;
      }
      
      GAME_STATE.cash = parseFloat((GAME_STATE.cash - upgrade.cost).toFixed(2));
      upgrade.purchased = true;
      
      if (upgrade.name.includes("Bulut Sunucu")) {
        GAME_STATE.techAgent.autoTrade = true;
        addLog("AI Otomatik Ticaret yazılımı entegre edildi. GUBRF hisse fiyat dalgalanmalarını analiz edip otomatik alım/satım yapacak.", "info");
      }
      
      sound.playSuccess();
      addLog(`Teknoloji Geliştirme: ${upgrade.name} aktif edildi. Pasif akış: +$${upgrade.yield}/sn.`, "success");
      updateUI();
    }
  });

  // Bind mechanical typing sounds to all numeric and text inputs
  ["stock-search", "trade-qty", "fx-amount", "bank-amount"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => sound.playClick());
    }
  });

  // Leaderboard toggles and actions
  document.getElementById("leaderboard-toggle-btn").addEventListener("click", () => {
    displayLeaderboard();
    const modal = document.getElementById("leaderboard-modal");
    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.classList.add("opacity-100");
    sound.playBeep();
  });

  document.getElementById("leaderboard-close-btn").addEventListener("click", () => {
    const modal = document.getElementById("leaderboard-modal");
    modal.classList.remove("opacity-100");
    modal.classList.add("opacity-0", "pointer-events-none");
    sound.playBeep();
  });

  document.getElementById("leaderboard-reset-btn").addEventListener("click", () => {
    resetLeaderboard();
  });

  // Bind Twitter/X Share buttons click listeners
  const winShare = document.getElementById("win-share-btn");
  if (winShare) {
    winShare.addEventListener("click", () => shareScore('win'));
  }
  const bankShare = document.getElementById("bankruptcy-share-btn");
  if (bankShare) {
    bankShare.addEventListener("click", () => shareScore('bankruptcy'));
  }
  const seizureShare = document.getElementById("seizure-share-btn");
  if (seizureShare) {
    seizureShare.addEventListener("click", () => shareScore('seizure'));
  }

  // Bind Copy buttons click listeners
  document.getElementById("win-copy-btn").addEventListener("click", () => copyToClipboard(getShareText('win')));
  document.getElementById("bankruptcy-copy-btn").addEventListener("click", () => copyToClipboard(getShareText('bankruptcy')));
  document.getElementById("seizure-copy-btn").addEventListener("click", () => copyToClipboard(getShareText('seizure')));

  // FX tabs Bank vs Bazaar listeners
  document.getElementById("fx-tab-bank").addEventListener("click", () => {
    GAME_STATE.fxSource = 'bank';
    sound.playBeep(600, 0.05, 'sine', 0.03);
    addLog("[DÖVİZ OFİSİ] Kur kaynağı BANKA olarak seçildi. İşlemler banka komisyon oranlarıyla gerçekleştirilecektir.", "info");
    updateUI();
  });
  document.getElementById("fx-tab-bazaar").addEventListener("click", () => {
    GAME_STATE.fxSource = 'bazaar';
    sound.playBeep(650, 0.05, 'sine', 0.03);
    addLog("[DÖVİZ OFİSİ] Kur kaynağı KAPALIÇARŞI (Ayaklı Borsa) olarak seçildi. Dar makas ancak elden fiziki teslim kuru devrededir.", "warning");
    updateUI();
  });

  // Tax Policy TÜİK vs ENAG listeners
  document.getElementById("tax-policy-tuik").addEventListener("click", () => {
    GAME_STATE.taxReportingMode = 'tuik';
    sound.playBeep(600, 0.05, 'sine', 0.03);
    addLog("[VERGİ MATRAHI] Matrah bildirimi TÜİK endeksine göre yapılması kararlaştırıldı. Ödenecek vergi %60 azalacak, fakat geriye dönük vergi denetimi cezası riski tetiklendi.", "warning");
    updateTaxPolicyUI();
  });
  document.getElementById("tax-policy-enag").addEventListener("click", () => {
    GAME_STATE.taxReportingMode = 'enag';
    sound.playBeep(650, 0.05, 'sine', 0.03);
    addLog("[VERGİ MATRAHI] Matrah bildirimi şeffaf ENAG endeksine göre yapılması kararlaştırıldı. Vergiler tam ödenecek, inceleme riski bulunmuyor.", "info");
    updateTaxPolicyUI();
  });

  // Tefeci Cafer loan borrow/payback listener
  document.getElementById("loan-shark-borrow-btn").addEventListener("click", () => {
    if (GAME_STATE.loanSharkDebt === 0) {
      GAME_STATE.loanSharkDebt = 500000;
      GAME_STATE.loanSharkTimer = 60;
      GAME_STATE.loanSharkInterestTimer = 10;
      GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash + 500000).toFixed(2));
      addLog("[TEFECİ CAFER] Cafer'den ₺500,000 acil nakit borç alındı. Her 10 saniyede bir %5 faiz eklenecek, son ödeme süresi 60 saniye!", "error");
      sound.playAlert();
    } else {
      if (GAME_STATE.tryCash >= GAME_STATE.loanSharkDebt) {
        GAME_STATE.tryCash = parseFloat((GAME_STATE.tryCash - GAME_STATE.loanSharkDebt).toFixed(2));
        addLog(`[TEFECİ CAFER] Cafer'e olan ₺${Math.ceil(GAME_STATE.loanSharkDebt).toLocaleString('tr-TR')} borç ve faiz tamamen ödenip hesap kapatıldı.`, "success");
        GAME_STATE.loanSharkDebt = 0;
        GAME_STATE.loanSharkTimer = 0;
        GAME_STATE.loanSharkInterestTimer = 0;
        sound.playSuccess();
      } else {
        sound.playError();
        addLog(`[TEFECİ CAFER] Borç kapatmak için yeterli nakit Liranız bulunmuyor! Gerekli: ₺${Math.ceil(GAME_STATE.loanSharkDebt).toLocaleString('tr-TR')}`, "error");
      }
    }
    updateUI();
  });
  
  // Bind leverage change update listener
  document.getElementById("trade-leverage").addEventListener("change", () => {
    updateStockTradePanel();
  });

  // Network connection status listeners
  window.addEventListener('online', () => {
    if (GAME_STATE.mode === 'live' && GAME_STATE.gameActive) {
      setLiveStatus('sync');
      setTimeout(() => {
        if (navigator.onLine && GAME_STATE.mode === 'live' && GAME_STATE.gameActive) {
          setLiveStatus('live');
          addLog("[SİSTEM] İnternet bağlantısı sağlandı. Canlı veriler senkronize ediliyor.", "success");
          fetchLivePrices();
          fetchUSDTRY();
        }
      }, 1500);
    } else {
      setLiveStatus('local');
    }
  });

  window.addEventListener('offline', () => {
    setLiveStatus('local');
    if (GAME_STATE.mode === 'live' && GAME_STATE.gameActive) {
      addLog("[SİSTEM] İnternet bağlantısı kesildi! Yerel simülasyon moduna geçildi.", "warning");
    }
  });

  // Initialize
  updateUI();
  drawChart();
});
