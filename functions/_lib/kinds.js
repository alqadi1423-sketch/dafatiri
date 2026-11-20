// أنواع الدفاتر: قوالب عامة فقط، ولا تحمل أي اسم أو رقم.
export const KINDS = {
  debts: {
    label: 'ديون (دين وسداد وإبراء)',
    config: {
      cols: [
        { key: 'debt', label: 'الدين', sign: 1 },
        { key: 'pay', label: 'السداد', sign: -1 },
        { key: 'waive', label: 'الإبراء', sign: -1 },
      ],
      items: [
        { label: 'رصيد افتتاحي', col: 'debt' },
        { label: 'دين إضافي', col: 'debt' },
        { label: 'سداد', col: 'pay' },
        { label: 'إبراء', col: 'waive' },
      ],
      balanceLabel: 'المتبقي',
    },
  },
  fund: {
    label: 'صندوق (إيداع وسحب)',
    config: {
      cols: [
        { key: 'share', label: 'الإيداع', sign: 1 },
        { key: 'withdraw', label: 'السحب', sign: -1 },
      ],
      items: [
        { label: 'رصيد افتتاحي', col: 'share' },
        { label: 'إيداع', col: 'share' },
        { label: 'سحب', col: 'withdraw' },
      ],
      balanceLabel: 'الرصيد',
    },
  },
};
