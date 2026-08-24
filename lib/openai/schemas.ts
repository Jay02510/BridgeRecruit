// JSON Schemas for OpenAI Structured Outputs, ported verbatim from the PRD's
// "LLM Smart Features: Prompts, Schemas & Functions" section.

export const threadSummaryResponseSchema = {
  name: 'thread_summary_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '2-sentence factual summary of what was discussed and agreed upon.',
      },
      counselor_interests: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific academic programs, scholarships, or logistical questions mentioned.',
      },
      suggested_followup_days: {
        type: 'integer',
        description: 'Recommended follow-up cadence (e.g., 3, 7, 14 days).',
      },
      suggested_action_item: {
        type: 'string',
        description: 'Clear imperative action item for the recruiter.',
      },
    },
    required: ['summary', 'counselor_interests', 'suggested_followup_days', 'suggested_action_item'],
    additionalProperties: false,
  },
} as const;

export interface ThreadSummaryResponse {
  summary: string;
  counselor_interests: string[];
  suggested_followup_days: number;
  suggested_action_item: string;
}

export const reengagementDraftResponseSchema = {
  name: 'reengagement_draft_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      subject_line: {
        type: 'string',
        description: 'Engaging, professional subject line referencing previous discussion.',
      },
      email_body: {
        type: 'string',
        description: 'Ready-to-send email body with proper greeting, value proposition, and CTA.',
      },
    },
    required: ['subject_line', 'email_body'],
    additionalProperties: false,
  },
} as const;

export interface ReengagementDraftResponse {
  subject_line: string;
  email_body: string;
}

export const partnershipReportResponseSchema = {
  name: 'partnership_report_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'One-sentence executive headline for the period (the single most important takeaway).',
      },
      highlights: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 short bullet points: notable wins, new partnerships, or momentum this period.',
      },
      narrative: {
        type: 'string',
        description: 'A short (3-5 sentence) plain-language paragraph summarizing activity for a non-technical leadership audience.',
      },
      watch_list: {
        type: 'array',
        items: { type: 'string' },
        description: '1-4 short bullet points on relationships needing attention (stalled, at risk, overdue follow-ups).',
      },
    },
    required: ['headline', 'highlights', 'narrative', 'watch_list'],
    additionalProperties: false,
  },
} as const;

export interface PartnershipReportResponse {
  headline: string;
  highlights: string[];
  narrative: string;
  watch_list: string[];
}
