export interface Sample {
  id: string
  name: string
  description: string
  source: string
}

const SHOP = `// Storefront: catalog, customers and orders.
// Edit this text and the diagram follows along.

Project storefront {
  database_type: 'PostgreSQL'
}

Table customers {
  id uuid [pk]
  email varchar(255) [not null, unique]
  full_name varchar(120) [not null]
  status customer_status [not null, default: 'active']
  created_at timestamptz [not null, default: \`now()\`]

  Note: 'One row per person who can sign in.'
}

Table addresses {
  id uuid [pk]
  customer_id uuid [not null, ref: > customers.id]
  line_1 varchar(160) [not null]
  city varchar(80) [not null]
  postal_code varchar(16) [not null]
  country_code char(2) [not null, ref: > countries.code]
}

Table countries {
  code char(2) [pk]
  name varchar(80) [not null]
}

Table categories {
  id int [pk, increment]
  parent_id int [ref: > categories.id, note: 'Null for top level categories']
  name varchar(80) [not null]
  slug varchar(80) [not null, unique]
}

Table products {
  id uuid [pk]
  category_id int [not null, ref: > categories.id]
  sku varchar(40) [not null, unique]
  name varchar(160) [not null]
  price_cents int [not null]
  is_active boolean [not null, default: true]
}

Table product_images {
  id uuid [pk]
  product_id uuid [not null, ref: > products.id]
  url text [not null]
  position int [not null, default: 0]
}

Table orders {
  id uuid [pk]
  customer_id uuid [not null, ref: > customers.id]
  shipping_address_id uuid [not null, ref: > addresses.id]
  status order_status [not null, default: 'pending']
  total_cents int [not null]
  placed_at timestamptz [not null, default: \`now()\`]

  indexes {
    (customer_id, placed_at) [name: 'orders_by_customer']
  }
}

Table order_items {
  order_id uuid [not null, ref: > orders.id]
  product_id uuid [not null, ref: > products.id]
  quantity int [not null, default: 1]
  unit_price_cents int [not null]

  indexes {
    (order_id, product_id) [pk]
  }
}

Table payments {
  id uuid [pk]
  order_id uuid [not null, ref: > orders.id]
  provider varchar(40) [not null]
  amount_cents int [not null]
  captured_at timestamptz
}

Table shipments {
  id uuid [pk]
  order_id uuid [not null, unique, ref: - orders.id]
  carrier varchar(40) [not null]
  tracking_code varchar(80)
  shipped_at timestamptz
}

Table reviews {
  id uuid [pk]
  product_id uuid [not null, ref: > products.id]
  customer_id uuid [not null, ref: > customers.id]
  rating smallint [not null, note: '1 to 5']
  body text
}

Enum customer_status {
  active
  suspended
  deleted
}

Enum order_status {
  pending
  paid
  shipped
  delivered
  cancelled [note: 'Cancelled before shipping']
}

TableGroup Customers {
  customers
  addresses
  countries
}

TableGroup Catalog {
  categories
  products
  product_images
  reviews
}

TableGroup Sales {
  orders
  order_items
  payments
  shipments
}

Note conventions {
  'Money is stored in cents as integers. Timestamps are UTC.'
}

Records countries(code, name) {
  'DE', 'Germany'
  'FR', 'France'
  'US', 'United States'
}
`

const BLOG = `// A small publishing schema.

Table authors {
  id int [pk, increment]
  handle varchar(40) [not null, unique]
  display_name varchar(80) [not null]
}

Table posts {
  id int [pk, increment]
  author_id int [not null, ref: > authors.id]
  title varchar(200) [not null]
  body text [not null]
  published_at timestamp
}

Table comments {
  id int [pk, increment]
  post_id int [not null, ref: > posts.id]
  author_id int [ref: > authors.id]
  body text [not null]
  created_at timestamp [not null]
}

Table tags {
  id int [pk, increment]
  name varchar(40) [not null, unique]
}

Table post_tags {
  post_id int [not null, ref: > posts.id]
  tag_id int [not null, ref: > tags.id]

  indexes {
    (post_id, tag_id) [pk]
  }
}
`

