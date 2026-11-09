/** What a new diagram starts with: two tables and a relation, enough to show the syntax. */
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

/** Shown in an empty diagram as an example of the syntax, and inserted on request. */
export const STARTER_TABLE = `Table users {
  id int [pk, increment]
  email varchar [not null, unique]
  created_at timestamp
}
`
