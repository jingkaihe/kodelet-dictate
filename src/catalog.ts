export type CatalogModel = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly repository: string;
  readonly revision: string;
  readonly license: string;
  readonly family: string;
  readonly parameters: string;
  readonly languages: readonly string[];
  readonly capabilities: {
    readonly streaming: boolean;
    readonly translate: boolean;
    readonly languageDetection: boolean;
  };
  readonly speedScore: number;
  readonly accuracyScore: number;
  readonly recommended: boolean;
  readonly recommendedRank: number | null;
  readonly quant: string;
  readonly filename: string;
  readonly size: number;
  readonly sha256: string;
};

const WHISPER_LANGUAGES = [
  "af",
  "am",
  "ar",
  "as",
  "az",
  "ba",
  "be",
  "bg",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fo",
  "fr",
  "gl",
  "gu",
  "haw",
  "ha",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jw",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "la",
  "lb",
  "ln",
  "lo",
  "lt",
  "lv",
  "mg",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "ne",
  "nl",
  "nn",
  "no",
  "oc",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sa",
  "sd",
  "si",
  "sk",
  "sl",
  "sn",
  "so",
  "sq",
  "sr",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "tk",
  "tl",
  "tr",
  "tt",
  "uk",
  "ur",
  "uz",
  "vi",
  "yi",
  "yo",
  "zh",
] as const;

