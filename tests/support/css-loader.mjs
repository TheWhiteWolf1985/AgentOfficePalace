// Client styles are empty under Node; Vite's imported model URLs remain inert URLs.
export async function load(url, context, next) {
  if (new URL(url).pathname.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  if (new URL(url).pathname.endsWith('.glb')) return { format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true };
  return next(url, context);
}
