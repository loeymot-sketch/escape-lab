import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Crosshair, ListChecks, Maximize2, Minimize2, X } from 'lucide-react';
import { t } from '../i18n';
import { optionLetter } from '../lib/labels';
import { imageSrc, toNatural, type PublicQuestion, type RoomImage } from '../lib/rooms';

export type Mark = { x: number; y: number; tone?: 'right' | 'trap' | 'miss' | 'pending' };

/** A picture drawn at its natural aspect ratio with markers in natural pixels; optional click handler in natural pixels. */
export function RoomPicture({ image, marks = [], onPick, children, label }: { image: RoomImage; marks?: Mark[]; onPick?: (p: { x: number; y: number }) => void; children?: ReactNode; label?: string }) {
  const src = imageSrc(image);
  const ref = useRef<HTMLDivElement>(null);
  // A picture to click on can be enlarged (scrolls sideways): on a phone a 5 px tolerance is a fraction of a screen pixel otherwise.
  const [zoom, setZoom] = useState(false);
  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onPick || !ref.current) return;
    onPick(toNatural(e.clientX, e.clientY, ref.current.getBoundingClientRect(), image));
  };
  return (
    <figure className={`room-picture${zoom ? ' zoomed' : ''}`}>
      {onPick && (
        <button type="button" className="text-button room-zoom" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
          {zoom ? <><Minimize2 size={14} aria-hidden="true" /> {t('Fit the picture')}</> : <><Maximize2 size={14} aria-hidden="true" /> {t('Enlarge the picture')}</>}
        </button>
      )}
      <div className="room-picture-scroll">
      <div
        ref={ref}
        className={`room-picture-frame${onPick ? ' pickable' : ''}`}
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        onPointerUp={onPick ? pick : undefined}
        role={onPick ? 'application' : undefined}
        aria-label={onPick ? (label ?? t('Picture: click the requested zone')) : undefined}
      >
        {src ? <img src={src} alt={image.alt} draggable={false} /> : <div className="room-picture-missing">{t('Picture unavailable')}</div>}
        <svg viewBox={`0 0 ${image.width} ${image.height}`} preserveAspectRatio="none" aria-hidden="true">
          {children}
          {marks.map((m, i) => (
            <g key={i} className={`room-mark ${m.tone ?? 'pending'}`} transform={`translate(${m.x} ${m.y})`}>
              <circle r={Math.max(image.width, image.height) / 55} />
              <circle r={Math.max(image.width, image.height) / 220} className="dot" />
            </g>
          ))}
        </svg>
      </div>
      </div>
      <figcaption>{image.alt}</figcaption>
    </figure>
  );
}

type Props = {
  question: PublicQuestion;
  busy: boolean;
  /** Disables the inputs (answer recorded, waiting for "next"). */
  locked: boolean;
  onSubmit: (response: Record<string, unknown>) => void;
  /** Markers to show after a hotspot answer (the server's verdict). */
  verdictMarks?: Mark[];
};

