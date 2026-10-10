import {purchasePromotion} from '@/modules/order/first-purchase-server';
import { boundary, readJson, response, checkAdminOrigin, AppError } from '@/modules/catalog/server';
import { publicRate } from '@/modules/catalog/request-rate';
import { currentCustomer, customerProfile, customerIdentity, customerSessionCookie, registerCustomer, loginCustomer, logoutCustomer } from '@/modules/catalog/customers';

export const GET = (request: Request) => boundary(async () => {
  const customer = await currentCustomer(request.headers.get('cookie'));
  return response({ customer: customer ? customerProfile(customer) : null, promotion: await purchasePromotion(request.headers.get('cookie')) });
});
export const POST = (request: Request) => boundary(async () => {
  checkAdminOrigin(request);
  await publicRate(request, 'customer-auth', 40);
  const input = await readJson(request);
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['register', 'login'].includes(input.action)) throw new AppError(400, 'Permintaan akun tidak valid.');
  const { identity } = customerIdentity(input.identity);
  await publicRate(request, 'customer-identity', 20, identity);
  if (input.action === 'register') await publicRate(request, 'customer-register', 8);
  const result = await (input.action === 'register' ? registerCustomer : loginCustomer)(input, request.headers.get('cookie'));
  const reply = response({ customer: result.customer }, input.action === 'register' ? 201 : 200);
  reply.headers.set('Set-Cookie', customerSessionCookie(request, result.token));
  return reply;
});
export const DELETE = (request: Request) => boundary(async () => {
  checkAdminOrigin(request);
  await logoutCustomer(request.headers.get('cookie'));
  const reply = response({ customer: null });
  reply.headers.set('Set-Cookie', customerSessionCookie(request));
  return reply;
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
