import type { CSSProperties } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { RoomPicture, type Mark } from './room-play';
import { TYPE_LABELS, formatDuration, type Review, type ReviewQuestion } from '../lib/rooms';
import { plural, t } from '../i18n';

// ------------------------------------------------------------------ review
/** A learner's answer in words (and the expected one), from the stored ids. */
export function describeResponse(q: Pick<ReviewQuestion, 'type' | 'labels'>, r: Record<string, unknown>): string {
  const L = (id: unknown) => (typeof id === 'string' ? q.labels[id] ?? id : String(id));
  switch (q.type) {
    case 'choice': return Array.isArray(r.choices) ? r.choices.map(L).join(', ') : L(r.choice);
    case 'truefalse': return r.value ? t('True') : t('False');
    case 'text': return String(r.text ?? '');
    case 'number': return String(r.value ?? '');
    case 'hotspot':
      if (r.zone !== undefined) return L(r.zone);
      if (Array.isArray(r.zones)) return r.zones.map(L).join(', ');
      if (Array.isArray(r.points)) return t('{n} clicks on the picture', { n: r.points.length });
      return t('Click at {x}, {y} px', { x: Math.round(Number(r.x)), y: Math.round(Number(r.y)) });
    case 'order': return Array.isArray(r.order) ? r.order.map(L).join(' → ') : '';
    case 'match': return r.pairs && typeof r.pairs === 'object' ? Object.entries(r.pairs as Record<string, string>).map(([l, x]) => `${L(l)} → ${q.labels[`${x}:right`] ?? x}`).join(' · ') : '';
  }
}

export function describeExpected(q: Pick<ReviewQuestion, 'type'>, e: Record<string, unknown>): string {
  switch (q.type) {
    case 'choice': return ((e.options as { label: string; correct: boolean }[]) ?? []).filter((o) => o.correct).map((o) => o.label).join(', ');
    case 'truefalse': return e.value ? t('True') : t('False');
    case 'text': return ((e.accepted as string[]) ?? []).join(' / ');
    case 'number': return `${e.value}${e.tolerance ? ` ± ${e.tolerance}` : ''}${e.unit ? ` ${e.unit}` : ''}`;
    case 'hotspot': return ((e.zones as { label: string; trap: boolean }[]) ?? []).filter((z) => !z.trap).map((z) => z.label).join(', ');
    case 'order': return ((e.order as { label: string }[]) ?? []).map((x) => x.label).join(' → ');
    case 'match': return ((e.pairs as { left: string; right: string }[]) ?? []).map((p) => `${p.left} → ${p.right}`).join(' · ');
  }
}

/** Zones drawn on a picture (expected answer, results heatmap, editor). */
export function ZoneShapes({ zones, tolerance }: { zones: { shape: 'circle' | 'rect'; x: number; y: number; r?: number; w?: number; h?: number; trap?: boolean; id?: string }[]; tolerance: number }) {
  return (
    <>
      {zones.map((z, i) => (
        <g key={z.id ?? i} className={`zone-shape ${z.trap ? 'trap' : 'right'}`}>
          {z.shape === 'circle'
            ? <><circle cx={z.x} cy={z.y} r={(z.r ?? 0) + tolerance} className="tolerance" /><circle cx={z.x} cy={z.y} r={z.r ?? 0} /></>
            : <><rect x={z.x - tolerance} y={z.y - tolerance} width={(z.w ?? 0) + 2 * tolerance} height={(z.h ?? 0) + 2 * tolerance} rx={tolerance} className="tolerance" /><rect x={z.x} y={z.y} width={z.w ?? 0} height={z.h ?? 0} /></>}
        </g>
      ))}
    </>
  );
}

export function ReviewBody({ review }: { review: Review }) {
  return (
    <>
      <div className={`review-hero ${review.passed ? 'passed' : ''}`}>
        <div className="review-score" role="img" aria-label={t('Score {pct}%', { pct: review.pct })} style={{ '--pct': `${review.pct}` } as CSSProperties}>
          <b>{review.pct}%</b>
        </div>
        <div>
          <p className="review-verdict">{review.status === 'timeout' ? t('Time ran out') : review.passed ? t('Passed') : t('Below the pass mark ({pct}%)', { pct: review.passPct })}</p>
          <p className="review-facts">
            {t('{score} / {max} pts', { score: review.score, max: review.maxScore })} · {t('{ok} of {n} solved', { ok: review.totals.correct, n: review.totals.questions })} · {t('Time {time}', { time: formatDuration(review.durationSec) })}
          </p>
          <p className="review-facts">{plural(review.totals.wrong, 'wrong answer')} · {plural(review.totals.traps, 'trap')} · {plural(review.totals.hints, 'hint')}</p>
        </div>
      </div>
      <ol className="review-list">
        {review.questions.map((q) => (
          <li key={q.id} className={`review-item ${q.solved ? 'right' : 'wrong'}`}>
            <p className="room-q-meta">{t('Question {n}', { n: q.ordinal })} · {t(TYPE_LABELS[q.type])} · {t('{earned} / {points} pts', { earned: q.earned, points: q.points })}{q.traps > 0 && <span className="trap-pill">{t('Trap')}</span>}</p>
            <h3>{q.prompt}</h3>
            {q.type === 'hotspot' && q.image && (
              <RoomPicture image={q.image} marks={q.responses.flatMap((r) => (r.h ?? []).map((h) => ({ x: h.x, y: h.y, tone: (h.zone && !h.trap ? 'right' : h.trap ? 'trap' : 'miss') as Mark['tone'] })))}>
                {q.expected && <ZoneShapes zones={(q.expected.zones as never[]) ?? []} tolerance={Number(q.expected.tolerance ?? 0)} />}
              </RoomPicture>
            )}
            <dl className="review-answers">
              {q.responses.length === 0 ? <><dt>{t('Your answer')}</dt><dd>{t('Not answered')}</dd></> : q.responses.map((r, i) => (
                <div key={i} className={r.correct ? 'right' : r.trap ? 'trap' : 'wrong'}>
                  <dt>{q.responses.length > 1 ? t('Try {n}', { n: i + 1 }) : t('Your answer')}</dt>
                  <dd>{Object.keys(q.labels).length === 0 && r.display !== undefined ? t(r.display) : describeResponse(q, r.r)} {r.correct ? <CheckCircle2 size={14} aria-label={t('correct')} /> : r.trap ? <AlertTriangle size={14} aria-label={t('trap')} /> : <XCircle size={14} aria-label={t('wrong')} />}</dd>
                </div>
              ))}
              {q.expected && <div className="expected"><dt>{t('Expected')}</dt><dd>{describeExpected(q, q.expected)}</dd></div>}
            </dl>
            {q.explanation && <p className="room-explanation">{q.explanation}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}

