# Domínio ai.v4oliveira.com.br

O domínio está conectado à aplicação principal na Vercel, com DNS e HTTPS verificados em 30/10/2026. O DNS é gerenciado na **GoDaddy**.

| Campo GoDaddy | Configuração |
| --- | --- |
| Tipo | A |
| Nome / Host | ai |
| Valor | `216.198.79.1` |
| TTL | 600 segundos ou padrão disponível |

O IPv4 foi obtido das recomendações da API Vercel para esse domínio, conforme o tipo A solicitado pelo usuário.

## Destino e validação

- Projeto: `swift-coral-qbz2f6f`.
- ID: `prj_R2tORvecB6fdG3jIpbCt0DBVrT2e`.
- Escopo: `redektmco-3675s-projects`.
- Nameservers: `ns47.domaincontrol.com` e `ns48.domaincontrol.com`.
- API Vercel: `configuredBy: "A"`, `aValues: ["216.198.79.1"]`, `misconfigured: false`, `ipStatus: "no-change"`, sem conflitos.
- `https://ai.v4oliveira.com.br/api/health`: HTTP 200 com TLS validado.

Não é necessário alterar novamente o DNS nem fornecer credenciais GoDaddy para essa conexão. A inspeção inicial indicava DNS pendente; esse estado foi resolvido antes da ativação do banco.

O Supabase conectado é Felipa IA (`mdzflolthybnzewhpxno`). Seu Auth foi configurado com Site URL `https://ai.v4oliveira.com.br`. A migração e testes reais de login, persistência e Claude estão registrados em [ACTIVATION.md](ACTIVATION.md) e [VALIDATION.md](VALIDATION.md).

A cópia temporária `swift-orbit-3oo3d8l.tmp.now`, criada para um novo claim link, não recebeu o domínio principal. Reivindicar essa cópia não move o domínio nem as configurações privadas do projeto existente.

Referências oficiais: https://vercel.com/docs/domains/working-with-domains/add-a-domain e https://vercel.com/kb/guide/a-record-and-caa-with-vercel.
