# Técnico Spaces Backend API

A Node.js/Express API for managing and serving IST (Instituto Superior Técnico) space data with caching and scheduling capabilities.

## Features

- 🚀 RESTful API endpoints
- 💾 Local file caching for improved performance
- ⏰ Automatic daily cache updates (3 AM)
- 📅 Real-time schedule fetching for spaces
- 🔄 Manual cache refresh endpoint
- 🛡️ Rate limiting protection
- 🌐 CORS enabled

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000` by default.

## API Endpoints

### Core Endpoints

#### `GET /`
Welcome endpoint with API information.

**Response:**
```json
{
  "message": "Welcome to Técnico Spaces API",
  "status": "active",
  "timestamp": "2025-11-28T19:00:00.000Z",
  "endpoints": { ... }
}
```

#### `GET /api/spaces`
Retrieve all spaces from the local cache, organized by type.

**Response:**
```json
{
  "CAMPUS": [...],
  "BUILDING": [...],
  "FLOOR": [...],
  "ROOM": [...],
  "ROOM_SUBDIVISION": [...]
}
```

Each space object includes:
- `id`: Space identifier
- `name`: Short name
- `fullName`: Full space name
- `type`: Space type (CAMPUS, BUILDING, FLOOR, ROOM, ROOM_SUBDIVISION)
- `description`: Human-readable description with location info
- `location`: Parsed location object with floor, building, and campus
- `alwaysOpen`: Boolean (for ROOMs only)
- `map`: Map URL (if available)

#### `GET /api/fetch-new-data`
Manually trigger a cache update by fetching fresh data from the Técnico API.

**Response:**
```json
{
  "status": "Data fetched and updated successfully!"
}
```

#### `GET /api/schedule/:space_id`
Get today's schedule/events for a specific space.

**Parameters:**
- `space_id`: The ID of the space

**Response:**
```json
[
  {
    "title": "Event/Course Name",
    "time": {
      "start": "2025-11-28 09:00",
      "end": "2025-11-28 11:00"
    },
    "isEditable": false,
    "id": "unique-event-id"
  }
]
```

### Legacy Endpoints (Direct API Proxy)

#### `GET /spaces`
Retrieve spaces directly from the Técnico API v2 (no caching).

#### `GET /spaces/:id`
Retrieve a specific space by ID directly from the Técnico API v2.

## Cache Behavior

- **Initial Load**: On first startup, if no cache file exists, the server automatically fetches and caches all spaces
- **Automatic Updates**: Cache is automatically refreshed daily at 3:00 AM
- **Manual Updates**: Use `/api/fetch-new-data` endpoint to trigger manual cache refresh
- **Cache File**: Data is stored in `data.json` in the project root

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)

### Constants (`globals.js`)

You can customize the following constants in `globals.js`:

- **ALWAYSOPEN**: Array of room names that are always open
- **MISTAKES**: Object mapping space IDs to fields that need correction
- **CORRECTIONS**: Object with correction values for spaces
- **MAPS**: Object mapping space IDs to map URLs

Example:
```javascript
const ALWAYSOPEN = ['Library', 'Study Room 1'];

const MAPS = {
  '2448131362616': 'https://example.com/map1.png',
  '2448131361074': 'https://example.com/map2.png'
};
```

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **Window**: 15 minutes
- **Max Requests**: 100 per IP per window

## Data Source

The API fetches data from:
- **Primary**: `https://fenix.tecnico.ulisboa.pt/api/fenix/v1/spaces`
- **Legacy**: `https://fenix.tecnico.ulisboa.pt/tecnico-api/v2`

## Location Parsing

The API automatically parses location information from space descriptions. 

**Example:**
- Description: `"QA02.4 (-2, Torre Sul, Alameda)"`
- Parsed Location:
  ```json
  {
    "floor": "-2",
    "building": "Torre Sul",
    "campus": "Alameda"
  }
  ```

## Development

### Project Structure
```
tecnico_spaces_backend/
├── index.js          # Main server file with all endpoints
├── globals.js        # Configuration constants
├── data.json         # Cache file (auto-generated)
├── package.json      # Dependencies
└── README.md         # This file
```

### Dependencies
- **express**: Web framework
- **axios**: HTTP client for API requests
- **cors**: Enable CORS
- **express-rate-limit**: Rate limiting middleware
- **node-cron**: Scheduled tasks

## Migration from Python/Flask

This Node.js version maintains API compatibility with the previous Python/Flask implementation:

| Flask Endpoint | Node.js Endpoint | Status |
|----------------|------------------|--------|
| `/api/spaces` | `/api/spaces` | ✅ Implemented |
| `/api/fetch-new-data` | `/api/fetch-new-data` | ✅ Implemented |
| `/api/schedule/<space_id>` | `/api/schedule/:space_id` | ✅ Implemented |

**Key Differences:**
- No recursive fetching needed - uses new API endpoint that returns all spaces
- Location parsing from description strings instead of path building
- Uses `node-cron` instead of `apscheduler`
- Local file caching instead of cloud storage

## License

ISC
