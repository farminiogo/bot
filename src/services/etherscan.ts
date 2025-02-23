import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_BASE_URL = 'https://api.etherscan.io/api';

if (!ETHERSCAN_API_KEY) {
  throw new Error('ETHERSCAN_API_KEY is missing in environment variables');
}

/**
 * Fetches transaction history for a given Ethereum address.
 * @param {string} address - Ethereum wallet address.
 * @param {number} startBlock - Starting block number (default: 0).
 * @param {number} endBlock - Ending block number (default: latest block).
 * @returns {Promise<any[]>} - Array of transactions.
 */
export async function getTransactionHistory(
  address: string,
  startBlock: number = 0,
  endBlock: number = 99999999
): Promise<any[]> {
  try {
    const response = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: 'account',
        action: 'txlist',
        address,
        startblock: startBlock,
        endblock: endBlock,
        sort: 'desc',
        apikey: ETHERSCAN_API_KEY,
      },
    });

    if (response.data.status !== '1') {
      throw new Error(response.data.message || 'Failed to fetch transactions');
    }

    return response.data.result;
  } catch (error) {
    console.error(`Error fetching transactions for ${address}:`, error);
    return [];
  }
}

/**
 * Fetches token balance for a given Ethereum address and token contract.
 * @param {string} address - Ethereum wallet address.
 * @param {string} contractAddress - Token contract address.
 * @returns {Promise<string>} - Token balance.
 */
export async function getTokenBalance(
  address: string,
  contractAddress: string
): Promise<string> {
  try {
    const response = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: 'account',
        action: 'tokenbalance',
        contractaddress: contractAddress,
        address,
        tag: 'latest',
        apikey: ETHERSCAN_API_KEY,
      },
    });

    if (response.data.status !== '1') {
      throw new Error(response.data.message || 'Failed to fetch token balance');
    }

    return response.data.result;
  } catch (error) {
    console.error(`Error fetching token balance for ${address}:`, error);
    return '0';
  }
}

/**
 * Fetches the latest Ethereum gas price.
 * @returns {Promise<string>} - Current gas price in Wei.
 */
export async function getGasPrice(): Promise<string> {
  try {
    const response = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: 'gastracker',
        action: 'gasoracle',
        apikey: ETHERSCAN_API_KEY,
      },
    });

    if (response.data.status !== '1') {
      throw new Error(response.data.message || 'Failed to fetch gas price');
    }

    return response.data.result.FastGasPrice;
  } catch (error) {
    console.error('Error fetching gas price:', error);
    return '0';
  }
}
