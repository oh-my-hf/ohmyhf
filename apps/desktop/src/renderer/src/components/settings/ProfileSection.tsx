import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import type { HubProfileSettings } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToasts } from '@/components/ui/toaster'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { useHubSession } from '@/hooks/use-hub-session'
import { useAppStore } from '@/stores/app'

/** Radix Select rejects empty item values; this stands in for "no primary org". */
const NO_ORG = '\0none'
const AVATAR_ACCEPT = 'image/png, image/jpeg, image/webp'
const MAX_AVATAR_BYTES = 10 * 1024 * 1024

/**
 * Edit the public Hub profile from Settings, mirroring the fields of the
 * official Settings → Profile page (fullname, avatar, primary org, homepage,
 * AI & ML interests, social handles). Saving posts the same form the Hub web
 * app does, so it needs a connected Hub web session.
 */
export function ProfileSection(): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const hubSession = useHubSession()
  const openSettings = useAppStore((s) => s.openSettings)

  const profile = useQuery({
    queryKey: ['hub-profile'],
    queryFn: () => invoke('hub:profileGet', undefined),
    enabled: hubSession
  })

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-smd font-semibold text-ink-strong">{t('settings:profile.title')}</h2>
      {!hubSession ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[12.5px] text-ink-muted">{t('settings:profile.needsSession')}</p>
          <Button variant="secondary" size="sm" onClick={() => openSettings('account')}>
            {t('settings:profile.openAccount')}
          </Button>
        </div>
      ) : profile.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : profile.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[12.5px] text-error">
            {t('settings:profile.loadError', { error: profile.error.message })}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void profile.refetch()}>
            {t('common:retry')}
          </Button>
        </div>
      ) : (
        // Remount the form when a refetch delivers new server state.
        <ProfileForm key={profile.dataUpdatedAt} initial={profile.data} />
      )}
    </section>
  )
}

function ProfileForm({ initial }: { initial: HubProfileSettings }): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const auth = useAppStore((s) => s.auth)
  const push = useToasts((s) => s.push)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState(initial)
  // A freshly uploaded avatar URL; undefined keeps the current avatar.
  const [avatar, setAvatar] = useState<string>()
  const [uploading, setUploading] = useState(false)

  const set = (patch: Partial<HubProfileSettings>): void => setForm((f) => ({ ...f, ...patch }))

  const save = useMutation({
    mutationFn: () =>
      invoke('hub:profileUpdate', {
        fullname: form.fullname,
        homepage: form.homepage,
        details: form.details,
        github: form.github,
        twitter: form.twitter,
        linkedin: form.linkedin,
        bluesky: form.bluesky,
        primaryOrg: form.primaryOrg,
        ...(avatar !== undefined ? { avatar } : {})
      }),
    onSuccess: () => {
      push(t('settings:profile.saved'), 'success')
      // Profile data feeds many surfaces (own user page, avatars in threads).
      void queryClient.invalidateQueries()
    },
    onError: (err) => push(t('settings:profile.error', { error: err.message }), 'error')
  })

  const pickAvatar = async (file: File | undefined): Promise<void> => {
    if (!file || file.size > MAX_AVATAR_BYTES) return
    setUploading(true)
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const { url } = await invoke('hub:commentAssetUpload', {
        filename: file.name,
        contentType: file.type || 'image/png',
        data
      })
      setAvatar(url)
    } catch (err) {
      push(t('settings:profile.error', { error: (err as Error).message }), 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const username = auth.status === 'signedIn' ? auth.user.name : ''
  const currentAvatar = avatar ?? (auth.status === 'signedIn' ? auth.user.avatarUrl : undefined)

  return (
    <div className="flex flex-col gap-4">
      <Field label={t('settings:profile.avatar')} hint={t('settings:profile.avatarHint')}>
        <div className="flex items-center gap-3">
          <ProfileAvatar
            key={currentAvatar ?? 'none'}
            name={username}
            url={currentAvatar}
            className="size-12 text-[16px]"
            frame="compact"
          />
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden />
            {t('settings:profile.avatarUpload')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => void pickAvatar(e.target.files?.[0])}
          />
        </div>
      </Field>

      <Field label={t('settings:profile.fullname')}>
        <Input
          value={form.fullname}
          maxLength={50}
          onChange={(e) => set({ fullname: e.target.value })}
        />
      </Field>

      <Field
        label={t('settings:profile.primaryOrg')}
        hint={initial.primaryOrgOptions.length === 0 ? t('settings:profile.primaryOrgHint') : undefined}
      >
        <Select
          value={form.primaryOrg === '' ? NO_ORG : form.primaryOrg}
          onValueChange={(v) => set({ primaryOrg: v === NO_ORG ? '' : v })}
          disabled={initial.primaryOrgOptions.length === 0}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ORG}>{t('settings:profile.primaryOrgNone')}</SelectItem>
            {initial.primaryOrgOptions.map((org) => (
              <SelectItem key={org.value} value={org.value}>
                {org.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t('settings:profile.homepage')}>
        <Input
          type="url"
          value={form.homepage}
          placeholder="https://"
          onChange={(e) => set({ homepage: e.target.value })}
        />
      </Field>

      <Field label={t('settings:profile.details')}>
        <Textarea
          value={form.details}
          rows={3}
          maxLength={2000}
          onChange={(e) => set({ details: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label={t('settings:profile.github')}>
          <Input value={form.github} onChange={(e) => set({ github: e.target.value })} />
        </Field>
        <Field label={t('settings:profile.twitter')}>
          <Input value={form.twitter} onChange={(e) => set({ twitter: e.target.value })} />
        </Field>
        <Field label={t('settings:profile.linkedin')}>
          <Input value={form.linkedin} onChange={(e) => set({ linkedin: e.target.value })} />
        </Field>
        <Field label={t('settings:profile.bluesky')}>
          <Input value={form.bluesky} onChange={(e) => set({ bluesky: e.target.value })} />
        </Field>
      </div>

      <div className="flex justify-end border-t pt-3">
        <Button
          variant="cta"
          size="sm"
          loading={save.isPending}
          disabled={uploading}
          onClick={() => save.mutate()}
        >
          {t('settings:profile.save')}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11.5px] text-ink-faint">{hint}</span> : null}
    </div>
  )
}
