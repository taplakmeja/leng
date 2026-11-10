import type { Card, LengRulesConfig, RunEntry, Suit, TableGroup, Rank } from './types.js';
import { isWild } from './types.js';

export type Valid<T> = { ok: true; value: T };
export type Invalid = { ok: false; error: string };

export function ok<T>(value: T): Valid<T> {
  return { ok: true, value };
}
export function bad(error: string): Invalid {
  return { ok: false, error };
}

function aceCandidates(card: Card): number[] {
  return card.rank === 1 ? [1, 14] : [card.rank as number];
}

/**
 * Resolve effective ordinals for a candidate NEW run laid in the given order.
 * Aces are low (1) or high (14); wilds fill the slot implied by their position.
 * docs/RULES.md: card order, ambiguities A1 (wild limit).
 */
export function resolveNewRun(
  cards: Card[],
  config: LengRulesConfig,
): Valid<RunEntry[]> | Invalid {
  if (cards.length < config.minRunLength) {
    return bad(`a run needs at least ${config.minRunLength} cards`);
  }
  const wilds = cards.filter(isWild);
  if (!config.allowWildsInRuns && wilds.length > 0) {
    return bad('wild cards cannot be used in runs under current rules');
  }
  if (wilds.length > config.maxWildsPerRun) {
    return bad(`at most ${config.maxWildsPerRun} wild card(s) per run`);
  }
  const concrete = cards.filter((c) => !isWild(c));
  if (concrete.length === 0) return bad('a run needs at least one non-wild card');

  const suits = new Set(concrete.map((c) => c.suit));
  if (suits.size !== 1) return bad('all cards in a run must share the same suit');
  const suit = concrete[0]!.suit as Suit;

  // Brute-force ace low/high assignments (at most a handful of aces possible).
  const aceIndexes = concrete.reduce<number[]>((acc, c, i) => {
    if (isWild(c) === false && c.rank === 1) acc.push(i);
    return acc;
  }, []);
  const assignments: number[][] = [[]];
  for (let i = 0; i < aceIndexes.length; i++) {
    const doubled: number[][] = [];
    for (const base of assignments) {
      doubled.push([...base, 1], [...base, 14]);
    }
    assignments.length = 0;
    assignments.push(...doubled);
  }

  for (const assignment of assignments) {
    const positions: number[] = [];
    const concreteOrdinals: number[] = [];
    concrete.forEach((c) => {
      const position = cards.indexOf(c);
      positions.push(position);
      const ai = aceIndexes.indexOf(concrete.indexOf(c));
      concreteOrdinals.push(ai >= 0 ? assignment[ai]! : (c.rank as number));
    });
    if (new Set(concreteOrdinals).size !== concreteOrdinals.length) continue;
    let start: number | null = null;
    let valid = true;
    for (let i = 0; i < concreteOrdinals.length; i++) {
      const s = concreteOrdinals[i]! - positions[i]!;
      if (start === null) start = s;
      else if (start !== s) valid = false;
    }
    if (!valid || start === null) continue;
    if (start < 1 || start + cards.length - 1 > 14) continue;
    if (start === 1 && cards.length === 14) continue; // A-2..K-A wrap forbidden
    const entries: RunEntry[] = cards.map((card, position) => ({
      card,
      ordinal: start! + position,
    }));
    return ok(entries);
  }
  return bad('cards do not form a consecutive same-suit run');
}

/**
 * Validate extending an existing table run with new cards (any order).
 * New concrete cards must sit below the run's low end or above its high end;
 * wilds fill remaining gaps, anchoring toward concrete cards (assumption A9).
 * The run's existing entries are immutable (ambiguity A3).
 */
