/**
 * storage.js - 本地狀態管理、種子資料與「快速記帳記憶」
 */

import { createTrip, createTransaction, DEFAULT_PAYMENT_ITEMS } from './models.js';

const STORAGE_KEYS = {
  TRIPS: 'ft_trips',
  TRANSACTIONS: 'ft_transactions',
  ACTIVE_TRIP_ID: 'ft_active_trip_id',
  LAST_INPUT_CACHE: 'ft_last_input_cache',
  APP_MODE: 'ft_app_mode', // 'standard' (一般模式) | 'travel' (旅行模式)
  PAYMENT_ITEMS: 'ft_payment_items' // 自訂卡片與支付項目
};

// 示範預載旅程（東京＋關西家庭旅遊）
const INITIAL_DEMO_TRIP = createTrip({
  id: 'trip_japan_2027',
  title: '🇯🇵 東京＋關西 2027 家族之旅',
  startDate: '2027-04-01',
  endDate: '2027-04-07',
  baseCurrency: 'TWD',
  targetCurrency: 'JPY',
  cities: ['東京', '京都', '大阪'],
  totalBudget: 120000,
  categoryBudgets: {
    stay: 40000,
    food: 30000,
    shopping: 25000,
    sightseeing: 15000,
    traffic: 10000
  },
  members: [
    { id: 'm_wilson', name: 'Wilson', role: '我', avatar: '👨‍💼', pikminType: 'red', pikminBadge: '🔴 紅皮克敏', color: '#EF4444' },
    { id: 'm_wife', name: '太太', role: '太太', avatar: '👩‍💼', pikminType: 'pink', pikminBadge: '🌸 羽毛皮克敏', color: '#EC4899' },
    { id: 'm_kid1', name: '大寶', role: '小孩', avatar: '👦', pikminType: 'blue', pikminBadge: '🔵 藍皮克敏', color: '#3B82F6' },
    { id: 'm_kid2', name: '二寶', role: '小孩', avatar: '👧', pikminType: 'yellow', pikminBadge: '🟡 黃皮克敏', color: '#EAB308' }
  ]
});

// 示範預載交易紀錄 (涵蓋換匯、預付、即時消費、信用卡回填)
const INITIAL_DEMO_TRANSACTIONS = [
  // 1. 現金換匯 (NT$50,000 -> ¥235,000)
  createTransaction({
    id: 'tx_demo_ex1',
    tripId: 'trip_japan_2027',
    type: 'exchange',
    datetime: '2027-03-25T14:30',
    notes: '出發前台灣銀行換日圓現金',
    exchangeData: {
      fromCurrency: 'TWD',
      fromAmount: 50000,
      toCurrency: 'JPY',
      toAmount: 235000,
      effectiveRate: 0.2127
    }
  }),
  // 2. 出國前預付：星宇航空全家機票 (NT$48,000)
  createTransaction({
    id: 'tx_demo_pre1',
    tripId: 'trip_japan_2027',
    type: 'expense',
    amount: 48000,
    currency: 'TWD',
    exchangeRate: 1.0,
    category: 'flight',
    paymentMethod: 'credit_card',
    paymentItemId: 'pm_card_cathay_cube',
    paymentItemName: '國泰 CUBE 卡',
    city: '東京',
    datetime: '2027-03-10T10:00',
    notes: '星宇航空桃園-東京來回機票 4 人',
    payerId: 'm_wilson',
    beneficiaryIds: ['all'],
    isPrepaid: true,
    tags: ['機票', '必買']
  }),
  // 3. 東京：一蘭拉麵 (現金 ¥4,800)
  createTransaction({
    id: 'tx_demo_exp1',
    tripId: 'trip_japan_2027',
    type: 'expense',
    amount: 4800,
    currency: 'JPY',
    exchangeRate: 0.2127,
    category: 'food',
    paymentMethod: 'cash',
    paymentItemId: 'pm_cash_target',
    paymentItemName: '外幣現金錢包',
    city: '東京',
    datetime: '2027-04-01T18:45',
    notes: '新宿一蘭拉麵天然豚骨 4 碗',
    payerId: 'm_wilson',
    beneficiaryIds: ['all'],
    isPrepaid: false,
    tags: ['美食', '宵夜']
  }),
  // 4. 東京：迪士尼樂園門票 (信用卡，有實際請款回填)
  createTransaction({
    id: 'tx_demo_exp2',
    tripId: 'trip_japan_2027',
    type: 'expense',
    amount: 32000,
    currency: 'JPY',
    exchangeRate: 0.213,
    category: 'sightseeing',
    paymentMethod: 'credit_card',
    paymentItemId: 'pm_card_fubon_j',
    paymentItemName: '富邦 J 卡',
    city: '東京',
    datetime: '2027-04-02T09:15',
    notes: '迪士尼海洋一日護照',
    payerId: 'm_wife',
    beneficiaryIds: ['all'],
    isPrepaid: false,
    tags: ['迪士尼', '小孩'],
    actualBilledAmount: 6815,
    actualBilledCurrency: 'TWD'
  }),
  // 5. 京都：和服體驗 (Suica 西瓜卡支付 ¥12,000)
  createTransaction({
    id: 'tx_demo_exp3',
    tripId: 'trip_japan_2027',
    type: 'expense',
    amount: 12000,
    currency: 'JPY',
    exchangeRate: 0.2127,
    category: 'sightseeing',
    paymentMethod: 'transit_card',
    paymentItemId: 'pm_transit_suica',
    paymentItemName: 'Suica 西瓜卡 (Apple 錢包)',
    city: '京都',
    datetime: '2027-04-04T10:30',
    notes: '清水寺和服租借拍照',
    payerId: 'm_wife',
    beneficiaryIds: ['m_wife', 'm_kid2'],
    isPrepaid: false,
    tags: ['和服體驗', '小孩']
  }),
  // 6. 大阪：心齋橋藥妝免稅 (玉山熊本熊卡 ¥18,500)
  createTransaction({
    id: 'tx_demo_exp4',
    tripId: 'trip_japan_2027',
    type: 'expense',
    amount: 18500,
    currency: 'JPY',
    exchangeRate: 0.2127,
    category: 'shopping',
    paymentMethod: 'credit_card',
    paymentItemId: 'pm_card_esun_bear',
    paymentItemName: '玉山熊本熊卡',
    city: '大阪',
    datetime: '2027-04-05T20:10',
    notes: '大國藥妝伴手禮與面膜',
    payerId: 'm_wilson',
    beneficiaryIds: ['all'],
    isPrepaid: false,
    tags: ['伴手禮', '必買']
  })
];

