const STORAGE_KEY = 'laakso-budget-app-v1';
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxWvQV8-5AgSDt7darDkGdSj59VKAYSjY0_lQkG14i5imfMC__XP50lq_fUMLnR2ksw/exec';

function resolveSheetId(value) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return '';
  return trimmed;
}

function resolveWebhookUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return DEFAULT_APPS_SCRIPT_URL;
}

const defaultState = {
  transactions: [],
  settings: {
    income: {
      amount: 0,
      frequency: 'monthly',
      payday: ''
    },
    budgets: {
      'Dining out': { weekly: 75, monthly: 300 },
      Groceries: { weekly: 100, monthly: 400 },
      Transportation: { weekly: 50, monthly: 200 },
      Entertainment: { weekly: 40, monthly: 150 }
    },
    overallBudget: { weekly: 300, monthly: 1200 },
    categories: ['Dining out', 'Groceries', 'Transportation', 'Entertainment', 'Utilities', 'Shopping', 'Health'],
    fixedBills: [],
    quickPresets: [
      { label: 'Coffee', amount: 4.5 },
      { label: 'Gas', amount: 40 },
      { label: 'Groceries', amount: 50 }
    ],
    webhookUrl: ''
  },
  ui: {
    theme: 'dark',
    timeframe: 'week',
    goal: null,
    goals: []
  }
};

let state = loadState();
let chartInstance = null;
let editingId = null;

const goalPresetTemplates = [
  { label: 'Emergency Fund', amount: 1000, months: 6 },
  { label: 'Student Loans', amount: 500, months: 12 },
  { label: 'Vacation', amount: 1500, months: 4 }
];

const els = {
  entryForm: document.getElementById('entryForm'),
  entryDate: document.getElementById('entryDate'),
  entryAmount: document.getElementById('entryAmount'),
  entryType: document.getElementById('entryType'),
  entryCategory: document.getElementById('entryCategory'),
  mobileAmount: document.getElementById('mobileAmount'),
  mobileType: document.getElementById('mobileType'),
  mobileCategory: document.getElementById('mobileCategory'),
  mobileNote: document.getElementById('mobileNote'),
  mobileQuickPresets: document.getElementById('mobileQuickPresets'),
  mobileSaveBtn: document.getElementById('mobileSaveBtn'),
  mobileClearBtn: document.getElementById('mobileClearBtn'),
  entryCustomCategory: document.getElementById('entryCustomCategory'),
  entryNote: document.getElementById('entryNote'),
  quickPresets: document.getElementById('quickPresets'),
  clearFormBtn: document.getElementById('clearFormBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  themeToggle: document.getElementById('themeToggle'),
  toast: document.getElementById('toast'),
  incomeSummary: document.getElementById('incomeSummary'),
  expenseSummary: document.getElementById('expenseSummary'),
  netSummary: document.getElementById('netSummary'),
  budgetLeftSummary: document.getElementById('budgetLeftSummary'),
  budgetStatusList: document.getElementById('budgetStatusList'),
  dailyAllowance: document.getElementById('dailyAllowance'),
  budgetRemaining: document.getElementById('budgetRemaining'),
  expenseChart: document.getElementById('expenseChart'),
  transactionList: document.getElementById('transactionList'),
  historyFilter: document.getElementById('historyFilter'),
  historySearch: document.getElementById('historySearch'),
  goalsForm: document.getElementById('goalsForm'),
  goalAmount: document.getElementById('goalAmount'),
  goalDate: document.getElementById('goalDate'),
  goalName: document.getElementById('goalName'),
  goalFunded: document.getElementById('goalFunded'),
  goalBudgetCategory: document.getElementById('goalBudgetCategory'),
  goalPresets: document.getElementById('goalPresets'),
  goalResult: document.getElementById('goalResult'),
  goalsDashboard: document.getElementById('goalsDashboard'),
  clearGoalBtn: document.getElementById('clearGoalBtn'),
  newBudgetCategory: document.getElementById('newBudgetCategory'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  budgetRows: document.getElementById('budgetRows'),
  fixedBillsRows: document.getElementById('fixedBillsRows'),
  presetRows: document.getElementById('presetRows'),
  addPresetBtn: document.getElementById('addPresetBtn'),
  addBillBtn: document.getElementById('addBillBtn'),
  newBillName: document.getElementById('newBillName'),
  newBillAmount: document.getElementById('newBillAmount'),
  newBillFrequency: document.getElementById('newBillFrequency'),
  exportBtn: document.getElementById('exportBtn'),
  syncSheetsBtn: document.getElementById('syncSheetsBtn'),
  importFile: document.getElementById('importFile'),
  resetBtn: document.getElementById('resetBtn'),
  overallWeeklyBudget: document.getElementById('overallWeeklyBudget'),
  overallMonthlyBudget: document.getElementById('overallMonthlyBudget'),
  incomeAmount: document.getElementById('incomeAmount'),
  incomeFrequency: document.getElementById('incomeFrequency'),
  incomePayday: document.getElementById('incomePayday'),
  webhookUrl: document.getElementById('webhookUrl')
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return JSON.parse(JSON.stringify(defaultState));
    }
    const parsed = JSON.parse(raw);
    return {
      ...JSON.parse(JSON.stringify(defaultState)),
      ...parsed,
      settings: {
        ...JSON.parse(JSON.stringify(defaultState.settings)),
        ...(parsed.settings || {})
      },
      ui: { ...defaultState.ui, ...(parsed.ui || {}) }
    };
  } catch (error) {
    console.warn('Unable to load local data, using defaults.', error);
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState(syncCloudSettings = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (syncCloudSettings) {
    syncSettingsToGoogleSheets();
  }
}

function generateId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getStartOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getStartOfMonth(date) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getDateRange(timeframe) {
  const now = new Date();
  if (timeframe === 'month') {
    return {
      start: getStartOfMonth(now),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    };
  }
  return {
    start: getStartOfWeek(now),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  };
}

function getDaysLeft(timeframe) {
  const now = new Date();
  if (timeframe === 'month') {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  }
  const end = new Date(now);
  end.setDate(now.getDate() + (7 - now.getDay()));
  return Math.max(1, Math.ceil((end - now) / (1000 * 60 * 60 * 24)) + 1);
}

function getFilteredTransactions(timeframe, type = 'all') {
  const { start, end } = getDateRange(timeframe);
  return state.transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    const inRange = date >= start && date <= end;
    const matchesType = type === 'all' ? true : transaction.type === type;
    return inRange && matchesType;
  });
}

