export const PROMOTION_PACKAGES = {
  FEATURED: [
    { id: 'featured-7', name: '7 Days', days: 7, price: 499, description: 'Golden label, Priority placement' },
    { id: 'featured-15', name: '15 Days', days: 15, price: 899, description: 'Golden label, Priority placement' },
    { id: 'featured-30', name: '30 Days', days: 30, price: 1499, description: 'Golden label, Priority placement' },
  ],
  BOOST: [
    { id: 'boost-3', name: '3 Days', days: 3, price: 299, description: 'Higher ranking, Frequent in feeds' },
    { id: 'boost-7', name: '7 Days', days: 7, price: 599, description: 'Higher ranking, Frequent in feeds' },
    { id: 'boost-15', name: '15 Days', days: 15, price: 999, description: 'Higher ranking, Frequent in feeds' },
  ],
  VERIFIED: [
    { id: 'verified-1', name: '1 Month', days: 30, price: 1999, description: 'Premium Seller badge, Priority in search' },
    { id: 'verified-3', name: '3 Months', days: 90, price: 4999, description: 'Premium Seller badge, Priority in search' },
    { id: 'verified-6', name: '6 Months', days: 180, price: 8999, description: 'Premium Seller badge, Priority in search' },
    { id: 'verified-12', name: '12 Months', days: 365, price: 14999, description: 'Premium Seller badge, Priority in search' },
  ]
};

export const PAYMENT_METHODS = [
  {
    id: 'EASYPAISA',
    name: 'Easypaisa',
    category: 'Mobile Wallet',
    accountTitle: 'Muhammad Imran',
    accountNumber: '0346-7297510',
    icon: 'Smartphone',
    requiresImage: true,
    requiresTxHash: false,
    instructions: 'Transfer funds from your Easypaisa app or shop to the account number above, then upload the transaction receipt screenshot below.'
  },
  {
    id: 'BANK_TRANSFER',
    name: 'Bank Transfer',
    category: 'Bank Account',
    bankName: 'National Bank of Pakistan',
    accountTitle: 'Muhammad Imran',
    iban: 'PK47NBPA1674004094573230',
    icon: 'Building2',
    requiresImage: true,
    requiresTxHash: false,
    instructions: 'Send online transfer / IBFT to National Bank of Pakistan using the IBAN above, then attach your bank receipt or screenshot.'
  },
  {
    id: 'CRYPTO',
    name: 'Cryptocurrency',
    category: 'USDT (BEP20 / BSC)',
    network: 'BNB Smart Chain (BEP20)',
    currency: 'USDT',
    walletAddress: '0xdDBAA957EF06B0A6D363F03f2C34919ada605797',
    icon: 'Coins',
    requiresImage: false,
    requiresTxHash: true,
    warning: '⚠️ CRITICAL WARNING: We exclusively accept USDT on the BEP20 (BNB Smart Chain / BSC) network. DO NOT send funds via any other blockchain network (e.g. TRC20, ERC20, Polygon, Solana) or any other token. Payments sent through unsupported networks/tokens cannot be recovered or credited under any circumstances.',
    instructions: 'Send USDT (BEP20) to the wallet address above. Copy and paste your Transaction Hash (TXID) below. You may also upload an optional receipt screenshot.'
  }
];

export const PAYMENT_DETAILS = {
  method: 'Easypaisa',
  accountNumber: '0346-7297510',
  accountName: 'Muhammad Imran',
  bank: {
    bankName: 'National Bank of Pakistan',
    iban: 'PK47NBPA1674004094573230',
    accountTitle: 'Muhammad Imran'
  },
  crypto: {
    currency: 'USDT',
    network: 'BEP20 (BNB Smart Chain / BSC)',
    walletAddress: '0xdDBAA957EF06B0A6D363F03f2C34919ada605797'
  }
};
