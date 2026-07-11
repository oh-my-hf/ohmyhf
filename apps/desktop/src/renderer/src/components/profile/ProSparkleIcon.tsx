import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Hub `IconProSparkle` — rainbow four-point star used on Pro avatars.
 * Stroke color comes from `currentColor` (callers set `text-white dark:text-gray-950`).
 */
export function ProSparkleIcon({ className }: { className?: string }): React.JSX.Element {
  const gradientId = useId().replace(/:/g, '')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
      role="img"
      width="1em"
      height="1em"
      viewBox="0 0 12 12"
      preserveAspectRatio="xMidYMid meet"
      className={cn(className)}
    >
      <path
        d="M10.5 6.36328C10.4998 6.61534 10.3117 6.82821 10.0615 6.85938C9.32558 6.95111 8.62935 7.2287 8.0459 7.66406C7.67946 7.9406 7.38831 8.2959 7.19336 8.69824C6.99846 9.10055 6.90558 9.54059 6.9209 9.98242C6.92561 10.118 6.87449 10.2501 6.78027 10.3477C6.68608 10.445 6.55635 10.5 6.4209 10.5H5.5791C5.30296 10.5 5.0791 10.2761 5.0791 10C5.0791 8.87021 4.58249 8.14202 3.96387 7.66699L3.73926 7.50977C3.20273 7.16204 2.5865 6.93857 1.93945 6.85938C1.6888 6.82871 1.5002 6.61576 1.5 6.36328V5.63672C1.5002 5.38466 1.68831 5.17179 1.93848 5.14062C2.67435 5.0489 3.36971 4.77026 3.95312 4.33496C4.31963 4.05841 4.61166 3.70415 4.80664 3.30176C5.00154 2.89945 5.09442 2.45941 5.0791 2.01758C5.07439 1.88204 5.12551 1.74989 5.21973 1.65234C5.31392 1.55502 5.44365 1.5 5.5791 1.5H6.4209C6.69704 1.5 6.9209 1.72386 6.9209 2C6.9209 3.13215 7.41961 3.86098 8.04004 4.33594L8.29688 4.51465C8.90961 4.90301 9.59451 5.09458 10.0488 5.13965C10.3045 5.16497 10.4998 5.37984 10.5 5.63672V6.36328Z"
        fill={`url(#${gradientId})`}
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="3.69298"
          y1="3.83122"
          x2="7.69421"
          y2="8.60076"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF0789" />
          <stop offset="0.63" stopColor="#21DE75" />
          <stop offset="1" stopColor="#FF8D00" />
        </linearGradient>
      </defs>
    </svg>
  )
}
