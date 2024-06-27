import { useContext, useEffect, useState } from 'react';
import { GlobalContext } from '../providers/Global';
import BigNumber from 'bignumber.js';

import { QueryHookOptions, useQuery } from '@apollo/client';
import { GET_POOLS_BY_USER } from '../GraphQL/Queries';

import { REFRESH_TIME } from '../constants';

import { IPoolData, IPoolExtendedData } from '../interfaces/tokens';

import {
  getTokenPrice,
  requestUserAddressFromId,
  calculateReserves,
  calculatePercentageByShare,
  mapHBARTokenSymbol,
  isPoolDeprecated,
  isPoolNew,
} from '../utils/tokenUtils';
import { formatStringWeiToStringEther } from '../utils/numberUtils';

import useUserIdToAddress from './useUserIdToAddress';

const usePoolsByUser = (
  useQueryOptions: QueryHookOptions = {},
  userId: string,
  poolsExtended: IPoolExtendedData[],
) => {
  const contextValue = useContext(GlobalContext);
  const { hbarPrice } = contextValue;
  const [poolsByUser, setPoolsByUser] = useState<IPoolExtendedData[]>([]);
  const address = useUserIdToAddress(userId);

  const { loading, data, error, startPolling, stopPolling, refetch } = useQuery(GET_POOLS_BY_USER, {
    variables: { address },
    ...useQueryOptions,
    skip: !userId,
  });

  useEffect(() => {
    startPolling(useQueryOptions.pollInterval || REFRESH_TIME);
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling, useQueryOptions]);

  useEffect(() => {
    if (data) {
      const { getPoolsByUser } = data;

      if (getPoolsByUser && getPoolsByUser.length > 0) {
        const poolsFormatted = getPoolsByUser.map((pool: IPoolData) => {
          const {
            token0Amount,
            token1Amount,
            token0Decimals,
            token1Decimals,
            token0,
            token1,
            lpShares,
            pairSupply,
            fee0,
            fee1,
            stakedBalance,
          } = pool;

          const { reserve0ShareStr, reserve1ShareStr } = calculateReserves(
            lpShares as string,
            pairSupply,
            token0Amount,
            token1Amount,
            token0Decimals,
            token1Decimals,
          );

          const {
            reserve0ShareStr: stakedReserve0ShareStr,
            reserve1ShareStr: stakedReserve1ShareStr,
          } = calculateReserves(
            stakedBalance as string,
            pairSupply,
            token0Amount,
            token1Amount,
            token0Decimals,
            token1Decimals,
          );

          const token0Price = getTokenPrice(poolsExtended, token0, hbarPrice);
          const token1Price = getTokenPrice(poolsExtended, token1, hbarPrice);
          const token0PriceNum = Number(token0Price);
          const token1PriceNum = Number(token1Price);

          const fee0Formatted = formatStringWeiToStringEther(fee0 as string, token0Decimals);
          const fee1Formatted = formatStringWeiToStringEther(fee1 as string, token1Decimals);
          const lpSharesFormatted = formatStringWeiToStringEther(lpShares as string, 18);
          const stakedBalanceFormatted = formatStringWeiToStringEther(stakedBalance as string, 18);

          let totalFeeValue = 0;
          let totalLpValue = 0;
          let totalStakedLpValue = 0;

          let fee0Value, fee1Value, token0Value, token1Value, stakedToken0Value, stakedToken1Value;

          if (token0PriceNum !== 0 && token1PriceNum !== 0) {
            fee0Value = Number(fee0Formatted) * token0PriceNum;
            fee1Value = Number(fee1Formatted) * token1PriceNum;
            totalFeeValue = fee0Value + fee1Value;

            token0Value = Number(reserve0ShareStr) * token0PriceNum;
            token1Value = Number(reserve1ShareStr) * token1PriceNum;
            totalLpValue = token0Value + token1Value;

            stakedToken0Value = Number(stakedReserve0ShareStr) * token0PriceNum;
            stakedToken1Value = Number(stakedReserve1ShareStr) * token1PriceNum;
            totalStakedLpValue = stakedToken0Value + stakedToken1Value;
          } else if (token0PriceNum !== 0) {
            fee0Value = Number(fee0Formatted) * token0PriceNum;
            totalFeeValue = 2 * fee0Value;

            token0Value = Number(reserve0ShareStr) * token0PriceNum;
            totalLpValue = 2 * token0Value;

            stakedToken0Value = Number(stakedReserve0ShareStr) * token0PriceNum;
            totalStakedLpValue = 2 * stakedToken0Value;
          } else if (token1PriceNum !== 0) {
            fee1Value = Number(fee1Formatted) * token1PriceNum;
            totalFeeValue = 2 * fee1Value;

            token1Value = Number(reserve1ShareStr) * token1PriceNum;
            totalLpValue = 2 * token1Value;

            stakedToken1Value = Number(stakedReserve1ShareStr) * token1PriceNum;
            totalStakedLpValue = 2 * stakedToken1Value;
          }

          const totalFeeValueString = totalFeeValue.toString();
          const totalLpValueStr = totalLpValue.toFixed(2);
          const totalStakedLpValueStr = totalStakedLpValue.toFixed(2);

          const totalUserShare = Number(lpShares) + Number(stakedBalance);

          const userPercentageShare = calculatePercentageByShare(
            pairSupply,
            totalUserShare.toString(),
          );

          // Check if pool is for migration
          let forMigration = false;
          let newPool = false;

          if (isPoolDeprecated(token0, token1)) {
            forMigration = true;
          }

          if (isPoolNew(token0, token1)) {
            newPool = true;
          }

          const poolData: IPoolExtendedData = {
            ...pool,
            token0AmountFormatted: reserve0ShareStr,
            token1AmountFormatted: reserve1ShareStr,
            stakedToken0AmountFormatted: stakedReserve0ShareStr,
            stakedToken1AmountFormatted: stakedReserve1ShareStr,
            lpSharesFormatted,
            stakedBalanceFormatted,
            tvl: totalLpValueStr,
            tvlBN: new BigNumber(totalLpValueStr),
            stakedTvl: totalStakedLpValueStr,
            feesNum: totalFeeValue,
            feesStr: totalFeeValueString,
            poolPercenatage: userPercentageShare,
            fee0AmountFormatted: fee0Formatted,
            fee1AmountFormatted: fee1Formatted,
            token0Symbol: mapHBARTokenSymbol(pool.token0Symbol),
            token1Symbol: mapHBARTokenSymbol(pool.token1Symbol),
            forMigration,
            newPool,
          };

          return poolData;
        });

        const sortedPools = poolsFormatted.sort((a: IPoolExtendedData, b: IPoolExtendedData) => {
          return Number(b.tvlBN.minus(a.tvlBN));
        });

        setPoolsByUser(sortedPools);
      } else {
        setPoolsByUser([]);
      }
    }
  }, [userId, data, hbarPrice, poolsExtended]);

  return { poolsByUser, loading, error, refetch };
};

export default usePoolsByUser;
