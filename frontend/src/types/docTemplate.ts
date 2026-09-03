/** Mirrors backend/app/schemas/doc_template.py. */

export type DocType = 'feasibility' | 'quotation' | 'order' | 'delivery_note'
export type DocLanguage = 'en' | 'ar'

export interface DocTemplateSlot {
  doc_type: DocType
  doc_type_label: string
  language: DocLanguage
  language_label: string
  is_custom: boolean
  original_filename: string | null
  updated_at: string | null
  /** Comma-separated placeholder names this document type's template can
   * use -- documentation only, shown as a hint (see backend's
   * doc_template_service.PLACEHOLDERS). */
  placeholders: string
  /** Structured version of `placeholders`, for the field-mapping editor's
   * clickable field list -- see doc_template_service._fields_for. */
  simple_fields: TemplateField[]
  repeating: RepeatingFields
}

export interface TemplateField {
  key: string
  label: string
}

export interface RepeatingFields {
  loop_name: string
  item_label: string
  fields: TemplateField[]
}
