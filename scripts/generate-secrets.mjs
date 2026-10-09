import { randomBytes } from 'node:crypto';
for (const name of ['AUTH_SECRET', 'CONFIG_SECRET', 'TEAM_ACCESS_SECRET', 'RAJAONGKIR_CONFIG_SECRET', 'KIRIMINAJA_WEBHOOK_TOKEN']) console.log(name + '=' + randomBytes(32).toString('hex'));
