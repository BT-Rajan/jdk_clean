export const GENERAL_SECTION_KEYS = ['company-tax', 'workflow-automation', 'approvals', 'ai-assistant'] as const
export type GeneralSectionKey = (typeof GENERAL_SECTION_KEYS)[number]
