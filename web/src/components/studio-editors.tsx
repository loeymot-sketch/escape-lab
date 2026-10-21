import { useEffect, useId, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Circle, Crosshair, ImagePlus, MousePointer2, Plus, Square, Trash2, Upload, X } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { expectRecord, imageSrc, move, newId, toNatural, zoneDistance, type LibraryImage, type MediaItem, type Question, type QuestionType, type RoomImage, type Zone } from '../lib/rooms';
import { formatInt, t } from '../i18n';
import { describeError } from '../ui/state';
import { ZoneShapes } from './room-review';

// ------------------------------------------------------------------ small fields
export function Field({ label, help, children, wide = false }: { label: string; help?: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`studio-field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {help && <p className="studio-help">{help}</p>}
    </div>
  );
}

export function TextArea({ id, value, onChange, rows = 3, max, placeholder }: { id: string; value: string; onChange: (v: string) => void; rows?: number; max: number; placeholder?: string }) {
  return (
    <div className="studio-textarea">
      <textarea id={id} value={value} rows={rows} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value.length > max * 0.8 && <span className="studio-count">{value.length} / {max}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  const id = useId();
  return (
    <div className="studio-toggle">
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}><span className="studio-switch" aria-hidden="true" />{label}</label>
      {help && <p className="studio-help">{help}</p>}
    </div>
  );
}

const num = (v: string, fallback: number) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : fallback; };

// ------------------------------------------------------------------ pictures
/** Shrinks a big picture in the browser before upload (long side 2400 px), so a phone photo fits the 4 MB limit. */
async function prepareUpload(file: File): Promise<string> {
  const read = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return read(file);
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.max(bitmap.width, bitmap.height);
    if (side <= 2400 && file.size <= 3_500_000) { bitmap.close(); return read(file); }
    const scale = Math.min(1, 2400 / side);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return read(blob ?? file);
  } catch {
    return read(file);
  }
}

export function ImagePicker({ value, onChange, required = false, allowRemove = true }: { value: RoomImage | undefined; onChange: (img: RoomImage | undefined) => void; required?: boolean; allowRemove?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'upload' | 'mine' | 'library'>('upload');
  const [mine, setMine] = useState<MediaItem[] | null>(null);
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const altId = useId();

  useEffect(() => {
    if (!open) return;
    if (tab === 'mine' && mine === null) api('/studio/media').then((raw) => setMine(expectRecord<{ media: MediaItem[] }>(raw, 'media').media), (e) => setError(describeError(e)));
    if (tab === 'library' && library === null) api('/studio/library').then((raw) => setLibrary(expectRecord<{ images: LibraryImage[] }>(raw, 'images').images), (e) => setError(describeError(e)));
  }, [open, tab, mine, library]);

  const choose = (img: Omit<RoomImage, 'alt'>) => { onChange({ ...img, alt: value?.alt ?? '' }); setOpen(false); setError(''); };
  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { setError(t('Use a PNG, JPEG, WebP or GIF picture.')); return; }
    setBusy(true); setError('');
    try {
      const data = await prepareUpload(file);
      const out = expectRecord<MediaItem>(await api('/studio/media', { method: 'POST', body: JSON.stringify({ data, name: file.name.slice(0, 120) }) }), 'id');
      setMine((m) => (m ? [out, ...m] : m));
      choose({ media: out.id, width: out.width, height: out.height });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 413 ? t('This picture is too large even after resizing (4 MB at most).') : describeError(e));
    } finally { setBusy(false); }
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]); };
  const src = imageSrc(value);

  return (
    <div className="image-picker">
      {value && src ? (
        <div className="image-picker-current">
          <img src={src} alt="" />
          <div>
            <p className="studio-help">{t('{w} × {h} px', { w: formatInt(value.width), h: formatInt(value.height) })}</p>
            <label htmlFor={altId}>{t('Description for learners who cannot see the picture')}</label>
            <input id={altId} value={value.alt} maxLength={300} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder={t('What the picture shows, without giving the answer')} />
            <div className="studio-inline">
              <button type="button" className="text-button" onClick={() => setOpen(!open)}><ImagePlus size={14} aria-hidden="true" /> {t('Change the picture')}</button>
              {allowRemove && !required && <button type="button" className="text-button danger" onClick={() => onChange(undefined)}><X size={14} aria-hidden="true" /> {t('Remove')}</button>}
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className={`image-picker-empty${required ? ' required' : ''}`} onClick={() => setOpen(!open)}>
          <ImagePlus size={20} aria-hidden="true" /> {required ? t('Choose the picture students will click on') : t('Add a picture (optional)')}
        </button>
      )}
      {open && (
        <div className="image-picker-panel">
          <div className="studio-tabs small" role="tablist">
            {(['upload', 'mine', 'library'] as const).map((k) => (
              <button type="button" role="tab" key={k} aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                {k === 'upload' ? t('Upload') : k === 'mine' ? t('My pictures') : t('Library')}
              </button>
            ))}
            <button type="button" className="icon-button" aria-label={t('Close')} onClick={() => setOpen(false)}><X size={15} aria-hidden="true" /></button>
          </div>
          {tab === 'upload' && (
            <div className={`dropzone${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
              <Upload size={24} aria-hidden="true" />
              <p>{busy ? t('Uploading…') : t('Drop a picture here, or')}</p>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" id={`${altId}-file`} onChange={(e) => void upload(e.target.files?.[0])} />
              <label htmlFor={`${altId}-file`} className="primary">{t('Choose a file')}</label>
              <p className="studio-help">{t('PNG, JPEG, WebP or GIF. Large photos are resized to 2400 px before sending.')}</p>
            </div>
          )}
          {tab === 'mine' && (
            mine === null ? <p className="studio-help">{t('Loading…')}</p> : mine.length === 0 ? <p className="studio-help">{t('No uploaded picture yet.')}</p> : (
              <ul className="image-grid">
                {mine.map((m) => <li key={m.id}><button type="button" onClick={() => choose({ media: m.id, width: m.width, height: m.height })}><img src={imageSrc({ media: m.id })!} alt="" loading="lazy" /><span>{m.name || t('Picture')}</span></button></li>)}
              </ul>
            )
          )}
          {tab === 'library' && (
            library === null ? <p className="studio-help">{t('Loading…')}</p> : (
              <ul className="image-grid">
                {library.map((m) => <li key={m.id}><button type="button" onClick={() => choose({ asset: m.id, width: m.width, height: m.height })}><img src={imageSrc({ asset: m.id }) ?? ''} alt="" loading="lazy" /><span>{t(m.label)}</span></button></li>)}
              </ul>
            )
          )}
          {error && <p className="room-alert" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {error}</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ hotspot editor
type Tool = 'circle' | 'rect' | 'select' | 'test';

/** Draw circles and rectangles on the picture, move them, set the pixel tolerance, and test clicks exactly as the server grades them. */
export function HotspotEditor({ q, onChange }: { q: Question & { type: 'hotspot' }; onChange: (q: Question) => void }) {
  const img = q.image;
  const frame = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>(q.zones.length ? 'select' : 'circle');
  const [selected, setSelected] = useState<string | null>(q.zones[0]?.id ?? null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [test, setTest] = useState<{ x: number; y: number; text: string; tone: 'right' | 'trap' | 'miss' } | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!frame.current || !img) return undefined;
    const el = frame.current;
    const measure = () => setScale(el.getBoundingClientRect().width / img.width || 1);
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [img]);

  if (!img) return <p className="studio-help warn"><AlertTriangle size={14} aria-hidden="true" /> {t('Choose the picture first: zones are drawn on it.')}</p>;
  const setZones = (zones: Zone[]) => onChange({ ...q, zones });
  const update = (id: string, patch: Partial<Zone>) => setZones(q.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const at = (e: ReactPointerEvent) => toNatural(e.clientX, e.clientY, frame.current!.getBoundingClientRect(), img);
  const clampZone = (z: Zone): Zone => ({ ...z, x: Math.round(Math.min(img.width, Math.max(0, z.x))), y: Math.round(Math.min(img.height, Math.max(0, z.y))) });
  const hitZone = (p: { x: number; y: number }) => [...q.zones].reverse().find((z) => zoneDistance(z, p.x, p.y) === 0);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = at(e);
    if (tool === 'test') {
      const right = q.zones.filter((z) => !z.trap);
      const traps = q.zones.filter((z) => z.trap);
      const inRight = right.find((z) => zoneDistance(z, p.x, p.y) <= q.tolerance + 1e-9);
      const inTrap = traps.find((z) => zoneDistance(z, p.x, p.y) <= q.tolerance + 1e-9);
      if (inRight) setTest({ ...p, tone: 'right', text: t('Accepted: inside "{label}" ({d} px from the edge, tolerance {tol} px).', { label: inRight.label || '?', d: Math.round(zoneDistance(inRight, p.x, p.y)), tol: q.tolerance }) });
      else if (inTrap) setTest({ ...p, tone: 'trap', text: t('Trap: "{label}". The student reads: {feedback}', { label: inTrap.label || '?', feedback: inTrap.feedback || t('(no feedback written yet)') }) });
      else {
        const nearest = right.map((z) => ({ z, d: zoneDistance(z, p.x, p.y) })).sort((a, b) => a.d - b.d)[0];
        setTest({ ...p, tone: 'miss', text: nearest ? t('Missed: {d} px from "{label}" (tolerance {tol} px).', { d: Math.round(nearest.d), label: nearest.z.label || '?', tol: q.tolerance }) : t('No correct zone yet.') });
      }
      return;
    }
    const hit = hitZone(p);
    if (tool === 'select' || hit) {
      if (hit) { setSelected(hit.id); setDrag({ id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y }); e.currentTarget.setPointerCapture?.(e.pointerId); }
      return;
    }
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moveP = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draft) { const p = at(e); setDraft({ ...draft, x1: p.x, y1: p.y }); }
    if (drag) { const p = at(e); update(drag.id, clampZone({ ...q.zones.find((z) => z.id === drag.id)!, x: p.x - drag.dx, y: p.y - drag.dy })); }
  };
  const up = () => {
    if (drag) { setDrag(null); return; }
    if (!draft) return;
    const min = Math.max(12, Math.round(Math.min(img.width, img.height) * 0.025));
    const id = newId('z');
    let zone: Zone;
    if (tool === 'rect') {
      const w = Math.abs(draft.x1 - draft.x0); const h = Math.abs(draft.y1 - draft.y0);
      zone = w < 4 && h < 4
        ? { id, label: '', shape: 'rect', x: Math.round(draft.x0 - min), y: Math.round(draft.y0 - min), w: 2 * min, h: 2 * min }
        : { id, label: '', shape: 'rect', x: Math.round(Math.min(draft.x0, draft.x1)), y: Math.round(Math.min(draft.y0, draft.y1)), w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)) };
    } else {
      const r = Math.round(Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0));
      zone = { id, label: '', shape: 'circle', x: Math.round(draft.x0), y: Math.round(draft.y0), r: r < 4 ? min : r };
    }
    setDraft(null);
    setZones([...q.zones, clampZone(zone)]);
    setSelected(id);
    setTool('select');
  };
  /** Keyboard path: a zone in the middle of the picture, then placed with the numeric fields. */
  const addCentred = (shape: 'circle' | 'rect') => {
    const id = newId('z');
    const size = Math.round(Math.min(img.width, img.height) * 0.08);
    const zone: Zone = shape === 'circle'
      ? { id, label: '', shape, x: Math.round(img.width / 2), y: Math.round(img.height / 2), r: size }
      : { id, label: '', shape, x: Math.round(img.width / 2 - size), y: Math.round(img.height / 2 - size), w: 2 * size, h: 2 * size };
    setZones([...q.zones, zone]);
    setSelected(id);
    setTool('select');
  };
  const sel = q.zones.find((z) => z.id === selected) ?? null;
  const screenTol = Math.round(q.tolerance * scale * 10) / 10;
  const rightCount = q.zones.filter((z) => !z.trap).length;

  return (
    <div className="hotspot-editor">
      <div className="hotspot-toolbar" role="toolbar" aria-label={t('Zone tools')}>
        {([['circle', <Circle size={15} key="c" />, t('Draw a circle')], ['rect', <Square size={15} key="r" />, t('Draw a rectangle')], ['select', <MousePointer2 size={15} key="s" />, t('Select and move')], ['test', <Crosshair size={15} key="t" />, t('Test a click')]] as const).map(([k, icon, label]) => (
          <button type="button" key={k} className={tool === k ? 'active' : ''} aria-pressed={tool === k} onClick={() => { setTool(k); setTest(null); }}>{icon} {label}</button>
        ))}
      </div>
      <div className="studio-inline">
        <button type="button" className="text-button" onClick={() => addCentred('circle')}><Plus size={14} aria-hidden="true" /> {t('Add a circle in the middle')}</button>
        <button type="button" className="text-button" onClick={() => addCentred('rect')}><Plus size={14} aria-hidden="true" /> {t('Add a rectangle in the middle')}</button>
        <span className="studio-help">{t('Then move it with the x and y fields: no mouse needed.')}</span>
      </div>
      <p className="studio-help">
        {tool === 'circle' ? t('Press on the centre and drag to the edge. A simple click makes a small circle.')
          : tool === 'rect' ? t('Press on a corner and drag to the opposite corner.')
            : tool === 'test' ? t('Click anywhere: the result is exactly what a student would get.')
              : t('Click a zone to edit it; drag it to move it.')}
      </p>
      <div className="hotspot-canvas">
        <div
          ref={frame}
          className={`room-picture-frame editing tool-${tool}`}
          style={{ aspectRatio: `${img.width} / ${img.height}` }}
          onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={() => { setDraft(null); setDrag(null); }}
        >
          <img src={imageSrc(img) ?? ''} alt={img.alt} draggable={false} />
          <svg viewBox={`0 0 ${img.width} ${img.height}`} preserveAspectRatio="none" aria-hidden="true">
            <ZoneShapes zones={q.zones} tolerance={q.tolerance} />
            {sel && (sel.shape === 'circle'
              ? <circle cx={sel.x} cy={sel.y} r={(sel.r ?? 0) + 2 / scale} className="zone-selected" />
              : <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} className="zone-selected" />)}
            {q.zones.map((z, i) => <text key={z.id} x={z.x + (z.shape === 'rect' ? (z.w ?? 0) / 2 : 0)} y={z.y + (z.shape === 'rect' ? (z.h ?? 0) / 2 : 0)} className="zone-index" style={{ fontSize: Math.max(img.width, img.height) / 45 }}>{i + 1}</text>)}
            {draft && (tool === 'rect'
              ? <rect x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)} width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} className="zone-draft" />
              : <circle cx={draft.x0} cy={draft.y0} r={Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0)} className="zone-draft" />)}
            {test && <g className={`room-mark ${test.tone}`} transform={`translate(${test.x} ${test.y})`}><circle r={Math.max(img.width, img.height) / 60} /><circle r={Math.max(img.width, img.height) / 240} className="dot" /></g>}
          </svg>
        </div>
        {test && <p className={`hotspot-test ${test.tone}`} role="status">{test.text}</p>}
      </div>

      <div className="hotspot-settings">
        <Field label={t('Click tolerance: {n} px', { n: q.tolerance })} help={t('Extra margin around every zone, in pixels of the original picture (about {s} px on this screen). The dashed ring shows it.', { s: screenTol })}>
          {(id) => (
            <div className="studio-range">
              <input id={id} type="range" min={0} max={40} step={1} value={q.tolerance} onChange={(e) => onChange({ ...q, tolerance: Number(e.target.value) })} />
              <input type="number" min={0} max={100} value={q.tolerance} aria-label={t('Tolerance in pixels')} onChange={(e) => onChange({ ...q, tolerance: Math.max(0, Math.min(100, Math.round(num(e.target.value, q.tolerance)))) })} />
            </div>
          )}
        </Field>
        <Toggle checked={q.require === 'all'} onChange={(v) => onChange({ ...q, require: v ? 'all' : 'any' })} label={t('Students must find every correct zone ({n})', { n: rightCount })} help={t('Off: one click in any correct zone is enough.')} />
      </div>

      <ol className="zone-list">
        {q.zones.map((z, i) => (
          <li key={z.id} className={`${z.trap ? 'trap' : 'right'}${z.id === selected ? ' selected' : ''}`} onFocus={() => setSelected(z.id)}>
            <div className="zone-row">
              <span className="zone-n" aria-hidden="true">{i + 1}</span>
              <input value={z.label} maxLength={80} aria-label={t('Label of zone {n}', { n: i + 1 })} placeholder={t('What is here (also used by the text alternative)')} onChange={(e) => update(z.id, { label: e.target.value })} />
              <div className="studio-segment" role="radiogroup" aria-label={t('Kind of zone {n}', { n: i + 1 })}>
                <button type="button" role="radio" aria-checked={!z.trap} className={!z.trap ? 'active right' : ''} onClick={() => update(z.id, { trap: false })}>{t('Correct')}</button>
                <button type="button" role="radio" aria-checked={!!z.trap} className={z.trap ? 'active trap' : ''} onClick={() => update(z.id, { trap: true, feedback: z.feedback ?? '' })}>{t('Trap')}</button>
              </div>
              <button type="button" className="icon-button" aria-label={t('Delete zone {n}', { n: i + 1 })} onClick={() => { setZones(q.zones.filter((x) => x.id !== z.id)); if (selected === z.id) setSelected(null); }}><Trash2 size={15} aria-hidden="true" /></button>
            </div>
            <div className="zone-geometry">
              {z.shape === 'circle' ? (
                <>
                  <label>x <input type="number" value={z.x} onChange={(e) => update(z.id, clampZone({ ...z, x: num(e.target.value, z.x) }))} /></label>
                  <label>y <input type="number" value={z.y} onChange={(e) => update(z.id, clampZone({ ...z, y: num(e.target.value, z.y) }))} /></label>
                  <label>{t('radius')} <input type="number" min={2} value={z.r} onChange={(e) => update(z.id, { r: Math.max(2, Math.round(num(e.target.value, z.r ?? 10))) })} /></label>
                </>
              ) : (
                <>
                  <label>x <input type="number" value={z.x} onChange={(e) => update(z.id, clampZone({ ...z, x: num(e.target.value, z.x) }))} /></label>
                  <label>y <input type="number" value={z.y} onChange={(e) => update(z.id, clampZone({ ...z, y: num(e.target.value, z.y) }))} /></label>
                  <label>{t('width')} <input type="number" min={2} value={z.w} onChange={(e) => update(z.id, { w: Math.max(2, Math.round(num(e.target.value, z.w ?? 10))) })} /></label>
                  <label>{t('height')} <input type="number" min={2} value={z.h} onChange={(e) => update(z.id, { h: Math.max(2, Math.round(num(e.target.value, z.h ?? 10))) })} /></label>
                </>
              )}
              <span className="studio-help">px</span>
            </div>
            {z.trap && <input className="zone-feedback" value={z.feedback ?? ''} maxLength={400} aria-label={t('Feedback for trap zone {n}', { n: i + 1 })} placeholder={t('Why this zone is tempting but wrong')} onChange={(e) => update(z.id, { feedback: e.target.value })} />}
          </li>
        ))}
      </ol>
      {q.zones.length === 0 && <p className="studio-help">{t('No zone yet: draw one on the picture.')}</p>}

      <StringList
        title={t('Decoy labels for the text alternative')}
        help={t('Learners who cannot use the picture choose among the zone labels. Add plausible wrong labels so it is not a guess between two.')}
        values={q.decoys} max={6} maxLength={80} placeholder={t('A plausible wrong answer')}
        onChange={(decoys) => onChange({ ...q, decoys })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ lists
export function StringList({ title, help, values, onChange, max, maxLength, placeholder, min = 0 }: { title: string; help?: string; values: string[]; onChange: (v: string[]) => void; max: number; maxLength: number; placeholder?: string; min?: number }) {
  return (
    <fieldset className="studio-list">
      <legend>{title}</legend>
      {help && <p className="studio-help">{help}</p>}
      {values.map((v, i) => (
        <div className="studio-list-row" key={i}>
          <input value={v} maxLength={maxLength} placeholder={placeholder} aria-label={`${title} ${i + 1}`} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="icon-button" disabled={values.length <= min} aria-label={t('Remove {what} {n}', { what: title, n: i + 1 })} onClick={() => onChange(values.filter((_, j) => j !== i))}><Trash2 size={15} aria-hidden="true" /></button>
        </div>
      ))}
      {values.length < max && <button type="button" className="text-button" onClick={() => onChange([...values, ''])}><Plus size={14} aria-hidden="true" /> {t('Add')}</button>}
    </fieldset>
  );
}

// ------------------------------------------------------------------ question editor
export function QuestionEditor({ q, onChange, problems }: { q: Question; onChange: (q: Question) => void; problems: string[] }) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch } as Question);
  return (
    <div className="question-editor">
      {problems.length > 0 && (
        <ul className="studio-problems" role="alert">
          {problems.map((p, i) => <li key={i}><AlertTriangle size={14} aria-hidden="true" /> {t(p)}</li>)}
        </ul>
      )}
      <Field label={t('Question')} wide>{(id) => <TextArea id={id} value={q.prompt} onChange={(v) => set({ prompt: v })} max={600} rows={2} placeholder={t('What should the student do or answer?')} />}</Field>
      <Field label={t('Case context (optional)')} help={t('Shown above the question: patient, specimen, situation.')} wide>{(id) => <TextArea id={id} value={q.context ?? ''} onChange={(v) => set({ context: v })} max={1200} rows={2} />}</Field>
      <div className="studio-field wide">
        <span className="studio-label">{q.type === 'hotspot' ? t('Picture to click on') : t('Picture')}</span>
        <ImagePicker value={q.image} required={q.type === 'hotspot'} onChange={(img) => {
          // Zones are in the old picture's pixels: they only make sense on that picture.
          if (q.type === 'hotspot' && img && q.image && (img.media !== q.image.media || img.asset !== q.image.asset)) onChange({ ...q, image: img, zones: [] });
          else set({ image: img });
        }} />
      </div>

      {q.type === 'choice' && <ChoiceEditor q={q} onChange={onChange} />}
      {q.type === 'truefalse' && (
        <div className="studio-row">
          <Field label={t('Correct answer')}>{(id) => (
            <select id={id} value={q.answer ? 'true' : 'false'} onChange={(e) => onChange({ ...q, answer: e.target.value === 'true' })}><option value="true">{t('True')}</option><option value="false">{t('False')}</option></select>
          )}</Field>
          <Toggle checked={!!q.trap} onChange={(v) => onChange({ ...q, trap: v })} label={t('Trap statement')} help={t('The wrong answer is a common misconception: it is counted as a trap in your results.')} />
        </div>
      )}
      {q.type === 'text' && (
        <>
          <StringList title={t('Accepted answers')} help={t('Accents, case, punctuation and extra spaces are ignored. Add every spelling a correct student might type.')} values={q.accepted} min={1} max={10} maxLength={120} onChange={(accepted) => onChange({ ...q, accepted })} />
          <Toggle checked={q.typoTolerance} onChange={(v) => onChange({ ...q, typoTolerance: v })} label={t('Forgive one typo')} help={t('Only for answers of 5 letters or more, never for numbers.')} />
          <TrapList kind="text" traps={q.traps.map((x) => ({ key: x.answer, feedback: x.feedback }))} onChange={(traps) => onChange({ ...q, traps: traps.map((x) => ({ answer: x.key, feedback: x.feedback })) })} />
        </>
      )}
      {q.type === 'number' && (
        <>
          <div className="studio-row">
            <Field label={t('Correct value')}>{(id) => <input id={id} type="number" step="any" value={q.value} onChange={(e) => onChange({ ...q, value: num(e.target.value, q.value) })} />}</Field>
            <Field label={t('Tolerance (±)')}>{(id) => <input id={id} type="number" step="any" min={0} value={q.tolerance} onChange={(e) => onChange({ ...q, tolerance: Math.max(0, num(e.target.value, q.tolerance)) })} />}</Field>
            <Field label={t('Unit')}>{(id) => <input id={id} value={q.unit ?? ''} maxLength={30} onChange={(e) => onChange({ ...q, unit: e.target.value })} />}</Field>
          </div>
          <TrapList kind="number" traps={q.traps.map((x) => ({ key: String(x.value), feedback: x.feedback }))} onChange={(traps) => onChange({ ...q, traps: traps.map((x) => ({ value: num(x.key, 0), feedback: x.feedback })) })} />
        </>
      )}
      {q.type === 'hotspot' && <HotspotEditor q={q} onChange={onChange} />}
      {q.type === 'order' && (
        <fieldset className="studio-list">
          <legend>{t('Steps in the correct order')}</legend>
          <p className="studio-help">{t('Write them in the right order; students receive them shuffled.')}</p>
          {q.items.map((it, i) => (
            <div className="studio-list-row" key={it.id}>
              <span className="zone-n" aria-hidden="true">{i + 1}</span>
              <input value={it.label} maxLength={200} aria-label={t('Step {n}', { n: i + 1 })} onChange={(e) => onChange({ ...q, items: q.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)) })} />
              <button type="button" className="icon-button" disabled={i === 0} aria-label={t('Move step {n} up', { n: i + 1 })} onClick={() => onChange({ ...q, items: move(q.items, i, i - 1) })}><ArrowUp size={14} aria-hidden="true" /></button>
              <button type="button" className="icon-button" disabled={i === q.items.length - 1} aria-label={t('Move step {n} down', { n: i + 1 })} onClick={() => onChange({ ...q, items: move(q.items, i, i + 1) })}><ArrowDown size={14} aria-hidden="true" /></button>
              <button type="button" className="icon-button" disabled={q.items.length <= 2} aria-label={t('Delete step {n}', { n: i + 1 })} onClick={() => onChange({ ...q, items: q.items.filter((x) => x.id !== it.id) })}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ))}
          {q.items.length < 10 && <button type="button" className="text-button" onClick={() => onChange({ ...q, items: [...q.items, { id: newId('i'), label: '' }] })}><Plus size={14} aria-hidden="true" /> {t('Add a step')}</button>}
        </fieldset>
      )}
      {q.type === 'match' && (
        <fieldset className="studio-list">
          <legend>{t('Pairs')}</legend>
          <p className="studio-help">{t('Each left item goes with the right item on its line. The right column is shuffled for students.')}</p>
          {q.pairs.map((p, i) => (
            <div className="studio-list-row pair" key={p.id}>
              <input value={p.left} maxLength={160} aria-label={t('Left item {n}', { n: i + 1 })} onChange={(e) => onChange({ ...q, pairs: q.pairs.map((x) => (x.id === p.id ? { ...x, left: e.target.value } : x)) })} />
              <span aria-hidden="true">↔</span>
              <input value={p.right} maxLength={160} aria-label={t('Right item {n}', { n: i + 1 })} onChange={(e) => onChange({ ...q, pairs: q.pairs.map((x) => (x.id === p.id ? { ...x, right: e.target.value } : x)) })} />
              <button type="button" className="icon-button" disabled={q.pairs.length <= 2} aria-label={t('Delete pair {n}', { n: i + 1 })} onClick={() => onChange({ ...q, pairs: q.pairs.filter((x) => x.id !== p.id) })}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ))}
          {q.pairs.length < 8 && <button type="button" className="text-button" onClick={() => onChange({ ...q, pairs: [...q.pairs, { id: newId('p'), left: '', right: '' }] })}><Plus size={14} aria-hidden="true" /> {t('Add a pair')}</button>}
        </fieldset>
      )}

      <div className="studio-row">
        <Field label={t('Points')}>{(id) => <input id={id} type="number" min={1} max={100} value={q.points} onChange={(e) => set({ points: Math.max(1, Math.min(100, Math.round(num(e.target.value, q.points)))) })} />}</Field>
      </div>
      <StringList title={t('Hints (progressive)')} help={t('Each hint read costs 10% of the question\'s points. Never give the answer.')} values={q.hints} max={3} maxLength={300} onChange={(hints) => set({ hints })} />
      <Field label={t('Explanation shown after the answer')} wide>{(id) => <TextArea id={id} value={q.explanation} onChange={(v) => set({ explanation: v })} max={1200} rows={3} placeholder={t('Why the right answer is right.')} />}</Field>
      <Field label={t('General feedback after a wrong answer (optional)')} help={t('Used when the wrong answer has no feedback of its own. It must not give the answer.')} wide>{(id) => <TextArea id={id} value={q.feedbackWrong ?? ''} onChange={(v) => set({ feedbackWrong: v })} max={400} rows={2} />}</Field>
    </div>
  );
}

