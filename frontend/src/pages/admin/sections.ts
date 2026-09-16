export const GENERAL_SECTION_KEYS = ['company', 'approvals', 'ai-assistant'] as const
export type GeneralSectionKey = (typeof GENERAL_SECTION_KEYS)[number]
