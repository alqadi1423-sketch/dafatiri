-- صلاحيات الشخص على كل دفتر. بلا سطر هنا: يرى حسابه فقط في الدفاتر غير الخاصة.
-- الدفتر الخاص لا يدخله أحد غير المالك مهما كانت الصلاحية.
CREATE TABLE grants (
  person_id  INTEGER NOT NULL REFERENCES people(id),
  ledger_id  TEXT NOT NULL REFERENCES ledgers(id),
  level      TEXT NOT NULL CHECK (level IN ('none', 'own', 'view', 'record', 'manage')),
  PRIMARY KEY (person_id, ledger_id)
);
