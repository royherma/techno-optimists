// Vocabulary is locked by CLAUDE.md. These strings are the product's words, not
// implementation details - renaming one is a product decision, not a refactor.

/** How a Challenge entered the world. It keeps this label for life. */
export const CHALLENGE_TYPES = ['problem', 'idea', 'experiment', 'build'] as const
export type ChallengeType = (typeof CHALLENGE_TYPES)[number]

/** Where a Challenge sits in the lifecycle. Every type converges on this path. */
export const STAGES = ['spot', 'understand', 'ideas', 'build', 'test', 'learn', 'improve'] as const
export type Stage = (typeof STAGES)[number]

/**
 * Typed social actions. There is deliberately no generic Like - the whole point
 * is that "4,700 people have this problem" and "34 people can help" are
 * different, useful facts.
 */
export const ACTION_KINDS = [
  'have_problem',
  'want_this',
  'have_idea',
  'can_help',
  'will_test',
  'building_this',
  'follow',
] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

/** How someone offers to help, asked after they click "I can help". */
export const HELP_KINDS = [
  'research', 'code', 'hardware', 'design', 'expertise', 'testing', 'funding', 'other',
] as const
export type HelpKind = (typeof HELP_KINDS)[number]

/** What people are good at. A record of practical intelligence, not follower count. */
export const ROLES = ['scout', 'thinker', 'researcher', 'builder', 'expert', 'tester'] as const
export type Role = (typeof ROLES)[number]

export interface Person {
  id: string
  handle: string
  name: string
  avatar_url: string | null
  location: string | null
  skills: string[]
  roles: Role[]
  challenges_count: number
  prototypes_count: number
  solutions_count: number
  created_at: string
}

export interface Media {
  kind: 'image' | 'video'
  url: string
  /**
   * Intrinsic pixel size, recorded when the file is uploaded.
   *
   * Without these the page cannot know an image's shape until it has loaded,
   * so every surface has to guess a ratio and crop whatever arrives - which
   * cuts the roof off a portrait photo and pillarboxes a panorama. Optional
   * because rows predating the capture still exist; treat a missing pair as
   * "unknown shape" and fall back, never as a default ratio.
   */
  w?: number
  h?: number
  /** Dominant colour, used as the placeholder while the image loads. */
  tint?: string
  alt?: string
}

/**
 * Aspect ratio of a media object, or null when it was stored without one.
 * Callers that need a number should pick their own fallback rather than
 * inheriting one from here, so the guess stays visible at the call site.
 */
export const ratioOf = (m: Pick<Media, 'w' | 'h'> | undefined | null): number | null =>
  m?.w && m?.h ? m.w / m.h : null

export interface Challenge {
  id: string
  slug: string
  type: ChallengeType
  stage: Stage
  title: string
  /** One line under the title in the feed. The hook. */
  summary: string
  /** Full context, markdown. Null in feed responses. */
  body?: string | null
  media: Media[]
  location: string | null
  /** Free tags: 'water', 'cooling', 'agriculture'. */
  tags: string[]
  author: Pick<Person, 'id' | 'handle' | 'name' | 'avatar_url' | 'location'>
  /** Per-kind counts, always present, zero-filled. */
  actions: Record<ActionKind, number>
  /** The viewer's own actions. Empty until auth exists. */
  my_actions?: ActionKind[]
  updates_count: number
  created_at: string
  last_activity_at: string
}

/** One entry in a Challenge's progress log. */
export interface Update {
  id: string
  challenge_id: string
  author: Pick<Person, 'id' | 'handle' | 'name' | 'avatar_url'>
  /** Moves the Challenge to this stage, if set. */
  stage: Stage | null
  body: string
  media: Media[]
  created_at: string
}

export const EMPTY_ACTIONS: Record<ActionKind, number> = Object.fromEntries(
  ACTION_KINDS.map((k) => [k, 0]),
) as Record<ActionKind, number>

/** Feed sort orders. 'active' is the default - recent movement beats raw age. */
export const FEED_SORTS = ['active', 'new', 'needs_help'] as const
export type FeedSort = (typeof FEED_SORTS)[number]

export interface FeedResponse {
  challenges: Challenge[]
  next_cursor: string | null
}
