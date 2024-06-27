import { useState, useEffect, useContext, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import Tippy from '@tippyjs/react';
import toast from 'react-hot-toast';

import { Md5 } from 'ts-md5';

import { GlobalContext } from '../providers/Global';

import { IProposal, ProposalStatus } from '../interfaces/dao';

import Icon from '../components/Icon';
import Button from '../components/Button';
import ToasterWrapper from '../components/ToasterWrapper';

import { timestampToDate, timestampToDateTime } from '../utils/timeUtils';
import { addressToId, requestUserAddressFromId } from '../utils/tokenUtils';
import { formatBigNumberToStringETH, formatStringETHtoPriceFormatted } from '../utils/numberUtils';

import useGovernanceContract from '../hooks/useGovernanceContract';
import useKernelContract from '../hooks/useKernelContract';

import getErrorMessage from '../content/errors';

const ProposalDetails = () => {
  const globalContext = useContext(GlobalContext);
  const { sdk, connection } = globalContext;
  const { connectorInstance, userId, connected } = connection;

  const { id } = useParams();
  const [proposal, setProposal] = useState<IProposal>({} as IProposal);
  const [loadingProposal, setLoadingProposal] = useState(true);
  const [errorProposal, setErrorProposal] = useState(false);
  const [loadingExecuteAction, setLoadingExecuteAction] = useState(false);

  const governanceContract = useGovernanceContract();
  const kernelContract = useKernelContract();

  const [creatorPaticipation, setCreatorPaticipation] = useState(0);
  const [votingPower, setVotingPower] = useState('0');

  const getGovernanceData = useCallback(
    async (proposalId: number) => {
      try {
        const proposalState = await governanceContract.state(proposalId);
        const proposalActions = await governanceContract.getActions(proposalId);
        const proposalQuorum = await governanceContract.getProposalQuorum(proposalId);
        const proposalsResolved = await governanceContract.proposals(proposalId);
        const {
          title,
          proposer,
          id,
          forVotes,
          executed,
          eta: etaBN,
          description: descriptionBN,
          createTime: createTimeBN,
          canceled,
          againstVotes,
          parameters: parametersBN,
        } = proposalsResolved;

        const re = /\n/gi;
        const description = descriptionBN.replace(re, '<br />');
        const votesFor = Number(forVotes.toString());
        const votesAgainst = Number(againstVotes.toString());
        const eta = Number(etaBN.toString());
        const createTime = Number(createTimeBN.toString());
        const quorum = Number(proposalQuorum.toString());

        const {
          acceptanceThreshold: acceptanceThresholdBN,
          activeDuration: activeDurationBN,
          gracePeriodDuration: gracePeriodDurationBN,
          minQuorum: minQuorumBN,
          queueDuration: queueDurationBN,
          warmUpDuration: warmUpDurationBN,
        } = parametersBN;

        const acceptanceThreshold = Number(acceptanceThresholdBN.toString());
        const activeDuration = Number(activeDurationBN.toString());
        const gracePeriodDuration = Number(gracePeriodDurationBN.toString());
        const minQuorum = Number(minQuorumBN.toString());
        const queueDuration = Number(queueDurationBN.toString());
        const warmUpDuration = Number(warmUpDurationBN.toString());

        const parameters = {
          acceptanceThreshold,
          activeDuration,
          gracePeriodDuration,
          minQuorum,
          queueDuration,
          warmUpDuration,
        };

        const actionsLength = proposalActions.calldatas.length;
        const actions = [];
        for (let i = 0; i < actionsLength; i++) {
          actions.push({
            calldata: proposalActions.calldatas[i],
            signature: proposalActions.signatures[i],
            target: proposalActions.targets[i],
          });
        }

        const proposalFomatted = {
          id,
          proposer,
          description,
          title,
          votesFor,
          votesAgainst,
          status: proposalState,
          eta,
          createTime,
          quorum,
          canceled,
          executed,
          actions,
          parameters,
          creatorThreshold: 1,
          votingStart: createTime + warmUpDuration,
          votingEnd: createTime + warmUpDuration + activeDuration,
        };

        setProposal(proposalFomatted);
      } catch (error) {
        console.error(error);
        setErrorProposal(true);
      } finally {
        setLoadingProposal(false);
      }
    },
    [governanceContract],
  );

  const getKernelData = useCallback(async () => {
    try {
      const userAddress = await requestUserAddressFromId(userId);

      const promisesArray = [kernelContract.votingPower(userAddress)];

      const [votingPowerBN] = await Promise.all(promisesArray);

      setVotingPower(formatBigNumberToStringETH(votingPowerBN));
    } catch (error) {
      console.error(error);
    }
  }, [kernelContract, userId]);

  useEffect(() => {
    Object.keys(governanceContract).length > 0 &&
      id &&
      !isNaN(Number(id)) &&
      getGovernanceData(Number(id));
  }, [governanceContract, id, getGovernanceData]);

  useEffect(() => {
    const getCreatorThreshold = async () => {
      const userAddress = await requestUserAddressFromId(userId);
      const votingPowerBN = await kernelContract.votingPower(userAddress);
      const balanceBN = await kernelContract.heliStaked();
      const creatorThreshold = (votingPowerBN / balanceBN) * 100;
      setCreatorPaticipation(creatorThreshold);
    };

    Object.keys(kernelContract).length && userId && getCreatorThreshold();
  }, [kernelContract, id, userId]);

  useEffect(() => {
    userId && Object.keys(kernelContract).length && getKernelData();
  }, [kernelContract, userId, getKernelData]);

  const haveProposal = Object.keys(proposal).length > 0;
  const allVotes = proposal.votesFor + proposal.votesAgainst;
  const percentageFor = (proposal.votesFor / allVotes) * 100 || 0;
  const percentageAgainst = (proposal.votesAgainst / allVotes) * 100 || 0;

  const handleCastVote = async (support: boolean) => {
    try {
      setLoadingExecuteAction(true);
      const receipt = await sdk.castVote(connectorInstance, Number(id), support, userId);

      const {
        response: { success, error },
      } = receipt;

      if (success) {
        toast.success('Success! Vote is casted.');

        getGovernanceData(Number(id));
      } else {
        toast.error(getErrorMessage(error.status ? error.status : error));
      }
    } catch (e) {
      console.log('e', e);
    } finally {
      setLoadingExecuteAction(false);
    }
  };

  return (
    <div className="container mt-5 mt-md-10">
      {loadingProposal ? (
        <p className="text-small text-secondary text-center">Loading...</p>
      ) : errorProposal ? (
        <div className="d-flex justify-content-center">
          <div className="alert alert-warning my-5">
            Something went wrong, please try again later...
          </div>
        </div>
      ) : haveProposal ? (
        <>
          <div className="row">
            <div className="col-md-10 offset-md-1">
              <div>
                <Link className="link d-inline-flex align-items-center" to="/proposals">
                  <Icon size="small" name="arrow-left" />
                  <span className="text-small text-bold ms-2">Proposals</span>
                </Link>
              </div>
              <h1 className="text-title text-bold mt-5">{proposal.title}</h1>

              <div className="d-flex justify-content-between align-items-center">
                {!isNaN(proposal.votingStart as number) && !isNaN(proposal.votingEnd as number) ? (
                  <div className="mt-2">
                    <p className="text-small">
                      <span className="text-secondary">Voting starts at: </span>
                      <span className="">
                        {timestampToDateTime((proposal.votingStart as number) * 1000)}
                      </span>
                    </p>
                    <p className="text-small mt-2">
                      <span className="text-secondary">Voting ends at: </span>
                      <span className="">
                        {timestampToDateTime((proposal.votingEnd as number) * 1000)}
                      </span>
                    </p>
                  </div>
                ) : null}

                <div>
                  <p className="text-small text-bold mt-3">
                    Voting power
                    <Tippy
                      content={
                        'Your total voting power for the HeliSwap DAO. It is derived from your stake in the Dynamic Yield Farm as well as additional voting power granted by an actively locked position.'
                      }
                    >
                      <span className="ms-2">
                        <Icon size="small" color="gray" name="hint" />
                      </span>
                    </Tippy>
                  </p>
                  <p className="d-flex justify-content-end">
                    <span className="text-subheader text-bold text-numeric text-end">
                      {formatStringETHtoPriceFormatted(votingPower)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="row mt-5">
            <div className="col-md-6 offset-md-1">
              <div className="container-blue-neutral-800">
                <div className="container-border-bottom p-5">
                  <h3 className="text-main text-bold">Vote Results</h3>
                </div>
                <div className="p-5">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <p className="text-micro text-bold">For</p>
                      <p className="text-main mt-2">
                        <span className="text-bold">
                          {formatBigNumberToStringETH(proposal.votesFor)}
                        </span>{' '}
                        <span className="text-secondary">({percentageFor.toFixed(2)}%)</span>
                      </p>
                    </div>

                    <div className="text-end">
                      <p className="text-micro text-bold">Against</p>
                      <p className="text-main mt-2">
                        <span className="text-bold">
                          {formatBigNumberToStringETH(proposal.votesAgainst)}
                        </span>{' '}
                        <span className="text-secondary">({percentageAgainst.toFixed(2)}%)</span>
                      </p>
                    </div>
                  </div>

                  <div className="progress mt-3">
                    <div
                      className="progress-bar"
                      role="progressbar"
                      style={{ width: `${percentageFor.toFixed(2)}%` }}
                    ></div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-8">
                    <div>
                      <div className="d-flex align-items-center">
                        <p className="text-micro text-bold">Quorum</p>
                        <Tippy
                          content={
                            'Quorum is the percentage of the amount of tokens staked in the DAO that support for a proposal must be greater than for the proposal to be considered valid. For example, if the Quorum % is set to 20%, then more than 20% of the amount of tokens staked in the DAO must vote to approve a proposal for the vote to be considered valid.'
                          }
                        >
                          <span className="ms-2">
                            <Icon size="small" color="gray" name="hint" />
                          </span>
                        </Tippy>
                      </div>
                      <p className="text-main mt-2">
                        <span className="text-bold">
                          {formatBigNumberToStringETH(proposal.quorum || 0)}
                        </span>{' '}
                        <span className="text-secondary">{`(${proposal.parameters?.minQuorum}% required)`}</span>
                      </p>
                    </div>

                    <div className="text-end">
                      <div className="d-flex justify-content-end align-items-center">
                        <p className="text-micro text-bold">Approval</p>
                        <Tippy
                          content={
                            'Approval is the percentage of votes on a proposal that the total support must be greater than for the proposal to be approved. For example, if “Approval” is set to 51%, then more than 51% of the votes on a proposal must vote “Yes” for the proposal to pass.'
                          }
                        >
                          <span className="ms-2">
                            <Icon size="small" color="gray" name="hint" />
                          </span>
                        </Tippy>
                      </div>
                      <p className="text-main mt-2">
                        <span className="text-bold">{percentageFor.toFixed(2)}%</span>{' '}
                        <span className="text-secondary">{`(${proposal.parameters?.acceptanceThreshold}% required)`}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="container-blue-neutral-800 mt-5">
                <div className="container-border-bottom p-5">
                  <h3 className="text-main text-bold">Details</h3>
                </div>
                <div className="p-5">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h4 className="text-micro text-bold">Created by</h4>
                      <div className="container-address in-proposal mt-3">
                        <img
                          className="img-profile me-3"
                          src={`https://www.gravatar.com/avatar/${Md5.hashStr(
                            proposal.proposer,
                          )}/?d=identicon`}
                          alt=""
                        />
                        <div className="text-secondary text-small text-bold">
                          {addressToId(proposal.proposer)}
                        </div>
                      </div>
                    </div>
                    {proposal.creatorThreshold ? (
                      <div>
                        <div className="d-flex justify-content-end align-items-center">
                          <h4 className="text-micro text-bold">Creator threshold</h4>
                          <Tippy
                            content={
                              'If the creator’s Heli balance falls below 1% of the total amount of Heli staked in the DAO the proposal can be cancelled by anyone.'
                            }
                          >
                            <span className="ms-2">
                              <Icon size="small" color="gray" name="hint" />
                            </span>
                          </Tippy>
                        </div>
                        <div className="container-address in-proposal mt-3">
                          <div className="text-secondary text-small text-bold">
                            {creatorPaticipation > proposal.creatorThreshold
                              ? `Above ${proposal.creatorThreshold}%`
                              : `Below ${proposal.creatorThreshold}%`}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <h4 className="text-micro text-bold mt-8">Description</h4>
                  <p
                    className="text-small mt-4"
                    dangerouslySetInnerHTML={{ __html: proposal.description }}
                  ></p>
                </div>
              </div>
            </div>

            <div className="col-md-4 mt-5 mt-md-0">
              <div className="container-blue-neutral-800 px-5 py-2">
                {proposal.status === ProposalStatus.EXECUTED ? (
                  <div className="d-flex align-items-center my-3">
                    <div className="container-status-with-icon is-executed"></div>
                    <div className="ms-4">
                      <p className="text-main text-bold">Executed</p>
                      {/* <p className="text-micro text-secondary mt-1">
                        {timestampToDate(proposal.executed * 1000)}
                      </p> */}
                    </div>
                  </div>
                ) : null}

                {proposal.status >= ProposalStatus.QUEUED ? (
                  <div className="d-flex align-items-center my-5">
                    <div className="container-status-with-icon is-executed"></div>
                    <div className="ms-4">
                      <p className="text-main text-bold">Queued for execution</p>
                      {/* {proposal.status > ProposalStatus.QUEUED ? (
                        <p className="text-micro text-secondary mt-1">12 Oct 2022 - 15:41</p>
                      ) : null} */}
                    </div>
                  </div>
                ) : null}

                {proposal.status > ProposalStatus.ACTIVE ? (
                  <div className="d-flex align-items-center my-5">
                    <div
                      className={`container-status-with-icon ${
                        proposal.status === ProposalStatus.FAILED ? 'is-failed' : 'is-executed'
                      }`}
                    ></div>
                    <div className="ms-4">
                      <p className="text-main text-bold">
                        {proposal.status === ProposalStatus.FAILED ? 'Failed' : 'Accepted'}
                      </p>
                    </div>
                  </div>
                ) : null}

                {proposal.status > ProposalStatus.WARMUP ? (
                  <div className="d-flex align-items-center my-5">
                    <div className="container-status-with-icon is-executed"></div>
                    <div className="ms-4">
                      <p className="text-main text-bold">Voting</p>
                      <p className="text-micro text-secondary mt-1">
                        {proposal.status > ProposalStatus.ACTIVE
                          ? `Ended at ${timestampToDate(
                              (proposal.createTime +
                                proposal.parameters!.warmUpDuration +
                                proposal.parameters!.activeDuration) *
                                1000,
                            )}`
                          : null}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="d-flex align-items-center my-5">
                  <div className="container-status-with-icon is-executed"></div>
                  <div className="ms-4">
                    <p className="text-main text-bold">Warm up</p>
                    <p className="text-micro text-secondary mt-1">
                      {proposal.status > ProposalStatus.WARMUP
                        ? `Ended at ${timestampToDate(
                            (proposal.createTime + proposal.parameters!.warmUpDuration) * 1000,
                          )}`
                        : null}
                    </p>
                  </div>
                </div>

                <div className="d-flex align-items-center my-5">
                  <div className="container-status-with-icon is-executed"></div>
                  <div className="ms-4">
                    <p className="text-main text-bold">Created</p>
                    <p className="text-micro text-secondary mt-1">
                      Created at {timestampToDate(proposal.createTime * 1000)}
                    </p>
                  </div>
                </div>
              </div>

              {connected ? (
                <div>
                  {proposal.status === ProposalStatus.ACTIVE ? (
                    <div className="d-flex justify-content-between mt-4">
                      <Button
                        loading={loadingExecuteAction}
                        size="small"
                        onClick={() => handleCastVote(true)}
                      >
                        Vote for
                      </Button>
                      <Button
                        loading={loadingExecuteAction}
                        type="secondary"
                        size="small"
                        onClick={() => handleCastVote(false)}
                      >
                        Vote against
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <p className="text-small text-secondary text-center">No proposal</p>
      )}
      <ToasterWrapper />
    </div>
  );
};

export default ProposalDetails;
