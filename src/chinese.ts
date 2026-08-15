import OpenCC from "opencc-js";
import type { ChineseOutput } from "./settings.js";

const converters = {
  simplified: OpenCC.Converter({ from: "t", to: "cn" }),
  "traditional-taiwan": OpenCC.Converter({ from: "cn", to: "tw" }),
  "traditional-hong-kong": OpenCC.Converter({ from: "cn", to: "hk" }),
} satisfies Record<ChineseOutput, (text: string) => string>;

export function isChineseLanguage(language: string): boolean {
  const base = language.toLowerCase().split("-", 1)[0];
  return base === "zh" || base === "yue";
}

export function convertChineseOutput(text: string, output: ChineseOutput): string {
  return converters[output](text);
}

export function chineseOutputSummary(output: ChineseOutput): string {
  switch (output) {
    case "simplified":
      return "Simplified";
    case "traditional-taiwan":
      return "Traditional (Taiwan)";
    case "traditional-hong-kong":
      return "Traditional (Hong Kong)";
  }
}
