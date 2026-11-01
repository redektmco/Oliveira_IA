import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('shared workspace migration is repeatable and enforces assigned leads, role boundaries and private credentials',async()=>{
 const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',seller='10000000-0000-4000-8000-000000000003',outsider='10000000-0000-4000-8000-000000000004';
 try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;grant usage on schema auth,public to anon,authenticated,service_role;`);
 for(const filename of ['202610200001_initial.sql','202610300002_whatsapp.sql','202610300003_crm_triage.sql','202610310003_workspace.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202610310003_workspace.sql',import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${owner}','owner@example.com'),('${manager}','manager@example.com'),('${seller}','seller@example.com'),('${outsider}','outsider@example.com');insert into public.workspace_members(owner_id,user_id,email,role,status) values('${owner}','${manager}','manager@example.com','manager','active'),('${owner}','${seller}','seller@example.com','seller','active');insert into public.contacts(id,user_id,name,assigned_to) values('20000000-0000-4000-8000-000000000001','${owner}','Assigned','${seller}'),('20000000-0000-4000-8000-000000000002','${owner}','Unassigned',null);insert into public.conversations(id,user_id,contact_id,status) values('30000000-0000-4000-8000-000000000001','${owner}','20000000-0000-4000-8000-000000000001','human'),('30000000-0000-4000-8000-000000000002','${owner}','20000000-0000-4000-8000-000000000002','human');insert into public.messages(user_id,conversation_id,role,content) values('${owner}','30000000-0000-4000-8000-000000000001','human','Assigned history'),('${owner}','30000000-0000-4000-8000-000000000002','human','Private history');`);
 const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',session_id:'40000000-0000-4000-8000-000000000001',aal:'aal1'})]);await db.exec('set role authenticated');};
 await as(seller);assert.equal((await db.query('select * from public.contacts')).rows.length,1);assert.equal((await db.query('select * from public.messages')).rows.length,1);
 assert.equal((await db.query('select * from public.contacts where name=\'Unassigned\'')).rows.length,0);
 await assert.rejects(db.exec(`update public.contacts set assigned_to='${owner}'where name='Assigned'`));
 await assert.rejects(db.exec(`insert into public.agents(user_id,name) values('${owner}','Unauthorized')`));
 await assert.rejects(db.exec('select secret from public.integration_accounts'));
 await assert.rejects(db.exec(`update public.contacts set user_id='${seller}' where name='Assigned'`));
 await as(manager);assert.equal((await db.query('select * from public.contacts')).rows.length,2);await db.exec(`insert into public.agents(user_id,name) values('${owner}','Allowed manager')`);
 await as(outsider);assert.equal((await db.query('select * from public.contacts')).rows.length,0);
 await db.exec('reset role');await db.exec(`update public.workspace_members set status='disabled' where user_id='${seller}'`);await as(seller);assert.equal((await db.query('select * from public.contacts')).rows.length,0);
 await db.exec('reset role');await db.exec(`insert into public.workspace_settings(user_id,config)values('${owner}','{"security":{"maskContacts":true}}')`);await as(owner);assert.equal((await db.query('select * from public.contacts')).rows.length,0,'sensitive workspaces must route data through authenticated server checks');
 await assert.rejects(db.query('select public.workspace_erase($1)',[owner]));
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);await db.exec('set role service_role');
 await db.query('select public.workspace_save_section($1,$2,$3)',[owner,'general',JSON.stringify({name:'Saved'})]);
 const config=await db.query<{config:any}>('select config from public.workspace_settings where user_id=$1',[owner]);assert.equal(config.rows[0].config.general.name,'Saved');assert.equal(config.rows[0].config.security.maskContacts,true,'saving one tab must retain other tabs');
 }finally{await db.close();}
});
