// Prompt templates ported verbatim from the PRD's LLM Architecture section.

export const THREAD_SUMMARIZER_SYSTEM_PROMPT = `You are an expert admissions operations assistant for a state university in Oklahoma.
Your task is to analyze email exchanges between the university regional recruiter and high school/university counselors in Asia.

Extract:
1. A concise, 2-sentence summary of the core discussion and decisions made.
2. Specific counselor requests or concerns (e.g., scholarships, credit evaluations, fair dates).
3. Recommended follow-up date (number of days from today).
4. Key action item for the recruiter.

Format your response strictly adhering to the JSON schema.`;

export function buildReengagementPrompt(context: {
  schoolName: string;
  counselorName: string;
  lastInteractionDate: string;
  lastInteractionSummary: string;
  counselorPreferences: string;
  daysInactive: number;
}): string {
  return `
You are drafting a professional, warm, and low-pressure follow-up email from David Kim (Regional Admissions Manager for a state university in Oklahoma) to a high school college counselor in Asia.

PARTNER CONTEXT:
- School: ${context.schoolName}
- Counselor: ${context.counselorName}
- Days since last outreach: ${context.daysInactive} days
- Last Interaction (${context.lastInteractionDate}): "${context.lastInteractionSummary}"
- Counselor Notes/Preferences: "${context.counselorPreferences}"

GUIDELINES:
1. Warmly reference the last touchpoint naturally (do not sound accusatory about the delay).
2. Offer something of direct value (e.g., updated 2026/2027 international scholarship tiers, aviation/engineering transfer articulation guide, or flexible virtual info-session dates).
3. Keep the email under 120 words with a simple, clear call-to-action (e.g., "Would next Tuesday or Thursday morning work for a brief 10-minute touchpoint?").
4. Maintain a polite, collegial tone appropriate for international school counselors.
`;
}

export function buildPartnershipReportPrompt(context: {
  periodLabel: string;
  newInstitutions: number;
  partnershipsFinalized: number;
  interactionsByChannel: Record<string, number>;
  followupsCompleted: number;
  followupsOpen: number;
  healthCounts: Record<string, number>;
  notableInteractions: { institution: string; subject: string; summary: string }[];
  stalledInstitutions: string[];
}): string {
  const channelLines = Object.entries(context.interactionsByChannel)
    .map(([channel, count]) => `- ${channel.replace(/_/g, ' ')}: ${count}`)
    .join('\n') || '- None logged this period';

  const healthLines = Object.entries(context.healthCounts)
    .map(([status, count]) => `- ${status.replace(/_/g, ' ')}: ${count}`)
    .join('\n');

  const notableLines = context.notableInteractions
    .map((i) => `- ${i.institution} (${i.subject}): ${i.summary}`)
    .join('\n') || '- None';

  const stalledLines = context.stalledInstitutions.length
    ? context.stalledInstitutions.map((n) => `- ${n}`).join('\n')
    : '- None currently stalled';

  return `
You are writing a brief partnership-activity report for a university's international admissions leadership (non-technical audience: VP/Dean level). Write in plain, confident, factual language — no jargon, no fluff, no hype.

PERIOD: ${context.periodLabel}

RAW STATS:
- New institutions added: ${context.newInstitutions}
- Partnerships finalized (all-time total, current): ${context.partnershipsFinalized}
- Interactions logged this period by channel:
${channelLines}
- Follow-up tasks: ${context.followupsCompleted} completed, ${context.followupsOpen} still open
- Current relationship health across all institutions:
${healthLines}

NOTABLE INTERACTIONS THIS PERIOD:
${notableLines}

CURRENTLY STALLED / NEEDS ATTENTION:
${stalledLines}

Write a headline, 3-5 highlight bullets, a short narrative paragraph, and a watch-list of what needs leadership's attention. Ground every claim in the stats above — do not invent numbers or institutions not listed.
`;
}
