import { describe, it, expect } from 'vitest';
import { parseSymbolList, MAX_SYMBOLS } from './symbolLimit';

describe('parseSymbolList', () => {
  it('null/boş → []', () => {
    expect(parseSymbolList(null)).toEqual([]);
    expect(parseSymbolList('')).toEqual([]);
  });

  it('böler, trimler, büyük harfe çevirir, boşları atar', () => {
    expect(parseSymbolList(' aapl , ,msft ')).toEqual(['AAPL', 'MSFT']);
  });

  it(`listeyi MAX_SYMBOLS (${MAX_SYMBOLS}) ile sınırlar — amplifikasyon savunması`, () => {
    const many = Array.from({ length: MAX_SYMBOLS + 20 }, (_, i) => `S${i}`).join(',');
    expect(parseSymbolList(many)).toHaveLength(MAX_SYMBOLS);
  });
});
