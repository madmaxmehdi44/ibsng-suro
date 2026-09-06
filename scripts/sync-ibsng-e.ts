import { mkdir, writeFile } from 'node:fs/promises';

const base = 'https://raw.githubusercontent.com/ParspooyeshFanavar/ibsng-docs/master/json-rpc/E';
const modules = [
  'SystemNotification','admin','balance','bw','charge','customer','extra_charge','group','import_file',
  'invoice','ippool','isp','ldap','log_console','login','mc','notification','online_payment','perm','ras',
  'report','session','snapshot','stat','telephony_support','user','user_custom_field','util','voip_provider','voucher'
];

await mkdir('schemas/ibsng-e', { recursive: true });
for (const module of modules) {
  const response = await fetch(`${base}/${module}.json`);
  if (!response.ok) throw new Error(`Failed to fetch ${module}.json: HTTP ${response.status}`);
  await writeFile(`schemas/ibsng-e/${module}.json`, await response.text(), 'utf8');
  console.error(`synced ${module}.json`);
}
