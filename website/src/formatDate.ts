const editorialDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatEditorialDate(date: string) {
  return editorialDateFormatter.format(new Date(`${date}T00:00:00Z`))
}
