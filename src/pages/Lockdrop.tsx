import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import toast from 'react-hot-toast';

import numeral from 'numeral';
import { ethers } from 'ethers';

import { GlobalContext } from '../providers/Global';

import useFarmAddress from '../hooks/useFarmAddress';

import { IDaysMapping, ILockdropData, LOCKDROP_STATE } from '../interfaces/common';

import LockdropStats from '../components/LockdropStats';
import LockdropFAQ from '../components/LockdropFAQ';
import LockdropForm from '../components/LockdropForm';
import LockdropHowItWorks from '../components/LockdropHowItWorks';
import Loader from '../components/Loader';
import ToasterWrapper from '../components/ToasterWrapper';

import { requestUserAddressFromId } from '../utils/tokenUtils';
import {
  calculateLPTokens,
  formatStringWeiToStringEther,
  getUserHELIReserves,
} from '../utils/numberUtils';

import { useQueryOptionsPoolsFarms } from '../constants';

const LockDropABI = require('../abi/LockDrop.json');

const defaultBNValue = {
  valueBN: ethers.BigNumber.from('0'),
  valueStringWei: '0',
  valueStringETH: '0.0',
};

const lockDropInitialData: ILockdropData = {
  lockDropDuration: 604800000,
  lockdropEnd: 1677153552000,
  lastLockDropDay: 1677067152000,
  lockDropDepositEnd: 1676980752000,
  vestingEndTime: 1685039134000,
  totalLP: defaultBNValue,
  totalHbars: {
    valueBN: ethers.BigNumber.from('1541129857313845'),
    valueStringWei: '1541129857313845',
    valueStringETH: '15411298.57313845',
  },
  totalTokens: {
    valueBN: ethers.BigNumber.from('2000000000000000'),
    valueStringWei: '2000000000000000',
    valueStringETH: '20000000.0',
  },
  lockedHbars: defaultBNValue,
  claimed: defaultBNValue,
  claimable: defaultBNValue,
  totalClaimable: defaultBNValue,
  lastUserWithdrawal: 0,
  tokenAddress: '0x00000000000000000000000000000000001d90C9',
  estimatedLPTokens: {
    valueStringWei: '0',
    valueStringETH: '0',
  },
  lpTokenAddress: '0x3904ad0E5c86c9C3Ac452cD61afE1776BF92Cecd',
  estimatedLPPercentage: '0',
};

const daysMapping: IDaysMapping = {
  '1': {
    className: 'container-day',
    message: 'Unlimited deposits and withdrawals during this time.',
  },
  '2': {
    className: 'container-day',
    message: 'Unlimited deposits and withdrawals during this time.',
  },
  '3': {
    className: 'container-day',
    message: 'Unlimited deposits and withdrawals during this time.',
  },
  '4': {
    className: 'container-day',
    message: 'Unlimited deposits and withdrawals during this time.',
  },
  '5': {
    className: 'container-day',
    message:
      'Unlimited deposits and withdrawals during this time. This is the last day you can deposit and withdraw all your tokens!',
  },
  '6': {
    className: 'container-day is-day-6',
    message:
      'Only 1 withdrawal possible over day 6 & 7 combined. Up to 50% of position can be withdrawn on day 6.',
  },
  '7': {
    className: 'container-day is-day-7',
    message:
      'Only 1 withdrawal possible over day 6 & 7 combined. Max. withdrawal gradually decreasing from 50% to 0%.',
  },
};

