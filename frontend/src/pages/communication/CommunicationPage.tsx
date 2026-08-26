import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { ComingSoonTab } from './ComingSoonTab'
import { EmailTab } from './EmailTab'
import { SmsTab } from './SmsTab'

export function CommunicationPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'email' | 'whatsapp' | 'sms'>('email')

  // Same admin-only boundary as Settings (see api/communication.py) --
  // redirect rather than show a permission error.
  if (!isAdmin(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

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
        {activeTab === 'whatsapp' && <ComingSoonTab channel="WhatsApp" />}
        {activeTab === 'sms' && <SmsTab />}
      </PageContainer>
    </AppLayout>
  )
}
