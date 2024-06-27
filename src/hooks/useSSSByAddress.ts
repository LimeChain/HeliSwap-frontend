import { useContext, useEffect, useState } from 'react';
import { GlobalContext } from '../providers/Global';

import { QueryHookOptions, useQuery } from '@apollo/client';
import { GET_SSS_BY_ADDRESS } from '../GraphQL/Queries';

import { ISSSData } from '../interfaces/tokens';

import { getProcessedSSS } from '../utils/farmUtils';

import { REFRESH_TIME } from '../constants';

import useUserIdToAddress from './useUserIdToAddress';

const useSSSByAddress = (
  useQueryOptions: QueryHookOptions = {},
  userId: string,
  heliPrice: number,
  sssAddress: string,
) => {
  const contextValue = useContext(GlobalContext);
  const { hbarPrice } = contextValue;

  const [processingSss, setProcessingSss] = useState<boolean>(true);
  const [sss, setSss] = useState<ISSSData>({} as ISSSData);
  const userAddress = useUserIdToAddress(userId);

  const { loading, data, error, startPolling, stopPolling } = useQuery(GET_SSS_BY_ADDRESS, {
    variables: { userAddress, farmAddress: sssAddress },
    ...useQueryOptions,
    skip: !sssAddress,
  });

  useEffect(() => {
    const getSSSData = () => {
      const { getSSSDetails } = data;
      if (getSSSDetails && Object.keys(getSSSDetails).length > 0 && hbarPrice !== 0) {
        try {
          const processedSSS = getProcessedSSS(getSSSDetails, heliPrice, hbarPrice);
          setSss(processedSSS);
          setProcessingSss(false);
        } catch (error) {
          console.error('Error while processing campaign data');
        } finally {
          setProcessingSss(false);
        }
      }
    };

    data && getSSSData();
  }, [data, sssAddress, heliPrice, hbarPrice]);

  useEffect(() => {
    if (
      !loading &&
      (error || !data.getFarmDetails || Object.keys(data.getFarmDetails).length === 0)
    ) {
      setProcessingSss(false);
    }
  }, [loading, error, data]);

  useEffect(() => {
    startPolling(useQueryOptions.pollInterval || REFRESH_TIME);
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling, useQueryOptions]);

  return { sss, loading, error, processingSss };
};

export default useSSSByAddress;
