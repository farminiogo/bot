import axios from 'axios';
import * as tf from '@tensorflow/tfjs';
import { ethers } from 'ethers';
import { getTokenData } from './coingecko';
import { getContractInfo } from './etherscan';

// قائمة المواقع المشبوهة التي يتم تحديثها بانتظام
const BLACKLISTED_SITES = [
  'scam-token.io', 'fake-airdrop.com', 'phishing-wallet.com'
];

// تصنيف المخاطر المحتملة
type ScamRiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface ScamDetectionResult {
  riskLevel: ScamRiskLevel;
  reasons: string[];
  confidence: number;
  contractInfo?: any;
}

// **🔹 تحميل أو تدريب نموذج الذكاء الاصطناعي**
let scamModel: tf.LayersModel | null = null;

async function loadScamDetectionModel(): Promise<void> {
  try {
    scamModel = await tf.loadLayersModel('https://your-model-url/model.json');
    console.log('✅ تم تحميل نموذج الكشف عن الاحتيال بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تحميل نموذج الذكاء الاصطناعي:', error);
  }
}

// **🔹 تحليل بيانات العقد الذكي**
async function analyzeSmartContract(address: string): Promise<ScamDetectionResult> {
  try {
    const contractInfo = await getContractInfo(address);
    if (!contractInfo) {
      return { riskLevel: 'high', reasons: ['❗ لم يتم العثور على معلومات العقد'], confidence: 0.8 };
    }

    const { isVerified, creatorAddress, txCount, isProxy, hasSuspiciousActivity } = contractInfo;

    let riskScore = 0;
    let reasons: string[] = [];

    if (!isVerified) {
      riskScore += 3;
      reasons.push('❗ العقد غير موثق.');
    }
    if (isProxy) {
      riskScore += 2;
      reasons.push('⚠️ العقد يحتوي على بروكسي قد يغير السلوك.');
    }
    if (hasSuspiciousActivity) {
      riskScore += 3;
      reasons.push('🚨 تم اكتشاف نشاط مريب على العقد.');
    }
    if (txCount < 10) {
      riskScore += 2;
      reasons.push('⚠️ عدد المعاملات قليل جداً.');
    }

    const riskLevel: ScamRiskLevel =
      riskScore >= 6 ? 'critical' :
      riskScore >= 4 ? 'high' :
      riskScore >= 2 ? 'medium' :
      'low';

    return {
      riskLevel,
      reasons,
      confidence: Math.min(1, riskScore / 6),
      contractInfo
    };
  } catch (error) {
    console.error('❌ خطأ في تحليل العقد الذكي:', error);
    return { riskLevel: 'high', reasons: ['❗ فشل تحليل العقد'], confidence: 0.7 };
  }
}

// **🔹 تحليل التوكن عبر CoinGecko**
async function analyzeToken(tokenSymbol: string): Promise<ScamDetectionResult> {
  try {
    const tokenData = await getTokenData(tokenSymbol);
    if (!tokenData) {
      return { riskLevel: 'high', reasons: ['❗ لم يتم العثور على بيانات التوكن'], confidence: 0.8 };
    }

    const { marketCap, liquidity, communityScore } = tokenData;
    let riskScore = 0;
    let reasons: string[] = [];

    if (marketCap < 100000) {
      riskScore += 3;
      reasons.push('⚠️ القيمة السوقية منخفضة.');
    }
    if (liquidity < 50000) {
      riskScore += 2;
      reasons.push('⚠️ السيولة ضعيفة.');
    }
    if (communityScore < 2) {
      riskScore += 2;
      reasons.push('❗ دعم المجتمع للتوكن منخفض.');
    }

    const riskLevel: ScamRiskLevel =
      riskScore >= 5 ? 'critical' :
      riskScore >= 3 ? 'high' :
      riskScore >= 1 ? 'medium' :
      'low';

    return {
      riskLevel,
      reasons,
      confidence: Math.min(1, riskScore / 5)
    };
  } catch (error) {
    console.error('❌ خطأ في تحليل التوكن:', error);
    return { riskLevel: 'high', reasons: ['❗ فشل تحليل التوكن'], confidence: 0.7 };
  }
}

// **🔹 فحص روابط المواقع المشبوهة**
function checkBlacklistedDomains(url: string): ScamDetectionResult {
  const isBlacklisted = BLACKLISTED_SITES.some(domain => url.includes(domain));

  if (isBlacklisted) {
    return {
      riskLevel: 'critical',
      reasons: ['🚨 الموقع مدرج ضمن القائمة السوداء.'],
      confidence: 1.0
    };
  }

  return {
    riskLevel: 'low',
    reasons: ['✅ الموقع يبدو آمناً.'],
    confidence: 0.9
  };
}

// **🔹 تحليل الأنماط المالية المشبوهة**
async function analyzeFinancialPatterns(data: number[]): Promise<ScamDetectionResult> {
  if (!scamModel) {
    return { riskLevel: 'medium', reasons: ['⚠️ لم يتم تحميل نموذج الذكاء الاصطناعي.'], confidence: 0.5 };
  }

  const inputTensor = tf.tensor2d([data], [1, data.length]);
  const prediction = scamModel.predict(inputTensor) as tf.Tensor;
  const riskScore = (await prediction.data())[0];

  inputTensor.dispose();

  const riskLevel: ScamRiskLevel =
    riskScore > 0.75 ? 'critical' :
    riskScore > 0.5 ? 'high' :
    riskScore > 0.3 ? 'medium' :
    'low';

  return {
    riskLevel,
    reasons: [`🔍 التحليل يشير إلى ${riskLevel} مستوى مخاطر.`],
    confidence: riskScore
  };
}

// **🔹 دالة رئيسية للتحقق من عملية الاحتيال**
async function detectScam({
  address,
  tokenSymbol,
  websiteURL,
  financialData
}: {
  address?: string;
  tokenSymbol?: string;
  websiteURL?: string;
  financialData?: number[];
}): Promise<ScamDetectionResult> {
  const results: ScamDetectionResult[] = [];

  if (address) {
    results.push(await analyzeSmartContract(address));
  }
  if (tokenSymbol) {
    results.push(await analyzeToken(tokenSymbol));
  }
  if (websiteURL) {
    results.push(checkBlacklistedDomains(websiteURL));
  }
  if (financialData) {
    results.push(await analyzeFinancialPatterns(financialData));
  }

  // دمج النتائج لتحديد النتيجة النهائية
  let finalRiskScore = results.reduce((sum, res) => sum + (res.confidence || 0), 0) / results.length;
  let highestRisk = results.reduce((max, res) => (res.riskLevel === 'critical' ? 'critical' : max), 'low');

  return {
    riskLevel: highestRisk as ScamRiskLevel,
    reasons: results.flatMap(res => res.reasons),
    confidence: finalRiskScore
  };
}

export { detectScam, loadScamDetectionModel };
