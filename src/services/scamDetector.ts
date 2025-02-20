import axios from 'axios';
import { getTokenByContract } from './coingecko';

const ETHERSCAN_API_KEY = 'YOUR_ETHERSCAN_API_KEY';
const ETHERSCAN_API = 'https://api.etherscan.io/api';
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;

export interface SecurityCheck {
  id: string;
  name: string;
  status: 'safe' | 'warning' | 'danger' | 'info';
  description: string;
  details?: string;
  color?: string; // For UI color-coding
}

export interface SecurityScore {
  score: number;
  maxScore: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface ContractData {
  isVerified: boolean;
  sourceCode?: string;
  contractCreator?: string;
  implementation?: string;
  deploymentDate?: number;
  isProxy?: boolean;
}

// Enhanced error handling utility
class SecurityError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'SecurityError';
  }
}

// Exponential backoff retry utility
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      const delay = INITIAL_DELAY * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed after multiple retries');
}

async function getContractData(address: string): Promise<ContractData> {
  try {
    const response = await fetchWithRetry(() => 
      axios.get(ETHERSCAN_API, {
        params: {
          module: 'contract',
          action: 'getsourcecode',
          address,
          apikey: ETHERSCAN_API_KEY
        }
      })
    );

    const data = response.data.result[0];
    const deploymentTx = await fetchWithRetry(() =>
      axios.get(ETHERSCAN_API, {
        params: {
          module: 'account',
          action: 'txlist',
          address,
          page: 1,
          offset: 1,
          sort: 'asc',
          apikey: ETHERSCAN_API_KEY
        }
      })
    );

    return {
      isVerified: data.ABI !== 'Contract source code not verified',
      sourceCode: data.SourceCode,
      contractCreator: data.ContractCreator,
      implementation: data.Implementation,
      deploymentDate: deploymentTx.data.result[0]?.timeStamp,
      isProxy: data.Proxy === '1'
    };
  } catch (error) {
    console.error('Error fetching contract data:', error);
    return {
      isVerified: false,
      deploymentDate: 0,
      isProxy: false
    };
  }
}

function analyzeSourceCode(sourceCode: string): {
  hasTransferRestrictions: boolean;
  hasFeeOnTransfer: boolean;
  hasBlacklist: boolean;
  hasOwnerOnlyFunctions: boolean;
  hasProxyImplementation: boolean;
  isMintable: boolean;
  hasRenounced: boolean;
  hasAntiBot: boolean;
  hasEmergencyFunctions: boolean;
} {
  // Enhanced regex patterns for better detection
  const patterns = {
    transferRestrictions: /require\s*\([^)]*transfer|assert\s*\([^)]*transfer/i,
    feeOnTransfer: /(\b|_)fee\b|\btax\b|\bcommission\b/i,
    blacklist: /\b(black|block)list\b/i,
    ownerOnly: /\bonlyOwner\b|\brequire\s*\([^)]*msg\.sender\s*==\s*owner\b/i,
    proxyImpl: /\bdelegatecall\b|\bupgradeable\b|\bproxy\b/i,
    mintable: /\bmint\b(?!.*\bburn\b)|\bcreateTok(en|ens)\b/i,
    renounceOwnership: /\brenounceOwnership\b|\btransferOwnership\s*\([^)]*address\s*\(\s*0\s*\)/i,
    antiBot: /\bantiBot\b|\bbot\s*Prevention\b/i,
    emergencyFunctions: /\bemergency\b|\bpause\b|\bfreeze\b/i
  };

  return {
    hasTransferRestrictions: patterns.transferRestrictions.test(sourceCode),
    hasFeeOnTransfer: patterns.feeOnTransfer.test(sourceCode),
    hasBlacklist: patterns.blacklist.test(sourceCode),
    hasOwnerOnlyFunctions: patterns.ownerOnly.test(sourceCode),
    hasProxyImplementation: patterns.proxyImpl.test(sourceCode),
    isMintable: patterns.mintable.test(sourceCode),
    hasRenounced: patterns.renounceOwnership.test(sourceCode),
    hasAntiBot: patterns.antiBot.test(sourceCode),
    hasEmergencyFunctions: patterns.emergencyFunctions.test(sourceCode)
  };
}

