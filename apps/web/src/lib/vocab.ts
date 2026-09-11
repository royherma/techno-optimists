import type { ActionKind, ChallengeType, Stage } from '../../../../packages/types/index'

/** User-facing labels. The product's words - see CLAUDE.md vocabulary. */
export const TYPE_LABEL: Record<ChallengeType, string> = {
  problem: 'Problem', idea: 'Idea', experiment: 'Experiment', build: 'Build',
}

export const STAGE_LABEL: Record<Stage, string> = {
  spot: 'Noticing', understand: 'Understanding', ideas: 'Ideating',
  build: 'Building', test: 'Testing', learn: 'Learning', improve: 'Improving',
}

export const STAGE_ORDER: Stage[] = ['spot', 'understand', 'ideas', 'build', 'test', 'learn', 'improve']

/** One set of ongoing-stage labels across cards, progress and the field guide. */
export const STAGE_STAMP = STAGE_LABEL

/**
 * What each stage means, shown once in the legend so the sheet teaches itself.
 * Two words where two words will do: the legend is read down a narrow column
 * beside the index, and a phrase that wraps stops being scannable.
 */
export const STAGE_MEANING: Record<Stage, string> = {
  spot: 'notice and share',
  understand: 'explore and define',
  ideas: 'propose solutions',
  build: 'develop and make',
  test: 'trial and evaluate',
  learn: 'reflect and share',
  improve: 'scale and sustain',
}

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
  can_help: 'offered help', will_test: 'offered to test', building_this: 'building',
  follow: 'following',
}

/** The five core actions shown in the original legend. Other Challenge types
 * also expose their explicitly labelled want/build actions. */
export const LEGEND_ACTIONS: ActionKind[] = [
  'have_problem', 'have_idea', 'can_help', 'will_test', 'follow',
]

/** Legend wording. First person, because that is how the buttons read. */
export const LEGEND_ACTION_LABEL: Record<ActionKind, string> = {
  have_problem: 'I have this problem',
  want_this: 'I want this',
  have_idea: 'I have an idea',
  can_help: 'I can help',
  will_test: 'I will test this',
  building_this: "I'm building this",
  follow: 'Follow progress',
}

export const typeColor = (t: ChallengeType) =>
  t === 'build' ? 'var(--color-build-type)' : `var(--color-${t})`

export const stageColor = (s: Stage) => `var(--color-${s})`

/** Impact tiers from the original product legend. These describe scope/importance,
 * never participation. No impact value is stored on a Challenge yet. */
export const IMPACT_LABELS = ['local', 'neighbourhood', 'town', 'region', 'critical'] as const

/**
 * A stable grid reference for a Challenge. The sheet promises every Challenge
 * has a place on it, and a reference derived from the id keeps that promise
 * even for the many Challenges that carry no coordinates. It is an index, not a
 * position: never present it as a real-world location.
 */
export const gridRef = (id: string) => {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const a = L[(h >>> 3) % 24], b = L[(h >>> 11) % 24]
  const e = String((h >>> 7) % 10000).padStart(4, '0')
  const n = String((h >>> 17) % 10000).padStart(4, '0')
  return `${a}${b} ${e} ${n}`
}

export const count = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k` : String(n)

export { relativeDate as ago } from './dates'

/** Row number in the index column: 01, 02, ... as printed on the sheet. */
export const rowNo = (i: number) => String(i + 1).padStart(2, '0')
