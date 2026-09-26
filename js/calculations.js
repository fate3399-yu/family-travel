/**
 * calculations.js - 財務運算、換匯錢包餘額、預算進度與旅程結算報告
 */

import { CURRENCIES, CATEGORIES, PAYMENT_METHODS } from './models.js';

/**
 * 換算至基準幣別金額 (預設 TWD)
 */
export function toBaseAmount(tx, baseCurrency = 'TWD') {
  if (tx.type === 'exchange') return 0; // 換匯不是支出

  // 若為信用卡且已回填「實際請款台幣金額」，優先採用
  if (tx.actualBilledAmount && tx.actualBilledCurrency === baseCurrency) {
    return Number(tx.actualBilledAmount);
  }

  if (tx.currency === baseCurrency) {
    return Number(tx.amount);
  }

  // 依紀錄時匯率折算
  const rate = tx.exchangeRate || CURRENCIES[tx.currency]?.defaultRate || 1;
  return Number(tx.amount) * rate;
}

/**
 * 計算旅程核心財務總覽
 */
export function calculateTripSummary(trip, transactions = []) {
  const baseCurrency = trip.baseCurrency || 'TWD';
  const targetCurrency = trip.targetCurrency || 'JPY';

  let totalExpenseTWD = 0;
  let prepaidExpenseTWD = 0;
  let onTripExpenseTWD = 0;

  // 錢包餘額追蹤
  // 現金換匯累計
  let cashExchangedTarget = 0; // 兌換獲得的外幣總額 (例如 ¥230,000)
  let cashExchangedSpentBase = 0; // 換匯用掉的台幣總額 (例如 NT$50,000)
  let cashSpentTarget = 0; // 當地外幣現金花費累計 (例如 ¥188,000)
  let cashSpentBase = 0; // 台幣現金花費累計

  // 支付方式分佈 (折合 TWD)
  const byPaymentMethod = {
    cash: 0,
    credit_card: 0,
    transit_card: 0,
    mobile_pay: 0,
    bank_transfer: 0
  };

  // 分類支出 (折合 TWD)
  const byCategory = {};
  Object.keys(CATEGORIES).forEach((catKey) => {
    byCategory[catKey] = 0;
  });

  // 城市支出 (折合 TWD)
  const byCity = {};
  (trip.cities || []).forEach((c) => {
    byCity[c] = 0;
  });

  // 每日支出
  const byDate = {};

  // 實際付款人支出累計 (誰拿卡/掏錢支付)
  const byPayer = {};
  (trip.members || []).forEach((m) => {
    byPayer[m.id] = 0;
  });

  // 成員支出 (花在誰身上 - 受用人)
  const byBeneficiary = {
    all: 0
  };
  (trip.members || []).forEach((m) => {
    byBeneficiary[m.id] = 0;
  });

  // 標籤支出
  const byTag = {};

  // 多幣別現金餘額追蹤：{ [currency]: { exchanged: 0, spent: 0, remaining: 0 } }
  const cashBalances = {};

  transactions.forEach((tx) => {
    // 1. 處理換匯 / 前期舊鈔自備
    if (tx.type === 'exchange') {
      const ed = tx.exchangeData || {};
      const toCurr = ed.toCurrency || targetCurrency;
      if (!cashBalances[toCurr]) {
        cashBalances[toCurr] = { exchanged: 0, spent: 0, remaining: 0 };
      }
      cashBalances[toCurr].exchanged += Number(ed.toAmount || 0);

      if (toCurr === targetCurrency) {
        cashExchangedTarget += Number(ed.toAmount || 0);
      }
      if (ed.fromCurrency === baseCurrency) {
        cashExchangedSpentBase += Number(ed.fromAmount || 0);
      }
      return;
    }

    // 2. 處理常規支出
    const baseAmt = toBaseAmount(tx, baseCurrency);
    totalExpenseTWD += baseAmt;

    // 預付 vs 當地支出
    if (tx.isPrepaid) {
      prepaidExpenseTWD += baseAmt;
    } else {
      onTripExpenseTWD += baseAmt;
    }

    // 支付方式累計
    const pm = tx.paymentMethod || 'cash';
    if (byPaymentMethod[pm] !== undefined) {
      byPaymentMethod[pm] += baseAmt;
    } else {
      byPaymentMethod[pm] = baseAmt;
    }

    // 現金花費計算 (用以核算錢包剩餘)
    if (pm === 'cash') {
      const spentCurr = tx.currency || targetCurrency;
      if (!cashBalances[spentCurr]) {
        cashBalances[spentCurr] = { exchanged: 0, spent: 0, remaining: 0 };
      }
      cashBalances[spentCurr].spent += Number(tx.amount || 0);

      if (tx.currency === targetCurrency) {
        cashSpentTarget += Number(tx.amount || 0);
      } else if (tx.currency === baseCurrency) {
        cashSpentBase += Number(tx.amount || 0);
      }
    }

    // 分類累計
    const cat = tx.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + baseAmt;

    // 城市累計
    const city = tx.city || '其他';
    byCity[city] = (byCity[city] || 0) + baseAmt;

    // 日期累計 (YYYY-MM-DD)
    const dateStr = (tx.datetime || '').slice(0, 10) || '未分類';
    byDate[dateStr] = (byDate[dateStr] || 0) + baseAmt;

    // 成員受用人累計
    const beneficiaries = tx.beneficiaryIds || ['all'];
    if (beneficiaries.includes('all')) {
      byBeneficiary['all'] = (byBeneficiary['all'] || 0) + baseAmt;
    } else {
      const perPerson = baseAmt / beneficiaries.length;
      beneficiaries.forEach((mId) => {
        byBeneficiary[mId] = (byBeneficiary[mId] || 0) + perPerson;
      });
    }

    // 實際付款人累計 (Payer)
    const payer = tx.payerId || (trip.members?.[0]?.id || 'm_me');
    byPayer[payer] = (byPayer[payer] || 0) + baseAmt;

    // 標籤累計
    (tx.tags || []).forEach((t) => {
      byTag[t] = (byTag[t] || 0) + baseAmt;
    });
  });

  // 計算現金錢包餘額
  const targetCashRemaining = cashExchangedTarget - cashSpentTarget;

  // 結算所有幣別餘額
  Object.keys(cashBalances).forEach((curr) => {
    cashBalances[curr].remaining = cashBalances[curr].exchanged - cashBalances[curr].spent;
  });

  // 預算分析
  const totalBudget = Number(trip.totalBudget) || 0;
  const budgetRemaining = totalBudget - totalExpenseTWD;
  const budgetUsagePercent = totalBudget > 0 ? Math.round((totalExpenseTWD / totalBudget) * 100) : 0;

  // 分類預算對比
  const categoryBudgets = trip.categoryBudgets || {};
  const categoryBudgetStatus = {};
  Object.keys(categoryBudgets).forEach((catKey) => {
    const budget = Number(categoryBudgets[catKey]) || 0;
    const spent = byCategory[catKey] || 0;
    categoryBudgetStatus[catKey] = {
      budget,
      spent,
      remaining: budget - spent,
      isOver: spent > budget,
      percent: budget > 0 ? Math.round((spent / budget) * 100) : 0
    };
  });

  // 今日支出計算 (當地貨幣 + 折合台幣)
  const todayStr = new Date().toISOString().slice(0, 10);
  let todaySpentTarget = 0;
  let todaySpentBase = 0;
  transactions.forEach((tx) => {
    if (tx.type === 'expense' && (tx.datetime || '').slice(0, 10) === todayStr) {
      if (tx.currency === targetCurrency) {
        todaySpentTarget += Number(tx.amount || 0);
      }
      todaySpentBase += toBaseAmount(tx, baseCurrency);
    }
  });

  return {
    baseCurrency,
    targetCurrency,
    totalExpenseTWD: Math.round(totalExpenseTWD),
    prepaidExpenseTWD: Math.round(prepaidExpenseTWD),
    onTripExpenseTWD: Math.round(onTripExpenseTWD),
    totalBudget,
    budgetRemaining: Math.round(budgetRemaining),
    budgetUsagePercent,
    // 現金錢包
    cashExchangedTarget,
    cashSpentTarget,
    targetCashRemaining,
    cashExchangedSpentBase,
    cashBalances,
    // 今日
    todaySpentTarget,
    todaySpentBase: Math.round(todaySpentBase),
    // 分佈
    byPaymentMethod,
    byCategory,
    byCity,
    byDate,
    byPayer,
    byBeneficiary,
    byTag,
    categoryBudgetStatus
  };
}

/**
 * 產生終局「旅程結算完整報告」
 */
export function generateFinalTripReport(trip, transactions = []) {
  const summary = calculateTripSummary(trip, transactions);

  // 計算旅行天數
  let days = 1;
  if (trip.startDate && trip.endDate) {
    const d1 = new Date(trip.startDate);
    const d2 = new Date(trip.endDate);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    days = diff > 0 ? diff : 1;
  }

  const dailyAverage = Math.round(summary.totalExpenseTWD / days);

  return {
    generatedAt: new Date().toISOString(),
    tripTitle: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate,
    days,
    baseCurrency: summary.baseCurrency,
    targetCurrency: summary.targetCurrency,
    totalExpenseTWD: summary.totalExpenseTWD,
    dailyAverage,
    prepaidExpenseTWD: summary.prepaidExpenseTWD,
    onTripExpenseTWD: summary.onTripExpenseTWD,
    budgetUsagePercent: summary.budgetUsagePercent,
    targetCashRemaining: summary.targetCashRemaining,
    cashExchangedTarget: summary.cashExchangedTarget,
    byPaymentMethod: summary.byPaymentMethod,
    byCategory: summary.byCategory,
    byCity: summary.byCity,
    byBeneficiary: summary.byBeneficiary
  };
}
