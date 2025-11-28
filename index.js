const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { ALWAYSOPEN, MISTAKES, CORRECTIONS, MAPS } = require('./globals');

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = 'https://fenix.tecnico.ulisboa.pt/tecnico-api/v2';
const BASE_URL = `${API_URL}/spaces`;
//const CACHE_FILE = path.join(__dirname, 'data.json');
var CACHE = []

// Middleware
app.use(cors({
	origin: '*', // Allow all origins for development
	methods: ['GET']
}));

app.use(express.json());

// Rate limiter configuration
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	message: 'Too many requests from this IP, please try again later.',
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiter to all routes
app.use(limiter);

// Utility Functions
/**
 * Fetch data from a given URL
 */
async function fetchData(url) {
	try {
		const response = await axios.get(url);
		return response.data;
	} catch (error) {
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

/** Fetch space details by ID
 *
 * @param spaceId
 * @returns {Promise<Any>}
 */
async function fetchSpace(spaceId) {
	const url = `${BASE_URL}/${spaceId}`;
	const data = await fetchData(url);
	if (!data)
		throw new Error(`Failed to fetch space with ID ${spaceId}`);

	// Parse location
	const location = parseLocation(data.description);
	return {
		id: data.id,
		name: data.name,
		type: data.type,
		location: location
	};
}

/**
 * Parse location from description string
 * Format: "QA02.4 (-2, Torre Sul, Alameda)"
 */
function parseLocation(description) {
	const match = description.match(/\(([^)]+)\)$/);
	if (!match) return null;

	const parts = match[1].split(",").map((p) => p.trim());

	// We need at least 3 parts: floor(s), building, campus
	if (parts.length < 3) return null;

	// Extract the last two known elements
	const campus = parts.pop();
	const building = parts.pop();

	// Whatever remains is the floor information (e.g. "1, 0" or just "-2")
	// We reverse it to match your requested format "0, 1" if it was "1, 0" originally,
	// or keep it as is if that was the intended order.
	// Based on your example "1, 0" -> "0, 1", I will reverse it.
	const floor = parts.reverse().join(", ");

	return {
		floor,
		building,
		campus,
	};
}

/**
 * Fetch all spaces from the API and organize them by type
 */
async function fetchAllSpaces() {
	console.log('Fetching all spaces from API...');

	try {
		// Fetch all spaces from the general endpoint
		const spaces = await fetchData(BASE_URL);

		if (!spaces || !Array.isArray(spaces)) {
			console.error('Invalid spaces data received');
			return null;
		}

		const allSpaces = {
			// CAMPUS: [],
			// BUILDING: [],
			// FLOOR: [],
			// ROOM: [],
			// ROOM_SUBDIVISION: []
		};

		// Process each space
		for (const space of spaces) {
			if (!space.name) continue;

			try {
				const spaceInfo = await fetchSpace(space.id);

				// Apply error corrections
				if (MISTAKES[spaceInfo.id]) {
					const fieldToCorrect = MISTAKES[spaceInfo.id];
					spaceInfo[fieldToCorrect] = CORRECTIONS[spaceInfo.id + 'c'];
				}

				// Add alwaysOpen flag for rooms
				if (spaceInfo.type === 'ROOM' || spaceInfo.type === 'ROOM_SUBDIVISION') {
					spaceInfo.alwaysOpen = ALWAYSOPEN.includes(spaceInfo.name);
				}

				// Add map if available
				if (MAPS[spaceInfo.id]) {
					spaceInfo.map = MAPS[spaceInfo.id];
				}

				// Add to appropriate category
				if (!allSpaces[spaceInfo.type]) {
					allSpaces[spaceInfo.type] = [];
				}

				allSpaces[spaceInfo.type].push(spaceInfo);

			} catch (error) {
				console.error(`Error processing space ID ${space.id}:`, error.message);
			}
		}

		console.log('Spaces fetched successfully:');
		console.log(`  CAMPUS: ${allSpaces.CAMPUS.length}`);
		console.log(`  BUILDING: ${allSpaces.BUILDING.length}`);
		console.log(`  FLOOR: ${allSpaces.FLOOR.length}`);
		console.log(`  ROOM: ${allSpaces.ROOM.length}`);
		console.log(`  ROOM_SUBDIVISION: ${allSpaces.ROOM_SUBDIVISION.length}`);

		return allSpaces;
	} catch (error) {
		console.error('Error in fetchAllSpaces:', error);
		return null;
	}
}

/**
 * Save data to cache file
 */
async function saveDataToCache(data) {
	try {
		await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
		console.log('Data saved to cache successfully');
	} catch (error) {
		console.error('Error saving data to cache:', error.message);
	}
}

/**
 * Load data from cache file
 */
async function loadDataFromCache() {
	try {
		const data = await fs.readFile(CACHE_FILE, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error('Error loading data from cache:', error.message);
		return null;
	}
}

/**
 * Update cache with fresh data
 */
async function updateCache() {
	console.log('Updating cache...');
	const allSpaces = await fetchAllSpaces();
	if (allSpaces) {
		//await saveDataToCache(allSpaces);
		CACHE = allSpaces;
		console.log('Cache updated successfully!');
	} else {
		console.error('Failed to update cache');
	}
}

// Initialize cache on startup
(async () => {
	//const cacheExists = await fs.access(CACHE_FILE).then(() => true).catch(() => false);
	const cacheExists = CACHE.length > 0;
	if (!cacheExists) {
		console.log('Cache file not found. Creating initial cache...');
		await updateCache();
	} else {
		console.log('Cache file found. Using cached data.');
	}
})();

// Schedule cache update daily at 3 AM
cron.schedule('0 3 * * *', () => {
	console.log('Running scheduled cache update...');
	updateCache()
		.then(() => console.log('Scheduled cache update completed'))
		.catch(error => console.error('Error during scheduled cache update:', error.message));
});

// Routes
app.get('/', (req, res) => {
	res.json({
		message: 'Welcome to Técnico Spaces API',
		status: 'active',
		timestamp: new Date().toISOString(),
		endpoints: {
			'/api/spaces': 'Get all spaces from cache',
			'/api/schedule/:space_id': 'Get schedule for a specific space',
		}
	});
});

/**
 * GET /api/spaces
 * Description: Retrieve all spaces from cache
 * Response: JSON object with spaces organized by type
 */
app.get('/api/spaces', async (req, res) => {
	try {
		const data = await loadDataFromCache();
		if (!data) {
			return res.status(500).json({ error: 'Failed to load data from cache' });
		}
		res.json(data);
	} catch (error) {
		console.error('Error in /api/spaces:', error.message);
		res.status(500).json({ error: 'Failed to fetch spaces' });
	}
});

/**
 * GET /api/fetch-new-data
 * Description: Fetch fresh data from API and update cache
 * Response: Status message
app.get('/api/fetch-new-data', async (req, res) => {
	try {
		await updateCache();
		res.json({ status: 'Data fetched and updated successfully!' });
	} catch (error) {
		console.error('Error in /api/fetch-new-data:', error.message);
		res.status(500).json({ error: 'Failed to fetch new data' });
	}
});*/

/**
 * GET /api/schedule/:space_id
 * Description: Get schedule/events for a specific space
 * Response: JSON array of events
 */
app.get('/api/schedule/:space_id', async (req, res) => {
	try {
		const spaceId = req.params.space_id;
		const today = new Date();
		const day = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

		console.log(`Fetching schedule for space ${spaceId} on ${day}`);

		const roomData = await fetchData(`${BASE_URL}/${spaceId}?day=${day}`);

		if (!roomData) {
			return res.status(500).json({ error: 'Failed to fetch schedule' });
		}

		const originalEvents = roomData.events || [];
		const events = [];

		for (const event of originalEvents) {
			let title;
			if (event.type === 'LESSON' && event.course) {
				title = event.course.name;
			} else {
				title = event.title || 'Untitled Event';
			}

			const period = event.period;
			if (!period || !period.start || !period.end) continue;

			// Parse dates (format: dd/mm/yyyy HH:MM)
			const parseDate = (dateStr) => {
				const [datePart, timePart] = dateStr.split(' ');
				const [day, month, year] = datePart.split('/');
				return `${year}-${month}-${day} ${timePart}`;
			};

			const start = parseDate(period.start);
			const end = parseDate(period.end);

			events.push({
				title: title,
				time: {
					start: start,
					end: end
				},
				isEditable: false,
				id: spaceId + start.replace(/[\s:-]/g, '')
			});
		}

		res.json(events);
	} catch (error) {
		console.error('Error in /api/schedule:', error.message);
		res.status(500).json({ error: 'Failed to fetch schedule' });
	}
});

/*
*
 * GET /spaces
 * Description: Retrieve a list of spaces directly from Técnico API.
 * Response: JSON array of space objects.
app.get('/spaces', async (req, res) => {
	try {
		const response = await axios.get(`${API_URL}/spaces`);
		res.json(response.data);
	} catch (error) {
		console.error('Error fetching spaces:', error.message);
		res.status(500).json({ error: 'Failed to fetch spaces' });
	}
});

/!**
 * GET /spaces/:id
 * Description: Retrieve a specific space by ID from Técnico API.
 * Response: JSON object of space details.
 *!/
app.get('/spaces/:id', async (req, res) => {
	try {
		const response = await axios.get(`${API_URL}/spaces/${req.params.id}`);
		res.json(response.data);
	} catch (error) {
		console.error(`Error fetching space with ID ${req.params.id}:`, error.message);
		res.status(500).json({ error: 'Failed to fetch space' });
	}
});
*
*/

// Start server
app.listen(PORT, () => {
	console.log(`🚀 Server is running on port ${PORT}`);
	console.log(`📍 http://localhost:${PORT}`);
	console.log(`📊 API endpoints available at /api/!*`);
});
