// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/index.js
// Purpose: Entry point for SAP implementation bot

const restify = require("restify");
const config = require("./config");

async function initializeApp() {
    try {
        console.log("Initializing application...");
        
        // Now load components that depend on configuration
        const adapter = require("./adapter");
        const app = require("./app/app");

        // Create HTTP server
        const server = restify.createServer();
        server.use(restify.plugins.bodyParser());

        server.listen(process.env.port || process.env.PORT || 3978, () => {
            console.log(`\nBot Started, ${server.name} listening to ${server.url}`);
        });

        // Listen for incoming server requests
        server.post("/api/messages", async (req, res) => {
            await adapter.process(req, res, async (context) => {
                await app.run(context);
            });
        });

    } catch (error) {
        console.error("Failed to initialize application:", error);
        process.exit(1);
    }
}

// Start the application
initializeApp().catch(error => {
    console.error("Critical startup error:", error);
    process.exit(1);
});