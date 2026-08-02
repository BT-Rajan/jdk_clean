import type { ReactNode } from 'react'
import { Fragment } from 'react'

/**
 * Renders `**bold**` spans and `- ` bullet lines as real markup, instead
 * of the assistant's replies (and the local Help Guide answers) showing
 * literal asterisks/dashes in a whitespace-pre-wrap block. Deliberately
 * minimal -- just what the assistant's own formatting actually uses --
 * not a general-purpose markdown parser.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '')
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
  })
}

export function renderMarkdownLite(content: string): ReactNode {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let bulletBuffer: string[] = []

  function flushBullets(key: string) {
    if (bulletBuffer.length === 0) return
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-1 pl-4">
        {bulletBuffer.map((line, i) => (
          <li key={i}>{renderInline(line, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    )
    bulletBuffer = []
  }

  lines.forEach((line, idx) => {
    const bulletMatch = /^[-•]\s+(.*)$/.exec(line.trim())
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]!)
      return
    }
    flushBullets(`b${idx}`)
    if (line.trim() === '') {
      blocks.push(<div key={`sp${idx}`} className="h-2" />)
    } else {
      blocks.push(<p key={`p${idx}`}>{renderInline(line, `p${idx}`)}</p>)
    }
  })
  flushBullets('b-end')

  return <>{blocks}</>
}