function ChoiceEditor({ q, onChange }: { q: Question & { type: 'choice' }; onChange: (q: Question) => void }) {
  const update = (id: string, patch: Partial<(typeof q.options)[number]>) => onChange({
    ...q,
    options: q.options.map((o) => {
      if (o.id === id) return { ...o, ...patch };
      // One correct option at a time unless several answers are allowed.
      if (patch.correct && !q.multiple) return { ...o, correct: false };
      return o;
    }),
  });
  return (
    <fieldset className="studio-list choice-editor">
      <legend>{t('Options')}</legend>
      <Toggle checked={q.multiple} onChange={(v) => onChange({ ...q, multiple: v, options: v ? q.options : q.options.map((o, i) => ({ ...o, correct: i === q.options.findIndex((x) => x.correct) })) })} label={t('Several correct answers')} help={t('Students must tick every correct option; in exam mode they get partial credit.')} />
      {q.options.map((o, i) => (
        <div key={o.id} className={`option-edit ${o.correct ? 'right' : o.trap ? 'trap' : ''}`}>
          <div className="studio-list-row">
            <input value={o.label} maxLength={300} aria-label={t('Option {n}', { n: i + 1 })} placeholder={t('Option {n}', { n: i + 1 })} onChange={(e) => update(o.id, { label: e.target.value })} />
            <div className="studio-segment" role="radiogroup" aria-label={t('Kind of option {n}', { n: i + 1 })}>
              <button type="button" role="radio" aria-checked={o.correct} className={o.correct ? 'active right' : ''} onClick={() => update(o.id, { correct: true, trap: undefined })}>{t('Correct')}</button>
              <button type="button" role="radio" aria-checked={!o.correct && !o.trap} className={!o.correct && !o.trap ? 'active' : ''} onClick={() => update(o.id, { correct: false, trap: undefined })}>{t('Wrong')}</button>
              <button type="button" role="radio" aria-checked={!!o.trap} className={o.trap ? 'active trap' : ''} onClick={() => update(o.id, { correct: false, trap: true })}>{t('Trap')}</button>
            </div>
            <button type="button" className="icon-button" disabled={i === 0} aria-label={t('Move option {n} up', { n: i + 1 })} onClick={() => onChange({ ...q, options: move(q.options, i, i - 1) })}><ArrowUp size={14} aria-hidden="true" /></button>
            <button type="button" className="icon-button" disabled={q.options.length <= 2} aria-label={t('Delete option {n}', { n: i + 1 })} onClick={() => onChange({ ...q, options: q.options.filter((x) => x.id !== o.id) })}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
          {!o.correct && (
            <input className="option-feedback" value={o.feedback ?? ''} maxLength={400} aria-label={t('Feedback when option {n} is chosen', { n: i + 1 })}
              placeholder={o.trap ? t('Why this trap is tempting, and what to check instead') : t('Feedback when this option is chosen (optional)')} onChange={(e) => update(o.id, { feedback: e.target.value })} />
          )}
        </div>
      ))}
      {q.options.length < 8 && <button type="button" className="text-button" onClick={() => onChange({ ...q, options: [...q.options, { id: newId('o'), label: '', correct: false }] })}><Plus size={14} aria-hidden="true" /> {t('Add an option')}</button>}
    </fieldset>
  );
}

