import { QueryClient } from '@tanstack/react-query';

// Configure query client with optimal settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      cacheTime: 300000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});