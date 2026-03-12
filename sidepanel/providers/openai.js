// sidepanel/providers/openai.js — OpenAI integration

class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey, model) {
    super(apiKey);
    this.model = model || 'gpt-4o';
    const today = new Date().toISOString().split('T')[0];
    this.basePrompt = `You are an AI assistant inside a Chrome extension that uses WebMCP tools to interact with websites. Today's date is ${today}.

RULES:
- If a DETECTED ORIGIN is provided above, ALWAYS use it. Never ask "where are you flying from?" — just use the detected origin and proceed.
- NEVER HALLUCINATE OR FABRICATE data. Every detail MUST come from a tool call result. If you have no tools available or a tool fails, say "I can't retrieve that data right now" — do NOT make up data.
- If you have 0 tools available, tell the user: "I'm not connected to any site tools right now. Please make sure you're on a supported site and reload the extension." Do NOT attempt to answer queries without tools.
- Always use 3-letter IATA codes for airports. For cities with multiple airports pick the primary one (NYC → JFK).
- "Next month" means the calendar month after ${today}.
- Google Flights only supports searches up to ~11 months in the future. If the user asks for dates beyond that, tell them and suggest the furthest available dates instead.
- Do one search at a time.
- ALWAYS default to round-trip unless the user explicitly says "one way" or "one-way". Never assume one-way.
- When displaying flight results in a table, use a clean markdown table format.
- Be concise.
- NEVER output raw JSON, tool names, function arguments, or internal details in your text responses. The user should only see natural language and formatted tables.
- Do NOT narrate what tools you are calling. Just call them silently and present results.
- When results are loaded on the page, say so briefly. Don't repeat raw data the user can already see.
- Only present data that was returned by a tool. If a tool returns an error or no data, tell the user honestly.

QUICK REPLY SUGGESTIONS:
When you ask the user a question or offer options, include clickable suggestion buttons at the END of your message using this syntax: <<suggestion text>>
Examples:
- "Do you have specific dates?" → add <<I have specific dates>> <<Find cheapest dates>>
- "Would you like to filter?" → add <<Nonstop only>> <<Under $500>> <<Show all>>
- After showing results → add <<Sort by cheapest>> <<Filter nonstop>> <<Check price insights>>
Keep suggestions short (2-5 words) and actionable. Include 2-4 suggestions. Always at the very end.`;
  }

  get systemPrompt() {
    let prompt = this.basePrompt;
    if (this.sitePrompt) {
      prompt = this.sitePrompt + '\n\n' + prompt;
    }
    if (this.userPreferences && Object.keys(this.userPreferences).length > 0) {
      const prefLines = [];
      const labels = { priority: 'Priority', cabin: 'Cabin class', bags: 'Bags', stops: 'Stops', tripType: 'Trip type' };
      const valueLabels = {
        price: 'lowest price', direct: 'direct/nonstop flights', duration: 'shortest duration', schedule: 'best schedule',
        economy: 'Economy', premium_economy: 'Premium Economy', business: 'Business', first: 'First',
        carry_on: 'carry-on only', checked_1: '1 checked bag', checked_2: '2 checked bags',
        any: 'any number of stops', nonstop: 'nonstop only', '1_or_fewer': '1 stop or fewer',
        round_trip: 'round trip (always use round trip unless user says one-way)', one_way: 'one way'
      };
      for (const [key, value] of Object.entries(this.userPreferences)) {
        if (labels[key]) prefLines.push(`- ${labels[key]}: ${valueLabels[value] || value}`);
      }
      if (prefLines.length > 0) {
        prompt += `\n\nUSER PREFERENCES (apply these automatically — don't ask about them unless the user specifies otherwise):\n${prefLines.join('\n')}`;
      }
    }
    return prompt;
  }

  convertTool(tool) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    };
  }

  formatToolResult(toolUseId, result) {
    const content = typeof result === 'string'
      ? result
      : result.content
        ? result.content.map(c => c.text || JSON.stringify(c)).join('\n')
        : JSON.stringify(result);
    return {
      role: 'tool',
      tool_call_id: toolUseId,
      content
    };
  }

  async streamMessage(messages, tools, pageContext, callbacks) {
    const { onToken, onToolCall, onDone, onError } = callbacks;
    const convertedTools = tools.map(t => this.convertTool(t));

    let system = this.systemPrompt;
    if (convertedTools.length === 0) {
      system += `\n\nWARNING: You have 0 tools connected. You CANNOT perform any actions. Tell the user: "I'm not connected to any site tools right now. Please make sure you're on a supported site and try reloading the page." Do NOT make up any data.`;
    }
    if (pageContext?.url) {
      system += `\n\nCURRENT PAGE URL: ${pageContext.url}`;
    }
    if (pageContext?.originText) {
      system += `\n\nDETECTED ORIGIN: "${pageContext.originText}" is the user's departure airport (already set on the Google Flights page).\nCRITICAL RULE: You MUST use "${pageContext.originText}" as the origin. NEVER ask the user where they are flying from — you already know. If they say "flights to Tokyo", search from ${pageContext.originText} to Tokyo immediately. This is non-negotiable.`;
    }

    const body = {
      model: this.model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        ...messages
      ]
    };

    if (convertedTools.length > 0) {
      body.tools = convertedTools;
      body.tool_choice = 'auto';
    }

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      onError(new Error(`Network error: ${e.message}`));
      return;
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const error = new Error(err.error?.message || `API error ${response.status}`);
      if (response.status === 429) {
        error.isRateLimit = true;
        error.retryAfter = parseInt(response.headers.get('retry-after'), 10) || 30;
      }
      onError(error);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallAccumulators = {};
    let finishReason = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let event;
          try { event = JSON.parse(data); } catch { continue; }

          const delta = event.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            onToken(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallAccumulators[idx]) {
                toolCallAccumulators[idx] = { id: '', name: '', arguments: '' };
              }
              if (tc.id) toolCallAccumulators[idx].id = tc.id;
              if (tc.function?.name) toolCallAccumulators[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallAccumulators[idx].arguments += tc.function.arguments;
            }
          }

          if (event.choices?.[0]?.finish_reason) {
            finishReason = event.choices[0].finish_reason;
          }
        }
      }
    } catch (e) {
      onError(new Error(`Stream error: ${e.message}`));
      return;
    }

    // Emit accumulated tool calls
    for (const tc of Object.values(toolCallAccumulators)) {
      let args = {};
      try { args = JSON.parse(tc.arguments); } catch {}
      onToolCall({ toolName: tc.name, toolUseId: tc.id, args });
    }

    onDone(finishReason);
  }
}
