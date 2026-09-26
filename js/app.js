/**
 * app.js - Pikmin Travel 家庭探險記帳本 主程式
 * 支援多帳本管理、自訂信用卡/交通卡/行動支付工具、即時折合台幣轉換、皮克敏夥伴配置與結算報告
 */

import { CURRENCIES, CATEGORIES, PAYMENT_CATEGORIES, DEFAULT_PAYMENT_ITEMS, DEFAULT_TAGS, PIKMIN_TYPES, createTrip, createTransaction } from './models.js';
import { Storage } from './storage.js';
import { calculateTripSummary, generateFinalTripReport, toBaseAmount } from './calculations.js';
import { savePhoto, getPhoto } from './db.js';
import { generateQRCodeSVG } from './qrcode.js';
import { initAuth, loginWithGoogle, logoutUser, getCurrentUser } from './auth.js';
import {
  getUserFamilies,
  createFamily,
  addProfileMember,
  createInvitation,
  fetchInvitation,
  acceptInvitation,
  listenToFamilyMembers,
  getCurrentFamily,
  setCurrentFamily,
  getCurrentFamilyMembers
} from './family.js';
import {
  saveCloudTransaction,
  deleteCloudTransaction,
  listenToTripTransactions,
  listenToFamilyTrips,
  saveCloudTrip,
  deleteCloudTrip,
  getPendingOfflineCount,
  flushOfflineQueue
} from './cloud-storage.js';
import { checkHasLocalDataToMigrate, migrateLocalDataToCloud } from './migration.js';

// 全域狀態
let currentTrip = null;
let currentTransactions = [];
let activeTab = 'timeline';
let selectedFilterCity = 'all';
let selectedFilterCategory = 'all';
let timelineSearchKeyword = '';
let currentPhotoAttachment = null; // { file, base64 }
let currentChartTab = 'pie'; // 'pie' | 'bar' | 'member'
let currentPaymentCategoryFilter = 'all'; // 'all' | 'credit_card' | 'transit_card' | 'mobile_pay' | 'cash' | 'bank_transfer'

// DOM 元素快取
const el = {
  // 頂部導覽 (皮克敏出遊分帳風格)
  currentTripBadge: document.getElementById('currentTripBadge'),
  btnInstallPwa: document.getElementById('btnInstallPwa'),
  btnInviteMembers: document.getElementById('btnInviteMembers'),
  btnSwitchTrip: document.getElementById('btnSwitchTrip'),

  // 旅程總覽資訊卡
  travelHeroDest: document.getElementById('travelHeroDest'),
  heroTripStatus: document.getElementById('heroTripStatus'),
  heroTripDates: document.getElementById('heroTripDates'),
  editCurrentTripBtn: document.getElementById('editCurrentTripBtn'),
  finishTripBtn: document.getElementById('finishTripBtn'),
  pikminSquadMembers: document.getElementById('pikminSquadMembers'),
  travelHeroTodayAmount: document.getElementById('travelHeroTodayAmount'),
  travelHeroTodayBaseConverted: document.getElementById('travelHeroTodayBaseConverted'),
  travelHeroTotalBase: document.getElementById('travelHeroTotalBase'),
  travelHeroBudgetRemain: document.getElementById('travelHeroBudgetRemain'),
  travelHeroCashRemain: document.getElementById('travelHeroCashRemain'),
  statPrepaidSub: document.getElementById('statPrepaidSub'),
  statBudgetPercent: document.getElementById('statBudgetPercent'),

  // 預算進度花朵
  budgetPercentLabel: document.getElementById('budgetPercentLabel'),
  budgetRemainingLabel: document.getElementById('budgetRemainingLabel'),
  budgetTotalLabel: document.getElementById('budgetTotalLabel'),
  budgetProgressFill: document.getElementById('budgetProgressFill'),
  pikminGrowthStageIcon: document.getElementById('pikminGrowthStageIcon'),
  pikminTrackFlower: document.getElementById('pikminTrackFlower'),

  // 底部導航與頁籤
  bottomNavItems: document.querySelectorAll('.bottom-nav-item'),
  tabTimeline: document.getElementById('tabTimeline'),
  tabAnalytics: document.getElementById('tabAnalytics'),
  tabWallets: document.getElementById('tabWallets'),
  tabSettings: document.getElementById('tabSettings'),

  timelineContainer: document.getElementById('timelineContainer'),
  timelineSearchInput: document.getElementById('timelineSearchInput'),
  btnClearTimelineSearch: document.getElementById('btnClearTimelineSearch'),
  timelineCategoryChips: document.getElementById('timelineCategoryChips'),
  timelineCityChips: document.getElementById('timelineCityChips'),
  timelineFilterBar: document.getElementById('timelineFilterBar') || document.getElementById('timelineCityChips'),
  exchangeListContainer: document.getElementById('exchangeListContainer'),
  categoryBudgetsContainer: document.getElementById('categoryBudgetsContainer'),
  paymentMethodsContainer: document.getElementById('paymentMethodsContainer'),
  cityExpensesContainer: document.getElementById('cityExpensesContainer'),

  // 統計與圖表分析 (移植 money 專案頂級視覺)
  btnTabPie: document.getElementById('btn-tab-pie'),
  btnTabBar: document.getElementById('btn-tab-bar'),
  btnTabMember: document.getElementById('btn-tab-member'),
  btnTabPayer: document.getElementById('btn-tab-payer') || document.getElementById('btn-tab-member'),
  btnTabBeneficiary: document.getElementById('btn-tab-beneficiary'),
  chartTotalBadge: document.getElementById('chart-total-badge'),
  chartContainerPie: document.getElementById('chart-container-pie'),
  chartContainerBar: document.getElementById('chart-container-bar'),
  chartContainerMember: document.getElementById('chart-container-member'),
  chartContainerPayer: document.getElementById('chart-container-payer') || document.getElementById('chart-container-member'),
  chartContainerBeneficiary: document.getElementById('chart-container-beneficiary'),
  pieChartSvg: document.getElementById('pie-chart-svg'),
  pieCenterAmount: document.getElementById('pie-center-amount'),
  chartLegendGrid: document.getElementById('chart-legend-grid'),

  // 統計與設定分頁按鈕
  reportTabFinishBtn: document.getElementById('reportTabFinishBtn'),
  settingsAddPaymentBtn: document.getElementById('settingsAddPaymentBtn'),
  settingsAddTripBtn: document.getElementById('settingsAddTripBtn'),
  settingsEditTripBtn: document.getElementById('settingsEditTripBtn'),
  settingsPaymentList: document.getElementById('settingsPaymentList'),
  paymentFilterChips: document.getElementById('paymentFilterChips'),
  settingsTripTitle: document.getElementById('settingsTripTitle'),
  settingsTripDates: document.getElementById('settingsTripDates'),
  settingsSquadList: document.getElementById('settingsSquadList'),

  // 浮動與操作按鈕
  fabAddExpenseBtn: document.getElementById('fabAddExpenseBtn'),
  openExchangeModalBtn: document.getElementById('openExchangeModalBtn'),
  openSurplusModalBtn: document.getElementById('openSurplusModalBtn'),
  walletsHeroCashRemain: document.getElementById('walletsHeroCashRemain'),

  // 支出 Modal
  expenseModal: document.getElementById('expenseModal'),
  closeExpenseModalBtn: document.getElementById('closeExpenseModalBtn'),
  expenseForm: document.getElementById('expenseForm'),
  expenseModalTitle: document.getElementById('expenseModalTitle'),
  editExpenseId: document.getElementById('editExpenseId'),
  btnModeOnTrip: document.getElementById('btnModeOnTrip'),
  btnModePrepaid: document.getElementById('btnModePrepaid'),
  expenseAmount: document.getElementById('expenseAmount'),
  expenseCurrency: document.getElementById('expenseCurrency'),

  // 🌟 即時換算台幣提示卡
  liveConversionBox: document.getElementById('liveConversionBox'),
  liveConvertedAmount: document.getElementById('liveConvertedAmount'),
  liveRateLabel: document.getElementById('liveRateLabel'),
  btnToggleCustomRate: document.getElementById('btnToggleCustomRate'),
  customRateRow: document.getElementById('customRateRow'),
  expenseCustomRate: document.getElementById('expenseCustomRate'),
  btnResetRate: document.getElementById('btnResetRate'),

  expenseCategory: document.getElementById('expenseCategory'),
  expenseCity: document.getElementById('expenseCity'),
  expensePaymentMethod: document.getElementById('expensePaymentMethod'),
  openAddPaymentItemBtn: document.getElementById('openAddPaymentItemBtn'),
  expensePayer: document.getElementById('expensePayer'),
  expenseDatetime: document.getElementById('expenseDatetime'),
  expenseNotes: document.getElementById('expenseNotes'),
  tagChipsSelector: document.getElementById('tagChipsSelector'),
  tagSearchInput: document.getElementById('tagSearchInput'),
  btnAddCustomTagBtn: document.getElementById('btnAddCustomTagBtn'),
  actualBilledAmount: document.getElementById('actualBilledAmount'),
  deleteExpenseBtn: document.getElementById('deleteExpenseBtn'),

  // 照片上傳
  photoUploaderBox: document.getElementById('photoUploaderBox'),
  expensePhotoInput: document.getElementById('expensePhotoInput'),
  photoPlaceholder: document.getElementById('photoPlaceholder'),
  photoPreviewContainer: document.getElementById('photoPreviewContainer'),
  photoPreviewImg: document.getElementById('photoPreviewImg'),
  removePhotoBtn: document.getElementById('removePhotoBtn'),

  // 旅程 Modal
  tripModal: document.getElementById('tripModal'),
  closeTripModalBtn: document.getElementById('closeTripModalBtn'),
  tripForm: document.getElementById('tripForm'),
  tripModalTitle: document.getElementById('tripModalTitle'),
  editTripId: document.getElementById('editTripId'),
  tripTitleInput: document.getElementById('tripTitleInput'),
  tripTargetCurrencyInput: document.getElementById('tripTargetCurrencyInput'),
  tripBaseCurrencyInput: document.getElementById('tripBaseCurrencyInput'),
  tripStartDateInput: document.getElementById('tripStartDateInput'),
  tripEndDateInput: document.getElementById('tripEndDateInput'),
  tripCitiesInput: document.getElementById('tripCitiesInput'),
  tripBudgetInput: document.getElementById('tripBudgetInput'),
  tripMembersEditorContainer: document.getElementById('tripMembersEditorContainer'),
  addMemberRowBtn: document.getElementById('addMemberRowBtn'),
  deleteTripBtn: document.getElementById('deleteTripBtn'),

  // 🌟 自訂支付方式 / 卡片 Modal
  paymentItemModal: document.getElementById('paymentItemModal'),
  closePaymentItemModalBtn: document.getElementById('closePaymentItemModalBtn'),
  paymentItemForm: document.getElementById('paymentItemForm'),
  newPaymentName: document.getElementById('newPaymentName'),
  newPaymentCategory: document.getElementById('newPaymentCategory'),
  newPaymentNote: document.getElementById('newPaymentNote'),

  // 換匯與舊鈔登記 Modal
  exchangeModal: document.getElementById('exchangeModal'),
  closeExchangeModalBtn: document.getElementById('closeExchangeModalBtn'),
  exchangeModalTitle: document.getElementById('exchangeModalTitle'),
  btnExModeExchange: document.getElementById('btnExModeExchange'),
  btnExModeSurplus: document.getElementById('btnExModeSurplus'),
  exIsSurplus: document.getElementById('exIsSurplus'),
  exInfoText: document.getElementById('exInfoText'),
  exFromGroup: document.getElementById('exFromGroup'),
  labelExFromAmount: document.getElementById('labelExFromAmount'),
  labelExToAmount: document.getElementById('labelExToAmount'),
  btnSubmitExchange: document.getElementById('btnSubmitExchange'),
  exchangeForm: document.getElementById('exchangeForm'),
  exFromAmount: document.getElementById('exFromAmount'),
  exToCurrency: document.getElementById('exToCurrency'),
  exToAmount: document.getElementById('exToAmount'),
  exDatetime: document.getElementById('exDatetime'),
  exNotes: document.getElementById('exNotes'),

  // 結算與 Lightbox Modal
  reportModal: document.getElementById('reportModal'),
  closeReportModalBtn: document.getElementById('closeReportModalBtn'),
  reportReportContent: document.getElementById('reportReportContent'),
  photoLightboxModal: document.getElementById('photoLightboxModal'),
  closeLightboxBtn: document.getElementById('closeLightboxBtn'),
  lightboxImg: document.getElementById('lightboxImg'),
  lightboxCaption: document.getElementById('lightboxCaption'),

  // 🗺️ 冒險帳本管理中心 Modal
  tripManagerModal: document.getElementById('tripManagerModal'),
  closeTripManagerModalBtn: document.getElementById('closeTripManagerModalBtn'),
  tripManagerList: document.getElementById('tripManagerList'),
  tripManagerCreateBtn: document.getElementById('tripManagerCreateBtn'),

  // 🔗 旅伴名單與邀請管理 Modal
  inviteModal: document.getElementById('inviteModal'),
  closeInviteModalBtn: document.getElementById('closeInviteModalBtn'),
  closeInviteDoneBtn: document.getElementById('closeInviteDoneBtn'),
  inviteTripPrompt: document.getElementById('inviteTripPrompt'),
  inviteLinkInput: document.getElementById('inviteLinkInput'),
  btnCopyInviteLink: document.getElementById('btnCopyInviteLink'),
  inviteQrSvgWrapper: document.getElementById('inviteQrSvgWrapper'),
  inviteMemberList: document.getElementById('inviteMemberList'),

  // 🏡 家庭管理相關元素
  familyNotCreatedBox: document.getElementById('familyNotCreatedBox'),
  familyCreatedBox: document.getElementById('familyCreatedBox'),
  newFamilyNameInput: document.getElementById('newFamilyNameInput'),
  btnCreateFamilySubmit: document.getElementById('btnCreateFamilySubmit'),
  currentFamilyTitle: document.getElementById('currentFamilyTitle'),
  familySyncStatus: document.getElementById('familySyncStatus'),
  btnRegenerateInvite: document.getElementById('btnRegenerateInvite'),
  btnAddKidMemberBtn: document.getElementById('btnAddKidMemberBtn'),
  addKidFormRow: document.getElementById('addKidFormRow'),
  kidNameInput: document.getElementById('kidNameInput'),
  kidPikminSelect: document.getElementById('kidPikminSelect'),
  btnSaveKidMember: document.getElementById('btnSaveKidMember'),
  btnCancelKidMember: document.getElementById('btnCancelKidMember'),

  // 💌 接受家庭邀請 Modal
  joinFamilyModal: document.getElementById('joinFamilyModal'),
  closeJoinFamilyModalBtn: document.getElementById('closeJoinFamilyModalBtn'),
  joinFamilyTitle: document.getElementById('joinFamilyTitle'),
  joinFamilyDesc: document.getElementById('joinFamilyDesc'),
  joinAuthPromptBox: document.getElementById('joinAuthPromptBox'),
  btnJoinGoogleLogin: document.getElementById('btnJoinGoogleLogin'),
  joinActionBox: document.getElementById('joinActionBox'),
  btnConfirmJoinFamily: document.getElementById('btnConfirmJoinFamily'),

  // 🎯 花費對象與預付欄位
  btnBeneficiaryAll: document.getElementById('btnBeneficiaryAll'),
  beneficiaryMemberChips: document.getElementById('beneficiaryMemberChips'),
  prepaidExpenseDateGroup: document.getElementById('prepaidExpenseDateGroup'),
  expenseStayDate: document.getElementById('expenseStayDate'),

  // 👤 帳號與同步 Modal
  btnUserAuth: document.getElementById('btnUserAuth'),
  userAuthIcon: document.getElementById('userAuthIcon'),
  userAuthAvatar: document.getElementById('userAuthAvatar'),
  accountModal: document.getElementById('accountModal'),
  closeAccountModalBtn: document.getElementById('closeAccountModalBtn'),
  authLoggedOutPanel: document.getElementById('authLoggedOutPanel'),
  authLoggedInPanel: document.getElementById('authLoggedInPanel'),
  btnGoogleSignIn: document.getElementById('btnGoogleSignIn'),
  btnSignOut: document.getElementById('btnSignOut'),
  authProfileImg: document.getElementById('authProfileImg'),
  authDisplayName: document.getElementById('authDisplayName'),
  authEmail: document.getElementById('authEmail'),
  authUidInput: document.getElementById('authUidInput'),
  btnCopyUid: document.getElementById('btnCopyUid'),
  authSyncStatusPill: document.getElementById('authSyncStatusPill'),
  offlineQueueBadge: document.getElementById('offlineQueueBadge'),
  migrationCard: document.getElementById('migrationCard'),
  btnStartMigration: document.getElementById('btnStartMigration'),

  // 浮動提示 Toast
  toast: document.getElementById('toast'),
  toastIcon: document.getElementById('toastIcon'),
  toastMsg: document.getElementById('toastMsg')
};

/**
 * 浮動提示 Toast (輕量優雅微通知)
 */
export function showToast(msg, icon = '✨') {
  if (!el.toast) return;
  if (el.toastIcon) el.toastIcon.textContent = icon;
  if (el.toastMsg) el.toastMsg.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => {
    el.toast.classList.remove('show');
  }, 2300);
}

/**
 * PWA 安裝處理器 (支援 Android/PC 原生安裝彈窗 & iOS Safari 操作指引)
 */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (el.btnInstallPwa) {
    el.btnInstallPwa.style.display = 'inline-flex';
  }
});

function handlePwaInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('🎉 感謝安裝皮克敏出遊分帳！', '🌱');
      }
      deferredInstallPrompt = null;
    });
  } else {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      alert('📱 iOS iPhone 安裝指引：\n請點擊 Safari 底部工具列的「分享 (箭頭向上)」按鈕，往下滑並選擇「加入主畫面 ➕」，即可像原生 App 一樣享受全螢幕體驗！');
    } else {
      alert('📱 Android / 電腦安裝指引：\n請點選瀏覽器網址列右側的「安裝」圖示，或選單中的「安裝應用程式 / 加到主畫面」！');
    }
  }
}

/**
 * 開啟邀請旅伴與家庭成員管理視窗 (真正的安全邀請 Token + QR Code)
 */
async function openInviteModal() {
  const user = getCurrentUser();
  const family = getCurrentFamily();

  if (!user) {
    showToast('請先登入 Google 帳號以啟用家庭共享邀請', '🌱');
    openAccountModal();
    return;
  }

  if (!family) {
    // 尚未建立家庭，引導建立
    if (el.familyNotCreatedBox) el.familyNotCreatedBox.style.display = 'block';
    if (el.familyCreatedBox) el.familyCreatedBox.style.display = 'none';
    if (el.newFamilyNameInput) {
      el.newFamilyNameInput.value = `${user.displayName || 'Wilson'} 家庭`;
    }
  } else {
    // 已有家庭
    if (el.familyNotCreatedBox) el.familyNotCreatedBox.style.display = 'none';
    if (el.familyCreatedBox) el.familyCreatedBox.style.display = 'block';
    if (el.currentFamilyTitle) el.currentFamilyTitle.textContent = family.name || '家庭帳本';

    // 產生或刷新專屬邀請連結
    await refreshInviteLink(family.id || family.familyId);
    renderFamilyMembersUI();
  }

  if (el.inviteModal) el.inviteModal.classList.add('open');
}

let activeInviteToken = null;

async function refreshInviteLink(familyId) {
  const user = getCurrentUser();
  if (!user || !familyId) return;

  try {
    const { inviteUrl, inviteToken } = await createInvitation(familyId, user, '太太');
    activeInviteToken = inviteToken;
    if (el.inviteLinkInput) {
      el.inviteLinkInput.value = inviteUrl;
    }
    if (el.inviteQrSvgWrapper) {
      try {
        el.inviteQrSvgWrapper.innerHTML = generateQRCodeSVG(inviteUrl, 180);
      } catch (err) {
        console.warn('QR Code SVG error:', err);
      }
    }
  } catch (err) {
    console.error('產生邀請失敗:', err);
    showToast('產生邀請失敗: ' + err.message, '⚠️');
  }
}

/**
 * 渲染家庭成員分組名單
 */
function renderFamilyMembersUI() {
  if (!el.inviteMemberList) return;
  el.inviteMemberList.innerHTML = '';

  let members = getCurrentFamilyMembers();
  if (!members || members.length === 0) {
    (currentTrip?.members || []).forEach((m) => {
      renderMemberItemTag(m, m.role === '我' || m.role === '太太');
    });
    return;
  }

  // 區分 Account Member (大人) 與 Profile Member (小孩)
  const accountMembers = members.filter((m) => m.type === 'account');
  const hasWifeAccount = accountMembers.some((m) => m.role === '太太' || m.role === '媽媽' || m.name?.includes('Claire'));

  // 若已有太太帳號綁定，過濾掉重複殘留的虛擬媽媽
  const profileMembers = members.filter((m) => {
    if (m.type === 'account') return false;
    if (hasWifeAccount && (m.name?.includes('媽媽') || m.name?.includes('太太') || m.role === '媽媽' || m.role === '太太')) {
      return false;
    }
    return true;
  });

  // 1. 大人 (Account Member)
  const headerAdult = document.createElement('div');
  headerAdult.style.cssText = 'font-size: 0.76rem; font-weight: 800; color: var(--forest-green); margin: 6px 0 2px;';
  headerAdult.textContent = '🟢 登入帳號成員 (可跨手機同步記帳)：';
  el.inviteMemberList.appendChild(headerAdult);

  accountMembers.forEach((m) => renderMemberItemTag(m, true));

  // 2. 小孩 (Profile Member)
  const headerKids = document.createElement('div');
  headerKids.style.cssText = 'font-size: 0.76rem; font-weight: 800; color: #D97706; margin: 10px 0 2px;';
  headerKids.textContent = '👶 小孩與家庭成員 (花費對象，免登入帳號)：';
  el.inviteMemberList.appendChild(headerKids);

  if (profileMembers.length === 0) {
    const emptyHint = document.createElement('div');
    emptyHint.style.cssText = 'font-size: 0.75rem; color: var(--text-muted); padding: 4px 0;';
    emptyHint.textContent = '尚無小孩成員，可點擊上方「＋新增小孩成員」加入。';
    el.inviteMemberList.appendChild(emptyHint);
  } else {
    profileMembers.forEach((m) => renderMemberItemTag(m, false));
  }
}

function renderMemberItemTag(m, isAccount) {
  const item = document.createElement('div');
  item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: #FFFFFF; border: 1px solid #E3ECE0; padding: 6px 10px; border-radius: 8px;';

  const left = document.createElement('div');
  left.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const avatar = document.createElement('span');
  avatar.style.fontSize = '1.2rem';
  avatar.textContent = m.avatar && m.avatar.startsWith('http') ? '👤' : (m.avatar || (isAccount ? '👨‍💼' : '👦'));

  const info = document.createElement('div');
  const pikmin = PIKMIN_TYPES[m.pikminType] || { badge: '🌱' };

  // 親切化名稱顯示：如果是爸爸或媽媽帳號，將帳號名與身分整合為更易懂的標題
  let displayTitle = m.name;
  let displaySub = m.role || '';
  if (isAccount) {
    if (m.role === '我' || m.role === '爸爸') {
      displayTitle = `爸爸 (${m.name})`;
      displaySub = '爸爸';
    } else if (m.role === '太太' || m.role === '媽媽' || m.name?.includes('Claire')) {
      displayTitle = `媽媽 (${m.name})`;
      displaySub = '媽媽';
    }
  }

  info.innerHTML = `<span style="font-weight: 800; font-size: 0.85rem; color: var(--forest-dark);">${displayTitle}</span> <span style="font-size: 0.72rem; color: var(--text-muted);">(${pikmin.badge} ${displaySub})</span>`;

  left.appendChild(avatar);
  left.appendChild(info);

  const badge = document.createElement('span');
  badge.className = isAccount ? 'status-pill active' : 'status-pill';
  badge.style.fontSize = '0.68rem';
  badge.textContent = isAccount ? '已綁定帳號' : '家庭小孩';

  item.appendChild(left);
  item.appendChild(badge);
  el.inviteMemberList.appendChild(item);
}

/**
 * 複製專屬邀請連結
 */
async function copyInviteLink() {
  const url = el.inviteLinkInput?.value || window.location.href;
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (_) {}
  }
  if (!copied && el.inviteLinkInput) {
    try {
      el.inviteLinkInput.focus();
      el.inviteLinkInput.select();
      copied = document.execCommand('copy');
      el.inviteLinkInput.blur();
    } catch (_) {}
  }
  if (copied) {
    showToast('📋 邀請連結已成功複製！', '📋');
    if (el.btnCopyInviteLink) {
      const orig = el.btnCopyInviteLink.textContent;
      el.btnCopyInviteLink.textContent = '✅ 已複製！';
      setTimeout(() => {
        el.btnCopyInviteLink.textContent = orig;
      }, 2000);
    }
  } else {
    showToast('請長按網址手動複製！', '⚠️');
  }
}

/**
 * 取得當前旅程基準幣別符號 (動態支援 NT$, $, €, ₩, HK$ 等)
 */
function getBaseCurrencySymbol() {
  const baseCurr = currentTrip?.baseCurrency || 'TWD';
  return CURRENCIES[baseCurr]?.symbol || baseCurr;
}

/**
 * 格式化金額千分位
 */
function formatNumber(num) {
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('en-US');
}

/**
 * HTML 跳脫防呆
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 圖表子視圖切換 (圓餅圖 / 分類排行 / 成員支出 / 花在誰身上)
 */
function switchChartTab(tab) {
  if (tab === 'member') tab = 'payer';
  currentChartTab = tab;
  if (el.btnTabPie) el.btnTabPie.classList.toggle('active', tab === 'pie');
  if (el.btnTabBar) el.btnTabBar.classList.toggle('active', tab === 'bar');
  if (el.btnTabPayer) el.btnTabPayer.classList.toggle('active', tab === 'payer');
  if (el.btnTabBeneficiary) el.btnTabBeneficiary.classList.toggle('active', tab === 'beneficiary');
  if (el.btnTabMember) el.btnTabMember.classList.toggle('active', tab === 'payer');

  if (el.chartContainerPie) el.chartContainerPie.style.display = (tab === 'pie') ? 'flex' : 'none';
  if (el.chartContainerBar) el.chartContainerBar.style.display = (tab === 'bar') ? 'flex' : 'none';
  if (el.chartContainerPayer) el.chartContainerPayer.style.display = (tab === 'payer') ? 'flex' : 'none';
  if (el.chartContainerBeneficiary) el.chartContainerBeneficiary.style.display = (tab === 'beneficiary') ? 'flex' : 'none';
  if (el.chartContainerMember && el.chartContainerMember !== el.chartContainerPayer) {
    el.chartContainerMember.style.display = (tab === 'payer') ? 'flex' : 'none';
  }
}

/**
 * 取得當前貨幣有效折合匯率
 */
function getEffectiveRate(currency) {
  if (currency === 'TWD') return 1.0;

  // 優先檢測使用者是否有輸入自訂匯率
  const customRate = parseFloat(el.expenseCustomRate.value);
  if (customRate && customRate > 0) {
    return customRate;
  }

  // 檢查旅程中是否有該幣別的換匯紀錄
  const exchanges = currentTransactions.filter((tx) => tx.type === 'exchange' && tx.exchangeData?.toCurrency === currency);
  if (exchanges.length > 0) {
    let totalFrom = 0;
    let totalTo = 0;
    exchanges.forEach((ex) => {
      totalFrom += Number(ex.exchangeData.fromAmount || 0);
      totalTo += Number(ex.exchangeData.toAmount || 0);
    });
    if (totalTo > 0) {
      return totalFrom / totalTo;
    }
  }

  // 預設匯率
  return CURRENCIES[currency]?.defaultRate || 1.0;
}

/**
 * 🌟 即時換算台幣提示更新
 */
function updateLiveConversion() {
  const amount = parseFloat(el.expenseAmount.value) || 0;
  const currency = el.expenseCurrency.value || (currentTrip?.targetCurrency || 'JPY');
  const rate = getEffectiveRate(currency);

  const baseSymbol = getBaseCurrencySymbol();
  const baseCurr = currentTrip?.baseCurrency || 'TWD';
  if (currency === baseCurr) {
    el.liveConvertedAmount.textContent = `${baseSymbol} ${formatNumber(amount)}`;
    el.liveRateLabel.textContent = `本國幣別 (${baseCurr})`;
    el.btnToggleCustomRate.style.display = 'none';
    el.customRateRow.style.display = 'none';
  } else {
    el.btnToggleCustomRate.style.display = 'inline-block';
    const converted = Math.round(amount * rate);
    el.liveConvertedAmount.textContent = `${baseSymbol} ${formatNumber(converted)}`;
    el.liveRateLabel.textContent = `匯率：1 ${currency} ≈ ${rate.toFixed(4)} ${baseCurr}`;
  }
}

/**
 * 🌟 渲染分組式支付方式下拉選單 (支援不同信用卡、交通卡、行動支付)
 */
function renderPaymentSelectOptions(selectedItemId = null) {
  el.expensePaymentMethod.innerHTML = '';
  const items = Storage.getPaymentItems();

  // 按大類分組
  const groups = {
    credit_card: { label: '💳 信用卡 (自訂卡片與回饋)', items: [] },
    transit_card: { label: '🐧 交通卡 (ICOCA/Suica)', items: [] },
    mobile_pay: { label: '📲 行動支付 (Apple Pay/PayPay)', items: [] },
    cash: { label: '💵 現金錢包', items: [] },
    bank_transfer: { label: '🏦 銀行轉帳 / 行前付清', items: [] }
  };

  items.forEach((item) => {
    const cat = item.category || 'credit_card';
    if (!groups[cat]) {
      groups[cat] = { label: `${item.icon || '💳'} ${cat}`, items: [] };
    }
    groups[cat].items.push(item);
  });

  Object.keys(groups).forEach((catKey) => {
    const group = groups[catKey];
    if (group.items.length === 0) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;

    group.items.forEach((it) => {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = `${it.icon || '💳'} ${it.name}`;
      if (selectedItemId && selectedItemId === it.id) {
        opt.selected = true;
      }
      optgroup.appendChild(opt);
    });

    el.expensePaymentMethod.appendChild(optgroup);
  });
}

let currentSelectedTags = new Set();

/**
 * 🏷️ 常用標籤選擇器 (支援關鍵字即時搜尋、自訂新增與刪除)
 */
function renderTagChipsSelector(filterText = '', initialActiveTags = null) {
  if (!el.tagChipsSelector) return;
  if (initialActiveTags !== null) {
    currentSelectedTags = new Set(initialActiveTags);
  }

  const customTags = Storage.getCustomTags();
  const allTags = Array.from(new Set([...DEFAULT_TAGS, ...customTags]));

  const query = (filterText || '').trim().toLowerCase();
  const filtered = query
    ? allTags.filter((t) => t.toLowerCase().includes(query))
    : allTags;

  el.tagChipsSelector.innerHTML = '';

  if (filtered.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.style.cssText = 'font-size: 0.78rem; color: var(--text-muted); padding: 4px 0;';
    emptyNotice.textContent = query
      ? `查無「${query}」標籤，可點擊上方「＋ 新增標籤」直接建立！`
      : '目前無可用標籤';
    el.tagChipsSelector.appendChild(emptyNotice);
    return;
  }

  filtered.forEach((tag) => {
    const isCustom = customTags.includes(tag);
    const chip = document.createElement('span');
    chip.className = `pill-chip-tag ${currentSelectedTags.has(tag) ? 'active-tag' : ''}`;
    chip.dataset.tag = tag;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = `#${tag}`;
    chip.appendChild(labelSpan);

    if (isCustom) {
      const delBtn = document.createElement('span');
      delBtn.className = 'tag-del-btn';
      delBtn.title = `刪除 #${tag} 標籤`;
      delBtn.textContent = '×';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`確定要刪除常用標籤「#${tag}」嗎？`)) {
          Storage.deleteCustomTag(tag);
          currentSelectedTags.delete(tag);
          renderTagChipsSelector(el.tagSearchInput?.value || '');
        }
      };
      chip.appendChild(delBtn);
    }

    chip.onclick = () => {
      if (currentSelectedTags.has(tag)) {
        currentSelectedTags.delete(tag);
        chip.classList.remove('active-tag');
      } else {
        currentSelectedTags.add(tag);
        chip.classList.add('active-tag');
      }
    };

    el.tagChipsSelector.appendChild(chip);
  });
}

/**
 * 🏷️ 新增自訂常用標籤
 */
function handleAddNewCustomTag() {
  const input = el.tagSearchInput;
  const val = (input?.value || '').trim().replace(/^#+/, '');
  if (!val) {
    alert('請先在輸入框輸入欲新增的標籤名稱喔！');
    input?.focus();
    return;
  }
  Storage.addCustomTag(val);
  currentSelectedTags.add(val);
  if (input) input.value = '';
  renderTagChipsSelector('');
}

/**
 * 初始化下拉選單
 */
function initSelectOptions() {
  // 幣別選單 (支出 & 換匯)
  el.expenseCurrency.innerHTML = '';
  el.exToCurrency.innerHTML = '';
  if (el.tripTargetCurrencyInput) el.tripTargetCurrencyInput.innerHTML = '';

  Object.values(CURRENCIES).forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${c.flag} ${c.code}`;
    el.expenseCurrency.appendChild(opt);

    if (el.tripTargetCurrencyInput) {
      const optTrip = document.createElement('option');
      optTrip.value = c.code;
      optTrip.textContent = `${c.flag} ${c.code} (${c.name})`;
      el.tripTargetCurrencyInput.appendChild(optTrip);
    }

    if (c.code !== 'TWD') {
      const opt2 = document.createElement('option');
      opt2.value = c.code;
      opt2.textContent = `${c.flag} ${c.code} (${c.name})`;
      el.exToCurrency.appendChild(opt2);
    }
  });

  // 分類選單
  el.expenseCategory.innerHTML = '';
  Object.values(CATEGORIES).forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.label}`;
    el.expenseCategory.appendChild(opt);
  });

  // 渲染支付方式卡片項目
  renderPaymentSelectOptions();
}

/**
 * 載入並綁定當前旅程帳本
 */