function computeSummary(timeframe) {
  const expenses = getFilteredTransactions(timeframe, 'expense');
  const incomes = getFilteredTransactions(timeframe, 'income');
  const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.amount), 0);
  const fixedBillsTotal = (state.settings.fixedBills || []).reduce((sum, bill) => {
    const amount = Number(bill.amount || 0);
    if (bill.frequency === 'weekly') {
      return sum + amount;
    }
    return sum + (timeframe === 'month' ? amount : amount / 4.33);
  }, 0);
  const budgetLimit = timeframe === 'month'
    ? Number(state.settings.overallBudget.monthly || 0)
    : Number(state.settings.overallBudget.weekly || 0);
  const availableForSpending = Math.max(0, totalIncome - fixedBillsTotal);
  const budgetRemaining = Math.max(0, budgetLimit - totalExpenses - fixedBillsTotal);
  return {
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    budgetRemaining,
    fixedBillsTotal,
    availableForSpending,
    unallocated: Math.max(0, availableForSpending - totalExpenses),
    dailyAllowance: budgetRemaining / getDaysLeft(timeframe)
  };
}

async function init() {
  setDefaultDate();
  setDefaultGoalDate();
  bindEvents();
  restoreUIState();
  renderCategoryOptions();
  renderQuickPresets();
  renderGoalPresets();
  renderSettings();
  renderAll();
  registerServiceWorker();

  // Load cloud data & settings on startup for multi-device sync
  await loadFromGoogleSheets();

  if (els.mobileAmount) {
    els.mobileAmount.focus();
  } else if (els.entryAmount) {
    els.entryAmount.focus();
  }
}

function setDefaultDate() {
  const today = new Date().toISOString().split('T')[0];
  if (els.entryDate) {
    els.entryDate.value = today;
  }
}

function setDefaultGoalDate() {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 6);
  els.goalDate.value = nextMonth.toISOString().split('T')[0];
}

function restoreUIState() {
  document.body.dataset.theme = state.ui.theme || 'dark';
  els.themeToggle.textContent = state.ui.theme === 'dark' ? '☀️' : '🌙';
  if (state.ui.timeframe) {
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.range === state.ui.timeframe);
    });
  }
}

function bindEvents() {
  if (els.entryForm) {
    els.entryForm.addEventListener('submit', handleEntrySubmit);
  }
  if (els.clearFormBtn) {
    els.clearFormBtn.addEventListener('click', resetEntryForm);
  }
  if (els.mobileSaveBtn) {
    els.mobileSaveBtn.addEventListener('click', handleMobileQuickAdd);
  }
  if (els.mobileClearBtn) {
    els.mobileClearBtn.addEventListener('click', resetMobileQuickAdd);
  }
  if (els.settingsBtn) {
    els.settingsBtn.addEventListener('click', openSettings);
  }
  if (els.closeSettingsBtn) {
    els.closeSettingsBtn.addEventListener('click', closeSettings);
  }
  if (els.settingsModal) {
    els.settingsModal.addEventListener('click', (event) => {
      if (event.target === els.settingsModal) {
        closeSettings();
      }
    });
  }
  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', toggleTheme);
  }
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.ui.timeframe = chip.dataset.range;
      saveState();
      document.querySelectorAll('.chip').forEach((item) => {
        item.classList.toggle('active', item.dataset.range === state.ui.timeframe);
      });
      renderAll();
    });
  });
  if (els.entryType) {
    els.entryType.addEventListener('change', () => {
      renderCategoryOptions();
    });
  }
  if (els.mobileType) {
    els.mobileType.addEventListener('change', () => {
      renderCategoryOptions();
    });
  }
  els.historyFilter.addEventListener('change', renderHistory);
  els.historySearch.addEventListener('input', renderHistory);
  els.addPresetBtn.addEventListener('click', addPresetRow);
  els.addBillBtn.addEventListener('click', addFixedBill);
  els.exportBtn.addEventListener('click', exportToCsv);
  els.goalsForm.addEventListener('submit', handleGoalSubmit);
  els.clearGoalBtn.addEventListener('click', clearGoalForm);
  els.addCategoryBtn.addEventListener('click', addCustomBudgetCategory);
  els.syncSheetsBtn.addEventListener('click', async () => {
    showToast('Syncing with Google Sheets…');
    await loadFromGoogleSheets();
    await syncSettingsToGoogleSheets();
    await syncAllTransactionsToGoogleSheets();
  });
  els.importFile.addEventListener('change', importFromCsv);
  els.resetBtn.addEventListener('click', resetData);
  els.incomeAmount.addEventListener('change', () => {
    state.settings.income.amount = Number(els.incomeAmount.value || 0);
    saveState(true);
  });
  els.incomeFrequency.addEventListener('change', () => {
    state.settings.income.frequency = els.incomeFrequency.value;
    saveState(true);
  });
  els.incomePayday.addEventListener('change', () => {
    state.settings.income.payday = els.incomePayday.value;
    saveState(true);
  });
  els.overallWeeklyBudget.addEventListener('change', () => {
    state.settings.overallBudget.weekly = Number(els.overallWeeklyBudget.value || 0);
    saveState(true);
    renderAll();
  });
  els.overallMonthlyBudget.addEventListener('change', () => {
    state.settings.overallBudget.monthly = Number(els.overallMonthlyBudget.value || 0);
    saveState(true);
    renderAll();
  });
  els.webhookUrl.addEventListener('change', () => {
    state.settings.webhookUrl = els.webhookUrl.value.trim();
    saveState(true);
  });
}

