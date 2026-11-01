import {resolveTxt} from 'node:dns/promises';
import type {SupabaseClient} from '@supabase/supabase-js';
import {appOrigin,seal,unseal,digest,type Access,requireRole} from './access.js';
import {HttpError} from './validation.js';
export async function providerFetch(url:string,init:RequestInit={}){
 const r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>null);
 if(!r.ok||!d)throw new HttpError(r.status===401||r.status===403?409:502,r.status===401||r.status===403?'A integração perdeu a autorização. Conecte a conta novamente.':'O serviço externo não confirmou a operação. Tente novamente.');return d;
}
export async function googleToken(db:SupabaseClient,owner:string){
 const r=await db.from('integration_accounts').select('*').eq('user_id',owner).eq('provider','google').maybeSingle();if(!r.data)throw new HttpError(409,'Conecte sua conta Google Workspace.');
 const saved=unseal<{refresh_token:string}>(r.data.secret);
 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)throw new HttpError(503,'Configure o aplicativo OAuth Google no servidor.');
 const result=await providerFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:saved.refresh_token,grant_type:'refresh_token'})});return {token:result.access_token,account:r.data};
}
const header=(s:string)=>{if(/[\r\n]/.test(s))throw new HttpError(400,'Cabeçalho de e-mail inválido.');return s;};
export function emailRaw(input:{from:string;to:string;subject:string;text:string;replyTo?:string;threadMessageId?:string}){
 header(input.from);header(input.to);header(input.subject);if(input.replyTo)header(input.replyTo);if(input.threadMessageId)header(input.threadMessageId);
 return Buffer.from([`From: ${input.from}`,`To: ${input.to}`,`Subject: =?UTF-8?B?${Buffer.from(input.subject).toString('base64')}?=`,...(input.replyTo?[`Reply-To: ${input.replyTo}`]:[]),...(input.threadMessageId?[`In-Reply-To: ${input.threadMessageId}`,`References: ${input.threadMessageId}`]:[]),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(input.text).toString('base64').match(/.{1,76}/g)?.join('\r\n')||''].join('\r\n')).toString('base64url');
}
export async function sendGoogleMail(db:SupabaseClient,owner:string,input:{to:string;subject:string;text:string;replyTo?:string;senderName?:string;threadId?:string;threadMessageId?:string}){
 const {token,account}=await googleToken(db,owner);
 const raw=emailRaw({from:`=?UTF-8?B?${Buffer.from(input.senderName||account.label).toString('base64')}?= <${account.label}>`,to:input.to,subject:input.subject,text:input.text,replyTo:input.replyTo,threadMessageId:input.threadMessageId});
 return providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({raw,...(input.threadId?{threadId:input.threadId}:{})})});
}
function mailParts(payload:any):string{if(payload?.mimeType==='text/plain'&&payload.body?.data)return Buffer.from(payload.body.data,'base64url').toString('utf8');for(const p of payload?.parts||[]){const text=mailParts(p);if(text)return text;}return '';}
export async function syncGoogle(db:SupabaseClient,owner:string){
 const {token,account}=await googleToken(db,owner),headers={Authorization:`Bearer ${token}`};
 const since=account.metadata?.syncSince|| (account.synced_at?Math.floor(Date.parse(account.synced_at)/1000)-60:Math.floor(Date.now()/1000)-7*86400);
 const started=account.metadata?.syncStartedAt||new Date().toISOString();
 const list=await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(`in:inbox after:${since}`)}${account.metadata?.syncCursor?'&pageToken='+encodeURIComponent(account.metadata.syncCursor):''}`,{headers});let count=0;
 for(const item of list.messages||[]){
  const eventId=`google:${owner}:${item.id}`;
  const seen=await db.from('channel_events').select('id').eq('id',eventId).maybeSingle();if(seen.data)continue;
  const m=await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,{headers});const hs:Record<string,string>=Object.fromEntries((m.payload?.headers||[]).map((h:any)=>[String(h.name).toLowerCase(),h.value]));
  const from=hs.from?.match(/(?:<)([^>]+)>/)?.[1]||hs.from?.trim();if(!from||from.toLowerCase()===account.label.toLowerCase()||!/^\S+@\S+\.\S+$/.test(from))continue;
  const content=mailParts(m.payload).trim().slice(0,16000)||m.snippet?.slice(0,4000);if(!content)continue;
  let contact=(await db.from('contacts').select('id').eq('user_id',owner).ilike('email',from.replace(/[\\%_]/g,'\\$&')).limit(1).maybeSingle()).data;
  if(!contact){const created=await db.from('contacts').insert({user_id:owner,name:hs.from?.split('<')[0].replace(/"/g,'').trim()||from,email:from,source:'E-mail'}).select('id').single();contact=created.data;}
  if(!contact)throw new HttpError(503,'Não foi possível importar o contato de e-mail.');
  let conversation=(await db.from('conversations').select('id').eq('user_id',owner).eq('channel','email').eq('external_id',m.threadId).maybeSingle()).data;
  if(!conversation){const c=await db.from('conversations').insert({user_id:owner,contact_id:contact.id,channel:'email',status:'human',external_id:m.threadId}).select('id').single();conversation=c.data;}
  if(!conversation)throw new HttpError(503,'Não foi possível importar a conversa de e-mail.');
  const saved=await db.rpc('workspace_import_message',{p_event:eventId,p_owner:owner,p_provider:'google',p_conversation:conversation.id,p_content:content,p_external:item.id});if(saved.error)throw new HttpError(503,'Não foi possível guardar o e-mail.');if(saved.data)count++;
 }
 const saved=await db.from('integration_accounts').update(list.nextPageToken?{metadata:{...account.metadata,syncCursor:list.nextPageToken,syncSince:since,syncStartedAt:started}}:{synced_at:started,metadata:{...account.metadata,syncCursor:null,syncSince:null,syncStartedAt:null}}).eq('user_id',owner).eq('provider','google');if(saved.error)throw new HttpError(503,'Não foi possível registrar a sincronização.');return {imported:count,moreAvailable:Boolean(list.nextPageToken)};
}
export async function domainAuth(email:string){
 const domain=email.split('@')[1];if(!domain||!/^[a-z0-9.-]+$/i.test(domain))throw new HttpError(400,'Conecte uma conta para verificar seu domínio.');
 const read=async(name:string)=>{try{return(await resolveTxt(name)).map(v=>v.join(''));}catch{return[];}};
 const [spf,dmarc,dkim]=await Promise.all([read(domain),read(`_dmarc.${domain}`),read(`google._domainkey.${domain}`)]);
 return [{type:'SPF',value:spf.find(s=>s.startsWith('v=spf1'))||'Registro não encontrado',verified:spf.some(s=>s.startsWith('v=spf1'))},{type:'DKIM',value:`google._domainkey.${domain}`,verified:dkim.some(s=>s.includes('p=')),detail:'Se usar outro seletor DKIM, confira no Google Admin.'},{type:'DMARC',value:dmarc.find(s=>s.startsWith('v=DMARC1'))||`_dmarc.${domain}`,verified:dmarc.some(s=>s.startsWith('v=DMARC1'))}];
}
export async function stripeRequest(path:string,method='GET',params?:URLSearchParams,idempotencyKey?:string){
 if(!process.env.STRIPE_SECRET_KEY)throw new HttpError(503,'Configure STRIPE_SECRET_KEY, preços e portal de cobrança na Stripe.');
 return providerFetch(`https://api.stripe.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:params});
}
export async function billing(a:Access){
 requireRole(a,['admin','manager']);if(!process.env.STRIPE_SECRET_KEY)return {configured:false,plans:[],invoices:[],subscription:null};
 const account=await a.db.from('integration_accounts').select('account_id,metadata').eq('user_id',a.ownerId).eq('provider','stripe').maybeSingle();
 const prices=[['essential',process.env.STRIPE_PRICE_ESSENTIAL],['growth',process.env.STRIPE_PRICE_GROWTH]].filter((p):p is [string,string]=>Boolean(p[1]));
 const plans=await Promise.all(prices.map(async([id,priceId])=>{const price=await stripeRequest(`prices/${encodeURIComponent(priceId)}?expand[]=product`);return {id,name:price.product?.name||id,amount:price.unit_amount,currency:price.currency,interval:price.recurring?.interval};}));
 if(!account.data)return {configured:true,plans,invoices:[],subscription:null};
 const customer=encodeURIComponent(account.data.account_id),[invoices,subscriptions,c]=await Promise.all([stripeRequest(`invoices?customer=${customer}&limit=12`),stripeRequest(`subscriptions?customer=${customer}&status=all&limit=3&expand[]=data.default_payment_method`),stripeRequest(`customers/${customer}?expand[]=invoice_settings.default_payment_method`)]);
 const s=subscriptions.data.find((s:any)=>['active','trialing','past_due'].includes(s.status));const price=s?.items?.data?.[0]?.price,card=c.invoice_settings?.default_payment_method?.card;
 return {configured:true,plans,customer:{name:c.name,email:c.email,taxIds:[]},payment:card?{brand:card.brand,last4:card.last4,exp_month:card.exp_month,exp_year:card.exp_year}:null,subscription:s?{status:s.status,amount:price?.unit_amount,currency:price?.currency,interval:price?.recurring?.interval,renewsAt:s.current_period_end||s.items?.data?.[0]?.current_period_end,plan:plans.find(p=>p.id===(price?.id===process.env.STRIPE_PRICE_GROWTH?'growth':'essential'))?.name}:null,invoices:invoices.data.map((i:any)=>({id:i.id,number:i.number,date:i.created,amount:i.amount_paid,currency:i.currency,status:i.status,pdf:i.invoice_pdf,url:i.hosted_invoice_url}))};
}
export async function billingAction(a:Access,action:string,plan?:string){
 requireRole(a);const existing=await a.db.from('integration_accounts').select('account_id').eq('user_id',a.ownerId).eq('provider','stripe').maybeSingle();let customer=existing.data?.account_id;
 if(!customer){const c=await stripeRequest('customers','POST',new URLSearchParams({email:a.user.email||'',name:a.settings.general.name,'metadata[workspace_id]':a.ownerId}),`workspace-customer-${a.ownerId}`);customer=c.id;const saved=await a.db.from('integration_accounts').upsert({user_id:a.ownerId,provider:'stripe',account_id:customer,label:a.user.email||'',metadata:{}},{onConflict:'user_id,provider'});if(saved.error)throw new HttpError(503,'Não foi possível vincular a cobrança ao workspace.');}
 if(action==='billing.portal'){const result=await stripeRequest('billing_portal/sessions','POST',new URLSearchParams({customer,return_url:`${appOrigin()}/#settings/billing`}));return {url:result.url};}
 const price=plan==='essential'?process.env.STRIPE_PRICE_ESSENTIAL:plan==='growth'?process.env.STRIPE_PRICE_GROWTH:undefined;if(!price)throw new HttpError(400,'Selecione um plano configurado.');
 const active=await stripeRequest(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);if(active.data.some((s:any)=>['active','trialing','past_due','unpaid','incomplete'].includes(s.status)))throw new HttpError(409,'Este cliente já possui uma assinatura. Use Gerenciar assinatura para alterar o plano.');
 const result=await stripeRequest('checkout/sessions','POST',new URLSearchParams({mode:'subscription',customer,'line_items[0][price]':price,'line_items[0][quantity]':'1',success_url:`${appOrigin()}/#settings/billing`,cancel_url:`${appOrigin()}/#settings/billing`,'subscription_data[metadata][workspace_id]':a.ownerId,client_reference_id:a.ownerId}));return {url:result.url};
}
export async function instagramSend(db:SupabaseClient,owner:string,recipient:string,message:string){
 const account=await db.from('integration_accounts').select('*').eq('user_id',owner).eq('provider','instagram').maybeSingle();if(!account.data)throw new HttpError(409,'Conecte a conta Instagram.');const secret=unseal<{access_token:string}>(account.data.secret);
 return providerFetch(`https://graph.facebook.com/${process.env.META_API_VERSION||'v23.0'}/${encodeURIComponent(account.data.account_id)}/messages`,{method:'POST',headers:{Authorization:`Bearer ${secret.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:recipient},message:{text:message}})});
}
export async function disconnect(a:Access,provider:string){
 requireRole(a);if(!['google','instagram'].includes(provider))throw new HttpError(400,'Integração inválida.');
 if(provider==='google'){const existing=await a.db.from('integration_accounts').select('secret').eq('user_id',a.ownerId).eq('provider',provider).maybeSingle();if(existing.data){const secret=unseal<{refresh_token:string}>(existing.data.secret);await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret.refresh_token}),signal:AbortSignal.timeout(10000)}).catch(()=>{});}}
 const r=await a.db.from('integration_accounts').delete().eq('user_id',a.ownerId).eq('provider',provider);if(r.error)throw new HttpError(503,'Não foi possível desconectar.');return {disconnected:true};
}
