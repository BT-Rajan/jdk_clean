import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { AccessControlTab } from './AccessControlTab'

/** Roles & Permissions' own page under Master Data -- this used to only
 * be reachable via Master Data -> Roles & Permissions -> Admin (a link
 * out to a tab inside Admin Settings), the one master-data entry that
 * didn't actually live where it was filed. The functionality itself
 * (AccessControlTab, unchanged) stays the same; this just gives it a
 * real home instead of a detour through Admin. */
export function AccessControlPage() {
  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">Roles &amp; Permissions</h1>
        <div className="mt-8">
          <AccessControlTab />
        </div>
      </PageContainer>
    </AppLayout>
  )
}
