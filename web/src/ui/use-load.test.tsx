// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useLoad } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useLoad', () => {
  it('never shows the data of the previous dependency for the new one', async () => {
    const seen: string[] = [];
    const gates: Array<() => void> = [];
    let setKey!: (n: number) => void;
    function Probe() {
      const [key, set] = useState(1);
      setKey = set;
      const { state } = useLoad(() => new Promise<string>((resolve) => { gates.push(() => resolve(`data-${key}`)); }), [key]);
      seen.push(`${key}:${state.phase === 'ready' ? state.data : state.phase}`);
      return null;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(createElement(Probe)); });
    await act(async () => { gates[0]!(); });
    expect(seen.at(-1)).toBe('1:data-1');
    await act(async () => { setKey(2); });
    // The very first render for key 2 must already be "loading", not key 1's data.
    expect(seen.filter((s) => s.startsWith('2:'))[0]).toBe('2:loading');
    await act(async () => { gates[1]!(); });
    expect(seen.at(-1)).toBe('2:data-2');
    await act(async () => { root.unmount(); });
  });
});