export const Storage = {
  // 讀取所有旅程
  getTrips() {
    const raw = localStorage.getItem(STORAGE_KEYS.TRIPS);
    if (!raw) {
      this.saveTrips([INITIAL_DEMO_TRIP]);
      return [INITIAL_DEMO_TRIP];
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [INITIAL_DEMO_TRIP];
    }
  },

  // 儲存所有旅程
  saveTrips(trips) {
    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
  },

  // 取得目前作用中旅程
  getActiveTrip() {
    const trips = this.getTrips();
    const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP_ID);
    if (activeId) {
      const found = trips.find((t) => t.id === activeId);
      if (found) return found;
    }
    return trips[0] || null;
  },

  // 設定作用中旅程
  setActiveTripId(tripId) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP_ID, tripId);
  },

  // 新增旅程帳本
  addTrip(trip) {
    const trips = this.getTrips();
    trips.unshift(trip);
    this.saveTrips(trips);
    this.setActiveTripId(trip.id);
    return trip;
  },

  // 更新旅程帳本
  updateTrip(updatedTrip) {
    const trips = this.getTrips();
    const index = trips.findIndex((t) => t.id === updatedTrip.id);
    if (index >= 0) {
      trips[index] = updatedTrip;
      this.saveTrips(trips);
    }
  },

  // 刪除旅程帳本及其交易
  deleteTrip(tripId) {
    let trips = this.getTrips();
    trips = trips.filter((t) => t.id !== tripId);
    if (trips.length === 0) {
      trips = [INITIAL_DEMO_TRIP];
    }
    this.saveTrips(trips);

    // 刪除關聯交易
    const allTx = this.getTransactions();
    const filteredTx = allTx.filter((t) => t.tripId !== tripId);
    this.saveTransactions(filteredTx);

    // 重設作用中旅程
    this.setActiveTripId(trips[0].id);
    return trips[0];
  },

  // 讀取所有交易
  getTransactions(tripId = null) {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    let list = [];
    if (!raw) {
      list = INITIAL_DEMO_TRANSACTIONS;
      this.saveTransactions(list);
    } else {
      try {
        list = JSON.parse(raw);
      } catch (e) {
        list = INITIAL_DEMO_TRANSACTIONS;
      }
    }
    if (tripId) {
      return list.filter((tx) => tx.tripId === tripId);
    }
    return list;
  },

  // 儲存所有交易
  saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  },

  // 新增或更新單筆交易
  saveTransaction(tx) {
    const all = this.getTransactions();
    const index = all.findIndex((item) => item.id === tx.id);
    if (index >= 0) {
      all[index] = tx;
    } else {
      all.unshift(tx);
    }
    this.saveTransactions(all);
    // 記住最後一次的快速輸入習慣
    this.saveLastInputCache({
      category: tx.category,
      paymentMethod: tx.paymentMethod,
      paymentItemId: tx.paymentItemId,
      currency: tx.currency,
      city: tx.city,
      payerId: tx.payerId
    });
  },

  // 刪除交易
  deleteTransaction(txId) {
    const all = this.getTransactions();
    const filtered = all.filter((item) => item.id !== txId);
    this.saveTransactions(filtered);
  },

  // 🌟 自訂支付方式與卡片管理 (支援多張信用卡、交通卡、行動支付)
  getPaymentItems() {
    const raw = localStorage.getItem(STORAGE_KEYS.PAYMENT_ITEMS);
    if (!raw) {
      this.savePaymentItems(DEFAULT_PAYMENT_ITEMS);
      return DEFAULT_PAYMENT_ITEMS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return DEFAULT_PAYMENT_ITEMS;
    }
  },

  savePaymentItems(items) {
    localStorage.setItem(STORAGE_KEYS.PAYMENT_ITEMS, JSON.stringify(items));
  },

  addPaymentItem(item) {
    const items = this.getPaymentItems();
    const newItem = {
      id: item.id || 'pm_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: item.name,
      category: item.category || 'credit_card',
      icon: item.icon || '💳',
      note: item.note || ''
    };
    items.push(newItem);
    this.savePaymentItems(items);
    return newItem;
  },

  deletePaymentItem(itemId) {
    let items = this.getPaymentItems();
    items = items.filter((i) => i.id !== itemId);
    this.savePaymentItems(items);
    return items;
  },

  // 快速記帳記憶
  getLastInputCache() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.LAST_INPUT_CACHE)) || null;
    } catch (e) {
      return null;
    }
  },

  saveLastInputCache(data) {
    localStorage.setItem(STORAGE_KEYS.LAST_INPUT_CACHE, JSON.stringify(data));
  },

  // 旅行模式開關
  getAppMode() {
    return localStorage.getItem(STORAGE_KEYS.APP_MODE) || 'standard';
  },

  setAppMode(mode) {
    localStorage.setItem(STORAGE_KEYS.APP_MODE, mode);
  }
};
