export type WorkspaceRole = 'admin' | 'manager' | 'seller';
export const roleLabels: Record<WorkspaceRole,string> = {admin:'Administrador',manager:'Gestor comercial',seller:'Vendedor'};
export type GeneralSettings = {name:string;segment:string;site:string;email:string;timezone:string;language:string;logo:string;roundRobin:boolean;recordHistory:boolean;dailyDigest:boolean;phoneFormat:string};
export type Schedule = {days:number[];start:string;end:string;enabled:boolean};
export type WhatsAppSettings = {autoReply:boolean;schedule:Schedule;humanHandoff:boolean;typingMin:number;typingMax:number;hotLeadAlert:boolean};
export type EmailSettings = {senderName:string;replyTo:string;signature:string;autoFollowup:boolean;pauseOnReply:boolean;dailyLimit:number;schedule:Schedule};
export type InstagramSettings = {directMessages:boolean;comments:boolean;ads:boolean;stories:boolean};
export type WidgetSettings = {enabled:boolean;title:string;greeting:string;color:string;captureContact:boolean;avatar:boolean;position:'right'|'left';domains:string[];agentId:string};
export type SecuritySettings = {requireMfa:boolean;allowGoogle:boolean;sessionDays:number;allowedIps:string[];maskContacts:boolean;recordConsent:boolean;retentionMonths:number};
export type SchedulingSettings = {aiBooking:boolean;createDeals:boolean;duration:number;schedule:Schedule;minNoticeHours:number;horizonDays:number;googleMeet:boolean};
export type WorkspaceSettings = {general:GeneralSettings;whatsapp:WhatsAppSettings;email:EmailSettings;instagram:InstagramSettings;widget:WidgetSettings;security:SecuritySettings;scheduling:SchedulingSettings};
export const defaultSettings = (): WorkspaceSettings => ({
 general:{name:'Oliveira & Co.',segment:'',site:'',email:'',timezone:'America/Sao_Paulo',language:'pt-BR',logo:'',roundRobin:false,recordHistory:true,dailyDigest:false,phoneFormat:'international'},
 whatsapp:{autoReply:true,schedule:{days:[1,2,3,4,5],start:'08:00',end:'18:00',enabled:false},humanHandoff:true,typingMin:0,typingMax:0,hotLeadAlert:true},
 email:{senderName:'Oliveira & Co.',replyTo:'',signature:'Atenciosamente,\nEquipe Oliveira & Co.',autoFollowup:false,pauseOnReply:true,dailyLimit:150,schedule:{days:[1,2,3,4,5],start:'08:00',end:'18:00',enabled:true}},
 instagram:{directMessages:true,comments:false,ads:true,stories:true},
 widget:{enabled:false,title:'Fale com a gente',greeting:'Oi! Sou a Felipa, assistente de IA. Como posso ajudar?',color:'#e11d48',captureContact:true,avatar:true,position:'right',domains:[],agentId:''},
 security:{requireMfa:false,allowGoogle:true,sessionDays:7,allowedIps:[],maskContacts:false,recordConsent:true,retentionMonths:12},
 scheduling:{aiBooking:true,createDeals:true,duration:30,schedule:{days:[1,2,3,4,5],start:'09:00',end:'18:00',enabled:true},minNoticeHours:2,horizonDays:7,googleMeet:true}
});
export function mergeSettings(value: Partial<WorkspaceSettings> | null | undefined): WorkspaceSettings {
 const defaults=defaultSettings();return Object.fromEntries(Object.entries(defaults).map(([key,section])=>[key,{...section,...value?.[key as keyof WorkspaceSettings]}])) as WorkspaceSettings;
}
export type Member={id:string;user_id:string|null;owner_id:string;email:string;name:string;role:WorkspaceRole;status:'active'|'pending'|'disabled';created_at:string;last_seen_at?:string};
export type AuditEntry={id:string;actor_email:string;action:string;created_at:string};
export type SessionEntry={id:string;device:string;ip:string;last_seen_at:string;created_at:string;revoked_at:string|null;current?:boolean};
export type ApiKeyInfo={id:string;name:string;prefix:string;last_used_at:string|null;created_at:string;revoked_at:string|null};
export type WebhookInfo={id:string;url:string;events:string[];enabled:boolean;created_at:string;failure_count:number};
export const webhookEvents=['lead.created','lead.updated','lead.qualified','message.received','meeting.booked'] as const;
