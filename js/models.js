/**
 * models.js - 家庭旅遊財務紀錄核心模型與常數
 * 專為夫妻/家庭 5~10 年出國旅行打造，支援多城市、換匯錢包、時間軸、預算與照片儲存
 */

// 支援貨幣
export const CURRENCIES = {
  TWD: { code: 'TWD', symbol: 'NT$', name: '新台幣', defaultRate: 1.0, flag: '🇹🇼' },
  JPY: { code: 'JPY', symbol: '¥', name: '日圓', defaultRate: 0.21, flag: '🇯🇵' },
  USD: { code: 'USD', symbol: '$', name: '美元', defaultRate: 32.0, flag: '🇺🇸' },
  EUR: { code: 'EUR', symbol: '€', name: '歐元', defaultRate: 35.0, flag: '🇪🇺' },
  KRW: { code: 'KRW', symbol: '₩', name: '韓元', defaultRate: 0.024, flag: '🇰🇷' },
  THB: { code: 'THB', symbol: '฿', name: '泰銖', defaultRate: 0.95, flag: '🇹🇭' },
  HKD: { code: 'HKD', symbol: 'HK$', name: '港幣', defaultRate: 4.1, flag: '🇭🇰' },
  GBP: { code: 'GBP', symbol: '£', name: '英鎊', defaultRate: 41.5, flag: '🇬🇧' }
};

// 支出分類（適合家庭與旅遊情境）
export const CATEGORIES = {
  food: { id: 'food', label: '餐飲美食', icon: '🍜', color: '#FF6B6B' },
  stay: { id: 'stay', label: '住宿飯店', icon: '🏨', color: '#845EC2' },
  traffic: { id: 'traffic', label: '當地交通', icon: '🚇', color: '#4D8076' },
  flight: { id: 'flight', label: '機票交通', icon: '✈️', color: '#2C73D2' },
  shopping: { id: 'shopping', label: '購物採買', icon: '🛍️', color: '#FF9671' },
  sightseeing: { id: 'sightseeing', label: '門票娛樂', icon: '🎡', color: '#FFC75F' },
  cafe: { id: 'cafe', label: '咖啡甜點', icon: '☕', color: '#D65DB1' },
  network: { id: 'network', label: '網路保險', icon: '📱', color: '#008F7A' },
  kids: { id: 'kids', label: '親子育兒', icon: '👶', color: '#F9F871' },
  other: { id: 'other', label: '其他雜項', icon: '💰', color: '#9E9E9E' }
};

// 支付方式大類
export const PAYMENT_CATEGORIES = {
  credit_card: { id: 'credit_card', label: '信用卡', icon: '💳' },
  transit_card: { id: 'transit_card', label: '交通卡', icon: '🐧' },
  mobile_pay: { id: 'mobile_pay', label: '行動支付', icon: '📲' },
  cash: { id: 'cash', label: '現金', icon: '💵' },
  bank_transfer: { id: 'bank_transfer', label: '轉帳 / 行前付清', icon: '🏦' }
};

