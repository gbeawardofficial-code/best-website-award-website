import type { ClaimContentCopy } from '../lib/content/claim';
import type {
  WinnerResources,
  WinnerBadge,
  BadgeRole,
  BadgeSize,
  BadgeFormat
} from '../lib/claim/types';

const root = document.querySelector<HTMLElement>('[data-claim]')!;
const el = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
const copy = JSON.parse(
  el<HTMLScriptElement>('[data-claim-copy]').textContent || '{}'
) as ClaimContentCopy;
const form = el<HTMLFormElement>('[data-claim-form]');
const input = el<HTMLInputElement>('#claim-website');
const dialog = el<HTMLDialogElement>('[data-download-dialog]');
let winner: WinnerResources | undefined;
let role: BadgeRole = 'business';
let badge: WinnerBadge | undefined;
let busy = false;
let opener: HTMLElement | undefined;

function error(message = '') {
  el('[data-claim-error]').textContent = message;
  el('[data-claim-error]').hidden = !message;
}
function panel(name: 'lookup' | 'winner' | 'not-found') {
  root.querySelectorAll<HTMLElement>('[data-claim-panel]').forEach((node) => {
    node.hidden = node.dataset.claimPanel !== name;
  });
  el('[data-claim-title]').textContent = name === 'winner' ? copy.winnerTitle : copy.lookupTitle;
  el('[data-claim-summary]').textContent =
    name === 'winner' ? copy.winnerSummary : copy.lookupSummary;
}
function image(node: HTMLImageElement, preview: WinnerBadge['preview']) {
  node.classList.add('claim-image-pending');
  node.alt = preview.alt;
  node.width = preview.width;
  node.height = preview.height;
  node.src = preview.src;
  const expected = node.src;
  void node
    .decode()
    .then(() => {
      if (node.src === expected) node.classList.remove('claim-image-pending');
    })
    .catch(() => {
      // Never leave a previous recipient's image visible after a failed request.
    });
}
function renderBadges() {
  if (!winner) return;
  const selected = winner.roles.find((r) => r.id === role);
  if (!selected)
    throw new Error('The selected badges are unavailable. Please check your website again.');
  el('[data-developer-name]').hidden = role !== 'developer';
  el('[data-developer-name]').textContent = selected.name
    ? `${copy.developerLabel}: ${selected.name}`
    : '';
  for (const item of selected.badges) {
    const card = el(`[data-badge="${item.id}"]`);
    image(card.querySelector<HTMLImageElement>('img')!, item.preview);
  }
}
function reset() {
  if (dialog.open) dialog.close();
  winner = undefined;
  badge = undefined;
  role = 'business';
  el<HTMLInputElement>('input[name="recipient"][value="business"]').checked = true;
  error();
  panel('lookup');
  input.focus();
}
function updateDownload() {
  if (!badge || !winner) return;
  const size = el<HTMLInputElement>('input[name="badge-size"]:checked').value as BadgeSize;
  const format = el<HTMLInputElement>('input[name="badge-format"]:checked').value as BadgeFormat;
  const selected = badge.sizes.find((s) => s.id === size)!;
  const link = el<HTMLAnchorElement>('[data-download-file]');
  link.href = selected[format];
  link.download = `Best-Website-Awards-2026-${winner.website}-${role}-${badge.id}-${selected.width}w.${format}`;
  el('[data-download-file-label]').textContent =
    `${copy.downloadAction} ${format === 'png' ? 'PNG' : 'WebP'}`;
  image(el<HTMLImageElement>('.claim-dialog-image'), {
    ...badge.preview,
    src: selected[format],
    width: selected.width,
    height: selected.height
  });
}
function openDownload(id: string, trigger: HTMLElement) {
  badge = winner?.roles.find((r) => r.id === role)?.badges.find((b) => b.id === id);
  if (!badge) return;
  opener = trigger;
  dialog.dataset.design = badge.design;
  el('[data-download-subtitle]').textContent =
    `${badge.name} · ${badge.tone === 'light' ? 'Light' : 'Dark'}`;
  for (const size of badge.sizes)
    el(`[data-size-dimensions="${size.id}"]`).textContent = `${size.width} × ${size.height} px`;
  el<HTMLInputElement>('input[name="badge-size"][value="medium"]').checked = true;
  el<HTMLInputElement>('input[name="badge-format"][value="png"]').checked = true;
  updateDownload();
  dialog.showModal();
  document.documentElement.classList.add('claim-modal-open');
  el('#claim-download-title').focus({ preventScroll: true });
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true;
  error();
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  el('[data-lookup-label]').textContent = copy.lookupBusy;
  try {
    const response = await fetch('/api/claim/lookup', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: input.value.trim() }),
      signal: AbortSignal.timeout(15_000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Please try again shortly.');
    if (!result.found) {
      winner = undefined;
      panel('not-found');
    } else {
      winner = result.winner as WinnerResources;
      if (!winner?.roles?.some((r) => r.id === 'business' && r.badges.length === 4))
        throw new Error('Your badges are temporarily unavailable. Please try again shortly.');
      role = 'business';
      el<HTMLInputElement>('input[name="recipient"][value="business"]').checked = true;
      const site = el<HTMLAnchorElement>('[data-winner-site]');
      site.textContent = winner.website;
      site.href = winner.websiteUrl;
      el('[data-winner-award]').textContent = winner.award;
      el('[data-recipient-options]').hidden = !winner.roles.some((r) => r.id === 'developer');
      renderBadges();
      panel('winner');
    }
    el('[data-claim-title]').focus({ preventScroll: true });
  } catch (e) {
    error(
      e instanceof Error &&
        e.name !== 'TimeoutError' &&
        e.name !== 'TypeError' &&
        e.name !== 'SyntaxError'
        ? e.message
        : 'The connection was interrupted. Please try again shortly.'
    );
  } finally {
    busy = false;
    button.disabled = false;
    form.removeAttribute('aria-busy');
    el('[data-lookup-label]').textContent = copy.lookupAction;
  }
});
root
  .querySelectorAll<HTMLButtonElement>('[data-change-website]')
  .forEach((button) => button.addEventListener('click', reset));
root.querySelectorAll<HTMLInputElement>('input[name="recipient"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    if (radio.checked) {
      role = radio.value as BadgeRole;
      renderBadges();
    }
  })
);
root
  .querySelectorAll<HTMLButtonElement>('[data-download]')
  .forEach((button) =>
    button.addEventListener('click', () => openDownload(button.dataset.download!, button))
  );
root
  .querySelectorAll<HTMLInputElement>('input[name="badge-size"],input[name="badge-format"]')
  .forEach((radio) => radio.addEventListener('change', updateDownload));
el('[data-close-dialog]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    dialog.close();
});
dialog.addEventListener('close', () => {
  document.documentElement.classList.remove('claim-modal-open');
  opener?.focus({ preventScroll: true });
  badge = undefined;
});
const initial = new URL(location.href).searchParams.get('website');
if (initial && initial.length <= 500) input.value = initial;
