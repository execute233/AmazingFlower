export function bindToolbar({ root, actions }) {
  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!(trigger instanceof HTMLButtonElement)) {
      return;
    }

    const action = trigger.dataset.action;
    actions[action]?.();
  });
}

export function updateToolbarState(root, selectionState, { emptyLabel, formatSelection }) {
  const hasSelection = Boolean(selectionState.hasSelection);
  const isCropping = Boolean(selectionState.isCropping);
  const mode = isCropping ? 'cropping' : hasSelection ? 'selected' : 'idle';

  const groups = {
    selection: mode === 'selected',
    crop: mode === 'cropping',
    system: mode !== 'cropping',
  };

  root.querySelectorAll('[data-toolbar-group]').forEach((group) => {
    if (!(group instanceof HTMLElement)) {
      return;
    }

    const groupName = group.dataset.toolbarGroup;
    group.hidden = !groups[groupName];
  });

  const meta = root.querySelector('[data-toolbar-meta]');
  if (meta instanceof HTMLElement) {
    meta.hidden = mode !== 'selected';
  }

  root.querySelectorAll('[data-action]').forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) {
      return;
    }

    element.disabled = element.dataset.requiresSelection === 'true' && !hasSelection;
  });

  const summary = root.querySelector('[data-selection-label]');
  if (!(summary instanceof HTMLElement)) {
    return;
  }

  summary.textContent = selectionState.hasSelection
    ? formatSelection(selectionState)
    : emptyLabel;
}
