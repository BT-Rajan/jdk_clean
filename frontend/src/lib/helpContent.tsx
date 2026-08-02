import type { UserRole } from '@/types/auth'

/**
 * Short, practical "how do I..." content for the Help menu pinned to the
 * profile flyout (top right). Written from the end-user's point of view:
 * what a role can do, which menu it's under, and the exact steps -- no
 * background/theory, no screenshots. One entry per UserRole; a role with
 * no entry here shows a "coming soon" message in the Help panel instead
 * of an error, so this file can be filled in one role at a time.
 */

export interface HelpItem {
  /** Short task name, e.g. "Create a user". */
  title: string
  /** 1-4 short, ordered steps. Each should read like "Menu > Page -- action". */
  steps: string[]
}

export interface HelpSection {
  title: string
  items: HelpItem[]
}

export const HELP_CONTENT: Partial<Record<UserRole, HelpSection[]>> = {
  admin: [
    {
      title: 'Getting started',
      items: [
        {
          title: 'Find your way around',
          steps: [
            'Top menu: Dashboard, Sales, Purchasing, Inventory, Production',
            'Admin menu (top menu, admin-only): Users, Settings',
            'Bell icon (top right) -- Notifications',
            'Gold "AI" button (top right) -- JDK Assistant chat',
          ],
        },
        {
          title: 'Your account',
          steps: ['Avatar (top right) -- Profile, dashboard widgets, password, and this Help menu'],
        },
      ],
    },
    {
      title: 'Manage users',
      items: [
        {
          title: 'Create a user',
          steps: [
            'Admin > Users',
            '"New user" button (top right)',
            'Fill Username, Full name, Email, Role, Department, Password',
            'Save with "Create user"',
          ],
        },
        {
          title: 'Edit a user / reset access',
          steps: [
            'Admin > Users -- click the username',
            '"Edit" -- change Role, Department, Active toggle',
            'Same screen -- Upload/Replace/Remove Signature',
            'Save with "Save changes"',
          ],
        },
        {
          title: 'Deactivate or restore a user',
          steps: ['Admin > Users -- open the user', '"Delete" to deactivate, "Restore" to bring them back'],
        },
      ],
    },
    {
      title: 'Access control',
      items: [
        {
          title: 'Set what a department can see/edit',
          steps: [
            'Admin > Settings > Access Control tab',
            'Grid rows = pages, columns = Sales / Procurement / Warehouse',
            'Tick Read to view, Write to edit (Write auto-grants Read)',
            'Only affects Staff -- Admin/Manager always see everything, Viewer is read-only everywhere',
            'Click "Save access control"',
          ],
        },
      ],
    },
    {
      title: 'Company & workflow settings',
      items: [
        {
          title: 'Company details (shown on PDFs)',
          steps: ['Admin > Settings > General tab', 'Company details card -- name, address, phone, email, GSTIN'],
        },
        {
          title: 'Factory capacity',
          steps: ['Admin > Settings > General tab', 'Factory card -- total workers, workday hours'],
        },
        {
          title: 'Turn on automation',
          steps: [
            'Admin > Settings > General tab',
            'Toggle: auto-create quotation from feasibility, auto-schedule production on order confirm, auto-create delivery note, auto-draft purchase orders from MRP',
          ],
        },
        {
          title: 'Require approval for large POs or discounts',
          steps: [
            'Admin > Settings > General tab',
            'Set a KWD amount under "Large purchase order approval"',
            'Set a % under "Large discount approval"',
            'Leave either blank to turn that approval off',
          ],
        },
        {
          title: 'Tax rate & AI provider',
          steps: [
            'Admin > Settings > General tab',
            'Tax card -- default tax rate %',
            'AI assistant card -- pick provider, paste API key',
          ],
        },
        { title: 'Save', steps: ['Click "Save settings" at the bottom of the General tab'] },
      ],
    },
    {
      title: 'Your profile',
      items: [
        {
          title: 'Update photo, contact info, or password',
          steps: ['Avatar (top right) > Profile', 'Photo / Contact details / Password cards -- edit and save each'],
        },
        {
          title: 'Customize your dashboard',
          steps: ['Avatar (top right) > Profile > "Customize Dashboard"', 'Toggle widgets on/off'],
        },
      ],
    },
  ],
}
