export function threadPageTitle(threadTitle) {
  const full = `${threadTitle} - Techno Optimists`
  return threadTitle.length > 45 ? threadTitle : full
}
