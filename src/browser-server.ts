import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3007; // Choose a different port than the main proxy server

// Enable CORS for all origins
app.use(cors());

// Serve static files from the 'src/browser-client' directory
app.use(express.static(path.join(__dirname, '..', 'build', 'browser-client')));
app.use('/node_modules', express.static(path.join(__dirname, '..', 'node_modules')));

// Serve the index.html file for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'build', 'browser-client', 'index.html'));
});

app.listen(port, () => {
    console.log(`Browser client server listening at http://localhost:${port}`);
});
