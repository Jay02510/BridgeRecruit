import { NextRequest, NextResponse } from 'next/server';
import { summarizeThreadSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { corsHeaders } from '@/lib/cors';
import { getOpenAIClient } from '@/lib/openai/client';
import { THREAD_SUMMARIZER_SYSTEM_PROMPT } from '@/lib/openai/prompts';
import { threadSummaryResponseSchema, ThreadSummaryResponse } from '@/lib/openai/schemas';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/ai/summarize-thread
//
// Feature 1 of the PRD's LLM Architecture: 2-sentence thread summary,
// counselor interests, suggested follow-up cadence, and next action item —
// via OpenAI Structured Outputs (strict JSON schema mode).
export async function POST(request: NextRequest) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
  }

  const parsed = summarizeThreadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { thread_text } = parsed.data;

  // PRD LLM Resilience guardrail: minimal-text threads (e.g. "See you then")
  // degrade LLM output quality — fall back to plain truncation instead of
  // risking a hallucinated summary.
  const wordCount = thread_text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 15) {
    const fallback: ThreadSummaryResponse = {
      summary: thread_text.slice(0, 200),
      counselor_interests: [],
      suggested_followup_days: 7,
      suggested_action_item: 'Review thread manually — too short for reliable AI summary.',
    };
    return NextResponse.json(fallback, { status: 200, headers: corsHeaders() });
  }

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: THREAD_SUMMARIZER_SYSTEM_PROMPT },
        { role: 'user', content: thread_text },
      ],
      response_format: { type: 'json_schema', json_schema: threadSummaryResponseSchema },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty completion');

    const result: ThreadSummaryResponse = JSON.parse(raw);
    return NextResponse.json(result, { status: 200, headers: corsHeaders() });
  } catch (err) {
    // Strict schema validation / parse failure — discard malformed AI output
    // and tell the caller to fall back to manual note entry, per the PRD.
    return NextResponse.json(
      { error: 'AI summary unavailable', details: (err as Error).message },
      { status: 502, headers: corsHeaders() }
    );
  }
}