export const CATALOG_MODELS = [
  {
    id: "parakeet-unified-en-0.6b",
    name: "Parakeet Unified EN 0.6B",
    description: "Fast, accurate English transcription",
    repository: "handy-computer/parakeet-unified-en-0.6b-gguf",
    revision: "7e948f21b7bdbac698d3318db9d350f1096f3b6c",
    license: "cc-by-4.0",
    family: "parakeet",
    parameters: "0.6B",
    languages: ["en"],
    capabilities: { streaming: true, translate: false, languageDetection: false },
    speedScore: 79,
    accuracyScore: 90,
    recommended: true,
    recommendedRank: 1,
    quant: "Q8_0",
    filename: "parakeet-unified-en-0.6b-Q8_0.gguf",
    size: 731357568,
    sha256: "4b50b6dd862bf6e346929aaf4f5eaacec003bfa3f56462d6c874b41ef2f38795",
  },
  {
    id: "nemotron-3.5-asr-streaming-0.6b",
    name: "Nemotron Streaming 3.5",
    description: "Fast multilingual transcription with automatic language detection",
    repository: "handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf",
    revision: "6d44e540bc31b0de1dbe174a3cea87f53a7f22fb",
    license: "other",
    family: "nemotron",
    parameters: "0.6B",
    languages: [
      "en-US",
      "en-GB",
      "es-US",
      "es-ES",
      "fr-FR",
      "fr-CA",
      "it-IT",
      "pt-BR",
      "pt-PT",
      "nl-NL",
      "de-DE",
      "tr-TR",
      "ru-RU",
      "ar-AR",
      "hi-IN",
      "ja-JP",
      "ko-KR",
      "vi-VN",
      "uk-UA",
      "pl-PL",
      "sv-SE",
      "cs-CZ",
      "nb-NO",
      "da-DK",
      "bg-BG",
      "fi-FI",
      "hr-HR",
      "sk-SK",
      "zh-CN",
      "hu-HU",
      "ro-RO",
      "et-EE",
    ],
    capabilities: { streaming: true, translate: false, languageDetection: true },
    speedScore: 84,
    accuracyScore: 82,
    recommended: true,
    recommendedRank: 2,
    quant: "Q8_0",
    filename: "nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf",
    size: 751094240,
    sha256: "b94545b313b3223fda7b2857a52681da813935c2127643d1e9ff0c23d988089c",
  },
  {
    id: "canary-180m-flash",
    name: "Canary 180M Flash",
    description: "Small and fast for English, German, Spanish, and French",
    repository: "handy-computer/canary-180m-flash-gguf",
    revision: "b147f9dc52b59f0998e410540a84727bd86457fd",
    license: "cc-by-4.0",
    family: "canary",
    parameters: "180M",
    languages: ["en", "de", "es", "fr"],
    capabilities: { streaming: false, translate: true, languageDetection: false },
    speedScore: 98,
    accuracyScore: 88,
    recommended: true,
    recommendedRank: 3,
    quant: "Q8_0",
    filename: "canary-180m-flash-Q8_0.gguf",
    size: 218447552,
    sha256: "e13c7f5d0952b056a027cfffec13e3a3a134d1608babed24f983568f141e297c",
  },
  {
    id: "cohere-transcribe-03-2026",
    name: "Cohere Transcribe",
    description: "High accuracy across 14 languages, with slower inference",
    repository: "handy-computer/cohere-transcribe-03-2026-gguf",
    revision: "dfa4adebb64f3076b7b6b90b721275cc069cb421",
    license: "apache-2.0",
    family: "cohere",
    parameters: "2.0B",
    languages: ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "el", "ar", "ja", "zh", "vi", "ko"],
    capabilities: { streaming: false, translate: false, languageDetection: false },
    speedScore: 63,
    accuracyScore: 92,
    recommended: true,
    recommendedRank: 4,
    quant: "Q5_K_M",
    filename: "cohere-transcribe-03-2026-Q5_K_M.gguf",
    size: 1770270208,
    sha256: "14d02f1ad6dd77b3a60f82639879012c3adb4fe25c50a5a47a2c4c661daf1558",
  },
  {
    id: "whisper-medium",
    name: "Whisper Medium",
    description: "Broad language coverage with good accuracy",
    repository: "handy-computer/whisper-medium-gguf",
    revision: "ec78f06fded51aa82cde751678b78f76f78c8b7f",
    license: "apache-2.0",
    family: "whisper",
    parameters: "764M",
    languages: WHISPER_LANGUAGES,
    capabilities: { streaming: false, translate: true, languageDetection: true },
    speedScore: 42,
    accuracyScore: 84,
    recommended: true,
    recommendedRank: 5,
    quant: "Q8_0",
    filename: "whisper-medium-Q8_0.gguf",
    size: 831538144,
    sha256: "09e6a65e7de377aa5b10bae24608bc6f8ca2ed04b3993ef10d4a02bcd9a82adf",
  },
  {
    id: "Qwen3-ASR-0.6B",
    name: "Qwen3-ASR 0.6B",
    description: "Strong multilingual transcription with automatic detection",
    repository: "handy-computer/Qwen3-ASR-0.6B-gguf",
    revision: "e4e16599b900eb0cb36e524514756bb92eb092b7",
    license: "apache-2.0",
    family: "qwen3",
    parameters: "782M",
    languages: ["zh", "en", "yue", "ar", "de", "fr", "es", "pt", "id", "it", "ko", "ru", "th", "vi", "ja", "tr", "hi", "ms", "nl", "sv", "da", "fi", "pl", "cs", "fil", "fa", "el", "ro", "hu", "mk"],
    capabilities: { streaming: false, translate: false, languageDetection: true },
    speedScore: 63,
    accuracyScore: 87,
    recommended: false,
    recommendedRank: 9,
    quant: "Q8_0",
    filename: "Qwen3-ASR-0.6B-Q8_0.gguf",
    size: 850423456,
    sha256: "f081b2d5e23bd669d92cc331d722a8a0681943b8e6f34b48996fd5c319b5acd8",
  },
  {
    id: "moonshine-base",
    name: "Moonshine Base",
    description: "Very small and fast English transcription",
    repository: "handy-computer/moonshine-base-gguf",
    revision: "3ef112378a8cf46ac8b278d9bfa2d15c846704b8",
    license: "mit",
    family: "moonshine",
    parameters: "62M",
    languages: ["en"],
    capabilities: { streaming: false, translate: false, languageDetection: false },
    speedScore: 99,
    accuracyScore: 80,
    recommended: false,
    recommendedRank: null,
    quant: "Q8_0",
    filename: "moonshine-base-Q8_0.gguf",
    size: 77476480,
    sha256: "7f0027dfd857d310b63a85ef57cadf183da712cc374f85a648f8bc18aaa2efc8",
  },
  {
    id: "SenseVoiceSmall",
    name: "SenseVoice Small",
    description: "Small model for Chinese, Cantonese, English, Japanese, and Korean",
    repository: "handy-computer/SenseVoiceSmall-gguf",
    revision: "4a08b8e900b38a977e32eb08d5d0697d6e72ba04",
    license: "other",
    family: "sensevoice",
    parameters: "234M",
    languages: ["zh", "yue", "en", "ja", "ko"],
    capabilities: { streaming: false, translate: false, languageDetection: true },
    speedScore: 98,
    accuracyScore: 81,
    recommended: false,
    recommendedRank: null,
    quant: "Q8_0",
    filename: "SenseVoiceSmall-Q8_0.gguf",
    size: 252684608,
    sha256: "6c759ee4c9748c9b3f7a5a60ca74f0f7e685fb9d45d1378fce7cfd62f59adf29",
  },
  {
    id: "whisper-tiny",
    name: "Whisper Tiny",
    description: "Smallest broad-language Whisper model",
    repository: "handy-computer/whisper-tiny-gguf",
    revision: "6687f30c99641ee265df421e582354adbc8848fc",
    license: "apache-2.0",
    family: "whisper",
    parameters: "38M",
    languages: WHISPER_LANGUAGES,
    capabilities: { streaming: false, translate: true, languageDetection: true },
    speedScore: 100,
    accuracyScore: 61,
    recommended: false,
    recommendedRank: null,
    quant: "Q8_0",
    filename: "whisper-tiny-Q8_0.gguf",
    size: 45981088,
    sha256: "325b9c7997cd1eff81ef709d55766565e71be696130cc3a3d444713798706834",
  },
  {
    id: "whisper-base",
    name: "Whisper Base",
    description: "Lightweight broad-language Whisper model",
    repository: "handy-computer/whisper-base-gguf",
    revision: "e0f69524f648720eca44c024d1d0dbb7027d1fa0",
    license: "apache-2.0",
    family: "whisper",
    parameters: "73M",
    languages: WHISPER_LANGUAGES,
    capabilities: { streaming: false, translate: true, languageDetection: true },
    speedScore: 99,
    accuracyScore: 71,
    recommended: false,
    recommendedRank: null,
    quant: "Q8_0",
    filename: "whisper-base-Q8_0.gguf",
    size: 84962880,
    sha256: "81c069428bc8a24551a8169cf31cf09bcfd9d4cf50389ae281323c9aa9648c81",
  },
] as const satisfies readonly CatalogModel[];

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const COMMON_PREFERRED_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "zh",
  "ja",
  "pt",
  "it",
  "ko",
  "ru",
  "ar",
  "hi",
] as const;

