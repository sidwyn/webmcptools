// content/tools/google-flights/searchFlights.js

const SearchFlightsTool = {
  name: 'search_flights',
  description: 'Search for flights on Google Flights. Navigates to Google Flights with the given parameters. After calling this tool, call get_results to read the flight options.',
  inputSchema: {
    type: 'object',
    properties: {
      origin: {
        type: 'string',
        description: 'Departure airport IATA code (e.g., "SFO", "JFK", "LHR")'
      },
      destination: {
        type: 'string',
        description: 'Arrival airport IATA code (e.g., "LHR", "NRT", "CDG"), or "anywhere" to explore all destinations'
      },
      departureDate: {
        type: 'string',
        description: 'Departure date in YYYY-MM-DD format'
      },
      returnDate: {
        type: 'string',
        description: 'Return date in YYYY-MM-DD format. Omit for one-way.'
      },
      cabinClass: {
        type: 'string',
        enum: ['economy', 'premium', 'business', 'first'],
        description: 'Cabin class. Defaults to economy.'
      },
      adults: {
        type: 'integer',
        description: 'Number of adult passengers. Defaults to 1.'
      }
    },
    required: ['origin', 'departureDate']
  },

  execute: async (args) => {
    const { origin, destination = 'anywhere', departureDate, returnDate, cabinClass = 'economy', adults = 1 } = args;

    if (!origin || !departureDate) {
      return { content: [{ type: 'text', text: 'ERROR: origin and departureDate are required.' }] };
    }

    const iataPattern = /^[A-Z]{3}$/i;
    const isAnywhere = /^anywhere$/i.test(destination);

    if (!iataPattern.test(origin)) {
      return { content: [{ type: 'text', text: 'ERROR: origin must be a 3-letter IATA airport code (e.g., SFO, JFK, LHR).' }] };
    }
    if (!isAnywhere && !iataPattern.test(destination)) {
      return { content: [{ type: 'text', text: 'ERROR: destination must be a 3-letter IATA airport code or "anywhere".' }] };
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(departureDate)) {
      return { content: [{ type: 'text', text: 'ERROR: departureDate must be in YYYY-MM-DD format.' }] };
    }

    // Google Flights only supports searches up to ~11 months in the future
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 11);
    const depDate = new Date(departureDate);
    if (depDate > maxDate) {
      const maxStr = maxDate.toISOString().split('T')[0];
      return { content: [{ type: 'text', text: `ERROR: Google Flights only allows searches up to about 11 months out. The latest searchable date is around ${maxStr}. Please choose an earlier date.` }] };
    }

    // Build a natural language query URL — Google Flights handles this well
    const tripType = returnDate ? 'round trip' : 'one way';
    const cabinStr = cabinClass !== 'economy' ? ` ${cabinClass} class` : '';
    const adultsStr = adults > 1 ? ` for ${adults} adults` : '';
    const returnStr = returnDate ? ` returning ${returnDate}` : '';
    const destDisplay = isAnywhere ? 'anywhere' : destination.toUpperCase();

    const query = `flights from ${origin.toUpperCase()} to ${destDisplay} on ${departureDate}${returnStr}${cabinStr}${adultsStr}`;
    const url = `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;

    // Navigate AFTER returning — the page unload destroys the content script context,
    // so we must send the response before location change happens.
    setTimeout(() => { window.location.href = url; }, 50);

    return {
      content: [{
        type: 'text',
        text: `Navigating to Google Flights: ${tripType}${cabinStr} flights from ${origin.toUpperCase()} to ${destDisplay} on ${departureDate}${returnStr}${adultsStr}. Wait for the page to load, then call get_results.`
      }]
    };
  }
};
