import { useEffect, useState } from 'react';
import { requestUserAddressFromId } from '../utils/tokenUtils';

const useUserIdToAddress = (userId: string) => {
  const [userAddress, setUserAddress] = useState<string>('');

  useEffect(() => {
    const getUserAddress = async () => {
      if (userId) {
        try {
          const address = await requestUserAddressFromId(userId);
          setUserAddress(address);
        } catch (error) {
          console.error('Error while fetching user address');
        }
      }
    };

    getUserAddress();
  }, [userId]);

  return userAddress;
};

export default useUserIdToAddress;
