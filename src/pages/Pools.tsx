import { useState, useContext, useEffect, useMemo } from 'react';
import { GlobalContext } from '../providers/Global';
import { Link } from 'react-router-dom';

import { PageViews } from '../interfaces/common';

import RemoveLiquidity from '../components/RemoveLiquidity';

import { REFRESH_TIME } from '../constants';

import usePoolsByUser from '../hooks/usePoolsByUser';
import SearchArea from '../components/SearchArea';
import AllPools from '../components/AllPools';
import MyPools from '../components/MyPools';
import useFilteredPools from '../hooks/useFilteredPools';
import usePoolsByTokensList from '../hooks/usePoolsByTokensList';
import { joinByFieldSkipDuplicates } from '../utils/poolUtils';
import { IPoolExtendedData } from '../interfaces/tokens';

const whitelistedTokensMockedData = [
  '0x00000000000000000000000000000000021546BB',
  // '0x0000000000000000000000000000000002bD6493',
  '0x0000000000000000000000000000000002BD6495',
  '0x0000000000000000000000000000000002bd6497',
  '0x0000000000000000000000000000000002bd6499',
  '0x0000000000000000000000000000000002bd649B',
  '0x00000000000000000000000000000000021385a7',
  '0x00000000000000000000000000000000021385Af',
  '0x00000000000000000000000000000000026d6224',
  '0x0000000000000000000000000000000002bcE74d',
  '0x0000000000000000000000000000000002bCE853',
];

interface IPoolsProps {
  itemsPerPage: number;
}

const Pools = ({ itemsPerPage }: IPoolsProps) => {
  const contextValue = useContext(GlobalContext);
  const { connection } = contextValue;
  const { userId, connected, isHashpackLoading, setShowConnectModal } = connection;

  const [searchQuery, setSearchQuery] = useState({});
  const [showRemoveContainer, setShowRemoveContainer] = useState(false);
  const [currentPoolIndex, setCurrentPoolIndex] = useState(0);
  const [poolsToShow, setPoolsToShow] = useState<IPoolExtendedData[]>([]);
  const [userPoolsToShow, setUserPoolsToShow] = useState<IPoolExtendedData[]>([]);
  const [havePools, setHavePools] = useState(false);
  const [haveUserPools, setHaveUserPools] = useState(false);

  //Search area state
  const [inputValue, setInputValue] = useState('');

  const searchFunc = useMemo(
    () => (value: string) => {
      setSearchQuery({ keyword: value });
    },
    [],
  );

  const {
    poolsByTokenList: pools,
    loadingPoolsByTokenList: loadingPools,
    errorPoolsByTokenList: errorPoools,
  } = usePoolsByTokensList(
    {
      fetchPolicy: 'network-only',
      pollInterval: REFRESH_TIME,
    },
    true,
    whitelistedTokensMockedData,
  );

  const { filteredPools } = useFilteredPools(
    {
      fetchPolicy: 'network-only',
    },
    searchQuery,
    true,
  );

  const {
    error: errorPooolsByUser,
    loading: loadingPoolsByUser,
    poolsByUser,
  } = usePoolsByUser(
    {
      fetchPolicy: 'network-only',
      pollInterval: REFRESH_TIME,
    },
    userId,
    pools,
  );

  const initialCurrentView: PageViews = PageViews.ALL_POOLS;
  const [currentView, setCurrentView] = useState<PageViews>(initialCurrentView);

  const viewTitleMapping = {
    [PageViews.ALL_POOLS]: 'All pools',
    [PageViews.MY_POOLS]: 'My positions',
  };

  const handleTabItemClick = (currentView: PageViews) => {
    setCurrentView(currentView);
  };

  useEffect(() => {
    if (pools || filteredPools) {
      const visiblePools = joinByFieldSkipDuplicates(pools, filteredPools, 'id');
      setPoolsToShow(visiblePools);
    }
    setHavePools(pools && pools.length !== 0);
  }, [pools, filteredPools]);

  useEffect(() => {
    if (poolsByUser) setUserPoolsToShow(poolsByUser);
    setHaveUserPools(poolsByUser && poolsByUser.length !== 0);
  }, [poolsByUser]);

  const renderEmptyPoolsState = (infoMessage: string) => (
    <div className="text-center mt-10">
      <p className="text-small">{infoMessage}</p>
      <Link to="/create" className="btn btn-primary btn-sm mt-5">
        Create pool
      </Link>
    </div>
  );

  return (
    <div className="d-flex justify-content-center">
      {showRemoveContainer && poolsByUser[currentPoolIndex] ? (
        <RemoveLiquidity
          pairData={poolsByUser[currentPoolIndex]}
          setShowRemoveContainer={setShowRemoveContainer}
        />
      ) : (
        <div className="container-pools">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex">
              <h2
                onClick={() => handleTabItemClick(PageViews.ALL_POOLS)}
                className={`text-subheader tab-title mx-4 ${
                  PageViews.ALL_POOLS === currentView ? 'is-active' : ''
                }`}
              >
                {viewTitleMapping[PageViews.ALL_POOLS]}
              </h2>
              <h2
                onClick={() => handleTabItemClick(PageViews.MY_POOLS)}
                className={`text-subheader tab-title mx-4 ${
                  PageViews.MY_POOLS === currentView ? 'is-active' : ''
                } ms-3`}
              >
                {viewTitleMapping[PageViews.MY_POOLS]}
              </h2>
            </div>
          </div>

          <hr />

          {connected && !isHashpackLoading && havePools ? (
            <>
              <SearchArea
                searchFunc={searchFunc}
                inputValue={inputValue}
                setInputValue={setInputValue}
              />
              <div className="d-flex justify-content-end align-items-center my-5">
                <Link className="btn btn-sm btn-primary" to="/create">
                  Create pool
                </Link>
              </div>
            </>
          ) : null}

          {errorPoools || errorPooolsByUser ? (
            <div className="alert alert-danger mt-5" role="alert">
              <strong>Something went wrong!</strong> Cannot get pools...
            </div>
          ) : null}

          <>
            {currentView === PageViews.ALL_POOLS ? (
              <AllPools
                loadingPools={loadingPools}
                havePools={havePools}
                itemsPerPage={itemsPerPage}
                pools={poolsToShow}
                setShowRemoveContainer={setShowRemoveContainer}
                setCurrentPoolIndex={setCurrentPoolIndex}
                currentView={currentView}
                renderEmptyPoolsState={renderEmptyPoolsState}
              />
            ) : (
              <MyPools
                connected={connected}
                isHashpackLoading={isHashpackLoading}
                loadingPools={loadingPoolsByUser}
                pools={userPoolsToShow}
                havePools={haveUserPools}
                setShowRemoveContainer={setShowRemoveContainer}
                setCurrentPoolIndex={setCurrentPoolIndex}
                currentView={currentView}
                renderEmptyPoolsState={renderEmptyPoolsState}
                setShowConnectModal={setShowConnectModal}
                itemsPerPage={itemsPerPage}
              />
            )}
          </>
        </div>
      )}
    </div>
  );
};

export default Pools;
