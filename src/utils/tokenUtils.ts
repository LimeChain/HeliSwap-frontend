import axios from 'axios';
import { hethers } from '@hashgraph/hethers';
import { ethers } from 'ethers';
import { Client, AccountBalanceQuery } from '@hashgraph/sdk';
import BigNumber from 'bignumber.js';

import { IAllowanceData, IPoolData, IReward, ITokenData, TokenType } from '../interfaces/tokens';

import {
  formatNumberToBigNumber,
  formatStringToBigNumber,
  formatStringToBigNumberEthersWei,
  formatStringToBigNumberWei,
  formatStringWeiToStringEther,
  stripStringToFixedDecimals,
} from './numberUtils';
import { getPossibleTradesExactIn, tradeComparator } from './tradeUtils';

import { HUNDRED_BN, MAX_UINT_ERC20, MAX_UINT_HTS } from '../constants';

const ERC20 = require('../abi/ERC20.json');

export const getProvider = () => {
  const provider = new ethers.providers.JsonRpcProvider(process.env.REACT_APP_PROVIDER_URL);

  return provider;
};

export const getHTSTokenInfo = async (tokenId: string): Promise<ITokenData> => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/tokens/${tokenId}`;

  try {
    const {
      data: {
        token_id: hederaId,
        name,
        symbol,
        decimals,
        total_supply: totalSupply,
        max_supply: maxSupply,
        expiry_timestamp: expiryTimestamp,
        admin_key,
        custom_fees: customFees,
        freeze_key,
        kyc_key,
        pause_key,
        supply_key,
        wipe_key,
        fee_schedule_key,
      },
    } = await axios(url);

    const { fixed_fees: fixedFees, fractional_fees: fractionalFees } = customFees;
    const hasFees = fixedFees.length > 0 || fractionalFees.length > 0;

    const tokenInfo = {
      hederaId,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply,
      expiryTimestamp,
      address: idToAddress(hederaId),
      type: TokenType.HTS,
      hasFees,
      maxSupply,
      keys: {
        adminKey: admin_key !== null,
        freezeKey: freeze_key !== null,
        kycKey: kyc_key !== null,
        pauseKey: pause_key !== null,
        wipeKey: wipe_key !== null,
        supplyKey: supply_key !== null,
        feeScheduleKey: fee_schedule_key !== null,
      },
    };

    return tokenInfo;
  } catch (e) {
    console.error(e);
    return {} as ITokenData;
  }
};

export const getHTSTokenWalletBalance = async (
  userId: string,
  tokenId: string,
): Promise<number> => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/tokens/${tokenId}/balances?account.id=${userId}&order=desc&limit=2`;

  try {
    const {
      data: { balances },
    } = await axios(url);

    if (balances.length > 0) {
      const { balance } = balances[0];

      return balance;
    } else {
      return 0;
    }
  } catch (e) {
    console.error(e);
    return 0;
  }
};

export const getUserAssociatedTokens = async (userId: string): Promise<string[]> => {
  const tokens = (await getUserHTSData(userId)) || [];
  const keys: string[] = [];
  tokens.forEach((_, key) => keys.push(key as string));

  return keys;
};

