/**
 * Socket Singleton
 *
 * Problem with the old use-socket.ts:
 *   Each component that calls useSocket() gets a NEW socket.io connection.
 *   A page with 5 components = 5 WebSocket connections to the backend.
 *
 * Solution:
 *   One SocketContext holds a single connection per auth session.
 *   All components share it via useSocket().
 *   Connection is created once on auth, torn down on logout.
 *
 * NOTE: This file is .tsx (not .ts) because the Provider contains JSX.
 */

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';

// ─── Context ─────────────────────────────────────────────────────────────────

const SocketContext = createContext<Socket | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { isAuthenticated, accessToken } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      return;
    }

    const WS_URL =
      process.env.NEXT_PUBLIC_WS_URL ??
      (process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001');

    const newSocket: Socket = io(WS_URL, {
      auth:                 { token: accessToken },
      transports:           ['websocket', 'polling'],
      reconnection:         true,
      reconnectionAttempts: 10,
      reconnectionDelay:    1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor:  0.5,
    });

    if (process.env.NODE_ENV === 'development') {
      newSocket.on('connect',       () => console.debug('[WS] Connected:', newSocket.id));
      newSocket.on('disconnect',    (reason: string) => console.debug('[WS] Disconnected:', reason));
      newSocket.on('connect_error', (err: Error) => console.error('[WS] Error:', err.message));
    }

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, accessToken]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Returns the singleton Socket.io connection — null if not authenticated. */
export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

/**
 * Subscribe to a specific WebSocket event with automatic cleanup.
 * Uses a ref for the handler to avoid stale closure issues without
 * requiring useCallback on the caller side.
 */
export function useSocketEvent<T = unknown>(
  eventName: string,
  handler: (data: T) => void,
): void {
  const socket     = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;

    const stableHandler = (data: T) => handlerRef.current(data);
    socket.on(eventName, stableHandler);

    return () => {
      socket.off(eventName, stableHandler);
    };
  }, [socket, eventName]);
}