export function resolveRunExtension(
  group: Extract<TableGroup, { kind: 'run' }>,
  newCards: Card[],
  config: LengRulesConfig,
): Valid<RunEntry[]> | Invalid {
  if (newCards.length === 0) return bad('no cards to extend with');
  const existing = group.entries;
  const existingWilds = existing.filter((e) => isWild(e.card)).length;
  const newWilds = newCards.filter(isWild);
  const concretes = newCards.filter((c) => !isWild(c));
  if (!config.allowWildsInRuns && newWilds.length > 0) {
    return bad('wild cards cannot be used in runs under current rules');
  }
  if (existingWilds + newWilds.length > config.maxWildsPerRun) {
    return bad(`at most ${config.maxWildsPerRun} wild card(s) per run`);
  }
  if (concretes.length === 0) {
    return bad('extending with only wild cards is not supported');
  }
  for (const c of concretes) {
    if (c.suit !== group.suit) return bad('extension cards must match the run suit');
  }

  const total = existing.length + newCards.length;
  if (total > 14) return bad('run cannot exceed 14 cards');
  const min = Math.min(...existing.map((e) => e.ordinal));
  const max = Math.max(...existing.map((e) => e.ordinal));

  // Resolve each concrete card (aces have two candidates); collect placements.
  const placements: { card: Card; ordinal: number }[] = [];
  const ambiguousAces: Card[] = [];
  for (const card of concretes) {
    const options = aceCandidates(card).filter(
      (o) =>
        (o < min && o >= min - newCards.length) ||
        (o > max && o <= max + newCards.length),
    );
    if (options.length === 0) return bad(`${card.id} does not fit the run`);
    if (options.length === 1) {
      placements.push({ card, ordinal: options[0]! });
    } else {
      ambiguousAces.push(card);
    }
  }
  // Resolve ambiguous aces: try combinations, require exactly one consistent fit.
  if (ambiguousAces.length > 0) {
    let found: number[] | null = null;
    const combos: number[][] = [[]];
    for (let i = 0; i < ambiguousAces.length; i++) {
      const doubled: number[][] = [];
      for (const base of combos) doubled.push([...base, 1], [...base, 14]);
      combos.length = 0;
      combos.push(...doubled);
    }
    for (const combo of combos) {
      const ordinals = combo.map((o) => o);
      const all = [...placements.map((p) => p.ordinal), ...ordinals];
      if (new Set(all).size !== all.length) continue;
      if (all.every((o) => (o < min && o >= min - newCards.length) || (o > max && o <= max + newCards.length))) {
        if (found !== null) return bad('ambiguous extension');
        found = ordinals;
      }
    }
    if (found === null) return bad('extension does not fit the run');
    ambiguousAces.forEach((card, i) => placements.push({ card, ordinal: found![i]! }));
  }
  if (new Set(placements.map((p) => p.ordinal)).size !== placements.length) {
    return bad('duplicate card rank in extension');
  }

  // Wilds fill missing slots toward concrete anchors.
  const used = new Set(placements.map((p) => p.ordinal));
  const newMin = Math.min(min, ...placements.map((p) => p.ordinal));
  const newMax = Math.max(max, ...placements.map((p) => p.ordinal));
  const missing: number[] = [];
  const allExisting = new Set(existing.map((e) => e.ordinal));
  for (let o = newMin; o <= newMax; o++) {
    if (!allExisting.has(o) && !used.has(o)) missing.push(o);
  }
  const hasLow = placements.some((p) => p.ordinal < min);
  const hasHigh = placements.some((p) => p.ordinal > max);
  let wildEntries: RunEntry[] = [];
  if (newWilds.length > 0) {
    const need = missing.length;
    const extra = newWilds.length - need;
    if (extra < 0) return bad('wild cards do not fit the run');
    if (extra > 0) {
      if (hasLow && hasHigh) return bad('ambiguous wild placement');
      // Stack outward on the anchored side.
      if (hasHigh || (!hasLow && newMin === min)) {
        for (let i = 1; i <= extra; i++) missing.push(newMax + i);
      } else {
        for (let i = 1; i <= extra; i++) missing.push(newMin - i);
      }
    }
    if (missing.some((o) => o < 1 || o > 14)) return bad('run out of card range');
    if (new Set(missing).size !== missing.length) return bad('wild placement conflict');
    wildEntries = newWilds.map((card, i) => ({ card, ordinal: missing[i]! }));
  }

  const entries = [...existing, ...placements.map((p) => ({ card: p.card, ordinal: p.ordinal })), ...wildEntries];
  const ordinals = entries.map((e) => e.ordinal).sort((a, b) => a - b);
  for (let i = 1; i < ordinals.length; i++) {
    if (ordinals[i]! !== ordinals[i - 1]! + 1) return bad('extension breaks run continuity');
  }
  if (ordinals[0] === 1 && ordinals[ordinals.length - 1] === 14) {
    return bad('run cannot wrap A-2..K-A');
  }
  return ok(entries);
}

/** POK set: 3+ cards of the same rank, any suits. Wilds per config (A2). */
export function resolveNewSet(
  cards: Card[],
  config: LengRulesConfig,
): Valid<{ rank: Rank; cards: Card[] }> | Invalid {
  if (cards.length < config.minSetSize) {
    return bad(`a set needs at least ${config.minSetSize} cards`);
  }
  const wilds = cards.filter(isWild);
  if (wilds.length > 0 && !config.allowWildsInSets) {
    return bad('wild cards cannot be used in sets');
  }
  const naturals = cards.filter((c) => !isWild(c));
  if (naturals.length === 0) return bad('a set needs at least one non-wild card');
  const rank = naturals[0]!.rank as Rank;
  if (naturals.some((c) => c.rank !== rank)) return bad('all cards in a set must share the same rank');
  return ok({ rank, cards });
}

export function validateExtendSet(
  group: Extract<TableGroup, { kind: 'set' }>,
  newCards: Card[],
  config: LengRulesConfig,
): Valid<Card[]> | Invalid {
  if (newCards.length === 0) return bad('no cards to extend with');
  for (const card of newCards) {
    if (isWild(card) && !config.allowWildsInSets) return bad('wild cards cannot be used in sets');
    if (!isWild(card) && card.rank !== group.rank) {
      return bad('extension cards must match the set rank');
    }
  }
  return ok([...group.cards, ...newCards]);
}

/** Penalty value of a card left in hand at deal end (docs/RULES.md scoring). */
export function cardPenalty(card: Card, config: LengRulesConfig): number {
  if (card.suit === 'JOKER') return config.penalty.joker;
  if (card.rank === 1) {
    return card.suit === 'S' ? config.penalty.aceOfSpades : config.penalty.ace;
  }
  if (card.rank >= 11) return config.penalty.face;
  return card.rank as number;
}
