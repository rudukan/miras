const https = require('https');

function testFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data.substring(0, 200) });
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function main() {
  const proxies = [
    { name: "codetabs", url: "https://api.codetabs.com/v1/proxy?quest=https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS" },
    { name: "corsproxy.io", url: "https://corsproxy.io/?https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS" },
    { name: "allorigins", url: "https://api.allorigins.win/get?url=" + encodeURIComponent("https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS") }
  ];

  for (let proxy of proxies) {
    console.log(`Testing ${proxy.name}...`);
    try {
      const res = await testFetch(proxy.url);
      console.log(`${proxy.name} response code:`, res.status);
      if (res.json) {
        // allorigins wraps inside contents
        let contentsJson = res.json;
        if (proxy.name === "allorigins" && res.json.contents) {
          try { contentsJson = JSON.parse(res.json.contents); } catch (e) {}
        }
        console.log(`${proxy.name} success:`, contentsJson.chart ? "Price is " + contentsJson.chart.result[0].meta.regularMarketPrice : "No chart data in JSON: " + JSON.stringify(res.json).substring(0, 150));
      } else {
        console.log(`${proxy.name} raw head:`, res.raw);
      }
    } catch (e) {
      console.error(`${proxy.name} error:`, e.message, e.code);
    }
  }
}

main();
