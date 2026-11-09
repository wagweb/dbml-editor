/** Working title of the product. Shown in the header and the browser tab. */
export const APP_NAME = 'Keyline'

export const DBML_DOCS_URL = 'https://dbml.dbdiagram.io/docs/'

/** One name for search everywhere: the header field, the palette and its dialog title. */
export const SEARCH_LABEL = 'Search tables, columns and actions'

/** How much of each table the diagram shows. Used by the toolbar and by search. */
export const DETAIL_LEVELS = [
  { value: 'full', label: 'All', command: 'Show all columns' },
  { value: 'keys', label: 'Keys', command: 'Show keys and relation columns only' },
  { value: 'names', label: 'Names', command: 'Show table names only' },
] as const
