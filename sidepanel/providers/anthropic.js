// sidepanel/providers/anthropic.js — Claude integration via Messages API

class AnthropicProvider extends BaseLLMProvider {
  constructor(apiKey, model) {
    super(apiKey);
    this.model = model || 'claude-sonnet-4-6';
    const today = new Date().toISOString().split('T')[0];
    this.basePrompt = `You are an AI assistant inside a Chrome extension that uses WebMCP tools to interact with websites. Today's date is ${today}.

RULES:
- If a DETECTED ORIGIN is provided above, ALWAYS use it. Never ask "where are you flying from?" — just use the detected origin and proceed.
- NEVER HALLUCINATE OR FABRICATE data. Every detail MUST come from a tool call result. If you have no tools available or a tool fails, say "I can't retrieve that data right now" — do NOT make up data.
- If you have 0 tools available, tell the user: "I'm not connected to any site tools right now. Please make sure you're on a supported site and reload the extension." Do NOT attempt to answer queries without tools.
- Always use 3-letter IATA codes for airports (SFO, JFK, LHR). For cities with multiple airports pick the primary one (NYC → JFK).
- "Next month" means the calendar month after ${today}.
- Google Flights only supports searches up to ~11 months in the future. If the user asks for dates beyond that, tell them the limitation and suggest the furthest available dates instead.
- Do one search at a time — do not call search_flights multiple times in one turn.
- ALWAYS default to round-trip unless the user explicitly says "one way" or "one-way". Never assume one-way.
- When displaying flight results in a table, use a clean markdown table format with columns like: #, Airline, Departs, Arrives, Duration, Stops, Price.
- Be concise. Report what was found, not what you did step by step.
- NEVER output raw JSON, tool names, function arguments, or internal details in your text responses. The user should only see natural language and formatted tables.
- Do NOT narrate what tools you are calling or describe the tool execution process. Just call the tools silently and present the results.
- When you've found results and they're displayed on the page, say so briefly. Don't repeat raw data the user can already see.
- Only present data that was returned by a tool. If a tool returns an error or no data, tell the user honestly.

QUICK REPLY SUGGESTIONS:
When you ask the user a question or offer options, include clickable suggestion buttons at the END of your message using this syntax: <<suggestion text>>
Examples:
- "Do you have specific dates?" → add <<I have specific dates>> <<Find cheapest dates>>
- "Would you like to filter?" → add <<Nonstop only>> <<Under $500>> <<Show all>>
- After showing results → add <<Sort by cheapest>> <<Filter nonstop>> <<Check price insights>>
Keep suggestions short (2-5 words) and actionable. Include 2-4 suggestions. Do NOT put them inline — always at the very end after all other text.`;
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
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    };
  }

  formatToolResult(toolUseId, result) {
    const content = typeof result === 'string'
      ? [{ type: 'text', text: result }]
      : result.content || [{ type: 'text', text: JSON.stringify(result) }];
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content
      }]
    };
  }

  async streamMessage(messages, tools, pageContext, callbacks) {
    const { onToken, onToolCall, onDone, onError } = callbacks;
    const convertedTools = tools.map(t => this.convertTool(t));

    // Structure system prompt for prompt caching:
    // Static content (site prompt + base rules) gets cached; dynamic context does not.
    const systemBlocks = [];
    const staticPrompt = this.sitePrompt
      ? this.sitePrompt + '\n\n' + this.basePrompt
      : this.basePrompt;
    systemBlocks.push({
      type: 'text',
      text: staticPrompt,
      cache_control: { type: 'ephemeral' }
    });

    // Dynamic context (changes per request — not cached)
    let dynamicCtx = '';
    if (convertedTools.length === 0) {
      dynamicCtx += `\n\nWARNING: You have 0 tools connected. You CANNOT perform any actions. Tell the user: "I'm not connected to any site tools right now. Please make sure you're on a supported site and try reloading the page." Do NOT make up any data.`;
    }
    if (pageContext?.url) {
      dynamicCtx += `\n\nCURRENT PAGE URL: ${pageContext.url}`;
    }
    if (pageContext?.originText) {
      dynamicCtx += `\n\nDETECTED ORIGIN: "${pageContext.originText}" is the user's departure airport (already set on the Google Flights page).\nCRITICAL RULE: You MUST use "${pageContext.originText}" as the origin. NEVER ask the user where they are flying from — you already know. If they say "flights to Tokyo", search from ${pageContext.originText} to Tokyo immediately. This is non-negotiable.`;
    }
    if (dynamicCtx) {
      systemBlocks.push({ type: 'text', text: dynamicCtx.trim() });
    }

    // Cache tools: add cache_control to the last tool so the entire tools array is cached
    let cachedTools = convertedTools;
    if (convertedTools.length > 0) {
      cachedTools = convertedTools.map((t, i) =>
        i === convertedTools.length - 1
          ? { ...t, cache_control: { type: 'ephemeral' } }
          : t
      );
    }

    const body = {
      model: this.model,
      max_tokens: 4096,
      system: systemBlocks,
      messages,
      stream: true
    };

    if (cachedTools.length > 0) {
      body.tools = cachedTools;
    }

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
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
    let currentToolUseBlock = null;
    let toolInputBuffer = '';
    let stopReason = null;
    let usage = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let event;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          switch (event.type) {
            case 'message_start':
              // Capture initial usage (includes cache info)
              if (event.message?.usage) {
                usage = { ...event.message.usage };
              }
              break;

            case 'content_block_start':
              if (event.content_block.type === 'tool_use') {
                currentToolUseBlock = {
                  id: event.content_block.id,
                  name: event.content_block.name
                };
                toolInputBuffer = '';
              }
              break;

            case 'content_block_delta':
              if (event.delta.type === 'text_delta') {
                onToken(event.delta.text);
              } else if (event.delta.type === 'input_json_delta') {
                toolInputBuffer += event.delta.partial_json;
              }
              break;

            case 'content_block_stop':
              if (currentToolUseBlock) {
                let args = {};
                try { args = JSON.parse(toolInputBuffer); } catch {}
                onToolCall({
                  toolName: currentToolUseBlock.name,
                  toolUseId: currentToolUseBlock.id,
                  args
                });
                currentToolUseBlock = null;
                toolInputBuffer = '';
              }
              break;

            case 'message_delta':
              if (event.delta.stop_reason) {
                stopReason = event.delta.stop_reason;
              }
              // Merge final usage (output_tokens)
              if (event.usage) {
                usage = { ...usage, ...event.usage };
              }
              break;
          }
        }
      }
    } catch (e) {
      onError(new Error(`Stream error: ${e.message}`));
      return;
    }

    onDone(stopReason, usage);
  }
}
