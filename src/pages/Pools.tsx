import { useState, useContext } from 'react';
import { GlobalContext } from '../providers/Global';
import { Link } from 'react-router-dom';

import { PageViews } from '../interfaces/common';

import RemoveLiquidity from '../components/RemoveLiquidity';

import { REFRESH_TIME } from '../constants';

import usePools from '../hooks/usePools';
import usePoolsByUser from '../hooks/usePoolsByUser';
import SearchArea from '../components/SearchArea';
import { useLazyQuery } from '@apollo/client';
import { GET_POOL_BY_TOKEN } from '../GraphQL/Queries';
import AllPools from '../components/AllPools';
import MyPools from '../components/MyPools';

interface IPoolsProps {
  itemsPerPage: number;
}

const Pools = ({ itemsPerPage }: IPoolsProps) => {
  const contextValue = useContext(GlobalContext);
  const { connection } = contextValue;
  const { userId, connected, isHashpackLoading, setShowConnectModal } = connection;

  const {
    error: errorPoools,
    loading: loadingPools,
    pools,
  } = usePools(
    {
      fetchPolicy: 'network-only',
      pollInterval: REFRESH_TIME,
    },
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

  const [
    loadExtraPools,
    { called: calledExtraPools, loading: loadingExtraPools, data: extraPoolsData },
  ] = useLazyQuery(GET_POOL_BY_TOKEN);

  const [showRemoveContainer, setShowRemoveContainer] = useState(false);
  const [currentPoolIndex, setCurrentPoolIndex] = useState(0);

  const initialCurrentView: PageViews = PageViews.ALL_POOLS;
  const [currentView, setCurrentView] = useState<PageViews>(initialCurrentView);

  const viewTitleMapping = {
    [PageViews.ALL_POOLS]: 'All pools',
    [PageViews.MY_POOLS]: 'My positions',
  };

  const poolsMapping = {
    [PageViews.ALL_POOLS]: pools,
    [PageViews.MY_POOLS]: poolsByUser,
  };

  const poolsToShow = poolsMapping[currentView];

  const handleTabItemClick = (currentView: PageViews) => {
    setCurrentView(currentView);
  };

  const havePools = pools!.length > 0;

  const renderAllPools = () => {
    return (
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
    );
  };

  const renderUserPools = () => {
    return (
      <MyPools
        connected={connected}
        isHashpackLoading={isHashpackLoading}
        loadingPools={loadingPoolsByUser}
        pools={poolsToShow}
        havePools={havePools}
        setShowRemoveContainer={setShowRemoveContainer}
        setCurrentPoolIndex={setCurrentPoolIndex}
        currentView={currentView}
        renderEmptyPoolsState={renderEmptyPoolsState}
        setShowConnectModal={setShowConnectModal}
        itemsPerPage={itemsPerPage}
      />
    );
  };

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
                searchFunc={(value: string) => {
                  loadExtraPools({
                    variables: { token: value },
                  });
                }}
                calledSearchResults={calledExtraPools}
                loadingSearchResults={loadingExtraPools}
                results={extraPoolsData ? extraPoolsData.poolsByToken : []}
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

          <>{currentView === PageViews.ALL_POOLS ? renderAllPools() : renderUserPools()}</>
        </div>
      )}
    </div>
  );
};

export default Pools;
