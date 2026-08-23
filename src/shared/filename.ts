export function timestampedFilename(date: Date, ext: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const name = `Recording ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} at ${pad(
    date.getHours()
  )}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
  return `${name}.${ext}`
}
