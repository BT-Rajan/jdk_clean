import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Tabs } from '@/components/ui'
import { EmailTab } from './EmailTab'
import { SmsTab } from './SmsTab'
import { WhatsAppTab } from './WhatsAppTab'

export function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<'email' | 'whatsapp' | 'sms'>('email')

  // Admin-only-ness of this whole page is enforced once, by
  // AdminOnlyGuard at the route level -- nothing to check here.

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">Communication</h1>
        <p className="mt-2 text-sm text-white/50">
          Configure the mailbox and messaging channels used to send and receive customer/supplier communication.
        </p>

        <Tabs
          className="mt-6"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as typeof activeTab)}
          items={[
            { id: 'email', label: 'Email' },
            { id: 'whatsapp', label: 'WhatsApp' },
            { id: 'sms', label: 'SMS' },
          ]}
        />

        {activeTab === 'email' && <EmailTab />}
        {activeTab === 'whatsapp' && <WhatsAppTab />}
        {activeTab === 'sms' && <SmsTab />}
      </PageContainer>
    </AppLayout>
  )
}
