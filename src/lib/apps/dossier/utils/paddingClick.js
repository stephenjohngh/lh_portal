// src/lib/apps/dossier/utils/paddingClick.js
// Should a click on the editor's padding move the cursor to the end?
//
// Pure so the rule can be tested, because it is subtle in a way that reads as
// obviously-correct while being wrong: the first version checked only where the
// click landed, and selecting text upwards therefore collapsed the selection and
// threw the view back to the last line.
//
// The generous empty space below the last block exists so there is somewhere to
// click to carry on writing. That is its whole job, and it must not cost the
// author a selection they were part way through making.

/**
 * @param {object} state
 * @param {boolean} state.editable        false in read-only mode — nothing to focus
 * @param {boolean} state.onPadding       the click's target IS the padding element
 * @param {boolean} state.beganOnPadding  the press that led to it began there too
 * @param {boolean} state.selectionCollapsed  nothing is selected now
 * @returns {boolean}
 */
export function shouldFocusEnd({
  editable, onPadding, beganOnPadding, selectionCollapsed,
}) {
  if (!editable) return false;

  // Where it landed. A click on the text itself is ProseMirror's business — it
  // places the cursor at the nearest position, which is what the tall minimum
  // height on the editor element is for.
  if (!onPadding) return false;

  // Where it began. A `click` fires on the nearest common ancestor of press and
  // release, so a drag that starts inside a paragraph and leaves through the
  // padding reports the PADDING as its target — indistinguishable from a click
  // on it by target alone. The side margins are 2rem and an upward drag
  // autoscrolls through them readily, so this is the ordinary case, not a
  // corner one.
  if (!beganOnPadding) return false;

  // What it did. A drag that selected something is not a request for the end,
  // whichever direction it went — including one that began on the padding and
  // swept up into the text.
  if (!selectionCollapsed) return false;

  return true;
}
