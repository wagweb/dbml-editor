/** Working title of the product. Shown in the header and the browser tab. */
export const APP_NAME = 'Keyline'

export const DBML_DOCS_URL = 'https://dbml.dbdiagram.io/docs/'

/** How much of each table the diagram shows. Used by the toolbar, the view menu and search. */
export const DETAIL_LEVELS = [
  { value: 'full', label: 'All columns' },
  { value: 'keys', label: 'Keys' },
  { value: 'names', label: 'Names' },
] as const
