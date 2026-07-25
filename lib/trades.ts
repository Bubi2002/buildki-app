export const TRADES = [
  { nr: 1, name: "Trockenbau" },
  { nr: 2, name: "Fliesen" },
  { nr: 3, name: "Elektro" },
  { nr: 4, name: "Sanitär" },
  { nr: 5, name: "Heizung/Klima" },
  { nr: 6, name: "Maler/Lackierer" },
  { nr: 7, name: "Bodenbelag" },
  { nr: 8, name: "Rohbau" },
  { nr: 9, name: "Dachdecker" },
  { nr: 10, name: "Fenster/Türen" },
  { nr: 11, name: "Schlosser/Metallbau" },
  { nr: 12, name: "Garten/Außenanlage" },
  { nr: 13, name: "Aufzug" },
  { nr: 14, name: "Brandschutz" },
  { nr: 15, name: "Schreiner" },
  { nr: 16, name: "Sonstiges" },
] as const;

export type TradeName = (typeof TRADES)[number]["name"];

export const TRADE_NAMES: readonly TradeName[] = TRADES.map((trade) => trade.name);

export function getTradeNumber(name: string): number {
  return TRADES.find((trade) => trade.name.toLocaleLowerCase("de-DE") === name.trim().toLocaleLowerCase("de-DE"))?.nr ?? 16;
}

export function getTradeName(number: number): TradeName {
  return TRADES.find((trade) => trade.nr === number)?.name ?? "Sonstiges";
}

export function formatTradeLabel(name: string): string {
  const number = getTradeNumber(name);
  const canonicalName = getTradeName(number);
  return `${number}. ${canonicalName}`;
}
