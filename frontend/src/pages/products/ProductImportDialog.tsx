import { useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, Modal, SelectField } from '@/components/ui'
import { importProducts } from '@/api/products'
import type { ProductImportResult, ProductImportRow } from '@/types/product'
import { parseCsv } from '@/lib/csv'
import { getApiErrorMessage } from '@/lib/apiError'

interface ImportField {
  key: keyof ProductImportRow
  label: string
  required: boolean
  numeric: boolean
}

/** Mirrors IMPORT_EXPORT_COLUMNS in backend/app/api/products.py -- same
 * order and names, so a file round-tripped through "Export CSV" then
 * "Import CSV" auto-maps every column with no manual work. tags/
 * properties aren't offered here; see that file's comment for why. */
const IMPORT_FIELDS: ImportField[] = [
  { key: 'code', label: 'Code', required: true, numeric: false },
  { key: 'name', label: 'Name', required: true, numeric: false },
  { key: 'unit', label: 'Unit', required: true, numeric: false },
  { key: 'product_type', label: 'Product type', required: false, numeric: false },
  { key: 'selling_price', label: 'Selling price', required: false, numeric: true },
  { key: 'batch_size', label: 'Batch size', required: false, numeric: true },
  { key: 'batch_production_hours', label: 'Hours per batch', required: false, numeric: true },
  { key: 'machine_id', label: 'Machine ID', required: false, numeric: true },
  { key: 'production_hours_per_unit', label: 'Production hours per unit', required: false, numeric: true },
  { key: 'workers_required', label: 'Workers required', required: false, numeric: true },
  { key: 'status', label: 'Status', required: false, numeric: false },
  { key: 'reorder_point', label: 'Reorder point', required: false, numeric: true },
]

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, '')
}

type Step = 'pick' | 'map' | 'result'

interface ProductImportDialogProps {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function ProductImportDialog({ open, onClose, onImported }: ProductImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('pick')
  const [fileError, setFileError] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<Record<keyof ProductImportRow, string>>>({})
  const [importing, setImporting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<ProductImportResult | null>(null)

  function reset() {
    setStep('pick')
    setFileError(null)
    setHeaders([])
    setDataRows([])
    setMapping({})
    setSubmitError(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setFileError(null)
    let text: string
    try {
      text = await file.text()
    } catch {
      setFileError('Could not read that file.')
      return
    }
    const rows = parseCsv(text)
    if (rows.length === 0) {
      setFileError('That file has no rows.')
      return
    }
    const [headerRow, ...rest] = rows as [string[], ...string[][]]
    if (rest.length === 0) {
      setFileError('That file only has a header row -- nothing to import.')
      return
    }

    const auto: Partial<Record<keyof ProductImportRow, string>> = {}
    for (const field of IMPORT_FIELDS) {
      const match = headerRow.find(
        (h) => normalize(h) === normalize(field.label) || normalize(h) === normalize(field.key),
      )
      if (match) auto[field.key] = match
    }

    setHeaders(headerRow)
    setDataRows(rest)
    setMapping(auto)
    setStep('map')
  }

  const requiredFieldsMapped = useMemo(
    () => IMPORT_FIELDS.filter((f) => f.required).every((f) => mapping[f.key]),
    [mapping],
  )

  const rowCount = useMemo(
    () => dataRows.filter((r) => r.some((cell) => cell.trim() !== '')).length,
    [dataRows],
  )

  function buildRows(): ProductImportRow[] {
    return dataRows
      .filter((r) => r.some((cell) => cell.trim() !== ''))
      .map((r) => {
        const row: Record<string, string | number> = {}
        for (const field of IMPORT_FIELDS) {
          const col = mapping[field.key]
          if (!col) continue
          const idx = headers.indexOf(col)
          if (idx === -1) continue
          const raw = (r[idx] ?? '').trim()
          if (raw === '') continue
          row[field.key] = field.numeric ? Number(raw) : raw
        }
        return row as unknown as ProductImportRow
      })
  }

  async function handleImport() {
    setImporting(true)
    setSubmitError(null)
    try {
      const res = await importProducts(buildRows())
      setResult(res)
      setStep('result')
      onImported()
    } catch (err) {
      setSubmitError(getApiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const footer =
    step === 'map' ? (
      <>
        <Button variant="ghost" onClick={() => setStep('pick')}>Back</Button>
        <Button onClick={handleImport} isLoading={importing} disabled={!requiredFieldsMapped || rowCount === 0}>
          Import {rowCount} row{rowCount === 1 ? '' : 's'}
        </Button>
      </>
    ) : step === 'result' ? (
      <Button onClick={handleClose}>Done</Button>
    ) : undefined

  return (
    <Modal open={open} onClose={handleClose} title="Import products from CSV" wide footer={footer}>
      {step === 'pick' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/50">
            Choose a CSV file exported from here (or your own, as long as it has a header row) -- the next step
            lets you map its columns to product fields. Only Code, Name, and Unit are required.
          </p>
          <Alert variant="error">{fileError}</Alert>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
            className="text-sm text-white/70 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-white file:hover:bg-white/15"
          />
        </div>
      )}

      {step === 'map' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/50">
            {rowCount} row{rowCount === 1 ? '' : 's'} found in <span className="text-white">{headers.length} columns</span>.
            Map each product field to a column, or leave it unmapped to skip it.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <SelectField
                key={field.key}
                label={field.required ? `${field.label} *` : field.label}
                value={mapping[field.key] ?? ''}
                onChange={(e) =>
                  setMapping((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))
                }
              >
                <option value="">Not mapped</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </SelectField>
            ))}
          </div>
          {!requiredFieldsMapped && (
            <p className="text-xs text-red-300">Code, Name, and Unit must all be mapped before importing.</p>
          )}
          <Alert variant="error">{submitError}</Alert>
        </div>
      )}

      {step === 'result' && result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Badge tone="success">{`${result.created} created`}</Badge>
            <Badge tone="info">{`${result.updated} updated`}</Badge>
            {result.errors > 0 && <Badge tone="danger">{`${result.errors} failed`}</Badge>}
          </div>
          {result.errors > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results
                    .filter((r) => r.action === 'error')
                    .map((r) => (
                      <tr key={r.row} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-2 text-white/60">{r.row}</td>
                        <td className="px-4 py-2 text-white">{r.code || '—'}</td>
                        <td className="px-4 py-2 text-red-300">{r.message}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
