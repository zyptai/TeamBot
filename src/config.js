// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/config.js

const { DefaultAzureCredential } = require("@azure/identity");
const { AppConfigurationClient } = require("@azure/app-configuration");

console.log("Starting config.js initialization");

const config = {
    botId: process.env.BOT_ID,
    botPassword: process.env.BOT_PASSWORD,
    azureOpenAIKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAIDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    azureOpenAIEmbeddingDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
    azureSearchKey: process.env.AZURE_SEARCH_KEY,
    azureSearchEndpoint: process.env.AZURE_SEARCH_ENDPOINT,
    jiraBaseUrl: process.env.JIRA_BASE_URL,
    jiraUsername: process.env.JIRA_USERNAME,
    jiraApiToken: process.env.SECRET_JIRA_API_TOKEN,
    appInsightsInstrumentationKey: process.env.APP_INSIGHTS_INSTRUMENTATION_KEY,
    appInsightsConnectionString: process.env.APP_INSIGHTS_CONNECTION_STRING,
    keyVaultName: process.env.KEY_VAULT_NAME,
    vaultUrl: process.env.VAULT_URL,
    isLoaded: false,
    async init() {
        try {
            console.log("Initializing Azure credentials");
            // Hardcoded credentials for testing
            const credential = new DefaultAzureCredential({
                managedIdentityClientId: "dummy-client-id"
            });
            
            console.log("Creating App Config client");
            // Hardcoded endpoint for testing
            const configClient = new AppConfigurationClient(
                "https://zyptai-dev-app-config.azconfig.io", 
                credential
            );
            
            console.log("App Config client created");
            console.log("Starting Azure App Config load");
            
            const settings = configClient.listConfigurationSettings({});
            for await (const setting of settings) {
                console.log(`Processing setting: ${setting.key}`);
                // Still overwrite process.env values as before
                this[setting.key] = setting.value;
            }
            
            this.isLoaded = true;
            console.log("Finished loading Azure App Config");
        } catch (error) {
            console.error("Error loading Azure App Config:", error);
            // Config falls back to existing process.env values on error
        }
    }
};

module.exports = config;