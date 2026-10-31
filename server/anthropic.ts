import Anthropic from '@anthropic-ai/sdk';
import { triageSchema } from './triage.js';
import type { ClaudeProvider } from './chat.js';

export function createClaude(apiKey: string): ClaudeProvider {
  const client = new Anthropic({ apiKey, timeout: 35_000, maxRetries: 0 });
  return {
    async answer({ model, system, messages, structured }) {
      const result = await client.messages.create({ model, max_tokens: 3_072, temperature: 0.3, system, messages, ...(structured ? {output_config: {format: {type: 'json_schema' as const, schema: triageSchema}}} : {}) });
      return {
        text: result.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
        usage: { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens },
      };
    },
  };
}
