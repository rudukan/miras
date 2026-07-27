/**
 * LTTB (Largest-Triangle-Three-Buckets) — görsel seyreltme.
 *
 * Neden: 1G serisi FX'te ~1140 noktaya çıkıyor, popover canvas'ı 274px. Piksel başına
 * 4 nokta çizmek bilgi taşımıyor, yalnızca üst üste binen mürekkep üretiyor ("gürültü").
 * LTTB her kovadan, komşularıyla EN BÜYÜK üçgeni kuran noktayı seçer — tepe/dip ve dönüş
 * noktaları hayatta kalır. Hareketli ortalama gibi fiyatı DEĞİŞTİRMEZ; sadece hangi
 * gerçek noktaların çizileceğini seçer.
 *
 * Fiyat değil INDEKS döndürür: seyreltilmiş noktalar x ekseninde kendi orijinal
 * yerlerinde durmalı (x = i/(n-1)*w). Fiyat dizisi dönseydi bu konum bilgisi kaybolurdu.
 *
 * x ekseni eşit aralıklı kabul edilir (computeChartGeometry'nin indeks-tabanlı x'i ile
 * aynı varsayım), bu yüzden üçgen alanında x yerine indeks kullanılır.
 *
 * @returns artan sıralı, tekrarsız indeksler; 0 ve n-1 her zaman dahil.
 *          Seyreltme gerekmiyorsa (eşik >= n) ya da eşik < 3 ise tüm indeksler.
 */
export function lttbIndices(values: ReadonlyArray<number>, threshold: number): number[] {
	const n = values.length;
	if (n === 0) return [];
	if (threshold >= n || threshold < 3) return values.map((_, i) => i);

	const out: number[] = [0];
	const every = (n - 2) / (threshold - 2);
	let a = 0; // son seçilen nokta — üçgenin sol köşesi

	for (let i = 0; i < threshold - 2; i++) {
		// Üçgenin sağ köşesi: BİR SONRAKİ kovanın ağırlık merkezi.
		const avgStart = Math.floor((i + 1) * every) + 1;
		const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
		let avgX = 0;
		let avgY = 0;
		for (let j = avgStart; j < avgEnd; j++) {
			avgX += j;
			avgY += values[j];
		}
		const count = avgEnd - avgStart;
		avgX /= count;
		avgY /= count;

		// Bu kovada en büyük üçgeni kuran noktayı seç.
		const rangeStart = Math.floor(i * every) + 1;
		const rangeEnd = Math.floor((i + 1) * every) + 1;
		const ax = a;
		const ay = values[a];
		let maxArea = -1;
		let next = rangeStart;
		for (let j = rangeStart; j < rangeEnd; j++) {
			const area = Math.abs((ax - avgX) * (values[j] - ay) - (ax - j) * (avgY - ay));
			if (area > maxArea) {
				maxArea = area;
				next = j;
			}
		}
		out.push(next);
		a = next;
	}

	out.push(n - 1);
	return out;
}
