interface RatingStarsProps {
  rating: number | null
  className?: string
}

/** Renders a 1-5 star rating as filled/empty star glyphs. Returns an
 * em-dash for null, matching how every other optional Field value in the
 * app is displayed when unset. */
export function RatingStars({ rating, className }: RatingStarsProps) {
  if (!rating) return <span className={className}>—</span>
  return (
    <span className={className} aria-label={`${rating} out of 5 stars`}>
      <span className="text-gold-300">{'★'.repeat(rating)}</span>
      <span className="text-white/20">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}
