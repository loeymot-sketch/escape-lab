import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ImageOff, X, ZoomIn } from 'lucide-react';
import { SCIENTIFIC_ASSETS } from '../lib/assets';
import cultureObservation1 from '../assets/culture-observation-01.webp';
import cultureObservation2 from '../assets/culture-observation-02.webp';
import cultureObservation3 from '../assets/culture-observation-03.webp';
import cultureObservation4 from '../assets/culture-observation-04.webp';
import type { AssetTextAlternative } from '../lib/assets';
import type { PublicStep } from '../lib/attempt';
import { optionLetter } from '../lib/labels';
import { FLAG_WORDS } from '../ui/common';
import { t, useLang } from '../i18n';

export type EngineAnswer = { x?: number; y?: number; choice?: string; decision?: string; order?: string[]; pairs?: Record<string, string> };

export function pointAsPercent(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return {
    x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
  };
}

/** What an engine starts with. An order list starts as the server's arrangement, which is itself a submittable answer. */
export function initialAnswer(step: PublicStep): EngineAnswer {
  return step.kind === 'order' ? { order: (step.items ?? []).map((item) => item.id) } : {};
}

/** Presentation-only completeness check: enough input to send. The server alone decides correctness. */
export function isAnswerReady(step: PublicStep, answer: EngineAnswer): boolean {
  switch (step.kind) {
    case 'point': return answer.x !== undefined && answer.y !== undefined;
    case 'choice': return Boolean(answer.choice);
    case 'decision': return Boolean(answer.decision);
    case 'order': return (answer.order?.length ?? 0) === (step.items?.length ?? -1);
    case 'match': {
      const pairs = answer.pairs ?? {};
      const lefts = step.left ?? [];
      const chosen = lefts.map((l) => pairs[l.id]).filter(Boolean);
      return chosen.length === lefts.length && new Set(chosen).size === lefts.length;
    }
  }
}

export type EngineProps = { step: PublicStep; answer: EngineAnswer; setAnswer: (next: EngineAnswer) => void; disabled: boolean };

const matchingEvidence: Record<string, { src: string; alt: string }> = {
  'pink-mac': { src: cultureObservation1, alt: 'Pink MacConkey agar plate with pink colonies.' },
  'beta-hemo': { src: cultureObservation2, alt: 'Blood agar plate with pale colonies and clear halos.' },
  swarm: { src: cultureObservation3, alt: 'Red blood agar with concentric rings of spreading growth.' },
  green: { src: cultureObservation4, alt: 'Green agar plate with green-pigmented colonies.' },
};

