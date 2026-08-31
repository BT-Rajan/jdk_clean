import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { groupedMasterData, type MasterDataEntry } from '@/lib/masterDataRegistry'

/**
 * The "MASTER DATA" landing page the MDM spec calls for: category
 * navigation over every master in the app, one authoritative place to
 * reach each one instead of them being scattered across whichever
 * operational menu (Sales, Purchasing, ...) happened to touch them.
 * Entries are read from lib/masterDataRegistry.ts, the same list the
 * nav bar and command palette use, filtered by what this user can
 * actually see.
 */
function isEntryVisible(entry: MasterDataEntry, admin: boolean, permissions: Record<string, string> | null): boolean {
  if (entry.adminOnly) return admin
  if (!entry.pageKey) return true
  if (!permissions) return true
  return permissions[entry.pageKey] !== undefined && permissions[entry.pageKey] !== 'none'
}

export function MasterDataHomePage() {
  const { user, permissions } = useAuth()
  const admin = isAdmin(user?.role)
  const groups = groupedMasterData()
    .map((group) => ({ ...group, items: group.items.filter((entry) => isEntryVisible(entry, admin, permissions)) }))
    .filter((group) => group.items.length > 0)

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-medium text-white">Master Data</h1>
        <p className="mt-2 text-sm text-white/50">
          The authoritative record for every master the app runs on. Create once, maintain once -- every other
          module (feasibility, quotations, orders, MRP, production) references these records rather than keeping
          its own copy.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <GlassCard key={group.group} className="p-6">
            <h2 className="font-display text-sm font-medium tracking-wide text-white/50 uppercase">{group.label}</h2>
            <ul className="mt-4 flex flex-col gap-1">
              {group.items.map((entry) => (
                <li key={entry.key}>
                  <Link
                    to={entry.route}
                    className="block rounded-lg px-2 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-gold-300"
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>
    </AppLayout>
  )
}
