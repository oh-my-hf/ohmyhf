import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * Inline link to a public user/org profile (/users/:username).
 * Rendered as a span so it can sit inside larger clickable rows (buttons);
 * it stops propagation so the surrounding row's own action does not fire,
 * and activates on Enter for keyboard users.
 */
export function UserLink({
  username,
  className,
  ariaLabel,
  children
}: {
  username: string
  className?: string
  ariaLabel?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const navigate = useNavigate()
  const go = (e: React.MouseEvent | React.KeyboardEvent): void => {
    e.stopPropagation()
    navigate(`/users/${username}`)
  }
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          go(e)
        }
      }}
      className={cn(
        'cursor-pointer rounded-[3px] transition-colors duration-150 outline-none hover:text-hover-title hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        className
      )}
    >
      {children ?? username}
    </span>
  )
}
