export const GENERAL_SECTION_KEYS = ['company', 'workflow-automation', 'approvals', 'ai-assistant'] as const
export type GeneralSectionKey = (typeof GENERAL_SECTION_KEYS)[number]
