/**
 * Socket Singleton
 *
 * One SocketContext holds a single connection per auth session.
 * All components share it via useSocket().
 * Connection is created once on auth, torn down on logout.
 *
 * With cookie-based auth the access token is no longer available in JS state.
 * The socket.io initial HTTP handshake sends the access_token httpOnly cookie
 * automatically (withCredentials: true), so the NestJS gateway can validate it
 * the same way any other guarded route does.
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

const SocketContext = createContext<Socket | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
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
      // Sends the httpOnly cookies (access_token) on the HTTP upgrade handshake.
      withCredentials:      true,
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
    return () => { newSocket.disconnect(); };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

/** Returns the singleton Socket.io connection — null if not authenticated. */
export function useSocket(): Socket | null {
  return useContext(SocketContext);
}
