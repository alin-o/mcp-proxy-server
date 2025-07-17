#!/usr/bin/env node
import { generateToken } from "./token-utils.js";
import { Command } from 'commander';

const program = new Command();

program
    .name('generate-token')
    .description('Generate JWT tokens for SSE service authentication')
    .requiredOption('-c, --client-id <id>', 'Client ID for the token')
    .option('-e, --expires-in <duration>', 'Token expiration time', '1h')
    .parse(process.argv);

const options = program.opts();

if (!options.clientId) {
    console.error('Error: Client ID is required');
    process.exit(1);
}

// Generate and output the token
const token = generateToken({
    clientId: options.clientId
});

console.log('=== SSE Service Token ===');
console.log(`Token: ${token}`);
console.log(`Client ID: ${options.clientId}`);
console.log(`Expires in: ${options.expiresIn}`);
console.log('\nUsage:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3006/sse`);