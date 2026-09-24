// Supabase Edge Function entry point. Deploy with JWT verification off: callers send a
// GitHub token, not a Supabase key (see supabase/config.toml).
import { handle } from '../_shared/handler.ts';

Deno.serve(handle);