function loadTripData() {
  const trips = Storage.getTrips();
  currentTrip = Storage.getActiveTrip() || trips[0];

  // 頂部膠囊標題與資訊更新 (皮克敏出遊分帳風格)
  if (el.currentTripBadge) {
    el.currentTripBadge.textContent = `✈️ ${currentTrip.title}`;
  }
  if (el.navActiveTripTitle) {
    el.navActiveTripTitle.textContent = currentTrip.title;
  }
  if (el.travelHeroDest) {
    el.travelHeroDest.textContent = currentTrip.title;
  }
  if (el.heroTripDates) {
    el.heroTripDates.textContent = `📅 ${currentTrip.startDate || ''} ~ ${currentTrip.endDate || ''}`;
  }

  // 載入交易紀錄 (優先讀取本機快取)
  currentTransactions = Storage.getTransactions(currentTrip.id);

  // 啟動 Firestore 雲端即時監聽 (若有登入家庭)
  const family = getCurrentFamily();
  const familyId = family ? (family.id || family.familyId) : null;
  if (familyId && currentTrip) {
    listenToTripTransactions(familyId, currentTrip.id, (cloudTxList) => {
      if (cloudTxList && cloudTxList.length > 0) {
        Storage.saveTransactions(cloudTxList);
        currentTransactions = cloudTxList;
        renderDashboard();
        renderActiveTab();
      }
    });
  }

  // 綁定城市選項
  el.expenseCity.innerHTML = '';
  const cities = currentTrip.cities && currentTrip.cities.length > 0 ? currentTrip.cities : ['主要城市'];
  cities.forEach((city) => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = `📍 ${city}`;
    el.expenseCity.appendChild(opt);
  });

  // 綁定成員選項 (帶有皮克敏代表)
  el.expensePayer.innerHTML = '';
  const members = currentTrip.members && currentTrip.members.length > 0 ? currentTrip.members : [{ id: 'm_me', name: '我' }];
  members.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    const pikmin = PIKMIN_TYPES[m.pikminType] || { badge: '🌱' };
    opt.textContent = `${pikmin.badge} ${m.name} (${m.role || '夥伴'})`;
    el.expensePayer.appendChild(opt);
  });

  // 渲染成員頭像圓圈疊加
  renderSquadAvatars(members);

  // 綁定標籤選擇器 (支援搜尋、新增、刪除)
  renderTagChipsSelector('');

  // 渲染儀表板與分頁
  renderDashboard();
  renderTimelineFilters();
  renderActiveTab();
}

/**
 * 渲染探險隊成員小頭像圈圈疊加
 */
function renderSquadAvatars(members) {
  if (!el.pikminSquadMembers) return;
  el.pikminSquadMembers.innerHTML = '';
  members.forEach((m) => {
    const pikmin = PIKMIN_TYPES[m.pikminType] || { badge: '🌱', color: '#3D6B4F' };
    const badge = document.createElement('div');
    badge.className = 'avatar-badge';
    badge.style.background = pikmin.color || '#3D6B4F';
    badge.title = `${m.name} (${pikmin.name})`;
    badge.textContent = pikmin.badge;
    el.pikminSquadMembers.appendChild(badge);
  });
}


/**
 * 渲染旅程抬頭卡片與皮克敏探險小隊
 */
function renderTripHeader() {
  if (el.travelHeroDest) el.travelHeroDest.textContent = currentTrip.title;
  if (el.heroTripDates) {
    el.heroTripDates.textContent = `📅 ${currentTrip.startDate || ''} ~ ${currentTrip.endDate || ''}`;
  }

  // 皮克敏探險小隊夥伴清單 (Pikmin Squad)
  if (el.pikminSquadMembers) {
    el.pikminSquadMembers.innerHTML = '';
    (currentTrip.members || []).forEach((m) => {
      const chip = document.createElement('span');
      chip.className = 'squad-member-chip';
      const pikmin = PIKMIN_TYPES[m.pikminType] || { badge: '🌱', name: '皮克敏' };
      chip.innerHTML = `${pikmin.badge} <strong>${m.name}</strong> <span style="font-size: 0.68rem; color: var(--text-dim);">${pikmin.name}</span>`;
      el.pikminSquadMembers.appendChild(chip);
    });
  }
}

/**
 * 渲染核心財務指標與皮克敏成長進度
 */
function renderDashboard() {
  const summary = calculateTripSummary(currentTrip, currentTransactions);
  const targetSymbol = CURRENCIES[currentTrip.targetCurrency]?.symbol || '¥';
  const baseSymbol = getBaseCurrencySymbol();

  // 預算條數值
  if (el.budgetTotalLabel) el.budgetTotalLabel.textContent = `${baseSymbol}${formatNumber(summary.totalBudget)}`;
  if (el.budgetRemainingLabel) el.budgetRemainingLabel.textContent = `${baseSymbol}${formatNumber(summary.budgetRemaining)}`;
  if (el.budgetPercentLabel) el.budgetPercentLabel.textContent = `${summary.budgetUsagePercent}%`;

  if (el.budgetProgressFill) {
    const fillPercent = Math.min(100, Math.max(0, summary.budgetUsagePercent));
    el.budgetProgressFill.style.width = `${fillPercent}%`;
    if (summary.budgetUsagePercent > 100) {
      el.budgetProgressFill.classList.add('overbudget');
    } else {
      el.budgetProgressFill.classList.remove('overbudget');
    }
  }

  // 皮克敏花朵成長狀態
  let flowerIcon = '🌱';
  if (summary.budgetUsagePercent >= 100) {
    flowerIcon = '🌸';
  } else if (summary.budgetUsagePercent >= 70) {
    flowerIcon = '🌷';
  } else if (summary.budgetUsagePercent >= 30) {
    flowerIcon = '🌿';
  }

  if (el.pikminGrowthStageIcon) el.pikminGrowthStageIcon.textContent = flowerIcon;
  if (el.pikminTrackFlower) el.pikminTrackFlower.textContent = flowerIcon;

  // 🌸 旅程總覽極致大卡片數值更新
  if (el.travelHeroDest) el.travelHeroDest.textContent = currentTrip.title;
  if (el.heroTripDates) {
    el.heroTripDates.textContent = `📅 ${currentTrip.startDate || ''} ~ ${currentTrip.endDate || ''}`;
  }
  if (el.travelHeroTodayAmount) {
    el.travelHeroTodayAmount.textContent = `${targetSymbol}${formatNumber(summary.todaySpentTarget)}`;
  }
  if (el.travelHeroTodayBaseConverted) {
    el.travelHeroTodayBaseConverted.textContent = `≈ ${baseSymbol}${formatNumber(summary.todaySpentBase || 0)}`;
  }
  if (el.travelHeroTotalBase) {
    el.travelHeroTotalBase.textContent = `${baseSymbol}${formatNumber(summary.totalExpenseTWD)}`;
  }
  if (el.statPrepaidSub) {
    el.statPrepaidSub.textContent = `含行前 ${baseSymbol}${formatNumber(summary.prepaidExpenseTWD)} / 當地 ${baseSymbol}${formatNumber(summary.onTripExpenseTWD)}`;
  }
  if (el.travelHeroBudgetRemain) {
    el.travelHeroBudgetRemain.textContent = `${baseSymbol}${formatNumber(summary.budgetRemaining)}`;
  }
  if (el.travelHeroCashRemain) {
    el.travelHeroCashRemain.textContent = `${targetSymbol}${formatNumber(summary.targetCashRemaining)}`;
  }
}

/**
 * 渲染時間軸分類與城市篩選列 (完全移植分攤 App 視覺體驗)
 */
function renderTimelineFilters() {
  // 1. 渲染類別篩選膠囊 (橫向捲動，包含 全部類別 ＋ 各支出分類)
  if (el.timelineCategoryChips) {
    el.timelineCategoryChips.innerHTML = '';

    // 全部類別按鈕
    const allCatBtn = document.createElement('button');
    allCatBtn.type = 'button';
    allCatBtn.className = `timeline-filter-pill ${selectedFilterCategory === 'all' ? 'active' : ''}`;
    allCatBtn.innerHTML = `🌸 全部類別`;
    allCatBtn.onclick = () => {
      selectedFilterCategory = 'all';
      renderTimelineFilters();
      renderTimeline();
    };
    el.timelineCategoryChips.appendChild(allCatBtn);

    // 各大分類按鈕
    Object.values(CATEGORIES).forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `timeline-filter-pill ${selectedFilterCategory === cat.id ? 'active' : ''}`;
      btn.innerHTML = `<span>${cat.icon}</span> <span>${cat.label}</span>`;
      btn.onclick = () => {
        selectedFilterCategory = cat.id;
        renderTimelineFilters();
        renderTimeline();
      };
      el.timelineCategoryChips.appendChild(btn);
    });
  }

  // 2. 渲染城市篩選膠囊 (若有複數城市)
  const cityContainer = el.timelineCityChips || el.timelineFilterBar;
  if (cityContainer) {
    cityContainer.innerHTML = '';
    const cities = currentTrip?.cities || [];

    if (cities.length > 0) {
      cityContainer.style.display = 'flex';
      const allCityBtn = document.createElement('button');
      allCityBtn.type = 'button';
      allCityBtn.className = `timeline-filter-pill ${selectedFilterCity === 'all' ? 'active' : ''}`;
      allCityBtn.textContent = '📍 全部城市';
      allCityBtn.onclick = () => {
        selectedFilterCity = 'all';
        renderTimelineFilters();
        renderTimeline();
      };
      cityContainer.appendChild(allCityBtn);

      cities.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `timeline-filter-pill ${selectedFilterCity === c ? 'active' : ''}`;
        btn.textContent = `📍 ${c}`;
        btn.onclick = () => {
          selectedFilterCity = c;
          renderTimelineFilters();
          renderTimeline();
        };
        cityContainer.appendChild(btn);
      });
    } else {
      cityContainer.style.display = 'none';
    }
  }
}

/**
 * 渲染旅行時間軸 (Timeline，支援搜尋關鍵字、分類與城市篩選)
 */
function renderTimeline() {
  el.timelineContainer.innerHTML = '';

  let list = currentTransactions.filter((tx) => !tx.type || tx.type === 'expense');

  // 1. 城市篩選
  if (selectedFilterCity !== 'all') {
    list = list.filter((tx) => tx.city === selectedFilterCity);
  }

  // 2. 類別篩選
  if (selectedFilterCategory !== 'all') {
    list = list.filter((tx) => tx.category === selectedFilterCategory);
  }

  // 3. 關鍵字搜尋過濾 (全方位：品項、備註、金額、幣別、分類、城市、付款人、受用人、支付卡片、標籤、日期)
  if (timelineSearchKeyword) {
    const rawTokens = timelineSearchKeyword.toLowerCase().split(/\s+/).filter(Boolean);
    const members = currentTrip?.members || [];
    const familyMembers = getCurrentFamilyMembers() || [];
    const allMembers = [...members, ...familyMembers];
    const paymentItems = Storage.getPaymentItems() || [];

    list = list.filter((tx) => {
      const searchParts = [];

      // 品項與備註
      if (tx.notes) searchParts.push(tx.notes);

      // 分類 (英文 ID + 中文名稱)
      if (tx.category) {
        searchParts.push(tx.category);
        const cat = CATEGORIES[tx.category];
        if (cat) searchParts.push(cat.label, cat.icon);
      }

      // 城市
      if (tx.city) searchParts.push(tx.city);

      // 金額 (原幣金額、無小數金額、含千分位、折算台幣金額)
      if (tx.amount !== undefined && tx.amount !== null) {
        searchParts.push(String(tx.amount));
        searchParts.push(Number(tx.amount).toLocaleString());
      }
      const twdAmt = Math.round(toBaseAmount(tx, currentTrip?.baseCurrency || 'TWD'));
      searchParts.push(String(twdAmt), twdAmt.toLocaleString(), `nt$${twdAmt}`, `nt$${twdAmt.toLocaleString()}`);

      // 幣別
      if (tx.currency) {
        searchParts.push(tx.currency);
        if (tx.currency === 'JPY') searchParts.push('日圓', '日幣', '日元', '¥');
        if (tx.currency === 'TWD') searchParts.push('台幣', '新台幣', 'nt$');
      }

      // 實際付款人 (名稱 + 角色身分)
      const payer = allMembers.find((m) => m.id === tx.payerId || m.memberId === tx.payerId || m.uid === tx.payerId);
      if (payer) {
        searchParts.push(payer.name, payer.role || '');
        if (payer.role === '我' || payer.name?.includes('爸爸')) searchParts.push('爸爸', '我');
        if (payer.role === '太太' || payer.name?.includes('媽媽')) searchParts.push('媽媽', '太太');
      }

      // 受用人 / 這筆錢花在誰身上
      const bIds = tx.beneficiaryIds || ['all'];
      if (bIds.includes('all')) {
        searchParts.push('全家', '所有人', '大家');
      } else {
        bIds.forEach((bId) => {
          const bm = allMembers.find((m) => m.id === bId || m.memberId === bId);
          if (bm) {
            searchParts.push(bm.name, bm.role || '');
            if (bm.role === '我' || bm.name?.includes('爸爸')) searchParts.push('爸爸');
            if (bm.role === '太太' || bm.name?.includes('媽媽')) searchParts.push('媽媽');
          }
        });
      }

      // 支付方式與卡片名稱 (例如 Suica, 西瓜卡, 現金, 信用卡)
      const payItem = paymentItems.find((p) => p.id === tx.paymentItemId);
      if (tx.paymentItemName) searchParts.push(tx.paymentItemName);
      if (payItem) searchParts.push(payItem.name, payItem.note || '');
      if (tx.paymentMethod) {
        searchParts.push(tx.paymentMethod);
        const pmCat = PAYMENT_CATEGORIES[tx.paymentMethod];
        if (pmCat) searchParts.push(pmCat.label);
      }

      // 常用標籤
      if (Array.isArray(tx.tags)) {
        searchParts.push(...tx.tags);
      }

      // 日期與時間
      if (tx.datetime) {
        searchParts.push(tx.datetime.slice(0, 10));
        searchParts.push(tx.datetime.slice(5, 10));
      }

      const combinedText = searchParts.join(' ').toLowerCase();

      // 多關鍵字分詞匹配：輸入的所有字詞都必須存在
      return rawTokens.every((token) => combinedText.includes(token));
    });
  }

  if (list.length === 0) {
    const isFiltered = timelineSearchKeyword || selectedFilterCategory !== 'all' || selectedFilterCity !== 'all';
    el.timelineContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-lg); border: 2px dashed var(--border);">
        <span style="font-size: 2.6rem; display: block; margin-bottom: 8px;">${isFiltered ? '🔍' : '🌱'}</span>
        <h4 style="color: var(--pikmin-green-deep); margin-bottom: 4px;">${isFiltered ? '查無符合條件的支出紀錄' : '目前尚無支出紀錄'}</h4>
        <p style="font-size: 0.85rem;">${isFiltered ? '請嘗試清除搜尋關鍵字或點擊「全部類別」查看完整清單。' : '跟著皮克敏一起踏出探險步伐！點擊下方「記一筆」新增支出。'}</p>
      </div>
    `;
    return;
  }

  // 按日期時間降冪排序
  list.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));

  // 按天分組
  const groups = {};
  list.forEach((tx) => {
    const dateKey = (tx.datetime || '').slice(0, 10) || '無日期';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(tx);
  });

  const paymentItems = Storage.getPaymentItems();

  Object.keys(groups).forEach((dateKey) => {
    const dayGroup = document.createElement('div');
    dayGroup.className = 'timeline-day-group';

    let dayTotalTWD = 0;
    groups[dateKey].forEach((t) => {
      dayTotalTWD += toBaseAmount(t, currentTrip.baseCurrency);
    });

    const header = document.createElement('div');
    header.className = 'timeline-day-header';
    header.innerHTML = `
      <span class="day-title">📅 ${dateKey}</span>
      <span class="day-total">當日小計 NT$${formatNumber(dayTotalTWD)}</span>
    `;
    dayGroup.appendChild(header);

    // 項目卡片
    groups[dateKey].forEach((tx) => {
      const cat = CATEGORIES[tx.category] || CATEGORIES.other;
      const curr = CURRENCIES[tx.currency] || { symbol: tx.currency };
      const timeStr = (tx.datetime || '').slice(11, 16) || '--:--';
      const baseAmt = Math.round(toBaseAmount(tx, currentTrip.baseCurrency));

      // 付款人皮克敏
      const payer = (currentTrip.members || []).find((m) => m.id === tx.payerId) || { name: '成員' };
      const pikmin = PIKMIN_TYPES[payer.pikminType] || { badge: '🌱' };

      // 🌟 具體支付工具 / 信用卡名稱
      const payItem = paymentItems.find((p) => p.id === tx.paymentItemId) || {
        name: tx.paymentItemName || (PAYMENT_CATEGORIES[tx.paymentMethod]?.label || '現金'),
        icon: PAYMENT_CATEGORIES[tx.paymentMethod]?.icon || '💳'
      };

      const card = document.createElement('div');
      card.className = `tx-card ${tx.isPrepaid ? 'is-prepaid' : ''}`;

      let thumbHtml = '';
      if (tx.photoThumbnail) {
        thumbHtml = `<img src="${tx.photoThumbnail}" class="tx-thumb-preview" alt="照片">`;
      }

      card.innerHTML = `
        <div class="tx-icon-bubble" style="background: ${cat.color}20; color: ${cat.color};">
          ${cat.icon}
        </div>
        <div class="tx-content">
          <div class="tx-primary-line">
            <span class="tx-title">${tx.notes || cat.label}</span>
            <span class="tx-amount">${curr.symbol}${formatNumber(tx.amount)}</span>
          </div>
          <div class="tx-secondary-line">
            <div class="tx-badges">
              <span class="mini-badge" style="color: var(--pikmin-green-deep);">🕒 ${timeStr}</span>
              <span class="mini-badge">📍 ${tx.city || '城市'}</span>
              <span class="mini-badge" style="font-weight: 700;">${payItem.icon} ${payItem.name}</span>
              <span class="mini-badge">${pikmin.badge} ${payer.name}</span>
              ${tx.isPrepaid ? '<span class="mini-badge" style="color: var(--pikmin-purple); background: var(--pikmin-purple-bg);">✈️ 預付</span>' : ''}
              ${(tx.tags || []).map((t) => `<span class="mini-badge">#${t}</span>`).join('')}
            </div>
            <span class="tx-base-sub">≈ NT$${formatNumber(baseAmt)}</span>
          </div>
        </div>
        ${thumbHtml}
      `;

      card.onclick = async () => {
        if (tx.photoId) {
          const photo = await getPhoto(tx.photoId);
          if (photo && photo.dataUrl) {
            openLightbox(photo.dataUrl, `${tx.notes || cat.label} - ${timeStr}`);
            return;
          }
        }
        openEditExpenseModal(tx);
      };

      dayGroup.appendChild(card);
    });

    el.timelineContainer.appendChild(dayGroup);
  });
}

/**
 * 渲染外幣現金換匯與舊鈔錢包清單
 */
function renderWallets() {
  if (!currentTrip) return;
  const summary = calculateTripSummary(currentTrip, currentTransactions);
  const targetSymbol = CURRENCIES[currentTrip.targetCurrency]?.symbol || '¥';

  // 1. 更新頂部現金錢包餘額看板 (若有其他幣別舊鈔如港幣 HKD 也一併標示)
  if (el.walletsHeroCashRemain) {
    const mainRemainText = `${targetSymbol} ${formatNumber(summary.targetCashRemaining || 0)}`;
    const otherCurrs = Object.keys(summary.cashBalances || {}).filter(
      (c) => c !== currentTrip.targetCurrency && (summary.cashBalances[c]?.remaining || 0) > 0
    );

    if (otherCurrs.length > 0) {
      const extraPills = otherCurrs.map((c) => {
        const sym = CURRENCIES[c]?.symbol || c;
        return `<span style="font-size: 0.72rem; color: #78350F; background: #FEF3C7; padding: 2px 6px; border-radius: 6px; margin-left: 4px; font-weight: 700;">+ ${sym}${formatNumber(summary.cashBalances[c].remaining)}</span>`;
      }).join('');
      el.walletsHeroCashRemain.innerHTML = `${mainRemainText} ${extraPills}`;
    } else {
      el.walletsHeroCashRemain.textContent = mainRemainText;
    }
  }

  // 2. 渲染交易歷程清單
  el.exchangeListContainer.innerHTML = '';
  const exchanges = currentTransactions.filter((tx) => tx.type === 'exchange');

  if (exchanges.length === 0) {
    el.exchangeListContainer.innerHTML = `
      <div style="text-align: center; padding: 28px 16px; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-md); border: 2px dashed var(--border);">
        <div style="font-size: 1.8rem; margin-bottom: 6px;">🪙 🎒</div>
        尚無外幣現金紀錄。<br>點擊上方「💱 記錄台幣換匯」或「🎒 登記前期剩餘外幣 (舊鈔)」存入現金錢包。
      </div>
    `;
    return;
  }

  exchanges.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));

  exchanges.forEach((ex) => {
    const ed = ex.exchangeData || {};
    const isSurplus = !!(ed.isInitialSurplus || ed.fromAmount === 0);
    const currSymbol = CURRENCIES[ed.toCurrency]?.symbol || '';
    const card = document.createElement('div');
    card.className = `tx-card is-exchange ${isSurplus ? 'is-surplus-cash' : ''}`;

    const iconBubble = isSurplus
      ? `<div class="tx-icon-bubble" style="background: rgba(245, 158, 11, 0.15); color: #B45309;" title="前期剩餘外幣舊鈔">🎒</div>`
      : `<div class="tx-icon-bubble" style="background: rgba(101, 163, 13, 0.15); color: var(--pikmin-green);" title="台幣換匯">🪙</div>`;

    const badgesHtml = isSurplus
      ? `
        <span class="mini-badge" style="background: rgba(245, 158, 11, 0.15); color: #B45309; font-weight: 700;">🎒 前期留存舊鈔</span>
        <span class="mini-badge">自備舊鈔 · 付出 NT$0</span>
        <span class="mini-badge">📅 ${(ex.datetime || '').slice(0, 16).replace('T', ' ')}</span>
      `
      : `
        <span class="mini-badge" style="background: rgba(45, 90, 61, 0.1); color: var(--forest-dark); font-weight: 700;">💱 台幣換匯</span>
        <span class="mini-badge">付出 NT$${formatNumber(ed.fromAmount)}</span>
        <span class="mini-badge">匯率約 ${(ed.effectiveRate || 0).toFixed(4)}</span>
        <span class="mini-badge">📅 ${(ex.datetime || '').slice(0, 16).replace('T', ' ')}</span>
      `;

    card.innerHTML = `
      ${iconBubble}
      <div class="tx-content">
        <div class="tx-primary-line">
          <span class="tx-title">${ex.notes || (isSurplus ? '前期留存舊鈔自備' : '外幣現金換匯')}</span>
          <span class="tx-amount" style="color: ${isSurplus ? '#B45309' : 'var(--pikmin-green-deep)'}; font-weight: 800;">
            +${currSymbol}${formatNumber(ed.toAmount)}
          </span>
        </div>
        <div class="tx-secondary-line">
          <div class="tx-badges">
            ${badgesHtml}
          </div>
          <button type="button" class="btn-icon-subtle btn-del-exchange" title="刪除此筆紀錄" style="color: var(--danger); font-size: 0.75rem;">🗑️ 刪除</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-del-exchange').onclick = (e) => {
      e.stopPropagation();
      const msg = isSurplus
        ? '確定要刪除這筆前期剩餘舊鈔紀錄嗎？外幣現金餘額將會重新扣除此項。'
        : '確定要刪除這筆外幣換匯紀錄嗎？現金錢包餘額將會重新計算。';
      if (confirm(msg)) {
        Storage.deleteTransaction(ex.id);
        loadTripData();
      }
    };

    el.exchangeListContainer.appendChild(card);
  });
}

