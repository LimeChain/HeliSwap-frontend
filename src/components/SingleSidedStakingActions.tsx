import React, { useState, useCallback, useContext, useEffect } from 'react';

import Tippy from '@tippyjs/react';
import toast from 'react-hot-toast';

import BigNumber from 'bignumber.js';

import { GlobalContext } from '../providers/Global';

import { ITokenData } from '../interfaces/tokens';
import { ISSSData } from '../interfaces/dao';

import Button from './Button';
import ButtonSelector from './ButtonSelector';
import InputToken from './InputToken';
import InputTokenSelector from './InputTokenSelector';
import WalletBalance from './WalletBalance';
import Icon from './Icon';
import Modal from './Modal';
import Confirmation from './Confirmation';
import ConfirmTransactionModalContent from './Modals/ConfirmTransactionModalContent';
import ConfirmTransactionModalCheckboxContent from './Modals/ConfirmTransactionModalCheckboxContent';
import IconToken from './IconToken';
import InputSlider from './InputSlider';
import InputDaySlider from './InputDaySlider';

import {
  formatStringToPercentage,
  formatStringWeiToStringEther,
  stripStringToFixedDecimals,
} from '../utils/numberUtils';
import {
  DAY_IN_SECONDS,
  getDaysFromTimestampInSeconds,
  nowTimestampInSeconds,
  timestampToDateTime,
} from '../utils/timeUtils';

import useHELITokenContract from '../hooks/useHELITokenContract';

import getErrorMessage from '../content/errors';

import { MAX_UINT_HTS, SLIDER_INITIAL_VALUE } from '../constants';
import {
  addressToId,
  calculatePercentageByShare,
  calculateShareByPercentage,
  invalidInputTokensData,
  requestAddressFromId,
} from '../utils/tokenUtils';

import { StakingStatus } from '../pages/SingleSidedStaking';

interface IFarmActionsProps {
  sssData: ISSSData;
  hasUserStaked: boolean;
  stakingTokenBalance: string;
  heliStaked: string;
  amountToLock: string;
  tokensToAssociate: ITokenData[];
  loadingAssociate: boolean;
  hasUserLockedTokens: boolean;
  timeLeft: number;
  stakingStatus: StakingStatus;
  getStakingTokenBalance: (id: string) => void;
  handleAssociateClick: (token: ITokenData) => void;
  updateStakedHeli: (newValue: string, action: string) => void;
  updateLockedHeli: (newValue: string, action: string) => void;
  updateVotingPower: (newValue: string, action: string) => void;
  updateTotalStakedHeli: (newValue: string, action: string) => void;
  setCountDown: (newValue: number) => void;
  setLockedUntil: (newValue: number) => void;
  setStakingStatus: (newValue: number) => void;
  setShouldRefresh: (newValue: boolean) => void;
}

enum TabStates {
  STAKE,
  LOCK,
  UNSTAKE,
}

