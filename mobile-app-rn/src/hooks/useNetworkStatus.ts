import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** True until NetInfo reports otherwise -- an explicit `false` on either
 * flag (not connected, or connected but no route to the internet, e.g. a
 * captive wifi portal) is what actually flips this; `null`/unknown
 * (NetInfo still probing, which happens briefly on every cold start) is
 * treated as online so a real connection doesn't get an offline banner
 * flash before the first check lands. */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  return { isOnline };
}
