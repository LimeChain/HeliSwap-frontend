import { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Tippy from '@tippyjs/react';
// import { ethers } from 'ethers';

import { GlobalContext } from '../providers/Global';

import { IProposal, ProposalStatus } from '../interfaces/dao';

import Button from '../components/Button';
import Icon from '../components/Icon';
import CreateProposal from '../components/CreateProposal';

import { timestampToDateTime } from '../utils/timeUtils';
import { requestUserAddressFromId } from '../utils/tokenUtils';
import { formatBigNumberToStringETH, formatStringETHtoPriceFormatted } from '../utils/numberUtils';

import useGovernanceContract from '../hooks/useGovernanceContract';
import useKernelContract from '../hooks/useKernelContract';

enum PageTab {
  'All',
  'Active',
  'Accepted',
  'Failed',
}

const Governance = () => {
  const globalContext = useContext(GlobalContext);
  const { connection } = globalContext;
  const { connected, userId } = connection;

  const governanceContract = useGovernanceContract();
  const kernelContract = useKernelContract();

  const [proposals, setProposals] = useState<IProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [errorProposals, setErrorProposals] = useState(false);
  const [votingPower, setVotingPower] = useState('0');

  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [canCreateProposal, setCanCreateProposal] = useState(false);

  const [pageTab, setPageTab] = useState(PageTab.All);

  const handleCreateProposalButtonClick = () => {
    setShowCreateProposal(true);
  };

  const handleTabClick = (target: PageTab) => {
    setPageTab(target);
  };

  const updateProposal = (newProposal: IProposal) => {
    setProposals([...proposals, newProposal]);
  };

  const getKernelData = useCallback(async () => {
    try {
      const userAddress = await requestUserAddressFromId(userId);
      const promisesArray = [kernelContract.votingPower(userAddress), kernelContract.heliStaked()];

      const [votingPowerBN, totalStakedBN] = await Promise.all(promisesArray);
      const stakingPercentage = Number(votingPowerBN.toString()) / Number(totalStakedBN.toString());
      setCanCreateProposal(stakingPercentage * 100 > 1);
      setVotingPower(formatBigNumberToStringETH(votingPowerBN));
    } catch (error) {
      console.error(error);
    }
  }, [kernelContract, userId]);

  const getGovernanceData = useCallback(async () => {
    setLoadingProposals(true);

    try {
      const promisesArray = [
        governanceContract.lastProposalId(),
        governanceContract.warmUpDuration(),
        governanceContract.activeDuration(),
      ];

      const [lastIdBN, warmUpDurationBN, activeDurationBN] = await Promise.all(promisesArray);
      // console.log('warmUpDurationBN.toString', warmUpDurationBN.toString());
      // console.log('activeDurationBN.toString', activeDurationBN.toString());

      // const warmUpDurationBN = ethers.BigNumber.from();
      // const activeDurationBN = ethers.BigNumber.from();

      const lastId = Number(lastIdBN.toString());
      const warmUpDuration = Number(warmUpDurationBN.toString());
      const activeDuration = Number(activeDurationBN.toString());

      const proposalIds = [];

      if (lastId > 0) {
        for (let i = 1; i <= lastId; i++) {
          proposalIds.push(i);
        }

        const proposalPromises = proposalIds.map(id => governanceContract.proposals(id));
        const proposalsResolved = await Promise.all(proposalPromises);

        const proposalStatusesPromises = proposalIds.map(id => governanceContract.state(id));
        const proposalStatusesResolved = await Promise.all(proposalStatusesPromises);

        const proposalsFormatted = proposalsResolved.map((item, index) => {
          const {
            title,
            proposer,
            id,
            forVotes,
            eta: etaBN,
            description,
            createTime: createTimeBN,
            againstVotes,
          } = item;

          const votesFor = Number(forVotes.toString());
          const votesAgainst = Number(againstVotes.toString());
          const eta = Number(etaBN.toString());
          const createTime = Number(createTimeBN.toString());

          return {
            id,
            proposer,
            description,
            title,
            votesFor,
            votesAgainst,
            status: proposalStatusesResolved[index],
            eta,
            createTime,
            votingStart: createTime + warmUpDuration,
            votingEnd: createTime + warmUpDuration + activeDuration,
          };
        });

        setProposals(proposalsFormatted);
      }
    } catch (error) {
      console.error(error);
      setErrorProposals(true);
    } finally {
      setLoadingProposals(false);
    }
  }, [governanceContract]);

  useEffect(() => {
    Object.keys(governanceContract).length > 0 && getGovernanceData();
  }, [governanceContract, getGovernanceData]);

  useEffect(() => {
    userId && Object.keys(kernelContract).length && getKernelData();
  }, [kernelContract, userId, getKernelData]);

  const haveProposals = proposals.length > 0;

  const statusClassesMapping: any = {
    0: {
      label: 'Warm Up',
      className: 'is-warmup',
    },
    1: {
      label: 'Active',
      className: 'is-active',
    },
    2: {
      label: 'Canceled',
      className: 'is-canceled',
    },
    3: {
      label: 'Failed',
      className: 'is-failed',
    },
    4: {
      label: 'Accepted',
      className: 'is-accepted',
    },
    5: {
      label: 'Queued',
      className: 'is-queued',
    },
    6: {
      label: 'Grace',
      className: 'is-grace',
    },
    7: {
      label: 'Expired',
      className: 'is-expired',
    },
    8: {
      label: 'Executed',
      className: 'is-executed',
    },
  };

  return (
    <div className="d-flex justify-content-center">
      <div className="container-max-with-1042">
        <h1 className="text-headline text-light mb-4">Governance</h1>

        {showCreateProposal ? (
          <CreateProposal
            setProposalCreated={updateProposal}
            setShowCreateProposal={setShowCreateProposal}
            proposals={proposals}
          />
        ) : (
          <div>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h1 className="text-title text-bold mb-1">Proposals</h1>
                <p>
                  <a
                    href="https://discord.com/channels/995562793560440852/1044912482134802582"
                    target="_blank"
                    rel="noreferrer"
                    className="link-primary"
                  >
                    Join the DAO discussions here &raquo;
                  </a>
                </p>
              </div>

              <div className="d-flex  align-items-center">
                <div className="me-3">
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
                {connected ? (
                  <>
                    <Button disabled={!canCreateProposal} onClick={handleCreateProposalButtonClick}>
                      Create proposal
                    </Button>
                    {!canCreateProposal ? (
                      <Tippy
                        content={`You will need 1% of all staked tokens in order to submit a proposal`}
                      >
                        <span className="ms-2">
                          <Icon color="gray" size="small" name="hint" />
                        </span>
                      </Tippy>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className="container-blue-neutral-800 rounded mt-5">
              <div className="container-border-bottom p-5">
                <div className="d-flex">
                  <span
                    onClick={() => handleTabClick(PageTab.All)}
                    className={`text-main text-bold cursor-pointer m-4 ${
                      pageTab === PageTab.All ? '' : 'text-secondary'
                    }`}
                  >
                    All proposals
                  </span>
                  <span
                    onClick={() => handleTabClick(PageTab.Active)}
                    className={`text-main text-bold cursor-pointer m-4 ${
                      pageTab === PageTab.Active ? '' : 'text-secondary'
                    }`}
                  >
                    Active
                  </span>
                  <span
                    onClick={() => handleTabClick(PageTab.Accepted)}
                    className={`text-main text-bold cursor-pointer m-4 ${
                      pageTab === PageTab.Accepted ? '' : 'text-secondary'
                    }`}
                  >
                    Accepted
                  </span>
                  <span
                    onClick={() => handleTabClick(PageTab.Failed)}
                    className={`text-main text-bold cursor-pointer m-4 ${
                      pageTab === PageTab.Failed ? '' : 'text-secondary'
                    }`}
                  >
                    Failed
                  </span>
                </div>
              </div>
              {loadingProposals ? (
                <div className="container-border-bottom p-5">
                  <p className="text-small text-secondary text-center">Loading...</p>{' '}
                </div>
              ) : errorProposals ? (
                <div className="d-flex justify-content-center">
                  <div className="alert alert-warning my-5">
                    Something went wrong, please try again later...
                  </div>
                </div>
              ) : haveProposals ? (
                <>
                  {proposals
                    .filter(proposal => {
                      switch (pageTab) {
                        case PageTab.Active:
                          return proposal.status === ProposalStatus.ACTIVE;
                        case PageTab.Accepted:
                          return proposal.status === ProposalStatus.ACCEPTED;
                        case PageTab.Failed:
                          return proposal.status === ProposalStatus.FAILED;
                        default:
                          return true;
                      }
                    })
                    .map((proposal, index) => (
                      <div
                        key={index}
                        className="container-border-bottom d-flex justify-content-between align-items-center py-3 px-5"
                      >
                        <div className="d-flex align-items-center">
                          <p className="text-small text-secondary me-3">
                            #{proposal.id.toString()}
                          </p>
                          <div className="ms-3">
                            <Link
                              to={`/proposals/${proposal.id}`}
                              className="link text-small text-bold"
                            >
                              {proposal.title}
                            </Link>
                            {!isNaN(proposal.votingStart as number) &&
                            !isNaN(proposal.votingEnd as number) ? (
                              <div className="mt-2">
                                <p className="text-micro">
                                  <span className="text-secondary">Voting starts at: </span>
                                  <span className="">
                                    {timestampToDateTime((proposal.votingStart as number) * 1000)}
                                  </span>
                                </p>
                                <p className="text-micro mt-2">
                                  <span className="text-secondary">Voting ends at: </span>
                                  <span className="">
                                    {timestampToDateTime((proposal.votingEnd as number) * 1000)}
                                  </span>
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p
                          className={`container-status ${
                            statusClassesMapping[proposal.status].className
                          } text-uppercase text-small text-bold mt-3`}
                        >
                          {statusClassesMapping[proposal.status].label}
                        </p>
                      </div>
                    ))}
                </>
              ) : (
                <div className="container-border-bottom p-5">
                  <p className="text-small text-secondary text-center">No proposals</p>{' '}
                </div>
              )}
              <div className="p-5">
                <p className="text-micro text-secondary">
                  Showing {proposals.length} to {proposals.length} out of {proposals.length}{' '}
                  proposals
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Governance;
