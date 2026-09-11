import type { Stage } from '../../../../../packages/types'
import { STAGE_STAMP } from '../../lib/vocab'
export default function StageBadge({ stage }: { stage: Stage }) {
  return <span className="np-stage-badge" aria-label={`Current stage: ${STAGE_STAMP[stage]}`}><i className={`np-stage-color stage-${stage}`} aria-hidden="true" />{STAGE_STAMP[stage]}</span>
}
