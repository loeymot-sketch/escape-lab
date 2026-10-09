const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`Escape Lab requires Node >=22.18.0; detected ${process.version}. Activate .nvmrc or use the CI runtime.`);
  process.exit(1);
}
