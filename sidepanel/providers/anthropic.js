// sidepanel/providers/anthropic.js — Claude integration via Messages API

class AnthropicProvider extends BaseLLMProvider {
  constructor(apiKey) {
    super(apiKey);
    this.model = 'claude-opus-4-6';
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

WORKFLOW:
1. User asks to search → call search_flights (one search, specific IATA code)
2. Follow up with get_results to show what's available
3. Proactively call get_price_insights to advise whether it's a good time to book
4. If user wants filters → call set_filters; for sorting → sort_results
5. For trip type / passenger / cabin changes → set_search_options, then search_flights again

FINDING CHEAPEST DATES IN A MONTH:
When the user asks for the cheapest flight in a month (e.g. "cheapest nonstop SFO to NYC in April"):
1. First call search_flights with a date in the middle of that month (e.g. April 15) with a return date ~5 days later
2. If they said "nonstop", immediately call set_filters with stops: "nonstop"
3. Then call get_price_insights — this opens the Date Grid which shows prices for every departure/return date combination across the month
4. Report the cheapest dates found from the date grid, along with the price

RULES:
- Always use 3-letter IATA codes (SFO, JFK, LHR). For cities with multiple airports pick the primary one (NYC → JFK).
- "Next month" means the calendar month after ${today}.
- Do one search at a time — do not call search_flights multiple times in one turn.
- When displaying flight results in a table, use a clean markdown table format with columns like: #, Airline, Departs, Arrives, Duration, Stops, Price.
- Be concise. Report what was found, not what you did step by step.

QUICK REPLY SUGGESTIONS:
When you ask the user a question or offer options, include clickable suggestion buttons at the END of your message using this syntax: <<suggestion text>>
Examples:
- "Do you have specific dates?" → add <<I have specific dates>> <<Find cheapest dates>>
- "Would you like to filter?" → add <<Nonstop only>> <<Under $500>> <<Show all>>
- After showing results → add <<Sort by cheapest>> <<Filter nonstop>> <<Check price insights>>
Keep suggestions short (2-5 words) and actionable. Include 2-4 suggestions. Do NOT put them inline — always at the very end after all other text.`;
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

    let system = this.systemPrompt;
    if (pageContext?.url) {
      system += `\n\nCURRENT PAGE URL: ${pageContext.url}`;
    }
    if (pageContext?.originText) {
      system += `\nDETECTED ORIGIN: "${pageContext.originText}" is already set as the departure airport on the page. IMPORTANT: Use this as the origin for any flight search — do NOT ask the user where they are flying from. Just proceed with the search using this origin.`;
    }

    const body = {
      model: this.model,
      max_tokens: 4096,
      system,
      messages,
      stream: true
    };

    if (convertedTools.length > 0) {
      body.tools = convertedTools;
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
      onError(new Error(err.error?.message || `API error ${response.status}`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolUseBlock = null;
    let toolInputBuffer = '';
    let stopReason = null;

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
              break;
          }
        }
      }
    } catch (e) {
      onError(new Error(`Stream error: ${e.message}`));
      return;
    }

    onDone(stopReason);
  }
}
