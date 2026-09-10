import type { ActionKind, ChallengeType, Stage } from '../../../../packages/types/index'

/** User-facing labels. The product's words - see CLAUDE.md vocabulary. */
export const TYPE_LABEL: Record<ChallengeType, string> = {
  problem: 'Problem', idea: 'Idea', experiment: 'Experiment', build: 'Build',
}

export const STAGE_LABEL: Record<Stage, string> = {
  spot: 'Spotted', understand: 'Understanding', ideas: 'Ideas',
  build: 'Building', test: 'Testing', learn: 'Learning', improve: 'Improving',
}

export const STAGE_ORDER: Stage[] = ['spot', 'understand', 'ideas', 'build', 'test', 'learn', 'improve']

/** The seven typed actions. No generic Like, by design. */
export const ACTION_LABEL: Record<ActionKind, string> = {
  have_problem: 'I have this problem',
  want_this: 'I want this',
  have_idea: 'I have an idea',
  can_help: 'I can help',
  will_test: "I'll test this",
  building_this: "I'm building this",
  follow: 'Follow progress',
}

/** Short form for the count strip on a feed card. */
export const ACTION_SHORT: Record<ActionKind, string> = {
  have_problem: 'have this', want_this: 'want this', have_idea: 'ideas',
  can_help: 'can help', will_test: 'will test', building_this: 'building',
  follow: 'following',
}

/** Third person, for listing what someone is doing on a Challenge. */
export const ACTION_DOING: Record<ActionKind, string> = {
  have_problem: 'has this problem', want_this: 'wants this', have_idea: 'has an idea',
  can_help: 'helping', will_test: 'testing', building_this: 'building',
  follow: 'following',
}

export const typeColor = (t: ChallengeType) => `var(--color-${t})`

export const count = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k` : String(n)

export const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 864e5)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}