function TrapList({ kind, traps, onChange }: { kind: 'text' | 'number'; traps: { key: string; feedback: string }[]; onChange: (t: { key: string; feedback: string }[]) => void }) {
  return (
    <fieldset className="studio-list trap-list">
      <legend>{t('Trap answers')}</legend>
      <p className="studio-help">{kind === 'text' ? t('Typical wrong answers that deserve their own explanation (they are counted as traps in your results).') : t('Typical wrong values: wrong unit, forgotten conversion, a step skipped.')}</p>
      {traps.map((x, i) => (
        <div className="studio-list-row trap-row" key={i}>
          <input value={x.key} type={kind === 'number' ? 'number' : 'text'} step="any" maxLength={120} aria-label={t('Trap answer {n}', { n: i + 1 })} onChange={(e) => onChange(traps.map((y, j) => (j === i ? { ...y, key: e.target.value } : y)))} />
          <input value={x.feedback} maxLength={400} aria-label={t('Feedback for trap answer {n}', { n: i + 1 })} placeholder={t('Why it is wrong')} onChange={(e) => onChange(traps.map((y, j) => (j === i ? { ...y, feedback: e.target.value } : y)))} />
          <button type="button" className="icon-button" aria-label={t('Delete trap answer {n}', { n: i + 1 })} onClick={() => onChange(traps.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      ))}
      {traps.length < 6 && <button type="button" className="text-button" onClick={() => onChange([...traps, { key: '', feedback: '' }])}><Plus size={14} aria-hidden="true" /> {t('Add a trap answer')}</button>}
    </fieldset>
  );
}

/** "Add question" menu: one button per type with what it is for. */
export function AddQuestion({ onAdd }: { onAdd: (type: QuestionType) => void }) {
  const [open, setOpen] = useState(false);
  const TYPES: QuestionType[] = ['choice', 'hotspot', 'truefalse', 'text', 'number', 'order', 'match'];
  const LABELS: Record<QuestionType, string> = { choice: 'Multiple choice', truefalse: 'True or false', text: 'Short answer', number: 'Numeric answer', hotspot: 'Click on the picture', order: 'Put in order', match: 'Match pairs' };
  return (
    <div className="add-question">
      <button type="button" className="primary" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={15} aria-hidden="true" /> {t('Add a question')}</button>
      {open && (
        <ul className="add-question-menu">
          {TYPES.map((k) => <li key={k}><button type="button" onClick={() => { onAdd(k); setOpen(false); }}><b>{t(LABELS[k])}</b></button></li>)}
        </ul>
      )}
    </div>
  );
}

export const cloneQuestion = (q: Question): Question => {
  const copy = JSON.parse(JSON.stringify(q)) as Question;
  copy.id = newId('q');
  return copy;
};
