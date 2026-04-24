import { useNetworkStatus } from './useNetworkStatus';

export const useAppMode = () => {
  const { isOnline } = useNetworkStatus();
  const mode = isOnline ? 'ONLINE' : 'OFFLINE';

  return { mode, isOnline };
};