export function canonicalLanguage(language: string): string {
  return language
    .trim()
    .replace(/^(?:…|\.{3})+/u, "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-", 1)[0] ?? "";
}

export function displayLanguage(language: string): string {
  try {
    return languageNames.of(language) ?? language;
  } catch {
    return language;
  }
}

export function formatBinarySize(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GiB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

export function getCatalogModel(id: string): CatalogModel | undefined {
  return CATALOG_MODELS.find((model) => model.id === id);
}

export function modelMatchesLanguage(model: CatalogModel, language: string): boolean {
  const wanted = canonicalLanguage(language);
  return model.languages.some((supported) => canonicalLanguage(supported) === wanted);
}

export function systemPreferredLanguage(): string {
  const locale = canonicalLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
  return CATALOG_MODELS.some((model) => modelMatchesLanguage(model, locale)) ? locale : "en";
}

export function preferredLanguageOptions(initial: string): string[] {
  const preferred = canonicalLanguage(initial);
  return [...new Set([preferred, ...COMMON_PREFERRED_LANGUAGES])].filter(
    (language) =>
      language && CATALOG_MODELS.some((model) => modelMatchesLanguage(model, language)),
  );
}

export function rankCatalogModels(
  models: readonly CatalogModel[],
  preferredLanguage: string,
  isDownloaded: (model: CatalogModel) => boolean = () => false,
): CatalogModel[] {
  return [...models].sort(
    (left, right) =>
      Number(modelMatchesLanguage(right, preferredLanguage)) -
        Number(modelMatchesLanguage(left, preferredLanguage)) ||
      Number(isDownloaded(right)) - Number(isDownloaded(left)) ||
      (left.recommendedRank ?? Number.MAX_SAFE_INTEGER) -
        (right.recommendedRank ?? Number.MAX_SAFE_INTEGER) ||
      Number(right.recommended) - Number(left.recommended) ||
      right.accuracyScore - left.accuracyScore ||
      right.speedScore - left.speedScore ||
      left.name.localeCompare(right.name),
  );
}

export function resolveModelLanguage(
  model: CatalogModel,
  requested: string,
): string | undefined {
  const normalized = requested.trim().replaceAll("_", "-");
  if (normalized.toLowerCase() === "auto") {
    return model.capabilities.languageDetection ? "auto" : undefined;
  }

  const exact = model.languages.find(
    (language) => language.toLowerCase() === normalized.toLowerCase(),
  );
  if (exact) return exact;

  const wanted = canonicalLanguage(normalized);
  return model.languages.find((language) => canonicalLanguage(language) === wanted);
}

export function defaultTranscriptionLanguage(
  model: CatalogModel,
  preferredLanguage: string,
): string {
  if (model.capabilities.languageDetection) return "auto";
  return resolveModelLanguage(model, preferredLanguage) ?? model.languages[0] ?? "en";
}

export function languageChoiceLabel(language: string): string {
  if (language === "auto") return "Automatic language detection";
  return `${displayLanguage(language)} [${language}]`;
}
