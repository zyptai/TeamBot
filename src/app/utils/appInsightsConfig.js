// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/utils/appInsightsConfig.js
// Purpose: Application Insights configuration with singleton pattern for SAP implementation monitoring

const appInsights = require('applicationinsights');

let instance = null;
let client = null;

/**
 * Initializes Application Insights with core monitoring features
 * Returns existing instance if already initialized
 * @param {string} connectionString - Application Insights connection string
 * @returns {Object} - Object containing appInsights instance and client
 */
function initializeAppInsights(connectionString) {
    // Return existing instance if already initialized
    if (instance && client) {
        return { appInsights: instance, client };
    }

    if (!connectionString) {
        throw new Error('Application Insights connection string is required');
    }

    // Initialize with connection string
    appInsights.setup(connectionString)
        .setAutoDependencyCorrelation(true)
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(true);

    // Start Application Insights
    appInsights.start();

    // Store the instances
    instance = appInsights;
    client = appInsights.defaultClient;

    // Add telemetry processor after initialization
    client.addTelemetryProcessor((envelope) => {
        envelope.data.baseData.properties = envelope.data.baseData.properties || {};
        
        // Add common properties
        envelope.data.baseData.properties.environment = process.env.NODE_ENV || 'development';
        envelope.data.baseData.properties.version = process.env.npm_package_version || '1.0.0';
        
        // Add user context if available
        if (envelope.tags['ai.user.id']) {
            envelope.data.baseData.properties.userId = envelope.tags['ai.user.id'];
            envelope.data.baseData.properties.userRole = envelope.tags['ai.user.accountId'];
        }

        return true;
    });

    // Configure common context tags
    client.context.tags[client.context.keys.applicationVersion] = process.env.npm_package_version || '1.0.0';
    client.context.tags[client.context.keys.cloudRole] = 'teams-ai-assistant';
    client.context.tags[client.context.keys.cloudRoleInstance] = process.env.WEBSITE_SITE_NAME || 'local';

    console.log('Application Insights initialized with core monitoring features');

    return { appInsights: instance, client };
}

// Export the initialization function and current client
module.exports = {
    initializeAppInsights,
    // Getter for the client ensures it's always the current instance
    get client() {
        return client;
    }
};