import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { TabPanel } from '@/components/ui'
import { cn } from '@/lib/cn'
import { AccessControlTab } from '@/pages/settings/AccessControlTab'
import { BomTab } from '@/pages/settings/BomTab'
import { FactorySetupTab } from '@/pages/settings/FactorySetupTab'
import { EmailTab } from '@/pages/communication/EmailTab'
import { SmsTab } from '@/pages/communication/SmsTab'
import { WhatsAppTab } from '@/pages/communication/WhatsAppTab'
import { GeneralSettingsForm } from './GeneralSettingsForm'
import { GENERAL_SECTION_KEYS } from './sections'
import type { GeneralSectionKey } from './sections'
import { UsersSection } from './UsersSection'

type SectionKey = GeneralSectionKey | 'factory-setup' | 'bom' | 'access-control' | 'email' | 'whatsapp' | 'sms' | 'users'

interface SectionGroup {
  label: string
  items: { key: SectionKey; label: string }[]
}

const GROUPS: SectionGroup[] = [
  {
    label: 'General',
    items: [
      { key: 'company-tax', label: 'Company & Tax' },
      { key: 'workflow-automation', label: 'Workflow Automation' },
      { key: 'approvals', label: 'Approvals' },
      { key: 'ai-assistant', label: 'AI Assistant' },
    ],
  },
  {
    label: 'Factory',
    items: [
      { key: 'factory-setup', label: 'Factory Setup' },
      { key: 'bom', label: 'Bill of Materials' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { key: 'email', label: 'Email' },
      { key: 'whatsapp', label: 'WhatsApp' },
      { key: 'sms', label: 'SMS' },
    ],
  },
  {
    label: 'Access',
    items: [
      { key: 'access-control', label: 'Access Control' },
      { key: 'users', label: 'Users' },
    ],
  },
]

function isGeneralSection(key: SectionKey): key is GeneralSectionKey {
  return (GENERAL_SECTION_KEYS as readonly string[]).includes(key)
}

const ALL_SECTION_KEYS = GROUPS.flatMap((g) => g.items.map((i) => i.key))

function parseSection(value: string | null): SectionKey {
  return (ALL_SECTION_KEYS as string[]).includes(value ?? '') ? (value as SectionKey) : 'company-tax'
}

export function AdminShell() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeSection, setActiveSectionState] = useState<SectionKey>(() => parseSection(searchParams.get('section')))

  // Keeps the URL in sync (?section=...) so links elsewhere in the app
  // (e.g. "Back to users" from a user's detail page, a dashboard
  // shortcut) can deep-link straight to a specific section instead of
  // always landing on the default -- and so the browser back button
  // steps through sections instead of leaving the page entirely.
  function setActiveSection(key: SectionKey) {
    setActiveSectionState(key)
    setSearchParams({ section: key }, { replace: true })
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">Admin</h1>
        <p className="mt-2 text-sm text-white/50">
          Company configuration, factory setup, communication channels, and access control -- all in one place.
        </p>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
          <nav className="flex flex-col gap-6 lg:w-56 lg:shrink-0">
            {GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-2 text-[10px] font-medium tracking-wide text-white/30 uppercase">{group.label}</p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveSection(item.key)}
                      className={cn(
                        'rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                        activeSection === item.key
                          ? 'bg-gold-500/15 text-gold-200'
                          : 'text-white/50 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            {/* Mounted for the whole shell's lifetime -- see GeneralSettingsForm's
               own doc comment on why unsaved edits shouldn't drop when
               clicking over to another section and back. */}
            <div className={isGeneralSection(activeSection) ? undefined : 'hidden'}>
              <GeneralSettingsForm activeSection={isGeneralSection(activeSection) ? activeSection : 'company-tax'} />
            </div>

            <TabPanel id="factory-setup" activeId={activeSection}><FactorySetupTab /></TabPanel>
            <TabPanel id="bom" activeId={activeSection}><BomTab /></TabPanel>
            <TabPanel id="access-control" activeId={activeSection}><AccessControlTab /></TabPanel>
            <TabPanel id="email" activeId={activeSection}><EmailTab /></TabPanel>
            <TabPanel id="whatsapp" activeId={activeSection}><WhatsAppTab /></TabPanel>
            <TabPanel id="sms" activeId={activeSection}><SmsTab /></TabPanel>
            <TabPanel id="users" activeId={activeSection}><UsersSection /></TabPanel>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
