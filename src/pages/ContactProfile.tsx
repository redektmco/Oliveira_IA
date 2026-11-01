import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/ui";
import { useWorkspace } from "../lib/workspace";
import { supabase } from "../lib/supabase";
import {
  contactStatuses,
  stages,
  type Contact,
  type Conversation,
} from "../lib/types";
import Meetings from "./Meetings";
import "./profile.css";
import {formatPhone} from "../lib/phone";
import {Dialog,Field,usePanelData} from "../settings/shared";

const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
const labels = {
  budget: "Orçamento",
  need: "Necessidade",
  authority: "Autoridade",
  timing: "Prazo",
} as const;
type Tab = "Atividade" | "Conversa" | "Notas" | "Reuniões" | "Arquivos";

export default function ContactProfile({
  contact,
  onEdit,
}: {
  contact: Contact;
  onEdit: () => void;
}) {
  const { data, demo, create, update, askClaude, refresh,api,role,phoneFormat } = useWorkspace();
  const context=usePanelData<any>(()=>api('contact.context'),[api]);
  const attachment=useRef<HTMLInputElement>(null);
  const attachedFiles=data.contact_files.filter(f=>f.contact_id===contact.id);
  const internalNotes=data.contact_notes.filter(n=>n.contact_id===contact.id);
  const [editingAction,setEditingAction]=useState(false),[nextActionDraft,setNextActionDraft]=useState('');
  const pendingSend = useRef<{ text: string; conversationId: string; id: string } | null>(null);
  useEffect(() => {
    if (demo) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true).catch(() => {}); }, 8000);
    return () => window.clearInterval(timer);
  }, [demo, refresh]);
  const [tab, setTab] = useState<Tab>("Atividade");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [tag, setTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [criteria, setCriteria] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState("");
  const conversations = data.conversations
    .filter((c) => c.contact_id === contact.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const conversation =
    conversations.find((c) => c.id === selectedConversation) ??
    conversations.find((c) => c.status !== "closed") ??
    conversations[0];
  const agent = data.agents.find((a) => a.id === conversation?.agent_id);
  const ids = new Set(conversations.map((c) => c.id));
  const messages = data.messages
    .filter((m) => ids.has(m.conversation_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const chatMessages = messages.filter(
    (m) => m.conversation_id === conversation?.id,
  );
  const meetings = data.meetings.filter((m) => m.contact_id === contact.id);
  const deals = data.deals
    .filter((d) => d.contact_id === contact.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const triage = contact.triage;
  const manualNewer=Boolean(contact.ai_summary&&(!contact.triage_updated_at||(contact.summary_at||'')>contact.triage_updated_at));
  const summary=manualNewer?contact.ai_summary:triage?.summary;
  const nextAction=contact.ai_next_action||triage?.next_action||'';
  const pipeline = [
    "new",
    "qualifying",
    "qualified",
    "meeting",
    "proposal",
    "won",
  ] as const;
  const currentStage =
    deals[0]?.stage ??
    (contact.status === "qualified"
      ? "qualified"
      : contact.status === "qualifying"
        ? "qualifying"
        : "new");
  const isActive = conversation?.status === "ai" && agent?.active;
  const stale =
    triage &&
    messages.some((m) => m.created_at > (contact.triage_updated_at ?? ""));

  async function run(action: () => Promise<void>, message = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const status = (next: Conversation["status"]) =>
    run(
      async () => {
        if (!conversation) return;
        await update("conversations", conversation.id, { status: next });
        if (next === "human") setTab("Conversa");
      },
      next === "human"
        ? "Atendimento humano ativado. A IA não responderá nesta conversa."
        : "Atendimento por IA retomado.",
    );
  const saveNote = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await create('contact_notes',{contact_id:contact.id,content:note.trim()});
      setNote("");
    }, "Nota salva.");
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!conversation || !draft.trim()) return;
    void run(async () => {
      if (conversation.status === "human") {
        if (conversation.channel !== 'web' && !demo) {
          const text=draft.trim();
          if(!pendingSend.current||pendingSend.current.text!==text||pendingSend.current.conversationId!==conversation.id)pendingSend.current={text,conversationId:conversation.id,id:crypto.randomUUID()};
          await api('channel.send',{conversationId:conversation.id,requestId:pendingSend.current.id,text});pendingSend.current=null;await refresh(true).catch(()=>{});
        } else await create("messages", { conversation_id: conversation.id, role: "human", content: draft.trim() });
      } else if (conversation.status === "ai" && agent?.active && conversation.channel === 'web') {
        await askClaude({ agentId: agent.id, conversationId: conversation.id, message: draft.trim() });
      } else throw new Error("Assuma o atendimento para responder ao cliente.");
      setDraft("");
    });
  };
  const startConversation = () =>
    run(async () => {
      const activeAgent = data.agents.find((a) => a.active);
      if (!activeAgent)
        throw new Error("Crie ou ative um agente na página Agentes de IA.");
      const created = await create("conversations", {
        contact_id: contact.id,
        agent_id: activeAgent.id,
        channel: "web",
        status: "ai",
      });
      setSelectedConversation(created.id);
      setTab("Conversa");
    }, "Conversa interna criada.");

  return (
    <div className="content client-profile">
      <a className="profile-back" href="#contacts">
        ← Voltar para contatos
      </a>
      <header className="profile-header">
        <div className="profile-identity">
          <div className="profile-avatar">
            {contact.name
              .split(/\s+/)
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div>
            <div className="profile-title">
              <h1>{contact.name}</h1>
              <span className="badge badge-brand">
                {contactStatuses[contact.status]}
              </span>
              {conversation && (
                <span
                  className={`badge ${isActive ? "badge-success" : "badge-neutral"}`}
                >
                  <Icon name="spark" size={13} />
                  {isActive
                    ? "SDR IA ativa"
                    : conversation.status === "human"
                      ? "Atendimento humano"
                      : conversation.status === "closed"
                        ? "Conversa encerrada"
                        : "Agente pausado"}
                </span>
              )}
            </div>
            <div className="profile-meta">
              <span>
                <Icon name="building" size={14} />
                {[contact.company, contact.job_title]
                  .filter(Boolean)
                  .join(" · ") || "Empresa não informada"}
              </span>
              {contact.city && <span>{contact.city}</span>}
              <span>{formatPhone(contact.phone,phoneFormat) || "Telefone não informado"}</span>
              <span>
                Lead desde{" "}
                {new Date(contact.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          {conversation?.status === "ai" ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void status("human")}
            >
              Pausar IA
            </button>
          ) : (
            conversation?.status === "human" && (
              <button
                className="btn"
                disabled={busy || !agent?.active}
                onClick={() => void status("ai")}
              >
                Retomar IA
              </button>
            )
          )}
          <button
            className="btn"
            onClick={() => {
              setTab("Reuniões");
              setSchedule(true);
            }}
          >
            <Icon name="calendar" size={15} />
            Agendar reunião
          </button>
          {conversation && conversation.status !== "closed" ? (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                conversation.status === "human"
                  ? setTab("Conversa")
                  : void status("human")
              }
            >
              <Icon name="message" size={15} />
              {conversation.status === "human"
                ? "Abrir conversa"
                : "Assumir conversa"}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void startConversation()}
            >
              Iniciar conversa
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="crm-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="crm-success" role="status">
          {success}
        </div>
      )}
      <ol className="profile-pipeline" aria-label="Etapa comercial">
        {pipeline.map((stage, index) => (
          <li
            className={
              currentStage === stage
                ? "current"
                : currentStage !== "lost" &&
                    index < pipeline.indexOf(currentStage)
                  ? "complete"
                  : ""
            }
            key={stage}
            aria-current={currentStage === stage ? "step" : undefined}
          >
            <span className="step-dot">
              {currentStage !== "lost" && index < pipeline.indexOf(currentStage)
                ? "✓"
                : index + 1}
            </span>
            <div>
              <b>{stages[stage]}</b>
              <small>{currentStage === stage ? "Etapa atual" : "—"}</small>
            </div>
          </li>
        ))}
      </ol>
      {currentStage === "lost" && (
        <p className="crm-info">
          A oportunidade mais recente foi marcada como perdida.
        </p>
      )}
      <div className="profile-columns">
        <div className="profile-main">
          <section className="card profile-summary">
            <div className="profile-section-head">
              <h2>
                <span className="profile-ai-icon">
                  <Icon name="spark" size={17} />
                </span>
                Resumo da IA
              </h2>
              <button className="profile-link" disabled={demo||busy||!messages.length} onClick={()=>void run(async()=>{await api('contact.summary',{contactId:contact.id});await refresh();},'Resumo atualizado.')}>{summary?'Atualizar resumo':'Gerar resumo'}</button>
              <small>
                {triage && contact.triage_updated_at
                  ? `Atualizado em ${date(contact.triage_updated_at)}`
                  : "Aguardando conversa"}
              </small>
            </div>
            {summary ? (
              <>
                <p>{summary}</p>
                <small className="crm-note">
                  {contact.triage_message_count ?? messages.length} mensagens no
                  histórico · análise do contexto recente e resumo anterior
                  {stale
                    ? " · Há mensagens mais recentes; a próxima resposta da IA atualizará a ficha."
                    : ""}
                </small>
                <div className="profile-next">
                  <div>
                    <span className="eyebrow">PRÓXIMA AÇÃO SUGERIDA</span>
                    <p>{nextAction}</p>
                  </div>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setNote(nextAction);
                      setTab("Notas");
                    }}
                  >
                    Adicionar às notas
                  </button><button className="btn" onClick={()=>{setNextActionDraft(nextAction);setEditingAction(true);}}>Editar</button><button className="btn btn-primary" disabled={busy||!conversation||demo} onClick={()=>void run(async()=>{if(!conversation)return;await update("conversations",conversation.id,{status:"human"});setDraft(nextAction);setTab("Conversa");})}>Revisar e enviar</button>
                </div>
              </>
            ) : (
              <div className="profile-summary-empty">
                <p>
                  A IA resumirá a necessidade do cliente, identificará os
                  critérios de qualificação e sugerirá o próximo passo após uma
                  resposta nesta conversa.
                </p>
                <small>
                  {demo
                    ? "Na demonstração, a IA não é executada."
                    : "Informações ainda não confirmadas permanecerão como não informadas."}
                </small>
              </div>
            )}
          </section>
          <section className="card profile-history">
            <div
              className="profile-tabs"
              role="tablist"
              aria-label="Histórico do cliente"
            >
              {(
                [
                  "Atividade",
                  "Conversa",
                  "Notas",
                  "Reuniões",
                  "Arquivos",
                ] as Tab[]
              ).map((item) => (
                <button
                  id={`tab-${item}`}
                  role="tab"
                  aria-selected={tab === item}
                  aria-controls="profile-panel"
                  tabIndex={tab === item ? 0 : -1}
                  onKeyDown={(e) => {
                    const tabs: Tab[] = [
                      "Atividade",
                      "Conversa",
                      "Notas",
                      "Reuniões",
                      "Arquivos",
                    ];
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? 4
                            : (tabs.indexOf(item) +
                                (e.key === "ArrowRight" ? 1 : -1) +
                                5) %
                              5;
                      setTab(tabs[next]);
                      document.getElementById(`tab-${tabs[next]}`)?.focus();
                    }
                  }}
                  key={item}
                  onClick={() => setTab(item)}
                >
                  {item}
                  {item === "Conversa" && <span>{messages.length}</span>}
                  {item === "Reuniões" && <span>{meetings.length}</span>}
                  {item === "Arquivos" && (
                    <span>{(contact.files?.length ?? 0)+attachedFiles.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div
              id="profile-panel"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              tabIndex={0}
            >
              {tab === "Atividade" && (
                <div className="profile-timeline">
                  {internalNotes.slice().reverse().map(n=><article key={n.id}><span className="timeline-icon"><Icon name="book" size={14}/></span><div><b>Nota interna{n.author?` · ${n.author}`:''}</b><p>{n.content}</p><time>{date(n.created_at)}</time></div></article>)}
                  {[...messages].filter(m=>context.data?.preferences?.recordHistory!==false||m.role!=='assistant')
                    .reverse()
                    .slice(0, 30)
                    .map((message) => (
                      <article key={message.id}>
                        <span
                          className={`timeline-icon ${message.role === "assistant" ? "ai" : ""}`}
                        >
                          <Icon
                            name={
                              message.role === "assistant" ? "spark" : "message"
                            }
                            size={15}
                          />
                        </span>
                        <div>
                          <div className="profile-section-head">
                            <b>
                              {message.role === "user"
                                ? `${contact.name} enviou uma mensagem`
                                : message.role === "assistant"
                                  ? "SDR IA respondeu"
                                  : "Equipe respondeu"}
                            </b>
                            <time>{date(message.created_at)}</time>
                          </div>
                          <p>{message.content}</p>
                        </div>
                      </article>
                    ))}
                  {triage && (
                    <article>
                      <span className="timeline-icon ai">
                        <Icon name="target" size={15} />
                      </span>
                      <div>
                        <b>Triagem automática atualizada</b>
                        <p>
                          {contactStatuses[triage.status]} · Score{" "}
                          {triage.score}/100
                        </p>
                      </div>
                    </article>
                  )}
                  <article>
                    <span className="timeline-icon">
                      <Icon name="users" size={15} />
                    </span>
                    <div>
                      <b>Lead criado</b>
                      <p>
                        {date(contact.created_at)} · Origem:{" "}
                        {contact.source || "Não informada"}
                      </p>
                    </div>
                  </article>
                </div>
              )}
              {tab === "Conversa" && (
                <div className="profile-conversation">
                  {conversations.length > 1 && (
                    <label className="profile-field">
                      Conversa
                      <select
                        value={conversation?.id ?? ""}
                        onChange={(e) => {
                          setSelectedConversation(e.target.value);
                          setDraft("");
                        }}
                      >
                        {conversations.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.channel === "whatsapp" ? "WhatsApp" : "Web"} · {date(c.created_at)} ·{" "}
                            {c.status === "ai"
                              ? "IA"
                              : c.status === "human"
                                ? "Humano"
                                : "Encerrada"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="crm-info">
                    {conversation?.channel === 'whatsapp' ? (conversation.status === 'ai' ? 'A IA responde automaticamente às mensagens recebidas dos números autorizados no WhatsApp. Assuma a conversa para responder pessoalmente.' : 'Atendimento pelo WhatsApp. Suas respostas entram na fila de envio; acompanhe o status abaixo.') : 'Conversa interna pelo painel. As mensagens desta conversa não são enviadas ao WhatsApp.'}
                  </p>
                  {!conversation ? (
                    <div className="crm-empty">
                      <b>Nenhuma conversa iniciada</b>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => void startConversation()}
                      >
                        Iniciar conversa
                      </button>
                    </div>
                  ) : (
                    <>
                      {chatMessages.length ? (
                        chatMessages.map((m) => (
                          <article
                            className={`profile-message ${m.role}`}
                            key={m.id}
                          >
                            <b>
                              {m.role === "user"
                                ? contact.name
                                : m.role === "assistant"
                                  ? "SDR IA"
                                  : "Equipe"}
                            </b>
                            <p>{m.content}</p>
                            <time>{date(m.created_at)}{m.delivery_status && !["stored", "received"].includes(m.delivery_status) ? ` · ${{queued: "Na fila", sending: "Enviando", sent: "Enviado", delivered: "Entregue", read: "Lido", failed: "Falhou", uncertain: "Envio não confirmado — confira no canal", canceled: "Cancelado"}[m.delivery_status] || m.delivery_status}` : ""}</time>
                          </article>
                        ))
                      ) : (
                        <p className="crm-note">
                          Envie a primeira mensagem para iniciar o atendimento.
                        </p>
                      )}
                      <form onSubmit={send}>
                        <label className="profile-field">
                          {conversation.status === "human"
                            ? "Resposta da equipe"
                            : "Mensagem do cliente para a IA"}
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            maxLength={4000}
                            required
                            disabled={busy || conversation.status === "closed" || (conversation.channel !== "web" && conversation.status === "ai")}
                            placeholder="Escreva a mensagem…"
                          />
                        </label>
                        <button
                          className="btn btn-primary"
                          disabled={
                            busy ||
                            !draft.trim() ||
                            conversation.status === "closed" ||
                            (conversation.status === "ai" &&
                              (!agent?.active || demo || conversation.channel !== "web"))
                          }
                        >
                          {busy ? "Processando…" : "Enviar mensagem"}
                        </button>
                        {demo && conversation.status === "ai" && (
                          <p className="crm-note">
                            Entre com sua conta conectada para executar a IA.
                          </p>
                        )}
                      </form>
                    </>
                  )}
                </div>
              )}
              {tab === "Notas" && (
                <div className="profile-notes">
                  {internalNotes.map(n=><article className="profile-internal-note" key={n.id}><small>{n.author||"Equipe"} · {date(n.created_at)}</small><p>{n.content}</p></article>)}
                  {contact.notes ? (
                    <p>{contact.notes}</p>
                  ) : (
                    <p className="crm-note">{internalNotes.length?"":"Ainda não há notas internas."}</p>
                  )}
                  <button className="btn btn-ghost" onClick={onEdit}>
                    Editar notas e cadastro
                  </button>
                </div>
              )}
              {tab === "Arquivos" && (
                <div className="profile-notes">
                  <p className="crm-note">
                    Vincule propostas e documentos por um endereço HTTPS. O
                    acesso ao arquivo depende das permissões no serviço de
                    origem.
                  </p>
                  <div className="profile-attachment-toolbar"><span>Envie PDF, texto ou imagens de até 2 MB.</span><button className="btn" disabled={demo||busy} onClick={()=>attachment.current?.click()}>Anexar arquivo</button><input type="file" hidden ref={attachment} accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;void run(async()=>{if(file.size>2097152)throw new Error('Use um arquivo de até 2 MB.');const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));reader.readAsDataURL(file);});await api('file.upload',{contactId:contact.id,name:file.name,mime:file.type||'text/plain',base64});await refresh();},'Arquivo anexado.');}}/></div>
                  {attachedFiles.map(file=><div className="profile-file" key={file.id}><span>{file.name} · {Math.ceil(file.bytes/1024)} KB</span><button className="text-link" disabled={busy} onClick={()=>void run(async()=>{const result=await api('file.download',{id:file.id});location.assign(result.url);})}>Baixar</button><button className="btn btn-ghost" disabled={busy} onClick={()=>{if(confirm('Remover este arquivo?'))void run(async()=>{await api('file.remove',{id:file.id});await refresh();},'Arquivo removido.');}}>Remover</button></div>)}
                  {(contact.files ?? []).map((file) => (
                    <div className="profile-file" key={file.id}>
                      <a
                        href={
                          /^https:\/\//i.test(file.url) ? file.url : undefined
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {file.name} ↗
                      </a>
                      <button
                        className="btn btn-ghost"
                        disabled={busy}
                        aria-label={`Remover link ${file.name}`}
                        onClick={() =>
                          void run(() =>
                            update("contacts", contact.id, {
                              files: contact.files?.filter(
                                (f) => f.id !== file.id,
                              ),
                            }),
                          )
                        }
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        let url: URL;
                        try {
                          url = new URL(fileUrl);
                        } catch {
                          throw new Error("Informe um link HTTPS válido.");
                        }
                        if (
                          url.protocol !== "https:" ||
                          url.username ||
                          url.password
                        )
                          throw new Error("Use um link HTTPS sem credenciais.");
                        if ((contact.files?.length ?? 0) >= 20)
                          throw new Error("Use até 20 links por cliente.");
                        await update("contacts", contact.id, {
                          files: [
                            ...(contact.files ?? []),
                            {
                              id: crypto.randomUUID(),
                              name: fileName.trim(),
                              url: url.href,
                            },
                          ],
                        });
                        setFileName("");
                        setFileUrl("");
                      }, "Documento vinculado.");
                    }}
                  >
                    <label className="profile-field">
                      Nome do documento
                      <input
                        maxLength={150}
                        required
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                      />
                    </label>
                    <label className="profile-field">
                      Link do documento
                      <input
                        type="url"
                        placeholder="https://…"
                        maxLength={2000}
                        required
                        value={fileUrl}
                        onChange={(e) => setFileUrl(e.target.value)}
                      />
                    </label>
                    <button
                      className="btn"
                      disabled={busy || !fileName.trim() || !fileUrl.trim()}
                    >
                      Adicionar documento
                    </button>
                  </form>
                </div>
              )}
              {tab === "Reuniões" && (
                <Meetings
                  contactId={contact.id}
                  startOpen={schedule}
                  onOpened={() => setSchedule(false)}
                />
              )}
            </div>
            {(tab === "Atividade" || tab === "Notas") && (
              <form className="profile-note-composer" onSubmit={saveNote}>
                <label className="sr-only" htmlFor="client-note">
                  Nota interna
                </label>
                <textarea
                  id="client-note"
                  maxLength={4000}
                  placeholder="Escreva uma nota interna sobre este cliente…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  disabled={busy}
                />
                <button className="btn" disabled={busy || !note.trim()}>
                  Salvar nota
                </button>
              </form>
            )}
          </section>
        </div>
        <aside className="profile-details" aria-label="Dados e qualificação">
          <section className="card profile-score-card">
            <div className="profile-section-head">
              <h2>SCORE DE QUALIFICAÇÃO</h2>
              <button
                className="profile-link"
                aria-expanded={criteria}
                onClick={() => setCriteria(!criteria)}
              >
                Ver critérios
              </button>
            </div>
            <div className="profile-score">
              <strong>{contact.score}</strong>
              <span>/ 100</span>
              <span
                className={`badge ${contact.status === "qualified" ? "badge-success" : "badge-brand"}`}
              >
                {contact.status === "qualified"
                  ? "Qualificado"
                  : contact.status === "unqualified"
                    ? "Não qualificado"
                    : triage
                      ? "Em análise"
                      : "Sem triagem IA"}
              </span>
            </div>
            {Object.entries(labels).map(([key, label]) => {
              const criterion = triage?.criteria[key as keyof typeof labels];
              return (
                <div className="profile-criterion" key={key}>
                  <div>
                    <span>{label}</span>
                    <b>{criterion?.score ?? "—"}</b>
                  </div>
                  <div
                    className="criterion-track"
                    role="meter"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={criterion?.score ?? 0}
                    aria-valuetext={
                      criterion?.score == null
                        ? "Não informado"
                        : String(criterion.score)
                    }
                  >
                    <i style={{ width: `${criterion?.score ?? 0}%` }} />
                  </div>
                  {criteria && (
                    <p>
                      {criterion?.evidence ||
                        "Ainda não informado pelo cliente."}
                    </p>
                  )}
                </div>
              );
            })}
            {criteria && (
              <p className="crm-note">
                Média dos quatro critérios. Informações desconhecidas contribuem
                com zero; a qualificação exige os quatro critérios e o limiar
                definido no agente. A equipe pode revisar o cadastro.
              </p>
            )}
          </section>
          <section className="card profile-contact-card">
            <div className="profile-section-head">
              <h2>DADOS DE CONTATO</h2>
              <button className="profile-link" onClick={onEdit}>
                Editar
              </button>
            </div>
            <dl>
              {[
                ["Telefone", formatPhone(contact.phone,phoneFormat)],
                ["E-mail", contact.email],
                ["Empresa", contact.company],
                ["Cargo", contact.job_title],
                ["Cidade", contact.city],
                ["Origem", contact.source],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Não informado"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card profile-owners">
            <h2>RESPONSÁVEIS</h2>
            <div>
              <span className="profile-ai-icon">
                <Icon name="spark" size={18} />
              </span>
              <p>
                <b>{agent?.name || "Nenhum agente vinculado"}</b>
                <small>
                  {isActive
                    ? "Atendimento automático ativo"
                    : "Sem atendimento automático ativo"}
                </small>
              </p>
            </div>
            <div>
              <span className="profile-small-avatar">
                <Icon name="users" size={18} />
              </span>
              <p>
                <b>{context.data?.members?.find((m:any)=>m.user_id===contact.assigned_to)?.name||contact.owner_name || "Responsável não definido"}</b>
                <small>Responsável comercial</small>
              </p>
            </div>
            <Field label="Atribuir responsável"><select aria-label="Atribuir responsável" disabled={busy||role==='seller'} value={contact.assigned_to||''} onChange={e=>void run(()=>update('contacts',contact.id,{assigned_to:e.target.value||null}),'Responsável atualizado.')}><option value="">Não atribuído</option>{context.data?.members?.filter((m:any)=>m.user_id&&m.status==='active').map((m:any)=><option key={m.id} value={m.user_id}>{m.name||m.email||'Membro da equipe'}</option>)}</select></Field>
          </section>
          <section className="card profile-tags">
            <div className="profile-section-head">
              <h2>ETIQUETAS</h2>
              <button
                className="profile-link"
                onClick={() => setAddingTag(!addingTag)}
              >
                + Adicionar
              </button>
            </div>
            <div className="profile-tag-list">
              {(contact.tags ?? []).map((value) => (
                <span key={value}>
                  {value}
                  <button
                    aria-label={`Remover etiqueta ${value}`}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        update("contacts", contact.id, {
                          tags: contact.tags?.filter((t) => t !== value),
                        }),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {!contact.tags?.length && (
                <p className="crm-note">Nenhuma etiqueta adicionada.</p>
              )}
            </div>
            {addingTag && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const tags = [
                      ...new Set([...(contact.tags ?? []), tag.trim()]),
                    ];
                    if (tags.length > 20)
                      throw new Error("Use até 20 etiquetas.");
                    await update("contacts", contact.id, { tags });
                    setTag("");
                    setAddingTag(false);
                  });
                }}
              >
                <label className="profile-field">
                  Nova etiqueta
                  <input
                    autoFocus
                    value={tag}
                    maxLength={40}
                    onChange={(e) => setTag(e.target.value)}
                    required
                  />
                </label>
                <button className="btn" disabled={busy || !tag.trim()}>
                  Adicionar
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
      {editingAction&&<Dialog title="Editar próxima ação" onClose={()=>setEditingAction(false)} busy={busy} submitLabel="Salvar sugestão" onSubmit={e=>{e.preventDefault();void run(async()=>{await update("contacts",contact.id,{ai_next_action:nextActionDraft});setEditingAction(false);},"Sugestão atualizada.");}}><Field label="Próxima ação sugerida"><textarea rows={5} maxLength={4000} value={nextActionDraft} onChange={e=>setNextActionDraft(e.target.value)}/></Field></Dialog>}
    </div>
  );
}
