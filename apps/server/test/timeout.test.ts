import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, getView } from '@leng/engine';
import { addAI, createRoom, handleTimeout, runAI, startMatch } from '../src/room.js';

describe('timeout autoplay at room level', () => {
  it('terminates a match under repeated timeouts', () => {
    const room = createRoom('TEST1', { playerId: 'host', name: 'Host', token: 't' }, true, 4);
    addAI(room, 'B1', 'easy');
    addAI(room, 'B2', 'normal');
    addAI(room, 'B3', 'hard');
    const config = { ...DEFAULT_RULES, turnTimeoutMs: 10, turnTimeoutAction: 'autoPlay' as const };
    expect(startMatch(room, config, 123)).toBe(true);
    let guard = 0;
    const hooks = {
      onRoomUpdated: () => {},
      onPlayerView: () => {},
      onMatchFinished: () => {},
      onRoomClosed: () => {},
      onKick: () => {},
    };
    while (room.state && room.state.phase !== 'matchOver' && guard++ < 3000) {
      runAI(room);
      if (room.state.phase !== 'round1' && room.state.phase !== 'round2') break;
      handleTimeout(room, hooks);
    }
    expect(room.state?.phase).toBe('matchOver');
    expect(guard).toBeLessThan(3000);
    const view = getView(room.state!, 'host');
    expect(view.results.length).toBeGreaterThan(0);
  });
});