const Lockdrop = () => {
  const contextValue = useContext(GlobalContext);
  const { connection, provider } = contextValue;
  const { userId } = connection;

  const lockDropContract = useMemo(() => {
    if (Object.keys(provider).length !== 0) {
      const lockDropContractAddress = process.env.REACT_APP_LOCKDROP_ADDRESS;

      return new ethers.Contract(lockDropContractAddress as string, LockDropABI, provider);
    }
  }, [provider]);

  const [countdownEnd, setCountDownEnd] = useState(0);
  const [currentState, setCurrentState] = useState(LOCKDROP_STATE.DEPOSIT);
  const [loadingContractData, setLoadingContractData] = useState(true);
  const [maxWithdrawValue, setMaxWithdrawValue] = useState<string>('0');
  const [contractLoadingError, setContractLoadingError] = useState(false);
  const [daysSinceStart, setDaysSinceStart] = useState(0);

  const [lockDropData, setLockDropData] = useState<ILockdropData>(lockDropInitialData);

  const { farmAddress } = useFarmAddress(useQueryOptionsPoolsFarms, lockDropData.lpTokenAddress);

  const getContractData = useCallback(async () => {
    if (lockDropContract) {
      setContractLoadingError(false);
      setLoadingContractData(true);

      try {
        let stakedTokensBN = ethers.BigNumber.from(0);
        let claimedOfBN = ethers.BigNumber.from(0);
        let totalClaimableBN = ethers.BigNumber.from(0);
        let totalLPBN = ethers.BigNumber.from(0);

        let claimableBN = ethers.BigNumber.from(0);

        if (userId) {
          const userAddress = await requestUserAddressFromId(userId);

          const promiseArray = [
            lockDropContract.claimable(userAddress),
            lockDropContract.claimedOf(userAddress),
            lockDropContract.providers(userAddress),
            lockDropContract.totalClaimable(userAddress),
          ];

          [claimableBN, claimedOfBN, stakedTokensBN, totalClaimableBN] = await Promise.all(
            promiseArray,
          );
        }

        const totalLP = {
          valueBN: totalLPBN,
          valueStringWei: totalLPBN.toString(),
          valueStringETH: formatBNTokenToString(totalLPBN, 18),
        };
        const lockedHbars = {
          valueBN: stakedTokensBN,
          valueStringWei: stakedTokensBN.toString(),
          valueStringETH: formatBNTokenToString(stakedTokensBN),
        };
        const claimed = {
          valueBN: claimedOfBN,
          valueStringWei: claimedOfBN.toString(),
          valueStringETH: formatBNTokenToString(claimedOfBN, 18),
        };
        const claimable = {
          valueBN: claimableBN,
          valueStringWei: claimableBN.toString(),
          valueStringETH: formatBNTokenToString(claimableBN, 18),
        };
        const totalClaimable = {
          valueBN: totalClaimableBN,
          valueStringWei: totalClaimableBN.toString(),
          valueStringETH: formatBNTokenToString(totalClaimableBN, 18),
        };
        // const lastUserWithdrawal = formatBigNumberToMilliseconds(lastUserWithdrawalBN);
        const myHELIFormatted = getUserHELIReserves(
          lockDropInitialData.totalTokens.valueBN,
          lockedHbars.valueBN,
          lockDropInitialData.totalHbars.valueBN,
        );
        const estimatedLPTokensBN = calculateLPTokens(
          myHELIFormatted,
          lockedHbars.valueStringETH,
          8,
          8,
        );
        const estimatedLPTokens = {
          valueStringWei: estimatedLPTokensBN.toString(),
          valueStringETH: formatStringWeiToStringEther(estimatedLPTokensBN),
        };
        // Calculate total estimates LP tokens before pool is created; this amount shoub be == to `totalLPtokens` after pool is created
        const estimatedTotalLPTokensBN = calculateLPTokens(
          lockDropInitialData.totalTokens.valueStringETH,
          lockDropInitialData.totalHbars.valueStringETH,
          8,
          8,
        );
        const estimatedTotalLPTokens = {
          valueStringWei: estimatedTotalLPTokensBN.toString(),
          valueStringETH: formatStringWeiToStringEther(estimatedTotalLPTokensBN),
        };
        const estimatedLPPercentage =
          Number(estimatedLPTokens.valueStringWei) === 0 ||
          Number(estimatedTotalLPTokens.valueStringWei) === 0
            ? '0'
            : (
                (Number(estimatedLPTokens.valueStringWei) /
                  Number(estimatedTotalLPTokens.valueStringWei)) *
                100
              ).toString();
        // Determine state
        const lockdropStartTime =
          lockDropInitialData.lockdropEnd - lockDropInitialData.lockDropDuration;
        const nowTimeStamp = Date.now();
        const timeSinceStart = nowTimeStamp - lockdropStartTime;
        const daysSinceStart = Math.ceil(timeSinceStart / 1000 / 3600 / 24);
        setDaysSinceStart(daysSinceStart);
        const withdrawOnly =
          nowTimeStamp > lockDropInitialData.lockDropDepositEnd &&
          nowTimeStamp <= lockDropInitialData.lockdropEnd;
        const preVesting =
          nowTimeStamp > lockDropInitialData.lockdropEnd &&
          lockDropInitialData.vestingEndTime === 0;
        const vesting =
          nowTimeStamp > lockDropInitialData.lockdropEnd &&
          lockDropInitialData.vestingEndTime !== 0;
        const end =
          lockDropInitialData.vestingEndTime !== 0
            ? nowTimeStamp > lockDropInitialData.vestingEndTime
            : false;
        if (withdrawOnly) {
          setCurrentState(LOCKDROP_STATE.WITHDRAW);
        }
        if (preVesting) {
          setCurrentState(LOCKDROP_STATE.PRE_VESTING);
        }
        if (vesting) {
          setCurrentState(LOCKDROP_STATE.VESTING);
        }
        if (end) {
          setCurrentState(LOCKDROP_STATE.END);
        }
        // setLockDropData({
        //   lockDropDuration,
        //   lockdropEnd,
        //   lastLockDropDay,
        //   lockDropDepositEnd,
        //   vestingEndTime,
        //   totalLP,
        //   totalHbars,
        //   totalTokens,
        //   lockedHbars,
        //   claimed,
        //   claimable,
        //   totalClaimable,
        //   lastUserWithdrawal,
        //   tokenAddress,
        //   estimatedLPTokens,
        //   lpTokenAddress,
        // });
        setLockDropData({
          ...lockDropInitialData,
          totalLP,
          estimatedLPTokens,
          lockedHbars,
          estimatedLPPercentage,
          claimed,
          claimable,
          totalClaimable,
        });
        setCountDownEnd(
          vesting ? lockDropInitialData.vestingEndTime : lockDropInitialData.lockdropEnd,
        );
      } catch (e) {
        console.error('Error on fetching contract data:', e);
        setContractLoadingError(true);
      } finally {
        setLoadingContractData(false);
      }
    }
  }, [lockDropContract, userId]);

  const getMaxWithdrawAmount = useCallback(() => {
    const { lockdropEnd, lockedHbars, lockDropDuration, lockDropDepositEnd, lastLockDropDay } =
      lockDropData;
    const timeLockDropStart = lockdropEnd - lockDropDuration;
    const timeNow = Date.now();
    const offset = 30000;

    let maxWithdrawValue = '0';

    if (
      lockedHbars.valueBN.gt(ethers.constants.Zero) &&
      (timeNow > timeLockDropStart || timeNow < lockdropEnd)
    ) {
      if (timeNow < lockDropDepositEnd) {
        maxWithdrawValue = lockedHbars.valueStringETH;
      } else if (timeNow > lockDropDepositEnd && timeNow < lastLockDropDay) {
        maxWithdrawValue = ethers.utils.formatUnits(
          lockedHbars.valueBN.div(ethers.constants.Two),
          8,
        );
      } else if (timeNow > lockDropDepositEnd && timeNow < lockdropEnd) {
        //Show the amount in future moment, so the user is able to execute the transaction and withraw the amount shown
        const timeNowDelayed = timeNow + offset;

        const maxAvailableToWithdraw = lockedHbars.valueBN.div(ethers.constants.Two);
        const timeFromStartOfDay = timeNowDelayed.valueOf() - lastLockDropDay.valueOf();
        const timeToLockdropEnd = lockdropEnd.valueOf() - lastLockDropDay.valueOf();

        const timeRatio = ethers.BigNumber.from(timeFromStartOfDay.toString())
          .mul(ethers.BigNumber.from(ethers.constants.WeiPerEther))
          .div(ethers.BigNumber.from(timeToLockdropEnd.toString()));

        const maxWithdrawValueBN = maxAvailableToWithdraw.sub(
          maxAvailableToWithdraw
            .mul(timeRatio)
            .div(ethers.BigNumber.from(ethers.constants.WeiPerEther))
            .toString(),
        );

        maxWithdrawValue = maxWithdrawValueBN.lte(ethers.constants.Zero)
          ? '0'
          : ethers.utils.formatUnits(maxWithdrawValueBN, 8);
      }
    }
    setMaxWithdrawValue(maxWithdrawValue);
  }, [lockDropData]);

  useEffect(() => {
    lockDropContract && getContractData();
  }, [lockDropContract, getContractData]);

  useEffect(() => {
    const fetchInterval = setInterval(() => {
      getMaxWithdrawAmount();
    }, 5000);

    return () => {
      clearInterval(fetchInterval);
    };
  }, [getMaxWithdrawAmount]);

  useEffect(() => {
    getMaxWithdrawAmount();
  }, [lockDropData, getMaxWithdrawAmount]);

  const formatBNTokenToString = (numberToFormat: ethers.BigNumber, decimals = 8) =>
    ethers.utils.formatUnits(numberToFormat, decimals);

  const getErrorMessage = () => (
    <div className="alert alert-warning text-center">
      Network is busy, please try refreshing the page.
    </div>
  );

  return (
    <div className="container py-4 py-lg-7">
      <h1 className="text-display text-bold text-center">HELI Community Lockdrop</h1>

      {loadingContractData ? (
        <div className="d-flex justify-content-center my-6">
          <Loader />
        </div>
      ) : contractLoadingError ? (
        <>
          <div className="row my-6">
            <div className="col-lg-6 offset-lg-3">{getErrorMessage()}</div>
          </div>
        </>
      ) : (
        <>
          <div className="text-center mt-5">
            <h3 className="text-large text-bold">
              <span className="text-numeric">
                {numeral(lockDropData.totalTokens.valueStringETH).format('0,0.00')}
              </span>{' '}
              HELI
            </h3>
            <p className="text-micro text-secondary mt-2">
              Total HELI amount distributed in Lockdrop
            </p>
          </div>

          {/* Deposit, Withdrtaw & Claim form */}
          {lockDropData ? (
            <LockdropForm
              daysSinceStart={daysSinceStart}
              daysMapping={daysMapping}
              toast={toast}
              getContractData={getContractData}
              lockDropData={lockDropData}
              currentState={currentState}
              farmAddress={farmAddress}
              maxWithdrawValue={maxWithdrawValue}
            />
          ) : null}
          {/* Deposit, Withdrtaw & Claim form */}

          {/* Lockdrop stats */}
          {lockDropData ? (
            <LockdropStats
              lockDropData={lockDropData}
              currentState={currentState}
              countdownEnd={countdownEnd}
            />
          ) : null}
          {/* Lockdrop stats */}
        </>
      )}

      {/* About the lockdrop */}
      <h2 className="text-subheader text-bold text-center mt-7 mt-lg-10">About the LockDrop</h2>
      <div className="row mt-5">
        <div className="col-lg-6 offset-lg-3">
          <p className="text-small">
            A large amount of HELI is distributed to anyone who deposits their HBAR on the lock drop
            page. We then merge the pre-announced amount of HELI (20,000,000) with the received HBAR
            to create an HBAR/HELI Liquidity Pool. ALL LP tokens that are generated throughout this
            process will be redistributed to participants and vest linearly over a 3 months period.{' '}
            <br />
            This mechanism helps HeliSwap to create a large initial HBAR/HELI pool with deep
            liquidity and allows for a community driven natural price discovery process. In a
            further step your already vested LP tokens can then be used to earn additional token
            rewards by staking them into the HELI/HBAR yield farming campaign. This is only a
            suggestion and not financial advice, as already vested LP tokens can be used in any way
            you like.
          </p>
        </div>
      </div>
      {/* About the lockdrop */}

      {/* How it works */}
      <LockdropHowItWorks daysMapping={daysMapping} daysSinceStart={daysSinceStart} />
      {/* How it works */}

      {/* FAQ */}
      <LockdropFAQ />
      {/* FAQ */}

      <div className="mt-6 mt-lg-8 d-flex justify-content-center align-items-center">
        <p className="text-main">More Information:</p>
        <a
          href="https://app.gitbook.com/o/-MjU-PIYsZoZ56-mDgdv/s/WEJ4Xz5JZB9w7aYjQ7lg/~/changes/covMo7r1tk2GpJW6LfxL/heli-lockdrop"
          rel="noreferrer"
          target="_blank"
        >
          <img className="ms-4" src="/button-gitbook.svg" alt="" />
        </a>
      </div>
      <ToasterWrapper />
    </div>
  );
};

export default Lockdrop;