const FarmActions = ({
  sssData,
  hasUserStaked,
  stakingTokenBalance,
  tokensToAssociate,
  loadingAssociate,
  getStakingTokenBalance,
  handleAssociateClick,
  updateStakedHeli,
  updateLockedHeli,
  updateTotalStakedHeli,
  amountToLock,
  heliStaked,
  hasUserLockedTokens,
  timeLeft,
  setCountDown,
  setLockedUntil,
  setStakingStatus,
  stakingStatus,
  updateVotingPower,
  setShouldRefresh,
}: IFarmActionsProps) => {
  const contextValue = useContext(GlobalContext);
  const { connection, sdk } = contextValue;
  const { userId, connectorInstance } = connection;

  const tokenContract = useHELITokenContract();

  const maxHELIInputValue = stakingTokenBalance;

  const lockTimeEnded = sssData.position.expiration.inMilliSeconds < Date.now();

  // Here we substract 1 day from the campaign end date to avoid the user to lock tokens on the last day in order to have room for increase the lock time.
  const daysLeftCampaignEnd = getDaysFromTimestampInSeconds(
    sssData.expirationDate.inSeconds - DAY_IN_SECONDS,
  );
  const minLockTimestampInitialValue = lockTimeEnded
    ? nowTimestampInSeconds() + DAY_IN_SECONDS * 3
    : sssData.position.expiration.inSeconds + DAY_IN_SECONDS * 3;

  const sliderMinValue = daysLeftCampaignEnd >= 3 ? '3' : daysLeftCampaignEnd.toString();
  const maxSupplyLimitHit = Number(sssData.totalDeposited.inETH) >= Number(sssData.maxSupply.inETH);
  const totalAvailableToLock =
    Number(sssData.maxSupply.inETH) - Number(sssData.totalDeposited.inETH);
  const canLock = Number(heliStaked) > 0 && Number(heliStaked) < totalAvailableToLock;

  const [lpInputValue, setLpInputValue] = useState(maxHELIInputValue);
  const [sliderValue, setSliderValue] = useState(SLIDER_INITIAL_VALUE);

  const [loadingStake, setLoadingStake] = useState(false);
  const [loadingApprove, setLoadingApprove] = useState(true);
  const [loadingExit, setLoadingExit] = useState(false);
  const [loadingLock, setLoadingLock] = useState(false);
  const [currentLockAPR, setCurrentLockAPR] = useState(0);
  const [additionalVotingPower, setAdditionalVotingPower] = useState(0);

  const [tabState, setTabState] = useState(TabStates.STAKE);
  const [lpApproved, setLpApproved] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);

  const [minLockTimestampValue, setMinLockTimestampValue] = useState(minLockTimestampInitialValue);
  const [lockTimestampValue, setLockTimestampValue] = useState(minLockTimestampValue);
  const [lockSliderValue, setLockSliderValue] = useState(sliderMinValue.toString());
  const [availableToLock, setAvailableToLock] = useState('0');
  const [stakeAndLock, setStakeAndLock] = useState(false);
  const [userCanWithdraw, setUserCanWithdraw] = useState(false);
  const [maxLockTimeReached, setMaxLockTimeReacked] = useState(false);

  // Handlers
  const handleTabButtonClick = (value: TabStates) => {
    setTabState(value);
  };

  const handleLpInputChange = (value: string) => {
    if (invalidInputTokensData(value, maxHELIInputValue, 18)) {
      setLpInputValue(stakingTokenBalance);
      setSliderValue(SLIDER_INITIAL_VALUE);
      return;
    }

    const percentage = calculatePercentageByShare(maxHELIInputValue, value);
    setSliderValue(percentage);

    setLpInputValue(value);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = e;
    const { value } = target;

    setSliderValue(value);
    const calculatedShare = calculateShareByPercentage(maxHELIInputValue, value, 8);
    setLpInputValue(calculatedShare);
  };

  const handleLockSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = e;
    const { value } = target;

    const newValue = lockTimeEnded
      ? nowTimestampInSeconds() + Number(value) * DAY_IN_SECONDS
      : sssData.position.expiration.inSeconds + Number(value) * DAY_IN_SECONDS;

    setLockTimestampValue(
      newValue > sssData.expirationDate.inSeconds
        ? sssData.expirationDate.inSeconds - DAY_IN_SECONDS
        : newValue,
    );
    setLockSliderValue(value);
  };

  const handleApproveClick = async () => {
    setLoadingApprove(true);
    try {
      const kernelAddress = process.env.REACT_APP_KERNEL_ADDRESS as string;
      const receipt = await sdk.approveToken(
        connectorInstance,
        MAX_UINT_HTS.toString(),
        userId,
        addressToId(process.env.REACT_APP_HELI_TOKEN_ADDRESS as string),
        true,
        kernelAddress,
      );

      const {
        response: { success, error },
      } = receipt;

      if (success) {
        toast.success('Success! Tokens were approved.');

        setLpApproved(true);
      } else {
        toast.error(getErrorMessage(error.status ? error.status : error));
      }
    } catch (e) {
      console.log('e', e);
    } finally {
      setLoadingApprove(false);
    }
  };

  const handleDepositConfirm = async () => {
    setLoadingStake(true);
    try {
      const kernelAddress = process.env.REACT_APP_KERNEL_ADDRESS as string;
      const timestamp = nowTimestampInSeconds() + timeLeft + 60;

      const receipt = stakeAndLock
        ? await sdk.depositAndLock(
            connectorInstance,
            lpInputValue,
            timestamp,
            kernelAddress,
            userId,
          )
        : await sdk.deposit(connectorInstance, lpInputValue, kernelAddress, userId);

      const {
        response: { success, error },
      } = receipt;

      if (success) {
        getStakingTokenBalance(userId);
        updateStakedHeli(lpInputValue, 'add');
        updateTotalStakedHeli(lpInputValue, 'add');
        updateVotingPower(lpInputValue, 'add');
        setShowDepositModal(false);
        setStakingStatus(StakingStatus.DEPOSIT);

        !userCanWithdraw && updateLockedHeli(lpInputValue, 'add');
        setShouldRefresh(stakeAndLock);

        toast.success('Success! Tokens were deposited.');
      } else {
        toast.error(getErrorMessage(error.status ? error.status : error));
      }
    } catch (e) {
      console.log('e', e);
    } finally {
      setLoadingStake(false);
    }
  };

  const handleLockConfirm = async () => {
    setLoadingLock(true);
    try {
      // const oneMinAfterNow = Math.floor(Date.now() / 1000) + 60;
      // const fiveMinAfterNow = Math.floor(Date.now() / 1000) + 60 * 5;
      // const oneHourAfterNow = Math.floor(Date.now() / 1000) + 3600;
      const kernelAddress = process.env.REACT_APP_KERNEL_ADDRESS as string;
      const receipt = await sdk.lock(connectorInstance, lockTimestampValue, kernelAddress, userId);
      // const receipt = await sdk.lock(connectorInstance, fiveMinAfterNow, kernelAddress, userId);

      const {
        response: { success, error },
      } = receipt;

      if (success) {
        toast.success('Success! Tokens were locked.');

        setTabState(TabStates.STAKE);
        setAvailableToLock('0');
        updateLockedHeli(amountToLock, 'add');
        setShowLockModal(false);
        setCountDown(lockTimestampValue * 1000 - Date.now());
        setLockedUntil(lockTimestampValue * 1000);
        setMinLockTimestampValue(lockTimestampValue + DAY_IN_SECONDS * 3);
        setLockTimestampValue(lockTimestampValue + DAY_IN_SECONDS * 3);
        setLockSliderValue('3');
        setStakeAndLock(true);
        setUserCanWithdraw(false);
        setStakingStatus(StakingStatus.LOCK);
        setShouldRefresh(true);
      } else {
        toast.error(getErrorMessage(error.status ? error.status : error));
      }
    } catch (e) {
      console.log('e', e);
    } finally {
      setLoadingLock(false);
    }
  };

  const handleExitConfirm = async () => {
    setLoadingExit(true);
    try {
      const kernelAddress = process.env.REACT_APP_KERNEL_ADDRESS as string;
      const receipt = await sdk.withdraw(connectorInstance, heliStaked, kernelAddress, userId);

      const {
        response: { success, error },
      } = receipt;

      if (success) {
        setTabState(TabStates.STAKE);
        getStakingTokenBalance(userId);
        updateStakedHeli(heliStaked, 'remove');
        updateTotalStakedHeli(heliStaked, 'remove');
        updateLockedHeli(heliStaked, 'remove');
        updateVotingPower(heliStaked, 'remove');
        setShowExitModal(false);
        setStakingStatus(StakingStatus.IDLE);

        toast.success('Success! Tokens were withdrawn.');
      } else {
        toast.error(getErrorMessage(error.status ? error.status : error));
      }
    } catch (e) {
      console.log('e', e);
    } finally {
      setLoadingExit(false);
    }
  };

  const handleButtonClick = (value: string) => {
    setSliderValue(value);
    const calculatedShare = calculateShareByPercentage(maxHELIInputValue, value, 8);
    setLpInputValue(calculatedShare);
  };

  const getInsufficientTokenBalance = useCallback(() => {
    return new BigNumber(lpInputValue as string).gt(new BigNumber(stakingTokenBalance));
  }, [stakingTokenBalance, lpInputValue]);

  const getHeliAllowance = useCallback(async () => {
    try {
      const kernelAddress = process.env.REACT_APP_KERNEL_ADDRESS as string;
      const userAddress = await requestAddressFromId(userId);
      const allowance = await tokenContract.allowance(userAddress, kernelAddress, {
        gasLimit: 300000,
      });
      setLpApproved(Number(allowance.toString()) > Number(lpInputValue));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingApprove(false);
    }
  }, [lpInputValue, tokenContract, userId]);

  useEffect(() => {
    setLpInputValue(maxHELIInputValue);
  }, [maxHELIInputValue]);

  useEffect(() => {
    userId && Object.keys(tokenContract).length && getHeliAllowance();
  }, [tokenContract, userId, lpInputValue, getHeliAllowance]);

  useEffect(() => {
    if (hasUserLockedTokens) {
      const availableToLockNum = Number(heliStaked) - Number(sssData.position.amount.inETH);
      setAvailableToLock(availableToLockNum.toString());
    } else {
      setAvailableToLock(heliStaked);
    }
  }, [sssData, hasUserLockedTokens, heliStaked]);

  useEffect(() => {
    const currentAPR = (sssData.rewardsPercentage * Number(lockSliderValue)) / 365;
    setCurrentLockAPR(currentAPR);
  }, [lockSliderValue, sssData.rewardsPercentage]);

  useEffect(() => {
    const votingPower = (Number(heliStaked) * Number(lockSliderValue)) / 365;
    setAdditionalVotingPower(votingPower);
  }, [lockSliderValue, heliStaked]);

  useEffect(() => {
    setStakeAndLock(canLock && hasUserLockedTokens && !maxSupplyLimitHit && !maxLockTimeReached);
  }, [canLock, hasUserLockedTokens, maxSupplyLimitHit, maxLockTimeReached]);

  useEffect(() => {
    setUserCanWithdraw(sssData.position.expiration.inMilliSeconds < Date.now());
  }, [sssData]);

  useEffect(() => {
    const isReached = sssData.position.expiration.inSeconds === sssData.expirationDate.inSeconds;
    setMaxLockTimeReacked(isReached);
  }, [sssData]);

  // Helper methods
  const getStakeButtonLabel = () => {
    if (getInsufficientTokenBalance()) return `Insufficient HELI balance`;
    if (stakeAndLock) return 'Stake and Lock';
    return 'Stake';
  };

  // Prevent user from unstaking if he locked and the lock limit will be reached
  const canStake = hasUserLockedTokens ? (canLock ? true : false) : true;

  return (
    <div className="col-md-5 mt-4 mt-md-0">
      <div className="container-blue-neutral-900 rounded p-4 p-lg-5 height-100 d-flex flex-column">
        <div>
          <span
            onClick={() => handleTabButtonClick(TabStates.STAKE)}
            className={`text-small text-bold text-uppercase link-tab me-5 ${
              tabState === TabStates.STAKE ? 'is-active' : ''
            }`}
          >
            Stake
          </span>
          {hasUserStaked ? (
            <span
              onClick={() => handleTabButtonClick(TabStates.LOCK)}
              className={`text-small text-bold text-uppercase link-tab me-5 ${
                tabState === TabStates.LOCK ? 'is-active' : ''
              }`}
            >
              Lock
            </span>
          ) : null}

          {hasUserStaked ? (
            <span
              onClick={() => handleTabButtonClick(TabStates.UNSTAKE)}
              className={`text-small text-bold text-uppercase link-tab me-5 ${
                tabState === TabStates.UNSTAKE ? 'is-active' : ''
              }`}
            >
              Unstake
            </span>
          ) : null}
        </div>

        <div className="d-flex flex-column justify-content-between flex-1 mt-5">
          {tabState === TabStates.STAKE ? (
            <>
              <div>
                {userId ? (
                  <InputSlider
                    handleSliderChange={handleSliderChange}
                    handleButtonClick={handleButtonClick}
                    sliderValue={sliderValue}
                  />
                ) : null}

                <p className="text-small text-bold">Enter HELI Token Amount</p>
                <InputTokenSelector
                  className="mt-4"
                  inputTokenComponent={
                    <InputToken
                      value={lpInputValue}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const { value } = e.target;
                        const strippedValue = stripStringToFixedDecimals(value, 18);
                        handleLpInputChange(strippedValue);
                      }}
                      isCompact={true}
                      name="amountIn"
                    />
                  }
                  buttonSelectorComponent={
                    <ButtonSelector disabled selectedToken="HELI" selectorText="Select a token" />
                  }
                  walletBalanceComponent={
                    <WalletBalance
                      insufficientBallance={getInsufficientTokenBalance()}
                      walletBalance={stakingTokenBalance}
                      onMaxButtonClick={(maxValue: string) => {
                        handleLpInputChange(maxValue);
                      }}
                    />
                  }
                />

                {stakingStatus === StakingStatus.LOCK ? (
                  <div className="mt-4">
                    <p className="text-small text-secondary">
                      Your overall $HELI token position is currently locked. This lock applies to
                      your entire position and is non revokable. You can however, stake more tokens
                      into the existing Lock in order to increase your $HELI stake and Voting power
                      and to benefit from the extra Locking APR and voting power boost.
                    </p>
                  </div>
                ) : null}
              </div>

              {userId ? (
                <div className="d-grid">
                  {!lpApproved ? (
                    <Button className="mb-3" loading={loadingApprove} onClick={handleApproveClick}>
                      <>
                        Approve HELI
                        <Tippy
                          content={`You must give the HeliSwap smart contracts permission to use your HELI tokens.`}
                        >
                          <span className="ms-2">
                            <Icon name="hint" />
                          </span>
                        </Tippy>
                      </>
                    </Button>
                  ) : null}

                  <Button
                    disabled={getInsufficientTokenBalance() || !lpApproved || !canStake}
                    loading={loadingStake}
                    onClick={() => setShowDepositModal(true)}
                  >
                    <>{getStakeButtonLabel()}</>
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}

          {tabState === TabStates.LOCK ? (
            <>
              <div>
                <p className="text-small text-bold">
                  {stakeAndLock ? 'Increase lock for' : 'HELI Token Amount to lock'}
                </p>
                <InputTokenSelector
                  className="mt-4"
                  readonly={true}
                  inputTokenComponent={
                    <InputToken
                      value={stakeAndLock ? sssData.position.amount.inETH : availableToLock}
                      disabled={true}
                      isCompact={true}
                      name="amountIn"
                    />
                  }
                  buttonSelectorComponent={
                    <ButtonSelector disabled selectedToken="HELI" selectorText="Select a token" />
                  }
                />

                {maxLockTimeReached ? (
                  <div className="text-main mt-5 mb-3">Max lock time reached!</div>
                ) : (
                  <>
                    <p className="text-secondary text-small text-bold mt-5 mb-3">
                      {stakeAndLock ? 'Increase current lock with:' : 'Lock for:'}
                    </p>

                    <InputDaySlider
                      handleSliderChange={handleLockSliderChange}
                      sliderValue={lockSliderValue}
                      maxValue={daysLeftCampaignEnd.toString()}
                      minValue={sliderMinValue.toString()}
                    />

                    <div className="mt-4">
                      <p className="text-main">
                        <span className="text-secondary">Lock till:</span>{' '}
                        <span>{timestampToDateTime(lockTimestampValue * 1000)}</span>
                      </p>
                    </div>

                    <div className="mt-4">
                      <span className="text-secondary text-small">
                        Expected APR from current locking period:{' '}
                      </span>
                      {formatStringToPercentage(
                        stripStringToFixedDecimals(currentLockAPR.toString(), 2),
                      )}
                    </div>

                    <div className="mt-4">
                      <span className="text-secondary text-small">
                        Expected additional voting power:{' '}
                      </span>
                      {stripStringToFixedDecimals(additionalVotingPower.toString(), 2)}
                    </div>

                    {stakingStatus === StakingStatus.LOCK ? (
                      <div className="mt-4">
                        <p className="text-small text-secondary">
                          You have the possibility to increase the Lock. The increased lock time
                          will add to your overall allocation of Voting Power and Lock APR. You can
                          see the APR from Locking and all other stats in the “Lock” Section on the
                          left. Please be aware, that the increased lock time applies to all $HELI
                          tokens you have staked into SSS and is non-revokable.
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="d-grid mt-4">
                <Button
                  disabled={
                    !canLock || maxSupplyLimitHit || lockTimestampValue === 0 || maxLockTimeReached
                  }
                  loading={loadingLock}
                  onClick={() => setShowLockModal(true)}
                >
                  {stakeAndLock ? 'Increase lock' : 'Lock'}
                </Button>
              </div>
            </>
          ) : null}

          {tabState === TabStates.UNSTAKE ? (
            <>
              <div>
                <p className="text-small text-bold">HELI Token Amount to unstake</p>
                <InputTokenSelector
                  className="mt-4"
                  readonly={true}
                  inputTokenComponent={
                    <InputToken
                      value={heliStaked}
                      disabled={true}
                      isCompact={true}
                      name="amountIn"
                    />
                  }
                  buttonSelectorComponent={
                    <ButtonSelector disabled selectedToken="HELI" selectorText="Select a token" />
                  }
                />

                {stakingStatus === StakingStatus.LOCK ? (
                  <div className="mt-4">
                    <p className="text-small text-secondary">
                      Unstaking is currently not possible as your position is locked. You can see
                      the exact amount of time left for the lock on the left hand side. While your
                      position is locked, you may not unstake it. If you want to unstake some or all
                      of your $HELI tokens, you need to wait until the lock has expired.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="d-grid mt-4">
                {tokensToAssociate && tokensToAssociate?.length > 0 ? (
                  tokensToAssociate.map((token, index) => (
                    <Button
                      key={index}
                      loading={loadingAssociate}
                      onClick={() => handleAssociateClick(token)}
                      size="small"
                      type="primary"
                    >
                      {`Associate ${token.symbol}`}
                    </Button>
                  ))
                ) : (
                  <Button
                    disabled={!userCanWithdraw}
                    loading={loadingExit}
                    onClick={() => setShowExitModal(true)}
                  >
                    Unstake
                  </Button>
                )}
              </div>
            </>
          ) : null}

          {showDepositModal ? (
            <Modal show={showDepositModal} closeModal={() => setShowDepositModal(false)}>
              <ConfirmTransactionModalCheckboxContent
                modalTitle="Stake Your HELI Tokens"
                closeModal={() => setShowDepositModal(false)}
                confirmTansaction={handleDepositConfirm}
                confirmButtonLabel="Confirm"
                isLoading={loadingStake}
                checkboxText={
                  stakeAndLock
                    ? 'I understand that I will lock and not be able to withdraw till the end of the lock period.'
                    : ''
                }
              >
                {loadingStake ? (
                  <Confirmation confirmationText={`Unstaking ${lpInputValue} HELI tokens`} />
                ) : (
                  <>
                    {stakeAndLock ? (
                      <div className="alert alert-warning d-flex align-items-center">
                        <Icon color="warning" name="warning" />
                        <p className="ms-3">
                          Depositing tokens again will lock them along with the other locked!
                        </p>
                      </div>
                    ) : null}

                    <div className="text-small">HELI token count</div>

                    <div className="d-flex justify-content-between align-items-center mt-4">
                      <div className="d-flex align-items-center">
                        <IconToken symbol="HELI" />

                        <span className="text-main ms-3">HELI Token</span>
                      </div>

                      <div className="text-main text-numeric">{lpInputValue}</div>
                    </div>
                  </>
                )}
              </ConfirmTransactionModalCheckboxContent>
            </Modal>
          ) : null}

          {showExitModal ? (
            <Modal show={showExitModal} closeModal={() => setShowExitModal(false)}>
              <ConfirmTransactionModalContent
                modalTitle="Unstake Your HELI Tokens"
                closeModal={() => setShowExitModal(false)}
                confirmTansaction={handleExitConfirm}
                confirmButtonLabel="Confirm"
                isLoading={loadingExit}
              >
                {loadingExit ? (
                  <Confirmation
                    confirmationText={`Unstaking ${formatStringWeiToStringEther(
                      sssData.position.amount.inWEI as string,
                      8,
                    )} HELI tokens`}
                  />
                ) : (
                  <>
                    <div className="text-small">HELI token count</div>

                    <div className="d-flex justify-content-between align-items-center mt-4">
                      <div className="d-flex align-items-center">
                        <IconToken symbol="HELI" />

                        <span className="text-main ms-3">HELI Token</span>
                      </div>

                      <div className="text-main text-numeric">{heliStaked}</div>
                    </div>
                  </>
                )}
              </ConfirmTransactionModalContent>
            </Modal>
          ) : null}

          {showLockModal ? (
            <Modal show={showLockModal} closeModal={() => setShowLockModal(false)}>
              <ConfirmTransactionModalCheckboxContent
                modalTitle="Lock Your HELI Tokens"
                closeModal={() => setShowLockModal(false)}
                confirmTansaction={handleLockConfirm}
                confirmButtonLabel="Confirm"
                isLoading={loadingLock}
                checkboxText={
                  'I understand that I will lock and not be able to withdraw till the end of the lock period.'
                }
              >
                {loadingLock ? (
                  <Confirmation confirmationText={`Locking ${availableToLock} HELI tokens`} />
                ) : (
                  <>
                    <div className="alert alert-warning d-flex align-items-center">
                      <Icon color="warning" name="warning" />
                      <p className="ms-3">
                        You are going to lock{' '}
                        {stakeAndLock ? sssData.position.amount.inETH : availableToLock} HELI tokens
                        for {lockSliderValue} days. These tokens will not be available for withdraw
                        till the locking period is over! Depositing tokens again will lock them
                        along with the already locked ones! Are you sure you want to continue?
                      </p>
                    </div>

                    <div className="text-small mt-4">HELI token count</div>

                    <div className="d-flex justify-content-between align-items-center mt-4">
                      <div className="d-flex align-items-center">
                        <IconToken symbol="HELI" />

                        <span className="text-main ms-3">HELI Token</span>
                      </div>

                      <div className="text-main text-numeric">
                        {stakeAndLock ? sssData.position.amount.inETH : availableToLock}
                      </div>
                    </div>
                  </>
                )}
              </ConfirmTransactionModalCheckboxContent>
            </Modal>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default FarmActions;
