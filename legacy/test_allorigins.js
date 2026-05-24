const https = require('https');

function testFetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve({ status: res.statusCode, raw: data.substring(0, 200) });
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function main() {
  console.log("Testing Yahoo Finance fetch via api.allorigins.win...");
  try {
    const targetUrl = encodeURIComponent("https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS?range=1d&interval=1m");
    const res = await testFetch(`https://api.allorigins.win/get?url=${targetUrl}`);
    if (res.contents) {
      try {
        const contentsJson = JSON.parse(res.contents);
        console.log("allorigins status: OK", contentsJson.chart ? "Price: " + contentsJson.chart.result[0].meta.regularMarketPrice : "FAILED: " + JSON.stringify(contentsJson));
      } catch (e) {
        console.log("allorigins status: OK but contents not JSON", res.contents.substring(0, 200));
      }
    } else {
      console.log("allorigins FAILED:", JSON.stringify(res));
    }
  } catch (e) {
    console.error("allorigins error:", e.message);
  }
}

main();