// 預設可選具體支付卡片與工具清單 (使用者可隨時新增自訂項目)
export const DEFAULT_PAYMENT_ITEMS = [
  // 信用卡類
  { id: 'pm_card_fubon_j', name: '富邦 J 卡', category: 'credit_card', icon: '💳', note: '日韓實體 3% 回饋' },
  { id: 'pm_card_esun_bear', name: '玉山熊本熊卡', category: 'credit_card', icon: '🐻', note: '日圓雙幣免 1.5% 手續費' },
  { id: 'pm_card_cathay_cube', name: '國泰 CUBE 卡', category: 'credit_card', icon: '💳', note: '日本賞 / 海外消費 3.3%' },
  { id: 'pm_card_federal_crane', name: '聯邦吉鶴卡', category: 'credit_card', icon: '💳', note: '日本 QUICPay 優惠' },
  { id: 'pm_card_general', name: '一般信用卡', category: 'credit_card', icon: '💳', note: '通用卡片' },
  // 交通卡類
  { id: 'pm_transit_suica', name: 'Suica (西瓜卡)', category: 'transit_card', icon: '🐧', note: '地鐵、超商快速感應' },
  { id: 'pm_transit_icoca', name: 'ICOCA 交通卡', category: 'transit_card', icon: '🦆', note: '關西地鐵與巴士' },
  { id: 'pm_transit_general', name: '實體交通卡', category: 'transit_card', icon: '🎫', note: '實體票卡' },
  // 行動支付類
  { id: 'pm_mobile_applepay', name: 'Apple Pay', category: 'mobile_pay', icon: '🍎', note: '手機感應綁定卡' },
  { id: 'pm_mobile_paypay', name: 'PayPay (街口/全支付)', category: 'mobile_pay', icon: '📱', note: '日本 PayPay 掃碼' },
  { id: 'pm_mobile_linepay', name: 'LINE Pay', category: 'mobile_pay', icon: '🟢', note: '掃碼行動支付' },
  // 現金與轉帳
  { id: 'pm_cash_target', name: '外幣現金錢包', category: 'cash', icon: '💴', note: '當地現金支付' },
  { id: 'pm_cash_twd', name: '台幣現金', category: 'cash', icon: '💵', note: '出發前/在台花費' },
  { id: 'pm_bank_transfer', name: '網銀轉帳', category: 'bank_transfer', icon: '🏦', note: '機票住宿行前轉帳' }
];

// 相容舊版常數
export const PAYMENT_METHODS = PAYMENT_CATEGORIES;

// 預設常用標籤
export const DEFAULT_TAGS = [
  '小孩', '迪士尼', '伴手禮', '必買', '和服體驗', '機場', '宵夜', '免稅店'
];

// 皮克敏夥伴種類設定 (Pikmin Companions)
export const PIKMIN_TYPES = {
  red: { id: 'red', name: '紅皮克敏', badge: '🔴', roleTitle: '勇敢先鋒', color: '#EF4444', flower: '🌼', desc: '不怕火、勇敢走第一' },
  pink: { id: 'pink', name: '羽毛皮克敏', badge: '🌸', roleTitle: '可愛飛翔', color: '#EC4899', flower: '🌸', desc: '粉紅小翅膀、輕巧靈活' },
  blue: { id: 'blue', name: '藍皮克敏', badge: '🔵', roleTitle: '冷靜探險', color: '#3B82F6', flower: '🌱', desc: '水中悠游、心思細膩' },
  yellow: { id: 'yellow', name: '黃皮克敏', badge: '🟡', roleTitle: '活力開心果', color: '#EAB308', flower: '🌻', desc: '大耳朵飛得高、耐電能' },
  purple: { id: 'purple', name: '紫皮克敏', badge: '🟣', roleTitle: '大力神士', color: '#8B5CF6', flower: '🌺', desc: '力量十倍、搬行李最強' },
  rock: { id: 'rock', name: '岩石皮克敏', badge: '🪨', roleTitle: '堅韌守護', color: '#64748B', flower: '🌿', desc: '硬邦邦、破除一切困難' }
};

/**
 * 取得本機安全時區日期 (避免 UTC toISOString 造成台灣時區跳日前一天)
 */
export function getLocalIsoDate(d = new Date()) {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
}