function renderAll() {
  renderCategoryOptions();
  renderSummary();
  renderGoalResult();
  renderMobileQuickPresets();
  renderGoalsDashboard();
  renderBudgetHealth();
  renderChart();
  renderHistory();
  renderSettings();
  renderQuickPresets();
}

function populateCategorySelect(select, type) {
  const categories = [...new Set([...state.settings.categories, ...state.transactions.map((item) => item.type === 'expense' ? item.category : null).filter(Boolean)])];
  const options = type === 'income'
    ? ['Salary', 'Freelance', 'Refund', ...categories]
    : categories;

  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select category';
  select.appendChild(defaultOption);

  options.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom…';
  select.appendChild(customOption);
}

function renderCategoryOptions() {
  const typeValue = els.entryType?.value || els.mobileType?.value || 'expense';
  const type = typeValue === 'income' ? 'income' : 'expense';

  if (els.entryCategory) {
    populateCategorySelect(els.entryCategory, type);
  }
  if (els.mobileCategory) {
    populateCategorySelect(els.mobileCategory, type);
  }

  if (editingId && els.entryCategory) {
    const entry = state.transactions.find((item) => item.id === editingId);
    if (entry) {
      els.entryCategory.value = entry.category;
    }
  }
}

function renderQuickPresets() {
  if (!els.quickPresets) return;
  els.quickPresets.innerHTML = '';
  state.settings.quickPresets.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${preset.label} • ${formatCurrency(preset.amount)}`;
    button.addEventListener('click', () => {
      els.entryAmount.value = preset.amount;
      els.entryNote.value = preset.label;
      els.entryCategory.value = preset.category || '';
      handleEntrySubmit({ preventDefault: () => {} });
    });
    els.quickPresets.appendChild(button);
  });
}

function renderMobileQuickPresets() {
  els.mobileQuickPresets.innerHTML = '';
  state.settings.quickPresets.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${preset.label} • ${formatCurrency(preset.amount)}`;
    button.addEventListener('click', () => {
      els.mobileAmount.value = preset.amount;
      els.mobileNote.value = preset.label;
      els.mobileCategory.value = preset.category || '';
      handleMobileQuickAdd();
    });
    els.mobileQuickPresets.appendChild(button);
  });
}

function renderSummary() {
  const summary = computeSummary(state.ui.timeframe);
  els.incomeSummary.textContent = formatCurrency(summary.totalIncome);
  els.expenseSummary.textContent = formatCurrency(summary.totalExpenses);
  els.netSummary.textContent = formatCurrency(summary.net);
  els.budgetLeftSummary.textContent = formatCurrency(Math.max(0, summary.budgetRemaining));
  els.dailyAllowance.textContent = formatCurrency(summary.dailyAllowance);
  els.budgetRemaining.textContent = formatCurrency(Math.max(0, summary.budgetRemaining));
  els.budgetStatusList.innerHTML = [
    `<div class="budget-item"><div class="budget-item-top"><strong>Locked bills</strong><span>${formatCurrency(summary.fixedBillsTotal)}</span></div></div>`,
    `<div class="budget-item"><div class="budget-item-top"><strong>Available after bills</strong><span>${formatCurrency(summary.availableForSpending)}</span></div></div>`,
    `<div class="budget-item"><div class="budget-item-top"><strong>Unallocated this ${state.ui.timeframe === 'month' ? 'month' : 'week'}</strong><span>${formatCurrency(summary.unallocated)}</span></div></div>`
  ].join('');
}

