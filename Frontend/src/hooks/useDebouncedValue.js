import { useState, useEffect } from 'react';

// Returns `value`, updated only after it stops changing for `delayMs` -
// used to debounce search inputs (Discover) so every keystroke doesn't
// fire a request.
export default function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
