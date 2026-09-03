import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Modal, Tabs, TabPanel } from '@/components/ui'
import { cn } from '@/lib/cn'
import { FactorySetupTab } from '@/pages/settings/FactorySetupTab'
import { OrgChartTab } from '@/pages/settings/OrgChartTab'
import { EmailTab } from '@/pages/communication/EmailTab'
import { SmsTab } from '@/pages/communication/SmsTab'
import { WhatsAppTab } from '@/pages/communication/WhatsAppTab'
import { DocumentTemplatesTab } from './DocumentTemplatesTab'
import { EmailTemplatesTab } from './EmailTemplatesTab'
import { GeneralSettingsForm } from './GeneralSettingsForm'
import { GENERAL_SECTION_KEYS } from './sections'
import type { GeneralSectionKey } from './sections'

type SectionKey = GeneralSectionKey | 'communication' | 'org-chart' | 'email-templates' | 'doc-templates'

type SectionItem = { key: SectionKey; label: string }
type LinkItem = { href: string; label: string }

function isLinkItem(item: SectionItem | LinkItem): item is LinkItem {
  return 'href' in item
}

interface SectionGroup {
  label: string
  items: (SectionItem | LinkItem)[]
}

const GROUPS: SectionGroup[] = [
  {
    label: 'General',
    items: [
      // Factory Setup (weekdays & working hours) now renders as part of
      // this section instead of its own "Factory" group -- see the
      // `activeSection === 'company'` render below.
      { key: 'company', label: 'Company' },
      { key: 'workflow-automation', label: 'Workflow Automation' },
      { key: 'approvals', label: 'Approvals' },
      { key: 'ai-assistant', label: 'AI Assistant' },
    ],
  },
  {
    label: 'Communication',
    // Email/WhatsApp/SMS used to be three separate section keys (three
    // separate sidebar entries); they're now one page with its own
    // inner tab strip -- see the `communication` TabPanel below.
    items: [{ key: 'communication', label: 'Communication' }],
  },
  {
    label: 'Documents',
    items: [
      { key: 'email-templates', label: 'Email Templates' },
      { key: 'doc-templates', label: 'Document Templates' },
    ],
  },
  {
    label: 'Access',
    items: [{ key: 'org-chart', label: 'Org Chart' }],
  },
  {
    label: 'Master Data',
    // Not a local section -- every master (Customers, Products, Units,
    // Departments, Users, Roles & Permissions, ...) is its own routed
    // page, so this is a real navigation link out of /admin rather than
    // a panel switch. Kept in the Admin shell (not the main nav bar) so
    // "where do I configure things" has one entry point.
    items: [{ href: '/master-data', label: 'Open Master Data →' }],
  },
]

function isGeneralSection(key: SectionKey): key is GeneralSectionKey {
  return (GENERAL_SECTION_KEYS as readonly string[]).includes(key)
}

const ALL_SECTION_KEYS = GROUPS.flatMap((g) => g.items.filter((i): i is SectionItem => !isLinkItem(i)).map((i) => i.key))

// Old deep links (?section=factory-setup / email / whatsapp / sms) still
// land somewhere sensible now that those sections were merged away,
// rather than silently falling back to the default 'company' tab with
// no explanation.
const LEGACY_SECTION_ALIASES: Record<string, SectionKey> = {
  'factory-setup': 'company',
  email: 'communication',
  whatsapp: 'communication',
  sms: 'communication',
}

function parseSection(value: string | null): SectionKey {
  if (!value) return 'company'
  if (value in LEGACY_SECTION_ALIASES) return LEGACY_SECTION_ALIASES[value]
  return (ALL_SECTION_KEYS as string[]).includes(value) ? (value as SectionKey) : 'company'
}

const COMMUNICATION_TABS = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
] as const
type CommunicationTabId = (typeof COMMUNICATION_TABS)[number]['id']

export function AdminShell() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeSection, setActiveSectionState] = useState<SectionKey>(() => parseSection(searchParams.get('section')))
  const [communicationTab, setCommunicationTab] = useState<CommunicationTabId>('email')

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
          Company configuration (including factory setup), communication channels, and the org chart -- all in one
          place. Master data and Roles &amp; Permissions live one click away, under Master Data.
        </p>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
          <nav className="flex flex-col gap-6 lg:w-56 lg:shrink-0">
            {GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-2 text-[10px] font-medium tracking-wide text-white/30 uppercase">{group.label}</p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) =>
                    isLinkItem(item) ? (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="rounded-lg px-3 py-2 text-left text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        {item.label}
                      </Link>
                    ) : (
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
                    ),
                  )}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            {/* Mounted for the whole shell's lifetime -- see GeneralSettingsForm's
               own doc comment on why unsaved edits shouldn't drop when
               clicking over to another section and back. Factory Setup
               (weekdays & working hours) rides along here too, only
               under the 'company' tab specifically. */}
            <div className={isGeneralSection(activeSection) ? undefined : 'hidden'}>
              <GeneralSettingsForm activeSection={isGeneralSection(activeSection) ? activeSection : 'company'} />
              {activeSection === 'company' && (
                <div className="mt-8">
                  <FactorySetupTab />
                </div>
              )}
            </div>

            <TabPanel id="communication" activeId={activeSection}>
              <Tabs
                items={[...COMMUNICATION_TABS]}
                activeId={communicationTab}
                onChange={(id) => setCommunicationTab(id as CommunicationTabId)}
                className="mb-6"
              />
              {/* keepMounted: switching between Email/WhatsApp/SMS shouldn't
                 drop an unsaved edit in whichever tab you were just on,
                 same reasoning as GeneralSettingsForm above. */}
              <TabPanel id="email" activeId={communicationTab} keepMounted><EmailTab /></TabPanel>
              <TabPanel id="whatsapp" activeId={communicationTab} keepMounted><WhatsAppTab /></TabPanel>
              <TabPanel id="sms" activeId={communicationTab} keepMounted><SmsTab /></TabPanel>
            </TabPanel>

            <TabPanel id="email-templates" activeId={activeSection}>
              <EmailTemplatesTab />
            </TabPanel>

            <TabPanel id="doc-templates" activeId={activeSection}>
              <DocumentTemplatesTab />
            </TabPanel>
          </div>
        </div>
      </PageContainer>

      {/* Org chart doesn't render inline like the other sections -- next to
          the section nav, this column is only a few hundred px wide, nowhere
          near enough for its department swimlanes. A full-page modal gives
          it the whole viewport instead. Closing it falls back to the default
          section rather than leaving activeSection on 'org-chart' with
          nothing visible behind the modal. */}
      <Modal
        open={activeSection === 'org-chart'}
        onClose={() => setActiveSection('company')}
        title="Org chart"
        fullPage
      >
        <OrgChartTab />
      </Modal>
    </AppLayout>
  )
}