/** Renders one question and builds the response the API expects (ids are the question's own public tokens). */
export function RoomQuestion({ question: q, busy, locked, onSubmit, verdictMarks }: Props) {
  const [choice, setChoice] = useState<string[]>([]);
  const [bool, setBool] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [textMode, setTextMode] = useState(false);
  const [zonePick, setZonePick] = useState<string[]>([]);
  const [order, setOrder] = useState<{ id: string; label: string }[]>(q.items ?? []);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const groupId = useId();
  // A new question (or a retry after a wrong answer) starts from a clean slate.
  useEffect(() => { setChoice([]); setBool(null); setText(''); setPoints([]); setZonePick([]); setOrder(q.items ?? []); setPairs({}); }, [q.id, q.wrong]);

  const needClicks = q.clicks ?? 1;
  const response = useMemo((): Record<string, unknown> | null => {
    switch (q.type) {
      case 'choice': return q.multiple ? (choice.length ? { choices: choice } : null) : choice[0] ? { choice: choice[0] } : null;
      case 'truefalse': return bool === null ? null : { value: bool };
      case 'text': return text.trim() ? { text: text.trim() } : null;
      case 'number': {
        const v = Number(text.trim().replace(',', '.').replace(/\s+/g, ''));
        return text.trim() && Number.isFinite(v) ? { value: v } : null;
      }
      case 'hotspot':
        if (textMode) return q.require === 'all' ? (zonePick.length === needClicks ? { zones: zonePick } : null) : zonePick[0] ? { zone: zonePick[0] } : null;
        return q.require === 'all' ? (points.length === needClicks ? { points } : null) : points[0] ? { x: points[0].x, y: points[0].y } : null;
      case 'order': return { order: order.map((x) => x.id) };
      case 'match': {
        const left = q.left ?? [];
        const used = new Set(Object.values(pairs));
        return left.every((l) => pairs[l.id]) && used.size === left.length ? { pairs } : null;
      }
    }
  }, [q, choice, bool, text, points, textMode, zonePick, order, pairs, needClicks]);

  const submit = () => { if (response && !busy && !locked) onSubmit(response); };
  const onEnter = (e: ReactKeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };

  const toggleChoice = (id: string) => {
    if (locked) return;
    setChoice((c) => (q.multiple ? (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]) : [id]));
  };
  const pick = (p: { x: number; y: number }) => {
    if (locked) return;
    setPoints((ps) => (q.require === 'all' ? (ps.length >= needClicks ? [...ps.slice(1), p] : [...ps, p]) : [p]));
  };

  return (
    <div className="room-question">
      {q.type !== 'hotspot' && q.image && <RoomPicture image={q.image} />}

      {q.type === 'choice' && (
        <fieldset className="room-options" aria-describedby={`${groupId}-help`}>
          <legend className="sr-only">{t('Options')}</legend>
          <p id={`${groupId}-help`} className="room-help">{q.multiple ? t('Select every correct option.') : t('Select one option.')}</p>
          {(q.options ?? []).map((o, i) => {
            const on = choice.includes(o.id);
            return (
              <button type="button" key={o.id} className={`room-option${on ? ' selected' : ''}`} role={q.multiple ? 'checkbox' : 'radio'} aria-checked={on} disabled={locked} onClick={() => toggleChoice(o.id)}>
                <span className="room-option-key" aria-hidden="true">{q.multiple ? (on ? <Check size={14} /> : '') : optionLetter(i)}</span>
                <span>{o.label}</span>
              </button>
            );
          })}
        </fieldset>
      )}

      {q.type === 'truefalse' && (
        <div className="room-tf" role="radiogroup" aria-label={t('True or false')}>
          {[true, false].map((v) => (
            <button type="button" key={String(v)} role="radio" aria-checked={bool === v} className={`room-tf-button${bool === v ? ' selected' : ''}`} disabled={locked} onClick={() => setBool(v)}>
              {v ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />} {v ? t('True') : t('False')}
            </button>
          ))}
        </div>
      )}

      {(q.type === 'text' || q.type === 'number') && (
        <div className="room-input-row">
          <label htmlFor={`${groupId}-answer`}>{t('Your answer')}</label>
          <div className="room-input">
            <input
              id={`${groupId}-answer`} value={text} disabled={locked} autoComplete="off" maxLength={200}
              inputMode={q.type === 'number' ? 'decimal' : 'text'} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter}
            />
            {q.unit && <span className="room-unit">{q.unit}</span>}
          </div>
          {q.type === 'number' && text.trim() && !response && <p className="room-help warn">{t('Type a number (a comma or a point for decimals).')}</p>}
        </div>
      )}

      {q.type === 'hotspot' && q.image && (
        <div className="room-hotspot">
          <div className="room-hotspot-bar">
            <span className="room-help">
              {textMode
                ? (q.require === 'all' ? t('Choose the {n} correct zones in the list.', { n: needClicks }) : t('Choose the correct zone in the list.'))
                : (q.require === 'all' ? t('Click {n} places on the picture ({done} placed).', { n: needClicks, done: points.length }) : t('Click the place on the picture.'))}
            </span>
            <button type="button" className="text-button" aria-pressed={textMode} onClick={() => { setTextMode(!textMode); setPoints([]); setZonePick([]); }}>
              {textMode ? <><Crosshair size={14} aria-hidden="true" /> {t('Answer on the picture')}</> : <><ListChecks size={14} aria-hidden="true" /> {t('Text alternative')}</>}
            </button>
          </div>
          {textMode
            ? (
              <fieldset className="room-options">
                <legend className="sr-only">{t('Zones of the picture')}</legend>
                <p className="room-help">{q.image.alt}</p>
                {(q.zoneChoices ?? []).map((z) => {
                  const on = zonePick.includes(z.id);
                  return (
                    <button type="button" key={z.id} className={`room-option${on ? ' selected' : ''}`} role={q.require === 'all' ? 'checkbox' : 'radio'} aria-checked={on} disabled={locked}
                      onClick={() => setZonePick((zs) => (q.require === 'all' ? (on ? zs.filter((x) => x !== z.id) : zs.length < needClicks ? [...zs, z.id] : zs) : [z.id]))}>
                      <span className="room-option-key" aria-hidden="true">{on ? <Check size={14} /> : ''}</span><span>{z.label}</span>
                    </button>
                  );
                })}
              </fieldset>
            )
            : <RoomPicture image={q.image} onPick={locked ? undefined : pick} marks={verdictMarks ?? points.map((p) => ({ ...p, tone: 'pending' as const }))} />}
          {!textMode && points.length > 0 && !locked && <button type="button" className="text-button" onClick={() => setPoints([])}>{t('Clear my clicks')}</button>}
        </div>
      )}

      {q.type === 'order' && (
        <ol className="room-order">
          {order.map((it, i) => (
            <li key={it.id}>
              <span className="room-order-n" aria-hidden="true">{i + 1}</span>
              <span className="room-order-label">{it.label}</span>
              <span className="room-order-moves">
                <button type="button" className="icon-button" disabled={locked || i === 0} aria-label={t('Move "{label}" up', { label: it.label })} onClick={() => setOrder((o) => { const c = [...o]; [c[i - 1], c[i]] = [c[i]!, c[i - 1]!]; return c; })}><ArrowUp size={15} aria-hidden="true" /></button>
                <button type="button" className="icon-button" disabled={locked || i === order.length - 1} aria-label={t('Move "{label}" down', { label: it.label })} onClick={() => setOrder((o) => { const c = [...o]; [c[i + 1], c[i]] = [c[i]!, c[i + 1]!]; return c; })}><ArrowDown size={15} aria-hidden="true" /></button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {q.type === 'match' && (
        <div className="room-match">
          {(q.left ?? []).map((l) => {
            const id = `${groupId}-${l.id}`;
            const taken = new Set(Object.entries(pairs).filter(([k]) => k !== l.id).map(([, v]) => v));
            return (
              <div className="room-match-row" key={l.id}>
                <label htmlFor={id}>{l.label}</label>
                <select id={id} value={pairs[l.id] ?? ''} disabled={locked} onChange={(e) => setPairs((p) => ({ ...p, [l.id]: e.target.value }))}>
                  <option value="">{t('Choose…')}</option>
                  {(q.right ?? []).map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id)}>{r.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {!locked && (
        <button type="button" className="primary room-submit" disabled={!response || busy} onClick={submit}>
          {busy ? t('Checking…') : t('Submit answer')}
        </button>
      )}
    </div>
  );
}
