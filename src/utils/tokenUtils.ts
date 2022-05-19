import axios from 'axios';
import { hethers } from '@hashgraph/hethers';

import { ITokenData, IWalletBalance, TokenType } from '../interfaces/tokens';
import { ContractId } from '@hashgraph/sdk';

export const getTokenInfo = async (tokenId: string): Promise<ITokenData> => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/tokens/${tokenId}`;

  try {
    const {
      data: {
        token_id: hederaId,
        name,
        symbol,
        decimals,
        total_supply: totalSupply,
        expiry_timestamp: expiryTimestamp,
      },
    } = await axios(url);

    const tokenInfo = {
      hederaId,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply,
      expiryTimestamp,
      type: TokenType.HTS,
    };

    return tokenInfo;
  } catch (e) {
    console.error(e);
    // Let's assume that token is ERC20
    return {
      decimals: 0,
      expiryTimestamp: '',
      name: 'Some ERC20 token',
      symbol: 'ERC20',
      hederaId: tokenId,
      totalSupply: '0',
      type: TokenType.ERC20,
    } as ITokenData;
  }
};

export const getTokensWalletBalance = async (userId: string): Promise<IWalletBalance> => {
  const url = `${process.env.REACT_APP_MIRROR_NODE_URL}/api/v1/balances?order=asc&account.id=${userId}`;

  try {
    const {
      data: { balances },
    } = await axios(url);

    const { balance, tokens: tokensRaw } = balances[0];
    const tokens = tokensRaw.map((token: { token_id: string; balance: number }) => ({
      tokenId: token.token_id,
      balance: token.balance,
    }));

    return { balance, tokens };
  } catch (e) {
    console.error(e);
    return {} as IWalletBalance;
  }
};

export const addressToId = (tokenAddress: string) => {
  return hethers.utils.asAccountString(tokenAddress);
};

export const idToAddress = (tokenId: string) => {
  return hethers.utils.getAddressFromAccount(tokenId);
};

export const addressToContractId = (tokenAddress: string) => {
  return ContractId.fromEvmAddress(0, 0, tokenAddress);
};
