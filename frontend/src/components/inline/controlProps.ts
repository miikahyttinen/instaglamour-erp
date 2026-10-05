import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import type { InlineSaveState } from './useInlineSave';

type TextElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * Handlers for a text-like control: blur saves, Enter saves (Ctrl/Cmd+Enter when `multiline`),
 * Esc reverts. Spread on the `<input>` / `<textarea>` together with the frame's control props.
 */
export function textControlProps(state: InlineSaveState<string>, multiline = false) {
  return {
    value: state.draft,
    onChange: (e: ChangeEvent<TextElement>) => state.setDraft(e.target.value),
    onBlur: (_e: FocusEvent<TextElement>) => {
      void state.commit();
    },
    onKeyDown: (e: KeyboardEvent<TextElement>) => {
      if (e.key === 'Escape') {
        if (state.dirty || state.status === 'error') {
          // Only the field reacts (e.g. an enclosing dialog stays open).
          e.preventDefault();
          e.stopPropagation();
        }
        state.revert();
        return;
      }
      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
      if (multiline && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); // never submits an enclosing form
      void state.commit();
    },
  };
}
