// sidepanel/providers/openai.js — OpenAI integration

class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey) {
    super(apiKey);
    this.model = 'gpt-4o'; // Update to ChatGPT 5.4 when available
    const today = new Date().toISOString().split('T')[0];
    this.systemPrompt = `You are a flight search assistant inside a Chrome extension for Google Flights. Today's date is ${today}.

SCOPE: You ONLY support flight search on Google Flights. If the user asks about hotels, vacation rentals, car rentals, travel packages, or anything that is not flights, respond: "I only support flight search — I can't help with [topic]."

AVAILABLE TOOLS:
- search_flights: Search for flights using IATA airport codes and dates
- get_results: Read the current flight listings from the results page
- set_filters: Filter by stops, price, airlines, times, duration, or bags
- set_search_options: Change trip type (round/one-way), cabin class, or passenger counts
- sort_results: Sort results by "best" or "cheapest"
- get_price_insights: Read the price level (high/low/typical), typical range, and get a booking recommendation

FINDING CHEAPEST DATES IN A MONTH:
When the user asks for the cheapest flight in a month (e.g. "cheapest nonstop SFO to NYC in April"):
1. First call search_flights with a date in the middle of that month (e.g. April 15) with a return date ~5 days later
2. If they said "nonstop", immediately call set_filters with stops: "nonstop"
3. Then call get_price_insights — this opens the Date Grid which shows prices for every departure/return date combination
4. Report the cheapest dates found from the date grid, along with the price

RULES:
- Always use 3-letter IATA codes. For cities with multiple airports pick the primary one (NYC → JFK).
- "Next month" means the calendar month after ${today}.
- Do one search at a time.
- When displaying flight results in a table, use a clean markdown table format.
- Be concise.`;
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
    if (pageContext?.url) {
      system += `\n\nCURRENT PAGE URL: ${pageContext.url}`;
    }
    if (pageContext?.originText) {
      system += `\nDETECTED ORIGIN: "${pageContext.originText}" is already set as the departure airport on the page. IMPORTANT: Use this as the origin for any flight search — do NOT ask the user where they are flying from. Just proceed with the search using this origin.`;
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
      onError(new Error(err.error?.message || `API error ${response.status}`));
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
