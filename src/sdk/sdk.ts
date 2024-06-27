import {
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  TokenAssociateTransaction,
  Transaction,
} from '@hashgraph/sdk';
import { hethers } from '@hashgraph/hethers';
import Hashconnect from '../connectors/hashconnect';
import BladeConnect from '../connectors/blade';
import { ICreatePairData, TokenType } from '../interfaces/tokens';
import {
  addressToId,
  requestAddressFromId,
  idToAddress,
  requestIdFromAddress,
  requestUserAddressFromId,
} from '../utils/tokenUtils';
import {
  getAmountWithSlippage,
  getExpirationTime,
  formatStringToBigNumberWei,
  formatStringToBigNumber,
} from '../utils/numberUtils';
import { TRANSACTION_MAX_FEES } from '../constants';

interface IAction {
  functionName: string;
  functionParams: {
    type: string;
    value: string;
  }[];
  targetAddress: string;
  value: number;
}

interface IProcessedActions {
  targets: string[];
  values: number[];
  signatures: string[];
  callDatas: Uint8Array[];
}

class SDK {
  async associateToken(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    tokenId: string | ContractId,
  ) {
    const trans = await new TokenAssociateTransaction();

    trans.setTokenIds([tokenId]);
    trans.setAccountId(userId);

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async approveToken(
    connectorInstance: BladeConnect | Hashconnect,
    amount: string,
    userId: string,
    tokenId: string | ContractId,
    isHTS: boolean,
    spender?: string,
  ) {
    const spenderAddress = spender ? spender : (process.env.REACT_APP_ROUTER_ADDRESS as string);

    const amountToApproveBN = formatStringToBigNumber(amount);
    const maxGas = isHTS ? TRANSACTION_MAX_FEES.APPROVE_HTS : TRANSACTION_MAX_FEES.APPROVE_ERC20;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(tokenId)
      //Set the gas for the contract call
      .setGas(maxGas)

      //Set the contract function to call
      .setFunction(
        'approve',
        new ContractFunctionParameters().addAddress(spenderAddress).addUint256(amountToApproveBN),
      );

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async addNativeLiquidity(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    createPairData: ICreatePairData,
    slippage: number,
    expiresAfter: number,
    poolExists: boolean,
    typeType: TokenType,
  ) {
    const {
      tokenAAmount: tokenAAmountString,
      tokenBAmount: tokenBAmountString,
      tokenAId,
      tokenBId,
      tokenADecimals,
      tokenBDecimals,
    } = createPairData;
    const tokenId = tokenAId ? tokenAId : tokenBId;
    const tokenDecimals = tokenAId ? tokenADecimals : tokenBDecimals;
    const tokenAmountString = tokenAId ? tokenAAmountString : tokenBAmountString;
    const HBARAmountString = tokenAId ? tokenBAmountString : tokenAAmountString;
    const tokenAddress =
      typeType === TokenType.HTS ? idToAddress(tokenId) : await requestAddressFromId(tokenId);

    const HBARAmount = formatStringToBigNumberWei(HBARAmountString, 0);
    const tokenAmount = formatStringToBigNumberWei(tokenAmountString, tokenDecimals);
    const HBARAmountMin = getAmountWithSlippage(HBARAmountString, 8, slippage, true);
    const tokenAmountMin = getAmountWithSlippage(tokenAmountString, tokenDecimals, slippage, true);

    const userAddress = await requestUserAddressFromId(userId);
    const routerId = addressToId(process.env.REACT_APP_ROUTER_ADDRESS as string);
    const maxGas = poolExists
      ? TRANSACTION_MAX_FEES.PROVIDE_LIQUIDITY
      : TRANSACTION_MAX_FEES.CREATE_POOL;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the router contract
      .setContractId(routerId)
      //Set the gas for the contract call
      .setGas(maxGas)
      //Amount of HBAR we want to provide
      .setPayableAmount(HBARAmount)
      .setFunction(
        'addLiquidityHBAR',
        new ContractFunctionParameters()
          .addAddress(tokenAddress)
          .addUint256(tokenAmount)
          .addUint256(tokenAmountMin)
          .addUint256(HBARAmountMin)
          .addAddress(userAddress)
          .addUint256(getExpirationTime(expiresAfter)),
      );

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async addLiquidity(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    createPairData: ICreatePairData,
    slippage: number,
    expiresAfter: number,
    poolExists: boolean,
    typeA: TokenType,
    typeB: TokenType,
  ) {
    const {
      tokenAAmount: tokenAAmountString,
      tokenAId,
      tokenBAmount: tokenBAmountString,
      tokenBId,
      tokenADecimals,
      tokenBDecimals,
    } = createPairData;
    const tokenAAddress =
      typeA === TokenType.HTS ? idToAddress(tokenAId) : await requestAddressFromId(tokenAId);
    const tokenBAddress =
      typeB === TokenType.HTS ? idToAddress(tokenBId) : await requestAddressFromId(tokenBId);

    const tokenAAmount = formatStringToBigNumberWei(tokenAAmountString, tokenADecimals);
    const tokenBAmount = formatStringToBigNumberWei(tokenBAmountString, tokenBDecimals);
    const tokenAAmountMin = getAmountWithSlippage(
      tokenAAmountString,
      tokenADecimals,
      slippage,
      true,
    );
    const tokenBAmountMin = getAmountWithSlippage(
      tokenBAmountString,
      tokenBDecimals,
      slippage,
      true,
    );

    const userAddress = await requestUserAddressFromId(userId);
    const routerId = addressToId(process.env.REACT_APP_ROUTER_ADDRESS as string);
    const maxGas = poolExists
      ? TRANSACTION_MAX_FEES.PROVIDE_LIQUIDITY
      : TRANSACTION_MAX_FEES.CREATE_POOL;

    const trans = new ContractExecuteTransaction()
      //Set the ID of the router contract
      .setContractId(routerId)
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'addLiquidity',
        new ContractFunctionParameters()
          .addAddress(tokenAAddress)
          .addAddress(tokenBAddress)
          .addUint256(tokenAAmount)
          .addUint256(tokenBAmount)
          .addUint256(tokenAAmountMin)
          .addUint256(tokenBAmountMin)
          .addAddress(userAddress)
          .addUint256(getExpirationTime(expiresAfter)),
      );

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async removeNativeLiquidity(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    tokenAddress: string,
    tokensLpAmount: string,
    tokenAmount: string,
    HBARAmount: string,
    tokenDecimals: number,
    WHBARDecimal: number,
    slippage: number,
    expiresAfter: number,
    forMigration: boolean,
  ) {
    const routerContractAddress = forMigration
      ? (process.env.REACT_APP_ROUTER_ADDRESS_OLD as string)
      : (process.env.REACT_APP_ROUTER_ADDRESS as string);
    const userAddress = await requestUserAddressFromId(userId);

    const tokenAmountMin = getAmountWithSlippage(tokenAmount, tokenDecimals, slippage, true);
    const HBARAmountMin = getAmountWithSlippage(HBARAmount, WHBARDecimal, slippage, true);
    const tokensLpAmountBN = formatStringToBigNumberWei(tokensLpAmount, 18);
    const maxGas = TRANSACTION_MAX_FEES.REMOVE_NATIVE_LIQUIDITY;

    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(routerContractAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'removeLiquidityHBAR',
        new ContractFunctionParameters()
          .addAddress(tokenAddress)
          .addUint256(tokensLpAmountBN)
          .addUint256(tokenAmountMin)
          .addUint256(HBARAmountMin)
          .addAddress(userAddress)
          .addUint256(getExpirationTime(expiresAfter)),
      );

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async removeLiquidity(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    tokenInAddress: string,
    tokenOutAddress: string,
    tokensLpAmount: string,
    tokens0Amount: string,
    tokens1Amount: string,
    token0Decimals: number,
    token1ecimals: number,
    slippage: number,
    expiresAfter: number,
  ) {
    const routerContractAddress = process.env.REACT_APP_ROUTER_ADDRESS as string;
    const userAddress = await requestUserAddressFromId(userId);

    const tokensLpAmountBN = formatStringToBigNumberWei(tokensLpAmount, 18);

    const tokens0AmountMin = getAmountWithSlippage(tokens0Amount, token0Decimals, slippage, true);
    const tokens1AmountMin = getAmountWithSlippage(tokens1Amount, token1ecimals, slippage, true);
    const maxGas = TRANSACTION_MAX_FEES.REMOVE_LIQUIDITY;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(routerContractAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'removeLiquidity',
        new ContractFunctionParameters()
          .addAddress(tokenInAddress)
          .addAddress(tokenOutAddress)
          .addUint256(tokensLpAmountBN)
          .addUint256(tokens0AmountMin)
          .addUint256(tokens1AmountMin)
          .addAddress(userAddress)
          .addUint256(getExpirationTime(expiresAfter)),
      );

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async swap(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    amountIn: string,
    amountOut: string,
    decIn: number,
    decOut: number,
    slippage: number,
    expiresAfter: number,
    path: string[],
    tokenInIsNative: boolean,
    tokenOutIsNative: boolean,
    exactAmountIn: boolean,
  ) {
    const getTransactionName = () => {
      if (exactAmountIn) {
        return tokenInIsNative
          ? 'swapExactHBARForTokens'
          : tokenOutIsNative
          ? 'swapExactTokensForHBAR'
          : 'swapExactTokensForTokens';
      } else {
        return tokenInIsNative
          ? 'swapHBARForExactTokens'
          : tokenOutIsNative
          ? 'swapTokensForExactHBAR'
          : 'swapTokensForExactTokens';
      }
    };

    const routerContractAddress = process.env.REACT_APP_ROUTER_ADDRESS as string;
    const userAddress = await requestUserAddressFromId(userId);

    const tokenInAmount = exactAmountIn
      ? formatStringToBigNumberWei(amountIn, decIn)
      : getAmountWithSlippage(amountIn, decIn, slippage, false);

    const tokenOutAmount = exactAmountIn
      ? getAmountWithSlippage(amountOut, decOut, slippage, true)
      : formatStringToBigNumberWei(amountOut, decOut);

    const extraSwaps = path.length - 2;

    const baseFee =
      tokenInIsNative ||
      tokenOutIsNative ||
      path.includes(process.env.REACT_APP_WHBAR_ADDRESS as string)
        ? TRANSACTION_MAX_FEES.BASE_SWAP_NATIVE
        : TRANSACTION_MAX_FEES.BASE_SWAP;

    const exactOutGas = exactAmountIn
      ? 0
      : extraSwaps !== 0
      ? extraSwaps * TRANSACTION_MAX_FEES.TOKEN_OUT_EXACT_SWAP
      : TRANSACTION_MAX_FEES.TOKEN_OUT_EXACT_SWAP;

    const maxGas = baseFee + extraSwaps * TRANSACTION_MAX_FEES.EXTRA_SWAP + exactOutGas;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(routerContractAddress))
      //Set the gas for the contract call
      .setGas(maxGas);

    if (tokenInIsNative) {
      const HBARAmount = exactAmountIn
        ? formatStringToBigNumberWei(amountIn, 0)
        : getAmountWithSlippage(amountIn, 0, slippage, false, true);
      trans //Amount of HBAR we want to provide
        .setPayableAmount(HBARAmount)
        .setFunction(
          getTransactionName(),
          new ContractFunctionParameters()
            .addUint256(tokenOutAmount)
            .addAddressArray(path)
            .addAddress(userAddress)
            .addUint256(getExpirationTime(expiresAfter)),
        );
    } else {
      trans.setFunction(
        getTransactionName(),
        new ContractFunctionParameters()
          .addUint256(exactAmountIn ? tokenInAmount : tokenOutAmount)
          .addUint256(exactAmountIn ? tokenOutAmount : tokenInAmount)
          .addAddressArray(path)
          .addAddress(userAddress)
          .addUint256(getExpirationTime(expiresAfter)),
      );
    }

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async wrapHBAR(connectorInstance: BladeConnect | Hashconnect, userId: string, HBARIn: string) {
    const WHBARAddress = process.env.REACT_APP_WHBAR_ADDRESS as string;
    const maxGas = TRANSACTION_MAX_FEES.WRAP_HBAR;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(WHBARAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Amount of HBAR we want to provide
      .setPayableAmount(HBARIn)
      //Set the contract function to call
      .setFunction('deposit', new ContractFunctionParameters());

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async unwrapHBAR(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    tokenAmountIn: string,
  ) {
    const WHBARAddress = process.env.REACT_APP_WHBAR_ADDRESS as string;
    const tokenAmountInNum = formatStringToBigNumberWei(tokenAmountIn, 8);
    const maxGas = TRANSACTION_MAX_FEES.UNWRAP_WHBAR;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(WHBARAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('withdraw', new ContractFunctionParameters().addUint256(tokenAmountInNum));

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async transferERC20(
    connectorInstance: BladeConnect | Hashconnect,
    userId: string,
    tokenAddress: string,
    amount: string,
    to: string,
    decimals: number = 18,
  ) {
    const tokenAAmount = formatStringToBigNumberWei(amount, decimals);
    const tokenId = await requestIdFromAddress(tokenAddress);
    const maxGas = TRANSACTION_MAX_FEES.TRANSFER_ERC20;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(tokenId)
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'transfer',
        new ContractFunctionParameters().addAddress(to).addUint256(tokenAAmount),
      );

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async stakeLP(
    connectorInstance: BladeConnect | Hashconnect,
    stakeAmount: string,
    campaignAddress: string,
    userId: string,
    decimals: number = 18,
  ) {
    const tokensLpAmountBN = formatStringToBigNumberWei(stakeAmount, decimals);
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const contractId = await requestIdFromAddress(campaignAddress);
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(contractId)
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('stake', new ContractFunctionParameters().addUint256(tokensLpAmountBN));

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async collectRewards(
    connectorInstance: BladeConnect | Hashconnect,
    campaignAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.COLLECT_REWARDS;
    const contractId = await requestIdFromAddress(campaignAddress);
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(contractId)
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('getReward', new ContractFunctionParameters());

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async exit(
    connectorInstance: BladeConnect | Hashconnect,
    campaignAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.EXIT_CAMPAIGN;
    const contractId = await requestIdFromAddress(campaignAddress);
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(contractId)
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('exit', new ContractFunctionParameters());

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async depositHBAR(
    connectorInstance: BladeConnect | Hashconnect,
    lockdropAddress: string,
    userId: string,
    HBARAmount: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;

    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(lockdropAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Amount of HBAR we want to provide
      .setPayableAmount(HBARAmount)
      //Set the contract function to call
      .setFunction('deposit', new ContractFunctionParameters());

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async withdrawHBAR(
    connectorInstance: BladeConnect | Hashconnect,
    lockdropAddress: string,
    userId: string,
    HBARAmount: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const HBARAmountBN = formatStringToBigNumberWei(HBARAmount, 8);

    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(lockdropAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Amount of HBAR we want to provide
      //Set the contract function to call
      .setFunction('withdraw', new ContractFunctionParameters().addUint256(HBARAmountBN));

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async claimLP(
    connectorInstance: BladeConnect | Hashconnect,
    lockdropAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;

    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(lockdropAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Amount of HBAR we want to provide
      //Set the contract function to call
      .setFunction('claim', new ContractFunctionParameters());

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  async claimTokensFromClaimDrop(
    connectorInstance: BladeConnect | Hashconnect,
    claimdropAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;

    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(claimdropAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Amount of HBAR we want to provide
      //Set the contract function to call
      .setFunction('claim', new ContractFunctionParameters());

    return this.sendTransactionAndGetResponse(connectorInstance, trans, userId);
  }

  // SSS and DAO
  async deposit(
    hashconnectConnectorInstance: Hashconnect,
    stakeAmount: string,
    kernelAddress: string,
    userId: string,
  ) {
    const tokensAmountBN = formatStringToBigNumberWei(stakeAmount, 8);
    const maxGas = TRANSACTION_MAX_FEES.DEPOSIT_DAO;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(kernelAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('deposit', new ContractFunctionParameters().addUint256(tokensAmountBN));

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async depositAndLock(
    hashconnectConnectorInstance: Hashconnect,
    stakeAmount: string,
    timestamp: number,
    kernelAddress: string,
    userId: string,
  ) {
    const tokensAmountBN = formatStringToBigNumberWei(stakeAmount, 8);
    const maxGas = TRANSACTION_MAX_FEES.DEPOSIT_DAO;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(kernelAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'depositAndLock',
        new ContractFunctionParameters().addUint256(tokensAmountBN).addUint256(timestamp),
      );

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async withdraw(
    hashconnectConnectorInstance: Hashconnect,
    stakeAmount: string,
    kernelAddress: string,
    userId: string,
  ) {
    const tokensAmountBN = formatStringToBigNumberWei(stakeAmount, 8);
    const maxGas = TRANSACTION_MAX_FEES.DEPOSIT_DAO;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(kernelAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('withdraw', new ContractFunctionParameters().addUint256(tokensAmountBN));

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async claim(
    hashconnectConnectorInstance: Hashconnect,
    rewardsContractAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(rewardsContractAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('claim');

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async claimLock(
    hashconnectConnectorInstance: Hashconnect,
    kernelAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const sssAddress = process.env.REACT_APP_SSS_ADDRESS as string;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(sssAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('claim', new ContractFunctionParameters().addAddress(kernelAddress));

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async lock(
    hashconnectConnectorInstance: Hashconnect,
    timestamp: number,
    kernelAddress: string,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.DEPOSIT_DAO;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(kernelAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('lock', new ContractFunctionParameters().addUint256(timestamp));

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async createProposal(
    hashconnectConnectorInstance: Hashconnect,
    governanceAddress: string,
    userId: string,
    title: string,
    description: string,
    actions: IAction[],
  ) {
    const getProcessedActions = (actions: IAction[]): IProcessedActions => {
      let processedActions = actions.reduce(
        (acc, action) => {
          acc.targets.push(action.targetAddress);
          acc.values.push(action.value);

          const paramTypes: string[] = [];
          const paramValues = [];
          for (let index = 0; index < action.functionParams.length; index++) {
            const param = action.functionParams[index];
            paramTypes.push(param.type);
            if (param.type.indexOf('uint') !== -1) {
              paramValues.push(parseInt(param.value));
            } else {
              paramValues.push(param.value);
            }
          }
          acc.callDatas.push(
            hethers.utils.arrayify(hethers.utils.defaultAbiCoder.encode(paramTypes, paramValues)),
          );

          const getProcessedFunctionName = () => {
            if (action.functionParams.length === 0) {
              return action.functionName + '()';
            } else {
              let params = '';
              paramTypes.forEach((param: string, index: number) => {
                if (index === 0) {
                  params += param;
                } else {
                  params += `, ${param}`;
                }
              });
              return `${action.functionName}(${params})`;
            }
          };

          acc.signatures.push(getProcessedFunctionName());

          return acc;
        },
        { targets: [], values: [], signatures: [], callDatas: [] } as IProcessedActions,
      );

      return processedActions;
    };

    const processedActions = getProcessedActions(actions);

    const { targets, values, signatures, callDatas } = processedActions;

    const maxGas = TRANSACTION_MAX_FEES.DEPOSIT_DAO;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(governanceAddress))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'propose',
        new ContractFunctionParameters()
          .addAddressArray(targets)
          .addUint256Array(values)
          .addStringArray(signatures)
          .addBytesArray(callDatas)
          .addString(description)
          .addString(title),
      );

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async castVote(
    hashconnectConnectorInstance: Hashconnect,
    proposalId: number,
    support: boolean,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(process.env.REACT_APP_GOVERNANCE_ADDRESS as string))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction(
        'castVote',
        new ContractFunctionParameters().addUint256(proposalId).addBool(support),
      );

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async queueProposal(
    hashconnectConnectorInstance: Hashconnect,
    proposalId: number,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(process.env.REACT_APP_GOVERNANCE_ADDRESS as string))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('queue', new ContractFunctionParameters().addUint256(proposalId));

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  async executeProposal(
    hashconnectConnectorInstance: Hashconnect,
    proposalId: number,
    userId: string,
  ) {
    const maxGas = TRANSACTION_MAX_FEES.STAKE_LP_TOKEN;
    const trans = new ContractExecuteTransaction()
      //Set the ID of the contract
      .setContractId(addressToId(process.env.REACT_APP_GOVERNANCE_ADDRESS as string))
      //Set the gas for the contract call
      .setGas(maxGas)
      //Set the contract function to call
      .setFunction('execute', new ContractFunctionParameters().addUint256(proposalId));

    return this.sendTransactionAndGetResponse(hashconnectConnectorInstance, trans, userId);
  }

  sendTransactionAndGetResponse = async (
    connectorInstance: BladeConnect | Hashconnect,
    transaction: Transaction,
    userId: string,
  ) => {
    const result = await connectorInstance?.sendTransaction(transaction, userId);
    const { response, receipt } = result;

    const responseData: any = {
      response,
      receipt,
    };

    return responseData;
  };
}

export default SDK;
