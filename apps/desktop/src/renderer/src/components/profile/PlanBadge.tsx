import type { HubOrgPlan } from '@oh-my-huggingface/shared'
import { cn } from '@/lib/utils'

/**
 * Hugging Face–style plan marks: skewed PRO pastel gradient for individuals,
 * dark Team / Enterprise / Enterprise+ chips for orgs.
 */
export type PlanBadgeKind = 'pro' | HubOrgPlan

const ORG_SHELL =
  'bg-linear-to-br inline-flex items-center -skew-x-12 whitespace-nowrap border border-gray-200 from-gray-800 to-gray-900 font-sans font-semibold leading-none text-white will-change-transform dark:from-gray-50 dark:to-gray-100 dark:text-gray-900 rounded-lg px-2 py-1 text-[12px]'

const PRO_SHELL =
  'bg-linear-to-br shadow-green-500/10 dark:shadow-green-500/20 inline-block -skew-x-12 border border-gray-200 from-pink-300 via-green-200 to-yellow-200 text-[12px] font-bold text-black shadow-lg dark:from-pink-500 dark:via-green-500 dark:to-yellow-500 dark:text-black rounded-md px-1.5 py-0'

const PLUS_MARK =
  'bg-linear-to-b inline-block translate-y-px from-white to-green-400 bg-clip-text font-extrabold text-transparent dark:from-black text-[1.05rem] leading-[0.6]'

export interface PlanBadgeProps {
  kind: PlanBadgeKind
  className?: string
}

export function PlanBadge({ kind, className }: PlanBadgeProps): React.JSX.Element | null {
  if (kind === 'pro') {
    return (
      <span className={cn(PRO_SHELL, className)} title="PRO">
        PRO
      </span>
    )
  }

  if (kind === 'team') {
    return (
      <span className={cn(ORG_SHELL, className)} title="Team">
        <span>Team</span>
      </span>
    )
  }

  if (kind === 'enterprise') {
    return (
      <span className={cn(ORG_SHELL, className)} title="Enterprise">
        <span>Enterprise</span>
      </span>
    )
  }

  if (kind === 'plus') {
    return (
      <span className={cn(ORG_SHELL, 'gap-1', className)} title="Enterprise Plus">
        <span>Enterprise</span>
        <span className={PLUS_MARK} aria-hidden>
          +
        </span>
      </span>
    )
  }

  if (kind === 'academia') {
    return (
      <span className={cn(ORG_SHELL, className)} title="Academia">
        <span>Academia</span>
      </span>
    )
  }

  return null
}

/** Pick the badge to show for a profile header (org plan wins over personal PRO). */
export function planBadgeKind(opts: {
  isPro?: boolean
  plan?: HubOrgPlan
  isOrg?: boolean
}): PlanBadgeKind | undefined {
  if (opts.isOrg && opts.plan) return opts.plan
  if (opts.plan) return opts.plan
  if (opts.isPro === true) return 'pro'
  return undefined
}