function resolveBudgetLimit(category, timeframe) {
  const budget = state.settings.budgets[category] || {};
  const amount = Number(budget.amount ?? budget.weekly ?? budget.monthly ?? 0);
  const frequency = budget.frequency || (budget.monthly !== undefined && budget.weekly === undefined ? 'monthly' : (budget.weekly !== undefined && budget.monthly === undefined ? 'weekly' : 'monthly'));

  if (frequency === 'weekly') {
    return timeframe === 'week' ? amount : amount * 4.33;
  }

  return timeframe === 'month' ? amount : amount / 4.33;
}

function renderBudgetHealth() {
  const timeframe = state.ui.timeframe;
  const expenses = getFilteredTransactions(timeframe, 'expense');
  const categoryTotals = expenses.reduce((accumulator, entry) => {
    const category = entry.category || 'Uncategorized';
    accumulator[category] = (accumulator[category] || 0) + Number(entry.amount || 0);
    return accumulator;
  }, {});
  const summary = computeSummary(timeframe);

  const limitKey = timeframe === 'month' ? 'monthly' : 'weekly';
  const overallLimit = Number(state.settings.overallBudget[limitKey] || 0);
  const overallSpent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const overallPercent = overallLimit > 0 ? Math.min(100, (overallSpent / overallLimit) * 100) : 0;

  const items = Object.keys(state.settings.budgets).map((category) => {
    const limit = resolveBudgetLimit(category, timeframe);
    const spent = categoryTotals[category] || 0;
    const percent = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    let tone = 'green';
    if (percent >= 90 || spent > limit) tone = 'red';
    else if (percent >= 75) tone = 'orange';
    return { category, spent, limit, percent, tone };
  });

  const summaryItems = [
    `<div class="budget-item"><div class="budget-item-top"><strong>Locked bills</strong><span>${formatCurrency(summary.fixedBillsTotal)}</span></div></div>`,
    `<div class="budget-item"><div class="budget-item-top"><strong>Available after bills</strong><span>${formatCurrency(summary.availableForSpending)}</span></div></div>`,
    `<div class="budget-item"><div class="budget-item-top"><strong>Unallocated this ${timeframe === 'month' ? 'month' : 'week'}</strong><span>${formatCurrency(summary.unallocated)}</span></div></div>`
  ];

  const html = [
    ...summaryItems,
    `<div class="budget-item">`,
    `<div class="budget-item-top"><strong>Overall</strong><span>${formatCurrency(overallSpent)} / ${formatCurrency(overallLimit)}</span></div>`,
    `<div class="progress-track"><div class="progress-fill ${overallPercent >= 90 || overallSpent > overallLimit ? 'red' : overallPercent >= 75 ? 'orange' : 'green'}" style="width:${Math.min(100, overallPercent)}%"></div></div>`,
    `</div>`,
    ...items.map((item) => `
      <div class="budget-item">
        <div class="budget-item-top">
          <strong>${item.category}</strong>
          <span>${formatCurrency(item.spent)} / ${formatCurrency(item.limit)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${item.tone}" style="width:${Math.min(100, item.percent)}%"></div>
        </div>
      </div>
    `)
  ].join('');

  els.budgetStatusList.innerHTML = html;
}

function renderChart() {
  const timeframe = state.ui.timeframe;
  const expenses = getFilteredTransactions(timeframe, 'expense');
  const totals = expenses.reduce((accumulator, entry) => {
    const category = entry.category || 'Uncategorized';
    accumulator[category] = (accumulator[category] || 0) + Number(entry.amount || 0);
    return accumulator;
  }, {});

  const labels = Object.keys(totals);
  const data = Object.values(totals);
  const colors = ['#38bdf8', '#34d399', '#fb7185', '#f59e0b', '#818cf8', '#f472b6', '#2dd4bf'];

  if (chartInstance) {
    chartInstance.destroy();
  }

  if (!labels.length) {
    els.expenseChart.getContext('2d').clearRect(0, 0, els.expenseChart.width, els.expenseChart.height);
    return;
  }

  chartInstance = new Chart(els.expenseChart.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: 'var(--panel)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.body).getPropertyValue('--text').trim()
          }
        }
      }
    }
  });
}

function renderHistory() {
  const timeframe = state.ui.timeframe;
  const filter = els.historyFilter.value;
  const search = els.historySearch.value.toLowerCase();

  const filtered = getFilteredTransactions(timeframe, filter).filter((transaction) => {
    const haystack = `${transaction.category} ${transaction.note}`.toLowerCase();
    return haystack.includes(search);
  });

  const summary = computeSummary(timeframe);
  const historySummary = `
    <div class="history-summary-card">
      <strong>Unallocated ${timeframe === 'month' ? 'month' : 'week'} balance</strong>
      <p class="hint">${formatCurrency(summary.unallocated)} left after bills and spending</p>
    </div>
  `;

  if (!filtered.length) {
    els.transactionList.innerHTML = `${historySummary}<p class="hint">No matching transactions yet.</p>`;
    return;
  }

  els.transactionList.innerHTML = `${historySummary}${filtered
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((transaction) => `
      <div class="transaction-item">
        <div class="transaction-meta">
          <strong>${transaction.type === 'income' ? 'Income' : 'Expense'} • ${transaction.category || 'Uncategorized'}</strong>
          <span class="hint">${formatDate(transaction.date)} • ${transaction.note || 'No note'}</span>
        </div>
        <div class="transaction-actions">
          <strong>${formatCurrency(transaction.amount)}</strong>
          <button type="button" data-action="edit" data-id="${transaction.id}">Edit</button>
          <button type="button" data-action="delete" data-id="${transaction.id}">Delete</button>
        </div>
      </div>
    `)
    .join('')}`;

  els.transactionList.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      if (button.dataset.action === 'delete') {
        deleteTransaction(id);
      } else {
        startEditing(id);
      }
    });
  });
}

