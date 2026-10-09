/** The French dictionary is a separate chunk: English visitors never download it. */
let loading: Promise<void> | null = null;
export function loadFrench(): Promise<void> {
  loading ??= import('./fr').then(() => undefined, (error) => { loading = null; throw error; });
  return loading;
}
