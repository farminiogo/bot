import { useQuery } from '@tanstack/react-query';
import { getTokenInfo, getTokenTransactions } from '../services/etherscan';

export function useTokenData(address: string, enabled = false) {
  const tokenInfoQuery = useQuery({
    queryKey: ['tokenInfo', address],
    queryFn: () => getTokenInfo(address),
    enabled: enabled && !!address,
    retry: 1,
  });

  const transactionsQuery = useQuery({
    queryKey: ['tokenTransactions', address],
    queryFn: () => getTokenTransactions(address),
    enabled: enabled && !!address && !!tokenInfoQuery.data,
    retry: 1,
  });

  return {
    tokenInfo: tokenInfoQuery.data,
    transactions: transactionsQuery.data,
    isLoading: tokenInfoQuery.isLoading || transactionsQuery.isLoading,
    error: tokenInfoQuery.error || transactionsQuery.error,
  };
}