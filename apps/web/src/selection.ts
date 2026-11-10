import type { Play, PlayerView } from '@leng/engine';
import { validatePlayOnView } from '@leng/engine';

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3, JOKER: 4 };

export function sortHand(view: PlayerView): string[] {
  return [...view.you.hand]
    .sort((a, b) => {
      if (a.suit !== b.suit) return (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9);
      return (a.rank as number) - (b.rank as number);
    })
    .map((c) => c.id);
}

/**
 * Interpret a multi-card selection into candidate engine plays, validated
 * against the redacted view. The server/engine re-validates for real.
 */
export function interpretSelection(view: PlayerView, selected: string[]): Play[] {
  if (selected.length === 0) return [];
  const cards = selected.map((id) => view.you.hand.find((c) => c.id === id)!);
  const candidates: Play[] = [];
  const push = (play: Play) => {
    if (!candidates.some((p) => JSON.stringify(p) === JSON.stringify(play))) candidates.push(play);
  };

  const orders: string[][] = [
    selected,
    [...cards].sort((a, b) => (a.rank as number) - (b.rank as number)).map((c) => c.id),
    [...cards]
      .sort((a, b) => {
        const av = a.rank === 1 ? 14 : (a.rank as number);
        const bv = b.rank === 1 ? 14 : (b.rank as number);
        return av - bv;
      })
      .map((c) => c.id),
  ];

  if (selected.length >= view.config.minRunLength) {
    for (const order of orders) {
      const play: Play = { kind: 'newRun', cardIds: order };
      if (validatePlayOnView(view, play).ok) push(play);
    }
  }
  if (selected.length >= view.config.minSetSize) {
    const setPlay: Play = { kind: 'newSet', cardIds: selected };
    if (validatePlayOnView(view, setPlay).ok) push(setPlay);
  }

  for (const group of view.table) {
    for (const order of orders) {
      const play: Play =
        group.kind === 'run'
          ? { kind: 'extendRun', groupId: group.id, cardIds: order }
          : { kind: 'extendSet', groupId: group.id, cardIds: order };
      if (validatePlayOnView(view, play).ok) push(play);
    }
  }
  return candidates;
}

