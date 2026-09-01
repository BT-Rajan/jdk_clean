"""Role-based Help Guide content -- backend mirror of
frontend/src/lib/helpContent.tsx.

The frontend answers a confident "how do I..." match straight from that
file, no API call. This module exists so the same ground truth is
available to the LLM for everything the frontend *doesn't* match
confidently -- the assistant's system prompt includes the current user's
section below, so "how do I..." answers stay grounded in the actual menu
structure instead of the model guessing.

Keep this in sync with frontend/src/lib/helpContent.tsx when either
changes -- same sections, same wording, just plain text here.
"""

HELP_CONTENT: dict[str, str] = {
    "admin": """Getting started
- Top menu: Dashboard, Sales, Purchasing, Inventory, Production
- Admin menu (admin-only): Users, Settings
- Bell icon (top right): Notifications
- Avatar (top right): Profile, dashboard widgets, password

Manage users (Admin > Users)
- Create: "New user" button -- fill Username, Full name, Email, Role, Department, Password -- "Create user"
- Edit: click the username -- "Edit" -- change Role, Department, Active toggle, Signature -- "Save changes"
- Deactivate/restore: open the user -- "Delete" or "Restore"

Access control (Admin > Settings > Access Control tab)
- Grid rows = pages, columns = Sales / Procurement / Warehouse
- Tick Read to view, Write to edit (Write auto-grants Read)
- Only affects Staff -- Admin/Manager always see everything, Viewer is read-only everywhere
- "Save access control"

Company & workflow settings (Admin > Settings > General tab)
- Company details card: name, address, phone, email (shown on PDFs)
- Factory card: total workers, workday hours
- Automation toggles: auto-create quotation from feasibility, auto-schedule production on order confirm, auto-create delivery note, auto-draft purchase orders from MRP
- Approval thresholds: KWD amount for large purchase orders, % for large discounts (blank = off)
- AI assistant card: paste API key (provider is auto-detected)
- "Save settings"

Your profile (Avatar > Profile)
- Photo / Contact details / Password cards -- edit and save each
- "Customize Dashboard" to toggle widgets""",
    "manager": """Getting started
- Top menu: Dashboard, Sales, Purchasing, Inventory, Production
- Bell icon (top right): Notifications
- Avatar (top right): Profile

Sales (Sales menu)
- Customers, Feasibility checks, Quotations, Orders, Delivery notes
- "New" button on any list to create one; open a record to edit or move it through its status steps

Purchasing (Purchasing menu)
- Suppliers, Purchase orders -- "New" to create, open a record to edit or send it

Inventory & Production
- Inventory menu: Raw materials, Products, Stock levels (Stock levels has an "Adjust" action)
- Production menu: Schedule, Production Line, Factory setup, MRP -- "New" to schedule a batch or set up the production line

Your profile (Avatar > Profile)
- Photo / Contact details / Password cards -- edit and save each
- "Customize Dashboard" to toggle widgets""",
    "staff": """Getting started
- Top menu only shows pages your admin has granted you
- Bell icon (top right): Notifications
- Avatar (top right): Profile
- What you see/edit depends on your department (Sales, Procurement, or Warehouse) and what's been granted in Access Control -- a page with no access is hidden; a page you can view but not edit has no "New"/"Edit" buttons

Everyday tasks
- Sales department: Sales menu -- Customers, Feasibility checks, Quotations, Orders, Delivery notes
- Procurement department: Purchasing menu -- Suppliers, Purchase orders
- Warehouse department: Sales menu -- Delivery notes; Inventory menu -- Stock levels "Adjust"

Your profile (Avatar > Profile)
- Photo / Contact details / Password cards -- edit and save each
- "Customize Dashboard" to toggle widgets""",
    "viewer": """Getting started
- Top menu: Dashboard, Sales, Purchasing, Inventory, Production
- Bell icon (top right): Notifications
- Avatar (top right): Profile

What you can do
- Read-only access to every page in the system
- Open any record to see its full detail
- No "New", "Edit", or "Delete" buttons appear for you

Your profile (Avatar > Profile)
- Photo / Contact details / Password cards -- edit and save each
- "Customize Dashboard" to toggle widgets""",
}


def get_help_guide(role: str) -> str:
    """Plain-text Help Guide for a role, or '' if the role has none."""
    return HELP_CONTENT.get(role, "")
