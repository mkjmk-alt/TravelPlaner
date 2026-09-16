const toSafeString = (value) => String(value || '').trim();

export const getCashWalletCreationCurrency = ({
  selectedCurrency,
  currencyChoices = [],
  fallbackCurrency = 'KRW'
} = {}) => {
  const choices = Array.isArray(currencyChoices)
    ? currencyChoices.map(toSafeString).filter(Boolean)
    : [];
  const selected = toSafeString(selectedCurrency);
  if (selected && choices.includes(selected)) return selected;

  const fallback = toSafeString(fallbackCurrency);
  return choices.includes(fallback) ? fallback : choices[0] || fallback || 'KRW';
};

export const createCashWallet = ({ id, currency, name } = {}) => {
  const safeCurrency = toSafeString(currency) || 'KRW';
  return {
    id: toSafeString(id) || `${safeCurrency}-cash-wallet`,
    name: toSafeString(name) || `${safeCurrency} 현금 지갑`,
    currency: safeCurrency,
    initial: 0,
    additional: 0,
    actualRemaining: ''
  };
};

export const removeCashWalletState = ({
  wallets = [],
  walletId,
  activeWalletId,
  selectedCurrency,
  fallbackCurrency = 'KRW'
} = {}) => {
  const source = Array.isArray(wallets) ? wallets : [];
  const remainingWallets = source.filter(wallet => wallet?.id !== walletId);
  const activeWallet = remainingWallets.find(wallet => wallet?.id === activeWalletId);
  const fallbackWallet = remainingWallets.find(wallet => wallet?.currency === selectedCurrency)
    || remainingWallets[0]
    || null;
  const nextActiveWallet = activeWallet || fallbackWallet;

  return {
    wallets: remainingWallets,
    activeWalletId: nextActiveWallet?.id || null,
    cashLedgerCurrency: nextActiveWallet?.currency
      || toSafeString(selectedCurrency)
      || toSafeString(fallbackCurrency)
      || 'KRW'
  };
};
