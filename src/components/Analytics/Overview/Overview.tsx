import { useState, useEffect, useContext } from 'react';

import { GlobalContext } from '../../../providers/Global';

import {
  IPoolExtendedData,
  IPoolsAnalytics,
  ITokenDataAnalytics,
  TokenType,
} from '../../../interfaces/tokens';

import BarChart from '../../BarChart';
import LineChart from '../../LineChart';
import TopPools from './TopPools';
import TopTokens from './TopTokens';
import Loader from '../../Loader';
import PoolsAnalytics from '../PoolsAnalytics';

import { getTokenPrice } from '../../../utils/tokenUtils';

import usePoolsByTokensList from '../../../hooks/usePoolsByTokensList';
import useTokensByListIds from '../../../hooks/useTokensByListIds';
import useHistoricalData from '../../../hooks/useHistoricalData';

import {
  useQueryOptions,
  useQueryOptionsProvideSwapRemove,
  initialPoolsAnalyticsData,
} from '../../../constants';
import { formatStringWeiToStringEther } from '../../../utils/numberUtils';

const Overview = () => {
  const contextValue = useContext(GlobalContext);
  const { tokensWhitelisted, hbarPrice } = contextValue;

  const tokensWhitelistedAddresses = tokensWhitelisted.map(item => item.address) || [];

  const [tokensToShow, setTokensToShow] = useState<ITokenDataAnalytics[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [poolsAnalytics, setPoolsAnalytics] = useState(initialPoolsAnalyticsData);

  const {
    poolsByTokenList: pools,
    loadingPoolsByTokenList: loadingPools,
    errorPoolsByTokenList: errorPools,
  } = usePoolsByTokensList(useQueryOptionsProvideSwapRemove, true, tokensWhitelistedAddresses);

  const { tokens: tokenDataList } = useTokensByListIds(tokensWhitelistedAddresses, useQueryOptions);
  const { historicalData } = useHistoricalData(useQueryOptions);

  useEffect(() => {
    setLoadingTokens(true);

    if (tokenDataList && tokenDataList.length > 0 && pools.length > 0 && hbarPrice) {
      const tvlPerToken = pools.reduce((acc: any, pool) => {
        const {
          token0,
          token0Amount,
          token0Decimals,
          token1,
          token1Amount,
          token1Decimals,
          pairName,
        } = pool;

        if (!acc[token0]) {
          acc[token0] = 0;
        }

        if (!acc[token1]) {
          acc[token1] = 0;
        }

        const token0Price = getTokenPrice(pools, token0, hbarPrice);
        const token1Price = getTokenPrice(pools, token1, hbarPrice);

        const token0AmountFormatted = formatStringWeiToStringEther(token0Amount, token0Decimals);
        const token1AmountFormatted = formatStringWeiToStringEther(token1Amount, token1Decimals);
        const token0Value = Number(token0AmountFormatted) * Number(token0Price);
        const token1Value = Number(token1AmountFormatted) * Number(token1Price);

        console.log('pairName', pairName);
        console.log('token0Value', token0Value);
        console.log('token1Value', token1Value);
        console.log('poolTVL', token0Value + token1Value);

        acc[token0] += acc[token0] + token0Value;
        acc[token1] += acc[token1] + token1Value;

        return acc;
      }, {});

      console.log('tvlPerToken', tvlPerToken);

      const tokensWithData = tokenDataList.map(token => {
        const tokenPrice =
          token.type === TokenType.HBAR
            ? hbarPrice.toString()
            : getTokenPrice(pools, token.address, hbarPrice);

        let tvl;

        if (tvlPerToken[token.address]) {
          tvl = tvlPerToken[token.address].toString();
        }

        return {
          ...token,
          price: tokenPrice,
          tvl,
        };
      });

      setLoadingTokens(false);
      setTokensToShow(tokensWithData);
    }
  }, [tokensWhitelisted, pools, hbarPrice, tokenDataList]);
  console.log('tokensToShow', tokensToShow);

  useEffect(() => {
    const calculatePoolsTVL = (pools: IPoolExtendedData[]) => {
      const allPoolsData = pools.reduce((acc: IPoolsAnalytics, currentPool: IPoolExtendedData) => {
        const { tvl, volume24Num, volume7Num } = currentPool;

        acc = {
          tvl: acc.tvl + Number(tvl),
          volume24h: acc.volume24h + Number(volume24Num),
          volume7d: acc.volume7d + Number(volume7Num),
        };

        return acc;
      }, initialPoolsAnalyticsData);

      setPoolsAnalytics(allPoolsData);
    };

    pools && pools.length > 0 && calculatePoolsTVL(pools);
  }, [pools]);

  return (
    <div className="my-9">
      <div className="row">
        <div className="col-6">
          {historicalData.length ? (
            <div className="container-blue-neutral-800 rounded p-4">
              <LineChart chartData={historicalData} aggregatedValue={0} />
            </div>
          ) : (
            <div className="d-flex justify-content-center my-6">
              <Loader />
            </div>
          )}
        </div>

        <div className="col-6">
          {historicalData.length ? (
            <div className="container-blue-neutral-800 rounded p-4">
              <BarChart chartData={historicalData} aggregatedValue={0} />
            </div>
          ) : (
            <div className="d-flex justify-content-center my-6">
              <Loader />
            </div>
          )}
        </div>
      </div>

      <PoolsAnalytics poolsAnalytics={poolsAnalytics} />

      <section className="d-flex my-5 flex-column text-small">
        <p className="text-small text-bold mb-4">Pools</p>
        {loadingPools ? (
          <div className="d-flex justify-content-center my-6">
            <Loader />
          </div>
        ) : (
          <TopPools error={errorPools} pools={pools} />
        )}
      </section>

      <section className="d-flex my-5 flex-column text-small">
        <p className="text-small text-bold mb-4">Tokens</p>
        {loadingTokens ? (
          <div className="d-flex justify-content-center my-6">
            <Loader />
          </div>
        ) : (
          <TopTokens tokens={tokensToShow} />
        )}
      </section>
    </div>
  );
};

export default Overview;
