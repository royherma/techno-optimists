import type { ActionKind, Challenge, ChallengeType, Stage } from '../../../../packages/types/index'

/** User-facing labels. The product's words - see CLAUDE.md vocabulary. */
export const TYPE_LABEL: Record<ChallengeType, string> = {
  problem: 'Problem', idea: 'Idea', experiment: 'Experiment', build: 'Build',
}

export const STAGE_LABEL: Record<Stage, string> = {
  spot: 'Spotted', understand: 'Understanding', ideas: 'Ideas',
  build: 'Building', test: 'Testing', learn: 'Learning', improve: 'Improving',
}

export const STAGE_ORDER: Stage[] = ['spot', 'understand', 'ideas', 'build', 'test', 'learn', 'improve']

/**
 * The stamp in the sheet margin. Present tense and short, because it is set in
 * caps beside every row and the lifecycle reads as a sequence of verbs.
 */
export const STAGE_STAMP: Record<Stage, string> = {
  spot: 'Spot', understand: 'Understand', ideas: 'Ideas',
  build: 'Build', test: 'Test', learn: 'Learn', improve: 'Improve',
}

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
  can_help: 'helping', will_test: 'testing', building_this: 'building',
  follow: 'following',
}

/**
 * The actions the legend teaches, in the order it teaches them. Five, not
 * seven: 'want this' and 'building this' are the same two marks as 'have this
 * problem' and 'I can help' seen from the other side of a Challenge, and a
 * legend that draws one symbol twice teaches nobody anything.
 */
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

/**
 * Investigation depth, 1-5 rings. This has to be a real quantity or the mark is
 * cartographic decoration, which is the failure mode this direction was warned
 * about. It counts what has actually accumulated on the Challenge: people who
 * confirmed the problem, ideas offered, help offered, tests promised, and
 * entries in the progress log. Thresholds are geometric because the first few
 * contributions change a Challenge far more than the fiftieth.
 */
/*
 * How much has accumulated on a Challenge. Confirmations are the wide signal;
 * offers of help, tests and progress entries are rarer and count for more,
 * because a Challenge with three testers has moved further than one with three
 * hundred nods.
 */
export const weightOf = (c: Challenge) => {
  const a = c.actions
  return (
    a.have_problem + a.want_this +
    a.have_idea * 3 +
    a.can_help * 3 +
    a.will_test * 5 +
    a.building_this * 5 +
    c.updates_count * 8
  )
}

/*
 * Rings are assigned by rank within the sheet being read, not by an absolute
 * cutoff. This is the one scheme that keeps the mark meaningful at every corpus
 * size: fixed thresholds peg every Challenge at five once the product grows,
 * and a log scale collapses when everything sits in one decade - both were
 * measured against the real feed and both failed. Ranking means five rings
 * always says "deepest here", which is what a reader actually wants to know.
 *
 * The quintile edges come from the set the reader is looking at, so pass the
 * whole page of Challenges, not one.
 */
export const depthScale = (all: Challenge[]) => {
  const sorted = all.map(weightOf).sort((x, y) => x - y)
  return (c: Challenge) => {
    if (sorted.length === 0) return 1
    const w = weightOf(c)
    // Share of the sheet this Challenge sits at or above.
    const below = sorted.filter((v) => v < w).length
    const pct = below / sorted.length
    return Math.min(5, Math.floor(pct * 5) + 1)
  }
}

export const DEPTH_LABEL = ['local', 'neighbourhood', 'town', 'region', 'critical']

export const depthLabel = (rings: number) => {
  const n = Math.min(5, Math.max(1, rings))
  return `${DEPTH_LABEL[n - 1]} - ${n} of 5`
}

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
