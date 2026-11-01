import Anthropic from '@anthropic-ai/sdk';
import { triageSchema } from './triage.js';
import type { ClaudeProvider } from './chat.js';

export function createClaude(apiKey: string): ClaudeProvider {
  const client = new Anthropic({ apiKey, timeout: 35_000, maxRetries: 0 });
  return {
    async answer({ model, system, messages, structured }) {
      // Haiku 5.5 pensa por padrão (thinking adaptativo): max_tokens deixa espaço para o raciocínio,
      // effort fica explícito e temperature não é enviado (o modelo recusa valores fora do padrão).
      const result = await client.messages.create({ model, max_tokens: 8_192, system, messages, output_config: { effort: 'medium', ...(structured ? {format: {type: 'json_schema' as const, schema: triageSchema}} : {}) } });
      return {
        text: result.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
        usage: { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens },
      };
    },
  };
}
