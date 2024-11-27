// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/app/utils/appInsightsConfig.js
// Purpose: Application Insights configuration for SAP implementation

const appInsights = require('applicationinsights');
const config = require("../../config");

let instance = null;
let client = null;

function initializeAppInsights() {
    console.log("Starting App Insights initialization...");
    // Return existing instance if already initialized
    if (instance && client) {
        console.log("Returning existing App Insights instance");
        return { appInsights: instance, client };
    }

    const connectionString = config.appInsightsConnectionString;
    console.log("Connection string from config:", connectionString ? "[PRESENT]" : "[MISSING]");
    console.log("Connection string from config:", connectionString);

    if (!connectionString) {
        throw new Error('Application Insights connection string is required');
    }

    appInsights.setup(connectionString)
        .setAutoDependencyCorrelation(true)
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(true);

    appInsights.start();

    instance = appInsights;
    client = appInsights.defaultClient;

    client.addTelemetryProcessor((envelope) => {
        envelope.data.baseData.properties = envelope.data.baseData.properties || {};
        envelope.data.baseData.properties.environment = process.env.NODE_ENV || 'development';
        envelope.data.baseData.properties.version = process.env.npm_package_version || '1.0.0';
        
        if (envelope.tags['ai.user.id']) {
            envelope.data.baseData.properties.userId = envelope.tags['ai.user.id'];
            envelope.data.baseData.properties.userRole = envelope.tags['ai.user.accountId'];
        }

        return true;
    });

    client.context.tags[client.context.keys.applicationVersion] = process.env.npm_package_version || '1.0.0';
    client.context.tags[client.context.keys.cloudRole] = 'teams-ai-assistant';
    client.context.tags[client.context.keys.cloudRoleInstance] = process.env.WEBSITE_SITE_NAME || 'local';

    return { appInsights: instance, client };
}

module.exports = {
    initializeAppInsights,
    get client() {
        return client;
    }
};