export function getLocalIsoDatetime(d = new Date()) {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

/**
 * 建立新旅程物件範本
 */
export function createTrip({
  id = 'trip_' + Date.now(),
  familyId = null,
  title = '🇯🇵 東京＋關西 2027',
  coverPhoto = '',
  startDate = getLocalIsoDate(),
  endDate = getLocalIsoDate(new Date(Date.now() + 86400000 * 6)),
  baseCurrency = 'TWD',
  targetCurrency = 'JPY',
  cities = ['東京', '京都', '大阪'],
  totalBudget = 100000,
  categoryBudgets = {
    stay: 35000,
    food: 25000,
    shopping: 20000,
    sightseeing: 12000,
    traffic: 8000
  },
  members = [
    { id: 'm_me', name: 'Wilson', role: '我', avatar: '👨‍💼', pikminType: 'red', pikminBadge: '🔴 紅皮克敏', color: '#EF4444' },
    { id: 'm_wife', name: '太太', role: '太太', avatar: '👩‍💼', pikminType: 'pink', pikminBadge: '🌸 羽毛皮克敏', color: '#EC4899' },
    { id: 'm_kid1', name: '大寶', role: '小孩', avatar: '👦', pikminType: 'blue', pikminBadge: '🔵 藍皮克敏', color: '#3B82F6' },
    { id: 'm_kid2', name: '二寶', role: '小孩', avatar: '👧', pikminType: 'yellow', pikminBadge: '🟡 黃皮克敏', color: '#EAB308' }
  ],
  wallets = [
    { id: 'w_cash_target', name: '外幣現金錢包', currency: 'JPY', type: 'cash', balance: 0 },
    { id: 'w_cash_twd', name: '台幣現金錢包', currency: 'TWD', type: 'cash', balance: 0 }
  ]
} = {}) {
  return {
    id,
    familyId,
    title,
    coverPhoto,
    startDate,
    endDate,
    baseCurrency,
    targetCurrency,
    cities,
    totalBudget: Number(totalBudget),
    categoryBudgets,
    members,
    wallets,
    createdAt: Date.now(),
    isArchived: false,
    reportData: null // 旅程結束時鎖定的結算報表
  };
}

/**
 * 建立支出/換匯交易物件範本
 */
export function createTransaction({
  id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
  tripId,
  familyId = null,
  type = 'expense', // 'expense' (支出) | 'exchange' (換匯)
  amount = 0,
  currency = 'JPY',
  exchangeRate = 0.21, // 換算成 baseCurrency 的匯率 (永久固化)
  category = 'food',
  paymentMethod = 'cash',
  paymentItemId = null,
  paymentItemName = '',
  walletId = 'w_cash_jpy',
  city = '東京',
  cityId = null,
  datetime = getLocalIsoDatetime(),
  notes = '',
  payerId = 'm_me',
  beneficiaryIds = ['all'], // 'all' 或指定 member ids (花費對象，與付款人完全解耦)
  isPrepaid = false, // 是否為出國前預付支出（機票/飯店/預約門票等）
  paymentDate = null,
  expenseDate = null,
  tags = [],
  photoId = null, // 對應 IndexedDB 儲存的相片 ID
  photoThumbnail = null, // 微縮圖 (可快速渲染)
  // 信用卡實際請款回填（選填）
  actualBilledAmount = null,
  actualBilledCurrency = 'TWD',
  // 換匯專用欄位 (type === 'exchange')
  exchangeData = {
    fromCurrency: 'TWD',
    fromAmount: 0,
    toCurrency: 'JPY',
    toAmount: 0,
    effectiveRate: 0.21
  }
} = {}) {
  const numericAmount = Number(amount) || 0;
  const numericRate = Number(exchangeRate) || 1;
  const dateStr = datetime ? datetime.slice(0, 10) : getLocalIsoDate();
  const timeStr = datetime && datetime.length >= 16 ? datetime.slice(11, 16) : '12:00';

  // 固化計算當筆基準幣別折算金額
  let baseAmount = Math.round(numericAmount * numericRate);
  if (actualBilledAmount) {
    baseAmount = Math.round(Number(actualBilledAmount));
  }

  return {
    id,
    clientGeneratedId: id,
    tripId,
    familyId,
    type,
    amount: numericAmount,
    currency,
    exchangeRate: numericRate,
    baseAmount,
    category,
    paymentMethod,
    paymentItemId,
    paymentItemName,
    walletId,
    city,
    cityId: cityId || city,
    datetime,
    date: dateStr,
    time: timeStr,
    notes,
    payerId,
    beneficiaryIds: Array.isArray(beneficiaryIds) && beneficiaryIds.length > 0 ? beneficiaryIds : ['all'],
    isPrepaid: Boolean(isPrepaid),
    paymentDate: paymentDate || dateStr,
    expenseDate: expenseDate || dateStr,
    tags,
    photoId,
    photoThumbnail,
    actualBilledAmount: actualBilledAmount ? Number(actualBilledAmount) : null,
    actualBilledCurrency,
    exchangeData,
    createdAt: Date.now()
  };
}