/** Inspect the supplied observation without changing or submitting the learner's answer. */
function CultureEvidence({ evidence, observation }: { evidence: { src: string; alt: string }; observation: string }) {
  const viewer = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const scrollStyles = useRef<{ overflow: string; gutter: string } | null>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const source = retryCount === 0 ? evidence.src : `${evidence.src}${evidence.src.includes('?') ? '&' : '?'}image-retry=${retryCount}`;
  const restoreScroll = () => {
    const saved = scrollStyles.current;
    if (!saved) return;
    document.body.style.overflow = saved.overflow;
    document.documentElement.style.scrollbarGutter = saved.gutter;
    scrollStyles.current = null;
  };
  const closeViewer = () => {
    if (viewer.current?.open) viewer.current.close();
    restoreScroll();
    setOpen(false);
    opener.current?.focus({ preventScroll: true });
  };
  const retry = () => {
    // The viewer's Retry button disappears when the image is retried; move focus to its stable Close control first.
    if (viewer.current?.open && viewer.current.contains(document.activeElement)) viewer.current.querySelector<HTMLButtonElement>('.culture-close')?.focus();
    setFailed(false);
    setRetryCount((count) => count + 1);
  };

  useEffect(() => {
    if (!open || !viewer.current) return;
    const dialog = viewer.current;
    scrollStyles.current = { overflow: document.body.style.overflow, gutter: document.documentElement.style.scrollbarGutter };
    document.documentElement.style.scrollbarGutter = 'stable';
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      restoreScroll();
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <div className="culture-photo">
      <button ref={opener} type="button" className={`culture-thumb${failed ? ' culture-thumb-failed' : ''}`}
        aria-label={t(failed ? 'Retry image for {item}' : 'Inspect image: {item}', { item: observation })}
        onClick={failed ? retry : () => setOpen(true)}>
        {failed
          ? <><ImageOff size={25} aria-hidden="true" /><span>{t('Retry image')}</span></>
          : <><img src={source} alt={t(evidence.alt)} width="720" height="720" loading="lazy" decoding="async" onError={() => setFailed(true)} /><span className="culture-zoom" aria-hidden="true"><ZoomIn size={16} /></span></>}
      </button>
      {failed && <p className="culture-image-error" role="status">{t('Image unavailable. The observation remains below.')}</p>}
      <dialog ref={viewer} className="culture-viewer" aria-labelledby={titleId}
        onClose={() => { if (scrollStyles.current && !viewer.current?.open) closeViewer(); }}
        onCancel={(event) => { event.preventDefault(); closeViewer(); }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')].filter((button) => button.getClientRects().length > 0);
          const first = buttons[0];
          const last = buttons.at(-1);
          if (!first || !last) return;
          // Native modal inertness blocks the page, but a single focusable control can still Tab into browser chrome.
          if (buttons.length === 1 || document.activeElement === (event.shiftKey ? first : last)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeViewer();
        }}>
        <header><h2 id={titleId}>{observation}</h2><button type="button" className="culture-close" aria-label={t('Close image viewer')} autoFocus onClick={closeViewer}><X size={21} aria-hidden="true" /></button></header>
        {open && <div className="culture-viewer-body">
          {failed
            ? <div className="culture-viewer-error" role="alert"><ImageOff size={32} aria-hidden="true" /><p>{t('This image could not be loaded. Your associations are kept.')}</p><button type="button" className="ghost" onClick={retry}>{t('Retry image')}</button></div>
            : <img className="culture-viewer-photo" src={source} alt={t(evidence.alt)} width="720" height="720" decoding="async" onError={() => setFailed(true)} />}
        </div>}
        <p className="culture-viewer-caption">{t('Illustrative training image')} · {t('The mission timer keeps running.')}</p>
      </dialog>
    </div>
  );
}

export function GameEngine(props: EngineProps) {
  const { step } = props;
  useLang();
  if (step.kind === 'point') return <ImageIdentify {...props} />;
  if (step.kind === 'order') return <DragOrder {...props} />;
  if (step.kind === 'match') return <Matching {...props} />;
  return <ChoiceLike {...props} />;
}

function ChoiceLike({ step, answer, setAnswer, disabled }: EngineProps) {
  const field = step.kind === 'decision' ? 'decision' : 'choice';
  return (
    <div className="answer-options" role="group" aria-label={step.kind === 'decision' ? t('Decision options') : t('Answer options')}>
      {(step.options ?? []).map((option, index) => (
        <button
          type="button"
          key={option.id}
          className={answer[field] === option.id ? 'selected' : ''}
          aria-pressed={answer[field] === option.id}
          disabled={disabled}
          onClick={() => setAnswer({ [field]: option.id })}
        >
          <span className="chip" aria-hidden="true">{optionLetter(index)}</span>
          <span className="opt-label">{t(option.label)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The text version of a picture that is itself a table of values (R36 B36-001): a real table for assistive technology, and one button per result so the
 * answer can be given without a pointer. A button submits the same {x, y} a click on that result cell would: the server alone decides correctness.
 */
function PointTextAlternative({ alt, marker, disabled, choose }: { alt: AssetTextAlternative; marker: { x: number; y: number } | null; disabled: boolean; choose: (x: number, y: number) => void }) {
  useLang();
  const captionId = useId();
  return (
    <details className="point-text">
      <summary>{t('Text version of this image')}</summary>
      <div className="point-text-body">
        <ul className="point-text-indices">{alt.indices.map((index) => <li key={index}>{t(index)}</li>)}</ul>
        {/* The caption (with the "not a real report" wording) stays outside the sideways-scrolling region so it is always readable. */}
        <p id={captionId} className="point-text-caption">{t(alt.caption)}</p>
        <p className="point-text-hint">{t('Swipe sideways to see every column.')}</p>
        <div className="point-text-scroll" role="region" aria-label={t('Chemistry panel table')} tabIndex={0}>
          <table aria-labelledby={captionId}>
            <thead><tr><th scope="col">{t('Test')}</th><th scope="col">{t('Result')}</th><th scope="col">{t('Reference')}</th><th scope="col">{t('Flag')}</th><th scope="col">{t('Choose')}</th></tr></thead>
            <tbody>
              {alt.rows.map((row) => {
                const selected = marker !== null && marker.x === row.x && Math.abs(marker.y - row.y) < 0.05;
                return (
                  <tr key={row.test}>
                    <th scope="row">{t(row.test)}</th>
                    <td>{row.result} {row.unit}</td>
                    <td>{row.reference}</td>
                    <td>{row.flag ? t(FLAG_WORDS[row.flag] ?? row.flag) : t('none')}</td>
                    <td><button type="button" className="ghost" aria-pressed={selected} aria-label={t('Select {test} result', { test: t(row.test) })} disabled={disabled} onClick={() => choose(row.x, row.y)}>{t('Select')}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function ImageIdentify({ step, answer, setAnswer, disabled }: EngineProps) {
  useLang();
  const asset = step.image ? SCIENTIFIC_ASSETS[step.image.asset] : undefined;
  const marker = answer.x === undefined || answer.y === undefined ? null : { x: answer.x, y: answer.y };

  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    // A keyboard activation (Enter/Space) reports no pointer position: place the marker at the centre instead.
    if (e.detail === 0) {
      if (!marker) setAnswer({ x: 50, y: 50 });
      return;
    }
    setAnswer(pointAsPercent(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
  };

  const [imageFailed, setImageFailed] = useState(false);
  const keyboard = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step_ = e.shiftKey ? 10 : 5;
    const dx = e.key === 'ArrowRight' ? step_ : e.key === 'ArrowLeft' ? -step_ : 0;
    const dy = e.key === 'ArrowDown' ? step_ : e.key === 'ArrowUp' ? -step_ : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const current = marker ?? { x: 50, y: 50 };
    setAnswer({ x: Math.max(0, Math.min(100, current.x + dx)), y: Math.max(0, Math.min(100, current.y + dy)) });
  };

  if (!asset) {
    return <p className="inline-error" role="alert">{t('This illustrative image is not available in this build ({asset}).', { asset: step.image?.asset ?? 'unknown' })}</p>;
  }
  if (imageFailed) {
    return (
      <div className="inline-error" role="alert">
        <p>{t('The illustrative image could not be loaded. Check your connection, then reload this page: your attempt is kept on the server.')}</p>
        <button type="button" className="ghost" onClick={() => window.location.reload()}>{t('Reload')}</button>
      </div>
    );
  }

  return (
    <>
      <div className="image-frame">
        <button
          type="button"
          className="image-placeholder scientific"
          style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
          onClick={pick}
          onKeyDown={keyboard}
          disabled={disabled}
          aria-label={t('Select a point on the scientific image')}
          aria-describedby="point-help"
        >
          <img className="scientific-image" src={asset.src} alt="" width={asset.width} height={asset.height} decoding="async" draggable={false} onError={() => setImageFailed(true)} />
          {marker && <span className="marker" aria-hidden="true" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} />}
        </button>
        {/* The label sits below the image, outside the clickable area: it never covers artwork or the marker. */}
        <span className="image-watermark">{t('Illustrative training image')}</span>
      </div>
      <p id="point-help" className="image-instruction-text">
        {t('Click the image, or focus it and use the arrow keys (Shift for larger steps) to mark the suspected finding.')}
        {asset.textAlternative && <> {t('A text version of this image, with a button for each result, follows the image.')}</>}
        {marker && <> {t('Marker at {x}% across, {y}% down.', { x: Math.round(marker.x), y: Math.round(marker.y) })}</>}
      </p>
      {asset.textAlternative && <PointTextAlternative alt={asset.textAlternative} marker={marker} disabled={disabled} choose={(x, y) => setAnswer({ x, y })} />}
      <p className="image-caption">
        {t('{label}: illustrative training material, not a real specimen, not a validated image and not for clinical use.', { label: t(asset.label) })}
      </p>
    </>
  );
}

function DragOrder({ step, answer, setAnswer, disabled }: EngineProps) {
  useLang();
  // The nonce makes a repeated message a new node inside the live region, so a screen reader says it again on every press.
  const [announced, setAnnounced] = useState({ text: '', nonce: 0 });
  const setAnnounce = (text: string) => setAnnounced((previous) => ({ text, nonce: previous.nonce + 1 }));
  const items = step.items ?? [];
  const labels = new Map(items.map((item) => [item.id, item.label]));
  const order = answer.order ?? items.map((item) => item.id);
  // Reordering the list moves the row in the DOM, which can drop keyboard focus: after each move focus goes back to the button that was pressed.
  // At the first or last place that button is aria-disabled (never `disabled`, which would drop focus), so it stays focused and pressing it
  // again does nothing instead of sending the item back the other way.
  const buttons = useRef(new Map<string, { up: HTMLButtonElement | null; down: HTMLButtonElement | null }>());
  const refocus = useRef<{ id: string; delta: number } | null>(null);
  useEffect(() => {
    const wanted = refocus.current;
    if (!wanted) return;
    refocus.current = null;
    const pair = buttons.current.get(wanted.id);
    const pressed = wanted.delta < 0 ? pair?.up : pair?.down;
    if (pressed && !pressed.disabled) pressed.focus();
  });
  const slot = (id: string, which: 'up' | 'down') => (node: HTMLButtonElement | null) => {
    const pair = buttons.current.get(id) ?? { up: null, down: null };
    pair[which] = node;
    buttons.current.set(id, pair);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) {
      setAnnounce(t('{item} is already in position {position} of {total}.', { item: t(labels.get(order[index]!) ?? 'undefined'), position: index + 1, total: order.length }));
      return;
    }
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    refocus.current = { id: order[index]!, delta };
    setAnswer({ order: next });
    setAnnounce(t('{item} moved to position {position} of {total}.', { item: t(labels.get(order[index]!) ?? 'undefined'), position: target + 1, total: order.length }));
  };

  return (
    <>
      <ol className="drag-list" aria-label={t('Order the items. Use the move buttons to change a position.')}>
        {order.map((id, index) => {
          const label = t(labels.get(id) ?? id);
          return (
            <li className="drag-row" key={id}>
              <GripVertical size={16} aria-hidden="true" />
              <span className="drag-number" aria-hidden="true">{index + 1}</span>
              <b>{label}</b>
              <div className="move-buttons">
                <button type="button" ref={slot(id, 'up')} aria-label={t('Move up: {item}', { item: label })} disabled={disabled} aria-disabled={index === 0 ? true : undefined} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" ref={slot(id, 'down')} aria-label={t('Move down: {item}', { item: label })} disabled={disabled} aria-disabled={index === order.length - 1 ? true : undefined} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">{announced.text && <span key={announced.nonce}>{announced.text}</span>}</p>
    </>
  );
}

function Matching({ step, answer, setAnswer, disabled }: EngineProps) {
  useLang();
  const fieldsId = useId();
  const pairs = answer.pairs ?? {};
  const lefts = step.left ?? [];
  const rights = step.right ?? [];
  const counts = new Map<string, number>();
  for (const l of lefts) if (pairs[l.id]) counts.set(pairs[l.id]!, (counts.get(pairs[l.id]!) ?? 0) + 1);
  const mapped = lefts.filter((l) => pairs[l.id]).length;
  const duplicates = [...counts.values()].some((n) => n > 1);

  return (
    <>
      {step.id === 'mic-03-s1' && <p className="culture-inspection-help">{t('Inspect each image in detail, then associate the observation with an organism.')}</p>}
      <div className="matching-list">
        {lefts.map((l) => {
          const chosen = pairs[l.id] ?? '';
          const clash = Boolean(chosen) && (counts.get(chosen) ?? 0) > 1;
          const evidence = step.id === 'mic-03-s1' ? matchingEvidence[l.id] : undefined;
          const fieldId = `${fieldsId}-${l.id}`;
          return (
            <div className="match-row" key={l.id}>
              <div className={evidence ? 'match-evidence' : 'match-observation'}>
                {evidence && <CultureEvidence evidence={evidence} observation={t(l.label)} />}
                <label className={evidence ? 'match-evidence-copy' : undefined} htmlFor={fieldId}>{t(l.label)}</label>
              </div>
              <div className="match-selection">
                <select
                  id={fieldId}
                  value={chosen}
                  disabled={disabled}
                  aria-invalid={clash}
                  aria-label={t('Association for {item}', { item: t(l.label) })}
                  aria-describedby={clash ? `${fieldId}-error` : undefined}
                  onChange={(e) => setAnswer({ pairs: { ...pairs, [l.id]: e.target.value } })}
                >
                  <option value="">{t('Choose association…')}</option>
                  {rights.map((r) => <option value={r.id} key={r.id}>{t(r.label)}</option>)}
                </select>
                {clash && <p className="match-duplicate" id={`${fieldId}-error`}>{t('Already used for another observation.')}</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="match-note" role="status">
        {t('{mapped} of {total} matched.', { mapped, total: lefts.length })}{duplicates ? ` ${t('Each association can be used only once.')}` : mapped < lefts.length ? ` ${t('Match every item to enable Submit.')}` : ''}
      </p>
    </>
  );
}
