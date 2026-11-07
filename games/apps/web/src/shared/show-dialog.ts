/** Open a dialog without leaving focus on one of its actions or fields. */
export function showDialogWithoutActionFocus(dialog: HTMLDialogElement, modal = true) {
  // Native dialog opening focuses the first focusable descendant by default.
  // Keep keyboard focus on the dialog container so no action looks preselected.
  dialog.tabIndex = -1;
  if (modal) dialog.showModal();
  else dialog.show();
  dialog.focus({ preventScroll: true });
}
