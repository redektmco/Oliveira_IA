import {HttpError} from './validation.js';
import {contactAccess,maskedContact,uuid,type Access} from './access.js';
import {emitEvent} from './webhooks.js';
export const tableFields:Record<string,string[]>={contacts:['name','email','phone','company','source','score','status','notes','job_title','city','tags','assigned_to','qualification','ai_next_action','owner_name','files'],deals:['contact_id','title','value','stage','assigned_to','close_date','probability','next_step','lost_reason','description'],deal_tasks:['deal_id','title','due_at','done_at','assigned_to'],deal_notes:['deal_id','content'],agents:['name','company','system_prompt','greeting','model','active','qualification_threshold','tone','criteria_weights'],knowledge:['title','content'],conversations:['contact_id','agent_id','channel','status'],messages:['conversation_id','role','content'],meetings:['contact_id','title','starts_at','duration','location','status'],contact_notes:['contact_id','content']};
const tables=[...Object.keys(tableFields),'contact_files','ai_usage','deal_events'];
const dealChildren=['deal_tasks','deal_notes','deal_events'];
const isoDate=/^\d{4}-\d{2}-\d{2}$/;
export async function dealAccess(a:Access,id:unknown){uuid(id);const r=await a.db.from('deals').select('*').eq('id',id).eq('user_id',a.ownerId).maybeSingle();if(r.error||!r.data)throw new HttpError(404,'Oportunidade não encontrada ou sem acesso.');if(a.role==='seller'&&r.data.assigned_to!==a.user.id){if(!r.data.contact_id)throw new HttpError(404,'Oportunidade não encontrada ou sem acesso.');await contactAccess(a,r.data.contact_id);}return r.data;}
async function activeMember(a:Access,id:unknown){if(id===a.ownerId)return;uuid(id);const m=await a.db.from('workspace_members').select('id').eq('owner_id',a.ownerId).eq('user_id',id).eq('status','active').maybeSingle();if(!m.data)throw new HttpError(400,'Selecione um membro ativo do workspace.');}
export async function readData(a:Access){
 let contactIds:string[]=[];
 if(a.role==='seller'){const r=await a.db.from('contacts').select('id').eq('user_id',a.ownerId).eq('assigned_to',a.user.id).limit(20000);if(r.error)throw new HttpError(503,'Não foi possível carregar os contatos.');contactIds=r.data.map(c=>c.id);}
 const result:Record<string,unknown[]>={};
 let conversationIds:string[]=[],dealIds:string[]=[];
 if(a.role==='seller'){const q=a.db.from('deals').select('id').eq('user_id',a.ownerId).limit(20000);q.or(contactIds.length?`assigned_to.eq.${a.user.id},contact_id.in.(${contactIds.join(',')})`:`assigned_to.eq.${a.user.id}`);const r=await q;if(r.error)throw new HttpError(503,'Não foi possível carregar as oportunidades.');dealIds=r.data.map(d=>d.id);}
 if(a.role==='seller'&&contactIds.length){const r=await a.db.from('conversations').select('id').eq('user_id',a.ownerId).in('contact_id',contactIds);if(r.error)throw new HttpError(503,'Não foi possível carregar as conversas.');conversationIds=r.data.map(c=>c.id);}
 await Promise.all(tables.map(async table=>{
  if(a.role==='seller'&&(table==='ai_usage'||(['contacts','conversations','meetings','contact_notes','contact_files'].includes(table)&&!contactIds.length)||(table==='messages'&&!conversationIds.length)||((table==='deals'||dealChildren.includes(table))&&!dealIds.length))){result[table]=[];return;}
  let rows:Record<string,any>[]=[];
  for(let offset=0;offset<20000;offset+=500){
   const q=a.db.from(table).select('*').eq('user_id',a.ownerId).order('created_at').order('id').range(offset,offset+499);
   if(a.role==='seller'){
    if(table==='contacts')q.eq('assigned_to',a.user.id);
    else if(table==='deals')q.in('id',dealIds);
    else if(dealChildren.includes(table))q.in('deal_id',dealIds);
    else if(['conversations','meetings','contact_notes','contact_files'].includes(table))q.in('contact_id',contactIds);
    else if(table==='messages')q.in('conversation_id',conversationIds);
   }
   const r=await q;if(r.error){if(dealChildren.includes(table))break;/* Opportunity record tables arrive with migration 202611020005. */throw new HttpError(503,'Não foi possível carregar os dados do workspace.');}rows.push(...r.data);if(r.data.length<500)break;if(offset===19500)throw new HttpError(413,'Este workspace excedeu o limite de registros da interface.');
  }
  result[table]=rows.map(({user_id:_,...row})=>table==='contacts'&&a.role==='seller'&&a.settings.security.maskContacts?maskedContact(row):row);
 }));
 return result;
}
export async function writeData(a:Access,b:Record<string,any>){
 const table=b.table;if(!Object.hasOwn(tableFields,table))throw new HttpError(400,'Área inválida.');
 if(['agents','knowledge'].includes(table)&&a.role==='seller')throw new HttpError(403,'Somente administradores e gestores podem alterar esta área.');
 const action=b.action;if(!['create','update','delete'].includes(action))throw new HttpError(400,'Operação inválida.');
 if(action!=='create')uuid(b.id);
 let existing:Record<string,any>|null=null;
 if(action!=='create'){
  const r=await a.db.from(table).select('*').eq('id',b.id).eq('user_id',a.ownerId).maybeSingle();if(r.error||!r.data)throw new HttpError(404,'Registro não encontrado.');existing=r.data;
  if(a.role==='seller'){
   if(table==='contacts')await contactAccess(a,b.id);
   else if(table==='messages'){const c=await a.db.from('conversations').select('contact_id').eq('id',existing!.conversation_id).eq('user_id',a.ownerId).single();if(!c.data?.contact_id)throw new HttpError(403,'Sem acesso.');await contactAccess(a,c.data.contact_id);}
   else if(table==='deals')await dealAccess(a,b.id);
   else if(table==='deal_tasks'||table==='deal_notes'){}
   else if(existing!.contact_id)await contactAccess(a,existing!.contact_id);else throw new HttpError(403,'Este registro não está atribuído a você.');
  }
 }
 const input={...(b.input||{})};if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!tableFields[table].includes(k)))throw new HttpError(400,'O pedido contém campos não permitidos.');
 if(table==='contacts'){
  if(a.role==='seller'){if(Object.hasOwn(input,'assigned_to')&&input.assigned_to!==a.user.id)throw new HttpError(403,'Você não pode reatribuir contatos.');if(action==='create')input.assigned_to=a.user.id;if(a.settings.security.maskContacts){delete input.email;delete input.phone;}}
  if(input.assigned_to&&input.assigned_to!==a.ownerId){uuid(input.assigned_to);const m=await a.db.from('workspace_members').select('id').eq('owner_id',a.ownerId).eq('user_id',input.assigned_to).eq('status','active').maybeSingle();if(!m.data)throw new HttpError(400,'Selecione um membro ativo do workspace.');}
  if(input.files&&(!Array.isArray(input.files)||input.files.length>20||input.files.some((f:any)=>typeof f.name!=='string'||f.name.length>150||typeof f.url!=='string'||!/^https:\/\//i.test(f.url)||(()=>{try{const u=new URL(f.url);return Boolean(u.username||u.password);}catch{return true;}})())))throw new HttpError(400,'Use até 20 links HTTPS sem credenciais.');
  if(input.tags&&(!Array.isArray(input.tags)||input.tags.length>20||input.tags.some((x:any)=>typeof x!=='string'||x.length>60)))throw new HttpError(400,'Use até 20 etiquetas de até 60 caracteres.');
  if(input.qualification&&(typeof input.qualification!=='object'||Array.isArray(input.qualification)||Object.entries(input.qualification).some(([k,v])=>!['budget','need','authority','timeline'].includes(k)||typeof v!=='number'||v<0||v>100)))throw new HttpError(400,'Critérios de qualificação inválidos.');
 }
 if(table==='deal_tasks'||table==='deal_notes'){if(action==='create')await dealAccess(a,input.deal_id);else{await dealAccess(a,existing!.deal_id);if(Object.hasOwn(input,'deal_id')&&input.deal_id!==existing!.deal_id)throw new HttpError(400,'Não é possível mover este registro para outra oportunidade.');}}
 if(table==='deal_notes'&&action==='update')throw new HttpError(400,'Notas não podem ser editadas; exclua e crie outra.');
 if(table==='deals'){
  if(a.role==='seller'){if(Object.hasOwn(input,'assigned_to')&&input.assigned_to!==a.user.id)throw new HttpError(403,'Você não pode atribuir oportunidades a outra pessoa.');if(action==='create'&&!input.contact_id)input.assigned_to=a.user.id;}
  if(input.close_date!==undefined&&input.close_date!==null&&(typeof input.close_date!=='string'||!isoDate.test(input.close_date)||!Number.isFinite(Date.parse(input.close_date))))throw new HttpError(400,'Informe uma data de fechamento válida.');
  if(input.probability!==undefined&&input.probability!==null&&(!Number.isInteger(input.probability)||input.probability<0||input.probability>100))throw new HttpError(400,'A probabilidade deve ser um número inteiro entre 0 e 100.');
  if(input.value!==undefined&&(typeof input.value!=='number'||!Number.isFinite(input.value)||input.value<0||input.value>999999999999.99))throw new HttpError(400,'Informe um valor válido.');
  for(const [key,max] of [['next_step',500],['lost_reason',500],['description',12000],['title',200]] as const)if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>max))throw new HttpError(400,'Preencha os campos com valores válidos.');
  input.last_actor=a.user.id;
 }
 if(table==='deal_tasks'){
  if(input.title!==undefined&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>300))throw new HttpError(400,'Informe o título da tarefa.');
  for(const key of ['due_at','done_at'])if(input[key]!==undefined&&input[key]!==null&&(typeof input[key]!=='string'||!Number.isFinite(Date.parse(input[key]))))throw new HttpError(400,'Informe uma data válida.');
  if(a.role==='seller'&&action==='create'&&!input.assigned_to)input.assigned_to=a.user.id;
 }
 if((table==='deals'||table==='deal_tasks')&&input.assigned_to)await activeMember(a,input.assigned_to);
 if(input.contact_id)await contactAccess(a,input.contact_id);
 if(table==='conversations'&&action==='create'&&input.channel!=='web')throw new HttpError(400,'Novas conversas internas usam o canal web.');
 if(input.agent_id){uuid(input.agent_id);const agent=await a.db.from('agents').select('id').eq('id',input.agent_id).eq('user_id',a.ownerId).maybeSingle();if(!agent.data)throw new HttpError(400,'Agente não encontrado.');}
 if(table==='messages'){
  if(action!=='create'||input.role!=='human')throw new HttpError(403,'Respostas de IA e mensagens recebidas são registradas pelo servidor.');
  const c=await a.db.from('conversations').select('*').eq('id',input.conversation_id).eq('user_id',a.ownerId).maybeSingle();if(!c.data||c.data.status!=='human'||c.data.channel!=='web')throw new HttpError(409,'Assuma uma conversa interna para registrar uma resposta.');if(c.data.contact_id)await contactAccess(a,c.data.contact_id);
 }
 if(table==='contact_notes'||table==='deal_notes')input.author=a.user.email||'Equipe';
 if(action==='delete'){
  const r=await a.db.from(table).delete().eq('id',b.id).eq('user_id',a.ownerId).select('id');if(r.error||!r.data?.length)throw new HttpError(409,'Não foi possível excluir. Verifique os registros vinculados.');return {deleted:true};
 }
 const r=action==='create'?await a.db.from(table).insert({...input,user_id:a.ownerId}).select().single():await a.db.from(table).update(input).eq('user_id',a.ownerId).eq('id',b.id).select().single();
 if(r.error||!r.data)throw new HttpError(400,'Não foi possível salvar. Confira os campos e os vínculos do registro.');
 if(table==='contacts')await emitEvent(a.db,a.ownerId,input.status==='qualified'&&existing?.status!=='qualified'?'lead.qualified':action==='create'?'lead.created':'lead.updated',{id:r.data.id,name:r.data.name,status:r.data.status,score:r.data.score});
 if(table==='meetings'&&action==='create')await emitEvent(a.db,a.ownerId,'meeting.booked',{id:r.data.id,contact_id:r.data.contact_id,starts_at:r.data.starts_at});
 const {user_id:_,...row}=r.data;return {row:table==='contacts'&&a.role==='seller'&&a.settings.security.maskContacts?maskedContact(row):row};
}
