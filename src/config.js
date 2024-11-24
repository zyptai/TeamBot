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
};

module.exports = config;