/**
 * 渲染支出分類與統計分析 (移植 money 專案高顏值圖表架構)
 */
function renderAnalytics() {
  if (!currentTrip) return;
  const summary = calculateTripSummary(currentTrip, currentTransactions);
  const total = summary.totalExpenseTWD || 0;

  // 更新右上角與圓餅圖中心總額
  if (el.chartTotalBadge) el.chartTotalBadge.textContent = `NT$ ${formatNumber(total)}`;
  if (el.pieCenterAmount) el.pieCenterAmount.textContent = `NT$ ${formatNumber(total)}`;

  // 1. 繪製圓餅圖與圖例清單
  if (el.pieChartSvg && el.chartLegendGrid) {
    el.pieChartSvg.innerHTML = '';
    el.chartLegendGrid.innerHTML = '';

    if (total <= 0) {
      // 無支出時顯示淺灰底圓環
      const emptyCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      emptyCircle.setAttribute('class', 'pie-slice');
      emptyCircle.setAttribute('cx', '21');
      emptyCircle.setAttribute('cy', '21');
      emptyCircle.setAttribute('r', '15.91549430918954');
      emptyCircle.setAttribute('stroke', '#E2E8F0');
      emptyCircle.setAttribute('stroke-dasharray', '100 0');
      emptyCircle.setAttribute('stroke-dashoffset', '0');
      el.pieChartSvg.appendChild(emptyCircle);

      el.chartLegendGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 14px 0;">
          🌱 尚無支出紀錄，開始記帳後將即時展示圓餅佔比
        </div>
      `;
    } else {
      let currentAngle = 0;
      Object.entries(summary.byCategory || {}).forEach(([catKey, amt]) => {
        if (amt <= 0) return;
        const cat = CATEGORIES[catKey] || { label: catKey, color: '#9E9E9E', icon: '💰' };
        const pct = (amt / total);
        const dashArray = `${pct * 100} ${100 - pct * 100}`;
        const dashOffset = -currentAngle;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'pie-slice');
        circle.setAttribute('cx', '21');
        circle.setAttribute('cy', '21');
        circle.setAttribute('r', '15.91549430918954');
        circle.setAttribute('stroke', cat.color);
        circle.setAttribute('stroke-dasharray', dashArray);
        circle.setAttribute('stroke-dashoffset', dashOffset);
        el.pieChartSvg.appendChild(circle);

        currentAngle += pct * 100;

        // 圖例卡片
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
          <div class="legend-left">
            <span class="legend-color-dot" style="background:${cat.color};"></span>
            <span class="legend-label">${cat.icon} ${cat.label}</span>
          </div>
          <span class="legend-val">NT$ ${formatNumber(amt)}</span>
        `;
        el.chartLegendGrid.appendChild(legendItem);
      });
    }
  }

  // 2. 繪製分類排行長條圖
  if (el.chartContainerBar) {
    el.chartContainerBar.innerHTML = '';
    const sortedCats = Object.entries(summary.byCategory || {})
      .filter(([_, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1]);

    if (sortedCats.length === 0) {
      el.chartContainerBar.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 20px 0;">
          🌱 尚無支出紀錄
        </div>
      `;
    } else {
      sortedCats.forEach(([catKey, amt]) => {
        const cat = CATEGORIES[catKey] || { label: catKey, color: '#9E9E9E', icon: '💰' };
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'bar-chart-row';
        row.innerHTML = `
          <div class="bar-chart-header">
            <span>${cat.icon} ${cat.label} (${pct}%)</span>
            <span>NT$ ${formatNumber(amt)}</span>
          </div>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width: ${pct}%; background:${cat.color};"></div>
          </div>
        `;
        el.chartContainerBar.appendChild(row);
      });
    }
  }

  // 3. 繪製「成員支出」 (誰付款墊付 / 掏錢支付的實際支出統計)
  const payerContainer = el.chartContainerPayer || el.chartContainerMember;
  if (payerContainer) {
    payerContainer.innerHTML = '';
    const members = currentTrip.members || [];

    if (total <= 0) {
      payerContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 20px 0;">
          🌱 尚無成員支出紀錄，開始記帳後將即時展示各成員墊付與付款統計
        </div>
      `;
    } else {
      members.forEach((m) => {
        // 篩選出該成員作為付款人的所有支出
        const memberTxs = currentTransactions.filter((t) => t.type === 'expense' && t.payerId === m.id);
        const memberTotal = memberTxs.reduce((sum, tx) => sum + toBaseAmount(tx, currentTrip.baseCurrency), 0);
        const pct = total > 0 ? Math.round((memberTotal / total) * 100) : 0;

        // 統計該成員所使用的支付工具分佈
        const payBreakdown = {};
        memberTxs.forEach((tx) => {
          const key = tx.paymentItemName || (PAYMENT_CATEGORIES[tx.paymentMethod]?.label || '其他支付');
          const amt = toBaseAmount(tx, currentTrip.baseCurrency);
          payBreakdown[key] = (payBreakdown[key] || 0) + amt;
        });

        // 產生支付方式小標籤
        let chipsHtml = '';
        Object.entries(payBreakdown).forEach(([payName, pAmt]) => {
          chipsHtml += `
            <span class="member-pay-chip">
              <span>💳 ${escapeHtml(payName)}</span>
              <strong>NT$${formatNumber(pAmt)}</strong>
            </span>
          `;
        });
        if (!chipsHtml) {
          chipsHtml = `<span style="font-size:0.72rem; color:var(--text-muted);">本趟旅程尚未有支出紀錄</span>`;
        }

        // 產生交易明細列 (可展開)
        let txDetailsHtml = '';
        memberTxs.forEach((tx) => {
          const baseAmt = toBaseAmount(tx, currentTrip.baseCurrency);
          const curr = CURRENCIES[tx.currency] || { symbol: '$' };
          const payLabel = tx.paymentItemName || (PAYMENT_CATEGORIES[tx.paymentMethod]?.label || '其他');
          txDetailsHtml += `
            <div class="member-tx-row">
              <div class="member-tx-left">
                <span class="member-tx-title">${escapeHtml(tx.notes || tx.category)}</span>
                <span class="member-tx-meta">${tx.datetime?.slice(5, 16) || ''} · ${escapeHtml(payLabel)}</span>
              </div>
              <div class="member-tx-right">
                <div class="member-tx-amt-base">NT$ ${formatNumber(baseAmt)}</div>
                ${tx.currency !== currentTrip.baseCurrency ? `<div class="member-tx-amt-orig">${curr.symbol}${formatNumber(tx.amount)}</div>` : ''}
              </div>
            </div>
          `;
        });

        const card = document.createElement('div');
        card.className = 'member-expense-card';
        card.innerHTML = `
          <div class="member-expense-header">
            <div class="member-info-left">
              <span class="member-avatar-badge">${m.avatar || '👤'}</span>
              <div>
                <div class="member-name-text">${escapeHtml(m.name)} <span class="member-role-tag">(${m.role || '夥伴'})</span></div>
                <div class="member-count-sub">實際付款：${memberTxs.length} 筆款項</div>
              </div>
            </div>
            <div class="member-info-right">
              <div class="member-total-amount">NT$ ${formatNumber(memberTotal)}</div>
              <div class="member-total-pct">佔全團支出 ${pct}%</div>
            </div>
          </div>

          <!-- 個人付款佔全團比例長條圖 -->
          <div class="bar-chart-track" style="margin: 8px 0 6px 0;">
            <div class="bar-chart-fill" style="width: ${pct}%; background: ${m.color || 'var(--forest-green)'};"></div>
          </div>

          <!-- 各支付工具小計 (方便核對信用卡與現金) -->
          <div class="member-pay-methods-chips">
            ${chipsHtml}
          </div>

          ${memberTxs.length > 0 ? `
            <button type="button" class="btn-toggle-member-details" data-expanded="false">
              <span>📋 查看付款明細 (${memberTxs.length} 筆)</span>
              <span class="toggle-icon">▾</span>
            </button>
            <div class="member-tx-details-list" style="display: none;">
              ${txDetailsHtml}
            </div>
          ` : ''}
        `;

        // 綁定明細展開/收合事件
        const toggleBtn = card.querySelector('.btn-toggle-member-details');
        if (toggleBtn) {
          const detailsList = card.querySelector('.member-tx-details-list');
          const toggleIcon = card.querySelector('.toggle-icon');
          toggleBtn.onclick = () => {
            const isExpanded = toggleBtn.getAttribute('data-expanded') === 'true';
            if (isExpanded) {
              detailsList.style.display = 'none';
              toggleBtn.setAttribute('data-expanded', 'false');
              toggleIcon.textContent = '▾';
            } else {
              detailsList.style.display = 'flex';
              toggleBtn.setAttribute('data-expanded', 'true');
              toggleIcon.textContent = '▴';
            }
          };
        }

        payerContainer.appendChild(card);
      });
    }
  }

  // 4. 繪製「花在誰身上」 (各成員實際花費與受用統計分析)
  if (el.chartContainerBeneficiary) {
    el.chartContainerBeneficiary.innerHTML = '';
    const members = currentTrip.members || [];

    if (total <= 0) {
      el.chartContainerBeneficiary.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 20px 0;">
          🌱 尚無消費紀錄，開始記帳後將展示每位成員實際花費與受用統計
        </div>
      `;
    } else {
      // 依序計算每位成員的受用金額 (專屬花費 ＋ 全家共享均分額)
      members.forEach((m) => {
        // 該成員專屬花費 (只指定該成員一人)
        const dedicatedTxs = currentTransactions.filter((t) => {
          return t.type === 'expense' && Array.isArray(t.beneficiaryIds) && t.beneficiaryIds.length === 1 && t.beneficiaryIds[0] === m.id;
        });
        const dedicatedAmt = dedicatedTxs.reduce((sum, tx) => sum + toBaseAmount(tx, currentTrip.baseCurrency), 0);

        // 涉及該成員的所有花費 (包含全家共享 all 或多成員均分)
        const allInvolvedTxs = currentTransactions.filter((t) => {
          if (t.type !== 'expense') return false;
          const ben = t.beneficiaryIds || ['all'];
          return ben.includes('all') || ben.includes(m.id);
        });

        // 該成員的總實際受用金額 (若為 all 則依成員數均分，若為多成員則依人數分攤)
        let memberRealCost = 0;
        allInvolvedTxs.forEach((tx) => {
          const ben = tx.beneficiaryIds || ['all'];
          const baseAmt = toBaseAmount(tx, currentTrip.baseCurrency);
          if (ben.includes('all')) {
            memberRealCost += baseAmt / Math.max(members.length, 1);
          } else if (ben.includes(m.id)) {
            memberRealCost += baseAmt / Math.max(ben.length, 1);
          }
        });

        memberRealCost = Math.round(memberRealCost);
        const pct = total > 0 ? Math.round((memberRealCost / total) * 100) : 0;

        // 產生該成員花費明細列 (可展開)
        let txDetailsHtml = '';
        allInvolvedTxs.forEach((tx) => {
          const baseAmt = toBaseAmount(tx, currentTrip.baseCurrency);
          const ben = tx.beneficiaryIds || ['all'];
          const isDedicated = ben.length === 1 && ben[0] === m.id;
          const shareLabel = isDedicated ? '🎯 個人專屬' : (ben.includes('all') ? '👨‍👩‍👧‍👦 全家共享均分' : `👥 ${ben.length}人分攤`);
          const payerName = members.find((mem) => mem.id === tx.payerId)?.name || '夥伴';

          txDetailsHtml += `
            <div class="member-tx-row">
              <div class="member-tx-left">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span class="badge" style="font-size:0.68rem; background:${isDedicated ? '#EBF5EB' : '#F0F4F8'}; color:${isDedicated ? 'var(--forest-green)' : 'var(--text-muted)'}; padding: 1px 6px; border-radius: 4px;">${shareLabel}</span>
                  <span class="member-tx-title">${escapeHtml(tx.notes || tx.category)}</span>
                </div>
                <span class="member-tx-meta">${tx.datetime?.slice(5, 16) || ''} · 由 ${escapeHtml(payerName)} 付款</span>
              </div>
              <div class="member-tx-right">
                <div class="member-tx-amt-base">NT$ ${formatNumber(baseAmt)}</div>
              </div>
            </div>
          `;
        });

        const card = document.createElement('div');
        card.className = 'member-expense-card';
        card.innerHTML = `
          <div class="member-expense-header">
            <div class="member-info-left">
              <span class="member-avatar-badge">${m.avatar || '👤'}</span>
              <div>
                <div class="member-name-text">${escapeHtml(m.name)} <span class="member-role-tag">(${m.role || '夥伴'})</span></div>
                <div class="member-count-sub">個人專屬 NT$ ${formatNumber(dedicatedAmt)} · 相關共 ${allInvolvedTxs.length} 筆</div>
              </div>
            </div>
            <div class="member-info-right">
              <div class="member-total-amount" style="color: var(--forest-dark);">NT$ ${formatNumber(memberRealCost)}</div>
              <div class="member-total-pct">佔全團花費 ${pct}%</div>
            </div>
          </div>

          <div class="bar-chart-track" style="margin: 8px 0 6px 0;">
            <div class="bar-chart-fill" style="width: ${pct}%; background: ${m.color || '#3D6B4F'};"></div>
          </div>

          <div style="display: flex; gap: 8px; font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
            <span>🎯 專屬消費：<strong>NT$ ${formatNumber(dedicatedAmt)}</strong></span>
            <span>·</span>
            <span>👨‍👩‍👧‍👦 共享均分：<strong>NT$ ${formatNumber(Math.max(0, memberRealCost - dedicatedAmt))}</strong></span>
          </div>

          ${allInvolvedTxs.length > 0 ? `
            <button type="button" class="btn-toggle-member-details" data-expanded="false" style="margin-top: 6px;">
              <span>📋 查看花費明細 (${allInvolvedTxs.length} 筆)</span>
              <span class="toggle-icon">▾</span>
            </button>
            <div class="member-tx-details-list" style="display: none;">
              ${txDetailsHtml}
            </div>
          ` : ''}
        `;

        const toggleBtn = card.querySelector('.btn-toggle-member-details');
        if (toggleBtn) {
          const detailsList = card.querySelector('.member-tx-details-list');
          const toggleIcon = card.querySelector('.toggle-icon');
          toggleBtn.onclick = () => {
            const isExpanded = toggleBtn.getAttribute('data-expanded') === 'true';
            if (isExpanded) {
              detailsList.style.display = 'none';
              toggleBtn.setAttribute('data-expanded', 'false');
              toggleIcon.textContent = '▾';
            } else {
              detailsList.style.display = 'flex';
              toggleBtn.setAttribute('data-expanded', 'true');
              toggleIcon.textContent = '▴';
            }
          };
        }

        el.chartContainerBeneficiary.appendChild(card);
      });

      // 額外展示全家共享大宗消費彙整卡 (住宿、租車、全體餐點)
      const familySharedTxs = currentTransactions.filter((t) => {
        return t.type === 'expense' && (t.beneficiaryIds || ['all']).includes('all');
      });
      const familySharedTotal = familySharedTxs.reduce((sum, tx) => sum + toBaseAmount(tx, currentTrip.baseCurrency), 0);
      const sharedPct = total > 0 ? Math.round((familySharedTotal / total) * 100) : 0;

      if (familySharedTxs.length > 0) {
        let sharedDetailsHtml = '';
        familySharedTxs.forEach((tx) => {
          const baseAmt = toBaseAmount(tx, currentTrip.baseCurrency);
          const payerName = members.find((mem) => mem.id === tx.payerId)?.name || '夥伴';
          sharedDetailsHtml += `
            <div class="member-tx-row">
              <div class="member-tx-left">
                <span class="member-tx-title">${escapeHtml(tx.notes || tx.category)}</span>
                <span class="member-tx-meta">${tx.datetime?.slice(5, 16) || ''} · 由 ${escapeHtml(payerName)} 支付</span>
              </div>
              <div class="member-tx-right">
                <div class="member-tx-amt-base">NT$ ${formatNumber(baseAmt)}</div>
              </div>
            </div>
          `;
        });

        const sharedCard = document.createElement('div');
        sharedCard.className = 'member-expense-card';
        sharedCard.style.border = '1.5px dashed #C8DEC9';
        sharedCard.style.background = '#F9FBF8';
        sharedCard.innerHTML = `
          <div class="member-expense-header">
            <div class="member-info-left">
              <span class="member-avatar-badge" style="background: #EAF3E8; color: var(--forest-green);">👨‍👩‍👧‍👦</span>
              <div>
                <div class="member-name-text">全家共享消費 (公用開銷)</div>
                <div class="member-count-sub">住宿、包車、全體大餐等共 ${familySharedTxs.length} 筆</div>
              </div>
            </div>
            <div class="member-info-right">
              <div class="member-total-amount" style="color: var(--forest-green);">NT$ ${formatNumber(familySharedTotal)}</div>
              <div class="member-total-pct">佔全團 ${sharedPct}%</div>
            </div>
          </div>

          <div class="bar-chart-track" style="margin: 8px 0 6px 0;">
            <div class="bar-chart-fill" style="width: ${sharedPct}%; background: var(--forest-green);"></div>
          </div>

          <button type="button" class="btn-toggle-member-details" data-expanded="false" style="margin-top: 6px;">
            <span>📋 查看全家共享明細 (${familySharedTxs.length} 筆)</span>
            <span class="toggle-icon">▾</span>
          </button>
          <div class="member-tx-details-list" style="display: none;">
            ${sharedDetailsHtml}
          </div>
        `;

        const sToggleBtn = sharedCard.querySelector('.btn-toggle-member-details');
        if (sToggleBtn) {
          const sDetailsList = sharedCard.querySelector('.member-tx-details-list');
          const sToggleIcon = sharedCard.querySelector('.toggle-icon');
          sToggleBtn.onclick = () => {
            const isExpanded = sToggleBtn.getAttribute('data-expanded') === 'true';
            if (isExpanded) {
              sDetailsList.style.display = 'none';
              sToggleBtn.setAttribute('data-expanded', 'false');
              sToggleIcon.textContent = '▾';
            } else {
              sDetailsList.style.display = 'flex';
              sToggleBtn.setAttribute('data-expanded', 'true');
              sToggleIcon.textContent = '▴';
            }
          };
        }

        el.chartContainerBeneficiary.appendChild(sharedCard);
      }
    }
  }

  // 4. 支付方式與具體卡片統計 (升級為帶百分比進度條的核對工具)
  if (el.paymentMethodsContainer) {
    el.paymentMethodsContainer.innerHTML = '';
    const cardStats = {}; // { [cardName]: { amt: 0, count: 0 } }

    currentTransactions.filter((t) => t.type === 'expense').forEach((tx) => {
      const key = tx.paymentItemName || (PAYMENT_CATEGORIES[tx.paymentMethod]?.label || '其他支付');
      const amt = toBaseAmount(tx, currentTrip.baseCurrency);
      if (!cardStats[key]) {
        cardStats[key] = { amt: 0, count: 0 };
      }
      cardStats[key].amt += amt;
      cardStats[key].count += 1;
    });

    const cardKeys = Object.keys(cardStats).filter((k) => cardStats[k].amt > 0);
    if (cardKeys.length === 0) {
      el.paymentMethodsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px 0;">
          尚未有刷卡或支付紀錄
        </div>
      `;
    } else {
      // 依金額降冪排序
      cardKeys.sort((a, b) => cardStats[b].amt - cardStats[a].amt).forEach((cardName) => {
        const item = cardStats[cardName];
        const pct = total > 0 ? Math.round((item.amt / total) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'bar-chart-row';
        row.innerHTML = `
          <div class="bar-chart-header">
            <span>💳 ${escapeHtml(cardName)} <span style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">(${item.count}筆 · ${pct}%)</span></span>
            <span style="font-family:var(--font-number); font-weight:800;">NT$ ${formatNumber(item.amt)}</span>
          </div>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width: ${pct}%; background: var(--forest-green);"></div>
          </div>
        `;
        el.paymentMethodsContainer.appendChild(row);
      });
    }
  }

  // 5. 城市支出 (升級為帶百分比進度條的足跡分析)
  if (el.cityExpensesContainer) {
    el.cityExpensesContainer.innerHTML = '';
    const cityKeys = Object.keys(summary.byCity || {}).filter((c) => summary.byCity[c] > 0);

    if (cityKeys.length === 0) {
      el.cityExpensesContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px 0;">
          尚未有各城市花費紀錄
        </div>
      `;
    } else {
      cityKeys.sort((a, b) => summary.byCity[b] - summary.byCity[a]).forEach((cityName) => {
        const amt = summary.byCity[cityName];
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'bar-chart-row';
        row.innerHTML = `
          <div class="bar-chart-header">
            <span>📍 ${escapeHtml(cityName)} <span style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">(${pct}%)</span></span>
            <span style="font-family:var(--font-number); font-weight:800;">NT$ ${formatNumber(amt)}</span>
          </div>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width: ${pct}%; background: #2C73D2;"></div>
          </div>
        `;
        el.cityExpensesContainer.appendChild(row);
      });
    }
  }

  // 確保切換狀態正確
  switchChartTab(currentChartTab);
}

function renderActiveTab() {
  el.tabTimeline.style.display = activeTab === 'timeline' ? 'block' : 'none';
  el.tabAnalytics.style.display = activeTab === 'analytics' ? 'block' : 'none';
  el.tabWallets.style.display = activeTab === 'wallets' ? 'block' : 'none';
  if (el.tabSettings) el.tabSettings.style.display = activeTab === 'settings' ? 'block' : 'none';

  // 同步更新底部導航按鈕 active 樣式
  el.bottomNavItems.forEach((btn) => {
    if (btn.getAttribute('data-tab') === activeTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (activeTab === 'timeline') renderTimeline();
  if (activeTab === 'analytics') renderAnalytics();
  if (activeTab === 'wallets') renderWallets();
  if (activeTab === 'settings') renderSettings();
}

/**
 * 🌟 渲染項目與卡片設定管理中心 (Settings Tab)
 */
function renderSettings() {
  if (!el.settingsPaymentList) return;

  // 1. 支付方式與信用卡清單 (依大類別分組分類展示，條理分明)
  if (el.settingsPaymentList) {
    el.settingsPaymentList.innerHTML = '';
    const paymentItems = Storage.getPaymentItems();

    // 定義大類分組設定與說明
    const categoryConfigs = [
      { key: 'credit_card', label: '信用卡', icon: '💳', note: '海外消費、實體卡與專屬回饋' },
      { key: 'transit_card', label: '交通卡', icon: '🐧', note: '地鐵、超商、巴士快速感應票卡' },
      { key: 'mobile_pay', label: '行動支付', icon: '📲', note: '手機感應與掃碼行動支付' },
      { key: 'cash', label: '現金錢包', icon: '💵', note: '外幣現金與台幣零用金' },
      { key: 'bank_transfer', label: '銀行轉帳', icon: '🏦', note: '機票、訂房與行前付清' }
    ];

    // 渲染上方快速分類篩選標籤
    if (el.paymentFilterChips) {
      el.paymentFilterChips.innerHTML = '';

      // 全部標籤
      const allChip = document.createElement('button');
      allChip.type = 'button';
      allChip.className = `payment-filter-chip ${currentPaymentCategoryFilter === 'all' ? 'active' : ''}`;
      allChip.textContent = `🌸 全部 (${paymentItems.length})`;
      allChip.onclick = () => {
        currentPaymentCategoryFilter = 'all';
        renderSettings();
      };
      el.paymentFilterChips.appendChild(allChip);

      // 各分類標籤
      categoryConfigs.forEach((cfg) => {
        const count = paymentItems.filter((it) => (it.category || 'credit_card') === cfg.key).length;
        if (count > 0) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `payment-filter-chip ${currentPaymentCategoryFilter === cfg.key ? 'active' : ''}`;
          chip.textContent = `${cfg.icon} ${cfg.label} (${count})`;
          chip.onclick = () => {
            currentPaymentCategoryFilter = cfg.key;
            renderSettings();
          };
          el.paymentFilterChips.appendChild(chip);
        }
      });
    }

    // 分組分類渲染
    categoryConfigs.forEach((cfg) => {
      // 若當前有篩選特定類別且不是該類別，則跳過
      if (currentPaymentCategoryFilter !== 'all' && currentPaymentCategoryFilter !== cfg.key) {
        return;
      }

      const itemsInCat = paymentItems.filter((it) => (it.category || 'credit_card') === cfg.key);
      if (itemsInCat.length === 0 && currentPaymentCategoryFilter !== cfg.key) {
        return; // 若該分類無項目且非選中分類，不顯示空區塊
      }

      const groupEl = document.createElement('details');
      groupEl.className = 'payment-category-group';
      groupEl.open = true;

      // 分組標題 (支援折疊與展開，清爽美觀)
      groupEl.innerHTML = `
        <summary class="payment-category-header">
          <div class="payment-cat-title-wrap">
            <span class="payment-cat-title">${cfg.icon} ${cfg.label}</span>
            <span class="payment-cat-count-badge">${itemsInCat.length} 項</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="payment-cat-note">${cfg.note}</span>
            <span class="group-toggle-arrow">▾</span>
          </div>
        </summary>
        <div class="payment-group-cards" style="margin-top: 8px;"></div>
      `;

      const cardsContainer = groupEl.querySelector('.payment-group-cards');

      if (itemsInCat.length === 0) {
        cardsContainer.innerHTML = `
          <div style="font-size: 0.78rem; color: var(--text-muted); text-align: center; padding: 10px 0;">
            尚未新增此類別卡片，可點擊上方「＋ 新增卡片」加入
          </div>
        `;
      } else {
        itemsInCat.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'settings-payment-card';
          card.innerHTML = `
            <div class="settings-card-info">
              <div class="settings-card-icon">${item.icon || cfg.icon || '💳'}</div>
              <div>
                <div class="settings-card-title">${escapeHtml(item.name)}</div>
                <div class="settings-card-note">${escapeHtml(item.note || '支援記帳與統計')}</div>
              </div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button type="button" class="btn-icon-subtle btn-del-pay-item" style="color: var(--danger); font-size: 0.75rem;" title="刪除此卡片">
                🗑️ 刪除
              </button>
            </div>
          `;

          card.querySelector('.btn-del-pay-item').onclick = () => {
            if (paymentItems.length <= 1) {
              alert('請至少保留一種支付方式喔！');
              return;
            }
            if (confirm(`確定要刪除「${item.name}」嗎？`)) {
              Storage.deletePaymentItem(item.id);
              renderPaymentSelectOptions();
              renderSettings();
            }
          };

          cardsContainer.appendChild(card);
        });
      }

      el.settingsPaymentList.appendChild(groupEl);
    });
  }
}

/**
 * 🌟 旅程帳本管理：開啟新增帳本視窗
 */
function openAddTripModal() {
  el.tripForm.reset();
  el.editTripId.value = '';
  el.tripModalTitle.textContent = '🌱 建立新的冒險帳本';
  el.deleteTripBtn.style.display = 'none';

  const now = new Date();
  const future = new Date(Date.now() + 86400000 * 6);
  const pad = (n) => String(n).padStart(2, '0');
  el.tripStartDateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  el.tripEndDateInput.value = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;

  el.tripTitleInput.value = '🇯🇵 沖繩放鬆自駕 2027';
  el.tripTargetCurrencyInput.value = 'JPY';
  el.tripBaseCurrencyInput.value = 'TWD';
  el.tripCitiesInput.value = '那霸, 美國村, 名護, 恩納';
  el.tripBudgetInput.value = '80000';

  const defaultMembers = [
    { id: 'm_' + Date.now() + '_1', name: '爸爸', role: '我', pikminType: 'red' },
    { id: 'm_' + Date.now() + '_2', name: '媽媽', role: '太太', pikminType: 'pink' },
    { id: 'm_' + Date.now() + '_3', name: '大寶', role: '小孩', pikminType: 'blue' },
    { id: 'm_' + Date.now() + '_4', name: '二寶', role: '小孩', pikminType: 'yellow' }
  ];
  renderTripMembersEditor(defaultMembers);

  el.tripModal.classList.add('open');
  setTimeout(() => el.tripTitleInput.focus(), 150);
}

/**
 * 🌟 旅程帳本管理：開啟編輯帳本視窗 (支援指定帳本或當前帳本)
 */
function openEditTripModal(targetTrip = null) {
  let tripToEdit = currentTrip;
  if (targetTrip && typeof targetTrip === 'object' && targetTrip.id) {
    tripToEdit = targetTrip;
  } else if (typeof targetTrip === 'string') {
    const found = Storage.getTrips().find((t) => t.id === targetTrip);
    if (found) tripToEdit = found;
  }

  if (!tripToEdit) return;

  el.tripForm.reset();
  el.editTripId.value = tripToEdit.id;
  el.tripModalTitle.textContent = `✏️ 編輯「${tripToEdit.title}」帳本設定`;

  const trips = Storage.getTrips();
  el.deleteTripBtn.style.display = trips.length > 1 ? 'block' : 'none';

  el.tripTitleInput.value = tripToEdit.title;
  el.tripTargetCurrencyInput.value = tripToEdit.targetCurrency || 'JPY';
  el.tripBaseCurrencyInput.value = tripToEdit.baseCurrency || 'TWD';
  el.tripStartDateInput.value = tripToEdit.startDate || '';
  el.tripEndDateInput.value = tripToEdit.endDate || '';
  el.tripCitiesInput.value = (tripToEdit.cities || []).join(', ');
  el.tripBudgetInput.value = tripToEdit.totalBudget || 100000;

  renderTripMembersEditor(tripToEdit.members || []);
  el.tripModal.classList.add('open');
}

/**
 * 🗺️ 渲染「冒險帳本管理中心」清單 (一站式切換、編輯與刪除)
 */
function renderTripManagerList() {
  if (!el.tripManagerList) return;
  el.tripManagerList.innerHTML = '';

  const trips = Storage.getTrips();
  const activeTrip = Storage.getActiveTrip() || trips[0];

  trips.forEach((trip) => {
    const isCurrent = trip.id === activeTrip.id;
    const card = document.createElement('div');
    card.className = `trip-manager-card ${isCurrent ? 'active' : ''}`;

    const citySummary = (trip.cities || []).slice(0, 3).join(' · ');
    const memberCount = (trip.members || []).length;
    const dateRange = (trip.startDate && trip.endDate) ? `${trip.startDate} ~ ${trip.endDate}` : '尚未設定日期';

    card.innerHTML = `
      <div class="trip-manager-main">
        <div class="trip-manager-header-row">
          <div class="trip-manager-title-wrap">
            <h4 class="trip-manager-title">${trip.title}</h4>
            ${isCurrent ? '<span class="trip-current-badge">✨ 當前使用中</span>' : ''}
          </div>
          <div class="trip-manager-currency-tag">${trip.targetCurrency || 'JPY'}</div>
        </div>

        <div class="trip-manager-meta">
          <span>📅 ${dateRange}</span>
          ${citySummary ? `<span>📍 ${citySummary}</span>` : ''}
          <span>👥 ${memberCount} 位探險隊員</span>
          <span>💰 預算 NT$ ${formatNumber(trip.totalBudget || 0)}</span>
        </div>
      </div>

      <div class="trip-manager-actions">
        ${!isCurrent ? `<button type="button" class="btn-tm-switch" data-trip-id="${trip.id}">切換至此帳本 ➔</button>` : ''}
        <button type="button" class="btn-tm-edit" data-trip-id="${trip.id}">✏️ 編輯</button>
        ${trips.length > 1 ? `<button type="button" class="btn-tm-delete" data-trip-id="${trip.id}">🗑️ 刪除</button>` : ''}
      </div>
    `;

    // 切換按鈕
    const switchBtn = card.querySelector('.btn-tm-switch');
    if (switchBtn) {
      switchBtn.onclick = (e) => {
        e.stopPropagation();
        Storage.setActiveTripId(trip.id);
        if (el.tripManagerModal) el.tripManagerModal.classList.remove('open');
        loadTripData();
      };
    }

    // 點擊卡片本體切換
    const mainWrap = card.querySelector('.trip-manager-main');
    if (mainWrap) {
      mainWrap.onclick = () => {
        if (!isCurrent) {
          Storage.setActiveTripId(trip.id);
          if (el.tripManagerModal) el.tripManagerModal.classList.remove('open');
          loadTripData();
        }
      };
    }

    // 編輯按鈕
    const editBtn = card.querySelector('.btn-tm-edit');
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        if (el.tripManagerModal) el.tripManagerModal.classList.remove('open');
        openEditTripModal(trip);
      };
    }

    // 刪除按鈕
    const deleteBtn = card.querySelector('.btn-tm-delete');
    if (deleteBtn) {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`確定要刪除「${trip.title}」帳本及其所有紀錄嗎？\n此動作無法復原！`)) {
          Storage.deleteTrip(trip.id);

          const family = getCurrentFamily();
          const familyId = family ? (family.id || family.familyId) : null;
          if (familyId) {
            deleteCloudTrip(familyId, trip.id);
          }

          const remainingTrips = Storage.getTrips();
          if (trip.id === activeTrip.id && remainingTrips.length > 0) {
            Storage.setActiveTripId(remainingTrips[0].id);
          }
          loadTripData();
          renderTripManagerList();
        }
      };
    }

    el.tripManagerList.appendChild(card);
  });
}

/**
 * 渲染探險成員編輯清單
 */
function renderTripMembersEditor(membersList) {
  el.tripMembersEditorContainer.innerHTML = '';
  membersList.forEach((m) => {
    addMemberRow(m);
  });
}

function addMemberRow(memberData = null) {
  const row = document.createElement('div');
  row.className = 'member-edit-card member-edit-row';

  const mId = memberData?.id || 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const mName = memberData?.name || '';
  const mRole = memberData?.role || '家人';
  const mPikmin = memberData?.pikminType || 'red';

  row.innerHTML = `
    <input type="hidden" class="member-id" value="${mId}">
    <div class="member-card-line1">
      <div style="flex: 1.2;">
        <span class="member-field-label">成員稱呼 *</span>
        <input type="text" class="member-name form-input" placeholder="例如：爸爸、大寶" value="${mName}" required>
      </div>
      <div style="flex: 1;">
        <span class="member-field-label">家庭角色</span>
        <input type="text" class="member-role form-input" placeholder="例如：我、小孩" value="${mRole}">
      </div>
    </div>
    <div class="member-card-line2">
      <div style="flex: 1;">
        <span class="member-field-label">代表皮克敏夥伴</span>
        <select class="member-pikmin form-select">
          ${Object.values(PIKMIN_TYPES).map((p) => `<option value="${p.id}" ${p.id === mPikmin ? 'selected' : ''}>${p.badge} ${p.name} (${p.roleTitle || ''})</option>`).join('')}
        </select>
      </div>
      <button type="button" class="btn-del-member" title="移除此成員">
        🗑️ 移除
      </button>
    </div>
  `;

  row.querySelector('.btn-del-member').onclick = () => {
    if (el.tripMembersEditorContainer.children.length > 1) {
      row.style.opacity = '0';
      row.style.transform = 'scale(0.96)';
      setTimeout(() => row.remove(), 160);
    } else {
      alert('至少需要保留一位探險隊員喔！');
    }
  };

  el.tripMembersEditorContainer.appendChild(row);
}

/**
 * 🌟 智慧判定預設付款人：依據 Google 帳號身分自動對應
 * - 爸爸登入：預設選擇「爸爸」
 * - 媽媽登入：預設選擇「媽媽」
 */
function getAutoPayerIdForCurrentUser() {
  const members = currentTrip?.members || [];
  if (members.length === 0) return '';

  const user = getCurrentUser();
  const family = getCurrentFamily();

  if (user && family) {
    if (user.uid === family.creatorUid) {
      // 爸爸 (家庭建立者)
      const dad = members.find(m => m.role === '我' || m.role === '爸爸' || m.name?.includes('爸爸') || m.name?.includes('我') || (user.displayName && m.name?.includes(user.displayName)));
      if (dad) return dad.id;
    } else {
      // 媽媽 / 太太 (受邀加入者)
      const mom = members.find(m => m.role === '太太' || m.role === '媽媽' || m.name?.includes('媽媽') || m.name?.includes('太太') || (user.displayName && m.name?.includes(user.displayName)));
      if (mom) return mom.id;
    }
  }

  const fallback = members.find(m => m.role === '我' || m.role === '爸爸') || members[0];
  return fallback?.id || '';
}

/**
 * 開啟支出輸入彈窗
 */
function openAddExpenseModal() {
  el.expenseForm.reset();
  el.editExpenseId.value = '';
  el.expenseModalTitle.textContent = '🌱 記一筆旅行支出';
  el.deleteExpenseBtn.style.display = 'none';
  el.expenseCustomRate.value = '';
  el.customRateRow.style.display = 'none';
  currentPhotoAttachment = null;
  resetPhotoPreview();

  // 清除標籤選取與搜尋框
  if (el.tagSearchInput) el.tagSearchInput.value = '';
  renderTagChipsSelector('', []);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  el.expenseDatetime.value = localIso;

  el.expenseCurrency.value = currentTrip.targetCurrency || 'JPY';

  // 記憶回填
  const cache = Storage.getLastInputCache();
  if (cache) {
    if (cache.category) el.expenseCategory.value = cache.category;
    if (cache.currency) el.expenseCurrency.value = cache.currency;
    if (cache.city) el.expenseCity.value = cache.city;
    if (cache.paymentItemId) {
      renderPaymentSelectOptions(cache.paymentItemId);
    } else {
      renderPaymentSelectOptions();
    }
  } else {
    renderPaymentSelectOptions();
  }

  // 🌟 智慧預設付款人：根據當前登入身分自動判定（爸爸登入預設爸爸，媽媽登入預設媽媽）
  const autoPayerId = getAutoPayerIdForCurrentUser();
  if (autoPayerId) {
    el.expensePayer.value = autoPayerId;
  } else if (cache?.payerId) {
    el.expensePayer.value = cache.payerId;
  }

  setExpenseMode(false);
  if (el.expenseStayDate) el.expenseStayDate.value = '';
  renderBeneficiarySelector(['all']);
  updateLiveConversion();

  el.expenseModal.classList.add('open');
  setTimeout(() => el.expenseAmount.focus(), 150);
}

function openEditExpenseModal(tx) {
  el.editExpenseId.value = tx.id;
  el.expenseModalTitle.textContent = '✏️ 編輯旅行支出';
  el.deleteExpenseBtn.style.display = 'block';

  el.expenseAmount.value = tx.amount;
  el.expenseCurrency.value = tx.currency;
  el.expenseCategory.value = tx.category;
  el.expenseCity.value = tx.city;
  el.expensePayer.value = tx.payerId;
  el.expenseDatetime.value = tx.datetime;
  el.expenseNotes.value = tx.notes || '';
  el.actualBilledAmount.value = tx.actualBilledAmount || '';

  // 匯率
  if (tx.exchangeRate) {
    el.expenseCustomRate.value = tx.exchangeRate;
  } else {
    el.expenseCustomRate.value = '';
  }
  el.customRateRow.style.display = 'none';

  // 標籤回填與搜尋框重設
  if (el.tagSearchInput) el.tagSearchInput.value = '';
  renderTagChipsSelector('', tx.tags || []);

  // 具體支付工具 / 卡片選取
  renderPaymentSelectOptions(tx.paymentItemId);

  setExpenseMode(!!tx.isPrepaid);
  if (el.expenseStayDate) {
    el.expenseStayDate.value = tx.expenseDate || '';
  }
  renderBeneficiarySelector(tx.beneficiaryIds || ['all']);
  updateLiveConversion();

  if (tx.photoThumbnail) {
    el.photoPlaceholder.style.display = 'none';
    el.photoPreviewContainer.style.display = 'flex';
    el.photoPreviewImg.src = tx.photoThumbnail;
  } else {
    resetPhotoPreview();
  }

  el.expenseModal.classList.add('open');
}

function setExpenseMode(isPrepaid) {
  if (isPrepaid) {
    el.btnModePrepaid.classList.add('active');
    el.btnModeOnTrip.classList.remove('active');
  } else {
    el.btnModeOnTrip.classList.add('active');
    el.btnModePrepaid.classList.remove('active');
  }
  const hint = document.getElementById('prepaidHint');
  if (hint) {
    hint.style.display = isPrepaid ? 'block' : 'none';
  }
  if (el.prepaidExpenseDateGroup) {
    el.prepaidExpenseDateGroup.style.display = isPrepaid ? 'block' : 'none';
  }
}

/**
 * 🎯 渲染「花在誰身上？」(Beneficiary) 選擇膠囊群組
 * 🌟 核心保證：100% 依據當前帳本成員 currentTrip.members (帳本設定幾人就幾人，完美同步)
 */
function renderBeneficiarySelector(selectedIds = ['all']) {
  if (!el.beneficiaryMemberChips) return;
  el.beneficiaryMemberChips.innerHTML = '';

  const isAll = !selectedIds || selectedIds.length === 0 || selectedIds.includes('all');
  if (el.btnBeneficiaryAll) {
    el.btnBeneficiaryAll.classList.toggle('active', isAll);
  }

  // 🌟 嚴格只讀取當前帳本的成員名單 (例如：爸爸、媽媽、大寶、二寶)
  const members = (currentTrip?.members && currentTrip.members.length > 0)
    ? currentTrip.members
    : [{ id: 'm_me', name: '爸爸', role: '我', pikminType: 'red' }];

  members.forEach((m) => {
    const mId = m.id;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.style.cssText = 'padding: 4px 10px; font-size: 0.76rem; font-weight: 700; border-radius: 20px;';
    chip.dataset.memberId = mId;

    const isSelected = !isAll && selectedIds.includes(mId);
    if (isSelected) chip.classList.add('active');

    const pikmin = PIKMIN_TYPES[m.pikminType] || { badge: '🌱' };
    chip.textContent = `${pikmin.badge} ${m.name}`;

    chip.onclick = () => {
      // 點擊成員時，取消「全家」
      if (el.btnBeneficiaryAll) el.btnBeneficiaryAll.classList.remove('active');
      chip.classList.toggle('active');

      // 若所有成員都被取消選取，自動退回「全家」
      const anyActive = el.beneficiaryMemberChips.querySelector('.filter-chip.active');
      if (!anyActive && el.btnBeneficiaryAll) {
        el.btnBeneficiaryAll.classList.add('active');
      }
    };

    el.beneficiaryMemberChips.appendChild(chip);
  });

  if (el.btnBeneficiaryAll) {
    el.btnBeneficiaryAll.onclick = () => {
      el.btnBeneficiaryAll.classList.add('active');
      el.beneficiaryMemberChips.querySelectorAll('.filter-chip.active').forEach((c) => c.classList.remove('active'));
    };
  }
}

function getSelectedBeneficiaries() {
  if (el.btnBeneficiaryAll && el.btnBeneficiaryAll.classList.contains('active')) {
    return ['all'];
  }
  const selected = [];
  el.beneficiaryMemberChips?.querySelectorAll('.filter-chip.active').forEach((c) => {
    if (c.dataset.memberId) selected.push(c.dataset.memberId);
  });
  return selected.length > 0 ? selected : ['all'];
}

function resetPhotoPreview() {
  currentPhotoAttachment = null;
  el.expensePhotoInput.value = '';
  el.photoPlaceholder.style.display = 'block';
  el.photoPreviewContainer.style.display = 'none';
  el.photoPreviewImg.src = '';
}

function openLightbox(src, caption = '') {
  el.lightboxImg.src = src;
  el.lightboxCaption.textContent = caption;
  el.photoLightboxModal.classList.add('open');
}

/**
 * 產生結算報告畫面
 */
function openReportModal() {
  const report = generateFinalTripReport(currentTrip, currentTransactions);
  const targetSymbol = CURRENCIES[report.targetCurrency]?.symbol || '¥';

  el.reportReportContent.innerHTML = `
    <div class="report-hero">
      <div style="font-size: 1.3rem; font-weight: 800; color: #FFF; margin-bottom: 4px;">
        ${report.tripTitle}
      </div>
      <div style="font-size: 0.82rem; color: #D9F99D;">
        ${report.startDate} ~ ${report.endDate} · 共 ${report.days} 天探險
      </div>
      <div style="font-size: 2.2rem; font-weight: 900; color: #FEF08A; margin: 12px 0 4px;">
        NT$${formatNumber(report.totalExpenseTWD)}
      </div>
      <div style="font-size: 0.85rem; color: #FFFFFF;">
        平均每日花費 NT$${formatNumber(report.dailyAverage)}
      </div>

      <div class="report-stat-grid">
        <div class="report-stat-item">
          <div style="font-size: 0.75rem; color: #D9F99D;">✈️ 行前預付</div>
          <strong style="color: #FFF;">NT$${formatNumber(report.prepaidExpenseTWD)}</strong>
        </div>
        <div class="report-stat-item">
          <div style="font-size: 0.75rem; color: #D9F99D;">🍜 旅途即時支出</div>
          <strong style="color: #FFF;">NT$${formatNumber(report.onTripExpenseTWD)}</strong>
        </div>
      </div>
    </div>

    <!-- 現金剩餘核算卡片 -->
    <div class="metric-card" style="border-color: #FCD34D; background: #FEF3C7;">
      <span class="metric-label" style="color: #92400E;">🪙 外幣現金核對</span>
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; width: 100%;">
        <span style="font-size: 0.85rem; color: #78350F;">換匯總計：${targetSymbol}${formatNumber(report.cashExchangedTarget)}</span>
        <span style="font-size: 1.15rem; font-weight: 800; color: #B45309;">剩餘現金：${targetSymbol}${formatNumber(report.targetCashRemaining)}</span>
      </div>
    </div>

    <!-- 支付方式與卡片比例 -->
    <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch;">
      <span class="metric-label">💳 支付卡片與工具分佈</span>
      <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
        ${Object.keys(report.byPaymentMethod).map((pmKey) => {
          const amt = report.byPaymentMethod[pmKey];
          if (!amt) return '';
          const pm = PAYMENT_CATEGORIES[pmKey] || { label: pmKey, icon: '💳' };
          const pct = Math.round((amt / (report.totalExpenseTWD || 1)) * 100);
          return `
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
              <span>${pm.icon} ${pm.label} (${pct}%)</span>
              <strong>NT$${formatNumber(amt)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- 城市分佈 -->
    <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch;">
      <span class="metric-label">📍 各城市總支出</span>
      <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
        ${Object.keys(report.byCity).map((cityName) => {
          const amt = report.byCity[cityName];
          if (!amt) return '';
          return `
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
              <span>📍 ${cityName}</span>
              <strong>NT$${formatNumber(amt)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <button id="printReportBtn" class="btn-primary" style="margin-top: 8px;">
      🖨️ 列印 / 另存為 PDF 結算報告
    </button>
  `;

  document.getElementById('printReportBtn').onclick = () => window.print();
  el.reportModal.classList.add('open');
}

/**
 * 綁定所有事件監聽器
 */
function bindEvents() {
  // 🗺️ 冒險帳本管理中心 (開啟、關閉、建立新帳本)
  const openTripManager = () => {
    renderTripManagerList();
    if (el.tripManagerModal) el.tripManagerModal.classList.add('open');
  };

  // 頂部 4 大按鈕 (安裝到手機、邀請旅伴、切換帳本、Google 帳號狀態)
  if (el.btnInstallPwa) el.btnInstallPwa.onclick = handlePwaInstall;
  if (el.btnInviteMembers) el.btnInviteMembers.onclick = openInviteModal;
  if (el.btnSwitchTrip) el.btnSwitchTrip.onclick = openTripManager;
  if (el.currentTripBadge) el.currentTripBadge.onclick = openTripManager;
  if (el.btnUserAuth) el.btnUserAuth.onclick = openAccountModal;

  // 👤 帳號 Modal 操作
  if (el.closeAccountModalBtn) {
    el.closeAccountModalBtn.onclick = () => {
      if (el.accountModal) el.accountModal.classList.remove('open');
    };
  }
  if (el.btnGoogleSignIn) {
    el.btnGoogleSignIn.onclick = async () => {
      try {
        showToast('正在開啟 Google 登入...', '🌱');
        const user = await loginWithGoogle();
        showToast(`歡迎回來，${user.displayName || '旅人'}！`, '🎉');
        if (el.accountModal) el.accountModal.classList.remove('open');
      } catch (err) {
        console.error('Google 登入失敗:', err);
        showToast(`登入失敗: ${err.message}`, '⚠️');
      }
    };
  }
  if (el.btnSignOut) {
    el.btnSignOut.onclick = async () => {
      try {
        await logoutUser();
        showToast('已安全登出', '👋');
        if (el.accountModal) el.accountModal.classList.remove('open');
      } catch (err) {
        showToast('登出發生異常', '⚠️');
      }
    };
  }
  if (el.btnCopyUid) {
    el.btnCopyUid.onclick = async () => {
      if (el.authUidInput?.value) {
        try {
          await navigator.clipboard.writeText(el.authUidInput.value);
          showToast('已複製 UID', '📋');
        } catch (e) {
          el.authUidInput.select();
          document.execCommand('copy');
          showToast('已複製 UID', '📋');
        }
      }
    };
  }

  // 📦 本機歷史資料一鍵安全轉移 (Migration)
  if (el.btnStartMigration) {
    el.btnStartMigration.onclick = async () => {
      const user = getCurrentUser();
      const family = getCurrentFamily();
      if (!user || !family) {
        showToast('請先登入並確認家庭已建立', '⚠️');
        return;
      }
      try {
        showToast('🚀 正在一鍵安全備份與轉移至家庭雲端...', '📦');
        const res = await migrateLocalDataToCloud(family.id || family.familyId, user);
        showToast(`🎉 成功轉移 ${res.migratedTripsCount} 趟旅程與 ${res.migratedTxCount} 筆交易！本機已保留安全備份`, '✨');
        if (el.migrationCard) el.migrationCard.style.display = 'none';
        loadTripData();
      } catch (err) {
        console.error('資料遷移異常:', err);
        showToast('轉移異常: ' + err.message, '⚠️');
      }
    };
  }

  // 🏡 家庭建立與成員管理按鈕
  if (el.btnCreateFamilySubmit) {
    el.btnCreateFamilySubmit.onclick = async () => {
      const user = getCurrentUser();
      if (!user) {
        showToast('請先登入 Google 帳號', '⚠️');
        return;
      }
      const name = el.newFamilyNameInput?.value?.trim() || `${user.displayName || 'Wilson'} 家庭`;
      try {
        showToast('正在建立家庭帳本...', '🏡');
        const family = await createFamily({
          name,
          creatorUser: user,
          initialKids: ['大寶', '二寶']
        });
        setCurrentFamily(family);
        showToast(`🎉 成功建立【${family.name}】！`, '🏡');
        openInviteModal();
      } catch (err) {
        console.error('建立家庭失敗:', err);
        showToast('建立失敗: ' + err.message, '⚠️');
      }
    };
  }

  if (el.btnRegenerateInvite) {
    el.btnRegenerateInvite.onclick = async () => {
      const family = getCurrentFamily();
      if (family) {
        showToast('正在產生新邀請碼...', '↻');
        await refreshInviteLink(family.id || family.familyId);
        showToast('已產生新邀請連結與 QR Code', '✨');
      }
    };
  }

  if (el.btnAddKidMemberBtn) {
    el.btnAddKidMemberBtn.onclick = () => {
      if (el.addKidFormRow) {
        el.addKidFormRow.style.display = el.addKidFormRow.style.display === 'none' ? 'block' : 'none';
        if (el.kidNameInput) el.kidNameInput.focus();
      }
    };
  }

  if (el.btnCancelKidMember) {
    el.btnCancelKidMember.onclick = () => {
      if (el.addKidFormRow) el.addKidFormRow.style.display = 'none';
    };
  }

  if (el.btnSaveKidMember) {
    el.btnSaveKidMember.onclick = async () => {
      const family = getCurrentFamily();
      if (!family) return;
      const name = el.kidNameInput?.value?.trim();
      if (!name) {
        showToast('請輸入小孩姓名', '⚠️');
        return;
      }
      const pikmin = el.kidPikminSelect?.value || 'yellow';
      try {
        showToast('正在新增小孩成員...', '👶');
        await addProfileMember(family.id || family.familyId, {
          name,
          role: '小孩',
          avatar: pikmin === 'pink' ? '👧' : '👦',
          pikminType: pikmin
        });
        showToast(`已新增小孩成員：${name}`, '✨');
        if (el.kidNameInput) el.kidNameInput.value = '';
        if (el.addKidFormRow) el.addKidFormRow.style.display = 'none';
      } catch (e) {
        showToast('新增失敗: ' + e.message, '⚠️');
      }
    };
  }

  // 💌 接受邀請視窗事件
  if (el.closeJoinFamilyModalBtn) {
    el.closeJoinFamilyModalBtn.onclick = () => {
      if (el.joinFamilyModal) el.joinFamilyModal.classList.remove('open');
    };
  }

  if (el.btnJoinGoogleLogin) {
    el.btnJoinGoogleLogin.onclick = async () => {
      try {
        const user = await loginWithGoogle();
        if (user) {
          if (el.joinAuthPromptBox) el.joinAuthPromptBox.style.display = 'none';
          if (el.joinActionBox) el.joinActionBox.style.display = 'block';
          showToast(`已登入: ${user.displayName}，請點擊確認加入`, '🌱');
        }
      } catch (e) {
        showToast('登入失敗: ' + e.message, '⚠️');
      }
    };
  }

  if (el.btnConfirmJoinFamily) {
    el.btnConfirmJoinFamily.onclick = async () => {
      const user = getCurrentUser();
      if (!user) {
        if (el.joinAuthPromptBox) el.joinAuthPromptBox.style.display = 'block';
        if (el.joinActionBox) el.joinActionBox.style.display = 'none';
        return;
      }
      const pending = window.__pendingInvitation;
      if (!pending) return;

      try {
        showToast('正在加入家庭帳本...', '🏡');
        await acceptInvitation(pending.familyId, pending.inviteToken, user, pending.targetRole || '太太');
        showToast(`🎉 成功加入【${pending.familyName}】！`, '🏡');
        if (el.joinFamilyModal) el.joinFamilyModal.classList.remove('open');

        // 清理網址參數
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        window.__pendingInvitation = null;

        // 重新整理家庭資料
        refreshFamilyStatus(user);
      } catch (err) {
        console.error('加入家庭失敗:', err);
        showToast('加入家庭失敗: ' + err.message, '⚠️');
      }
    };
  }

  // 🔗 邀請旅伴 Modal 關閉與複製事件
  if (el.closeInviteModalBtn) {
    el.closeInviteModalBtn.onclick = () => {
      if (el.inviteModal) el.inviteModal.classList.remove('open');
    };
  }
  if (el.closeInviteDoneBtn) {
    el.closeInviteDoneBtn.onclick = () => {
      if (el.inviteModal) el.inviteModal.classList.remove('open');
    };
  }
  if (el.btnCopyInviteLink) {
    el.btnCopyInviteLink.onclick = copyInviteLink;
  }
  if (el.closeTripManagerModalBtn) {
    el.closeTripManagerModalBtn.onclick = () => {
      if (el.tripManagerModal) el.tripManagerModal.classList.remove('open');
    };
  }
  if (el.tripManagerCreateBtn) {
    el.tripManagerCreateBtn.onclick = () => {
      if (el.tripManagerModal) el.tripManagerModal.classList.remove('open');
      openAddTripModal();
    };
  }

  // 旅程新增與編輯按鈕
  if (el.openAddTripModalBtn) el.openAddTripModalBtn.onclick = openAddTripModal;
  if (el.editCurrentTripBtn) el.editCurrentTripBtn.onclick = () => openEditTripModal(currentTrip);
  if (el.closeTripModalBtn) el.closeTripModalBtn.onclick = () => el.tripModal.classList.remove('open');
  if (el.addMemberRowBtn) el.addMemberRowBtn.onclick = () => addMemberRow();

  // 🌟 即時換算台幣連動事件
  el.expenseAmount.oninput = updateLiveConversion;
  el.expenseCurrency.onchange = updateLiveConversion;
  el.expenseCustomRate.oninput = updateLiveConversion;

  el.btnToggleCustomRate.onclick = () => {
    const isHidden = el.customRateRow.style.display === 'none';
    el.customRateRow.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      el.expenseCustomRate.focus();
    }
  };

  el.btnResetRate.onclick = () => {
    el.expenseCustomRate.value = '';
    updateLiveConversion();
  };

/**
 * 開啟新增支付工具 Modal
 */
function openAddPaymentItemModal() {
  if (el.paymentItemForm) el.paymentItemForm.reset();
  if (el.paymentItemModal) el.paymentItemModal.classList.add('open');
  setTimeout(() => {
    if (el.newPaymentName) el.newPaymentName.focus();
  }, 150);
}

  // 🌟 自訂支付方式 / 卡片 Modal
  if (el.openAddPaymentItemBtn) el.openAddPaymentItemBtn.onclick = openAddPaymentItemModal;
  if (el.closePaymentItemModalBtn) el.closePaymentItemModalBtn.onclick = () => el.paymentItemModal.classList.remove('open');

  el.paymentItemForm.onsubmit = (e) => {
    e.preventDefault();
    const name = el.newPaymentName.value.trim();
    if (!name) return;
    const cat = el.newPaymentCategory.value;
    const note = el.newPaymentNote.value.trim();
    const icon = PAYMENT_CATEGORIES[cat]?.icon || '💳';

    const newItem = Storage.addPaymentItem({
      name,
      category: cat,
      icon,
      note
    });

    el.paymentItemModal.classList.remove('open');
    renderPaymentSelectOptions(newItem.id);
  };

  // 旅程表單送出
  el.tripForm.onsubmit = (e) => {
    e.preventDefault();
    const isEdit = !!el.editTripId.value;

    const citiesRaw = el.tripCitiesInput.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    const cities = citiesRaw.length > 0 ? citiesRaw : ['主要城市'];

    const members = [];
    el.tripMembersEditorContainer.querySelectorAll('.member-edit-row').forEach((row) => {
      const id = row.querySelector('.member-id').value;
      const name = row.querySelector('.member-name').value.trim() || '成員';
      const role = row.querySelector('.member-role').value.trim() || '家人';
      const pikminType = row.querySelector('.member-pikmin').value || 'red';
      const pikminObj = PIKMIN_TYPES[pikminType] || {};
      members.push({
        id,
        name,
        role,
        pikminType,
        pikminBadge: `${pikminObj.badge || '🌱'} ${pikminObj.name || ''}`,
        color: pikminObj.color || '#65A30D'
      });
    });

    const tripData = createTrip({
      id: isEdit ? el.editTripId.value : undefined,
      title: el.tripTitleInput.value.trim(),
      baseCurrency: el.tripBaseCurrencyInput.value,
      targetCurrency: el.tripTargetCurrencyInput.value,
      startDate: el.tripStartDateInput.value,
      endDate: el.tripEndDateInput.value,
      cities,
      totalBudget: parseFloat(el.tripBudgetInput.value) || 100000,
      members
    });

    if (isEdit) {
      Storage.updateTrip(tripData);
    } else {
      Storage.addTrip(tripData);
    }

    // 🌟 同步推播至家庭雲端 (全家設備即時更新)
    const family = getCurrentFamily();
    const familyId = family ? (family.id || family.familyId) : null;
    if (familyId) {
      saveCloudTrip(familyId, tripData);
    }

    el.tripModal.classList.remove('open');
    loadTripData();
  };

  // 刪除旅程按鈕
  el.deleteTripBtn.onclick = () => {
    const tripId = el.editTripId.value;
    if (!tripId) return;
    if (confirm(`確定要刪除「${currentTrip.title}」帳本及其所有紀錄嗎？此動作無法復原。`)) {
      Storage.deleteTrip(tripId);

      const family = getCurrentFamily();
      const familyId = family ? (family.id || family.familyId) : null;
      if (familyId) {
        deleteCloudTrip(familyId, tripId);
      }

      el.tripModal.classList.remove('open');
      loadTripData();
    }
  };

  // 🌟 底部 5 功能導航欄快捷切換
  el.bottomNavItems.forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-tab');
      if (!tab) return;
      activeTab = tab;
      renderActiveTab();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  // 圖表切換按鈕 (圓餅圖 / 分類排行 / 成員支出 / 花在誰身上)
  if (el.btnTabPie) el.btnTabPie.onclick = () => switchChartTab('pie');
  if (el.btnTabBar) el.btnTabBar.onclick = () => switchChartTab('bar');
  if (el.btnTabPayer) el.btnTabPayer.onclick = () => switchChartTab('payer');
  if (el.btnTabBeneficiary) el.btnTabBeneficiary.onclick = () => switchChartTab('beneficiary');
  if (el.btnTabMember) el.btnTabMember.onclick = () => switchChartTab('payer');

  // 🔍 時間軸搜尋輸入框與清除按鈕監聽 (全方位即時模糊搜尋)
  if (el.timelineSearchInput) {
    const handleSearchInput = (e) => {
      timelineSearchKeyword = e.target.value.trim();
      if (el.btnClearTimelineSearch) {
        el.btnClearTimelineSearch.style.display = timelineSearchKeyword ? 'flex' : 'none';
      }
      renderTimeline();
    };
    el.timelineSearchInput.addEventListener('input', handleSearchInput);
    el.timelineSearchInput.addEventListener('change', handleSearchInput);
    el.timelineSearchInput.addEventListener('search', handleSearchInput);
    el.timelineSearchInput.addEventListener('keyup', handleSearchInput);
  }
  if (el.btnClearTimelineSearch) {
    el.btnClearTimelineSearch.onclick = () => {
      if (el.timelineSearchInput) {
        el.timelineSearchInput.value = '';
        el.timelineSearchInput.focus();
      }
      el.btnClearTimelineSearch.style.display = 'none';
      timelineSearchKeyword = '';
      renderTimeline();
    };
  }

  // 常用標籤搜尋與新增監聽
  if (el.tagSearchInput) {
    el.tagSearchInput.oninput = (e) => {
      renderTagChipsSelector(e.target.value);
    };
    el.tagSearchInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddNewCustomTag();
      }
    };
  }
  if (el.btnAddCustomTagBtn) {
    el.btnAddCustomTagBtn.onclick = handleAddNewCustomTag;
  }

  // 報表頁籤總結算報告按鈕
  if (el.reportTabFinishBtn) {
    el.reportTabFinishBtn.onclick = openReportModal;
  }

  // 項目卡片設定分頁快捷按鈕
  if (el.settingsAddPaymentBtn) {
    el.settingsAddPaymentBtn.onclick = openAddPaymentItemModal;
  }
  if (el.settingsAddTripBtn) {
    el.settingsAddTripBtn.onclick = openAddTripModal;
  }
  if (el.settingsEditTripBtn) {
    el.settingsEditTripBtn.onclick = openEditTripModal;
  }

  // 🌟 記一筆按鈕 (中央凸起綠色按鈕) - 強化多重事件監聽與防呆
  const handleOpenAddExpense = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      openAddExpenseModal();
    } catch (err) {
      console.error('Error opening add expense modal:', err);
    }
  };

  if (el.fabAddExpenseBtn) {
    el.fabAddExpenseBtn.onclick = handleOpenAddExpense;
  }
  const bottomFabWrap = document.getElementById('bottomNavCenterWrapper');
  if (bottomFabWrap) {
    bottomFabWrap.onclick = handleOpenAddExpense;
  }
  if (el.closeExpenseModalBtn) {
    el.closeExpenseModalBtn.onclick = () => el.expenseModal.classList.remove('open');
  }

  // 刪除支出紀錄
  el.deleteExpenseBtn.onclick = () => {
    const txId = el.editExpenseId.value;
    if (!txId) return;
    if (confirm('確定要刪除這筆支出紀錄嗎？')) {
      Storage.deleteTransaction(txId);
      const family = getCurrentFamily();
      const familyId = family ? (family.id || family.familyId) : null;
      if (familyId && currentTrip) {
        deleteCloudTransaction(familyId, currentTrip.id, txId).catch(() => {});
      }
      el.expenseModal.classList.remove('open');
      showToast('已刪除支出紀錄', '🗑️');
      loadTripData();
    }
  };

  // 換匯與前期舊鈔登記彈窗模式切換
  function setExchangeModalMode(isSurplus) {
    if (el.exIsSurplus) el.exIsSurplus.value = isSurplus ? 'true' : 'false';

    if (isSurplus) {
      if (el.btnExModeSurplus) el.btnExModeSurplus.classList.add('active');
      if (el.btnExModeExchange) el.btnExModeExchange.classList.remove('active');
      if (el.exchangeModalTitle) el.exchangeModalTitle.textContent = '🎒 登記前期剩餘外幣 (舊鈔自備)';
      if (el.exInfoText) {
        el.exInfoText.innerHTML = '💡 <strong>這是上次旅遊留存的外幣舊鈔</strong>：直接入帳到外幣現金錢包，<strong>付出 NT$0</strong>，完全不消耗本次旅遊的台幣預算。';
      }
      if (el.exFromGroup) el.exFromGroup.style.display = 'none';
      if (el.exFromAmount) {
        el.exFromAmount.value = '0';
        el.exFromAmount.removeAttribute('required');
      }
      if (el.labelExToAmount) el.labelExToAmount.textContent = '自備外幣金額 (舊鈔面額) *';
      if (el.btnSubmitExchange) el.btnSubmitExchange.textContent = '確認存入外幣舊鈔';
      if (el.exNotes && !el.exNotes.value) el.exNotes.value = '前期旅遊留存舊鈔';
    } else {
      if (el.btnExModeExchange) el.btnExModeExchange.classList.add('active');
      if (el.btnExModeSurplus) el.btnExModeSurplus.classList.remove('active');
      if (el.exchangeModalTitle) el.exchangeModalTitle.textContent = '💱 記錄外幣現金換匯';
      if (el.exInfoText) {
        el.exInfoText.innerHTML = '換匯是把台幣資產換成外幣現金，不會扣減預算，只會增加你的外幣現金錢包餘額。';
      }
      if (el.exFromGroup) el.exFromGroup.style.display = 'flex';
      if (el.exFromAmount) {
        if (el.exFromAmount.value === '0') el.exFromAmount.value = '';
        el.exFromAmount.setAttribute('required', 'required');
      }
      if (el.labelExToAmount) el.labelExToAmount.textContent = '換得外幣金額 *';
      if (el.btnSubmitExchange) el.btnSubmitExchange.textContent = '確認儲存換匯紀錄';
      if (el.exNotes && el.exNotes.value === '前期旅遊留存舊鈔') el.exNotes.value = '';
    }
  }

  const prepareExchangeModal = (isSurplus) => {
    el.exchangeForm.reset();
    el.exToCurrency.value = currentTrip.targetCurrency || 'JPY';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    el.exDatetime.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setExchangeModalMode(isSurplus);
    el.exchangeModal.classList.add('open');
    setTimeout(() => {
      if (isSurplus) {
        if (el.exToAmount) el.exToAmount.focus();
      } else {
        if (el.exFromAmount) el.exFromAmount.focus();
      }
    }, 150);
  };

  // 開啟換匯 Modal (台幣換匯)
  if (el.openExchangeModalBtn) {
    el.openExchangeModalBtn.onclick = () => prepareExchangeModal(false);
  }
  // 開啟前期剩餘外幣舊鈔 Modal
  if (el.openSurplusModalBtn) {
    el.openSurplusModalBtn.onclick = () => prepareExchangeModal(true);
  }

  // 彈窗內部模式按鈕切換
  if (el.btnExModeExchange) {
    el.btnExModeExchange.onclick = () => setExchangeModalMode(false);
  }
  if (el.btnExModeSurplus) {
    el.btnExModeSurplus.onclick = () => setExchangeModalMode(true);
  }

  el.closeExchangeModalBtn.onclick = () => el.exchangeModal.classList.remove('open');

  // 結算與 Lightbox
  el.finishTripBtn.onclick = openReportModal;
  el.closeReportModalBtn.onclick = () => el.reportModal.classList.remove('open');
  el.closeLightboxBtn.onclick = () => el.photoLightboxModal.classList.remove('open');

  // 支出預付切換
  el.btnModeOnTrip.onclick = () => setExpenseMode(false);
  el.btnModePrepaid.onclick = () => setExpenseMode(true);

  // 照片上傳
  el.photoUploaderBox.onclick = (e) => {
    if (e.target !== el.removePhotoBtn) {
      el.expensePhotoInput.click();
    }
  };

  el.expensePhotoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      currentPhotoAttachment = { file, base64: evt.target.result };
      el.photoPreviewImg.src = evt.target.result;
      el.photoPlaceholder.style.display = 'none';
      el.photoPreviewContainer.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  };

  el.removePhotoBtn.onclick = (e) => {
    e.stopPropagation();
    resetPhotoPreview();
  };

  // 支出表單送出
  el.expenseForm.onsubmit = async (e) => {
    e.preventDefault();
    const isEditing = !!el.editExpenseId.value;
    const isPrepaid = el.btnModePrepaid.classList.contains('active');

    const selectedTags = [];
    el.tagChipsSelector.querySelectorAll('.active-tag').forEach((chip) => {
      const tagVal = chip.dataset.tag || chip.textContent.replace('#', '').replace('×', '').trim();
      if (tagVal) selectedTags.push(tagVal);
    });

    let photoId = null;
    let photoThumbnail = null;

    if (currentPhotoAttachment) {
      const photoResult = await savePhoto({
        tripId: currentTrip.id,
        file: currentPhotoAttachment.file || currentPhotoAttachment.base64,
        caption: el.expenseNotes.value
      });
      photoId = photoResult.photoId;
      photoThumbnail = photoResult.thumbnail;
    }

    // 取得選中的具體支付工具 / 卡片
    const paymentItems = Storage.getPaymentItems();
    const selectedPayItemId = el.expensePaymentMethod.value;
    const selectedPayItem = paymentItems.find((p) => p.id === selectedPayItemId) || {
      category: 'credit_card',
      name: '信用卡'
    };

    // 取得當前匯率
    const effectiveRate = getEffectiveRate(el.expenseCurrency.value);

    // 取得花費對象 (與付款人完全解耦)
    const beneficiaryIds = getSelectedBeneficiaries();
    const stayDateVal = el.expenseStayDate?.value || null;

    const family = getCurrentFamily();
    const familyId = family ? (family.id || family.familyId) : null;

    const txData = createTransaction({
      id: isEditing ? el.editExpenseId.value : undefined,
      tripId: currentTrip.id,
      familyId,
      type: 'expense',
      amount: parseFloat(el.expenseAmount.value),
      currency: el.expenseCurrency.value,
      exchangeRate: effectiveRate,
      category: el.expenseCategory.value,
      city: el.expenseCity.value,
      cityId: el.expenseCity.value,
      paymentMethod: selectedPayItem.category || 'credit_card',
      paymentItemId: selectedPayItemId,
      paymentItemName: selectedPayItem.name,
      payerId: el.expensePayer.value,
      beneficiaryIds,
      datetime: el.expenseDatetime.value,
      expenseDate: isPrepaid && stayDateVal ? stayDateVal : undefined,
      notes: el.expenseNotes.value,
      isPrepaid,
      tags: selectedTags,
      actualBilledAmount: el.actualBilledAmount.value ? parseFloat(el.actualBilledAmount.value) : null,
      photoId: photoId || (isEditing ? currentTransactions.find((t) => t.id === el.editExpenseId.value)?.photoId : null),
      photoThumbnail: photoThumbnail || (isEditing ? currentTransactions.find((t) => t.id === el.editExpenseId.value)?.photoThumbnail : null)
    });

    // 1. 本機快取儲存 (零延遲)
    Storage.saveTransaction(txData);

    // 2. 雲端同步至 Firestore
    if (familyId) {
      saveCloudTransaction(familyId, currentTrip.id, txData).catch((err) => {
        console.warn('雲端交易同步異常 (已儲存於本機):', err);
      });
    }

    el.expenseModal.classList.remove('open');
    showToast(isEditing ? '✏️ 已更新支出紀錄' : '🌱 已儲存支出紀錄');
    loadTripData();
  };

  // 換匯與舊鈔表單送出
  el.exchangeForm.onsubmit = (e) => {
    e.preventDefault();
    const isSurplus = el.exIsSurplus ? el.exIsSurplus.value === 'true' : false;
    const fromAmount = isSurplus ? 0 : (parseFloat(el.exFromAmount.value) || 0);
    const toAmount = parseFloat(el.exToAmount.value);
    const toCurrency = el.exToCurrency.value;
    const effectiveRate = fromAmount > 0 && toAmount > 0 ? fromAmount / toAmount : 0;

    const txData = createTransaction({
      tripId: currentTrip.id,
      type: 'exchange',
      amount: toAmount,
      currency: toCurrency,
      datetime: el.exDatetime.value,
      notes: el.exNotes.value || (isSurplus ? '前期留存舊鈔自備' : '外幣現金換匯'),
      exchangeData: {
        fromCurrency: 'TWD',
        fromAmount,
        toCurrency,
        toAmount,
        effectiveRate,
        isInitialSurplus: isSurplus
      }
    });

    Storage.saveTransaction(txData);
    el.exchangeModal.classList.remove('open');
    showToast(isSurplus ? '🎒 已存入前期外幣舊鈔' : '💱 已記錄外幣換匯');
    loadTripData();
  };
}

/**
 * 開啟帳號彈窗
 */
function openAccountModal() {
  if (el.accountModal) {
    el.accountModal.classList.add('open');
  }
}

/**
 * 根據登入身分更新全站 UI
 */
function updateAuthUI(user) {
  if (user) {
    // 已登入
    if (el.userAuthIcon) el.userAuthIcon.style.display = 'none';
    if (el.userAuthAvatar) {
      el.userAuthAvatar.src = user.photoURL || '';
      el.userAuthAvatar.style.display = 'block';
    }
    if (el.authLoggedOutPanel) el.authLoggedOutPanel.style.display = 'none';
    if (el.authLoggedInPanel) el.authLoggedInPanel.style.display = 'block';

    if (el.authProfileImg) el.authProfileImg.src = user.photoURL || '';
    if (el.authDisplayName) el.authDisplayName.textContent = user.displayName || '旅人';
    if (el.authEmail) el.authEmail.textContent = user.email || '';
    if (el.authUidInput) el.authUidInput.value = user.uid || '';

    // 檢查是否有尚未轉移至雲端的本機舊資料
    if (el.migrationCard) {
      const hasLocalData = checkHasLocalDataToMigrate();
      el.migrationCard.style.display = hasLocalData ? 'block' : 'none';
    }

    // 檢查離線待傳隊列筆數
    updateOfflineQueueUI();

    // 自動同步使用者所屬家庭
    refreshFamilyStatus(user);
  } else {
    // 未登入
    if (el.userAuthIcon) el.userAuthIcon.style.display = 'inline';
    if (el.userAuthAvatar) el.userAuthAvatar.style.display = 'none';
    if (el.authLoggedOutPanel) el.authLoggedOutPanel.style.display = 'block';
    if (el.authLoggedInPanel) el.authLoggedInPanel.style.display = 'none';

    if (el.authUidInput) el.authUidInput.value = '';
    if (el.migrationCard) el.migrationCard.style.display = 'none';
    setCurrentFamily(null);
  }
}

function updateOfflineQueueUI() {
  const pendingCount = getPendingOfflineCount();
  if (el.offlineQueueBadge) {
    if (pendingCount > 0) {
      el.offlineQueueBadge.style.display = 'inline-block';
      el.offlineQueueBadge.textContent = `🟠 待傳 ${pendingCount} 筆`;
    } else {
      el.offlineQueueBadge.style.display = 'none';
    }
  }
}

// 監聽連網與斷網事件，更新狀態標籤
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (el.authSyncStatusPill) el.authSyncStatusPill.textContent = '🟢 雲端同步連線中';
    updateOfflineQueueUI();
  });
  window.addEventListener('offline', () => {
    if (el.authSyncStatusPill) el.authSyncStatusPill.textContent = '🟠 目前處於離線模式';
    updateOfflineQueueUI();
  });
}

let familyUnsubscribe = null;
let familyTripsUnsubscribe = null;

/**
 * 重新整理使用者的家庭資料、成員監聽與雲端旅程帳本即時雙向同步
 */
async function refreshFamilyStatus(user) {
  if (!user) return;
  try {
    const families = await getUserFamilies(user.uid);
    if (families.length > 0) {
      const primaryFamily = families[0];
      setCurrentFamily(primaryFamily);
      const familyId = primaryFamily.id || primaryFamily.familyId;
      if (el.currentFamilyTitle) el.currentFamilyTitle.textContent = primaryFamily.name;

      // 1. 監聽家庭成員清單
      if (familyUnsubscribe) familyUnsubscribe();
      familyUnsubscribe = await listenToFamilyMembers(familyId);

      // 2. 🌟 監聽家庭所有雲端旅程帳本 (即時雙向同步，爸爸媽媽帳本完全一致)
      if (familyTripsUnsubscribe) familyTripsUnsubscribe();
      familyTripsUnsubscribe = await listenToFamilyTrips(familyId, (cloudTrips) => {
        if (cloudTrips && cloudTrips.length > 0) {
          // 將雲端帳本寫入本地 Storage
          Storage.saveTrips(cloudTrips);

          // 檢查當前選取的帳本是否存在於雲端清單中
          const currentActive = Storage.getActiveTrip();
          const existsInCloud = currentActive && cloudTrips.some((t) => t.id === currentActive.id);

          // 若當前本地 activeTrip 不在雲端 (例如媽媽剛加入時本地是「東京＋關西」，而雲端是爸爸建的「測試」帳本)
          // 自動無痛切換為雲端最新帳本！
          if (!existsInCloud) {
            Storage.setActiveTripId(cloudTrips[0].id);
          }

          loadTripData();
          if (el.tripManagerModal?.classList.contains('open')) {
            renderTripManagerList();
          }
        } else {
          // 雲端家庭尚未有旅程，自動將本機現有的旅程 (例如爸爸剛建的「測試」) 推送上雲端
          const localTrips = Storage.getTrips();
          if (localTrips && localTrips.length > 0) {
            localTrips.forEach((t) => saveCloudTrip(familyId, t));
          }
        }
      });

      // 3. 檢查本機是否有自訂帳本尚未同步到雲端 (確保爸爸建的「測試」一定會即時上傳)
      const localTrips = Storage.getTrips();
      localTrips.forEach((lt) => {
        if (lt && lt.title && lt.title !== '🇯🇵 東京＋關西 2027 春櫻冒險') {
          saveCloudTrip(familyId, lt);
          // 同步上傳該旅程本地已記下的交易 (若尚未在雲端)
          const txs = Storage.getTransactions(lt.id);
          txs.forEach((tx) => saveCloudTransaction(familyId, lt.id, tx));
        }
      });
    }
  } catch (e) {
    console.warn('載入家庭失敗:', e);
  }
}

/**
 * 檢查網址是否有邀請參數 (?invite=TOKEN&fid=FID)
 */
async function checkUrlForInvitation() {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');
  const familyId = params.get('fid');

  if (!inviteToken || !familyId) return;

  try {
    showToast('正在驗證家庭邀請...', '💌');
    const inv = await fetchInvitation(familyId, inviteToken);
    if (!inv) {
      showToast('此邀請連結已失效或不存在', '⚠️');
      return;
    }

    window.__pendingInvitation = {
      inviteToken,
      familyId,
      familyName: inv.familyName || '家庭帳本',
      inviterName: inv.inviterName || '家人',
      targetRole: inv.targetRole || '太太'
    };

    if (el.joinFamilyTitle) {
      el.joinFamilyTitle.textContent = `${inv.inviterName} 邀請您加入【${inv.familyName}】`;
    }

    const user = getCurrentUser();
    if (user) {
      if (el.joinAuthPromptBox) el.joinAuthPromptBox.style.display = 'none';
      if (el.joinActionBox) el.joinActionBox.style.display = 'block';
    } else {
      if (el.joinAuthPromptBox) el.joinAuthPromptBox.style.display = 'block';
      if (el.joinActionBox) el.joinActionBox.style.display = 'none';
    }

    if (el.joinFamilyModal) el.joinFamilyModal.classList.add('open');
  } catch (err) {
    console.warn('解析邀請錯誤:', err);
  }
}

/**
 * 啟動 App
 */
function initApp() {
  initSelectOptions();
  bindEvents();

  loadTripData();

  // 啟動 Firebase 身分驗證監聽 (不阻斷本機啟動)
  initAuth(async (user) => {
    updateAuthUI(user);
    // 檢查是否有未完成的邀請視窗狀態更新
    if (window.__pendingInvitation && el.joinFamilyModal?.classList.contains('open')) {
      if (user) {
        if (el.joinAuthPromptBox) el.joinAuthPromptBox.style.display = 'none';
        if (el.joinActionBox) el.joinActionBox.style.display = 'block';
      }
    }
  }).catch((e) => console.warn('Auth init failed:', e));

  // 檢查是否由邀請連結進入
  checkUrlForInvitation();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', initApp);
