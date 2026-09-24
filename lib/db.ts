import WebSocket from 'ws';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import { createClient } from '@supabase/supabase-js';
import { required } from './config';
export function db() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
}
export function assertDb(error: { code?: string } | null) {
  if (error) throw new Error('Database operation failed: ' + (error.code || 'unknown'));
}