export const getTokenAllowance = async (
  accountId: string,
  spenderId: string,
  tokenId: string,
): Promise<IAllowanceData[]> => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/accounts/${accountId}/allowances/tokens?spender.id=${spenderId}&token.id=${tokenId}`;

  try {
    const {
      data: { allowances },
    } = await axios(url);

    return allowances;
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const checkAllowanceERC20 = async (
  tokenAddress: string,
  userId: string,
  spenderAddress: string,
  amountToSpend: string,
) => {
  const provider = getProvider();
  const tokenContract = new ethers.Contract(tokenAddress, ERC20.abi, provider);

  const userAddress = await requestUserAddressFromId(userId);
  const allowance = await tokenContract.allowance(userAddress, spenderAddress);
  const amountToSpendBN = formatStringToBigNumberEthersWei(amountToSpend);

  const canSpend = amountToSpendBN.lte(allowance);

  return canSpend;
};

export const getTokenBalanceERC20 = async (tokenAddress: string, userId: string) => {
  const provider = getProvider();
  const tokenContract = new ethers.Contract(tokenAddress, ERC20.abi, provider);
  const userAddress = await requestUserAddressFromId(userId);

  const balanceBN = await tokenContract.balanceOf(userAddress);

  return balanceBN.toString();
};

export const checkAllowanceHTS = async (
  userId: string,
  token: ITokenData,
  amountToSpend: string,
  spenderAddress?: string,
) => {
  const spenderId =
    spenderAddress && spenderAddress !== ''
      ? addressToId(spenderAddress as string)
      : addressToId(process.env.REACT_APP_ROUTER_ADDRESS as string);
  const allowances = await getTokenAllowance(userId, spenderId, token.hederaId);

  if (allowances.length > 0) {
    const currentAllowance = allowances[0].amount_granted;
    const currentAllowanceBN = formatNumberToBigNumber(currentAllowance);
    const amountToSpendBN = formatStringToBigNumberWei(amountToSpend, token.decimals);

    const canSpend = amountToSpendBN.lte(currentAllowanceBN);

    return canSpend;
  } else {
    return false;
  }
};

export const addressToId = (tokenAddress: string) => {
  return hethers.utils.asAccountString(tokenAddress);
};

export const idToAddress = (tokenId: string) => {
  return hethers.utils.getChecksumAddress(hethers.utils.getAddressFromAccount(tokenId));
};

export const isHederaIdValid = (hederaId: string) => {
  return hederaId
    .toLowerCase()
    .match(/^(0|(?:[1-9]\d*))\.(0|(?:[1-9]\d*))\.(0|(?:[1-9]\d*))(?:-([a-z]{5}))?$/g);
};

export const isAddressValid = (address: string) => {
  return hethers.utils.isAddress(address.toLowerCase());
};

/**
 * Calucate reserves based on total amount ot LP
 * @public
 * @param {string} lpAmount - LP amount share in wei
 * @param {string} lpAmountTotal - LP total amount in wei
 * @param {string} reserve0 - Total amount of token0 reserves in wei
 * @param {string} reserve1 - Total amount of token1 reserves in wei
 * @return {object} - Reserves amounts in BigNumber in wei and converted into ethers strings
 */
export const calculateReserves = (
  lpAmount: string,
  lpAmountTotal: string,
  reserve0: string,
  reserve1: string,
  reserve0Decimals: number = 18,
  reserve1Decimals: number = 18,
) => {
  // Convert string values (wei) into Hethers Big Number
  const lpAmountHBN = hethers.BigNumber.from(lpAmount); // HBN | wei
  const lpAmountTotalHBN = hethers.BigNumber.from(lpAmountTotal); // HBN | wei
  const reserve0HBN = hethers.BigNumber.from(reserve0); // HBN | wei
  const reserve1HBN = hethers.BigNumber.from(reserve1); // HBN | wei

  const reserve0ShareHBN = reserve0HBN.mul(lpAmountHBN).div(lpAmountTotalHBN); // HBN | wei
  const reserve1ShareHBN = reserve1HBN.mul(lpAmountHBN).div(lpAmountTotalHBN); // HBN | wei

  const reserve0ShareStr = hethers.utils.formatUnits(reserve0ShareHBN, reserve0Decimals); // String | ether
  const reserve1ShareStr = hethers.utils.formatUnits(reserve1ShareHBN, reserve1Decimals); // String | ether

  return {
    reserve0ShareHBN,
    reserve1ShareHBN,
    reserve0ShareStr,
    reserve1ShareStr,
  };
};

/**
 * Calucate share based on total amount and percentage
 * @public
 * @param {string} totalAmount - total amount of tokens in ETH
 * @param {string} percentage - percentage
 * @return {string} - Share in ETH
 */
export const calculateShareByPercentage = (
  totalAmount: string,
  percentage: string,
  decimals: number = 18,
) => {
  const percentageStr = (Number(percentage) / 100).toString();
  const percentageBN = formatStringToBigNumber(percentageStr);
  const totalAmountBN = formatStringToBigNumberWei(totalAmount, decimals);

  const shareBN = totalAmountBN.times(percentageBN);

  const shareFormatted = stripStringToFixedDecimals(
    formatStringWeiToStringEther(shareBN.toFixed(), decimals),
    decimals,
  );

  return shareFormatted;
};

/**
 * Calucate percentage based on total amount and share
 * @public
 * @param {string} totalAmount - total amount of tokens in ETH
 * @param {string} share - percentage
 * @return {string} - Percentage
 */
export const calculatePercentageByShare = (totalAmount: string, share: string) => {
  const shareBN = formatStringToBigNumberWei(share);
  const totalAmountBN = formatStringToBigNumberWei(totalAmount);

  const percentageBN = shareBN.div(totalAmountBN).times(HUNDRED_BN);

  const percentageFormatted = percentageBN.toFixed(0);

  return percentageFormatted;
};

export const getTokenBalance = async (userId: string, tokenData: ITokenData) => {
  let tokenBalance;

  if (tokenData.type === TokenType.HBAR && userId) {
    const provider = hethers.providers.getDefaultProvider(process.env.REACT_APP_NETWORK_TYPE);
    const userBalanceBN = await provider.getBalance(userId);
    tokenBalance = hethers.utils.formatHbar(userBalanceBN);
  } else if (tokenData.type === TokenType.HTS) {
    tokenBalance = '0';
    const accountTokens = await getUserHTSData(userId);
    const balance = accountTokens?.get(tokenData.hederaId);
    const tokenDecimals = tokenData?.decimals;

    if (balance)
      tokenBalance = formatStringWeiToStringEther(balance.toString(), tokenDecimals).toString();
  } else if (tokenData.type === TokenType.ERC20) {
    tokenBalance = '0';
    const provider = getProvider();
    const tokenContract = new ethers.Contract(tokenData.address, ERC20.abi, provider);
    const userAddress = await requestUserAddressFromId(userId);
    const balance = await tokenContract.balanceOf(userAddress);
    const tokenDecimals = tokenData?.decimals;

    if (balance) tokenBalance = ethers.utils.formatUnits(balance, tokenDecimals).toString();
  }

  return tokenBalance;
};

export const getTokenPrice = (poolsData: IPoolData[], tokenAddress: string, hbarPrice: number) => {
  const WHBARAddress = process.env.REACT_APP_WHBAR_ADDRESS;
  const minLiquidity = Number(process.env.REACT_APP_POOL_MIN_LIQUIDITY as string);

  if (hbarPrice === 0) return '0';
  if (tokenAddress === WHBARAddress) return hbarPrice.toString();

  // Check for direct pool with HBAR
  const directPool = poolsData.find(pool => {
    const { token0, token1 } = pool;

    return (
      (token0 === tokenAddress && token1 === WHBARAddress) ||
      (token1 === tokenAddress && token0 === WHBARAddress)
    );
  });

  if (directPool) {
    const { token0Amount, token1Amount, token0Decimals, token1Decimals, token0 } = directPool;

    const hbarTokenAmount = token0 === WHBARAddress ? token0Amount : token1Amount;
    const tokenAmount = token0 === tokenAddress ? token0Amount : token1Amount;

    const hbarTokenDecimals = token0 === WHBARAddress ? token0Decimals : token1Decimals;
    const tokenDecimals = token0 === tokenAddress ? token0Decimals : token1Decimals;

    const hbarTokenAmountNumber = Number(
      ethers.utils.formatUnits(BigInt(hbarTokenAmount), hbarTokenDecimals),
    );
    const tokenAmountNumber = Number(ethers.utils.formatUnits(BigInt(tokenAmount), tokenDecimals));

    const tokenForHbar =
      hbarTokenAmountNumber === 0 || tokenAmountNumber === 0
        ? 0
        : tokenAmountNumber / hbarTokenAmountNumber;

    const tokenPrice = hbarPrice / tokenForHbar;

    return tokenPrice.toString();
  } else {
    // Filter pools with WHBAR not deep enough in order to not distort price calculation
    const filteredPoolsData = poolsData.filter(pool => {
      const { token0, token0Amount, token0Decimals, token1, token1Amount, token1Decimals } = pool;

      const token0AmountFormattedNumber = Number(
        formatStringWeiToStringEther(token0Amount, token0Decimals),
      );
      const token1AmountFormattedNumber = Number(
        formatStringWeiToStringEther(token1Amount, token1Decimals),
      );

      const token0AmountValueInUSD = token0AmountFormattedNumber * hbarPrice;
      const token1AmountValueInUSD = token1AmountFormattedNumber * hbarPrice;

      const hasToken0AmountEnough = token0AmountValueInUSD >= minLiquidity;
      const hasToken1AmountEnough = token1AmountValueInUSD >= minLiquidity;

      if (token0 === WHBARAddress) {
        return hasToken0AmountEnough;
      }

      if (token1 === WHBARAddress) {
        return hasToken1AmountEnough;
      }

      return true;
    });

    // Calculate the target token amount for 1 HBAR
    let tradesIn = getPossibleTradesExactIn(
      filteredPoolsData || [],
      '1',
      WHBARAddress || '',
      tokenAddress,
      false,
    );

    let sortedTrades = tradesIn.sort(tradeComparator);

    if (sortedTrades.length === 0) return '0';

    let bestTradeAmount = new BigNumber(sortedTrades[0].amountOut);

    //Handle special case where for 1 token in you get 0 tokens out because of big difference of the amounts and decimals
    if (Number(sortedTrades[0].amountOut) === 0) {
      // Calculate the HBARs token amount for 1 target token
      tradesIn = getPossibleTradesExactIn(
        filteredPoolsData || [],
        '1',
        tokenAddress,
        WHBARAddress || '',
        false,
      );

      sortedTrades = tradesIn.sort(tradeComparator);

      if (sortedTrades.length === 0 || Number(sortedTrades[0].amountOut) === 0) return '0';

      bestTradeAmount = new BigNumber(sortedTrades[0].amountOut);

      return new BigNumber(hbarPrice).times(bestTradeAmount).toString();
    } else {
      return new BigNumber(hbarPrice).div(bestTradeAmount).toString();
    }
  }
};

const getUserHTSData = async (userId: string) => {
  const networkType = process.env.REACT_APP_NETWORK_TYPE as string;
  const client = networkType === 'testnet' ? Client.forTestnet() : Client.forMainnet();
  const { tokens } = await new AccountBalanceQuery().setAccountId(userId).execute(client);
  return tokens?._map;
};

export const requestIdFromAddress = async (address: string) => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/contracts/${address}`;
  try {
    const {
      data: { contract_id },
    } = await axios(url);
    return contract_id;
  } catch (e) {
    console.error(e);
    return '0';
  }
};

