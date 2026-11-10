import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { OnlineController } from './controllers/online.js';

interface OnlineSessionValue {
  client: OnlineController | null;
  ensureClient: (playerName: string) => void;
  endSession: () => void;
}

const OnlineSessionContext = createContext<OnlineSessionValue | null>(null);

/**
 * Owns the single OnlineController for the whole session so that navigating
 * between the lobby and the game never tears down the socket.
 */
export function OnlineSessionProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<OnlineController | null>(null);
  const clientRef = useRef<OnlineController | null>(null);

  const ensureClient = useCallback((playerName: string) => {
    if (clientRef.current) return;
    const next = new OnlineController(playerName, OnlineController.storedIdentity() ?? undefined);
    clientRef.current = next;
    setClient(next);
  }, []);

  const endSession = useCallback(() => {
    clientRef.current?.dispose();
    clientRef.current = null;
    setClient(null);
  }, []);

  useEffect(() => () => clientRef.current?.dispose(), []);

  return (
    <OnlineSessionContext.Provider value={{ client, ensureClient, endSession }}>
      {children}
    </OnlineSessionContext.Provider>
  );
}

export function useOnlineSession(): OnlineSessionValue {
  const ctx = useContext(OnlineSessionContext);
  if (!ctx) throw new Error('useOnlineSession must be used inside OnlineSessionProvider');
  return ctx;
}
