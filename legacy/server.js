// server.js - Miras Oyunu Local Server & BIST Proxy (Node.js)
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Default prices to fallback if API fails
const latestPrices = {
  THYAO: 288.0,
  EREGL: 38.68,
  ASELS: 410.0,
  GUBRF: 544.5,
  KCHOL: 190.2,
  TUPRS: 243.1,
  YKBNK: 32.86,
  BIMAS: 392.75,
  SASA: 2.65,
  ALTIN: 2391.83
};

let lastFetchTime = 0;
const CACHE_DURATION_MS = 5000; // 5 seconds cache

// Helpers to make HTTPS requests
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP status ${res.statusCode}`));
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function fetchYahooPrice(ticker) {
  try {
    const raw = await httpGet(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1m`);
    const json = JSON.parse(raw);
    if (json.chart && json.chart.result && json.chart.result[0]) {
      const price = json.chart.result[0].meta.regularMarketPrice;
      if (price && typeof price === 'number') {
        return price;
      }
    }
    throw new Error("Invalid structure");
  } catch (e) {
    console.error(`Failed to fetch ${ticker} price:`, e.message);
    return null;
  }
}

async function fetchUsdTryRate() {
  try {
    const raw = await httpGet('https://open.er-api.com/v6/latest/USD');
    const json = JSON.parse(raw);
    if (json && json.rates && json.rates.TRY) {
      return json.rates.TRY;
    }
    throw new Error("Invalid exchange rate structure");
  } catch (e) {
    console.error("Failed to fetch USD/TRY rate:", e.message);
    return null;
  }
}

let cachedNews = [];
let lastNewsFetchTime = 0;
const NEWS_CACHE_DURATION_MS = 60000; // 60 seconds news cache

async function fetchBloombergNews() {
  const now = Date.now();
  if (now - lastNewsFetchTime < NEWS_CACHE_DURATION_MS && cachedNews.length > 0) {
    return cachedNews;
  }

  console.log(`[API] News cache expired. Fetching finance news from Bloomberg HT RSS...`);
  try {
    const rawXml = await httpGet('https://www.bloomberght.com/rss');
    
    // Parse RSS XML using regex
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>([\s\S]*?)<\/title>/;
    const descriptionRegex = /<description>([\s\S]*?)<\/description>/;
    
    let match;
    while ((match = itemRegex.exec(rawXml)) !== null && items.length < 8) {
      const itemContent = match[1];
      const titleMatch = titleRegex.exec(itemContent);
      const descMatch = descriptionRegex.exec(itemContent);
      
      let title = titleMatch ? titleMatch[1].trim() : "Finans Gelişmesi";
      let description = descMatch ? descMatch[1].trim() : "";
      
      // Clean CDATA wrappers if present
      title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      description = description.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      
      // Clean HTML tags from description
      description = description.replace(/<[^>]*>/g, '');
      
      // Decode simple HTML entities
      const decodeEntities = (str) => {
        return str
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');
      };
      
      title = decodeEntities(title);
      description = decodeEntities(description);
      
      items.push({ title, body: description });
    }
    
    if (items.length > 0) {
      cachedNews = items;
      lastNewsFetchTime = now;
      console.log(`[API] Successfully retrieved and parsed ${items.length} news items.`);
    }
    return cachedNews;
  } catch (e) {
    console.error("Failed to fetch Bloomberg HT RSS:", e.message);
    // Return some mock fallback news if RSS fails
    return [
      { title: "BIST 100 Kar Satışlarıyla Yatay Seyrediyor", body: "Endeks dün zirve tazeledikten sonra bugün kâr satışlarıyla yatay bandda hareket ediyor." },
      { title: "Dolar/TL 2026 Hedefleri Takip Ediliyor", body: "Küresel faiz politikaları ve yerel talep dengesiyle kur dalgalı seyrini sürdürüyor." },
      { title: "Kripto Paralarda Bitcoin 90K Sınırında Konsolide Oluyor", body: "Destek seviyelerinin korunmasıyla Bitcoin alıcılı bekleyişini sürdürüyor, altcoinlerde hareketlilik var." },
      { title: "Ons Altın Faiz İndirimi Beklentileriyle Güçleniyor", body: "FED'in faiz patikasına ilişkin spekülasyonlar güvenli liman altın talebini destekliyor." }
    ];
  }
}

async function updatePrices() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_DURATION_MS) {
    return; // Use cached values
  }

  console.log(`[API] Cache expired. Fetching BIST and Gold prices from Yahoo Finance...`);
  
  const tickers = {
    THYAO: 'THYAO.IS',
    EREGL: 'EREGL.IS',
    ASELS: 'ASELS.IS',
    GUBRF: 'GUBRF.IS',
    KCHOL: 'KCHOL.IS',
    TUPRS: 'TUPRS.IS',
    YKBNK: 'YKBNK.IS',
    BIMAS: 'BIMAS.IS',
    SASA: 'SASA.IS',
    GOLD: 'GC=F'
  };

  const promises = {};
  for (const [key, symbol] of Object.entries(tickers)) {
    promises[key] = fetchYahooPrice(symbol);
  }
  promises['USDTRY'] = fetchUsdTryRate();

  const results = {};
  for (const [key, promise] of Object.entries(promises)) {
    results[key] = await promise;
  }

  // Update memory store with successfully retrieved values
  for (const key of Object.keys(tickers)) {
    if (key !== 'GOLD' && results[key] !== null) {
      latestPrices[key] = parseFloat(results[key].toFixed(2));
    }
  }

  // Calculate Gram Gold in TRY
  if (results['GOLD'] !== null && results['USDTRY'] !== null) {
    const comexGold = results['GOLD'];
    const usdTry = results['USDTRY'];
    const gramGoldTRY = (comexGold * usdTry) / 31.1034768;
    latestPrices['ALTIN'] = parseFloat(gramGoldTRY.toFixed(2));
  } else if (results['GOLD'] !== null && results['USDTRY'] === null) {
    // If USD/TRY fails, use the last known or default rate of 32.5
    const comexGold = results['GOLD'];
    const gramGoldTRY = (comexGold * 32.5) / 31.1034768;
    latestPrices['ALTIN'] = parseFloat(gramGoldTRY.toFixed(2));
  }

  lastFetchTime = now;
  console.log(`[API] Prices updated successfully. ALTIN (Gram TRY): ${latestPrices['ALTIN']}`);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers for API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // API Route
  if (pathname === '/api/bist') {
    try {
      await updatePrices();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(latestPrices));
    } catch (e) {
      console.error("API error:", e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message, fallback: latestPrices }));
    }
    return;
  }

  if (pathname === '/api/news') {
    try {
      const news = await fetchBloombergNews();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(news));
    } catch (e) {
      console.error("News API error:", e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static File Server
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  // Security check to avoid directory traversal
  const relative = path.relative(__dirname, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Miras Oyunu v3.0.0 is running locally!`);
  console.log(`  Open your browser and navigate to:`);
  console.log(`  👉 http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
