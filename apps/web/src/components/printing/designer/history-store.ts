import * as React from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useHistoryState<T>(initialState: T, limit = 100) {
  const [state, setState] = React.useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const set = React.useCallback((next: T) => {
    setState((prev) => {
      const past = [...prev.past, prev.present];
      if (past.length > limit) past.shift();
      return {
        past,
        present: next,
        future: [],
      };
    });
  }, [limit]);

  const undo = React.useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = React.useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  const reset = React.useCallback((next: T) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    undo,
    redo,
    reset,
  };
}
