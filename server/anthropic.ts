import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeProvider } from './chat.js';

export function createClaude(apiKey: string): ClaudeProvider {
  const client = new Anthropic({ apiKey, timeout: 35_000, maxRetries: 0 });
  return {
    async answer({ model, system, messages }) {
      const result = await client.messages.create({ model, max_tokens: 1_024, temperature: 0.3, system, messages });
      return {
        text: result.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
        usage: { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens },
      };
    },
  };
}