function renderGoalPresets() {
  els.goalPresets.innerHTML = '';
  goalPresetTemplates.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${preset.label} • ${formatCurrency(preset.amount)}`;
    button.addEventListener('click', () => {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + preset.months);
      els.goalName.value = preset.label;
      els.goalAmount.value = preset.amount;
      els.goalFunded.value = 0;
      els.goalBudgetCategory.value = 'yes';
      els.goalDate.value = targetDate.toISOString().split('T')[0];
    });
    els.goalPresets.appendChild(button);
  });
}

function renderGoalResult() {
  const goal = state.ui.goal;
  if (!goal) {
    els.goalResult.innerHTML = '<p class="hint">Enter a goal amount and target date to see your weekly/monthly pace.</p>';
    return;
  }

  const now = new Date();
  const targetDate = new Date(goal.targetDate);
  const diffDays = Math.max(1, Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24)));
  const months = Math.max(1, diffDays / 30);
  const weeks = Math.max(1, diffDays / 7);
  const monthlyTarget = goal.amount / months;
  const weeklyTarget = goal.amount / weeks;
  const remaining = Math.max(0, goal.amount - (goal.funded || 0));

  els.goalResult.innerHTML = `
    <h4>${goal.name || 'Goal'}</h4>
    <p><strong>${formatCurrency(goal.amount)}</strong> by ${formatDate(goal.targetDate)}</p>
    <p>Remaining: <strong>${formatCurrency(remaining)}</strong></p>
    <p>Monthly target: <strong>${formatCurrency(monthlyTarget)}</strong></p>
    <p>Weekly target: <strong>${formatCurrency(weeklyTarget)}</strong></p>
    <p class="hint">Based on ${diffDays} days remaining.</p>
  `;
}

function renderGoalsDashboard() {
  const goals = state.ui.goals || [];
  if (!goals.length) {
    els.goalsDashboard.innerHTML = '<p class="hint">Save a goal to see a progress dashboard here.</p>';
    return;
  }

  els.goalsDashboard.innerHTML = goals.map((goal) => {
    const progress = Math.min(100, (goal.funded / goal.amount) * 100 || 0);
    const remaining = Math.max(0, goal.amount - goal.funded);
    const weeklyTarget = goal.amount > 0 ? goal.amount / Math.max(1, Math.ceil((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 7))) : 0;
    const budgetText = goal.budgetAsCategory ? `Budget category: ${formatCurrency(weeklyTarget)}/week` : 'Not budgeted as a category';
    return `
      <div class="goal-dashboard-item">
        <div class="budget-item-top">
          <strong>${goal.name}</strong>
          <span>${formatCurrency(goal.funded)} / ${formatCurrency(goal.amount)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${progress >= 100 ? 'green' : progress >= 75 ? 'orange' : 'green'}" style="width:${progress}%"></div>
        </div>
        <p class="hint">${formatCurrency(remaining)} remaining • ${goal.type || 'goal'}</p>
        <span class="goal-budget-pill">${budgetText}</span>
      </div>
    `;
  }).join('');
}

function renderSettings() {
  const { income } = state.settings;
  els.incomeAmount.value = income.amount || 0;
  els.incomeFrequency.value = income.frequency || 'monthly';
  els.incomePayday.value = income.payday || '';
  els.overallWeeklyBudget.value = state.settings.overallBudget.weekly || 0;
  els.overallMonthlyBudget.value = state.settings.overallBudget.monthly || 0;
  els.webhookUrl.value = state.settings.webhookUrl || '';

  els.budgetRows.innerHTML = Object.keys(state.settings.budgets)
    .map((category) => {
      const budget = state.settings.budgets[category] || {};
      const amount = Number(budget.amount ?? budget.weekly ?? budget.monthly ?? 0);
      const frequency = budget.frequency || (budget.monthly !== undefined && budget.weekly === undefined ? 'monthly' : (budget.weekly !== undefined && budget.monthly === undefined ? 'weekly' : 'monthly'));
      return `
        <div class="budget-row">
          <label><span>${category}</span></label>
          <div class="budget-adjust-group">
            <button type="button" class="budget-adjust-btn" data-adjust-budget="${category}" data-direction="decrement">−</button>
            <input type="number" inputmode="decimal" data-category="${category}" data-field="amount" value="${amount}" step="0.01" min="0" />
            <button type="button" class="budget-adjust-btn" data-adjust-budget="${category}" data-direction="increment">+</button>
          </div>
          <label class="budget-frequency">
            <select data-category="${category}" data-field="frequency">
              <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select>
          </label>
          <button type="button" class="ghost-btn" data-remove-category="${category}">Remove</button>
        </div>`;
    })
    .join('');

  els.fixedBillsRows.innerHTML = (state.settings.fixedBills || [])
    .map((bill, index) => `
      <div class="fixed-bill-row">
        <strong>${bill.name}</strong>
        <span>${formatCurrency(bill.amount)} • ${bill.frequency === 'weekly' ? 'Weekly' : 'Monthly'}</span>
        <button type="button" class="ghost-btn" data-remove-bill="${index}">Remove</button>
      </div>
    `)
    .join('');

  els.presetRows.innerHTML = state.settings.quickPresets.map((preset, index) => `
    <div class="preset-row">
      <input type="text" data-preset-index="${index}" data-field="label" value="${preset.label}" />
      <input type="number" data-preset-index="${index}" data-field="amount" value="${preset.amount}" step="0.01" min="0" />
      <button type="button" class="danger-btn" data-remove-preset="${index}">Remove</button>
    </div>
  `).join('');

  els.budgetRows.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', handleBudgetInput);
  });
  els.budgetRows.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', handleBudgetInput);
  });
  els.budgetRows.querySelectorAll('[data-adjust-budget]').forEach((button) => {
    button.addEventListener('click', () => {
      adjustCategoryBudget(button.dataset.adjustBudget, button.dataset.direction);
    });
  });
  els.budgetRows.querySelectorAll('[data-remove-category]').forEach((button) => {
    button.addEventListener('click', () => {
      delete state.settings.budgets[button.dataset.removeCategory];
      saveState(true);
      renderSettings();
      renderAll();
    });
  });
  els.fixedBillsRows.querySelectorAll('[data-remove-bill]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeBill);
      state.settings.fixedBills.splice(index, 1);
      saveState(true);
      renderSettings();
    });
  });
  els.presetRows.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', handlePresetInput);
  });
  els.presetRows.querySelectorAll('[data-remove-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settings.quickPresets.splice(Number(button.dataset.removePreset), 1);
      saveState(true);
      renderSettings();
      renderQuickPresets();
    });
  });
}

function handleBudgetInput(event) {
  const target = event.target;
  const { category, field } = target.dataset;
  if (!state.settings.budgets[category]) {
    state.settings.budgets[category] = {};
  }

  if (field === 'amount') {
    state.settings.budgets[category].amount = Number(target.value || 0);
  } else if (field === 'frequency') {
    state.settings.budgets[category].frequency = target.value;
  }

  saveState(true);
  renderSummary();
  renderBudgetHealth();
}

function adjustCategoryBudget(category, direction) {
  if (!state.settings.budgets[category]) {
    state.settings.budgets[category] = { amount: 0, frequency: 'monthly' };
  }

  const step = 5;
  const currentValue = Number(state.settings.budgets[category].amount || 0);
  state.settings.budgets[category].amount = direction === 'increment'
    ? currentValue + step
    : Math.max(0, currentValue - step);

  saveState(true);
  renderSettings();
  renderAll();
}

function handlePresetInput(event) {
  const target = event.target;
  const index = Number(target.dataset.presetIndex);
  const field = target.dataset.field;
  if (!state.settings.quickPresets[index]) return;
  if (field === 'amount') {
    state.settings.quickPresets[index].amount = Number(target.value || 0);
  } else {
    state.settings.quickPresets[index].label = target.value;
  }
  saveState(true);
  renderQuickPresets();
}

function addPresetRow() {
  state.settings.quickPresets.push({ label: 'New Preset', amount: 0 });
  saveState(true);
  renderSettings();
  renderQuickPresets();
}

function addFixedBill() {
  const name = els.newBillName?.value.trim();
  const amount = Number(els.newBillAmount?.value || 0);
  if (!name || !amount) return;

  state.settings.fixedBills.push({
    name,
    amount,
    frequency: els.newBillFrequency?.value || 'monthly'
  });

  saveState(true);
  renderSettings();
  if (els.newBillName) els.newBillName.value = '';
  if (els.newBillAmount) els.newBillAmount.value = '';
  if (els.newBillFrequency) els.newBillFrequency.value = 'monthly';
  showToast('Recurring bill added.');
}

function submitEntryPayload(payload) {
  if (!payload.amount) {
    showToast('Enter an amount to continue.');
    return false;
  }

  const category = payload.category || 'Uncategorized';
  let settingsChanged = false;

  if (!state.settings.categories.includes(category) && category !== 'Uncategorized') {
    state.settings.categories.push(category);
    settingsChanged = true;
  }

  if (!state.settings.budgets[category]) {
    state.settings.budgets[category] = { weekly: 0, monthly: 0 };
    settingsChanged = true;
  }

  const entry = {
    id: editingId || generateId(),
    type: payload.type || 'expense',
    amount: Number(payload.amount),
    category,
    note: (payload.note || '').trim(),
    date: payload.date || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  };

  if (editingId) {
    const index = state.transactions.findIndex((item) => item.id === editingId);
    if (index >= 0) {
      state.transactions[index] = entry;
    }
  } else {
    state.transactions.unshift(entry);
  }

  saveState(settingsChanged);
  renderAll();
  syncToGoogleSheets(entry);
  return entry;
}

function handleEntrySubmit(event) {
  event.preventDefault();
  const amount = Number(els.entryAmount?.value || els.mobileAmount?.value || 0);
  const customCategory = (els.entryCustomCategory?.value || '').trim();
  const category = customCategory || els.entryCategory?.value || els.mobileCategory?.value || 'Uncategorized';
  const entry = submitEntryPayload({
    amount,
    type: els.entryType?.value || els.mobileType?.value || 'expense',
    category,
    note: els.entryNote?.value || els.mobileNote?.value || '',
    date: els.entryDate?.value || new Date().toISOString().split('T')[0]
  });

  if (entry) {
    showToast(editingId ? 'Entry updated.' : 'Entry saved.');
    resetEntryForm();
    editingId = null;
  }
}

function handleMobileQuickAdd() {
  const amount = Number(els.mobileAmount?.value || 0);
  const category = els.mobileCategory?.value || 'Uncategorized';
  const entry = submitEntryPayload({
    amount,
    type: els.mobileType?.value || 'expense',
    category,
    note: els.mobileNote?.value || '',
    date: els.entryDate?.value || new Date().toISOString().split('T')[0]
  });

  if (entry) {
    showToast(entry.type === 'income' ? 'Income added.' : 'Expense added.');
    resetMobileQuickAdd();
  }
}

function resetEntryForm() {
  if (els.entryForm) {
    els.entryForm.reset();
  }
  setDefaultDate();
  if (els.entryType) {
    els.entryType.value = 'expense';
  }
  if (els.entryCategory) {
    els.entryCategory.value = '';
  }
  if (els.entryCustomCategory) {
    els.entryCustomCategory.value = '';
  }
  if (els.entryAmount) {
    els.entryAmount.focus();
  }
  editingId = null;
  renderCategoryOptions();
}

function resetMobileQuickAdd() {
  els.mobileAmount.value = '';
  els.mobileNote.value = '';
  els.mobileCategory.value = '';
  els.mobileType.value = 'expense';
  els.mobileAmount.focus();
  renderCategoryOptions();
}

function handleGoalSubmit(event) {
  event.preventDefault();
  const amount = Number(els.goalAmount.value || 0);
  const targetDate = els.goalDate.value;
  const name = els.goalName.value.trim() || 'Goal';

  if (!amount || !targetDate) {
    showToast('Enter an amount and target date.');
    return;
  }

  const funded = Number(els.goalFunded.value || 0);
  const budgetAsCategory = els.goalBudgetCategory.value === 'yes';
  const weeklyTarget = amount / Math.max(1, Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 7)));
  const monthlyTarget = amount / Math.max(1, Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)));
  const goalEntry = { amount, targetDate, name, funded, type: 'goal', budgetAsCategory, weeklyTarget, monthlyTarget };

  let settingsChanged = false;
  state.ui.goal = goalEntry;
  if (!state.ui.goals) state.ui.goals = [];

  if (budgetAsCategory && !state.settings.budgets[name]) {
    state.settings.budgets[name] = { weekly: weeklyTarget, monthly: monthlyTarget };
    if (!state.settings.categories.includes(name)) {
      state.settings.categories.push(name);
    }
    settingsChanged = true;
  }

  const existingIndex = state.ui.goals.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existingIndex >= 0) {
    state.ui.goals[existingIndex] = goalEntry;
  } else {
    state.ui.goals.push(goalEntry);
  }

  saveState(settingsChanged);
  renderGoalResult();
  renderGoalsDashboard();
  showToast('Goal saved.');
}

function clearGoalForm() {
  els.goalsForm.reset();
  state.ui.goal = null;
  saveState();
  renderGoalResult();
  renderGoalsDashboard();
  setDefaultGoalDate();
}

function addCustomBudgetCategory() {
  const category = els.newBudgetCategory.value.trim();
  if (!category) return;
  if (!state.settings.budgets[category]) {
    state.settings.budgets[category] = { weekly: 0, monthly: 0 };
    state.settings.categories.push(category);
    saveState(true);
    renderSettings();
    renderAll();
    els.newBudgetCategory.value = '';
    showToast('Category added.');
  }
}

function openSettings() {
  els.settingsModal.classList.remove('hidden');
  els.settingsModal.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
  els.settingsModal.setAttribute('aria-hidden', 'true');
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = nextTheme;
  state.ui.theme = nextTheme;
  els.themeToggle.textContent = nextTheme === 'dark' ? '☀️' : '🌙';
  saveState();
}

function startEditing(id) {
  const entry = state.transactions.find((item) => item.id === id);
  if (!entry) return;
  editingId = id;
  els.entryDate.value = entry.date;
  els.entryAmount.value = entry.amount;
  els.entryType.value = entry.type;
  els.entryCategory.value = entry.category;
  els.entryCustomCategory.value = '';
  els.entryNote.value = entry.note || '';
  renderCategoryOptions();
  openSettings();
  showToast('Editing existing entry.');
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter((item) => item.id !== id);
  saveState();
  renderAll();
  showToast('Entry removed.');
}

async function loadFromGoogleSheets() {
  const inputValue = state.settings.webhookUrl?.trim();
  const sheetId = resolveSheetId(inputValue);
  const webhookUrl = resolveWebhookUrl(inputValue);

  if (!webhookUrl) return;

  try {
    const fetchUrl = sheetId ? `${webhookUrl}?sheetId=${encodeURIComponent(sheetId)}` : webhookUrl;
    const response = await fetch(fetchUrl);
    if (!response.ok) return;

    const data = await response.json();

    if (data.ok) {
      // 1. Sync Settings (Categories, Budgets, Income, Fixed Bills, Presets)
      if (data.settings && typeof data.settings === 'object') {
        state.settings = {
          ...state.settings,
          ...data.settings,
          webhookUrl: state.settings.webhookUrl || data.settings.webhookUrl || ''
        };
      }

      // 2. Sync Transactions
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        const cloudTransactions = data.entries.map((entry) => {
          let parsedDate = entry.date;
          if (parsedDate && parsedDate.includes('T')) {
            parsedDate = parsedDate.split('T')[0];
          }
          return {
            id: entry.id || generateId(),
            type: (entry.type || 'expense').toLowerCase(),
            amount: Number(entry.amount || 0),
            category: entry.category || 'Uncategorized',
            note: entry.note || '',
            date: parsedDate || new Date().toISOString().split('T')[0],
            createdAt: entry.createdAt || new Date().toISOString()
          };
        });

        const mergedMap = new Map();
        [...state.transactions, ...cloudTransactions].forEach((item) => {
          const key = `${item.date}_${item.type}_${item.amount}_${item.category}_${item.note}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, item);
          }
        });

        state.transactions = Array.from(mergedMap.values());
      }

      saveState();
      renderAll();
      console.log('Successfully synced settings & entries with Google Sheets!');
    }
  } catch (error) {
    console.warn('Could not fetch cloud data, using local cache instead.', error);
  }
}

