import './connections.css';
import { t } from '../../shared/i18n';
import { officeRepoName, type FloorManagementView } from '../../shared/floor-management';
import { connectionRequest as request, connectionButton as button, connectionField as field, connectionSelect as select } from './connections-client';
import { h, openModal } from './dom';

export const getFloorManagement = () => request<FloorManagementView>(undefined, {}, '?floor-management=1');

export function floorManagementPanel(initial = '') {
  const message = h('p.setting-note', { role: 'status', 'aria-live': 'polite' });
  const body = h('div.connections');
  const element = h('section.connections', {}, message, body);
  let selected = initial, busy = false, dirty = false, closed = false, loaded = false;
  const canDismiss = () => !busy && (!dirty || window.confirm(t('Discard unapplied changes?')));
  async function load(notice = '') {
    if (closed) return;
    try {
      const state = await getFloorManagement();
      if (closed) return;
      loaded = true; render(state); message.textContent = notice;
    } catch (e) { message.textContent = (e as Error).message; }
  }
  function render(state: FloorManagementView) {
    dirty = false;
    const floor = state.floors.find(f => f.id === selected);
    selected = floor?.id ?? '';
    const picker = select(t('Office floor'), [{ id: '', name: t('New office floor') }, ...state.floors], selected);
    picker.onchange = () => {
      if (!canDismiss()) { picker.value = selected; return; }
      selected = picker.value; message.textContent = ''; render(state);
    };
    const name = h('input', { maxlength: '80', value: floor?.name ?? '', required: true }) as HTMLInputElement;
    const repo = h('input', { value: floor?.repo ?? '', spellcheck: 'false' }) as HTMLInputElement;
    const workspace = h('input', { value: floor?.dir ?? '', placeholder: state.root + '/…', spellcheck: 'false' }) as HTMLInputElement;
    const mode = select(t('Repository action'), [
      { id: 'new', name: t('Create private repository') }, { id: 'existing', name: t('Link existing private repository') }
    ], floor?.repo ? 'existing' : 'new');
    const save = button(t('Apply'), () => change(floor ? 'floor-update' : 'floor-create', {
      name: name.value.trim(), repository: repo.value.trim(), existing: mode.value === 'existing', workspace: workspace.value.trim()
    }), 'primary');
    save.disabled = true;
    const changed = () => { dirty = true; save.disabled = !name.value.trim(); message.textContent = t('Unapplied changes'); };
    name.oninput = () => { repo.placeholder = officeRepoName(name.value); changed(); };
    mode.onchange = changed; repo.oninput = changed; workspace.oninput = changed;
    body.replaceChildren(field(t('Office floor'), picker), field(t('Floor name'), name), field(t('Repository action'), mode),
      field(t('Remote repository'), repo), h('p.setting-note', {}, state.configured ? t('Forgejo organization') + ' · ' + state.organization : t('Private Forgejo is not configured')),
      field(t('Workspace on the VM'), workspace), h('p.setting-note', {}, t('Choose a new folder under the workspace root. Its previous copy is kept.')),
      h('p.setting-note', {}, state.root), save);
    if (!floor) return;
    const keep = select(t('When removing this floor'), [{ id: 'keep', name: t('Keep remote repository') },
      ...(floor.canDeleteRepo ? [{ id: 'delete', name: t('Also delete remote repository') }] : [])]);
    const confirmation = h('input', { placeholder: floor.repo, autocomplete: 'off' }) as HTMLInputElement;
    const check = field(t('Type the full repository name to delete it'), confirmation);
    check.hidden = true;
    const remove = button(t('Remove floor'), async () => {
      if (!canDismiss()) return;
      const dropping = keep.value === 'delete';
      const warning = dropping ? t('Permanently delete the remote repository and remove the floor?') + ' ' + floor.repo
        : t('Remove this floor and keep the repository and its local files?');
      if (window.confirm(warning)) await change('floor-delete', { deleteRemote: dropping, confirmation: confirmation.value });
    });
    function checkDelete() {
      check.hidden = keep.value !== 'delete';
      remove.disabled = !check.hidden && confirmation.value !== floor!.repo;
    }
    keep.onchange = checkDelete; confirmation.oninput = checkDelete;
    body.append(h('details', {}, h('summary', {}, t('Remove floor')), field(t('When removing this floor'), keep), check, remove));

    async function change(action: string, input: Record<string, unknown>) {
      if (busy) return;
      busy = true; body.inert = true; message.textContent = t('Working…');
      try {
        const result = await request(action, { ...input, floorId: floor?.id, version: floor?.version });
        selected = result.floorId ?? ''; dirty = false;
        await load(result.retained ? t('Local copy kept at') + ' ' + result.retained : t('Settings applied'));
      } catch (e) { message.textContent = (e as Error).message; }
      finally { busy = false; body.inert = false; }
    }
  }
  return { element, load: () => { if (!loaded || !dirty && !busy) void load(); }, canDismiss, dispose: () => { closed = true; } };
}
export function openFloorManagement(id = '') {
  const panel = floorManagementPanel(id);
  const close = h('button.btn', { type: 'button', 'aria-label': t('Close') }, '✕');
  const modal = openModal(h('div.modal.language-settings', { role: 'dialog', 'aria-label': t('Floor management') },
    h('header', {}, h('h2', {}, t('Floor management')), close), h('div.body', {}, panel.element)),
    { canDismiss: panel.canDismiss, onClose: panel.dispose });
  close.onclick = () => { if (panel.canDismiss()) modal.close(); };
  panel.load();
}
