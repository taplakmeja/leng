import type { Play, PlayerView } from './types.js';
import { resolveNewRun, resolveNewSet, resolveRunExtension, validateExtendSet } from './validation.js';

/**
 * Validate a play against a redacted PlayerView only. Used by UIs to preview
 * legality; the authoritative engine re-validates every action regardless.
 */
export function validatePlayOnView(
  view: PlayerView,
  play: Play,
  /** Cards the player intends to use (must be a subset of their hand). */
): { ok: true } | { ok: false; error: string } {
  const hand = view.you.hand;
  const ids = new Set(hand.map((c) => c.id));
  for (const id of play.cardIds) {
    if (!ids.has(id)) return { ok: false, error: 'card not in hand' };
  }
  const cards = play.cardIds.map((id) => hand.find((c) => c.id === id)!);
  switch (play.kind) {
    case 'newRun':
      return unwrap(resolveNewRun(cards, view.config));
    case 'newSet':
      return unwrap(resolveNewSet(cards, view.config));
    case 'extendRun': {
      const group = view.table.find((g) => g.id === play.groupId);
      if (!group || group.kind !== 'run') return { ok: false, error: 'run not found' };
      return unwrap(resolveRunExtension(group, cards, view.config));
    }
    case 'extendSet': {
      const group = view.table.find((g) => g.id === play.groupId);
      if (!group || group.kind !== 'set') return { ok: false, error: 'set not found' };
      return unwrap(validateExtendSet(group, cards, view.config));
    }
  }
}

function unwrap(res: { ok: true } | { ok: false; error: string }): { ok: true } | { ok: false; error: string } {
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
