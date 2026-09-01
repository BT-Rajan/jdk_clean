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

/**
 * Finds the best-matching help item for a free-text question, purely by
 * keyword overlap against each item's title -- no network call. Used by
 * the assistant drawer to answer "how do I..." questions instantly from
 * this file before ever reaching the LLM. Returns null when nothing
 * scores a confident match, so the caller can fall back to the AI (which
 * is itself grounded in this same content server-side).
 */
export function findLocalHelpAnswer(role: UserRole, question: string): string | null {
  const sections = HELP_CONTENT[role]
  if (!sections) return null

  const STOPWORDS = new Set([
    'the', 'a', 'an', 'to', 'do', 'i', 'how', 'can', 'where', 'is', 'are', 'my', 'me',
    'and', 'or', 'of', 'for', 'in', 'on', 'what', 'this', 'that', 'you', 'your', 'it',
  ])
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))

  const qWords = new Set(words(question))
  if (qWords.size === 0) return null

  let best: { item: HelpItem; score: number } | null = null
  for (const section of sections) {
    for (const item of section.items) {
      const titleWords = words(item.title)
      if (titleWords.length === 0) continue
      const overlap = titleWords.filter((w) => qWords.has(w)).length
      const score = overlap / titleWords.length
      if (overlap === 0) continue
      if (!best || score > best.score) best = { item, score }
    }
  }

  // Require a fairly confident match -- most of the item's title words
  // present in the question -- so a vague message falls through to the
  // AI instead of returning a wrong canned answer.
  if (best && best.score >= 0.6) {
    return `**${best.item.title}**\n${best.item.steps.map((s) => `- ${s}`).join('\n')}`
  }
  return null
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
            'Master Data > Users',
            '"New user" button (top right)',
            'Fill Username, Full name, Email, Role, Department, Password',
            'Save with "Create user"',
          ],
        },
        {
          title: 'Edit a user / reset access',
          steps: [
            'Master Data > Users -- click the username',
            '"Edit" -- change Role, Department, Active toggle',
            'Same screen -- Upload/Replace/Remove Signature',
            'Save with "Save changes"',
          ],
        },
        {
          title: 'Deactivate or restore a user',
          steps: ['Master Data > Users -- open the user', '"Delete" to deactivate, "Restore" to bring them back'],
        },
      ],
    },
    {
      title: 'Access control',
      items: [
        {
          title: 'Set what a department can see/edit',
          steps: [
            'Master Data > Roles & Permissions',
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
          steps: ['Admin > Settings > General tab', 'Company details card -- name, address, phone, email'],
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
          title: 'AI assistant key',
          steps: [
            'Admin > Settings > General tab',
            'AI assistant card -- paste API key (provider is detected automatically)',
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
  manager: [
    {
      title: 'Getting started',
      items: [
        {
          title: 'Find your way around',
          steps: [
            'Top menu: Dashboard, Sales, Purchasing, Inventory, Production',
            'Bell icon (top right) -- Notifications',
            'Gold "AI" button (top right) -- JDK Assistant chat, also answers "how do I..." questions',
            'Avatar (top right) -- your Profile',
          ],
        },
      ],
    },
    {
      title: 'Sales',
      items: [
        {
          title: 'Customers, feasibility checks, quotations, orders, delivery notes',
          steps: [
            'Sales menu -- pick the page',
            '"New" button (top right of any list) to create one',
            'Open a record to edit it or move it through its status steps',
          ],
        },
      ],
    },
    {
      title: 'Purchasing',
      items: [
        {
          title: 'Suppliers and purchase orders',
          steps: ['Purchasing menu -- Suppliers or Purchase orders', '"New" button to create, open a record to edit or send it'],
        },
      ],
    },
    {
      title: 'Inventory & Production',
      items: [
        {
          title: 'Raw materials, products, stock levels',
          steps: ['Inventory menu -- pick the page', 'Open a record to edit; Stock levels has an "Adjust" action'],
        },
        {
          title: 'Production schedule, production line, MRP',
          steps: ['Production menu -- Schedule, Production Line, Factory setup, or MRP', '"New" button to schedule a batch or set up the production line'],
        },
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
  staff: [
    {
      title: 'Getting started',
      items: [
        {
          title: 'Find your way around',
          steps: [
            'Top menu only shows the pages your admin has given you access to',
            'Bell icon (top right) -- Notifications',
            'Gold "AI" button (top right) -- JDK Assistant chat, also answers "how do I..." questions',
            'Avatar (top right) -- your Profile',
          ],
        },
        {
          title: 'What you can do',
          steps: [
            'What you see and can edit depends on your department (Sales, Procurement, or Warehouse) and what your admin has granted',
            'A page with no access is simply hidden from your menu',
            'On a page you can view but not edit, buttons like "New" or "Edit" won\'t appear',
          ],
        },
      ],
    },
    {
      title: 'Everyday tasks',
      items: [
        {
          title: 'Sales department',
          steps: ['Sales menu -- Customers, Feasibility checks, Quotations, Orders, Delivery notes'],
        },
        {
          title: 'Procurement department',
          steps: ['Purchasing menu -- Suppliers, Purchase orders'],
        },
        {
          title: 'Warehouse department',
          steps: ['Sales menu -- Delivery notes', 'Inventory menu -- Stock levels has an "Adjust" action'],
        },
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
  viewer: [
    {
      title: 'Getting started',
      items: [
        {
          title: 'Find your way around',
          steps: [
            'Top menu: Dashboard, Sales, Purchasing, Inventory, Production',
            'Bell icon (top right) -- Notifications',
            'Gold "AI" button (top right) -- JDK Assistant chat, also answers "how do I..." questions',
            'Avatar (top right) -- your Profile',
          ],
        },
      ],
    },
    {
      title: 'What you can do',
      items: [
        {
          title: 'View everything, edit nothing',
          steps: [
            'You have read-only access to every page in the system',
            'Open any record to see its full detail -- customers, orders, quotations, purchase orders, stock, production schedules',
            'No "New", "Edit", or "Delete" buttons will appear for you',
          ],
        },
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
