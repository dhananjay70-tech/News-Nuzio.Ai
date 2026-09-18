// Derives a specific, user-facing message from a failed API call - never
// falls back to a vague "Something went wrong". `fallbackKey` is an i18n
// key naming the specific unavailable service (e.g. 'newsUnavailable',
// 'savedUnavailable'), used when the backend didn't send its own message.
export const getErrorMessage = (err, fallbackKey, t) => {
  if (err?.response?.status === 429) return t('tooManyRequests');
  return err?.response?.data?.message || t(fallbackKey);
};
