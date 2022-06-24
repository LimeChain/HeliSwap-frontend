import React, { useContext, useEffect, useState } from 'react';
import { hethers } from '@hashgraph/hethers';
import { GlobalContext } from '../providers/Global';
import { getHTSTokensWalletBalance } from '../utils/tokenUtils';

const Header = () => {
  const contextValue = useContext(GlobalContext);
  const {
    connected,
    connectWallet,
    disconnectWallet,
    extensionFound,
    isConnectionLoading,
    userId,
  } = contextValue.connection;

  const [userBalance, setUserBalance] = useState('0.0');

  useEffect(() => {
    const getUserTokensData = async () => {
      const { balance } = await getHTSTokensWalletBalance(userId);
      const balanceFormatted = hethers.utils.formatUnits(balance, 8);
      setUserBalance(balanceFormatted);
    };

    if (userId) {
      getUserTokensData();
    }
  }, [userId]);

  return (
    <div className="p-5">
      <div className="d-flex justify-content-end">
        <div className="d-flex align-items-center">
          {!isConnectionLoading ? (
            extensionFound ? (
              connected ? (
                <>
                  <div className="container-connected">
                    <div className="text-small">{userBalance} HBAR</div>
                    <div className="container-address">
                      <div className="text-small">{userId}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => disconnectWallet()}
                    className="btn btn-sm btn-outline-primary mx-2"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => connectWallet()}
                  className="btn btn-sm btn-outline-primary mx-2"
                >
                  Connect wallet
                </button>
              )
            ) : (
              <p className="text-warning mx-2">Please install a wallet</p>
            )
          ) : (
            <p className="text-success mx-2">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
