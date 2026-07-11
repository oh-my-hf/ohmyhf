import type { HubOrgPlan } from '@oh-my-huggingface/shared'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Hugging Face–style plan marks: skewed PRO pastel gradient for individuals,
 * dark Team / Enterprise / Enterprise+ chips for orgs.
 * Colors come from `--c-pro-*` / `--c-plan-*` tokens (see main.css).
 */
export type PlanBadgeKind = 'pro' | HubOrgPlan

const ORG_SHELL =
  'bg-linear-to-br inline-flex items-center -skew-x-12 whitespace-nowrap border border-plan-border from-plan-from to-plan-to font-sans font-semibold leading-none text-plan-ink rounded-lg px-2 py-1 text-[12px]'

const PRO_SHELL =
  'bg-linear-to-br inline-block -skew-x-12 border border-plan-border from-pro-shell-from via-pro-shell-via to-pro-shell-to text-[12px] font-bold text-pro-ink rounded-md px-1.5 py-0'

const PLUS_MARK =
  'inline-block translate-y-px font-extrabold text-pro-plus text-[1.05rem] leading-[0.6]'

export interface PlanBadgeProps {
  kind: PlanBadgeKind
  className?: string
}

export function PlanBadge({ kind, className }: PlanBadgeProps): React.JSX.Element | null {
  const { t } = useTranslation('profile')

  if (kind === 'pro') {
    const label = t('plan.pro')
    return (
      <span className={cn(PRO_SHELL, className)} title={label}>
        {label}
      </span>
    )
  }

  if (kind === 'team') {
    const label = t('plan.team')
    return (
      <span className={cn(ORG_SHELL, className)} title={label}>
        <span>{label}</span>
      </span>
    )
  }

  if (kind === 'enterprise') {
    const label = t('plan.enterprise')
    return (
      <span className={cn(ORG_SHELL, className)} title={label}>
        <span>{label}</span>
      </span>
    )
  }

  if (kind === 'plus') {
    const label = t('plan.enterprisePlus')
    return (
      <span className={cn(ORG_SHELL, 'gap-1', className)} title={label}>
        <span>{t('plan.enterprise')}</span>
        <span className={PLUS_MARK} aria-hidden>
          +
        </span>
      </span>
    )
  }

  if (kind === 'academia') {
    const label = t('plan.academia')
    return (
      <span className={cn(ORG_SHELL, className)} title={label}>
        <span>{label}</span>
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