function calculateLiquidityScore(liquidityUSD: number): number {
  if (liquidityUSD >= 1000000) return 25; // $1M or more
  if (liquidityUSD >= 500000) return 20;
  if (liquidityUSD >= 100000) return 15;
  if (liquidityUSD >= 50000) return 10;
  if (liquidityUSD >= 10000) return 5;
  return 0;
}

function calculateHolderScore(holders: number): number {
  if (holders >= 1000) return 15;
  if (holders >= 500) return 12;
  if (holders >= 100) return 8;
  if (holders >= 50) return 4;
  return 0;
}

function calculateAgeScore(deploymentDate: number): number {
  const ageInDays = (Date.now() / 1000 - deploymentDate) / 86400;
  if (ageInDays >= 365) return 20; // 1 year or more
  if (ageInDays >= 180) return 15; // 6 months
  if (ageInDays >= 90) return 10;  // 3 months
  if (ageInDays >= 30) return 5;   // 1 month
  return 0;
}

export async function analyzeToken(contractAddress: string): Promise<{
  checks: SecurityCheck[];
  score: SecurityScore;
}> {
  try {
    const [tokenData, contractData] = await Promise.all([
      getTokenByContract(contractAddress),
      getContractData(contractAddress)
    ]);

    const checks: SecurityCheck[] = [];
    let totalScore = 0;
    const maxScore = 120; // Increased max score for more granular risk assessment

    // Contract Verification Check
    checks.push({
      id: 'verification',
      name: 'Contract Verification',
      status: contractData.isVerified ? 'safe' : 'danger',
      description: contractData.isVerified
        ? 'Smart contract is verified and publicly available'
        : 'Contract is not verified - high risk',
      details: contractData.isVerified
        ? 'Verified contracts allow for code inspection and security analysis'
        : 'Unverified contracts may hide malicious code',
      color: contractData.isVerified ? 'green' : 'red'
    });
    totalScore += contractData.isVerified ? 30 : 0;

    // Contract Age Check
    if (contractData.deploymentDate) {
      const ageScore = calculateAgeScore(contractData.deploymentDate);
      const ageInDays = (Date.now() / 1000 - contractData.deploymentDate) / 86400;
      
      checks.push({
        id: 'contract-age',
        name: 'Contract Age',
        status: ageScore >= 15 ? 'safe' : ageScore >= 5 ? 'warning' : 'danger',
        description: `Contract deployed ${Math.floor(ageInDays)} days ago`,
        details: `Older contracts tend to be more reliable and tested`,
        color: ageScore >= 15 ? 'green' : ageScore >= 5 ? 'yellow' : 'red'
      });
      
      totalScore += ageScore;
    }

    // Source Code Analysis
    if (contractData.isVerified && contractData.sourceCode) {
      const codeAnalysis = analyzeSourceCode(contractData.sourceCode);
      
      // Transfer Restrictions
      if (codeAnalysis.hasTransferRestrictions) {
        checks.push({
          id: 'transfer-restrictions',
          name: 'Transfer Restrictions',
          status: 'warning',
          description: 'Contract includes transfer restrictions',
          details: 'May limit ability to sell tokens',
          color: 'yellow'
        });
        totalScore -= 10;
      }

      // Fee on Transfer
      if (codeAnalysis.hasFeeOnTransfer) {
        checks.push({
          id: 'transfer-fee',
          name: 'Transfer Fee',
          status: 'warning',
          description: 'Contract implements transfer fees',
          details: 'Additional costs when trading the token',
          color: 'yellow'
        });
        totalScore -= 5;
      }

      // Blacklist Function
      if (codeAnalysis.hasBlacklist) {
        checks.push({
          id: 'blacklist',
          name: 'Blacklist Function',
          status: 'danger',
          description: 'Contract includes blacklist functionality',
          details: 'Owner can restrict trading for specific addresses',
          color: 'red'
        });
        totalScore -= 15;
      }

      // Owner Privileges
      if (codeAnalysis.hasOwnerOnlyFunctions) {
        const hasRenounced = codeAnalysis.hasRenounced;
        checks.push({
          id: 'owner-functions',
          name: 'Owner Privileges',
          status: hasRenounced ? 'info' : 'warning',
          description: hasRenounced 
            ? 'Owner privileges have been renounced'
            : 'Contract has owner-only functions',
          details: hasRenounced
            ? 'Contract ownership has been renounced, reducing centralization risks'
            : 'Owner has special privileges that could affect token behavior',
          color: hasRenounced ? 'blue' : 'yellow'
        });
        totalScore -= hasRenounced ? 0 : 10;
      }

      // Mintable Token
      if (codeAnalysis.isMintable) {
        checks.push({
          id: 'mintable',
          name: 'Mintable Token',
          status: 'warning',
          description: 'Contract allows minting new tokens',
          details: 'Supply can be increased, potential inflation risk',
          color: 'yellow'
        });
        totalScore -= 10;
      }

      // Emergency Functions
      if (codeAnalysis.hasEmergencyFunctions) {
        checks.push({
          id: 'emergency-functions',
          name: 'Emergency Functions',
          status: 'warning',
          description: 'Contract includes emergency functions',
          details: 'Owner can pause or freeze token transfers',
          color: 'yellow'
        });
        totalScore -= 8;
      }

      // Proxy Implementation
      if (codeAnalysis.hasProxyImplementation || contractData.isProxy) {
        checks.push({
          id: 'proxy',
          name: 'Upgradeable Contract',
          status: 'warning',
          description: 'Contract logic can be upgraded',
          details: 'Contract functionality can be changed by the owner',
          color: 'yellow'
        });
        totalScore -= 5;
      }
    }

    // Market Data Analysis
    if (tokenData) {
      // Liquidity Analysis
      const liquidityScore = calculateLiquidityScore(tokenData.market_data.total_volume.usd);
      checks.push({
        id: 'liquidity',
        name: 'Liquidity',
        status: liquidityScore >= 20 ? 'safe' : liquidityScore >= 10 ? 'warning' : 'danger',
        description: `${liquidityScore >= 20 ? 'Healthy' : liquidityScore >= 10 ? 'Moderate' : 'Low'} liquidity`,
        details: `$${(tokenData.market_data.total_volume.usd / 1e6).toFixed(2)}M 24h trading volume`,
        color: liquidityScore >= 20 ? 'green' : liquidityScore >= 10 ? 'yellow' : 'red'
      });
      totalScore += liquidityScore;

      // Market Cap Analysis
      const marketCap = tokenData.market_data.market_cap.usd;
      if (marketCap > 1e6) {
        checks.push({
          id: 'market-cap',
          name: 'Market Capitalization',
          status: marketCap > 10e6 ? 'safe' : 'warning',
          description: `Market cap: $${(marketCap / 1e6).toFixed(2)}M`,
          details: 'Higher market cap generally indicates more stability',
          color: marketCap > 10e6 ? 'green' : 'yellow'
        });
        totalScore += marketCap > 10e6 ? 15 : 5;
      }

      // Price Change Analysis
      const priceChange = tokenData.market_data.price_change_percentage_24h;
      if (Math.abs(priceChange) > 20) {
        checks.push({
          id: 'price-volatility',
          name: 'Price Volatility',
          status: 'warning',
          description: `High price volatility: ${priceChange.toFixed(2)}% in 24h`,
          details: 'Extreme price movements may indicate manipulation',
          color: 'yellow'
        });
        totalScore -= 10;
      }
    }

    // Normalize score
    totalScore = Math.max(0, Math.min(totalScore, maxScore));
    
    // Calculate risk level based on normalized score
    const normalizedScore = (totalScore / maxScore) * 100;
    const riskLevel: SecurityScore['riskLevel'] = 
      normalizedScore >= 70 ? 'low' : 
      normalizedScore >= 40 ? 'medium' : 
      'high';

    return {
      checks,
      score: {
        score: Math.round(normalizedScore),
        maxScore: 100,
        riskLevel
      }
    };
  } catch (error) {
    console.error('Error analyzing token security:', error);
    
    // Return safe fallback data instead of throwing
    return {
      checks: [],
      score: {
        score: 0,
        maxScore: 100,
        riskLevel: 'high'
      }
    };
  }
}