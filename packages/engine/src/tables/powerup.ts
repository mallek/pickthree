export interface CostModifiers {
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
}

export interface PowerUpStep {
  stardust: number;
  candy: number;
  xlCandy: number;
}

export interface PowerUpTotal extends PowerUpStep {
  steps: number;
}

/** Cost of one half-level power-up starting at `from`. Source: Pokemon GO power-up table (2026). */
const BRACKETS: { from: number; stardust: number; candy: number; xl: number }[] = [
  { from: 1, stardust: 200, candy: 1, xl: 0 },
  { from: 3, stardust: 400, candy: 1, xl: 0 },
  { from: 5, stardust: 600, candy: 1, xl: 0 },
  { from: 7, stardust: 800, candy: 1, xl: 0 },
  { from: 9, stardust: 1000, candy: 1, xl: 0 },
  { from: 11, stardust: 1300, candy: 2, xl: 0 },
  { from: 13, stardust: 1600, candy: 2, xl: 0 },
  { from: 15, stardust: 1900, candy: 2, xl: 0 },
  { from: 17, stardust: 2200, candy: 2, xl: 0 },
  { from: 19, stardust: 2500, candy: 2, xl: 0 },
  { from: 21, stardust: 3000, candy: 3, xl: 0 },
  { from: 23, stardust: 3500, candy: 3, xl: 0 },
  { from: 25, stardust: 4000, candy: 3, xl: 0 },
  { from: 27, stardust: 4500, candy: 4, xl: 0 },
  { from: 29, stardust: 5000, candy: 4, xl: 0 },
  { from: 31, stardust: 6000, candy: 6, xl: 0 },
  { from: 33, stardust: 7000, candy: 8, xl: 0 },
  { from: 35, stardust: 8000, candy: 10, xl: 0 },
  { from: 37, stardust: 9000, candy: 12, xl: 0 },
  { from: 39, stardust: 10000, candy: 15, xl: 0 },
  { from: 40, stardust: 11000, candy: 0, xl: 10 },
  { from: 41, stardust: 12000, candy: 0, xl: 10 },
  { from: 42, stardust: 13000, candy: 0, xl: 12 },
  { from: 43, stardust: 14000, candy: 0, xl: 12 },
  { from: 44, stardust: 15000, candy: 0, xl: 15 },
  { from: 45, stardust: 16000, candy: 0, xl: 15 },
  { from: 46, stardust: 17000, candy: 0, xl: 17 },
  { from: 47, stardust: 18000, candy: 0, xl: 17 },
  { from: 48, stardust: 19000, candy: 0, xl: 20 },
  { from: 49, stardust: 20000, candy: 0, xl: 20 },
];

export function powerUpCost(fromLevel: number): PowerUpStep {
  if (fromLevel < 1 || fromLevel >= 50 || !Number.isInteger(fromLevel * 2)) {
    throw new RangeError(`power-up from level must be 1..49.5 in 0.5 steps, got ${fromLevel}`);
  }
  let bracket = BRACKETS[0] as (typeof BRACKETS)[number];
  for (const b of BRACKETS) {
    if (fromLevel >= b.from) {
      bracket = b;
    }
  }
  return { stardust: bracket.stardust, candy: bracket.candy, xlCandy: bracket.xl };
}

function applyMods(step: PowerUpStep, mods: CostModifiers): PowerUpStep {
  let dustMult = 1;
  let candyMult = 1;
  if (mods.shadow) {
    dustMult *= 1.2;
    candyMult *= 1.2;
  } else if (mods.purified) {
    dustMult *= 0.9;
    candyMult *= 0.9;
  }
  if (mods.lucky) {
    dustMult *= 0.5;
  }
  return {
    stardust: Math.ceil(step.stardust * dustMult),
    candy: Math.ceil(step.candy * candyMult),
    xlCandy: Math.ceil(step.xlCandy * candyMult),
  };
}

export function costToLevel(from: number, to: number, mods: CostModifiers): PowerUpTotal {
  const total: PowerUpTotal = { stardust: 0, candy: 0, xlCandy: 0, steps: 0 };
  if (to <= from) {
    return total;
  }
  for (let level = from; level < to; level += 0.5) {
    const step = applyMods(powerUpCost(level), mods);
    total.stardust += step.stardust;
    total.candy += step.candy;
    total.xlCandy += step.xlCandy;
    total.steps += 1;
  }
  return total;
}
