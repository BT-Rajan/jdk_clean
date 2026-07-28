import { useEffect, useState } from 'react'
import { fetchAvatarBlob } from '@/api/auth'
import { cn } from '@/lib/cn'

type Size = 'sm' | 'md' | 'lg'

interface AvatarProps {
  avatarUrl: string | null
  name: string
  size?: Size
  className?: string
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-14 w-14 text-lg',
  lg: 'h-28 w-28 text-3xl',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

export function Avatar({ avatarUrl, name, size = 'md', className }: AvatarProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!avatarUrl) {
      setObjectUrl(null)
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    fetchAvatarBlob()
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setObjectUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null)
      })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl])

  const base = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    sizeStyles[size],
    className,
  )

  if (objectUrl) {
    return <img src={objectUrl} alt={`${name}'s avatar`} className={cn(base, 'object-cover')} />
  }

  return (
    <div
      className={cn(base, 'glass-inset font-display font-medium text-gold-200')}
      aria-label={`${name}'s avatar`}
      role="img"
    >
      {getInitials(name)}
    </div>
  )
}
