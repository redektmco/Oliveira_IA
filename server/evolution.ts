import { HttpError } from './validation.js';

export type EvolutionConfig = { endpoint: string; listEndpoint: string; instance: string; token: string };
export type EvolutionStatus = {
  provider: 'evolution'; instance: string; state: 'open' | 'close' | 'connecting';
  connected: boolean; messagingEnabled: boolean;
};

export function evolutionConfig(env: NodeJS.ProcessEnv = process.env): EvolutionConfig {
  const base = env.WHATSAPP_EVO_URL?.trim();
  const instance = env.WHATSAPP_EVO_INSTANCE?.trim();
  const token = (env.WHATSAPP_EVO_TOKEN || env.WHATSAPP_TOKEN_EVO)?.trim();
  if (!base || !instance || !token) throw new HttpError(503, 'Configure o servidor, a instância e a chave privada da Evolution na Vercel.');
  let url: URL;
  try { url = new URL(base); } catch { throw new HttpError(503, 'Configure uma URL HTTPS válida para a Evolution.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new HttpError(503, 'Configure uma URL HTTPS da Evolution sem credenciais ou parâmetros.');
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(instance)) throw new HttpError(503, 'O nome da instância Evolution está configurado incorretamente.');
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}/instance/connectionState/${encodeURIComponent(instance)}`;
  const list = new URL(url);
  list.pathname = `${prefix}/instance/fetchInstances`;
  return { endpoint: url.href, listEndpoint: list.href, instance, token };
}

export async function readEvolutionStatus(config: EvolutionConfig, fetcher: typeof fetch = fetch): Promise<EvolutionStatus> {
  try {
    const signal = AbortSignal.timeout(15_000);
    const get = (endpoint: string) => fetcher(endpoint, {
      method: 'GET', headers: { apikey: config.token, Accept: 'application/json' },
      redirect: 'error', signal,
    });
    let instance = config.instance;
    let response = await get(config.endpoint);
    if (response.status === 404) {
      const listed = await get(config.listEndpoint);
      if ([401, 403].includes(listed.status)) throw new HttpError(502, 'A Evolution recusou a credencial do servidor. Confira a chave privada na Vercel.');
      if (!listed.ok) throw new HttpError(502, 'A instância não foi encontrada na Evolution. Confira o nome configurado.');
      const rows: unknown = await listed.json();
      if (!Array.isArray(rows)) throw new HttpError(502, 'A Evolution retornou uma lista de instâncias inesperada.');
      // Only resolve a unique spelling of the configured name; other instances and
      // their phone/profile/key data never leave this function or get queried.
      const names = rows.slice(0, 1000).map(row => row?.name ?? row?.instance?.instanceName).filter((name): name is string => typeof name === 'string' && name.toLowerCase() === config.instance.toLowerCase());
      const matches = [...new Set(names)];
      if (matches.length !== 1) throw new HttpError(502, 'A chave foi aceita, mas a instância não foi encontrada com o nome configurado. Confira o nome na Evolution.');
      if (matches[0] === instance) throw new HttpError(502, 'A instância existe, mas a Evolution não disponibilizou seu estado de conexão.');
      instance = matches[0];
      const endpoint = new URL(config.endpoint);
      endpoint.pathname = endpoint.pathname.replace(/\/[^/]+$/, `/${encodeURIComponent(instance)}`);
      response = await get(endpoint.href);
    }
    if ([401, 403].includes(response.status)) throw new HttpError(502, 'A Evolution recusou a credencial do servidor. Confira a chave privada na Vercel.');
    if (response.status === 404) throw new HttpError(502, 'A instância não foi encontrada na Evolution. Confira o nome configurado.');
    if (!response.ok) throw new HttpError(502, 'A Evolution está indisponível para verificar a conexão. Tente novamente.');
    const body = await response.json() as { instance?: { state?: unknown }; state?: unknown } | null;
    const state = body?.instance?.state ?? body?.state;
    if (state !== 'open' && state !== 'close' && state !== 'connecting') {
      throw new HttpError(502, 'A Evolution retornou um estado de conexão inesperado.');
    }
    return { provider: 'evolution', instance, state, connected: state === 'open', messagingEnabled: false };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Não foi possível consultar a Evolution. Confira a disponibilidade e o HTTPS do servidor.');
  }
}
