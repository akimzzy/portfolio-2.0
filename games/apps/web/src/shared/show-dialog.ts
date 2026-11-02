/** Open a dialog without focusing one of its actions or fields. */
export function showDialogWithoutActionFocus(dialog: HTMLDialogElement, modal = true) {
  // Native dialog opening focuses the first focusable descendant by default.
  // Making the dialog itself the autofocus target keeps keyboard focus in the
  // dialog without visually preselecting an action.
  dialog.tabIndex = -1;
  dialog.setAttribute('autofocus', '');
  if (modal) dialog.showModal();
  else dialog.show();
}
