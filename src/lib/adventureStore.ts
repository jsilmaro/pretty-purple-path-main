// Persistent store for Adventure Mode: gems, level progress, inventory.
const KEY = "lila-adventure-store-v1";

export type CosmeticId =
  | "tint-default"
  | "tint-rose"
  | "tint-mint"
  | "tint-sky"
  | "acc-bow"
  | "acc-crown"
  | "trail-sparkle"
  | "trail-leaves";

export interface ShopItem {
  id: CosmeticId;
  name: string;
  emoji: string;
  price: number;
  category: "tint" | "accessory" | "trail";
  description: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "tint-default", name: "Lavender",   emoji: "💜", price: 0,   category: "tint",      description: "Lila's classic look." },
  { id: "tint-rose",    name: "Rose Petal", emoji: "🌹", price: 30,  category: "tint",      description: "Soft pink dress tint." },
  { id: "tint-mint",    name: "Mint Leaf",  emoji: "🌿", price: 30,  category: "tint",      description: "Fresh leafy green tint." },
  { id: "tint-sky",     name: "Sky Blue",   emoji: "🦋", price: 50,  category: "tint",      description: "Dreamy sky blue tint." },
  { id: "acc-bow",      name: "Hair Bow",   emoji: "🎀", price: 40,  category: "accessory", description: "A cute satin bow." },
  { id: "acc-crown",    name: "Crown",      emoji: "👑", price: 120, category: "accessory", description: "A royal touch." },
  { id: "trail-sparkle",name: "Sparkles",   emoji: "✨", price: 60,  category: "trail",     description: "A trail of sparkles." },
  { id: "trail-leaves", name: "Leaves",     emoji: "🍃", price: 60,  category: "trail",     description: "A trail of leaves." },
];

export interface LevelProgress {
  completed: boolean;
  bestTimeMs: number | null;
  gemsCollected: number; // best run
}

export interface AdventureStore {
  gems: number;
  owned: CosmeticId[];
  equipped: { tint: CosmeticId; accessory: CosmeticId | null; trail: CosmeticId | null };
  levels: Record<number, LevelProgress>;
  seenIntro?: boolean;
}

const DEFAULT: AdventureStore = {
  gems: 0,
  owned: ["tint-default"],
  equipped: { tint: "tint-default", accessory: null, trail: null },
  levels: {},
  seenIntro: false,
};

export const markIntroSeen = (s: AdventureStore): AdventureStore => {
  const next = { ...s, seenIntro: true };
  saveStore(next);
  return next;
};

export const loadStore = (): AdventureStore => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed, equipped: { ...DEFAULT.equipped, ...(parsed.equipped || {}) } };
  } catch {
    return { ...DEFAULT };
  }
};

export const saveStore = (s: AdventureStore) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const addGems = (s: AdventureStore, amount: number): AdventureStore => {
  const next = { ...s, gems: s.gems + amount };
  saveStore(next);
  return next;
};

export const recordLevelResult = (
  s: AdventureStore,
  level: number,
  timeMs: number,
  gems: number,
): AdventureStore => {
  const prev = s.levels[level];
  const bestTime = prev?.bestTimeMs == null ? timeMs : Math.min(prev.bestTimeMs, timeMs);
  const bestGems = Math.max(prev?.gemsCollected ?? 0, gems);
  const next: AdventureStore = {
    ...s,
    levels: {
      ...s.levels,
      [level]: { completed: true, bestTimeMs: bestTime, gemsCollected: bestGems },
    },
  };
  saveStore(next);
  return next;
};

export const buyItem = (s: AdventureStore, id: CosmeticId): AdventureStore | null => {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item) return null;
  if (s.owned.includes(id)) return null;
  if (s.gems < item.price) return null;
  const next: AdventureStore = {
    ...s,
    gems: s.gems - item.price,
    owned: [...s.owned, id],
  };
  saveStore(next);
  return next;
};

export const equipItem = (s: AdventureStore, id: CosmeticId): AdventureStore => {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item || !s.owned.includes(id)) return s;
  const next: AdventureStore = {
    ...s,
    equipped: {
      ...s.equipped,
      [item.category]: id,
    } as AdventureStore["equipped"],
  };
  saveStore(next);
  return next;
};

export const unequipCategory = (s: AdventureStore, category: "accessory" | "trail"): AdventureStore => {
  const next: AdventureStore = {
    ...s,
    equipped: { ...s.equipped, [category]: null },
  };
  saveStore(next);
  return next;
};

// Level definitions
export interface LevelDef {
  id: number;
  name: string;
  emoji: string;
  season: "spring" | "summer" | "autumn" | "winter";
  lengthTiles: number;
  timeLimitSec: number;
  scrollSpeed: number; // px/s of slow auto-scroll
  unlocked: boolean;
}

export const LEVELS: LevelDef[] = [
  { id: 1,  name: "Castle Garden",    emoji: "🌸", season: "spring", lengthTiles: 90,  timeLimitSec: 60,  scrollSpeed: 70,  unlocked: true },
  { id: 2,  name: "Sunny Meadows",    emoji: "☀️", season: "summer", lengthTiles: 110, timeLimitSec: 70,  scrollSpeed: 80,  unlocked: false },
  { id: 3,  name: "Whispering Woods", emoji: "🌳", season: "summer", lengthTiles: 120, timeLimitSec: 75,  scrollSpeed: 85,  unlocked: false },
  { id: 4,  name: "Golden Fields",    emoji: "🍂", season: "autumn", lengthTiles: 130, timeLimitSec: 80,  scrollSpeed: 90,  unlocked: false },
  { id: 5,  name: "Mushroom Glade",   emoji: "🍄", season: "autumn", lengthTiles: 140, timeLimitSec: 85,  scrollSpeed: 92,  unlocked: false },
  { id: 6,  name: "Crystal Forest",   emoji: "❄️", season: "winter", lengthTiles: 150, timeLimitSec: 90,  scrollSpeed: 100, unlocked: false },
  { id: 7,  name: "Frozen Lake",      emoji: "🧊", season: "winter", lengthTiles: 160, timeLimitSec: 95,  scrollSpeed: 105, unlocked: false },
  { id: 8,  name: "Dragon's Pass",    emoji: "🐉", season: "autumn", lengthTiles: 170, timeLimitSec: 95,  scrollSpeed: 108, unlocked: false },
  { id: 9,  name: "Cloud Kingdom",    emoji: "☁️", season: "spring", lengthTiles: 175, timeLimitSec: 98,  scrollSpeed: 110, unlocked: false },
  { id: 10, name: "Royal Keep",       emoji: "🏰", season: "spring", lengthTiles: 200, timeLimitSec: 110, scrollSpeed: 115, unlocked: false },
];

export const isLevelUnlocked = (s: AdventureStore, levelId: number): boolean => {
  if (levelId === 1) return true;
  return !!s.levels[levelId - 1]?.completed;
};
