import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AvatarEditor } from '@/components/profile/AvatarEditor'
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm'
import { ContactDetailsForm } from '@/components/profile/ContactDetailsForm'
import { GlassCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-xl font-medium text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
    </div>
  )
}

export function ProfilePage() {
  const { user } = useAuth()

  return (
    <AppLayout>
      <h1 className="font-display text-3xl font-medium text-white">Your profile</h1>
      <p className="mt-2 text-sm text-white/50">
        Manage your photo, contact details, password, and dashboard.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <GlassCard className="p-8">
          <SectionHeading title="Dashboard" />
          <p className="mb-4 text-sm text-white/60">
            Customize which widgets and statistics appear on your dashboard.
          </p>
          <Link
            to="/dashboard/customize"
            className="inline-flex items-center gap-2 rounded-lg border border-gold-400/30 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-200 transition-colors hover:bg-gold-500/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.6" rx="1" />
              <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.6" rx="1" />
              <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.6" rx="1" />
              <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.6" rx="1" />
            </svg>
            Customize Dashboard →
          </Link>
        </GlassCard>

        <GlassCard className="p-8">
          <SectionHeading title="Photo" />
          <AvatarEditor />
        </GlassCard>

        <GlassCard className="p-8">
          <SectionHeading title="Contact details" />
          <ContactDetailsForm />
        </GlassCard>

        <GlassCard className="p-8">
          <SectionHeading
            title="Password"
            subtitle="You'll be signed out everywhere and asked to log in again afterward."
          />
          <ChangePasswordForm />
        </GlassCard>
      </div>

      {user && (
        <p className="mt-8 text-center text-xs text-white/30 capitalize">
          Signed in as {user.role}
        </p>
      )}
    </AppLayout>
  )
}