export const requestAddressFromId = async (id: string) => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/contracts/${id}`;
  try {
    const {
      data: { evm_address },
    } = await axios(url);
    return evm_address;
  } catch (e) {
    console.error(e);
    return '0';
  }
};

export const requestUserAddressFromId = async (id: string) => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/accounts/${id}`;
  try {
    let {
      data: { evm_address },
    } = await axios(url);

    // Convert to checksum address
    evm_address = hethers.utils.getAddress(evm_address);
    return evm_address;
  } catch (e) {
    console.error(e);
    return '0';
  }
};

export const requestUserIdFromAddress = async (address: string) => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/account${address}`;
  try {
    const {
      data: { accounts },
    } = await axios(url);
    return accounts[0].id;
  } catch (e) {
    console.error(e);
    return '0';
  }
};

export const hasFeesOrKeys = (token: ITokenData) => {
  const { hasFees, keys: tokenKeys } = token;
  const keys = tokenKeys ? Object.keys(tokenKeys) : [];

  let hasKeys = false;

  if (keys.length > 0 && tokenKeys) {
    for (let i = 0; i < keys.length; i++) {
      if (tokenKeys[keys[i]] && keys[i] !== '__typename') {
        hasKeys = true;
        break;
      }
    }
  }

  return hasFees || hasKeys;
};

export const NATIVE_TOKEN: ITokenData = {
  hederaId: '',
  name: 'HBAR',
  symbol: 'HBAR',
  address: '',
  decimals: 8,
  type: TokenType.HBAR,
};

export const invalidInputTokensData = (value: string, maxValue?: string, decimals?: number) => {
  let inputGtMaxValue = false;
  if (maxValue && decimals) {
    const maxValueWei = formatStringToBigNumberWei(maxValue, decimals);
    const valueBNWei = formatStringToBigNumberWei(value, decimals);
    inputGtMaxValue = valueBNWei.gt(maxValueWei);
  }
  return !value || isNaN(Number(value)) || inputGtMaxValue;
};

export const getAmountToApprove = async (
  tokenId: string,
  isHTS: boolean = false,
): Promise<string> => {
  try {
    if (!isHTS) {
      return MAX_UINT_ERC20.toString();
    } else {
      const maxSupply = (await getHTSTokenInfo(tokenId)).maxSupply;
      return maxSupply && parseInt(maxSupply) !== 0 && new BigNumber(maxSupply).lt(MAX_UINT_HTS)
        ? maxSupply
        : MAX_UINT_HTS.toString();
    }
  } catch (e) {
    return isHTS ? MAX_UINT_HTS.toString() : MAX_UINT_ERC20.toString();
  }
};

export const getProcessedTokens = (tokensData: ITokenData[]): ITokenData[] => {
  return tokensData.map(
    ({ hederaId, name, symbol, address, decimals, isHTS, keys, hasFees }: ITokenData) => ({
      hederaId,
      name,
      symbol,
      address,
      decimals,
      keys,
      hasFees,
      type: isHTS ? TokenType.HTS : TokenType.ERC20,
    }),
  );
};

export const mapHBARTokenSymbol = (tokenSymbol: string) => {
  return tokenSymbol === 'WHBAR' ? NATIVE_TOKEN.symbol : tokenSymbol;
};

export const mapWHBARAddress = (token: ITokenData | IReward) => {
  return token.address === process.env.REACT_APP_WHBAR_ADDRESS ||
    token.address === process.env.REACT_APP_WHBAR_ADDRESS_OLD
    ? NATIVE_TOKEN.symbol
    : token.symbol;
};

export const isPoolDeprecated = (token0: string, token1: string) => {
  return (
    token0 === process.env.REACT_APP_WHBAR_ADDRESS_OLD ||
    token1 === process.env.REACT_APP_WHBAR_ADDRESS_OLD
  );
};

export const isPoolNew = (token0: string, token1: string) => {
  return (
    token0 === process.env.REACT_APP_WHBAR_ADDRESS || token1 === process.env.REACT_APP_WHBAR_ADDRESS
  );
};
