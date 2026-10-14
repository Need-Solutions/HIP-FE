import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { errorMessage, notifyError } from '@/lib/notify';

// The global error listener, for every screen built now or later. Toasts are for:
//   - failed actions: every failed mutation (saves, payments, refunds…). Actions written as plain awaits call
//     notifyError() themselves.
//   - background refreshes that fail while the page still shows older data.
// A query that fails before it has any data shows nothing here: the page shows its own "We couldn't load…"
// panel with Try again, and a toast on top would say the same thing twice.
// Opt out with `meta: { silentError: true }` (e.g. polling the screen handles itself); set
// `meta: { errorMessage }` for clearer wording than the default.

interface AppMeta extends Record<string, unknown> {
  errorMessage?: string;
  silentError?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      // No data yet: the page's load-error panel covers it.
      if (query.meta?.silentError || query.state.data === undefined) return;
      notifyError(query.meta?.errorMessage ?? `${errorMessage(err, 'We couldn’t refresh this.')} You’re seeing the last version we loaded.`, {
        id: `query:${query.queryHash}`,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError) return;
      notifyError(mutation.meta?.errorMessage ?? errorMessage(err, 'We couldn’t save that. Please try again.'));
    },
  }),
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});
