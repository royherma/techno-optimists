export function feedbackHref(path: string): string {
  // Keep account/query values out of email drafts, including sign-in tokens.
  const pathname = new URL(path, 'https://technooptimists.org').pathname
  const body = `What is missing?\n\n\nWhat broke?\n\n\nWhat do you want here?\n\n\nPage: https://technooptimists.org${pathname}`
  return `mailto:roy@techguyverlabs.org?subject=${encodeURIComponent('Techno Optimists feedback')}&body=${encodeURIComponent(body)}`
}
