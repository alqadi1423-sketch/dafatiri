// يطبع أمر SQL ينشئ حساب المالك إن لم يوجد مالك بعد. لا يغيّر شيئًا إن وُجد.
// الاستعمال: OWNER_USERNAME=... OWNER_PASSWORD=... node scripts/owner-sql.mjs > owner.sql
import { hashPassword, passwordProblem, validUsername } from '../functions/_lib/password.js';

const username = String(process.env.OWNER_USERNAME || '').trim().toLowerCase();
const password = String(process.env.OWNER_PASSWORD || '');
const name = String(process.env.OWNER_NAME || 'المالك').replace(/'/g, "''");

if (!validUsername(username)) {
  console.error('OWNER_USERNAME: من 3 إلى 30 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ -');
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error('OWNER_PASSWORD: ' + problem);
  process.exit(1);
}

const pw = await hashPassword(password);
console.log(`INSERT INTO users (username, name, pw, is_owner)
SELECT '${username}', '${name}', '${pw}', 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_owner = 1);`);
