import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import { SCIENTIFIC_ASSETS } from '../lib/assets';
import type { AssetTextAlternative, ScientificAsset } from '../lib/assets';
import { FLAG_WORDS } from '../ui/common';
import { t, useLang } from '../i18n';
import { pointAsPercent, type EngineAnswer, type EngineProps } from './engines';

const clampPoint = (value: number) => value < 0 ? 0 : value > 100 ? 100 : value;
function movePointWithKeyboard(e: KeyboardEvent<HTMLButtonElement>, marker: { x: number; y: number } | null, choose: (point: { x: number; y: number }) => void) {
  const step = e.shiftKey ? 10 : 5;
  const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
  const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
  if (!(dx || dy)) return;
  e.preventDefault();
  const current = marker ?? { x: 50, y: 50 };
  choose({ x: clampPoint(current.x + dx), y: clampPoint(current.y + dy) });
}

export function PointEngine({ step, answer, setAnswer, disabled }: EngineProps) {
  useLang();
  const asset = step.image ? SCIENTIFIC_ASSETS[step.image.asset] : undefined;
  const targets = step.pointTargets ?? [];
  const points = answer.points ?? {};
  const selections = answer.selections ?? {};
  const [activeId, setActiveId] = useState<string | null>(targets[0]?.id ?? null);
  const activeTarget = targets.find((target) => target.id === activeId) ?? targets.find((target) => !points[target.id] && !selections[target.id]) ?? targets[0];
  const textTarget = asset?.textAlternative?.targetId ? targets.find((target) => target.id === asset.textAlternative?.targetId) : activeTarget;
  const marker = answer.x === undefined || answer.y === undefined ? null : { x: answer.x, y: answer.y };
  const activeMarker = activeTarget ? points[activeTarget.id] ?? null : marker;
  const choosePoint = (point: { x: number; y: number }, advance = true) => activeTarget
    ? (setAnswer({ points: { ...points, [activeTarget.id]: point } }), advance && setActiveId(targets.find((target) => target.id !== activeTarget.id && !points[target.id] && !selections[target.id])?.id ?? activeTarget.id))
    : setAnswer(point);
  const chooseTextSelection = (selection: string) => {
    if (!textTarget) return;
      const nextPoints = { ...points };
      delete nextPoints[textTarget.id];
      setAnswer({ points: Object.keys(nextPoints).length ? nextPoints : undefined, selections: { ...selections, [textTarget.id]: selection } });
      setActiveId(targets.find((target) => target.id !== textTarget.id && !points[target.id] && !selections[target.id])?.id ?? textTarget.id);
  };
  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) {
      if (!marker) choosePoint({ x: 50, y: 50 });
      return;
    }
    choosePoint(pointAsPercent(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
  };
  const [imageFailed, setImageFailed] = useState(false);
  const keyboard = (e: KeyboardEvent<HTMLButtonElement>) => movePointWithKeyboard(e, activeMarker, (point) => choosePoint(point, false));
  if (!asset) return <p className="inline-error" role="alert">{t('This illustrative image is not available in this build ({asset}).', { asset: step.image?.asset ?? 'unknown' })}</p>;
  if (imageFailed) return <div className="inline-error" role="alert"><p>{t('The illustrative image could not be loaded. Check your connection, then reload this page: your attempt is kept on the server.')}</p><button type="button" className="ghost" onClick={() => window.location.reload()}>{t('Reload')}</button></div>;
  return <>
    <div className="image-frame">
      <button type="button" className="image-placeholder scientific" style={{ aspectRatio: `${asset.width} / ${asset.height}` }} onClick={pick} onKeyDown={keyboard} disabled={disabled} aria-label={t('Select a point on the scientific image')} aria-describedby="point-help">
        <img className="scientific-image" src={asset.src} alt="" width={asset.width} height={asset.height} draggable={false} onError={() => setImageFailed(true)} />
        {targets.length ? targets.map((target) => points[target.id] && <span key={target.id} className="marker" aria-hidden="true" style={{ left: `${points[target.id]!.x}%`, top: `${points[target.id]!.y}%` }} />) : marker && <span className="marker" aria-hidden="true" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} />}
      </button>
      <span className="image-watermark">{t('Illustrative training image')}</span>
    </div>
    <PointImageViewer asset={asset} marker={activeMarker} points={points} d={disabled} choose={choosePoint} />
    {targets.length > 0 && <div className="status-list" role="group" aria-label={t('Observation checklist')}>
      {targets.map((target) => { const point = points[target.id]; const selection = selections[target.id]; const selected = Boolean(point || selection); const content = <><span>{selected ? '✓' : '○'} {t(target.label)}</span><b>{selected ? t('Selected') : t('Pending')}</b></>; return disabled
        ? <div className="status-row" key={target.id}>{content}</div>
        : <button type="button" className="status-row" key={target.id} aria-pressed={activeTarget?.id === target.id} onClick={() => setActiveId(target.id)}>{content}</button>; })}
    </div>}
    <p id="point-help" className="image-instruction-text">
      {targets.length ? <>{t('Select each observation on the image.')} {activeTarget && t('Current observation: {target}.', { target: t(activeTarget.label) })} {t('{done} of {total} observations selected.', { done: new Set([...Object.keys(points), ...Object.keys(selections)]).size, total: targets.length })}</> : <>{t('Click the image, or focus it and use the arrow keys (Shift for larger steps) to mark the suspected finding.')}{marker && <> {t('Marker at {x}% across, {y}% down.', { x: Math.round(marker.x), y: Math.round(marker.y) })}</>}</>}
      {asset.textAlternative && <> {t('A text version of this image, with a button for each result, follows the image.')}</>}
    </p>
    {asset.textAlternative && <PointTextAlternative alt={asset.textAlternative} selected={textTarget ? selections[textTarget.id] : undefined} disabled={disabled} choose={chooseTextSelection} />}
    <p className="image-caption">{t('{label}: illustrative training material, not a real specimen, not a validated image and not for clinical use.', { label: t(asset.label) })}</p>
  </>;
}

