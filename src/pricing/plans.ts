export const commercialPlans = [
  {id:'essencial',name:'Essencial',price:199,setup:390,description:'CRM para organizar o comercial.',users:'3 usuários',whatsapp:'1 número WhatsApp',leads:null,interactions:null,features:['CRM Kanban e funil','Caixa de entrada compartilhada','300 sugestões/resumos com IA'],limit:'Sem atendimento autônomo',icon:'pipeline'},
  {id:'sdr',name:'SDR IA',price:449,setup:790,description:'SDR IA para qualificar e agendar.',users:'5 usuários',whatsapp:'1 número WhatsApp',leads:500,interactions:2000,features:['Qualificação automática','Agendamento e follow-up','Transferência para humano'],limit:null,icon:'spark'},
  {id:'performance',name:'Performance',price:899,setup:1490,description:'Para empresas com mais demanda comercial.',users:'10 usuários',whatsapp:'2 números WhatsApp',leads:1500,interactions:6000,features:['Automações avançadas','Múltiplos funis','Integrações via API/webhook','Relatórios avançados'],limit:null,icon:'chart'},
  {id:'enterprise',name:'Enterprise',price:null,setup:null,description:'Alto volume e uma operação sob medida.',users:'Equipe dimensionada na proposta',whatsapp:'Múltiplas unidades e canais',leads:null,interactions:null,features:['Volume personalizado de leads e IA','Integrações específicas','Atendimento personalizado'],limit:null,icon:'building'},
] as const;
export type CommercialPlanId = typeof commercialPlans[number]['id'];
export const expansion = {price:149,leads:500,interactions:2000};
export const brl = (value:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
export const number = (value:number) => new Intl.NumberFormat('pt-BR').format(value);
export function estimatePlan(id:CommercialPlanId,packages:number){
  const plan=commercialPlans.find(p=>p.id===id)!;
  const count=(id==='sdr'||id==='performance')?Math.min(10,Math.max(0,Math.trunc(packages)||0)):0;
  return {plan,packages:count,monthly:plan.price===null?null:plan.price+count*expansion.price,setup:plan.setup,leads:plan.leads===null?null:plan.leads+count*expansion.leads,interactions:plan.interactions===null?null:plan.interactions+count*expansion.interactions};
}
