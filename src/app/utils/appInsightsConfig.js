// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/app/utils/appInsightsConfig.js

const appInsights = require('applicationinsights');
const config = require("../../config");

let instance = null;
let client = null;

function initializeAppInsights() {
    if (instance && client) {
        return { appInsights: instance, client };
    }

    const connectionString = config.appInsightsConnectionString;
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

    // Set basic properties
    appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.applicationVersion] = '1.0.0';
    appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = 'teams-ai-assistant';
    
    appInsights.start();
    instance = appInsights;
    client = appInsights.defaultClient;

    return { appInsights: instance, client };
}

module.exports = {
    initializeAppInsights,
    get client() {
        return client;
    }
};