async function postToGoogleSheets(payload) {
  const inputValue = state.settings.webhookUrl?.trim();
  const sheetId = resolveSheetId(inputValue);
  const webhookUrl = resolveWebhookUrl(inputValue);

  if (!webhookUrl || (!sheetId && !/^https?:\/\//i.test(inputValue || ''))) {
    throw new Error('Add your Google Sheets spreadsheet ID first.');
  }

  const requestBody = JSON.stringify({ ...payload, app: 'LaaksoBudget', sheetId });
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: requestBody
  };

  try {
    const response = await fetch(webhookUrl, requestOptions);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody || 'No response body'}`);
    }

    return true;
  } catch (error) {
    throw error;
  }
}

async function syncSettingsToGoogleSheets() {
  try {
    await postToGoogleSheets({
      action: 'saveSettings',
      settings: state.settings
    });
  } catch (error) {
    console.warn('Failed to sync settings to cloud', error);
  }
}

async function syncToGoogleSheets(entry) {
  try {
    await postToGoogleSheets({ entry: { ...entry, createdAt: entry?.createdAt || new Date().toISOString() } });
    showToast('Saved to Google Sheets.');
  } catch (error) {
    console.warn('Google Sheets sync failed.', error);
    showToast(`Google Sheets sync failed: ${error.message}`);
  }
}

async function syncAllTransactionsToGoogleSheets() {
  try {
    const entries = state.transactions.map((transaction) => ({
      ...transaction,
      createdAt: transaction?.createdAt || new Date().toISOString()
    }));

    await postToGoogleSheets({ entries, mode: 'full-sync' });
    showToast('Pushed to Google Sheets.');
  } catch (error) {
    console.warn('Google Sheets full sync failed.', error);
    showToast(`Google Sheets sync failed: ${error.message}`);
  }
}

function exportToCsv() {
  const rows = [
    ['type', 'amount', 'category', 'note', 'date', 'createdAt'],
    ...state.transactions.map((transaction) => [
      transaction.type,
      transaction.amount,
      transaction.category,
      transaction.note || '',
      transaction.date,
      transaction.createdAt || ''
    ])
  ];

  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'laakso-budget-export.csv';
  link.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported.');
}

function escapeCsvValue(value) {
  const stringValue = `${value ?? ''}`;
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function importFromCsv(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCsv(reader.result);
      const incomingTransactions = rows
        .filter((row) => row.type)
        .map((row) => ({
          id: generateId(),
          type: row.type.toLowerCase(),
          amount: Number(row.amount || 0),
          category: row.category || 'Uncategorized',
          note: row.note || '',
          date: row.date || new Date().toISOString().split('T')[0],
          createdAt: row.createdAt || new Date().toISOString()
        }));
      state.transactions = [...incomingTransactions, ...state.transactions];
      incomingTransactions.forEach((entry) => {
        if (!state.settings.categories.includes(entry.category) && entry.category !== 'Uncategorized') {
          state.settings.categories.push(entry.category);
        }
        if (!state.settings.budgets[entry.category]) {
          state.settings.budgets[entry.category] = { weekly: 0, monthly: 0 };
        }
      });
      saveState(true);
      renderAll();
      showToast('CSV imported.');
    } catch (error) {
      console.error(error);
      showToast('Unable to import the provided CSV.');
    }
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) {
      rows.push(row);
    }
  }

  const dataRows = rows.filter((entry) => entry[0] && entry[0].toLowerCase() !== 'type');
  return dataRows.map((entry) => ({
    type: entry[0] || '',
    amount: entry[1] || '',
    category: entry[2] || '',
    note: entry[3] || '',
    date: entry[4] || '',
    createdAt: entry[5] || ''
  }));
}

function resetData() {
  if (!window.confirm('This will erase all local data. Continue?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = JSON.parse(JSON.stringify(defaultState));
  saveState();
  renderAll();
  setDefaultDate();
  restoreUIState();
  showToast('Data reset.');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 2200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker registration failed.', error);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', init);