function PointTextAlternative({ alt, selected, disabled, choose }: { alt: AssetTextAlternative; selected?: string; disabled: boolean; choose: (selection: string) => void }) {
  useLang();
  const captionId = useId();
  return <details className="point-text"><summary>{t('Text version of this image')}</summary><div className="point-text-body">
    <ul className="point-text-indices">{alt.indices.map((index) => <li key={index}>{t(index)}</li>)}</ul>
    <p id={captionId} className="point-text-caption">{t(alt.caption)}</p><p className="point-text-hint">{t('Swipe sideways to see every column.')}</p>
    <div className="point-text-scroll" role="region" aria-label={t('Chemistry panel table')} tabIndex={0}><table aria-labelledby={captionId}><thead><tr><th scope="col">{t('Test')}</th><th scope="col">{t('Result')}</th><th scope="col">{t('Reference')}</th><th scope="col">{t('Flag')}</th><th scope="col">{t('Choose')}</th></tr></thead><tbody>
      {alt.rows.map((row) => { const selectedRow = selected === row.test; return <tr key={row.test}><th scope="row">{t(row.test)}</th><td>{row.result} {row.unit}</td><td>{row.reference}</td><td>{row.flag ? t(FLAG_WORDS[row.flag] ?? row.flag) : t('none')}</td><td><button type="button" className="ghost" aria-pressed={selectedRow} aria-label={t('Select {test} result', { test: t(row.test) })} disabled={disabled} onClick={() => choose(row.test)}>{t('Select')}</button></td></tr>; })}
    </tbody></table></div>
  </div></details>;
}

function PointImageViewer({ asset, marker, choose, d, points = {} }: { asset: ScientificAsset; marker: { x: number; y: number } | null; choose: (point: { x: number; y: number }, advance?: boolean) => void; d: boolean; points?: Record<string, { x: number; y: number }> }) {
  const viewer = useRef<HTMLDialogElement>(null);
  return <><button type="button" className="ghost" disabled={d} onClick={() => viewer.current?.showModal()}>{t('Inspect image: {item}', { item: t(asset.label) })}</button>
    <dialog ref={viewer} className="culture-viewer" aria-label={t(asset.label)}><header><button type="button" className="culture-close" aria-label={t('Close image viewer')} onClick={() => viewer.current?.close()}><X /></button></header>
      <div className="culture-viewer-body point-viewer-scroll"><button type="button" className="point-viewer-image" disabled={d} aria-label={t(asset.label)} onKeyDown={(event) => movePointWithKeyboard(event, marker, (point) => choose(point, false))} onClick={(event) => choose(pointAsPercent(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()))}><img src={asset.src} alt="" />{Object.values(points).map((point, index) => <span key={`${point.x}-${point.y}-${index}`} className="point-viewer-marker" aria-hidden="true" style={{ left: `${point.x}%`, top: `${point.y}%` }} />)}{!Object.keys(points).length && marker && <span className="point-viewer-marker" aria-hidden="true" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} />}</button></div>
    </dialog></>;
}