const SAAS = `// Multi-tenant SaaS: workspaces, access control, billing and audit trail.

Table workspaces {
  id uuid [pk]
  slug varchar(60) [not null, unique]
  name varchar(120) [not null]
  plan_id int [not null, ref: > plans.id]
  owner_id uuid [not null, ref: > users.id]
  created_at timestamptz [not null]
}

Table users {
  id uuid [pk]
  email varchar(255) [not null, unique]
  name varchar(120)
  avatar_url text
  last_seen_at timestamptz
}

Table memberships {
  workspace_id uuid [not null, ref: > workspaces.id]
  user_id uuid [not null, ref: > users.id]
  role_id int [not null, ref: > roles.id]
  joined_at timestamptz [not null]

  indexes {
    (workspace_id, user_id) [pk]
  }
}

Table roles {
  id int [pk, increment]
  name varchar(40) [not null, unique]
}

Table permissions {
  id int [pk, increment]
  key varchar(80) [not null, unique]
}

Table role_permissions {
  role_id int [not null, ref: > roles.id]
  permission_id int [not null, ref: > permissions.id]

  indexes {
    (role_id, permission_id) [pk]
  }
}

Table invitations {
  id uuid [pk]
  workspace_id uuid [not null, ref: > workspaces.id]
  invited_by uuid [not null, ref: > users.id]
  email varchar(255) [not null]
  role_id int [not null, ref: > roles.id]
  expires_at timestamptz [not null]
}

Table api_keys {
  id uuid [pk]
  workspace_id uuid [not null, ref: > workspaces.id]
  created_by uuid [not null, ref: > users.id]
  prefix varchar(12) [not null]
  hashed_secret text [not null]
  revoked_at timestamptz
}

Table plans {
  id int [pk, increment]
  code varchar(40) [not null, unique]
  monthly_price_cents int [not null]
  seat_limit int
}

Table subscriptions {
  id uuid [pk]
  workspace_id uuid [not null, unique, ref: - workspaces.id]
  plan_id int [not null, ref: > plans.id]
  status subscription_status [not null]
  current_period_end timestamptz [not null]
}

Table invoices {
  id uuid [pk]
  subscription_id uuid [not null, ref: > subscriptions.id]
  amount_cents int [not null]
  issued_at timestamptz [not null]
  paid_at timestamptz
}

Table projects {
  id uuid [pk]
  workspace_id uuid [not null, ref: > workspaces.id]
  name varchar(120) [not null]
  archived_at timestamptz
}

Table tasks {
  id uuid [pk]
  project_id uuid [not null, ref: > projects.id]
  assignee_id uuid [ref: > users.id]
  parent_id uuid [ref: > tasks.id]
  title varchar(200) [not null]
  state task_state [not null, default: 'todo']
  due_on date
}

Table task_comments {
  id uuid [pk]
  task_id uuid [not null, ref: > tasks.id]
  author_id uuid [not null, ref: > users.id]
  body text [not null]
  created_at timestamptz [not null]
}

Table attachments {
  id uuid [pk]
  task_id uuid [not null, ref: > tasks.id]
  uploaded_by uuid [not null, ref: > users.id]
  file_name varchar(200) [not null]
  byte_size bigint [not null]
}

Table audit_events {
  id bigint [pk, increment]
  workspace_id uuid [not null, ref: > workspaces.id]
  actor_id uuid [ref: > users.id]
  action varchar(80) [not null]
  payload jsonb
  created_at timestamptz [not null]
}

Table webhooks {
  id uuid [pk]
  workspace_id uuid [not null, ref: > workspaces.id]
  url text [not null]
  secret text [not null]
  is_enabled boolean [not null, default: true]
}

Table webhook_deliveries {
  id bigint [pk, increment]
  webhook_id uuid [not null, ref: > webhooks.id]
  audit_event_id bigint [not null, ref: > audit_events.id]
  response_status int
  delivered_at timestamptz
}

Enum subscription_status {
  trialing
  active
  past_due
  cancelled
}

Enum task_state {
  todo
  in_progress
  done
}

TableGroup Access {
  users
  memberships
  roles
  permissions
  role_permissions
  invitations
  api_keys
}

TableGroup Billing {
  plans
  subscriptions
  invoices
}

TableGroup Work {
  projects
  tasks
  task_comments
  attachments
}

TableGroup Integrations {
  audit_events
  webhooks
  webhook_deliveries
}

// Views show a part of the schema. Switch between them above the diagram.
DiagramView Billing {
  Tables {
    workspaces
    users
  }
  TableGroups {
    Billing
  }
}

DiagramView Work {
  Tables {
    workspaces
    users
  }
  TableGroups {
    Work
  }
}
`

export const SAMPLES: Sample[] = [
  {
    id: 'storefront',
    name: 'Storefront',
    description: '11 tables with customers, catalog and orders',
    source: SHOP,
  },
  { id: 'blog', name: 'Blog', description: '5 tables, a good place to start', source: BLOG },
  {
    id: 'saas',
    name: 'SaaS workspace',
    description: '18 tables with access control and billing',
    source: SAAS,
  },
]

export const STARTER_SOURCE = `Table users {
  id int [pk, increment]
  email varchar [not null, unique]
}

Table posts {
  id int [pk, increment]
  author_id int [not null, ref: > users.id]
  title varchar [not null]
}
`
