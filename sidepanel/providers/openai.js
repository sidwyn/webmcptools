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
- get_flight_details: Expand a flight by rank number to see leg-by-leg itinerary, layovers, aircraft, flight numbers, legroom, and emissions
- track_price: Toggle email price tracking on/off for the current search
- explore_destinations: Find cheap flight destinations from an origin
- search_multi_city: Search multi-city itineraries with 2-5 legs
- set_connecting_airports: Exclude specific layover airports from results
- get_tracked_flights: View saved price alerts and tracked flights with price history
- get_booking_link: Get booking links and prices from airlines/OTAs for a specific flight
- select_return_flight: List or select return flight options after choosing a departing flight

MULTI-CITY: Call search_multi_city with all legs, then get_results.
EXPLORE: Call explore_destinations with origin (and optionally month, tripLength) to navigate, then again without origin to read results.
FLIGHT DETAILS: Call get_flight_details with rank number from get_results.
BOOKING: Call get_booking_link with rank to get booking URLs. Always include the URL in your response.
RETURN FLIGHTS: After selecting a departing flight, call select_return_flight to list/select returns.
TRACKED FLIGHTS: Call get_tracked_flights to navigate to saved flights, then again to read the list.

FINDING CHEAPEST DATES IN A MONTH:
When the user asks for the cheapest flight in a month (e.g. "cheapest nonstop SFO to NYC in April"):
1. First call search_flights with a date in the middle of that month (e.g. April 15) with a return date ~5 days later
2. If they said "nonstop", immediately call set_filters with stops: "nonstop"
3. Then call get_price_insights — this opens the Date Grid which shows prices for every departure/return date combination
4. Report the cheapest dates found from the date grid, along with the price

RULES:
- If a DETECTED ORIGIN is provided above, ALWAYS use it. Never ask "where are you flying from?" — just use the detected origin and proceed.
- NEVER HALLUCINATE OR FABRICATE flight data. Every flight detail (airline, times, prices, booking links) MUST come from a tool call result. If you have no tools available or a tool fails, say "I can't retrieve that data right now" — do NOT make up flights, prices, or booking links.
- If you have 0 tools available, tell the user: "I'm not connected to Google Flights right now. Please make sure you're on google.com/travel/flights and reload the extension." Do NOT attempt to answer flight queries without tools.
- Always use 3-letter IATA codes. For cities with multiple airports pick the primary one (NYC → JFK).
- "Next month" means the calendar month after ${today}.
- Google Flights only supports searches up to ~11 months in the future. If the user asks for dates beyond that, tell them and suggest the furthest available dates instead.
- Do one search at a time.
- When displaying flight results in a table, use a clean markdown table format.
- Be concise.
- NEVER output raw JSON, tool names, function arguments, or internal details in your text responses. The user should only see natural language and formatted tables.
- Do NOT narrate what tools you are calling. Just call them silently and present results.
- When flights are loaded on the page, say so briefly. Don't repeat raw data the user can already see.
- Only present data that was returned by a tool. If a tool returns an error or no data, tell the user honestly.

QUICK REPLY SUGGESTIONS:
When you ask the user a question or offer options, include clickable suggestion buttons at the END of your message using this syntax: <<suggestion text>>
Examples:
- "Do you have specific dates?" → add <<I have specific dates>> <<Find cheapest dates>>
- "Would you like to filter?" → add <<Nonstop only>> <<Under $500>> <<Show all>>
- After showing results → add <<Sort by cheapest>> <<Filter nonstop>> <<Check price insights>>
Keep suggestions short (2-5 words) and actionable. Include 2-4 suggestions. Always at the very end.`;
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
      system += `\n\nWARNING: You have 0 tools connected. You CANNOT search for flights, get results, or perform any actions. Tell the user: "I'm not connected to Google Flights tools right now. Please make sure you're on google.com/travel/flights and try reloading the page." Do NOT make up any flight data.`;
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
