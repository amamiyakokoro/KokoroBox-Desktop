import dayjs from 'dayjs'

export function formatLogTimestamp(value?: string, reference: Date = new Date()): string {
  if (!value) return ''

  const timestamp = dayjs(value)
  if (!timestamp.isValid()) return value

  return timestamp.isSame(dayjs(reference), 'day')
    ? timestamp.format('HH:mm:ss')
    : timestamp.format('YYYY-MM-DD HH:mm:ss')
}
