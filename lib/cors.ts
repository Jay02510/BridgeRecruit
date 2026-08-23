// The Outlook add-in taskpane runs on its own origin (localhost:3001 in dev,
// a separate hosted domain later) and calls this Next.js app's API routes
// cross-origin, so those routes need explicit CORS headers — same-origin
// dashboard fetches don't need this at all.
const ALLOWED_ORIGIN = process.env.ADDIN_ORIGIN ?? 'https://localhost:3001';

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}
