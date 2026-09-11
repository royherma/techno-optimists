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
  /** The public identity. Everything anyone else sees says @handle. */
  handle: string
  /**
   * Legal-ish name, PRIVATE. Derived from the email local part at signup, so
   * it is real-identity data nobody chose to publish. It is returned only by
   * /api/auth/me, to the person it belongs to - never on an author, an update
   * or a helper. `PublicPerson` is the shape every other route returns.
   */
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

/**
 * A person as everyone else sees them. No `name`: the handle IS the public
 * identity. Every route except /api/auth/me returns this shape, so a full name
 * cannot reach a response by someone forgetting to omit it.
 */
export type PublicPerson = Omit<Person, 'name'>

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
  /**
   * Where it actually is, when the author placed a pin. Null is the common and
   * permanent case - most Challenges carry no coordinates, and the map shows the
   * subset that does rather than pretending the rest are at 0,0.
   *
   * Not to be confused with `gridRef()` in the web app, which derives a sheet
   * reference from the id. That is an index into a drawing, not a position on
   * earth; only this pair is a real-world location.
   */
  lat: number | null
  lng: number | null
  /** Free tags: 'water', 'cooling', 'agriculture'. */
  tags: string[]
  /**
   * Where the claim came from, when this Challenge was logged on someone else's
   * behalf. Null for anything posted by the person living it, which is the
   * normal case.
   *
   * Deliberately not merged into `author`: the author is who entered it here,
   * the source is who reported it. A row authored by @atlas and sourced from a
   * newspaper is the site logging someone else's problem, and the card says so
   * rather than presenting it as our own find.
   *
   * `url` is usually a link but is not guaranteed to be one - an interview or a
   * phone call is a legitimate source. Callers must check for http(s) before
   * rendering an anchor.
   */
  source: { url: string | null; name: string | null; note: string | null } | null
  /** Set when the row arrived through a bulk import rather than the post form. */
  imported_at: string | null
  author: Pick<PublicPerson, 'id' | 'handle' | 'avatar_url' | 'location'>
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
  author: Pick<PublicPerson, 'id' | 'handle' | 'avatar_url'>
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
