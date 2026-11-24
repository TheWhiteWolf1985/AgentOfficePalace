export function officeRepoName(name: string): string {
  const stem = name.trim().replace(/^ufficio(?:\s+|$)/i, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return stem ? 'Uff_' + stem.slice(0, 80) : '';
}
export interface ManagedFloorView {
  id: string; name: string; dir: string; repo: string; version: string; canDeleteRepo: boolean;
}
export interface FloorManagementView {
  organization: string; root: string; configured: boolean; floors: ManagedFloorView[];
}
